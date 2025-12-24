import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/globalConstant.dart';

class ShiftRequestListPage extends StatefulWidget {
  const ShiftRequestListPage({super.key});

  @override
  State<ShiftRequestListPage> createState() => _ShiftRequestListPageState();
}

class _ShiftRequestListPageState extends State<ShiftRequestListPage> {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  List<Map<String, dynamic>> _allRequests = [];
  List<Map<String, dynamic>> _filteredRequests = [];
  String? _selectedStatus;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    // プランチェック: コミュニケーションプランの場合は機能を無効化
    if (!GlobalConstants.isShiftRequestEnabled) {
      return;
    }
    _loadRequests();
  }

  Future<void> _loadRequests() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final callable = _functions.httpsCallable('getShiftRequests');
      final result = await callable.call(_selectedStatus != null ? {'status': _selectedStatus} : {});

      if (result.data['success'] == true) {
        final requests = (result.data['requests'] as List)
            .map((req) => Map<String, dynamic>.from(req))
            .toList();

        setState(() {
          _allRequests = requests;
          _filteredRequests = requests;
        });
      } else {
        throw Exception(result.data['error'] ?? '要請一覧の取得に失敗しました');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('要請一覧の取得に失敗しました: $e'),
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

  void _filterByStatus(String? status) {
    setState(() {
      _selectedStatus = status;
      if (status == null) {
        _filteredRequests = _allRequests;
      } else {
        _filteredRequests = _allRequests.where((req) => req['status'] == status).toList();
      }
    });
  }

  String _getStatusLabel(String status) {
    switch (status) {
      case 'pending':
        return '未確認';
      case 'confirmed':
        return '確認済み';
      case 'declined':
        return '辞退';
      case 'expired':
        return '期限切れ';
      default:
        return status;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.orange;
      case 'confirmed':
        return Colors.green;
      case 'declined':
        return Colors.red;
      case 'expired':
        return Colors.grey;
      default:
        return Colors.black;
    }
  }

  String _formatTimestamp(dynamic timestamp) {
    if (timestamp == null) return '不明';
    
    try {
      if (timestamp is Map) {
        final seconds = timestamp['_seconds'] as int?;
        if (seconds != null) {
          final date = DateTime.fromMillisecondsSinceEpoch(seconds * 1000);
          return DateFormat('yyyy年MM月dd日 HH:mm').format(date);
        }
      }
      return '不明';
    } catch (e) {
      return '不明';
    }
  }

  @override
  Widget build(BuildContext context) {
    // プランチェック: コミュニケーションプランの場合は機能を無効化
    if (!GlobalConstants.isShiftRequestEnabled) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('希望シフト要請一覧'),
          backgroundColor: Colors.deepPurple,
          foregroundColor: Colors.white,
        ),
        body: const Center(
          child: Text(
            'この機能はライトプラン以上で利用可能です。',
            style: TextStyle(fontSize: 16, color: Colors.grey),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('希望シフト要請一覧'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadRequests,
            tooltip: '更新',
          ),
        ],
      ),
      body: Column(
        children: [
          // フィルタボタン
          Container(
            padding: const EdgeInsets.all(8),
            color: Colors.grey[200],
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildFilterChip('全て', null),
                  const SizedBox(width: 8),
                  _buildFilterChip('未確認', 'pending'),
                  const SizedBox(width: 8),
                  _buildFilterChip('確認済み', 'confirmed'),
                  const SizedBox(width: 8),
                  _buildFilterChip('辞退', 'declined'),
                  const SizedBox(width: 8),
                  _buildFilterChip('期限切れ', 'expired'),
                ],
              ),
            ),
          ),
          
          // 要請一覧
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _filteredRequests.isEmpty
                    ? const Center(
                        child: Text(
                          '要請がありません',
                          style: TextStyle(fontSize: 16, color: Colors.grey),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(8),
                        itemCount: _filteredRequests.length,
                        itemBuilder: (context, index) {
                          final request = _filteredRequests[index];
                          final status = request['status'] as String? ?? 'unknown';
                          final date = request['date'] as String? ?? '';
                          final start = request['start'] as String?;
                          final end = request['end'] as String?;
                          final staffName = request['staffName'] as String? ?? '不明';
                          final requestedAt = request['requestedAtJST'];
                          final confirmedAt = request['confirmedAt'];
                          final declinedAt = request['declinedAt'];
                          final expiresAt = request['expiresAt'];

                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              title: Text(
                                staffName,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const SizedBox(height: 4),
                                  Text('日付: $date'),
                                  if (start != null && end != null)
                                    Text('時間: $start 〜 $end')
                                  else if (start != null)
                                    Text('開始時刻: $start')
                                  else
                                    const Text('時間: 未指定'),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: _getStatusColor(status),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          _getStatusLabel(status),
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 12,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '要請日時: ${_formatTimestamp(requestedAt)}',
                                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                                  ),
                                  if (confirmedAt != null)
                                    Text(
                                      '確認日時: ${_formatTimestamp(confirmedAt)}',
                                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                                    ),
                                  if (declinedAt != null)
                                    Text(
                                      '辞退日時: ${_formatTimestamp(declinedAt)}',
                                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                                    ),
                                  if (expiresAt != null)
                                    Text(
                                      '期限: ${_formatTimestamp(expiresAt)}',
                                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                                    ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String? status) {
    final isSelected = _selectedStatus == status;
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (selected) {
        _filterByStatus(status);
      },
      selectedColor: Colors.deepPurple[200],
      checkmarkColor: Colors.deepPurple,
    );
  }
}

