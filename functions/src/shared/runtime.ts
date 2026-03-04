/**
 * Phase0A: 本番判定と D-13 用 storeId/tenantId 検証
 * - 本番では default-store/default-tenant を禁止
 */

/** Cloud Functions Emulator でない場合を本番とみなす */
export function isProductionRuntime(): boolean {
  return process.env.FUNCTIONS_EMULATOR !== "true";
}

/** 本番で default-store / default-tenant が渡された場合に throw する */
export function validateStoreTenantForProduction(
  storeId: string | undefined | null,
  tenantId: string | undefined | null
): void {
  if (!isProductionRuntime()) return;

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
