/**
 * storeMeta/requiredStaffByTimeSlot テスト（R-09 分離）
 *
 * getRequiredStaffByTimeSlot が storeMeta/requiredStaffByTimeSlot から
 * 正しく読み取ることを検証する。
 * helpers は admin.firestore() を module load 時に参照するため、
 * 本ファイルでは initializeApp を先に実行してから helpers を require する。
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT } from '../../src/shared/config/defaults';

if (admin.apps.length > 0) {
  for (const app of admin.apps) {
    if (app) app.delete();
  }
}
admin.initializeApp({ projectId: 'test-required-staff' });

const { getRequiredStaffByTimeSlot } = require('../../src/domains/shift/services/helpers');

describe('storeMeta/requiredStaffByTimeSlot', () => {
  const itWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? it : it.skip;
  const db = getFirestore();

  beforeEach(async () => {
    const ref = db.collection('storeMeta').doc('requiredStaffByTimeSlot');
    const snap = await ref.get();
    if (snap.exists) await ref.delete();
  });

  it('getRequiredStaffByTimeSlot: doc 未存在 → defaults を返す', async () => {
    const result = await getRequiredStaffByTimeSlot(db);
    expect(result).toEqual(DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT);
  });

  itWithEmulator('getRequiredStaffByTimeSlot: doc 存在 → Firestore の data を返す', async () => {
    await db.collection('storeMeta').doc('requiredStaffByTimeSlot').set({
      data: [{ startHour: 10, endHour: 14, requiredCount: 4 }],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const result = await getRequiredStaffByTimeSlot(db);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ startHour: 10, endHour: 14, requiredCount: 4 });
  });

  itWithEmulator('getRequiredStaffByTimeSlot: data が空配列 → [] を返す（不足判定なし）', async () => {
    await db.collection('storeMeta').doc('requiredStaffByTimeSlot').set({
      data: [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const result = await getRequiredStaffByTimeSlot(db);
    expect(result).toEqual([]);
  });
});
