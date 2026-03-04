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

describe('Phase0A: Config Migration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
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

  describe('D-01: LINE_CHANNEL_ACCESS_TOKEN 未設定時失敗', () => {
    it('本番で未設定なら sendLinePushMessage が失敗（false を返す）', async () => {
      delete process.env.FUNCTIONS_EMULATOR;
      delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
      const { sendLinePushMessage } = await import(
        '../../src/domains/webhook/services/lineMessaging'
      );
      const result = await sendLinePushMessage('user1', 'test');
      expect(result).toBe(false);
    });

    it('エミュレータで未設定なら throw せず false を返す', async () => {
      process.env.FUNCTIONS_EMULATOR = 'true';
      delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
      const { sendLinePushMessage } = await import(
        '../../src/domains/webhook/services/lineMessaging'
      );
      const result = await sendLinePushMessage('user1', 'test');
      expect(result).toBe(false);
    });
  });

  describe('D-12: QR_SECRET_KEY 未設定時失敗', () => {
    it('本番で未設定なら generateQRData が throw', () => {
      delete process.env.FUNCTIONS_EMULATOR;
      delete process.env.QR_SECRET_KEY;
      const { generateQRData } = require('../../src/domains/user/services/qrCodeUtils');
      expect(() => generateQRData('uid1', 'login1', 'user')).toThrow(
        /QR_SECRET_KEY is not set/
      );
    });

    it('エミュレータで未設定なら throw しない', () => {
      process.env.FUNCTIONS_EMULATOR = 'true';
      delete process.env.QR_SECRET_KEY;
      const { generateQRData } = require('../../src/domains/user/services/qrCodeUtils');
      expect(() => generateQRData('uid1', 'login1', 'user')).not.toThrow();
    });
  });
});
