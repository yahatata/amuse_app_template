import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../services/device_service.dart';

class TournamentActionsHistoryPage extends StatefulWidget {
  final String tournamentId;

  const TournamentActionsHistoryPage({
    super.key,
    required this.tournamentId,
  });

  @override
  State<TournamentActionsHistoryPage> createState() => _TournamentActionsHistoryPageState();
}

class _TournamentActionsHistoryPageState extends State<TournamentActionsHistoryPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _actionLogs = [];
  bool _isLoading = false;
  String? _currentDeviceId;
  String? _currentDeviceName;
  int _currentTabIndex = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      if (_tabController.index != _currentTabIndex) {
        setState(() {
          _currentTabIndex = _tabController.index;
        });
        _loadActionLogs();
      }
    });
    _initializeDeviceInfo();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _initializeDeviceInfo() async {
    try {
      final deviceService = DeviceService();
      final device = await deviceService.getCurrentDevice();
      if (device != null) {
        setState(() {
          _currentDeviceId = device.id;
          _currentDeviceName = device.name;
        });
      }
    } catch (e) {
      print('デバイス情報の取得に失敗: $e');
    }
  }

  Future<void> _loadActionLogs() async {
    if (_isLoading) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final functions = FirebaseFunctions.instance;
      
      // タブに応じてクエリパラメータを設定
      Map<String, dynamic> params = {
        'tournamentId': widget.tournamentId,
        'limit': 100,
      };

      if (_currentTabIndex == 0 && _currentDeviceId != null) {
        // この端末の操作のみ
        params['deviceId'] = _currentDeviceId;
      }

      final result = await functions
          .httpsCallable('getActionLogs')
          .call(params);

      if (result.data['success'] == true) {
        // デバッグ用ログ
        print('=== ActionLogs Debug ===');
        print('result.data type: ${result.data.runtimeType}');
        print('result.data keys: ${(result.data as Map).keys.toList()}');
        print('actionLogs type: ${result.data['actionLogs'].runtimeType}');
        print('actionLogs length: ${(result.data['actionLogs'] as List).length}');
        
        // 最初のログの詳細を確認
        if ((result.data['actionLogs'] as List).isNotEmpty) {
          final firstLog = (result.data['actionLogs'] as List).first;
          print('First log type: ${firstLog.runtimeType}');
          if (firstLog is Map) {
            print('First log keys: ${firstLog.keys.toList()}');
            print('First log createdAt: ${firstLog['createdAt']}');
            print('First log createdAt type: ${firstLog['createdAt']?.runtimeType}');
          }
        }
        
        // 型安全な変換を行う
        final rawLogs = result.data['actionLogs'] as List<dynamic>;
        print('rawLogs type: ${rawLogs.runtimeType}');
        
        final logs = rawLogs.map((log) {
          print('log type: ${log.runtimeType}');
          if (log is Map) {
            // Map<Object?, Object?> を Map<String, dynamic> に変換
            final converted = Map<String, dynamic>.from(log.map((key, value) => 
              MapEntry(key.toString(), value)
            ));
            print('converted log: $converted');
            
            // createdAtの詳細をデバッグ出力
            if (converted.containsKey('createdAt')) {
              print('=== createdAt Debug ===');
              print('createdAt value: ${converted['createdAt']}');
              print('createdAt type: ${converted['createdAt'].runtimeType}');
              
              // createdAtがMapの場合、Firestore Timestampの可能性
              if (converted['createdAt'] is Map) {
                final timestampMap = converted['createdAt'] as Map;
                print('Timestamp Map keys: ${timestampMap.keys.toList()}');
                print('Timestamp Map values: ${timestampMap.values.toList()}');
                
                if (timestampMap.containsKey('_seconds')) {
                  final seconds = timestampMap['_seconds'] as int;
                  final nanoseconds = timestampMap['_nanoseconds'] as int? ?? 0;
                  final dateTime = DateTime.fromMillisecondsSinceEpoch(
                    (seconds * 1000) + (nanoseconds ~/ 1000000),
                    isUtc: true,
                  );
                  print('Converted DateTime: $dateTime');
                  // 変換されたDateTimeで置き換え
                  converted['createdAt'] = dateTime;
                } else if (timestampMap.isEmpty) {
                  print('WARNING: createdAt is an empty Map! This should not happen.');
                }
              }
              print('=== End createdAt Debug ===');
            }
            
            return converted;
          }
          print('log is not a Map: $log');
          return <String, dynamic>{};
        }).where((log) => log.isNotEmpty).toList();
        
        print('final logs length: ${logs.length}');
        print('=== End Debug ===');
        
        // タブに応じてフィルタリング
        List<Map<String, dynamic>> filteredLogs = logs;
        
        if (_currentTabIndex == 1) {
          // 全ての端末の操作（フィルタリングなし）
          print('全ての端末の操作: ${logs.length}件');
        } else if (_currentTabIndex == 2) {
          // 他端末の操作のみ
          filteredLogs = logs.where((log) => 
            log['deviceId'] != _currentDeviceId
          ).toList();
          print('他端末の操作: ${filteredLogs.length}件 (全体: ${logs.length}件)');
        } else {
          print('この端末の操作: ${logs.length}件');
        }

        setState(() {
          _actionLogs = filteredLogs;
        });
        
        print('フィルタリング後のログ数: ${filteredLogs.length}');
      } else {
        throw Exception('アクションログの取得に失敗しました');
      }
    } catch (e, stackTrace) {
      print('アクションログ取得エラー: $e');
      print('スタックトレース: $stackTrace');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('アクションログの取得に失敗しました: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: '詳細',
              textColor: Colors.white,
              onPressed: () {
                print('詳細エラー: $e');
                print('スタックトレース: $stackTrace');
              },
            ),
          ),
        );
      }
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _rollbackAction(Map<String, dynamic> actionLog) async {
    // 確認ダイアログを表示
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('操作の取り消し'),
        content: Text('この操作を本当に取り消しますか？\n\n'
            '操作: ${_getActionDisplayName(actionLog['action'])}\n'
            '対象: ${actionLog['targetPlayerName'] ?? 'なし'}\n'
            '実行時刻: ${_formatDateTime(actionLog['createdAt'])}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('取り消し', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final functions = FirebaseFunctions.instance;
      
      // ロールバックに必要なパラメータを構築
      final params = <String, dynamic>{
        'tournamentId': widget.tournamentId,
        'actionLogId': actionLog['id'],
        'action': actionLog['action'],
        'rollBackBy': _currentDeviceId ?? 'unknown',
      };

      // 操作タイプに応じて必要なパラメータを追加
      final action = actionLog['action'] as String;
      switch (action) {
        case 'addon':
        case 'bust_and_exit':
        case 'bust_and_reentry':
        case 'assign_seat_to_player':
          if (actionLog['targetUid'] != null) params['playerUid'] = actionLog['targetUid'];
          if (actionLog['targetPlayerName'] != null) params['playerName'] = actionLog['targetPlayerName'];
          if (actionLog['tableId'] != null) params['tableId'] = actionLog['tableId'];
          if (actionLog['seatNumber'] != null) params['seatNumber'] = actionLog['seatNumber'];
          break;
        case 'bulk_addon':
          if (actionLog['tableId'] != null) params['tableId'] = actionLog['tableId'];
          // bulk_addonの場合は、detailsからplayerUidsとplayerNamesを取得
          if (actionLog['details'] is Map) {
            final details = actionLog['details'] as Map;
            if (details['playerUids'] != null) params['playerUids'] = details['playerUids'];
            if (details['playerNames'] != null) params['playerNames'] = details['playerNames'];
          }
          break;
        case 'register_participants':
          // register_participantsの場合は、detailsからplayerUidsとplayerNamesを取得
          if (actionLog['details'] is Map) {
            final details = actionLog['details'] as Map;
            if (details['playerUids'] != null) params['playerUids'] = details['playerUids'];
            if (details['playerNames'] != null) params['playerNames'] = details['playerNames'];
          }
          break;
        case 'reseat_all_players':
          // reseat_all_playersの場合は、detailsからpreviousSeatingDataを取得
          if (actionLog['details'] is Map) {
            final details = actionLog['details'] as Map;
            if (details['previousSeatingData'] != null) params['previousSeatingData'] = details['previousSeatingData'];
          }
          break;
      }

      print('=== Rollback Params Debug ===');
      print('Action: $action');
      print('ActionLog: $actionLog');
      print('Params: $params');
      print('=== End Rollback Params Debug ===');

      final result = await functions
          .httpsCallable('rollbackAction')
          .call(params);

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('操作の取り消しが完了しました'),
              backgroundColor: Colors.green,
            ),
          );
        }
        // ログを再読み込み
        _loadActionLogs();
      } else {
        throw Exception('ロールバックに失敗しました');
      }
    } catch (e) {
      print('ロールバックエラー: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('操作の取り消しに失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  String _getActionDisplayName(String action) {
    switch (action) {
      case 'addon':
        return 'アドオン';
      case 'bulk_addon':
        return '複数アドオン';
      case 'bust_and_exit':
        return 'バースト＆退場';
      case 'bust_and_reentry':
        return 'バースト＆リエントリー';
      case 'register_participants':
        return 'エントリー';
      case 'assign_seat_to_player':
        return 'シート割当';
      case 'reseat_all_players':
        return '全員リシート';
      case 'create_tournament':
        return 'トーナメント作成';
      default:
        return action;
    }
  }

  String _formatDateTime(dynamic dateTime) {
    if (dateTime == null) return '不明';
    
    // 空のオブジェクトや無効なデータのチェック
    if (dateTime is Map && dateTime.isEmpty) {
      print('時刻データが空のオブジェクトです: $dateTime');
      return '時刻不明';
    }
    
    print('=== _formatDateTime Debug ===');
    print('入力値: $dateTime');
    print('入力値の型: ${dateTime.runtimeType}');
    
    DateTime? parsedDateTime;
    
    if (dateTime is DateTime) {
      parsedDateTime = dateTime;
      print('DateTime型として処理');
    } else if (dateTime is String) {
      // ISO文字列の場合
      try {
        parsedDateTime = DateTime.parse(dateTime);
        print('ISO文字列としてパース成功: $parsedDateTime');
      } catch (e) {
        print('日時文字列のパースエラー: $dateTime, $e');
        return 'パースエラー';
      }
    } else if (dateTime is Map) {
      // Firestore Timestampの場合
      print('Map型として処理: $dateTime');
      print('Mapのキー: ${dateTime.keys.toList()}');
      
      try {
        if (dateTime['_seconds'] != null) {
          final seconds = dateTime['_seconds'] as int;
          final nanoseconds = dateTime['_nanoseconds'] as int? ?? 0;
          parsedDateTime = DateTime.fromMillisecondsSinceEpoch(
            (seconds * 1000) + (nanoseconds ~/ 1000000),
            isUtc: true,
          );
          print('Timestamp変換成功: $parsedDateTime');
        } else {
          print('_secondsフィールドが見つかりません');
        }
      } catch (e) {
        print('Timestamp変換エラー: $dateTime, $e');
        return '変換エラー';
      }
    }
    
    if (parsedDateTime != null) {
      // UTCからJSTに変換（+9時間）
      final jstDateTime = parsedDateTime.toUtc().add(const Duration(hours: 9));
      final result = '${jstDateTime.year}/${jstDateTime.month.toString().padLeft(2, '0')}/${jstDateTime.day.toString().padLeft(2, '0')} '
          '${jstDateTime.hour.toString().padLeft(2, '0')}:'
          '${jstDateTime.minute.toString().padLeft(2, '0')}:'
          '${jstDateTime.second.toString().padLeft(2, '0')}';
      print('最終結果: $result');
      print('=== End _formatDateTime Debug ===');
      return result;
    }
    
    print('パース失敗、元の値を返却: ${dateTime.toString()}');
    print('=== End _formatDateTime Debug ===');
    return dateTime.toString();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('操作履歴'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadActionLogs,
            tooltip: '更新',
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'この端末'),
            Tab(text: '全て'),
            Tab(text: '他端末'),
          ],
        ),
      ),
      body: Column(
        children: [
          // 初回データ取得ボタン
          if (_actionLogs.isEmpty && !_isLoading)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              child: ElevatedButton(
                onPressed: _loadActionLogs,
                child: const Text('データを取得'),
              ),
            ),
          
          // ログ一覧
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _actionLogs.isEmpty
                    ? const Center(
                        child: Text('操作履歴がありません'),
                      )
                    : ListView.builder(
                        itemCount: _actionLogs.length,
                        itemBuilder: (context, index) {
                          final log = _actionLogs[index];
                          return _buildActionLogItem(log);
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionLogItem(Map<String, dynamic> log) {
    final isRolledBack = log['isRollBack'] == true;
    
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: ListTile(
        title: Row(
          children: [
            Text(
              _getActionDisplayName(log['action']),
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: isRolledBack ? Colors.grey : Colors.black,
              ),
            ),
            if (isRolledBack) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  '取り消し済み',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ),
            ],
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (log['targetPlayerName'] != null)
              Text('対象: ${log['targetPlayerName']}'),
            if (log['tableId'] != null)
              Text('テーブル: ${log['tableId']}'),
            if (log['seatNumber'] != null)
              Text('シート: ${log['seatNumber']}'),
            Text('実行者: ${log['deviceName']} (${log['deviceId']})'),
            Text('時刻: ${_formatDateTime(log['createdAt'])}'),
            // デバッグ用：生データも表示
            Text('生データ: ${log['createdAt']}', style: TextStyle(fontSize: 10, color: Colors.grey)),
            if (isRolledBack && log['rollBackBy'] != null)
              Text('取り消し者: ${log['rollBackBy']}'),
          ],
        ),
        trailing: isRolledBack
            ? null
            : IconButton(
                icon: const Icon(Icons.undo, color: Colors.orange),
                onPressed: () => _rollbackAction(log),
                tooltip: '取り消し',
              ),
      ),
    );
  }
}
