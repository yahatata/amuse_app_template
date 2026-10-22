import 'package:amuse_app_template/core/errors/errors.dart';

/// 単発トーナメント作成（createScheduledTournament）の callable 失敗を変換する。
///
/// UID・Functions raw message・`$e` は表示に使わない。
UserFacingError mapCreateSingleTournamentCallableError(Object exception) {
  return mapCallableError(exception);
}

/// soft-fail レスポンスを変換する（`error` / `message` は表示しない）。
UserFacingError mapCreateSingleTournamentSoftFail(Object? data) {
  return mapSoftFailError(data);
}
