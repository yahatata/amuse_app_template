/**
 * デバイス管理: updateDeviceStatus / archiveDevice / registerDevice（Firestore Emulator）
 */

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import * as admin from "firebase-admin";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = "test-project-device-management";

async function seedAdminDevice(
  db: admin.firestore.Firestore,
  opts: {
    deviceId: string;
    uid: string;
    status?: string;
    role?: string;
  }
) {
  await db.collection("devices").doc(opts.deviceId).set({
    name: `device-${opts.deviceId}`,
    role: opts.role ?? "admin",
    uid: opts.uid,
    installationId: `inst-${opts.deviceId}`,
    platform: "ios",
    status: opts.status ?? "active",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    options: { store_management: true },
    optionParams: { tournament_table: { tableId: "T1" } },
  });
}

describe("device management callables", () => {
  let testEnv: Awaited<ReturnType<typeof initializeTestEnvironment>>;
  let db: admin.firestore.Firestore;
  let updateDeviceStatus: typeof import("../../../src/shared/devices/callables/updateDeviceStatus").updateDeviceStatus;
  let archiveDevice: typeof import("../../../src/shared/devices/callables/archiveDevice").archiveDevice;
  let registerDevice: typeof import("../../../src/shared/devices/callables/registerDevice").registerDevice;

  let emulatorAvailable = true;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST =
      process.env.FIRESTORE_EMULATOR_HOST || "localhost:8081";
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID });
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();

    ({ updateDeviceStatus } = await import(
      "../../../src/shared/devices/callables/updateDeviceStatus"
    ));
    ({ archiveDevice } = await import(
      "../../../src/shared/devices/callables/archiveDevice"
    ));
    ({ registerDevice } = await import(
      "../../../src/shared/devices/callables/registerDevice"
    ));
  });

  afterAll(async () => {
    await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((a) => a?.delete()).filter(Boolean));
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    if (!emulatorAvailable) return;
    try {
      await testEnv.clearFirestore();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED")) {
        emulatorAvailable = false;
        console.warn("Firestore Emulator 未起動のためスキップします。");
        return;
      }
      throw e;
    }
  });

  it("updateDeviceStatus: admin は active -> blocked にできる", async () => {
    if (!emulatorAvailable) return;
    await seedAdminDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
    await seedAdminDevice(db, {
      deviceId: "target-1",
      uid: "uid-target",
      role: "terminal",
    });

    const res = await (updateDeviceStatus as { run: (req: unknown) => Promise<unknown> }).run({
      auth: { uid: "uid-admin" },
      data: { deviceId: "target-1", status: "blocked" },
    });
    expect(res).toMatchObject({ success: true, status: "blocked" });

    const snap = await db.collection("devices").doc("target-1").get();
    expect(snap.data()?.status).toBe("blocked");
  });

  it("updateDeviceStatus: 自己ブロックは拒否", async () => {
    if (!emulatorAvailable) return;
    await seedAdminDevice(db, { deviceId: "admin-1", uid: "uid-admin" });

    await expect(
      (updateDeviceStatus as { run: (req: unknown) => Promise<unknown> }).run({
        auth: { uid: "uid-admin" },
        data: { deviceId: "admin-1", status: "blocked" },
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  it("archiveDevice: admin は他端末を archived にできる", async () => {
    if (!emulatorAvailable) return;
    await seedAdminDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
    await seedAdminDevice(db, {
      deviceId: "target-1",
      uid: "uid-target",
      role: "terminal",
    });

    const res = await (archiveDevice as { run: (req: unknown) => Promise<unknown> }).run({
      auth: { uid: "uid-admin" },
      data: { deviceId: "target-1" },
    });
    expect(res).toMatchObject({ success: true, status: "archived" });

    const snap = await db.collection("devices").doc("target-1").get();
    expect(snap.exists).toBe(true);
    const data = snap.data()!;
    expect(data.status).toBe("archived");
    expect(data.archivedBy).toBe("admin-1");
    expect(data.previousUid).toBe("uid-target");
    expect(data.uid).toBeUndefined();
    expect(data.options).toEqual({});
    expect(data.optionParams).toEqual({});
    expect(data.archivedAt).toBeDefined();
  });

  it("archiveDevice: 最後の admin は拒否", async () => {
    if (!emulatorAvailable) return;
    await seedAdminDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
    await seedAdminDevice(db, {
      deviceId: "admin-2",
      uid: "uid-admin-2",
    });

    await expect(
      (archiveDevice as { run: (req: unknown) => Promise<unknown> }).run({
        auth: { uid: "uid-admin-2" },
        data: { deviceId: "admin-1" },
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  it("registerDevice: blocked 既存 doc がある場合は登録拒否", async () => {
    if (!emulatorAvailable) return;
    await db.collection("devices").doc("blocked-1").set({
      name: "blocked device",
      role: "terminal",
      uid: "uid-blocked",
      installationId: "inst-1",
      platform: "ios",
      status: "blocked",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    await expect(
      (registerDevice as { run: (req: unknown) => Promise<unknown> }).run({
        auth: { uid: "uid-blocked" },
        data: {
          name: "retry",
          role: "terminal",
          uid: "uid-blocked",
          installationId: "inst-2",
          platform: "ios",
        },
      })
    ).rejects.toMatchObject({
      code: "failed-precondition",
    });

    const snap = await db.collection("devices").doc("blocked-1").get();
    expect(snap.data()?.status).toBe("blocked");
  });

  it("registerDevice: archived のみの uid では新規 doc を作る", async () => {
    if (!emulatorAvailable) return;
    await db.collection("devices").doc("old-archived").set({
      name: "old",
      role: "terminal",
      status: "archived",
      previousUid: "uid-reuse",
      installationId: "inst-old",
      platform: "ios",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const res = (await (registerDevice as { run: (req: unknown) => Promise<unknown> }).run({
      auth: { uid: "uid-reuse" },
      data: {
        name: "new device",
        role: "terminal",
        uid: "uid-reuse",
        installationId: "inst-new",
        platform: "ios",
      },
    })) as { deviceId: string };

    expect(res.deviceId).not.toBe("old-archived");

    const oldSnap = await db.collection("devices").doc("old-archived").get();
    expect(oldSnap.data()?.status).toBe("archived");

    const newSnap = await db.collection("devices").doc(res.deviceId).get();
    expect(newSnap.data()?.status).toBe("active");
    expect(newSnap.data()?.uid).toBe("uid-reuse");
  });

  it("registerDevice: retired 互換 doc を active に戻さない", async () => {
    if (!emulatorAvailable) return;
    await db.collection("devices").doc("old-retired").set({
      name: "old retired",
      role: "terminal",
      uid: "uid-retired",
      status: "retired",
      installationId: "inst-old",
      platform: "ios",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const res = (await (registerDevice as { run: (req: unknown) => Promise<unknown> }).run({
      auth: { uid: "uid-retired" },
      data: {
        name: "new after retired",
        role: "terminal",
        uid: "uid-retired",
        installationId: "inst-new",
        platform: "ios",
      },
    })) as { deviceId: string };

    expect(res.deviceId).not.toBe("old-retired");
    const oldSnap = await db.collection("devices").doc("old-retired").get();
    expect(oldSnap.data()?.status).toBe("retired");
    expect(oldSnap.data()?.uid).toBeUndefined();
  });
});
