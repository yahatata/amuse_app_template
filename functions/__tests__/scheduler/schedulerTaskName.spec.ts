import { buildScheduledJobTaskId } from '../../src/domains/scheduler/supervisor/schedulerTaskName';

describe('schedulerTaskName', () => {
  it('task ID を {jobKey}_{YYYYMMDDTHHmmssZ} 形式で生成する', () => {
    const plannedRunAt = new Date('2026-04-02T19:40:00.000Z');
    const taskId = buildScheduledJobTaskId('weeklyPlanner', plannedRunAt);
    expect(taskId).toBe('weeklyPlanner_20260402T194000Z');
  });
});

