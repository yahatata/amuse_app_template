import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_functions/cloud_functions.dart';

class ShiftApprovalPage extends StatefulWidget {
  const ShiftApprovalPage({super.key});

  @override
  State<ShiftApprovalPage> createState() => _ShiftApprovalPageState();
}

class _ShiftApprovalPageState extends State<ShiftApprovalPage> {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  List<Map<String, dynamic>> _pendingShifts = [];
  List<Map<String, dynamic>> _approvedShifts = [];
  List<Map<String, dynamic>> _rejectedShifts = [];
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
        final List<Map<String, dynamic>> allShifts = shiftsData.map((shift) {
          return Map<String, dynamic>.from(shift);
        }).toList();
        
        print('シフト取得成功: ${allShifts.length}件');

        // ステータス別に分類
        _pendingShifts = allShifts.where((shift) => shift['confirmed'] == null).toList();
        _approvedShifts = allShifts.where((shift) => shift['confirmed'] == true).toList();
        _rejectedShifts = allShifts.where((shift) => shift['confirmed'] == false).toList();

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

  Future<void> _approveShift(String shiftId) async {
    try {
      // Cloud Functionsを使用してシフトを承認
      final HttpsCallable approveShift = _functions.httpsCallable('approveShift');
      final result = await approveShift.call({'shiftId': shiftId});
      
      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.data['message'] ?? 'シフトを承認しました')),
        );

        // シフト一覧を再読み込み
        _loadShifts();
      } else {
        throw Exception(result.data['error'] ?? '承認に失敗しました');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('承認に失敗しました: $e')),
      );
    }
  }

  Future<void> _rejectShift(String shiftId) async {
    try {
      // Cloud Functionsを使用してシフトを却下
      final HttpsCallable rejectShift = _functions.httpsCallable('rejectShift');
      final result = await rejectShift.call({'shiftId': shiftId});
      
      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.data['message'] ?? 'シフトを却下しました')),
        );

        // シフト一覧を再読み込み
        _loadShifts();
      } else {
        throw Exception(result.data['error'] ?? '却下に失敗しました');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('却下に失敗しました: $e')),
      );
    }
  }



  List<Map<String, dynamic>> _getFilteredShifts() {
    switch (_selectedFilter) {
      case 'pending':
        return _pendingShifts;
      case 'approved':
        return _approvedShifts;
      case 'rejected':
        return _rejectedShifts;
      case 'all':
        return [..._pendingShifts, ..._approvedShifts, ..._rejectedShifts];
      default:
        return _pendingShifts;
    }
  }

  String _getStatusText(Map<String, dynamic> shift) {
    if (shift['confirmed'] == null) return '申請中';
    if (shift['confirmed'] == true) return '承認済み';
    return '却下';
  }

  Color _getStatusColor(Map<String, dynamic> shift) {
    if (shift['confirmed'] == null) return Colors.orange;
    if (shift['confirmed'] == true) return Colors.green;
    return Colors.red;
  }

  @override
  Widget build(BuildContext context) {
    final filteredShifts = _getFilteredShifts();

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
                _buildFilterButton('pending', '申請中', _pendingShifts.length),
                _buildFilterButton('approved', '承認済み', _approvedShifts.length),
                _buildFilterButton('rejected', '却下', _rejectedShifts.length),
                _buildFilterButton('all', '全て', filteredShifts.length),
              ],
            ),
          ),
          

          
          // シフト一覧
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filteredShifts.isEmpty
                    ? const Center(
                        child: Text('シフトがありません', style: TextStyle(fontSize: 18)),
                      )
                    : ListView.builder(
                        itemCount: filteredShifts.length,
                        itemBuilder: (context, index) {
                          final shift = filteredShifts[index];
                          return _buildShiftCard(shift);
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

  Widget _buildShiftCard(Map<String, dynamic> shift) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
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
                        'スタッフ: ${shift['staffsFullName'] ?? '不明'}',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '日付: ${shift['date']}',
                        style: const TextStyle(fontSize: 14),
                      ),
                      Text(
                        '時間: ${shift['start']} - ${shift['end']}',
                        style: const TextStyle(fontSize: 14),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getStatusColor(shift),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _getStatusText(shift),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            
            // 申請中のシフトのみ承認・却下ボタンを表示
            if (shift['confirmed'] == null) ...[
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _approveShift(shift['id']),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('承認'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _rejectShift(shift['id']),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('却下'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
