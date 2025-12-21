import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";

// 環境変数定義
const lineChannelAccessToken = defineString("LINE_CHANNEL_ACCESS_TOKEN", {
  default: "JsnZdiDqZDylvlOEzAspG65YN1SNWqCaOXwtiyd2DSOMg8RTjhnaKOVZuH0/saa0gNFS5+9O+Qmifb4O6EPmhbIKHG6hQoKHZoJXTveyJWg4YaVYVCr9DtBZ2RSdh4eO+OOZUQ5gLZStBDoFPZLUXQdB04t89/1O/w1cDnyilFU="
});

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
    const channelAccessToken = lineChannelAccessToken.value();

    if (!channelAccessToken) {
      logger.error("LINE_CHANNEL_ACCESS_TOKEN is not set");
      return false;
    }

    if (!userId || !message) {
      logger.error("Invalid parameters for sendLinePushMessage", { userId, hasMessage: !!message });
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
      logger.error("Failed to send LINE push message", {
        userId,
        status: response.status,
        error: errorText,
      });
      return false;
    }

    logger.info("LINE push message sent successfully", { userId });
    return true;
  } catch (error) {
    logger.error("Error sending LINE push message", { userId, error });
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
    logger.error("Error formatting date", { dateString, error });
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

