import * as logger from "firebase-functions/logger";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { getLineConfig } from "../../../shared/secrets/secretManager";

/**
 * LINE Messaging API でスタッフ用リッチメニューをユーザーにリンクする
 *
 * @param lineUserId - LINE User ID（LIFF ユーザーの場合、Firebase UID と同一）
 * @returns Promise<boolean> - 成功時 true、失敗時 false（スタッフ登録自体は成功させるためエラーは握りつぶす）
 */
export async function linkStaffRichMenu(lineUserId: string): Promise<boolean> {
  try {
    const lineConfig = await getLineConfig();
    const channelAccessToken = lineConfig.channelAccessToken;
    const richMenuId = lineConfig.staffRichMenuId;

    if (!channelAccessToken || !richMenuId) {
      logger.warn(
        "linkStaffRichMenu: line-config.channelAccessToken or staffRichMenuId not set"
      );
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
      logOpsError({
        message: "linkStaffRichMenu: Failed to link rich menu",
        functionEntry: "linkStaffRichMenu",
        operation: "linkStaffRichMenuHttpFail",
        context: {
          lineUserId,
          richMenuId,
          status: response.status,
          lineApiErrorPreview: errorText.slice(0, 200),
        },
      });
      return false;
    }

    logOpsSuccess({
      message: "linkStaffRichMenu 成功",
      functionEntry: "linkStaffRichMenu",
      operation: "linkStaffRichMenuHttp",
      context: { lineUserId, richMenuId },
    });
    return true;
  } catch (error) {
    logOpsError({
      message: "linkStaffRichMenu: Error",
      functionEntry: "linkStaffRichMenu",
      operation: "linkStaffRichMenuCatch",
      cause: error,
      context: { lineUserId },
    });
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
/**
 * LINE Messaging API でユーザーのリッチメニューリンクを解除する
 *
 * @param lineUserId - LINE User ID
 * @returns Promise<boolean> - 成功時 true、404（未リンク）も true（冪等）
 */
export async function unlinkRichMenu(lineUserId: string): Promise<boolean> {
  try {
    const lineConfig = await getLineConfig();
    const channelAccessToken = lineConfig.channelAccessToken;

    if (!channelAccessToken) {
      logger.warn("unlinkRichMenu: line-config.channelAccessToken not set");
      return false;
    }

    if (!lineUserId || !lineUserId.trim()) {
      logger.warn("unlinkRichMenu: lineUserId is empty");
      return false;
    }

    const response = await fetch(
      `https://api.line.me/v2/bot/user/${lineUserId}/richmenu`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
        },
      }
    );

    if (response.status === 404) {
      return true;
    }

    if (!response.ok) {
      const errorText = await response.text();
      logOpsError({
        message: "unlinkRichMenu: Failed to unlink rich menu",
        functionEntry: "unlinkRichMenu",
        operation: "unlinkRichMenuHttpFail",
        context: {
          lineUserId,
          status: response.status,
          lineApiErrorPreview: errorText.slice(0, 200),
        },
      });
      return false;
    }

    logOpsSuccess({
      message: "unlinkRichMenu 成功",
      functionEntry: "unlinkRichMenu",
      operation: "unlinkRichMenuHttp",
      context: { lineUserId },
    });
    return true;
  } catch (error) {
    logOpsError({
      message: "unlinkRichMenu: Error",
      functionEntry: "unlinkRichMenu",
      operation: "unlinkRichMenuCatch",
      cause: error,
      context: { lineUserId },
    });
    return false;
  }
}

export async function linkUserRichMenu(lineUserId: string): Promise<boolean> {
  try {
    const lineConfig = await getLineConfig();
    const channelAccessToken = lineConfig.channelAccessToken;
    const richMenuId = lineConfig.userRichMenuId;

    if (!channelAccessToken || !richMenuId) {
      logger.warn(
        "linkUserRichMenu: line-config.channelAccessToken or userRichMenuId not set"
      );
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
      logOpsError({
        message: "linkUserRichMenu: Failed to link rich menu",
        functionEntry: "linkUserRichMenu",
        operation: "linkUserRichMenuHttpFail",
        context: {
          lineUserId,
          richMenuId,
          status: response.status,
          lineApiErrorPreview: errorText.slice(0, 200),
        },
      });
      return false;
    }

    logOpsSuccess({
      message: "linkUserRichMenu 成功",
      functionEntry: "linkUserRichMenu",
      operation: "linkUserRichMenuHttp",
      context: { lineUserId, richMenuId },
    });
    return true;
  } catch (error) {
    logOpsError({
      message: "linkUserRichMenu: Error",
      functionEntry: "linkUserRichMenu",
      operation: "linkUserRichMenuCatch",
      cause: error,
      context: { lineUserId },
    });
    return false;
  }
}
