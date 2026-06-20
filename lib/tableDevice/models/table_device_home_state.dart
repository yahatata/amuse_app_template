enum TableDeviceHomeKind {
  unbound,
  idle,
  tournamentActive,
  tournamentScheduled,
  sideGameActive,
  inconsistent,
  otherInUse,
}

class TableDeviceHomeState {
  const TableDeviceHomeState({
    required this.kind,
    required this.tableId,
    required this.tableName,
    required this.registrationEnabled,
    this.currentStatus,
    this.tournamentId,
    this.tournamentName,
    this.gameName,
    this.message,
  });

  final TableDeviceHomeKind kind;
  final String? tableId;
  final String? tableName;
  final bool registrationEnabled;
  final String? currentStatus;
  final String? tournamentId;
  final String? tournamentName;
  final String? gameName;
  final String? message;

  bool get canRegisterTournament =>
      registrationEnabled && kind == TableDeviceHomeKind.idle;

  bool get canRegisterSideGame =>
      registrationEnabled && kind == TableDeviceHomeKind.idle;

  bool get canOpenProgress =>
      kind == TableDeviceHomeKind.tournamentActive ||
      kind == TableDeviceHomeKind.tournamentScheduled ||
      kind == TableDeviceHomeKind.sideGameActive;

  static const unbound = TableDeviceHomeState(
    kind: TableDeviceHomeKind.unbound,
    tableId: null,
    tableName: null,
    registrationEnabled: false,
    message:
        '管理者に報告して、adminデバイスからテーブルの紐付けを行う。もしくはroleを変更してください。',
  );
}

class TableDeviceHomeStateResolver {
  static TableDeviceHomeState resolve({
    required String tableId,
    String? tableName,
    required String? tableStatus,
    required Map<String, dynamic>? tournamentDetail,
    required List<String> sideGameTypes,
    required bool registrationEnabled,
    String? currentBusinessDateKey,
    String? tournamentStatus,
    String? tournamentBusinessDate,
    bool? sideGameActive,
  }) {
    final resolvedTableName =
        (tableName != null && tableName.trim().isNotEmpty) ? tableName : tableId;
    final detailTournamentId = tournamentDetail?['tournamentId'] as String?;
    final detailTournamentName = tournamentDetail?['tournamentName'] as String?;

    if (tableStatus == null || tableStatus == 'open') {
      if (tournamentDetail != null) {
        return TableDeviceHomeState(
          kind: TableDeviceHomeKind.inconsistent,
          tableId: tableId,
          tableName: resolvedTableName,
          registrationEnabled: registrationEnabled,
          currentStatus: tableStatus ?? 'open',
          tournamentId: detailTournamentId,
          tournamentName: detailTournamentName,
          message: 'status == open なのに tournamentDetail が残っています',
        );
      }
      return TableDeviceHomeState(
        kind: TableDeviceHomeKind.idle,
        tableId: tableId,
        tableName: resolvedTableName,
        registrationEnabled: registrationEnabled,
        currentStatus: tableStatus ?? 'open',
      );
    }

    if (tableStatus == 'tournament') {
      if (tournamentDetail == null || detailTournamentId == null) {
        return TableDeviceHomeState(
          kind: TableDeviceHomeKind.inconsistent,
          tableId: tableId,
          tableName: resolvedTableName,
          registrationEnabled: registrationEnabled,
          currentStatus: tableStatus,
          message: 'status == tournament なのに tournamentDetail がありません',
        );
      }

      if (const ['running', 'registered', 'paused'].contains(tournamentStatus)) {
        return TableDeviceHomeState(
          kind: TableDeviceHomeKind.tournamentActive,
          tableId: tableId,
          tableName: resolvedTableName,
          registrationEnabled: registrationEnabled,
          currentStatus: tableStatus,
          tournamentId: detailTournamentId,
          tournamentName: detailTournamentName,
        );
      }

      if (tournamentStatus == 'scheduled' &&
          tournamentBusinessDate != null &&
          currentBusinessDateKey != null &&
          tournamentBusinessDate == currentBusinessDateKey) {
        return TableDeviceHomeState(
          kind: TableDeviceHomeKind.tournamentScheduled,
          tableId: tableId,
          tableName: resolvedTableName,
          registrationEnabled: registrationEnabled,
          currentStatus: tableStatus,
          tournamentId: detailTournamentId,
          tournamentName: detailTournamentName,
        );
      }

      return TableDeviceHomeState(
        kind: TableDeviceHomeKind.inconsistent,
        tableId: tableId,
        tableName: resolvedTableName,
        registrationEnabled: registrationEnabled,
        currentStatus: tableStatus,
        tournamentId: detailTournamentId,
        tournamentName: detailTournamentName,
        message: 'トーナメント状態ですが、参照先トーナメントの状態が不正です',
      );
    }

    if (sideGameTypes.contains(tableStatus)) {
      if (sideGameActive == true) {
        return TableDeviceHomeState(
          kind: TableDeviceHomeKind.sideGameActive,
          tableId: tableId,
          tableName: resolvedTableName,
          registrationEnabled: registrationEnabled,
          currentStatus: tableStatus,
          gameName: tableStatus,
          tournamentId: detailTournamentId,
          tournamentName: detailTournamentName,
        );
      }

      return TableDeviceHomeState(
        kind: TableDeviceHomeKind.inconsistent,
        tableId: tableId,
        tableName: resolvedTableName,
        registrationEnabled: registrationEnabled,
        currentStatus: tableStatus,
        gameName: tableStatus,
        tournamentId: detailTournamentId,
        tournamentName: detailTournamentName,
        message: 'sideGame.active が true ではありません',
      );
    }

    return TableDeviceHomeState(
      kind: TableDeviceHomeKind.otherInUse,
      tableId: tableId,
      tableName: resolvedTableName,
      registrationEnabled: registrationEnabled,
      currentStatus: tableStatus,
      message: '$tableStatus 使用中',
    );
  }
}
