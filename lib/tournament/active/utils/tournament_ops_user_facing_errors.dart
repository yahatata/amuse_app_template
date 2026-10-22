import 'dart:async';

import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/widgets.dart';

/// Phase 7A Tournament 運営画面向けの安全な固定文言・薄い helper。
///
/// raw exception / snapshot.error / UID / path / 内部フィールド名は表示しない。

const String kTournamentDataLoadFailedMessage =
    'トーナメント情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentNotFoundMessage =
    'トーナメントが見つかりません。画面を更新して再度お試しください。';

const String kTournamentParticipantsLoadFailedMessage =
    '参加者情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentTablesLoadFailedMessage =
    '卓情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentWaitingLoadFailedMessage =
    '待機者情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentRankingLoadFailedMessage =
    'ランキング情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentPrizeLoadFailedMessage =
    'プライズ情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentBlindLoadFailedMessage =
    'ブラインド情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentCandidatesLoadFailedMessage =
    '候補一覧を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentListLoadFailedMessage =
    'トーナメント一覧を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentResultLoadFailedMessage =
    '結果情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentOkibakeLoadFailedMessage =
    '置きバケ情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentOkibakeNotFoundMessage =
    '対象の置きバケが見つかりません。画面を更新して再度お試しください。';

const String kTournamentOkibakeBadDataMessage =
    '置きバケ情報が不正です。画面を更新して再度お試しください。';

const String kTournamentStaleUpdateFailedMessage =
    '最新のトーナメント情報を取得できませんでした。表示内容が古い可能性があります。';

const String kTournamentStreamLoadFailedMessage =
    'データを取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentPrizeConversionMissingMessage =
    'プライズ設定を確認できませんでした。画面を更新して再度お試しください。';

const String kTournamentSeatedCountLoadFailedMessage =
    '着席人数を取得できませんでした。画面を更新して再度お試しください。';

/// 卓詳細パネル等の短い件数表示用（0 と区別。raw「エラー」は使わない）。
const String kTournamentCountUnavailableDisplay = '取得不可';

const String kTournamentUsersLoadFailedMessage =
    'ユーザー一覧を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentActiveStaysLoadFailedMessage =
    '入店情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentPermissionDeniedMessage = 'この操作の権限がありません。';

const String kTournamentNetworkFailedMessage =
    '通信できません。接続を確認して再度お試しください。';

/// TOUR-47: 待機リスト不在（ローカル確認）。業務文言として維持。
const String kTournamentWaitingNotInListMessage = '選択した参加者は現在待機リストにいません';

const String kAddTableToTournamentOperation = 'addTableToTournament';
const String kRemoveTableFromTournamentOperation = 'removeTableFromTournament';
const String kReseatAllPlayersOperation = 'reseatAllPlayers';
const String kAssignSeatToPlayerOperation = 'assignSeatToPlayer';

/// Home 初回読込: 未検出と取得失敗を区別する（raw は使わない）。
String tournamentOpsHomeLoadErrorMessage({required bool notFound}) {
  return notFound
      ? kTournamentNotFoundMessage
      : kTournamentDataLoadFailedMessage;
}

/// Home 必須データ refresh 失敗時の文言（初回 vs 更新）。
String tournamentOpsHomeRefreshFailMessage({required bool hadSuccessfulLoad}) {
  return hadSuccessfulLoad
      ? kTournamentStaleUpdateFailedMessage
      : kTournamentDataLoadFailedMessage;
}

/// 初回失敗時のみ一覧を空にする。更新失敗では表示保持。
bool shouldClearTournamentHomeListsOnLoadFail({
  required bool hadSuccessfulLoad,
}) {
  return !hadSuccessfulLoad;
}

/// Stream 初回失敗 vs 更新失敗（stale 保持時）。raw [error] は無視する。
String tournamentOpsStreamMessage({
  required bool hasStaleData,
  Object? error,
}) {
  return hasStaleData
      ? kTournamentStaleUpdateFailedMessage
      : kTournamentStreamLoadFailedMessage;
}

/// Callable hard-fail → 利用者文言（既知 formatter 優先、未知は D-1）。
String mapTournamentOpsCallableError(Object exception, {String? operation}) {
  // Exception 包みでも formatter 経由で既知照合・D-1 へ寄せる。
  return formatTournamentCallableError(exception);
}

/// soft-fail Map → 利用者文言。
String mapTournamentOpsSoftFail(Object? data, {String? operation}) {
  return mapCallableSoftFailMessage(data, operation: operation);
}

/// Stream/Firestore エラー文言。raw [error] は使わない。
String tournamentOpsStreamErrorMessage(
  String fixedMessage, [
  Object? error,
]) {
  return fixedMessage;
}

/// StreamBuilder の hasError。
bool tournamentOpsStreamHasError(AsyncSnapshot<Object?> snapshot) {
  return snapshot.hasError;
}

/// 置きバケ entry 読込失敗の分類（TOUR-51）。raw は出さない。
String mapTournamentOkibakeEntryLoadError(Object error) {
  if (error is FirebaseException) {
    final code = error.code;
    if (code == 'permission-denied') {
      return kTournamentPermissionDeniedMessage;
    }
    if (code == 'unavailable' ||
        code == 'deadline-exceeded' ||
        code == 'cancelled' ||
        code == 'resource-exhausted') {
      return kTournamentNetworkFailedMessage;
    }
    if (code == 'not-found') {
      return kTournamentOkibakeNotFoundMessage;
    }
  }
  if (error is TimeoutException) {
    return kTournamentNetworkFailedMessage;
  }
  return kTournamentOkibakeLoadFailedMessage;
}
