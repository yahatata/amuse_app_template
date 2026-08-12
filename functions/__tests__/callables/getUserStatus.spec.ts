/**
 * getUserStatus: 認証必須・auth UID のみ照会
 *
 * Firestore は admin.firestore をモックし、emulator 無しで検証する。
 */
const mockUserGet = jest.fn();
const mockStayGet = jest.fn();

jest.mock('firebase-admin', () => {
  const firestoreFn = () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: () => {
          if (name === 'users') return mockUserGet(id);
          if (name === 'activeStays') return mockStayGet(id);
          return Promise.resolve({ exists: false, data: () => undefined });
        },
      }),
    }),
  });
  return {
    firestore: Object.assign(firestoreFn, {
      Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
    }),
  };
});

import { HttpsError } from 'firebase-functions/v2/https';
import { getUserStatus } from '../../src/domains/user/callables/getUserStatus';

function snap(exists: boolean, data?: Record<string, unknown>) {
  return {
    exists,
    data: () => (exists ? data || {} : undefined),
  };
}

describe('getUserStatus auth / UID / activeStays', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('request.auth なし → unauthenticated', async () => {
    await expect(
      (getUserStatus as any).run({ auth: null, data: {} })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mockUserGet).not.toHaveBeenCalled();
  });

  it('auth UID と異なる data.uid → permission-denied（他人照会不可）', async () => {
    await expect(
      (getUserStatus as any).run({
        auth: { uid: 'auth-user-1' },
        data: { uid: 'other-user-2' },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mockUserGet).not.toHaveBeenCalled();
  });

  it('auth UID の入店状態を返す（active → true）', async () => {
    const uid = 'user-staying-1';
    mockUserGet.mockResolvedValue(
      snap(true, { loginId: 'login1', pokerName: 'Alice' })
    );
    mockStayGet.mockResolvedValue(snap(true, { isActive: true }));

    const result = await (getUserStatus as any).run({
      auth: { uid },
      data: { uid },
    });

    expect(mockUserGet).toHaveBeenCalledWith(uid);
    expect(mockStayGet).toHaveBeenCalledWith(uid);
    expect(result.success).toBe(true);
    expect(result.user.isStaying).toBe(true);
    expect(typeof result.user.isStaying).toBe('boolean');
    expect(result.user.uid).toBe(uid);
    expect(result.user.pokerName).toBe('Alice');
  });

  it('data.uid 省略時も auth UID を照会', async () => {
    const uid = 'auth-only-uid';
    mockUserGet.mockResolvedValue(snap(true, { loginId: 'x', pokerName: 'X' }));
    mockStayGet.mockResolvedValue(snap(false));

    const result = await (getUserStatus as any).run({
      auth: { uid },
      data: {},
    });

    expect(mockUserGet).toHaveBeenCalledWith(uid);
    expect(result.success).toBe(true);
    expect(result.user.isStaying).toBe(false);
  });

  it('activeStays なし → isStaying false', async () => {
    mockUserGet.mockResolvedValue(snap(true, { loginId: 'a', pokerName: 'A' }));
    mockStayGet.mockResolvedValue(snap(false));

    const result = await (getUserStatus as any).run({
      auth: { uid: 'u1' },
      data: {},
    });
    expect(result.success).toBe(true);
    expect(result.user.isStaying).toBe(false);
  });

  it('activeStays.isActive !== true → isStaying false', async () => {
    mockUserGet.mockResolvedValue(snap(true, { loginId: 'a', pokerName: 'A' }));
    mockStayGet.mockResolvedValue(snap(true, { isActive: false }));

    const result = await (getUserStatus as any).run({
      auth: { uid: 'u1' },
      data: {},
    });
    expect(result.success).toBe(true);
    expect(result.user.isStaying).toBe(false);
  });

  it('user doc なし → soft-fail success false（error 文字列のみ・userなし）', async () => {
    mockUserGet.mockResolvedValue(snap(false));

    const result = await (getUserStatus as any).run({
      auth: { uid: 'missing' },
      data: {},
    });
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('user');
    expect(typeof result.error).toBe('string');
  });

  it('Firestore 失敗 → soft-fail（HttpsError は再throw）', async () => {
    mockUserGet.mockRejectedValue(new Error('firestore down'));

    const result = await (getUserStatus as any).run({
      auth: { uid: 'u1' },
      data: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('ユーザー状態の取得に失敗しました。');
  });

  it('catch 内の HttpsError は soft-fail にせず再throw', async () => {
    mockUserGet.mockImplementation(() => {
      throw new HttpsError('internal', 'should-rethrow');
    });

    await expect(
      (getUserStatus as any).run({
        auth: { uid: 'u1' },
        data: {},
      })
    ).rejects.toMatchObject({ code: 'internal' });
  });
});
