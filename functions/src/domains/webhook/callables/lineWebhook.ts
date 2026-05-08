import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { logOpsError, logOpsSuccess, truncateForLog } from "../../../shared/logging/logOpsError";
import { getLineConfig } from "../../../shared/secrets/secretManager";
import { linkStaffRichMenu, linkUserRichMenu } from "../services/lineRichMenu";

// postback リプライ用。リッチメニューリンクは lineRichMenu サービス経由（ensureStaffRichMenu と同一経路）
async function getLineChannelAccessToken(): Promise<string> {
  const lineConfig = await getLineConfig();
  return lineConfig.channelAccessToken;
}

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
    const events = request.body.events;
    
    if (!events || !Array.isArray(events)) {
      logger.warn("No events or events is not an array", { 
        events: events,
        body: request.body 
      });
      response.status(200).json({ message: "No events" });
      return;
    }

    const channelAccessToken = await getLineChannelAccessToken();
    if (!channelAccessToken) {
      logOpsError({
        message: "line-config.channelAccessToken is not set",
        functionEntry: "lineWebhook",
        operation: "token",
      });
      response.status(500).json({ error: "Configuration error" });
      return;
    }

    const db = admin.firestore();

    for (const event of events) {
      // postbackイベント（ボタン押下など）
      if (event.type === "postback") {
        const lineUserId = event.source.userId;
        const postbackData = event.postback?.data;

        if (!lineUserId || !postbackData) {
          logger.warn("Invalid postback event", { event });
          continue;
        }

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
                    functionEntry: "lineWebhook",
                    operation: "replyPostbackPlanDisabledNotOk",
                    context: {
                      status: replyResponse.status,
                      lineApiErrorPreview: errorText.slice(0, 200),
                    },
                  });
                }
              } catch (replyError) {
                logOpsError({
                  message: "Error sending reply message",
                  functionEntry: "lineWebhook",
                  operation: "replyPostbackPlanDisabledCatch",
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
                      functionEntry: "lineWebhook",
                      operation: "replyPostbackDeclineConfirmNotOk",
                      context: {
                        status: replyResponse.status,
                        lineApiErrorPreview: errorText.slice(0, 200),
                      },
                    });
                  }
                } catch (replyError) {
                  logOpsError({
                    message: "Error sending reply message",
                    functionEntry: "lineWebhook",
                    operation: "replyPostbackDeclineConfirmCatch",
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
            functionEntry: "lineWebhook",
            operation: "followOrUnblock",
            cause: error,
            context: { lineUserId },
          });
        }
      }
    }

    logOpsSuccess({
      message: "lineWebhook 処理完了",
      functionEntry: "lineWebhook",
      operation: "handler",
      context: {
        eventCount: events.length,
        eventTypes: events.map((e: { type?: string }) => e.type),
      },
    });

    response.status(200).json({ message: "OK" });
  } catch (error) {
    logOpsError({
      message: "Webhook error",
      functionEntry: "lineWebhook",
      operation: "handler",
      cause: error,
    });
    response.status(500).json({ error: "Internal server error" });
  }
});
