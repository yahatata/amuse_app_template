import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { getLineConfig } from "../../../shared/secrets/secretManager";

async function getLineChannelAccessToken(): Promise<string> {
  const lineConfig = await getLineConfig();
  return lineConfig.channelAccessToken;
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
    const channelAccessToken = await getLineChannelAccessToken();

    if (!channelAccessToken) {
      logOpsError({
        message: "line-config.channelAccessToken is not set",
        functionEntry: "sendLinePushMessage",
        operation: "token",
        context: { reason: "missing_channel_access_token", userId },
      });
      return false;
    }

    if (!userId || !message) {
      logOpsError({
        message: "Invalid parameters for sendLinePushMessage",
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
        functionEntry: "sendLinePushMessage",
        operation: "pushResponseNotOk",
        errorSource: "external_api",
        sourceProduct: "line_api",
        httpStatus: response.status,
        detailReason: errorText.slice(0, 200),
        context: {
          userId,
          status: response.status,
          lineApiErrorPreview: errorText.slice(0, 200),
        },
      });
      return false;
    }

    logOpsSuccess({
      message: "LINE push message sent successfully",
      functionEntry: "sendLinePushMessage",
      operation: "push",
      context: { userId },
    });
    return true;
  } catch (error) {
    logOpsError({
      message: "Error sending LINE push message",
      functionEntry: "sendLinePushMessage",
      operation: "pushCatch",
      errorSource: "external_api",
      sourceProduct: "line_api",
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
