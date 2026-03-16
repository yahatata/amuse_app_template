/**
 * getStoreConfig の共通モック + 環境変数互換レイヤー
 *
 * Phase 2 で同期→非同期に変わった関数群を、テスト環境で安全に動かすための
 * jest.mock セットアップ。defaults.ts のデフォルト値をそのまま返す。
 *
 * 環境変数互換: 既存テストが process.env.WRITE_TODAYS_BILLS_IN_PARALLEL 等を
 * 設定するパターンを自動的に storeMeta/config 相当のフラグに変換する。
 *
 * テスト内でフラグを切り替えたい場合:
 *   const { __setMockConfig } = require('../helpers/mockStoreConfig');
 *   __setMockConfig({ features: { dualWriteEnabled: true } });
 */

let overrides: Record<string, unknown> = {};

export function __setMockConfig(partial: Record<string, unknown>): void {
  overrides = partial;
}

export function __resetMockConfig(): void {
  overrides = {};
}

function mergeDeep(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      result[key] = mergeDeep(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function readEnvOverrides(): Record<string, unknown> {
  const envOv: Record<string, unknown> = {};

  if (process.env.WRITE_TODAYS_BILLS_IN_PARALLEL !== undefined) {
    envOv.features = {
      ...(envOv.features as Record<string, unknown> || {}),
      dualWriteEnabled: process.env.WRITE_TODAYS_BILLS_IN_PARALLEL === 'true',
    };
  }

  if (process.env.ENABLE_SETTLEMENT_AGGREGATOR !== undefined) {
    envOv.features = {
      ...(envOv.features as Record<string, unknown> || {}),
      settlementAggregatorEnabled: process.env.ENABLE_SETTLEMENT_AGGREGATOR === 'true',
    };
  }

  return envOv;
}

jest.mock('../../src/shared/config/configLoader', () => {
  const actual = jest.requireActual('../../src/shared/config/configLoader');
  return {
    ...actual,
    getStoreConfig: jest.fn(async () => {
      const defaults = actual.buildFromDefaults();
      const envOv = readEnvOverrides();
      let result = Object.keys(envOv).length > 0 ? mergeDeep(defaults, envOv) : defaults;
      if (Object.keys(overrides).length > 0) {
        result = mergeDeep(result, overrides);
      }
      return result;
    }),
  };
});

/**
 * calcBusinessDate 互換モック
 *
 * Phase 2 で戻り値が string → Promise<BusinessDateResult> に変わったが、
 * 既存テストは同期的に string として使用している。
 * ここでは STORE_CLOSE_HOUR ベースの旧ロジックを再現し、
 * 既存テストが await なしでも string を受け取れるようにする。
 */
jest.mock('../../src/domains/bills/repos/calcBusinessDate', () => {
  function legacyCalcBusinessDate(nowUtc?: Date): string {
    const closeHour = parseInt(process.env.STORE_CLOSE_HOUR || '27', 10);
    const d = nowUtc || new Date();
    const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
    const jst = new Date(jstMs);
    const jstHour = jst.getUTCHours();

    let isPreviousDay: boolean;
    if (closeHour >= 24) {
      isPreviousDay = jstHour < (closeHour - 24);
    } else {
      isPreviousDay = jstHour < closeHour;
    }

    let dateForKey: Date;
    if (isPreviousDay) {
      dateForKey = new Date(jstMs - 24 * 60 * 60 * 1000);
    } else {
      dateForKey = jst;
    }
    const y = dateForKey.getUTCFullYear();
    const m = String(dateForKey.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateForKey.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return {
    calcBusinessDate: jest.fn((nowUtc?: Date) => legacyCalcBusinessDate(nowUtc)),
  };
});

/**
 * getCurrentBusinessDateKeyOrThrow 互換モック
 *
 * Phase 2 で createBillWithActiveStay 等が calcBusinessDate ではなく
 * getCurrentBusinessDateKeyOrThrow を使うようになった。
 * Firestore の storeMeta/currentBusinessDay を必要とするため、
 * テスト環境では STORE_CLOSE_HOUR ベースの旧ロジックで代替する。
 */
jest.mock('../../src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow', () => {
  const actual = jest.requireActual<typeof import('../../src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow')>(
    '../../src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow'
  );
  function legacyCalcBusinessDate(): string {
    const closeHour = parseInt(process.env.STORE_CLOSE_HOUR || '27', 10);
    const d = new Date();
    const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
    const jst = new Date(jstMs);
    const jstHour = jst.getUTCHours();

    let isPreviousDay: boolean;
    if (closeHour >= 24) {
      isPreviousDay = jstHour < (closeHour - 24);
    } else {
      isPreviousDay = jstHour < closeHour;
    }

    let dateForKey: Date;
    if (isPreviousDay) {
      dateForKey = new Date(jstMs - 24 * 60 * 60 * 1000);
    } else {
      dateForKey = jst;
    }
    const y = dateForKey.getUTCFullYear();
    const m = String(dateForKey.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateForKey.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return {
    ...actual,
    getCurrentBusinessDateKeyOrThrow: jest.fn(async () => legacyCalcBusinessDate()),
  };
});
