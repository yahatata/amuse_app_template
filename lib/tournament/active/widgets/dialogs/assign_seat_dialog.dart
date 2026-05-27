import 'package:amuse_app_template/tournament/active/models/scheduled_tournament_seat_map.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';
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
  List<WaitingPlayer> _waitingPlayers = [];
  List<TournamentTable> _tournamentTables = [];
  final TournamentDataService _dataService = TournamentDataService();

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

                      // 待機者選択
                      if (_isLoadingData)
                        const Center(child: CircularProgressIndicator())
                      else
                        DropdownButtonFormField<String>(
                          decoration: const InputDecoration(
                            labelText: '待機者',
                            border: OutlineInputBorder(),
                          ),
                          value: _waitingPlayers.any((w) => w.userId == _selectedUserId)
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

                      const SizedBox(height: 16),

                      if (!_seatDestinationLocked) ...[
                        if (_isLoadingData)
                          const SizedBox.shrink()
                        else
                          _buildTableSelectionWithStatus(),

                        const SizedBox(height: 16),

                        if (_selectedTableId != null) ...[
                          _buildSeatSelectionWithStatus(),
                          const SizedBox(height: 16),
                        ],
                      ] else ...[
                        if (_isLoadingData)
                          const Center(child: CircularProgressIndicator())
                        else
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

                      // 選択内容の確認表示
                      if (_selectedUserId != null &&
                          _selectedTableId != null &&
                          _selectedSeatNumber != null) ...[
                        _buildAssignmentConfirmation(),
                        const SizedBox(height: 16),
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
    if (_isLoading) return false;
    return _selectedUserId != null &&
        _selectedTableId != null &&
        _selectedSeatNumber != null;
  }

  Widget _buildTableSelectionWithStatus() {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('tablesSeat')
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Text('エラー: ${snapshot.error}',
              style: const TextStyle(color: Colors.red));
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final allDocs = snapshot.data?.docs ?? [];
        final tables =
            allDocs.where((doc) => doc.id != 'waiting' && doc.id != 'busted').toList();

        return DropdownButtonFormField<String>(
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
            final seats = tableData?['seats'] as Map<String, dynamic>? ?? {};

            final maxSeats = ScheduledTournamentSeatMap.resolvedTableMaxSeats(
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
                  });
                },
        );
      },
    );
  }

  Widget _buildSeatSelectionWithStatus() {
    if (_selectedTableId == null) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('tablesSeat')
          .doc(_selectedTableId!)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Text('エラー: ${snapshot.error}',
              style: const TextStyle(color: Colors.red));
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final data = snapshot.data?.data() != null
            ? Map<String, dynamic>.from(snapshot.data!.data()! as Map)
            : null;
        final seats = data?['seats'] as Map<String, dynamic>? ?? {};

        return DropdownButtonFormField<int>(
          decoration: const InputDecoration(
            labelText: 'シート番号',
            border: OutlineInputBorder(),
          ),
          value:
              _seatNumberSelectable(seats, _selectedSeatNumber) ? _selectedSeatNumber : null,
          items: _buildSeatItemsWithStatus(seats),
          onChanged: _isLoading
              ? null
              : (value) {
                  setState(() {
                    _selectedSeatNumber = value;
                  });
                },
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
              Text(
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
    if (_isLoading) return;
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
              content: Text(result.errorMessage ?? '着席に失敗しました'),
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

        if (result['success'] == true) {
          if (mounted) {
            Navigator.of(context).pop();
            widget.onSeatAssigned();
          }
        } else {
          throw Exception('着席に失敗しました');
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
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
    try {
      final waitingPlayers =
          await _dataService.getMergedWaitingPlayers(widget.tournamentId);
      final tournamentTables =
          await _dataService.getTournamentTables(widget.tournamentId);

      setState(() {
        _waitingPlayers = waitingPlayers;
        _tournamentTables = tournamentTables;
        _isLoadingData = false;
      });

      if (widget.preselectedUserId != null &&
          !_waitingPlayers.any((w) => w.userId == widget.preselectedUserId)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('選択した参加者は現在待機リストにいません'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
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
