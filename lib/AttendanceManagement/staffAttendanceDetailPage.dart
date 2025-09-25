import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/AttendanceManagement/shiftDetailPage.dart';
import 'package:amuse_app_template/AttendanceManagement/attendanceDetailPage.dart';

class StaffAttendanceDetailPage extends StatefulWidget {
  final String staffId;
  final String staffName;
  final Map<String, dynamic>? existingAttendanceData;
  final Map<String, dynamic>? monthData;
  final List<Map<String, dynamic>>? shiftsData;
  final List<Map<String, dynamic>>? attendancesData;
  final String? payrollPeriodText; // 期間表示テキストを追加
  
  const StaffAttendanceDetailPage({
    super.key,
    required this.staffId,
    required this.staffName,
    this.existingAttendanceData,
    this.monthData,
    this.shiftsData,
    this.attendancesData,
    this.payrollPeriodText,
  });

  @override
  State<StaffAttendanceDetailPage> createState() => _StaffAttendanceDetailPageState();
}

class _StaffAttendanceDetailPageState extends State<StaffAttendanceDetailPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  DateTime selectedMonth = DateTime.now();
  bool isLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    
    // 渡された月次データがあれば使用
    if (widget.monthData != null) {
      selectedMonth = DateTime(
        widget.monthData!['year'] as int,
        widget.monthData!['month'] as int,
        1,
      );
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _selectMonth(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: selectedMonth,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDatePickerMode: DatePickerMode.year,
      locale: const Locale('ja', 'JP'), // 日本語対応
    );
    if (picked != null && picked != selectedMonth) {
      setState(() {
        selectedMonth = DateTime(picked.year, picked.month, 1);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.staffName}の勤怠詳細'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'シフト', icon: Icon(Icons.schedule)),
            Tab(text: '勤怠記録', icon: Icon(Icons.work_history)),
          ],
        ),
      ),
      body: Column(
        children: [
          // 期間表示とスタッフ情報
          Container(
            padding: const EdgeInsets.all(16.0),
            color: Colors.grey[100],
            child: Column(
              children: [
                // 期間表示（カレンダー選択を削除）
                Container(
                  padding: const EdgeInsets.all(12.0),
                  decoration: BoxDecoration(
                    color: Colors.blue[50],
                    border: Border.all(color: Colors.blue),
                    borderRadius: BorderRadius.circular(8.0),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.schedule, color: Colors.blue),
                      const SizedBox(width: 8.0),
                      Text(
                        '給与計算期間: ${widget.payrollPeriodText ?? '期間未設定'}',
                        style: const TextStyle(
                          fontSize: 16.0, 
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12.0),
                // スタッフ情報
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildInfoCard('総勤務日数', '${_calculateTotalDays()}日', Colors.blue),
                    _buildInfoCard('総勤務時間', '${_calculateTotalHours().toStringAsFixed(1)}時間', Colors.green),
                    _buildInfoCard('深夜時間', '${_calculateTotalNightHours().toStringAsFixed(1)}時間', Colors.purple),
                  ],
                ),
              ],
            ),
          ),
          
          // タブコンテンツ
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildShiftsTab(),
                _buildAttendanceTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard(String title, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(12.0),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8.0),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 12.0,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4.0),
          Text(
            value,
            style: TextStyle(
              fontSize: 16.0,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildShiftsTab() {
    return isLoading
        ? const Center(child: CircularProgressIndicator())
        : _buildShiftsList();
  }

  Widget _buildShiftsList() {
    if (widget.shiftsData == null || widget.shiftsData!.isEmpty) {
      return const Center(
        child: Text(
          'シフトデータがありません',
          style: TextStyle(fontSize: 18.0, color: Colors.grey),
        ),
      );
    }

    return ListView.builder(
      itemCount: widget.shiftsData!.length,
      itemBuilder: (context, index) {
        final shift = widget.shiftsData![index];
        final date = shift['date'] as String?;
        final startTime = shift['startTime'] as DateTime?;
        final endTime = shift['endTime'] as DateTime?;
        final status = shift['status'] as String? ?? '不明';

        if (date == null) return const SizedBox.shrink();

        // 日付文字列から日付オブジェクトを作成
        final dateParts = date.split('-');
        if (dateParts.length != 3) return const SizedBox.shrink();

        final year = int.parse(dateParts[0]);
        final month = int.parse(dateParts[1]);
        final day = int.parse(dateParts[2]);
        final dateObj = DateTime(year, month, day);
        
        // 土日の場合の色分け
        final isWeekend = dateObj.weekday == DateTime.saturday || dateObj.weekday == DateTime.sunday;

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
          color: isWeekend ? Colors.grey[50] : Colors.white,
          child: InkWell(
            onTap: () {
              print('=== シフト詳細ページへの遷移 ===');
              print('選択されたシフト: $shift');
              print('日付: $dateObj');
              print('スタッフ名: ${widget.staffName}');
              print('========================');
              
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => ShiftDetailPage(
                    date: dateObj,
                    staffName: widget.staffName,
                    shiftData: shift,
                  ),
                ),
              );
            },
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '${month}月${day}日',
                        style: const TextStyle(
                          fontSize: 18.0,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
                        decoration: BoxDecoration(
                          color: _getStatusColor(status),
                          borderRadius: BorderRadius.circular(12.0),
                        ),
                        child: Text(
                          status,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12.0,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8.0),
                  if (startTime != null && endTime != null) ...[
                    Row(
                      children: [
                        const Icon(Icons.access_time, size: 16, color: Colors.blue),
                        const SizedBox(width: 8.0),
                        Text(
                          '${_formatTime(startTime)} - ${_formatTime(endTime)}',
                          style: const TextStyle(fontSize: 16.0),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4.0),
                    Row(
                      children: [
                        const Icon(Icons.schedule, size: 16, color: Colors.green),
                        const SizedBox(width: 8.0),
                        Text(
                          'シフト時間: ${_calculateShiftHours(startTime, endTime)}',
                          style: const TextStyle(fontSize: 16.0),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'confirmed':
      case '確定':
        return Colors.green;
      case 'pending':
      case '保留':
        return Colors.orange;
      case 'rejected':
      case '却下':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _formatTime(DateTime time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }

  String _calculateShiftHours(DateTime start, DateTime end) {
    final difference = end.difference(start);
    final hours = difference.inHours;
    final minutes = difference.inMinutes % 60;
    
    if (hours > 0 && minutes > 0) {
      return '${hours}時間${minutes}分';
    } else if (hours > 0) {
      return '${hours}時間';
    } else {
      return '${minutes}分';
    }
  }

  Widget _buildAttendanceTab() {
    return isLoading
        ? const Center(child: CircularProgressIndicator())
        : _buildAttendanceList();
  }

  Widget _buildAttendanceList() {
    // このスタッフの期間内の勤怠記録を取得
    final staffAttendances = _getStaffAttendances();
    
    if (staffAttendances.isEmpty) {
      return const Center(
        child: Text(
          '勤怠記録がありません',
          style: TextStyle(fontSize: 18.0, color: Colors.grey),
        ),
      );
    }

    return ListView.builder(
      itemCount: staffAttendances.length,
      itemBuilder: (context, index) {
        final attendance = staffAttendances[index];
        final date = attendance['date'] as String?;
        final clockIn = attendance['clockIn'] as DateTime?;
        final clockOut = attendance['clockOut'] as DateTime?;
        final isManual = attendance['isManual'] as bool? ?? false;
        final totalMinutes = attendance['totalMinutes'] as int? ?? 0;
        final nightMinutes = attendance['nightMinutes'] as int? ?? 0;

        if (date == null) return const SizedBox.shrink();

        // 日付文字列から日付オブジェクトを作成
        final dateParts = date.split('-');
        if (dateParts.length != 3) return const SizedBox.shrink();

        final year = int.parse(dateParts[0]);
        final month = int.parse(dateParts[1]);
        final day = int.parse(dateParts[2]);
        final dateObj = DateTime(year, month, day);
        
        // 土日の場合の色分け
        final isWeekend = dateObj.weekday == DateTime.saturday || dateObj.weekday == DateTime.sunday;

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
          color: isWeekend ? Colors.grey[50] : Colors.white,
          child: InkWell(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => AttendanceDetailPage(
                    date: dateObj,
                    staffName: widget.staffName,
                    attendanceData: attendance,
                  ),
                ),
              );
            },
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${month}月${day}日 (${_getWeekdayString(dateObj.weekday)})',
                    style: const TextStyle(
                      fontSize: 18.0,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8.0),
                  if (clockIn != null && clockOut != null) ...[
                    // 勤務完了の場合
                    Row(
                      children: [
                        const Icon(Icons.access_time, size: 16, color: Colors.blue),
                        const SizedBox(width: 8.0),
                        Text(
                          '${_formatTime(clockIn)} - ${_formatTime(clockOut)}',
                          style: const TextStyle(fontSize: 16.0),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4.0),
                    Row(
                      children: [
                        const Icon(Icons.schedule, size: 16, color: Colors.green),
                        const SizedBox(width: 8.0),
                        Text(
                          '勤務時間: ${_formatWorkHours(totalMinutes)}',
                          style: const TextStyle(fontSize: 16.0),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4.0),
                    Row(
                      children: [
                        const Icon(Icons.nightlight, size: 16, color: Colors.purple),
                        const SizedBox(width: 8.0),
                        Text(
                          '深夜時間: ${_formatWorkHours(nightMinutes)}',
                          style: const TextStyle(fontSize: 16.0),
                        ),
                      ],
                    ),
                  ] else if (clockIn != null && clockOut == null) ...[
                    // 勤務中の場合
                    Row(
                      children: [
                        const Icon(Icons.access_time, size: 16, color: Colors.orange),
                        const SizedBox(width: 8.0),
                        Text(
                          '${_formatTime(clockIn)} - 勤務中',
                          style: const TextStyle(
                            fontSize: 16.0,
                            color: Colors.orange,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  // このスタッフの期間内の勤怠記録を取得
  List<Map<String, dynamic>> _getStaffAttendances() {
    // 渡されたattendancesDataを使用
    if (widget.attendancesData == null) return [];
    
    // このスタッフの勤怠記録のみをフィルタリング
    return widget.attendancesData!.where((attendance) {
      final staffName = attendance['staffName'] as String?;
      return staffName == widget.staffName;
    }).toList();
  }

  // 勤務時間をフォーマット
  String _formatWorkHours(int totalMinutes) {
    final hours = totalMinutes ~/ 60;
    final minutes = totalMinutes % 60;
    
    if (hours > 0 && minutes > 0) {
      return '${hours}時間${minutes}分';
    } else if (hours > 0) {
      return '${hours}時間';
    } else {
      return '${minutes}分';
    }
  }

  Widget _buildDataBasedList({
    required String dataType,
    required String title,
    required IconData icon,
  }) {
    // データがある日のみを表示
    if (widget.existingAttendanceData == null) {
      return const Center(
        child: Text(
          'データがありません',
          style: TextStyle(fontSize: 18.0, color: Colors.grey),
        ),
      );
    }

    // 既存データの日付を取得
    final attendanceDate = widget.existingAttendanceData!['date'] as String?;
    if (attendanceDate == null) {
      return const Center(
        child: Text(
          '日付データがありません',
          style: TextStyle(fontSize: 18.0, color: Colors.grey),
        ),
      );
    }

    // 日付文字列から日付オブジェクトを作成
    final dateParts = attendanceDate.split('-');
    if (dateParts.length != 3) {
      return const Center(
        child: Text(
          '日付形式が正しくありません',
          style: TextStyle(fontSize: 18.0, color: Colors.grey),
        ),
      );
    }

    final year = int.parse(dateParts[0]);
    final month = int.parse(dateParts[1]);
    final day = int.parse(dateParts[2]);
    final date = DateTime(year, month, day);
    
    // 土日の場合の色分け
    final isWeekend = date.weekday == DateTime.saturday || date.weekday == DateTime.sunday;
              
    // ListView.builderを使用してカードサイズを自動調整
    return ListView.builder(
      itemCount: 1, // 現在は1件のデータのみ
      itemBuilder: (context, index) {
        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
          color: isWeekend ? Colors.grey[50] : Colors.white,
          child: InkWell(
            onTap: () {
              if (dataType == 'shift') {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => ShiftDetailPage(
                      date: date,
                      staffName: widget.staffName,
                    ),
                  ),
                );
              } else {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => AttendanceDetailPage(
                      date: date,
                      staffName: widget.staffName,
                      attendanceData: widget.existingAttendanceData,
                    ),
                  ),
                );
              }
            },
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  // 左側：日付サークル
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: isWeekend ? Colors.grey[300] : Colors.green,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Center(
                      child: Text(
                        '$day',
                        style: TextStyle(
                          color: isWeekend ? Colors.grey[600] : Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16.0),
                  // 中央：コンテンツ
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // 日付タイトル
                        Text(
                          '${date.month}月${day}日 (${_getWeekdayString(date.weekday)})',
                          style: TextStyle(
                            fontSize: 16.0,
                            fontWeight: FontWeight.bold,
                            color: isWeekend ? Colors.grey[600] : Colors.black,
                          ),
                        ),
                        const SizedBox(height: 8.0),
                        // タブ別の内容
                        if (dataType == 'shift') ...[
                          // シフトタブの内容
                          Row(
                            children: [
                              const Icon(Icons.schedule, size: 16, color: Colors.blue),
                              const SizedBox(width: 4.0),
                              Text('${_getFormattedTime(widget.existingAttendanceData?['shiftStart'])} - ${_getFormattedTime(widget.existingAttendanceData?['shiftEnd'])}'),
                              const SizedBox(width: 16.0),
                              const Icon(Icons.access_time, size: 16, color: Colors.green),
                              const SizedBox(width: 4.0),
                              Text('${_calculateWorkHours(widget.existingAttendanceData?['shiftStart'], widget.existingAttendanceData?['shiftEnd'])}'),
                            ],
                          ),
                          const SizedBox(height: 4.0),
                          Row(
                            children: [
                              const Icon(Icons.check_circle, size: 16, color: Colors.green),
                              const SizedBox(width: 4.0),
                              const Text('承認済み'),
                              const SizedBox(width: 16.0),
                              const Icon(Icons.person, size: 16, color: Colors.blue),
                              const SizedBox(width: 4.0),
                              Text('${widget.staffName}'),
                            ],
                          ),
                        ] else ...[
                          // 勤怠記録タブの内容
                          Row(
                            children: [
                              const Icon(Icons.login, size: 16, color: Colors.green),
                              const SizedBox(width: 4.0),
                              Text('出勤: ${_getFormattedTime(widget.existingAttendanceData?['clockIn'])}'),
                              const SizedBox(width: 16.0),
                              const Icon(Icons.logout, size: 16, color: Colors.red),
                              const SizedBox(width: 4.0),
                              Text('退勤: ${_getFormattedTime(widget.existingAttendanceData?['clockOut'])}'),
                            ],
                          ),
                          const SizedBox(height: 4.0),
                          Row(
                            children: [
                              const Icon(Icons.access_time, size: 16, color: Colors.blue),
                              const SizedBox(width: 4.0),
                              Text('勤務: ${_calculateWorkHours(widget.existingAttendanceData?['clockIn'], widget.existingAttendanceData?['clockOut'])}'),
                              const SizedBox(width: 16.0),
                              const Icon(Icons.nightlight, size: 16, color: Colors.purple),
                              const SizedBox(width: 4.0),
                              Text('深夜: ${_calculateNightTimeHours(widget.existingAttendanceData?['nightMinutes'] ?? 0)}'),
                            ],
                          ),
                          const SizedBox(height: 4.0),
                          Row(
                            children: [
                              const Icon(Icons.location_on, size: 16, color: Colors.purple),
                              const SizedBox(width: 4.0),
                              Text('${widget.existingAttendanceData?['isManual'] == true ? '手動打刻' : 'QR打刻'}'),
                              const SizedBox(width: 16.0),
                              const Icon(Icons.check_circle, size: 16, color: Colors.green),
                              const SizedBox(width: 4.0),
                              const Text('正常'),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  // 右側：矢印アイコン
                  const Icon(Icons.chevron_right),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  // 計算メソッド
  int _calculateTotalDays() {
    // 期間中の全ての勤怠記録から計算
    final staffAttendances = _getStaffAttendances();
    return staffAttendances.length;
  }

  double _calculateTotalHours() {
    // 期間中の全ての勤怠記録から計算
    final staffAttendances = _getStaffAttendances();
    int totalMinutes = 0;
    
    for (final attendance in staffAttendances) {
      final minutes = attendance['totalMinutes'] as int? ?? 0;
      totalMinutes += minutes;
    }
    
    return totalMinutes / 60.0;
  }

  double _calculateTotalNightHours() {
    // 期間中の全ての勤怠記録から計算
    final staffAttendances = _getStaffAttendances();
    int totalNightMinutes = 0;
    
    for (final attendance in staffAttendances) {
      final nightMinutes = attendance['nightMinutes'] as int? ?? 0;
      totalNightMinutes += nightMinutes;
    }
    
    return totalNightMinutes / 60.0;
  }

  // 時間フォーマット用ヘルパーメソッド
  String _getFormattedTime(dynamic time) {
    if (time == null) return '--:--';
    if (time is DateTime) {
      return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
    }
    return '--:--';
  }

  // 勤務時間計算用ヘルパーメソッド
  String _calculateWorkHours(dynamic start, dynamic end) {
    if (start == null || end == null) return '--時間--分';
    if (start is DateTime && end is DateTime) {
      final difference = end.difference(start);
      final hours = difference.inHours;
      final minutes = difference.inMinutes % 60;
      return '${hours}時間${minutes}分';
    }
    return '--時間--分';
  }

  // 深夜時間計算用ヘルパーメソッド
  String _calculateNightTimeHours(int nightMinutes) {
    if (nightMinutes <= 0) return '0時間';
    final hours = nightMinutes / 60.0;
    return '${hours.toStringAsFixed(1)}時間';
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
}
