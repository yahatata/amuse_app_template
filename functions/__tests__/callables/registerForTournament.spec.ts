/**
 * registerForTournament L4-A
 *
 * atomic / clientNonce / errorKey / status / deadline / post-commit
 *
 * firebase emulators:exec --only firestore \
 *   'cd functions && npm test -- --runInBand callables/registerForTournament.spec.ts'
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { registerForTournament } from '../../src/domains/tournament_activeTournament/callables/registerForTournament';
import {
  executeRegisterForTournamentAtomic,
  registerForTournamentAtomicTestHooks,
} from '../../src/domains/tournament_activeTournament/lib/registerForTournamentAtomic';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('registerForTournament (L4-A)', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-project-register-tournament-l4a';
  const CURRENT_BUSINESS_DATE = '2026-06-03';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';

    testEnv = await initializeTestEnvironment({ projectId });

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    delete process.env.WRITE_TODAYS_BILLS_IN_PARALLEL;
    registerForTournamentAtomicTestHooks.failPostCommitDualWrite = false;
    registerForTournamentAtomicTestHooks.nowOverride = null;
    registerForTournamentAtomicTestHooks.liffRegistrationEnabledOverride = null;
    registerForTournamentAtomicTestHooks.dualWriteEnabledOverride = null;
    jest.restoreAllMocks();
    await setUpStoreMetaRunning(CURRENT_BUSINESS_DATE);
    await db.collection('storeMeta').doc('config').set(
      {
        tournament: { liffRegistrationEnabled: true },
        features: { dualWriteEnabled: false },
      },
      { merge: true },
    );
  });

  async function setUpStoreMetaRunning(businessDateKey: string) {
    await db.collection('storeMeta').doc('currentBusinessDay').set({
      status: 'running',
      currentBusinessDateKey: businessDateKey,
      lastClosedBusinessDateKey: null,
    });
  }

  function jstTodayStartAt(hour = 14): admin.firestore.Timestamp {
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const now = new Date();
    const jstNow = new Date(now.getTime() + jstOffsetMs);
    const jstToday = new Date(
      jstNow.getFullYear(),
      jstNow.getMonth(),
      jstNow.getDate(),
      hour,
      0,
      0,
      0,
    );
    return admin.firestore.Timestamp.fromDate(new Date(jstToday.getTime() - jstOffsetMs));
  }

  async function setupTournament(
    tournamentId: string,
    templateId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const entryFee = 1000;
    const templateName = 'テストトーナメント';
    const startAt = jstTodayStartAt();
    const regEndAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );

    const snapshotOverride =
      overrides.snapshot && typeof overrides.snapshot === 'object'
        ? (overrides.snapshot as Record<string, unknown>)
        : {};
    const { snapshot: _ignored, ...restOverrides } = overrides;

    await db.collection('scheduledTournaments').doc(tournamentId).set({
      templateId,
      status: 'scheduled',
      businessDate: CURRENT_BUSINESS_DATE,
      startAt,
      regEndAt,
      snapshot: {
        name: templateName,
        entryFee,
        startStack: 10000,
        ...snapshotOverride,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...restOverrides,
    });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        playersIn: 0,
        entries: 0,
        waitingCount: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('tablesSeat')
      .doc('waiting')
      .set({
        waiting: {},
        count: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('usersList')
      .set({
        users: {},
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  function callRegister(params: {
    tournamentId: string;
    userId: string;
    clientNonce?: string;
    auth?: { uid: string } | null;
    data?: Record<string, unknown>;
  }) {
    const { tournamentId, userId, clientNonce = `nonce_${tournamentId}_${userId}`, auth, data } =
      params;
    return (registerForTournament as any).run({
      data: data ?? { tournamentId, clientNonce },
      auth: auth === undefined ? { uid: userId } : auth,
    });
  }

  async function expectErrorKey(promise: Promise<unknown>, errorKey: string) {
    await expect(promise).rejects.toMatchObject({
      details: expect.objectContaining({ errorKey }),
    });
  }

  async function readCounts(tournamentId: string) {
    const main = await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .get();
    return main.data() || {};
  }

  describe('auth / request validation', () => {
    it('未認証は TOURNAMENT_UNAUTHENTICATED', async () => {
      await expectErrorKey(
        callRegister({
          tournamentId: 't1',
          userId: 'u1',
          auth: null,
          data: { tournamentId: 't1', clientNonce: 'n1' },
        }),
        'TOURNAMENT_UNAUTHENTICATED',
      );
    });

    it('tournamentId 欠損', async () => {
      await expectErrorKey(
        (registerForTournament as any).run({
          auth: { uid: 'u1' },
          data: { clientNonce: 'n1' },
        }),
        'TOURNAMENT_INVALID_STATE',
      );
    });

    it('tournamentId 空', async () => {
      await expectErrorKey(
        (registerForTournament as any).run({
          auth: { uid: 'u1' },
          data: { tournamentId: '  ', clientNonce: 'n1' },
        }),
        'TOURNAMENT_INVALID_STATE',
      );
    });

    it('clientNonce 欠損', async () => {
      await expectErrorKey(
        (registerForTournament as any).run({
          auth: { uid: 'u1' },
          data: { tournamentId: 't1' },
        }),
        'TOURNAMENT_NONCE_REQUIRED',
      );
    });

    it('clientNonce 空／空白', async () => {
      await expectErrorKey(
        (registerForTournament as any).run({
          auth: { uid: 'u1' },
          data: { tournamentId: 't1', clientNonce: '   ' },
        }),
        'TOURNAMENT_NONCE_REQUIRED',
      );
    });

    it('clientNonce 型不正', async () => {
      await expectErrorKey(
        (registerForTournament as any).run({
          auth: { uid: 'u1' },
          data: { tournamentId: 't1', clientNonce: 123 },
        }),
        'TOURNAMENT_NONCE_REQUIRED',
      );
    });

    it('clientNonce 長すぎ', async () => {
      await expectErrorKey(
        (registerForTournament as any).run({
          auth: { uid: 'u1' },
          data: { tournamentId: 't1', clientNonce: 'x'.repeat(200) },
        }),
        'TOURNAMENT_NONCE_REQUIRED',
      );
    });
  });

  describe('happy path / nonce idempotency', () => {
    it('初回成功: waiting / usersList / bill / nonce が揃う', async () => {
      const tournamentId = 'tournament_ok';
      const templateId = 'template_ok';
      const userId = 'user_ok';
      const billId = 'bill_ok';
      const clientNonce = 'nonce_ok_001';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: '太郎',
        idempotencyKey: 'idem_ok',
      });
      await setupTournament(tournamentId, templateId);

      const result = await callRegister({ tournamentId, userId, clientNonce });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        tournamentId,
        templateId,
        clientNonce,
        reused: false,
        registrationStatus: 'waiting',
        waiting: true,
        billId,
        entryFee: 1000,
        tournamentName: 'テストトーナメント',
        pokerName: '太郎',
      });
      expect(typeof result.data.registeredAt).toBe('string');

      const billTn = await db
        .collection('bills')
        .doc(billId)
        .collection('tournaments')
        .doc(templateId)
        .get();
      expect(billTn.exists).toBe(true);
      expect(billTn.data()!.entryCount).toBe(1);
      expect(billTn.data()!.entryFeeIncl).toBe(1000);

      const reqDoc = await db
        .collection('bills')
        .doc(billId)
        .collection('tournamentRegistrationRequests')
        .doc(clientNonce)
        .get();
      expect(reqDoc.exists).toBe(true);
      expect(reqDoc.data()!.status).toBe('succeeded');

      const counts = await readCounts(tournamentId);
      expect(counts.playersIn).toBe(1);
      expect(counts.entries).toBe(1);
      expect(counts.waitingCount).toBe(1);
    });

    it('同一 nonce 再送は reused:true で count 増加なし', async () => {
      const tournamentId = 'tournament_reuse';
      const templateId = 'template_reuse';
      const userId = 'user_reuse';
      const billId = 'bill_reuse';
      const clientNonce = 'nonce_reuse_001';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: '再利用',
        idempotencyKey: 'idem_reuse',
      });
      await setupTournament(tournamentId, templateId);

      const first = await callRegister({ tournamentId, userId, clientNonce });
      expect(first.data.reused).toBe(false);

      const second = await callRegister({ tournamentId, userId, clientNonce });
      expect(second.success).toBe(true);
      expect(second.data.reused).toBe(true);
      expect(second.data.clientNonce).toBe(clientNonce);
      expect(second.data.billId).toBe(billId);

      const counts = await readCounts(tournamentId);
      expect(counts.playersIn).toBe(1);
      expect(counts.entries).toBe(1);

      const billTn = await db
        .collection('bills')
        .doc(billId)
        .collection('tournaments')
        .doc(templateId)
        .get();
      expect(billTn.data()!.entryCount).toBe(1);
    });

    it('同一 nonce + 別 tournament は TOURNAMENT_NONCE_CONFLICT', async () => {
      const userId = 'user_conflict_tn';
      const billId = 'bill_conflict_tn';
      const clientNonce = 'nonce_conflict_tn';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: '衝突',
        idempotencyKey: 'idem_conflict_tn',
      });
      await setupTournament('tn_a', 'tpl_a');
      await setupTournament('tn_b', 'tpl_b');

      await callRegister({ tournamentId: 'tn_a', userId, clientNonce });
      await expectErrorKey(
        callRegister({ tournamentId: 'tn_b', userId, clientNonce }),
        'TOURNAMENT_NONCE_CONFLICT',
      );
    });

    it('別 nonce + 既登録は TOURNAMENT_ALREADY_REGISTERED', async () => {
      const tournamentId = 'tournament_dup';
      const templateId = 'template_dup';
      const userId = 'user_dup';
      const billId = 'bill_dup';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: '重複',
        idempotencyKey: 'idem_dup',
      });
      await setupTournament(tournamentId, templateId);

      await callRegister({ tournamentId, userId, clientNonce: 'nonce_dup_1' });
      await expectErrorKey(
        callRegister({ tournamentId, userId, clientNonce: 'nonce_dup_2' }),
        'TOURNAMENT_ALREADY_REGISTERED',
      );

      const counts = await readCounts(tournamentId);
      expect(counts.playersIn).toBe(1);
    });
  });

  describe('status / deadline', () => {
    async function withStay(userId: string, billId: string) {
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'S',
        idempotencyKey: `idem_${billId}`,
      });
    }

    it('running + deadline 前は成功', async () => {
      await withStay('user_running', 'bill_running');
      await setupTournament('tn_running', 'tpl_running', { status: 'running' });
      const result = await callRegister({
        tournamentId: 'tn_running',
        userId: 'user_running',
        clientNonce: 'n_running',
      });
      expect(result.success).toBe(true);
    });

    it.each([
      ['registered', 'TOURNAMENT_REGISTRATION_CLOSED'],
      ['paused', 'TOURNAMENT_PAUSED'],
      ['ended', 'TOURNAMENT_ENDED'],
      ['force_ended', 'TOURNAMENT_ENDED'],
      ['cancelled', 'TOURNAMENT_CANCELLED'],
      ['canceled', 'TOURNAMENT_CANCELLED'],
      ['unknown_status', 'TOURNAMENT_INVALID_STATE'],
    ] as const)('status=%s → %s', async (status, errorKey) => {
      const tournamentId = `tn_${status}`;
      const userId = `user_${status}`;
      const billId = `bill_${status}`;
      await withStay(userId, billId);
      await setupTournament(tournamentId, `tpl_${status}`, { status });
      await expectErrorKey(
        callRegister({ tournamentId, userId, clientNonce: `n_${status}` }),
        errorKey,
      );
      const counts = await readCounts(tournamentId);
      expect(counts.playersIn ?? 0).toBe(0);
    });

    it('締切後は TOURNAMENT_REGISTRATION_CLOSED', async () => {
      await withStay('user_deadline', 'bill_deadline');
      await setupTournament('tn_deadline', 'tpl_deadline', {
        regEndAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60_000)),
      });
      await expectErrorKey(
        callRegister({
          tournamentId: 'tn_deadline',
          userId: 'user_deadline',
          clientNonce: 'n_deadline',
        }),
        'TOURNAMENT_REGISTRATION_CLOSED',
      );
    });

    it('締切ちょうどは閉鎖', async () => {
      const exactly = new Date('2026-06-03T12:00:00.000Z');
      registerForTournamentAtomicTestHooks.nowOverride = exactly;
      await withStay('user_exact', 'bill_exact');
      await setupTournament('tn_exact', 'tpl_exact', {
        regEndAt: admin.firestore.Timestamp.fromDate(exactly),
      });
      await expectErrorKey(
        callRegister({
          tournamentId: 'tn_exact',
          userId: 'user_exact',
          clientNonce: 'n_exact',
        }),
        'TOURNAMENT_REGISTRATION_CLOSED',
      );
    });
  });

  describe('stay / bill / fee / LIFF / okibake', () => {
    it('activeStay なし', async () => {
      await setupTournament('tn_nostay', 'tpl_nostay');
      await expectErrorKey(
        callRegister({
          tournamentId: 'tn_nostay',
          userId: 'ghost',
          clientNonce: 'n_ghost',
        }),
        'TOURNAMENT_ACTIVE_BILL_NOT_FOUND',
      );
    });

    it('bill settled → TOURNAMENT_BILL_NOT_OPEN', async () => {
      const userId = 'user_settled';
      const billId = 'bill_settled';
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'S',
        idempotencyKey: 'idem_settled',
      });
      await db.collection('bills').doc(billId).update({ status: 'settled' });
      await setupTournament('tn_settled', 'tpl_settled');
      await expectErrorKey(
        callRegister({
          tournamentId: 'tn_settled',
          userId,
          clientNonce: 'n_settled',
        }),
        'TOURNAMENT_BILL_NOT_OPEN',
      );
    });

    it('party.userId mismatch', async () => {
      const userId = 'user_party';
      const billId = 'bill_party';
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'S',
        idempotencyKey: 'idem_party',
      });
      await db.collection('bills').doc(billId).update({
        'party.userId': 'other_user',
      });
      await setupTournament('tn_party', 'tpl_party');
      await expectErrorKey(
        callRegister({
          tournamentId: 'tn_party',
          userId,
          clientNonce: 'n_party',
        }),
        'TOURNAMENT_ACTIVE_BILL_NOT_FOUND',
      );
    });

    it('entryFee 負数は TOURNAMENT_FEE_INVALID', async () => {
      const userId = 'user_fee';
      const billId = 'bill_fee';
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'S',
        idempotencyKey: 'idem_fee',
      });
      await setupTournament('tn_fee', 'tpl_fee', {
        snapshot: { entryFee: -1 },
      });
      await expectErrorKey(
        callRegister({ tournamentId: 'tn_fee', userId, clientNonce: 'n_fee' }),
        'TOURNAMENT_FEE_INVALID',
      );
    });

    it('entryFee 0 は許容', async () => {
      const userId = 'user_fee0';
      const billId = 'bill_fee0';
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'S',
        idempotencyKey: 'idem_fee0',
      });
      await setupTournament('tn_fee0', 'tpl_fee0', {
        snapshot: { entryFee: 0 },
      });
      const result = await callRegister({
        tournamentId: 'tn_fee0',
        userId,
        clientNonce: 'n_fee0',
      });
      expect(result.data.entryFee).toBe(0);
    });

    it('NOT_TODAY', async () => {
      const userId = 'user_not_today';
      const billId = 'bill_not_today';
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'S',
        idempotencyKey: 'idem_not_today',
      });
      await setupTournament('tn_not_today', 'tpl_not_today', {
        businessDate: '2026-06-04',
      });
      await expectErrorKey(
        callRegister({
          tournamentId: 'tn_not_today',
          userId,
          clientNonce: 'n_not_today',
        }),
        'TOURNAMENT_NOT_TODAY',
      );
    });

    it('liffRegistrationEnabled=false', async () => {
      const userId = 'user_liff_off';
      const billId = 'bill_liff_off';
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'S',
        idempotencyKey: 'idem_liff_off',
      });
      await setupTournament('tn_liff_off', 'tpl_liff_off');

      registerForTournamentAtomicTestHooks.liffRegistrationEnabledOverride = false;

      await expectErrorKey(
        callRegister({
          tournamentId: 'tn_liff_off',
          userId,
          clientNonce: 'n_liff_off',
        }),
        'TOURNAMENT_LIFF_REGISTRATION_DISABLED',
      );
    });

    it('置きバケ衝突は書込み0件', async () => {
      const tournamentId = 'tn_oki';
      const templateId = 'tpl_oki';
      const userId = 'user_oki';
      const billId = 'bill_oki';
      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'O',
        idempotencyKey: 'idem_oki',
      });
      await setupTournament(tournamentId, templateId);
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('okibakeTemporaryEntries')
        .doc('oki1')
        .set({
          linkedUserId: userId,
          entryStatus: 'registered',
          billLinkStatus: 'unlinked',
        });

      await expectErrorKey(
        callRegister({ tournamentId, userId, clientNonce: 'n_oki' }),
        'TOURNAMENT_PARTICIPANT_CONFLICT_WITH_OKIBAKE',
      );
      const counts = await readCounts(tournamentId);
      expect(counts.playersIn).toBe(0);
      const billTn = await db
        .collection('bills')
        .doc(billId)
        .collection('tournaments')
        .doc(templateId)
        .get();
      expect(billTn.exists).toBe(false);
    });
  });

  describe('race / post-commit', () => {
    it('同時2call同一nonce → 片方成功・再送相当、count=1', async () => {
      const tournamentId = 'tn_race_same';
      const templateId = 'tpl_race_same';
      const userId = 'user_race_same';
      const billId = 'bill_race_same';
      const clientNonce = 'nonce_race_same';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'R',
        idempotencyKey: 'idem_race_same',
      });
      await setupTournament(tournamentId, templateId);
      await db.collection('storeMeta').doc('config').set(
        { tournament: { liffRegistrationEnabled: true } },
        { merge: true },
      );

      const results = await Promise.allSettled([
        callRegister({ tournamentId, userId, clientNonce }),
        callRegister({ tournamentId, userId, clientNonce }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === 'rejected');
      if (fulfilled.length !== 2) {
        // デバッグ用: 競合で両失敗した場合の reason を出す
        // eslint-disable-next-line no-console
        console.error(
          'same-nonce race rejected',
          rejected.map((r) => (r as PromiseRejectedResult).reason),
        );
      }
      expect(fulfilled.length).toBe(2);
      expect(fulfilled.every((r) => r.value.success === true)).toBe(true);
      const reusedFlags = fulfilled.map((r) => r.value.data.reused);
      expect(reusedFlags.filter((x) => x === false).length).toBe(1);
      expect(reusedFlags.filter((x) => x === true).length).toBe(1);

      const counts = await readCounts(tournamentId);
      expect(counts.playersIn).toBe(1);
      expect(counts.entries).toBe(1);
    });

    it('同時2call別nonce → 1成功1 ALREADY、count=1', async () => {
      const tournamentId = 'tn_race_diff';
      const templateId = 'tpl_race_diff';
      const userId = 'user_race_diff';
      const billId = 'bill_race_diff';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'R',
        idempotencyKey: 'idem_race_diff',
      });
      await setupTournament(tournamentId, templateId);
      await db.collection('storeMeta').doc('config').set(
        { tournament: { liffRegistrationEnabled: true } },
        { merge: true },
      );

      const results = await Promise.allSettled([
        callRegister({ tournamentId, userId, clientNonce: 'n_a' }),
        callRegister({ tournamentId, userId, clientNonce: 'n_b' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      if (fulfilled.length !== 1) {
        // eslint-disable-next-line no-console
        console.error(
          'diff-nonce race',
          results.map((r) =>
            r.status === 'fulfilled'
              ? { ok: true, reused: r.value.data.reused }
              : { ok: false, reason: r.reason },
          ),
        );
      }
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0].reason as HttpsError).details).toEqual(
        expect.objectContaining({ errorKey: 'TOURNAMENT_ALREADY_REGISTERED' }),
      );

      const counts = await readCounts(tournamentId);
      expect(counts.playersIn).toBe(1);
    });

    it('post-commit dualWrite 失敗後も同一nonceで reused 復元・重複なし', async () => {
      const tournamentId = 'tn_post';
      const templateId = 'tpl_post';
      const userId = 'user_post';
      const billId = 'bill_post';
      const clientNonce = 'nonce_post';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'P',
        idempotencyKey: 'idem_post',
      });
      await setupTournament(tournamentId, templateId);

      registerForTournamentAtomicTestHooks.dualWriteEnabledOverride = true;
      registerForTournamentAtomicTestHooks.failPostCommitDualWrite = true;

      const first = await executeRegisterForTournamentAtomic({
        userId,
        tournamentId,
        clientNonce,
      });
      expect(first.reused).toBe(false);

      registerForTournamentAtomicTestHooks.failPostCommitDualWrite = false;

      const second = await executeRegisterForTournamentAtomic({
        userId,
        tournamentId,
        clientNonce,
      });
      expect(second.reused).toBe(true);

      const counts = await readCounts(tournamentId);
      expect(counts.playersIn).toBe(1);
      const billTn = await db
        .collection('bills')
        .doc(billId)
        .collection('tournaments')
        .doc(templateId)
        .get();
      expect(billTn.data()!.entryCount).toBe(1);
    });
  });

  describe('todaysBills dualWrite best-effort', () => {
    it('dualWrite 有効時 todaysBills へ反映される（本体成功後）', async () => {
      const tournamentId = 'tn_dw';
      const templateId = 'tpl_dw';
      const userId = 'user_dw';
      const billId = 'bill_dw';

      await createBillWithActiveStay({
        billId,
        userId,
        pokerName: 'DW',
        idempotencyKey: 'idem_dw',
      });
      await setupTournament(tournamentId, templateId);
      await db.collection('todaysBills').doc(billId).set({
        status: 'open',
        userId,
        pokerName: 'DW',
        tournaments: {},
      });

      registerForTournamentAtomicTestHooks.dualWriteEnabledOverride = true;

      await callRegister({ tournamentId, userId, clientNonce: 'n_dw' });

      const legacy = await db.collection('todaysBills').doc(billId).get();
      expect(legacy.data()?.tournaments?.[templateId]).toBeDefined();
    });
  });
});
