import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

import { registerForSideGame } from '../../src/domains/sideGame/callables/registerForSideGame';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('registerForSideGame (table device)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-default';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function createTableDevice(uid: string, tableId: string) {
    await db.collection('devices').doc(`device_${uid}`).set({
      uid,
      role: 'table',
      status: 'active',
      name: `Table Device ${tableId}`,
      options: {},
      optionParams: {
        table_device_table: { tableId },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  it('role: table かつ自卓への着席登録が成功すること', async () => {
    const tableId = 'TableA';
    const userId = 'user_table_sg_1';
    const billId = 'bill_table_sg_1';
    const callerUid = 'table_device_uid_1';
    const seatNumber = 3;

    await createTableDevice(callerUid, tableId);
    await createBillWithActiveStay({
      billId,
      userId,
      pokerName: 'テスト太郎',
      idempotencyKey: 'idem_table_sg_1',
    });

    await db.collection('sideGame').doc(tableId).set({
      tableId,
      name: tableId,
      maxSeats: 6,
      seats: {
        seat03UserId: null,
        seat03PokerName: null,
      },
      active: true,
      isEnabled: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const result = await (registerForSideGame as any).run({
      auth: { uid: callerUid },
      data: { tableId, seatNumber, userId },
    });

    expect(result.success).toBe(true);

    const sideGameDoc = await db.collection('sideGame').doc(tableId).get();
    expect(sideGameDoc.data()?.seats?.seat03UserId).toBe(userId);
    expect(sideGameDoc.data()?.seats?.seat03PokerName).toBe('テスト太郎');

    const billDoc = await db.collection('bills').doc(billId).get();
    expect(billDoc.data()?.place?.table).toBe(tableId);
    expect(billDoc.data()?.place?.seat).toBe(seatNumber);
  });

  it('role: table で別卓を指定すると permission-denied になること', async () => {
    const callerUid = 'table_device_uid_2';
    await createTableDevice(callerUid, 'TableA');

    await expect(
      (registerForSideGame as any).run({
        auth: { uid: callerUid },
        data: {
          tableId: 'TableB',
          seatNumber: 1,
          userId: 'user_x',
        },
      }),
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'この卓を操作する権限がありません',
    });
  });
});
