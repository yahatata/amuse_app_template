import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { logOpsError, logOpsSuccess, truncateForLog } from "../../../shared/logging/logOpsError";
import { getLineConfig } from "../../../shared/secrets/secretManager";
import { linkStaffRichMenu, linkUserRichMenu } from "../services/lineRichMenu";
import { isActiveStaff } from "../../staff/helpers/staffStatus";
import { verifyLineWebhookSignature } from "../services/lineWebhookSignature";

/**
 * LINE Webhook - リッチメニュー自動切り替え
 *
 * When: ユーザーが友だち追加/ブロック解除した時
 * Where: Cloud Functions (Webhook)
 * What: staffsコレクションを確認し、スタッフならスタッフ用リッチメニューを設定
 * How: LINE Messaging APIでリッチメニューを個別に設定
 *
 * 旧シフト要請辞退 postback（action=decline）は CLN-F2 で削除済み。
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
    const lineConfig = await getLineConfig();
    if (!lineConfig.channelSecret) {
      logOpsError({
        message:
          "line-config に channelSecret が無く Webhook の署名検証ができません（Secret の line-config に channelSecret を追加してください）",
        functionEntry: "lineWebhook",
        operation: "lineWebhookMissingChannelSecret",
      });
      response.status(503).json({ error: "Configuration error" });
      return;
    }

    const rawBody = (request as { rawBody?: Buffer }).rawBody;
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      logOpsError({
        message:
          "lineWebhook: rawBody が無いため署名検証できません（Functions ランタイムが raw body を渡していない可能性があります）",
        functionEntry: "lineWebhook",
        operation: "lineWebhookMissingRawBody",
      });
      response.status(500).json({ error: "Internal server error" });
      return;
    }

    const signatureHeader =
      request.header("x-line-signature") ?? request.header("X-Line-Signature");
    if (
      !verifyLineWebhookSignature(rawBody, signatureHeader, lineConfig.channelSecret)
    ) {
      logger.warn("lineWebhook: X-Line-Signature が不一致のため処理しません", {
        signaturePresent: Boolean(signatureHeader),
        signaturePrefix:
          typeof signatureHeader === "string"
            ? truncateForLog(signatureHeader, 24)
            : undefined,
      });
      response.status(401).send("Unauthorized");
      return;
    }
  } catch (error) {
    logOpsError({
      message: "lineWebhook: 署名検証前処理でエラー",
      functionEntry: "lineWebhook",
      operation: "lineWebhookSignatureSetupFailed",
      cause: error,
    });
    response.status(500).json({ error: "Internal server error" });
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

    const db = admin.firestore();

    for (const event of events) {
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

          const ok = staffDoc.exists && isActiveStaff(staffDoc.data())
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
