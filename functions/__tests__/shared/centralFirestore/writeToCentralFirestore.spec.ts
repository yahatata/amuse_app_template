import { logger } from 'firebase-functions';
import {
  writeCentralErrorLog,
  writeCentralSchedulerLog,
  writeCentralTaskLog,
} from '../../../src/shared/centralFirestore/writeToCentralFirestore';

const mockAdd = jest.fn();
const mockCollection = jest.fn();
const mockDoc = jest.fn();

jest.mock('firebase-admin/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: 'centralMonitoring' })),
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  },
}));

jest.mock('firebase-functions', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAdd.mockResolvedValue({ id: 'new-doc-id' });
  mockDoc.mockReturnValue({ collection: jest.fn().mockReturnValue({ add: mockAdd }) });
  mockCollection.mockReturnValue({ doc: mockDoc });
});

describe('writeCentralErrorLog', () => {
  it('CENTRAL_PROJECT_ID が未設定のときは何もしない', async () => {
    delete process.env.CENTRAL_PROJECT_ID;
    await writeCentralErrorLog('store-a', { message: 'err' });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('CENTRAL_PROJECT_ID が設定されていると Firestore add を呼ぶ', async () => {
    process.env.CENTRAL_PROJECT_ID = 'amuse-central-monitoring';
    await writeCentralErrorLog('store-a', { message: 'test error', errorSource: 'internal' });
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const written = mockAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(written).toMatchObject({
      storeId: 'store-a',
      message: 'test error',
      errorSource: 'internal',
      isResolved: false,
    });
    delete process.env.CENTRAL_PROJECT_ID;
  });

  it('Firestore add が失敗してもエラーを伝播しない', async () => {
    process.env.CENTRAL_PROJECT_ID = 'amuse-central-monitoring';
    mockAdd.mockRejectedValueOnce(new Error('network error'));
    await expect(writeCentralErrorLog('store-a', {})).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    delete process.env.CENTRAL_PROJECT_ID;
  });
});

describe('writeCentralSchedulerLog', () => {
  it('CENTRAL_PROJECT_ID が未設定のときは何もしない', async () => {
    delete process.env.CENTRAL_PROJECT_ID;
    await writeCentralSchedulerLog('store-b', { jobKey: 'weeklyPlanner' });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('storeId と data を含んで Firestore add を呼ぶ', async () => {
    process.env.CENTRAL_PROJECT_ID = 'amuse-central-monitoring';
    await writeCentralSchedulerLog('store-b', { jobKey: 'weeklyPlanner', eventType: 'start' });
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const written = mockAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(written).toMatchObject({
      storeId: 'store-b',
      jobKey: 'weeklyPlanner',
      eventType: 'start',
    });
    delete process.env.CENTRAL_PROJECT_ID;
  });
});

describe('writeCentralTaskLog', () => {
  it('CENTRAL_PROJECT_ID が未設定のときは何もしない', async () => {
    delete process.env.CENTRAL_PROJECT_ID;
    await writeCentralTaskLog('store-c', { functionEntry: 'appendItem' });
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('storeId と data を含んで Firestore add を呼ぶ', async () => {
    process.env.CENTRAL_PROJECT_ID = 'amuse-central-monitoring';
    await writeCentralTaskLog('store-c', { functionEntry: 'appendItem', eventType: 'success' });
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const written = mockAdd.mock.calls[0][0] as Record<string, unknown>;
    expect(written).toMatchObject({
      storeId: 'store-c',
      functionEntry: 'appendItem',
      eventType: 'success',
    });
    delete process.env.CENTRAL_PROJECT_ID;
  });
});
