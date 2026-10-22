/// FirebaseFunctionsException.details / soft-fail Map からの安全な抽出。
///
/// 型cast 失敗では throw せず null / 空扱いとする。
class CallableErrorDetails {
  final String? errorKey;
  final String? code;
  final Map<String, Object?>? context;

  const CallableErrorDetails({
    this.errorKey,
    this.code,
    this.context,
  });
}

/// [details] から errorKey / context を安全に読む。
///
/// context は将来の表示用。UserFacingError には載せない。
CallableErrorDetails parseCallableErrorDetails(Object? details) {
  if (details == null) {
    return const CallableErrorDetails();
  }
  if (details is! Map) {
    return const CallableErrorDetails();
  }

  return CallableErrorDetails(
    errorKey: _readNonEmptyString(details['errorKey']),
    code: _readNonEmptyString(details['code']),
    context: _readStringKeyedMap(details['context']),
  );
}

/// soft-fail レスポンス Map 向け。error / message は読まない。
CallableErrorDetails parseSoftFailErrorDetails(Object? data) {
  if (data == null || data is! Map) {
    return const CallableErrorDetails();
  }
  return CallableErrorDetails(
    errorKey: _readNonEmptyString(data['errorKey']),
    code: _readNonEmptyString(data['code']),
    context: _readStringKeyedMap(data['context']),
  );
}

String? _readNonEmptyString(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  if (trimmed.isEmpty) return null;
  return trimmed;
}

Map<String, Object?>? _readStringKeyedMap(Object? value) {
  if (value == null || value is! Map) return null;
  final out = <String, Object?>{};
  for (final entry in value.entries) {
    final key = entry.key;
    if (key is String) {
      out[key] = entry.value;
    } else if (key != null) {
      out[key.toString()] = entry.value;
    }
  }
  return out;
}
