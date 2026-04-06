import { getBusinessSecrets } from '../../src/shared/secrets/secretManager';
import { verifyOpenBusinessDateAdjustmentPassword } from '../../src/domains/storeMeta/callables/verifyOpenBusinessDateAdjustmentPassword';

jest.mock('../../src/shared/secrets/secretManager', () => ({
  getBusinessSecrets: jest.fn(),
}));

const mockedGetBusinessSecrets = getBusinessSecrets as jest.MockedFunction<
  typeof getBusinessSecrets
>;

describe('verifyOpenBusinessDateAdjustmentPassword', () => {
  beforeEach(() => {
    mockedGetBusinessSecrets.mockReset();
  });

  it('未認証は unauthenticated', async () => {
    await expect(
      verifyOpenBusinessDateAdjustmentPassword.run({
        auth: null,
        data: { password: 'x' },
      } as any)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('password 未指定は invalid-argument', async () => {
    await expect(
      verifyOpenBusinessDateAdjustmentPassword.run({
        auth: { uid: 'uid-1' },
        data: {},
      } as any)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('一致時は success=true', async () => {
    mockedGetBusinessSecrets.mockResolvedValue({
      qrSecretKey: 'qr',
      unclockedAttendanceEditPassword: 'u-pass',
      openBusinessDateAdjustmentPassword: 's2b',
    });

    const result = await verifyOpenBusinessDateAdjustmentPassword.run({
      auth: { uid: 'uid-1' },
      data: { password: 's2b' },
    } as any);

    expect(result).toEqual({ success: true });
  });

  it('不一致時は permission-denied', async () => {
    mockedGetBusinessSecrets.mockResolvedValue({
      qrSecretKey: 'qr',
      unclockedAttendanceEditPassword: 'u-pass',
      openBusinessDateAdjustmentPassword: 's2b',
    });

    await expect(
      verifyOpenBusinessDateAdjustmentPassword.run({
        auth: { uid: 'uid-1' },
        data: { password: 'wrong' },
      } as any)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
