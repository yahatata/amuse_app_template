/**
 * 環境変数の安全な取得ユーティリティ
 * Functions v2対応
 */
export function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} environment variable is not set`);
  }
  return v;
}
