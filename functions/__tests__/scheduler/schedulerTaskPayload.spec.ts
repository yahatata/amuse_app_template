import {
  assertScheduledJobTaskPayloadMatchesExpectedJobKey,
  assertValidScheduledJobTaskPayload,
  createIdempotencyKey,
  SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
  type ScheduledJobTaskPayload,
} from '../../src/domains/scheduler/supervisor/schedulerTaskPayload';

describe('schedulerTaskPayload', () => {
  it('有効な payload を受け付ける', () => {
    const payload: ScheduledJobTaskPayload<'scheduledCleanup'> = {
      schemaVersion: SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
      jobKey: 'scheduledCleanup',
      plannedRunAt: '2026-04-02T20:00:00.000Z',
      planningDate: '2026-04-02',
      targetScope: { cutoffDate: '2026-03-26' },
      idempotencyKey: createIdempotencyKey(
        'scheduledCleanup',
        new Date('2026-04-02T20:00:00.000Z')
      ),
      supervisorRunId: 'supervisor_20260401T180000Z_abcdef12',
      scheduleFingerprint: 'abc123',
      projectId: 'test-project',
      enqueuedAt: '2026-04-01T18:00:00.000Z',
    };

    expect(() => assertValidScheduledJobTaskPayload(payload)).not.toThrow();
  });

  it('不正 payload で例外を投げる', () => {
    const payload: ScheduledJobTaskPayload<'scheduledCleanup'> = {
      schemaVersion: 0,
      jobKey: 'scheduledCleanup',
      plannedRunAt: 'invalid',
      planningDate: '20260402',
      targetScope: { cutoffDate: '2026-03-26' },
      idempotencyKey: '',
      supervisorRunId: '',
      scheduleFingerprint: '',
      projectId: '',
      enqueuedAt: 'invalid',
    };

    expect(() => assertValidScheduledJobTaskPayload(payload)).toThrow();
  });

  it('expected jobKey と異なる payload は拒否する', () => {
    const payload: ScheduledJobTaskPayload<'scheduledCleanup'> = {
      schemaVersion: SCHEDULER_TASK_PAYLOAD_SCHEMA_VERSION,
      jobKey: 'scheduledCleanup',
      plannedRunAt: '2026-04-02T20:00:00.000Z',
      planningDate: '2026-04-02',
      targetScope: { cutoffDate: '2026-03-26' },
      idempotencyKey: createIdempotencyKey(
        'scheduledCleanup',
        new Date('2026-04-02T20:00:00.000Z')
      ),
      supervisorRunId: 'supervisor_20260401T180000Z_abcdef12',
      scheduleFingerprint: 'abc123',
      projectId: 'test-project',
      enqueuedAt: '2026-04-01T18:00:00.000Z',
    };

    expect(() =>
      assertScheduledJobTaskPayloadMatchesExpectedJobKey(
        payload,
        'weeklyPlanner'
      )
    ).toThrow('jobKey mismatch');
  });
});
