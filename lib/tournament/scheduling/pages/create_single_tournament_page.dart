import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';

/// 単発トーナメント作成画面
class CreateSingleTournamentPage extends StatefulWidget {
  const CreateSingleTournamentPage({super.key});

  @override
  State<CreateSingleTournamentPage> createState() => _CreateSingleTournamentPageState();
}

class _CreateSingleTournamentPageState extends State<CreateSingleTournamentPage> {
  final TournamentService _service = TournamentServiceImpl();
  
  // フォームコントローラー
  final _startDateController = TextEditingController();
  final _startTimeController = TextEditingController(text: '19:00');
  
  // データ
  List<Map<String, dynamic>> _tournamentTemplates = [];
  Map<String, dynamic>? _selectedTemplate;
  bool _isLoading = true;
  bool _isCreating = false;

  @override
  void initState() {
    super.initState();
    _loadTournamentTemplates();
    
    // 明日の日付をデフォルトに設定
    final tomorrow = DateTime.now().add(const Duration(days: 1));
    _startDateController.text = '${tomorrow.year}-${tomorrow.month.toString().padLeft(2, '0')}-${tomorrow.day.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _startDateController.dispose();
    _startTimeController.dispose();
    super.dispose();
  }

  /// トーナメントテンプレートを読み込み
  Future<void> _loadTournamentTemplates() async {
    debugPrint('=== テンプレート読み込み開始 ===');
    
    setState(() {
      _isLoading = true;
    });

    try {
      debugPrint('Firestoreクエリ実行中...');
      final snapshot = await FirebaseFirestore.instance
          .collection('tournamentTemplates')
          .where('isArchived', isEqualTo: false)
          .orderBy('updatedAt', descending: true)
          .get();

      debugPrint('クエリ実行完了');
      debugPrint('取得したドキュメント数: ${snapshot.docs.length}');

      if (snapshot.docs.isEmpty) {
        debugPrint('⚠️ ドキュメントが0件です');
      }

      final templates = snapshot.docs.map((doc) {
        final data = doc.data();
        debugPrint('ドキュメントID: ${doc.id}');
        debugPrint('  name: ${data['name']}');
        debugPrint('  entryFee: ${data['entryFee']}');
        debugPrint('  isArchived: ${data['isArchived']}');
        debugPrint('  createdAt: ${data['createdAt']}');
        
        return {
          'id': doc.id,
          'name': data['name'],
          'entryFee': data['entryFee'],
          ...data,
        };
      }).toList();

      debugPrint('変換後のテンプレート数: ${templates.length}');

      setState(() {
        _tournamentTemplates = templates;
        _isLoading = false;
      });
      
      debugPrint('=== テンプレート読み込み成功 ===');
    } catch (e, stackTrace) {
      debugPrint('=== テンプレート読み込みエラー ===');
      debugPrint('エラー: $e');
      debugPrint('スタックトレース: $stackTrace');
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('テンプレートの読み込みに失敗しました: $e')),
        );
      }
      setState(() {
        _isLoading = false;
      });
    }
  }

  /// トーナメントを作成
  Future<void> _createTournament() async {
    if (_selectedTemplate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('テンプレートを選択してください')),
      );
      return;
    }

    final templateId = _selectedTemplate!['id'] as String;
    final startDate = _startDateController.text.trim();
    final startTime = _startTimeController.text.trim();

    if (startDate.isEmpty || startTime.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('すべての項目を入力してください')),
      );
      return;
    }

    setState(() {
      _isCreating = true;
    });

    try {
      // 日付と時刻の形式をチェック
      if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(startDate)) {
        throw Exception('開始日の形式が正しくありません (YYYY-MM-DD)');
      }
      
      if (!RegExp(r'^\d{2}:\d{2}$').hasMatch(startTime)) {
        throw Exception('開始時刻の形式が正しくありません (HH:MM)');
      }
      
      // 日時を組み立て（日本時間として解釈）
      final startAtJST = DateTime.parse('${startDate}T${startTime}:00');
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

      final result = await _service.createScheduledTournament(
        templateId: templateId,
        startAt: startAt,
        regEndAt: regEndAt,
        context: context,
      );

      if (result['success'] == true) {
        final message = result['message'] as String;
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(message)),
          );

          // トーナメント作成メニュー画面に戻る
          Navigator.pop(context);
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
      if (mounted) {
        setState(() {
          _isCreating = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('単発トーナメント作成'),
        backgroundColor: Colors.grey[800],
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _tournamentTemplates.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 64, color: Colors.grey),
                      const SizedBox(height: 16),
                      const Text(
                        '利用可能なテンプレートがありません',
                        style: TextStyle(fontSize: 16),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('戻る'),
                      ),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // トーナメントテンプレート選択
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          border: Border.all(color: Colors.grey[300]!),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'トーナメントテンプレート',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 12),
                            DropdownButtonFormField<Map<String, dynamic>>(
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
                                fillColor: Colors.white,
                                filled: true,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      
                      // 開始日
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          border: Border.all(color: Colors.grey[300]!),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '開始日',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _startDateController,
                              decoration: const InputDecoration(
                                hintText: 'YYYY-MM-DD',
                                border: OutlineInputBorder(),
                                fillColor: Colors.white,
                                filled: true,
                                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 24),
                      
                      // 開始時刻
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          border: Border.all(color: Colors.grey[300]!),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '開始時刻',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _startTimeController,
                              decoration: const InputDecoration(
                                hintText: 'HH:MM',
                                border: OutlineInputBorder(),
                                fillColor: Colors.white,
                                filled: true,
                                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 32),
                      
                      // 作成ボタン
                      SizedBox(
                        height: 56,
                        child: ElevatedButton(
                          onPressed: _isCreating ? null : _createTournament,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blue,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: _isCreating
                              ? const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        color: Colors.white,
                                        strokeWidth: 2,
                                      ),
                                    ),
                                    SizedBox(width: 12),
                                    Text(
                                      '作成中...',
                                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                                    ),
                                  ],
                                )
                              : const Text(
                                  'トーナメントを作成',
                                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
}

