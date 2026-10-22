import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/AttendanceManagement/attendance_user_facing_errors.dart';
import 'package:amuse_app_template/AttendanceManagement/staff_attendance_detail_page_from_allStaffAttendance.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/Home/staff_retired_ui_helpers.dart';
import 'package:amuse_app_template/core/errors/errors.dart';

import 'attendanceService.dart';

class AllStaffAttendancePage extends StatefulWidget {
  const AllStaffAttendancePage({super.key});

  @override
  State<AllStaffAttendancePage> createState() => _AllStaffAttendancePageState();
}

class _AllStaffAttendancePageState extends State<AllStaffAttendancePage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late DateTime selectedDate;
  DateTime selectedDateForDaily = DateTime.now(); // 日付ごとタブ用
  String? selectedStaffId;
  List<String> staffNames = [];
  bool isLoading = false;
  /// ATT-09: 読込失敗（空一覧と区別）
  String? _attendanceLoadError;
  List<Map<String, dynamic>> attendances = [];
  List<Map<String, dynamic>> shifts = [];
  dynamic payrollData = []; // 給与データを追加
  Map<String, dynamic>? summaryData;
  Set<String> _retiredStaffIds = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    // 今日の日付から給与計算期間の開始日を計算して初期化
    selectedDate = _calculatePayrollPeriodStart(DateTime.now());
    print('=== initState 開始 ===');
    print('今日の日付: ${DateTime.now()}');
    print('計算後のselectedDate: $selectedDate');
    print('selectedDate.month: ${selectedDate.month}');
    print('selectedDate.year: ${selectedDate.year}');
    _loadRetiredStaffIds();
    _loadAttendanceData();
  }

  Future<void> _loadRetiredStaffIds() async {
    final ids = await StaffRetiredUi.fetchRetiredStaffIds();
    if (mounted) {
      setState(() {
        _retiredStaffIds = ids;
      });
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadAttendanceData() async {
    print('=== _loadAttendanceData 開始 ===');
    print('selectedDate: $selectedDate');
    
      setState(() {
      isLoading = true;
      _attendanceLoadError = null;
    });

    try {
      // 勤怠データと給与データを並行取得
      // 給与計算期間は storeConfig.payroll.startDay / endDay に基づく
      final payrollMonth = selectedDate.month + 1;
      final payrollYear = payrollMonth > 12 ? selectedDate.year + 1 : selectedDate.year;
      final adjustedPayrollMonth = payrollMonth > 12 ? 1 : payrollMonth;
      
      print('給与データ取得パラメータ: month=$adjustedPayrollMonth, year=$payrollYear');
      
      // 勤怠データと給与データを個別に取得
      Map<String, dynamic>? result;
      String? attendanceLoadError;
      try {
        print('勤怠データ取得開始: month=${selectedDate.month}, year=${selectedDate.year}');
        result = await AttendanceService.getAllStaffAttendance(
          month: selectedDate.month,
          year: selectedDate.year,
          startDay: StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay,
          endDay: StoreConfigService.instance.latestData?.payrollEndDay ?? kDefaultPayrollEndDay,
        );
        print('勤怠データ取得成功: ${result['attendances']?.length ?? 0}件');
        if (!isCallableSuccessResponse(result)) {
          // ATT-09: soft-fail は空一覧に落とさない
          attendanceLoadError = mapAttendanceCallableSoftFail(
            result,
            operation: 'getAllStaffAttendance',
          );
          result = null;
        }
      } catch (e) {
        // ATT-09: 失敗と空一覧を区別。raw は出さない。
        attendanceLoadError = mapAttendanceCallableError(
          e,
          operation: 'getAllStaffAttendance',
        );
        result = null;
      }
      
      List<dynamic> payrollResult = [];
      String? payrollLoadError;
      try {
        final payrollData = await AttendanceService.getPayrollData(
          month: adjustedPayrollMonth,
          year: payrollYear,
          startDay: StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay,
          endDay: StoreConfigService.instance.latestData?.payrollEndDay ?? kDefaultPayrollEndDay,
        );

        payrollResult = payrollData;
      } catch (e) {
        payrollLoadError = mapAttendanceCallableError(
          e,
          operation: 'getPayrollData',
        );
        payrollResult = [];
      }

      if (attendanceLoadError != null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(attendanceLoadError)),
          );
          setState(() {
            _attendanceLoadError = attendanceLoadError;
            // 失敗を空一覧として扱わない（前回成功分は残す）
            summaryData = null;
          });
        }
        return;
      }

      print('result["success"]: ${result!['success']}');
      
      if (isCallableSuccessResponse(result)) {
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
                    'closedStoreWithoutClockOut': item['closedStoreWithoutClockOut'] == true,
                    'isDeleted': item['isDeleted'] == true,
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
          _attendanceLoadError = null;
          _updateSummaryData();
          _updateStaffNames();
        });

        if (payrollLoadError != null && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(payrollLoadError)),
          );
        }
        
        print('=== setState 後 ===');
        print('attendances.length: ${attendances.length}');
        print('shifts.length: ${shifts.length}');
        print('payrollData.length: ${payrollData.length}');
      }
    } catch (e) {
      if (!mounted) return;
      final msg = mapAttendanceCallableError(e, operation: 'getAllStaffAttendance');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg)),
      );
      setState(() {
        _attendanceLoadError = msg;
      });
    } finally {
      if (mounted) {
        setState(() {
          isLoading = false;
        });
      }
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

  void _goToPreviousPeriod() {
    final startDay = StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay;
    setState(() {
      selectedDate = DateTime(selectedDate.year, selectedDate.month - 1, startDay);
    });
    _loadAttendanceData();
  }

  void _goToNextPeriod() {
    final startDay = StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay;
    final nextStart = DateTime(selectedDate.year, selectedDate.month + 1, startDay);
    // 未来の期間には進めない
    if (nextStart.isAfter(DateTime.now())) return;
    setState(() {
      selectedDate = nextStart;
    });
    _loadAttendanceData();
  }

  bool get _canGoToNextPeriod {
    final startDay = StoreConfigService.instance.latestData?.payrollStartDay ?? kDefaultPayrollStartDay;
    final nextStart = DateTime(selectedDate.year, selectedDate.month + 1, startDay);
    return !nextStart.isAfter(DateTime.now());
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
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('給与計算期間設定'),
          content: Text(
            '現在の設定:\n'
            '開始日: ${startDay}日\n'
            '終了日: ${endDay}日',
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

  // スタッフごとの集計データを計算（未退勤は集計から除外）
  Map<String, Map<String, dynamic>> _calculateStaffSummary() {
    final staffSummary = <String, Map<String, dynamic>>{};
    
    for (final attendance in attendances) {
      final staffName = attendance['staffName'] as String? ?? '不明';
      final closedStoreWithoutClockOut = attendance['closedStoreWithoutClockOut'] == true;
      final isDeleted = attendance['isDeleted'] == true;
      final isNoClockOut = closedStoreWithoutClockOut && !isDeleted;
      
      if (!staffSummary.containsKey(staffName)) {
        staffSummary[staffName] = {
          'totalWorkHours': 0.0,
          'totalNightHours': 0.0,
          'totalDays': 0,
          'staffId': attendance['staffId'] ?? '',
          'hasNoClockOut': false,
        };
      }
      
      final summary = staffSummary[staffName]!;
      if (isNoClockOut) {
        summary['hasNoClockOut'] = true;
      } else {
        summary['totalWorkHours'] = (summary['totalWorkHours'] as double) + (attendance['totalWorkHours'] ?? 0.0);
        summary['totalNightHours'] = (summary['totalNightHours'] as double) + (attendance['nightTimeHours'] ?? 0.0);
        summary['totalDays'] = (summary['totalDays'] as int) + 1;
      }
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
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: '日付ごと'),
            Tab(text: '給与期間ごと'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _DateByDateTab(
            selectedDate: selectedDateForDaily,
            onDateChanged: (dt) {
              setState(() => selectedDateForDaily = dt);
            },
          ),
          _PayrollPeriodTab(
            selectedStaffId: selectedStaffId,
            staffNames: staffNames,
            onPreviousPeriod: _goToPreviousPeriod,
            onNextPeriod: _goToNextPeriod,
            canGoToNextPeriod: _canGoToNextPeriod,
            onStaffChanged: (v) => setState(() => selectedStaffId = v),
            getPayrollPeriodText: _getPayrollPeriodText,
            showPeriodSettings: _showPeriodSettings,
            attendanceList: isLoading
                ? const Center(child: CircularProgressIndicator())
                : _buildAttendanceList(),
          ),
        ],
      ),
    );
  }

  Widget _buildAttendanceList() {
    if (_attendanceLoadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                _attendanceLoadError!,
                style: const TextStyle(fontSize: 16, color: Colors.red),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => _loadAttendanceData(),
                icon: const Icon(Icons.refresh),
                label: const Text('再取得'),
              ),
            ],
          ),
        ),
      );
    }
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
        final hasNoClockOut = summary['hasNoClockOut'] as bool? ?? false;

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
            title: Row(
              children: [
                Expanded(
                  child: StaffRetiredUi.nameWithRetiredBadge(
                    name: staffName,
                    isRetired: _retiredStaffIds.contains(staffId),
                    nameStyle: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                if (hasNoClockOut) ...[
                  const SizedBox(width: 8.0),
                  const Text(
                    '[警告：対象期間の未退勤データがあります]',
                    style: TextStyle(
                      fontSize: 12.0,
                      color: Colors.red,
                      fontWeight: FontWeight.normal,
                    ),
                  ),
                ],
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8.0),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.access_time, size: 16, color: Colors.blue),
                    const SizedBox(width: 8.0),
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(fontSize: 16.0, color: Colors.black),
                          children: [
                            TextSpan(text: '勤務時間合計: ${totalWorkHours.toStringAsFixed(1)}時間（うち'),
                            const WidgetSpan(
                              alignment: PlaceholderAlignment.middle,
                              child: Padding(
                                padding: EdgeInsets.symmetric(horizontal: 4.0),
                                child: Icon(Icons.nightlight, size: 14, color: Colors.purple),
                              ),
                            ),
                            TextSpan(text: '深夜時間合計${totalNightHours.toStringAsFixed(1)}時間）'),
                          ],
                        ),
                      ),
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
                      isRetired: _retiredStaffIds.contains(staffId),
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

/// 日付ごとタブ: 選択した日付の勤怠一覧を表示（休憩・退勤処理なし）
class _DateByDateTab extends StatelessWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateChanged;

  const _DateByDateTab({
    required this.selectedDate,
    required this.onDateChanged,
  });

  String _toDateKey(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  String _formatDateDisplay(DateTime dt) {
    const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
    final w = weekdays[dt.weekday - 1];
    return '${dt.year}年${dt.month}月${dt.day}日($w)';
  }

  void _goToPreviousDay() {
    onDateChanged(selectedDate.subtract(const Duration(days: 1)));
  }

  void _goToNextDay() {
    final next = selectedDate.add(const Duration(days: 1));
    if (!next.isAfter(DateTime.now())) {
      onDateChanged(next);
    }
  }

  bool get _canGoToNextDay {
    final next = selectedDate.add(const Duration(days: 1));
    return !next.isAfter(DateTime.now());
  }

  Future<void> _pickDate(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDate,
      firstDate: DateTime(2020, 1, 1),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      onDateChanged(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateKey = _toDateKey(selectedDate);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 日付選択
        Container(
          padding: const EdgeInsets.all(16.0),
          color: Colors.grey[100],
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(12.0),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey),
                  borderRadius: BorderRadius.circular(8.0),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.chevron_left),
                      onPressed: _goToPreviousDay,
                      tooltip: '前の日',
                    ),
                    GestureDetector(
                      onTap: () => _pickDate(context),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16.0),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _formatDateDisplay(selectedDate),
                              style: const TextStyle(
                                fontSize: 16.0,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(width: 8.0),
                            Icon(Icons.calendar_today, size: 18, color: Colors.grey[600]),
                          ],
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.chevron_right),
                      onPressed: _canGoToNextDay ? _goToNextDay : null,
                      tooltip: '次の日',
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12.0),
        // 勤怠一覧（StreamBuilder）
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: FirebaseFirestore.instance
                .collection('attendances')
                .where('date', isEqualTo: dateKey)
                .snapshots(),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Center(
                  child: Text(
                    kAttendanceDataLoadFailedMessage,
                    style: const TextStyle(color: Colors.red),
                  ),
                );
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              var docs = snapshot.data!.docs;
              docs = docs.where((d) => d.data()['isDeleted'] != true).toList();
              docs = List.from(docs)
                ..sort((a, b) {
                  final dA = a.data();
                  final dB = b.data();
                  final cA = dA['clockIn'];
                  final cB = dB['clockIn'];
                  if (cA is Timestamp && cB is Timestamp) {
                    return cB.compareTo(cA);
                  }
                  return 0;
                });

              if (docs.isEmpty) {
                return const Center(
                  child: Text(
                    '該当日の勤怠記録がありません',
                    style: TextStyle(fontSize: 16.0, color: Colors.grey),
                  ),
                );
              }

              return _DailyAttendanceTable(docs: docs);
            },
          ),
        ),
      ],
    );
  }
}

/// 日付ごとの勤怠テーブル（休憩処理・退勤処理カラムなし）
class _DailyAttendanceTable extends StatelessWidget {
  final List<QueryDocumentSnapshot<Map<String, dynamic>>> docs;

  const _DailyAttendanceTable({required this.docs});

  static const _bodyFontSize = 12.0;
  static final _borderColor = Colors.grey.shade400;

  String _formatTimestamp(dynamic t) {
    if (t == null) return '—';
    if (t is Timestamp) {
      final dt = t.toDate();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    return '—';
  }

  List<double> _computeColumnWidths(double availableWidth) {
    const horizontalPadding = 32.0;
    final w = (availableWidth - horizontalPadding).clamp(400.0, double.infinity);
    const weights = [18.0, 10.0, 8.0, 10.0, 10.0, 10.0, 16.0];
    const total = 82.0;
    return weights.map((v) => (v / total) * w).toList();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxW = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.of(context).size.width;
        final widths = _computeColumnWidths(maxW);
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.blue[100],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '勤怠データ',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.blue[900],
                    fontSize: 14,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Table(
                columnWidths: {
                  for (var i = 0; i < widths.length; i++) i: FixedColumnWidth(widths[i]),
                },
                border: TableBorder.all(color: _borderColor),
                defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                children: [
                  TableRow(
                    decoration: BoxDecoration(color: Colors.grey.shade300),
                    children: [
                      _headerCell('氏名', widths[0]),
                      _headerCell('勤務状況', widths[1]),
                      _headerCell('営業日', widths[2]),
                      _headerCell('出勤', widths[3]),
                      _headerCell('退勤', widths[4]),
                      _headerCell('休憩時間(分)', widths[5]),
                      _headerCell('実働時間（うち深夜時間）', widths[6]),
                    ],
                  ),
                  ...docs.map((doc) => _buildTableRow(context, doc, widths)),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _headerCell(String label, double w) {
    return SizedBox(
      width: w,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        child: Text(
          label,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: _bodyFontSize,
          ),
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }

  TableRow _buildTableRow(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
    List<double> widths,
  ) {
    final d = doc.data();
    final clockOut = d['clockOut'];
    final isOnBreak = d['isOnBreak'] == true;
    final isWorking = clockOut == null;
    final statusColor = isOnBreak
        ? Colors.orange[100]!
        : (isWorking ? Colors.red[100]! : Colors.green[100]!);
    final statusText = isOnBreak ? '休憩中' : (isWorking ? '勤務中' : '退勤済み');
    final workMinutes = (d['actualWorkMinutes'] ?? d['totalMinutes'] ?? 0) is num
        ? ((d['actualWorkMinutes'] ?? d['totalMinutes'] ?? 0) as num).toInt()
        : 0;
    final nightMinutes = (d['nightWorkMinutes'] ?? d['nightMinutes'] ?? 0) is num
        ? ((d['nightWorkMinutes'] ?? d['nightMinutes'] ?? 0) as num).toInt()
        : 0;
    final workTimeText = '$workMinutes分（うち深夜:${nightMinutes}分）';

    return TableRow(
      children: [
        _dataCell(d['staffsFullName']?.toString() ?? '—', widths[0]),
        _dataCellWithBg(statusText, widths[1], statusColor),
        _dataCell(d['date']?.toString() ?? '—', widths[2]),
        _dataCell(_formatTimestamp(d['clockIn']), widths[3]),
        _dataCellWithBg(
          _formatTimestamp(clockOut),
          widths[4],
          isWorking ? Colors.red[100]! : Colors.green[100]!,
        ),
        _breakMinutesDetailCell(context, doc, widths[5]),
        _dataCell(workTimeText, widths[6]),
      ],
    );
  }

  Widget _breakMinutesDetailCell(
    BuildContext context,
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
    double w,
  ) {
    final d = doc.data();
    final breakMinutes = (d['breakMinutes'] is num) ? (d['breakMinutes'] as num).toInt() : 0;

    return SizedBox(
      width: w,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              breakMinutes.toString(),
              style: const TextStyle(fontSize: _bodyFontSize),
            ),
            ElevatedButton(
              onPressed: () => _showBreakDetailDialog(context, doc),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.grey[200],
                foregroundColor: Colors.blue,
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                minimumSize: Size.zero,
              ),
              child: const Text('詳細', style: TextStyle(fontSize: 10)),
            ),
          ],
        ),
      ),
    );
  }

  void _showBreakDetailDialog(
    BuildContext context,
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final staffName = doc.data()?['staffsFullName']?.toString() ?? '—';
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('休憩詳細 — $staffName'),
        content: SizedBox(
          width: double.maxFinite,
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: FirebaseFirestore.instance
                .collection('attendances')
                .doc(doc.id)
                .collection('breaks')
                .orderBy('startedAt', descending: false)
                .snapshots(),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Text(kAttendanceDataLoadFailedMessage, style: const TextStyle(color: Colors.red));
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              final breakDocs = snapshot.data!.docs;
              if (breakDocs.isEmpty) {
                return const Text('休憩データがありません');
              }
              return SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: breakDocs.map((breakDoc) {
                    final b = breakDoc.data();
                    final startedAt = b['startedAt'];
                    final endedAt = b['endedAt'];
                    final isDeleted = b['isDeleted'] == true;

                    String startStr = '—';
                    String endStr = '—';
                    int minutes = 0;

                    if (startedAt is Timestamp) {
                      final dt = startedAt.toDate();
                      startStr = '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
                    }
                    if (endedAt is Timestamp) {
                      final dt = endedAt.toDate();
                      endStr = '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
                      if (startedAt is Timestamp) {
                        minutes = (endedAt.toDate().difference(startedAt.toDate()).inMinutes).abs();
                      }
                    } else if (startedAt is Timestamp) {
                      endStr = '（休憩中）';
                    }

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isDeleted ? Colors.grey[200] : Colors.white,
                        border: Border.all(color: Colors.grey.shade400),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (isDeleted)
                            const Padding(
                              padding: EdgeInsets.only(bottom: 4),
                              child: Text(
                                '削除済み',
                                style: TextStyle(
                                  color: Colors.red,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          Text('開始: $startStr  終了: $endStr', style: const TextStyle(fontSize: 13)),
                          Text('休憩時間: ${minutes}分', style: const TextStyle(fontSize: 13)),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  Widget _dataCell(String text, double w) {
    return SizedBox(
      width: w,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Text(
          text,
          style: const TextStyle(fontSize: _bodyFontSize),
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
        ),
      ),
    );
  }

  Widget _dataCellWithBg(String text, double w, Color bg) {
    return Container(
      width: w,
      color: bg,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      child: Text(
        text,
        style: const TextStyle(fontSize: _bodyFontSize),
        overflow: TextOverflow.ellipsis,
        maxLines: 1,
      ),
    );
  }
}

/// 給与期間ごとタブ: 既存の給与期間別スタッフ集計表示
class _PayrollPeriodTab extends StatelessWidget {
  final String? selectedStaffId;
  final List<String> staffNames;
  final VoidCallback onPreviousPeriod;
  final VoidCallback onNextPeriod;
  final bool canGoToNextPeriod;
  final ValueChanged<String?> onStaffChanged;
  final String Function() getPayrollPeriodText;
  final void Function(BuildContext) showPeriodSettings;
  final Widget attendanceList;

  const _PayrollPeriodTab({
    required this.selectedStaffId,
    required this.staffNames,
    required this.onPreviousPeriod,
    required this.onNextPeriod,
    required this.canGoToNextPeriod,
    required this.onStaffChanged,
    required this.getPayrollPeriodText,
    required this.showPeriodSettings,
    required this.attendanceList,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16.0),
          color: Colors.grey[100],
          child: Column(
            children: [
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
                      '給与計算期間: ${getPayrollPeriodText()}',
                      style: const TextStyle(
                        fontSize: 16.0,
                        fontWeight: FontWeight.bold,
                        color: Colors.blue,
                      ),
                    ),
                    const SizedBox(width: 8.0),
                    IconButton(
                      icon: const Icon(Icons.settings, color: Colors.blue),
                      onPressed: () => showPeriodSettings(context),
                      tooltip: '期間設定',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12.0),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(12.0),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey),
                        borderRadius: BorderRadius.circular(8.0),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.chevron_left),
                            onPressed: onPreviousPeriod,
                            tooltip: '前の期間',
                          ),
                          Expanded(
                            child: Text(
                              getPayrollPeriodText(),
                              style: const TextStyle(
                                fontSize: 16.0,
                                fontWeight: FontWeight.bold,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.chevron_right),
                            onPressed: canGoToNextPeriod ? onNextPeriod : null,
                            tooltip: '次の期間',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 16.0),
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
                      onChanged: onStaffChanged,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12.0),
        Expanded(child: attendanceList),
      ],
    );
  }
}
