import 'package:cloud_functions/cloud_functions.dart';

import 'package:amuse_app_template/core/errors/error_details_parser.dart';
import 'package:amuse_app_template/core/errors/error_message_catalog.dart';
import 'package:amuse_app_template/core/errors/error_message_resolver.dart';
import 'package:amuse_app_template/core/errors/user_facing_error.dart';

/// [FirebaseFunctionsException] を [UserFacingError] へ変換する。
///
/// - throw しない
/// - Functions の `message` は表示しない
/// - raw exception / toString は表示しない
/// - [operation] は呼出側が明示する（推測しない）
UserFacingError mapCallableError(
  Object exception, {
  String? operation,
  List<ErrorMessageCatalog> extraCatalogs = const [],
}) {
  final resolver = ErrorMessageResolver.withRegistry(
    extraCatalogs: extraCatalogs,
  );

  if (exception is! FirebaseFunctionsException) {
    return resolver.resolve(
      operation: operation,
      source: UserFacingErrorSource.callable,
    );
  }

  final parsed = parseCallableErrorDetails(exception.details);
  return resolver.resolve(
    errorKey: parsed.errorKey,
    code: exception.code,
    operation: operation,
    source: UserFacingErrorSource.callable,
  );
}

/// details.context を安全に取り出す（表示には使わない補助）。
Map<String, Object?>? extractCallableErrorContext(Object exception) {
  if (exception is! FirebaseFunctionsException) return null;
  return parseCallableErrorDetails(exception.details).context;
}
