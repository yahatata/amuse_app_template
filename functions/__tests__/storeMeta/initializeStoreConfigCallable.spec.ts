/**
 * initializeStoreConfigCallable — storeMeta/businessStyles 作成（Phase 3）
 *
 * Emulator 統合テストは RUN_EMULATOR_TESTS=1 かつ Firestore Emulator 起動時のみ実行。
 */

jest.mock('../../src/shared/devices', () => ({
  getCallerDeviceByUid: jest.fn(async () => ({
    id: 'device-test-admin',
    role: 'admin',
    status: 'active',
  })),
  isActive: jest.fn(() => true),
}));

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import {
  DEFAULT_BUSINESS_HOURS_STYLES,
  DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2,
} from '../../src/shared/config/defaults';
import { REQUIRED_STAFF_STYLE_IDS } from '../../src/shared/config/types';

const projectId = process.env.GCLOUD_PROJECT || 'amuse-app-template';

describe('initializeStoreConfigCallable — businessStyles (Phase 3)', () => {
  const runEmulatorTests = process.env.RUN_EMULATOR_TESTS === '1';
  const itWithEmulator = runEmulatorTests ? it : it.skip;

  let db: FirebaseFirestore.Firestore;
  let initializeStoreConfigCallable: typeof import('../../src/domains/storeMeta/callables/initializeStoreConfigCallable').initializeStoreConfigCallable;

  beforeAll(async () => {
    if (!runEmulatorTests) return;

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });

    ({ initializeStoreConfigCallable } = await import(
      '../../src/domains/storeMeta/callables/initializeStoreConfigCallable'
    ));
    db = getFirestore();
  });

  beforeEach(async () => {
    if (!runEmulatorTests) return;

    const refs = [
      'config',
      'requiredStaffByTimeSlot',
      'businessStyles',
      'schedulerConfig',
      'payrollConfig',
    ].map((id) => db.collection('storeMeta').doc(id));

    await Promise.all(
      refs.map(async (ref) => {
        const snap = await ref.get();
        if (snap.exists) await ref.delete();
      })
    );
  });

  itWithEmulator('storeMeta/businessStyles を default から作成する（旧 doc は参照しない）', async () => {
    await db.collection('storeMeta').doc('config').set({
      businessHoursStyles: {
        weekday: {
          styleId: 'weekday',
          openMinute: 600,
          closeMinute: 1440,
          isClosed: false,
        },
      },
    });
    await db.collection('storeMeta').doc('requiredStaffByTimeSlot').set({
      version: 2,
      byStyle: {
        weekday: [{ startHour: 18, endHour: 22, requiredCount: 4 }],
        weekendHoliday: [],
        event: [],
        allDay: [],
        closed: [],
      },
    });

    const result = await (initializeStoreConfigCallable as any).run({
      auth: { uid: 'admin-uid' },
    });

    expect(result.success).toBe(true);
    expect(result.created).toContain('storeMeta/businessStyles');
    expect(result.created).not.toContain('storeMeta/requiredStaffByTimeSlot');

    const businessStylesDoc = await db.collection('storeMeta').doc('businessStyles').get();
    expect(businessStylesDoc.exists).toBe(true);

    const data = businessStylesDoc.data()!;
    expect(data.version).toBe(2);
    expect(data.styles.weekday.openMinute).toBe(
      DEFAULT_BUSINESS_HOURS_STYLES.weekday.openMinute
    );
    expect(data.styles.weekday.requiredStaffByTimeSlot).toEqual(
      DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle.weekday
    );
    expect(data.styles.closed.requiredStaffByTimeSlot).toEqual([]);
    expect(data.updatedAt).toBeDefined();

    const configDoc = await db.collection('storeMeta').doc('config').get();
    // 既存 config の legacy field は merge で削除しない（正本は businessStyles）
    expect(configDoc.data()?.businessHoursStyles?.weekday.openMinute).toBe(600);
  });

  itWithEmulator('既存 businessStyles がある場合、initialize で破壊しない', async () => {
    const existingStyles = Object.fromEntries(
      REQUIRED_STAFF_STYLE_IDS.map((styleId) => {
        if (styleId === 'weekday') {
          return [
            styleId,
            {
              styleId: 'weekday',
              openMinute: 111,
              closeMinute: 222,
              isClosed: false,
              requiredStaffByTimeSlot: [{ startHour: 9, endHour: 10, requiredCount: 9 }],
            },
          ];
        }
        return [
          styleId,
          {
            styleId,
            openMinute: DEFAULT_BUSINESS_HOURS_STYLES[styleId].openMinute,
            closeMinute: DEFAULT_BUSINESS_HOURS_STYLES[styleId].closeMinute,
            isClosed: DEFAULT_BUSINESS_HOURS_STYLES[styleId].isClosed,
            requiredStaffByTimeSlot: [],
          },
        ];
      })
    );

    await db.collection('storeMeta').doc('businessStyles').set({
      version: 2,
      styles: existingStyles,
    });

    const result = await (initializeStoreConfigCallable as any).run({
      auth: { uid: 'admin-uid' },
    });

    expect(result.created ?? []).not.toContain('storeMeta/businessStyles');

    const businessStylesDoc = await db.collection('storeMeta').doc('businessStyles').get();
    expect(businessStylesDoc.data()?.styles.weekday.openMinute).toBe(111);
    expect(businessStylesDoc.data()?.styles.weekday.requiredStaffByTimeSlot).toEqual([
      { startHour: 9, endHour: 10, requiredCount: 9 },
    ]);
  });

  itWithEmulator('全 doc 未存在時は config / businessStyles を作成し requiredStaff doc は作らない', async () => {
    const result = await (initializeStoreConfigCallable as any).run({
      auth: { uid: 'admin-uid' },
    });

    expect(result.created).toEqual(
      expect.arrayContaining(['storeMeta/config', 'storeMeta/businessStyles'])
    );
    expect(result.created).not.toContain('storeMeta/requiredStaffByTimeSlot');

    const requiredStaffDoc = await db.collection('storeMeta').doc('requiredStaffByTimeSlot').get();
    expect(requiredStaffDoc.exists).toBe(false);

    const businessStylesDoc = await db.collection('storeMeta').doc('businessStyles').get();
    expect(businessStylesDoc.data()?.styles.weekday.requiredStaffByTimeSlot).toEqual(
      DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT_V2.byStyle.weekday
    );
    expect(businessStylesDoc.data()?.styles.weekday.openMinute).toBe(
      DEFAULT_BUSINESS_HOURS_STYLES.weekday.openMinute
    );
  });
});
