import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/AttendanceManagement/staffAttendanceDetailPage.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

import 'attendanceService.dart';

class AllStaffAttendancePage extends StatefulWidget {
  const AllStaffAttendancePage({super.key});

  @override
  State<AllStaffAttendancePage> createState() => _AllStaffAttendancePageState();
}

class _AllStaffAttendancePageState extends State<AllStaffAttendancePage> {
  late DateTime selectedDate;
  String? selectedStaffId;
  List<String> staffNames = [];
  bool isLoading = false;
  List<Map<String, dynamic>> attendances = [];
  List<Map<String, dynamic>> shifts = [];
  dynamic payrollData = []; // 給与データを追加
  Map<String, dynamic>? summaryData;

  @override
  void initState() {
    super.initState();
    // 今日の日付から給与計算期間の開始日を計算して初期化
    selectedDate = _calculatePayrollPeriodStart(DateTime.now());
    print('=== initState 開始 ===');
    print('今日の日付: ${DateTime.now()}');
    print('計算後のselectedDate: $selectedDate');
    print('selectedDate.month: ${selectedDate.month}');
    print('selectedDate.year: ${selectedDate.year}');
    _loadAttendanceData();
  }

  Future<void> _loadAttendanceData() async {
    print('=== _loadAttendanceData 開始 ===');
    print('selectedDate: $selectedDate');
    
    setState(() {
      isLoading = true;
    });

    try {
      // 勤怠データと給与データを並行取得
      // 給与データは選択月の翌月期間で取得（8月選択→8月26日〜9月25日、9月選択→9月26日〜10月25日）
      final payrollMonth = selectedDate.month + 1;
      final payrollYear = payrollMonth > 12 ? selectedDate.year + 1 : selectedDate.year;
      final adjustedPayrollMonth = payrollMonth > 12 ? 1 : payrollMonth;
      
      print('給与データ取得パラメータ: month=$adjustedPayrollMonth, year=$payrollYear');
      
      // 勤怠データと給与データを個別に取得
      Map<String, dynamic> result;
      try {
        print('勤怠データ取得開始: month=${selectedDate.month}, year=${selectedDate.year}');
        result = await AttendanceService.getAllStaffAttendance(
          month: selectedDate.month,
          year: selectedDate.year,
          startDay: StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay,
          endDay: StoreConfigService.instance.latestData?.payrollEndDay ?? kDefaultPayrollEndDay,
        );
        print('勤怠データ取得成功: ${result['attendances']?.length ?? 0}件');
      } catch (e) {
        print('勤怠データ取得エラー: $e');
        result = {'success': false, 'attendances': [], 'shifts': []};
      }
      
      List<dynamic> payrollResult = [];
      try {
        final payrollData = await AttendanceService.getPayrollData(
          month: adjustedPayrollMonth,
          year: payrollYear,
          startDay: StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay,
          endDay: StoreConfigService.instance.latestData?.payrollEndDay ?? kDefaultPayrollEndDay,
        );
        
        // AttendanceServiceで既に正規化済みなので、そのまま使用
        payrollResult = payrollData;
      } catch (e) {
        payrollResult = [];
      }

      print('result["success"]: ${result['success']}');
      
      if (result['success'] == true) {
        print('=== 勤怠データ変換開始 ===');
        // 勤怠データの型安全な変換
        final attendancesList = <Map<String, dynamic>>[];
        try {
          final rawAttendances = result['attendances'];
          print('rawAttendances.length: ${rawAttendances?.length ?? 0}');
          
          if (rawAttendances is List) {
            for (int i = 0; i < rawAttendances.length; i++) {
              final item = rawAttendances[i];
              if (item is Map) {
                try {
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
                  print('✅ 勤怠データ[$i]変換成功: ${convertedItem['date']}');
                } catch (e) {
                  print('❌ 勤怠データ[$i]変換エラー: $e');
                }
              }
            }
          }
          print('変換後のattendancesList.length: ${attendancesList.length}');
        } catch (e) {
          print('❌ 勤怠データ変換エラー: $e');
        }
        
        // シフトデータの型安全な変換
        final shiftsList = <Map<String, dynamic>>[];
        try {
          final rawShifts = result['shifts'];
          if (rawShifts is List) {
            for (final item in rawShifts) {
              if (item is Map) {
                try {
                  // 各フィールドを明示的に変換
                  final convertedItem = <String, dynamic>{
                    'id': item['id']?.toString() ?? '',
                    'staffId': item['staffId']?.toString() ?? '',
                    'staffName': item['staffName']?.toString() ?? '不明',
                    'date': item['date']?.toString() ?? '',
                    'start': item['start']?.toString() ?? '',
                    'end': item['end']?.toString() ?? '',
                    'confirmed': item['confirmed'] == true,
                    'approvedBy': item['approvedBy']?.toString() ?? '',
                    'approvedAt': _parseTimestamp(item['approvedAt']),
                    'createdAt': _parseTimestamp(item['createdAt']),
                    'updatedAt': _parseTimestamp(item['updatedAt']),
                    'status': item['status']?.toString() ?? '',
                  };
                  shiftsList.add(convertedItem);
                } catch (e) {
                  // 個別アイテムの変換エラーは無視
                }
              }
            }
          }
        } catch (e) {
          // シフトデータの変換エラーは無視
        }
        
        print('=== setState 前 ===');
        print('attendancesList.length: ${attendancesList.length}');
        print('shiftsList.length: ${shiftsList.length}');
        print('payrollResult.length: ${payrollResult.length}');
        
        setState(() {
          attendances = attendancesList;
          shifts = shiftsList;
          payrollData = payrollResult;
          _updateSummaryData();
          _updateStaffNames();
        });
        
        print('=== setState 後 ===');
        print('attendances.length: ${attendances.length}');
        print('shifts.length: ${shifts.length}');
        print('payrollData.length: ${payrollData.length}');
      }
    } catch (e) {
      print('❌ _loadAttendanceData エラー: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('勤怠データの取得に失敗しました: $e')),
      );
    } finally {
      setState(() {
        isLoading = false;
      });
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
    final startDay = StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay;
    int year = selectedDate.year;
    int month = selectedDate.month;
    int day = selectedDate.day;
    
    // 選択された日付が給与計算期間の開始日より前か後かで判定
    if (day < startDay) {
      // 前月の給与計算期間に含まれる
      DateTime prevMonth = DateTime(year, month - 1);
      return DateTime(prevMonth.year, prevMonth.month, startDay);
    } else {
      // 今月の給与計算期間に含まれる
      return DateTime(year, month, startDay);
    }
  }

  // 給与計算期間の表示テキストを取得
  String _getPayrollPeriodText() {
    final startDay = StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay;
    final endDay = StoreConfigService.instance.latestData?.payrollEndDay ?? kDefaultPayrollEndDay;
    
    // _calculatePayrollPeriodStartを使って正しい期間開始日を取得
    final periodStart = _calculatePayrollPeriodStart(selectedDate);
    
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
    
    // 給与計算期間の終了日を計算
    DateTime periodEnd;
    
    if (endDay == 0) {
      // 終了日が0の場合：今月開始日〜今月終了日（月を跨がない）
      periodEnd = DateTime(periodStart.year, periodStart.month, DateTime(periodStart.year, periodStart.month + 1, 0).day);
    } else {
      // 終了日が0以外の場合：月を跨ぐ期間
      final nextMonth = periodStart.month == 12 ? 1 : periodStart.month + 1;
      final nextYear = periodStart.month == 12 ? periodStart.year + 1 : periodStart.year;
      periodEnd = DateTime(nextYear, nextMonth, endDay);
    }
    
    // 期間テキストを生成
    periodText = '${periodStart.year}年${periodStart.month}月${periodStart.day}日 〜 ${periodEnd.year}年${periodEnd.month}月${periodEnd.day}日';
    
    return periodText;
  }

  // 期間設定ダイアログを表示
  void _showPeriodSettings(BuildContext context) {
    final startDay = StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay;
    final endDay = StoreConfigService.instance.latestData?.payrollEndDay ?? kDefaultPayrollEndDay;
    final periodDescription = '給与計算期間は${startDay}日〜翌月${endDay}日です。変更する場合は、このファイルの数値を変更してアプリを再起動してください。';
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('給与計算期間設定'),
          content: Text(
            '現在の設定:\n'
            '開始日: ${startDay}日\n'
            '終了日: ${endDay}日\n\n'
            '$periodDescription',
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
    if (attendances.isEmpty) {
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
    
    if (selectedStaffId != null) {
      filteredStaffNames = staffNames.where((staffName) {
        return staffName == selectedStaffId;
      }).toList();
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
                      // 給与データも渡す
                      payrollData: payrollData,
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
