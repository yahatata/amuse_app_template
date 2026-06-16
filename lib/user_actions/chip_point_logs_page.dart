import 'dart:async';

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
  String? _selectedDate;

  /// ログ種別ごとに日付一覧をキャッシュ（タブ切替のたびに再取得しない）
  final Map<String, List<String>> _datesByLogType = {};
  final Set<String> _loadingLogTypes = {};

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _todaySubscription;
  String? _watchingLogType;

  @override
  void initState() {
    super.initState();
    _ensureDatesLoaded(_selectedLogType);
  }

  @override
  void dispose() {
    _todaySubscription?.cancel();
    super.dispose();
  }

  bool get _isLoadingDates => _loadingLogTypes.contains(_selectedLogType);

  List<String> get _availableDates =>
      _datesByLogType[_selectedLogType] ?? const [];

  String _collectionNameForLogType(String logType) {
    switch (logType) {
      case 'pointA':
        return 'pointALogs';
      case 'pointB':
        return 'pointBLogs';
      case 'sideGameChip':
        return 'sideGameChipLogs';
      default:
        return 'pointALogs';
    }
  }

  void _onLogTypeChanged(String logType) {
    if (logType == _selectedLogType) return;

    final cached = _datesByLogType[logType];
    setState(() {
      _selectedLogType = logType;
      _selectedDate =
          cached != null && cached.isNotEmpty ? cached.first : null;
    });

    _ensureDatesLoaded(logType);
    _syncTodayWatch(logType);
  }

  Future<void> _ensureDatesLoaded(String logType) async {
    if (_datesByLogType.containsKey(logType) ||
        _loadingLogTypes.contains(logType)) {
      return;
    }

    setState(() => _loadingLogTypes.add(logType));

    try {
      final dates = await _queryAvailableDates(logType);
      if (!mounted) return;

      setState(() {
        _datesByLogType[logType] = dates;
        _loadingLogTypes.remove(logType);
        if (logType == _selectedLogType) {
          _selectedDate = dates.isNotEmpty ? dates.first : null;
        }
      });

      if (logType == _selectedLogType) {
        _syncTodayWatch(logType);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _datesByLogType[logType] = [];
        _loadingLogTypes.remove(logType);
        if (logType == _selectedLogType) {
          _selectedDate = null;
        }
      });
    }
  }

  void _syncTodayWatch(String logType) {
    if (_watchingLogType == logType) return;

    _todaySubscription?.cancel();
    _watchingLogType = logType;

    final today = DateTime.now().toIso8601String().split('T')[0];
    final collectionName = _collectionNameForLogType(logType);

    _todaySubscription = FirebaseFirestore.instance
        .collection('users')
        .doc(widget.userId)
        .collection(collectionName)
        .doc(today)
        .snapshots()
        .listen((doc) {
      if (!mounted || _selectedLogType != logType) return;

      final current = List<String>.from(_datesByLogType[logType] ?? []);
      var changed = false;

      if (doc.exists && !current.contains(today)) {
        current.insert(0, today);
        if (current.length > 10) {
          current.removeLast();
        }
        changed = true;
      } else if (!doc.exists && current.contains(today)) {
        current.remove(today);
        changed = true;
      }

      if (!changed) return;

      setState(() {
        _datesByLogType[logType] = current;
        if (logType == _selectedLogType) {
          if (_selectedDate == null && current.isNotEmpty) {
            _selectedDate = current.first;
          } else if (_selectedDate == today && !current.contains(today)) {
            _selectedDate = current.isNotEmpty ? current.first : null;
          }
        }
      });
    });
  }

  /// 利用可能な日付（直近10個）を取得
  Future<List<String>> _queryAvailableDates(String logType) async {
    final collectionName = _collectionNameForLogType(logType);

    final dates = List.generate(30, (index) {
      final date = DateTime.now().subtract(Duration(days: index));
      return date.toIso8601String().split('T')[0];
    });

    final availableDates = <String>[];
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
          if (availableDates.length >= 10) {
            break;
          }
        }
      } catch (_) {
        continue;
      }
    }

    return availableDates;
  }

  Widget _buildDateSelector() {
    if (_isLoadingDates) {
      return const SizedBox(
        height: 60,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_availableDates.isEmpty) {
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
        itemCount: _availableDates.length,
        itemBuilder: (context, index) {
          final date = _availableDates[index];
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
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.pokerName} - 履歴'),
      ),
      body: Column(
        children: [
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
                      _onLogTypeChanged(newSelection.first);
                    },
                  ),
                ),
              ],
            ),
          ),
          _buildDateSelector(),
          Expanded(
            child: _buildLogsList(),
          ),
        ],
      ),
    );
  }

  Widget _buildLogsList() {
    if (_isLoadingDates) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_availableDates.isEmpty) {
      return const Center(
        child: Text('利用可能な日付がありません'),
      );
    }

    if (_selectedDate == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final collectionName = _collectionNameForLogType(_selectedLogType);

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
              formattedDate =
                  '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
            }

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

            String categoryDisplayName = category;
            switch (category) {
              case 'income':
                categoryDisplayName =
                    _selectedLogType == 'sideGameChip' ? '預け入れ' : '獲得';
                break;
              case 'expense':
                categoryDisplayName =
                    _selectedLogType == 'sideGameChip' ? '引出し' : '使用';
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
}
