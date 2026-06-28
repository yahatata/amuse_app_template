import 'package:flutter/material.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/models/reseat_participant.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/services/tournament_data_service.dart';
import 'package:amuse_app_template/tournament/active/services/seat_decision_logic.dart';
import 'package:amuse_app_template/tournament/active/utils/reseat_participant_builder.dart';
import 'package:amuse_app_template/tournament/active/utils/reseat_table_selection_helpers.dart';


class ReseatAllDialog extends StatefulWidget {
  final String tournamentId;
  final VoidCallback onReseatCompleted;
  final TournamentService service;

  const ReseatAllDialog({
    super.key,
    required this.tournamentId,
    required this.onReseatCompleted,
    required this.service,
  });

  @override
  State<ReseatAllDialog> createState() => _ReseatAllDialogState();
}

class _ReseatAllDialogState extends State<ReseatAllDialog> {
  final List<String> _reseatTargetKeys = [];
  final Set<String> _reseatTableIds = {};
  bool _isLoading = false;
  bool _isLoadingData = true;
  List<ReseatParticipant> _candidates = [];
  List<TournamentTable> _tournamentTables = [];
  final TournamentDataService _dataService = TournamentDataService();

  Map<String, ReseatParticipant> get _candidateByKey => {
        for (final c in _candidates) c.selectionKey: c,
      };

  ReseatTableSelectionValidation get _tableSelectionValidation =>
      ReseatTableSelectionHelpers.validateReseatTableSelection(
        targetParticipantCount: _reseatTargetKeys.length,
        tables: _tournamentTables,
        reseatTableIds: _reseatTableIds,
      );

  bool get _canExecuteReseat =>
      _reseatTargetKeys.isNotEmpty && _tableSelectionValidation.canExecute;

  List<TournamentTable> get _selectedTables =>
      ReseatTableSelectionHelpers.filterTablesForReseat(
        _tournamentTables,
        _reseatTableIds,
      );

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_isLoading,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: AlertDialog(
                title: const Text('全員リシート'),
                content: SizedBox(
                  width: double.maxFinite,
                  height: 520,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('着席者は自動でリシート対象です。待機者は追加選択してください。'),
                      const SizedBox(height: 8),
                      _buildTableSelectionSection(),
                      const SizedBox(height: 12),
                      Expanded(
                        child: Row(
                          children: [
                            Expanded(child: _buildWaitingList()),
                            const SizedBox(width: 16),
                            Expanded(child: _buildReseatTargetList()),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      _buildCapacityInfo(),
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  ElevatedButton(
                    onPressed: _isLoading || !_canExecuteReseat
                        ? null
                        : _showConfirmationDialog,
                    child: const Text('リシート実行'),
                  ),
                ],
              ),
            ),
            if (_isLoading)
              Positioned.fill(
                child: AbsorbPointer(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.35),
                    child: const Center(
                      child: CircularProgressIndicator(),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<ReseatParticipant> get _waitingSideCandidates =>
      _candidates.where((c) => !c.isCurrentlySeated).toList();

  /// 待機者リストを構築（通常待機 + registered 置きバケ）
  Widget _buildWaitingList() {
    if (_isLoadingData) {
      return const Center(child: CircularProgressIndicator());
    }

    final waitingCandidates = List<ReseatParticipant>.from(_waitingSideCandidates)
      ..sort((a, b) {
        final aTime = a.joinedAt ?? DateTime.now();
        final bTime = b.joinedAt ?? DateTime.now();
        return bTime.compareTo(aTime);
      });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '待機者リスト (${waitingCandidates.length}人)',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: ListView.builder(
            itemCount: waitingCandidates.length,
            itemBuilder: (context, index) {
              final participant = waitingCandidates[index];
              final isSelected =
                  _reseatTargetKeys.contains(participant.selectionKey);

              final waitingMinutes = participant.joinedAt == null
                  ? 0
                  : DateTime.now()
                      .difference(participant.joinedAt!)
                      .inMinutes;

              return Card(
                child: ListTile(
                  title: Text(participant.listDisplayName),
                  subtitle: Text('待機時間: $waitingMinutes分'),
                  trailing: IconButton(
                    icon: Icon(
                      isSelected ? Icons.remove_circle : Icons.add_circle,
                      color: isSelected ? Colors.red : Colors.green,
                    ),
                    onPressed: () => _toggleTarget(participant.selectionKey),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  void _toggleTarget(String selectionKey) {
    setState(() {
      if (_reseatTargetKeys.contains(selectionKey)) {
        _reseatTargetKeys.remove(selectionKey);
      } else {
        _reseatTargetKeys.add(selectionKey);
      }
    });
  }

  void _toggleReseatTable(String tableId) {
    setState(() {
      if (_reseatTableIds.contains(tableId)) {
        _reseatTableIds.remove(tableId);
      } else {
        _reseatTableIds.add(tableId);
      }
    });
  }

  Widget _buildTableSelectionSection() {
    if (_isLoadingData) {
      return const SizedBox(
        height: 72,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_tournamentTables.isEmpty) {
      return const Text(
        '有効な卓がありません',
        style: TextStyle(color: Colors.grey),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'リシート先の卓',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        const Text(
          '選択した卓だけに参加者を再配置します。未選択の卓には配置されません。',
          style: TextStyle(fontSize: 12, color: Colors.grey),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 88,
          child: ListView.builder(
            itemCount: _tournamentTables.length,
            itemBuilder: (context, index) {
              final table = _tournamentTables[index];
              final isSelected = _reseatTableIds.contains(table.tableId);

              return Align(
                alignment: Alignment.centerRight,
                child: InkWell(
                  onTap: _isLoading
                      ? null
                      : () => _toggleReseatTable(table.tableId),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${table.name}（${table.maxSeats}席）'),
                        const SizedBox(width: 8),
                        Checkbox(
                          value: isSelected,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                          onChanged: _isLoading
                              ? null
                              : (_) => _toggleReseatTable(table.tableId),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        if (_tableSelectionValidation.message != null)
          Text(
            _tableSelectionValidation.message!,
            style: const TextStyle(
              color: Colors.red,
              fontWeight: FontWeight.bold,
              fontSize: 12,
            ),
          ),
      ],
    );
  }

  /// リシート対象者リストを構築
  Widget _buildReseatTargetList() {
    final selectedWaitingKeys = _reseatTargetKeys
        .where((key) => !(_candidateByKey[key]?.isCurrentlySeated ?? false))
        .toList();
    final selectedSeatedKeys = _reseatTargetKeys
        .where((key) => _candidateByKey[key]?.isCurrentlySeated ?? false)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'リシート対象者 (${_reseatTargetKeys.length}人)',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _reseatTargetKeys.isEmpty
              ? const Center(
                  child: Text(
                    '待機者を選択してください',
                    style: TextStyle(color: Colors.grey),
                  ),
                )
              : ListView(
                  children: [
                    if (selectedWaitingKeys.isNotEmpty) ...[
                      Text(
                        '新規追加 (${selectedWaitingKeys.length}人)',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.orange,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      ...selectedWaitingKeys.map(_buildWaitingTargetTile),
                      const SizedBox(height: 16),
                    ],
                    if (selectedSeatedKeys.isNotEmpty) ...[
                      Text(
                        '既着席者 (${selectedSeatedKeys.length}人)',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      ...selectedSeatedKeys.map(_buildSeatedTargetTile),
                    ],
                  ],
                ),
        ),
      ],
    );
  }

  Widget _buildWaitingTargetTile(String selectionKey) {
    final participant = _candidateByKey[selectionKey];
    if (participant == null) return const SizedBox.shrink();

    final waitingMinutes = participant.joinedAt == null
        ? 0
        : DateTime.now().difference(participant.joinedAt!).inMinutes;

    return Card(
      color: Colors.orange[50],
      child: ListTile(
        title: Text(participant.listDisplayName),
        subtitle: Text('待機時間: $waitingMinutes分'),
        leading: const Icon(Icons.access_time, color: Colors.orange),
        trailing: IconButton(
          icon: const Icon(Icons.remove_circle, color: Colors.red),
          onPressed: () => _toggleTarget(selectionKey),
        ),
      ),
    );
  }

  Widget _buildSeatedTargetTile(String selectionKey) {
    final participant = _candidateByKey[selectionKey];
    if (participant == null) return const SizedBox.shrink();

    return Card(
      color: Colors.blue[50],
      child: ListTile(
        title: Text(participant.listDisplayName),
        subtitle: const Text('既着席者'),
        leading: const Icon(Icons.chair, color: Colors.blue),
      ),
    );
  }

  /// 容量情報を表示
  Widget _buildCapacityInfo() {
    if (_isLoadingData) {
      return const SizedBox.shrink();
    }

    final validation = _tableSelectionValidation;
    final availableSeats = validation.selectedSeatCount;
    final selectedCount = _reseatTargetKeys.length;
    final isOverCapacity = !validation.canExecute &&
        validation.issue == ReseatTableSelectionIssue.insufficientSeats;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isOverCapacity ? Colors.red[50] : Colors.blue[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isOverCapacity ? Colors.red[200]! : Colors.blue[200]!,
        ),
      ),
      child: Column(
        children: [
          Text(
            '座席容量情報',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: isOverCapacity ? Colors.red[700] : Colors.blue[700],
            ),
          ),
          const SizedBox(height: 8),
          Text('選択した卓の座席数: $availableSeats席'),
          Text('リシート対象者: $selectedCount人'),
          if (isOverCapacity)
            const Text(
              '⚠️ 選択した卓の席数が不足しています',
              style: TextStyle(
                color: Colors.red,
                fontWeight: FontWeight.bold,
              ),
            ),
        ],
      ),
    );
  }

  /// 確認ダイアログを表示
  void _showConfirmationDialog() {
    final validation = _tableSelectionValidation;
    if (!validation.canExecute) {
      final message = validation.message ?? 'リシートを実行できません';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('リシート確認'),
          content: Text(
            '${_reseatTargetKeys.length}人を${_selectedTables.length}卓にリシートしますか？',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).pop();
                _executeReseat();
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
              child: const Text('実行'),
            ),
          ],
        );
      },
    );
  }

  /// リシートを実行
  Future<void> _executeReseat() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final availableTables = _selectedTables;

      final tableInfos = availableTables
          .map((table) => TableInfo(
                tableId: table.tableId,
                maxSeats: table.maxSeats,
              ))
          .toList();

      final distribution = SeatDecisionLogic.distributePlayersAcrossTables(
        totalPlayers: _reseatTargetKeys.length,
        tables: tableInfos,
      );

      final shuffledKeys = List<String>.from(_reseatTargetKeys)..shuffle();

      final playerAssignments = <Map<String, dynamic>>[];
      var playerIndex = 0;

      for (final table in availableTables) {
        final assignedCount = distribution[table.tableId] ?? 0;
        if (assignedCount == 0) continue;

        for (var i = 0; i < assignedCount && playerIndex < shuffledKeys.length; i++) {
          final currentSeats = <int, bool>{};
          for (var seat = 1; seat <= table.maxSeats; seat++) {
            final seatData = table.seats[seat];
            var taken = seatData?.isOccupied ?? false;

            if (!taken) {
              for (final assignment in playerAssignments) {
                if (assignment['tableId'] == table.tableId &&
                    assignment['seatNumber'] == seat) {
                  taken = true;
                  break;
                }
              }
            }

            currentSeats[seat] = taken;
          }

          final prioritizedSeats = SeatDecisionLogic.getPrioritizedSeats(
            currentSeats: currentSeats,
            maxSeats: table.maxSeats,
          );

          if (prioritizedSeats.isEmpty) {
            throw Exception('利用可能座席数に対して、リシートの対象とする人数が多すぎます');
          }

          final selectedSeat = prioritizedSeats[0];
          final selectionKey = shuffledKeys[playerIndex];
          final participant = _candidateByKey[selectionKey];
          if (participant == null) {
            throw Exception('リシート対象の参加者情報が見つかりません: $selectionKey');
          }

          final assignment = <String, dynamic>{
            'tableId': table.tableId,
            'seatNumber': selectedSeat,
          };
          if (participant.participantType == ReseatParticipantType.normal) {
            assignment['userId'] = participant.userId;
          } else {
            assignment['okibakeEntryId'] = participant.okibakeEntryId;
          }

          playerAssignments.add(assignment);
          playerIndex++;
        }
      }

      final service = TournamentServiceImpl();
      final result = await service.reseatAllPlayers(
        tournamentId: widget.tournamentId,
        playerAssignments: playerAssignments,
        reseatTableIds: _reseatTableIds.toList(),
      );

      if (result['success'] == true) {
        if (mounted) {
          Navigator.of(context).pop();
          widget.onReseatCompleted();
        }
      } else {
        throw Exception('リシートに失敗しました');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('エラーが発生しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  /// データを読み込み
  Future<void> _loadData() async {
    try {
      final waitingPlayers =
          await _dataService.getWaitingPlayers(widget.tournamentId);
      final okibakeEntries = await _dataService
          .getOkibakeTemporaryEntriesForReseat(widget.tournamentId);
      final tournamentTables =
          await _dataService.getTournamentTables(widget.tournamentId);

      final candidates = ReseatParticipantBuilder.build(
        regularWaitingPlayers: waitingPlayers,
        okibakeEntries: okibakeEntries,
        tables: tournamentTables,
      );

      setState(() {
        _candidates = candidates;
        _tournamentTables = tournamentTables;
        _isLoadingData = false;

        _reseatTargetKeys
          ..clear()
          ..addAll(ReseatParticipantBuilder.seatedSelectionKeys(candidates));

        _reseatTableIds
          ..clear()
          ..addAll(
            ReseatTableSelectionHelpers.enabledTableIds(tournamentTables),
          );
      });
    } catch (e) {
      setState(() {
        _isLoadingData = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('データの読み込みに失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
