/**
 * A-7 Phase 4: トーナメント順位報酬 Emulator 統合テスト
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { setRankingData } from '../../src/domains/tournament_activeTournament/callables/setRankingData';
import { undoSetRankingData } from '../../src/domains/logs/services/undoSetRankingData';
import {
  assertRewardPointTypeForTemplate,
  assertRewardPointTypeForGrant,
  assertRewardPointTypeForReversal,
} from '../../src/domains/tournament_activeTournament/helpers/rewardPointType';
import { validatePointConfig } from '../../src/shared/config/validatePointConfig';
import { a7StoreConfigDocument, seedA7StoreConfig } from '../helpers/a7StoreConfig';
import { __setMockConfig, __resetMockConfig } from '../helpers/mockStoreConfig';
import {
  rewardPointLogId,
  rewardReversalPointLogId,
} from '../../src/domains/user/services/pointLog';
import type { CurrencyPointId } from '../../src/domains/user/types/pointIds';

function a7ConfigAllCurrencyRewards(): Record<string, unknown> {
  const base = a7StoreConfigDocument();
  return {
    ...base,
    pointSettings: {
      pointA: { enabled: true, displayName: 'A' },
      pointB: { enabled: true, displayName: 'B' },
      pointC: { enabled: true, displayName: 'C' },
      pointD: { enabled: true, displayName: 'D' },
      pointE: { enabled: true, displayName: 'E' },
    },
    tournament: {
      rankingRewardPointTypes: ['pointA', 'pointB', 'pointC', 'pointD', 'pointE'],
    },
    billing: {
      ...(base.billing as Record<string, unknown>),
      paymentPolicy: {
        ...((base.billing as any).paymentPolicy),
        pointPriority: ['pointA', 'pointB', 'pointC', 'pointD', 'pointE', 'sideGameChip'],
        categoryPaymentMethods: {
          extraCost: ['cash', 'credit_card', 'electronic_money'],
          sideGameChip: ['cash', 'credit_card', 'electronic_money'],
          tournaments: [
            'cash',
            'credit_card',
            'electronic_money',
            'pointA',
            'pointB',
            'pointC',
            'pointD',
            'pointE',
          ],
          items: [
            'cash',
            'credit_card',
            'electronic_money',
            'pointA',
            'pointB',
            'pointC',
            'pointD',
            'pointE',
            'sideGameChip',
          ],
        },
        balancePaymentSettings: {
          pointA: { conversion: { referenceUnits: 1, balanceUnits: 1 }, usageUnit: 1 },
          pointB: { conversion: { referenceUnits: 1, balanceUnits: 1 }, usageUnit: 1 },
          pointC: { conversion: { referenceUnits: 1, balanceUnits: 1 }, usageUnit: 1 },
          pointD: { conversion: { referenceUnits: 1, balanceUnits: 1 }, usageUnit: 1 },
          pointE: { conversion: { referenceUnits: 1, balanceUnits: 1 }, usageUnit: 1 },
          sideGameChip: {
            conversion: { referenceUnits: 100, balanceUnits: 1 },
            usageUnit: 100,
          },
        },
      },
    },
  };
}

describe('A-7 Phase4 tournament ranking rewards', () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = 'test-default';

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    process.env.GCLOUD_PROJECT = projectId;
    testEnv = await initializeTestEnvironment({ projectId });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId });
    db = getFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
    await Promise.all(admin.apps.map((app) => app?.delete()).filter(Boolean));
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seedA7StoreConfig(db);
    __setMockConfig(a7StoreConfigDocument());
  });

  afterEach(() => {
    __resetMockConfig();
  });

  async function createAdminDevice(uid: string) {
    await db.collection('devices').add({
      uid,
      role: 'admin',
      status: 'active',
      name: 'Test Device',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function createUser(uid: string, balances: Record<string, unknown> = {}) {
    await db.collection('users').doc(uid).set({
      userType: 'line',
      pointA: 0,
      pointB: 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 0,
      ...balances,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function seedTournament(params: {
    tournamentId: string;
    pointType: string;
    prizeAmount: number;
    setedRanking?: boolean;
  }) {
    const { tournamentId, pointType, prizeAmount, setedRanking = false } = params;
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      status: 'running',
      SetedRanking: setedRanking,
      snapshot: { pointType, name: 't' },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set({
        pointType,
        prizeReceiverCount: 1,
        '1stPrize': prizeAmount,
        prizePool: prizeAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  function validatedFromDoc(doc: Record<string, unknown>) {
    return validatePointConfig({
      pointSettings: doc.pointSettings,
      sideGameChipSettings: doc.sideGameChipSettings,
      rankingRewardPointTypes: (doc.tournament as any)?.rankingRewardPointTypes,
      categoryPaymentMethods: (doc.billing as any)?.paymentPolicy?.categoryPaymentMethods,
      pointPriority: (doc.billing as any)?.paymentPolicy?.pointPriority,
      balancePaymentSettings: (doc.billing as any)?.paymentPolicy?.balancePaymentSettings,
      categoryOrder: (doc.billing as any)?.paymentPolicy?.categoryOrder,
    });
  }

  describe('template / grant validation helpers', () => {
    it('candidates = rankingReward ∩ enabled; sideGameChip 拒否', () => {
      const cfg = validatedFromDoc(a7StoreConfigDocument());
      expect(cfg.rankingRewardPointTypes).toEqual(['pointA']);
      expect(() => assertRewardPointTypeForTemplate('sideGameChip', cfg)).toThrow(
        expect.objectContaining({ errorKey: 'REWARD_POINT_TYPE_INACTIVE' }),
      );
      expect(() => assertRewardPointTypeForTemplate('pointB', cfg)).toThrow(
        expect.objectContaining({ errorKey: 'REWARD_POINT_TYPE_INACTIVE' }),
      );
      expect(assertRewardPointTypeForTemplate('pointA', cfg)).toBe('pointA');
    });

    it('disabled / 許可一覧外を付与拒否', () => {
      const doc = a7ConfigAllCurrencyRewards();
      (doc.pointSettings as any).pointC.enabled = false;
      (doc.tournament as any).rankingRewardPointTypes = ['pointA', 'pointB'];
      const pp = (doc.billing as any).paymentPolicy;
      pp.pointPriority = ['pointA', 'pointB', 'pointD', 'pointE', 'sideGameChip'];
      pp.categoryPaymentMethods.tournaments = [
        'cash',
        'credit_card',
        'electronic_money',
        'pointA',
        'pointB',
        'pointD',
        'pointE',
      ];
      pp.categoryPaymentMethods.items = [
        'cash',
        'credit_card',
        'electronic_money',
        'pointA',
        'pointB',
        'pointD',
        'pointE',
        'sideGameChip',
      ];
      delete pp.balancePaymentSettings.pointC;
      const cfg = validatedFromDoc(doc);
      expect(() => assertRewardPointTypeForGrant('pointC', cfg)).toThrow(
        expect.objectContaining({ errorKey: 'REWARD_POINT_TYPE_INACTIVE' }),
      );
      expect(() => assertRewardPointTypeForGrant('pointD', cfg)).toThrow(
        expect.objectContaining({ errorKey: 'REWARD_POINT_TYPE_INACTIVE' }),
      );
    });

    it('取消は enabled に依存せず通貨型を受理し chip のみ拒否', () => {
      expect(assertRewardPointTypeForReversal('pointC')).toBe('pointC');
      expect(() => assertRewardPointTypeForReversal('sideGameChip')).toThrow(
        expect.objectContaining({ errorKey: 'REWARD_POINT_TYPE_INACTIVE' }),
      );
    });
  });

  describe('grant / reversal', () => {
    it('pointA 付与で残高・pointLogs・grantRecord が更新される（欠損残高は0）', async () => {
      const tournamentId = 't_reward_a';
      const userId = 'u_reward_a';
      const adminId = 'admin_reward_a';
      const grantKey = `${tournamentId}:v1`;
      const prize = 1500;

      await createAdminDevice(adminId);
      // pointA フィールド欠損
      await db.collection('users').doc(userId).set({
        userType: 'line',
        pointB: 10,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await seedTournament({ tournamentId, pointType: 'pointA', prizeAmount: prize });

      const result = await (setRankingData as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: {
            '1stPlayerUid': userId,
            '1stPlayerName': '太郎',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.prizeGrantSkipped).toBe(false);

      const user = await db.collection('users').doc(userId).get();
      expect(user.data()!.pointA).toBe(prize);

      const logId = rewardPointLogId(grantKey, 'pointA');
      const log = await db.collection('users').doc(userId).collection('pointLogs').doc(logId).get();
      expect(log.exists).toBe(true);
      expect(log.data()!.reasonType).toBe('tournament_reward');
      expect(log.data()!.changeAmount).toBe(prize);
      expect(log.data()!.balanceBefore).toBe(0);
      expect(log.data()!.balanceAfter).toBe(prize);
      expect(log.data()!.pointType).toBe('pointA');

      const grant = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('grantRecords')
        .doc(grantKey)
        .get();
      expect(grant.exists).toBe(true);
      expect(grant.data()!.pointType).toBe('pointA');
    });

    it.each(['pointA', 'pointB', 'pointC', 'pointD', 'pointE'] as CurrencyPointId[])(
      '%s へ付与できる',
      async (pointType) => {
        const cfg = a7ConfigAllCurrencyRewards();
        await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
        __setMockConfig(cfg);

        const tournamentId = `t_${pointType}`;
        const userId = `u_${pointType}`;
        const adminId = `admin_${pointType}`;
        const grantKey = `${tournamentId}:g1`;
        const prize = 200;

        await createAdminDevice(adminId);
        await createUser(userId, { [pointType]: 50 });
        await seedTournament({ tournamentId, pointType, prizeAmount: prize });

        await (setRankingData as any).run({
          auth: { uid: adminId },
          data: {
            tournamentId,
            grantIdempotencyKey: grantKey,
            rankingData: {
              '1stPlayerUid': userId,
              '1stPlayerName': 'P',
            },
          },
        });

        const user = await db.collection('users').doc(userId).get();
        expect(user.data()![pointType]).toBe(250);
        const log = await db
          .collection('users')
          .doc(userId)
          .collection('pointLogs')
          .doc(rewardPointLogId(grantKey, pointType))
          .get();
        expect(log.exists).toBe(true);
      },
    );

    it('corrupt 残高は付与拒否', async () => {
      const tournamentId = 't_corrupt';
      const userId = 'u_corrupt';
      const adminId = 'admin_corrupt';
      await createAdminDevice(adminId);
      await createUser(userId, { pointA: null });
      await seedTournament({ tournamentId, pointType: 'pointA', prizeAmount: 100 });

      await expect(
        (setRankingData as any).run({
          auth: { uid: adminId },
          data: {
            tournamentId,
            grantIdempotencyKey: `${tournamentId}:c1`,
            rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'X' },
          },
        }),
      ).rejects.toBeInstanceOf(HttpsError);
    });

    it('許可一覧外の保存済み pointType は付与拒否', async () => {
      const tournamentId = 't_not_allowed';
      const userId = 'u_not_allowed';
      const adminId = 'admin_not_allowed';
      await createAdminDevice(adminId);
      await createUser(userId);
      // config は pointA のみ許可だが、トーナメントは pointB を保存済み
      await seedTournament({ tournamentId, pointType: 'pointB', prizeAmount: 100 });

      await expect(
        (setRankingData as any).run({
          auth: { uid: adminId },
          data: {
            tournamentId,
            grantIdempotencyKey: `${tournamentId}:x1`,
            rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'X' },
          },
        }),
      ).rejects.toBeInstanceOf(HttpsError);
    });

    it('二重付与を grantRecord で防止する', async () => {
      const tournamentId = 't_dup';
      const userId = 'u_dup';
      const adminId = 'admin_dup';
      const grantKey = `${tournamentId}:same`;
      await createAdminDevice(adminId);
      await createUser(userId, { pointA: 0 });
      await seedTournament({ tournamentId, pointType: 'pointA', prizeAmount: 300 });

      const req = {
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'D' },
        },
      };

      await (setRankingData as any).run(req);
      // SetedRanking が true になると2回目は prizeGrantSkipped
      const second = await (setRankingData as any).run(req);
      expect(second.prizeGrantSkipped).toBe(true);

      const user = await db.collection('users').doc(userId).get();
      expect(user.data()!.pointA).toBe(300);
    });

    it('取消で残高戻し・元ログ残存・reversal追加。config無効後も取消可。二重取消は冪等', async () => {
      const tournamentId = 't_rev';
      const userId = 'u_rev';
      const adminId = 'admin_rev';
      const grantKey = `${tournamentId}:r1`;
      const prize = 400;
      await createAdminDevice(adminId);
      await createUser(userId, { pointA: 100 });
      await seedTournament({ tournamentId, pointType: 'pointA', prizeAmount: prize });

      const grantResult = await (setRankingData as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'R' },
        },
      });
      expect(grantResult.success).toBe(true);

      // config 無効化（許可一覧から外す）
      const disabledCfg = a7StoreConfigDocument();
      (disabledCfg.pointSettings as any).pointA.enabled = false;
      (disabledCfg.tournament as any).rankingRewardPointTypes = ['pointB'];
      (disabledCfg.pointSettings as any).pointB.enabled = true;
      await db.collection('storeMeta').doc('config').set(disabledCfg, { merge: true });
      __setMockConfig(disabledCfg);

      const beforeMainView = {
        pointType: 'pointA',
        prizeReceiverCount: 1,
        '1stPrize': prize,
      };

      await undoSetRankingData({
        tournamentId,
        grantIdempotencyKey: grantKey,
        beforeMainView,
        rankingEntries: [
          {
            playerUid: userId,
            prizeAmount: prize,
            entryId: 'e1',
            pointType: 'pointA',
          },
        ],
      });

      const userAfter = await db.collection('users').doc(userId).get();
      expect(userAfter.data()!.pointA).toBe(100);

      const rewardLog = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .doc(rewardPointLogId(grantKey, 'pointA'))
        .get();
      expect(rewardLog.exists).toBe(true);

      const reversalLog = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .doc(rewardReversalPointLogId(grantKey, 'pointA'))
        .get();
      expect(reversalLog.exists).toBe(true);
      expect(reversalLog.data()!.reasonType).toBe('tournament_reward_reversal');
      expect(reversalLog.data()!.changeAmount).toBe(-prize);

      const grantGone = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('grantRecords')
        .doc(grantKey)
        .get();
      expect(grantGone.exists).toBe(false);

      // 二重取消（冪等）
      await undoSetRankingData({
        tournamentId,
        grantIdempotencyKey: grantKey,
        beforeMainView,
        rankingEntries: [
          {
            playerUid: userId,
            prizeAmount: prize,
            entryId: 'e1',
            pointType: 'pointA',
          },
        ],
      });
      const userFinal = await db.collection('users').doc(userId).get();
      expect(userFinal.data()!.pointA).toBe(100);
    });

    it('idempotency conflict: 既存ログと内容不一致', async () => {
      const tournamentId = 't_conflict';
      const userId = 'u_conflict';
      const adminId = 'admin_conflict';
      const grantKey = `${tournamentId}:cf`;
      const prize = 100;
      await createAdminDevice(adminId);
      await createUser(userId, { pointA: 0 });
      await seedTournament({ tournamentId, pointType: 'pointA', prizeAmount: prize });

      const logId = rewardPointLogId(grantKey, 'pointA');
      await db.collection('users').doc(userId).collection('pointLogs').doc(logId).set({
        pointType: 'pointA',
        changeAmount: 999,
        balanceBefore: 0,
        balanceAfter: 999,
        reasonType: 'tournament_reward',
        tournamentId,
        createdAt: admin.firestore.Timestamp.now(),
      });

      await expect(
        (setRankingData as any).run({
          auth: { uid: adminId },
          data: {
            tournamentId,
            grantIdempotencyKey: grantKey,
            rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'C' },
          },
        }),
      ).rejects.toThrow();
    });
  });
});
