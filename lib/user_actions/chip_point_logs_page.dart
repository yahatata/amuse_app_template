import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// チップ・ポイント履歴参照ページ
class ChipPointLogsPage extends StatefulWidget {
  final String userId;
  final String pokerName;

  const ChipPointLogsPage({
    super.key,
    required this.userId,
    required this.pokerName,
  });

  @override
  State<ChipPointLogsPage> createState() => _ChipPointLogsPageState();
}

class _ChipPointLogsPageState extends State<ChipPointLogsPage> {
  String _selectedLogType = 'pointA'; // 'pointA', 'pointB', 'sideGameChip'
  String? _selectedDate; // 選択された日付（YYYY-MM-DD形式）

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.pokerName} - 履歴'),
      ),
      body: Column(
        children: [
          // ログタイプ選択
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(
                        value: 'pointA',
                        label: Text('Point A'),
                        icon: Icon(Icons.account_balance_wallet),
                      ),
                      ButtonSegment(
                        value: 'pointB',
                        label: Text('Point B'),
                        icon: Icon(Icons.account_balance_wallet),
                      ),
                      ButtonSegment(
                        value: 'sideGameChip',
                        label: Text('SideGame Chip'),
                        icon: Icon(Icons.casino),
                      ),
                    ],
                    selected: {_selectedLogType},
                    onSelectionChanged: (Set<String> newSelection) {
                      setState(() {
                        _selectedLogType = newSelection.first;
                        _selectedDate = null; // ログタイプ変更時は日付をリセット
                      });
                    },
                  ),
                ),
              ],
            ),
          ),
          // 日付選択
          StreamBuilder<List<String>>(
            stream: _getAvailableDates(),
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SizedBox(
                  height: 60,
                  child: Center(child: CircularProgressIndicator()),
                );
              }

              final dates = snapshot.data ?? [];
              
              // デフォルトで直近の日付を選択
              if (_selectedDate == null && dates.isNotEmpty) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  setState(() {
                    _selectedDate = dates.first;
                  });
                });
              }

              if (dates.isEmpty) {
                return const SizedBox(
                  height: 60,
                  child: Center(child: Text('利用可能な日付がありません')),
                );
              }

              return Container(
                height: 60,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: dates.length,
                  itemBuilder: (context, index) {
                    final date = dates[index];
                    final isSelected = _selectedDate == date;
                    final dateObj = DateTime.parse(date);
                    final displayText = '${dateObj.month}/${dateObj.day}';

                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: ChoiceChip(
                        label: Text(displayText),
                        selected: isSelected,
                        onSelected: (selected) {
                          if (selected) {
                            setState(() {
                              _selectedDate = date;
                            });
                          }
                        },
                        selectedColor: Colors.blue.shade100,
                        backgroundColor: Colors.grey.shade200,
                      ),
                    );
                  },
                ),
              );
            },
          ),
          // ログ一覧
          Expanded(
            child: _buildLogsList(),
          ),
        ],
      ),
    );
  }

  Widget _buildLogsList() {
    if (_selectedDate == null) {
      return const Center(child: CircularProgressIndicator());
    }

    String collectionName;
    switch (_selectedLogType) {
      case 'pointA':
        collectionName = 'pointALogs';
        break;
      case 'pointB':
        collectionName = 'pointBLogs';
        break;
      case 'sideGameChip':
        collectionName = 'sideGameChipLogs';
        break;
      default:
        collectionName = 'pointALogs';
    }

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userId)
          .collection(collectionName)
          .doc(_selectedDate!)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        if (snapshot.hasError) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error, color: Colors.red, size: 48),
                const SizedBox(height: 16),
                Text(
                  'エラーが発生しました',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.red[700],
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  snapshot.error.toString(),
                  style: const TextStyle(fontSize: 14),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          );
        }

        if (!snapshot.hasData || !snapshot.data!.exists) {
          return const Center(
            child: Text('この日付の履歴がありません'),
          );
        }

        final docData = snapshot.data!.data()!;
        final logs = docData['logs'] as Map<String, dynamic>? ?? {};

        if (logs.isEmpty) {
          return const Center(
            child: Text('履歴がありません'),
          );
        }

        // logs内のエントリをリストに変換
        final logEntries = logs.entries.map((entry) {
          final entryData = entry.value as Map<String, dynamic>;
          return {
            'entryId': entry.key,
            'actor': entryData['actor'] as String? ?? '',
            'amountDelta': entryData['amountDelta'] as num? ?? 0,
            'appliedAt': entryData['appliedAt'] as Timestamp?,
            'category': entryData['category'] as String? ?? '',
            'reasonType': entryData['reasonType'] as String? ?? '',
          };
        }).toList();

        // appliedAtでソート（最新が上）
        logEntries.sort((a, b) {
          final aTime = a['appliedAt'] as Timestamp?;
          final bTime = b['appliedAt'] as Timestamp?;
          if (aTime == null && bTime == null) return 0;
          if (aTime == null) return 1;
          if (bTime == null) return -1;
          return bTime.compareTo(aTime);
        });

        return ListView.builder(
          itemCount: logEntries.length,
          itemBuilder: (context, index) {
            final log = logEntries[index];
            final amountDelta = log['amountDelta'] as num? ?? 0;
            final appliedAt = log['appliedAt'] as Timestamp?;
            final category = log['category'] as String? ?? '';

            String formattedDate = '日時不明';
            if (appliedAt != null) {
              final date = appliedAt.toDate();
              formattedDate = '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
            }

            // categoryに応じて色を決定
            Color amountColor = Colors.black;
            IconData iconData = Icons.info;
            if (category == 'income') {
              amountColor = Colors.green;
              iconData = Icons.arrow_upward;
            } else if (category == 'expense') {
              amountColor = Colors.red;
              iconData = Icons.arrow_downward;
            } else if (category == 'purchase') {
              amountColor = Colors.orange;
              iconData = Icons.shopping_cart;
            }

            // categoryの表示名（ログタイプに応じて変更）
            String categoryDisplayName = category;
            switch (category) {
              case 'income':
                if (_selectedLogType == 'sideGameChip') {
                  categoryDisplayName = '預け入れ';
                } else {
                  // pointA, pointB
                  categoryDisplayName = '獲得';
                }
                break;
              case 'expense':
                if (_selectedLogType == 'sideGameChip') {
                  categoryDisplayName = '引出し';
                } else {
                  // pointA, pointB
                  categoryDisplayName = '使用';
                }
                break;
              case 'purchase':
                categoryDisplayName = '購入';
                break;
            }

            return Card(
              margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: amountColor.withOpacity(0.1),
                  child: Icon(
                    iconData,
                    color: amountColor,
                  ),
                ),
                title: Text(
                  categoryDisplayName,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: Text(formattedDate),
                trailing: Text(
                  '${amountDelta >= 0 ? '+' : ''}${amountDelta.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: amountColor,
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// 利用可能な日付（直近10個）を取得
  Stream<List<String>> _getAvailableDates() async* {
    String collectionName;
    switch (_selectedLogType) {
      case 'pointA':
        collectionName = 'pointALogs';
        break;
      case 'pointB':
        collectionName = 'pointBLogs';
        break;
      case 'sideGameChip':
        collectionName = 'sideGameChipLogs';
        break;
      default:
        collectionName = 'pointALogs';
    }

    // 過去30日分の日付を生成
    final dates = List.generate(30, (index) {
      final date = DateTime.now().subtract(Duration(days: index));
      return date.toIso8601String().split('T')[0];
    });

    // 各日付のドキュメントの存在を確認
    final List<String> availableDates = [];
    for (final date in dates) {
      try {
        final doc = await FirebaseFirestore.instance
            .collection('users')
            .doc(widget.userId)
            .collection(collectionName)
            .doc(date)
            .get();
        
        if (doc.exists) {
          availableDates.add(date);
          // 最大10個まで
          if (availableDates.length >= 10) {
            break;
          }
        }
      } catch (e) {
        // エラーは無視して続行
        continue;
      }
    }

    yield availableDates;

    // リアルタイム更新：当日のドキュメントを監視
    final today = DateTime.now().toIso8601String().split('T')[0];
    if (dates.contains(today)) {
      await for (final doc in FirebaseFirestore.instance
          .collection('users')
          .doc(widget.userId)
          .collection(collectionName)
          .doc(today)
          .snapshots()) {
        final List<String> updatedDates = List.from(availableDates);
        
        if (doc.exists && !updatedDates.contains(today)) {
          // 当日のドキュメントが存在し、リストに含まれていない場合は追加
          updatedDates.insert(0, today);
          // 最大10個まで
          if (updatedDates.length > 10) {
            updatedDates.removeLast();
          }
        } else if (!doc.exists && updatedDates.contains(today)) {
          // 当日のドキュメントが削除された場合はリストから削除
          updatedDates.remove(today);
        }
        
        yield updatedDates;
      }
    }
  }
}

