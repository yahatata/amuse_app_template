/**
 * confirmPayrollHelpers のユニットテスト
 *
 * Firestore 非依存のテスタブルヘルパー関数群をテスト。
 */

import {
  buildDeferredAttendance,
  groupCarryOverByOriginalPeriod,
  chunkArray,
} from '../../src/domains/attendance/helpers/confirmPayrollHelpers';
import type { CarryOverItemInfo } from '../../src/domains/attendance/helpers/confirmPayrollHelpers';

// ──────────────────────────────────────────
// buildDeferredAttendance
// ──────────────────────────────────────────

describe('buildDeferredAttendance', () => {
  it('H-1: 正しい DeferredAttendance 構造体を返す', () => {
    const result = buildDeferredAttendance(
      'att-123',
      '2025-02-26_2025-03-25',
      'run-abc',
      15000
    );
    expect(result).toEqual({
      attendanceId: 'att-123',
      paidInPaymentPeriodKey: '2025-02-26_2025-03-25',
      paidInRunId: 'run-abc',
      grossPayContribution: 15000,
    });
  });

  it('grossPayContribution = 0 の場合', () => {
    const result = buildDeferredAttendance('att-0', 'pk', 'rid', 0);
    expect(result.grossPayContribution).toBe(0);
  });
});

// ──────────────────────────────────────────
// groupCarryOverByOriginalPeriod
// ──────────────────────────────────────────

describe('groupCarryOverByOriginalPeriod', () => {
  it('H-2: 元期間ごとにグルーピングする', () => {
    const items: CarryOverItemInfo[] = [
      { attendanceId: 'a1', originalPaymentPeriodKey: '2025-01-26_2025-02-25', grossPayContribution: 100 },
      { attendanceId: 'a2', originalPaymentPeriodKey: '2024-12-26_2025-01-25', grossPayContribution: 200 },
      { attendanceId: 'a3', originalPaymentPeriodKey: '2025-01-26_2025-02-25', grossPayContribution: 300 },
    ];
    const result = groupCarryOverByOriginalPeriod(items);

    expect(result.size).toBe(2);

    const group1 = result.get('2025-01-26_2025-02-25')!;
    expect(group1).toHaveLength(2);
    expect(group1.map((i) => i.attendanceId)).toEqual(['a1', 'a3']);

    const group2 = result.get('2024-12-26_2025-01-25')!;
    expect(group2).toHaveLength(1);
    expect(group2[0].attendanceId).toBe('a2');
  });

  it('H-3: 空配列 → 空マップ', () => {
    const result = groupCarryOverByOriginalPeriod([]);
    expect(result.size).toBe(0);
  });

  it('全て同一期間の場合 → 1グループ', () => {
    const items: CarryOverItemInfo[] = [
      { attendanceId: 'a1', originalPaymentPeriodKey: 'pk-A', grossPayContribution: 10 },
      { attendanceId: 'a2', originalPaymentPeriodKey: 'pk-A', grossPayContribution: 20 },
    ];
    const result = groupCarryOverByOriginalPeriod(items);
    expect(result.size).toBe(1);
    expect(result.get('pk-A')).toHaveLength(2);
  });
});

// ──────────────────────────────────────────
// chunkArray
// ──────────────────────────────────────────

describe('chunkArray', () => {
  it('400件バッチ: 800件 → 2チャンク', () => {
    const arr = Array.from({ length: 800 }, (_, i) => `item-${i}`);
    const chunks = chunkArray(arr, 400);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(400);
    expect(chunks[1]).toHaveLength(400);
  });

  it('端数あり: 401件 → 2チャンク（400 + 1）', () => {
    const arr = Array.from({ length: 401 }, (_, i) => i);
    const chunks = chunkArray(arr, 400);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(400);
    expect(chunks[1]).toHaveLength(1);
  });

  it('配列がバッチサイズ以下: 100件 → 1チャンク', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const chunks = chunkArray(arr, 400);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(100);
  });

  it('空配列 → 空のチャンク配列', () => {
    const chunks = chunkArray([], 400);
    expect(chunks).toHaveLength(0);
  });

  it('バッチサイズぴったり: 400件 → 1チャンク', () => {
    const arr = Array.from({ length: 400 }, (_, i) => i);
    const chunks = chunkArray(arr, 400);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(400);
  });
});
