import * as crypto from "crypto";

/**
 * LINE Messaging API Webhook の X-Line-Signature 検証。
 * @see https://developers.line.biz/en/reference/messaging-api/#signature-validation
 */
export function verifyLineWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  channelSecret: string
): boolean {
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }
  const expectedBase64 = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  const sigBuf = Buffer.from(signatureHeader, "utf8");
  const expBuf = Buffer.from(expectedBase64, "utf8");
  if (sigBuf.length !== expBuf.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}
