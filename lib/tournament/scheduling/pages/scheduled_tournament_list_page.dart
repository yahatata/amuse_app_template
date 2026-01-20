import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
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
  
  // 各期間のトーナメントデータを保持
  final Map<String, List<Map<String, dynamic>>> _tournamentsByPeriod = {};
  
  // テンプレート情報のキャッシュ
  final Map<String, Map<String, dynamic>> _templateCache = {};
  
  // 各期間のストリームをキャッシュ
  final Map<String, Stream<QuerySnapshot>> _streamCache = {};
  
  // 処理中の期間を追跡（重複処理を防ぐ）
  final Set<String> _processingPeriods = {};

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
    // StreamBuilderが自動的にデータを読み込むため、初期読み込みは不要
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
                            final oldPeriod = _selectedPeriod;
                            setState(() {
                              _selectedPeriod = period['key'];
                            });
                            // 古い期間のストリームキャッシュをクリア（メモリ節約のため）
                            if (oldPeriod != period['key']) {
                              _streamCache.remove(oldPeriod);
                              _processingPeriods.remove(oldPeriod);
                            }
                            // StreamBuilderが自動的に新しい期間のデータを読み込む
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
            child: StreamBuilder<QuerySnapshot>(
              stream: _getTournamentsStream(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircularProgressIndicator(),
                        SizedBox(height: 16),
                        Text('トーナメントを読み込み中...'),
                      ],
                    ),
                  );
                }
                
                if (snapshot.hasError) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error, color: Colors.red, size: 48),
                        const SizedBox(height: 16),
                        Text(
                          'エラーが発生しました: ${snapshot.error}',
                          style: const TextStyle(fontSize: 16, color: Colors.red),
                        ),
                      ],
                    ),
                  );
                }
                
                if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                  return const Center(
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
                  );
                }
                
                // ストリームから最新データを取得して更新（非同期処理）
                // 重複処理を防ぐため、処理中でない場合のみ実行
                if (snapshot.hasData && !_processingPeriods.contains(_selectedPeriod)) {
                  _processingPeriods.add(_selectedPeriod);
                  _convertSnapshotToTournaments(snapshot.data!).then((streamTournaments) {
                    if (mounted) {
                      setState(() {
                        _tournamentsByPeriod[_selectedPeriod] = streamTournaments;
                        _processingPeriods.remove(_selectedPeriod);
                      });
                    } else {
                      _processingPeriods.remove(_selectedPeriod);
                    }
                  }).catchError((error) {
                    _processingPeriods.remove(_selectedPeriod);
                    debugPrint('トーナメントデータ変換エラー: $error');
                  });
                }
                
                // 現在のデータを表示（非同期処理が完了するまでの間は既存データを表示）
                final tournaments = _getCurrentTournaments();
                
                if (tournaments.isEmpty) {
                  return const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircularProgressIndicator(),
                        SizedBox(height: 16),
                        Text('トーナメントを読み込み中...'),
                      ],
                    ),
                  );
                }
                
                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: tournaments.length,
                  itemBuilder: (context, index) {
                    final tournament = tournaments[index];
                    return _buildTournamentCard(context, tournament);
                  },
                );
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

  /// 現在選択されている期間のトーナメントを取得
  List<Map<String, dynamic>> _getCurrentTournaments() {
    return _tournamentsByPeriod[_selectedPeriod] ?? [];
  }
  
  /// 現在選択されている期間のトーナメントストリームを取得
  Stream<QuerySnapshot> _getTournamentsStream() {
    // キャッシュにストリームがある場合はそれを返す
    if (_streamCache.containsKey(_selectedPeriod)) {
      return _streamCache[_selectedPeriod]!;
    }
    
    // 期間に応じたクエリを構築
    Query query = _firestore
        .collection('scheduledTournaments')
        .where('isArchived', isEqualTo: false);
    
    // 期間に応じたフィルタリング（日本時間基準）
    final jstToday = DateTimeUtils.getTodayStartJST();
    final jstTodayUTC = DateTimeUtils.jstToUTC(jstToday);
    final jstTodayTimestamp = Timestamp.fromDate(jstTodayUTC);
    
    switch (_selectedPeriod) {
      case 'yesterday':
        final jstYesterday = DateTimeUtils.getYesterdayStartJST();
        final jstYesterdayUTC = DateTimeUtils.jstToUTC(jstYesterday);
        final jstYesterdayTimestamp = Timestamp.fromDate(jstYesterdayUTC);
        final jstYesterdayEndTimestamp = Timestamp.fromDate(jstTodayUTC);
        
        query = query
            .where('startAt', isGreaterThanOrEqualTo: jstYesterdayTimestamp)
            .where('startAt', isLessThan: jstYesterdayEndTimestamp);
        break;
        
      case 'today':
        final jstTomorrow = DateTimeUtils.getTomorrowStartJST();
        final jstTomorrowUTC = DateTimeUtils.jstToUTC(jstTomorrow);
        final jstTomorrowTimestamp = Timestamp.fromDate(jstTomorrowUTC);
        
        query = query
            .where('startAt', isGreaterThanOrEqualTo: jstTodayTimestamp)
            .where('startAt', isLessThan: jstTomorrowTimestamp);
        break;
        
      case 'thisWeek':
        final jstNext7DaysStart = DateTimeUtils.getNext7DaysStartJST();
        final jstNext7DaysEnd = DateTimeUtils.getNext7DaysEndJST();
        final jstNext7DaysStartUTC = DateTimeUtils.jstToUTC(jstNext7DaysStart);
        final jstNext7DaysEndUTC = DateTimeUtils.jstToUTC(jstNext7DaysEnd);
        final jstNext7DaysStartTimestamp = Timestamp.fromDate(jstNext7DaysStartUTC);
        final jstNext7DaysEndTimestamp = Timestamp.fromDate(jstNext7DaysEndUTC);
        
        query = query
            .where('startAt', isGreaterThanOrEqualTo: jstNext7DaysStartTimestamp)
            .where('startAt', isLessThanOrEqualTo: jstNext7DaysEndTimestamp);
        break;
        
      case 'all':
      default:
        // 7日前以降
        final jst7DaysAgo = jstToday.subtract(const Duration(days: 7));
        final jst7DaysAgoUTC = DateTimeUtils.jstToUTC(jst7DaysAgo);
        final jst7DaysAgoTimestamp = Timestamp.fromDate(jst7DaysAgoUTC);
        
        query = query.where('startAt', isGreaterThanOrEqualTo: jst7DaysAgoTimestamp);
        break;
    }
    
    // 開始時刻で昇順ソート
    query = query.orderBy('startAt', descending: false);
    
    // 最大100件まで取得
    query = query.limit(100);
    
    // ストリームをキャッシュに保存
    final stream = query.snapshots();
    _streamCache[_selectedPeriod] = stream;
    
    return stream;
  }
  
  /// QuerySnapshotをトーナメントデータに変換
  Future<List<Map<String, dynamic>>> _convertSnapshotToTournaments(QuerySnapshot snapshot) async {
    // トーナメントテンプレート情報を取得
    final templateIds = snapshot.docs
        .map((doc) {
          final data = doc.data() as Map<String, dynamic>?;
          return data?['templateId'] as String?;
        })
        .where((id) => id != null)
        .toSet()
        .toList();
    
    // キャッシュにないテンプレートIDのみ取得
    final missingTemplateIds = templateIds.where((id) => !_templateCache.containsKey(id)).toList();
    
    // whereInは最大10個までなので、バッチ処理
    if (missingTemplateIds.isNotEmpty) {
      for (var i = 0; i < missingTemplateIds.length; i += 10) {
        final batch = missingTemplateIds.skip(i).take(10).toList();
        final templateSnapshots = await _firestore
            .collection('tournamentTemplates')
            .where(FieldPath.documentId, whereIn: batch)
            .get();
        
        for (final doc in templateSnapshots.docs) {
          _templateCache[doc.id] = doc.data() as Map<String, dynamic>;
        }
      }
    }
    
    final templateMap = _templateCache;
    
    // トーナメントデータを変換
    final List<Map<String, dynamic>> tournaments = snapshot.docs.map((doc) {
      final data = doc.data() as Map<String, dynamic>;
      final templateId = data['templateId'] as String?;
      final templateData = templateId != null ? templateMap[templateId] : null;
      final snapshotData = data['snapshot'] as Map<String, dynamic>?;
      
      // トーナメント名と詳細情報を取得
      String tournamentName = '無名トーナメント';
      int maxEntrants = 0;
      int entryFee = 0;
      
      if (snapshotData != null && snapshotData['name'] != null) {
        tournamentName = snapshotData['name'] as String;
        maxEntrants = (snapshotData['maxEntrants'] as num?)?.toInt() ?? 0;
        entryFee = (snapshotData['entryFee'] as num?)?.toInt() ?? 0;
      } else if (templateData != null) {
        tournamentName = templateData['name'] as String? ?? '無名トーナメント';
        maxEntrants = (templateData['maxEntrants'] as num?)?.toInt() ?? 0;
        entryFee = (templateData['entryFee'] as num?)?.toInt() ?? 0;
      }
      
      // TimestampをISO文字列に変換
      String convertTimestamp(Timestamp? timestamp) {
        if (timestamp == null) return '';
        return timestamp.toDate().toIso8601String();
      }
      
      return {
        'id': doc.id,
        'name': tournamentName,
        'templateId': templateId,
        'startAt': convertTimestamp(data['startAt'] as Timestamp?),
        'regEndAt': convertTimestamp(data['regEndAt'] as Timestamp?),
        'status': data['status'] as String? ?? 'scheduled', // ドキュメント直下のstatusを参照
        'entries': (data['views'] as Map<String, dynamic>?)?['main']?['entries'] as num? ?? 0,
        'maxEntrants': maxEntrants,
        'entryFee': entryFee,
        'currentLevel': (data['views'] as Map<String, dynamic>?)?['main']?['currentLevel'] as num? ?? 1,
        'playersIn': (data['views'] as Map<String, dynamic>?)?['main']?['playersIn'] as num? ?? 0,
        'seatedCount': (data['views'] as Map<String, dynamic>?)?['main']?['seatedCount'] as num? ?? 0,
        'waitingCount': (data['views'] as Map<String, dynamic>?)?['main']?['waitingCount'] as num? ?? 0,
        'createdAt': convertTimestamp(data['createdAt'] as Timestamp?),
        'updatedAt': convertTimestamp(data['updatedAt'] as Timestamp?),
      };
    }).toList();
    
    // 開始時刻で降順ソート（最新が上）
    tournaments.sort((a, b) {
      final dateA = DateTime.tryParse(a['startAt'] as String? ?? '');
      final dateB = DateTime.tryParse(b['startAt'] as String? ?? '');
      if (dateA == null && dateB == null) return 0;
      if (dateA == null) return 1;
      if (dateB == null) return -1;
      return dateB.compareTo(dateA);
    });
    
    return tournaments;
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
          // StreamBuilderが自動的に更新するため、手動更新は不要
          // ストリームキャッシュをクリアして再読み込みを促す
          _streamCache.remove(_selectedPeriod);
          _processingPeriods.remove(_selectedPeriod);

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
    // ドキュメント直下のstatusを参照
    final status = tournament['status'] as String? ?? 'scheduled';
    final statusColor = _getStatusColor(status);
    final statusText = _getStatusText(status);
    
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
