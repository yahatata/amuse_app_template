import * as logger from "firebase-functions/logger";
import { logOpsError } from "../../../shared/logging/logOpsError";
import { isProductionRuntime } from "../../../shared/runtime";

// LINE_CHANNEL_ACCESS_TOKEN: コマンド/コンソールで設定。本番で未設定時はエラー（Phase0A D-01）
function getLineChannelAccessToken(): string {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (isProductionRuntime() && (!token || !token.trim())) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set (required in production)");
  }
  return token ?? "";
}

/**
 * LINE Push Message APIを使用してメッセージを送信する
 * 
 * @param userId - LINE User ID
 * @param message - 送信するメッセージテキスト
 * @returns Promise<boolean> - 送信成功時true、失敗時false
 */
export async function sendLinePushMessage(
  userId: string,
  message: string
): Promise<boolean> {
  try {
    const channelAccessToken = getLineChannelAccessToken();

    if (!channelAccessToken) {
      logOpsError({
        message: "LINE_CHANNEL_ACCESS_TOKEN is not set",
        failureType: "config",
        functionEntry: "sendLinePushMessage",
        operation: "token",
      });
      return false;
    }

    if (!userId || !message) {
      logOpsError({
        message: "Invalid parameters for sendLinePushMessage",
        failureType: "config",
        functionEntry: "sendLinePushMessage",
        operation: "validate",
        context: { userId, hasMessage: !!message },
      });
      return false;
    }

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logOpsError({
        message: "Failed to send LINE push message",
        failureType: "external_api",
        functionEntry: "sendLinePushMessage",
        operation: "push",
        context: {
          userId,
          status: response.status,
          lineApiErrorPreview: errorText.slice(0, 200),
        },
      });
      return false;
    }

    logger.info("LINE push message sent successfully", { userId });
    return true;
  } catch (error) {
    logOpsError({
      message: "Error sending LINE push message",
      failureType: "external_api",
      functionEntry: "sendLinePushMessage",
      operation: "push",
      cause: error,
      context: { userId },
    });
    return false;
  }
}

/**
 * 日付を「○月○日」形式に変換する
 * 
 * @param dateString - YYYY-MM-DD形式の日付文字列
 * @returns 「○月○日」形式の文字列
 */
export function formatDateToJapanese(dateString: string): string {
  try {
    const date = new Date(dateString + "T00:00:00");
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  } catch (error) {
    logOpsError({
      message: "Error formatting date",
      failureType: "internal",
      functionEntry: "formatDateToJapanese",
      cause: error,
      context: { dateString },
    });
    return dateString; // エラー時は元の文字列を返す
  }
}

/**
 * 現在の月の最終日の23:59を「○月○日　23:59」形式で取得する
 * 
 * @returns 「○月○日　23:59」形式の文字列
 */
export function getEndOfMonthDeadline(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  
  // 翌月の0日目 = 今月の最終日
  const lastDay = new Date(year, month, 0);
  const lastDayOfMonth = lastDay.getDate();
  
  return `${month}月${lastDayOfMonth}日　23:59`;
}

/**
 * LINE Push Message APIを使用してボタン付きメッセージを送信する
 * 
 * @param userId - LINE User ID
 * @param message - メッセージテキスト
 * @param buttons - ボタン配列 [{ label: string, action: { type: string, uri?: string, data?: string } }]
 * @returns Promise<boolean> - 送信成功時true、失敗時false
 */
export async function sendLineButtonMessage(
  userId: string,
  message: string,
  buttons: Array<{ label: string; action: { type: string; uri?: string; data?: string } }>
): Promise<boolean> {
  try {
    const channelAccessToken = getLineChannelAccessToken();

    if (!channelAccessToken) {
      logOpsError({
        message: "LINE_CHANNEL_ACCESS_TOKEN is not set",
        failureType: "config",
        functionEntry: "sendLineButtonMessage",
        operation: "token",
      });
      return false;
    }

    if (!userId || !message || !buttons || buttons.length === 0) {
      logOpsError({
        message: "Invalid parameters for sendLineButtonMessage",
        failureType: "config",
        functionEntry: "sendLineButtonMessage",
        operation: "validate",
        context: {
          userId,
          hasMessage: !!message,
          hasButtons: !!buttons,
        },
      });
      return false;
    }

    // Buttonsテンプレートメッセージを作成
    const templateMessage = {
      type: "template",
      altText: message,
      template: {
        type: "buttons",
        text: message,
        actions: buttons.map(btn => ({
          type: btn.action.type,
          label: btn.label,
          ...(btn.action.uri && { uri: btn.action.uri }),
          ...(btn.action.data && { data: btn.action.data }),
        })),
      },
    };

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [templateMessage],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logOpsError({
        message: "Failed to send LINE button message",
        failureType: "external_api",
        functionEntry: "sendLineButtonMessage",
        operation: "push",
        context: {
          userId,
          status: response.status,
          lineApiErrorPreview: errorText.slice(0, 200),
        },
      });
      return false;
    }

    logger.info("LINE button message sent successfully", { userId });
    return true;
  } catch (error) {
    logOpsError({
      message: "Error sending LINE button message",
      failureType: "external_api",
      functionEntry: "sendLineButtonMessage",
      operation: "push",
      cause: error,
      context: { userId },
    });
    return false;
  }
}

