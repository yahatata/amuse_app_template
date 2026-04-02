/**
 * phaseC 後の scheduler 移行確認
 *
 * 旧 job 個別 onSchedule + env CRON 上書きを撤去し、
 * schedulerSupervisor（03:00 JST固定）+ Task Queue Function へ移行したことを
 * ソースコードパターンで検証する。
 */

import * as fs from "fs";
import * as path from "path";

const SRC_ROOT = path.resolve(__dirname, "../../src");

const MIGRATED_JOB_FILES = [
  {
    file: "domains/storeMeta/scheduler/weeklyPlanner.ts",
    oldCronEnvVar: "WEEKLY_PLANNER_CRON",
  },
  {
    file: "domains/tournament_createTournament/scheduler/GenerateRecurringTournamentsByScheduler.ts",
    oldCronEnvVar: "RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON",
  },
  {
    file: "domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts",
    oldCronEnvVar: "ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON",
  },
  {
    file: "domains/staff/scheduler/scheduledCleanup.ts",
    oldCronEnvVar: "SCHEDULED_CLEANUP_CRON",
  },
  {
    file: "shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts",
    oldCronEnvVar: "SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_CRON",
  },
  {
    file: "domains/attendance/scheduler/payrollNotificationScheduler.ts",
    oldCronEnvVar: "PAYROLL_NOTIFICATION_SCHEDULER_CRON",
  },
] as const;

describe("D15 scheduler CRON migration", () => {
  MIGRATED_JOB_FILES.forEach(({file, oldCronEnvVar}) => {
    describe(file, () => {
      let content: string;

      beforeAll(() => {
        content = fs.readFileSync(path.join(SRC_ROOT, file), "utf-8");
      });

      it("旧 onSchedule 実装が残っていないこと", () => {
        expect(content).not.toMatch(/onSchedule\s*\(/);
      });

      it(`旧 env CRON (${oldCronEnvVar}) を参照しないこと`, () => {
        expect(content).not.toContain(oldCronEnvVar);
      });
    });
  });

  describe("domains/scheduler/supervisor/schedulerSupervisor.ts", () => {
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(
        path.join(SRC_ROOT, "domains/scheduler/supervisor/schedulerSupervisor.ts"),
        "utf-8"
      );
    });

    it("03:00 JST 固定で onSchedule が定義されていること", () => {
      expect(content).toContain("const SCHEDULER_SUPERVISOR_CRON = '0 3 * * *'");
      expect(content).toMatch(/schedule:\s*SCHEDULER_SUPERVISOR_CRON/);
      expect(content).toMatch(/timeZone:\s*'Asia\/Tokyo'/);
    });

    it("supervisor の CRON を process.env で上書きしないこと", () => {
      expect(content).not.toMatch(/process\.env/);
    });
  });

  describe("phaseE: monthlyPayrollTrigger removal", () => {
    const monthlyTriggerPath = path.join(
      SRC_ROOT,
      "domains/attendance/scheduler/monthlyPayrollTrigger.ts"
    );
    const attendanceIndexPath = path.join(SRC_ROOT, "domains/attendance/index.ts");

    it("monthlyPayrollTrigger 実装ファイルが削除されていること", () => {
      expect(fs.existsSync(monthlyTriggerPath)).toBe(false);
    });

    it("attendance index から monthlyPayrollTrigger export が削除されていること", () => {
      const attendanceIndexContent = fs.readFileSync(attendanceIndexPath, "utf-8");
      expect(attendanceIndexContent).not.toContain("monthlyPayrollTrigger");
    });
  });
});
