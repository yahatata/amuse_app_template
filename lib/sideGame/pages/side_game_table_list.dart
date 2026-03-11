import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/sideGame/pages/side_game_table_home.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';
import 'package:amuse_app_template/utils/store_strong_warning_ui.dart';

class SideGameTableListPage extends StatefulWidget {
  const SideGameTableListPage({super.key});

  @override
  State<SideGameTableListPage> createState() => _SideGameTableListPageState();
}

class _SideGameTableListPageState extends State<SideGameTableListPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final DeviceService _deviceService = DeviceService();

  List<String> get _sideGameTypes =>
      StoreConfigService.instance.latestData?.sideGameTypes ?? kDefaultSideGameTypes;

  String? _myTableId;
  Set<String> _excludedTableIds = {};
  bool _isLoadingPermissions = true;

  @override
  void initState() {
    super.initState();
    _loadPermissions();
  }

  Future<void> _loadPermissions() async {
    try {
      // 1. 現在のデバイス情報を取得
      final device = await _deviceService.getCurrentDevice();
      _myTableId = device?.getTableIdForOption(DeviceOptionKeys.sideGame);

      // 2. 他デバイスでtournament_table用に指定された卓を除外リストに追加
      final devicesSnap = await _firestore.collection('devices').get();
      final excluded = <String>{};
      for (final doc in devicesSnap.docs) {
        if (doc.id == device?.id) continue; // 自分自身は除外対象外
        final params = doc.data()['optionParams'] as Map<String, dynamic>?;
        final tableId = params?[DeviceOptionKeys.tournamentTable]?['tableId'] as String?;
        if (tableId != null) {
          excluded.add(tableId);
        }
      }

      if (mounted) {
        setState(() {
          _excludedTableIds = excluded;
          _isLoadingPermissions = false;
        });
      }
    } catch (e) {
      print('権限読み込みエラー: $e');
      if (mounted) {
        setState(() {
          _isLoadingPermissions = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('サイドゲーム テーブル選択'),
        centerTitle: true,
      ),
      body: StoreStrongWarningWrapper(
        onCloseStore: () {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const terminalHomePage()),
            (route) => false,
          );
        },
        onBusinessContinue: () {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const terminalHomePage()),
            (route) => false,
          );
        },
        child: _isLoadingPermissions
          ? const Center(child: CircularProgressIndicator())
          : StreamBuilder<QuerySnapshot>(
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
                      if (data['isEnabled'] != true) return false;

                      // 自分に卓番付与がある場合はその卓のみ
                      if (_myTableId != null && doc.id != _myTableId) return false;

                      // 他デバイスでtournament_table用に指定された卓は除外
                      if (_excludedTableIds.contains(doc.id)) return false;

                      return true;
                    })
                    .toList();

                if (tables.isEmpty) {
                  return Center(
                    child: Text(
                      _myTableId != null
                          ? '指定された卓が見つかりません'
                          : '利用可能な卓がありません',
                      style: const TextStyle(color: Colors.grey),
                    ),
                  );
                }

                return _buildTableGrid(tables);
              },
            ),
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
    final isSideGame = _sideGameTypes.contains(status);

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
    } else if (_sideGameTypes.contains(status)) {
      return status;
    } else {
      return '$status使用中';
    }
  }

  void _handleTableSelection(String tableId, String status) async {
    final isAvailable = status == 'open';
    final isSideGame = _sideGameTypes.contains(status);
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
            itemCount: _sideGameTypes.length,
            itemBuilder: (context, index) {
              final game = _sideGameTypes[index];
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
