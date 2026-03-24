import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// Cloud FunctionsのエラーからAMBIGUOUS情報を抽出
/// 
/// [error] FirebaseFunctionsExceptionまたはその他のエラー
/// 戻り値: 候補となる営業日キーのリスト、またはnull（AMBIGUOUSでない場合）
List<String>? extractAmbiguousCandidates(dynamic error) {
  try {
    if (error is FirebaseFunctionsException) {
      // エラーメッセージに"ambiguous"が含まれているか確認
      final message = error.message?.toLowerCase() ?? '';
      if (!message.contains('ambiguous')) {
        return null;
      }
      
      // エラーの詳細（details）からcandidatesを取得
      final details = error.details;
      if (details is Map && details.containsKey('candidates')) {
        final candidates = details['candidates'];
        if (candidates is List) {
          return candidates.map((e) => e.toString()).toList();
        }
      }
      
      // メッセージから候補を抽出（フォールバック）
      // 例: "Please select a business date from candidates: 2025-01-15, 2025-01-16"
      final match = RegExp(r'candidates:\s*([^\n]+)').firstMatch(message);
      if (match != null) {
        final candidatesStr = match.group(1);
        if (candidatesStr != null) {
          return candidatesStr.split(',').map((e) => e.trim()).toList();
        }
      }
    } else if (error is Exception || error is String) {
      // 文字列エラーの場合
      final errorStr = error.toString().toLowerCase();
      if (errorStr.contains('ambiguous')) {
        // 文字列から候補を抽出を試みる
        final match = RegExp(r'candidates:\s*([^\n]+)').firstMatch(errorStr);
        if (match != null) {
          final candidatesStr = match.group(1);
          if (candidatesStr != null) {
            return candidatesStr.split(',').map((e) => e.trim()).toList();
          }
        }
      }
    }
  } catch (e) {
    debugPrint('候補抽出エラー: $e');
  }
  
  return null;
}

/// 営業日が曖昧（AMBIGUOUS）な場合に表示するダイアログ
/// 
/// calcBusinessDate.tsからAMBIGUOUSが返された場合に、ユーザーに
/// どちらの営業日に属するのかを選択させるダイアログを表示します。
/// 
/// [candidates] 候補となる営業日キーのリスト（YYYY-MM-DD形式）
/// [onSelected] ユーザーが選択した営業日キーを返すコールバック
/// 
/// 戻り値: ユーザーが選択した営業日キー、またはnull（キャンセル時）
Future<String?> showBusinessDateAmbiguousDialog({
  required BuildContext context,
  required List<String> candidates,
  required Function(String) onSelected,
}) async {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (BuildContext context) {
      return _BusinessDateAmbiguousDialogContent(
        candidates: candidates,
        onSelected: onSelected,
      );
    },
  );
}

/// 営業時間取得中はダイアログ主領域に CPI を表示（changeSpec 105）
class _BusinessDateAmbiguousDialogContent extends StatefulWidget {
  final List<String> candidates;
  final Function(String) onSelected;

  const _BusinessDateAmbiguousDialogContent({
    required this.candidates,
    required this.onSelected,
  });

  @override
  State<_BusinessDateAmbiguousDialogContent> createState() =>
      _BusinessDateAmbiguousDialogContentState();
}

class _BusinessDateAmbiguousDialogContentState
    extends State<_BusinessDateAmbiguousDialogContent> {
  bool _loadingHours = true;
  final Map<String, Map<String, dynamic>?> _businessHoursMap = {};
  String? _selectedBusinessDateKey;

  @override
  void initState() {
    super.initState();
    _loadBusinessHours();
  }

  Future<void> _loadBusinessHours() async {
    for (final candidate in widget.candidates) {
      _businessHoursMap[candidate] = await _getBusinessHoursForDate(candidate);
    }
    if (mounted) {
      setState(() => _loadingHours = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingHours) {
      return AlertDialog(
        title: const Text('営業日の選択'),
        content: const SizedBox(
          width: 280,
          height: 140,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text(
                  '営業時間を取得しています…',
                  style: TextStyle(fontSize: 14),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final candidates = widget.candidates;
    return AlertDialog(
      title: const Text('営業日の選択'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '2つの営業日の境界に設定しようとしています。\nどちらの営業日に属するのかを選択して下さい。',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 24),
            ...candidates.map((candidate) {
              final businessHours = _businessHoursMap[candidate];
              final isSelected = _selectedBusinessDateKey == candidate;

              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: InkWell(
                  onTap: () {
                    setState(() {
                      _selectedBusinessDateKey = candidate;
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: isSelected ? Colors.blue : Colors.grey,
                        width: isSelected ? 2 : 1,
                      ),
                      borderRadius: BorderRadius.circular(8),
                      color: isSelected ? Colors.blue.shade50 : Colors.white,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Radio<String>(
                              value: candidate,
                              groupValue: _selectedBusinessDateKey,
                              onChanged: (value) {
                                setState(() {
                                  _selectedBusinessDateKey = value;
                                });
                              },
                            ),
                            const SizedBox(width: 8),
                            Text(
                              candidate,
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: isSelected ? Colors.blue : Colors.black,
                              ),
                            ),
                          ],
                        ),
                        if (businessHours != null) ...[
                          const SizedBox(height: 8),
                          Padding(
                            padding: const EdgeInsets.only(left: 40),
                            child: Text(
                              _formatBusinessHours(businessHours),
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () {
            Navigator.of(context).pop(null);
          },
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: _selectedBusinessDateKey != null
              ? () {
                  widget.onSelected(_selectedBusinessDateKey!);
                  Navigator.of(context).pop(_selectedBusinessDateKey);
                }
              : null,
          child: const Text('確定'),
        ),
      ],
    );
  }
}

/// 指定された日付の営業時間を取得
/// 
/// [dateKey] YYYY-MM-DD形式の日付キー
/// 戻り値: 営業時間情報（openMinute, closeMinute, isClosed）を含むMap、またはnull
Future<Map<String, dynamic>?> _getBusinessHoursForDate(String dateKey) async {
  try {
    // YYYY-MM-DD形式から年月を抽出
    final dateParts = dateKey.split('-');
    if (dateParts.length != 3) return null;
    
    final year = int.parse(dateParts[0]);
    final month = int.parse(dateParts[1]);
    final day = int.parse(dateParts[2]);
    
    // 月キーを生成（YYYY-MM形式）
    final monthKey = '${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}';
    
    // businessHoursMonthlyMapから該当月のドキュメントを取得
    final monthDoc = await FirebaseFirestore.instance
        .collection('businessHoursMonthlyMap')
        .doc(monthKey)
        .get();
    
    if (!monthDoc.exists) return null;
    
    final monthData = monthDoc.data();
    if (monthData == null) return null;
    
    final days = monthData['days'] as Map<String, dynamic>?;
    if (days == null) return null;
    
    // 日のキーを正規化（"1"と"01"の両方に対応）
    final dayKey = day.toString();
    final normalizedDayKey = int.parse(dayKey).toString();
    
    // 正規化されたキーまたは元のキーで取得
    final dayData = days[normalizedDayKey] ?? days[dayKey];
    if (dayData == null) return null;
    
    return dayData as Map<String, dynamic>;
  } catch (e) {
    debugPrint('営業時間取得エラー: $e');
    return null;
  }
}

/// 営業時間情報を文字列にフォーマット
/// 
/// [businessHours] 営業時間情報（openMinute, closeMinute, isClosed）
/// 戻り値: フォーマットされた営業時間文字列
String _formatBusinessHours(Map<String, dynamic> businessHours) {
  final isClosed = businessHours['isClosed'] as bool? ?? false;
  if (isClosed) {
    return '休業日';
  }
  
  final openMinute = businessHours['openMinute'] as int? ?? 0;
  final closeMinute = businessHours['closeMinute'] as int? ?? 1440;
  
  final openHour = openMinute ~/ 60;
  final openMin = openMinute % 60;
  final openTime = '${openHour.toString().padLeft(2, '0')}:${openMin.toString().padLeft(2, '0')}';
  
  // closeMinuteが1440を超える場合は翌日に伸びる
  if (closeMinute > 1440) {
    final extraDays = closeMinute ~/ 1440;
    final remainingMinutes = closeMinute % 1440;
    final closeHour = remainingMinutes ~/ 60;
    final closeMin = remainingMinutes % 60;
    final closeTime = '${closeHour.toString().padLeft(2, '0')}:${closeMin.toString().padLeft(2, '0')}';
    return '営業時間: $openTime 〜 翌${extraDays}日目 $closeTime';
  } else {
    final closeHour = closeMinute ~/ 60;
    final closeMin = closeMinute % 60;
    final closeTime = '${closeHour.toString().padLeft(2, '0')}:${closeMin.toString().padLeft(2, '0')}';
    return '営業時間: $openTime 〜 $closeTime';
  }
}
