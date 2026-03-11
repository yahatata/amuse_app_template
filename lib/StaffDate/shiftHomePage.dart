import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:holiday_jp/holiday_jp.dart' as holiday_jp;
import 'shiftDateDialog.dart';
import 'shiftDraftPage.dart';
import 'shift_repository.dart';
import '../Utils/time_converter.dart';
import '../services/required_staff_by_time_slot_service.dart';
import '../services/store_config_defaults.dart';
import '../services/store_config_service.dart';

/// シフト確定用ホーム画面（カレンダー表示）
class ShiftHomePage extends StatefulWidget {
  const ShiftHomePage({super.key});

  @override
  State<ShiftHomePage> createState() => _ShiftHomePageState();
}

class _ShiftHomePageState extends State<ShiftHomePage> with SingleTickerProviderStateMixin {
  late DateTime _currentMonth;
  DateTime? _selectedDate;
  late TabController _tabController;
  
  // 各タブ用のScrollController
  late ScrollController _infoTabScrollController;
  late ScrollController _insufficientDaysTabScrollController;
  late ScrollController _recruitmentTabScrollController;
  
  // Repository
  final ShiftRepository _repository = ShiftRepository();
  
  // シフトデータ（Firestoreから取得）
  Map<String, ShiftDayData> _shiftData = {};
  /// 日付ごとの未処理申請数（shiftRequests の pending 件数。dayDoc の pendingRequestCount と不整合時に表示を補正する）
  Map<String, int> _pendingRequestCountByDate = {};
  /// 日付ごとの未処理申請一覧（ダイアログ表示・ドラフト遷移用）
  Map<String, List<ShiftRequest>> _pendingRequestsByDate = {};
  bool _isLoading = false;
  
  // 不足日集計・募集作成用の状態
  List<String> _insufficientDays = []; // 不足日のdateKeyリスト
  Map<String, List<RecruitmentTimeSlot>> _recruitmentSlots = {}; // 募集時間帯（dateKey -> 時間帯リスト）
  bool _isCalculatingInsufficientDays = false; // 不足日集計中のローディング状態
  
  // タブの展開状態（false: 初期位置、true: 展開位置）
  bool _isTabExpanded = false;
  // スワイプ中の一時的なオフセット（スナップ判定用）
  double _dragOffset = 0.0;
  
  @override
  void initState() {
    super.initState();
    _currentMonth = DateTime(DateTime.now().year, DateTime.now().month, 1);
    _tabController = TabController(length: 3, vsync: this);
    _infoTabScrollController = ScrollController();
    _insufficientDaysTabScrollController = ScrollController();
    _recruitmentTabScrollController = ScrollController();
    _loadShiftData();
  }
  
  @override
  void dispose() {
    _tabController.dispose();
    _infoTabScrollController.dispose();
    _insufficientDaysTabScrollController.dispose();
    _recruitmentTabScrollController.dispose();
    super.dispose();
  }

  /// シフトデータをFirestoreから読み込む（Phase 1: Read接続）
  Future<void> _loadShiftData() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final now = DateTime.now();
      final currentMonth = DateTime(now.year, now.month, 1);
      final nextMonth = DateTime(now.year, now.month + 1, 1);

      final data = await _repository.getShiftDaysForMonths(currentMonth, nextMonth);

      // ドラフト内の申請件数を shiftRequests から取得（dayDoc の pendingRequestCount と不整合時も正しく表示するため）
      final currentYearMonth = DateFormat('yyyy-MM').format(currentMonth);
      final nextYearMonth = DateFormat('yyyy-MM').format(nextMonth);
      final pendingCurrent = await _repository.getPendingRequestsForMonth(currentYearMonth);
      final pendingNext = await _repository.getPendingRequestsForMonth(nextYearMonth);
      final pendingCountByDate = <String, int>{};
      final pendingRequestsByDate = <String, List<ShiftRequest>>{};
      for (final e in pendingCurrent.entries) {
        pendingCountByDate[e.key] = (pendingCountByDate[e.key] ?? 0) + e.value.length;
        pendingRequestsByDate[e.key] = e.value;
      }
      for (final e in pendingNext.entries) {
        pendingCountByDate[e.key] = (pendingCountByDate[e.key] ?? 0) + e.value.length;
        pendingRequestsByDate[e.key] = e.value; // 重複日は上書き（月が違うので通常はなし）
      }

      setState(() {
        _shiftData = data;
        _pendingRequestCountByDate = pendingCountByDate;
        _pendingRequestsByDate = pendingRequestsByDate;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading shift data: $e');
      setState(() {
        _isLoading = false;
      });
      // エラー時は空のMapを設定（UIが崩れないように）
      setState(() {
        _shiftData = {};
      });
    }
  }

  /// 必要人数を取得（平日4、休日6）- 使用されなくなったが、互換性のため残す
  int _getRequiredCount(DateTime date) {
    // 簡易実装（実際はholidays_japanで判定）
    final weekday = date.weekday;
    if (weekday == DateTime.saturday || weekday == DateTime.sunday) {
      return 6;
    }
    return 4;
  }

  /// 対象月の前月を計算
  DateTime _getPreviousMonth(DateTime targetMonth) {
    if (targetMonth.month == 1) {
      return DateTime(targetMonth.year - 1, 12, 1);
    } else {
      return DateTime(targetMonth.year, targetMonth.month - 1, 1);
    }
  }

  /// ①期間（提出期間）内かどうかを判定
  /// 対象月の前月1日〜15日が①期間
  bool _isInSubmissionPeriod() {
    final now = DateTime.now();
    final targetMonth = _currentMonth;
    final prevMonth = _getPreviousMonth(targetMonth);
    
    // 現在の日付が前月の1日〜15日の間かどうかを判定
    if (now.year == prevMonth.year && now.month == prevMonth.month) {
      final startDay = StoreConfigService.instance.latestData?.shiftSubmissionStartDay ?? kDefaultShiftSubmissionStartDay;
      final endDay = StoreConfigService.instance.latestData?.shiftSubmissionEndDay ?? kDefaultShiftSubmissionEndDay;
      return now.day >= startDay && now.day <= endDay;
    }
    
    return false;
  }

  /// ②期間（シフトを組む期間）内かどうかを判定
  /// 対象月の前月16日〜22日が②期間
  bool _isInSchedulingPeriod() {
    final now = DateTime.now();
    final targetMonth = _currentMonth;
    final prevMonth = _getPreviousMonth(targetMonth);
    
    // 現在の日付が前月の16日以降かどうかを判定
    if (now.year == prevMonth.year && now.month == prevMonth.month) {
      final startDay = StoreConfigService.instance.latestData?.shiftSchedulingStartDay ?? kDefaultShiftSchedulingStartDay;
      return now.day >= startDay;
    }
    
    return false;
  }

  /// ①期間または②期間内かどうかを判定（集計・ドラフト用）
  bool _isInSubmissionOrSchedulingPeriod() {
    return _isInSubmissionPeriod() || _isInSchedulingPeriod();
  }

  String _getDateKey(DateTime date) {
    return DateFormat('yyyy-MM-dd').format(date);
  }

  /// 表示用の未処理申請数（dayDoc の pendingRequestCount と shiftRequests の実際の件数の大きい方）
  int _effectivePendingRequestCount(String dateKey, ShiftDayData? dayData) {
    final fromDay = dayData?.pendingRequestCount ?? 0;
    final fromRequests = _pendingRequestCountByDate[dateKey] ?? 0;
    return fromDay > fromRequests ? fromDay : fromRequests;
  }

  int _getDaysInMonth(DateTime date) {
    return DateTime(date.year, date.month + 1, 0).day;
  }

  int _getFirstDayOfWeek(DateTime date) {
    final firstDay = DateTime(date.year, date.month, 1);
    return firstDay.weekday % 7; // 0=日曜日
  }

  int _getRequiredWeeks(DateTime date) {
    final daysInMonth = _getDaysInMonth(date);
    final firstDayOfWeek = _getFirstDayOfWeek(date);
    final totalCells = daysInMonth + firstDayOfWeek;
    return (totalCells / 7).ceil();
  }

  void _previousMonth() {
    final now = DateTime.now();
    final currentMonth = DateTime(now.year, now.month, 1);
    // 前月への移動は、現在が次月の場合のみ可能（当月には戻れる）
    if (_currentMonth.year == currentMonth.year && _currentMonth.month == currentMonth.month) {
      return; // 既に当月の場合は前月に移動不可
    }
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1, 1);
    });
    // 月が変わったらデータを再読み込み
    _loadShiftData();
  }

  void _nextMonth() {
    final now = DateTime.now();
    final nextMonth = DateTime(now.year, now.month + 1, 1);
    // 次月への移動は、現在が当月の場合のみ可能
    if (_currentMonth.year == nextMonth.year && _currentMonth.month == nextMonth.month) {
      return; // 既に次月の場合は次月に移動不可
    }
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month + 1, 1);
    });
    // 月が変わったらデータを再読み込み
    _loadShiftData();
  }

  void _toggleSufficient(DateTime date) {
    final dateKey = _getDateKey(date);
    final dayData = _shiftData[dateKey];
    if (dayData != null) {
      setState(() {
        _shiftData[dateKey] = dayData.copyWith(
          isSufficient: !dayData.isSufficient,
        );
      });
    }
  }

  void _showDateDialog(DateTime date) {
    final dateKey = _getDateKey(date);
    final dayData = _shiftData[dateKey];
    final pendingList = _pendingRequestsByDate[dateKey] ?? [];
    final pendingRequestDisplays = pendingList
        .map((r) => {'staffName': r.staffName, 'startMinute': r.startMinute, 'endMinute': r.endMinute})
        .toList();
    
    showDialog(
      context: context,
      builder: (dialogContext) => ShiftDateDialog(
        date: date,
        dayData: dayData,
        pendingRequestDisplays: pendingRequestDisplays,
        onUpdate: (updatedData) {
          setState(() {
            _shiftData[dateKey] = updatedData;
          });
        },
        onNavigateToDraft: () {
          Navigator.pop(dialogContext);
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => ShiftDraftPage(initialDate: date),
            ),
          ).then((_) {
            if (mounted) _loadShiftData();
          });
        },
        onFinalize: () async {
          // 最終確定処理
          try {
            await _repository.finalizeDay(dateKey);
            // データを再読み込み
            await _loadShiftData();
            Navigator.pop(context);
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('この日を最終確定しました')),
              );
            }
          } catch (e) {
            Navigator.pop(context);
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('エラー: ${e.toString()}'),
                  backgroundColor: Colors.red,
                ),
              );
            }
          }
        },
      ),
    );
  }

  void _finalizeAllMonth() {
    final parentContext = context;
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('${DateFormat('yyyy年M月').format(_currentMonth)}の全シフトを最終確定'),
        content: const Text('対象月の全シフトを最終確定しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(dialogContext);
              // 一括最終確定処理
              try {
                final monthKey = DateFormat('yyyy-MM').format(_currentMonth);
                await _repository.finalizeMonth(monthKey);
                // データを再読み込み
                await _loadShiftData();
                if (parentContext.mounted) {
                  ScaffoldMessenger.of(parentContext).showSnackBar(
                    SnackBar(
                      content: Text('${DateFormat('yyyy年M月').format(_currentMonth)}の全シフトを最終確定しました'),
                    ),
                  );
                }
              } catch (e) {
                if (parentContext.mounted) {
                  ScaffoldMessenger.of(parentContext).showSnackBar(
                    SnackBar(
                      content: Text('エラー: ${e.toString()}'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            child: const Text('確定'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final appBarHeight = screenHeight * 0.06;
    final bodyHeight = screenHeight - appBarHeight;
    final requiredWeeks = _getRequiredWeeks(_currentMonth);
    
    final monthSelectorHeight = bodyHeight * 0.0638;
    final weekdayHeaderHeight = bodyHeight * 0.0532;
    final rowHeight = bodyHeight * 0.1150; // 0.1000 * 1.15（セルサイズを1.15倍）
    final rowMargin = bodyHeight * 0.0001;
    final totalRowsHeight = rowHeight * requiredWeeks + rowMargin * (requiredWeeks > 0 ? requiredWeeks - 1 : 0);

    return Scaffold(
      appBar: AppBar(
        title: const Text('シフトカレンダー'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
        actions: [
          TextButton(
            onPressed: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ShiftDraftPage()),
              );
              // シフトドラフトページから戻ってきたらデータを再読み込み
              await _loadShiftData();
            },
            child: const Text(
              'シフトドラフト',
              style: TextStyle(color: Colors.white),
            ),
          ),
          TextButton(
            onPressed: _finalizeAllMonth,
            child: const Text(
              '一括最終確定',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Stack(
              children: [
                // カレンダー部分
                Column(
                  children: [
                    // 月選択ヘッダー
                    SizedBox(
                      height: monthSelectorHeight,
                      child: _buildMonthSelector(),
                    ),
                    // 曜日ヘッダー
                    SizedBox(
                      height: weekdayHeaderHeight,
                      child: _buildWeekdayHeader(),
                    ),
                    // カレンダーグリッド
                    SizedBox(
                      height: totalRowsHeight,
                      child: _buildCalendarGrid(rowHeight, rowMargin),
                    ),
                  ],
                ),
                // タブ（次月のみ、スワイプでカレンダーの上に被る）
                Positioned(
                  left: 0,
                  right: 0,
                  top: _calculateTabTop(bodyHeight, monthSelectorHeight, weekdayHeaderHeight, totalRowsHeight),
                  bottom: 0, // 常に画面の最下部まで
                  child: _buildBottomTabs(monthSelectorHeight, weekdayHeaderHeight, totalRowsHeight),
                ),
              ],
            ),
    );
  }

  Widget _buildMonthSelector() {
    final now = DateTime.now();
    final currentMonth = DateTime(now.year, now.month, 1);
    final nextMonth = DateTime(now.year, now.month + 1, 1);
    
    // 前月ボタン：現在が次月の場合のみ有効（当月には戻れる）
    final canGoPrevious = _currentMonth.year == nextMonth.year && 
                         _currentMonth.month == nextMonth.month;
    
    // 次月ボタン：現在が当月の場合のみ有効
    final canGoNext = _currentMonth.year == currentMonth.year && 
                     _currentMonth.month == currentMonth.month;
    
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        IconButton(
          icon: const Icon(Icons.chevron_left),
          onPressed: canGoPrevious ? _previousMonth : null,
          color: canGoPrevious ? Colors.black : Colors.grey,
        ),
        Text(
          DateFormat('yyyy年M月').format(_currentMonth),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        IconButton(
          icon: const Icon(Icons.chevron_right),
          onPressed: canGoNext ? _nextMonth : null,
          color: canGoNext ? Colors.black : Colors.grey,
        ),
      ],
    );
  }

  Widget _buildWeekdayHeader() {
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return Row(
      children: weekdays.asMap().entries.map((entry) {
        final index = entry.key;
        final day = entry.value;
        // 曜日インデックス（0=日、6=土）
        final weekdayIndex = index;
        // 日曜日は常に赤、土曜日は常に青（ヘッダーでは祝日判定しない）
        final color = weekdayIndex == 0 // 日曜日
            ? Colors.red
            : weekdayIndex == 6 // 土曜日
                ? Colors.blue
                : Colors.black;
        
        return Expanded(
          child: Center(
            child: Text(
              day,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildCalendarGrid(double rowHeight, double rowMargin) {
    final daysInMonth = _getDaysInMonth(_currentMonth);
    final firstDayOfWeek = _getFirstDayOfWeek(_currentMonth);
    final requiredWeeks = _getRequiredWeeks(_currentMonth);

    return ListView.builder(
      padding: EdgeInsets.zero,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: requiredWeeks,
      itemBuilder: (context, rowIndex) {
        return Column(
          children: [
            SizedBox(
              height: rowHeight,
              child: Row(
                children: List.generate(7, (colIndex) {
                  final cellIndex = rowIndex * 7 + colIndex;
                  final dayNumber = cellIndex - firstDayOfWeek + 1;
                  
                  if (dayNumber < 1 || dayNumber > daysInMonth) {
                    return Expanded(child: Container());
                  }

                  return Expanded(
                    child: _buildDayCell(dayNumber),
                  );
                }),
              ),
            ),
            if (rowIndex < requiredWeeks - 1) SizedBox(height: rowMargin),
          ],
        );
      },
    );
  }

  Widget _buildDayCell(int dayNumber) {
    final date = DateTime(_currentMonth.year, _currentMonth.month, dayNumber);
    final dateKey = _getDateKey(date);
    final dayData = _shiftData[dateKey];
    final isToday = _getDateKey(date) == _getDateKey(DateTime.now());
    final now = DateTime.now();
    final isCurrentMonth = _currentMonth.year == now.year && _currentMonth.month == now.month;
    final nextMonth = DateTime(now.year, now.month + 1, 1);
    final isNextMonth = _currentMonth.year == nextMonth.year && _currentMonth.month == nextMonth.month;
    final isClosed = dayData?.businessHours.isClosed ?? false;
    
    // 曜日と祝日に応じた色を設定
    final isHoliday = holiday_jp.isHoliday(date);
    Color weekdayColor;
    if (date.weekday == DateTime.saturday) {
      // 土曜日: 青（祝日でない場合のみ）
      weekdayColor = isHoliday ? Colors.red : Colors.blue;
    } else if (date.weekday == DateTime.sunday || isHoliday) {
      // 日曜日または祝日: 赤
      weekdayColor = Colors.red;
    } else {
      // 平日: デフォルト色（黒）
      weekdayColor = Colors.black;
    }

    return GestureDetector(
      onTap: () => _showDateDialog(date),
      child: Container(
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: isClosed
              ? Colors.grey[300]
              : isToday
                  ? Colors.blue[50]
                  : Colors.white,
          border: Border.all(
            color: Colors.grey[300]!,
            width: 1,
          ),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Stack(
          children: [
            // 日付（中央上部）
            Positioned(
              top: 2,
              left: 0,
              right: 0,
              child: Center(
                child: Text(
                  '$dayNumber',
                  style: TextStyle(
                    fontSize: 16.1, // 14 * 1.15
                    fontWeight: FontWeight.bold,
                    color: isClosed
                        ? Colors.grey
                        : isToday
                            ? Colors.blue
                            : weekdayColor,
                  ),
                ),
              ),
            ),
            // 次月の場合のみ、必要十分フラグと状態フラグを表示（店休日は除外）
            if (isNextMonth && !isClosed) ...[
              // 必要十分フラグ（左上にチェックボックス）- カレンダー上では操作不可（ダイアログとドラフトページのみ操作可能）
              Positioned(
                top: 2,
                left: 2,
                child: dayData != null
                    ? Checkbox(
                        value: dayData.isSufficient,
                        onChanged: (_) {}, // カレンダー上では操作不可（グレーアウトしない）
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      )
                    : const SizedBox.shrink(),
              ),
              // 状態フラグ（右上に中間or未処理or最終）
              // 未処理申請数は dayDoc の pendingRequestCount と shiftRequests の実際の件数の大きい方を使用（不整合時も正しく表示）
              Positioned(
                top: 2,
                right: 2,
                child: dayData != null
                    ? Builder(
                        builder: (context) {
                          final effectivePendingCount = _effectivePendingRequestCount(dateKey, dayData);
                          return Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              dayData!.isFinalized || dayData!.isInterimConfirmed || effectivePendingCount > 0
                                  ? Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: dayData!.isFinalized
                                            ? Colors.green
                                            : dayData!.isInterimConfirmed
                                                ? Colors.blue
                                                : Colors.orange,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        dayData!.isFinalized
                                            ? '最終'
                                            : dayData!.isInterimConfirmed
                                                ? '中間'
                                                : '未処理申請${effectivePendingCount}件',
                                        style: const TextStyle(
                                          fontSize: 8,
                                          color: Colors.white,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    )
                                  : Text(
                                      '申請なし',
                                      style: const TextStyle(
                                        fontSize: 8,
                                        color: Colors.black,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                              // 未処理申請数表示（中間確定済みで未処理申請がある場合のみ表示）
                              if (dayData!.isInterimConfirmed && effectivePendingCount > 0)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    '未処理申請：${effectivePendingCount}件',
                                    style: const TextStyle(
                                      fontSize: 9.1, // 7 * 1.3
                                      color: Colors.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                            ],
                          );
                        },
                      )
                    : const SizedBox.shrink(),
              ),
            ],
            // 店休日表示のみ（シフト情報はダイアログで確認）
            if (isClosed)
              Positioned(
                bottom: 2,
                left: 2,
                right: 2,
                child: const Text(
                  '店休日',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.grey,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            // 空き時間帯またはスタッフ不足時間帯の警告表示（右下）
            if (dayData != null && !dayData.businessHours.isClosed && dayData.assignments.isNotEmpty)
              Positioned(
                bottom: 2,
                right: 2,
                child: (_findGapTimeSlots(dayData).isNotEmpty || _findInsufficientTimeSlots(dayData).isNotEmpty)
                    ? Container(
                        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: const Icon(
                          Icons.warning,
                          color: Colors.white,
                          size: 12,
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildTodayShiftInfo() {
    final today = DateTime.now();
    final todayKey = _getDateKey(today);
    final todayData = _shiftData[todayKey];
    
    if (todayData == null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: const Text(
          '本日のシフト情報はありません',
          style: TextStyle(fontSize: 14, color: Colors.grey),
        ),
      );
    }

    // 曜日色（カレンダーと同様：日曜・祝日=赤、土曜=青、平日=黒）
    final isHoliday = holiday_jp.isHoliday(today);
    final weekdayColor = today.weekday == DateTime.saturday
        ? (isHoliday ? Colors.red : Colors.blue)
        : (today.weekday == DateTime.sunday || isHoliday ? Colors.red : Colors.black);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              RichText(
                text: TextSpan(
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.black,
                  ),
                  children: [
                    TextSpan(text: DateFormat('M月d日', 'ja').format(today)),
                    TextSpan(
                      text: '(${DateFormat('E', 'ja').format(today)})',
                      style: TextStyle(color: weekdayColor),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '営業時間: ${formatMinutes(todayData.businessHours.openMinute)} - ${formatMinutes(todayData.businessHours.closeMinute)}',
                style: const TextStyle(fontSize: 18),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (todayData.assignments.isEmpty)
            const Text(
              'シフトがありません',
              style: TextStyle(fontSize: 16, color: Colors.grey),
            )
          else
            ...todayData.assignments.map((assignment) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Text(
                      assignment.staffName,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${formatMinutes(assignment.startMinute)} - ${formatMinutes(assignment.endMinute)}',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              );
            }).toList(),
        ],
      ),
    );
  }

  /// タブのtop位置を計算（Stackの上端からの距離）
  double _calculateTabTop(double bodyHeight, double monthSelectorHeight, double weekdayHeaderHeight, double totalRowsHeight) {
    // カレンダーの下端位置は、Stackの上端から見て monthSelectorHeight + weekdayHeaderHeight + totalRowsHeight
    final calendarBottom = monthSelectorHeight + weekdayHeaderHeight + totalRowsHeight;
    const initialMargin = 8.0; // 初期状態でのカレンダーとの間隔（ピクセル）
    
    // 位置1（初期）: calendarBottom + initialMargin（カレンダーの下端から8ピクセル下）
    // 位置2（展開）: 0（カレンダー上端とタブ上端が重なる）
    final position1 = calendarBottom + initialMargin;
    final position2 = 0.0;
    
    // 現在の状態に応じた基準位置
    final basePosition = _isTabExpanded ? position2 : position1;
    
    // スワイプ中は一時的なオフセットを適用
    // 指の動きと同じ方向にタブが動くように、常にbasePosition - _dragOffsetとする
    // 上にスワイプ（delta.dy < 0）: _dragOffset増加 → top位置減少（上に移動）
    // 下にスワイプ（delta.dy > 0）: _dragOffset減少 → top位置増加（下に移動）
    return basePosition - _dragOffset;
  }

  Widget _buildBottomTabs(double monthSelectorHeight, double weekdayHeaderHeight, double totalRowsHeight) {
    final now = DateTime.now();
    final isNextMonth = _currentMonth.year == now.year && _currentMonth.month == now.month + 1;
    
    final calendarBottom = monthSelectorHeight + weekdayHeaderHeight + totalRowsHeight;
    const initialMargin = 8.0;
    final position1 = calendarBottom + initialMargin;
    
    return GestureDetector(
      onVerticalDragUpdate: (details) {
        setState(() {
          // スワイプ中は一時的なオフセットを更新
          // 上にスワイプ（delta.dy < 0）: _dragOffsetを増加（正の値）
          // 下にスワイプ（delta.dy > 0）: _dragOffsetを減少（負の値になることを許可）
          // _dragOffsetの範囲を-position1からposition1まで許可することで、どちらの状態からでも指の動きに合わせてタブが動く
          _dragOffset = (_dragOffset - details.delta.dy).clamp(-position1, position1);
        });
      },
      onVerticalDragEnd: (details) {
        setState(() {
          // スワイプ終了時の判定
          // スワイプの方向と速度から判定
          final velocity = details.velocity.pixelsPerSecond.dy;
          final threshold = position1 * 0.3; // 閾値は位置1の30%
          
          if (_isTabExpanded) {
            // 展開状態の場合：下にスワイプ（velocity > 0）または閾値を超えたら縮小
            // _dragOffsetは負の値になるので、絶対値で判定
            if (velocity > 500 || _dragOffset.abs() > threshold) {
              _isTabExpanded = false;
            }
          } else {
            // 縮小状態の場合：上にスワイプ（velocity < 0）または閾値を超えたら展開
            // _dragOffsetは正の値なので、そのまま判定
            if (velocity < -500 || _dragOffset > threshold) {
              _isTabExpanded = true;
            }
          }
          
          // ドラッグオフセットをリセット
          _dragOffset = 0.0;
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(20),
            topRight: Radius.circular(20),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.2),
              blurRadius: 10,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: Column(
          children: [
            // ドラッグハンドル
            Container(
              margin: const EdgeInsets.only(top: 8, bottom: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // 来月: 3タブ / 今月: 当日シフト情報のみ
            if (isNextMonth) ...[
              TabBar(
                controller: _tabController,
                tabs: const [
                  Tab(text: '情報'),
                  Tab(text: '不足日集計'),
                  Tab(text: '募集作成'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildInfoTab(),
                    _buildInsufficientDaysTab(),
                    _buildRecruitmentTab(),
                  ],
                ),
              ),
            ] else ...[
              // 今月: 当日のシフト情報のみ表示
              Expanded(
                child: SingleChildScrollView(
                  child: _buildTodayShiftInfo(),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// 情報タブ（既存の_buildBottomInfoの内容）
  Widget _buildInfoTab() {
    final now = DateTime.now();
    final isCurrentMonth = _currentMonth.year == now.year && _currentMonth.month == now.month;
    
    return CustomScrollView(
      slivers: [
        // 期間説明
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue[200]!),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'シフト管理フロー期間',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildPeriodItem(
                    '①提出期間',
                    '前月${StoreConfigService.instance.latestData?.shiftSubmissionStartDay ?? kDefaultShiftSubmissionStartDay}日〜${StoreConfigService.instance.latestData?.shiftSubmissionEndDay ?? kDefaultShiftSubmissionEndDay}日',
                    'スタッフは無制限でシフトの提出および修正が可能',
                    Colors.green,
                  ),
                  const SizedBox(height: 8),
                  _buildPeriodItem(
                    '②組む期間（不足日再提出期間を含む、管理者の裁量で最終確定可能）',
                    '前月${StoreConfigService.instance.latestData?.shiftSchedulingStartDay ?? kDefaultShiftSchedulingStartDay}日〜',
                    '管理者が提出されたものからシフトを組む。スタッフは提出したシフトのみ確認可能で提出や修正は行えない。管理者が不足日・不足時間を送信したタイミングで、不足日・不足時間のみ提出および修正が可能になる。16日以降は管理者の裁量で最終確定可能（全日を最終確定すると、スタッフにシフト確定したものとして送付可能）',
                    Colors.orange,
                  ),
                ],
              ),
            ),
          ),
        ),
        // 既存の内容
        if (isCurrentMonth)
          SliverToBoxAdapter(
            child: _buildTodayShiftInfo(),
          )
        else
          SliverToBoxAdapter(
            child: _buildStaffTotalHours(),
          ),
      ],
    );
  }

  /// 期間項目を表示するヘルパー
  Widget _buildPeriodItem(String title, String period, String description, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.only(left: 20),
          child: Text(
            period,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Colors.black87,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.only(left: 20),
          child: Text(
            description,
            style: const TextStyle(
              fontSize: 13,
              color: Colors.black54,
            ),
          ),
        ),
      ],
    );
  }

  /// 集計条件の項目を表示するヘルパー
  Widget _buildConditionItem(String text, Color color) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          text,
          style: TextStyle(
            fontSize: 13,
            color: color,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  /// 不足日集計タブ
  Widget _buildInsufficientDaysTab() {
    final now = DateTime.now();
    final isNextMonth = _currentMonth.year == now.year && _currentMonth.month == now.month + 1;
    final isInAllowedPeriod = _isInSubmissionOrSchedulingPeriod();
    
    return Scrollbar(
      controller: _insufficientDaysTabScrollController,
      thumbVisibility: true,
      child: CustomScrollView(
        controller: _insufficientDaysTabScrollController,
        slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              '不足日集計',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
        if (!isNextMonth)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                '次月のシフトを表示してください',
                style: TextStyle(fontSize: 14, color: Colors.grey),
              ),
            ),
          )
        else if (_insufficientDays.isEmpty)
          SliverToBoxAdapter(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // ローディング表示または「不足日を集計」ボタン
                if (_isCalculatingInsufficientDays)
                  const Padding(
                    padding: EdgeInsets.all(32.0),
                    child: Column(
                      children: [
                        CircularProgressIndicator(),
                        SizedBox(height: 16),
                        Text('不足日を集計中...'),
                      ],
                    ),
                  )
                else
                  Padding(
                    padding: const EdgeInsets.only( left: 16, right: 16),
                    child: ElevatedButton(
                      onPressed: _calculateInsufficientDays,
                      child: const Text('不足日を集計'),
                    ),
                  ),
                // 集計条件の説明
                Padding(
                  padding: const EdgeInsets.only(left: 16, right: 16),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.blue[50],
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.blue[200]!),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          '不足日集計条件',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.blue,
                          ),
                        ),
                        const SizedBox(height: 8),
                        _buildConditionItem('必要十分フラグがOFF', Colors.orange),
                        const SizedBox(height: 8),
                        const Text(
                          '必要十分フラグがOFFの日が不足日として抽出されます（最終確定済みは除外）。',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          )
        else
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue[200]!),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '不足日集計条件',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: Colors.blue,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _buildConditionItem('必要十分フラグがOFF', Colors.orange),
                    const SizedBox(height: 8),
                    const Text(
                      '必要十分フラグがOFFの日が不足日として抽出されます（最終確定済みは除外）。',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '集計結果: ${_insufficientDays.length}件',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.blue,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.only(top: 8),
            sliver: SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final dateKey = _insufficientDays[index];
                    final dayData = _shiftData[dateKey];
                    if (dayData == null) return const SizedBox.shrink();
                    
                    final gapSlots = _findGapTimeSlots(dayData);
                    final insufficientSlots = _findInsufficientTimeSlots(dayData);
                    final hasInsufficientSlots = gapSlots.isNotEmpty || insufficientSlots.isNotEmpty;
                    final isInsufficient = !dayData.isSufficient;
                    
                    // スタッフ不足時間帯の表示用リスト（空き時間帯と設定された時間帯の不足を統合）
                    final allInsufficientSlots = <String>[];
                    // 空き時間帯を追加
                    allInsufficientSlots.addAll(gapSlots.map((g) => '${formatMinutes(g.start)} - ${formatMinutes(g.end)}（現在0人）'));
                    // 設定された時間帯での不足を追加
                    allInsufficientSlots.addAll(insufficientSlots.map((s) => '${formatMinutes(s.start)} - ${formatMinutes(s.end)}（必要${s.required}人/現在${s.current}人）'));
                    
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(
                          DateFormat('M月d日(E)', 'ja_JP').format(dayData.date),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (isInsufficient)
                              const Text(
                                '必要十分フラグ: OFF',
                                style: TextStyle(color: Colors.orange),
                              ),
                            if (hasInsufficientSlots)
                              Text(
                                'スタッフ不足時間帯: ${allInsufficientSlots.join(', ')}',
                                style: const TextStyle(color: Colors.red),
                              ),
                          ],
                        ),
                        trailing: Checkbox(
                          value: _recruitmentSlots.containsKey(dateKey),
                          onChanged: _isInSchedulingPeriod() ? (value) {
                            setState(() {
                              if (value == true) {
                                // チェックをONにした際に、営業時間全体のスライダーを1つ追加
                                _recruitmentSlots[dateKey] = [
                                  RecruitmentTimeSlot(
                                    startMinute: dayData.businessHours.openMinute,
                                    endMinute: dayData.businessHours.closeMinute,
                                  ),
                                ];
                              } else {
                                _recruitmentSlots.remove(dateKey);
                              }
                            });
                          } : null,
                        ),
                      ),
                    );
                  },
                  childCount: _insufficientDays.length,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 募集作成タブ
  Widget _buildRecruitmentTab() {
    final selectedDays = _recruitmentSlots.keys.toList();
    final now = DateTime.now();
    final isNextMonth = _currentMonth.year == now.year && _currentMonth.month == now.month + 1;
    final isInSchedulingPeriod = _isInSchedulingPeriod();
    
    return Scrollbar(
      controller: _recruitmentTabScrollController,
      thumbVisibility: true,
      child: CustomScrollView(
        controller: _recruitmentTabScrollController,
        slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '募集作成',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '不足日${selectedDays.length}件選択中',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.blue[700],
                  ),
                ),
              ],
            ),
          ),
        ),
        if (!isNextMonth)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                '次月のシフトを表示してください',
                style: TextStyle(fontSize: 14, color: Colors.grey),
              ),
            ),
          )
        else if (!isInSchedulingPeriod)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange[200]!),
                ),
                child: Text(
                  '募集作成は②期間（前月${StoreConfigService.instance.latestData?.shiftSchedulingStartDay ?? kDefaultShiftSchedulingStartDay}日〜）のみ可能です。',
                  style: const TextStyle(
                    fontSize: 14,
                    color: Colors.orange,
                  ),
                ),
              ),
            ),
          )
        else if (selectedDays.isEmpty)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                '不足日集計タブで不足日を選択してください',
                style: TextStyle(fontSize: 14, color: Colors.grey),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final dateKey = selectedDays[index];
                  final dayData = _shiftData[dateKey];
                  if (dayData == null) return const SizedBox.shrink();
                  
                  final slots = _recruitmentSlots[dateKey] ?? [];
                  
                  return Card(
                    margin: const EdgeInsets.only(bottom: 16),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            DateFormat('M月d日(E)', 'ja_JP').format(dayData.date),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '営業時間: ${formatMinutes(dayData.businessHours.openMinute)} - ${formatMinutes(dayData.businessHours.closeMinute)}',
                            style: const TextStyle(fontSize: 14),
                          ),
                          const SizedBox(height: 12),
                          // シフト情報セクション
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.grey[100],
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // 必要十分フラグの状態
                                Row(
                                  children: [
                                    const Text(
                                      '必要十分フラグ: ',
                                      style: TextStyle(fontSize: 14),
                                    ),
                                    Text(
                                      dayData.isSufficient ? 'ON' : 'OFF',
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.bold,
                                        color: dayData.isSufficient ? Colors.green : Colors.orange,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                // シフト割当情報
                                if (dayData.assignments.isEmpty)
                                  const Text(
                                    'シフト割当: なし',
                                    style: TextStyle(fontSize: 14, color: Colors.grey),
                                  )
                                else
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'シフト割当:',
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      ...dayData.assignments.map((assignment) {
                                        return Padding(
                                          padding: const EdgeInsets.only(left: 8, bottom: 2),
                                          child: Text(
                                            '${assignment.staffName}: ${formatMinutes(assignment.startMinute)} - ${formatMinutes(assignment.endMinute)}',
                                            style: const TextStyle(fontSize: 13),
                                          ),
                                        );
                                      }).toList(),
                                    ],
                                  ),
                                // スタッフ不足時間帯（空き時間帯も含む）
                                Builder(
                                  builder: (context) {
                                    final gapSlots = _findGapTimeSlots(dayData);
                                    final insufficientSlots = _findInsufficientTimeSlots(dayData);
                                    final hasInsufficientSlots = gapSlots.isNotEmpty || insufficientSlots.isNotEmpty;
                                    
                                    if (hasInsufficientSlots) {
                                      return Padding(
                                        padding: const EdgeInsets.only(top: 8),
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            const Text(
                                              'スタッフ不足時間帯:',
                                              style: TextStyle(
                                                fontSize: 14,
                                                fontWeight: FontWeight.bold,
                                                color: Colors.red,
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            // 空き時間帯を表示
                                            ...gapSlots.map((gap) {
                                              return Padding(
                                                padding: const EdgeInsets.only(left: 8, bottom: 2),
                                                child: Text(
                                                  '${formatMinutes(gap.start)} - ${formatMinutes(gap.end)}（現在0人）',
                                                  style: const TextStyle(
                                                    fontSize: 13,
                                                    color: Colors.red,
                                                  ),
                                                ),
                                              );
                                            }).toList(),
                                            // 設定された時間帯での不足を表示
                                            ...insufficientSlots.map((slot) {
                                              return Padding(
                                                padding: const EdgeInsets.only(left: 8, bottom: 2),
                                                child: Text(
                                                  '${formatMinutes(slot.start)} - ${formatMinutes(slot.end)}（必要${slot.required}人/現在${slot.current}人）',
                                                  style: const TextStyle(
                                                    fontSize: 13,
                                                    color: Colors.red,
                                                  ),
                                                ),
                                              );
                                            }).toList(),
                                          ],
                                        ),
                                      );
                                    }
                                    return const SizedBox.shrink();
                                  },
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          ...slots.asMap().entries.map((entry) {
                            final slotIndex = entry.key;
                            final slot = entry.value;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: _buildRecruitmentTimeSlotSlider(
                                dateKey,
                                slotIndex,
                                slot,
                                dayData,
                              ),
                            );
                          }).toList(),
                          ElevatedButton.icon(
                            onPressed: _isInSchedulingPeriod() ? () => _addRecruitmentTimeSlot(dateKey, dayData) : null,
                            icon: const Icon(Icons.add),
                            label: const Text('時間帯を追加'),
                          ),
                        ],
                      ),
                    ),
                  );
                },
                childCount: selectedDays.length,
              ),
            ),
          ),
        // 募集を送信ボタン
        if (selectedDays.isNotEmpty && isInSchedulingPeriod)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: ElevatedButton(
                onPressed: _sendRecruitmentNotifications,
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 48),
                  backgroundColor: Colors.deepPurple,
                ),
                child: const Text(
                  '募集内容を管理者に送信',
                  style: TextStyle(fontSize: 16, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 不足日を集計
  Future<void> _calculateInsufficientDays() async {
    // ローディング開始
    setState(() {
      _isCalculatingInsufficientDays = true;
    });
    
    try {
      final now = DateTime.now();
      final nextMonth = DateTime(now.year, now.month + 1, 1);
      final monthKey = DateFormat('yyyy-MM').format(nextMonth);
      
      // Cloud Functionsで不足日を集計
      final insufficientDays = await _repository.calculateInsufficientDays(monthKey);
      
      // データを再読み込み（不足日フラグが更新されている可能性があるため）
      await _loadShiftData();
      
      setState(() {
        _insufficientDays = insufficientDays;
        _isCalculatingInsufficientDays = false;
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('不足日を${insufficientDays.length}件検出しました'),
          ),
        );
      }
    } catch (e) {
      setState(() {
        _isCalculatingInsufficientDays = false;
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('エラー: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// 募集時間帯のスライダーを構築
  Widget _buildRecruitmentTimeSlotSlider(
    String dateKey,
    int slotIndex,
    RecruitmentTimeSlot slot,
    ShiftDayData dayData,
  ) {
    final openMinutes = dayData.businessHours.openMinute;
    final closeMinutes = dayData.businessHours.closeMinute;
    final startMinutes = slot.startMinute;
    final endMinutes = slot.endMinute;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '募集時間: ${formatMinutes(slot.startMinute)} - ${formatMinutes(slot.endMinute)}',
                style: const TextStyle(
                  fontSize: 24,
                  color: Colors.black,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.delete, color: Colors.red),
              onPressed: _isInSchedulingPeriod() ? () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('募集時間帯を削除'),
                    content: Text('${formatMinutes(slot.startMinute)} - ${formatMinutes(slot.endMinute)} の募集時間帯を削除しますか？'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('キャンセル'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        style: TextButton.styleFrom(foregroundColor: Colors.red),
                        child: const Text('削除'),
                      ),
                    ],
                  ),
                );
                
                if (confirmed == true) {
                  setState(() {
                    final slots = _recruitmentSlots[dateKey] ?? [];
                    slots.removeAt(slotIndex);
                    if (slots.isEmpty) {
                      _recruitmentSlots.remove(dateKey);
                    }
                  });
                }
              } : null,
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
                  Text(
                    formatMinutes(startMinutes),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                  ),
            Expanded(
              child: RangeSlider(
                values: RangeValues(
                  startMinutes.toDouble(),
                  endMinutes.toDouble(),
                ),
                min: openMinutes.toDouble(),
                max: closeMinutes.toDouble(),
                divisions: ((closeMinutes - openMinutes) / 30).round(),
                labels: RangeLabels(
                  formatMinutes(startMinutes),
                  formatMinutes(endMinutes),
                ),
                onChanged: _isInSchedulingPeriod() ? (values) {
                  final newStart = values.start.round();
                  final newEnd = values.end.round();
                  
                  // 最小間隔を確保（30分）
                  if (newEnd - newStart >= 30) {
                    setState(() {
                      final slots = _recruitmentSlots[dateKey] ?? [];
                      slots[slotIndex] = RecruitmentTimeSlot(
                        startMinute: newStart,
                        endMinute: newEnd,
                      );
                    });
                  }
                } : null,
              ),
            ),
                  Text(
                    formatMinutes(endMinutes),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                  ),
          ],
        ),
      ],
    );
  }

  /// 募集時間帯を追加（ダイアログなしで営業時間全体のスライダーを追加）
  void _addRecruitmentTimeSlot(String dateKey, ShiftDayData dayData) {
    setState(() {
      if (!_recruitmentSlots.containsKey(dateKey)) {
        _recruitmentSlots[dateKey] = [];
      }
      // 営業時間全体のスライダーを追加
      _recruitmentSlots[dateKey]!.add(
        RecruitmentTimeSlot(
          startMinute: dayData.businessHours.openMinute,
          endMinute: dayData.businessHours.closeMinute,
        ),
      );
    });
  }

  /// 募集通知を送信
  void _sendRecruitmentNotifications() {
    // ②期間チェック
    if (!_isInSchedulingPeriod()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('募集送信は②期間（前月16日〜22日）のみ可能です'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    final daysWithSlots = _recruitmentSlots.entries
        .where((entry) => entry.value.isNotEmpty)
        .length;
    
    if (daysWithSlots == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('募集時間帯を設定してください'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('募集内容を管理者に送信'),
        content: Text('${daysWithSlots}日分の募集内容を管理者に送信しますか？\n\n送信後、スタッフは不足日・不足時間のみ申請可能になります。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                final now = DateTime.now();
                final nextMonth = DateTime(now.year, now.month + 1, 1);
                final monthKey = DateFormat('yyyy-MM').format(nextMonth);
                
                // 募集データを準備
                final items = <Map<String, dynamic>>[];
                _recruitmentSlots.forEach((dateKey, slots) {
                  // 日付ごとにtimeSlotsをまとめる
                  final timeSlots = slots.map((slot) {
                    return <String, dynamic>{
                      'startMinute': slot.startMinute,
                      'endMinute': slot.endMinute,
                    };
                  }).toList();
                  
                  items.add({
                    'dateKey': dateKey,
                    'timeSlots': timeSlots,
                  });
                });
                
                // 募集を作成
                await _repository.createRecruitments(
                  yearMonth: monthKey,
                  items: items,
                );
                
                // 募集内容を管理者に送信
                await _repository.sendRecruitmentNotification(monthKey);
                
                // 募集スロットをクリア
                setState(() {
                  _recruitmentSlots.clear();
                });
                
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('募集内容を管理者に送信しました'),
                    ),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('エラー: ${e.toString()}'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              }
            },
            child: const Text('送信'),
          ),
        ],
      ),
    );
  }

  /// 全スタッフの合計シフト時間を計算
  Map<String, int> _calculateStaffTotalHours() {
    final staffHours = <String, int>{};
    final monthKey = DateFormat('yyyy-MM').format(_currentMonth);
    
    _shiftData.forEach((dateKey, dayData) {
      if (dateKey.startsWith(monthKey)) {
        for (final assignment in dayData.assignments) {
          final startMinutes = assignment.startMinute;
          final endMinutes = assignment.endMinute;
          final hours = (endMinutes - startMinutes) / 60.0;
          
          staffHours[assignment.staffName] = 
              (staffHours[assignment.staffName] ?? 0) + hours.round();
        }
      }
    });
    
    return staffHours;
  }

  /// 全スタッフの合計申請時間を計算（実データ対応用）
  Map<String, int> _calculateStaffTotalRequestHours() {
    // TODO: 実データ実装時に、availabilityRequestsから申請時間を集計
    // 現在はモックデータなので空のMapを返す
    return <String, int>{};
  }

  Widget _buildStaffTotalHours() {
    final staffHours = _calculateStaffTotalHours();
    final staffRequestHours = _calculateStaffTotalRequestHours();
    
    // 全スタッフ名を取得（シフト時間と申請時間の両方から）
    final allStaffNames = <String>{};
    allStaffNames.addAll(staffHours.keys);
    allStaffNames.addAll(staffRequestHours.keys);
    
    final sortedStaff = allStaffNames.map((name) {
      final shiftHours = staffHours[name] ?? 0;
      final requestHours = staffRequestHours[name];
      return (name: name, shiftHours: shiftHours, requestHours: requestHours);
    }).toList()
      ..sort((a, b) => b.shiftHours.compareTo(a.shiftHours)); // シフト時間の多い順にソート

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${DateFormat('yyyy年M月').format(_currentMonth)} 全スタッフ合計時間',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          if (sortedStaff.isEmpty)
            const Text(
              'シフトがありません',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            )
          else
            ...sortedStaff.map((staff) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        staff.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        if (staff.requestHours != null)
                          Padding(
                            padding: const EdgeInsets.only(right: 16),
                            child: Text(
                              '申請: ${staff.requestHours}時間',
                              style: const TextStyle(
                                fontSize: 14,
                                color: Colors.grey,
                              ),
                            ),
                          ),
                        Text(
                          'シフト: ${staff.shiftHours}時間',
                          style: const TextStyle(
                            fontSize: 16,
                            color: Colors.deepPurple,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }).toList(),
        ],
      ),
    );
  }


  /// 営業時間内でシフトがいない時間帯を検出
  List<({int start, int end})> _findGapTimeSlots(ShiftDayData dayData) {
    if (dayData.businessHours.isClosed || dayData.assignments.isEmpty) {
      return [];
    }

    final openMinutes = dayData.businessHours.openMinute;
    final closeMinutes = dayData.businessHours.closeMinute;
    
    // 営業時間内の各30分刻みでスタッフがいるかチェック
    final coveredMinutes = <int>{};
    for (final assignment in dayData.assignments) {
      final startMinutes = assignment.startMinute;
      final endMinutes = assignment.endMinute;
      
      // 30分刻みでカバーされている時間をマーク
      for (int minute = startMinutes; minute < endMinutes; minute += 30) {
        if (minute >= openMinutes && minute < closeMinutes) {
          coveredMinutes.add(minute);
        }
      }
    }

    // カバーされていない時間帯を見つける
    final gaps = <({int start, int end})>[];
    int? gapStart;
    
    for (int minute = openMinutes; minute < closeMinutes; minute += 30) {
      if (!coveredMinutes.contains(minute)) {
        gapStart ??= minute;
      } else {
        if (gapStart != null) {
          gaps.add((start: gapStart, end: minute));
          gapStart = null;
        }
      }
    }
    
    // 最後まで空き時間が続く場合
    if (gapStart != null) {
      gaps.add((start: gapStart, end: closeMinutes));
    }

    return gaps;
  }

  /// スタッフ不足時間帯を検出（設定された時間帯での不足のみ、空き時間帯は除外）
  List<({int start, int end, int required, int current})> _findInsufficientTimeSlots(ShiftDayData dayData) {
    if (dayData.businessHours.isClosed) {
      return [];
    }

    final openMinutes = dayData.businessHours.openMinute;
    final closeMinutes = dayData.businessHours.closeMinute;
    
    final insufficientSlots = <({int start, int end, int required, int current})>[];

    // 時間帯別の必要人数設定を取得してチェック
    final requiredSlots = RequiredStaffByTimeSlotService.instance.latestData ?? kDefaultRequiredStaffByTimeSlot;
    if (requiredSlots.isNotEmpty) {
      // 各設定された時間帯についてチェック
      for (final slot in requiredSlots) {
        final startHour = slot['startHour']!;
        final endHour = slot['endHour']!;
        final requiredCount = slot['requiredCount']!;
        
        // 時間を分に変換（例: 19 → 1140分 = 19:00）
        final slotStartMinutes = startHour * 60;
        final slotEndMinutes = endHour * 60;
        
        // 営業時間と重ならない場合はスキップ
        if (slotEndMinutes <= openMinutes || slotStartMinutes >= closeMinutes) {
          continue;
        }

        // この時間帯に勤務しているスタッフ数をカウント（1時間単位でチェック）
        for (int hour = startHour; hour < endHour; hour++) {
          final hourStartMinutes = hour * 60;
          final hourEndMinutes = (hour + 1) * 60;
          
          // 営業時間と重なる部分を計算
          final hourCheckStart = hourStartMinutes > openMinutes ? hourStartMinutes : openMinutes;
          final hourCheckEnd = hourEndMinutes < closeMinutes ? hourEndMinutes : closeMinutes;
          
          // 営業時間と重ならない場合はスキップ
          if (hourCheckStart >= hourCheckEnd) {
            continue;
          }

          // この1時間に勤務しているスタッフ数をカウント
          int currentCount = 0;
          for (final assignment in dayData.assignments) {
            // 割当時間とこの1時間が重なっているかチェック
            if (assignment.startMinute < hourEndMinutes && assignment.endMinute > hourStartMinutes) {
              currentCount++;
            }
          }

          // 必要人数に足りない場合は不足時間帯として記録
          if (currentCount < requiredCount) {
            insufficientSlots.add((
              start: hourStartMinutes,
              end: hourEndMinutes,
              required: requiredCount,
              current: currentCount,
            ));
          }
        }
      }
    }

    // 時刻順にソート（startの値でソート）
    insufficientSlots.sort((a, b) => a.start.compareTo(b.start));

    return insufficientSlots;
  }
}

/// 1日のシフトデータ
class ShiftDayData {
  final DateTime date;
  final BusinessHours businessHours;
  final bool isSufficient;
  final bool isFinalized;
  final List<ShiftAssignment> assignments;
  final int pendingRequestCount; // 未処理申請数

  ShiftDayData({
    required this.date,
    required this.businessHours,
    required this.isSufficient,
    this.isFinalized = false,
    required this.assignments,
    this.pendingRequestCount = 0,
  });

  /// 現在人数を計算（assignments.lengthから派生）
  int get currentCount => assignments.length;

  /// 中間確定済みかどうか（assignments.length > 0 で派生、Firestoreには保存しない）
  bool get isInterimConfirmed => assignments.isNotEmpty;

  ShiftDayData copyWith({
    DateTime? date,
    BusinessHours? businessHours,
    bool? isSufficient,
    bool? isFinalized,
    List<ShiftAssignment>? assignments,
    int? pendingRequestCount,
  }) {
    return ShiftDayData(
      date: date ?? this.date,
      businessHours: businessHours ?? this.businessHours,
      isSufficient: isSufficient ?? this.isSufficient,
      isFinalized: isFinalized ?? this.isFinalized,
      assignments: assignments != null ? List<ShiftAssignment>.from(assignments) : this.assignments,
      pendingRequestCount: pendingRequestCount ?? this.pendingRequestCount,
    );
  }
}

/// 営業時間
class BusinessHours {
  final int openMinute; // 0:00からの分数（例: 540 = 09:00）
  final int closeMinute; // 0:00からの分数（例: 1320 = 22:00, 1440 = 24:00）
  final bool isClosed;
  final String? styleId; // 営業スタイルID（例: "weekday", "weekendHoliday", "closed"）
  final String? source; // データソース（"auto" | "manual"）

  BusinessHours({
    required this.openMinute,
    required this.closeMinute,
    required this.isClosed,
    this.styleId,
    this.source,
  });

  BusinessHours copyWith({
    int? openMinute,
    int? closeMinute,
    bool? isClosed,
    String? styleId,
    String? source,
  }) {
    return BusinessHours(
      openMinute: openMinute ?? this.openMinute,
      closeMinute: closeMinute ?? this.closeMinute,
      isClosed: isClosed ?? this.isClosed,
      styleId: styleId ?? this.styleId,
      source: source ?? this.source,
    );
  }
}

/// シフト割当
class ShiftAssignment {
  final String staffId;
  final String staffName;
  final int startMinute; // 0:00からの分数（例: 540 = 09:00）
  final int endMinute; // 0:00からの分数（例: 1080 = 18:00）
  final String? sourceRequestId; // 元の申請ID（追跡用、UIには表示しない）

  ShiftAssignment({
    required this.staffId,
    required this.staffName,
    required this.startMinute,
    required this.endMinute,
    this.sourceRequestId,
  });

  ShiftAssignment copyWith({
    String? staffId,
    String? staffName,
    int? startMinute,
    int? endMinute,
    String? sourceRequestId,
  }) {
    return ShiftAssignment(
      staffId: staffId ?? this.staffId,
      staffName: staffName ?? this.staffName,
      startMinute: startMinute ?? this.startMinute,
      endMinute: endMinute ?? this.endMinute,
      sourceRequestId: sourceRequestId ?? this.sourceRequestId,
    );
  }
}

/// 募集時間帯
class RecruitmentTimeSlot {
  final int startMinute; // 0:00からの分数（例: 540 = 09:00）
  final int endMinute; // 0:00からの分数（例: 1320 = 22:00）

  RecruitmentTimeSlot({
    required this.startMinute,
    required this.endMinute,
  });
}


