import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logErrorShapeObservation } from './serializeErrorForProbe';
import { requireProbeAdmin } from './requireProbeAdmin';

const PROBE_COLLECTION = '_errorShapeProbe';

/**
 * Firestore Admin SDK 経由で、無効な Query パラメータ（limit < 1）により
 * INVALID_ARGUMENT 系のエラーを誘発し、オブジェクト shape を観察する。
 * 読み取りのみ。既存の NOT_FOUND(update) probe とは別経路。
 */
export const probeFirestoreErrorShapeInvalidArgument = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }
  await requireProbeAdmin(request.auth.uid);

  try {
    const db = getFirestore();
    await db.collection(PROBE_COLLECTION).limit(-1).get();
    throw new HttpsError('internal', 'expected Firestore INVALID_ARGUMENT did not occur');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    logErrorShapeObservation('firestoreInvalidArgument', e);
    return {
      ok: false,
      probe: 'firestoreInvalidArgument',
    };
  }
});
