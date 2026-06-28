/**
 * businessStyles 由来の必要人数解決テスト（v2 byStyle 相当・純粋 unit）
 */

import { DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2 } from '../../src/shared/config/defaults';
import { resolveRequiredStaffSlotsForDay } from '../../src/domains/shift/services/helpers';

describe('businessStyles requiredStaff resolution (unit)', () => {
  it('resolveRequiredStaffSlotsForDay: byStyle[styleId] が [] → 空配列', () => {
    const config = {
      version: 2 as const,
      byStyle: {
        ...DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle,
        weekendHoliday: [],
      },
    };
    const slots = resolveRequiredStaffSlotsForDay({
      businessHours: { isClosed: false, styleId: 'weekendHoliday' },
      requiredStaffConfig: config,
    });
    expect(slots).toEqual([]);
  });

  it('resolveRequiredStaffSlotsForDay: style キーなし → null', () => {
    const config = {
      version: 2 as const,
      byStyle: {
        weekday: [{ startHour: 19, endHour: 22, requiredCount: 2 }],
      },
    };
    const slots = resolveRequiredStaffSlotsForDay({
      businessHours: { isClosed: false, styleId: 'event' },
      requiredStaffConfig: config,
    });
    expect(slots).toBeNull();
  });

  it('resolveRequiredStaffSlotsForDay: doc 未設定は null', () => {
    const slots = resolveRequiredStaffSlotsForDay({
      businessHours: { isClosed: false, styleId: 'weekday' },
      requiredStaffConfig: null,
    });
    expect(slots).toBeNull();
  });
});
