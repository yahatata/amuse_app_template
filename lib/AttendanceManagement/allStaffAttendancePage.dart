import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/AttendanceManagement/staffAttendanceDetailPage.dart';
import 'package:amuse_app_template/globalConstant.dart';

import 'attendanceService.dart';

class AllStaffAttendancePage extends StatefulWidget {
  const AllStaffAttendancePage({super.key});

  @override
  State<AllStaffAttendancePage> createState() => _AllStaffAttendancePageState();
}

class _AllStaffAttendancePageState extends State<AllStaffAttendancePage> {
  DateTime selectedDate = DateTime.now();
  String? selectedStaffId;
  List<String> staffNames = [];
  bool isLoading = false;
  List<Map<String, dynamic>> attendances = [];
  List<Map<String, dynamic>> shifts = [];
  Map<String, dynamic>? summaryData;

  @override
  void initState() {
    super.initState();
    _loadAttendanceData();
  }

  Future<void> _loadAttendanceData() async {
    setState(() {
      isLoading = true;
    });

    try {
      print('=== 勤怠データ取得開始 ===');
      print('選択月: ${selectedDate.month}月');
      print('選択年: ${selectedDate.year}年');
      
      final result = await AttendanceService.getAllStaffAttendance(
        month: selectedDate.month,
        year: selectedDate.year,
        startDay: GlobalConstants.PAYROLL_START_DAY,
        endDay: GlobalConstants.PAYROLL_END_DAY,
      );

      print('=== Cloud Function結果 ===');
      print('result: $result');
      print('success: ${result['success']}');
      print('attendances: ${result['attendances']}');
      print('attendances.length: ${result['attendances']?.length ?? 0}');
      print('shifts: ${result['shifts']}');
      print('shifts.length: ${result['shifts']?.length ?? 0}');

      if (result['success'] == true) {
        // 勤怠データの型安全な変換
        final rawAttendances = result['attendances'] as List? ?? [];
        final attendancesList = <Map<String, dynamic>>[];
        
        for (final item in rawAttendances) {
          if (item is Map) {
            // 各フィールドを明示的に変換
            final convertedItem = <String, dynamic>{
              'id': item['id']?.toString() ?? '',
              'staffId': item['staffId']?.toString() ?? '',
              'staffName': item['staffName']?.toString() ?? '不明',
              'date': item['date']?.toString() ?? '',
              'clockIn': _parseTimestamp(item['clockIn']),
              'clockOut': _parseTimestamp(item['clockOut']),
              'shiftStart': _parseTimestamp(item['shiftStart']),
              'shiftEnd': _parseTimestamp(item['shiftEnd']),
              'isManual': item['isManual'] == true,
              'nightTimeHours': (item['nightTimeHours'] is num) ? (item['nightTimeHours'] as num).toDouble() : 0.0,
              'totalWorkHours': (item['totalWorkHours'] is num) ? (item['totalWorkHours'] as num).toDouble() : 0.0,
              'nightMinutes': (item['nightMinutes'] is num) ? (item['nightMinutes'] as num).toInt() : 0,
              'totalMinutes': (item['totalMinutes'] is num) ? (item['totalMinutes'] as num).toInt() : 0,
            };
            attendancesList.add(convertedItem);
          }
        }

        // シフトデータの型安全な変換
        final rawShifts = result['shifts'] as List? ?? [];
        final shiftsList = <Map<String, dynamic>>[];
        
        for (final item in rawShifts) {
          if (item is Map) {
            // 各フィールドを明示的に変換
            final convertedItem = <String, dynamic>{
              'id': item['id']?.toString() ?? '',
              'staffId': item['staffId']?.toString() ?? '',
              'staffName': item['staffName']?.toString() ?? '不明',
              'date': item['date']?.toString() ?? '',
              'start': item['start']?.toString() ?? '', // startフィールドを使用
              'end': item['end']?.toString() ?? '',     // endフィールドを使用
              'confirmed': item['confirmed'],
              'approvedBy': item['approvedBy']?.toString(),
              'approvedAt': item['approvedAt'],
              'createdAt': item['createdAt'],
              'updatedAt': item['updatedAt'],
              'status': item['status']?.toString() ?? '不明',
            };
            shiftsList.add(convertedItem);
          }
        }
        
        print('=== 変換後のデータ ===');
        print('attendancesList: $attendancesList');
        print('attendancesList.length: ${attendancesList.length}');
        print('shiftsList: $shiftsList');
        print('shiftsList.length: ${shiftsList.length}');
        
        setState(() {
          attendances = attendancesList;
          shifts = shiftsList;
          _updateSummaryData();
          _updateStaffNames();
        });
        
        print('=== 状態更新後 ===');
        print('attendances.length: ${attendances.length}');
        print('shifts.length: ${shifts.length}');
        print('summaryData: $summaryData');
        print('staffNames: $staffNames');
      } else {
        print('❌ Cloud Functionが失敗: ${result['error'] ?? '不明なエラー'}');
      }
    } catch (e) {
      print('❌ 勤怠データ取得エラー: $e');
      print('エラーの詳細: ${e.toString()}');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('勤怠データの取得に失敗しました: $e')),
      );
    } finally {
      setState(() {
        isLoading = false;
      });
      print('=== データ取得完了 ===');
      print('最終的なattendances.length: ${attendances.length}');
    }
  }

  void _updateSummaryData() {
    if (attendances.isEmpty) return;

    int totalDays = attendances.length;
    double totalHours = 0;
    double totalNightHours = 0;

    for (final attendance in attendances) {
      totalHours += attendance['totalWorkHours'] ?? 0;
      totalNightHours += attendance['nightTimeHours'] ?? 0;
    }

    summaryData = {
      'totalDays': totalDays,
      'totalHours': totalHours,
      'totalNightHours': totalNightHours,
    };
  }

  void _updateStaffNames() {
    final staffSet = <String>{'全員'};
    final staffSummary = _calculateStaffSummary();
    for (final staffName in staffSummary.keys) {
      staffSet.add(staffName);
    }
    staffNames = staffSet.toList();
  }

  Future<void> _selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDatePickerMode: DatePickerMode.year,
      locale: const Locale('ja', 'JP'), // 日本語対応
    );
    if (picked != null && picked != selectedDate) {
      setState(() {
        // 選択された日付から給与計算期間を計算
        selectedDate = _calculatePayrollPeriodStart(picked);
      });
      _loadAttendanceData(); // 月が変更されたらデータを再取得
    }
  }

  // 選択された日付から給与計算期間の開始日を計算
  DateTime _calculatePayrollPeriodStart(DateTime selectedDate) {
    int year = selectedDate.year;
    int month = selectedDate.month;
    int day = selectedDate.day;
    
    // 選択された日付が給与計算期間の開始日より前か後かで判定
    if (day < GlobalConstants.PAYROLL_START_DAY) {
      // 前月の給与計算期間に含まれる
      DateTime prevMonth = DateTime(year, month - 1);
      return DateTime(prevMonth.year, prevMonth.month, GlobalConstants.PAYROLL_START_DAY);
    } else {
      // 今月の給与計算期間に含まれる
      return DateTime(year, month, GlobalConstants.PAYROLL_START_DAY);
    }
  }

  // 給与計算期間の表示テキストを取得
  String _getPayrollPeriodText() {
    final startDay = GlobalConstants.PAYROLL_START_DAY;
    final endDay = GlobalConstants.PAYROLL_END_DAY;
    
    // selectedDateから給与計算期間を計算
    final currentMonth = selectedDate.month;
    final currentYear = selectedDate.year;
    
    // 終了日の表示テキストを取得
    String getEndDayText(int year, int month, int day) {
      if (day == 0) {
        // 0の場合は月の末日を計算
        final lastDay = DateTime(year, month + 1, 0).day;
        return '$lastDay日';
      } else {
        return '${day}日';
      }
    }
    
    // 現在の給与計算期間を計算
    String periodText;
    
    // 給与計算期間の開始日を計算
    DateTime periodStart;
    DateTime periodEnd;
    
    if (endDay == 0) {
      // 終了日が0の場合：今月開始日〜今月終了日（月を跨がない）
      // selectedDateから給与計算期間を計算
      periodStart = DateTime(currentYear, currentMonth, startDay);
      periodEnd = DateTime(currentYear, currentMonth, DateTime(currentYear, currentMonth + 1, 0).day);
    } else {
      // 終了日が0以外の場合：月を跨ぐ期間
      // selectedDateから給与計算期間を計算
      periodStart = DateTime(currentYear, currentMonth, startDay);
      final nextMonth = currentMonth == 12 ? 1 : currentMonth + 1;
      final nextYear = currentMonth == 12 ? currentYear + 1 : currentYear;
      periodEnd = DateTime(nextYear, nextMonth, endDay);
    }
    
    // 期間テキストを生成
    periodText = '${periodStart.year}年${periodStart.month}月${periodStart.day}日 〜 ${periodEnd.year}年${periodEnd.month}月${periodEnd.day}日';
    
    return periodText;
  }

  // 期間設定ダイアログを表示
  void _showPeriodSettings(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('給与計算期間設定'),
          content: Text(
            '現在の設定:\n'
            '開始日: ${GlobalConstants.PAYROLL_START_DAY}日\n'
            '終了日: ${GlobalConstants.PAYROLL_END_DAY}日\n\n'
            '${GlobalConstants.PAYROLL_PERIOD_DESCRIPTION}',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
  }

  // スタッフごとの集計データを計算
  Map<String, Map<String, dynamic>> _calculateStaffSummary() {
    final staffSummary = <String, Map<String, dynamic>>{};
    
    for (final attendance in attendances) {
      final staffName = attendance['staffName'] as String? ?? '不明';
      
      if (!staffSummary.containsKey(staffName)) {
        staffSummary[staffName] = {
          'totalWorkHours': 0.0,
          'totalNightHours': 0.0,
          'totalDays': 0,
          'staffId': attendance['staffId'] ?? '',
        };
      }
      
      final summary = staffSummary[staffName]!;
      summary['totalWorkHours'] = (summary['totalWorkHours'] as double) + (attendance['totalWorkHours'] ?? 0.0);
      summary['totalNightHours'] = (summary['totalNightHours'] as double) + (attendance['nightTimeHours'] ?? 0.0);
      summary['totalDays'] = (summary['totalDays'] as int) + 1;
    }
    
    return staffSummary;
  }

  // FirestoreのTimestampをDateTimeに変換するヘルパーメソッド
  DateTime? _parseTimestamp(dynamic timestamp) {
    if (timestamp == null) return null;
    
    try {
      // FirestoreのTimestamp形式の場合
      if (timestamp is Map && timestamp.containsKey('_seconds')) {
        final seconds = timestamp['_seconds'] as int?;
        final nanoseconds = timestamp['_nanoseconds'] as int? ?? 0;
        if (seconds != null) {
          return DateTime.fromMillisecondsSinceEpoch(
            (seconds * 1000) + (nanoseconds ~/ 1000000),
            isUtc: true,
          ).toLocal();
        }
      }
      
      // 文字列の場合
      if (timestamp is String) {
        return DateTime.parse(timestamp);
      }
      
      // 数値の場合（ミリ秒）
      if (timestamp is num) {
        return DateTime.fromMillisecondsSinceEpoch(timestamp.toInt(), isUtc: true).toLocal();
      }
      
      return null;
    } catch (e) {
      print('❌ Timestamp変換エラー: $timestamp, エラー: $e');
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('全スタッフ勤怠記録'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          // フィルター部分
          Container(
            padding: const EdgeInsets.all(16.0),
            color: Colors.grey[100],
            child: Column(
              children: [
                // 期間表示
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
                        '給与計算期間: ${_getPayrollPeriodText()}',
                        style: const TextStyle(
                          fontSize: 16.0, 
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                        ),
                      ),
                      const SizedBox(width: 8.0),
                      IconButton(
                        icon: const Icon(Icons.settings, color: Colors.blue),
                        onPressed: () => _showPeriodSettings(context),
                        tooltip: '期間設定',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12.0),
                // 月選択とスタッフ選択
                Row(
                  children: [
                    // 月選択
                    Expanded(
                      child: InkWell(
                        onTap: () => _selectDate(context),
                        child: Container(
                          padding: const EdgeInsets.all(12.0),
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey),
                            borderRadius: BorderRadius.circular(8.0),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today, color: Colors.blue),
                              const SizedBox(width: 8.0),
                              Text(
                                _getPayrollPeriodText(),
                                style: const TextStyle(fontSize: 16.0, fontWeight: FontWeight.bold),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16.0),
                    // スタッフ選択
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: selectedStaffId,
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          labelText: 'スタッフ',
                        ),
                        items: staffNames.map((String name) {
                          return DropdownMenuItem<String>(
                            value: name == '全員' ? null : name,
                            child: Text(name),
                          );
                        }).toList(),
                        onChanged: (String? newValue) {
                          setState(() {
                            selectedStaffId = newValue;
                          });
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12.0),
          // 勤怠記録一覧
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : _buildAttendanceList(),
          ),
        ],
      ),
    );
  }

  Widget _buildAttendanceList() {
    print('=== _buildAttendanceList呼び出し ===');
    print('attendances.length: ${attendances.length}');
    print('attendances: $attendances');
    
    if (attendances.isEmpty) {
      print('❌ attendancesが空のため「勤怠記録がありません」を表示');
      return const Center(
        child: Text(
          '勤怠記録がありません',
          style: TextStyle(fontSize: 18.0, color: Colors.grey),
        ),
      );
    }

    // スタッフごとの集計データを取得
    final staffSummary = _calculateStaffSummary();
    final staffNames = staffSummary.keys.toList();
    
    // フィルタリング
    List<String> filteredStaffNames = staffNames;
    print('フィルタリング前: ${filteredStaffNames.length}件');
    
    if (selectedStaffId != null) {
      print('選択されたスタッフ: $selectedStaffId');
      filteredStaffNames = staffNames.where((staffName) {
        final matches = staffName == selectedStaffId;
        print('スタッフ名: $staffName, マッチ: $matches');
        return matches;
      }).toList();
      print('フィルタリング後: ${filteredStaffNames.length}件');
    } else {
      print('全スタッフ表示（フィルタリングなし）');
    }

    return ListView.builder(
      itemCount: filteredStaffNames.length,
      itemBuilder: (context, index) {
        final staffName = filteredStaffNames[index];
        final summary = staffSummary[staffName]!;
        final totalWorkHours = summary['totalWorkHours'] as double;
        final totalNightHours = summary['totalNightHours'] as double;
        final totalDays = summary['totalDays'] as int;
        final staffId = summary['staffId'] as String;

        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: Colors.blue,
              child: Text(
                '${index + 1}',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
            title: Text(
              staffName,
              style: const TextStyle(fontSize: 18.0, fontWeight: FontWeight.bold),
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8.0),
                Row(
                  children: [
                    const Icon(Icons.access_time, size: 16, color: Colors.blue),
                    const SizedBox(width: 8.0),
                    Text(
                      '勤務時間合計: ${totalWorkHours.toStringAsFixed(1)}時間',
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
                      '深夜時間合計: ${totalNightHours.toStringAsFixed(1)}時間',
                      style: const TextStyle(fontSize: 16.0),
                    ),
                  ],
                ),
                const SizedBox(height: 4.0),
                Row(
                  children: [
                    const Icon(Icons.calendar_today, size: 16, color: Colors.green),
                    const SizedBox(width: 8.0),
                    Text(
                      '勤務日数: ${totalDays}日',
                      style: const TextStyle(fontSize: 16.0),
                    ),
                  ],
                ),
              ],
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              // このスタッフの期間内の勤怠データを取得
              final staffAttendances = attendances.where((attendance) {
                return attendance['staffName'] == staffName;
              }).toList();
              
              if (staffAttendances.isNotEmpty) {
                // このスタッフのシフトデータを取得
                final staffShifts = shifts.where((shift) {
                  return shift['staffName'] == staffName;
                }).toList();

                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => StaffAttendanceDetailPage(
                      staffId: staffId,
                      staffName: staffName,
                      // 既存の勤怠データも渡す（最初のデータを使用）
                      existingAttendanceData: staffAttendances.first,
                      // 月次データも渡す
                      monthData: {
                        'year': selectedDate.year,
                        'month': selectedDate.month,
                      },
                      // シフトデータも渡す
                      shiftsData: staffShifts,
                      // 期間内の全勤怠データも渡す
                      attendancesData: attendances,
                      // 期間表示テキストも渡す
                      payrollPeriodText: _getPayrollPeriodText(),
                    ),
                  ),
                );
              }
            },
          ),
        );
      },
    );
  }


}
