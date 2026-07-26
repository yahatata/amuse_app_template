/**
 * A-7 Phase 4: トーナメント順位報酬 Emulator 統合テスト
 * （プライズ基準値 + prizeConversion snapshot → 残高換算付与）
 */

import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { setPrizeData } from '../../src/domains/tournament_activeTournament/callables/setPrizeData';
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
          pointB: { conversion: { referenceUnits: 10, balanceUnits: 1 }, usageUnit: 10 },
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
    prizeReferenceAmount: number;
    conversion?: { referenceUnits: number; balanceUnits: number };
    setedRanking?: boolean;
    omitPrizeConversion?: boolean;
  }) {
    const {
      tournamentId,
      pointType,
      prizeReferenceAmount,
      conversion = { referenceUnits: 1, balanceUnits: 1 },
      setedRanking = false,
      omitPrizeConversion = false,
    } = params;
    await db.collection('scheduledTournaments').doc(tournamentId).set({
      status: 'running',
      SetedRanking: setedRanking,
      snapshot: { pointType, name: 't' },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const main: Record<string, unknown> = {
      pointType,
      prizeReceiverCount: 1,
      '1stPrize': prizeReferenceAmount,
      prizePool: prizeReferenceAmount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!omitPrizeConversion) {
      main.prizeConversion = conversion;
    }
    await db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main')
      .set(main);
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

  describe('setPrizeData validation / snapshot', () => {
    async function seedBareTournament(tournamentId: string) {
      await db.collection('scheduledTournaments').doc(tournamentId).set({
        status: 'running',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({ placeholder: true });
    }

    it('prizeConversion を snapshot 保存し、整数換算可能な基準値を受理する', async () => {
      const cfg = a7ConfigAllCurrencyRewards();
      await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
      __setMockConfig(cfg);

      const tournamentId = 't_prize_ok';
      const adminId = 'admin_prize_ok';
      await createAdminDevice(adminId);
      await seedBareTournament(tournamentId);

      const result = await (setPrizeData as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          prizeData: {
            prizePool: 1000,
            prizeReceiverCount: 1,
            pointType: 'pointB',
            '1stPrize': 1000,
            '1stPlayerName': null,
            '1stPlayerUid': null,
          },
        },
      });
      expect(result.success).toBe(true);
      expect(result.prizeConversion).toEqual({ referenceUnits: 10, balanceUnits: 1 });

      const main = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('main')
          .get()
      ).data()!;
      expect(main.pointType).toBe('pointB');
      expect(main.prizeConversion).toEqual({ referenceUnits: 10, balanceUnits: 1 });
      expect(main['1stPrize']).toBe(1000);
    });

    it('非整数換算の順位額はプライズ確定を拒否する', async () => {
      const cfg = a7ConfigAllCurrencyRewards();
      await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
      __setMockConfig(cfg);

      const tournamentId = 't_prize_ni';
      const adminId = 'admin_prize_ni';
      await createAdminDevice(adminId);
      await seedBareTournament(tournamentId);

      await expect(
        (setPrizeData as any).run({
          auth: { uid: adminId },
          data: {
            tournamentId,
            prizeData: {
              prizePool: 1005,
              prizeReceiverCount: 1,
              pointType: 'pointB',
              '1stPrize': 1005,
            },
          },
        }),
      ).rejects.toBeInstanceOf(HttpsError);
    });

    it('chip / 許可外 / disabled を拒否する', async () => {
      const cfg = a7ConfigAllCurrencyRewards();
      await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
      __setMockConfig(cfg);
      const tournamentId = 't_prize_bad';
      const adminId = 'admin_prize_bad';
      await createAdminDevice(adminId);
      await seedBareTournament(tournamentId);

      for (const pointType of ['sideGameChip', 'pointZ']) {
        await expect(
          (setPrizeData as any).run({
            auth: { uid: adminId },
            data: {
              tournamentId,
              prizeData: {
                prizePool: 100,
                prizeReceiverCount: 1,
                pointType,
                '1stPrize': 100,
              },
            },
          }),
        ).rejects.toBeInstanceOf(HttpsError);
      }
    });
  });

  describe('grant / reversal with conversion', () => {
    it('pointA 1:1 で基準値1500 → 残高1500・grantRecordsに両量', async () => {
      const tournamentId = 't_reward_a';
      const userId = 'u_reward_a';
      const adminId = 'admin_reward_a';
      const grantKey = `${tournamentId}:v1`;
      const prizeRef = 1500;

      await createAdminDevice(adminId);
      await db.collection('users').doc(userId).set({
        userType: 'line',
        pointB: 10,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await seedTournament({
        tournamentId,
        pointType: 'pointA',
        prizeReferenceAmount: prizeRef,
        conversion: { referenceUnits: 1, balanceUnits: 1 },
      });

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
      expect(user.data()!.pointA).toBe(1500);

      const logId = rewardPointLogId(grantKey, 'pointA');
      const log = await db.collection('users').doc(userId).collection('pointLogs').doc(logId).get();
      expect(log.data()!.changeAmount).toBe(1500);
      expect(log.data()!.balanceAfter).toBe(1500);

      const grant = await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('grantRecords')
        .doc(grantKey)
        .get();
      expect(grant.data()!.conversion).toEqual({ referenceUnits: 1, balanceUnits: 1 });
      expect(grant.data()!.awards[0].prizeReferenceAmount).toBe(1500);
      expect(grant.data()!.awards[0].awardedBalanceAmount).toBe(1500);
    });

    it('pointB 10:1 で基準値1000 → 残高100', async () => {
      const cfg = a7ConfigAllCurrencyRewards();
      await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
      __setMockConfig(cfg);

      const tournamentId = 't_reward_b';
      const userId = 'u_reward_b';
      const adminId = 'admin_reward_b';
      const grantKey = `${tournamentId}:v1`;

      await createAdminDevice(adminId);
      await createUser(userId, { pointB: 5 });
      await seedTournament({
        tournamentId,
        pointType: 'pointB',
        prizeReferenceAmount: 1000,
        conversion: { referenceUnits: 10, balanceUnits: 1 },
      });

      await (setRankingData as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'B' },
        },
      });

      const user = await db.collection('users').doc(userId).get();
      expect(user.data()!.pointB).toBe(105);

      const log = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .doc(rewardPointLogId(grantKey, 'pointB'))
        .get();
      expect(log.data()!.changeAmount).toBe(100);
    });

    it('プライズ確定後に config conversion を変えても保存済みで付与する', async () => {
      const cfg = a7ConfigAllCurrencyRewards();
      await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
      __setMockConfig(cfg);

      const tournamentId = 't_snap';
      const userId = 'u_snap';
      const adminId = 'admin_snap';
      const grantKey = `${tournamentId}:s1`;
      await createAdminDevice(adminId);
      await createUser(userId);
      await seedTournament({
        tournamentId,
        pointType: 'pointB',
        prizeReferenceAmount: 1000,
        conversion: { referenceUnits: 10, balanceUnits: 1 },
      });

      // config を 1:1 に変更しても snapshot 10:1 で付与
      const changed = a7ConfigAllCurrencyRewards();
      (changed.billing as any).paymentPolicy.balancePaymentSettings.pointB = {
        conversion: { referenceUnits: 1, balanceUnits: 1 },
        usageUnit: 1,
      };
      await db.collection('storeMeta').doc('config').set(changed, { merge: true });
      __setMockConfig(changed);

      await (setRankingData as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'S' },
        },
      });

      const user = await db.collection('users').doc(userId).get();
      expect(user.data()!.pointB).toBe(100);
    });

    it('prizeConversion 欠損は付与拒否', async () => {
      const tournamentId = 't_missing_conv';
      const userId = 'u_missing_conv';
      const adminId = 'admin_missing_conv';
      await createAdminDevice(adminId);
      await createUser(userId);
      await seedTournament({
        tournamentId,
        pointType: 'pointA',
        prizeReferenceAmount: 100,
        omitPrizeConversion: true,
      });

      await expect(
        (setRankingData as any).run({
          auth: { uid: adminId },
          data: {
            tournamentId,
            grantIdempotencyKey: `${tournamentId}:m1`,
            rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'X' },
          },
        }),
      ).rejects.toBeInstanceOf(HttpsError);
    });

    it('複数順位をそれぞれ換算して付与する', async () => {
      const cfg = a7ConfigAllCurrencyRewards();
      await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
      __setMockConfig(cfg);

      const tournamentId = 't_multi';
      const adminId = 'admin_multi';
      const u1 = 'u_multi_1';
      const u2 = 'u_multi_2';
      const grantKey = `${tournamentId}:m`;
      await createAdminDevice(adminId);
      await createUser(u1);
      await createUser(u2);
      await db.collection('scheduledTournaments').doc(tournamentId).set({
        status: 'running',
        SetedRanking: false,
        snapshot: { pointType: 'pointB' },
      });
      await db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .set({
          pointType: 'pointB',
          prizeConversion: { referenceUnits: 10, balanceUnits: 1 },
          prizeReceiverCount: 2,
          prizePool: 1500,
          '1stPrize': 1000,
          '2stPrize': 500,
        });

      await (setRankingData as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: {
            '1stPlayerUid': u1,
            '1stPlayerName': '1',
            '2stPlayerUid': u2,
            '2stPlayerName': '2',
          },
        },
      });

      expect((await db.collection('users').doc(u1).get()).data()!.pointB).toBe(100);
      expect((await db.collection('users').doc(u2).get()).data()!.pointB).toBe(50);
      const grant = (
        await db
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('grantRecords')
          .doc(grantKey)
          .get()
      ).data()!;
      expect(grant.awards).toHaveLength(2);
      expect(grant.awards[0].awardedBalanceAmount).toBe(100);
      expect(grant.awards[1].awardedBalanceAmount).toBe(50);
    });

    it.each(['pointA', 'pointC', 'pointD', 'pointE'] as CurrencyPointId[])(
      '%s へ 1:1 付与できる',
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
        await seedTournament({
          tournamentId,
          pointType,
          prizeReferenceAmount: prize,
          conversion: { referenceUnits: 1, balanceUnits: 1 },
        });

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
      },
    );

    it('corrupt 残高は付与拒否', async () => {
      const tournamentId = 't_corrupt';
      const userId = 'u_corrupt';
      const adminId = 'admin_corrupt';
      await createAdminDevice(adminId);
      await createUser(userId, { pointA: null });
      await seedTournament({
        tournamentId,
        pointType: 'pointA',
        prizeReferenceAmount: 100,
      });

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
      await seedTournament({
        tournamentId,
        pointType: 'pointB',
        prizeReferenceAmount: 100,
        conversion: { referenceUnits: 1, balanceUnits: 1 },
      });

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
      await seedTournament({
        tournamentId,
        pointType: 'pointA',
        prizeReferenceAmount: 300,
      });

      const req = {
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'D' },
        },
      };

      await (setRankingData as any).run(req);
      const second = await (setRankingData as any).run(req);
      expect(second.prizeGrantSkipped).toBe(true);

      const user = await db.collection('users').doc(userId).get();
      expect(user.data()!.pointA).toBe(300);
    });

    it('取消は awardedBalanceAmount を正本とし config 無効後も可', async () => {
      const cfg = a7ConfigAllCurrencyRewards();
      await db.collection('storeMeta').doc('config').set(cfg, { merge: true });
      __setMockConfig(cfg);

      const tournamentId = 't_rev';
      const userId = 'u_rev';
      const adminId = 'admin_rev';
      const grantKey = `${tournamentId}:r1`;
      const prizeRef = 1000;
      const awarded = 100;
      await createAdminDevice(adminId);
      await createUser(userId, { pointB: 100 });
      await seedTournament({
        tournamentId,
        pointType: 'pointB',
        prizeReferenceAmount: prizeRef,
        conversion: { referenceUnits: 10, balanceUnits: 1 },
      });

      await (setRankingData as any).run({
        auth: { uid: adminId },
        data: {
          tournamentId,
          grantIdempotencyKey: grantKey,
          rankingData: { '1stPlayerUid': userId, '1stPlayerName': 'R' },
        },
      });

      const disabledCfg = a7ConfigAllCurrencyRewards();
      (disabledCfg.pointSettings as any).pointB.enabled = false;
      (disabledCfg.tournament as any).rankingRewardPointTypes = ['pointA'];
      await db.collection('storeMeta').doc('config').set(disabledCfg, { merge: true });
      __setMockConfig(disabledCfg);

      const beforeMainView = {
        pointType: 'pointB',
        prizeReceiverCount: 1,
        '1stPrize': prizeRef,
        prizeConversion: { referenceUnits: 10, balanceUnits: 1 },
      };

      await undoSetRankingData({
        tournamentId,
        grantIdempotencyKey: grantKey,
        beforeMainView,
        rankingEntries: [
          {
            playerUid: userId,
            awardedBalanceAmount: awarded,
            prizeReferenceAmount: prizeRef,
            entryId: 'e1',
            pointType: 'pointB',
          },
        ],
      });

      const userAfter = await db.collection('users').doc(userId).get();
      expect(userAfter.data()!.pointB).toBe(100);

      const reversalLog = await db
        .collection('users')
        .doc(userId)
        .collection('pointLogs')
        .doc(rewardReversalPointLogId(grantKey, 'pointB'))
        .get();
      expect(reversalLog.data()!.changeAmount).toBe(-100);

      // 二重取消
      await undoSetRankingData({
        tournamentId,
        grantIdempotencyKey: grantKey,
        beforeMainView,
        rankingEntries: [
          {
            playerUid: userId,
            awardedBalanceAmount: awarded,
            entryId: 'e1',
            pointType: 'pointB',
          },
        ],
      });
      expect((await db.collection('users').doc(userId).get()).data()!.pointB).toBe(100);
    });

    it('idempotency conflict: 既存ログと内容不一致', async () => {
      const tournamentId = 't_conflict';
      const userId = 'u_conflict';
      const adminId = 'admin_conflict';
      const grantKey = `${tournamentId}:cf`;
      const prize = 100;
      await createAdminDevice(adminId);
      await createUser(userId, { pointA: 0 });
      await seedTournament({
        tournamentId,
        pointType: 'pointA',
        prizeReferenceAmount: prize,
      });

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
