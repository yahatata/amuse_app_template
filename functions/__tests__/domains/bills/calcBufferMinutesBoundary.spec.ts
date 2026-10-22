/**
 * calcBufferMinutes が営業日境界の判定に正しく影響することを検証
 *
 * 検証内容:
 * - storeMeta/config の businessDay.calcBufferMinutes を変更すると、
 *   境界付近の時刻がどの営業日に属するかの判定が変わること
 *
 * 営業時間: 9:00-15:00 (openMinute=540, closeMinute=900)
 * - バッファ70分: 7:50〜16:10 が 2025-11-10 に含まれる
 * - バッファ30分: 8:30〜15:30 が 2025-11-10 に含まれる
 * - 8:25 JST は開店の 35分前 → バッファ70なら IN、バッファ30なら OUT
 */

// 本テストでは実装を検証するため、calcBusinessDate と configLoader のモックを解除
jest.unmock('../../../src/domains/bills/repos/calcBusinessDate');
jest.unmock('../../../src/shared/config/configLoader');

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'test-calc-buffer-boundary';

describe('calcBufferMinutes 境界バッファの動作確認', () => {
  let db: admin.firestore.Firestore;
  let calcBusinessDate: (nowUtc?: Date) => Promise<import('../../../src/domains/bills/repos/types').BusinessDateResult>;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8081';
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
    const mod = await import('../../../src/domains/bills/repos/calcBusinessDate');
    calcBusinessDate = mod.calcBusinessDate;
  });

  afterAll(async () => {
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    try {
      await db.collection('businessHoursMonthlyMap').doc('2025-11').set({
        days: {
          '10': {
            openMinute: 540,   // 9:00 JST
            closeMinute: 900,  // 15:00 JST
            isClosed: false,
          },
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        emulatorAvailable = false;
      } else {
        throw e;
      }
    }
  });

  async function setCalcBufferMinutes(value: number) {
    const configRef = db.collection('storeMeta').doc('config');
    await configRef.set({ businessDay: { calcBufferMinutes: value } });
    // 反映確認のため1回読む（Firestore の一貫性のため）
    const snap = await configRef.get();
    expect(snap.data()?.businessDay?.calcBufferMinutes).toBe(value);
  }

  it('バッファ70分: 8:25 JST（開店35分前）は 2025-11-10 に含まれる', async () => {
    if (!emulatorAvailable) {
      console.warn('Firestore Emulator 未起動のためスキップ');
      return;
    }
    await setCalcBufferMinutes(70);
    // 2025-11-10 08:25 JST = 2025-11-09 23:25 UTC
    const utc = new Date('2025-11-09T23:25:00.000Z');
    const result = await calcBusinessDate(utc);
    expect(result).toMatchObject({ status: 'OK', businessDateKey: '2025-11-10' });
  });

  it('バッファ30分: 8:25 JST（開店35分前）は 2025-11-10 に含まれない', async () => {
    if (!emulatorAvailable) {
      console.warn('Firestore Emulator 未起動のためスキップ');
      return;
    }
    await setCalcBufferMinutes(30);
    const utc = new Date('2025-11-09T23:25:00.000Z');
    const result = await calcBusinessDate(utc);
    expect(result.status).toBe('NONE');
  });

  it('バッファ30分: 8:30 JST（開店30分前＝境界上）は 2025-11-10 に含まれる', async () => {
    if (!emulatorAvailable) {
      console.warn('Firestore Emulator 未起動のためスキップ');
      return;
    }
    await setCalcBufferMinutes(30);
    // 2025-11-10 08:30 JST = 2025-11-09 23:30 UTC
    const utc = new Date('2025-11-09T23:30:00.000Z');
    const result = await calcBusinessDate(utc);
    expect(result).toMatchObject({ status: 'OK', businessDateKey: '2025-11-10' });
  });

  it('バッファ0分: 8:59 JST（開店1分前）は 2025-11-10 に含まれない', async () => {
    if (!emulatorAvailable) {
      console.warn('Firestore Emulator 未起動のためスキップ');
      return;
    }
    await setCalcBufferMinutes(0);
    // 2025-11-10 08:59 JST = 2025-11-09 23:59 UTC
    const utc = new Date('2025-11-09T23:59:00.000Z');
    const result = await calcBusinessDate(utc);
    expect(result.status).toBe('NONE');
  });

  it('バッファ0分: 9:00 JST（開店時刻）は 2025-11-10 に含まれる', async () => {
    if (!emulatorAvailable) {
      console.warn('Firestore Emulator 未起動のためスキップ');
      return;
    }
    await setCalcBufferMinutes(0);
    // 2025-11-10 09:00 JST = 2025-11-10 00:00 UTC
    const utc = new Date('2025-11-10T00:00:00.000Z');
    const result = await calcBusinessDate(utc);
    expect(result).toMatchObject({ status: 'OK', businessDateKey: '2025-11-10' });
  });
});
