import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
import { logErrorShapeObservation } from './serializeErrorForProbe';
import { requireProbeAdmin } from './requireProbeAdmin';

const PROBE_OBJECT_PATH = '_errorShapeProbe/does-not-exist.bin';

/**
 * Cloud Storage for Firebase: 存在しないオブジェクトに対して getMetadata() のみ実行（download は使わない）。
 */
export const probeStorageErrorShape = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }
  await requireProbeAdmin(request.auth.uid);

  try {
    const bucket = getStorage().bucket();
    await bucket.file(PROBE_OBJECT_PATH).getMetadata();
    throw new HttpsError('internal', 'expected Storage error did not occur');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    logErrorShapeObservation('storage', e);
    return {
      ok: false,
      probe: 'storage',
    };
  }
});
