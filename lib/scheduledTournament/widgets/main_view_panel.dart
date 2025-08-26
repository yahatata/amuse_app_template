import 'package:flutter/material.dart';
import '../models/main_view.dart';

class MainViewPanel extends StatelessWidget {
  final MainView mainView;

  const MainViewPanel({
    super.key,
    required this.mainView,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(8.0),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'トーナメント状況',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.blue,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.orange,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    'レベル ${mainView.currentLevel}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            
            // プレイヤー統計
            Row(
              children: [
                Expanded(
                  child: _buildStatCard(
                    'エントリー',
                    mainView.entries.toString(),
                    Colors.green,
                    Icons.person_add,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildStatCard(
                    'リエントリー',
                    mainView.reentries.toString(),
                    Colors.blue,
                    Icons.refresh,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildStatCard(
                    'アドオン',
                    mainView.addons.toString(),
                    Colors.purple,
                    Icons.add_circle,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            
            // プレイヤー状況
            Row(
              children: [
                Expanded(
                  child: _buildStatCard(
                    '参加中',
                    mainView.playersIn.toString(),
                    Colors.green,
                    Icons.people,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildStatCard(
                    'バスト',
                    mainView.playersBusted.toString(),
                    Colors.red,
                    Icons.remove_circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildStatCard(
                    '着席中',
                    mainView.seatedCount.toString(),
                    Colors.blue,
                    Icons.event_seat,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildStatCard(
                    '待機中',
                    mainView.waitingCount.toString(),
                    Colors.orange,
                    Icons.hourglass_empty,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            
            // レベル情報
            if (mainView.levelEndsAt != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.timer, color: Colors.blue),
                    const SizedBox(width: 8),
                    Text(
                      'レベル終了まで: ${_formatDuration(mainView.levelEndsAt!)}',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
            
            // 最終更新
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              child: Text(
                '最終更新: ${_formatDateTime(mainView.lastEventAt)}',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontStyle: FontStyle.italic,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String label, String value, Color color, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: color.withOpacity(0.8),
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  String _formatDuration(DateTime endTime) {
    final now = DateTime.now();
    final difference = endTime.difference(now);
    
    if (difference.isNegative) {
      return '終了';
    }
    
    final minutes = difference.inMinutes;
    final seconds = difference.inSeconds % 60;
    return '${minutes}分${seconds}秒';
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}:${dateTime.second.toString().padLeft(2, '0')}';
  }
}
