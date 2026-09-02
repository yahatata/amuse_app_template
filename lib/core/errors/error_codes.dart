/// Firebase Functions の `code` に対する共通利用者文言。
const Map<String, String> kFirebaseFunctionsCodeMessages = {
  'unauthenticated': '認証情報を確認できませんでした。再度ログインしてください。',
  'permission-denied': 'この操作の権限がありません。',
  'unavailable': '通信できません。接続を確認して再度お試しください。',
  'deadline-exceeded': '通信がタイムアウトしました。再度お試しください。',
  'internal': '処理中にエラーが発生しました。画面を更新して再度お試しください。',
  'invalid-argument': '入力内容を確認できませんでした。画面を更新して再度お試しください。',
  'failed-precondition': '現在の状態ではこの操作を実行できません。画面を更新してください。',
  'not-found': '対象のデータが見つかりません。画面を更新してください。',
  'already-exists': 'すでに処理済みです。画面を更新してください。',
};

/// errorKey / code のいずれにも当たらない場合の最終文言。
const String kFinalFallbackErrorMessage =
    '処理に失敗しました。画面を更新して再度お試しください。';

/// FirebaseFunctionsException.code を辞書照合用に正規化する。
///
/// 想定入力（unit test で固定）:
/// - `failed-precondition`
/// - `firebase_functions/failed-precondition`
/// - `[firebase_functions/failed-precondition]`
String? normalizeFirebaseFunctionsCode(String? raw) {
  if (raw == null) return null;
  var value = raw.trim();
  if (value.isEmpty) return null;

  if (value.startsWith('[') && value.endsWith(']')) {
    value = value.substring(1, value.length - 1).trim();
  }
  if (value.isEmpty) return null;

  final slash = value.lastIndexOf('/');
  if (slash >= 0 && slash < value.length - 1) {
    value = value.substring(slash + 1).trim();
  }
  if (value.isEmpty) return null;

  return value.toLowerCase();
}

String? messageForFirebaseFunctionsCode(String? rawCode) {
  final normalized = normalizeFirebaseFunctionsCode(rawCode);
  if (normalized == null) return null;
  return kFirebaseFunctionsCodeMessages[normalized];
}
