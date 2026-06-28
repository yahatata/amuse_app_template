import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';

/// リシート先卓選択の検証結果。
enum ReseatTableSelectionIssue {
  none,
  noTablesSelected,
  insufficientSeats,
}

class ReseatTableSelectionValidation {
  const ReseatTableSelectionValidation({
    required this.issue,
    required this.selectedSeatCount,
    required this.targetParticipantCount,
  });

  final ReseatTableSelectionIssue issue;
  final int selectedSeatCount;
  final int targetParticipantCount;

  bool get canExecute => issue == ReseatTableSelectionIssue.none;

  String? get message {
    switch (issue) {
      case ReseatTableSelectionIssue.none:
        return null;
      case ReseatTableSelectionIssue.noTablesSelected:
        return 'リシート先の卓を1つ以上選択してください。';
      case ReseatTableSelectionIssue.insufficientSeats:
        return '選択した卓の席数では、対象者を全員配置できません。\n使用する卓を増やしてください。';
    }
  }
}

/// 使用卓選択付きリシートの卓選択・席数検証（純粋関数）。
class ReseatTableSelectionHelpers {
  ReseatTableSelectionHelpers._();

  /// 有効卓の tableId 一覧（初期選択用）。
  static List<String> enabledTableIds(List<TournamentTable> tables) => tables
      .where((t) => t.isEnabled)
      .map((t) => t.tableId)
      .toList();

  /// [reseatTableIds] に含まれる卓の総席数。
  static int totalSeatsForTableIds(
    List<TournamentTable> tables,
    Set<String> reseatTableIds,
  ) =>
      tables
          .where((t) => reseatTableIds.contains(t.tableId))
          .fold<int>(0, (sum, table) => sum + table.maxSeats);

  /// リシート配分対象の卓だけに絞る。
  static List<TournamentTable> filterTablesForReseat(
    List<TournamentTable> tables,
    Set<String> reseatTableIds,
  ) =>
      tables.where((t) => reseatTableIds.contains(t.tableId)).toList();

  static ReseatTableSelectionValidation validateReseatTableSelection({
    required int targetParticipantCount,
    required List<TournamentTable> tables,
    required Set<String> reseatTableIds,
  }) {
    if (reseatTableIds.isEmpty) {
      return ReseatTableSelectionValidation(
        issue: ReseatTableSelectionIssue.noTablesSelected,
        selectedSeatCount: 0,
        targetParticipantCount: targetParticipantCount,
      );
    }

    final selectedSeatCount = totalSeatsForTableIds(tables, reseatTableIds);
    if (targetParticipantCount > selectedSeatCount) {
      return ReseatTableSelectionValidation(
        issue: ReseatTableSelectionIssue.insufficientSeats,
        selectedSeatCount: selectedSeatCount,
        targetParticipantCount: targetParticipantCount,
      );
    }

    return ReseatTableSelectionValidation(
      issue: ReseatTableSelectionIssue.none,
      selectedSeatCount: selectedSeatCount,
      targetParticipantCount: targetParticipantCount,
    );
  }
}
