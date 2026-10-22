/**
 * CLN-G3: 有効 Admin 判定と last-admin 保護ヘルパー。
 * 有効 Admin = role==admin かつ status 正規化後 active。
 * blocked / archived / retired は有効 Admin に含めない。
 */
import { HttpsError } from "firebase-functions/v2/https";
import {
  assertNotRemovingLastActiveAdmin,
  assertNotSelfOperation,
  isActiveAdminDevice,
} from "../../../src/shared/devices/deviceAdminAuth";

describe("CLN-G3 deviceAdminAuth last-admin helpers", () => {
  describe("isActiveAdminDevice", () => {
    it("admin + active だけ true", () => {
      expect(isActiveAdminDevice({ role: "admin", status: "active" })).toBe(true);
      expect(isActiveAdminDevice({ role: "admin" })).toBe(true);
    });

    it("blocked / archived / retired の admin は有効 Admin ではない", () => {
      expect(isActiveAdminDevice({ role: "admin", status: "blocked" })).toBe(false);
      expect(isActiveAdminDevice({ role: "admin", status: "archived" })).toBe(false);
      expect(isActiveAdminDevice({ role: "admin", status: "retired" })).toBe(false);
    });

    it("terminal / table は status によらず有効 Admin ではない", () => {
      expect(isActiveAdminDevice({ role: "terminal", status: "active" })).toBe(false);
      expect(isActiveAdminDevice({ role: "table", status: "active" })).toBe(false);
    });
  });

  describe("assertNotRemovingLastActiveAdmin", () => {
    const lastAdminMessage = "最後の管理者端末のロールは変更できません";

    it("最後の有効 Admin を利用不可にする操作は failed-precondition", () => {
      expect(() =>
        assertNotRemovingLastActiveAdmin(
          { role: "admin", status: "active" },
          1,
          lastAdminMessage
        )
      ).toThrow(HttpsError);

      try {
        assertNotRemovingLastActiveAdmin(
          { role: "admin", status: "active" },
          1,
          lastAdminMessage
        );
      } catch (error) {
        expect(error).toMatchObject({
          code: "failed-precondition",
          message: lastAdminMessage,
        });
      }
    });

    it("有効 Admin が複数なら拒否しない", () => {
      expect(() =>
        assertNotRemovingLastActiveAdmin(
          { role: "admin", status: "active" },
          2,
          lastAdminMessage
        )
      ).not.toThrow();
    });

    it("対象が有効 Admin でなければ count=1 でも拒否しない", () => {
      expect(() =>
        assertNotRemovingLastActiveAdmin(
          { role: "admin", status: "blocked" },
          1,
          lastAdminMessage
        )
      ).not.toThrow();
      expect(() =>
        assertNotRemovingLastActiveAdmin(
          { role: "terminal", status: "active" },
          1,
          lastAdminMessage
        )
      ).not.toThrow();
    });
  });

  describe("assertNotSelfOperation vs last-admin", () => {
    it("self 保護は別メッセージ（last-admin と混同しない）", () => {
      expect(() =>
        assertNotSelfOperation("admin-1", "admin-1", "ステータス変更")
      ).toThrow(/操作中の管理端末自身/);

      expect(() =>
        assertNotSelfOperation("admin-1", "admin-2", "ステータス変更")
      ).not.toThrow();
    });
  });
});
