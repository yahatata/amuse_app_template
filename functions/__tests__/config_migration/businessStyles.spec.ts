/**
 * storeMeta/businessStyles テスト（Phase 1: 型・default・helper）
 */

import {
  buildBusinessStylesFromLegacyConfig,
  buildBusinessStylesForInitialization,
  buildDefaultBusinessStyles,
  DEFAULT_BUSINESS_STYLES_V2,
  extractRequiredStaffByStyleFromDoc,
  mergeBusinessHoursStylesIntoBusinessStyles,
  mergeRequiredStaffByStyleIntoBusinessStyles,
  normalizeBusinessStyles,
  validateBusinessStyles,
} from '../../src/shared/config/businessStyles';
import {
  businessStylesToBusinessHoursStyles,
  businessStylesToRequiredStaffV2,
} from '../../src/shared/config/businessStylesLoader';
import {
  DEFAULT_BUSINESS_HOURS_STYLES,
  DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2,
} from '../../src/shared/config/defaults';
import { REQUIRED_STAFF_STYLE_IDS } from '../../src/shared/config/types';

describe('storeMeta/businessStyles (Phase 1)', () => {
  it('DEFAULT_BUSINESS_STYLES_V2 が固定5 styleId をすべて持つ', () => {
    expect(DEFAULT_BUSINESS_STYLES_V2.version).toBe(2);
    expect(Object.keys(DEFAULT_BUSINESS_STYLES_V2.styles)).toEqual([
      ...REQUIRED_STAFF_STYLE_IDS,
    ]);
  });

  it('closed.requiredStaffByTimeSlot が空配列', () => {
    expect(DEFAULT_BUSINESS_STYLES_V2.styles.closed.requiredStaffByTimeSlot).toEqual([]);
  });

  it('buildDefaultBusinessStyles が defaults と値を一致させる', () => {
    const built = buildDefaultBusinessStyles();

    for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
      const style = built.styles[styleId];
      const hours = DEFAULT_BUSINESS_HOURS_STYLES[styleId];
      expect(style.openMinute).toBe(hours.openMinute);
      expect(style.closeMinute).toBe(hours.closeMinute);
      expect(style.isClosed).toBe(hours.isClosed);
      expect(style.requiredStaffByTimeSlot).toEqual(
        DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle[styleId]
      );
    }
  });

  it('buildDefaultBusinessStyles は deep copy を返す', () => {
    const a = buildDefaultBusinessStyles();
    const b = buildDefaultBusinessStyles();

    a.styles.weekday.requiredStaffByTimeSlot.push({
      startHour: 10,
      endHour: 12,
      requiredCount: 9,
    });

    expect(b.styles.weekday.requiredStaffByTimeSlot).toEqual(
      DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle.weekday
    );
    expect(DEFAULT_BUSINESS_STYLES_V2.styles.weekday.requiredStaffByTimeSlot).toEqual(
      DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle.weekday
    );
  });

  it('businessHoursStyles + requiredStaffByTimeSlot.byStyle から businessStyles を構築できる', () => {
    const businessStyles = buildBusinessStylesFromLegacyConfig({
      businessHoursStyles: {
        weekday: {
          styleId: 'weekday',
          openMinute: 600,
          closeMinute: 1440,
          isClosed: false,
        },
      },
      requiredStaffByStyle: {
        weekday: [{ startHour: 18, endHour: 22, requiredCount: 4 }],
        weekendHoliday: [],
        event: [],
        allDay: [],
        closed: [],
      },
    });

    expect(businessStyles.styles.weekday).toEqual({
      styleId: 'weekday',
      openMinute: 600,
      closeMinute: 1440,
      isClosed: false,
      requiredStaffByTimeSlot: [{ startHour: 18, endHour: 22, requiredCount: 4 }],
    });
    expect(businessStyles.styles.weekendHoliday.openMinute).toBe(
      DEFAULT_BUSINESS_HOURS_STYLES.weekendHoliday.openMinute
    );
  });

  it('missing businessHoursStyles は default で補完される', () => {
    const businessStyles = buildBusinessStylesFromLegacyConfig({
      businessHoursStyles: null,
      requiredStaffByStyle: DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle,
    });

    for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
      expect(businessStyles.styles[styleId].openMinute).toBe(
        DEFAULT_BUSINESS_HOURS_STYLES[styleId].openMinute
      );
    }
  });

  it('missing requiredStaffByTimeSlot.byStyle は default で補完される', () => {
    const businessStyles = buildBusinessStylesFromLegacyConfig({
      businessHoursStyles: DEFAULT_BUSINESS_HOURS_STYLES,
      requiredStaffByStyle: null,
    });

    expect(businessStyles.styles.weekday.requiredStaffByTimeSlot).toEqual(
      DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle.weekday
    );
    expect(businessStyles.styles.closed.requiredStaffByTimeSlot).toEqual([]);
  });

  it('byStyle の style キー欠落は空配列として扱う', () => {
    const businessStyles = buildBusinessStylesFromLegacyConfig({
      businessHoursStyles: DEFAULT_BUSINESS_HOURS_STYLES,
      requiredStaffByStyle: {
        weekday: [{ startHour: 19, endHour: 22, requiredCount: 2 }],
      },
    });

    expect(businessStyles.styles.weekday.requiredStaffByTimeSlot).toEqual([
      { startHour: 19, endHour: 22, requiredCount: 2 },
    ]);
    expect(businessStyles.styles.event.requiredStaffByTimeSlot).toEqual([]);
  });

  it('不正な requiredStaff スロットは除外される', () => {
    const businessStyles = buildBusinessStylesFromLegacyConfig({
      businessHoursStyles: DEFAULT_BUSINESS_HOURS_STYLES,
      requiredStaffByStyle: {
        weekday: [
          { startHour: 19, endHour: 22, requiredCount: 2 },
          { startHour: 22, endHour: 19, requiredCount: 1 },
          'invalid',
        ],
        weekendHoliday: [],
        event: [],
        allDay: [],
        closed: [],
      },
    });

    expect(businessStyles.styles.weekday.requiredStaffByTimeSlot).toEqual([
      { startHour: 19, endHour: 22, requiredCount: 2 },
    ]);
  });

  it('validateBusinessStyles: 正常 payload を受理する', () => {
    const validated = validateBusinessStyles(DEFAULT_BUSINESS_STYLES_V2);
    expect(validated.version).toBe(2);
    expect(validated.styles.closed.requiredStaffByTimeSlot).toEqual([]);
  });

  it('validateBusinessStyles: closed に requiredStaff があれば拒否する', () => {
    expect(() =>
      validateBusinessStyles({
        version: 2,
        styles: {
          ...DEFAULT_BUSINESS_STYLES_V2.styles,
          closed: {
            ...DEFAULT_BUSINESS_STYLES_V2.styles.closed,
            requiredStaffByTimeSlot: [{ startHour: 10, endHour: 12, requiredCount: 1 }],
          },
        },
      })
    ).toThrow();
  });

  it('normalizeBusinessStyles: 正常 payload を返す', () => {
    const normalized = normalizeBusinessStyles(DEFAULT_BUSINESS_STYLES_V2);
    expect(normalized?.styles.weekday.openMinute).toBe(
      DEFAULT_BUSINESS_HOURS_STYLES.weekday.openMinute
    );
  });

  it('normalizeBusinessStyles: version 不一致は null', () => {
    expect(normalizeBusinessStyles({ version: 1, styles: {} })).toBeNull();
  });

  it('buildBusinessStylesForInitialization: 既存 config + requiredStaff から組み立てる', () => {
    const built = buildBusinessStylesForInitialization({
      businessHoursStyles: {
        weekday: {
          styleId: 'weekday',
          openMinute: 600,
          closeMinute: 1440,
          isClosed: false,
        },
      },
      requiredStaffDocData: {
        version: 2,
        byStyle: {
          weekday: [{ startHour: 18, endHour: 22, requiredCount: 4 }],
          weekendHoliday: [],
          event: [],
          allDay: [],
          closed: [],
        },
      },
      requiredStaffDocExists: true,
    });

    expect(built.styles.weekday).toEqual({
      styleId: 'weekday',
      openMinute: 600,
      closeMinute: 1440,
      isClosed: false,
      requiredStaffByTimeSlot: [{ startHour: 18, endHour: 22, requiredCount: 4 }],
    });
  });

  it('extractRequiredStaffByStyleFromDoc: doc 未存在は default byStyle', () => {
    expect(extractRequiredStaffByStyleFromDoc(undefined, false)).toEqual(
      DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle
    );
  });

  it('extractRequiredStaffByStyleFromDoc: 不正 doc は null', () => {
    expect(extractRequiredStaffByStyleFromDoc({ version: 1 }, true)).toBeNull();
  });

  it('mergeBusinessHoursStylesIntoBusinessStyles: requiredStaffByTimeSlot を保持する', () => {
    const existing = buildDefaultBusinessStyles();
    const merged = mergeBusinessHoursStylesIntoBusinessStyles(existing, {
      weekday: {
        styleId: 'weekday',
        openMinute: 600,
        closeMinute: 1440,
        isClosed: false,
      },
      weekendHoliday: existing.styles.weekendHoliday,
      event: existing.styles.event,
      allDay: existing.styles.allDay,
      closed: existing.styles.closed,
    });

    expect(merged.styles.weekday.openMinute).toBe(600);
    expect(merged.styles.weekday.requiredStaffByTimeSlot).toEqual(
      existing.styles.weekday.requiredStaffByTimeSlot
    );
    expect(merged.styles.closed.requiredStaffByTimeSlot).toEqual([]);
  });

  it('mergeRequiredStaffByStyleIntoBusinessStyles: 営業時間を保持する', () => {
    const existing = buildDefaultBusinessStyles();
    const merged = mergeRequiredStaffByStyleIntoBusinessStyles(existing, {
      weekday: [{ startHour: 10, endHour: 12, requiredCount: 5 }],
      weekendHoliday: [],
      event: [],
      allDay: [],
      closed: [],
    });

    expect(merged.styles.weekday.openMinute).toBe(existing.styles.weekday.openMinute);
    expect(merged.styles.weekday.requiredStaffByTimeSlot).toEqual([
      { startHour: 10, endHour: 12, requiredCount: 5 },
    ]);
  });

  it('businessStylesToRequiredStaffV2 / businessStylesToBusinessHoursStyles', () => {
    const config = buildDefaultBusinessStyles();
    const hours = businessStylesToBusinessHoursStyles(config);
    const required = businessStylesToRequiredStaffV2(config);

    expect(hours.weekday.openMinute).toBe(config.styles.weekday.openMinute);
    expect(required.byStyle.weekday).toEqual(config.styles.weekday.requiredStaffByTimeSlot);
  });
});
