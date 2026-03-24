import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/services/tournament_data_service.dart';


class AssignSeatDialog extends StatefulWidget {
  final String tournamentId;
  final VoidCallback onSeatAssigned;
  final String? preselectedUserId; // 事前選択されたユーザーID
  final TournamentService service;

  const AssignSeatDialog({
    super.key,
    required this.tournamentId,
    required this.onSeatAssigned,
    this.preselectedUserId,
    required this.service,
  });

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

  @override
  void initState() {
    super.initState();
    // 事前選択されたユーザーIDがある場合は設定
    if (widget.preselectedUserId != null) {
      _selectedUserId = widget.preselectedUserId;
    }
    // データを読み込み
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
                          value: _selectedUserId,
                          items: _waitingPlayers
                              .map((player) => DropdownMenuItem(
                                    value: player.userId,
                                    child: Text('${player.displayName} (待機${player.waitingMinutes}分)'),
                                  ))
                              .toList(),
                          onChanged: (value) {
                            setState(() {
                              _selectedUserId = value;
                            });
                          },
                        ),

                      const SizedBox(height: 16),

                      // テーブル選択（リアルタイム状態監視）
                      if (_isLoadingData)
                        const SizedBox.shrink()
                      else
                        _buildTableSelectionWithStatus(),

                      const SizedBox(height: 16),

                      // シート選択（リアルタイム状態監視）
                      if (_selectedTableId != null) ...[
                        _buildSeatSelectionWithStatus(),
                        const SizedBox(height: 16),
                      ],

                      // 選択内容の確認表示
                      if (_selectedUserId != null && _selectedTableId != null && _selectedSeatNumber != null) ...[
                        _buildAssignmentConfirmation(),
                        const SizedBox(height: 16),
                      ],
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  ElevatedButton(
                    onPressed: _isLoading || _selectedUserId == null || _selectedTableId == null || _selectedSeatNumber == null
                        ? null
                        : _assignSeatToPlayer,
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

  /// シート番号の選択肢を生成
  List<DropdownMenuItem<int>> _buildSeatItems() {
    final selectedTable = _tournamentTables.firstWhere(
      (table) => table.tableId == _selectedTableId,
    );
    
    return List.generate(selectedTable.maxSeats, (index) {
      final seatNumber = index + 1;
      return DropdownMenuItem(
        value: seatNumber,
        child: Text('シート $seatNumber'),
      );
    });
  }

  /// テーブル選択（リアルタイム状態監視）
  Widget _buildTableSelectionWithStatus() {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('tablesSeat')
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Text('エラー: ${snapshot.error}', style: const TextStyle(color: Colors.red));
        }
        
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        
        final allDocs = snapshot.data?.docs ?? [];
        final tables = allDocs.where((doc) => doc.id != 'waiting' && doc.id != 'busted').toList();
        
        return DropdownButtonFormField<String>(
          decoration: const InputDecoration(
            labelText: 'テーブル',
            border: OutlineInputBorder(),
          ),
          value: _selectedTableId,
          items: tables.map((tableDoc) {
            final tableId = tableDoc.id;
            final tableData = tableDoc.data() != null 
                ? Map<String, dynamic>.from(tableDoc.data()! as Map)
                : null;
            final seats = tableData?['seats'] as Map<String, dynamic>? ?? {};
            
            // 着席数をカウント
            final occupiedSeats = seats.entries
                .where((entry) => entry.key.endsWith('UserId') && entry.value != null)
                .length;
            
            // 最大席数を取得
            final maxSeats = tableData?['maxSeats'] as int? ?? 0;
            
            return DropdownMenuItem(
              value: tableId,
              child: Text('$tableId ($occupiedSeats/$maxSeats席)'),
            );
          }).toList(),
          onChanged: (value) {
            setState(() {
              _selectedTableId = value;
              _selectedSeatNumber = null; // テーブル変更時はシートをリセット
            });
          },
        );
      },
    );
  }

  /// 座席の状態を取得するStreamBuilder
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
          return Text('エラー: ${snapshot.error}', style: const TextStyle(color: Colors.red));
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
          value: _selectedSeatNumber,
          items: _buildSeatItemsWithStatus(seats),
          onChanged: (value) {
            setState(() {
              _selectedSeatNumber = value;
            });
          },
        );
      },
    );
  }

  /// 座席の状態を考慮したシート選択肢を生成
  List<DropdownMenuItem<int>> _buildSeatItemsWithStatus(Map<String, dynamic> seats) {
    final selectedTable = _tournamentTables.firstWhere(
      (table) => table.tableId == _selectedTableId,
    );
    
    return List.generate(selectedTable.maxSeats, (index) {
      final seatNumber = index + 1;
      final seatNoStr = seatNumber.toString().padLeft(2, '0');
      final userId = seats['seat${seatNoStr}UserId'] as String?;
      final isOccupied = userId != null && userId.isNotEmpty;
      
      return DropdownMenuItem(
        value: seatNumber,
        enabled: !isOccupied, // 着席済みの場合は無効化
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
                fontWeight: isOccupied ? FontWeight.normal : FontWeight.bold,
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

  /// 選択内容の確認表示
  Widget _buildAssignmentConfirmation() {
    final selectedPlayer = _waitingPlayers.firstWhere(
      (player) => player.userId == _selectedUserId,
    );
    final selectedTable = _tournamentTables.firstWhere(
      (table) => table.tableId == _selectedTableId,
    );

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
          Text('待機者: ${selectedPlayer.displayName}'),
          Text('テーブル: ${selectedTable.name}'),
          Text('シート: $_selectedSeatNumber'),
        ],
      ),
    );
  }

  /// 待機者を着席させる
  Future<void> _assignSeatToPlayer() async {
    if (_selectedUserId == null || _selectedTableId == null || _selectedSeatNumber == null) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final service = TournamentServiceImpl();
      final result = await service.assignSeatToPlayer(
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
      final waitingPlayers = await _dataService.getWaitingPlayers(widget.tournamentId);
      final tournamentTables = await _dataService.getTournamentTables(widget.tournamentId);
      
      setState(() {
        _waitingPlayers = waitingPlayers;
        _tournamentTables = tournamentTables;
        _isLoadingData = false;
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
