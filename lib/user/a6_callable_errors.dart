import 'package:cloud_functions/cloud_functions.dart';

import 'package:amuse_app_template/core/errors/errors.dart';

/// A-6 Callable の `details.errorKey` → UI 表示文言。
const Map<String, String> kA6ErrorKeyMessages = {
  'UNAUTHENTICATED': '認証が必要です。再ログインしてからお試しください。',
  'PERMISSION_DENIED': 'この操作には管理者端末の権限が必要です。',
  'INVALID_ARGUMENT': '入力内容が不正です。値を確認してください。',
  'CONFIRMATION_REQUIRED': '同一人物確認または上書き確認が必要です。',
  'INVALID_BALANCE': 'ポイントは0以上の整数で入力してください。',
  'TARGET_USER_NOT_FOUND': '移行先ユーザーが見つかりません。',
  'SOURCE_USER_NOT_FOUND': '移行元ユーザーが見つかりません。',
  'SOURCE_USER_NOT_STORE_MANAGED': '移行元は店舗管理ユーザーである必要があります。',
  'TARGET_USER_NOT_LINE': '移行先はLINEユーザーである必要があります。',
  'INVALID_USER_TYPE': 'ユーザー種別が不正、または未設定です。',
  'USER_MIGRATED': '移行済みユーザーには操作できません。',
  'USER_ALREADY_MIGRATED': 'この店舗管理ユーザーは既に別のLINEユーザーへ移行済みです。',
  'USER_HAS_ACTIVE_STAY': '入店中のため移行できません。退店後に再試行してください。',
  'USER_HAS_UNSETTLED_BILL': '未精算の伝票があるため移行できません。',
  'USER_HAS_POST_SETTLEMENT_PENDING': '会計後の未完了処理があるため移行できません。',
  'USER_HAS_ACTIVE_TABLE_SEAT': 'テーブル着席中のため移行できません。',
  'USER_HAS_ACTIVE_TOURNAMENT': '進行中のトーナメント参加があるため移行できません。',
  'USER_HAS_SIDE_GAME_SEAT': 'サイドゲーム着席中のため移行できません。',
  'USER_HAS_PENDING_OKIBAKE_LINK': '置きバケの進行中リンクがあるため移行できません。',
  'IDEMPOTENCY_CONFLICT': '同一操作の再送で内容が不一致です。画面を更新してやり直してください。',
  'INTERNAL': 'サーバーで予期せぬエラーが発生しました。',
};

String? extractA6ErrorKey(Object error) {
  if (error is! FirebaseFunctionsException) return null;
  final details = error.details;
  if (details is Map && details['errorKey'] is String) {
    return details['errorKey'] as String;
  }
  return null;
}

/// A-6 Callable 失敗時の SnackBar 文言。
///
/// 既知 [kA6ErrorKeyMessages] は維持し、未知時のみ D-1 [mapCallableError] へ委譲する。
/// Functions の raw message / `$error` は表示しない。
String formatA6CallableError(Object error) {
  final key = extractA6ErrorKey(error);
  if (key != null) {
    final known = kA6ErrorKeyMessages[key];
    if (known != null) return known;
  }
  return mapCallableError(error).message;
}

/// 0以上の整数のみ許可。空欄・小数・負数・非数値は null。
int? parseNonNegativeIntInput(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  if (trimmed.contains('.') || trimmed.contains(',') || trimmed.contains('e') || trimmed.contains('E')) {
    return null;
  }
  final value = int.tryParse(trimmed);
  if (value == null || value < 0) return null;
  return value;
}
