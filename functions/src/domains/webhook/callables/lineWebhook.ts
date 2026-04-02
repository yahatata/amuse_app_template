import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { logOpsError, truncateForLog } from "../../../shared/logging/logOpsError";
import { getLineConfig, warmupSecrets } from "../../../shared/secrets/secretManager";
import { linkStaffRichMenu, linkUserRichMenu } from "../services/lineRichMenu";

// postback リプライ用。リッチメニューリンクは lineRichMenu サービス経由（ensureStaffRichMenu と同一経路）
async function getLineChannelAccessToken(): Promise<string> {
  const lineConfig = await getLineConfig();
  return lineConfig.channelAccessToken;
}

warmupSecrets();

/**
 * LINE Webhook - リッチメニュー自動切り替え
 * 
 * When: ユーザーが友だち追加/ブロック解除した時
 * Where: Cloud Functions (Webhook)
 * What: staffsコレクションを確認し、スタッフならスタッフ用リッチメニューを設定
 * How: LINE Messaging APIでリッチメニューを個別に設定
 */
export const lineWebhook = onRequest(async (request, response) => {
  // CORS設定
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type, X-Line-Signature");

  // OPTIONSリクエスト（プリフライト）の処理
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  // POSTメソッドのみ許可
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // デバッグ: リクエストボディの内容をログ出力
    logger.info("Webhook received", { 
      bodyKeys: Object.keys(request.body || {}),
      hasEvents: !!request.body?.events,
      eventsType: Array.isArray(request.body?.events) ? "array" : typeof request.body?.events,
      eventsLength: Array.isArray(request.body?.events) ? request.body.events.length : "N/A"
    });
    
    const events = request.body.events;
    
    if (!events || !Array.isArray(events)) {
      logger.warn("No events or events is not an array", { 
        events: events,
        body: request.body 
      });
      response.status(200).json({ message: "No events" });
      return;
    }
    
    // デバッグ: 各イベントのタイプをログ出力
    logger.info("Events received", { 
      eventCount: events.length,
      eventTypes: events.map(e => e.type)
    });

    const channelAccessToken = await getLineChannelAccessToken();
    if (!channelAccessToken) {
      logOpsError({
        message: "line-config.channelAccessToken is not set",
        failureType: "config",
        functionEntry: "lineWebhook",
        operation: "token",
      });
      response.status(500).json({ error: "Configuration error" });
      return;
    }

    const db = admin.firestore();

    for (const event of events) {
      // デバッグ: 全てのイベントタイプをログ出力
      logger.info("Processing event", { 
        eventType: event.type,
        source: event.source 
      });
      
      // postbackイベント（ボタン押下など）
      if (event.type === "postback") {
        const lineUserId = event.source.userId;
        const postbackData = event.postback?.data;

        if (!lineUserId || !postbackData) {
          logger.warn("Invalid postback event", { event });
          continue;
        }

        logger.info("Processing postback event", { lineUserId, postbackData });

        try {
          // postbackデータをパース（例: "action=decline&requestId=xxx"）
          const params = new URLSearchParams(postbackData);
          const action = params.get("action");
          const requestId = params.get("requestId");

          if (action === "decline" && requestId) {
            // プランチェック: コミュニケーションプランの場合は機能を無効化
            const { getStoreConfig } = await import('../../../shared/config/configLoader');
            const storeConfig = await getStoreConfig();
            if (storeConfig.linePlan === 'communication') {
              logger.warn("Shift request decline attempted but plan is communication", { lineUserId, requestId });
              // リプライメッセージを送信（機能が無効であることを通知）
              try {
                const replyResponse = await fetch("https://api.line.me/v2/bot/message/reply", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${channelAccessToken}`,
                  },
                  body: JSON.stringify({
                    replyToken: event.replyToken,
                    messages: [
                      {
                        type: "text",
                        text: "この機能はライトプラン以上で利用可能です。",
                      },
                    ],
                  }),
                });
                if (!replyResponse.ok) {
                  const errorText = await replyResponse.text();
                  logOpsError({
                    message: "Failed to send reply message",
                    failureType: "external_api",
                    functionEntry: "lineWebhook",
                    operation: "replyMessage",
                    context: {
                      status: replyResponse.status,
                      lineApiErrorPreview: errorText.slice(0, 200),
                    },
                  });
                }
              } catch (replyError) {
                logOpsError({
                  message: "Error sending reply message",
                  failureType: "external_api",
                  functionEntry: "lineWebhook",
                  operation: "replyMessage",
                  cause: replyError,
                });
              }
              continue; // 処理をスキップ
            }

            // 希望シフト要請の辞退処理
            const requestRef = db.collection("shiftRequests").doc(requestId);
            const requestDoc = await requestRef.get();

            if (requestDoc.exists) {
              const requestData = requestDoc.data()!;
              
              // スタッフIDの確認（lineUserIdとstaffIdが一致するか）
              if (requestData.staffId === lineUserId && requestData.status === "pending") {
                // JST（日本時間）で日付を計算
                const now = new Date();
                const jstOffset = 9 * 60; // JST = UTC+9
                const jstDate = new Date(now.getTime() + jstOffset * 60000);
                const declinedAt = admin.firestore.Timestamp.fromDate(jstDate);

                await requestRef.update({
                  status: "declined",
                  declinedAt,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                logger.info("Shift request declined via postback", { lineUserId, requestId });

                // リプライメッセージを送信
                try {
                  const replyResponse = await fetch("https://api.line.me/v2/bot/message/reply", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${channelAccessToken}`,
                    },
                    body: JSON.stringify({
                      replyToken: event.replyToken,
                      messages: [
                        {
                          type: "text",
                          text: "要請を辞退しました。",
                        },
                      ],
                    }),
                  });

                  if (!replyResponse.ok) {
                    const errorText = await replyResponse.text();
                    logOpsError({
                      message: "Failed to send reply message",
                      failureType: "external_api",
                      functionEntry: "lineWebhook",
                      operation: "replyMessage",
                      context: {
                        status: replyResponse.status,
                        lineApiErrorPreview: errorText.slice(0, 200),
                      },
                    });
                  }
                } catch (replyError) {
                  logOpsError({
                    message: "Error sending reply message",
                    failureType: "external_api",
                    functionEntry: "lineWebhook",
                    operation: "replyMessage",
                    cause: replyError,
                  });
                }
              } else {
                logger.warn("Invalid staff ID or already processed", { 
                  lineUserId, 
                  requestId, 
                  staffId: requestData?.staffId,
                  status: requestData?.status 
                });
              }
            } else {
              logger.warn("Shift request not found", { requestId });
            }
          }
        } catch (error) {
          logOpsError({
            message: "Error processing postback event",
            failureType: "webhook",
            functionEntry: "lineWebhook",
            operation: "postback",
            cause: error,
            context: {
              lineUserId,
              postbackDataPreview:
                typeof postbackData === "string" ? truncateForLog(postbackData, 64) : undefined,
            },
          });
        }
      }

      // follow（友だち追加）またはunblock（ブロック解除）イベント
      // ensureStaffRichMenu と同一の lineRichMenu サービスを使用（トークン・ID取得を統一）
      if (event.type === "follow" || event.type === "unblock") {
        const lineUserId = event.source.userId;

        if (!lineUserId) {
          logger.warn("No userId in event", { event });
          continue;
        }

        logger.info(`Processing ${event.type} event`, { lineUserId });

        try {
          const staffDocRef = db.collection("staffs").doc(lineUserId);
          const staffDoc = await staffDocRef.get();

          const ok = staffDoc.exists
            ? await linkStaffRichMenu(lineUserId)
            : await linkUserRichMenu(lineUserId);

          if (!ok) {
            logger.warn("Rich menu link failed (non-fatal)", { lineUserId, isStaff: staffDoc.exists });
          }
        } catch (error) {
          logOpsError({
            message: "Error processing follow/unblock",
            failureType: "webhook",
            functionEntry: "lineWebhook",
            operation: "followOrUnblock",
            cause: error,
            context: { lineUserId },
          });
        }
      }
    }

    response.status(200).json({ message: "OK" });
  } catch (error) {
    logOpsError({
      message: "Webhook error",
      failureType: "webhook",
      functionEntry: "lineWebhook",
      operation: "handler",
      cause: error,
    });
    response.status(500).json({ error: "Internal server error" });
  }
});
