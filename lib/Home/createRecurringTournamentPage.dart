import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';

/// 定期開催トーナメント作成画面
class CreateRecurringTournamentPage extends StatefulWidget {
  const CreateRecurringTournamentPage({super.key});

  @override
  State<CreateRecurringTournamentPage> createState() => _CreateRecurringTournamentPageState();
}

class _CreateRecurringTournamentPageState extends State<CreateRecurringTournamentPage> {
  List<Map<String, dynamic>> _tournamentTemplates = [];
  bool _isLoading = false;
  
  // フォームの状態
  Map<String, dynamic>? _selectedTemplate;
  DateTime? _selectedStartDate;
  String _selectedInterval = '1week';
  List<String> _selectedWeekdays = [];
  String? _endsOnText;
  TimeOfDay _startTime = const TimeOfDay(hour: 19, minute: 0); // デフォルト19:00
  
  // 間隔の選択肢
  final List<Map<String, String>> _intervalOptions = [
    {'value': '1week', 'label': '1週間ごと'},
    {'value': '2weeks', 'label': '2週間ごと'},
    {'value': '3weeks', 'label': '3週間ごと'},
    {'value': '4weeks', 'label': '4週間ごと'},
    {'value': '5weeks', 'label': '5週間ごと'},
  ];
  
  // 曜日の選択肢
  final List<Map<String, String>> _weekdayOptions = [
    {'value': 'MO', 'label': '月'},
    {'value': 'TU', 'label': '火'},
    {'value': 'WE', 'label': '水'},
    {'value': 'TH', 'label': '木'},
    {'value': 'FR', 'label': '金'},
    {'value': 'SA', 'label': '土'},
    {'value': 'SU', 'label': '日'},
  ];

  @override
  void initState() {
    super.initState();
    _loadTournamentTemplates();
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

  /// トーナメントテンプレートを読み込み
  Future<void> _loadTournamentTemplates() async {
    try {
      debugPrint('=== テンプレート読み込み開始 ===');
      final result = await FirebaseFunctions.instance
          .httpsCallable('getTournamentTemplates')
          .call();

      debugPrint('Cloud Function レスポンス: ${result.data}');
      
      if (result.data['success'] == true) {
        final templatesRaw = result.data['tournamentTemplates'] as List;
        debugPrint('取得したテンプレート数: ${templatesRaw.length}');
        
        // 型変換を明示的に行う
        final templates = templatesRaw.map((template) {
          return Map<String, dynamic>.from(template as Map);
        }).toList();
        
        setState(() {
          _tournamentTemplates = templates;
        });
        
        debugPrint('テンプレート読み込み完了: ${_tournamentTemplates.length}件');
      } else {
        debugPrint('Cloud Function エラー: ${result.data['error']}');
      }
    } catch (e) {
      debugPrint('テンプレートの読み込みに失敗しました: $e');
    }
  }

  /// 開始日選択ダイアログを表示
  Future<void> _selectStartDate() async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedStartDate ?? DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    
    if (picked != null && picked != _selectedStartDate) {
      setState(() {
        _selectedStartDate = picked;
      });
    }
  }

  /// 曜日選択を切り替え
  void _toggleWeekday(String weekday) {
    setState(() {
      if (_selectedWeekdays.contains(weekday)) {
        _selectedWeekdays.remove(weekday);
      } else {
        _selectedWeekdays.add(weekday);
      }
    });
  }

  /// 定期開催トーナメントを作成
  Future<void> _createRecurringTournament() async {
    if (_selectedTemplate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('テンプレートを選択してください')),
      );
      return;
    }

    if (_selectedStartDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('開始日を選択してください')),
      );
      return;
    }

    if (_selectedWeekdays.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('開催曜日を選択してください')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final requestData = {
        'templateId': _selectedTemplate!['id'],
        'startOn': DateFormat('yyyy-MM-dd').format(_selectedStartDate!),
        'interval': _selectedInterval,
        'byWeekday': _selectedWeekdays,
        'endsOn': _endsOnText?.isNotEmpty == true ? _endsOnText : null,
        'isActive': true,
        'startTime': '${_startTime.hour.toString().padLeft(2, '0')}:${_startTime.minute.toString().padLeft(2, '0')}',
      };

      debugPrint('送信データ: $requestData');

      final result = await FirebaseFunctions.instance
          .httpsCallable('createTournamentRecurrence')
          .call(requestData);

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(result.data['message'])),
          );
          Navigator.pop(context);
        }
      } else {
        throw Exception(result.data['error'] ?? '定期開催トーナメントの作成に失敗しました');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('エラー: $e')),
        );
      }
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('定期開催トーナメント作成'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // テンプレート選択
                  const Text(
                    'トーナメントテンプレート',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: DropdownButtonFormField<Map<String, dynamic>>(
                      value: _selectedTemplate,
                      hint: const Text('テンプレートを選択してください'),
                      items: _tournamentTemplates.map((template) {
                        return DropdownMenuItem<Map<String, dynamic>>(
                          value: template,
                          child: Text(
                            '${template['name'] ?? '無名テンプレート'} (¥${template['entryFee'] ?? 0})',
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() {
                          _selectedTemplate = value;
                        });
                      },
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // 開始日選択
                  const Text(
                    '開始日',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  InkWell(
                    onTap: _selectStartDate,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.calendar_today, color: Colors.grey),
                          const SizedBox(width: 12),
                          Text(
                            _selectedStartDate != null
                                ? DateFormat('yyyy年M月d日').format(_selectedStartDate!)
                                : '開始日を選択してください',
                            style: TextStyle(
                              fontSize: 16,
                              color: _selectedStartDate != null ? Colors.black : Colors.grey,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // 間隔選択
                  const Text(
                    '開催間隔',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: DropdownButtonFormField<String>(
                      value: _selectedInterval,
                      items: _intervalOptions.map((option) {
                        return DropdownMenuItem<String>(
                          value: option['value'],
                          child: Text(option['label']!),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() {
                          _selectedInterval = value!;
                        });
                      },
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // 開催曜日選択
                  const Text(
                    '開催曜日',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _weekdayOptions.map((option) {
                        final isSelected = _selectedWeekdays.contains(option['value']);
                        return FilterChip(
                          label: Text(option['label']!),
                          selected: isSelected,
                          onSelected: (selected) {
                            _toggleWeekday(option['value']!);
                          },
                          selectedColor: Colors.blue.withOpacity(0.3),
                          checkmarkColor: Colors.blue,
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // 開始時刻選択
                  const Text(
                    '開始時刻',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
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
                  const SizedBox(height: 24),

                  // 終了日（任意）
                  const Text(
                    '終了日（任意）',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    onChanged: (value) {
                      _endsOnText = value;
                    },
                    decoration: const InputDecoration(
                      hintText: 'YYYY-MM-DD（例: 2024-12-31）',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // 作成ボタン
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _createRecurringTournament,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                      ),
                      child: _isLoading
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text(
                              '定期開催トーナメントを作成',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
