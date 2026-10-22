import { buildSchedulerTargetScope } from '../../src/domains/scheduler/supervisor/schedulerTargetScope';

describe('schedulerTargetScope', () => {
  it('weeklyPlanner の targetWeekStartDate を生成する', () => {
    const plannedRunAt = new Date('2026-04-02T19:40:00.000Z'); // JST: 2026-04-03 04:40
    const scope = buildSchedulerTargetScope('weeklyPlanner', plannedRunAt);
    expect(scope).toEqual({
      targetWeekStartDate: '2026-04-05',
    });
  });

  it('enqueueTournamentTasksByScheduler の範囲を生成する', () => {
    const plannedRunAt = new Date('2026-04-02T20:00:00.000Z');
    const scope = buildSchedulerTargetScope(
      'enqueueTournamentTasksByScheduler',
      plannedRunAt
    );
    expect(scope.rangeStartAt).toBe('2026-04-02T14:00:00.000Z');
    expect(scope.rangeEndAt).toBe('2026-04-16T20:00:00.000Z');
  });

  it('generateRecurringTournamentsByScheduler の評価日と終了日を生成する', () => {
    const plannedRunAt = new Date('2026-04-02T20:00:00.000Z'); // JST: 2026-04-03
    const scope = buildSchedulerTargetScope(
      'generateRecurringTournamentsByScheduler',
      plannedRunAt
    );
    expect(scope.evaluationDate).toBe('2026-04-03');
    expect(scope.windowEndDate).toBe('2026-07-03');
  });

  it('scheduledCleanup の cutoffDate を生成する', () => {
    const plannedRunAt = new Date('2026-04-03T20:00:00.000Z'); // JST: 2026-04-04
    const scope = buildSchedulerTargetScope('scheduledCleanup', plannedRunAt);
    expect(scope).toEqual({
      cutoffDate: '2026-03-28',
    });
  });

  it('scheduleGenerateNextYearBusinessHours の targetYear を生成する', () => {
    const plannedRunAt = new Date('2026-01-28T20:10:00.000Z'); // JST: 2026-01-29 05:10
    const scope = buildSchedulerTargetScope(
      'scheduleGenerateNextYearBusinessHours',
      plannedRunAt
    );
    expect(scope).toEqual({
      targetYear: 2027,
    });
  });

  it('payrollNotificationScheduler の targetDate を生成する', () => {
    const plannedRunAt = new Date('2026-04-03T20:00:00.000Z'); // JST: 2026-04-04
    const scope = buildSchedulerTargetScope(
      'payrollNotificationScheduler',
      plannedRunAt
    );
    expect(scope).toEqual({
      targetDate: '2026-04-04',
    });
  });
});
