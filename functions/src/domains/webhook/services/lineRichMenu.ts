import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";
import { isProductionRuntime } from "../../../shared/runtime";

function getLineChannelAccessToken(): string {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (isProductionRuntime() && (!token || !token.trim())) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set (required in production)");
  }
  return token ?? "";
}

const staffRichMenuId = defineString("STAFF_RICHMENU_ID", {
  default: "richmenu-36bb594eadf1c8718bd9c12199c87dbb",
});

const userRichMenuId = defineString("USER_RICHMENU_ID", {
  default: "richmenu-31d87049e04ae740ceaa76cf59950f54",
});

/**
 * LINE Messaging API でスタッフ用リッチメニューをユーザーにリンクする
 *
 * @param lineUserId - LINE User ID（LIFF ユーザーの場合、Firebase UID と同一）
 * @returns Promise<boolean> - 成功時 true、失敗時 false（スタッフ登録自体は成功させるためエラーは握りつぶす）
 */
export async function linkStaffRichMenu(lineUserId: string): Promise<boolean> {
  try {
    const channelAccessToken = getLineChannelAccessToken();
    const richMenuId = staffRichMenuId.value();

    if (!channelAccessToken || !richMenuId) {
      logger.warn("linkStaffRichMenu: LINE_CHANNEL_ACCESS_TOKEN or STAFF_RICHMENU_ID not set");
      return false;
    }

    if (!lineUserId || !lineUserId.trim()) {
      logger.warn("linkStaffRichMenu: lineUserId is empty");
      return false;
    }

    const response = await fetch(
      `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("linkStaffRichMenu: Failed to link rich menu", {
        lineUserId,
        richMenuId,
        status: response.status,
        error: errorText,
      });
      return false;
    }

    logger.info("linkStaffRichMenu: Rich menu linked successfully", {
      lineUserId,
      richMenuId,
    });
    return true;
  } catch (error) {
    logger.error("linkStaffRichMenu: Error", { lineUserId, error });
    return false;
  }
}

/**
 * LINE Messaging API でユーザー用リッチメニューをリンクする
 * ensureStaffRichMenu / lineWebhook と同一の lineRichMenu サービス経由で呼ぶことで、
 * トークン・リッチメニューIDの取得方法を統一する。
 *
 * @param lineUserId - LINE User ID
 * @returns Promise<boolean> - 成功時 true、失敗時 false
 */
export async function linkUserRichMenu(lineUserId: string): Promise<boolean> {
  try {
    const channelAccessToken = getLineChannelAccessToken();
    const richMenuId = userRichMenuId.value();

    if (!channelAccessToken || !richMenuId) {
      logger.warn("linkUserRichMenu: LINE_CHANNEL_ACCESS_TOKEN or USER_RICHMENU_ID not set");
      return false;
    }

    if (!lineUserId || !lineUserId.trim()) {
      logger.warn("linkUserRichMenu: lineUserId is empty");
      return false;
    }

    const response = await fetch(
      `https://api.line.me/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("linkUserRichMenu: Failed to link rich menu", {
        lineUserId,
        richMenuId,
        status: response.status,
        error: errorText,
      });
      return false;
    }

    logger.info("linkUserRichMenu: Rich menu linked successfully", {
      lineUserId,
      richMenuId,
    });
    return true;
  } catch (error) {
    logger.error("linkUserRichMenu: Error", { lineUserId, error });
    return false;
  }
}
