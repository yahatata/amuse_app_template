import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { getRequiredProjectId } from '../../src/shared/runtime/projectId';
import { enqueueTournamentTasksReplanTask } from '../../src/domains/scheduler/replan/enqueueTournamentTasksReplanTask';

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(),
  FieldValue: {
    serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  },
}));

jest.mock('firebase-admin/functions', () => ({
  getFunctions: jest.fn(),
}));

jest.mock('../../src/shared/runtime/projectId', () => ({
  getRequiredProjectId: jest.fn(),
}));

type RequestDocData = Record<string, unknown>;

function createFirestoreMocks() {
  const requestRef = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
  };

  const collection = jest.fn().mockReturnValue({
    doc: jest.fn().mockReturnValue(requestRef),
  });

  (getFirestore as jest.Mock).mockReturnValue({
    collection,
  });

  return { requestRef, collection };
}

function createFunctionsMocks() {
  const enqueue = jest.fn().mockResolvedValue(undefined);
  const taskQueue = jest.fn().mockReturnValue({ enqueue });
  (getFunctions as jest.Mock).mockReturnValue({ taskQueue });
  return { enqueue, taskQueue };
}

describe('enqueueTournamentTasksReplanTask', () => {
  const mockGetRequiredProjectId = getRequiredProjectId as jest.MockedFunction<
    typeof getRequiredProjectId
  >;
  const mockServerTimestamp = FieldValue.serverTimestamp as jest.MockedFunction<
    typeof FieldValue.serverTimestamp
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequiredProjectId.mockReturnValue('test-project');
  });

  function mockRequestSnapshot(exists: boolean, data?: RequestDocData) {
    const { requestRef } = createFirestoreMocks();
    requestRef.get.mockResolvedValue({
      exists,
      data: () => data ?? {},
    });
    return requestRef;
  }

  it('request ドキュメントが無ければ何もしない', async () => {
    const requestRef = mockRequestSnapshot(false);
    const { enqueue } = createFunctionsMocks();

    await enqueueTournamentTasksReplanTask(new Date('2026-04-01T00:00:00.000Z'));

    expect(enqueue).toHaveBeenCalledTimes(0);
    expect(requestRef.set).toHaveBeenCalledTimes(0);
  });

  it('isProcessing=true の場合は重複投入しない', async () => {
    const requestRef = mockRequestSnapshot(true, {
      isProcessing: true,
      aggregateVersion: 1,
      requestedBy: 'firestore-trigger',
      reason: 'templateUpdated',
    });
    const { enqueue } = createFunctionsMocks();

    await enqueueTournamentTasksReplanTask(new Date('2026-04-01T00:00:00.000Z'));

    expect(enqueue).toHaveBeenCalledTimes(0);
    expect(requestRef.set).toHaveBeenCalledTimes(0);
  });

  it('明示範囲付き request から 60秒遅延 task を投入し processing に更新する', async () => {
    const requestRef = mockRequestSnapshot(true, {
      isProcessing: false,
      aggregateVersion: 2,
      requestedBy: 'firestore-trigger',
      reason: 'templateUpdated',
      targetRangeStartAt: {
        toDate: () => new Date('2026-03-31T18:00:00.000Z'),
      },
      targetRangeEndAt: {
        toDate: () => new Date('2026-04-14T18:00:00.000Z'),
      },
    });
    const { enqueue, taskQueue } = createFunctionsMocks();
    const now = new Date('2026-04-01T00:00:00.000Z');

    await enqueueTournamentTasksReplanTask(now);

    expect(taskQueue).toHaveBeenCalledWith(
      'locations/asia-northeast1/functions/scheduled-job-enqueue-tournament-tasks-by-scheduler'
    );
    expect(enqueue).toHaveBeenCalledTimes(1);

    const [payload, options] = enqueue.mock.calls[0];
    expect(payload).toMatchObject({
      jobKey: 'enqueueTournamentTasksByScheduler',
      planningDate: '2026-04-01',
      supervisorRunId: 'replan_2026-04-01T00:00:00.000Z',
      projectId: 'test-project',
      targetScope: {
        rangeStartAt: '2026-03-31T18:00:00.000Z',
        rangeEndAt: '2026-04-14T18:00:00.000Z',
      },
    });
    expect(options).toMatchObject({
      scheduleDelaySeconds: 60,
      dispatchDeadlineSeconds: 300,
    });

    expect(mockServerTimestamp).toHaveBeenCalledTimes(1);
    expect(requestRef.set).toHaveBeenCalledTimes(1);
    expect(requestRef.set).toHaveBeenCalledWith(
      {
        isProcessing: true,
        lastTriggeredAt: 'SERVER_TIMESTAMP',
      },
      { merge: true }
    );
  });

  it('範囲が未指定なら now-6h / now+14d を既定値として投入する', async () => {
    mockRequestSnapshot(true, {
      isProcessing: false,
      aggregateVersion: 1,
      requestedBy: 'manual-callable',
      reason: 'manual',
    });
    const { enqueue } = createFunctionsMocks();
    const now = new Date('2026-04-01T00:00:00.000Z');

    await enqueueTournamentTasksReplanTask(now);

    const [payload] = enqueue.mock.calls[0];
    expect(payload.targetScope).toEqual({
      rangeStartAt: '2026-03-31T18:00:00.000Z',
      rangeEndAt: '2026-04-15T00:00:00.000Z',
    });
  });

  it('ALREADY_EXISTS は成功扱いで swallow し processing 更新しない', async () => {
    const requestRef = mockRequestSnapshot(true, {
      isProcessing: false,
      aggregateVersion: 1,
      requestedBy: 'manual-callable',
      reason: 'manual',
    });
    const { enqueue } = createFunctionsMocks();
    enqueue.mockRejectedValue({ code: '6', message: 'ALREADY_EXISTS' });

    await expect(
      enqueueTournamentTasksReplanTask(new Date('2026-04-01T00:00:00.000Z'))
    ).resolves.toBeUndefined();

    expect(requestRef.set).toHaveBeenCalledTimes(0);
  });

  it('ALREADY_EXISTS 以外の失敗は throw する', async () => {
    mockRequestSnapshot(true, {
      isProcessing: false,
      aggregateVersion: 1,
      requestedBy: 'manual-callable',
      reason: 'manual',
    });
    const { enqueue } = createFunctionsMocks();
    enqueue.mockRejectedValue(new Error('enqueue failed'));

    await expect(
      enqueueTournamentTasksReplanTask(new Date('2026-04-01T00:00:00.000Z'))
    ).rejects.toThrow('enqueue failed');
  });
});
