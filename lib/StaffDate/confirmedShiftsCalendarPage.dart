import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/globalConstant.dart';

/// カレンダーで確定シフト確認画面
class ConfirmedShiftsCalendarPage extends StatefulWidget {
  const ConfirmedShiftsCalendarPage({super.key});

  @override
  State<ConfirmedShiftsCalendarPage> createState() => _ConfirmedShiftsCalendarPageState();
}

class _ConfirmedShiftsCalendarPageState extends State<ConfirmedShiftsCalendarPage> {
  late DateTime _currentMonth;
  DateTime? _selectedDate;
  Map<String, List<Map<String, dynamic>>> _shifts = {};
  Map<String, List<Map<String, dynamic>>> _shiftRequests = {}; // 日付 -> 要請リスト
  Map<String, String> _staffNames = {}; // staffId -> staffName
  bool _isLoading = true;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _currentMonth = DateTime(DateTime.now().year, DateTime.now().month, 1);
    _loadShifts();
    // プランチェック: ライトプラン以上の場合のみ要請を読み込み
    if (GlobalConstants.isShiftRequestEnabled) {
      _loadShiftRequests();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  /// シフトを読み込み
  Future<void> _loadShifts() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // 現在表示可能な範囲（前月〜次の次の月）
      final now = DateTime.now();
      final startDate = DateTime(now.year, now.month - 1, 1); // 前月の1日
      final endDate = DateTime(now.year, now.month + 3, 1); // 次の次の月の翌月1日

      debugPrint('=== シフト読み込み開始 ===');
      debugPrint('期間: ${startDate} 〜 ${endDate}');

      // Cloud Functionで全シフトを取得
      final functions = FirebaseFunctions.instance;
      final getAllShifts = functions.httpsCallable('getAllShifts');
      final result = await getAllShifts.call();

      if (result.data['success'] != true) {
        throw Exception(result.data['error'] ?? 'シフトの取得に失敗しました');
      }

      final allShifts = (result.data['shifts'] as List)
          .map((shift) => Map<String, dynamic>.from(shift))
          .toList();

      debugPrint('取得したシフト数: ${allShifts.length}');

      // 確定シフトのみをフィルタリング（confirmed: true）
      final confirmedShifts = allShifts.where((shift) {
        return shift['confirmed'] == true;
      }).toList();

      debugPrint('確定シフト数: ${confirmedShifts.length}');

      // スタッフ情報を取得
      final staffIds = confirmedShifts.map((shift) => shift['userId'] as String).toSet();
      await _loadStaffNames(staffIds);

      // 日付ごとにシフトを分類
      final Map<String, List<Map<String, dynamic>>> shiftsByDate = {};

      for (var shift in confirmedShifts) {
        final dateStr = shift['date'] as String?;
        if (dateStr == null) continue;

        // 日付文字列をDateTimeに変換
        final date = DateTime.parse(dateStr);
        
        // 表示範囲内かチェック
        if (date.isBefore(startDate) || date.isAfter(endDate)) {
          continue;
        }

        final dateKey = DateFormat('yyyy-MM-dd').format(date);
        final staffId = shift['userId'] as String? ?? '';
        final staffName = _staffNames[staffId] ?? '不明';

        if (!shiftsByDate.containsKey(dateKey)) {
          shiftsByDate[dateKey] = [];
        }

        shiftsByDate[dateKey]!.add({
          'id': shift['id'],
          'staffId': staffId,
          'staffName': staffName,
          'date': dateStr,
          'start': shift['start'] as String? ?? '',
          'end': shift['end'] as String? ?? '',
        });

        debugPrint('シフト: $staffName, 日付: $dateStr, 時間: ${shift['start']}〜${shift['end']}');
      }

      setState(() {
        _shifts = shiftsByDate;
        _isLoading = false;
      });

      debugPrint('=== シフト読み込み完了 ===');
    } catch (e, stackTrace) {
      debugPrint('=== シフト読み込みエラー ===');
      debugPrint('エラー: $e');
      debugPrint('スタックトレース: $stackTrace');

      setState(() {
        _isLoading = false;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('シフトの取得に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// スタッフ名を取得
  Future<void> _loadStaffNames(Set<String> staffIds) async {
    try {
      final firestore = FirebaseFirestore.instance;
      final batchSize = 10; // Firestoreの制限を考慮してバッチ処理
      final staffIdsList = staffIds.toList();

      for (int i = 0; i < staffIdsList.length; i += batchSize) {
        final batch = staffIdsList.sublist(
          i,
          i + batchSize > staffIdsList.length ? staffIdsList.length : i + batchSize,
        );

        final futures = batch.map((staffId) async {
          try {
            final doc = await firestore.collection('staffs').doc(staffId).get();
            if (doc.exists) {
              final data = doc.data()!;
              return MapEntry(staffId, data['fullName'] as String? ?? '不明');
            }
            return MapEntry(staffId, '不明');
          } catch (e) {
            debugPrint('スタッフ情報取得エラー ($staffId): $e');
            return MapEntry(staffId, '不明');
          }
        });

        final results = await Future.wait(futures);
        for (var entry in results) {
          _staffNames[entry.key] = entry.value;
        }
      }
    } catch (e) {
      debugPrint('スタッフ名取得エラー: $e');
    }
  }

  /// 月を変更
  void _changeMonth(int delta) {
    final now = DateTime.now();
    final newMonth = DateTime(_currentMonth.year, _currentMonth.month + delta, 1);

    // 前月〜次の次の月の範囲内かチェック
    final minMonth = DateTime(now.year, now.month - 1, 1);
    final maxMonth = DateTime(now.year, now.month + 2, 1);

    if (newMonth.isBefore(minMonth) || newMonth.isAfter(maxMonth)) {
      return;
    }

    setState(() {
      _currentMonth = newMonth;
    });
  }

  /// 指定月の日数を取得
  int _getDaysInMonth(DateTime date) {
    return DateTime(date.year, date.month + 1, 0).day;
  }

  /// 指定月の最初の日の曜日を取得（0: 日曜, 6: 土曜）
  int _getFirstDayOfWeek(DateTime date) {
    final firstDay = DateTime(date.year, date.month, 1);
    return firstDay.weekday % 7; // weekday: 1=月曜, 7=日曜 → %7で0=日曜, 6=土曜
  }

  /// 指定月に必要な週数を計算
  int _getRequiredWeeks(DateTime date) {
    final daysInMonth = _getDaysInMonth(date);
    final firstDayOfWeek = _getFirstDayOfWeek(date);
    final totalDays = daysInMonth + firstDayOfWeek;
    return (totalDays / 7).ceil();
  }

  /// 日付のキーを生成
  String _getDateKey(DateTime date) {
    return DateFormat('yyyy-MM-dd').format(date);
  }

  /// 選択された日付のシフトを取得
  List<Map<String, dynamic>> _getSelectedDateShifts() {
    if (_selectedDate == null) return [];
    final dateKey = _getDateKey(_selectedDate!);
    return _shifts[dateKey] ?? [];
  }

  /// 選択された日付のシフト要請を取得
  List<Map<String, dynamic>> _getSelectedDateShiftRequests() {
    if (_selectedDate == null) return [];
    final dateKey = _getDateKey(_selectedDate!);
    return _shiftRequests[dateKey] ?? [];
  }

  /// シフト要請を読み込み
  Future<void> _loadShiftRequests() async {
    try {
      final functions = FirebaseFunctions.instance;
      final getShiftRequests = functions.httpsCallable('getShiftRequests');
      final result = await getShiftRequests.call();

      if (result.data['success'] != true) {
        debugPrint('シフト要請の取得に失敗: ${result.data['error']}');
        return;
      }

      final requests = (result.data['requests'] as List)
          .map((req) => Map<String, dynamic>.from(req))
          .toList();

      debugPrint('取得した要請数: ${requests.length}');

      // 日付ごとに要請を分類
      final Map<String, List<Map<String, dynamic>>> requestsByDate = {};

      for (var request in requests) {
        final dateStr = request['date'] as String?;
        if (dateStr == null) continue;

        final dateKey = dateStr; // YYYY-MM-DD形式

        if (!requestsByDate.containsKey(dateKey)) {
          requestsByDate[dateKey] = [];
        }

        final staffId = request['staffId'] as String? ?? '';
        final staffName = request['staffName'] as String? ?? _staffNames[staffId] ?? '不明';

        requestsByDate[dateKey]!.add({
          'id': request['id'],
          'staffId': staffId,
          'staffName': staffName,
          'date': dateStr,
          'start': request['start'],
          'end': request['end'],
          'status': request['status'] as String? ?? 'unknown',
        });
      }

      setState(() {
        _shiftRequests = requestsByDate;
      });

      debugPrint('=== シフト要請読み込み完了 ===');
    } catch (e) {
      debugPrint('シフト要請読み込みエラー: $e');
    }
  }

  /// 状態ラベルを取得
  String _getStatusLabel(String status) {
    switch (status) {
      case 'pending':
        return '未確認';
      case 'confirmed':
        return '確認済み';
      case 'declined':
        return '辞退';
      case 'expired':
        return '期限切れ';
      default:
        return status;
    }
  }

  /// 状態色を取得
  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.orange;
      case 'confirmed':
        return Colors.green;
      case 'declined':
        return Colors.red;
      case 'expired':
        return Colors.grey;
      default:
        return Colors.black;
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;

    // AppBarの高さ: 6%
    final appBarHeight = screenHeight * 0.06;

    // body部分の高さ（AppBarを除いた94%）
    final bodyHeight = screenHeight - appBarHeight;

    // 現在の月に必要な週数を計算
    final requiredWeeks = _getRequiredWeeks(_currentMonth);
    debugPrint('=== レイアウト計算 ===');
    debugPrint('表示月: ${DateFormat('yyyy年M月').format(_currentMonth)}');
    debugPrint('必要な週数: $requiredWeeks');

    // 各セクションの高さを計算（bodyHeightを基準に）
    final monthSelectorHeight = bodyHeight * 0.0638; // 20XX年YY月: 6%
    final weekdayHeaderHeight = bodyHeight * 0.0532; // 曜日: 5%
    final topMargin = bodyHeight * 0.0001; // 余白: 1%
    final rowHeight = bodyHeight * 0.0851; // 1列: 8%
    final rowMargin = bodyHeight * 0.0001; // 列間余白: 0.5%

    // 実際に必要な行数分の高さを計算（マージンの計算を調整）
    final totalRowsHeight = rowHeight * requiredWeeks + rowMargin * (requiredWeeks > 0 ? requiredWeeks - 1 : 0);

    final bottomMargin = bodyHeight * 0.0106; // 余白: 1%
    final detailHeaderHeight = bodyHeight * 0.0426; // YY月ZZ日(曜日): 4%
    final detailMargin = bodyHeight * 0.0106; // 余白: 1%

    // 残りのスペースをシフト一覧に割り当て
    final baseDetailListHeight = bodyHeight * 0.234; // 基本: 22%
    final savedSpace = (6 - requiredWeeks) * (rowHeight + rowMargin); // 節約されたスペース
    final detailListHeight = baseDetailListHeight + savedSpace;

    debugPrint('カレンダーグリッド高さ: $totalRowsHeight (${requiredWeeks}週分)');
    debugPrint('節約されたスペース: $savedSpace');
    debugPrint('シフト一覧高さ: $detailListHeight');
    debugPrint('===================');

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: Size.fromHeight(appBarHeight),
        child: AppBar(
          title: const Text('確定シフト（カレンダー）'),
          backgroundColor: Colors.deepPurple,
          foregroundColor: Colors.white,
            actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              _loadShifts();
              // プランチェック: ライトプラン以上の場合のみ要請を読み込み
              if (GlobalConstants.isShiftRequestEnabled) {
                _loadShiftRequests();
              }
            },
            tooltip: '更新',
          ),
        ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              physics: const ClampingScrollPhysics(),
              child: Column(
                children: [
                  // 月選択ヘッダー: 6%
                  SizedBox(
                    height: monthSelectorHeight,
                    child: _buildMonthSelector(),
                  ),
                  // 曜日ヘッダー: 5%
                  SizedBox(
                    height: weekdayHeaderHeight,
                    child: _buildWeekdayHeader(),
                  ),
                  // 余白: 1%
                  SizedBox(height: topMargin),
                  // カレンダーグリッド: 6列 × (8% + 1%)
                  SizedBox(
                    height: totalRowsHeight,
                    child: _buildCalendarGrid(rowHeight, rowMargin),
                  ),
                  // 余白: 1%
                  SizedBox(height: bottomMargin),
                  // 詳細フィールドヘッダー: 4%
                  SizedBox(
                    height: detailHeaderHeight,
                    child: _buildDetailHeader(),
                  ),
                  // 余白: 1%
                  SizedBox(height: detailMargin),
                  // シフト一覧: 22%
                  SizedBox(
                    height: detailListHeight,
                    child: _buildDetailList(),
                  ),
                ],
              ),
            ),
    );
  }

  /// 月選択ヘッダー
  Widget _buildMonthSelector() {
    final now = DateTime.now();
    final minMonth = DateTime(now.year, now.month - 1, 1);
    final maxMonth = DateTime(now.year, now.month + 2, 1);

    final canGoPrevious = _currentMonth.isAfter(minMonth);
    final canGoNext = _currentMonth.isBefore(maxMonth);

    final screenHeight = MediaQuery.of(context).size.height;
    final bodyHeight = screenHeight - screenHeight * 0.06; // AppBarを除いた高さ
    final fontSize = bodyHeight * 0.03; // body高さの3%

    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[100],
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: canGoPrevious ? () => _changeMonth(-1) : null,
            color: canGoPrevious ? Colors.deepPurple : Colors.grey,
          ),
          Text(
            DateFormat('yyyy年M月').format(_currentMonth),
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.bold,
              color: Colors.deepPurple,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: canGoNext ? () => _changeMonth(1) : null,
            color: canGoNext ? Colors.deepPurple : Colors.grey,
          ),
        ],
      ),
    );
  }

  /// 曜日ヘッダー
  Widget _buildWeekdayHeader() {
    final weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    final weekdayColors = [
      Colors.red[300],
      Colors.grey[600],
      Colors.grey[600],
      Colors.grey[600],
      Colors.grey[600],
      Colors.grey[600],
      Colors.blue[300],
    ];

    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[200],
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        children: weekdays.asMap().entries.map((entry) {
          final index = entry.key;
          final weekday = entry.value;
          return Expanded(
            child: Container(
              decoration: BoxDecoration(
                border: Border(
                  right: index < weekdays.length - 1
                      ? BorderSide(color: Colors.grey[300]!)
                      : BorderSide.none,
                ),
              ),
              child: Center(
                child: Text(
                  weekday,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: weekdayColors[index],
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  /// カレンダーグリッド
  Widget _buildCalendarGrid(double rowHeight, double rowMargin) {
    final daysInMonth = _getDaysInMonth(_currentMonth);
    final firstDayOfWeek = _getFirstDayOfWeek(_currentMonth);
    final requiredWeeks = _getRequiredWeeks(_currentMonth);

    return ListView.builder(
      padding: EdgeInsets.zero,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: requiredWeeks, // 動的な行数
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
                    return Expanded(child: Container()); // 空白セル
                  }

                  return Expanded(
                    child: _buildDayCell(dayNumber),
                  );
                }),
              ),
            ),
            if (rowIndex < requiredWeeks - 1) SizedBox(height: rowMargin), // 最後の行以外は余白を追加
          ],
        );
      },
    );
  }

  /// 日付セル
  Widget _buildDayCell(int dayNumber) {
    final date = DateTime(_currentMonth.year, _currentMonth.month, dayNumber);
    final dateKey = _getDateKey(date);
    final shiftsOnDate = _shifts[dateKey] ?? [];
    final requestsOnDate = _shiftRequests[dateKey] ?? [];
    final isSelected = _selectedDate != null && 
                       _selectedDate!.year == date.year &&
                       _selectedDate!.month == date.month &&
                       _selectedDate!.day == date.day;
    final isToday = _getDateKey(date) == _getDateKey(DateTime.now());

    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedDate = date;
        });
      },
      child: Container(
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: isSelected
              ? Colors.deepPurple[100]
              : isToday
                  ? Colors.blue[50]
                  : Colors.white,
          border: Border.all(
            color: isSelected
                ? Colors.deepPurple
                : Colors.grey[300]!,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Stack(
          children: [
            // 日付（左上）
            Positioned(
              top: 2,
              left: 4,
              child: Text(
                '$dayNumber',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                  color: isToday
                      ? Colors.blue[700]
                      : isSelected
                          ? Colors.deepPurple[700]
                          : Colors.black,
                ),
              ),
            ),
            // 要請マーク（左下）- プランチェック
            if (GlobalConstants.isShiftRequestEnabled && requestsOnDate.isNotEmpty)
              Positioned(
                bottom: 2,
                left: 4,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: Colors.orange[400],
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            // シフト数表示（右下）
            if (shiftsOnDate.isNotEmpty)
              Positioned(
                bottom: 2,
                right: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.deepPurple[200],
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '${shiftsOnDate.length}件',
                    style: const TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// 詳細フィールドヘッダー
  Widget _buildDetailHeader() {
    if (_selectedDate == null) {
      return Container(
        decoration: BoxDecoration(
          color: Colors.grey[50],
          border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
        ),
        child: const Center(
          child: Text(
            'カレンダーから日付を選択してください',
            style: TextStyle(color: Colors.grey, fontSize: 14),
          ),
        ),
      );
    }

    final dateStr = DateFormat('M月d日').format(_selectedDate!);
    final weekday = ['日', '月', '火', '水', '木', '金', '土'][_selectedDate!.weekday % 7];
    final weekdayColor = _selectedDate!.weekday % 7 == 0
        ? Colors.red[300]
        : _selectedDate!.weekday % 7 == 6
            ? Colors.blue[300]
            : Colors.grey[600];

    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[50],
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Center(
        child: Text(
          '$dateStr($weekday)',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: weekdayColor,
          ),
        ),
      ),
    );
  }

  /// 詳細フィールドリスト（スクロール可能）
  Widget _buildDetailList() {
    final shifts = _getSelectedDateShifts();

    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[50],
      ),
      child: _selectedDate == null
          ? Center(
              child: Text(
                'カレンダーから日付を選択してください',
                style: TextStyle(color: Colors.grey[600], fontSize: 14),
              ),
            )
          : Stack(
              children: [
                // シフト一覧（確定シフト + 要請）
                _buildShiftsAndRequestsList(shifts),
                // 希望シフト要請ボタン（右下）- プランチェック
                if (GlobalConstants.isShiftRequestEnabled)
                  Positioned(
                    bottom: 16,
                    right: 16,
                    child: FloatingActionButton.extended(
                      onPressed: () => _showShiftRequestDialog(context),
                      icon: const Icon(Icons.send),
                      label: const Text('希望シフト要請を送信'),
                      backgroundColor: Colors.deepPurple,
                      foregroundColor: Colors.white,
                    ),
                  ),
              ],
            ),
    );
  }

  /// シフトと要請の一覧を構築
  Widget _buildShiftsAndRequestsList(List<Map<String, dynamic>> shifts) {
    // プランチェック: ライトプラン以上の場合のみ要請を取得
    final requests = GlobalConstants.isShiftRequestEnabled ? _getSelectedDateShiftRequests() : [];
    final hasShifts = shifts.isNotEmpty;
    final hasRequests = requests.isNotEmpty;

    if (!hasShifts && !hasRequests) {
      return Center(
        child: Text(
          'この日に確定シフト・要請はありません',
          style: TextStyle(color: Colors.grey[600], fontSize: 14),
        ),
      );
    }

    return Scrollbar(
      controller: _scrollController,
      thumbVisibility: true,
      thickness: 6.0,
      radius: const Radius.circular(3.0),
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: (hasShifts ? shifts.length : 0) + (hasRequests ? requests.length + 1 : 0) + (hasShifts && hasRequests ? 1 : 0),
        itemBuilder: (context, index) {
        // 確定シフトセクション
        if (hasShifts && index < shifts.length) {
          final shift = shifts[index];
          final staffName = shift['staffName'] as String? ?? '不明';
          final start = shift['start'] as String? ?? '';
          final end = shift['end'] as String? ?? '';

          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            color: Colors.white,
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: Colors.deepPurple[200],
                child: Text(
                  staffName.isNotEmpty ? staffName[0] : '?',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              title: Text(
                staffName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                ),
              ),
              subtitle: Text(
                start.isNotEmpty && end.isNotEmpty
                    ? '$start 〜 $end'
                    : start.isNotEmpty
                        ? '開始: $start'
                        : '時間未指定',
              ),
              trailing: const Icon(Icons.access_time, color: Colors.deepPurple),
            ),
          );
        }

        // セクション区切り（確定シフトと要請の両方がある場合）
        if (hasShifts && hasRequests && index == shifts.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8.0),
            child: Row(
              children: [
                Expanded(
                  child: Divider(color: Colors.grey[400]),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8.0),
                  child: Text(
                    'シフト要請',
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Expanded(
                  child: Divider(color: Colors.grey[400]),
                ),
              ],
            ),
          );
        }

        // 要請セクション
        if (hasRequests) {
          final requestIndex = index - (hasShifts ? shifts.length + 1 : 0) - (hasShifts && hasRequests ? 1 : 0);
          if (requestIndex >= 0 && requestIndex < requests.length) {
            final request = requests[requestIndex];
            final staffName = request['staffName'] as String? ?? '不明';
            final start = request['start'] as String?;
            final end = request['end'] as String?;
            final status = request['status'] as String? ?? 'unknown';

            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              color: Colors.white,
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: _getStatusColor(status).withOpacity(0.2),
                  child: Icon(
                    _getStatusIcon(status),
                    color: _getStatusColor(status),
                    size: 20,
                  ),
                ),
                title: Row(
                  children: [
                    Expanded(
                      child: Text(
                        staffName,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _getStatusColor(status),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        _getStatusLabel(status),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                subtitle: Text(
                  start != null && end != null
                      ? '$start 〜 $end'
                      : start != null
                          ? '開始: $start'
                          : '時間未指定',
                ),
                trailing: Icon(
                  Icons.request_quote,
                  color: _getStatusColor(status),
                ),
              ),
            );
          }
        }

        return const SizedBox.shrink();
      },
      ),
    );
  }

  /// 状態アイコンを取得
  IconData _getStatusIcon(String status) {
    switch (status) {
      case 'pending':
        return Icons.pending;
      case 'confirmed':
        return Icons.check_circle;
      case 'declined':
        return Icons.cancel;
      case 'expired':
        return Icons.schedule;
      default:
        return Icons.help_outline;
    }
  }

  /// 希望シフト要請ダイアログを表示
  Future<void> _showShiftRequestDialog(BuildContext context) async {
    // プランチェック: コミュニケーションプランの場合は機能を無効化
    if (!GlobalConstants.isShiftRequestEnabled) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('この機能はライトプラン以上で利用可能です。'),
            backgroundColor: Colors.orange,
          ),
        );
      }
      return;
    }

    if (_selectedDate == null) return;

    final FirebaseFunctions functions = FirebaseFunctions.instance;
    final FirebaseFirestore firestore = FirebaseFirestore.instance;

    List<Map<String, dynamic>> allStaffs = [];
    Set<String> selectedStaffIds = {};
    String? startTime;
    String? endTime;
    bool isLoading = false;

    // スタッフ一覧を取得
    try {
      final snapshot = await firestore.collection('staffs').get();
      allStaffs = snapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'id': doc.id,
          'fullName': data['fullName'] ?? '不明',
          'fullNameKana': data['fullNameKana'] ?? '',
        };
      }).toList();
      allStaffs.sort((a, b) => (a['fullNameKana'] as String).compareTo(b['fullNameKana'] as String));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('スタッフ一覧の取得に失敗しました: $e')),
        );
      }
      return;
    }

    await showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            title: Text(
              '${DateFormat('M月d日').format(_selectedDate!)}の希望シフト要請',
            ),
            content: SingleChildScrollView(
              child: SizedBox(
                width: double.maxFinite,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 時間選択（任意）
                    const Text(
                      '希望シフト時間（任意）',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: () async {
                              final TimeOfDay? picked = await showTimePicker(
                                context: context,
                                initialTime: startTime != null
                                    ? TimeOfDay(
                                        hour: int.parse(startTime!.split(':')[0]),
                                        minute: int.parse(startTime!.split(':')[1]),
                                      )
                                    : TimeOfDay.now(),
                              );
                              if (picked != null) {
                                setDialogState(() {
                                  startTime = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
                                });
                              }
                            },
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                border: Border.all(color: Colors.grey),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    startTime ?? '開始時刻',
                                    style: TextStyle(
                                      fontSize: 16,
                                      color: startTime != null ? Colors.black : Colors.grey,
                                    ),
                                  ),
                                  const Icon(Icons.access_time),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        const Text('〜', style: TextStyle(fontSize: 16)),
                        const SizedBox(width: 16),
                        Expanded(
                          child: InkWell(
                            onTap: () async {
                              final TimeOfDay? picked = await showTimePicker(
                                context: context,
                                initialTime: endTime != null
                                    ? TimeOfDay(
                                        hour: int.parse(endTime!.split(':')[0]),
                                        minute: int.parse(endTime!.split(':')[1]),
                                      )
                                    : TimeOfDay.now(),
                              );
                              if (picked != null) {
                                setDialogState(() {
                                  endTime = '${picked.hour.toString().padLeft(2, '0')}:${picked.minute.toString().padLeft(2, '0')}';
                                });
                              }
                            },
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                border: Border.all(color: Colors.grey),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    endTime ?? '終了時刻',
                                    style: TextStyle(
                                      fontSize: 16,
                                      color: endTime != null ? Colors.black : Colors.grey,
                                    ),
                                  ),
                                  const Icon(Icons.access_time),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (startTime != null || endTime != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: TextButton(
                          onPressed: () {
                            setDialogState(() {
                              startTime = null;
                              endTime = null;
                            });
                          },
                          child: const Text('時間をクリア'),
                        ),
                      ),
                    const SizedBox(height: 16),
                    // スタッフ選択
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          '送信先スタッフ',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        if (allStaffs.isNotEmpty)
                          TextButton(
                            onPressed: () {
                              setDialogState(() {
                                if (selectedStaffIds.length == allStaffs.length) {
                                  selectedStaffIds.clear();
                                } else {
                                  selectedStaffIds = allStaffs.map((s) => s['id'] as String).toSet();
                                }
                              });
                            },
                            child: Text(
                              selectedStaffIds.length == allStaffs.length
                                  ? '全て解除'
                                  : '全て選択',
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Container(
                      constraints: const BoxConstraints(maxHeight: 200),
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: allStaffs.length,
                        itemBuilder: (context, index) {
                          final staff = allStaffs[index];
                          final staffId = staff['id'] as String;
                          final isSelected = selectedStaffIds.contains(staffId);

                          return CheckboxListTile(
                            title: Text(staff['fullName'] as String),
                            subtitle: Text(staff['fullNameKana'] as String),
                            value: isSelected,
                            onChanged: (value) {
                              setDialogState(() {
                                if (value == true) {
                                  selectedStaffIds.add(staffId);
                                } else {
                                  selectedStaffIds.remove(staffId);
                                }
                              });
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('キャンセル'),
              ),
              ElevatedButton(
                onPressed: isLoading || selectedStaffIds.isEmpty
                    ? null
                    : () async {
                        setDialogState(() {
                          isLoading = true;
                        });

                        try {
                          final dateString = DateFormat('yyyy-MM-dd').format(_selectedDate!);

                          final requests = selectedStaffIds.map((staffId) {
                            return {
                              'staffId': staffId,
                              'date': dateString,
                              if (startTime != null) 'start': startTime,
                              if (endTime != null) 'end': endTime,
                            };
                          }).toList();

                          final callable = functions.httpsCallable('createShiftRequest');
                          final result = await callable.call({'requests': requests});

                          if (result.data['success'] == true) {
                            if (context.mounted) {
                              Navigator.pop(context);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(result.data['message'] ?? '要請を送信しました'),
                                  backgroundColor: Colors.green,
                                ),
                              );
                              // 要請を再読み込み
                              _loadShiftRequests();
                            }
                          } else {
                            throw Exception(result.data['error'] ?? '要請の送信に失敗しました');
                          }
                        } catch (e) {
                          if (context.mounted) {
                            setDialogState(() {
                              isLoading = false;
                            });
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('要請の送信に失敗しました: $e'),
                                backgroundColor: Colors.red,
                              ),
                            );
                          }
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurple,
                  foregroundColor: Colors.white,
                ),
                child: isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Text('送信'),
              ),
            ],
          );
        },
      ),
    );
  }
}

