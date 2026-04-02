import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logErrorShapeObservation } from './serializeErrorForProbe';
import { requireProbeAdmin } from './requireProbeAdmin';

const PROBE_COLLECTION = '_errorShapeProbe';
const PROBE_DOC_ID = 'intentionally_missing_doc';

/**
 * Firestore Admin SDK 経由で、存在しないドキュメントに対して update() のみ実行し、
 * 発生したエラーオブジェクトの shape を観察する（delete は使わない）。
 */
export const probeFirestoreErrorShape = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }
  await requireProbeAdmin(request.auth.uid);

  try {
    const db = getFirestore();
    await db.collection(PROBE_COLLECTION).doc(PROBE_DOC_ID).update({ _probe: true });
    throw new HttpsError('internal', 'expected Firestore error did not occur');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    logErrorShapeObservation('firestore', e);
    return {
      ok: false,
      probe: 'firestore',
    };
  }
});
