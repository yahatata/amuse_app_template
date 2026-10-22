/**
 * getActionLogs — tableId なし okibake_addon の履歴フィルタ（Firestore Emulator）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

describe('getActionLogs okibake_addon tableId filter', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  let getActionLogs: { run: (req: unknown) => Promise<Record<string, unknown>> };
  const projectId = 'test-get-action-logs-okibake';
  const tournamentId = 't-hist-1';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
    const mod = await import('../../src/domains/logs/callables/getActionLogs');
    getActionLogs = mod.getActionLogs as typeof getActionLogs;
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    const now = admin.firestore.Timestamp.now();

    await db.collection('operationLogs').doc('op-wait-addon').set({
      operationId: 'op-wait-addon',
      operationName: '置きバケ Addon',
      deviceId: 'dev1',
      status: 'succeeded',
      tournamentId,
      payload: {
        tournamentId,
        okibakeEntryId: 'e-wait',
        playerName: 'オキバケA',
      },
      createdAt: now,
    });

    await db.collection('operationLogs').doc('op-seated-addon').set({
      operationId: 'op-seated-addon',
      operationName: '置きバケ Addon',
      deviceId: 'dev1',
      status: 'succeeded',
      tournamentId,
      tableId: 'table-1',
      payload: {
        tournamentId,
        okibakeEntryId: 'e-seat',
        playerName: 'オキバケB',
        tableId: 'table-1',
        seatNumber: 2,
      },
      createdAt: now,
    });

    await db.collection('operationLogs').doc('op-okibake-linked-user').set({
      operationId: 'op-okibake-linked-user',
      operationName: '置きバケ対象ユーザー設定',
      deviceId: 'dev1',
      status: 'succeeded',
      tournamentId,
      payload: {
        tournamentId,
        okibakeEntryId: 'e-linked-user',
      },
      createdAt: now,
    });

    await db.collection('operationLogs').doc('op-okibake-link-bill').set({
      operationId: 'op-okibake-link-bill',
      operationName: '置きバケ伝票紐付け',
      deviceId: 'dev1',
      status: 'succeeded',
      tournamentId,
      payload: {
        tournamentId,
        okibakeEntryId: 'e-link-bill',
      },
      createdAt: now,
    });

    await db.collection('operationLogs').doc('op-okibake-create').set({
      operationId: 'op-okibake-create',
      operationName: '置きバケ登録',
      deviceId: 'dev1',
      status: 'succeeded',
      tournamentId,
      payload: {
        tournamentId,
        okibakeEntryId: 'e-create',
        temporaryDisplayName: 'オキバケC',
      },
      createdAt: now,
    });

    await db.collection('operationLogs').doc('op-okibake-assign').set({
      operationId: 'op-okibake-assign',
      operationName: '置きバケ着席',
      deviceId: 'dev1',
      status: 'succeeded',
      tournamentId,
      tableId: 'table-1',
      payload: {
        tournamentId,
        okibakeEntryId: 'e-assign',
        playerName: 'オキバケC',
        seatNumber: 3,
        tableId: 'table-1',
      },
      createdAt: now,
    });
  });

  it('tableId フィルタなしでは待機中 okibake_addon も返す', async () => {
    const res = await getActionLogs.run({
      data: { tournamentId, limit: 50 },
    } as any);

    expect(res.success).toBe(true);
    const logs = res.actionLogs as Array<Record<string, unknown>>;
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('okibake_addon');
    expect(actions).toContain('okibake_create_entry');
    expect(actions).toContain('okibake_assign_seat');
    expect(actions).toContain('okibake_update_linked_user');
    expect(actions).toContain('okibake_link_bill');
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const waitLog = logs.find((l) => l.operationId === 'op-wait-addon');
    expect(waitLog?.targetPlayerName).toBe('オキバケA');
    expect(waitLog?.tableId).toBeNull();
    expect(waitLog?.seatNumber).toBeNull();
  });

  it('tableId フィルタありでは tableId なしの待機中 okibake_addon は返さない', async () => {
    const res = await getActionLogs.run({
      data: { tournamentId, tableId: 'table-1', limit: 50 },
    } as any);

    expect(res.success).toBe(true);
    const logs = res.actionLogs as Array<Record<string, unknown>>;
    expect(logs.some((l) => l.operationId === 'op-wait-addon')).toBe(false);
    expect(logs.some((l) => l.operationId === 'op-seated-addon')).toBe(true);
  });
});
