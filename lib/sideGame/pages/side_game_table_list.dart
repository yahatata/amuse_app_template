import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/globalConstant.dart';
import 'package:amuse_app_template/sideGame/pages/side_game_table_home.dart';

class SideGameTableListPage extends StatefulWidget {
  const SideGameTableListPage({super.key});

  @override
  State<SideGameTableListPage> createState() => _SideGameTableListPageState();
}

class _SideGameTableListPageState extends State<SideGameTableListPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('サイドゲーム テーブル選択'),
        centerTitle: true,
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: _firestore.collection('tables').snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Text('エラーが発生しました: ${snapshot.error}'),
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final tables = snapshot.data!.docs
              .where((doc) {
                final data = doc.data() as Map<String, dynamic>;
                return data['isEnabled'] == true;
              })
              .toList();

          return _buildTableGrid(tables);
        },
      ),
    );
  }

  Widget _buildTableGrid(List<QueryDocumentSnapshot> tables) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: GridView.builder(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 5,
          childAspectRatio: 0.8,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
        ),
        itemCount: tables.length,
        itemBuilder: (context, index) {
          final table = tables[index];
          final data = table.data() as Map<String, dynamic>;
          return _buildTableCard(table.id, data);
        },
      ),
    );
  }

  Widget _buildTableCard(String tableId, Map<String, dynamic> data) {
    final name = data['name'] as String? ?? tableId;
    final status = data['status'] as String? ?? 'open';
    final maxSeats = data['maxSeats'] as int? ?? 6;

    final isAvailable = status == 'open';
    final isSideGame = GlobalConstants.sideGameTypes.contains(status);

    return Card(
      elevation: 4,
      color: isAvailable ? Colors.white : Colors.grey[300],
      child: InkWell(
        onTap: () => _handleTableSelection(tableId, status),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.table_restaurant,
                size: 40,
                color: isAvailable ? Colors.green : Colors.grey,
              ),
              const SizedBox(height: 8),
              Text(
                name,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: isAvailable ? Colors.black : Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                '$maxSeats席',
                style: TextStyle(
                  fontSize: 14,
                  color: isAvailable ? Colors.black87 : Colors.grey[600],
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isAvailable
                      ? Colors.green[100]
                      : isSideGame
                          ? Colors.blue[100]
                          : Colors.orange[100],
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _getStatusText(status),
                  style: TextStyle(
                    fontSize: 12,
                    color: isAvailable
                        ? Colors.green[800]
                        : isSideGame
                            ? Colors.blue[800]
                            : Colors.orange[800],
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _getStatusText(String status) {
    if (status == 'open') {
      return '使用可能';
    } else if (GlobalConstants.sideGameTypes.contains(status)) {
      return status;
    } else {
      return '$status使用中';
    }
  }

  void _handleTableSelection(String tableId, String status) async {
    final isAvailable = status == 'open';
    final isSideGame = GlobalConstants.sideGameTypes.contains(status);
    final isInUse = !isAvailable && !isSideGame;

    if (isInUse) {
      // 他のゲームで使用中の場合は確認ダイアログを表示
      final confirmed = await _showWarningDialog(status);
      if (!confirmed) return;
    }

    if (isSideGame) {
      // サイドゲーム中の場合は直接テーブルホームに遷移
      _navigateToTableHome(tableId, status);
    } else {
      // 使用可能または他のゲーム使用中の場合はゲーム選択ダイアログを表示
      final selectedGame = await _showGameSelectionDialog();
      if (selectedGame != null) {
        await _updateTableStatus(tableId, selectedGame);
        _navigateToTableHome(tableId, selectedGame);
      }
    }
  }

  Future<bool> _showWarningDialog(String currentStatus) async {
    return await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(
          Icons.warning,
          color: Colors.orange,
          size: 48,
        ),
        title: const Text('確認'),
        content: Text('他ゲームで使用中となっていますが、上書きを行って問題ないですか？\n\n現在の状態: $currentStatus使用中'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
            ),
            child: const Text('確認'),
          ),
        ],
      ),
    ) ?? false;
  }

  Future<String?> _showGameSelectionDialog() async {
    return await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('ゲームを選択してください'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: GlobalConstants.sideGameTypes.length,
            itemBuilder: (context, index) {
              final game = GlobalConstants.sideGameTypes[index];
              return ListTile(
                leading: const Icon(Icons.casino),
                title: Text(game),
                onTap: () => Navigator.of(context).pop(game),
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

  Future<void> _updateTableStatus(String tableId, String gameName) async {
    try {
      // tablesコレクションのstatusを更新
      await _firestore.collection('tables').doc(tableId).update({
        'status': gameName,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      // sideGameコレクションのactiveフィールドをtrueに更新
      await _firestore.collection('sideGame').doc(tableId).update({
        'active': true,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$gameName でテーブルを開始しました'),
            backgroundColor: Colors.green,
          ),
        );
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
    }
  }

  void _navigateToTableHome(String tableId, String gameName) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => SideGameTableHomePage(
          tableId: tableId,
          gameName: gameName,
        ),
      ),
    );
  }
}
