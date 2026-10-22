import { logger } from 'firebase-functions';
import {
  logOpsError,
  logOpsInfo,
  logOpsSuccess,
} from '../../../src/shared/logging/logOpsError';

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/shared/centralFirestore/writeToCentralFirestore', () => ({
  writeCentralErrorLog: jest.fn().mockResolvedValue(undefined),
  writeCentralTaskLog: jest.fn().mockResolvedValue(undefined),
  writeCentralSchedulerLog: jest.fn().mockResolvedValue(undefined),
}));

describe('logOpsInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GCLOUD_PROJECT = 'test-logops-project';
  });

  afterEach(() => {
    delete process.env.GCLOUD_PROJECT;
  });

  it('logger.info に outcome info / eventType start / service / functionEntry / operation / projectId / context を載せる', () => {
    logOpsInfo({
      message: 'enqueueTournamentTasksByScheduler start',
      functionEntry: 'enqueueTournamentTasksByScheduler',
      context: { rangeStartAt: '2026-05-01', rangeEndAt: '2026-05-08' },
    });

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message, payload] = (logger.info as jest.Mock).mock.calls[0];
    expect(message).toBe('enqueueTournamentTasksByScheduler start');
    expect(payload).toMatchObject({
      outcome: 'info',
      eventType: 'start',
      service: 'tournament_schedule',
      functionEntry: 'enqueueTournamentTasksByScheduler',
      operation: 'start',
      projectId: 'test-logops-project',
      context: { rangeStartAt: '2026-05-01', rangeEndAt: '2026-05-08' },
    });
  });

  it('operation を省略すると start を付与する', () => {
    logOpsInfo({
      message: 'x',
      functionEntry: 'enqueueTournamentTasksByScheduler',
    });
    expect((logger.info as jest.Mock).mock.calls[0][1]).toMatchObject({
      operation: 'start',
    });
  });

  it('projectId を明示するとそれを使う', () => {
    logOpsInfo({
      message: 'x',
      functionEntry: 'enqueueTournamentTasksByScheduler',
      projectId: 'explicit-project',
    });
    expect((logger.info as jest.Mock).mock.calls[0][1]).toMatchObject({
      projectId: 'explicit-project',
    });
  });
});

describe('logOpsInfo と既存 logOpsSuccess / logOpsError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GCLOUD_PROJECT = 'coexist-project';
  });

  afterEach(() => {
    delete process.env.GCLOUD_PROJECT;
  });

  it('logOpsSuccess は outcome success のみで eventType を付けない', () => {
    logOpsSuccess({
      message: 'done',
      functionEntry: 'enqueueTournamentTasksByScheduler',
      operation: 'runEnqueueSchedulerTask',
    });
    expect(logger.info).toHaveBeenCalledWith(
      'done',
      expect.objectContaining({
        outcome: 'success',
        functionEntry: 'enqueueTournamentTasksByScheduler',
        operation: 'runEnqueueSchedulerTask',
      }),
    );
    const payload = (logger.info as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('eventType');
  });

  it('logOpsError は logger.error を使う（logOpsInfo と独立）', () => {
    logOpsError({
      message: 'fail',
      functionEntry: 'enqueueTournamentTasksByScheduler',
      cause: new Error('x'),
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect((logger.error as jest.Mock).mock.calls[0][0]).toBe('fail');
  });
});
