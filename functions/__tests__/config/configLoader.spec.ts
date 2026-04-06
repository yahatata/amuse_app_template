/**
 * configLoader の単体テスト
 *
 * 参照: docs/config_migration/phase1/PHASE1_FALLBACK_BEHAVIOR.md
 * - document_missing: デフォルト返却 + config_fallback ログ
 * - read_error: リトライ後も失敗時はデフォルト返却 + config_read_error + config_fallback ログ
 * - 正常: Firestore の値と defaults のマージ
 */

jest.unmock('../../src/shared/config/configLoader');

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStoreConfig, buildFromDefaults } from '../../src/shared/config/configLoader';
import {
  DEFAULT_AUTO_OPEN_CLOSE_ENABLED,
  DEFAULT_ALREADY_RUNNING_DIFFERENT_DATE_RECHECK_MINUTES,
  DEFAULT_ENTRANCE_FEE,
  DEFAULT_LINE_PLAN,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_SIDE_GAME_TYPES,
  DEFAULT_TOURNAMENT_PRIZE_RATIO,
  DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE,
  DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD,
  DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT,
} from '../../src/shared/config/defaults';

// firebase-admin を初期化（テスト用）
if (admin.apps.length > 0) {
  for (const app of admin.apps) { if (app) app.delete(); }
}
admin.initializeApp({ projectId: 'test-config-loader' });

describe('configLoader', () => {
  const db = getFirestore();

  const warnSpy = jest.spyOn(require('firebase-functions').logger, 'warn').mockImplementation(() => {});
  const errorSpy = jest.spyOn(require('firebase-functions').logger, 'error').mockImplementation(() => {});

  beforeEach(() => {
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('buildFromDefaults', () => {
    it('デフォルト値で StoreConfig を構築する', () => {
      const config = buildFromDefaults();
      expect(config.autoOpenClose?.enabled).toBe(DEFAULT_AUTO_OPEN_CLOSE_ENABLED);
      expect(config.autoOpenClose?.alreadyRunningDifferentDateRecheckMinutes)
        .toBe(DEFAULT_ALREADY_RUNNING_DIFFERENT_DATE_RECHECK_MINUTES);
      expect(config.billing?.entranceFee).toBe(DEFAULT_ENTRANCE_FEE);
      expect(config.linePlan).toBe(DEFAULT_LINE_PLAN);
      expect(config.features?.dualWriteEnabled).toBe(false);
      expect(config.shift?.submissionStartDay).toBe(1);
      expect(config.payroll?.startDay).toBe(26);
      expect(config.menuCategories).toEqual(DEFAULT_MENU_CATEGORIES);
      expect(config.sideGameTypes).toEqual(DEFAULT_SIDE_GAME_TYPES);
      expect(config.tournament?.defaultPrizeRatio).toBe(DEFAULT_TOURNAMENT_PRIZE_RATIO);
      expect(config.tournament?.prizeReceiverPercentage).toBe(DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE);
      expect(config.tournament?.prizeRoundingMethod).toBe(DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD);
      expect(config.tournament?.prizeRoundingUnit).toBe(DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT);
      expect(config.tournament?.prizeDistribution?.['1']).toEqual([100.0]);
      expect(config.tournament?.prizeDistribution?.['3']).toEqual([50.0, 30.0, 20.0]);
    });
  });

  describe('getStoreConfig', () => {
    // Firestore Emulator が起動している場合のみ実行
    const itWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? it : it.skip;

    beforeEach(async () => {
      const configRef = db.collection('storeMeta').doc('config');
      const snap = await configRef.get();
      if (snap.exists) await configRef.delete();
    });

    itWithEmulator('storeMeta/config が存在しない場合はデフォルトを返し config_fallback をログ出力', async () => {
      const config = await getStoreConfig(db);
      expect(config.autoOpenClose?.enabled).toBe(DEFAULT_AUTO_OPEN_CLOSE_ENABLED);
      expect(config.billing?.entranceFee).toBe(DEFAULT_ENTRANCE_FEE);
      expect(warnSpy).toHaveBeenCalledWith('config_fallback', expect.objectContaining({
        configKey: '*',
        fallbackSource: 'defaults.ts',
        reason: 'document_missing',
      }));
    });

    itWithEmulator('storeMeta/config が存在する場合はマージ結果を返す', async () => {
      await db.collection('storeMeta').doc('config').set({
        autoOpenClose: {
          enabled: false,
          taskCloseOffsetMinutes: 90,
          alreadyRunningDifferentDateRecheckMinutes: 20,
        },
        billing: { entranceFee: 2000 },
      });

      const config = await getStoreConfig(db);
      expect(config.autoOpenClose?.enabled).toBe(false);
      expect(config.autoOpenClose?.taskCloseOffsetMinutes).toBe(90);
      expect(config.autoOpenClose?.alreadyRunningDifferentDateRecheckMinutes).toBe(20);
      expect(config.billing?.entranceFee).toBe(2000);
      expect(config.linePlan).toBe(DEFAULT_LINE_PLAN);
    });
  });
});
