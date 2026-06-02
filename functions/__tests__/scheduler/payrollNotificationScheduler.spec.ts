import { runPayrollNotificationSchedulerTask } from '../../src/domains/attendance/scheduler/payrollNotificationScheduler';
import { getPayrollConfig } from '../../src/shared/config/payrollConfigLoader';
import { getRegionalTaskQueue } from '../../src/shared/tasks/getRegionalTaskQueue';
import { writeSchedulerTaskDispatchLogFromParentBestEffort } from '../../src/domains/scheduler/supervisor/schedulerTaskDispatchLogs';

jest.mock('../../src/shared/config/payrollConfigLoader', () => ({
  getPayrollConfig: jest.fn(),
}));

jest.mock('../../src/shared/tasks/getRegionalTaskQueue', () => ({
  getRegionalTaskQueue: jest.fn(),
}));

jest.mock('../../src/domains/scheduler/supervisor/schedulerTaskDispatchLogs', () => ({
  writeSchedulerTaskDispatchLogFromParentBestEffort: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/shared/logging/logOpsError', () => ({
  logOpsInfo: jest.fn(),
  logOpsSuccess: jest.fn(),
  logOpsError: jest.fn(),
}));

describe('runPayrollNotificationSchedulerTask', () => {
  const mockGetPayrollConfig = getPayrollConfig as jest.MockedFunction<
    typeof getPayrollConfig
  >;
  const mockGetRegionalTaskQueue = getRegionalTaskQueue as jest.MockedFunction<
    typeof getRegionalTaskQueue
  >;
  const mockWriteSchedulerTaskDispatchLog =
    writeSchedulerTaskDispatchLogFromParentBestEffort as jest.MockedFunction<
      typeof writeSchedulerTaskDispatchLogFromParentBestEffort
    >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('親 scheduler metadata 付きで child task を enqueue し dispatch log を残す', async () => {
    mockGetPayrollConfig.mockResolvedValue({
      schedulerNotificationHour: 6,
    } as Awaited<ReturnType<typeof getPayrollConfig>>);

    const enqueue = jest.fn().mockResolvedValue(undefined);
    mockGetRegionalTaskQueue.mockReturnValue({
      enqueue,
    } as unknown as ReturnType<typeof getRegionalTaskQueue>);

    const schedulerParent = {
      storeId: 'test-project',
      schedulerParentJobKey: 'payrollNotificationScheduler' as const,
      schedulerParentPlanningDate: '2026-04-04',
      schedulerParentPlannedRunAt: '2026-04-03T20:00:00.000Z',
      schedulerParentIdempotencyKey: 'payrollNotificationScheduler:2026-04-03T20:00:00.000Z',
      schedulerParentSupervisorRunId: 'supervisor_20260403T180000Z_abcdef12',
    };

    const result = await runPayrollNotificationSchedulerTask({
      targetDate: '2026-04-04',
      schedulerParent,
    });

    expect(result).toEqual({
      notificationHour: 6,
      scheduleTimeUtc: '2026-04-03T21:00:00.000Z',
    });
    expect(enqueue).toHaveBeenCalledWith(
      {
        targetDate: '2026-04-04',
        schedulerParentJobKey: 'payrollNotificationScheduler',
        schedulerParentPlanningDate: '2026-04-04',
        schedulerParentPlannedRunAt: '2026-04-03T20:00:00.000Z',
        schedulerParentIdempotencyKey:
          'payrollNotificationScheduler:2026-04-03T20:00:00.000Z',
        schedulerParentSupervisorRunId: 'supervisor_20260403T180000Z_abcdef12',
        schedulerChildUnitKey: 'processPayrollNotifications:2026-04-04',
        schedulerChildFunctionEntry: 'processPayrollNotifications',
      },
      expect.objectContaining({
        id: 'payroll-notification-2026-04-04-6',
        dispatchDeadlineSeconds: 300,
      })
    );
    expect(mockWriteSchedulerTaskDispatchLog).toHaveBeenCalledWith(
      schedulerParent,
      {
        childFunctionEntry: 'processPayrollNotifications',
        childUnitKey: 'processPayrollNotifications:2026-04-04',
        childScheduledAt: '2026-04-03T21:00:00.000Z',
        childTargetSummary: {
          targetDate: '2026-04-04',
          notificationHour: 6,
        },
        eventType: 'enqueued',
        context: {
          taskId: 'payroll-notification-2026-04-04-6',
        },
      }
    );
  });
});
