import 'package:flutter/material.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/services/tournament_data_service.dart';
import 'package:amuse_app_template/tournament/active/services/seat_decision_logic.dart';


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
  final List<String> _reseatTargetUserIds = [];
  bool _isLoading = false;
  bool _isLoadingData = true;
  List<WaitingPlayer> _waitingPlayers = [];
  List<TournamentTable> _tournamentTables = [];
  List<String> _seatedUserIds = []; // 既着席者のユーザーIDリスト
  Map<String, String> _seatedUsersMap = {}; // userId -> pokerName
  final TournamentDataService _dataService = TournamentDataService();
  
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
                  height: 400,
                  child: Column(
                    children: [
                      const Text('リシート対象者を選択してください'),
                      const SizedBox(height: 16),
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
                    onPressed: _isLoading || _reseatTargetUserIds.isEmpty
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

  /// 待機者リストを構築
  Widget _buildWaitingList() {
    if (_isLoadingData) {
      return const Center(child: CircularProgressIndicator());
    }
    
    // 待機時間でソート（長い順）
    final sortedWaitingPlayers = List<WaitingPlayer>.from(_waitingPlayers)
      ..sort((a, b) => b.waitingMinutes.compareTo(a.waitingMinutes));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '待機者リスト (${sortedWaitingPlayers.length}人)',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: ListView.builder(
            itemCount: sortedWaitingPlayers.length,
            itemBuilder: (context, index) {
              final player = sortedWaitingPlayers[index];
              final isSelected = _reseatTargetUserIds.contains(player.userId);
              
              return Card(
                child: ListTile(
                  title: Text(player.displayName),
                  subtitle: Text('待機時間: ${player.waitingMinutes}分'),
                  trailing: IconButton(
                    icon: Icon(
                      isSelected ? Icons.remove_circle : Icons.add_circle,
                      color: isSelected ? Colors.red : Colors.green,
                    ),
                    onPressed: () {
                      setState(() {
                        if (isSelected) {
                          _reseatTargetUserIds.remove(player.userId);
                        } else {
                          _reseatTargetUserIds.add(player.userId);
                        }
                      });
                    },
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  /// リシート対象者リストを構築
  Widget _buildReseatTargetList() {
    // 新規追加された待機者と既着席者を分離
    final selectedWaitingUsers = _reseatTargetUserIds.where((id) => !_seatedUserIds.contains(id)).toList();
    final seatedUsers = _reseatTargetUserIds.where((id) => _seatedUserIds.contains(id)).toList();
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'リシート対象者 (${_reseatTargetUserIds.length}人)',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _reseatTargetUserIds.isEmpty
              ? const Center(
                  child: Text(
                    '待機者を選択してください',
                    style: TextStyle(color: Colors.grey),
                  ),
                )
              : ListView(
                  children: [
                    // 新規追加された待機者（上に表示）
                    if (selectedWaitingUsers.isNotEmpty) ...[
                      Text(
                        '新規追加 (${selectedWaitingUsers.length}人)',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.orange,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      ...selectedWaitingUsers.map((userId) {
                        final waitingPlayer = _waitingPlayers.firstWhere(
                          (p) => p.userId == userId,
                          orElse: () => WaitingPlayer(
                            userId: userId,
                            displayName: 'ユーザー$userId',
                            joinedAt: DateTime.now(),
                          ),
                        );
                        
                        return Card(
                          color: Colors.orange[50],
                          child: ListTile(
                            title: Text(waitingPlayer.displayName),
                            subtitle: Text('待機時間: ${waitingPlayer.waitingMinutes}分'),
                            leading: Icon(Icons.access_time, color: Colors.orange),
                            trailing: IconButton(
                              icon: const Icon(Icons.remove_circle, color: Colors.red),
                              onPressed: () {
                                setState(() {
                                  _reseatTargetUserIds.remove(userId);
                                });
                              },
                            ),
                          ),
                        );
                      }).toList(),
                      const SizedBox(height: 16),
                    ],
                    
                    // 既着席者（下に表示）
                    if (seatedUsers.isNotEmpty) ...[
                      Text(
                        '既着席者 (${seatedUsers.length}人)',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      ...seatedUsers.map((userId) {
                        final pokerName = _seatedUsersMap[userId] ?? 'ユーザー$userId';
                        
                        return Card(
                          color: Colors.blue[50],
                          child: ListTile(
                            title: Text(pokerName),
                            subtitle: const Text('既着席者'),
                            leading: Icon(Icons.chair, color: Colors.blue),
                            // 既着席者は削除ボタンを表示しない
                          ),
                        );
                      }).toList(),
                    ],
                  ],
                ),
        ),
      ],
    );
  }

  /// 容量情報を表示
  Widget _buildCapacityInfo() {
    if (_isLoadingData) {
      return const SizedBox.shrink();
    }
    
    final availableSeats = _tournamentTables
        .fold<int>(0, (sum, table) => sum + table.maxSeats);
    
    final selectedCount = _reseatTargetUserIds.length;
    final seatedCount = _seatedUserIds.length;
    final waitingCount = selectedCount - seatedCount;
    final isOverCapacity = selectedCount > availableSeats;
    
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
          Text('利用可能座席数: $availableSeats席'),
          Text('選択された人数: $selectedCount人'),
          if (isOverCapacity)
            Text(
              '⚠️ 座席数が不足しています',
              style: const TextStyle(
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
          final availableSeats = _tournamentTables
          .fold<int>(0, (sum, table) => sum + table.maxSeats);
    
    if (_reseatTargetUserIds.length > availableSeats) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('座席数が不足しています'),
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
            '${_reseatTargetUserIds.length}人のリシートを実行しますか？\n'
            'この操作は取り消せません。',
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
      print('\n========================================');
      print('=== リシート実行開始 ===');
      print('========================================');
      
      // 利用可能なテーブルとシートを取得
      final availableTables = _tournamentTables;
      print('テーブル数: ${availableTables.length}');
      for (var table in availableTables) {
        print('  - ${table.tableId}: maxSeats = ${table.maxSeats}');
      }
      
      // テーブル情報を作成
      final tableInfos = availableTables.map((table) => TableInfo(
        tableId: table.tableId,
        maxSeats: table.maxSeats,
      )).toList();
      
      // テーブルごとの人数を振り分け
      print('\n対象プレイヤー数: ${_reseatTargetUserIds.length}');
      final distribution = SeatDecisionLogic.distributePlayersAcrossTables(
        totalPlayers: _reseatTargetUserIds.length,
        tables: tableInfos,
      );
      print('テーブルごとの振り分け: $distribution');
      
      // 全プレイヤーをランダムにシャッフル
      final allPlayerIds = List<String>.from(_reseatTargetUserIds);
      allPlayerIds.shuffle();
      print('シャッフル後のプレイヤー順: $allPlayerIds');
      
      // プレイヤーを座席決定ロジックに基づいて割り当て
      final playerAssignments = <Map<String, dynamic>>[];
      int playerIndex = 0;
      
      for (final table in availableTables) {
        final assignedCount = distribution[table.tableId] ?? 0;
        if (assignedCount == 0) continue;
        
        print('\n--- テーブル ${table.tableId} の処理開始 ---');
        print('割り当て人数: $assignedCount');
        
        // このテーブルに割り当てられた人数分だけ座席を割り当て
        print('このテーブルへの割り当て:');
        for (int i = 0; i < assignedCount && playerIndex < allPlayerIds.length; i++) {
          print('\n  --- ${i + 1}人目の配置 ---');
          
          // 現在の座席状態を取得（今までの割り当てを含む）
          final currentSeats = <int, bool>{};
          for (int seat = 1; seat <= table.maxSeats; seat++) {
            // 元々座っていた人をチェック
            final seatData = table.seats[seat];
            bool isOccupied = seatData != null && seatData.userId != null;
            
            // 今回のリシートで既に割り当てた座席もチェック
            if (!isOccupied) {
              for (var assignment in playerAssignments) {
                if (assignment['tableId'] == table.tableId && 
                    assignment['seatNumber'] == seat) {
                  isOccupied = true;
                  break;
                }
              }
            }
            
            currentSeats[seat] = isOccupied;
          }
          print('  現在の座席状態: $currentSeats');
          
          // 優先順位付けされた座席リストを再計算
          final prioritizedSeats = SeatDecisionLogic.getPrioritizedSeats(
            currentSeats: currentSeats,
            maxSeats: table.maxSeats,
          );
          
          // 座席が不足している場合はエラー
          if (prioritizedSeats.isEmpty) {
            throw Exception('利用可能座席数に対して、リシートの対象とする人数が多すぎます');
          }
          
          // 最優先座席（リストの先頭）に割り当て
          final selectedSeat = prioritizedSeats[0];
          final assignment = {
            'userId': allPlayerIds[playerIndex],
            'tableId': table.tableId,
            'seatNumber': selectedSeat,
          };
          print('  ${allPlayerIds[playerIndex]} → 座席$selectedSeat（最優先座席）');
          playerAssignments.add(assignment);
          playerIndex++;
        }
      }
      
      print('\n最終的な割り当て:');
      print('playerAssignments: $playerAssignments');
      print('========================================\n');

      final service = TournamentServiceImpl();
      final result = await service.reseatAllPlayers(
        tournamentId: widget.tournamentId,
        playerAssignments: playerAssignments,
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
      final waitingPlayers = await _dataService.getWaitingPlayers(widget.tournamentId);
      final tournamentTables = await _dataService.getTournamentTables(widget.tournamentId);
      
      // 既着席者の情報を取得（重複を避けるためMapを使用）
      final seatedUsersMap = <String, String>{}; // userId -> pokerName
      for (final table in tournamentTables) {
        for (final seatData in table.seats.values) {
          if (seatData != null && seatData.userId != null && seatData.pokerName != null) {
            seatedUsersMap[seatData.userId!] = seatData.pokerName!;
          }
        }
      }
      
      setState(() {
        _waitingPlayers = waitingPlayers;
        _tournamentTables = tournamentTables;
        _seatedUserIds = seatedUsersMap.keys.toList();
        _seatedUsersMap = seatedUsersMap;
        _isLoadingData = false;
        
        // 既着席者を自動的にリシート対象に追加
        _reseatTargetUserIds.addAll(seatedUsersMap.keys);
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
