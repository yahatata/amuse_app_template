import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';

/// 卓選択ページ
/// デバイスに卓番付与がある場合はその卓のみ表示
/// 他デバイスで逆用途に指定された卓は除外
class TableSelectPage extends StatefulWidget {
  final String tournamentId;
  final String tournamentName;
  final Function(String tableId, String tableName) onSelected;

  const TableSelectPage({
    super.key,
    required this.tournamentId,
    required this.tournamentName,
    required this.onSelected,
  });

  @override
  State<TableSelectPage> createState() => _TableSelectPageState();
}

class _TableSelectPageState extends State<TableSelectPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final DeviceService _deviceService = DeviceService();

  bool _isLoading = true;
  List<Map<String, dynamic>> _tables = [];
  String? _myTableId;
  Set<String> _excludedTableIds = {};

  @override
  void initState() {
    super.initState();
    _loadTables();
  }

  Future<void> _loadTables() async {
    try {
      // 1. 現在のデバイス情報を取得
      final device = await _deviceService.getCurrentDevice();
      _myTableId = device?.getTableIdForOption(DeviceOptionKeys.tournamentTable);

      // 2. 他デバイスでside_game用に指定された卓を除外リストに追加
      final devicesSnap = await _firestore.collection('devices').get();
      final excluded = <String>{};
      for (final doc in devicesSnap.docs) {
        if (doc.id == device?.id) continue; // 自分自身は除外対象外
        final params = doc.data()['optionParams'] as Map<String, dynamic>?;
        final tableId = params?[DeviceOptionKeys.sideGame]?['tableId'] as String?;
        if (tableId != null) {
          excluded.add(tableId);
        }
      }
      _excludedTableIds = excluded;

      // 3. トーナメントの卓一覧を取得（tablesSeatサブコレクション）
      final tablesSnap = await _firestore
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('tablesSeat')
          .get();

      final tables = <Map<String, dynamic>>[];
      for (final doc in tablesSnap.docs) {
        // waiting, busted は卓ではないのでスキップ
        if (doc.id == 'waiting' || doc.id == 'busted') continue;

        final data = doc.data();
        final tableId = doc.id;

        // 自分に卓番付与がある場合はその卓のみ
        if (_myTableId != null && tableId != _myTableId) continue;

        // 他デバイスでside_game用に指定された卓は除外
        if (_excludedTableIds.contains(tableId)) continue;

        tables.add({
          'id': tableId,
          'name': data['name'] as String? ?? tableId,
          ...data,
        });
      }

      // 卓名でソート
      tables.sort((a, b) => (a['name'] as String).compareTo(b['name'] as String));

      setState(() {
        _tables = tables;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('卓一覧取得エラー: $e');
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('卓を選択\n${widget.tournamentName}', style: const TextStyle(fontSize: 16)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _tables.isEmpty
              ? Center(
                  child: Text(
                    _myTableId != null
                        ? '指定された卓がこのトーナメントに存在しません'
                        : '卓がありません',
                    style: const TextStyle(color: Colors.grey),
                    textAlign: TextAlign.center,
                  ),
                )
              : ListView.builder(
                  itemCount: _tables.length,
                  itemBuilder: (context, index) {
                    final table = _tables[index];
                    final name = table['name'] as String;
                    final seats = table['seats'] as Map<String, dynamic>? ?? {};
                    // seatXXUserIdで終わるキーの値がnullでないものを数える
                    final occupiedCount = seats.entries
                        .where((entry) => entry.key.endsWith('UserId') && entry.value != null && (entry.value as String).isNotEmpty)
                        .length;
                    final maxSeats = table['maxSeats'] as int? ?? seats.length;

                    return ListTile(
                      leading: const Icon(Icons.table_restaurant),
                      title: Text(name),
                      subtitle: Text('$occupiedCount / $maxSeats 席'),
                      onTap: () {
                        widget.onSelected(table['id'] as String, name);
                      },
                    );
                  },
                ),
    );
  }
}

