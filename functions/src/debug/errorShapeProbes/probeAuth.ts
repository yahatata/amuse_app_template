import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { logErrorShapeObservation } from './serializeErrorForProbe';
import { requireProbeAdmin } from './requireProbeAdmin';

/** 実在しないユーザーとして getUser するためのプレースホルダ UID（28 文字の英小文字） */
const NONEXISTENT_UID = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx';

/**
 * Firebase Auth Admin SDK で存在しない UID に対して getUser() し、エラー shape を観察する。
 */
export const probeAuthErrorShape = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }
  await requireProbeAdmin(request.auth.uid);

  try {
    await admin.auth().getUser(NONEXISTENT_UID);
    throw new HttpsError('internal', 'expected Auth error did not occur');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    logErrorShapeObservation('auth', e);
    return {
      ok: false,
      probe: 'auth',
    };
  }
});
