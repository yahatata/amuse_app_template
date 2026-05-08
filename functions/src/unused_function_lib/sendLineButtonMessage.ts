/**
 * [UNUSED] sendLineButtonMessage
 *
 * LINE ボタンテンプレート Push。リポジトリ内に呼び出し元なし（`lineMessaging` からのみ export されていた未使用ヘルパー）。
 *
 * `unused_function_lib` に置くことで logOps 系スクリプトの走査対象外とする。
 * 将来利用する場合は import 元を明示する。
 */

import * as logger from "firebase-functions/logger";
import { logOpsError } from "../shared/logging/logOpsError";
import { getLineConfig } from "../shared/secrets/secretManager";

async function getLineChannelAccessToken(): Promise<string> {
  const lineConfig = await getLineConfig();
  return lineConfig.channelAccessToken;
}

/**
 * LINE Push Message APIを使用してボタン付きメッセージを送信する
 *
 * @param userId - LINE User ID
 * @param message - メッセージテキスト
 * @param buttons - ボタン配列 [{ label: string, action: { type: string; uri?: string, data?: string } }]
 * @returns Promise<boolean> - 送信成功時true、失敗時false
 */
export async function sendLineButtonMessage(
  userId: string,
  message: string,
  buttons: Array<{ label: string; action: { type: string; uri?: string; data?: string } }>
): Promise<boolean> {
  try {
    const channelAccessToken = await getLineChannelAccessToken();

    if (!channelAccessToken) {
      logOpsError({
        message: "line-config.channelAccessToken is not set",
        functionEntry: "sendLineButtonMessage",
        operation: "token",
      });
      return false;
    }

    if (!userId || !message || !buttons || buttons.length === 0) {
      logOpsError({
        message: "Invalid parameters for sendLineButtonMessage",
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

    const templateMessage = {
      type: "template",
      altText: message,
      template: {
        type: "buttons",
        text: message,
        actions: buttons.map((btn) => ({
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
        Authorization: `Bearer ${channelAccessToken}`,
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
        functionEntry: "sendLineButtonMessage",
        operation: "buttonPushResponseNotOk",
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

    logger.info("LINE button message sent successfully", { userId });
    return true;
  } catch (error) {
    logOpsError({
      message: "Error sending LINE button message",
      functionEntry: "sendLineButtonMessage",
      operation: "buttonPushCatch",
      errorSource: "external_api",
      sourceProduct: "line_api",
      cause: error,
      context: { userId },
    });
    return false;
  }
}
