import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';
import 'package:amuse_app_template/tournament/active/models/scheduled_tournament_seat_map.dart';

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

  bool _isLoadingDeviceFilters = true;
  String? _myTableId;
  Set<String> _excludedTableIds = {};

  @override
  void initState() {
    super.initState();
    _loadDeviceFilters();
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> _tablesSeatStream() {
    return _firestore
        .collection('scheduledTournaments')
        .doc(widget.tournamentId)
        .collection('tablesSeat')
        .snapshots();
  }

  Future<void> _loadDeviceFilters() async {
    try {
      final device = await _deviceService.getCurrentDevice();
      final myTableId =
          device?.getTableIdForOption(DeviceOptionKeys.tournamentTable);

      final devicesSnap = await _firestore.collection('devices').get();
      final excluded = <String>{};
      for (final doc in devicesSnap.docs) {
        if (doc.id == device?.id) continue;
        final params = doc.data()['optionParams'] as Map<String, dynamic>?;
        final tableId =
            params?[DeviceOptionKeys.sideGame]?['tableId'] as String?;
        if (tableId != null) {
          excluded.add(tableId);
        }
      }

      if (!mounted) return;
      setState(() {
        _myTableId = myTableId;
        _excludedTableIds = excluded;
        _isLoadingDeviceFilters = false;
      });
    } catch (e) {
      debugPrint('卓選択フィルタ取得エラー: $e');
      if (!mounted) return;
      setState(() {
        _isLoadingDeviceFilters = false;
      });
    }
  }

  List<Map<String, dynamic>> _buildTableList(
    QuerySnapshot<Map<String, dynamic>> tablesSnap,
  ) {
    final tables = <Map<String, dynamic>>[];
    for (final doc in tablesSnap.docs) {
      if (doc.id == 'waiting' || doc.id == 'busted') continue;

      final data = doc.data();
      final tableId = doc.id;

      if (_myTableId != null && tableId != _myTableId) continue;
      if (_excludedTableIds.contains(tableId)) continue;

      tables.add({
        'id': tableId,
        'name': data['name'] as String? ?? tableId,
        ...data,
      });
    }

    tables.sort((a, b) => (a['name'] as String).compareTo(b['name'] as String));
    return tables;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          '卓を選択\n${widget.tournamentName}',
          style: const TextStyle(fontSize: 16),
        ),
      ),
      body: _isLoadingDeviceFilters
          ? const Center(child: CircularProgressIndicator())
          : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: _tablesSeatStream(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Text(
                      '卓一覧の取得に失敗しました: ${snapshot.error}',
                      style: const TextStyle(color: Colors.red),
                      textAlign: TextAlign.center,
                    ),
                  );
                }
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                final tables = _buildTableList(snapshot.data!);
                if (tables.isEmpty) {
                  return Center(
                    child: Text(
                      _myTableId != null
                          ? '指定された卓がこのトーナメントに存在しません'
                          : '卓がありません',
                      style: const TextStyle(color: Colors.grey),
                      textAlign: TextAlign.center,
                    ),
                  );
                }

                return ListView.builder(
                  itemCount: tables.length,
                  itemBuilder: (context, index) {
                    final table = tables[index];
                    final name = table['name'] as String;
                    final seats = table['seats'] as Map<String, dynamic>? ?? {};
                    final maxSeatsResolved =
                        ScheduledTournamentSeatMap.resolvedTableMaxSeats(
                      table['maxSeats'],
                      seats,
                      fallbackWhenUnresolved: 6,
                    );
                    final occupiedCount = ScheduledTournamentSeatMap.occupiedCount(
                      seats,
                      maxSeatsResolved,
                    );

                    return ListTile(
                      leading: const Icon(Icons.table_restaurant),
                      title: Text(name),
                      subtitle: Text('$occupiedCount / $maxSeatsResolved 席'),
                      onTap: () {
                        widget.onSelected(table['id'] as String, name);
                      },
                    );
                  },
                );
              },
            ),
    );
  }
}
