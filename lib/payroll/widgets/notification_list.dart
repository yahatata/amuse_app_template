// 給与通知一覧画面
//
// 参照: 07_NOTIFICATION_SCHEDULER_SPEC §1-1〜§1-4, §5-1, §5-2

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class PayrollNotificationListPage extends StatefulWidget {
  const PayrollNotificationListPage({super.key});

  @override
  State<PayrollNotificationListPage> createState() =>
      _PayrollNotificationListPageState();
}

class _PayrollNotificationListPageState
    extends State<PayrollNotificationListPage> {
  String _filter = 'all'; // all, unread, flagged

  Query<Map<String, dynamic>> _buildQuery() {
    final twoMonthsAgo = DateTime.now().subtract(const Duration(days: 60));

    Query<Map<String, dynamic>> q = FirebaseFirestore.instance
        .collection('notifications')
        .where('operationCategory', isEqualTo: 'payroll')
        .where('createdAt', isGreaterThanOrEqualTo: Timestamp.fromDate(twoMonthsAgo))
        .orderBy('createdAt', descending: true);

    if (_filter == 'unread') {
      q = FirebaseFirestore.instance
          .collection('notifications')
          .where('operationCategory', isEqualTo: 'payroll')
          .where('isRead', isEqualTo: false)
          .where('createdAt',
              isGreaterThanOrEqualTo: Timestamp.fromDate(twoMonthsAgo))
          .orderBy('createdAt', descending: true);
    } else if (_filter == 'flagged') {
      q = FirebaseFirestore.instance
          .collection('notifications')
          .where('operationCategory', isEqualTo: 'payroll')
          .where('isFlagged', isEqualTo: true)
          .where('createdAt',
              isGreaterThanOrEqualTo: Timestamp.fromDate(twoMonthsAgo))
          .orderBy('createdAt', descending: true);
    }

    return q;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('給与通知'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            onSelected: (value) => setState(() => _filter = value),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'all', child: Text('すべて')),
              const PopupMenuItem(value: 'unread', child: Text('未読のみ')),
              const PopupMenuItem(value: 'flagged', child: Text('フラグ付き')),
            ],
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _buildQuery().snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text('エラー: ${snapshot.error}'));
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final docs = snapshot.data!.docs;
          if (docs.isEmpty) {
            return const Center(child: Text('通知はありません'));
          }

          return ListView.builder(
            itemCount: docs.length,
            itemBuilder: (context, index) {
              final doc = docs[index];
              final data = doc.data();
              return _NotificationTile(
                docId: doc.id,
                data: data,
              );
            },
          );
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final String docId;
  final Map<String, dynamic> data;

  const _NotificationTile({
    required this.docId,
    required this.data,
  });

  IconData _iconForType(String? type) {
    switch (type) {
      case 'report':
        return Icons.info_outline;
      case 'warning':
        return Icons.warning_amber;
      case 'strong_warning':
        return Icons.error_outline;
      case 'error':
        return Icons.error;
      default:
        return Icons.notifications;
    }
  }

  Color _colorForType(String? type) {
    switch (type) {
      case 'report':
        return Colors.blue;
      case 'warning':
        return Colors.orange;
      case 'strong_warning':
        return Colors.deepOrange;
      case 'error':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  void _markAsRead() {
    FirebaseFirestore.instance.collection('notifications').doc(docId).update({
      'isRead': true,
    });
  }

  void _toggleFlag() {
    final currentFlag = data['isFlagged'] == true;
    FirebaseFirestore.instance.collection('notifications').doc(docId).update({
      'isFlagged': !currentFlag,
    });
  }

  String _formatTimestamp(dynamic ts) {
    if (ts is Timestamp) {
      final dt = ts.toDate();
      return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final type = data['type'] as String?;
    final isRead = data['isRead'] == true;
    final isFlagged = data['isFlagged'] == true;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      color: isRead ? null : Colors.blue.shade50,
      child: InkWell(
        onTap: () {
          if (!isRead) _markAsRead();
        },
        onLongPress: _toggleFlag,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(_iconForType(type), color: _colorForType(type), size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            data['title'] ?? '',
                            style: TextStyle(
                              fontWeight:
                                  isRead ? FontWeight.normal : FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        if (isFlagged)
                          const Icon(Icons.flag, color: Colors.amber, size: 18),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      data['body'] ?? '',
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _formatTimestamp(data['createdAt']),
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
