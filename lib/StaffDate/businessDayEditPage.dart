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
  
  @override
  void initState() {
    super.initState();
    _loadBusinessHours();
  }
  
  /// 既存の営業時間データを読み込む
  Future<void> _loadBusinessHours() async {
    setState(() {
      _isLoading = true;
    });
    
    try {
      final yearMonth = DateFormat('yyyy-MM').format(_selectedMonth);
      final existingData = await _repository.getBusinessHoursForMonth(yearMonth);
      
      final daysInMonth = DateTime(_selectedMonth.year, _selectedMonth.month + 1, 0).day;
      final newDaysData = <int, DayBusinessHours>{};
      
      for (int day = 1; day <= daysInMonth; day++) {
        final dayStr = day.toString().padLeft(2, '0');
        final dateKey = '$yearMonth-$dayStr';
        
        if (existingData.containsKey(dateKey)) {
          // 既存データがある場合
          final businessHours = existingData[dateKey]!;
          newDaysData[day] = DayBusinessHours(
            startTime: minutesToTimeOfDay(businessHours.openMinute),
            endTime: minutesToTimeOfDay(businessHours.closeMinute),
            isClosed: businessHours.isClosed,
            styleId: businessHours.styleId,
          );
        } else {
          // 既存データがない場合はデフォルト値
          newDaysData[day] = DayBusinessHours(
            startTime: _defaultStartTime,
            endTime: _defaultEndTime,
            isClosed: false,
            styleId: null,
          );
        }
      }
      
      setState(() {
        _daysData = newDaysData;
        _existingBusinessHours = existingData; // 既存データを保持
        _isLoading = false;
      });
    } catch (e) {
      // エラー時はデフォルト値で初期化
      _initializeMonthWithDefaults();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('既存データの読み込みに失敗しました: ${e.toString()}'),
            backgroundColor: Colors.orange,
          ),
        );
      }
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
        _loadBusinessHours();
      }
    }
  }
  
  /// デフォルト開始時刻を選択
  Future<void> _selectDefaultStartTime() async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: _defaultStartTime,
    );
    if (picked != null) {
      setState(() {
        _defaultStartTime = picked;
      });
    }
  }
  
  /// デフォルト終了時刻を選択
  Future<void> _selectDefaultEndTime() async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: _defaultEndTime,
    );
    if (picked != null) {
      setState(() {
        _defaultEndTime = picked;
      });
    }
  }
  
  /// デフォルト値をすべての日（休業日以外）に適用
  void _applyDefaultToAllDays() {
    final updatedData = <int, DayBusinessHours>{};
    
    for (final entry in _daysData.entries) {
      updatedData[entry.key] = DayBusinessHours(
        startTime: entry.value.isClosed ? entry.value.startTime : _defaultStartTime,
        endTime: entry.value.isClosed ? entry.value.endTime : _defaultEndTime,
        isClosed: entry.value.isClosed,
        styleId: entry.value.styleId,
      );
    }
    
    setState(() {
      _daysData = updatedData;
    });
    
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('デフォルト値を適用しました（休業日は除く）')),
    );
  }
  
  /// 営業時間を保存
  Future<void> _saveBusinessHours() async {
    setState(() {
      _isSaving = true;
    });
    
    try {
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
                ? 1440  // 24:00として扱う
                : timeOfDayToMinutes(data.endTime);
        
        // 既存データと比較して変更があったかチェック
        final existing = _existingBusinessHours[dateKey];
        final hasChanged = existing == null || // 新規データ
            existing.openMinute != openMinute ||
            existing.closeMinute != closeMinute ||
            existing.isClosed != data.isClosed ||
            existing.styleId != data.styleId;
        
        // 変更があった日のみsource: "manual"、変更がない日は既存のsourceを保持
        final source = hasChanged 
            ? 'manual' 
            : (existing?.source ?? 'auto'); // 既存のsourceがない場合は"auto"
        
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
          'source': source,
        });
      }
      
      // 営業時間を保存
      await _repository.initBusinessHoursForMonth(
        yearMonth: yearMonth,
        days: days,
      );
      
      // 営業時間保存後、自動的にシフト日も初期化
      try {
        await _repository.initShiftDaysForMonth(yearMonth);
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${DateFormat('yyyy年M月').format(_selectedMonth)}の営業時間を保存し、シフト日を初期化しました'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (initError) {
        // シフト日初期化に失敗した場合でも、営業時間保存は成功している
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
      
      if (mounted) {
        // 保存後にデータを再読み込み（Firestoreの更新を反映）
        await _loadBusinessHours();
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
          _isSaving = false;
        });
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
                                  '※営業時間編集：日付をタップすると営業時間を個別に編集できます',
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
                      // デフォルト営業時間
                      const Text('デフォルト営業時間:', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _selectDefaultStartTime,
                              icon: const Icon(Icons.access_time),
                              label: Text(_formatTimeOfDay(_defaultStartTime)),
                            ),
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 8),
                            child: Text('〜'),
                          ),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _selectDefaultEndTime,
                              icon: const Icon(Icons.access_time),
                              label: Text(_formatTimeOfDay(_defaultEndTime)),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: _applyDefaultToAllDays,
                            child: const Text('全て適用'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                // 日付リスト
                Expanded(
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
                      
                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        child: ListTile(
                          title: Text(
                            '$day日 ($weekday)',
                            style: TextStyle(color: weekdayColor, fontWeight: FontWeight.bold),
                          ),
                          subtitle: data.isClosed
                              ? const Text('休業日', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold))
                              : Text('${_formatTimeOfDay(data.startTime)} 〜 ${_formatTimeOfDay(data.endTime)}'),
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
                                  // _showDayEditDialog内で既にsetBusinessHoursManualForDayを呼び出し、
                                  // データ再読み込みも行っているため、ここでの処理は不要
                                },
                        ),
                      );
                    },
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
  
  /// 日の営業時間編集ダイアログ（styleId選択対応）
  Future<void> _showDayEditDialog(int day, DayBusinessHours current) async {
    // 時間のみを管理（分は00固定）
    int startHour = current.startTime.hour;
    // 23:59の場合は24:00（1440分）として扱う
    int endHour = (current.endTime.hour == 23 && current.endTime.minute == 59)
        ? 24
        : current.endTime.hour;
    String? selectedStyleId;
    
    // 0時から23時までのオプション
    final List<int> hourOptions = List.generate(24, (index) => index);
    
    // スタイル選択肢
    final styleOptions = [
      {'id': GlobalConstants.businessHoursStyleWeekday, 'label': '平日（15:00-24:00）'},
      {'id': GlobalConstants.businessHoursStyleWeekendHoliday, 'label': '週末・祝日（12:00-24:00）'},
      {'id': GlobalConstants.businessHoursStyleClosed, 'label': '休業日'},
    ];
    
    final yearMonth = DateFormat('yyyy-MM').format(_selectedMonth);
    final dayStr = day.toString().padLeft(2, '0');
    final dateKey = '$yearMonth-$dayStr';
    
    return showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
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
                    hint: const Text('スタイルを選択（省略可）'),
                    items: styleOptions.map((style) {
                      return DropdownMenuItem<String>(
                        value: style['id'] as String,
                        child: Text(style['label'] as String),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setDialogState(() {
                          selectedStyleId = value;
                          // スタイルを選択すると、対応する営業時間を自動設定
                          final styleData = GlobalConstants.getBusinessHoursByStyleId(value);
                          if (styleData != null) {
                            startHour = (styleData['openMinute'] as int) ~/ 60;
                            endHour = (styleData['closeMinute'] as int) ~/ 60;
                            // 24:00の場合は24を表示
                            if (endHour == 24) {
                              endHour = 24;
                            }
                          }
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 24),
                  // 開始時刻
                  Row(
                    children: [
                      const Expanded(
                        child: Text('開始時刻'),
                      ),
                      Expanded(
                        child: DropdownButton<int>(
                          value: startHour,
                          items: hourOptions.map((hour) {
                            return DropdownMenuItem<int>(
                              value: hour,
                              child: Text('${hour.toString().padLeft(2, '0')}:00'),
                            );
                          }).toList(),
                          onChanged: (value) {
                            if (value != null) {
                              setDialogState(() {
                                startHour = value;
                              });
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // 終了時刻
                  Row(
                    children: [
                      const Expanded(
                        child: Text('終了時刻'),
                      ),
                      Expanded(
                        child: DropdownButton<int>(
                          value: endHour >= 24 ? 24 : endHour,
                          items: [
                            ...hourOptions,
                            24, // 24:00（終日）
                          ].map((hour) {
                            return DropdownMenuItem<int>(
                              value: hour,
                              child: Text(hour == 24 ? '24:00' : '${hour.toString().padLeft(2, '0')}:00'),
                            );
                          }).toList(),
                          onChanged: (value) {
                            if (value != null) {
                              setDialogState(() {
                                endHour = value;
                              });
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '※スタイルを選択すると営業時間が自動設定されます。手動で時間を変更することも可能です。',
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
                onPressed: () async {
                  // スタイルが選択されている場合はsetBusinessHoursManualForDayを使用
                  if (selectedStyleId != null) {
                    try {
                      final openMinute = startHour * 60;
                      final closeMinute = endHour >= 24 ? 1440 : endHour * 60;
                      
                      await _repository.setBusinessHoursManualForDay(
                        dateKey: dateKey,
                        styleId: selectedStyleId!,
                        openMinute: openMinute,
                        closeMinute: closeMinute,
                        isClosed: selectedStyleId == GlobalConstants.businessHoursStyleClosed,
                      );
                      
                      // データを再読み込み
                      await _loadBusinessHours();
                      
                      if (mounted) {
                        Navigator.pop(dialogContext);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('営業時間を保存しました（手動設定）'),
                            backgroundColor: Colors.green,
                          ),
                        );
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('保存に失敗しました: ${e.toString()}'),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    }
                  } else {
                    // スタイルが選択されていない場合は、既存の動作（ローカル保存のみ）
                    // 分は00固定でTimeOfDayを作成
                    final newStartTime = TimeOfDay(hour: startHour, minute: 0);
                    final newEndTime = TimeOfDay(hour: endHour >= 24 ? 23 : endHour, minute: 0);
                    
                    Navigator.pop(dialogContext);
                    setState(() {
                      _daysData[day] = DayBusinessHours(
                        startTime: newStartTime,
                        endTime: newEndTime,
                        isClosed: false,
                        styleId: current.styleId,
                      );
                    });
                  }
                },
                child: const Text('保存'),
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
