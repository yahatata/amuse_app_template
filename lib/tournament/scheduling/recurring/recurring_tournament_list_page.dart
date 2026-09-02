import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/tournament/scheduling/recurring/create_recurring_tournament_page.dart';
import 'package:amuse_app_template/tournament/scheduling/recurring/edit_recurring_tournament_page.dart';
import 'package:amuse_app_template/tournament/scheduling/errors/tournament_admin_user_facing_errors.dart';

/// 定期開催トーナメント一覧画面
class RecurringTournamentListPage extends StatefulWidget {
  const RecurringTournamentListPage({super.key});

  @override
  State<RecurringTournamentListPage> createState() => _RecurringTournamentListPageState();
}

class _RecurringTournamentListPageState extends State<RecurringTournamentListPage> {
  List<Map<String, dynamic>> _recurrences = [];
  bool _isLoading = true;
  bool _loadFailed = false;
  bool _isDeleting = false;

  @override
  void initState() {
    super.initState();
    _loadRecurrences();
  }

  /// 定期開催トーナメント一覧を読み込み
  Future<void> _loadRecurrences() async {
    setState(() {
      _isLoading = true;
      _loadFailed = false;
    });

    try {
      debugPrint('=== 定期開催トーナメント一覧読み込み開始 ===');
      final result = await FunctionsClient.instance
          .httpsCallable('getTournamentRecurrences')
          .call();

      debugPrint('Cloud Function レスポンス完了');

      if (isCallableSuccessResponse(result.data)) {
        final recurrencesRaw = result.data['recurrences'] as List? ?? [];
        debugPrint('取得した定期開催数: ${recurrencesRaw.length}');

        final recurrences = recurrencesRaw.map((recurrence) {
          final recurrenceMap = Map<String, dynamic>.from(recurrence as Map);

          if (recurrenceMap['startOn'] != null) {
            recurrenceMap['startOn'] = recurrenceMap['startOn'].toString();
          }
          if (recurrenceMap['endsOn'] != null) {
            recurrenceMap['endsOn'] = recurrenceMap['endsOn'].toString();
          }
          if (recurrenceMap['createdAt'] != null) {
            recurrenceMap['createdAt'] = recurrenceMap['createdAt'].toString();
          }
          if (recurrenceMap['updatedAt'] != null) {
            recurrenceMap['updatedAt'] = recurrenceMap['updatedAt'].toString();
          }

          return recurrenceMap;
        }).toList();

        setState(() {
          _recurrences = recurrences;
          _loadFailed = false;
        });

        debugPrint('定期開催読み込み完了: ${_recurrences.length}件');
      } else {
        if (mounted) {
          setState(() {
            _recurrences = [];
            _loadFailed = true;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(mapTournamentAdminSoftFail(result.data)),
              action: SnackBarAction(
                label: '再試行',
                onPressed: _loadRecurrences,
              ),
            ),
          );
        }
      }
    } catch (e) {
      debugPrint('定期開催の読み込みに失敗しました');
      if (mounted) {
        setState(() {
          _recurrences = [];
          _loadFailed = true;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(kTournamentAdminRecurrencesLoadFailedMessage),
            action: SnackBarAction(
              label: '再試行',
              onPressed: _loadRecurrences,
            ),
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

  /// 編集画面へ遷移（Firestore snapshot から最新データを取得して渡す）
  Future<void> _navigateToEdit(BuildContext context, String recurrenceId) async {
    // ローディング表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    try {
      final doc = await FirebaseFirestore.instance
          .collection('tournamentRecurrences')
          .doc(recurrenceId)
          .get();

      if (!mounted) return;
      Navigator.of(context).pop(); // ローディングを閉じる

      if (!doc.exists) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(kTournamentAdminRecurrenceNotFoundMessage)),
        );
        return;
      }

      final data = doc.data()!;

      // Timestamp → String / List に正規化
      final recurrenceData = <String, dynamic>{
        'id': doc.id,
        'templateId': data['templateId'] ?? '',
        'storeId': data['storeId'] ?? '',
        'tenantId': data['tenantId'] ?? '',
        'interval': data['interval'] ?? '',
        'byWeekday': (data['byWeekday'] as List?)
                ?.map((e) => e.toString())
                .toList() ??
            [],
        'startTime': data['startTime'] ?? '',
        'isActive': data['isActive'] ?? false,
        'startOn': (data['startOn'] as Timestamp?)?.toDate().toIso8601String() ??
            data['startOn']?.toString() ?? '',
        'endsOn': data['endsOn'] != null
            ? (data['endsOn'] as Timestamp?)?.toDate().toIso8601String() ??
                data['endsOn'].toString()
            : null,
        'createdAt':
            (data['createdAt'] as Timestamp?)?.toDate().toIso8601String() ?? '',
        'updatedAt':
            (data['updatedAt'] as Timestamp?)?.toDate().toIso8601String() ?? '',
      };

      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => EditRecurringTournamentPage(
            recurrenceId: recurrenceId,
            recurrenceData: recurrenceData,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop(); // ローディングを閉じる
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(kTournamentAdminRecurrenceDetailLoadFailedMessage)),
      );
    }
  }

  /// 定期開催を削除
  Future<void> _deleteRecurrence(String recurrenceId) async {
    if (_isDeleting) return;

    setState(() {
      _isDeleting = true;
    });

    try {
      final result = await FunctionsClient.instance
          .httpsCallable('deleteTournamentRecurrence')
          .call({'recurrenceId': recurrenceId});

      if (!mounted) return;

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('定期開催を削除しました')),
        );
        await _loadRecurrences();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentAdminSoftFail(
                result.data,
                operation: kDeleteTournamentRecurrenceOperation,
              ),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentAdminCallableError(
                e,
                operation: kDeleteTournamentRecurrenceOperation,
              ),
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isDeleting = false;
        });
      }
    }
  }

  /// 削除確認ダイアログを表示
  void _showDeleteDialog(String recurrenceId, String templateName) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('削除確認'),
          content: Text('定期開催「$templateName」を削除しますか？\n関連するトーナメントもアーカイブされます。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _isDeleting
                  ? null
                  : () async {
                Navigator.of(context).pop();
                await _deleteRecurrence(recurrenceId);
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('削除', style: TextStyle(color: Colors.white)),
            ),
          ],
        );
      },
    );
  }

  /// 間隔の表示文字列を取得
  String _formatInterval(dynamic interval) {
    if (interval is int) {
      return '${interval}weeks';
    } else if (interval is String) {
      return interval;
    } else {
      return '1weeks';
    }
  }

  String _getIntervalText(String interval) {
    switch (interval) {
      case '1week':
      case '1weeks':
        return '1週間ごと';
      case '2weeks':
        return '2週間ごと';
      case '3weeks':
        return '3週間ごと';
      case '4weeks':
        return '4週間ごと';
      case '5weeks':
        return '5週間ごと';
      default:
        return interval;
    }
  }

  /// 曜日の表示文字列を取得
  String _getWeekdayText(List<dynamic> byWeekday) {
    const weekdayMap = {
      'MO': '月', 'TU': '火', 'WE': '水', 'TH': '木', 'FR': '金', 'SA': '土', 'SU': '日'
    };
    
    return byWeekday.map((day) => weekdayMap[day] ?? day).join('・');
  }

  /// 安全な日付フォーマット
  String _formatDate(dynamic dateValue) {
    if (dateValue == null) return '未設定';
    
    try {
      String dateStr = dateValue.toString();
      if (dateStr.contains('T')) {
        // ISO形式の場合
        return DateFormat('yyyy年M月d日').format(DateTime.parse(dateStr));
      } else {
        // その他の形式の場合
        return dateStr;
      }
    } catch (e) {
      debugPrint('日付フォーマットエラー: $e, 値: $dateValue');
      return dateValue.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('定期開催トーナメント'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _loadFailed
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 24),
                        child: Text(
                          kTournamentAdminRecurrencesLoadFailedMessage,
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 18),
                        ),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton(
                        onPressed: _loadRecurrences,
                        child: const Text('再試行'),
                      ),
                    ],
                  ),
                )
          : _recurrences.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.event_repeat,
                        size: 64,
                        color: Colors.grey,
                      ),
                      SizedBox(height: 16),
                      Text(
                        '定期開催トーナメントがありません',
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
                  itemCount: _recurrences.length,
                  itemBuilder: (context, index) {
                    final recurrence = _recurrences[index];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // テンプレート名とステータス
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(
                                    recurrence['templateId'] ?? '無名テンプレート',
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: (recurrence['isActive'] == true) ? Colors.green : Colors.grey,
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                  child: Text(
                                    (recurrence['isActive'] == true) ? '有効' : '停止',
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
                            
                            // 開催情報
                            Row(
                              children: [
                                const Icon(Icons.schedule, size: 16, color: Colors.grey),
                                const SizedBox(width: 8),
                                Text(
                                  '${_getIntervalText(_formatInterval(recurrence['interval']))} (${_getWeekdayText(recurrence['byWeekday'] ?? [])})',
                                  style: const TextStyle(fontSize: 14),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            
                            // 開始日
                            Row(
                              children: [
                                const Icon(Icons.calendar_today, size: 16, color: Colors.grey),
                                const SizedBox(width: 8),
                                Text(
                                  '開始: ${_formatDate(recurrence['startOn'])}',
                                  style: const TextStyle(fontSize: 14),
                                ),
                              ],
                            ),
                            
                            // 終了日（設定されている場合）
                            if (recurrence['endsOn'] != null) ...[
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Icon(Icons.event_busy, size: 16, color: Colors.grey),
                                  const SizedBox(width: 8),
                                  Text(
                                    '終了: ${_formatDate(recurrence['endsOn'])}',
                                    style: const TextStyle(fontSize: 14),
                                  ),
                                ],
                              ),
                            ],
                            
                            const SizedBox(height: 16),
                            
                            // アクションボタン
                            Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                TextButton.icon(
                                  icon: const Icon(Icons.edit, size: 16),
                                  label: const Text('編集'),
                                  onPressed: () => _navigateToEdit(context, recurrence['id']),
                                ),
                                const SizedBox(width: 8),
                                TextButton.icon(
                                  icon: const Icon(Icons.delete, size: 16, color: Colors.red),
                                  label: const Text('削除', style: TextStyle(color: Colors.red)),
                                  onPressed: () {
                                    _showDeleteDialog(
                                      recurrence['id'],
                                      recurrence['templateId'] ?? '無名テンプレート',
                                    );
                                  },
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => const CreateRecurringTournamentPage(),
            ),
          );
        },
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('定期開催作成'),
      ),
    );
  }
}
