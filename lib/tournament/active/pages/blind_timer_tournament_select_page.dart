import 'package:amuse_app_template/tournament/active/pages/blind_timer_page.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// ブラインドタイマー用トーナメント選択ページ
/// 本日〜7日後のトーナメントを日付ごとに表示する
class BlindTimerTournamentSelectPage extends StatelessWidget {
  const BlindTimerTournamentSelectPage({super.key});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final todayKey = DateFormat('yyyy-MM-dd').format(now);
    final sevenDaysLaterKey = DateFormat('yyyy-MM-dd').format(
      now.add(const Duration(days: 7)),
    );

    final stream = FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .where('businessDate', isGreaterThanOrEqualTo: todayKey)
        .where('businessDate', isLessThanOrEqualTo: sevenDaysLaterKey)
        .orderBy('businessDate', descending: false)
        .orderBy('startAt', descending: false)
        .snapshots();

    return Scaffold(
      appBar: AppBar(
        title: const Text('ブラインドタイマー - トーナメント選択'),
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: stream,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text('エラー: ${snapshot.error}'));
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final docs = snapshot.data!.docs.where((doc) {
            final data = doc.data() as Map<String, dynamic>;
            final status = (data['status'] as String? ?? '').toLowerCase();
            return status != 'cancelled' && status != 'canceled';
          }).toList();

          if (docs.isEmpty) {
            return const Center(
              child: Text(
                '表示対象のトーナメントがありません',
                style: TextStyle(color: Colors.grey),
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: docs.length,
            itemBuilder: (context, index) {
              final data = docs[index].data() as Map<String, dynamic>;
              final businessDate = data['businessDate'] as String? ?? '';
              final previousBusinessDate = index > 0
                  ? ((docs[index - 1].data() as Map<String, dynamic>)['businessDate'] as String? ?? '')
                  : '';
              final showDateHeader = businessDate.isNotEmpty && businessDate != previousBusinessDate;

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (showDateHeader) _buildDateHeader(businessDate),
                  _buildTournamentCard(context, docs[index]),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildDateHeader(String businessDate) {
    String label = businessDate;
    try {
      final parsed = DateTime.parse(businessDate);
      label = DateFormat('yyyy年M月d日(E)', 'ja').format(parsed);
    } catch (_) {
      // businessDate のパース失敗時はそのまま表示
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      margin: const EdgeInsets.only(top: 10, bottom: 6),
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.bold,
          color: Colors.black54,
        ),
      ),
    );
  }

  Widget _buildTournamentCard(BuildContext context, QueryDocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final snapshotData = data['snapshot'] as Map<String, dynamic>?;
    final tournamentName = snapshotData?['name'] as String? ?? '無名のトーナメント';
    final status = data['status'] as String? ?? 'scheduled';
    final startAt = data['startAt'] as Timestamp?;
    final statusColor = _statusColor(status);
    final statusText = _statusText(status);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 1.5,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () {
          if (status == 'ended' || status == 'force_ended') {
            showDialog<void>(
              context: context,
              builder: (dialogContext) => AlertDialog(
                title: const Text('確認'),
                content: const Text('既に終了処理済みのトーナメントです。'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    child: const Text('閉じる'),
                  ),
                ],
              ),
            );
            return;
          }

          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => BlindTimerPage(tournamentId: doc.id),
            ),
          );
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tournamentName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '開始: ${_formatStartAt(startAt)}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: statusColor),
                ),
                child: Text(
                  statusText,
                  style: TextStyle(
                    fontSize: 11,
                    color: statusColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatStartAt(Timestamp? timestamp) {
    if (timestamp == null) return '未設定';
    final date = timestamp.toDate().toLocal();
    return DateFormat('M/d HH:mm').format(date);
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'scheduled':
        return Colors.blue;
      case 'running':
        return Colors.orange;
      case 'registered':
        return Colors.green;
      case 'paused':
        return Colors.amber.shade700;
      case 'ended':
      case 'force_ended':
        return Colors.grey;
      default:
        return Colors.blueGrey;
    }
  }

  String _statusText(String status) {
    switch (status) {
      case 'scheduled':
        return '予定';
      case 'running':
        return '実施中';
      case 'registered':
        return 'レジスト済';
      case 'paused':
        return '一時停止';
      case 'ended':
      case 'force_ended':
        return '終了';
      default:
        return status;
    }
  }
}
