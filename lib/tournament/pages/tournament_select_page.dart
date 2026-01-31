import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';

/// トーナメント選択ページ
/// 開催中と今後開催で分けて表示
/// filterByTableId が指定されている場合、その卓が登録されているトーナメントのみ表示
class TournamentSelectPage extends StatefulWidget {
  final String title;
  final Function(String tournamentId, String tournamentName) onSelected;
  /// trueの場合、デバイスに指定された卓番を持つトーナメントのみ表示
  final bool filterByDeviceTable;

  const TournamentSelectPage({
    super.key,
    this.title = 'トーナメントを選択',
    required this.onSelected,
    this.filterByDeviceTable = false,
  });

  @override
  State<TournamentSelectPage> createState() => _TournamentSelectPageState();
}

class _TournamentSelectPageState extends State<TournamentSelectPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final DeviceService _deviceService = DeviceService();

  // 開催中: running, registered, paused
  // 今後開催: scheduled
  static const _activeStatuses = ['running', 'registered', 'paused'];
  static const _upcomingStatuses = ['scheduled'];

  String? _myTableId;
  bool _isLoadingDevice = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadDeviceInfo();
  }

  Future<void> _loadDeviceInfo() async {
    if (widget.filterByDeviceTable) {
      final device = await _deviceService.getCurrentDevice();
      _myTableId = device?.getTableIdForOption(DeviceOptionKeys.tournamentTable);
    }
    if (mounted) {
      setState(() {
        _isLoadingDevice = false;
      });
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: '開催中'),
            Tab(text: '今後開催'),
          ],
        ),
      ),
      body: _isLoadingDevice
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildTournamentList(_activeStatuses),
                _buildTournamentList(_upcomingStatuses),
              ],
            ),
    );
  }

  Widget _buildTournamentList(List<String> statuses) {
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('storeMeta')
          .doc('currentBusinessDay')
          .snapshots(),
      builder: (context, stateSnapshot) {
        if (!stateSnapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        
        final stateData = stateSnapshot.data?.data() as Map<String, dynamic>?;
        final status = stateData?['status'] as String?;
        final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
        
        String businessDateKey;
        if (status == 'running' && currentBusinessDateKey != null) {
          businessDateKey = currentBusinessDateKey;
        } else {
          // 閉店中の場合は、現在の日時が属する日付をbusinessDateとして使用
          businessDateKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
        }
        
        return StreamBuilder<QuerySnapshot>(
          stream: _firestore
              .collection('scheduledTournaments')
              .where('businessDate', isEqualTo: businessDateKey)
              .orderBy('startAt', descending: false)
              .snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(child: Text('エラー: ${snapshot.error}'));
            }

            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            // クライアント側でstatusをフィルタリング
            final statusFilteredDocs = (snapshot.data?.docs ?? []).where((doc) {
              final data = doc.data() as Map<String, dynamic>;
              final status = data['status'] as String? ?? '';
              return statuses.contains(status);
            }).toList();

            // 卓番フィルタリングが有効で、卓番が指定されている場合
            if (widget.filterByDeviceTable && _myTableId != null) {
              return _buildFilteredByTableList(statusFilteredDocs, statuses);
            }

            // 通常表示
            return _buildListView(statusFilteredDocs);
          },
        );
      },
    );
  }

  /// 卓番でフィルタリングしたトーナメントリストを構築
  Widget _buildFilteredByTableList(List<QueryDocumentSnapshot> docs, List<String> statuses) {
    return FutureBuilder<List<QueryDocumentSnapshot>>(
      future: _filterTournamentsByTable(docs),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return Center(child: Text('エラー: ${snapshot.error}'));
        }

        final filteredDocs = snapshot.data ?? [];
        return _buildListView(filteredDocs);
      },
    );
  }

  /// 指定された卓が登録されているトーナメントのみをフィルタリング
  Future<List<QueryDocumentSnapshot>> _filterTournamentsByTable(List<QueryDocumentSnapshot> docs) async {
    if (_myTableId == null) return docs;

    final result = <QueryDocumentSnapshot>[];
    for (final doc in docs) {
      // 各トーナメントのtablesSeatサブコレクションに指定卓が存在するかチェック
      final tableDoc = await _firestore
          .collection('scheduledTournaments')
          .doc(doc.id)
          .collection('tablesSeat')
          .doc(_myTableId)
          .get();

      if (tableDoc.exists) {
        result.add(doc);
      }
    }
    return result;
  }

  Widget _buildListView(List<QueryDocumentSnapshot> docs) {
    if (docs.isEmpty) {
      return Center(
        child: Text(
          widget.filterByDeviceTable && _myTableId != null
              ? '指定された卓が登録されているトーナメントがありません'
              : '該当するトーナメントがありません',
          style: const TextStyle(color: Colors.grey),
        ),
      );
    }

    return ListView.builder(
      itemCount: docs.length,
      itemBuilder: (context, index) {
        final doc = docs[index];
        final data = doc.data() as Map<String, dynamic>;
        final snapshotData = data['snapshot'] as Map<String, dynamic>? ?? {};
        final name = snapshotData['name'] as String? ?? '無名のトーナメント';
        final status = data['status'] as String? ?? '';
        final startAt = data['startAt'] as Timestamp?;

        return ListTile(
          title: Text(name),
          subtitle: Text(_formatStartAt(startAt)),
          trailing: _buildStatusChip(status),
          onTap: () {
            widget.onSelected(doc.id, name);
          },
        );
      },
    );
  }

  String _formatStartAt(Timestamp? timestamp) {
    if (timestamp == null) return '開始時刻未設定';
    final dt = timestamp.toDate();
    return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  Widget _buildStatusChip(String status) {
    final (label, color) = switch (status) {
      'running' => ('実施中', Colors.orange),
      'registered' => ('レジスト済', Colors.green),
      'paused' => ('一時停止', Colors.amber),
      'scheduled' => ('予定', Colors.blue),
      _ => (status, Colors.grey),
    };

    return Chip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      backgroundColor: color.withValues(alpha: 0.2),
      side: BorderSide(color: color),
      padding: EdgeInsets.zero,
      labelPadding: const EdgeInsets.symmetric(horizontal: 8),
    );
  }
}
