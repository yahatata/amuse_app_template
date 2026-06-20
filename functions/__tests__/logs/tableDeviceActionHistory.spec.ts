import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('table device action history permissions', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let getActionLogs: { run: (req: unknown) => Promise<Record<string, unknown>> };
  let rollbackAction: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-table-device-action-history';
  const tournamentId = 'tour_history_table_device';
  const tableId = 'T1';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const logsMod = await import('../../src/domains/logs/callables/getActionLogs');
    getActionLogs = logsMod.getActionLogs as typeof getActionLogs;
    const rollbackMod = await import('../../src/domains/logs/callables/rollbackAction');
    rollbackAction = rollbackMod.rollbackAction as typeof rollbackAction;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  async function createTableDevice(uid: string) {
    await db.collection('devices').doc(`device_${uid}`).set({
      uid,
      role: 'table',
      status: 'active',
      name: 'History Table Device',
      options: {},
      optionParams: {
        table_device_table: {
          tableId,
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedActionLog(operationId: string) {
    await db.collection('operationLogs').doc(operationId).set({
      operationId,
      operationName: 'アドオン購入',
      deviceId: 'dev-history',
      status: 'succeeded',
      tournamentId,
      tableId,
      payload: {
        tournamentId,
        tableId,
        playerUid: 'user-history',
        playerName: 'History Player',
        seatNumber: 1,
      },
      createdAt: admin.firestore.Timestamp.now(),
    });
  }

  it('config 欠損時は table role でも履歴参照できる', async () => {
    const uid = 'table_history_view_default';
    await createTableDevice(uid);
    await seedActionLog('op_history_view_default');

    const result = await getActionLogs.run({
      auth: { uid },
      data: {
        tournamentId,
        tableId,
        limit: 20,
      },
    } as any);

    expect(result.success).toBe(true);
    expect((result.actionLogs as Array<unknown>).length).toBe(1);
  });

  it('actionHistoryViewEnabled=false なら履歴参照を拒否する', async () => {
    const uid = 'table_history_view_disabled';
    await createTableDevice(uid);
    await seedActionLog('op_history_view_disabled');
    await db.collection('storeMeta').doc('config').set({
      tableDevice: {
        actionHistoryViewEnabled: false,
      },
    });

    await expect(
      getActionLogs.run({
        auth: { uid },
        data: {
          tournamentId,
          tableId,
          limit: 20,
        },
      } as any),
    ).rejects.toThrow(/操作履歴参照は現在無効です/);
  });

  it('rollback 設定欠損時は table role の取り消しを拒否する', async () => {
    const uid = 'table_history_rollback_default';
    await createTableDevice(uid);
    await seedActionLog('op_history_rollback_default');

    await expect(
      rollbackAction.run({
        auth: { uid },
        data: {
          tournamentId,
          operationId: 'op_history_rollback_default',
          action: 'addon',
          rollBackBy: 'device-history-rollback',
          tableId,
        },
      } as any),
    ).rejects.toThrow(/操作履歴取り消しは現在無効です/);
  });
});
