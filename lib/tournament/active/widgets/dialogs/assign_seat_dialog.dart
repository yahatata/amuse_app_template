import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/models/scheduled_tournament_seat_map.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_tables_seat_display.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/services/tournament_data_service.dart';

class AssignSeatDialog extends StatefulWidget {
  final String tournamentId;
  final VoidCallback onSeatAssigned;

  /// 事前選択される `WaitingPlayer.userId`（通常 userId または `okibakeTemporary:…`）。
  final String? preselectedUserId;

  /// 空セルタップ導線: 卓・席を固定するときのみ両方セット。
  final String? prelockedTableId;
  final int? prelockedSeatNumber;

  final TournamentService service;

  AssignSeatDialog({
    super.key,
    required this.tournamentId,
    required this.onSeatAssigned,
    this.preselectedUserId,
    this.prelockedTableId,
    this.prelockedSeatNumber,
    required this.service,
  }) : assert(
          (prelockedTableId == null && prelockedSeatNumber == null) ||
              (prelockedTableId != null && prelockedSeatNumber != null),
          'prelocked は tableId と seat をセットで指定',
        );

  @override
  State<AssignSeatDialog> createState() => _AssignSeatDialogState();
}

class _AssignSeatDialogState extends State<AssignSeatDialog> {
  String? _selectedUserId;
  String? _selectedTableId;
  int? _selectedSeatNumber;
  bool _isLoading = false;
  bool _isLoadingData = true;
  bool _dataLoadFailed = false;
  List<WaitingPlayer> _waitingPlayers = [];
  List<TournamentTable> _tournamentTables = [];
  final TournamentDataService _dataService = TournamentDataService();
  int _tablesStreamRetryToken = 0;
  int _seatStreamRetryToken = 0;

  /// Stream 更新失敗時に保持する直前の卓 docs。
  List<QueryDocumentSnapshot>? _lastTablesDocs;
  Map<String, dynamic>? _lastSeatDocData;

  bool get _seatDestinationLocked =>
      widget.prelockedTableId != null && widget.prelockedSeatNumber != null;

  @override
  void initState() {
    super.initState();
    if (widget.preselectedUserId != null) {
      _selectedUserId = widget.preselectedUserId;
    }
    if (_seatDestinationLocked) {
      _selectedTableId = widget.prelockedTableId;
      _selectedSeatNumber = widget.prelockedSeatNumber;
    }
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
                title: const Text('待機者を着席させる'),
                content: SizedBox(
                  width: double.maxFinite,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('待機者と着席先を選択してください'),
                      const SizedBox(height: 16),
                      if (_isLoadingData)
                        const Center(child: CircularProgressIndicator())
                      else if (_dataLoadFailed)
                        Column(
                          children: [
                            Text(
                              kTournamentCandidatesLoadFailedMessage,
                              style: TextStyle(color: Colors.red.shade700),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 12),
                            ElevatedButton(
                              onPressed: _isLoading ? null : _loadData,
                              child: const Text('再試行'),
                            ),
                          ],
                        )
                      else ...[
                        DropdownButtonFormField<String>(
                          decoration: const InputDecoration(
                            labelText: '待機者',
                            border: OutlineInputBorder(),
                          ),
                          value: _waitingPlayers
                                  .any((w) => w.userId == _selectedUserId)
                              ? _selectedUserId
                              : null,
                          items: _waitingPlayers
                              .map((player) => DropdownMenuItem(
                                    value: player.userId,
                                    child: Text(
                                      player.isOkibakeTemporary
                                          ? '${player.displayName}（置きバケ・待機${player.waitingMinutes}分）'
                                          : '${player.displayName} (待機${player.waitingMinutes}分)',
                                    ),
                                  ))
                              .toList(),
                          onChanged: _isLoading
                              ? null
                              : (value) {
                                  setState(() {
                                    _selectedUserId = value;
                                  });
                                },
                        ),
                        if (_waitingPlayers.isEmpty)
                          const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: Text(
                              '待機者はいません',
                              style: TextStyle(color: Colors.grey, fontSize: 13),
                            ),
                          ),
                        const SizedBox(height: 16),
                        if (!_seatDestinationLocked) ...[
                          _buildTableSelectionWithStatus(),
                          const SizedBox(height: 16),
                          if (_selectedTableId != null) ...[
                            _buildSeatSelectionWithStatus(),
                            const SizedBox(height: 16),
                          ],
                        ] else ...[
                          Text(
                            '着席先: 卓 ${_selectedTableId ?? ''}・シート ${_selectedSeatNumber ?? ''}',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.blueGrey.shade800,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                        if (_selectedUserId != null &&
                            _selectedTableId != null &&
                            _selectedSeatNumber != null) ...[
                          _buildAssignmentConfirmation(),
                          const SizedBox(height: 16),
                        ],
                      ],
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed:
                        _isLoading ? null : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  ElevatedButton(
                    onPressed: !_canTapAssign() ? null : _submitSeatAssignment,
                    child: const Text('着席'),
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

  bool _canTapAssign() {
    if (_isLoading || _dataLoadFailed || _isLoadingData) return false;
    return _selectedUserId != null &&
        _selectedTableId != null &&
        _selectedSeatNumber != null;
  }

  Widget _buildStreamFailPanel({
    required String message,
    required VoidCallback onRetry,
    bool showStaleWarning = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showStaleWarning)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              kTournamentStaleUpdateFailedMessage,
              style: TextStyle(color: Colors.orange.shade800, fontSize: 12),
            ),
          ),
        Text(
          message,
          style: TextStyle(color: Colors.red.shade700, fontSize: 13),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: _isLoading ? null : onRetry,
            child: const Text('再試行'),
          ),
        ),
      ],
    );
  }

  Widget _buildTableSelectionWithStatus() {
    return StreamBuilder<QuerySnapshot>(
      key: ValueKey('assign-tables-$_tablesStreamRetryToken'),
      stream: FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('tablesSeat')
          .snapshots(),
      builder: (context, snapshot) {
        final hasData = snapshot.hasData && snapshot.data != null;
        if (hasData) {
          _lastTablesDocs = snapshot.data!.docs;
        }

        final docs = hasData
            ? snapshot.data!.docs
            : (_lastTablesDocs ?? const <QueryDocumentSnapshot>[]);
        final hasStale = !hasData && _lastTablesDocs != null;

        if (snapshot.hasError && docs.isEmpty) {
          return _buildStreamFailPanel(
            message: kTournamentTablesLoadFailedMessage,
            onRetry: () => setState(() {
              _tablesStreamRetryToken++;
              _lastTablesDocs = null;
            }),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting &&
            docs.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        final tables = filterTablesSeatDocsForDisplay(docs, null);

        if (tables.isEmpty && !snapshot.hasError) {
          return const Text(
            '有効な卓がありません',
            style: TextStyle(color: Colors.grey),
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (snapshot.hasError && hasStale)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  kTournamentStaleUpdateFailedMessage,
                  style: TextStyle(color: Colors.orange.shade800, fontSize: 12),
                ),
              ),
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(
                labelText: 'テーブル',
                border: OutlineInputBorder(),
              ),
              value: tables.any((d) => d.id == _selectedTableId)
                  ? _selectedTableId
                  : null,
              items: tables.map((tableDoc) {
                final tableId = tableDoc.id;
                final tableData = tableDoc.data() != null
                    ? Map<String, dynamic>.from(tableDoc.data()! as Map)
                    : null;
                final seats =
                    tableData?['seats'] as Map<String, dynamic>? ?? {};

                final maxSeats =
                    ScheduledTournamentSeatMap.resolvedTableMaxSeats(
                  tableData?['maxSeats'],
                  seats,
                  fallbackWhenUnresolved: 6,
                );
                final occupiedSeats =
                    ScheduledTournamentSeatMap.occupiedCount(seats, maxSeats);

                return DropdownMenuItem(
                  value: tableId,
                  child: Text('$tableId ($occupiedSeats/$maxSeats席)'),
                );
              }).toList(),
              onChanged: _isLoading
                  ? null
                  : (value) {
                      setState(() {
                        _selectedTableId = value;
                        _selectedSeatNumber = null;
                        _lastSeatDocData = null;
                        _seatStreamRetryToken++;
                      });
                    },
            ),
          ],
        );
      },
    );
  }

  Widget _buildSeatSelectionWithStatus() {
    if (_selectedTableId == null) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<DocumentSnapshot>(
      key: ValueKey(
        'assign-seat-$_selectedTableId-$_seatStreamRetryToken',
      ),
      stream: FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('tablesSeat')
          .doc(_selectedTableId!)
          .snapshots(),
      builder: (context, snapshot) {
        final hasData = snapshot.hasData && snapshot.data != null;
        Map<String, dynamic>? data;
        if (hasData && snapshot.data!.data() != null) {
          data = Map<String, dynamic>.from(snapshot.data!.data()! as Map);
          _lastSeatDocData = data;
        } else if (_lastSeatDocData != null) {
          data = _lastSeatDocData;
        }

        final hasStale = !hasData && _lastSeatDocData != null;

        if (snapshot.hasError && data == null) {
          return _buildStreamFailPanel(
            message: kTournamentTablesLoadFailedMessage,
            onRetry: () => setState(() {
              _seatStreamRetryToken++;
              _lastSeatDocData = null;
            }),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting &&
            data == null) {
          return const Center(child: CircularProgressIndicator());
        }

        final seats = data?['seats'] as Map<String, dynamic>? ?? {};

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (snapshot.hasError && hasStale)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  kTournamentStaleUpdateFailedMessage,
                  style: TextStyle(color: Colors.orange.shade800, fontSize: 12),
                ),
              ),
            DropdownButtonFormField<int>(
              decoration: const InputDecoration(
                labelText: 'シート番号',
                border: OutlineInputBorder(),
              ),
              value: _seatNumberSelectable(seats, _selectedSeatNumber)
                  ? _selectedSeatNumber
                  : null,
              items: _buildSeatItemsWithStatus(seats),
              onChanged: _isLoading
                  ? null
                  : (value) {
                      setState(() {
                        _selectedSeatNumber = value;
                      });
                    },
            ),
          ],
        );
      },
    );
  }

  bool _seatNumberSelectable(Map<String, dynamic> seats, int? seatNum) {
    if (seatNum == null) return false;
    if (seatNum < 1) return false;
    return !ScheduledTournamentSeatMap.isOccupiedAt(seats, seatNum);
  }

  List<DropdownMenuItem<int>> _buildSeatItemsWithStatus(
      Map<String, dynamic> seats) {
    final selectedTable = _tableForSelectedId();

    return List.generate(selectedTable.maxSeats, (index) {
      final seatNumber = index + 1;
      final isOccupied =
          ScheduledTournamentSeatMap.isOccupiedAt(seats, seatNumber);

      return DropdownMenuItem(
        value: seatNumber,
        enabled: !isOccupied,
        child: Row(
          children: [
            Icon(
              isOccupied ? Icons.person : Icons.event_seat,
              color: isOccupied ? Colors.red : Colors.green,
              size: 16,
            ),
            const SizedBox(width: 8),
            Text(
              'シート $seatNumber',
              style: TextStyle(
                color: isOccupied ? Colors.grey : Colors.black,
                fontWeight:
                    isOccupied ? FontWeight.normal : FontWeight.bold,
              ),
            ),
            if (isOccupied) ...[
              const SizedBox(width: 4),
              const Text(
                '(着席済み)',
                style: TextStyle(
                  color: Colors.red,
                  fontSize: 12,
                ),
              ),
            ],
          ],
        ),
      );
    });
  }

  TournamentTable _tableForSelectedId() {
    final id = _selectedTableId;
    if (id == null) {
      throw StateError('tableId');
    }
    for (final t in _tournamentTables) {
      if (t.tableId == id) return t;
    }
    return TournamentTable(
      tableId: id,
      name: id,
      maxSeats: 9,
      status: 'open',
      isEnabled: true,
      seats: const {},
    );
  }

  Widget _buildAssignmentConfirmation() {
    final selectedPlayer =
        _waitingPlayers.firstWhere((p) => p.userId == _selectedUserId);
    final selectedTable = _tableForSelectedId();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.green[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '着席内容の確認',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.green[700],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            selectedPlayer.isOkibakeTemporary
                ? '待機者: ${selectedPlayer.displayName}（置きバケ）'
                : '待機者: ${selectedPlayer.displayName}',
          ),
          Text('テーブル: ${selectedTable.name}'),
          Text('シート: $_selectedSeatNumber'),
        ],
      ),
    );
  }

  Future<void> _submitSeatAssignment() async {
    if (_isLoading || _dataLoadFailed) return;
    if (_selectedUserId == null ||
        _selectedTableId == null ||
        _selectedSeatNumber == null) {
      return;
    }

    final selectedPlayer = _waitingPlayers.firstWhere(
      (player) => player.userId == _selectedUserId,
    );

    setState(() {
      _isLoading = true;
    });

    try {
      if (selectedPlayer.isOkibakeTemporary) {
        final okibakeEntryId = selectedPlayer.okibakeEntryId;
        if (okibakeEntryId == null || okibakeEntryId.isEmpty) {
          throw StateError('置きバケ参加者の okibakeEntryId が取得できません');
        }

        final seatKey =
            ScheduledTournamentSeatMap.canonicalSeatKeyFromSeatNumber(
                _selectedSeatNumber!);

        // TOUR-43: Result factory（soft-fail / formatter）を維持
        final result = await widget.service.assignOkibakeTemporaryEntryToSeat(
          tournamentId: widget.tournamentId,
          okibakeEntryId: okibakeEntryId,
          tableId: _selectedTableId!,
          seatKey: seatKey,
        );

        if (result.success) {
          if (mounted) {
            Navigator.of(context).pop();
            widget.onSeatAssigned();
          }
        } else if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                result.errorMessage ??
                    mapTournamentOpsSoftFail(
                      null,
                      operation: kAssignSeatToPlayerOperation,
                    ),
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
      } else {
        final result = await widget.service.assignSeatToPlayer(
          tournamentId: widget.tournamentId,
          userId: _selectedUserId!,
          tableId: _selectedTableId!,
          seatNumber: _selectedSeatNumber!,
        );

        if (!mounted) return;

        if (isCallableSuccessResponse(result)) {
          Navigator.of(context).pop();
          widget.onSeatAssigned();
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                mapTournamentOpsSoftFail(
                  result,
                  operation: kAssignSeatToPlayerOperation,
                ),
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            // TOUR-44: formatter のみ。raw fallback なし。
            content: Text(formatTournamentCallableError(e)),
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

  Future<void> _loadData() async {
    setState(() {
      _isLoadingData = true;
      _dataLoadFailed = false;
    });

    try {
      final waitingPlayers =
          await _dataService.getMergedWaitingPlayers(widget.tournamentId);
      final tournamentTables =
          await _dataService.getTournamentTables(widget.tournamentId);

      if (!mounted) return;
      setState(() {
        _waitingPlayers = waitingPlayers;
        _tournamentTables = tournamentTables;
        _isLoadingData = false;
        _dataLoadFailed = false;
      });

      // TOUR-47: 待機リスト不在は業務文言（空リストとは別）
      if (widget.preselectedUserId != null &&
          !_waitingPlayers.any((w) => w.userId == widget.preselectedUserId)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(kTournamentWaitingNotInListMessage),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _waitingPlayers = [];
        _tournamentTables = [];
        _isLoadingData = false;
        _dataLoadFailed = true;
      });
    }
  }
}
