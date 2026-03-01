import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/globalConstant.dart';

class EditRecurringTournamentPage extends StatefulWidget {
  final String recurrenceId;
  final Map<String, dynamic> recurrenceData;

  const EditRecurringTournamentPage({
    super.key,
    required this.recurrenceId,
    required this.recurrenceData,
  });

  @override
  State<EditRecurringTournamentPage> createState() => _EditRecurringTournamentPageState();
}

class _EditRecurringTournamentPageState extends State<EditRecurringTournamentPage> {
  final _formKey = GlobalKey<FormState>();
  final _functions = FirebaseFunctions.instance;

  // 編集可能な項目
  bool _isActive = true;
  String _selectedTemplateId = '';
  int _interval = 1;
  List<String> _selectedWeekdays = [];
  List<String> _selectedTournamentIds = [];
  TimeOfDay _startTime = const TimeOfDay(hour: 19, minute: 0); // デフォルト19:00

  // データ
  List<Map<String, dynamic>> _tournamentTemplates = [];
  List<Map<String, dynamic>> _scheduledTournaments = [];
  bool _isLoading = false;
  bool _isSaving = false;
  String? _errorMessage;

  // 曜日オプション
  final List<Map<String, dynamic>> _weekdayOptions = [
    {'value': 'MO', 'label': '月曜日'},
    {'value': 'TU', 'label': '火曜日'},
    {'value': 'WE', 'label': '水曜日'},
    {'value': 'TH', 'label': '木曜日'},
    {'value': 'FR', 'label': '金曜日'},
    {'value': 'SA', 'label': '土曜日'},
    {'value': 'SU', 'label': '日曜日'},
  ];

  @override
  void initState() {
    super.initState();
    _initializeData();
    _loadTournamentTemplates();
    _loadScheduledTournaments();
  }

  /// 時刻選択ダイアログを表示
  Future<void> _selectTime() async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: _startTime,
    );
    if (picked != null && picked != _startTime) {
      setState(() {
        _startTime = picked;
      });
    }
  }

  void _initializeData() {
    // isActive
    final isActiveValue = widget.recurrenceData['isActive'];
    _isActive = isActiveValue is bool ? isActiveValue : true;

    // templateId
    final templateIdValue = widget.recurrenceData['templateId'];
    _selectedTemplateId = templateIdValue is String ? templateIdValue : '';

    // interval: int / "1" / "1week" / "1weeks" いずれも数値に変換
    final intervalValue = widget.recurrenceData['interval'];
    if (intervalValue is int) {
      _interval = intervalValue;
    } else if (intervalValue is String) {
      // 先頭の数字部分だけ取り出す（例: "2weeks" → 2）
      final match = RegExp(r'^\d+').firstMatch(intervalValue);
      _interval = match != null ? (int.tryParse(match.group(0)!) ?? 1) : 1;
    } else {
      _interval = 1;
    }

    // byWeekday
    final byWeekdayValue = widget.recurrenceData['byWeekday'];
    if (byWeekdayValue is List) {
      _selectedWeekdays =
          byWeekdayValue.map((item) => item.toString()).toList();
    } else {
      _selectedWeekdays = [];
    }

    // startTime: "HH:mm" 形式（Firestore snapshot から直接取得した値）
    final startTimeValue = widget.recurrenceData['startTime'];
    if (startTimeValue is String && startTimeValue.isNotEmpty) {
      final timeParts = startTimeValue.split(':');
      if (timeParts.length == 2) {
        final hour = int.tryParse(timeParts[0]) ?? 19;
        final minute = int.tryParse(timeParts[1]) ?? 0;
        _startTime = TimeOfDay(hour: hour, minute: minute);
      }
    }
  }

  Future<void> _loadTournamentTemplates() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final callable = _functions.httpsCallable('getTournamentTemplates');
      final result = await callable.call();
      final response = result.data;

      if (response['success'] == true) {
        final templatesRaw = response['tournamentTemplates'] as List;
        setState(() {
          _tournamentTemplates = templatesRaw.map((template) => 
            Map<String, dynamic>.from(template as Map)).toList();
        });
      } else {
        setState(() {
          _errorMessage = response['error'] ?? 'テンプレートの読み込みに失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'テンプレートの読み込みに失敗しました: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _loadScheduledTournaments() async {
    try {
      final now = DateTime.now();
      // 「2日前以前」を除外し、昨日以降のみ対象にする
      final minBusinessDate = DateFormat('yyyy-MM-dd').format(
        DateTime(now.year, now.month, now.day).subtract(const Duration(days: 1)),
      );
      final callable = _functions.httpsCallable('getScheduledTournamentsForEdit');
      final result = await callable.call({
        'type': 'recurrence',
        'id': widget.recurrenceId,
        'includeCancelled': true,
        'excludeBeforeBusinessDate': minBusinessDate,
      });
      final response = result.data;

      if (response['success'] == true) {
        final tournamentsRaw = response['tournaments'] as List;
        setState(() {
          _scheduledTournaments = tournamentsRaw.map((tournament) {
            final tournamentMap = Map<String, dynamic>.from(tournament as Map);
            
            // startAtの型変換（Firestore Timestamp -> DateTime）
            if (tournamentMap['startAt'] != null) {
              final startAtValue = tournamentMap['startAt'];
              if (startAtValue is Map && startAtValue.containsKey('_seconds')) {
                // Firestore Timestamp形式の場合
                final seconds = startAtValue['_seconds'] as int;
                final nanoseconds = startAtValue['_nanoseconds'] as int? ?? 0;
                tournamentMap['startAt'] = DateTime.fromMillisecondsSinceEpoch(
                  seconds * 1000 + (nanoseconds / 1000000).round(),
                );
              } else if (startAtValue is String) {
                // ISO文字列の場合
                tournamentMap['startAt'] = DateTime.parse(startAtValue);
              }
            }

            if (tournamentMap['regEndAt'] != null) {
              final regEndAtValue = tournamentMap['regEndAt'];
              if (regEndAtValue is Map && regEndAtValue.containsKey('_seconds')) {
                final seconds = regEndAtValue['_seconds'] as int;
                final nanoseconds = regEndAtValue['_nanoseconds'] as int? ?? 0;
                tournamentMap['regEndAt'] = DateTime.fromMillisecondsSinceEpoch(
                  seconds * 1000 + (nanoseconds / 1000000).round(),
                );
              } else if (regEndAtValue is String) {
                tournamentMap['regEndAt'] = DateTime.parse(regEndAtValue);
              }
            }
            
            return tournamentMap;
          }).toList();
          
          // startAtでソート（古い順、左上から右へ）
          _scheduledTournaments.sort((a, b) {
            final aStartAt = a['startAt'] as DateTime?;
            final bStartAt = b['startAt'] as DateTime?;
            if (aStartAt == null && bStartAt == null) return 0;
            if (aStartAt == null) return 1;
            if (bStartAt == null) return -1;
            return aStartAt.compareTo(bStartAt);
          });
        });
      } else {
        setState(() {
          _errorMessage = response['error'] ?? 'スケジュール済みトーナメントの読み込みに失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'スケジュール済みトーナメントの読み込みに失敗しました: $e';
      });
    }
  }

  Future<void> _saveChanges() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final callable = _functions.httpsCallable('updateTournamentRecurrence');
      final result = await callable.call({
        'recurrenceId': widget.recurrenceId,
        'isActive': _isActive,
        'templateId': _selectedTemplateId,
        'interval': _interval,
        'byWeekday': _selectedWeekdays,
        'startTime': '${_startTime.hour.toString().padLeft(2, '0')}:${_startTime.minute.toString().padLeft(2, '0')}',
        'selectedTournamentIds': _selectedTournamentIds,
      });
      final response = result.data;

      if (response['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? '更新が完了しました')),
        );
        Navigator.pop(context);
      } else {
        setState(() {
          _errorMessage = response['error'] ?? '更新に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = '更新に失敗しました: $e';
      });
    } finally {
      setState(() {
        _isSaving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('定期開催編集'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              ),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // エラーメッセージ
                    if (_errorMessage != null)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        color: Colors.red[100],
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),

                    const SizedBox(height: 16),

                    // 1. トーナメントの定期開催を停止
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '1. トーナメントの定期開催を停止',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            SwitchListTile(
                              title: const Text('定期開催を停止する'),
                              subtitle: const Text('停止すると新しいトーナメントは作成されません'),
                              value: !_isActive,
                              onChanged: (value) {
                                setState(() {
                                  _isActive = !value;
                                });
                              },
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    // 2. 適用するトーナメントテンプレートの変更
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '2. 適用するトーナメントテンプレートの変更',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            DropdownButtonFormField<String>(
                              value: _selectedTemplateId.isNotEmpty ? _selectedTemplateId : null,
                              decoration: const InputDecoration(
                                labelText: 'トーナメントテンプレート',
                                border: OutlineInputBorder(),
                              ),
                              items: _tournamentTemplates.map<DropdownMenuItem<String>>((template) {
                                return DropdownMenuItem<String>(
                                  value: template['id'] as String,
                                  child: Text(template['name'] ?? '無名テンプレート'),
                                );
                              }).toList(),
                              onChanged: (value) {
                                setState(() {
                                  _selectedTemplateId = value ?? '';
                                });
                              },
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    // 3. 開催間隔の修正
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '3. 開催間隔の修正',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            DropdownButtonFormField<int>(
                              value: _interval,
                              decoration: const InputDecoration(
                                labelText: '開催間隔',
                                border: OutlineInputBorder(),
                              ),
                              items: List.generate(5, (index) {
                                final weeks = index + 1;
                                return DropdownMenuItem(
                                  value: weeks,
                                  child: Text('$weeks週間'),
                                );
                              }),
                              onChanged: (value) {
                                setState(() {
                                  _interval = value ?? 1;
                                });
                              },
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    // 4. 開催曜日の変更
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '4. 開催曜日の変更',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: _weekdayOptions.map((weekday) {
                                final isSelected = _selectedWeekdays.contains(weekday['value']);
                                return FilterChip(
                                  label: Text(weekday['label']),
                                  selected: isSelected,
                                  onSelected: (selected) {
                                    setState(() {
                                      if (selected) {
                                        _selectedWeekdays.add(weekday['value']);
                                      } else {
                                        _selectedWeekdays.remove(weekday['value']);
                                      }
                                    });
                                  },
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 16),

                            // 開始時刻選択
                            const Text(
                              '開始時刻',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            InkWell(
                              onTap: _selectTime,
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  border: Border.all(color: Colors.grey),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.access_time, color: Colors.grey),
                                    const SizedBox(width: 12),
                                    Text(
                                      _startTime.format(context),
                                      style: const TextStyle(fontSize: 16),
                                    ),
                                    const Spacer(),
                                    const Icon(Icons.arrow_drop_down, color: Colors.grey),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    // スケジュール済みトーナメント選択
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '今回の編集内容を適用するトーナメントを選択してください',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              '※昨日以降のトーナメントを表示しています。キャンセル済みは選択できません。',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                            if (!_isActive)
                              const Text(
                                '※トーナメント定期開催の停止を行う場合は開催しないトーナメントを全て選択してください。',
                                style: TextStyle(fontSize: 12, color: Colors.orange),
                              ),
                            const SizedBox(height: 16),
                            if (_scheduledTournaments.isEmpty)
                              const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(32),
                                  child: Text(
                                    'スケジュール済みのトーナメントはありません',
                                    style: TextStyle(color: Colors.grey),
                                  ),
                                ),
                              )
                            else
                              GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 8,
                                  childAspectRatio: 1.2,
                                  crossAxisSpacing: 8,
                                  mainAxisSpacing: 8,
                                ),
                                itemCount: _scheduledTournaments.length,
                                itemBuilder: (context, index) {
                                  final tournament = _scheduledTournaments[index];
                                  final status = (tournament['status'] ?? 'scheduled').toString();
                                  final isCancelled = status == 'cancelled' || status == 'canceled';
                                  final recurrenceStartTime =
                                      (widget.recurrenceData['startTime'] ?? '').toString();
                                  final normalizedStartTime = recurrenceStartTime.trim();
                                  final isSelected = _selectedTournamentIds.contains(tournament['id']);
                                  final startAt = tournament['startAt'] as DateTime;
                                  final displayTime = DateFormat('HH:mm').format(startAt);
                                  final isTimeModified =
                                      normalizedStartTime.isNotEmpty &&
                                      displayTime != normalizedStartTime;
                                  
                                  return GestureDetector(
                                    onTap: isCancelled ? null : () {
                                      setState(() {
                                        if (isSelected) {
                                          _selectedTournamentIds.remove(tournament['id']);
                                        } else {
                                          _selectedTournamentIds.add(tournament['id']);
                                        }
                                      });
                                    },
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: isCancelled
                                            ? Colors.grey[200]
                                            : (isSelected ? Colors.blue : Colors.grey[300]),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: isCancelled
                                              ? Colors.red
                                              : (isSelected ? Colors.blue : Colors.grey),
                                          width: 2,
                                        ),
                                      ),
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            DateFormat('M/d').format(startAt),
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                              color: isCancelled
                                                  ? Colors.red
                                                  : (isSelected ? Colors.white : Colors.black),
                                            ),
                                          ),
                                          Text(
                                            displayTime,
                                            style: TextStyle(
                                              fontSize: 8,
                                              color: isCancelled
                                                  ? Colors.red
                                                  : (isSelected ? Colors.white : Colors.black),
                                            ),
                                          ),
                                          if (isCancelled)
                                            const Text(
                                              'キャンセル済み',
                                              style: TextStyle(
                                                fontSize: 7,
                                                color: Colors.red,
                                                fontWeight: FontWeight.bold,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              textAlign: TextAlign.center,
                                            ),
                                          if (!isCancelled && isTimeModified)
                                            const Text(
                                              '※スタート時刻修正済↩︎例外の定期トーナメント',
                                              style: TextStyle(
                                                fontSize: 7,
                                                color: Colors.red,
                                                fontWeight: FontWeight.bold,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              textAlign: TextAlign.center,
                                            ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // 保存ボタン
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _isSaving ? null : _saveChanges,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: _isSaving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                ),
                              )
                            : const Text(
                                '変更を保存',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
