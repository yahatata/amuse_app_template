import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/tournament/active/pages/tournament_home_page.dart';
import 'package:amuse_app_template/utils/date_time_utils.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart' show kDevPlaceholderStoreId, kDevPlaceholderTenantId;
import 'package:amuse_app_template/utils/business_date_ambiguous_dialog.dart';

/// カレンダーからトーナメント登録画面
class CreateTournamentFromCalendarPage extends StatefulWidget {
  const CreateTournamentFromCalendarPage({super.key});

  @override
  State<CreateTournamentFromCalendarPage> createState() => _CreateTournamentFromCalendarPageState();
}

class _CreateTournamentFromCalendarPageState extends State<CreateTournamentFromCalendarPage> {
  late DateTime _currentMonth;
  DateTime? _selectedDate;
  Map<String, List<Map<String, dynamic>>> _tournaments = {};
  bool _isLoading = true;
  List<Map<String, dynamic>> _tournamentTemplates = [];

  @override
  void initState() {
    super.initState();
    _currentMonth = DateTime(DateTime.now().year, DateTime.now().month, 1);
    _loadTournaments();
    _loadTournamentTemplates();
  }

  /// トーナメントを読み込み
  Future<void> _loadTournaments() async {
    setState(() {
      _isLoading = true;
    });

    try {
      debugPrint('=== トーナメント読み込み開始 ===');

      // 全件取得してからクライアント側でbusinessDateで分類
      final snapshot = await FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .where('isArchived', isEqualTo: false)
          .get();

      debugPrint('取得したトーナメント数: ${snapshot.docs.length}');

      // 日付ごとにトーナメントを分類（businessDateを使用）
      final Map<String, List<Map<String, dynamic>>> tournamentsByDate = {};
      
      for (var doc in snapshot.docs) {
        final data = doc.data();
        final businessDate = data['businessDate'] as String?;
        
        if (businessDate == null) {
          continue; // businessDateが無い場合はスキップ
        }
        
        final startAt = (data['startAt'] as Timestamp).toDate();
        
        // 時刻変換の確認と適切な処理
        debugPrint('=== 時刻変換デバッグ ===');
        debugPrint('元の時刻: $startAt');
        debugPrint('時刻のタイムゾーン: ${startAt.timeZoneName}');
        debugPrint('時刻のオフセット: ${startAt.timeZoneOffset}');
        
        // 時刻が既にJST時刻として保存されているかチェック
        DateTime startAtJST;
        if (startAt.timeZoneOffset.inHours == 9) {
          // 既にJST時刻の場合
          startAtJST = startAt;
          debugPrint('既にJST時刻として保存されています');
        } else {
          // UTC時刻の場合、JST変換
          startAtJST = DateTimeUtils.utcToJST(startAt);
          debugPrint('UTC時刻をJST変換しました');
        }
        
        debugPrint('JST時刻: $startAtJST');
        debugPrint('表示時刻: ${DateFormat('HH:mm').format(startAtJST)}');
        debugPrint('businessDate: $businessDate');
        debugPrint('====================');
        
        final snapshot = data['snapshot'] as Map<String, dynamic>?;
        final name = snapshot?['name'] ?? '名称未設定';
        final status = (data['status'] ?? 'scheduled').toString();
        final regEndAtRaw = data['regEndAt'] as Timestamp?;
        final regEndAt = regEndAtRaw?.toDate();
        
        if (!tournamentsByDate.containsKey(businessDate)) {
          tournamentsByDate[businessDate] = [];
        }
        
        tournamentsByDate[businessDate]!.add({
          'id': doc.id,
          'name': name,
          'startAt': startAtJST,
          'regEndAt': regEndAt,
          'status': status,
          'snapshot': snapshot,
        });

        debugPrint('トーナメント: $name, 開始: $startAtJST, businessDate: $businessDate');
      }

      setState(() {
        _tournaments = tournamentsByDate;
        _isLoading = false;
      });

      debugPrint('=== トーナメント読み込み完了 ===');
    } catch (e, stackTrace) {
      debugPrint('=== トーナメント読み込みエラー ===');
      debugPrint('エラー: $e');
      debugPrint('スタックトレース: $stackTrace');
      
      setState(() {
        _isLoading = false;
      });
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

  /// 指定月の最初の日の曜日を取得（0: 月曜, 6: 日曜）
  int _getFirstDayOfWeek(DateTime date) {
    final firstDay = DateTime(date.year, date.month, 1);
    return (firstDay.weekday - 1) % 7;
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

  /// 選択された日付のトーナメントを取得
  List<Map<String, dynamic>> _getSelectedDateTournaments() {
    if (_selectedDate == null) return [];
    final dateKey = _getDateKey(_selectedDate!);
    return _tournaments[dateKey] ?? [];
  }

  /// トーナメント詳細ダイアログを表示
  void _showTournamentDetailDialog(Map<String, dynamic> tournament) {
    final snapshot = tournament['snapshot'] as Map<String, dynamic>?;
    final name = snapshot?['name'] ?? '名称未設定';
    final entryFee = snapshot?['entryFee'] ?? 0;
    final startAt = tournament['startAt'] as DateTime;
    final status = (tournament['status'] ?? 'scheduled').toString();
    final isCancelled = status == 'cancelled' || status == 'canceled';
    final regEndAt = tournament['regEndAt'] as DateTime?;
    final canRestore = isCancelled && regEndAt != null && DateTime.now().isBefore(regEndAt);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('トーナメント詳細'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'トーナメント名',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                name,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'エントリーフィー',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '¥$entryFee',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                '開始日時',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                DateFormat('yyyy年M月d日(E) HH:mm', 'ja').format(startAt),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'ステータス',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[600],
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _statusText(status),
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: _statusColor(status),
                ),
              ),
            ],
          ),
          actions: [
            if (!isCancelled)
              TextButton(
                onPressed: () async {
                  Navigator.of(context).pop();
                  await _showEditStartTimeDialog(tournament);
                },
                child: const Text('開始時刻編集'),
              ),
            if (!isCancelled)
              TextButton(
                onPressed: () async {
                  Navigator.of(context).pop();
                  await _confirmAndUpdateStatus(tournament['id'] as String, 'cancel');
                },
                child: const Text('キャンセル', style: TextStyle(color: Colors.red)),
              ),
            if (isCancelled)
              TextButton(
                onPressed: canRestore
                    ? () async {
                        Navigator.of(context).pop();
                        await _confirmAndUpdateStatus(tournament['id'] as String, 'restore');
                      }
                    : null,
                child: const Text('復旧'),
              ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('閉じる'),
            ),
          ],
        );
      },
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'scheduled':
        return Colors.blue;
      case 'running':
        return Colors.orange;
      case 'registered':
        return Colors.green;
      case 'cancelled':
      case 'canceled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _statusText(String status) {
    switch (status) {
      case 'scheduled':
        return '予定';
      case 'running':
        return '実施中（レジスト前）';
      case 'registered':
        return '実施中（レジスト済み）';
      case 'cancelled':
      case 'canceled':
        return 'キャンセル済み';
      default:
        return status;
    }
  }

  Future<void> _confirmAndUpdateStatus(String tournamentId, String action) async {
    final actionLabel = action == 'cancel' ? 'キャンセル' : '復旧';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('確認'),
        content: Text('このトーナメントを$actionLabelしますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('戻る'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(actionLabel),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() {
      _isLoading = true;
    });
    try {
      final callable = FirebaseFunctions.instance
          .httpsCallable('updateScheduledTournamentStatus');
      final result = await callable.call({
        'tournamentId': tournamentId,
        'action': action,
      });
      final message = result.data['message']?.toString() ?? '更新しました';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
      await _loadTournaments();
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('エラー: ${e.message}')),
        );
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
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _showEditStartTimeDialog(Map<String, dynamic> tournament) async {
    final currentStartAt = tournament['startAt'] as DateTime;
    final controller = TextEditingController(
      text: DateFormat('HH:mm').format(currentStartAt),
    );
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('開始時刻編集'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            labelText: '開始時刻',
            hintText: 'HH:MM',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('戻る'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('更新'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final input = controller.text.trim();
    if (!RegExp(r'^\d{2}:\d{2}$').hasMatch(input)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('時刻は HH:MM 形式で入力してください')),
        );
      }
      return;
    }

    final parts = input.split(':');
    final hh = int.tryParse(parts[0]) ?? -1;
    final mm = int.tryParse(parts[1]) ?? -1;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('時刻の範囲が不正です')),
        );
      }
      return;
    }

    final jstDate = DateTime(
      currentStartAt.year,
      currentStartAt.month,
      currentStartAt.day,
      hh,
      mm,
    );
    final utcDate = jstDate.subtract(const Duration(hours: 9));

    setState(() {
      _isLoading = true;
    });
    try {
      final callable = FirebaseFunctions.instance
          .httpsCallable('updateScheduledTournamentStartAt');
      final result = await callable.call({
        'tournamentId': tournament['id'],
        'startAt': utcDate.toIso8601String(),
      });
      final message = result.data['message']?.toString() ?? '開始時刻を更新しました';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
      await _loadTournaments();
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        final candidates = extractAmbiguousCandidates(e);
        if (candidates != null && candidates.isNotEmpty) {
          final selectedKey = await showBusinessDateAmbiguousDialog(
            context: context,
            candidates: candidates,
            onSelected: (selectedKey) async {
              final callable = FirebaseFunctions.instance
                  .httpsCallable('updateScheduledTournamentStartAt');
              await callable.call({
                'tournamentId': tournament['id'],
                'startAt': utcDate.toIso8601String(),
                'selectedBusinessDateKey': selectedKey,
              });
              await _loadTournaments();
            },
          );
          if (selectedKey != null && mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('開始時刻を更新しました')),
            );
          }
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('エラー: ${e.message}')),
          );
        }
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
          _isLoading = false;
        });
      }
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

  /// トーナメント作成ダイアログを表示
  void _showCreateTournamentDialog() {
    if (_tournamentTemplates.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('利用可能なテンプレートがありません')),
      );
      return;
    }

    if (_selectedDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('日付を選択してください')),
      );
      return;
    }

    Map<String, dynamic>? selectedTemplate;
    final startTimeController = TextEditingController(text: '19:00');
    
    // 選択された日付を固定表示
    final selectedDateStr = DateFormat('yyyy-MM-dd').format(_selectedDate!);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('新しいトーナメントを作成'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // 選択された日付（読み取り専用）
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
                        '開催日',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        DateFormat('yyyy年M月d日(E)', 'ja').format(_selectedDate!),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                
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
                  selectedDateStr,
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

  /// トーナメントを作成
  Future<void> _createTournament(
    String templateId,
    String startDate,
    String startTime, {
    String? selectedBusinessDateKey,
  }) async {
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
        'storeId': kDevPlaceholderStoreId,
        'tenantId': kDevPlaceholderTenantId,
        if (selectedBusinessDateKey != null) 'selectedBusinessDateKey': selectedBusinessDateKey,
      };
      debugPrint('完全なリクエストデータ: ${requestData.toString()}');

      final result = await FirebaseFunctions.instance
          .httpsCallable('createScheduledTournament')
          .call(requestData);

      if (result.data['success'] == true) {
        final tournamentId = result.data['tournamentId'] as String;
        final message = result.data['message'] as String;
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(message)),
          );

          // トーナメントリストを更新
          await _loadTournaments();

          // カレンダーページに戻る
          if (mounted) {
            Navigator.pop(context);
          }
        }
      } else {
        throw Exception(result.data['error'] ?? 'トーナメントの作成に失敗しました');
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        final candidates = extractAmbiguousCandidates(e);
        if (candidates != null && candidates.isNotEmpty) {
          final selectedKey = await showBusinessDateAmbiguousDialog(
            context: context,
            candidates: candidates,
            onSelected: (selectedKey) {
              // 選択された営業日キーで再試行
              _createTournament(
                templateId,
                startDate,
                startTime,
                selectedBusinessDateKey: selectedKey,
              );
            },
          );
          if (selectedKey != null) {
            // ダイアログが閉じられた後に、選択されたキーで再試行
            // ここでは何もしない。onSelectedコールバックで処理される
            return;
          } else {
            // キャンセルされた場合は処理を終了
            return;
          }
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('エラー: ${e.message}')),
        );
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
          _isLoading = false;
        });
      }
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
    final monthSelectorHeight = bodyHeight * 0.0638;  // 20XX年YY月: 6%
    final weekdayHeaderHeight = bodyHeight * 0.0532;  // 曜日: 5%
    final topMargin = bodyHeight * 0.0001;            // 余白: 1%
    final rowHeight = bodyHeight * 0.0851;            // 1列: 8%
    final rowMargin = bodyHeight * 0.0001;            // 列間余白: 0.5%
    
    // 実際に必要な行数分の高さを計算
    final totalRowsHeight = (rowHeight + rowMargin) * requiredWeeks - rowMargin;
    
    final bottomMargin = bodyHeight * 0.0106;         // 余白: 1%
    final detailHeaderHeight = bodyHeight * 0.0426;   // YY月ZZ日(曜日): 4%
    final detailMargin = bodyHeight * 0.0106;         // 余白: 1%
    
    // 残りのスペースを開催トーナメント一覧に割り当て
    final baseDetailListHeight = bodyHeight * 0.234;  // 基本: 22%
    final savedSpace = (6 - requiredWeeks) * (rowHeight + rowMargin); // 節約されたスペース
    final detailListHeight = baseDetailListHeight + savedSpace;
    
    debugPrint('カレンダーグリッド高さ: $totalRowsHeight (${requiredWeeks}週分)');
    debugPrint('節約されたスペース: $savedSpace');
    debugPrint('トーナメント一覧高さ: $detailListHeight');
    debugPrint('===================');

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: Size.fromHeight(appBarHeight),
        child: AppBar(
          title: const Text('カレンダーからトーナメント作成・編集'),
          backgroundColor: Colors.grey[800],
          foregroundColor: Colors.white,
        ),
      ),
      floatingActionButton: _selectedDate != null
          ? FloatingActionButton.extended(
              onPressed: _isLoading ? null : _showCreateTournamentDialog,
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
              icon: _isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Icon(Icons.add),
              label: Text(_isLoading ? '作成中...' : 'トーナメント作成'),
            )
          : null,
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
                  // 開催トーナメント一覧: 22%
                  SizedBox(
                    height: detailListHeight,
                    child: _buildDetailList(),
                  ),
                ],
              ),
            ),
    );
  }

  /// 色文字列をColorオブジェクトに変換
  Color _parseColor(String? colorString) {
    if (colorString == null || colorString.isEmpty) {
      return Colors.white; // デフォルト色
    }
    
    try {
      // #FF5722 形式の色文字列を解析
      String cleanColor = colorString.replaceFirst('#', '');
      if (cleanColor.length == 6) {
        return Color(int.parse('FF$cleanColor', radix: 16));
      } else if (cleanColor.length == 8) {
        return Color(int.parse(cleanColor, radix: 16));
      }
    } catch (e) {
      debugPrint('色の解析エラー: $e, 色: $colorString');
    }
    
    return Colors.blue; // デフォルト色
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
    final fontSize = bodyHeight * 0.03; // body高さの5%

    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[100],
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          IconButton(
            icon: Icon(Icons.chevron_left, color: canGoPrevious ? Colors.black : Colors.grey),
            iconSize: fontSize * 0.8,
            onPressed: canGoPrevious ? () => _changeMonth(-1) : null,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
          Text(
            DateFormat('yyyy年 M月').format(_currentMonth),
            style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.bold),
          ),
          IconButton(
            icon: Icon(Icons.chevron_right, color: canGoNext ? Colors.black : Colors.grey),
            iconSize: fontSize * 0.8,
            onPressed: canGoNext ? () => _changeMonth(1) : null,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  /// 曜日ヘッダー
  Widget _buildWeekdayHeader() {
    const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
    
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey[200],
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        children: weekdays.map((day) {
          return Expanded(
            child: Center(
              child: Text(
                day,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: day == '日' ? Colors.red : (day == '土' ? Colors.blue : Colors.black),
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
    final tournamentsOnDate = _tournaments[dateKey] ?? [];
    final isSelected = _selectedDate != null && 
                       _selectedDate!.year == date.year &&
                       _selectedDate!.month == date.month &&
                       _selectedDate!.day == date.day;

    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedDate = date;
        });
      },
      child: Container(
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: isSelected ? Colors.blue[100] : Colors.white,
          border: Border.all(
            color: isSelected ? Colors.blue : Colors.grey[300]!,
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
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ),
            // トーナメント名（右上）
            Positioned(
              top: 2,
              right: 4,
              left: 24,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  ...tournamentsOnDate.take(2).map((tournament) {
                    // デバッグログ: トーナメントデータの構造を確認
                    debugPrint('=== トーナメントデータ構造 ===');
                    debugPrint('tournament keys: ${tournament.keys.toList()}');
                    debugPrint('tournament[\'color\']: ${tournament['color']}');
                    if (tournament['snapshot'] != null) {
                      debugPrint('snapshot keys: ${(tournament['snapshot'] as Map).keys.toList()}');
                      debugPrint('snapshot[\'color\']: ${(tournament['snapshot'] as Map)['color']}');
                    }
                    debugPrint('========================');
                    
                    // colorフィールドの取得（snapshot内を優先）
                    String? colorString;
                    if (tournament['snapshot'] != null) {
                      final snapshot = tournament['snapshot'] as Map<String, dynamic>;
                      colorString = snapshot['color'] as String?;
                    }
                    colorString ??= tournament['color'] as String?;
                    
                    final tournamentColor = _parseColor(colorString);
                    final status = (tournament['status'] ?? 'scheduled').toString();
                    final isCancelled = status == 'cancelled' || status == 'canceled';
                    
                    // JST時刻として表示（既にJST変換済み）
                    final displayTime = tournament['startAt'] as DateTime;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 2.0),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                        decoration: BoxDecoration(
                          color: isCancelled ? Colors.grey : tournamentColor,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: Text(
                          '${DateFormat('HH:mm').format(displayTime)} ${tournament['name']}${isCancelled ? ' (キャンセル)' : ''}',
                          style: const TextStyle(
                            fontSize: 9,
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.right,
                        ),
                      ),
                    );
                  }).toList(),
                  // 3つ以上ある場合は「...」を表示
                  if (tournamentsOnDate.length > 2)
                    const Text(
                      '...',
                      style: TextStyle(fontSize: 9),
                      textAlign: TextAlign.right,
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }


  /// 詳細フィールドヘッダー
  Widget _buildDetailHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.grey[200],
        border: Border(
          top: BorderSide(color: Colors.grey[300]!, width: 2),
          bottom: BorderSide(color: Colors.grey[300]!),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _selectedDate != null
                  ? '${DateFormat('M月d日 (E)', 'ja').format(_selectedDate!)} のトーナメント'
                  : '日付を選択してください',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  /// 詳細フィールドリスト（スクロール可能）
  Widget _buildDetailList() {
    final tournaments = _getSelectedDateTournaments();

    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[50],
      ),
      child: tournaments.isEmpty
          ? Center(
              child: Text(
                _selectedDate != null
                    ? 'この日にトーナメントはありません'
                    : 'カレンダーから日付を選択してください',
                style: TextStyle(color: Colors.grey[600], fontSize: 14),
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              physics: const AlwaysScrollableScrollPhysics(), // スクロール可能
              itemCount: tournaments.length,
              itemBuilder: (context, index) {
                final tournament = tournaments[index];
                final startAt = tournament['startAt'] as DateTime;
                
                // JST時刻として表示（既にJST変換済みだが、念のため確認）
                final displayTime = startAt;
                
                // デバッグログ: トーナメントデータの構造を確認
                debugPrint('=== トーナメント一覧データ構造 ===');
                debugPrint('tournament keys: ${tournament.keys.toList()}');
                debugPrint('tournament[\'color\']: ${tournament['color']}');
                if (tournament['snapshot'] != null) {
                  debugPrint('snapshot keys: ${(tournament['snapshot'] as Map).keys.toList()}');
                  debugPrint('snapshot[\'color\']: ${(tournament['snapshot'] as Map)['color']}');
                }
                debugPrint('==============================');
                
                // colorフィールドの取得（snapshot内を優先）
                String? colorString;
                if (tournament['snapshot'] != null) {
                  final snapshot = tournament['snapshot'] as Map<String, dynamic>;
                  colorString = snapshot['color'] as String?;
                }
                colorString ??= tournament['color'] as String?;
                
                final tournamentColor = _parseColor(colorString);
                final status = (tournament['status'] ?? 'scheduled').toString();
                final isCancelled = status == 'cancelled' || status == 'canceled';
                return Card(
                  margin: const EdgeInsets.only(bottom: 6),
                  child: ListTile(
                    dense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    leading: CircleAvatar(
                      radius: 18,
                      backgroundColor: isCancelled ? Colors.grey : tournamentColor,
                      child: Text(
                        DateFormat('HH:mm').format(displayTime).substring(0, 2),
                        style: const TextStyle(color: Colors.white, fontSize: 11),
                      ),
                    ),
                    title: Text(
                      tournament['name'],
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                    subtitle: Text(
                      '開始時刻: ${DateFormat('HH:mm').format(displayTime)} / ${_statusText(status)}',
                      style: TextStyle(
                        fontSize: 12,
                        color: isCancelled ? Colors.red : null,
                        fontWeight: isCancelled ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                    onTap: () {
                      _showTournamentDetailDialog(tournament);
                    },
                  ),
                );
              },
            ),
    );
  }
}

