import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:flutter/widgets.dart';

/// SideGame 利用者向けの固定文言・薄いヘルパー（Phase 6 SG）。
///
/// Callable は D-1（[mapCallableError] / [mapCallableSoftFailMessage] /
/// [isCallableSuccessResponse]）へ委譲する。raw message / toString /
/// snapshot.error / UID / path は表示しない。

/// テーブル詳細 Stream 失敗（SG-01）。空テーブルとは別。
const String kSideGameTableLoadFailedMessage =
    'テーブル情報を取得できませんでした。画面を更新して再度お試しください。';

/// テーブル詳細の再取得失敗（SG-01、stale 表示時）。
const String kSideGameTableRealtimeFailedMessage =
    '最新情報を取得できません。画面を更新して再度お試しください。';

/// 参加者一覧 Stream 失敗（SG-02）。「参加者がいません」とは別。
const String kSideGameParticipantsLoadFailedMessage =
    '参加者一覧を取得できませんでした。画面を更新して再度お試しください。';

/// テーブル一覧 Stream 失敗（SG-08）。空一覧とは別。
const String kSideGameTableListLoadFailedMessage =
    '卓一覧を取得できませんでした。画面を更新して再度お試しください。';

/// billId 欠落（SG-03）。固定文言（技術用語を避ける）。
const String kSideGameBillMissingMessage =
    '伝票情報を確認できませんでした。画面を更新してください。';
/// トーナメント着席中のため開始不可（SG-09）。
const String kSideGameTournamentSeatedBlockMessage =
    'トーナメントで着席中のため、この卓でサイドゲームを開始できません';

/// Callable が throw せず `success != true` を返したときの搬送用。
class SideGameCallableSoftFail implements Exception {
  final Object? data;

  const SideGameCallableSoftFail(this.data);
}

/// SideGame Callable hard-fail / soft-fail の利用者向け文言。
String mapSideGameCallableError(
  Object exception, {
  required String operation,
}) {
  if (exception is SideGameCallableSoftFail) {
    return mapCallableSoftFailMessage(exception.data, operation: operation);
  }
  return mapCallableError(exception, operation: operation).message;
}

/// soft-fail Map の場合も同じ経路で解決する。
String mapSideGameSoftFailMessage(
  Object? data, {
  String? operation,
}) {
  return mapCallableSoftFailMessage(data, operation: operation);
}

/// StreamBuilder の hasError 判定。
bool sideGameStreamHasError(AsyncSnapshot<Object?> snapshot) {
  return snapshot.hasError;
}

/// Stream エラー文言。raw [snapshot.error] は使わない。
String sideGameTableStreamErrorMessage([Object? error]) {
  return kSideGameTableLoadFailedMessage;
}

String sideGameParticipantsStreamErrorMessage([Object? error]) {
  return kSideGameParticipantsLoadFailedMessage;
}

String sideGameTableListStreamErrorMessage([Object? error]) {
  return kSideGameTableListLoadFailedMessage;
}
