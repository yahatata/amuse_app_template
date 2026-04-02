import {
  mergeSchedulerConfigForUpsert,
  mergeSchedulerConfigWithDefaults,
} from '../../src/shared/config/schedulerConfigLoader';

describe('schedulerConfigLoader v2 helpers', () => {
  it('mergeSchedulerConfigWithDefaults は不正値をデフォルト補完する', () => {
    const merged = mergeSchedulerConfigWithDefaults({
      schemaVersion: 2,
      supervisorEnabled: true,
      planningHorizonDays: 30,
      jobs: {
        weeklyPlanner: {
          enabled: true,
          scheduleKind: 'weekly',
          runAtJst: '99:99',
          dayOfWeek: 9,
          timezone: 'Asia/Tokyo',
        },
      },
    });

    expect(merged.schemaVersion).toBe(2);
    expect(merged.planningHorizonDays).toBe(7);
    expect(merged.jobs.weeklyPlanner.runAtJst).toBe('04:40');
    expect(merged.jobs.weeklyPlanner.dayOfWeek).toBe(4);
  });

  it('mergeSchedulerConfigForUpsert は v2 正規化項目を返す', () => {
    const merged = mergeSchedulerConfigForUpsert({
      supervisorEnabled: false,
      jobs: {
        scheduledCleanup: {
          enabled: false,
          scheduleKind: 'daily',
          runAtJst: '05:00',
          timezone: 'Asia/Tokyo',
        },
      },
    });

    expect(merged).toHaveProperty('schemaVersion');
    expect(merged).toHaveProperty('supervisorEnabled', false);
    expect(merged).toHaveProperty('planningHorizonDays');
    expect(merged).toHaveProperty('jobs');
    expect((merged as { jobs: { scheduledCleanup: { enabled: boolean } } }).jobs.scheduledCleanup.enabled).toBe(false);
  });
});
