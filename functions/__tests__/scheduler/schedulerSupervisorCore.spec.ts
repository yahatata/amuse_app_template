import { runSchedulerSupervisorCore } from '../../src/domains/scheduler/supervisor/schedulerSupervisorCore';
import type {
  SchedulerConfig,
  SchedulerJobConfig,
  SchedulerJobKey,
} from '../../src/shared/config/schedulerConfigTypes';
import { getSchedulerConfig } from '../../src/shared/config/schedulerConfigLoader';
import { getRequiredProjectId } from '../../src/shared/runtime/projectId';
import { writeSchedulerDispatchLogBestEffort } from '../../src/domains/scheduler/supervisor/schedulerLogs';

jest.mock('../../src/shared/config/schedulerConfigLoader', () => ({
  getSchedulerConfig: jest.fn(),
}));

jest.mock('../../src/shared/runtime/projectId', () => ({
  getRequiredProjectId: jest.fn(),
}));

jest.mock('../../src/domains/scheduler/supervisor/schedulerLogs', () => ({
  writeSchedulerDispatchLogBestEffort: jest.fn().mockResolvedValue(undefined),
}));

function createBaseJobConfig(): SchedulerJobConfig {
  return {
    enabled: false,
    scheduleKind: 'daily',
    runAtJst: '05:00',
    timezone: 'Asia/Tokyo',
  };
}

function createSchedulerConfigWithSingleJob(
  jobKey: SchedulerJobKey,
  jobConfig: SchedulerJobConfig,
  overrides?: Partial<SchedulerConfig>
): SchedulerConfig {
  const jobs: Record<SchedulerJobKey, SchedulerJobConfig> = {
    weeklyPlanner: createBaseJobConfig(),
    enqueueTournamentTasksByScheduler: createBaseJobConfig(),
    generateRecurringTournamentsByScheduler: createBaseJobConfig(),
    scheduledCleanup: createBaseJobConfig(),
    scheduleGenerateNextYearBusinessHours: createBaseJobConfig(),
    payrollNotificationScheduler: createBaseJobConfig(),
  };

  jobs[jobKey] = jobConfig;

  return {
    schemaVersion: 2,
    supervisorEnabled: true,
    planningHorizonDays: 1,
    jobs,
    ...overrides,
  };
}

describe('schedulerSupervisorCore', () => {
  const mockGetSchedulerConfig = getSchedulerConfig as jest.MockedFunction<
    typeof getSchedulerConfig
  >;
  const mockGetRequiredProjectId = getRequiredProjectId as jest.MockedFunction<
    typeof getRequiredProjectId
  >;
  const mockWriteDispatchLog = writeSchedulerDispatchLogBestEffort as jest.MockedFunction<
    typeof writeSchedulerDispatchLogBestEffort
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequiredProjectId.mockReturnValue('test-project');
  });

  it('supervisorEnabled=false の場合は task を投入しない', async () => {
    mockGetSchedulerConfig.mockResolvedValue(
      createSchedulerConfigWithSingleJob(
        'scheduledCleanup',
        {
          enabled: true,
          scheduleKind: 'daily',
          runAtJst: '23:59',
          timezone: 'Asia/Tokyo',
        },
        { supervisorEnabled: false }
      )
    );

    const enqueue = jest.fn().mockResolvedValue(undefined);
    const result = await runSchedulerSupervisorCore(
      { enqueue },
      new Date('2026-04-01T00:30:00.000Z')
    );

    expect(result.enqueuedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(enqueue).toHaveBeenCalledTimes(0);
    expect(mockWriteDispatchLog).toHaveBeenCalledTimes(0);
  });

  it('plannedRunAt が過去なら skip ログを残して投入しない', async () => {
    mockGetSchedulerConfig.mockResolvedValue(
      createSchedulerConfigWithSingleJob('scheduledCleanup', {
        enabled: true,
        scheduleKind: 'daily',
        runAtJst: '03:00',
        timezone: 'Asia/Tokyo',
      })
    );

    const enqueue = jest.fn().mockResolvedValue(undefined);
    const result = await runSchedulerSupervisorCore(
      { enqueue },
      new Date('2026-04-01T00:30:00.000Z')
    );

    expect(result.enqueuedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(0);
    expect(mockWriteDispatchLog).toHaveBeenCalledTimes(1);
    expect(mockWriteDispatchLog.mock.calls[0][0]).toMatchObject({
      eventType: 'skip',
      reason: 'planned_run_at_in_past',
      jobKey: 'scheduledCleanup',
      functionName: 'scheduledCleanup',
    });
  });

  it('投入成功時は enqueued ログを残す', async () => {
    mockGetSchedulerConfig.mockResolvedValue(
      createSchedulerConfigWithSingleJob('scheduledCleanup', {
        enabled: true,
        scheduleKind: 'daily',
        runAtJst: '23:59',
        timezone: 'Asia/Tokyo',
      })
    );

    const enqueue = jest.fn().mockResolvedValue(undefined);
    const result = await runSchedulerSupervisorCore(
      { enqueue },
      new Date('2026-04-01T00:30:00.000Z')
    );

    expect(result.enqueuedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(mockWriteDispatchLog).toHaveBeenCalledTimes(1);
    expect(mockWriteDispatchLog.mock.calls[0][0]).toMatchObject({
      eventType: 'enqueued',
      jobKey: 'scheduledCleanup',
      functionName: 'scheduledCleanup',
      queueName: 'scheduled-job-scheduled-cleanup',
    });
  });

  it('ALREADY_EXISTS は skip として継続する', async () => {
    mockGetSchedulerConfig.mockResolvedValue(
      createSchedulerConfigWithSingleJob('scheduledCleanup', {
        enabled: true,
        scheduleKind: 'daily',
        runAtJst: '23:59',
        timezone: 'Asia/Tokyo',
      })
    );

    const enqueue = jest.fn().mockRejectedValue({ code: '6', message: 'ALREADY_EXISTS' });
    const result = await runSchedulerSupervisorCore(
      { enqueue },
      new Date('2026-04-01T00:30:00.000Z')
    );

    expect(result.enqueuedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(mockWriteDispatchLog).toHaveBeenCalledTimes(1);
    expect(mockWriteDispatchLog.mock.calls[0][0]).toMatchObject({
      eventType: 'skip',
      reason: 'task_already_exists',
      jobKey: 'scheduledCleanup',
    });
  });

  it('ALREADY_EXISTS 以外の失敗は error ログ後に throw する', async () => {
    mockGetSchedulerConfig.mockResolvedValue(
      createSchedulerConfigWithSingleJob('scheduledCleanup', {
        enabled: true,
        scheduleKind: 'daily',
        runAtJst: '23:59',
        timezone: 'Asia/Tokyo',
      })
    );

    const enqueue = jest.fn().mockRejectedValue(new Error('enqueue failed'));

    await expect(
      runSchedulerSupervisorCore(
        { enqueue },
        new Date('2026-04-01T00:30:00.000Z')
      )
    ).rejects.toThrow('schedulerSupervisor enqueue failed: scheduledCleanup:enqueue failed');

    expect(mockWriteDispatchLog).toHaveBeenCalledTimes(1);
    expect(mockWriteDispatchLog.mock.calls[0][0]).toMatchObject({
      eventType: 'error',
      isSuccess: false,
      reason: 'enqueue failed',
      jobKey: 'scheduledCleanup',
    });
  });
});
