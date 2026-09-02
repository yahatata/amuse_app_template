import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:flutter/widgets.dart';
import 'dart:convert';

/// Attendance 利用者向けの固定文言・薄いヘルパー（Phase 5 ATT）。
///
/// Callable は D-1（[mapCallableError] / [mapCallableSoftFailMessage] /
/// [isCallableSuccessResponse]）へ委譲する。raw message / toString /
/// snapshot.error / UID / path は表示しない。

/// 勤怠一覧・読込失敗（ATT-09 / ATT-20）。空一覧とは別。
const String kAttendanceDataLoadFailedMessage =
    '勤怠情報を取得できませんでした。画面を更新して再度お試しください。';

/// スタッフ一覧の Firestore 読込失敗（ATT-13）。
const String kAttendanceStaffListLoadFailedMessage =
    'スタッフ一覧を取得できませんでした。画面を更新して再度お試しください。';

/// 休憩一覧の Firestore 読込失敗（ATT-12）。空一覧とは別。
const String kAttendanceBreaksLoadFailedMessage =
    '休憩情報を取得できませんでした。画面を更新して再度お試しください。';

/// QR 解析失敗の最終文言（ATT-01）。QR 内容・内部例外は含めない。
const String kAttendanceQrParseFailedMessage =
    'QRコードを読み取れませんでした。もう一度スキャンしてください。';

const String kAttendanceQrMissingFieldsMessage =
    'QRコードに必要な情報が含まれていません';

const String kAttendanceQrNotStaffMessage = 'このQRコードはスタッフ用ではありません';

const String kAttendanceQrExpiredMessage = 'QRコードの有効期限が切れています';

const String kAttendanceQrInvalidFormatMessage =
    'QRコードデータの形式が正しくありません';

/// スタッフ名未設定／ドキュメントなし（正常に取得できた欠落）。
const String kAttendanceStaffNameMissing = '不明';

const String kAttendanceStaffNameUnknownMessage = kAttendanceStaffNameMissing;

/// Firestore 読込失敗（欠落と区別）。
const String kAttendanceStaffNameLoadFailedMessage = 'スタッフ名を取得できません';

const String kAttendanceStaffNameUnavailableMessage =
    kAttendanceStaffNameLoadFailedMessage;

/// 修正申請一覧の読込失敗（ATT-15）。
const String kAttendanceCorrectionRequestsLoadFailedMessage =
    '修正申請一覧を取得できませんでした。画面を更新して再度お試しください。';

/// 管理者勤怠一覧 Stream 失敗（ATT-20）。
const String kAttendanceListStreamFailedMessage = kAttendanceDataLoadFailedMessage;

/// QR 解析用の利用者向け例外（raw / QR 本文を載せない）。
class AttendanceQrParseException implements Exception {
  final String userMessage;

  const AttendanceQrParseException(this.userMessage);

  @override
  String toString() => userMessage;
}

/// QR 解析例外を利用者文言へ（ATT-01）。
String mapAttendanceQrParseError(Object exception) {
  if (exception is AttendanceQrParseException) {
    return exception.userMessage;
  }
  return kAttendanceQrParseFailedMessage;
}

/// QR から staffId を抽出する（Firebase 非依存・ATT-01）。
///
/// 失敗時は [AttendanceQrParseException]。QR 本文・内部例外は載せない。
String extractStaffIdFromAttendanceQr(String qrData) {
  try {
    final decoded = json.decode(qrData);
    if (decoded is! Map) {
      throw const AttendanceQrParseException(kAttendanceQrInvalidFormatMessage);
    }
    final Map<String, dynamic> qrDataMap = Map<String, dynamic>.from(decoded);

    if (!qrDataMap.containsKey('uid') ||
        !qrDataMap.containsKey('type') ||
        !qrDataMap.containsKey('timestamp')) {
      throw const AttendanceQrParseException(kAttendanceQrMissingFieldsMessage);
    }

    if (qrDataMap['type'] != 'staff') {
      throw const AttendanceQrParseException(kAttendanceQrNotStaffMessage);
    }

    final timestampRaw = qrDataMap['timestamp'];
    if (timestampRaw is! int) {
      throw const AttendanceQrParseException(kAttendanceQrInvalidFormatMessage);
    }
    final now = DateTime.now().millisecondsSinceEpoch;
    final expiryTime = timestampRaw + (10 * 60 * 1000);

    if (now > expiryTime) {
      throw const AttendanceQrParseException(kAttendanceQrExpiredMessage);
    }

    final uid = qrDataMap['uid'];
    if (uid is! String || uid.isEmpty) {
      throw const AttendanceQrParseException(kAttendanceQrMissingFieldsMessage);
    }
    return uid;
  } on AttendanceQrParseException {
    rethrow;
  } on FormatException {
    throw const AttendanceQrParseException(kAttendanceQrInvalidFormatMessage);
  } catch (_) {
    throw const AttendanceQrParseException(kAttendanceQrParseFailedMessage);
  }
}

/// 勤怠 Callable hard-fail の利用者向け例外（メッセージのみ保持）。
class AttendanceUserFacingException implements Exception {
  final String userMessage;

  const AttendanceUserFacingException(this.userMessage);

  @override
  String toString() => userMessage;
}

/// 勤怠 Callable hard-fail の利用者向け文言。
String mapAttendanceCallableError(
  Object exception, {
  required String operation,
}) {
  if (exception is AttendanceUserFacingException) {
    return exception.userMessage;
  }
  return mapCallableError(exception, operation: operation).message;
}

/// soft-fail / 不正 shape の利用者向け文言。
String mapAttendanceCallableSoftFail(
  Object? data, {
  String? operation,
}) {
  return mapCallableSoftFailMessage(data, operation: operation);
}

/// StreamBuilder の hasError 判定（ATT-20）。
bool attendanceListStreamHasError(AsyncSnapshot<Object?> snapshot) {
  return snapshot.hasError;
}

/// Stream エラー文言。raw [snapshot.error] は使わない（ATT-20）。
String attendanceListStreamErrorMessage([Object? error]) {
  return kAttendanceListStreamFailedMessage;
}
