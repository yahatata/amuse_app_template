/// errorKey / operation 向けの利用者文言カタログ。
///
/// D-2 以降はドメインごとにカタログを作り [ErrorMessageRegistry] へ登録する。
class ErrorMessageCatalog {
  /// errorKey のみの共通文言。
  final Map<String, String> byErrorKey;

  /// `errorKey` → (`operation` → message)。
  final Map<String, Map<String, String>> byErrorKeyAndOperation;

  const ErrorMessageCatalog({
    this.byErrorKey = const {},
    this.byErrorKeyAndOperation = const {},
  });

  /// operation 付きが無ければ null。
  String? messageFor({required String errorKey, String? operation}) {
    if (operation != null && operation.isNotEmpty) {
      final byOp = byErrorKeyAndOperation[errorKey];
      final opMessage = byOp?[operation];
      if (opMessage != null && opMessage.isNotEmpty) {
        return opMessage;
      }
    }
    final keyMessage = byErrorKey[errorKey];
    if (keyMessage != null && keyMessage.isNotEmpty) {
      return keyMessage;
    }
    return null;
  }

  ErrorMessageCatalog merge(ErrorMessageCatalog other) {
    final mergedKeys = <String, String>{
      ...byErrorKey,
      ...other.byErrorKey,
    };
    final mergedOps = <String, Map<String, String>>{};
    for (final entry in byErrorKeyAndOperation.entries) {
      mergedOps[entry.key] = Map<String, String>.from(entry.value);
    }
    for (final entry in other.byErrorKeyAndOperation.entries) {
      final existing = mergedOps[entry.key];
      if (existing == null) {
        mergedOps[entry.key] = Map<String, String>.from(entry.value);
      } else {
        existing.addAll(entry.value);
      }
    }
    return ErrorMessageCatalog(
      byErrorKey: mergedKeys,
      byErrorKeyAndOperation: mergedOps,
    );
  }
}

/// ドメイン辞書の登録先。UI / BuildContext に依存しない。
class ErrorMessageRegistry {
  ErrorMessageRegistry._();

  static final ErrorMessageRegistry instance = ErrorMessageRegistry._();

  final List<ErrorMessageCatalog> _catalogs = [];

  List<ErrorMessageCatalog> get catalogs => List.unmodifiable(_catalogs);

  void register(ErrorMessageCatalog catalog) {
    _catalogs.add(catalog);
  }

  /// unit test 用。本番画面からは呼ばない想定。
  void clear() {
    _catalogs.clear();
  }
}
