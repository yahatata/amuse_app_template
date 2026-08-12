/**
 * デバイス管理: updateDeviceStatus / archiveDevice / updateDeviceRole / registerDevice
 *（Firestore Emulator）
 *
 * 利用可能な admin = role==admin かつ status 正規化後 active。
 * 最後の 1 台を利用不可にする操作はサーバ側で拒否する。
 */

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import * as admin from "firebase-admin";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = "test-project-device-management";

async function seedDevice(
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

async function countActiveAdmins(db: admin.firestore.Firestore): Promise<number> {
  const snap = await db.collection("devices").where("role", "==", "admin").get();
  return snap.docs.filter((doc) => {
    const status = doc.data().status as string | undefined;
    return status === "active" || status === undefined || status === null;
  }).length;
}

describe("device management callables", () => {
  let testEnv: Awaited<ReturnType<typeof initializeTestEnvironment>>;
  let db: admin.firestore.Firestore;
  let updateDeviceStatus: typeof import("../../../src/shared/devices/callables/updateDeviceStatus").updateDeviceStatus;
  let archiveDevice: typeof import("../../../src/shared/devices/callables/archiveDevice").archiveDevice;
  let updateDeviceRole: typeof import("../../../src/shared/devices/callables/updateDeviceRole").updateDeviceRole;
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
    ({ updateDeviceRole } = await import(
      "../../../src/shared/devices/callables/updateDeviceRole"
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

  describe("updateDeviceStatus", () => {
    it("admin は active -> blocked にできる（admin以外）", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, {
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

    it("active admin が2台ある場合、他方を blocked にでき 1台が残る", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      const res = await (updateDeviceStatus as { run: (req: unknown) => Promise<unknown> }).run({
        auth: { uid: "uid-admin" },
        data: { deviceId: "admin-2", status: "blocked" },
      });
      expect(res).toMatchObject({ success: true, status: "blocked" });
      expect(await countActiveAdmins(db)).toBe(1);
    });

    it("最後の active admin を blocked にすると拒否", async () => {
      if (!emulatorAvailable) return;
      // sole admin が自分を block → 最後のadmin保護が自己操作より先に発動
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });

      await expect(
        (updateDeviceStatus as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-1", status: "blocked" },
        })
      ).rejects.toMatchObject({
        code: "failed-precondition",
        message: expect.stringContaining("最後の管理者端末はブロックできません"),
      });
      expect(await countActiveAdmins(db)).toBe(1);
    });

    it("自己ブロックは拒否（adminが2台ある場合）", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      await expect(
        (updateDeviceStatus as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-1", status: "blocked" },
        })
      ).rejects.toMatchObject({
        code: "failed-precondition",
        message: expect.stringContaining("操作中の管理端末自身"),
      });
    });

    it("blocked → active は成功", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, {
        deviceId: "target-1",
        uid: "uid-target",
        role: "terminal",
        status: "blocked",
      });

      const res = await (updateDeviceStatus as { run: (req: unknown) => Promise<unknown> }).run({
        auth: { uid: "uid-admin" },
        data: { deviceId: "target-1", status: "active" },
      });
      expect(res).toMatchObject({ success: true, status: "active" });
    });

    it("同時に相互blockedしてもactive adminが0台にならない", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      const results = await Promise.allSettled([
        (updateDeviceStatus as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-2", status: "blocked" },
        }),
        (updateDeviceStatus as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin-2" },
          data: { deviceId: "admin-1", status: "blocked" },
        }),
      ]);

      expect(results.length).toBe(2);
      expect(await countActiveAdmins(db)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("archiveDevice", () => {
    it("admin は他端末（非admin）を archived にできる", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, {
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

    it("active admin が2台ある場合、他方のadminをarchiveでき1台が残る", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      const res = await (archiveDevice as { run: (req: unknown) => Promise<unknown> }).run({
        auth: { uid: "uid-admin-2" },
        data: { deviceId: "admin-1" },
      });
      expect(res).toMatchObject({ success: true, status: "archived" });

      const archived = await db.collection("devices").doc("admin-1").get();
      expect(archived.data()?.status).toBe("archived");
      expect(await countActiveAdmins(db)).toBe(1);

      const remaining = await db.collection("devices").doc("admin-2").get();
      expect(remaining.data()?.status).toBe("active");
      expect(remaining.data()?.role).toBe("admin");
    });

    it("自己archiveは拒否", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      await expect(
        (archiveDevice as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-1" },
        })
      ).rejects.toMatchObject({
        code: "failed-precondition",
        message: expect.stringContaining("操作中の管理端末自身"),
      });
    });

    it("最後のactive adminのarchiveは自己禁止が先に成立する", async () => {
      if (!emulatorAvailable) return;
      // active admin が1台だけのとき、呼び出し元もその1台になるため
      // 最後のadmin保護より自己archive禁止が先に発動する。
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });

      await expect(
        (archiveDevice as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-1" },
        })
      ).rejects.toMatchObject({
        code: "failed-precondition",
        message: expect.stringContaining("操作中の管理端末自身"),
      });
      expect(await countActiveAdmins(db)).toBe(1);
    });

    it("同時に相互archiveしてもactive adminが0台にならない", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      const results = await Promise.allSettled([
        (archiveDevice as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-2" },
        }),
        (archiveDevice as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin-2" },
          data: { deviceId: "admin-1" },
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled").length;
      const rejected = results.filter((r) => r.status === "rejected").length;
      expect(fulfilled + rejected).toBe(2);
      expect(await countActiveAdmins(db)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("updateDeviceRole", () => {
    it("自分自身のadmin role変更は拒否", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      await expect(
        (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-1", role: "terminal" },
        })
      ).rejects.toMatchObject({
        code: "failed-precondition",
        message: expect.stringContaining("自分自身の端末ロールは変更できません"),
      });
    });

    it("最後のactive adminをterminalへ変更すると拒否", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });

      await expect(
        (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-1", role: "terminal" },
        })
      ).rejects.toMatchObject({
        code: "failed-precondition",
        message: expect.stringContaining("最後の管理者端末のロールは変更できません"),
      });
      expect(await countActiveAdmins(db)).toBe(1);
    });

    it("最後のactive adminをtableへ変更すると拒否", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });

      await expect(
        (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-1", role: "table" },
        })
      ).rejects.toMatchObject({
        code: "failed-precondition",
        message: expect.stringContaining("最後の管理者端末のロールは変更できません"),
      });
    });

    it("active adminが2台なら他方をterminalへ変更でき options が空になる", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      const res = await (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
        auth: { uid: "uid-admin" },
        data: { deviceId: "admin-2", role: "terminal" },
      });
      expect(res).toMatchObject({ success: true, role: "terminal" });

      const snap = await db.collection("devices").doc("admin-2").get();
      expect(snap.data()?.role).toBe("terminal");
      expect(snap.data()?.options).toEqual({});
      expect(snap.data()?.optionParams).toEqual({});
      expect(await countActiveAdmins(db)).toBe(1);
    });

    it("blocked admin caller は拒否", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, {
        deviceId: "admin-blocked",
        uid: "uid-blocked",
        status: "blocked",
      });
      await seedDevice(db, {
        deviceId: "target-1",
        uid: "uid-target",
        role: "terminal",
      });

      await expect(
        (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-blocked" },
          data: { deviceId: "target-1", role: "admin" },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });
    });

    it("非admin caller は拒否", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, {
        deviceId: "term-1",
        uid: "uid-term",
        role: "terminal",
      });
      await seedDevice(db, {
        deviceId: "target-1",
        uid: "uid-target",
        role: "terminal",
      });

      await expect(
        (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-term" },
          data: { deviceId: "target-1", role: "admin" },
        })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });
    });

    it("admin以外の対象をadminへ変更できる", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, {
        deviceId: "term-1",
        uid: "uid-term",
        role: "terminal",
      });

      const res = await (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
        auth: { uid: "uid-admin" },
        data: { deviceId: "term-1", role: "admin" },
      });
      expect(res).toMatchObject({ success: true, role: "admin" });

      const snap = await db.collection("devices").doc("term-1").get();
      expect(snap.data()?.role).toBe("admin");
      expect(snap.data()?.options).toBeUndefined();
      expect(await countActiveAdmins(db)).toBe(2);
    });

    it("同時に相互demoteしてもactive adminが0台にならない", async () => {
      if (!emulatorAvailable) return;
      await seedDevice(db, { deviceId: "admin-1", uid: "uid-admin" });
      await seedDevice(db, { deviceId: "admin-2", uid: "uid-admin-2" });

      const results = await Promise.allSettled([
        (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin" },
          data: { deviceId: "admin-2", role: "terminal" },
        }),
        (updateDeviceRole as { run: (req: unknown) => Promise<unknown> }).run({
          auth: { uid: "uid-admin-2" },
          data: { deviceId: "admin-1", role: "table" },
        }),
      ]);

      expect(results.length).toBe(2);
      expect(await countActiveAdmins(db)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("registerDevice", () => {
    it("blocked 既存 doc がある場合は登録拒否", async () => {
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

    it("archived のみの uid では新規 doc を作る", async () => {
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

    it("retired 互換 doc を active に戻さない", async () => {
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
});
