import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../globalConstant.dart';

class RankingSetupPage extends StatefulWidget {
  final String tournamentId;
  
  const RankingSetupPage({
    super.key,
    required this.tournamentId,
  });

  @override
  State<RankingSetupPage> createState() => _RankingSetupPageState();
}

class _RankingSetupPageState extends State<RankingSetupPage> {
  final _functions = FirebaseFunctions.instance;
  
  // データ
  Map<String, dynamic>? _mainViewData;
  List<Map<String, dynamic>> _bustedPlayers = [];
  bool _isLoading = true;
  String? _errorMessage;
  
  // 選択されたプレイヤー
  Map<int, String?> _selectedPlayers = {}; // 順位 -> playerId
  Map<String, Map<String, dynamic>> _playerData = {}; // playerId -> playerData
  
  @override
  void initState() {
    super.initState();
    _loadData();
  }
  
  Future<void> _loadData() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
      
      // メインビューデータとバストプレイヤーデータを取得
      final callable = _functions.httpsCallable('getRankingData');
      final result = await callable.call({
        'tournamentId': widget.tournamentId,
      });
      
      if (result.data['success'] == true) {
        setState(() {
          _mainViewData = Map<String, dynamic>.from(result.data['mainViewData']);
          _bustedPlayers = List<Map<String, dynamic>>.from(
            result.data['bustedPlayers'].map((player) => Map<String, dynamic>.from(player))
          );
          _initializeSelectedPlayers();
        });
      } else {
        setState(() {
          _errorMessage = result.data['error'] ?? 'データの取得に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'エラーが発生しました: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  void _initializeSelectedPlayers() {
    if (_mainViewData == null) return;
    
    final prizeReceiverCount = _mainViewData!['prizeReceiverCount'] as int? ?? 0;
    _selectedPlayers = {};
    
    // 既に登録されているプレイヤーを設定
    for (int i = 1; i <= prizeReceiverCount; i++) {
      final playerName = _mainViewData!['${i}stPlayerName'] as String?;
      final playerUid = _mainViewData!['${i}stPlayerUid'] as String?;
      
      if (playerName != null && playerUid != null) {
        _selectedPlayers[i] = playerUid;
        _playerData[playerUid] = {
          'pokerName': playerName,
          'uid': playerUid,
        };
      }
    }
  }
  
  int _getPrizeAmount(int rank) {
    if (_mainViewData == null) return 0;
    return _mainViewData!['${rank}stPrize'] as int? ?? 0;
  }
  
  bool _isPlayerSelected(int rank) {
    return _selectedPlayers[rank] != null;
  }
  
  bool _isPlayerDisabled(String playerId) {
    return _selectedPlayers.values.contains(playerId);
  }
  
  void _selectPlayer(int rank, String playerId) {
    setState(() {
      _selectedPlayers[rank] = playerId;
      final player = _bustedPlayers.firstWhere((p) => p['uid'] == playerId);
      _playerData[playerId] = {
        'pokerName': player['pokerName'],
        'uid': playerId,
      };
    });
  }
  
  void _clearPlayer(int rank) {
    setState(() {
      final playerId = _selectedPlayers[rank];
      if (playerId != null) {
        _playerData.remove(playerId);
      }
      _selectedPlayers[rank] = null;
    });
  }
  
  Future<void> _confirmRanking() async {
    final selectedCount = _selectedPlayers.values.where((id) => id != null).length;
    if (selectedCount == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('最低1名のプレイヤーを選択してください')),
      );
      return;
    }
    
    // 確認ダイアログを表示
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('順位確定'),
        content: Text('${selectedCount}位に${_playerData[_selectedPlayers[selectedCount]]?['pokerName']}様を登録します。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('確定'),
          ),
        ],
      ),
    );
    
    if (confirmed != true) return;
    
    try {
      setState(() {
        _isLoading = true;
      });
      
      // 順位データを準備
      final rankingData = <String, dynamic>{};
      for (int rank = 1; rank <= _selectedPlayers.length; rank++) {
        final playerId = _selectedPlayers[rank];
        if (playerId != null) {
          final player = _playerData[playerId]!;
          rankingData['${rank}stPlayerName'] = player['pokerName'];
          rankingData['${rank}stPlayerUid'] = playerId;
        }
      }
      
      final callable = _functions.httpsCallable('setRankingData');
      final result = await callable.call({
        'tournamentId': widget.tournamentId,
        'rankingData': rankingData,
      });
      
      if (result.data['success'] == true) {
        // 全ての順位が埋まっているかチェック
        final allRanksFilled = _checkAllRanksFilled();
        
        if (allRanksFilled) {
          // トーナメント終了処理の確認
          final endTournament = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('トーナメント終了'),
              content: const Text('トーナメントの終了処理を行いますか？'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('キャンセル'),
                ),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  child: const Text('終了処理を行う'),
                ),
              ],
            ),
          );
          
          if (endTournament == true) {
            await _endTournament();
          }
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('順位を確定しました')),
        );
        Navigator.of(context).pop();
      } else {
        setState(() {
          _errorMessage = result.data['error'] ?? '順位の確定に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'エラーが発生しました: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  bool _checkAllRanksFilled() {
    if (_mainViewData == null) return false;
    final prizeReceiverCount = _mainViewData!['prizeReceiverCount'] as int? ?? 0;
    
    for (int i = 1; i <= prizeReceiverCount; i++) {
      if (_selectedPlayers[i] == null) return false;
    }
    return true;
  }
  
  Future<void> _endTournament() async {
    try {
      final callable = _functions.httpsCallable('endTournament');
      final result = await callable.call({
        'tournamentId': widget.tournamentId,
      });
      
      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('トーナメントを終了しました')),
        );
        Navigator.of(context).pop();
      } else {
        setState(() {
          _errorMessage = result.data['error'] ?? 'トーナメントの終了に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'エラーが発生しました: $e';
      });
    }
  }
  
  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    
    if (_errorMessage != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('順位確定')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_errorMessage!),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadData,
                child: const Text('再試行'),
              ),
            ],
          ),
        ),
      );
    }
    
    final prizeReceiverCount = _mainViewData?['prizeReceiverCount'] as int? ?? 0;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('順位確定'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // プライズ情報
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'プライズ情報',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text('プライズプール: ¥${(_mainViewData?['prizePool'] as int? ?? 0).toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            
            // 順位選択
            ...List.generate(prizeReceiverCount, (index) {
              final rank = index + 1;
              final prizeAmount = _getPrizeAmount(rank);
              final isSelected = _isPlayerSelected(rank);
              final selectedPlayerId = _selectedPlayers[rank];
              final selectedPlayer = selectedPlayerId != null ? _playerData[selectedPlayerId] : null;
              
              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            '${rank}位',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(width: 16),
                          Text(
                            '¥${prizeAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                            style: const TextStyle(fontSize: 16, color: Colors.green, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      
                      if (isSelected && selectedPlayer != null)
                        // 選択済みプレイヤー表示
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.green[50],
                            border: Border.all(color: Colors.green),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.person, color: Colors.green[700]),
                              const SizedBox(width: 8),
                              Text(
                                selectedPlayer['pokerName'],
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.green[700],
                                ),
                              ),
                              const Spacer(),
                              if (!_isPlayerDisabled(selectedPlayerId!))
                                IconButton(
                                  onPressed: () => _clearPlayer(rank),
                                  icon: const Icon(Icons.clear, color: Colors.red),
                                ),
                            ],
                          ),
                        )
                      else
                        // プレイヤー選択ボタン
                        ElevatedButton.icon(
                          onPressed: () => _showPlayerSelector(rank),
                          icon: const Icon(Icons.person_add),
                          label: const Text('プレイヤーを選択'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blue,
                            foregroundColor: Colors.white,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            }),
            
            const SizedBox(height: 32),
            
            // 確定ボタン
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _confirmRanking,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: const Text(
                  'プライズ付与',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  void _showPlayerSelector(int rank) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${rank}位のプレイヤーを選択'),
        content: SizedBox(
          width: double.maxFinite,
          height: 400,
          child: ListView.builder(
            itemCount: _bustedPlayers.length,
            itemBuilder: (context, index) {
              final player = _bustedPlayers[index];
              final isDisabled = _isPlayerDisabled(player['uid']);
              
              return Card(
                margin: const EdgeInsets.symmetric(vertical: 4),
                child: ListTile(
                  title: Text(
                    player['pokerName'] ?? '不明なプレイヤー',
                    style: TextStyle(
                      color: isDisabled ? Colors.grey : null,
                    ),
                  ),
                  subtitle: Text(
                    '退席時刻: ${_formatDateTime(player['bustAt'])}',
                    style: TextStyle(
                      color: isDisabled ? Colors.grey : null,
                    ),
                  ),
                  enabled: !isDisabled,
                  onTap: isDisabled ? null : () {
                    _selectPlayer(rank, player['uid']);
                    Navigator.of(context).pop();
                  },
                ),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
        ],
      ),
    );
  }
  
  String _formatDateTime(dynamic timestamp) {
    if (timestamp == null) return '不明';
    
    try {
      if (timestamp is Map && timestamp.containsKey('_seconds')) {
        final seconds = timestamp['_seconds'] as int;
        final date = DateTime.fromMillisecondsSinceEpoch(seconds * 1000);
        return '${date.year}/${date.month}/${date.day} ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
      }
      return timestamp.toString();
    } catch (e) {
      return '不明';
    }
  }
}
