import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:holiday_jp/holiday_jp.dart' as holiday_jp;
import 'shift_repository.dart';
import 'shiftHomePage.dart'; // BusinessHours型を使用するため
import '../Utils/time_converter.dart';
import '../globalConstant.dart';

/// 営業日編集ページ
class BusinessDayEditPage extends StatefulWidget {
  const BusinessDayEditPage({super.key});

  @override
  State<BusinessDayEditPage> createState() => _BusinessDayEditPageState();
}

class _BusinessDayEditPageState extends State<BusinessDayEditPage> {
  final ShiftRepository _repository = ShiftRepository();
  
  // 選択中の月
  DateTime _selectedMonth = DateTime(DateTime.now().year, DateTime.now().month + 1, 1);
  
  // デフォルト営業時間
  TimeOfDay _defaultStartTime = const TimeOfDay(hour: 9, minute: 0); // 09:00
  TimeOfDay _defaultEndTime = const TimeOfDay(hour: 22, minute: 0); // 22:00
  
  // 各日の営業時間データ
  Map<int, DayBusinessHours> _daysData = {};
  
  // 既存の営業時間データ（変更検出用）
  Map<String, BusinessHours> _existingBusinessHours = {};
  
  bool _isLoading = false;
  bool _isSaving = false;
  /// 保存中に立てる。snapshot で該当月の更新を検知したらローディング解除・成功メッセージ表示
  String? _pendingSaveYearMonth;
  
  StreamSubscription<Map<String, BusinessHours>>? _businessHoursSubscription;
  
  @override
  void initState() {
    super.initState();
    _subscribeBusinessHours();
  }
  
  @override
  void dispose() {
    _businessHoursSubscription?.cancel();
    super.dispose();
  }
  
  /// businessHoursMonthlyMap を snapshot 購読（保存後のUI更新はここで反映）
  void _subscribeBusinessHours() {
    _businessHoursSubscription?.cancel();
    final yearMonth = DateFormat('yyyy-MM').format(_selectedMonth);
    setState(() => _isLoading = true);
    _businessHoursSubscription = _repository.streamBusinessHoursForMonth(yearMonth).listen(
      (existingData) {
        if (!mounted) return;
        _applyBusinessHoursFromSnapshot(existingData);
      },
      onError: (e) {
        if (!mounted) return;
        _initializeMonthWithDefaults();
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('既存データの読み込みに失敗しました: $e'),
            backgroundColor: Colors.orange,
          ),
        );
      },
    );
  }
  
  /// snapshot で受け取った営業時間を UI に反映（保存完了時はローディング解除・成功メッセージも snapshot で行う）
  void _applyBusinessHoursFromSnapshot(Map<String, BusinessHours> existingData) {
    final yearMonth = DateFormat('yyyy-MM').format(_selectedMonth);
    final daysInMonth = DateTime(_selectedMonth.year, _selectedMonth.month + 1, 0).day;
    final newDaysData = <int, DayBusinessHours>{};
    for (int day = 1; day <= daysInMonth; day++) {
      final dayStr = day.toString().padLeft(2, '0');
      final dateKey = '$yearMonth-$dayStr';
      if (existingData.containsKey(dateKey)) {
        final businessHours = existingData[dateKey]!;
        newDaysData[day] = DayBusinessHours(
          startTime: minutesToTimeOfDay(businessHours.openMinute),
          endTime: minutesToTimeOfDay(businessHours.closeMinute),
          isClosed: businessHours.isClosed,
          styleId: businessHours.styleId,
        );
      } else {
        newDaysData[day] = DayBusinessHours(
          startTime: _defaultStartTime,
          endTime: _defaultEndTime,
          isClosed: false,
          styleId: null,
        );
      }
    }
    final wasPendingSave = _pendingSaveYearMonth == yearMonth;
    setState(() {
      _daysData = newDaysData;
      _existingBusinessHours = existingData;
      _isLoading = false;
      if (wasPendingSave) {
        _isSaving = false;
        _pendingSaveYearMonth = null;
      }
    });
    if (wasPendingSave && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${DateFormat('yyyy年M月').format(_selectedMonth)}の営業時間を保存し、シフト日を初期化しました'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }
  
  /// 月の初期化（デフォルト値で各日を設定）
  void _initializeMonthWithDefaults() {
    final daysInMonth = DateTime(_selectedMonth.year, _selectedMonth.month + 1, 0).day;
    final newDaysData = <int, DayBusinessHours>{};
    
    for (int day = 1; day <= daysInMonth; day++) {
      // 既存データがあれば保持、なければデフォルト値
      newDaysData[day] = _daysData[day] ?? DayBusinessHours(
        startTime: _defaultStartTime,
        endTime: _defaultEndTime,
        isClosed: false,
        styleId: null,
      );
    }
    
    setState(() {
      _daysData = newDaysData;
      _isLoading = false;
    });
  }
  
  /// 月を選択
  Future<void> _selectMonth() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedMonth,
      firstDate: DateTime.now(),
      lastDate: DateTime(DateTime.now().year + 2, 12, 31),
      initialDatePickerMode: DatePickerMode.year,
      helpText: '月を選択',
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            datePickerTheme: DatePickerThemeData(
              headerHelpStyle: const TextStyle(fontSize: 16),
            ),
          ),
          child: child!,
        );
      },
    );
    
    if (picked != null) {
      final newMonth = DateTime(picked.year, picked.month, 1);
      if (newMonth != _selectedMonth) {
        setState(() {
          _selectedMonth = newMonth;
        });
        _subscribeBusinessHours();
      }
    }
  }
  
  /// 営業時間を保存（ローディング解除・成功メッセージは snapshot で行う）
  Future<void> _saveBusinessHours() async {
    final yearMonth = DateFormat('yyyy-MM').format(_selectedMonth);
    final days = <Map<String, dynamic>>[];

      for (final entry in _daysData.entries) {
        final day = entry.key;
        final data = entry.value;
        final dayStr = day.toString().padLeft(2, '0');
        final dateKey = '$yearMonth-$dayStr';

        // 休業日の場合は、openMinuteとcloseMinuteを0にする
        // 終了時刻が23:59の場合は1440（24:00）として扱う（TimeOfDayは24:00を表現できないため）
        final openMinute = data.isClosed ? 0 : timeOfDayToMinutes(data.startTime);
        final closeMinute = data.isClosed
            ? 0
            : (data.endTime.hour == 23 && data.endTime.minute == 59)
                ? 1440 // 24:00として扱う
                : timeOfDayToMinutes(data.endTime);

        // 既存データと比較して変更があったかチェック
        final existing = _existingBusinessHours[dateKey];
        final hasChanged = existing == null || // 新規データ
            existing.openMinute != openMinute ||
            existing.closeMinute != closeMinute ||
            existing.isClosed != data.isClosed ||
            existing.styleId != data.styleId;

        if (!hasChanged) continue;

        // 休業日の場合はstyleIdを"closed"に設定
        final finalStyleId = data.isClosed
            ? GlobalConstants.businessHoursStyleClosed
            : data.styleId;

        days.add({
          'day': day,
          'openMinute': openMinute,
          'closeMinute': closeMinute,
          'isClosed': data.isClosed,
          'styleId': finalStyleId,
          'source': 'manual',
        });
      }

      if (days.isEmpty) {
        if (mounted) {
          setState(() => _isSaving = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('変更がありません'),
              backgroundColor: Colors.grey,
            ),
          );
        }
        return;
      }

      try {
        setState(() {
          _isSaving = true;
          _pendingSaveYearMonth = yearMonth;
        });

        // 編集された日のみ営業時間を保存（該当日のフィールドのみ上書き）
        await _repository.initBusinessHoursForMonth(
          yearMonth: yearMonth,
          days: days,
        );
        // ここで Firestore に書き込まれる → snapshot が発火 → ローディング解除・成功メッセージ表示

        // 営業時間保存後、自動的にシフト日も初期化
        try {
          await _repository.initShiftDaysForMonth(yearMonth);
        } catch (initError) {
          // シフト日初期化に失敗した場合でも、営業時間保存は成功している（snapshot で既に成功表示済み）
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('営業時間は保存しましたが、シフト日の初期化に失敗しました: ${initError.toString()}'),
                backgroundColor: Colors.orange,
                duration: const Duration(seconds: 5),
              ),
            );
          }
        }
      } catch (e) {
        if (mounted) {
          setState(() {
            _isSaving = false;
            _pendingSaveYearMonth = null;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('エラー: ${e.toString()}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
  }

  /// シフト日を初期化
  Future<void> _initShiftDays({bool silent = false}) async {
    if (!silent) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('シフト日を初期化'),
          content: Text('${DateFormat('yyyy年M月').format(_selectedMonth)}のシフト日を初期化しますか？\n（営業時間データは既に保存されている必要があります）'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('キャンセル'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('初期化'),
            ),
          ],
        ),
      );
      
      if (confirmed != true) return;
    }
    
    setState(() {
      _isLoading = true;
    });
    
    try {
      final yearMonth = DateFormat('yyyy-MM').format(_selectedMonth);
      await _repository.initShiftDaysForMonth(yearMonth);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${DateFormat('yyyy年M月').format(_selectedMonth)}のシフト日を初期化しました'),
            backgroundColor: Colors.green,
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
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final daysInMonth = DateTime(_selectedMonth.year, _selectedMonth.month + 1, 0).day;
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('営業日編集'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // 月選択とデフォルト値設定
                Container(
                  padding: const EdgeInsets.all(16),
                  color: Colors.grey[100],
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 月選択と説明文
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // 月選択
                          Row(
                            children: [
                              const Text('対象月: ', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              TextButton(
                                onPressed: _selectMonth,
                                child: Text(
                                  DateFormat('yyyy年M月').format(_selectedMonth),
                                  style: const TextStyle(fontSize: 16),
                                ),
                              ),
                            ],
                          ),
                          // 説明文
                          Flexible(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '※店休日設定：各日付の右側にある「休業日」チェックボックスをONにすると店休日になります',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey[700],
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '※営業スタイル編集：日付をタップすると営業スタイルを個別に編集できます',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey[700],
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
                // 日付リスト
                Expanded(
                  child: Scrollbar(
                    thumbVisibility: true,
                    child: ListView.builder(
                      itemCount: daysInMonth,
                      itemBuilder: (context, index) {
                        final day = index + 1;
                        final date = DateTime(_selectedMonth.year, _selectedMonth.month, day);
                        final weekday = ['日', '月', '火', '水', '木', '金', '土'][date.weekday % 7];
                        final data = _daysData[day]!;
                        
                        // 曜日と祝日に応じた色を設定
                        Color weekdayColor;
                        final isHoliday = holiday_jp.isHoliday(date);
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

                        // 表示用の営業時間テキスト（25:00対応）
                        // カードは常に _daysData（現在の編集状態）を表示し、ダイアログでの変更も反映する
                        String subtitleText;
                        if (data.isClosed) {
                          subtitleText = '休業日';
                        } else {
                          int openMinute;
                          int closeMinute;
                          if (data.styleId != null) {
                            final styleData = GlobalConstants.getBusinessHoursByStyleId(data.styleId!);
                            if (styleData != null) {
                              openMinute = styleData['openMinute'] as int;
                              closeMinute = styleData['closeMinute'] as int;
                            } else {
                              openMinute = timeOfDayToMinutes(data.startTime);
                              closeMinute = timeOfDayToMinutes(data.endTime);
                            }
                          } else {
                            openMinute = timeOfDayToMinutes(data.startTime);
                            closeMinute = timeOfDayToMinutes(data.endTime);
                          }
                          subtitleText = '${formatMinutes(openMinute)} 〜 ${formatMinutes(closeMinute)}';
                        }
                        
                        return Card(
                          margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          child: ListTile(
                            title: Text(
                              '$day日 ($weekday)',
                              style: TextStyle(color: weekdayColor, fontWeight: FontWeight.bold),
                            ),
                            subtitle: Text(
                              subtitleText,
                              style: data.isClosed
                                  ? const TextStyle(color: Colors.red, fontWeight: FontWeight.bold)
                                  : const TextStyle(),
                            ),
                            trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text(
                                '休業日',
                                style: TextStyle(fontSize: 14),
                              ),
                              const SizedBox(width: 8),
                              Checkbox(
                                value: data.isClosed,
                                onChanged: (value) {
                                  setState(() {
                                    final isClosed = value ?? false;
                                    TimeOfDay startTime = data.startTime;
                                    TimeOfDay endTime = data.endTime;
                                    String? styleId = data.styleId;
                                    
                                    // チェックを外した場合（休業日→営業日）、曜日に応じて営業スタイルを設定
                                    if (!isClosed && data.isClosed) {
                                      // 曜日を判定（1=月曜日、7=日曜日）
                                      final weekday = date.weekday;
                                      // 月〜金（1-5）は平日、土・日（6-7）は週末
                                      final determinedStyleId = (weekday >= 1 && weekday <= 5)
                                          ? GlobalConstants.businessHoursStyleWeekday
                                          : GlobalConstants.businessHoursStyleWeekendHoliday;
                                      
                                      // スタイルから営業時間を取得
                                      final styleData = GlobalConstants.getBusinessHoursByStyleId(determinedStyleId);
                                      if (styleData != null) {
                                        startTime = minutesToTimeOfDay(styleData['openMinute'] as int);
                                        endTime = minutesToTimeOfDay(styleData['closeMinute'] as int);
                                        styleId = determinedStyleId;
                                      }
                                    }
                                    // チェックを入れた場合（営業日→休業日）、styleIdを"closed"に設定
                                    else if (isClosed && !data.isClosed) {
                                      styleId = GlobalConstants.businessHoursStyleClosed;
                                    }
                                    
                                    _daysData[day] = DayBusinessHours(
                                      startTime: startTime,
                                      endTime: endTime,
                                      isClosed: isClosed,
                                      styleId: isClosed 
                                          ? GlobalConstants.businessHoursStyleClosed 
                                          : styleId,
                                    );
                                  });
                                },
                              ),
                            ],
                          ),
                          onTap: data.isClosed
                              ? null
                              : () async {
                                  await _showDayEditDialog(day, data);
                                },
                        ),
                      );
                    },
                    ),
                  ),
                ),
                // 保存ボタン
                Container(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      // 保存ボタン（保存時に自動的にシフト日も初期化される）
                      ElevatedButton.icon(
                        onPressed: _isSaving ? null : () => _saveBusinessHours(),
                        icon: _isSaving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.save),
                        label: const Text(
                          '営業時間を保存',
                          style: TextStyle(fontSize: 16),
                        ),
                        style: ElevatedButton.styleFrom(
                          minimumSize: const Size(double.infinity, 48),
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
  
  /// 日の営業時間編集ダイアログ（スタイル選択のみ）
  Future<void> _showDayEditDialog(int day, DayBusinessHours current) async {
    // 現在のスタイルIDを初期値として設定
    String? selectedStyleId = current.styleId;
    
    // スタイル選択肢（5つのスタイル）
    final styleOptions = [
      {
        'id': GlobalConstants.businessHoursStyleWeekday,
        'label': '平日（15:00-25:00）',
      },
      {
        'id': GlobalConstants.businessHoursStyleWeekendHoliday,
        'label': '週末・祝日（12:00-25:00）',
      },
      {
        'id': GlobalConstants.businessHoursStyleEvent,
        'label': 'イベント（10:00-25:00）',
      },
      {
        'id': GlobalConstants.businessHoursStyleAllDay,
        'label': '終日（6:00-25:00）',
      },
      {
        'id': GlobalConstants.businessHoursStyleClosed,
        'label': '休業日',
      },
    ];
    
    final yearMonth = DateFormat('yyyy-MM').format(_selectedMonth);
    final dayStr = day.toString().padLeft(2, '0');
    final dateKey = '$yearMonth-$dayStr';
    
    return showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          // スタイルが選択されている場合、営業時間を表示用に取得
          String? displayTimeRange;
          if (selectedStyleId != null) {
            final styleData = GlobalConstants.getBusinessHoursByStyleId(selectedStyleId!);
            if (styleData != null) {
              final openMinute = styleData['openMinute'] as int;
              final closeMinute = styleData['closeMinute'] as int;
              final isClosed = styleData['isClosed'] as bool;
              
              if (isClosed) {
                displayTimeRange = '休業日';
              } else {
                final openHour = openMinute ~/ 60;
                final openMin = openMinute % 60;
                final closeHour = closeMinute ~/ 60;
                final closeMin = closeMinute % 60;
                
                // 25:00の場合は25:00と表示
                if (closeHour == 25) {
                  displayTimeRange = '${openHour.toString().padLeft(2, '0')}:${openMin.toString().padLeft(2, '0')}-25:00';
                } else {
                  displayTimeRange = '${openHour.toString().padLeft(2, '0')}:${openMin.toString().padLeft(2, '0')}-${closeHour.toString().padLeft(2, '0')}:${closeMin.toString().padLeft(2, '0')}';
                }
              }
            }
          }
          
          return AlertDialog(
            title: Text('$day日の営業時間'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // スタイル選択
                  const Text('営業スタイル:', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  DropdownButton<String>(
                    value: selectedStyleId,
                    isExpanded: true,
                    hint: const Text('スタイルを選択'),
                    items: styleOptions.map((style) {
                      return DropdownMenuItem<String>(
                        value: style['id'] as String,
                        child: Text(style['label'] as String),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setDialogState(() {
                        selectedStyleId = value;
                        // スタイルが変更されたので、displayTimeRangeも再計算される
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                  // 選択されたスタイルの営業時間を表示（編集不可）
                  if (selectedStyleId != null && displayTimeRange != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.access_time, size: 20, color: Colors.grey),
                          const SizedBox(width: 8),
                          Text(
                            '営業時間: $displayTimeRange',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    '※営業スタイルを選択すると、対応する営業時間が自動的に設定されます。',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('キャンセル'),
              ),
              ElevatedButton(
                onPressed: selectedStyleId == null
                    ? null
                    : () {
                        if (selectedStyleId == null) return;
                        final styleData = GlobalConstants.getBusinessHoursByStyleId(selectedStyleId!);
                        if (styleData == null) return;
                        final openMinute = styleData['openMinute'] as int;
                        final closeMinute = styleData['closeMinute'] as int;
                        final isClosed = styleData['isClosed'] as bool;
                        setState(() {
                          _daysData[day] = DayBusinessHours(
                            startTime: minutesToTimeOfDay(openMinute),
                            endTime: minutesToTimeOfDay(closeMinute),
                            isClosed: isClosed,
                            styleId: isClosed
                                ? GlobalConstants.businessHoursStyleClosed
                                : selectedStyleId,
                          );
                        });
                        Navigator.pop(dialogContext);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('編集内容は「営業時間を保存」で反映されます'),
                            backgroundColor: Colors.blue,
                          ),
                        );
                      },
                child: const Text('決定'),
              ),
            ],
          );
        },
      ),
    );
  }
  
  String _formatTimeOfDay(TimeOfDay time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }
}

/// 1日の営業時間データ
class DayBusinessHours {
  final TimeOfDay startTime;
  final TimeOfDay endTime;
  final bool isClosed;
  final String? styleId; // 営業スタイルID（オプション）
  
  DayBusinessHours({
    required this.startTime,
    required this.endTime,
    required this.isClosed,
    this.styleId,
  });
}
