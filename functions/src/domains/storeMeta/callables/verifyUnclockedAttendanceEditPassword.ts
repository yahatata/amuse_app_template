import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CallableRequest } from 'firebase-functions/v2/https';

const ENV_PASSWORD_KEY = 'UNCLOCKED_ATTENDANCE_EDIT_PASSWORD';

export const verifyUnclockedAttendanceEditPassword = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const { password } = (request.data ?? {}) as { password?: string };
  if (!password || typeof password !== 'string') {
    throw new HttpsError('invalid-argument', 'パスワードを入力してください');
  }

  const expectedPassword = process.env[ENV_PASSWORD_KEY];
  if (!expectedPassword || expectedPassword !== password) {
    throw new HttpsError('permission-denied', 'パスワードが一致しません');
  }

  return { success: true };
});
