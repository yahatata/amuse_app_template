/**
 * saveBusinessHoursStyles / saveRequiredStaffByTimeSlotCallable — Firestore 統合（Phase 3）
 *
 * RUN_EMULATOR_TESTS=1 かつ Firestore Emulator 起動時のみ実行。
 */

jest.mock('../../src/domains/shift/services/helpers', () => ({
  assertAdminDevice: jest.fn(async () => undefined),
}));

jest.mock('../../src/domains/shift/services/recalculateIsSufficient', () => ({
  assertEligibleMonthsDataConsistency: jest.fn(async () => undefined),
  recalculateIsSufficientForEligibleDays: jest.fn(async () => 0),
}));

jest.mock('../../src/shared/businessHours/services/propagateBusinessHoursStyleChange', () => ({
  propagateBusinessHoursStyleChange: jest.fn(async () => undefined),
}));

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { buildDefaultBusinessStyles } from '../../src/shared/config/businessStyles';
import { DEFAULT_BUSINESS_HOURS_STYLES } from '../../src/shared/config/defaults';

const projectId = process.env.GCLOUD_PROJECT || 'amuse-app-template';

function buildBusinessHoursPayload(
  weekdayOpenMinute: number,
  weekdayCloseMinute: number
): Record<string, unknown> {
  return {
    weekday: {
      styleId: 'weekday',
      openMinute: weekdayOpenMinute,
      closeMinute: weekdayCloseMinute,
      isClosed: false,
    },
    weekendHoliday: { ...DEFAULT_BUSINESS_HOURS_STYLES.weekendHoliday },
    event: { ...DEFAULT_BUSINESS_HOURS_STYLES.event },
    allDay: { ...DEFAULT_BUSINESS_HOURS_STYLES.allDay },
    closed: { ...DEFAULT_BUSINESS_HOURS_STYLES.closed },
  };
}

describe('save businessStyles callables (Phase 3 emulator)', () => {
  const runEmulatorTests = process.env.RUN_EMULATOR_TESTS === '1';
  const itWithEmulator = runEmulatorTests ? it : it.skip;

  let db: FirebaseFirestore.Firestore;
  let saveBusinessHoursStyles: typeof import('../../src/shared/businessHours/callables/saveBusinessHoursStyles').saveBusinessHoursStyles;
  let saveRequiredStaffByTimeSlotCallable: typeof import('../../src/domains/storeMeta/callables/saveRequiredStaffByTimeSlotCallable').saveRequiredStaffByTimeSlotCallable;

  beforeAll(async () => {
    if (!runEmulatorTests) return;

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });

    ({ saveBusinessHoursStyles } = await import(
      '../../src/shared/businessHours/callables/saveBusinessHoursStyles'
    ));
    ({ saveRequiredStaffByTimeSlotCallable } = await import(
      '../../src/domains/storeMeta/callables/saveRequiredStaffByTimeSlotCallable'
    ));
    db = getFirestore();
  });

  beforeEach(async () => {
    if (!runEmulatorTests) return;

    for (const id of ['businessStyles', 'config', 'requiredStaffByTimeSlot']) {
      const ref = db.collection('storeMeta').doc(id);
      const snap = await ref.get();
      if (snap.exists) await ref.delete();
    }

    const defaults = buildDefaultBusinessStyles();
    await db.collection('storeMeta').doc('businessStyles').set(defaults);
    await db.collection('storeMeta').doc('config').set({
      billing: { entranceFee: 1000 },
      businessHoursStyles: {
        weekday: {
          styleId: 'weekday',
          openMinute: 999,
          closeMinute: 999,
          isClosed: false,
        },
      },
    });
    await db.collection('storeMeta').doc('requiredStaffByTimeSlot').set({
      version: 2,
      byStyle: { weekday: [{ startHour: 1, endHour: 2, requiredCount: 1 }] },
    });
  });

  itWithEmulator('saveBusinessHoursStyles: businessStyles のみ更新し requiredStaff を保持する', async () => {
    const before = (await db.collection('storeMeta').doc('businessStyles').get()).data()!;
    const beforeRequired = before.styles.weekday.requiredStaffByTimeSlot;

    const result = await (saveBusinessHoursStyles as any).run({
      auth: { uid: 'admin-uid' },
      data: {
        installationId: 'device-test',
        businessHoursStyles: buildBusinessHoursPayload(600, 1440),
      },
    });

    expect(result.success).toBe(true);

    const businessStylesDoc = await db.collection('storeMeta').doc('businessStyles').get();
    expect(businessStylesDoc.data()?.styles.weekday.openMinute).toBe(600);
    expect(businessStylesDoc.data()?.styles.weekday.closeMinute).toBe(1440);
    expect(businessStylesDoc.data()?.styles.weekday.requiredStaffByTimeSlot).toEqual(
      beforeRequired
    );

    const configDoc = await db.collection('storeMeta').doc('config').get();
    expect(configDoc.data()?.businessHoursStyles?.weekday.openMinute).toBe(999);
  });

  itWithEmulator('saveRequiredStaffByTimeSlotCallable: businessStyles のみ更新し営業時間を保持する', async () => {
    const before = (await db.collection('storeMeta').doc('businessStyles').get()).data()!;
    const beforeOpen = before.styles.weekday.openMinute;
    const beforeClose = before.styles.weekday.closeMinute;

    const result = await (saveRequiredStaffByTimeSlotCallable as any).run({
      auth: { uid: 'admin-uid' },
      data: {
        installationId: 'device-test',
        requiredStaffByTimeSlot: {
          version: 2,
          byStyle: {
            weekday: [{ startHour: 18, endHour: 22, requiredCount: 5 }],
            weekendHoliday: [],
            event: [],
            allDay: [],
            closed: [],
          },
        },
      },
    });

    expect(result.success).toBe(true);

    const businessStylesDoc = await db.collection('storeMeta').doc('businessStyles').get();
    expect(businessStylesDoc.data()?.styles.weekday.openMinute).toBe(beforeOpen);
    expect(businessStylesDoc.data()?.styles.weekday.closeMinute).toBe(beforeClose);
    expect(businessStylesDoc.data()?.styles.weekday.requiredStaffByTimeSlot).toEqual([
      { startHour: 18, endHour: 22, requiredCount: 5 },
    ]);
    expect(businessStylesDoc.data()?.styles.closed.requiredStaffByTimeSlot).toEqual([]);

    const legacyDoc = await db.collection('storeMeta').doc('requiredStaffByTimeSlot').get();
    expect(legacyDoc.data()?.byStyle.weekday).toEqual([{ startHour: 1, endHour: 2, requiredCount: 1 }]);
  });
});
