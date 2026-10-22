/**
 * Phase0A: 本番判定と D-13 用 storeId/tenantId 検証
 * - 本番では default-store/default-tenant を禁止
 */

/** Cloud Functions Emulator でない場合を本番とみなす */
export function isProductionRuntime(): boolean {
  return process.env.FUNCTIONS_EMULATOR !== "true";
}

/**
 * 単一店舗（1 Firebase Project = 1 店舗）モード判定。
 * - 未設定時は true（このリポジトリの運用前提）
 * - false/0/no/off を指定した場合のみ false
 */
export function isSingleStorePerProjectMode(): boolean {
  const raw = (process.env.SINGLE_STORE_PER_PROJECT_MODE ?? "").trim().toLowerCase();
  if (raw === "") return true;
  return !(raw === "false" || raw === "0" || raw === "no" || raw === "off");
}

/** 本番で default-store / default-tenant が渡された場合に throw する */
export function validateStoreTenantForProduction(
  storeId: string | undefined | null,
  tenantId: string | undefined | null
): void {
  if (!isProductionRuntime()) return;
  // 単一店舗運用では default-store/default-tenant を互換許容し、
  // 後続フェーズで段階的に置換する。
  if (isSingleStorePerProjectMode()) return;

  const s = (storeId ?? "").trim();
  const t = (tenantId ?? "").trim();

  if (!s || s === "default-store") {
    throw new Error(
      "storeId is required in production. default-store is not allowed."
    );
  }
  if (!t || t === "default-tenant") {
    throw new Error(
      "tenantId is required in production. default-tenant is not allowed."
    );
  }
}
