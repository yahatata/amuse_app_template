import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/services/tournament_data_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:flutter_test/flutter_test.dart';

/// 必須取得が例外を投げる [TournamentDataService]（refresh 契約の検証用）。
class _FailingRequiredFetchService extends TournamentDataService {
  @override
  Future<List<TournamentTable>> getTournamentTables(String tournamentId) async {
    throw Exception(
      'secret path=/scheduledTournaments/$tournamentId/tablesSeat',
    );
  }
}

/// 必須取得が空配列を返す（正常な 0 件）。
class _EmptySuccessFetchService extends TournamentDataService {
  @override
  Future<List<TournamentTable>> getTournamentTables(String tournamentId) async {
    return const [];
  }

  @override
  Future<List<WaitingPlayer>> getMergedWaitingPlayers(
    String tournamentId,
  ) async {
    return const [];
  }

  @override
  Future<List<TournamentUser>> getTournamentUsers(String tournamentId) async {
    return const [];
  }
}

void main() {
  group('Phase 7A refreshTournamentData swallow check', () {
    test('下位取得失敗は空配列成功扱いにしない', () async {
      final result =
          await _FailingRequiredFetchService().refreshTournamentData('t-secret');

      expect(result['success'], isFalse);
      expect(result.containsKey('tables'), isFalse);
      expect(result.containsKey('waitingPlayers'), isFalse);
      expect(result.containsKey('users'), isFalse);
      expect(result['tables'], isNull);
    });

    test('失敗 payload に raw 例外／path を載せない', () async {
      final result =
          await _FailingRequiredFetchService().refreshTournamentData('t-secret');

      final encoded = result.toString();
      expect(encoded, isNot(contains('secret')));
      expect(encoded, isNot(contains('/scheduledTournaments')));
      expect(encoded, isNot(contains('tablesSeat')));
      expect(result.containsKey('error'), isFalse);
      expect(result['error'], isNull);
    });

    test('正常な空配列は success: true（0 件と区別可能な契約）', () async {
      final result =
          await _EmptySuccessFetchService().refreshTournamentData('t-empty');

      expect(result['success'], isTrue);
      expect(result['tables'], isEmpty);
      expect(result['waitingPlayers'], isEmpty);
      expect(result['users'], isEmpty);
    });

    test('初回必須失敗: 一覧クリア＋エラー文言（0 件誤認しない）', () {
      expect(
        shouldClearTournamentHomeListsOnLoadFail(hadSuccessfulLoad: false),
        isTrue,
      );
      expect(
        tournamentOpsHomeRefreshFailMessage(hadSuccessfulLoad: false),
        kTournamentDataLoadFailedMessage,
      );
      expect(
        tournamentOpsHomeRefreshFailMessage(hadSuccessfulLoad: false),
        isNot(equals(kTournamentStaleUpdateFailedMessage)),
      );
      expect(
        tournamentOpsHomeRefreshFailMessage(hadSuccessfulLoad: false),
        isNot(contains('Exception')),
      );
      expect(
        tournamentOpsHomeRefreshFailMessage(hadSuccessfulLoad: false),
        isNot(contains('\$e')),
      );
    });

    test('更新失敗: 既存表示保持＋stale 警告（raw 非表示）', () {
      expect(
        shouldClearTournamentHomeListsOnLoadFail(hadSuccessfulLoad: true),
        isFalse,
      );
      expect(
        tournamentOpsHomeRefreshFailMessage(hadSuccessfulLoad: true),
        kTournamentStaleUpdateFailedMessage,
      );
      expect(
        tournamentOpsHomeRefreshFailMessage(hadSuccessfulLoad: true),
        isNot(contains('path=')),
      );
      expect(
        tournamentOpsHomeRefreshFailMessage(hadSuccessfulLoad: true),
        isNot(contains('Exception')),
      );
    });
  });
}
