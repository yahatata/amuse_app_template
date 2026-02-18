/**
 * Phase6 Step3: 開店ターミナル Callable。
 * verifyPreconditions → forceCleanup（必要に応じて）→ finalizeOpenStateDoc を順次実行する。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requireAdmin } from '../../../shared/devices';
import { acquireProcessing, extendProcessing, releaseProcessing } from '../services/processingLease';
import { generateJstDateKey } from '../../../shared/time';

const OPEN_STEPS = ['verifyPreconditions', 'forceCleanup', 'finalizeOpenStateDoc'] as const;

export const openStoreTerminal = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const stateRef = db.collection('storeMeta').doc('currentBusinessDay');
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      throw new HttpsError(
        'invalid-argument',
        'storeMeta/currentBusinessDay が存在しません。初期化を実行してください。'
      );
    }

    const stateData = stateSnap.data()!;
    const status = stateData.status as string | undefined;

    if (status !== 'closed' && status !== 'error') {
      throw new HttpsError(
        'invalid-argument',
        `開店可能な状態ではありません。status: ${status}`
      );
    }

    const data = request.data as { runId?: string; businessDateKey?: string } | undefined;
    const requestRunId =
      data?.runId != null && typeof data.runId === 'string' ? data.runId.trim() : undefined;
    const businessDateKey =
      data?.businessDateKey != null && typeof data.businessDateKey === 'string'
        ? data.businessDateKey.trim()
        : generateJstDateKey();
    const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateKeyPattern.test(businessDateKey)) {
      throw new HttpsError('invalid-argument', 'businessDateKey は YYYY-MM-DD 形式である必要があります');
    }

    const runId =
      requestRunId && requestRunId.length > 0
        ? requestRunId
        : `open_${businessDateKey}_${Date.now()}`;

    try {
      await acquireProcessing(db, { runId, kind: 'open', requestRunId: requestRunId ?? null });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw new HttpsError('internal', `processing 獲得に失敗しました: ${e}`);
    }

    // 仕様: storeMeta/openRuns/{runId}。Firestore は col/doc/col/doc のため openRuns を doc とし、その下に runs サブコレで run を格納。
    const openRunsRef = db.collection('storeMeta').doc('openRuns').collection('runs').doc(runId);

    const runDocSnap = await openRunsRef.get();
    if (!runDocSnap.exists) {
      await openRunsRef.set({
        status: 'running',
        openedBusinessDate: businessDateKey,
        startedAt: Timestamp.now(),
        lastCompletedStep: null,
        failedStep: null,
        lastErrorSummary: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await openRunsRef.update({
        status: 'running',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const runDocAfter = await openRunsRef.get();
    const lastCompleted = (runDocAfter.data()?.lastCompletedStep as string | null) ?? null;
    const startStepIndex = lastCompleted
      ? Math.min(OPEN_STEPS.indexOf(lastCompleted as (typeof OPEN_STEPS)[number]) + 1, OPEN_STEPS.length)
      : 0;

    for (let i = startStepIndex; i < OPEN_STEPS.length; i++) {
      const stepName = OPEN_STEPS[i];
      const attemptId = `attempt_${Date.now()}`;
      const attemptRef = openRunsRef
        .collection('steps')
        .doc(stepName)
        .collection('attempts')
        .doc(attemptId);

      await attemptRef.set({
        attemptId,
        startedAt: Timestamp.now(),
        result: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      try {
        if (stepName === 'verifyPreconditions') {
          const snap = await stateRef.get();
          const s = snap.data()?.status as string | undefined;
          if (s !== 'closed' && s !== 'error') {
            throw new HttpsError('invalid-argument', `開店前提条件を満たしません。status: ${s}`);
          }
          await openRunsRef.update({
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (stepName === 'forceCleanup') {
          const activeStaysSnap = await db
            .collection('activeStays')
            .where('isActive', '==', true)
            .get();

          const counts: Record<string, number> = {};
          const summaries: Record<string, string> = {};

          if (activeStaysSnap.size > 0) {
            for (const doc of activeStaysSnap.docs) {
              await doc.ref.delete();
            }
            counts['activeStays'] = activeStaysSnap.size;
            summaries['activeStays'] = `isActive=true のまま残っていた ${activeStaysSnap.size} 件を削除`;
          }

          await openRunsRef.update({
            lastCompletedStep: stepName,
            forceCleanupApplied: { counts, summaries },
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (stepName === 'finalizeOpenStateDoc') {
          const currentData = (await stateRef.get()).data()!;
          await stateRef.update({
            status: 'running',
            currentBusinessDateKey: businessDateKey,
            lastClosedBusinessDateKey: currentData?.lastClosedBusinessDateKey ?? null,
            updatedAt: FieldValue.serverTimestamp(),
            source: 'terminal',
            lastError: null,
            processing: FieldValue.delete(),
            // 正常開店時は開店認定のみクリアする（closeAssessment はクリアしない）
            openAssessment: null,
          });
          await openRunsRef.update({
            status: 'completed',
            completedAt: Timestamp.now(),
            lastCompletedStep: stepName,
            updatedAt: FieldValue.serverTimestamp(),
          });
          await releaseProcessing(db, { runId });

          return {
            success: true,
            runId,
            status: 'completed',
            businessDateKey,
            message: `${businessDateKey} の営業を開始しました。`,
          };
        }

        await attemptRef.update({
          result: 'success',
          completedAt: Timestamp.now(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        await extendProcessing(db, { runId, kind: 'open' });
      } catch (stepError) {
        const err = stepError instanceof Error ? stepError : new Error(String(stepError));
        const errMsg = err.message.slice(0, 200);
        const errCode = stepError instanceof HttpsError ? stepError.code : 'internal';

        await attemptRef.update({
          result: 'failed',
          completedAt: Timestamp.now(),
          error: { code: errCode, message: errMsg },
          updatedAt: FieldValue.serverTimestamp(),
        });
        await openRunsRef.update({
          status: 'failed',
          failedStep: stepName,
          lastErrorSummary: errMsg,
          lastCompletedStep: i > 0 ? OPEN_STEPS[i - 1] : null,
          updatedAt: FieldValue.serverTimestamp(),
        });

        await releaseProcessing(db, { runId });

        throw new HttpsError(
          stepError instanceof HttpsError ? stepError.code : 'internal',
          `開店処理がステップ「${stepName}」で失敗しました。再開可能です。${errMsg}`,
          { runId }
        );
      }
    }

    return {
      success: true,
      runId,
      status: 'completed',
      businessDateKey,
      message: `${businessDateKey} の営業を開始しました。`,
    };
  }
);
