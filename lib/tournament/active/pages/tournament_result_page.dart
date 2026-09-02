import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_result_entries.dart';

/// 終了済みトーナメントの順位・プライズ結果を閲覧専用で表示する。
class TournamentResultPage extends StatefulWidget {
  const TournamentResultPage({
    super.key,
    required this.tournamentId,
    required this.tournamentName,
  });

  final String tournamentId;
  final String tournamentName;

  @override
  State<TournamentResultPage> createState() => _TournamentResultPageState();
}

class _TournamentResultPageState extends State<TournamentResultPage> {
  int _streamReloadToken = 0;

  void _retry() {
    setState(() {
      _streamReloadToken++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('結果確認'),
        backgroundColor: Colors.indigo,
        foregroundColor: Colors.white,
      ),
      body: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        key: ValueKey('result-main-$_streamReloadToken'),
        stream: FirebaseFirestore.instance
            .collection('scheduledTournaments')
            .doc(widget.tournamentId)
            .collection('views')
            .doc('main')
            .snapshots(),
        builder: (context, snapshot) {
          final hasStale =
              snapshot.hasData && (snapshot.data?.exists ?? false);

          if (snapshot.hasError && !hasStale) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      tournamentOpsStreamErrorMessage(
                        kTournamentResultLoadFailedMessage,
                        snapshot.error,
                      ),
                      style: TextStyle(color: Colors.red.shade700),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _retry,
                      child: const Text('再試行'),
                    ),
                  ],
                ),
              ),
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final mainViewData = snapshot.data?.data();
          final summary = parseTournamentResultSummary(mainViewData);

          if (!summary.hasPrizeStructure) {
            // 空構造 ≠ Stream 失敗
            return _buildMessageBody(
              icon: Icons.info_outline,
              title: '結果は確定されていません',
              message: 'プライズ構造が未設定のため、順位結果を表示できません。',
            );
          }

          if (!summary.hasAnyRankedPlayer) {
            return _buildMessageBody(
              icon: Icons.info_outline,
              title: '順位は未確定です',
              message: 'プライズ受取人数は ${summary.prizeReceiverCount} 人ですが、'
                  '順位確定前に終了した可能性があります。',
            );
          }

          return Column(
            children: [
              if (snapshot.hasError && hasStale)
                Material(
                  color: Colors.orange.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            tournamentOpsStreamMessage(
                              hasStaleData: true,
                              error: snapshot.error,
                            ),
                            style: TextStyle(color: Colors.orange.shade900),
                          ),
                        ),
                        TextButton(
                          onPressed: _retry,
                          child: const Text('再試行'),
                        ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.tournamentName,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'プライズプール: ${formatYenAmount(summary.prizePool)}',
                              style: const TextStyle(fontSize: 15),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '付与ポイント: ${summary.pointType}',
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.grey.shade700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      '順位結果',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    ...summary.entries
                        .map((entry) => _ResultRankTile(entry: entry)),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildMessageBody({
    required IconData icon,
    required String title,
    required String message,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Colors.blueGrey.shade400),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: TextStyle(fontSize: 14, color: Colors.grey.shade700),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultRankTile extends StatelessWidget {
  const _ResultRankTile({required this.entry});

  final TournamentResultEntry entry;

  @override
  Widget build(BuildContext context) {
    final playerLabel =
        entry.hasPlayer ? entry.playerName!.trim() : '（未設定）';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: _rankColor(entry.rank).withValues(alpha: 0.15),
          foregroundColor: _rankColor(entry.rank),
          child: Text(
            '${entry.rank}',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
        title: Text(
          '${entry.rank}位: $playerLabel',
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(formatYenAmount(entry.prizeAmount)),
        trailing: Icon(Icons.emoji_events, color: _rankColor(entry.rank)),
      ),
    );
  }

  Color _rankColor(int rank) {
    switch (rank) {
      case 1:
        return Colors.amber.shade800;
      case 2:
        return Colors.blueGrey.shade600;
      case 3:
        return Colors.brown.shade500;
      default:
        return Colors.indigo.shade400;
    }
  }
}
