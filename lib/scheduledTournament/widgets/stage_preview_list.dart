import 'package:flutter/material.dart';

/// ステージプレビューリストウィジェット
/// トーナメントのLevel/Break/所要秒数を表示
class StagePreviewList extends StatelessWidget {
  final List<Map<String, dynamic>> stages;
  final int lateRegUntilLev;
  final int breakDurationSec;

  const StagePreviewList({
    super.key,
    required this.stages,
    required this.lateRegUntilLev,
    required this.breakDurationSec,
  });

  @override
  Widget build(BuildContext context) {
    if (stages.isEmpty) {
      return const Center(
        child: Text(
          'ステージ情報がありません',
          style: TextStyle(
            fontSize: 16,
            color: Colors.grey,
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ヘッダー情報
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.blue[50],
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.blue[200]!),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'ブラインド構造情報',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue[800],
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _buildInfoItem(
                      'レイトレジ終了レベル',
                      'Level $lateRegUntilLev',
                      Colors.orange[600]!,
                    ),
                  ),
                  Expanded(
                    child: _buildInfoItem(
                      'ブレイク時間',
                      '${(breakDurationSec / 60).toStringAsFixed(1)}分',
                      Colors.green[600]!,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '総ステージ数: ${stages.length}',
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.blue[700],
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        
        // ステージリスト
        Expanded(
          child: ListView.builder(
            itemCount: stages.length,
            itemBuilder: (context, index) {
              final stage = stages[index];
              return _buildStageItem(stage, index + 1);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildInfoItem(String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _buildStageItem(Map<String, dynamic> stage, int sequence) {
    final type = stage['type'] as String;
    final durationSec = stage['durationSec'] as int;
    final lev = stage['lev'] as int?;

    Color backgroundColor;
    Color textColor;
    IconData icon;
    String title;
    String subtitle;

    switch (type) {
      case 'level':
        backgroundColor = Colors.blue[100]!;
        textColor = Colors.blue[800]!;
        icon = Icons.casino;
        title = 'Level ${lev ?? '?'}';
        subtitle = '${durationSec}秒 (${(durationSec / 60).toStringAsFixed(1)}分)';
        break;
      case 'break':
        backgroundColor = Colors.green[100]!;
        textColor = Colors.green[800]!;
        icon = Icons.coffee;
        title = 'ブレイク';
        subtitle = '${durationSec}秒 (${(durationSec / 60).toStringAsFixed(1)}分)';
        break;
      case 'breakAndRegist':
        backgroundColor = Colors.orange[100]!;
        textColor = Colors.orange[800]!;
        icon = Icons.person_add;
        title = 'ブレイク + レイトレジ';
        subtitle = '${durationSec}秒 (${(durationSec / 60).toStringAsFixed(1)}分)';
        break;
      case 'regist':
        backgroundColor = Colors.purple[100]!;
        textColor = Colors.purple[800]!;
        icon = Icons.person_add_alt_1;
        title = 'レイトレジ締切';
        subtitle = '即座に締切';
        break;
      default:
        backgroundColor = Colors.grey[100]!;
        textColor = Colors.grey[800]!;
        icon = Icons.help_outline;
        title = '不明なステージ';
        subtitle = '${durationSec}秒';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: textColor.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          // シーケンス番号
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: textColor,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(
              child: Text(
                sequence.toString(),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          
          // アイコン
          Icon(
            icon,
            color: textColor,
            size: 24,
          ),
          const SizedBox(width: 12),
          
          // タイトルとサブタイトル
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: textColor,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 14,
                    color: textColor.withOpacity(0.8),
                  ),
                ),
              ],
            ),
          ),
          
          // タイプバッジ
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: textColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              type.toUpperCase(),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
