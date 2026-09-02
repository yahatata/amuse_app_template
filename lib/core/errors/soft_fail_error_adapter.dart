import 'package:amuse_app_template/core/errors/error_details_parser.dart';
import 'package:amuse_app_template/core/errors/error_message_catalog.dart';
import 'package:amuse_app_template/core/errors/error_message_resolver.dart';
import 'package:amuse_app_template/core/errors/user_facing_error.dart';

/// soft-fail レスポンス Map を [UserFacingError] へ変換する。
///
/// 前提: 呼出側が失敗レスポンスに対してのみ呼び出す。
/// `success: true` を渡した場合も throw せず最終共通文言へ落とす
/// （production で例外を投げない）。
///
/// `error` / `message` フィールドは利用者表示に使わない。
UserFacingError mapSoftFailError(
  Object? data, {
  String? operation,
  List<ErrorMessageCatalog> extraCatalogs = const [],
}) {
  final resolver = ErrorMessageResolver.withRegistry(
    extraCatalogs: extraCatalogs,
  );

  if (data is! Map) {
    return resolver.resolve(
      operation: operation,
      source: UserFacingErrorSource.softFail,
    );
  }

  // success:true は呼出側責任。ここでは failure 専用 API として扱い、
  // true でも throw せず最終共通（または key/code）へ落とす。
  final parsed = parseSoftFailErrorDetails(data);
  return resolver.resolve(
    errorKey: parsed.errorKey,
    code: parsed.code,
    operation: operation,
    source: UserFacingErrorSource.softFail,
  );
}
