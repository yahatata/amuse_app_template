import {
  TOURNAMENT_TASKS_REGION,
  OPENCLOSE_TASKS_REGION,
  SCHEDULED_JOB_TASKS_REGION,
  TOURNAMENT_TASKS_QUEUE,
  OPENCLOSE_TASKS_QUEUE,
  SCHEDULED_JOB_QUEUE_BY_KEY,
  TOURNAMENT_INVOKER_SA_PREFIX,
  OPENCLOSE_INVOKER_SA_PREFIX,
  getScheduledJobQueueName,
  buildInvokerSaEmail,
} from '../../../src/shared/config/cloudTasksConfig';

describe('cloudTasksConfig', () => {
  it('リージョン定数が期待値であること', () => {
    expect(TOURNAMENT_TASKS_REGION).toBe('asia-northeast1');
    expect(OPENCLOSE_TASKS_REGION).toBe('asia-northeast1');
    expect(SCHEDULED_JOB_TASKS_REGION).toBe('asia-northeast1');
  });

  it('キュー定数が期待値であること', () => {
    expect(TOURNAMENT_TASKS_QUEUE).toBe('tournament-queue');
    expect(OPENCLOSE_TASKS_QUEUE).toBe('business-date-assessment-queue');
  });

  it('scheduled job queue map が定義済み jobKey を持つこと', () => {
    expect(SCHEDULED_JOB_QUEUE_BY_KEY.weeklyPlanner).toBe(
      'scheduled-job-weekly-planner'
    );
    expect(SCHEDULED_JOB_QUEUE_BY_KEY.enqueueTournamentTasksByScheduler).toBe(
      'scheduled-job-enqueue-tournament-tasks-by-scheduler'
    );
    expect(SCHEDULED_JOB_QUEUE_BY_KEY.generateRecurringTournamentsByScheduler).toBe(
      'scheduled-job-generate-recurring-tournaments-by-scheduler'
    );
    expect(SCHEDULED_JOB_QUEUE_BY_KEY.scheduledCleanup).toBe(
      'scheduled-job-scheduled-cleanup'
    );
    expect(
      SCHEDULED_JOB_QUEUE_BY_KEY.scheduleGenerateNextYearBusinessHours
    ).toBe('scheduled-job-schedule-generate-next-year-business-hours');
    expect(SCHEDULED_JOB_QUEUE_BY_KEY.payrollNotificationScheduler).toBe(
      'scheduled-job-payroll-notification-scheduler'
    );
  });

  it('getScheduledJobQueueName が定義済み jobKey の queue を返すこと', () => {
    expect(getScheduledJobQueueName('weeklyPlanner')).toBe(
      'scheduled-job-weekly-planner'
    );
    expect(getScheduledJobQueueName('payrollNotificationScheduler')).toBe(
      'scheduled-job-payroll-notification-scheduler'
    );
  });

  it('不正な jobKey は例外を投げること', () => {
    expect(() =>
      getScheduledJobQueueName('unknownJobKey' as never)
    ).toThrow('Unsupported scheduled job key: unknownJobKey');
  });

  it('Invoker SA プレフィックスとメール生成が期待値であること', () => {
    expect(TOURNAMENT_INVOKER_SA_PREFIX).toBe('tasks-invoker');
    expect(OPENCLOSE_INVOKER_SA_PREFIX).toBe('openclose-tasks-invoker');

    expect(
      buildInvokerSaEmail(TOURNAMENT_INVOKER_SA_PREFIX, 'my-project')
    ).toBe('tasks-invoker@my-project.iam.gserviceaccount.com');
    expect(
      buildInvokerSaEmail(OPENCLOSE_INVOKER_SA_PREFIX, 'my-project')
    ).toBe('openclose-tasks-invoker@my-project.iam.gserviceaccount.com');
  });
});
