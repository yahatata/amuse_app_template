/**
 * Phase0A Task6/7: Config Migration 検証
 *
 * D-01, D-12, D-13 の本番ガード・未設定時失敗のユニットテスト。
 * process.env をモックして本番/エミュレータをシミュレートする。
 */

import {
  isProductionRuntime,
  validateStoreTenantForProduction,
} from '../../src/shared/runtime';

const mockGetLineConfig = jest.fn();
const mockGetBusinessSecrets = jest.fn();

jest.mock('../../src/shared/secrets/secretManager', () => ({
  getLineConfig: () => mockGetLineConfig(),
  getBusinessSecrets: () => mockGetBusinessSecrets(),
}));

describe('Phase0A: Config Migration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockGetLineConfig.mockReset();
    mockGetBusinessSecrets.mockReset();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('runtime.ts: isProductionRuntime', () => {
    it('FUNCTIONS_EMULATOR が "true" なら false（エミュレータ）', () => {
      process.env.FUNCTIONS_EMULATOR = 'true';
      expect(isProductionRuntime()).toBe(false);
    });

    it('FUNCTIONS_EMULATOR が未設定なら true（本番）', () => {
      delete process.env.FUNCTIONS_EMULATOR;
      expect(isProductionRuntime()).toBe(true);
    });

    it('FUNCTIONS_EMULATOR が "false" なら true（本番）', () => {
      process.env.FUNCTIONS_EMULATOR = 'false';
      expect(isProductionRuntime()).toBe(true);
    });
  });

  describe('runtime.ts: validateStoreTenantForProduction（D-13）', () => {
    describe('エミュレータ時（FUNCTIONS_EMULATOR=true）', () => {
      beforeEach(() => {
        process.env.FUNCTIONS_EMULATOR = 'true';
      });

      it('default-store / default-tenant を許可（throw しない）', () => {
        expect(() => {
          validateStoreTenantForProduction('default-store', 'default-tenant');
        }).not.toThrow();
      });

      it('undefined を許可', () => {
        expect(() => {
          validateStoreTenantForProduction(undefined, undefined);
        }).not.toThrow();
      });
    });

    describe('本番時（FUNCTIONS_EMULATOR 未設定）', () => {
      beforeEach(() => {
        delete process.env.FUNCTIONS_EMULATOR;
      });

      it('default-store が渡されると throw', () => {
        expect(() => {
          validateStoreTenantForProduction('default-store', 'valid-tenant');
        }).toThrow(/storeId is required in production.*default-store is not allowed/);
      });

      it('default-tenant が渡されると throw', () => {
        expect(() => {
          validateStoreTenantForProduction('valid-store', 'default-tenant');
        }).toThrow(/tenantId is required in production.*default-tenant is not allowed/);
      });

      it('storeId が空/undefined だと throw', () => {
        expect(() => {
          validateStoreTenantForProduction('', 'valid-tenant');
        }).toThrow(/storeId is required/);
        expect(() => {
          validateStoreTenantForProduction(undefined, 'valid-tenant');
        }).toThrow(/storeId is required/);
      });

      it('tenantId が空/undefined だと throw', () => {
        expect(() => {
          validateStoreTenantForProduction('valid-store', '');
        }).toThrow(/tenantId is required/);
        expect(() => {
          validateStoreTenantForProduction('valid-store', undefined);
        }).toThrow(/tenantId is required/);
      });

      it('正式な store/tenant は通過', () => {
        expect(() => {
          validateStoreTenantForProduction('test-store', 'test-tenant');
        }).not.toThrow();
      });
    });
  });

  describe('D-01: line-config 未取得時失敗', () => {
    it('line-config 取得失敗時は sendLinePushMessage が false を返す', async () => {
      mockGetLineConfig.mockRejectedValue(new Error('line-config missing'));
      const { sendLinePushMessage } = await import(
        '../../src/domains/webhook/services/lineMessaging'
      );
      const result = await sendLinePushMessage('user1', 'test');
      expect(result).toBe(false);
    });
  });

  describe('D-12: business-secrets 未取得時失敗', () => {
    it('business-secrets 取得失敗時は generateQRData が reject する', async () => {
      mockGetBusinessSecrets.mockRejectedValue(
        new Error('business-secrets missing')
      );
      const { generateQRData } = await import(
        '../../src/domains/user/services/qrCodeUtils'
      );
      await expect(generateQRData('uid1', 'login1', 'user')).rejects.toThrow(
        /business-secrets missing/
      );
    });
  });
});
