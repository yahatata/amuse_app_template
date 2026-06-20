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
import {
  getStoreConfig,
  buildFromDefaults,
  buildConfigForInitialization,
  mergeWithDefaults,
  mergeConfigForUpsert,
} from '../../src/shared/config/configLoader';
import {
  DEFAULT_AUTO_OPEN_CLOSE_ENABLED,
  DEFAULT_ALREADY_RUNNING_DIFFERENT_DATE_RECHECK_MINUTES,
  DEFAULT_ENTRANCE_FEE,
  DEFAULT_LINE_PLAN,
  DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE,
  DEFAULT_MENU_CATEGORIES,
  DEFAULT_SIDE_GAME_TYPES,
  DEFAULT_TOURNAMENT_PRIZE_RATIO,
  DEFAULT_TOURNAMENT_PRIZE_RECEIVER_PERCENTAGE,
  DEFAULT_TOURNAMENT_PRIZE_ROUNDING_METHOD,
  DEFAULT_TOURNAMENT_PRIZE_ROUNDING_UNIT,
  DEFAULT_TABLE_DEVICE_TOURNAMENT_SEAT_ASSIGNMENT_ENABLED,
  INITIAL_TABLE_DEVICE_TOURNAMENT_SEAT_ASSIGNMENT_ENABLED,
  DEFAULT_TABLE_DEVICE_ACTION_HISTORY_VIEW_ENABLED,
  DEFAULT_TABLE_DEVICE_ACTION_HISTORY_ROLLBACK_ENABLED,
  INITIAL_TABLE_DEVICE_ACTION_HISTORY_VIEW_ENABLED,
  INITIAL_TABLE_DEVICE_ACTION_HISTORY_ROLLBACK_ENABLED,
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
      expect(config.tournament?.liffRegistrationEnabled).toBe(true);
      expect(config.tournament?.liffCalendarEnabled).toBe(true);
      expect(config.okibake?.loginPromptMode).toBe(DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE);
      expect(config.tableDevice?.tournamentSeatAssignmentEnabled)
        .toBe(DEFAULT_TABLE_DEVICE_TOURNAMENT_SEAT_ASSIGNMENT_ENABLED);
      expect(config.tableDevice?.actionHistoryViewEnabled)
        .toBe(DEFAULT_TABLE_DEVICE_ACTION_HISTORY_VIEW_ENABLED);
      expect(config.tableDevice?.actionHistoryRollbackEnabled)
        .toBe(DEFAULT_TABLE_DEVICE_ACTION_HISTORY_ROLLBACK_ENABLED);
    });
  });

  describe('buildConfigForInitialization', () => {
    it('卓端末の待機者着席権限は初期化時に true を書き込む', () => {
      const config = buildConfigForInitialization();
      expect(config.tableDevice?.tournamentSeatAssignmentEnabled)
        .toBe(INITIAL_TABLE_DEVICE_TOURNAMENT_SEAT_ASSIGNMENT_ENABLED);
      expect(config.tableDevice?.actionHistoryViewEnabled)
        .toBe(INITIAL_TABLE_DEVICE_ACTION_HISTORY_VIEW_ENABLED);
      expect(config.tableDevice?.actionHistoryRollbackEnabled)
        .toBe(INITIAL_TABLE_DEVICE_ACTION_HISTORY_ROLLBACK_ENABLED);
    });
  });

  describe('mergeWithDefaults: okibake.loginPromptMode', () => {
    it('okibake がないとき notice_only', () => {
      expect(mergeWithDefaults({}).okibake?.loginPromptMode).toBe('notice_only');
    });

    it('okibake があっても loginPromptMode がないとき notice_only', () => {
      expect(
        mergeWithDefaults({ okibake: {} } as Record<string, unknown>).okibake?.loginPromptMode,
      ).toBe('notice_only');
    });

    it('不正値なら notice_only', () => {
      expect(
        mergeWithDefaults({ okibake: { loginPromptMode: 'invalid' } } as Record<string, unknown>)
          .okibake?.loginPromptMode,
      ).toBe('notice_only');
      expect(warnSpy).toHaveBeenCalledWith('config_fallback', expect.objectContaining({
        configKey: 'okibake.loginPromptMode',
        reason: 'invalid_value',
      }));
    });

    it.each<[string]>([
      ['none'],
      ['notice_only'],
      ['link_prompt'],
    ])('有効値 %s はそのまま', (mode) => {
      expect(
        mergeWithDefaults({ okibake: { loginPromptMode: mode } } as Record<string, unknown>)
          .okibake?.loginPromptMode,
      ).toBe(mode);
    });

    it('他フィールドのマージを壊さない', () => {
      const merged = mergeWithDefaults({
        linePlan: 'standard',
        okibake: { loginPromptMode: 'none' },
      } as Record<string, unknown>);
      expect(merged.linePlan).toBe('standard');
      expect(merged.okibake?.loginPromptMode).toBe('none');
    });
  });

  describe('mergeConfigForUpsert: okibake', () => {
    it('既存に okibake がない場合 defaults を補完する', () => {
      const defs = buildFromDefaults();
      const out = mergeConfigForUpsert({ linePlan: 'light' }, defs);
      expect(out.okibake).toEqual({ loginPromptMode: DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE });
    });

    it('okibake.loginPromptMode が不正なら defaults', () => {
      const defs = buildFromDefaults();
      const out = mergeConfigForUpsert({ okibake: { loginPromptMode: 'oops' } }, defs);
      expect(out.okibake).toEqual({ loginPromptMode: DEFAULT_OKIBAKE_LOGIN_PROMPT_MODE });
    });

    it.each<[string]>([
      ['none'],
      ['notice_only'],
      ['link_prompt'],
    ])('有効な loginPromptMode は保持（%s）', (mode) => {
      const defs = buildFromDefaults();
      const out = mergeConfigForUpsert({ okibake: { loginPromptMode: mode } }, defs);
      expect(out.okibake).toEqual({ loginPromptMode: mode });
    });
  });

  describe('tableDevice.tournamentSeatAssignmentEnabled', () => {
    it('runtime fallback は false', () => {
      expect(mergeWithDefaults({}).tableDevice?.tournamentSeatAssignmentEnabled).toBe(false);
    });

    it('Firestore に true があれば true を返す', () => {
      expect(
        mergeWithDefaults({
          tableDevice: { tournamentSeatAssignmentEnabled: true },
        } as Record<string, unknown>).tableDevice?.tournamentSeatAssignmentEnabled,
      ).toBe(true);
    });

    it('初期化用 defaults を渡した upsert は missing field を true で補完する', () => {
      const defs = buildConfigForInitialization();
      const out = mergeConfigForUpsert({ tableDevice: {} }, defs);
      expect((out.tableDevice as Record<string, unknown>).tournamentSeatAssignmentEnabled).toBe(true);
    });
  });

  describe('tableDevice action history settings', () => {
    it('runtime fallback は view=true / rollback=false', () => {
      const tableDevice = mergeWithDefaults({}).tableDevice;
      expect(tableDevice?.actionHistoryViewEnabled).toBe(true);
      expect(tableDevice?.actionHistoryRollbackEnabled).toBe(false);
    });

    it('Firestore に設定があればその値を返す', () => {
      const tableDevice = mergeWithDefaults({
        tableDevice: {
          actionHistoryViewEnabled: false,
          actionHistoryRollbackEnabled: true,
        },
      } as Record<string, unknown>).tableDevice;
      expect(tableDevice?.actionHistoryViewEnabled).toBe(false);
      expect(tableDevice?.actionHistoryRollbackEnabled).toBe(true);
    });

    it('初期化用 defaults を渡した upsert は missing field を true で補完する', () => {
      const defs = buildConfigForInitialization();
      const out = mergeConfigForUpsert({ tableDevice: {} }, defs);
      expect((out.tableDevice as Record<string, unknown>).actionHistoryViewEnabled).toBe(true);
      expect((out.tableDevice as Record<string, unknown>).actionHistoryRollbackEnabled).toBe(true);
    });
  });

  describe('getStoreConfig', () => {
    // Firestore Emulator が起動している場合のみ実行（beforeEach はスキップ時も走るため必ずゲート）
    const hasFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
    const itWithEmulator = hasFirestoreEmulator ? it : it.skip;

    beforeEach(async () => {
      if (!hasFirestoreEmulator) return;
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
