import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/tournament/active/pages/tournament_home_page.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/utils/date_time_utils.dart';
import 'scheduled_tournament_in_calendar_page.dart';

class ScheduledTournamentListPage extends StatefulWidget {
  const ScheduledTournamentListPage({super.key});

  @override
  State<ScheduledTournamentListPage> createState() => _ScheduledTournamentListPageState();
}

class _ScheduledTournamentListPageState extends State<ScheduledTournamentListPage> {
  final TournamentService _service = TournamentServiceImpl();
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  bool _isLoading = false;
  List<Map<String, dynamic>> _tournamentTemplates = [];
  
  // トーナメント表示期間の選択
  String _selectedPeriod = 'today'; // デフォルトは今日
  final List<Map<String, dynamic>> _periodOptions = [
    {'key': 'yesterday', 'label': '昨日', 'icon': Icons.history},
    {'key': 'today', 'label': '今日', 'icon': Icons.today},
    {'key': 'thisWeek', 'label': '今後7日', 'icon': Icons.view_week},
    {'key': 'all', 'label': '7日前以降', 'icon': Icons.all_inclusive},
  ];
  
  // Firestoreから取得するスケジュール済みトーナメント
  List<Map<String, dynamic>> _scheduledTournaments = [];
  bool _isLoadingTournaments = false;

  @override
  void initState() {
    super.initState();
    
    // テスト用: DateTimeUtilsの動作確認
    try {
      final testDate = DateTimeUtils.getNext7DaysStartJST();
      debugPrint('DateTimeUtilsテスト成功: $testDate');
    } catch (e) {
      debugPrint('DateTimeUtilsテスト失敗: $e');
    }
    
    _loadTournamentTemplates();
    _loadScheduledTournaments();
  }

  /// スケジュール済みトーナメントを読み込み
  Future<void> _loadScheduledTournaments() async {
    setState(() {
      _isLoadingTournaments = true;
    });

    try {
      debugPrint('=== スケジュール済みトーナメント取得開始 ===');
      debugPrint('選択期間: $_selectedPeriod');
      
      final callable = _functions.httpsCallable('getScheduledTournaments');
      final result = await callable.call({
        'period': _selectedPeriod,
      });
      final response = result.data;

      debugPrint('Cloud Functions レスポンス: $response');

      if (response['success'] == true) {
        final List<dynamic> rawTournaments = response['scheduledTournaments'] ?? [];
        debugPrint('生データ件数: ${rawTournaments.length}');
        
        if (rawTournaments.isNotEmpty) {
          debugPrint('最初のトーナメント: ${rawTournaments.first}');
        }
        
        final List<Map<String, dynamic>> convertedTournaments = rawTournaments.map((tournament) {
          final Map<String, dynamic> converted = {};
          (tournament as Map).forEach((key, value) {
            converted[key.toString()] = value;
          });
          return converted;
        }).toList();

        debugPrint('変換後件数: ${convertedTournaments.length}');

        setState(() {
          _scheduledTournaments = convertedTournaments;
          _isLoadingTournaments = false;
        });
        
        debugPrint('setState完了: _scheduledTournaments.length = ${_scheduledTournaments.length}');
      } else {
        debugPrint('Cloud Functions エラー: ${response['error']}');
        throw Exception(response['error'] ?? 'スケジュール済みトーナメントの取得に失敗しました');
      }
    } catch (e) {
      debugPrint('例外発生: $e');
      setState(() {
        _isLoadingTournaments = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('スケジュール済みトーナメント取得エラー: $e')),
        );
      }
    }
  }

  /// トーナメントテンプレートを読み込み
  Future<void> _loadTournamentTemplates() async {
    // setState(() {
    //   _isLoadingTemplates = true;
    // });

    try {
      final callable = _functions.httpsCallable('getTournamentTemplates');
      final result = await callable.call({});
      final response = result.data;

      if (response['success'] == true) {
        final List<dynamic> rawTemplates = response['tournamentTemplates'] ?? [];
        final List<Map<String, dynamic>> convertedTemplates = rawTemplates.map((template) {
          final Map<String, dynamic> converted = {};
          (template as Map).forEach((key, value) {
            converted[key.toString()] = value;
          });
          return converted;
        }).toList();

        setState(() {
          _tournamentTemplates = convertedTemplates;
          // _isLoadingTemplates = false;
        });
      } else {
        throw Exception(response['error'] ?? 'テンプレートの取得に失敗しました');
      }
    } catch (e) {
      // setState(() {
      //   _isLoadingTemplates = false;
      // });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('テンプレート取得エラー: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('スケジュール済みトーナメント一覧'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_month),
            tooltip: 'カレンダー表示',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const ScheduledTournamentInCalendarPage(),
                ),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // トーナメント期間切り替えボタン
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: Colors.grey[50],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '表示期間',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.grey[800],
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: _periodOptions.map((period) {
                    final isSelected = _selectedPeriod == period['key'];
                    return Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: ElevatedButton.icon(
                          onPressed: () {
                            debugPrint('期間切り替え: ${period['key']}');
                            setState(() {
                              _selectedPeriod = period['key'];
                            });
                            // 期間が変更されたらデータを再読み込み
                            _loadScheduledTournaments();
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: isSelected ? Colors.blue : Colors.grey[200],
                            foregroundColor: isSelected ? Colors.white : Colors.grey[700],
                            elevation: isSelected ? 2 : 0,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                          icon: Icon(period['icon'], size: 18),
                          label: Text(
                            period['label'],
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          
          // トーナメント一覧
          Expanded(
            child: _isLoadingTournaments
                ? const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircularProgressIndicator(),
                        SizedBox(height: 16),
                        Text('トーナメントを読み込み中...'),
                      ],
                    ),
                  )
                : _getFilteredTournaments().isEmpty
                    ? const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.event_note,
                              size: 64,
                              color: Colors.grey,
                            ),
                            SizedBox(height: 16),
                            Text(
                              '選択された期間にスケジュールされたトーナメントがありません',
                              style: TextStyle(
                                fontSize: 18,
                                color: Colors.grey,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _getFilteredTournaments().length,
                        itemBuilder: (context, index) {
                          final tournament = _getFilteredTournaments()[index];
                          return _buildTournamentCard(context, tournament);
                        },
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _isLoading ? null : _showCreateTournamentDialog,
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        icon: _isLoading 
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
            )
          : const Icon(Icons.add),
        label: Text(_isLoading ? '作成中...' : 'トーナメント作成'),
      ),
    );
  }

  /// トーナメント作成ダイアログを表示
  void _showCreateTournamentDialog() {
    if (_tournamentTemplates.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('利用可能なテンプレートがありません')),
      );
      return;
    }

    Map<String, dynamic>? selectedTemplate;
    final startDateController = TextEditingController();
    final startTimeController = TextEditingController(text: '19:00');
    
    // 明日の日付をデフォルトに設定
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    startDateController.text = '${tomorrow.year}-${tomorrow.month.toString().padLeft(2, '0')}-${tomorrow.day.toString().padLeft(2, '0')}';

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('新しいトーナメントを作成'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // テンプレート選択
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'トーナメントテンプレート',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      DropdownButtonFormField<Map<String, dynamic>>(
                        value: selectedTemplate,
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
                          selectedTemplate = value;
                        },
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                
                // 開始日
                TextField(
                  controller: startDateController,
                  decoration: const InputDecoration(
                    labelText: '開始日',
                    hintText: 'YYYY-MM-DD',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) {
                    // 日付フォーマットの自動補完
                    if (value.length == 4 && !value.contains('-')) {
                      startDateController.text = '${value.substring(0, 4)}-';
                      startDateController.selection = TextSelection.fromPosition(
                        TextPosition(offset: startDateController.text.length),
                      );
                    } else if (value.length == 7 && value.split('-').length == 2) {
                      final parts = value.split('-');
                      if (parts[1].length == 2) {
                        startDateController.text = '${parts[0]}-${parts[1]}-';
                        startDateController.selection = TextSelection.fromPosition(
                          TextPosition(offset: startDateController.text.length),
                        );
                      }
                    }
                  },
                ),
                const SizedBox(height: 16),
                
                // 開始時刻
                TextField(
                  controller: startTimeController,
                  decoration: const InputDecoration(
                    labelText: '開始時刻',
                    hintText: 'HH:MM',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) {
                    // 時刻フォーマットの自動補完
                    if (value.length == 2 && !value.contains(':')) {
                      startTimeController.text = '${value}:';
                      startTimeController.selection = TextSelection.fromPosition(
                        TextPosition(offset: startTimeController.text.length),
                      );
                    }
                  },
                ),
                const SizedBox(height: 16),
                
                // レジスト終了時刻（自動計算表示）
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.grey[100],
                    border: Border.all(color: Colors.grey),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'レジスト終了時刻（自動計算）',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Builder(
                        builder: (context) {
                          if (selectedTemplate == null) {
                            return const Text('テンプレートを選択してください', style: TextStyle(color: Colors.grey));
                          }
                          
                          try {
                            final startAt = DateTime.parse('${startDateController.text}T${startTimeController.text}:00');
                            final regEndAt = startAt.subtract(const Duration(minutes: 30)); // 30分前に設定
                            return Text(
                              '${regEndAt.hour.toString().padLeft(2, '0')}:${regEndAt.minute.toString().padLeft(2, '0')}',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            );
                          } catch (e) {
                            return const Text('日時を正しく入力してください', style: TextStyle(color: Colors.red));
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (selectedTemplate == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('テンプレートを選択してください')),
                  );
                  return;
                }
                
                Navigator.of(context).pop();
                await _createTournament(
                  selectedTemplate!['id'],
                  startDateController.text,
                  startTimeController.text,
                );
              },
              child: const Text('作成'),
            ),
          ],
        );
      },
    );
  }

  /// 選択された期間に応じてトーナメントをフィルタリング（日本時間基準）
  List<Map<String, dynamic>> _getFilteredTournaments() {
    switch (_selectedPeriod) {
      case 'yesterday':
        final yesterday = DateTimeUtils.getYesterdayStartJST();
        return _scheduledTournaments.where((tournament) {
          try {
            // Firestoreから取得したデータはUTCのISO文字列なので、日本時間に変換
            final startAt = DateTimeUtils.parseISOToJST(tournament['startAt'] ?? '');
            return DateTimeUtils.isSameDayJSTAlready(startAt, yesterday);
          } catch (e) {
            return false;
          }
        }).toList();
        
      case 'today':
        final today = DateTimeUtils.getTodayStartJST();
        
        // デバッグ用ログ
        debugPrint('=== 今日のフィルタリング ===');
        debugPrint('現在時刻 (JST): ${DateTimeUtils.getCurrentJST()}');
        debugPrint('今日の開始 (JST): $today');
        debugPrint('フィルタリング対象トーナメント数: ${_scheduledTournaments.length}');
        
        final filtered = _scheduledTournaments.where((tournament) {
          try {
            // Firestoreから取得したデータはUTCのISO文字列なので、日本時間に変換
            final startAt = DateTimeUtils.parseISOToJST(tournament['startAt'] ?? '');
            final isSameDay = DateTimeUtils.isSameDayJSTAlready(startAt, today);
            
            // デバッグ用ログ
            debugPrint('トーナメント: ${tournament['name']} (${tournament['startAt']})');
            debugPrint('  startAt (UTC): ${tournament['startAt']}');
            debugPrint('  startAt (JST): $startAt');
            debugPrint('  today (JST): $today');
            debugPrint('  今日と同じ日: $isSameDay');
            
            return isSameDay;
          } catch (e) {
            debugPrint('エラー: $e');
            return false;
          }
        }).toList();
        
        debugPrint('フィルタリング結果: ${filtered.length}件');
        return filtered;
        
      case 'thisWeek':
        final next7DaysStart = DateTimeUtils.getNext7DaysStartJST();
        final next7DaysEnd = DateTimeUtils.getNext7DaysEndJST();
        
        // デバッグ用ログ
        debugPrint('=== 今後7日のフィルタリング ===');
        debugPrint('next7DaysStart: $next7DaysStart');
        debugPrint('next7DaysEnd: $next7DaysEnd');
        debugPrint('フィルタリング対象トーナメント数: ${_scheduledTournaments.length}');
        
        final filtered = _scheduledTournaments.where((tournament) {
          try {
            // Firestoreから取得したデータはUTCのISO文字列なので、日本時間に変換
            final startAt = DateTimeUtils.parseISOToJST(tournament['startAt'] ?? '');
            final isInRange = DateTimeUtils.isInDateRangeJSTAlready(startAt, next7DaysStart, next7DaysEnd);
            
            // デバッグ用ログ
            debugPrint('トーナメント: ${tournament['name']} (${tournament['startAt']})');
            debugPrint('  startAt (JST): $startAt');
            debugPrint('  範囲内: $isInRange');
            
            return isInRange;
          } catch (e) {
            debugPrint('エラー: $e');
            return false;
          }
        }).toList();
        
        debugPrint('フィルタリング結果: ${filtered.length}件');
        return filtered;
        
      case 'all':
      default:
        // Cloud Functions側で7日前以降にフィルタリング済み
        debugPrint('=== 7日前以降のフィルタリング ===');
        debugPrint('フィルタリング対象トーナメント数: ${_scheduledTournaments.length}');
        debugPrint('Cloud Functions側でフィルタリング済み');
        return _scheduledTournaments;
    }
  }

  /// トーナメントを作成
  Future<void> _createTournament(
    String templateId,
    String startDate,
    String startTime,
  ) async {
    if (templateId.isEmpty || startDate.isEmpty || startTime.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('すべての項目を入力してください')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // 日時フォーマットの検証と正規化
      final normalizedStartDate = startDate.trim();
      final normalizedStartTime = startTime.trim();
      
      // 日付と時刻の形式をチェック
      if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(normalizedStartDate)) {
        throw Exception('開始日の形式が正しくありません (YYYY-MM-DD)');
      }
      
      if (!RegExp(r'^\d{2}:\d{2}$').hasMatch(normalizedStartTime)) {
        throw Exception('開始時刻の形式が正しくありません (HH:MM)');
      }
      
      // 日時を組み立て（日本時間として解釈）
      final startAtJST = DateTime.parse('${normalizedStartDate}T${normalizedStartTime}:00');
      final regEndAtJST = startAtJST.subtract(const Duration(minutes: 30)); // 開始時刻の30分前
      
      // 日本時間をUTCに変換（JST = UTC+9）
      final startAt = startAtJST.subtract(const Duration(hours: 9));
      final regEndAt = regEndAtJST.subtract(const Duration(hours: 9));

      // デバッグ用: 送信データをログ出力
      debugPrint('送信データ:');
      debugPrint('templateId: $templateId');
      debugPrint('startAtJST: ${startAtJST.toIso8601String()}');
      debugPrint('startAt (UTC): ${startAt.toIso8601String()}');
      debugPrint('regEndAtJST: ${regEndAtJST.toIso8601String()}');
      debugPrint('regEndAt (UTC): ${regEndAt.toIso8601String()}');
      
      // 完全な送信オブジェクトをログ出力
      final requestData = {
        'templateId': templateId,
        'startAt': startAt.toIso8601String(),
        'regEndAt': regEndAt.toIso8601String(),
        'freeze': false,
        'storeId': 'default-store',
        'tenantId': 'default-tenant',
      };
      debugPrint('完全なリクエストデータ: ${requestData.toString()}');

      final result = await _service.createScheduledTournament(
        templateId: templateId,
        startAt: startAt,
        regEndAt: regEndAt,
      );

      if (result['success'] == true) {
        final tournamentId = result['tournamentId'] as String;
        final message = result['message'] as String;
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(message)),
          );

          // スケジュール済みトーナメントリストを更新
          await _loadScheduledTournaments();

          // 作成されたトーナメントの画面に遷移
          if (mounted) {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => TournamentHomePage(
                  tournamentId: tournamentId,
                  tournamentName: '新規作成トーナメント',
                ),
              ),
            );
          }
        }
      } else {
        throw Exception(result['error'] ?? 'トーナメントの作成に失敗しました');
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

  Widget _buildTournamentCard(BuildContext context, Map<String, dynamic> tournament) {
    final statusColor = _getStatusColor(tournament['status']);
    final statusText = _getStatusText(tournament['status']);
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => TournamentHomePage(
                tournamentId: tournament['id'],
                tournamentName: tournament['name'] ?? '無名のトーナメント',
              ),
            ),
          );
        },
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // トーナメント名とステータス
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      tournament['name'],
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: statusColor,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      statusText,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 12),
              
              // トーナメント詳細情報
              Row(
                children: [
                  Icon(Icons.schedule, color: Colors.grey[600], size: 20),
                  const SizedBox(width: 8),
                  Text(
                    '開始時刻: ${_formatDateTime(tournament['startAt'])}',
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 8),
              
              Row(
                children: [
                  Icon(Icons.people, color: Colors.grey[600], size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'エントリー: ${tournament['entries']} / ${tournament['maxEntrants']}',
                    style: TextStyle(
                      color: Colors.grey[600],
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 12),
              
              // アクションボタン
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => TournamentHomePage(
                            tournamentId: tournament['id'],
                            tournamentName: tournament['name'] ?? '無名のトーナメント',
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.visibility),
                    label: const Text('詳細表示'),
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.blue,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'scheduled':
        return Colors.blue;
      case 'running':
        return Colors.orange;
      case 'registered':
        return Colors.green;
      case 'ended':
        return Colors.grey;
      case 'canceled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'scheduled':
        return '予定';
      case 'running':
        return '実施中（レジスト前）';
      case 'registered':
        return '実施中（レジスト済み）';
      case 'ended':
        return '終了';
      case 'canceled':
        return 'キャンセル';
      default:
        return '不明';
    }
  }
  
  /// 日時文字列を読みやすい形式にフォーマット（日本時間基準）
  String _formatDateTime(String? dateTimeString) {
    if (dateTimeString == null || dateTimeString.isEmpty) {
      return '未設定';
    }
    
    try {
      // Firestoreから取得したデータはUTCのISO文字列なので、日本時間に変換
      final jstDateTime = DateTimeUtils.parseISOToJST(dateTimeString);
      return DateTimeUtils.formatJSTForDisplay(jstDateTime);
    } catch (e) {
      // パースに失敗した場合は元の文字列を返す
      return dateTimeString;
    }
  }
}
