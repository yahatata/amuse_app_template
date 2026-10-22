/**
 * A-6 Emulator 統合（実 Firestore transaction / subcollection）
 *
 * 前提: Firestore Emulator が localhost:8081 で起動していること
 *   firebase emulators:start --only firestore
 *
 * 未起動時はスキップ（fetch failed / ECONNREFUSED）。
 */

import {initializeTestEnvironment} from "@firebase/rules-unit-testing";
import * as admin from "firebase-admin";
import {getFirestore, Timestamp} from "firebase-admin/firestore";

const PROJECT_ID = "test-a6-emulator-integration";
const ADMIN_UID = "a6-admin-uid";
const DEVICE_ID = "a6-admin-device";

describe("A-6 Emulator integration (setInitial + migrate)", () => {
  let testEnv: Awaited<ReturnType<typeof initializeTestEnvironment>> | null = null;
  let db: FirebaseFirestore.Firestore;
  let setInitialUserBalances: any;
  let migrateStoreManagedUserToLine: any;
  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || "localhost:8081";

    try {
      testEnv = await initializeTestEnvironment({projectId: PROJECT_ID});
    } catch (e) {
      emulatorAvailable = false;
      console.warn(
        "Firestore Emulator 初期化失敗。起動: firebase emulators:start --only firestore",
        e,
      );
      return;
    }

    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({projectId: PROJECT_ID});
    db = getFirestore();

    const balancesMod = await import(
      "../../src/domains/user/callables/setInitialUserBalances"
    );
    const migrateMod = await import(
      "../../src/domains/user/callables/migrateStoreManagedUserToLine"
    );
    setInitialUserBalances = balancesMod.setInitialUserBalances;
    migrateStoreManagedUserToLine = migrateMod.migrateStoreManagedUserToLine;
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
  });

  async function clearAndSeed(seedFn: () => Promise<void>) {
    if (!emulatorAvailable || !testEnv) return;
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED")) {
        emulatorAvailable = false;
        console.warn(
          "Firestore Emulator 未起動のためスキップします。起動: firebase emulators:start --only firestore",
        );
        return;
      }
      throw e;
    }
    await seedFn();
  }

  async function seedAdminDevice() {
    await db.collection("devices").doc(DEVICE_ID).set({
      uid: ADMIN_UID,
      role: "admin",
      status: "active",
      name: "A6 Admin Device",
    });
  }

  function callSet(data: Record<string, unknown>) {
    return (setInitialUserBalances as any).run({
      auth: {uid: ADMIN_UID, token: {} as never},
      data,
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
  }

  function callMigrate(data: Record<string, unknown>) {
    return (migrateStoreManagedUserToLine as any).run({
      auth: {uid: ADMIN_UID, token: {} as never},
      data,
      rawRequest: {} as never,
      acceptsStreaming: false,
    });
  }

  it("初期残高: LINE ユーザーへ上書きし initial_import ログのみを残す", async () => {
    const uid = "line-init-001";
    await clearAndSeed(async () => {
      await seedAdminDevice();
      await db.collection("users").doc(uid).set({
        uid,
        userType: "line",
        pokerName: "LineInit",
        pointA: 10,
        pointB: 20,
        sideGameChip: 30,
      });
    });
    if (!emulatorAvailable) return;

    const result = await callSet({
      targetUserId: uid,
      balances: {pointA: 100, pointB: 200, sideGameChip: 300},
      confirmOverwrite: true,
      note: "導入時",
      clientNonce: "nonce-init-line-1",
    });

    expect(result.success).toBe(true);
    expect(result.balances).toEqual({pointA: 100, pointB: 200, sideGameChip: 300});

    const user = (await db.collection("users").doc(uid).get()).data()!;
    expect(user.pointA).toBe(100);
    expect(user.pointB).toBe(200);
    expect(user.sideGameChip).toBe(300);
    expect(user.initialBalanceSetAt).toBeInstanceOf(Timestamp);

    const logs = await db
      .collection("users")
      .doc(uid)
      .collection("balanceMigrationLogs")
      .get();
    expect(logs.size).toBe(1);
    const log = logs.docs[0].data();
    expect(log.migrationType).toBe("initial_import");
    expect(log.balances).toEqual({pointA: 100, pointB: 200, sideGameChip: 300});
    expect(log.note).toBe("導入時");
    expect(log).not.toHaveProperty("sourceUserId");
    expect(log).not.toHaveProperty("createdByUid");
    expect(log).not.toHaveProperty("actorDeviceId");
    expect(log).not.toHaveProperty("executedBy");

    const pointALogs = await db
      .collection("users")
      .doc(uid)
      .collection("pointALogs")
      .get();
    expect(pointALogs.empty).toBe(true);
  });

  it("初期残高: 再設定で上書きしログが増える", async () => {
    const uid = "store-init-001";
    await clearAndSeed(async () => {
      await seedAdminDevice();
      await db.collection("users").doc(uid).set({
        uid,
        userType: "store_managed",
        isMigrated: false,
        pokerName: "StoreInit",
        pointA: 5,
        pointB: 5,
        sideGameChip: 5,
        initialBalanceSetAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00Z")),
      });
    });
    if (!emulatorAvailable) return;

    await callSet({
      targetUserId: uid,
      balances: {pointA: 50, pointB: 60, sideGameChip: 70},
      confirmOverwrite: true,
      clientNonce: "nonce-reset-1",
    });
    const after1 = (await db.collection("users").doc(uid).get()).data()!;
    const firstSetAt = after1.initialBalanceSetAt;

    await callSet({
      targetUserId: uid,
      balances: {pointA: 500, pointB: 600, sideGameChip: 700},
      confirmOverwrite: true,
      clientNonce: "nonce-reset-2",
    });

    const after2 = (await db.collection("users").doc(uid).get()).data()!;
    expect(after2.pointA).toBe(500);
    expect(after2.initialBalanceSetAt.toMillis()).toBeGreaterThan(
      firstSetAt.toMillis(),
    );

    const logs = await db
      .collection("users")
      .doc(uid)
      .collection("balanceMigrationLogs")
      .get();
    expect(logs.size).toBe(2);
  });

  it("初期残高: 同 clientNonce + 同 payload は冪等（ログ二重作成なし）", async () => {
    const uid = "line-idem-001";
    await clearAndSeed(async () => {
      await seedAdminDevice();
      await db.collection("users").doc(uid).set({
        uid,
        userType: "line",
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });
    });
    if (!emulatorAvailable) return;

    const payload = {
      targetUserId: uid,
      balances: {pointA: 11, pointB: 22, sideGameChip: 33},
      confirmOverwrite: true,
      clientNonce: "nonce-same-1",
    };
    const first = await callSet(payload);
    const second = await callSet(payload);
    expect(second.reused).toBe(true);
    expect(second.migrationId).toBe(first.migrationId);

    const logs = await db
      .collection("users")
      .doc(uid)
      .collection("balanceMigrationLogs")
      .get();
    expect(logs.size).toBe(1);
  });

  it("初期残高: 同 clientNonce + 異 payload は IDEMPOTENCY_CONFLICT", async () => {
    const uid = "line-idem-002";
    await clearAndSeed(async () => {
      await seedAdminDevice();
      await db.collection("users").doc(uid).set({
        uid,
        userType: "line",
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });
    });
    if (!emulatorAvailable) return;

    await callSet({
      targetUserId: uid,
      balances: {pointA: 1, pointB: 2, sideGameChip: 3},
      confirmOverwrite: true,
      clientNonce: "nonce-conflict-1",
    });

    await expect(
      callSet({
        targetUserId: uid,
        balances: {pointA: 9, pointB: 9, sideGameChip: 9},
        confirmOverwrite: true,
        clientNonce: "nonce-conflict-1",
      }),
    ).rejects.toMatchObject({
      details: {errorKey: "IDEMPOTENCY_CONFLICT"},
    });
  });

  it("後日LINE化: 非ゼロ移行先を上書きし証跡と移行フラグを残す", async () => {
    const sourceId = "store-mig-001";
    const targetId = "line-mig-001";
    await clearAndSeed(async () => {
      await seedAdminDevice();
      await db.collection("users").doc(sourceId).set({
        uid: sourceId,
        userType: "store_managed",
        isMigrated: false,
        pokerName: "OldStore",
        pointA: 111,
        pointB: 222,
        sideGameChip: 333,
      });
      await db.collection("users").doc(targetId).set({
        uid: targetId,
        userType: "line",
        pokerName: "NewLine",
        pointA: 7,
        pointB: 8,
        sideGameChip: 9,
        initialBalanceSetAt: Timestamp.fromDate(new Date("2026-03-01T00:00:00Z")),
      });
    });
    if (!emulatorAvailable) return;

    const targetBefore = (await db.collection("users").doc(targetId).get()).data()!;
    const initialAt = targetBefore.initialBalanceSetAt;

    const result = await callMigrate({
      sourceUserId: sourceId,
      targetUserId: targetId,
      confirmSamePerson: true,
      confirmOverwrite: true,
      note: "同一人物",
      clientNonce: "nonce-mig-1",
    });

    expect(result.success).toBe(true);
    expect(result.balances).toEqual({pointA: 111, pointB: 222, sideGameChip: 333});

    const source = (await db.collection("users").doc(sourceId).get()).data()!;
    expect(source.isMigrated).toBe(true);
    expect(source.migratedToUserId).toBe(targetId);
    expect(source.migratedAt).toBeInstanceOf(Timestamp);
    expect(source.pointA).toBe(111);

    const target = (await db.collection("users").doc(targetId).get()).data()!;
    expect(target.pointA).toBe(111);
    expect(target.pointB).toBe(222);
    expect(target.sideGameChip).toBe(333);
    expect(target).not.toHaveProperty("migratedFromUserId");
    expect(target.initialBalanceSetAt.toMillis()).toBe(initialAt.toMillis());

    const logs = await db
      .collection("users")
      .doc(targetId)
      .collection("balanceMigrationLogs")
      .get();
    expect(logs.size).toBe(1);
    const log = logs.docs[0].data();
    expect(log.migrationType).toBe("store_managed_to_line");
    expect(log.sourceUserId).toBe(sourceId);
    expect(log.balances).toEqual({pointA: 111, pointB: 222, sideGameChip: 333});
    expect(log.note).toBe("同一人物");
    expect(log).not.toHaveProperty("createdByUid");
    expect(log).not.toHaveProperty("actorDeviceId");
    expect(log).not.toHaveProperty("migratedFromUserId");
  });

  it("後日LINE化: 同一 source→target 再送は reused でログを増やさない", async () => {
    const sourceId = "store-mig-002";
    const targetId = "line-mig-002";
    await clearAndSeed(async () => {
      await seedAdminDevice();
      await db.collection("users").doc(sourceId).set({
        uid: sourceId,
        userType: "store_managed",
        isMigrated: false,
        pointA: 10,
        pointB: 20,
        sideGameChip: 30,
      });
      await db.collection("users").doc(targetId).set({
        uid: targetId,
        userType: "line",
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });
    });
    if (!emulatorAvailable) return;

    await callMigrate({
      sourceUserId: sourceId,
      targetUserId: targetId,
      confirmSamePerson: true,
      confirmOverwrite: true,
    });
    const afterFirst = (await db.collection("users").doc(targetId).get()).data()!;

    const reused = await callMigrate({
      sourceUserId: sourceId,
      targetUserId: targetId,
      confirmSamePerson: true,
      confirmOverwrite: true,
    });
    expect(reused.reused).toBe(true);

    const afterSecond = (await db.collection("users").doc(targetId).get()).data()!;
    expect(afterSecond.pointA).toBe(afterFirst.pointA);

    const logs = await db
      .collection("users")
      .doc(targetId)
      .collection("balanceMigrationLogs")
      .get();
    expect(logs.size).toBe(1);
  });

  it("後日LINE化: 別 target 再送は USER_ALREADY_MIGRATED", async () => {
    const sourceId = "store-mig-003";
    const targetId = "line-mig-003a";
    const otherId = "line-mig-003b";
    await clearAndSeed(async () => {
      await seedAdminDevice();
      await db.collection("users").doc(sourceId).set({
        uid: sourceId,
        userType: "store_managed",
        isMigrated: false,
        pointA: 1,
        pointB: 1,
        sideGameChip: 1,
      });
      await db.collection("users").doc(targetId).set({
        uid: targetId,
        userType: "line",
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });
      await db.collection("users").doc(otherId).set({
        uid: otherId,
        userType: "line",
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });
    });
    if (!emulatorAvailable) return;

    await callMigrate({
      sourceUserId: sourceId,
      targetUserId: targetId,
      confirmSamePerson: true,
      confirmOverwrite: true,
    });

    await expect(
      callMigrate({
        sourceUserId: sourceId,
        targetUserId: otherId,
        confirmSamePerson: true,
        confirmOverwrite: true,
      }),
    ).rejects.toMatchObject({
      details: {errorKey: "USER_ALREADY_MIGRATED"},
    });
  });

  it("後日LINE化: activeStay がある場合 USER_HAS_ACTIVE_STAY", async () => {
    const sourceId = "store-busy-001";
    const targetId = "line-busy-001";
    await clearAndSeed(async () => {
      await seedAdminDevice();
      await db.collection("users").doc(sourceId).set({
        uid: sourceId,
        userType: "store_managed",
        isMigrated: false,
        pointA: 1,
        pointB: 1,
        sideGameChip: 1,
      });
      await db.collection("users").doc(targetId).set({
        uid: targetId,
        userType: "line",
        pointA: 0,
        pointB: 0,
        sideGameChip: 0,
      });
      await db.collection("activeStays").doc(sourceId).set({
        isActive: true,
        userId: sourceId,
      });
    });
    if (!emulatorAvailable) return;

    await expect(
      callMigrate({
        sourceUserId: sourceId,
        targetUserId: targetId,
        confirmSamePerson: true,
        confirmOverwrite: true,
      }),
    ).rejects.toMatchObject({
      details: {errorKey: "USER_HAS_ACTIVE_STAY"},
    });
  });
});
