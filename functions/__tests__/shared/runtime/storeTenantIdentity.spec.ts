import {
  LEGACY_DEFAULT_STORE_ID,
  LEGACY_DEFAULT_TENANT_ID,
  resolveStoreTenantForWrite,
} from "../../../src/shared/runtime/storeTenantIdentity";

describe("storeTenantIdentity", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SINGLE_STORE_PER_PROJECT_MODE;
    process.env.GCLOUD_PROJECT = "amuse-app-template";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("明示指定された storeId/tenantId はそのまま使う", () => {
    const resolved = resolveStoreTenantForWrite("store-a", "tenant-a");
    expect(resolved).toEqual({ storeId: "store-a", tenantId: "tenant-a" });
  });

  it("単一店舗モードでは default/missing を projectId ベースに正規化する", () => {
    const resolved = resolveStoreTenantForWrite(
      LEGACY_DEFAULT_STORE_ID,
      LEGACY_DEFAULT_TENANT_ID
    );
    expect(resolved).toEqual({
      storeId: "amuse-app-template",
      tenantId: "amuse-app-template",
    });
  });

  it("multi-store モードでは従来互換 fallback を維持する", () => {
    process.env.SINGLE_STORE_PER_PROJECT_MODE = "false";
    const resolved = resolveStoreTenantForWrite(undefined, undefined);
    expect(resolved).toEqual({
      storeId: LEGACY_DEFAULT_STORE_ID,
      tenantId: LEGACY_DEFAULT_TENANT_ID,
    });
  });
});
