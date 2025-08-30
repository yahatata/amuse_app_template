import 'package:flutter/material.dart';

class ShiftDetailPage extends StatelessWidget {
  final DateTime date;
  final String staffName;
  final Map<String, dynamic>? shiftData;
  
  const ShiftDetailPage({
    super.key,
    required this.date,
    required this.staffName,
    this.shiftData,
  });

  @override
  Widget build(BuildContext context) {
    // デバッグログを追加
    print('=== ShiftDetailPage デバッグ情報 ===');
    print('staffName: $staffName');
    print('date: $date');
    print('shiftData: $shiftData');
    if (shiftData != null) {
      print('shiftData.keys: ${shiftData!.keys.toList()}');
      print('start: ${shiftData!['start']}');
      print('end: ${shiftData!['end']}');
      print('confirmed: ${shiftData!['confirmed']}');
      print('approvedBy: ${shiftData!['approvedBy']}');
      print('approvedAt: ${shiftData!['approvedAt']}');
    }
    print('===============================');
    
    return Scaffold(
      appBar: AppBar(
        title: Text('${date.month}月${date.day}日のシフト詳細'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 基本情報カード
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.person, color: Colors.blue, size: 24),
                        const SizedBox(width: 8.0),
                        Text(
                          staffName,
                          style: const TextStyle(
                            fontSize: 20.0,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16.0),
                    Row(
                      children: [
                        const Icon(Icons.calendar_today, color: Colors.green, size: 24),
                        const SizedBox(width: 8.0),
                        Text(
                          '${date.year}年${date.month}月${date.day}日 (${_getWeekdayString(date.weekday)})',
                          style: const TextStyle(fontSize: 18.0),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16.0),
            
            // シフト時間カード
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'シフト時間',
                      style: TextStyle(
                        fontSize: 18.0,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16.0),
                    Row(
                      children: [
                        Expanded(
                          child: _buildTimeCard(
                            '開始時刻',
                            _getStartTime(),
                            Icons.schedule,
                            Colors.blue,
                          ),
                        ),
                        const SizedBox(width: 16.0),
                        Expanded(
                          child: _buildTimeCard(
                            '終了時刻',
                            _getEndTime(),
                            Icons.schedule,
                            Colors.red,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16.0),
                    Row(
                      children: [
                        Expanded(
                          child: _buildTimeCard(
                            '勤務時間',
                            _getWorkHours(),
                            Icons.access_time,
                            Colors.green,
                          ),
                        ),
                        const SizedBox(width: 16.0),
                        Expanded(
                          child: _buildTimeCard(
                            '深夜時間',
                            _getNightTimeHours(),
                            Icons.nightlight,
                            Colors.purple,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16.0),
            
            // シフト詳細カード
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'シフト詳細',
                      style: TextStyle(
                        fontSize: 18.0,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16.0),
                    _buildDetailRow('承認状況', _getStatusText(), Icons.check_circle, color: _getStatusColor()),
                    _buildDetailRow('承認者', _getApprovedBy(), Icons.person),
                    _buildDetailRow('承認日時', _getApprovedAt(), Icons.access_time),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16.0),
            

            
            // 備考カード
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '備考',
                      style: TextStyle(
                        fontSize: 18.0,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16.0),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12.0),
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(8.0),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: const Text(
                        '特別な指示はありません。通常通りの業務をお願いします。',
                        style: TextStyle(fontSize: 16.0),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimeCard(String title, String time, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8.0),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 32),
          const SizedBox(height: 8.0),
          Text(
            title,
            style: TextStyle(
              fontSize: 14.0,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4.0),
          Text(
            time,
            style: TextStyle(
              fontSize: 18.0,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value, IconData icon, {Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Icon(icon, color: color ?? Colors.grey[600], size: 20),
          const SizedBox(width: 12.0),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 16.0,
                color: Colors.grey[600],
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 16.0,
              fontWeight: FontWeight.bold,
              color: color ?? Colors.black,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNightTimeRow(String label, String time, String duration) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          const Icon(Icons.nightlight, color: Colors.purple, size: 20),
          const SizedBox(width: 12.0),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 16.0,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                time,
                style: const TextStyle(
                  fontSize: 16.0,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                duration,
                style: TextStyle(
                  fontSize: 14.0,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _getWeekdayString(int weekday) {
    switch (weekday) {
      case 1:
        return '月';
      case 2:
        return '火';
      case 3:
        return '水';
      case 4:
        return '木';
      case 5:
        return '金';
      case 6:
        return '土';
      case 7:
        return '日';
      default:
        return '';
    }
  }

  // シフトデータから開始時刻を取得
  String _getStartTime() {
    print('_getStartTime 呼び出し');
    print('shiftData: $shiftData');
    print('start: ${shiftData?['start']}');
    
    if (shiftData == null || shiftData!['start'] == null) {
      print('開始時刻が未設定');
      return '未設定';
    }
    
    final startTime = shiftData!['start'] as String;
    print('開始時刻: $startTime');
    return startTime;
  }

  // シフトデータから終了時刻を取得
  String _getEndTime() {
    print('_getEndTime 呼び出し');
    print('shiftData: $shiftData');
    print('end: ${shiftData?['end']}');
    
    if (shiftData == null || shiftData!['end'] == null) {
      print('終了時刻が未設定');
      return '未設定';
    }
    
    final endTime = shiftData!['end'] as String;
    print('終了時刻: $endTime');
    return endTime;
  }

  // 勤務時間を計算
  String _getWorkHours() {
    print('_getWorkHours 呼び出し');
    print('shiftData: $shiftData');
    print('start: ${shiftData?['start']}');
    print('end: ${shiftData?['end']}');
    
    if (shiftData == null || shiftData!['start'] == null || shiftData!['end'] == null) {
      print('勤務時間計算に必要なデータが不足');
      return '計算不可';
    }
    
    try {
      final startStr = shiftData!['start'] as String;
      final endStr = shiftData!['end'] as String;
      
      print('開始時刻文字列: $startStr');
      print('終了時刻文字列: $endStr');
      
      // 時刻文字列をパース（例: "14:30"）
      final startParts = startStr.split(':');
      final endParts = endStr.split(':');
      
      print('開始時刻パーツ: $startParts');
      print('終了時刻パーツ: $endParts');
      
      if (startParts.length != 2 || endParts.length != 2) {
        print('時刻形式が正しくありません');
        return '計算不可';
      }
      
      final startHour = int.parse(startParts[0]);
      final startMinute = int.parse(startParts[1]);
      final endHour = int.parse(endParts[0]);
      final endMinute = int.parse(endParts[1]);
      
      print('開始時刻: ${startHour}時${startMinute}分');
      print('終了時刻: ${endHour}時${endMinute}分');
      
      // 分単位で計算
      final startTotalMinutes = startHour * 60 + startMinute;
      final endTotalMinutes = endHour * 60 + endMinute;
      
      print('開始時刻（分）: $startTotalMinutes');
      print('終了時刻（分）: $endTotalMinutes');
      
      if (endTotalMinutes <= startTotalMinutes) {
        print('終了時刻が開始時刻以下です');
        return '計算不可';
      }
      
      final totalMinutes = endTotalMinutes - startTotalMinutes;
      final hours = totalMinutes ~/ 60;
      final minutes = totalMinutes % 60;
      
      print('総勤務時間（分）: $totalMinutes');
      print('勤務時間: ${hours}時間${minutes}分');
      
      if (hours > 0 && minutes > 0) {
        return '${hours}時間${minutes}分';
      } else if (hours > 0) {
        return '${hours}時間';
      } else {
        return '${minutes}分';
      }
    } catch (e) {
      print('勤務時間計算エラー: $e');
      return '計算不可';
    }
  }

  // 深夜時間を計算（22:00-05:00）
  String _getNightTimeHours() {
    if (shiftData == null || shiftData!['start'] == null || shiftData!['end'] == null) {
      return '計算不可';
    }
    
    try {
      final startStr = shiftData!['start'] as String;
      final endStr = shiftData!['end'] as String;
      
      // 時刻文字列をパース（例: "14:30"）
      final startParts = startStr.split(':');
      final endParts = endStr.split(':');
      
      if (startParts.length != 2 || endParts.length != 2) {
        return '計算不可';
      }
      
      final startHour = int.parse(startParts[0]);
      final startMinute = int.parse(startParts[1]);
      final endHour = int.parse(endParts[0]);
      final endMinute = int.parse(endParts[1]);
      
      // 深夜時間の計算（22:00-05:00）
      int nightMinutes = 0;
      
      // 開始時刻から終了時刻まで1分ずつチェック
      int currentHour = startHour;
      int currentMinute = startMinute;
      
      while (true) {
        // 深夜時間かチェック
        if (currentHour >= 22 || currentHour < 5) {
          nightMinutes++;
        }
        
        // 次の分に進む
        currentMinute++;
        if (currentMinute >= 60) {
          currentMinute = 0;
          currentHour++;
          if (currentHour >= 24) {
            currentHour = 0;
          }
        }
        
        // 終了時刻に達したら終了
        if (currentHour == endHour && currentMinute == endMinute) {
          break;
        }
        
        // 無限ループ防止（24時間分）
        if (nightMinutes > 24 * 60) {
          break;
        }
      }
      
      final hours = nightMinutes ~/ 60;
      final minutes = nightMinutes % 60;
      
      if (hours > 0 && minutes > 0) {
        return '${hours}時間${minutes}分';
      } else if (hours > 0) {
        return '${hours}時間';
      } else {
        return '${minutes}分';
      }
    } catch (e) {
      return '計算不可';
    }
  }

  // ステータステキストを取得
  String _getStatusText() {
    if (shiftData == null) return '不明';
    
    final status = shiftData!['status'] as String?;
    if (status == null) return '不明';
    
    switch (status) {
      case '確定':
        return '確定済み';
      case '未確定':
        return '未確定';
      default:
        return status;
    }
  }

  // ステータス色を取得
  Color _getStatusColor() {
    if (shiftData == null) return Colors.grey;
    
    final status = shiftData!['status'] as String?;
    if (status == null) return Colors.grey;
    
    switch (status) {
      case '確定':
        return Colors.green;
      case '未確定':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  // 承認者を取得
  String _getApprovedBy() {
    if (shiftData == null) return '未承認';
    
    final approvedBy = shiftData!['approvedBy'] as String?;
    return approvedBy ?? '未承認';
  }

  // 承認日時を取得
  String _getApprovedAt() {
    if (shiftData == null) return '未承認';
    
    final approvedAt = shiftData!['approvedAt'];
    if (approvedAt == null) return '未承認';
    
    try {
      if (approvedAt is DateTime) {
        return '${approvedAt.year}年${approvedAt.month}月${approvedAt.day}日 ${approvedAt.hour.toString().padLeft(2, '0')}:${approvedAt.minute.toString().padLeft(2, '0')}';
      } else if (approvedAt is Map && approvedAt.containsKey('_seconds')) {
        // Firestore Timestamp形式の場合
        final seconds = approvedAt['_seconds'] as int?;
        if (seconds != null) {
          final dateTime = DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true).toLocal();
          return '${dateTime.year}年${dateTime.month}月${dateTime.day}日 ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
        }
      }
      return '未承認';
    } catch (e) {
      return '未承認';
    }
  }
}
