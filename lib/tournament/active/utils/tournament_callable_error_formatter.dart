import 'package:cloud_functions/cloud_functions.dart';

import 'package:amuse_app_template/core/errors/errors.dart';

/// Callable 業務拒否など、サーバーから返る既知 message のユーザー向け文言。
const Map<String, String> _knownOkibakeCallableMessages = {
  '置きバケ一時参加者が見つかりません':
      '対象の置きバケが見つかりません。画面を更新して再度お試しください。',
  '置きバケ一時参加者の状態が無効です':
      '現在の状態ではこの操作はできません。画面を更新して状態を確認してください。',
  '指定された席は使用中です':
      'この席はすでに使用されています。別の席を選んでください。',
  'Addon の上限に達しています': 'Addon の上限に達しています。',
  '卓側の置きバケ席情報と参加者が一致しません':
      '席情報に不整合があります。画面を更新して再度お試しください。',
  '置きバケはすでに伝票に紐付け済みです':
      'この置きバケはすでに伝票に紐付け済みです。',
  '置きバケの状態では伝票紐付けできません':
      '現在の状態ではこの操作はできません。画面を更新して状態を確認してください。',
  '来店情報が見つかりません':
      '来店情報が見つかりません。ユーザーが入店しているか確認してください。',
  '伝票が見つかりません':
      '伝票が見つかりません。ユーザーが入店しているか確認してください。',
  '来店情報と伝票が一致しません':
      '来店情報と伝票が一致しません。画面を更新して再度お試しください。',
  '伝票のユーザーと一致しません':
      '伝票のユーザーと一致しません。別の来店中ユーザーを選んでください。',
  'この伝票にはすでに同一トーナメントの参加情報があります':
      'この伝票にはすでに同一トーナメントの参加情報があります。',
  'この状態の伝票には紐付けできません':
      'この状態の伝票には紐付けできません。精算済みでないか確認してください。',
  '対象ユーザーはすでに設定されています':
      '対象ユーザーはすでに設定されています',
  '請求額と入金額が一致していません':
      '請求額と入金額が一致していません',
};

/// 既知 message をユーザー向け文言へ寄せる。未知は null。
String? lookupKnownTournamentCallableMessage(String message) {
  final trimmed = message.trim();
  if (trimmed.isEmpty) return null;
  return _knownOkibakeCallableMessages[trimmed];
}

/// 既知 message をユーザー向け文言へ寄せる（未知は入力をそのまま返す・互換用）。
///
/// UI 表示には [formatTournamentCallableError] を使うこと。
String mapKnownTournamentCallableMessage(String message) {
  final trimmed = message.trim();
  return lookupKnownTournamentCallableMessage(trimmed) ?? trimmed;
}

/// `failed-precondition: ...` 形式の先頭 code プレフィックスを除去する。
String stripCallableErrorCodePrefix(String text) {
  final match = RegExp(r'^[a-z0-9-]+:\s*(.+)$', dotAll: true).firstMatch(text.trim());
  if (match != null) {
    return match.group(1)!.trim();
  }
  return text.trim();
}

String _stripExceptionWrappers(String text) {
  var value = text.trim();
  if (value.startsWith('Exception: ')) {
    value = value.substring('Exception: '.length).trim();
  }
  value = stripCallableErrorCodePrefix(value);
  if (value.startsWith('Exception: ')) {
    value = value.substring('Exception: '.length).trim();
  }
  return stripCallableErrorCodePrefix(value);
}

/// Cloud Functions Callable エラーをスタッフ向け UI 用の短文へ整形する。
///
/// 既知 message 辞書は維持。未知時は raw message / toString を出さず D-1 へ委譲。
String formatTournamentCallableError(Object error) {
  if (error is FirebaseFunctionsException) {
    final message = error.message;
    if (message != null && message.trim().isNotEmpty) {
      final known = lookupKnownTournamentCallableMessage(message);
      if (known != null) return known;
    }
    return mapCallableError(error).message;
  }

  // 非 FFE: toString は既知辞書の照合にのみ使い、未知なら表示しない。
  final known = lookupKnownTournamentCallableMessage(
    _stripExceptionWrappers(error.toString()),
  );
  if (known != null) return known;
  return mapCallableError(error).message;
}

/// 置きバケ登録成功時の SnackBar 文言（replay 時も同一）。
String formatOkibakeRegisterSuccessMessage(String label) =>
    '置きバケを登録しました ($label)';
