import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/scheduling/errors/tournament_admin_user_facing_errors.dart';
import '../../services/device_service.dart';
import '../../services/store_config_service.dart';
import 'bust_undo_fallback_seat_dialog.dart';
import 'bust_undo_seat_selection_error.dart';

class TournamentActionsHistoryPage extends StatefulWidget {
  final String tournamentId;
  /// 卓ページから遷移した場合に指定。指定時はタブを出さずこの卓の操作のみ表示する。
  final String? tableId;

  const TournamentActionsHistoryPage({
    super.key,
    required this.tournamentId,
    this.tableId,
  });

  @override
  State<TournamentActionsHistoryPage> createState() => _TournamentActionsHistoryPageState();
}

class _TournamentActionsHistoryPageState extends State<TournamentActionsHistoryPage>
    with SingleTickerProviderStateMixin {
  static const Set<String> _rollbackEnabledActions = {
    'addon',
    'bulk_addon',
    'bust_and_exit',
    'bust_and_reentry',
    'end_tournament',
    'register_participants',
    'register_for_tournament',
    'assign_seat_to_player',
    'reseat_all_players',
    'set_ranking_data',
    'okibake_create_entry',
    'okibake_update_linked_user',
    'okibake_link_bill',
    'okibake_assign_seat',
    'okibake_bust',
    'okibake_addon',
  };
  TabController? _tabController;
  List<Map<String, dynamic>> _actionLogs = [];
  bool _isLoading = false;
  bool _actionLogsLoadFailed = false;
  bool _isRollingBack = false;
  String? _currentDeviceId;
  String? _currentDeviceName;
  int _currentTabIndex = 0;
  bool _isCurrentTableDevice = false;
  bool _tableDeviceHistoryViewEnabled = true;
  bool _tableDeviceHistoryRollbackEnabled = false;

  bool get _isTableScope => widget.tableId != null && widget.tableId!.isNotEmpty;
  bool get _canViewHistory =>
      !_isCurrentTableDevice || _tableDeviceHistoryViewEnabled;
  bool get _canRollbackHistory =>
      !_isCurrentTableDevice ||
      (_tableDeviceHistoryViewEnabled && _tableDeviceHistoryRollbackEnabled);

  @override
  void initState() {
    super.initState();
    if (!_isTableScope) {
      _tabController = TabController(length: 2, vsync: this);
      _tabController!.addListener(() {
        if (_tabController!.index != _currentTabIndex) {
          setState(() {
            _currentTabIndex = _tabController!.index;
          });
          _loadActionLogs();
        }
      });
    }
    _initializePageState();
  }

  @override
  void dispose() {
    _tabController?.dispose();
    super.dispose();
  }

  Future<void> _initializePageState() async {
    try {
      final deviceService = DeviceService();
      final device = await deviceService.getCurrentDevice();
      final config =
          StoreConfigService.instance.latestData ?? StoreConfigData.fromDefaults();
      if (device != null) {
        setState(() {
          _currentDeviceId = device.id;
          _currentDeviceName = device.name;
          _isCurrentTableDevice = device.role == 'table';
          _tableDeviceHistoryViewEnabled =
              config.tableDeviceActionHistoryViewEnabled;
          _tableDeviceHistoryRollbackEnabled =
              config.tableDeviceActionHistoryRollbackEnabled;
        });
      }
    } catch (e) {
      print('デバイス情報の取得に失敗: $e');
    }

    if (!_canViewHistory || !mounted) {
      return;
    }
    await _loadActionLogs();
  }

  Future<void> _loadActionLogs() async {
    if (_isLoading || !_canViewHistory) return;

    setState(() {
      _isLoading = true;
      _actionLogsLoadFailed = false;
    });

    try {
      final functions = FunctionsClient.instance;
      
      Map<String, dynamic> params = {
        'tournamentId': widget.tournamentId,
        'limit': 100,
      };
      if (_isTableScope) {
        params['tableId'] = widget.tableId;
      } else {
        // トーナメントページから: index 0 = 全て, index 1 = この端末
        if (_currentTabIndex == 1 && _currentDeviceId != null) {
          params['deviceId'] = _currentDeviceId;
        }
      }

      final result = await functions
          .httpsCallable('getActionLogs')
          .call(params);

      if (isCallableSuccessResponse(result.data)) {
        final rawLogs = result.data['actionLogs'] as List<dynamic>? ?? [];
        final logs = rawLogs.map((log) {
          if (log is Map) {
            final converted = Map<String, dynamic>.from(log.map((key, value) =>
                MapEntry(key.toString(), value)));
            // createdAt が Map（Firestore Timestamp 由来）の場合は DateTime に変換
            if (converted['createdAt'] is Map) {
              final m = converted['createdAt'] as Map;
              if (m['_seconds'] != null) {
                final sec = m['_seconds'] as int;
                final nano = (m['_nanoseconds'] as int?) ?? 0;
                converted['createdAt'] = DateTime.fromMillisecondsSinceEpoch(
                  (sec * 1000) + (nano ~/ 1000000),
                  isUtc: true,
                );
              }
            }
            return converted;
          }
          return <String, dynamic>{};
        }).where((log) => log.isNotEmpty).toList();
        
        print('final logs length: ${logs.length}');
        print('=== End Debug ===');
        
        setState(() {
          _actionLogs = logs;
          _actionLogsLoadFailed = false;
        });
      } else if (mounted) {
        setState(() {
          _actionLogs = [];
          _actionLogsLoadFailed = true;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentAdminSoftFail(
                result.data,
                operation: kLoadTournamentActionLogsOperation,
              ),
            ),
            backgroundColor: Colors.red,
            action: SnackBarAction(
              label: '再試行',
              onPressed: _loadActionLogs,
            ),
          ),
        );
      }
    } catch (e, stackTrace) {
      print('アクションログ取得エラー');
      print('スタックトレース: $stackTrace');
      if (mounted) {
        setState(() {
          _actionLogs = [];
          _actionLogsLoadFailed = true;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentAdminCallableError(
                e,
                operation: kLoadTournamentActionLogsOperation,
              ),
            ),
            backgroundColor: Colors.red,
            action: SnackBarAction(
              label: '再試行',
              onPressed: _loadActionLogs,
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

  /// 一括アドオン・参加者一括登録で details からプレイヤー一覧を組み立てる
  List<Map<String, dynamic>> _getPlayerItemsFromDetails(Map<String, dynamic> details) {
    final merged = <Map<String, dynamic>>[];

    final detailsList = details['details'];
    if (detailsList is List && detailsList.isNotEmpty) {
      for (final e in detailsList) {
        final m = Map<String, dynamic>.from(e is Map ? e : {});
        final uid = m['playerUid']?.toString() ?? '';
        if (uid.isEmpty) continue;
        merged.add({
          'targetType': 'normal',
          'targetId': uid,
          'playerUid': uid,
          'playerName': m['playerName']?.toString() ?? 'User_$uid',
          ...m,
        });
      }
    } else {
      final uids = (details['playerUids'] as List?)?.map((e) => e?.toString() ?? '').toList() ?? [];
      final names = (details['playerNames'] as List?)?.map((e) => e?.toString() ?? '').toList() ?? [];
      for (var i = 0; i < uids.length; i++) {
        final uid = uids[i];
        if (uid.isEmpty) continue;
        merged.add({
          'targetType': 'normal',
          'targetId': uid,
          'playerUid': uid,
          'playerName': i < names.length ? names[i] : 'User_$uid',
        });
      }
    }

    final okibakeTargets = details['okibakeTargets'];
    if (okibakeTargets is List && okibakeTargets.isNotEmpty) {
      for (final e in okibakeTargets) {
        if (e is! Map) continue;
        final id = e['okibakeEntryId']?.toString() ?? '';
        if (id.isEmpty) continue;
        final displayName =
            (e['playerName'] ?? e['pokerName'] ?? e['displayName'] ?? id).toString();
        merged.add({
          'targetType': 'okibake',
          'targetId': id,
          'okibakeEntryId': id,
          'playerName': '$displayName（置きバケ）',
        });
      }
    }

    return merged;
  }

  /// 一括アドオン・参加者一括登録の取り消し対象者を選択するダイアログ。選択された subset を返す（キャンセル時は null）
  Future<Map<String, dynamic>?> _showPartialRollbackSelectionDialog(Map<String, dynamic> actionLog) async {
    final details = actionLog['details'];
    if (details is! Map) return null;
    final detailsMap = Map<String, dynamic>.from(details);
    final players = _getPlayerItemsFromDetails(detailsMap);
    if (players.isEmpty) return null;

    final selected = List<bool>.filled(players.length, true);
    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('取り消し対象の選択'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '取り消す対象にチェックを入れてください（${players.length}人）',
                      style: const TextStyle(fontSize: 13),
                    ),
                    const SizedBox(height: 12),
                    ...List.generate(players.length, (i) {
                      return CheckboxListTile(
                        value: selected[i],
                        onChanged: (v) {
                          setDialogState(() => selected[i] = v ?? true);
                        },
                        title: Text(players[i]['playerName']?.toString() ?? '不明'),
                        controlAffinity: ListTileControlAffinity.leading,
                        dense: true,
                      );
                    }),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(null),
                  child: const Text('キャンセル'),
                ),
                ElevatedButton(
                  onPressed: () {
                    final indices = <int>[];
                    for (var i = 0; i < selected.length; i++) {
                      if (selected[i]) indices.add(i);
                    }
                    if (indices.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('1人以上選択してください')),
                      );
                      return;
                    }
                    final subset = indices.map((i) => players[i]).toList();
                    final normalSubset = subset.where((e) => e['targetType'] != 'okibake').toList();
                    final okibakeSubset = subset.where((e) => e['targetType'] == 'okibake').toList();
                    Navigator.of(context).pop(<String, dynamic>{
                      'playerUids': normalSubset.map((e) => e['playerUid']).toList(),
                      'playerNames': subset.map((e) => e['playerName']).toList(),
                      'okibakeEntryIds': okibakeSubset.map((e) => e['okibakeEntryId']).toList(),
                      'details': subset,
                    });
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                  child: const Text('選択した分を取り消す', style: TextStyle(color: Colors.white)),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _rollbackAction(
    Map<String, dynamic> actionLog, {
    Map<String, dynamic>? fallbackSeat,
  }) async {
    final action = actionLog['action'] as String;
    final isPartialRollback = action == 'bulk_addon' || action == 'register_participants';

    Map<String, dynamic>? selectedSubset;
    if (isPartialRollback && actionLog['details'] is Map) {
      selectedSubset = await _showPartialRollbackSelectionDialog(actionLog);
      if (selectedSubset == null) return;
      if (!mounted) return;
    }

    final confirmContent = selectedSubset != null
        ? '操作: ${_getActionDisplayName(action, actionLog)}\n'
            '取り消し対象: ${(selectedSubset['playerNames'] as List?)?.join(', ') ?? ''}\n'
            '実行時刻: ${_formatDateTime(actionLog['executedAt'] ?? actionLog['createdAt'])}'
        : '操作: ${_getActionDisplayName(action, actionLog)}\n'
            '対象: ${_getTargetDisplayForConfirm(actionLog)}\n'
            '実行時刻: ${_formatDateTime(actionLog['executedAt'] ?? actionLog['createdAt'])}';

    final bool confirmed;
    if (fallbackSeat != null) {
      confirmed = await showBustUndoFallbackSeatConfirmDialog(
        context,
        actionDisplayName: _getActionDisplayName(action, actionLog),
        targetDisplay: _getTargetDisplayForConfirm(actionLog),
        fallbackSeat: fallbackSeat,
      );
    } else {
      final rollbackConfirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('操作の取り消し'),
          content: Text('この操作を本当に取り消しますか？\n\n$confirmContent'),
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
      confirmed = rollbackConfirmed == true;
    }

    if (!confirmed) return;

    if (!mounted) return;
    setState(() => _isRollingBack = true);

    try {
      final functions = FunctionsClient.instance;
      
      final action = actionLog['action'] as String;
      // 操作履歴は operationLogs のみ。取り消しは常に operationId で指定
        final params = <String, dynamic>{
        'tournamentId': widget.tournamentId,
        'operationId': actionLog['operationId'] ?? actionLog['id'],
        'action': action,
        'rollBackBy': _currentDeviceId ?? 'unknown',
        if (_currentDeviceName != null && _currentDeviceName!.isNotEmpty) 'rollBackByDeviceName': _currentDeviceName,
        if (fallbackSeat != null) 'fallbackSeat': fallbackSeat,
      };

      // 操作タイプに応じて必要なパラメータを追加（addon は operationLogs から取得するため不要）
      switch (action) {
        case 'bust_and_exit':
        case 'bust_and_reentry':
        case 'assign_seat_to_player':
        case 'register_for_tournament':
          if (actionLog['targetUid'] != null) params['playerUid'] = actionLog['targetUid'];
          if (actionLog['targetPlayerName'] != null) params['playerName'] = actionLog['targetPlayerName'];
          if (actionLog['tableId'] != null) params['tableId'] = actionLog['tableId'];
          if (actionLog['seatNumber'] != null) params['seatNumber'] = actionLog['seatNumber'];
          break;
        case 'bulk_addon':
          if (actionLog['tableId'] != null) params['tableId'] = actionLog['tableId'];
          if (selectedSubset != null) {
            params['playerUids'] = selectedSubset['playerUids'];
            params['playerNames'] = selectedSubset['playerNames'];
            params['okibakeEntryIds'] = selectedSubset['okibakeEntryIds'];
            params['details'] = selectedSubset['details'];
          } else if (actionLog['details'] is Map) {
            final details = actionLog['details'] as Map;
            if (details['playerUids'] != null) params['playerUids'] = details['playerUids'];
            if (details['playerNames'] != null) params['playerNames'] = details['playerNames'];
            if (details['okibakeTargets'] is List) {
              params['okibakeEntryIds'] =
                  (details['okibakeTargets'] as List)
                      .whereType<Map>()
                      .map((e) => e['okibakeEntryId']?.toString() ?? '')
                      .where((e) => e.isNotEmpty)
                      .toList();
            }
            if (details['details'] != null) params['details'] = details['details'];
          }
          break;
        case 'register_participants':
          if (selectedSubset != null) {
            params['playerUids'] = selectedSubset['playerUids'];
            params['playerNames'] = selectedSubset['playerNames'];
            params['details'] = selectedSubset['details'];
          } else if (actionLog['details'] is Map) {
            final details = actionLog['details'] as Map;
            if (details['playerUids'] != null) params['playerUids'] = details['playerUids'];
            if (details['playerNames'] != null) params['playerNames'] = details['playerNames'];
            if (details['details'] != null) params['details'] = details['details'];
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

      if (isCallableSuccessResponse(result.data)) {
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
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(mapCallableSoftFailMessage(result.data)),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      print('ロールバックエラー: $e');
      final seatSelection = extractBustUndoSeatSelectionRequired(e);
      if (seatSelection != null && fallbackSeat == null && mounted) {
        setState(() => _isRollingBack = false);
        final selectedSeat = await showBustUndoFallbackSeatDialog(context, seatSelection);
        if (selectedSeat != null && mounted) {
          await _rollbackAction(actionLog, fallbackSeat: selectedSeat);
        }
        return;
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentAdminCallableError(
                e,
                operation: kRollbackTournamentActionOperation,
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isRollingBack = false);
      }
    }
  }

  String _getActionDisplayName(String action, [Map<String, dynamic>? log]) {
    switch (action) {
      case 'addon':
      case 'okibake_addon':
        return 'アドオン';
      case 'okibake_create_entry':
        return '置きバケ登録';
      case 'bulk_addon':
        return '複数アドオン';
      case 'bust_and_exit':
        return 'バースト＆退場';
      case 'okibake_bust':
        return 'バースト（置きバケ）';
      case 'okibake_update_linked_user':
        return '対象ユーザー設定（置きバケ）';
      case 'okibake_link_bill':
        return '伝票紐付け（置きバケ）';
      case 'bust_and_reentry':
        return 'バースト＆リエントリー';
      case 'end_tournament':
        if (log != null && log['details'] is Map) {
          final details = log['details'] as Map;
          if (details['endType'] == 'force') return 'トーナメント強制終了';
        }
        return 'トーナメント終了';
      case 'set_ranking_data':
        return 'ランキングデータ設定';
      case 'register_participants':
        return '参加者一括登録';
      case 'register_for_tournament':
        return 'トーナメント登録';
      case 'assign_seat_to_player':
      case 'okibake_assign_seat':
        return 'シート割当';
      case 'reseat_all_players':
        return '全員リシート';
      case 'create_tournament':
        return 'トーナメント作成';
      case 'other':
        if (log != null && log['operationName'] != null) {
          return log['operationName'].toString();
        }
        return 'その他';
      default:
        if (log != null && log['operationName'] != null) {
          return log['operationName'].toString();
        }
        return action;
    }
  }

  bool _canRollback(Map<String, dynamic> log) {
    if (_actionLogsLoadFailed) return false;
    if (log['isRollBack'] == true) return false;
    if (!_canRollbackHistory) return false;
    final action = log['action']?.toString() ?? '';
    return _rollbackEnabledActions.contains(action);
  }

  String _formatDateTime(dynamic dateTime) {
    if (dateTime == null) return '不明';
    if (dateTime is Map && dateTime.isEmpty) return '時刻不明';

    DateTime? parsed;
    if (dateTime is DateTime) {
      parsed = dateTime;
    } else if (dateTime is String) {
      try {
        parsed = DateTime.parse(dateTime);
      } catch (_) {
        return '時刻不明';
      }
    } else if (dateTime is Map && dateTime['_seconds'] != null) {
      try {
        final sec = dateTime['_seconds'] as int;
        final nano = (dateTime['_nanoseconds'] as int?) ?? 0;
        parsed = DateTime.fromMillisecondsSinceEpoch(
          (sec * 1000) + (nano ~/ 1000000),
          isUtc: true,
        );
      } catch (_) {
        return '時刻不明';
      }
    } else if (dateTime is int) {
      parsed = DateTime.fromMillisecondsSinceEpoch(dateTime, isUtc: true);
    }

    if (parsed != null) {
      final jst = parsed.toUtc().add(const Duration(hours: 9));
      return '${jst.year}/${jst.month.toString().padLeft(2, '0')}/${jst.day.toString().padLeft(2, '0')} '
          '${jst.hour.toString().padLeft(2, '0')}:${jst.minute.toString().padLeft(2, '0')}:${jst.second.toString().padLeft(2, '0')}';
    }
    return '時刻不明';
  }

  /// 取り消し確認ダイアログ用の「対象」表示文字列
  String _getTargetDisplayForConfirm(Map<String, dynamic> actionLog) {
    if ((actionLog['action'] == 'register_participants' || actionLog['action'] == 'bulk_addon') &&
        actionLog['details'] is Map) {
      final details = actionLog['details'] as Map;
      final playerNames = details['playerNames'];
      final okibakeTargets = details['okibakeTargets'];
      final mergedNames = <String>[];
      if (playerNames is List && playerNames.isNotEmpty) {
        final names = playerNames.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
        mergedNames.addAll(names);
      }
      if (okibakeTargets is List && okibakeTargets.isNotEmpty) {
        for (final target in okibakeTargets) {
          if (target is! Map) continue;
          final raw =
              target['playerName'] ??
              target['pokerName'] ??
              target['displayName'] ??
              target['okibakeEntryId'];
          final name = raw?.toString() ?? '';
          if (name.isNotEmpty) {
            mergedNames.add('$name（置きバケ）');
          }
        }
      }
      if (mergedNames.isNotEmpty) {
        return mergedNames.join(', ');
      }
    }
    if (actionLog['action'] == 'set_ranking_data' && actionLog['details'] is Map) {
      final details = actionLog['details'] as Map;
      final entries = details['rankingEntries'];
      if (entries is List && entries.isNotEmpty) {
        final parts = <String>[];
        for (final e in entries) {
          if (e is! Map) continue;
          final rank = e['rank']?.toString() ?? '';
          final name = e['playerName']?.toString() ?? e['playerUid']?.toString() ?? '不明';
          final awarded = e['awardedBalanceAmount'] ?? e['prizeAmount'];
          final reference = e['prizeReferenceAmount'];
          if (rank.isNotEmpty) {
            final awardedText = awarded != null ? ' (${awarded}pt)' : '';
            final refText = reference != null ? ' [基準値¥$reference]' : '';
            parts.add('${rank}位: $name$awardedText$refText');
          }
        }
        if (parts.isNotEmpty) return parts.join(', ');
      }
    }
    return actionLog['targetPlayerName']?.toString() ?? 'なし';
  }

  /// 一括操作の対象者を details の playerNames から表示用 Widget を返す（参加者一括登録・一括アドオン）
  Widget _buildTargetNamesFromDetails(Map details) {
    final playerNames = details['playerNames'];
    final mergedNames = <String>[];
    if (playerNames is List && playerNames.isNotEmpty) {
      mergedNames.addAll(playerNames.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty));
    }
    final okibakeTargets = details['okibakeTargets'];
    if (okibakeTargets is List && okibakeTargets.isNotEmpty) {
      for (final target in okibakeTargets) {
        if (target is! Map) continue;
        final raw =
            target['playerName'] ??
            target['pokerName'] ??
            target['displayName'] ??
            target['okibakeEntryId'];
        final name = raw?.toString() ?? '';
        if (name.isNotEmpty) {
          mergedNames.add('$name（置きバケ）');
        }
      }
    }
    if (mergedNames.isEmpty) return const Text('対象: （なし）');
    return Text('対象: ${mergedNames.join(', ')}');
  }

  /// ランキングデータ設定の details（rankingEntries）からランキング・名前・賞金を表示する
  Widget _buildRankingDisplayFromDetails(Map details) {
    final entries = details['rankingEntries'];
    if (entries is! List || entries.isEmpty) {
      return const Text('設定ランキング: （なし）');
    }
    final lines = <String>[];
    for (final e in entries) {
      if (e is! Map) continue;
      final rank = e['rank']?.toString() ?? '';
      final name = e['playerName']?.toString() ?? e['playerUid']?.toString() ?? '不明';
      final awarded = e['awardedBalanceAmount'] ?? e['prizeAmount'];
      final reference = e['prizeReferenceAmount'];
      final awardedStr = awarded != null ? ' (${awarded}pt)' : '';
      final refStr = reference != null ? ' [基準値¥$reference]' : '';
      if (rank.isNotEmpty) lines.add('${rank}位: $name$awardedStr$refStr');
    }
    if (lines.isEmpty) return const Text('設定ランキング: （なし）');
    return Text('設定ランキング: ${lines.join(', ')}');
  }

  @override
  Widget build(BuildContext context) {
    if (!_canViewHistory) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('操作履歴'),
          centerTitle: true,
        ),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'この卓端末では操作履歴の参照が無効です。\n管理者に設定を確認してください。',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    return Stack(
      children: [
        Scaffold(
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
        bottom: _isTableScope
            ? null
            : TabBar(
                controller: _tabController!,
                tabs: const [
                  Tab(text: '全て'),
                  Tab(text: 'この端末'),
                ],
              ),
      ),
      body: Column(
            children: [
              // 初回データ取得ボタン
              if (_actionLogs.isEmpty && !_isLoading && !_actionLogsLoadFailed)
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
                    : _actionLogsLoadFailed
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 24),
                                  child: Text(
                                    kTournamentAdminActionLogsLoadFailedMessage,
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                ElevatedButton(
                                  onPressed: _loadActionLogs,
                                  child: const Text('再試行'),
                                ),
                              ],
                            ),
                          )
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
      ),
        if (_isRollingBack)
          Positioned.fill(
            child: AbsorbPointer(
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.35),
                child: const Center(
                  child: CircularProgressIndicator(),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildActionLogItem(Map<String, dynamic> log) {
    final isRolledBack = log['isRollBack'] == true;
    final canRollback = _canRollback(log);
    
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: ListTile(
        title: Row(
          children: [
            Text(
              _getActionDisplayName(log['action'] as String, log),
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
            if ((log['action'] == 'register_participants' || log['action'] == 'bulk_addon') && log['details'] is Map) ...[
              _buildTargetNamesFromDetails(log['details'] as Map),
            ] else if (log['action'] == 'set_ranking_data' && log['details'] is Map) ...[
              _buildRankingDisplayFromDetails(log['details'] as Map),
            ] else if (log['targetPlayerName'] != null)
              Text('対象: ${log['targetPlayerName']}'),
            if (log['tableId'] != null)
              Text('テーブル: ${log['tableId']}'),
            if (log['seatNumber'] != null)
              Text('シート: ${log['seatNumber']}'),
            Text('実行デバイス: ${log['deviceName'] ?? log['deviceId'] ?? '不明'}'),
            Text('実行時刻: ${_formatDateTime(log['executedAt'] ?? log['createdAt'])}'),
            if (isRolledBack && (log['rollBackBy'] != null || log['rollBackByDeviceName'] != null))
              Text('取り消し者: ${log['rollBackByDeviceName'] ?? log['rollBackBy'] ?? '不明'}'),
            if (isRolledBack && log['rollBackAt'] != null)
              Text('取り消し時刻: ${_formatDateTime(log['rollBackAt'])}'),
          ],
        ),
        trailing: !canRollback
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
