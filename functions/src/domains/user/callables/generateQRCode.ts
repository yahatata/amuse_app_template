/**
 * QRコード生成（user / staff 統合）
 *
 * L5-A:
 * - HttpsError + details.errorKey
 * - success: true 追加（top-level 既存 field は維持 → user L2 互換）
 * - expiresAtMs / type を安定返却
 * - QR payload（data: {uid,loginId,timestamp,token,type}）は変更しない
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { GenerateQRResponse } from '../../../shared/types';
import { generateQRData, generateQRImage, saveQRCodeToStorage } from '../services/qrCodeUtils';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

type QrType = 'user' | 'staff';

function throwQrHttpsError(
  code: 'unauthenticated' | 'invalid-argument' | 'failed-precondition' | 'not-found' | 'permission-denied' | 'internal',
  errorKey: string,
  message: string,
): never {
  throw new HttpsError(code, message, { errorKey });
}

function getErrorKeyFromUnknown(error: unknown): string | undefined {
  if (error instanceof HttpsError) {
    const details = error.details as { errorKey?: unknown } | undefined;
    if (details && typeof details.errorKey === 'string') {
      return details.errorKey;
    }
  }
  return undefined;
}

export const generateQRCode = onCall(
  async (request): Promise<GenerateQRResponse & Record<string, unknown>> => {
    try {
      if (!request.auth) {
        throwQrHttpsError('unauthenticated', 'QR_UNAUTHENTICATED', 'Authentication required');
      }

      const uid = request.auth.uid;
      const typeRaw = request.data?.type;
      if (typeRaw !== 'user' && typeRaw !== 'staff') {
        throwQrHttpsError(
          'invalid-argument',
          'QR_INVALID_TYPE',
          'type must be user or staff',
        );
      }
      const type: QrType = typeRaw;

      let userData: FirebaseFirestore.DocumentData | undefined;
      let collectionName: 'users' | 'staffs';

      if (type === 'staff') {
        const staffDoc = await admin.firestore().collection('staffs').doc(uid).get();
        if (!staffDoc.exists) {
          throwQrHttpsError('not-found', 'STAFF_NOT_FOUND', 'Staff not found');
        }
        const { assertActiveStaff } = await import('../../staff/helpers/staffStatus');
        await assertActiveStaff(uid);
        userData = staffDoc.data();
        collectionName = 'staffs';
      } else {
        const userDoc = await admin.firestore().collection('users').doc(uid).get();
        if (!userDoc.exists) {
          throwQrHttpsError('not-found', 'USER_NOT_FOUND', 'User not found');
        }
        userData = userDoc.data();
        collectionName = 'users';
      }

      const loginId = userData?.loginID || userData?.loginId;
      if (!loginId || typeof loginId !== 'string') {
        throwQrHttpsError(
          'failed-precondition',
          type === 'staff' ? 'STAFF_INVALID_ARGUMENT' : 'USER_VISIT_QR_GENERATE_FAILED',
          'Login ID not found',
        );
      }

      const qrData = await generateQRData(uid, loginId, type);
      const qrCodeImage = await generateQRImage(qrData);

      const nowMs = Date.now();
      let expiresAtMs = nowMs + 10 * 60 * 1000;
      const expiresAtTs = admin.firestore.Timestamp.fromMillis(expiresAtMs);

      const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, type);

      const db = admin.firestore();
      const ref = db.collection(collectionName).doc(uid);

      try {
        const finalExpMs = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const current = (snap.get('qrExpiresAtMs') as number) || 0;

          if (current >= expiresAtMs) {
            tx.update(ref, {
              qrCodeUrl: qrCodeUrl,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return current;
          }

          tx.update(ref, {
            qrCodeUrl: qrCodeUrl,
            qrExpiresAt: expiresAtTs,
            qrExpiresAtMs: expiresAtMs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          return expiresAtMs;
        });

        expiresAtMs = finalExpMs;
      } catch (transactionError: unknown) {
        if (transactionError instanceof HttpsError) {
          throw transactionError;
        }
        logOpsError({
          message: 'QRコード生成トランザクションエラー',
          functionEntry: 'generateQRCode',
          operation: 'transaction',
          cause: transactionError,
          errorKey: 'USER_VISIT_QR_GENERATE_TRANSACTION_FAILED',
        });
        throwQrHttpsError(
          'internal',
          type === 'staff' ? 'QR_INTERNAL_ERROR' : 'USER_VISIT_QR_GENERATE_TRANSACTION_FAILED',
          'QR transaction failed',
        );
      }

      logOpsSuccess({
        message: 'generateQRCode 成功',
        functionEntry: 'generateQRCode',
        operation: 'generateAndPersistQr',
        context: { type, collectionName, expiresAtMs },
      });

      // 既存 L2: qrCode / qrCodeUrl / expiresAt / data(payload)
      // L5-A 追加: success / expiresAtMs / type（data の意味は payload のまま）
      return {
        success: true,
        qrCode: qrCodeImage,
        qrCodeUrl: qrCodeUrl,
        data: qrData,
        expiresAt: expiresAtMs,
        expiresAtMs,
        type,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        const errorKey = getErrorKeyFromUnknown(error);
        if (
          errorKey &&
          errorKey !== 'QR_INTERNAL_ERROR' &&
          errorKey !== 'USER_VISIT_QR_GENERATE_FAILED' &&
          errorKey !== 'USER_VISIT_QR_GENERATE_TRANSACTION_FAILED' &&
          error.code !== 'internal'
        ) {
          throw error;
        }
        logOpsError({
          message: 'QRコード生成エラー:',
          functionEntry: 'generateQRCode',
          operation: 'generateQRCodeOuterCatch',
          cause: error,
          errorKey: errorKey || 'USER_VISIT_QR_GENERATE_FAILED',
        });
        throw error;
      }

      logOpsError({
        message: 'QRコード生成エラー:',
        functionEntry: 'generateQRCode',
        operation: 'generateQRCodeOuterCatch',
        cause: error,
        errorKey: 'USER_VISIT_QR_GENERATE_FAILED',
      });

      throwQrHttpsError('internal', 'QR_INTERNAL_ERROR', 'QR generation failed');
    }
  },
);
