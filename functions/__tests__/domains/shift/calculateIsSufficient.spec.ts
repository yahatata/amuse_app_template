/**
 * calculateIsSufficient / resolveRequiredStaffSlotsForDay 単体テスト
 */

import {
  calculateIsSufficient,
  findGapTimeSlots,
  findInsufficientTimeSlots,
  resolveRequiredStaffSlotsForDay,
} from '../../../src/domains/shift/services/helpers';
import type { RequiredStaffByTimeSlotV2 } from '../../../src/shared/config/types';

const v2Config: RequiredStaffByTimeSlotV2 = {
  version: 2,
  byStyle: {
    weekday: [{ startHour: 18, endHour: 22, requiredCount: 2 }],
    weekendHoliday: [],
    event: [],
    allDay: [],
    closed: [],
  },
};

describe('shift helpers: isSufficient / requiredStaff v2', () => {
  it('findGapTimeSlots: 60分刻みで空きを検出', () => {
    const gaps = findGapTimeSlots(600, 840, [
      { startMinute: 600, endMinute: 720 },
    ]);
    expect(gaps).toEqual([{ start: 720, end: 780 }, { start: 780, end: 840 }]);
  });

  it('resolveRequiredStaffSlotsForDay: 休業日は null', () => {
    expect(
      resolveRequiredStaffSlotsForDay({
        businessHours: { isClosed: true, styleId: 'weekday' },
        requiredStaffConfig: v2Config,
      })
    ).toBeNull();
  });

  it('resolveRequiredStaffSlotsForDay: doc 未設定は null', () => {
    expect(
      resolveRequiredStaffSlotsForDay({
        businessHours: { isClosed: false, styleId: 'weekday' },
        requiredStaffConfig: null,
      })
    ).toBeNull();
  });

  it('resolveRequiredStaffSlotsForDay: [] は空配列', () => {
    expect(
      resolveRequiredStaffSlotsForDay({
        businessHours: { isClosed: false, styleId: 'weekendHoliday' },
        requiredStaffConfig: v2Config,
      })
    ).toEqual([]);
  });

  it('resolveRequiredStaffSlotsForDay: active style はスロット返却', () => {
    expect(
      resolveRequiredStaffSlotsForDay({
        businessHours: { isClosed: false, styleId: 'weekday' },
        requiredStaffConfig: v2Config,
      })
    ).toEqual([{ startHour: 18, endHour: 22, requiredCount: 2 }]);
  });

  it('calculateIsSufficient: gap のみで false', () => {
    const result = calculateIsSufficient(
      600,
      840,
      [{ startMinute: 600, endMinute: 720 }],
      null
    );
    expect(result).toBe(false);
  });

  it('calculateIsSufficient: required 不足で false', () => {
    const insufficient = findInsufficientTimeSlots(
      600,
      1320,
      [{ startMinute: 600, endMinute: 1140 }],
      [{ startHour: 18, endHour: 22, requiredCount: 2 }]
    );
    expect(insufficient.length).toBeGreaterThan(0);

    const result = calculateIsSufficient(
      600,
      1320,
      [{ startMinute: 600, endMinute: 1140 }],
      [{ startHour: 18, endHour: 22, requiredCount: 2 }]
    );
    expect(result).toBe(false);
  });

  it('calculateIsSufficient: gap も required もなしで true', () => {
    const assignments = [
      { startMinute: 600, endMinute: 1320 },
      { startMinute: 600, endMinute: 1320 },
    ];
    const result = calculateIsSufficient(
      600,
      1320,
      assignments,
      [{ startHour: 18, endHour: 22, requiredCount: 2 }]
    );
    expect(result).toBe(true);
  });
});
