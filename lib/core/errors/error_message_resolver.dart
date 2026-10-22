import 'package:amuse_app_template/core/errors/error_codes.dart';
import 'package:amuse_app_template/core/errors/error_message_catalog.dart';
import 'package:amuse_app_template/core/errors/user_facing_error.dart';

/// errorKey → code → 最終共通 の順で文言を解決する。
class ErrorMessageResolver {
  final List<ErrorMessageCatalog> catalogs;

  const ErrorMessageResolver({this.catalogs = const []});

  /// [ErrorMessageRegistry.instance] のカタログを含めた resolver。
  factory ErrorMessageResolver.withRegistry({
    List<ErrorMessageCatalog> extraCatalogs = const [],
  }) {
    return ErrorMessageResolver(
      catalogs: [
        ...ErrorMessageRegistry.instance.catalogs,
        ...extraCatalogs,
      ],
    );
  }

  UserFacingError resolve({
    String? errorKey,
    String? code,
    String? operation,
    UserFacingErrorSource source = UserFacingErrorSource.unknown,
  }) {
    final normalizedKey = _normalizeErrorKey(errorKey);
    final normalizedCode = normalizeFirebaseFunctionsCode(code);

    if (normalizedKey != null) {
      for (final catalog in catalogs) {
        final message = catalog.messageFor(
          errorKey: normalizedKey,
          operation: operation,
        );
        if (message != null) {
          return UserFacingError(
            message: message,
            errorKey: normalizedKey,
            code: normalizedCode,
            source: source,
          );
        }
      }
    }

    final codeMessage = messageForFirebaseFunctionsCode(normalizedCode);
    if (codeMessage != null) {
      return UserFacingError(
        message: codeMessage,
        errorKey: normalizedKey,
        code: normalizedCode,
        source: source,
      );
    }

    return UserFacingError(
      message: kFinalFallbackErrorMessage,
      errorKey: normalizedKey,
      code: normalizedCode,
      source: source,
    );
  }

  static String? _normalizeErrorKey(String? raw) {
    if (raw == null) return null;
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    return trimmed;
  }
}
