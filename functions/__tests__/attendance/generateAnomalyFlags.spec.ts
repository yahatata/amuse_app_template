/**
 * generateAnomalyFlags のユニットテスト
 *
 * スタブ実装のため、空オブジェクトの返却を確認する。
 */

import { generateAnomalyFlags } from '../../src/domains/attendance/helpers/generateAnomalyFlags';

describe('generateAnomalyFlags (stub)', () => {
  it('空のオブジェクトを返す', () => {
    const flags = generateAnomalyFlags();
    expect(flags).toEqual({});
  });

  it('返り値がオブジェクト型である', () => {
    const flags = generateAnomalyFlags();
    expect(typeof flags).toBe('object');
    expect(flags).not.toBeNull();
  });
});
