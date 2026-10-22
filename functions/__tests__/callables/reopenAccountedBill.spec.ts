/**
 * reopenAccountedBill callable の Emulator 統合テスト。
 *
 * Step05 changeSpec §5 / 04_確認観点と確認方法.md §2.3 に対応。
 *
 * 観点:
 * 1. happy path（settled bill を reopen）
 * 2. happy path（post_settlement_pending bill を reopen / effective adjustments が cancelled_by_reopen）
 * 3. 完了済 adjustment / cashAction が touch されない不変則
 * 4. 親 doc reset と reopenSummary 更新（latestSettledCycle 据え置き）
 * 5. 旧 cycle が `cycleState='reopened'` / `closedReason='reopen'`
 * 6. 旧 cycle baselineSnapshot が変更されない不変則
 * 7. 新 cycle が `cycleState='open'` / `openedReason='reopen'` / baselineSnapshot なしで生成
 * 8. status precondition（settled / post_settlement_pending 以外）
 * 9. 当日営業日 precondition（businessDate 不一致を弾く）
 * 10. latestSettledCycle = 0 を弾く
 * 11. idempotent replay（同 requestHash）/ requestHash mismatch
 * 12. permission denied
 * 13. resettle 後の cycle と latestSettledCycle 整合性は別 spec（trigger 系）にて end-to-end 確認
 *
 * 旧経路（postEventReopen / billsEventsOnCreate）はこのテストでは触らない。
 */

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

import { reopenAccountedBill } from "../../src/domains/bills/callables/reopenAccountedBill";
import { createPostSettlementAdjustment } from "../../src/domains/bills/callables/createPostSettlementAdjustment";
import {
  buildDraftAccountingInput,
  buildInitialCurrentSummary,
  buildInitialOps,
  buildInitialPostSettlementState,
  buildInitialReopenSummary,
} from "../../src/domains/bills/services/parentSummary";
import { buildInitialCycleDoc } from "../../src/domains/bills/services/settlementCycles";

const TEST_BUSINESS_DATE = "2026-05-09";

describe("reopenAccountedBill (Emulator)", () => {
  let testEnv: RulesTestEnvironment;
  let db: admin.firestore.Firestore;
  const projectId = "test-reopen-bill";

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = "localhost:8081";
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
    await setUpStoreMetaRunning(TEST_BUSINESS_DATE);
  });

  async function setUpStoreMetaRunning(businessDateKey: string) {
    await db.collection("storeMeta").doc("currentBusinessDay").set({
      status: "running",
      currentBusinessDateKey: businessDateKey,
      lastClosedBusinessDateKey: null,
    });
  }

  async function createAdminDevice(
    uid: string,
    options?: {
      status?: "active" | "inactive" | "pending";
      role?: "admin" | "terminal";
      accountingOption?: boolean;
    },
  ) {
    await db.collection("devices").add({
      uid,
      role: options?.role ?? "admin",
      status: options?.status ?? "active",
      name: "Test Device",
      options: options?.accountingOption ? { accounting: true } : {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async function createSettledBill(
    billId: string,
    params?: {
      businessDate?: string;
      status?:
        | "settled"
        | "post_settlement_pending"
        | "open"
        | "voided"
        | "in_progress";
      latestSettledCycle?: number;
      currentSettlementCycle?: number;
      cycleState?: "settled" | "open" | "reopened";
    },
  ) {
    const businessDate = params?.businessDate ?? TEST_BUSINESS_DATE;
    const status = params?.status ?? "settled";
    const latestSettledCycle = params?.latestSettledCycle ?? 1;
    const currentSettlementCycle = params?.currentSettlementCycle ?? 1;
    const cycleState = params?.cycleState ?? "settled";

    const initialCurrentSummary = {
      ...buildInitialCurrentSummary(),
      claimTotalIncl: 5000,
      receivedTotalIncl: 5000,
      netSalesIncl: 5000,
    };
    const initialReopenSummary = {
      ...buildInitialReopenSummary(),
      currentSettlementCycle,
      latestSettledCycle,
    };

    await db
      .collection("bills")
      .doc(billId)
      .set({
        businessDate,
        status,
        party: { userId: "user-A", pokerName: "taro" },
        amounts: { grandTotalRounded: 5000 },
        currentSummary: initialCurrentSummary,
        ops: {
          accountingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
          accountingStartedBy: "admin-seed",
          accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
          accountingCompletedBy: "admin-seed",
          accountingCanceledAt: null,
          accountingCanceledBy: null,
        },
        draftAccountingInput: buildDraftAccountingInput({
          paymentMethodsByAmount: { cash: 5000 },
        }),
        postSettlementState: buildInitialPostSettlementState(),
        reopenSummary: initialReopenSummary,
        meta: { schemaVersion: "1.3", contentHash: "hash-cycle-1" },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    await db
      .collection("bills")
      .doc(billId)
      .collection("settlementCycles")
      .doc(String(currentSettlementCycle))
      .set({
        ...buildInitialCycleDoc({
          cycleNo: currentSettlementCycle,
          openedAt: admin.firestore.FieldValue.serverTimestamp(),
          openedBy: null,
          openedReason: "initial",
          openedFromCycleNo: null,
        }),
        cycleState,
        settledAt:
          cycleState === "settled"
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
        closedAt:
          cycleState === "settled"
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
        closedReason: cycleState === "settled" ? "settle" : null,
        baselineSummary:
          cycleState === "settled" ? { contentHash: "hash-cycle-1" } : null,
      });

    // baselineSnapshot doc を簡易セット
    if (cycleState === "settled") {
      await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc(String(currentSettlementCycle))
        .collection("baselineSnapshot")
        .doc("snapshot")
        .set({
          contentHash: "hash-cycle-1",
          items: [],
          extras: [],
          tournaments: [],
          sideGameChips: [],
        });
    }
  }

  function callableRequest(adminId: string, data: any) {
    return { auth: { uid: adminId }, data };
  }

  async function createRefundPendingAdjustment(
    billId: string,
    adminId: string,
    amountIncl: number,
    nonce: string,
  ): Promise<string> {
    const result: any = await (createPostSettlementAdjustment as any).run(
      callableRequest(adminId, {
        billId,
        clientNonce: nonce,
        adjustmentType: "decrease_refund_pending",
        adjustmentAmountIncl: amountIncl,
        lines: [
          {
            targetCategory: "item",
            targetName: "item-x",
            operationType: "sale",
            qtyDelta: -1,
            amountInclDelta: -amountIncl,
          },
        ],
      }),
    );
    return result.adjustmentId;
  }

  describe("happy path", () => {
    it("settled bill を reopen して open 状態に戻す（最小ケース）", async () => {
      const billId = "bill-h1";
      const adminId = "admin-h1";
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const result: any = await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "h1-reopen-1",
          reason: "test",
        }),
      );

      expect(result.success).toBe(true);
      expect(result.reopenDestination).toBe("unsettled_list");
      expect(result.oldCycleNo).toBe(1);
      expect(result.newCycleNo).toBe(2);
      expect(result.cancelledAdjustmentIds).toEqual([]);

      // 親 doc が open + reopenSummary 更新
      const billDoc = await db.collection("bills").doc(billId).get();
      const billData = billDoc.data()!;
      expect(billData.status).toBe("open");
      expect(billData.currentSummary).toEqual(buildInitialCurrentSummary());
      expect(billData.ops).toEqual(buildInitialOps());
      expect(billData.draftAccountingInput).toEqual(buildDraftAccountingInput());
      expect(billData.meta.contentHash).toBeNull();
      expect(billData.postSettlementState).toEqual(
        buildInitialPostSettlementState(),
      );
      expect(billData.closeSummary?.unresolved).not.toBe(true);
      expect(billData.closeSnapshot?.unresolved).not.toBe(true);
      expect(billData.reopenSummary.hasReopenHistory).toBe(true);
      expect(billData.reopenSummary.reopenCount).toBe(1);
      expect(billData.reopenSummary.currentSettlementCycle).toBe(2);
      expect(billData.reopenSummary.latestSettledCycle).toBe(1); // 据え置き
      expect(billData.reopenSummary.lastReopenedBy).toBe(adminId);

      // 旧 cycle 1 が reopened
      const oldCycle = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("1")
        .get();
      expect(oldCycle.data()?.cycleState).toBe("reopened");
      expect(oldCycle.data()?.closedReason).toBe("reopen");
      expect(oldCycle.data()?.closedAt).toBeDefined();
      // baselineSummary は不変
      expect(oldCycle.data()?.baselineSummary).toEqual({
        contentHash: "hash-cycle-1",
      });

      // 新 cycle 2 が open + openedReason=reopen + openedFromCycleNo=1
      const newCycle = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("2")
        .get();
      expect(newCycle.exists).toBe(true);
      expect(newCycle.data()?.cycleState).toBe("open");
      expect(newCycle.data()?.openedReason).toBe("reopen");
      expect(newCycle.data()?.openedFromCycleNo).toBe(1);
      expect(newCycle.data()?.nextSequenceNo).toBe(1);
      expect(newCycle.data()?.baselineSummary).toBeNull();

      // 新 cycle に baselineSnapshot は存在しない
      const newBaseline = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("2")
        .collection("baselineSnapshot")
        .doc("snapshot")
        .get();
      expect(newBaseline.exists).toBe(false);

      // 旧 cycle baselineSnapshot は不変
      const oldBaseline = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("1")
        .collection("baselineSnapshot")
        .doc("snapshot")
        .get();
      expect(oldBaseline.exists).toBe(true);
      expect(oldBaseline.data()?.contentHash).toBe("hash-cycle-1");

      // activeStays/{uid} が復帰している
      const activeStay = await db.collection("activeStays").doc("user-A").get();
      expect(activeStay.exists).toBe(true);
      expect(activeStay.data()?.billId).toBe(billId);
      expect(activeStay.data()?.uid).toBe("user-A");
      expect(activeStay.data()?.pokerName).toBe("taro");
      expect(activeStay.data()?.isActive).toBe(true);
      expect(activeStay.data()?.startedAt).toBeDefined();
    });

    it("post_settlement_pending bill を reopen → effective adjustment が cancelled_by_reopen", async () => {
      const billId = "bill-h2";
      const adminId = "admin-h2";
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      const adjId = await createRefundPendingAdjustment(
        billId,
        adminId,
        1000,
        "h2-adj",
      );

      // bill は post_settlement_pending になっているはず
      const beforeReopen = await db.collection("bills").doc(billId).get();
      expect(beforeReopen.data()?.status).toBe("post_settlement_pending");

      const result: any = await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "h2-reopen-1",
        }),
      );

      expect(result.success).toBe(true);
      expect(result.reopenDestination).toBe("unsettled_list");
      expect(result.cancelledAdjustmentIds).toEqual([adjId]);

      // adjustment が cancelled_by_reopen
      const adjDoc = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("1")
        .collection("adjustments")
        .doc(adjId)
        .get();
      expect(adjDoc.data()?.adjustmentState).toBe("cancelled_by_reopen");
      expect(adjDoc.data()?.cancelReason).toBe("reopen");
      expect(adjDoc.data()?.cancelledBy).toBe(adminId);
      expect(adjDoc.data()?.cancelledAt).toBeDefined();
      // requiredActionRemainingIncl は維持
      expect(adjDoc.data()?.requiredActionRemainingIncl).toBe(1000);

      // 親 doc が open
      const billData = (await db.collection("bills").doc(billId).get()).data()!;
      expect(billData.status).toBe("open");
      expect(billData.postSettlementState.requiredActionType).toBe("none");
      expect(billData.postSettlementState.requiredActionIncl).toBe(0);
    });

    it("持ち越し未会計由来の bill を reopen すると unresolved を復元する", async () => {
      const billId = "bill-h2b";
      const adminId = "admin-h2b";
      const userId = "user-h2b-carryover";
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      await db.collection("bills").doc(billId).set(
        {
          party: { userId, pokerName: "carryover-taro" },
          closeSummary: {
            unresolved: false,
            markedAt: admin.firestore.FieldValue.serverTimestamp(),
            closedBusinessDate: "2026-05-08",
            displayAmountAtMark: 4200,
            lastCloseRunId: "close-run-1",
          },
          closeSnapshot: {
            unresolved: false,
          },
        },
        { merge: true },
      );
      await db.collection("users").doc(userId).set({
        unsettledBillsCount: 0,
      });

      const result: any = await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "h2b-reopen-1",
        }),
      );
      expect(result.reopenDestination).toBe("special_attention");

      const billData = (await db.collection("bills").doc(billId).get()).data()!;
      expect(billData.status).toBe("open");
      expect(billData.closeSummary?.unresolved).toBe(true);
      expect(billData.closeSnapshot?.unresolved).toBe(true);

      const userData = (await db.collection("users").doc(userId).get()).data()!;
      expect(userData.unsettledBillsCount).toBe(1);

      // C1-B: activeStay は復帰しない
      const stay = await db.collection("activeStays").doc(userId).get();
      expect(stay.exists).toBe(false);

      // 同 idempotencyKey の再送は reused となり、副作用（count加算）が再実行されないこと
      await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "h2b-reopen-1",
        }),
      );
      const userDataAfterReplay = (
        await db.collection("users").doc(userId).get()
      ).data()!;
      expect(userDataAfterReplay.unsettledBillsCount).toBe(1);
    });

    it("C1-B: 営業日またぎでも reopen でき、current activeStay を壊さない", async () => {
      const billId = "bill-c1b-crossday";
      const adminId = "admin-c1b-crossday";
      const userId = "user-c1b-cross";
      const currentBillId = "bill-current-visit";
      await createAdminDevice(adminId);
      await createSettledBill(billId, { businessDate: "2026-05-08" });
      await db.collection("bills").doc(billId).set(
        {
          party: { userId, pokerName: "carryover-user" },
          closeSummary: {
            unresolved: false,
            markedAt: admin.firestore.FieldValue.serverTimestamp(),
            closedBusinessDate: "2026-05-08",
            displayAmountAtMark: 3000,
            lastCloseRunId: "close-run-c1b",
          },
          closeSnapshot: { unresolved: false },
        },
        { merge: true },
      );
      await db.collection("users").doc(userId).set({ unsettledBillsCount: 0 });
      // 現在来店中（別 bill）
      await db.collection("activeStays").doc(userId).set({
        uid: userId,
        billId: currentBillId,
        pokerName: "carryover-user",
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // current businessDate は TEST_BUSINESS_DATE (2026-05-09)
      const result: any = await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "c1b-crossday-1",
        }),
      );
      expect(result.success).toBe(true);
      expect(result.reopenDestination).toBe("special_attention");

      const billData = (await db.collection("bills").doc(billId).get()).data()!;
      expect(billData.status).toBe("open");
      expect(billData.businessDate).toBe("2026-05-08");
      expect(billData.closeSummary?.unresolved).toBe(true);

      const stay = (await db.collection("activeStays").doc(userId).get()).data()!;
      expect(stay.billId).toBe(currentBillId);
      expect(stay.isActive).toBe(true);

      const userData = (await db.collection("users").doc(userId).get()).data()!;
      expect(userData.unsettledBillsCount).toBe(1);
    });

    it("完了済 adjustment は touch されない（completed_by_cash_action のまま）", async () => {
      const billId = "bill-h3";
      const adminId = "admin-h3";
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      // completed_by_cash_action 直接書き
      const adjId = "adj-completed";
      await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("1")
        .collection("adjustments")
        .doc(adjId)
        .set({
          adjustmentState: "completed_by_cash_action",
          adjustmentDirection: "decrease",
          adjustmentAmountIncl: 1000,
          requiredActionRemainingIncl: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "h3-reopen-1",
        }),
      );

      // completed_by_cash_action は変更されない
      const adjDoc = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("1")
        .collection("adjustments")
        .doc(adjId)
        .get();
      expect(adjDoc.data()?.adjustmentState).toBe("completed_by_cash_action");
      expect(adjDoc.data()?.cancelReason).toBeUndefined();
    });
  });

  describe("businessDate precondition", () => {
    it("当日と異なる businessDate の bill は failed-precondition", async () => {
      const billId = "bill-bd1";
      const adminId = "admin-bd1";
      await createAdminDevice(adminId);
      await createSettledBill(billId, { businessDate: "2026-05-08" }); // 前日

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: "bd1-reopen-1",
          }),
        ),
      ).rejects.toMatchObject({ code: "failed-precondition" });

      // bill 状態は不変
      const billData = (await db.collection("bills").doc(billId).get()).data()!;
      expect(billData.status).toBe("settled");
      // 新 cycle 2 は作成されない
      const newCycle = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("2")
        .get();
      expect(newCycle.exists).toBe(false);
    });

    // storeMeta state error (status !== 'running' / doc missing) はこの spec では扱わない。
    // 該当 path は storeMeta module の unit tests (getCurrentBusinessDateKeyOrThrow.spec.ts) でカバー済み。
    // reopen の practical な businessDate 不一致は前述の `当日と異なる businessDate` test で担保。
  });

  describe("status precondition", () => {
    it("open 状態の bill を reopen しようとすると failed-precondition", async () => {
      const billId = "bill-st1";
      const adminId = "admin-st1";
      await createAdminDevice(adminId);
      await createSettledBill(billId, { status: "open", cycleState: "open" });

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: "st1-reopen-1",
          }),
        ),
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });

    it("voided 状態の bill を reopen しようとすると failed-precondition", async () => {
      const billId = "bill-st2";
      const adminId = "admin-st2";
      await createAdminDevice(adminId);
      await createSettledBill(billId, { status: "voided" });

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: "st2-reopen-1",
          }),
        ),
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });
  });

  describe("latestSettledCycle precondition", () => {
    it("latestSettledCycle = 0 の bill は reopen 不可", async () => {
      const billId = "bill-ls1";
      const adminId = "admin-ls1";
      await createAdminDevice(adminId);
      await createSettledBill(billId, { latestSettledCycle: 0 });

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: "ls1-reopen-1",
          }),
        ),
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });
  });

  describe("idempotent replay", () => {
    it("同 idempotencyKey + 同 requestHash で再送 → reused: true、副作用なし", async () => {
      const billId = "bill-ir1";
      const adminId = "admin-ir1";
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      const r1: any = await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "ir1-reopen-1",
          reason: "first",
        }),
      );
      expect(r1.success).toBe(true);
      expect(r1.diagnostics?.reused).toBeFalsy();

      const r2: any = await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "ir1-reopen-1",
          reason: "first",
        }),
      );
      expect(r2.success).toBe(true);
      expect(r2.diagnostics?.reused).toBe(true);
      expect(r2.oldCycleNo).toBe(r1.oldCycleNo);
      expect(r2.newCycleNo).toBe(r1.newCycleNo);

      // currentSettlementCycle は再送でも 2 のまま（cycle 3 は作られない）
      const billData = (await db.collection("bills").doc(billId).get()).data()!;
      expect(billData.reopenSummary.currentSettlementCycle).toBe(2);
      expect(billData.reopenSummary.reopenCount).toBe(1);
      const cycle3 = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("3")
        .get();
      expect(cycle3.exists).toBe(false);
    });

    it("同 idempotencyKey で異 requestHash → failed-precondition", async () => {
      const billId = "bill-ir2";
      const adminId = "admin-ir2";
      await createAdminDevice(adminId);
      await createSettledBill(billId);

      await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "ir2-reopen-1",
          reason: "first",
        }),
      );

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: "ir2-reopen-1",
            reason: "second-different", // requestHash 変わる
          }),
        ),
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });
  });

  describe("permission", () => {
    it("auth なしで unauthenticated", async () => {
      const billId = "bill-pm1";
      await createSettledBill(billId);

      await expect(
        (reopenAccountedBill as any).run({
          auth: null,
          data: { billId, idempotencyKey: "pm1" },
        }),
      ).rejects.toMatchObject({ code: "unauthenticated" });
    });

    it("device 不在で permission-denied", async () => {
      const billId = "bill-pm2";
      const adminId = "admin-pm2-no-device";
      await createSettledBill(billId);

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: "pm2-reopen-1",
          }),
        ),
      ).rejects.toMatchObject({ code: "permission-denied" });
    });

    it("terminal device で会計権限なしの場合 permission-denied", async () => {
      const billId = "bill-pm3";
      const adminId = "admin-pm3-terminal";
      await createAdminDevice(adminId, {
        role: "terminal",
        accountingOption: false,
      });
      await createSettledBill(billId);

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: "pm3-reopen-1",
          }),
        ),
      ).rejects.toMatchObject({ code: "permission-denied" });
    });
  });

  describe("not-found / cycle state", () => {
    it("bill 不在 → failed-precondition", async () => {
      const adminId = "admin-nf1";
      await createAdminDevice(adminId);

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId: "bill-does-not-exist",
            idempotencyKey: "nf1-reopen-1",
          }),
        ),
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });
  });

  describe("C1-C okibake_remote_payment void reopen", () => {
    async function seedOkibakeRemoteSettledBill(params: {
      billId: string;
      tournamentId: string;
      entryId: string;
      userId: string;
      pendingReviewAt?: boolean;
    }) {
      const { billId, tournamentId, entryId, userId } = params;
      await db.collection("scheduledTournaments").doc(tournamentId).set({
        templateId: "template-c1c",
        businessDate: TEST_BUSINESS_DATE,
        status: "ended",
        snapshot: { name: "C1C TN", entryFee: 1000, addonFee: 0 },
      });
      await db
        .collection("scheduledTournaments")
        .doc(tournamentId)
        .collection("okibakeTemporaryEntries")
        .doc(entryId)
        .set({
          okibakeEntryId: entryId,
          tournamentId,
          entryStatus: "busted",
          billLinkStatus: "linked",
          linkedBillId: billId,
          linkedAt: admin.firestore.FieldValue.serverTimestamp(),
          linkedUserId: userId,
          linkedUserPokerName: "c1c-user",
          pendingReviewAt: params.pendingReviewAt === false
            ? null
            : admin.firestore.FieldValue.serverTimestamp(),
          pendingReviewReason: "tournament_finished_unlinked",
          okibakeAddonCount: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      await createSettledBill(billId);
      await db.collection("bills").doc(billId).set(
        {
          billType: "okibake_remote_payment",
          sourceOkibakeEntryId: entryId,
          sourceTournamentId: tournamentId,
          party: { userId, pokerName: "c1c-user" },
          remotePayment: {
            amountIncl: 1000,
            method: "cash",
            paidAt: null,
            memo: null,
          },
          place: { table: null, seat: null },
        },
        { merge: true },
      );
    }

    it("reopen で entry を pending_review へ戻し bill を voided にする（activeStay/新cycleなし）", async () => {
      const billId = "bill-c1c-1";
      const adminId = "admin-c1c-1";
      const tournamentId = "t-c1c-1";
      const entryId = "e-c1c-1";
      const userId = "user-c1c-1";
      await createAdminDevice(adminId);
      await seedOkibakeRemoteSettledBill({
        billId,
        tournamentId,
        entryId,
        userId,
      });

      const result = await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "c1c-reopen-1",
        }),
      );
      expect(result.success).toBe(true);
      expect(result.reopenDestination).toBe("special_attention");
      expect(result.oldCycleNo).toBe(1);
      expect(result.newCycleNo).toBe(1);

      const billData = (await db.collection("bills").doc(billId).get()).data()!;
      expect(billData.status).toBe("voided");
      expect(billData.remotePayment?.amountIncl).toBe(1000);
      expect(billData.sourceOkibakeEntryId).toBe(entryId);
      expect(billData.reopenSummary?.hasReopenHistory).toBe(true);
      expect(billData.reopenSummary?.reopenCount).toBe(1);
      expect(billData.reopenSummary?.currentSettlementCycle).toBe(1);

      const cycle2 = await db
        .collection("bills")
        .doc(billId)
        .collection("settlementCycles")
        .doc("2")
        .get();
      expect(cycle2.exists).toBe(false);

      const cycle1 = (
        await db
          .collection("bills")
          .doc(billId)
          .collection("settlementCycles")
          .doc("1")
          .get()
      ).data()!;
      expect(cycle1.cycleState).toBe("reopened");
      expect(cycle1.closedReason).toBe("reopen");

      const entry = (
        await db
          .collection("scheduledTournaments")
          .doc(tournamentId)
          .collection("okibakeTemporaryEntries")
          .doc(entryId)
          .get()
      ).data()!;
      expect(entry.billLinkStatus).toBe("pending_review");
      expect(entry.linkedBillId).toBeNull();
      expect(entry.linkedAt).toBeNull();
      expect(entry.pendingReviewReason).toBe("tournament_finished_unlinked");
      expect(entry.pendingReviewAt).toBeTruthy();
      expect(entry.linkedUserId).toBe(userId);
      expect(entry.entryStatus).toBe("busted");

      const stay = await db.collection("activeStays").doc(userId).get();
      expect(stay.exists).toBe(false);

      // RequireSpecialAttentionPage 相当: pending_review + entryStatus + linkedUserId
      expect(
        entry.billLinkStatus === "pending_review" &&
          ["registered", "seated", "busted"].includes(entry.entryStatus) &&
          typeof entry.linkedUserId === "string" &&
          entry.linkedUserId.length > 0,
      ).toBe(true);
    });

    it("同一 idempotencyKey 再送で entry/bill が再破壊されない", async () => {
      const billId = "bill-c1c-idem";
      const adminId = "admin-c1c-idem";
      const tournamentId = "t-c1c-idem";
      const entryId = "e-c1c-idem";
      const userId = "user-c1c-idem";
      await createAdminDevice(adminId);
      await seedOkibakeRemoteSettledBill({
        billId,
        tournamentId,
        entryId,
        userId,
      });

      await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "c1c-idem-1",
        }),
      );
      const replay = await (reopenAccountedBill as any).run(
        callableRequest(adminId, {
          billId,
          idempotencyKey: "c1c-idem-1",
        }),
      );
      expect(replay.diagnostics?.reused).toBe(true);

      const billData = (await db.collection("bills").doc(billId).get()).data()!;
      expect(billData.status).toBe("voided");
      expect(billData.reopenSummary?.reopenCount).toBe(1);

      const entry = (
        await db
          .collection("scheduledTournaments")
          .doc(tournamentId)
          .collection("okibakeTemporaryEntries")
          .doc(entryId)
          .get()
      ).data()!;
      expect(entry.billLinkStatus).toBe("pending_review");
      expect(entry.linkedBillId).toBeNull();
    });

    it("source 欠落の okibake_remote_payment は failed-precondition", async () => {
      const billId = "bill-c1c-nosource";
      const adminId = "admin-c1c-nosource";
      await createAdminDevice(adminId);
      await createSettledBill(billId);
      await db.collection("bills").doc(billId).set(
        {
          billType: "okibake_remote_payment",
        },
        { merge: true },
      );

      await expect(
        (reopenAccountedBill as any).run(
          callableRequest(adminId, {
            billId,
            idempotencyKey: "c1c-nosource-1",
          }),
        ),
      ).rejects.toMatchObject({ code: "failed-precondition" });
    });
  });
});
