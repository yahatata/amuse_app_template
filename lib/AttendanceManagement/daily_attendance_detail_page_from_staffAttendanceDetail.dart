import 'package:flutter/material.dart';

class AttendanceDetailPage extends StatelessWidget {
  final DateTime date;
  final String staffName;
  final Map<String, dynamic>? attendanceData;
  
  const AttendanceDetailPage({
    super.key,
    required this.date,
    required this.staffName,
    this.attendanceData,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${date.month}月${date.day}日の勤怠詳細'),
        backgroundColor: Colors.green,
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
                        const Icon(Icons.person, color: Colors.green, size: 24),
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
                        const Icon(Icons.calendar_today, color: Colors.blue, size: 24),
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
            
            // 打刻時間カード
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '打刻時間',
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
                            '出勤時刻',
                            _getClockInTime(),
                            Icons.login,
                            Colors.green,
                          ),
                        ),
                        const SizedBox(width: 16.0),
                        Expanded(
                          child: _buildTimeCard(
                            '退勤時刻',
                            _getClockOutTime(),
                            Icons.logout,
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
                            Colors.blue,
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
            

            
            // 打刻詳細カード
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '打刻詳細',
                      style: TextStyle(
                        fontSize: 18.0,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16.0),
                    _buildPunchDetailRow('出勤', _getClockInTime(), _getClockInMethod(), Icons.qr_code, Colors.green),
                    _buildPunchDetailRow('退勤', _getClockOutTime(), _getClockOutMethod(), Icons.touch_app, Colors.red),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16.0),
            
            // 深夜時間カード
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '深夜時間',
                      style: TextStyle(
                        fontSize: 18.0,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16.0),
                    _buildNightTimeRow('深夜時間', '22:00 - 05:00', _getNightTimeHours()),
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
                        '業務の都合により30分の残業が発生しました。',
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

  Widget _buildStatusRow(String label, String value, IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
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
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPunchDetailRow(String type, String time, String method, IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 12.0),
          Expanded(
            child: Text(
              type,
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
                method,
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

  Widget _buildComparisonRow(String label, String shift, String actual, String diff, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Icon(Icons.compare_arrows, color: Colors.blue, size: 20),
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
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                shift,
                style: const TextStyle(
                  fontSize: 16.0,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                actual,
                style: const TextStyle(
                  fontSize: 16.0,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(width: 16.0),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12.0),
              border: Border.all(color: color.withOpacity(0.3)),
            ),
            child: Text(
              diff,
              style: TextStyle(
                fontSize: 14.0,
                color: color,
                fontWeight: FontWeight.bold,
              ),
            ),
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

  // 出勤時刻を取得
  String _getClockInTime() {
    if (attendanceData == null || attendanceData!['clockIn'] == null) {
      return '未設定';
    }
    
    try {
      final clockIn = attendanceData!['clockIn'];
      if (clockIn is DateTime) {
        return '${clockIn.hour.toString().padLeft(2, '0')}:${clockIn.minute.toString().padLeft(2, '0')}';
      } else if (clockIn is Map && clockIn.containsKey('_seconds')) {
        // Firestore Timestamp形式の場合
        final seconds = clockIn['_seconds'] as int?;
        if (seconds != null) {
          final dateTime = DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true).toLocal();
          return '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
        }
      }
      return '未設定';
    } catch (e) {
      return '未設定';
    }
  }

  // 退勤時刻を取得
  String _getClockOutTime() {
    if (attendanceData == null || attendanceData!['clockOut'] == null) {
      return '未設定';
    }
    
    try {
      final clockOut = attendanceData!['clockOut'];
      if (clockOut is DateTime) {
        return '${clockOut.hour.toString().padLeft(2, '0')}:${clockOut.minute.toString().padLeft(2, '0')}';
      } else if (clockOut is Map && clockOut.containsKey('_seconds')) {
        // Firestore Timestamp形式の場合
        final seconds = clockOut['_seconds'] as int?;
        if (seconds != null) {
          final dateTime = DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true).toLocal();
          return '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
        }
      }
      return '未設定';
    } catch (e) {
      return '未設定';
    }
  }

  // 勤務時間を計算（Phase4.1-F: actualWorkMinutes 優先）
  String _getWorkHours() {
    final workMin = attendanceData?['actualWorkMinutes'] ?? attendanceData?['totalMinutes'];
    if (attendanceData == null || workMin == null) {
      return '計算不可';
    }

    try {
      final totalMinutes = workMin is int ? workMin : (workMin as num).toInt();
      final hours = totalMinutes ~/ 60;
      final minutes = totalMinutes % 60;
      
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

  // 深夜時間を計算（Phase4.1-F: nightWorkMinutes 優先）
  String _getNightTimeHours() {
    final nightMin = attendanceData?['nightWorkMinutes'] ?? attendanceData?['nightMinutes'];
    if (attendanceData == null || nightMin == null) {
      return '0時間0分';
    }

    try {
      final nightMinutes = nightMin is int ? nightMin : (nightMin as num).toInt();
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
      return '0時間0分';
    }
  }

  // 出勤方法を取得
  String _getClockInMethod() {
    if (attendanceData == null) return '不明';
    
    final isManual = attendanceData!['isManual'] as bool? ?? false;
    return isManual ? '手動打刻' : 'QR打刻';
  }

  // 退勤方法を取得
  String _getClockOutMethod() {
    if (attendanceData == null) return '不明';
    
    final isManual = attendanceData!['isManual'] as bool? ?? false;
    return isManual ? '手動打刻' : 'QR打刻';
  }
}
