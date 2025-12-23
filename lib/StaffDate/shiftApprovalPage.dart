import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';

// スタッフ×申請時刻でグループ化されたシフト申請
class ShiftGroup {
  final String userId;
  final String staffName;
  final DateTime appliedAt;
  final List<Map<String, dynamic>> shifts;

  ShiftGroup({
    required this.userId,
    required this.staffName,
    required this.appliedAt,
    required this.shifts,
  });
}

class ShiftApprovalPage extends StatefulWidget {
  const ShiftApprovalPage({super.key});

  @override
  State<ShiftApprovalPage> createState() => _ShiftApprovalPageState();
}

class _ShiftApprovalPageState extends State<ShiftApprovalPage> {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  List<Map<String, dynamic>> _allShifts = [];
  List<ShiftGroup> _pendingShiftGroups = [];
  List<ShiftGroup> _approvedShiftGroups = [];
  List<ShiftGroup> _rejectedShiftGroups = [];
  bool _isLoading = true;
  String _selectedFilter = 'pending'; // pending, approved, rejected, all

  @override
  void initState() {
    super.initState();
    _loadShifts();
  }

  Future<void> _loadShifts() async {
    setState(() {
      _isLoading = true;
    });

    try {
      print('シフト読み込み開始（Cloud Functions使用）');
      
      // Cloud Functionsを使用して全シフトを取得
      final HttpsCallable getAllShifts = _functions.httpsCallable('getAllShifts');
      final result = await getAllShifts.call();
      
      if (result.data['success'] == true) {
        final List<dynamic> shiftsData = result.data['shifts'] ?? [];
        _allShifts = shiftsData.map((shift) {
          return Map<String, dynamic>.from(shift);
        }).toList();
        
        print('シフト取得成功: ${_allShifts.length}件');

        // グループ化
        _groupShiftsByStaffAndTime();

        setState(() {
          _isLoading = false;
        });
      } else {
        throw Exception(result.data['error'] ?? 'シフトの取得に失敗しました');
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('シフトの読み込みに失敗しました: $e')),
        );
      }
    }
  }

  // スタッフ×申請時刻でグループ化
  void _groupShiftsByStaffAndTime() {
    final Map<String, List<Map<String, dynamic>>> pendingMap = {};
    final Map<String, List<Map<String, dynamic>>> approvedMap = {};
    final Map<String, List<Map<String, dynamic>>> rejectedMap = {};

    for (final shift in _allShifts) {
      final userId = shift['userId'] ?? '';
      final staffName = shift['staffsFullName'] ?? '不明';
      final confirmed = shift['confirmed'];
      
      // createdAtを取得（TimestampまたはDateTime）
      DateTime appliedAt;
      if (shift['createdAt'] != null) {
        if (shift['createdAt'] is Map) {
          // Firestore Timestamp形式
          final seconds = shift['createdAt']['_seconds'] ?? shift['createdAt']['seconds'] ?? 0;
          appliedAt = DateTime.fromMillisecondsSinceEpoch(seconds * 1000);
        } else {
          appliedAt = DateTime.now();
        }
      } else {
        appliedAt = DateTime.now();
      }

      // グループ化キー: userId + 申請時刻（秒単位で丸める）
      final groupKey = '$userId-${appliedAt.millisecondsSinceEpoch ~/ 1000}';

      if (confirmed == null) {
        pendingMap.putIfAbsent(groupKey, () => []).add(shift);
      } else if (confirmed == true) {
        approvedMap.putIfAbsent(groupKey, () => []).add(shift);
      } else {
        rejectedMap.putIfAbsent(groupKey, () => []).add(shift);
      }
    }

    // ShiftGroupに変換
    _pendingShiftGroups = _convertToShiftGroups(pendingMap);
    _approvedShiftGroups = _convertToShiftGroups(approvedMap);
    _rejectedShiftGroups = _convertToShiftGroups(rejectedMap);
  }

  List<ShiftGroup> _convertToShiftGroups(Map<String, List<Map<String, dynamic>>> map) {
    final List<ShiftGroup> groups = [];
    
    for (final entry in map.entries) {
      final shifts = entry.value;
      if (shifts.isEmpty) continue;

      final firstShift = shifts.first;
      final userId = firstShift['userId'] ?? '';
      final staffName = firstShift['staffsFullName'] ?? '不明';
      
      DateTime appliedAt;
      if (firstShift['createdAt'] != null) {
        if (firstShift['createdAt'] is Map) {
          final seconds = firstShift['createdAt']['_seconds'] ?? firstShift['createdAt']['seconds'] ?? 0;
          appliedAt = DateTime.fromMillisecondsSinceEpoch(seconds * 1000);
        } else {
          appliedAt = DateTime.now();
        }
      } else {
        appliedAt = DateTime.now();
      }

      groups.add(ShiftGroup(
        userId: userId,
        staffName: staffName,
        appliedAt: appliedAt,
        shifts: shifts,
      ));
    }

    // 申請時刻の新しい順にソート
    groups.sort((a, b) => b.appliedAt.compareTo(a.appliedAt));
    
    return groups;
  }

  List<ShiftGroup> _getFilteredGroups() {
    switch (_selectedFilter) {
      case 'pending':
        return _pendingShiftGroups;
      case 'approved':
        return _approvedShiftGroups;
      case 'rejected':
        return _rejectedShiftGroups;
      case 'all':
        return [..._pendingShiftGroups, ..._approvedShiftGroups, ..._rejectedShiftGroups];
      default:
        return _pendingShiftGroups;
    }
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.year}年${dateTime.month}月${dateTime.day}日 ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _showShiftDetailDialog(ShiftGroup group) async {
    // 各シフトの承認/却下状態を管理
    final Map<String, String?> decisions = {};
    for (final shift in group.shifts) {
      decisions[shift['id']] = null; // null: 未選択, 'approve': 承認, 'reject': 却下
    }

    await showDialog(
      context: context,
      builder: (BuildContext context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Text('${group.staffName} - ${_formatDateTime(group.appliedAt)}'),
              content: SizedBox(
                width: double.maxFinite,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '申請件数: ${group.shifts.length}件',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16),
                      ...group.shifts.map((shift) {
                        final shiftId = shift['id'];
                        final date = shift['date'] ?? '';
                        final start = shift['start'] ?? '';
                        final end = shift['end'] ?? '';
                        
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '$date  $start - $end',
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Radio<String?>(
                                    value: 'approve',
                                    groupValue: decisions[shiftId],
                                    onChanged: (value) {
                                      setDialogState(() {
                                        decisions[shiftId] = value;
                                      });
                                    },
                                  ),
                                  const Text('承認'),
                                  const SizedBox(width: 24),
                                  Radio<String?>(
                                    value: 'reject',
                                    groupValue: decisions[shiftId],
                                    onChanged: (value) {
                                      setDialogState(() {
                                        decisions[shiftId] = value;
                                      });
                                    },
                                  ),
                                  const Text('却下'),
                                ],
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('キャンセル'),
                ),
                ElevatedButton(
                  onPressed: () async {
                    // 全てのシフトに決定がされているかチェック
                    final hasUnselected = decisions.values.any((decision) => decision == null);
                    if (hasUnselected) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('全てのシフトに承認/却下を選択してください')),
                      );
                      return;
                    }

                    Navigator.of(context).pop();
                    await _processShifts(decisions);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('確定'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _processShifts(Map<String, String?> decisions) async {
    try {
      // 決定をリスト形式に変換
      final List<Map<String, dynamic>> shifts = [];
      for (final entry in decisions.entries) {
        shifts.add({
          'shiftId': entry.key,
          'decision': entry.value, // 'approve' or 'reject'
        });
      }

      // Cloud Functionsを呼び出し
      final HttpsCallable processShifts = _functions.httpsCallable('processShiftsByStaff');
      final result = await processShifts.call({'shifts': shifts});

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.data['message'] ?? 'シフトを処理しました')),
        );

        // シフト一覧を再読み込み
        _loadShifts();
      } else {
        throw Exception(result.data['error'] ?? '処理に失敗しました');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('処理に失敗しました: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final filteredGroups = _getFilteredGroups();

    return Scaffold(
      appBar: AppBar(
        title: const Text('シフト承認管理'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          // フィルターボタン
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildFilterButton('pending', '申請中', _pendingShiftGroups.length),
                _buildFilterButton('approved', '承認済み', _approvedShiftGroups.length),
                _buildFilterButton('rejected', '却下', _rejectedShiftGroups.length),
                _buildFilterButton('all', '全て', filteredGroups.length),
              ],
            ),
          ),
          
          // シフトグループ一覧
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filteredGroups.isEmpty
                    ? const Center(
                        child: Text('シフトがありません', style: TextStyle(fontSize: 18)),
                      )
                    : ListView.builder(
                        itemCount: filteredGroups.length,
                        itemBuilder: (context, index) {
                          final group = filteredGroups[index];
                          return _buildShiftGroupCard(group);
                        },
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _loadShifts,
        child: const Icon(Icons.refresh),
      ),
    );
  }

  Widget _buildFilterButton(String filter, String label, int count) {
    final isSelected = _selectedFilter == filter;
    return ElevatedButton(
      onPressed: () {
        setState(() {
          _selectedFilter = filter;
        });
      },
      style: ElevatedButton.styleFrom(
        backgroundColor: isSelected ? Colors.deepPurple : Colors.grey[300],
        foregroundColor: isSelected ? Colors.white : Colors.black,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label),
          Text(
            count.toString(),
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildShiftGroupCard(ShiftGroup group) {
    final isPending = _selectedFilter == 'pending' || 
                      (group.shifts.isNotEmpty && group.shifts.first['confirmed'] == null);
    
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: isPending ? () => _showShiftDetailDialog(group) : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          group.staffName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '申請日時: ${_formatDateTime(group.appliedAt)}',
                          style: const TextStyle(fontSize: 14),
                        ),
                        Text(
                          '申請件数: ${group.shifts.length}件',
                          style: const TextStyle(fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                  if (!isPending)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: group.shifts.first['confirmed'] == true 
                            ? Colors.green 
                            : Colors.red,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        group.shifts.first['confirmed'] == true ? '承認済み' : '却下',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
              if (isPending)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'タップして詳細を表示',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
