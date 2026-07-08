import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { normalizeStaffStatus } from '../helpers/staffStatus';
import { linkStaffRichMenu } from '../../webhook/services/lineRichMenu';

/**
 * 退職済みスタッフが LIFF から再登録する
 */
export const reactivateStaffAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です。再度ログインしてください。');
  }

  const uid = request.auth.uid;
  const { fullName, fullNameKana, email, phoneNumber, birthMonthDay } = request.data as {
    fullName?: string;
    fullNameKana?: string;
    email?: string;
    phoneNumber?: string;
    birthMonthDay?: string;
  };

  if (!fullName || !fullNameKana || !email || !phoneNumber || !birthMonthDay) {
    throw new HttpsError('invalid-argument', '入力情報が不足しています。全ての項目を入力してください。');
  }

  if (!/^\d{4}$/.test(birthMonthDay)) {
    throw new HttpsError('invalid-argument', '誕生日は4桁の数字（MMDD）で入力してください。');
  }

  const phoneRegExp = /^(0[5789]0\d{8}|0[1-9]\d{8,9})$/;
  if (!phoneRegExp.test(phoneNumber)) {
    throw new HttpsError('invalid-argument', '無効な電話番号形式です（ハイフンなしで10〜11桁）');
  }

  const kanaRegExp = /^[ぁ-んァ-ヶー]+$/;
  if (!kanaRegExp.test(fullNameKana)) {
    throw new HttpsError('invalid-argument', 'かなはひらがなまたはカタカナで入力してください。');
  }

  const logContext: Record<string, unknown> = { uid, fullNameKana };

  try {
    const staffRef = admin.firestore().collection('staffs').doc(uid);
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
      throw new HttpsError('failed-precondition', '再登録対象のスタッフが見つかりません', {
        errorKey: 'STAFF_NOT_RETIRED',
      });
    }

    if (normalizeStaffStatus(staffSnap.data()) !== 'retired') {
      throw new HttpsError('failed-precondition', '退職済みスタッフのみ再登録できます', {
        errorKey: 'STAFF_NOT_RETIRED',
      });
    }

    const existing = await admin
      .firestore()
      .collection('staffs')
      .where('fullNameKana', '==', fullNameKana)
      .limit(2)
      .get();

    const duplicate = existing.docs.find((doc) => doc.id !== uid);
    if (duplicate) {
      throw new HttpsError('already-exists', 'このスタッフ名は既に使用されています。別のスタッフ名に変更してください。');
    }

    const loginId = fullNameKana + birthMonthDay;
    const { generateQRData, generateQRImage, saveQRCodeToStorage } = await import(
      '../../user/services/qrCodeUtils'
    );
    const qrData = await generateQRData(uid, loginId, 'staff');
    const qrCodeImage = await generateQRImage(qrData);
    const expiresAt = qrData.timestamp + 10 * 60 * 1000;
    const qrCodeUrl = await saveQRCodeToStorage(uid, qrCodeImage, 'staff');

    await staffRef.update({
      status: 'active',
      fullName,
      fullNameKana,
      email,
      phoneNumber,
      birthMonthDay,
      loginId,
      qrCodeUrl,
      qrExpiresAt: admin.firestore.Timestamp.fromDate(new Date(expiresAt)),
      retiredAt: admin.firestore.FieldValue.delete(),
      retiredDate: admin.firestore.FieldValue.delete(),
      retiredReason: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      await linkStaffRichMenu(uid);
    } catch (richMenuError) {
      logger.warn('reactivateStaffAccount: rich menu link failed (non-fatal)', {
        uid,
        richMenuErrorMessage:
          richMenuError instanceof Error ? richMenuError.message : String(richMenuError),
      });
    }

    logOpsSuccess({
      message: 'reactivateStaffAccount 成功',
      functionEntry: 'reactivateStaffAccount',
      context: { uid, loginId, fullNameKana },
    });

    return {
      success: true,
      uid,
      qrCode: qrCodeImage,
      qrCodeUrl,
      expiresAt,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: 'reactivateStaffAccount エラー',
      functionEntry: 'reactivateStaffAccount',
      cause: error,
      context: logContext,
    });
    throw new HttpsError('internal', '再登録に失敗しました。しばらく時間をおいて再度お試しください。');
  }
});
