/**
 * Step 5 テスト：作成完了後の enqueue 呼び出し
 *
 * changeSpec Step 5 に準拠。
 * - 作成経路で runEnqueueTournamentTasks が呼ばれること
 * - storeId/tenantId を渡していること
 * - 閾値スキップがあること
 * - 回帰：enqueueStartTask/enqueueRegistTask が復活していないこと
 * - 依存方向が正しいこと
 */

import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "../../src");

describe("Step 5: 作成完了後の enqueue 呼び出し", () => {
  describe("createScheduledTournament.ts", () => {
    it("runEnqueueTournamentTasks を import していること", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createScheduledTournament.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("runEnqueueTournamentTasks");
      expect(content).toMatch(/import.*runEnqueueTournamentTasks.*enqueueTournamentTasksCore/);
    });

    it("storeId, tenantId を渡して runEnqueueTournamentTasks を呼び出していること", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createScheduledTournament.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("runEnqueueTournamentTasks({ storeId, tenantId })");
    });

    it("runEnqueueTournamentTasks が 1 回のみ呼ばれていること（ソースコード上で呼び出しが1箇所のみ）", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createScheduledTournament.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      const matches = content.match(/runEnqueueTournamentTasks\s*\(/g);
      expect(matches).toHaveLength(1);
    });

    it("logger.error で構造化ログを出力していること", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createScheduledTournament.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("logger.error");
      expect(content).toContain("enqueue 呼び出しエラー");
    });

    it("enqueueStartTask / enqueueRegistTask を呼び出していないこと（回帰）", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createScheduledTournament.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("enqueueStartTask");
      expect(content).not.toContain("enqueueRegistTask");
    });
  });

  describe("createTournamentRecurrence.ts", () => {
    it("runEnqueueTournamentTasks を import していること", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createTournamentRecurrence.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("runEnqueueTournamentTasks");
      expect(content).toMatch(/import.*runEnqueueTournamentTasks.*enqueueTournamentTasksCore/);
    });

    it("storeId, tenantId を渡して runEnqueueTournamentTasks を呼び出していること", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createTournamentRecurrence.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("runEnqueueTournamentTasks({ storeId, tenantId })");
    });

    it("enqueue が 1 回のみ呼ばれること（runEnqueueTournamentTasks の呼び出しが1箇所のみ）", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createTournamentRecurrence.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      const matches = content.match(/runEnqueueTournamentTasks\s*\(/g);
      expect(matches).toHaveLength(1);
    });

    it("enqueueStartTask / enqueueRegistTask を呼び出していないこと（回帰）", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/callables/createTournamentRecurrence.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("enqueueStartTask");
      expect(content).not.toContain("enqueueRegistTask");
    });
  });

  describe("generateRecurringTournamentsCore.ts", () => {
    it("runEnqueueTournamentTasks を import していること", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("runEnqueueTournamentTasks");
    });

    it("閾値（ENQUEUE_AFTER_GENERATE_THRESHOLD）を超えたら enqueue をスキップすること", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("ENQUEUE_AFTER_GENERATE_THRESHOLD");
      expect(content).toContain("totalGenerated <= ENQUEUE_AFTER_GENERATE_THRESHOLD");
      expect(content).toContain("enqueue スキップ");
    });

    it("enqueueStartTask / enqueueRegistTask を呼び出していないこと（回帰）", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("enqueueStartTask");
      expect(content).not.toContain("enqueueRegistTask");
    });
  });

  describe("依存方向", () => {
    it("enqueueTournamentTasksCore が createScheduledTournament 等を import していないこと", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("createScheduledTournament");
      expect(content).not.toContain("createTournamentRecurrence");
      expect(content).not.toContain("generateRecurringTournamentsCore");
    });

    it("tasks.ts が enqueueTournamentTasksCore を import していないこと", () => {
      const filePath = path.join(
        SRC_ROOT,
        "domains/tournament_createTournament/services/tasks.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).not.toContain("enqueueTournamentTasksCore");
    });
  });
});
