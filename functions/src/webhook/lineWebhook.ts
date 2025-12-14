import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";

// 環境変数定義（デフォルト値付き）
const lineChannelAccessToken = defineString("LINE_CHANNEL_ACCESS_TOKEN", {
  default: "JsnZdiDqZDylvlOEzAspG65YN1SNWqCaOXwtiyd2DSOMg8RTjhnaKOVZuH0/saa0gNFS5+9O+Qmifb4O6EPmhbIKHG6hQoKHZoJXTveyJWg4YaVYVCr9DtBZ2RSdh4eO+OOZUQ5gLZStBDoFPZLUXQdB04t89/1O/w1cDnyilFU="
});
const staffRichMenuId = defineString("STAFF_RICHMENU_ID", {
  default: "richmenu-36bb594eadf1c8718bd9c12199c87dbb"
});
const userRichMenuId = defineString("USER_RICHMENU_ID", {
  default: "richmenu-31d87049e04ae740ceaa76cf59950f54"
});

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
      response.status(200).json({ message: "No events" });
      return;
    }

    // 環境変数から設定を取得
    const channelAccessToken = lineChannelAccessToken.value();
    const staffMenu = staffRichMenuId.value();
    const userMenu = userRichMenuId.value();

    if (!channelAccessToken) {
      logger.error("LINE_CHANNEL_ACCESS_TOKEN is not set");
      response.status(500).json({ error: "Configuration error" });
      return;
    }

    const db = admin.firestore();

    for (const event of events) {
      // follow（友だち追加）またはunblock（ブロック解除）イベント
      if (event.type === "follow" || event.type === "unblock") {
        const lineUserId = event.source.userId;
        
        if (!lineUserId) {
          logger.warn("No userId in event", { event });
          continue;
        }

        logger.info(`Processing ${event.type} event`, { lineUserId });

        try {
          // staffsコレクションでLINE User IDを検索
          const staffSnapshot = await db.collection("staffs")
            .where("lineUserId", "==", lineUserId)
            .limit(1)
            .get();

          let richMenuId: string;
          
          if (!staffSnapshot.empty) {
            // スタッフの場合
            richMenuId = staffMenu;
            logger.info("Staff detected, setting staff rich menu", { lineUserId, richMenuId });
          } else {
            // 顧客の場合
            richMenuId = userMenu;
            logger.info("User detected, setting user rich menu", { lineUserId, richMenuId });
          }

          // リッチメニューを設定
          if (richMenuId) {
            const linkResponse = await fetch(
              `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`,
              {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${channelAccessToken}`,
                },
              }
            );

            if (!linkResponse.ok) {
              const errorText = await linkResponse.text();
              logger.error("Failed to link rich menu", { 
                lineUserId, 
                richMenuId, 
                status: linkResponse.status,
                error: errorText 
              });
            } else {
              logger.info("Rich menu linked successfully", { lineUserId, richMenuId });
            }
          }
        } catch (error) {
          logger.error("Error processing event", { lineUserId, error });
        }
      }
    }

    response.status(200).json({ message: "OK" });
  } catch (error) {
    logger.error("Webhook error", error);
    response.status(500).json({ error: "Internal server error" });
  }
});

