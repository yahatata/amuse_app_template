import { isSingleStorePerProjectMode } from "../runtime";
import { getRequiredProjectId } from "./projectId";

export const LEGACY_DEFAULT_STORE_ID = "default-store";
export const LEGACY_DEFAULT_TENANT_ID = "default-tenant";

export interface StoreTenantIdentity {
  storeId: string;
  tenantId: string;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function isLegacyDefaultStoreTenant(
  storeId: string | null | undefined,
  tenantId: string | null | undefined
): boolean {
  return (
    normalize(storeId) === LEGACY_DEFAULT_STORE_ID ||
    normalize(tenantId) === LEGACY_DEFAULT_TENANT_ID
  );
}

export function getProjectScopedStoreTenantIdentity(): StoreTenantIdentity {
  const projectId = getRequiredProjectId();
  return {
    storeId: projectId,
    tenantId: projectId,
  };
}

/**
 * 単一店舗モードでは、欠損/legacy default 値を projectId ベースへ正規化する。
 * multi-store モードでは、従来互換の fallback を維持する。
 */
export function resolveStoreTenantForWrite(
  storeId: string | null | undefined,
  tenantId: string | null | undefined
): StoreTenantIdentity {
  const s = normalize(storeId);
  const t = normalize(tenantId);

  const hasExplicitStore = s !== "" && s !== LEGACY_DEFAULT_STORE_ID;
  const hasExplicitTenant = t !== "" && t !== LEGACY_DEFAULT_TENANT_ID;
  if (hasExplicitStore && hasExplicitTenant) {
    return {
      storeId: s,
      tenantId: t,
    };
  }

  if (isSingleStorePerProjectMode()) {
    return getProjectScopedStoreTenantIdentity();
  }

  return {
    storeId: s || LEGACY_DEFAULT_STORE_ID,
    tenantId: t || LEGACY_DEFAULT_TENANT_ID,
  };
}
