import 'dart:math';
import 'package:amuse_app_template/core/utils/functions_client.dart';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../../services/device_service.dart';
import '../../utils/business_date_ambiguous_dialog.dart';
import 'utils/tournament_callable_error_formatter.dart';
import 'utils/okibake_bill_link_callable_payload.dart';

/// Phase0A D-13: storeId/tenantId は必須。供給元未実装時は開発用仮値で呼び出し。
/// 本番では Build/Deploy で注入する想定。
const String kDevPlaceholderStoreId = 'test-store';
const String kDevPlaceholderTenantId = 'test-tenant';

/// Phase2 `createOkibakeTemporaryEntry` Callable のクライアント向け結果。
class CreateOkibakeTemporaryEntryResult {
  const CreateOkibakeTemporaryEntryResult({
    required this.success,
    this.okibakeEntryId,
    this.temporaryDisplayName,
    this.replay = false,
    this.errorMessage,
  });

  final bool success;
  final String? okibakeEntryId;
  final String? temporaryDisplayName;
  final bool replay;
  final String? errorMessage;

  factory CreateOkibakeTemporaryEntryResult.fromCallableData(dynamic raw) {
    if (raw is! Map) {
      return const CreateOkibakeTemporaryEntryResult(success: false, errorMessage: '応答が不正です');
    }
    final m = Map<String, dynamic>.from(raw);
    return CreateOkibakeTemporaryEntryResult(
      success: m['success'] == true,
      okibakeEntryId: m['okibakeEntryId'] as String?,
      temporaryDisplayName: m['temporaryDisplayName'] as String?,
      replay: m['replay'] == true,
    );
  }

  factory CreateOkibakeTemporaryEntryResult.fromException(Object e) {
    return CreateOkibakeTemporaryEntryResult(
      success: false,
      errorMessage: formatTournamentCallableError(e),
    );
  }
}

/// Phase 3C-3-1 `assignOkibakeTemporaryEntryToSeat` Callable のクライアント向け結果。
class AssignOkibakeTemporaryEntryToSeatResult {
  const AssignOkibakeTemporaryEntryToSeatResult({
    required this.success,
    this.replay = false,
    this.errorMessage,
  });

  final bool success;
  final bool replay;
  final String? errorMessage;

  factory AssignOkibakeTemporaryEntryToSeatResult.fromCallableData(dynamic raw) {
    if (raw is! Map) {
      return const AssignOkibakeTemporaryEntryToSeatResult(
        success: false,
        errorMessage: '応答が不正です',
      );
    }
    final m = Map<String, dynamic>.from(raw);
    return AssignOkibakeTemporaryEntryToSeatResult(
      success: m['success'] == true,
      replay: m['replay'] == true,
      errorMessage: m['error'] as String? ?? m['message'] as String?,
    );
  }

  factory AssignOkibakeTemporaryEntryToSeatResult.fromException(Object e) {
    return AssignOkibakeTemporaryEntryToSeatResult(
      success: false,
      errorMessage: formatTournamentCallableError(e),
    );
  }
}

/// 通常参加者の Addon（Callable `addon`）。
class ApplyUserAddonResult {
  const ApplyUserAddonResult({
    required this.success,
    this.replay = false,
    this.errorMessage,
  });

  final bool success;
  final bool replay;
  final String? errorMessage;

  factory ApplyUserAddonResult.fromCallableData(dynamic raw) {
    if (raw is! Map) {
      return const ApplyUserAddonResult(
        success: false,
        errorMessage: '応答が不正です',
      );
    }
    final m = Map<String, dynamic>.from(raw);
    return ApplyUserAddonResult(
      success: m['success'] == true,
      replay: m['replay'] == true,
      errorMessage: m['error'] as String? ?? m['message'] as String?,
    );
  }

  factory ApplyUserAddonResult.fromException(Object e) {
    if (e is FirebaseFunctionsException) {
      return ApplyUserAddonResult(
        success: false,
        errorMessage: '${e.code}: ${e.message ?? '(no message)'}',
      );
    }
    return ApplyUserAddonResult(
      success: false,
      errorMessage: e.toString(),
    );
  }
}

/// Phase 3C-3-2 `applyOkibakeAddon` Callable のクライアント向け結果。
class ApplyOkibakeAddonResult {
  const ApplyOkibakeAddonResult({
    required this.success,
    this.replay = false,
    this.addonRecordId,
    this.errorMessage,
  });

  final bool success;
  final bool replay;
  final String? addonRecordId;
  final String? errorMessage;

  factory ApplyOkibakeAddonResult.fromCallableData(dynamic raw) {
    if (raw is! Map) {
      return const ApplyOkibakeAddonResult(
        success: false,
        errorMessage: '応答が不正です',
      );
    }
    final m = Map<String, dynamic>.from(raw);
    final successFlag = m['success'] == true;
    final replayFlag = m['replay'] == true;
    final ar = m['addonRecordId'];
    final addonRecordId = ar is String && ar.isNotEmpty ? ar : null;
    return ApplyOkibakeAddonResult(
      success: successFlag,
      replay: replayFlag,
      addonRecordId: addonRecordId,
      errorMessage: m['error'] as String? ?? m['message'] as String?,
    );
  }

  factory ApplyOkibakeAddonResult.fromException(Object e) {
    return ApplyOkibakeAddonResult(
      success: false,
      errorMessage: formatTournamentCallableError(e),
    );
  }
}

/// Phase 3C-3-2 `bustOkibakeTemporaryEntry` Callable のクライアント向け結果。
class BustOkibakeTemporaryEntryResult {
  const BustOkibakeTemporaryEntryResult({
    required this.success,
    this.replay = false,
    this.errorMessage,
  });

  final bool success;
  final bool replay;
  final String? errorMessage;

  factory BustOkibakeTemporaryEntryResult.fromCallableData(dynamic raw) {
    if (raw is! Map) {
      return const BustOkibakeTemporaryEntryResult(
        success: false,
        errorMessage: '応答が不正です',
      );
    }
    final m = Map<String, dynamic>.from(raw);
    return BustOkibakeTemporaryEntryResult(
      success: m['success'] == true,
      replay: m['replay'] == true,
      errorMessage: m['error'] as String? ?? m['message'] as String?,
    );
  }

  factory BustOkibakeTemporaryEntryResult.fromException(Object e) {
    return BustOkibakeTemporaryEntryResult(
      success: false,
      errorMessage: formatTournamentCallableError(e),
    );
  }
}

/// Phase 4-C `linkOkibakeTemporaryEntryToBill` Callable のクライアント向け結果。
class LinkOkibakeTemporaryEntryToBillResult {
  const LinkOkibakeTemporaryEntryToBillResult({
    required this.success,
    this.replay = false,
    this.billId,
    this.okibakeEntryId,
    this.errorMessage,
  });

  final bool success;
  final bool replay;
  final String? billId;
  final String? okibakeEntryId;
  final String? errorMessage;

  factory LinkOkibakeTemporaryEntryToBillResult.fromCallableData(dynamic raw) {
    if (raw is! Map) {
      return const LinkOkibakeTemporaryEntryToBillResult(
        success: false,
        errorMessage: '応答が不正です',
      );
    }
    final m = Map<String, dynamic>.from(raw);
    final billRaw = m['billId'];
    final entryRaw = m['okibakeEntryId'];
    return LinkOkibakeTemporaryEntryToBillResult(
      success: m['success'] == true,
      replay: m['replay'] == true,
      billId: billRaw is String && billRaw.isNotEmpty ? billRaw : null,
      okibakeEntryId: entryRaw is String && entryRaw.isNotEmpty ? entryRaw : null,
      errorMessage: m['error'] as String? ?? m['message'] as String?,
    );
  }

  factory LinkOkibakeTemporaryEntryToBillResult.fromException(Object e) {
    return LinkOkibakeTemporaryEntryToBillResult(
      success: false,
      errorMessage: formatTournamentCallableError(e),
    );
  }
}

// 後フェーズで実装予定のインターフェース
abstract class TournamentService {
  // トーナメント作成
  Future<Map<String, dynamic>> createScheduledTournament({
    required String templateId,
    required DateTime startAt,
    required DateTime regEndAt,
    required String storeId,
    required String tenantId,
    bool freeze = false,
    BuildContext? context,
  });
  // エントリー関連
  Future<bool> registerEntry(String tournamentId, String userId);
  Future<bool> registerReentry(String tournamentId, String userId);
  Future<bool> registerAddon(String tournamentId, String userId);
  
  // 座席関連
  Future<bool> assignSeat(String tournamentId, String userId, String tableId, int seatNo);
  Future<bool> moveSeat(String tournamentId, String userId, String newTableId, int newSeatNo);
  Future<bool> unseatPlayer(String tournamentId, String userId);
  
  // Phase 3: 新機能
  Future<Map<String, dynamic>> addTableToTournament({
    required String tournamentId,
    required String tableId,
    required int maxSeats,
  });
  Future<Map<String, dynamic>> removeTableFromTournament({
    required String tournamentId,
    required String tableId,
  });
  
  Future<Map<String, dynamic>> assignSeatToPlayer({
    required String tournamentId,
    required String userId,
    required String tableId,
    required int seatNumber,
  });

  /// Phase 3C-3-1: 置きバケ一時参加者を指定席へ（Callable `assignOkibakeTemporaryEntryToSeat`）。
  Future<AssignOkibakeTemporaryEntryToSeatResult> assignOkibakeTemporaryEntryToSeat({
    required String tournamentId,
    required String okibakeEntryId,
    required String tableId,
    required String seatKey,
  });

  /// Phase 3C-3-2: 着席済み置きバケの Addon（Callable `applyOkibakeAddon`）。
  Future<ApplyOkibakeAddonResult> applyOkibakeAddon({
    required String tournamentId,
    required String okibakeEntryId,
  });

  /// 通常参加者の Addon（Callable `addon`）。待機中は tableId を送らない。
  Future<ApplyUserAddonResult> applyUserAddon({
    required String tournamentId,
    required String userId,
    required String pokerName,
  });

  /// Phase 3C-3-2: 着席済み置きバケの Bust（Callable `bustOkibakeTemporaryEntry`）。
  Future<BustOkibakeTemporaryEntryResult> bustOkibakeTemporaryEntry({
    required String tournamentId,
    required String okibakeEntryId,
  });

  /// Phase 4-C: 置きバケ一時参加者の伝票紐付け（Callable `linkOkibakeTemporaryEntryToBill`）。
  Future<LinkOkibakeTemporaryEntryToBillResult> linkOkibakeTemporaryEntryToBill({
    required String tournamentId,
    required String okibakeEntryId,
    required String userId,
    required String billId,
  });

  Future<Map<String, dynamic>> reseatAllPlayers({
    required String tournamentId,
    required List<Map<String, dynamic>> playerAssignments,
  });

  // Bust&退席
  Future<Map<String, dynamic>> bustAndExit({
    required String tournamentId,
    required String userId,
    required String tableId,
    required int seatNumber,
  });

  // トーナメント制御
  Future<bool> startTournament(String tournamentId);
  Future<bool> pauseTournament(String tournamentId);
  Future<bool> resumeTournament(String tournamentId);
  Future<bool> endTournament(String tournamentId);
  
  // 参加者管理
  Future<Map<String, dynamic>> registerParticipants({
    required String tournamentId,
    required List<String> userIds,
  });

  /// Phase2: 置きバケ一時参加者を登録する（Firestore への直接書き込みではなく Callable）。
  Future<CreateOkibakeTemporaryEntryResult> createOkibakeTemporaryEntry({
    required String operationId,
    required String tournamentId,
    required String addonIntent,
    String? linkedUserId,
    String? linkedUserPokerName,
    String? memo,
    String? deviceName,
  });

  // レベル管理
  Future<bool> startNextLevel(String tournamentId);
  Future<bool> pauseLevel(String tournamentId);
  Future<bool> resumeLevel(String tournamentId);
}

// 実装クラス
class TournamentServiceImpl implements TournamentService {
  final FirebaseFunctions _functions = FunctionsClient.instance;

  @override
  Future<Map<String, dynamic>> createScheduledTournament({
    required String templateId,
    required DateTime startAt,
    required DateTime regEndAt,
    required String storeId,
    required String tenantId,
    bool freeze = false,
    BuildContext? context,
  }) async {
    try {
      final callable = _functions.httpsCallable('createScheduledTournament');
      
      final result = await callable.call({
        'templateId': templateId,
        'startAt': startAt.toIso8601String(),
        'regEndAt': regEndAt.toIso8601String(),
        'freeze': freeze,
        'storeId': storeId,
        'tenantId': tenantId,
      });

      final response = result.data as Map<String, dynamic>;
      return response;
    } catch (e) {
      // AMBIGUOUSエラーの場合、ダイアログを表示（contextが提供されている場合のみ）
      if (context != null) {
        final candidates = extractAmbiguousCandidates(e);
        if (candidates != null && candidates.isNotEmpty) {
          final selectedBusinessDateKey = await showBusinessDateAmbiguousDialog(
            context: context,
            candidates: candidates,
            onSelected: (selectedKey) {
              // 選択された営業日キーで再試行
              return createScheduledTournament(
                templateId: templateId,
                startAt: startAt,
                regEndAt: regEndAt,
                freeze: freeze,
                storeId: storeId,
                tenantId: tenantId,
                context: context,
              );
            },
          );
          
          if (selectedBusinessDateKey != null) {
            // 選択された営業日キーで再試行
            final callable = _functions.httpsCallable('createScheduledTournament');
            final result = await callable.call({
              'templateId': templateId,
              'startAt': startAt.toIso8601String(),
              'regEndAt': regEndAt.toIso8601String(),
              'freeze': freeze,
              'storeId': storeId,
              'tenantId': tenantId,
              'selectedBusinessDateKey': selectedBusinessDateKey, // 選択された営業日キーを追加
            });
            return result.data as Map<String, dynamic>;
          } else {
            // キャンセルされた場合はエラーをスロー
            throw Exception('トーナメント作成がキャンセルされました');
          }
        }
      }
      
      throw Exception('トーナメント作成に失敗しました: $e');
    }
  }

  @override
  Future<bool> registerEntry(String tournamentId, String userId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> registerReentry(String tournamentId, String userId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> registerAddon(String tournamentId, String userId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> assignSeat(String tournamentId, String userId, String tableId, int seatNo) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> moveSeat(String tournamentId, String userId, String newTableId, int newSeatNo) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> unseatPlayer(String tournamentId, String userId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  // Phase 3: 新機能の実装
  @override
  Future<Map<String, dynamic>> registerParticipants({
    required String tournamentId,
    required List<String> userIds,
  }) async {
    try {
      final callable = _functions.httpsCallable('registerParticipants');
      
      final result = await callable.call({
        'tournamentId': tournamentId,
        'userIds': userIds,
      });

      final response = result.data as Map<String, dynamic>;
      return response;
    } catch (e) {
      throw Exception('参加者登録に失敗しました: $e');
    }
  }

  @override
  Future<CreateOkibakeTemporaryEntryResult> createOkibakeTemporaryEntry({
    required String operationId,
    required String tournamentId,
    required String addonIntent,
    String? linkedUserId,
    String? linkedUserPokerName,
    String? memo,
    String? deviceName,
  }) async {
    try {
      final callable = _functions.httpsCallable('createOkibakeTemporaryEntry');
      final payload = <String, dynamic>{
        'operationId': operationId,
        'tournamentId': tournamentId,
        'addonIntent': addonIntent,
        if (linkedUserId != null && linkedUserId.isNotEmpty) 'linkedUserId': linkedUserId,
        if (linkedUserPokerName != null && linkedUserPokerName.isNotEmpty)
          'linkedUserPokerName': linkedUserPokerName,
        if (memo != null) 'memo': memo,
        if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
      };
      final result = await callable.call(payload);
      return CreateOkibakeTemporaryEntryResult.fromCallableData(result.data);
    } catch (e) {
      return CreateOkibakeTemporaryEntryResult.fromException(e);
    }
  }

  @override
  Future<Map<String, dynamic>> addTableToTournament({
    required String tournamentId,
    required String tableId,
    required int maxSeats,
  }) async {
    try {
      final callable = _functions.httpsCallable('addTableToTournament');
      
      final result = await callable.call({
        'tournamentId': tournamentId,
        'tableId': tableId,
        'maxSeats': maxSeats,
      });

      final response = result.data as Map<String, dynamic>;
      return response;
    } catch (e) {
      throw Exception('卓追加に失敗しました: $e');
    }
  }
  
  @override
  Future<Map<String, dynamic>> removeTableFromTournament({
    required String tournamentId,
    required String tableId,
  }) async {
    try {
      final callable = _functions.httpsCallable('removeTableFromTournament');
      
      final result = await callable.call({
        'tournamentId': tournamentId,
        'tableId': tableId,
      });

      final response = result.data as Map<String, dynamic>;
      return response;
    } catch (e) {
      throw Exception('卓削除に失敗しました: $e');
    }
  }

  @override
  Future<Map<String, dynamic>> assignSeatToPlayer({
    required String tournamentId,
    required String userId,
    required String tableId,
    required int seatNumber,
  }) async {
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final callable = _functions.httpsCallable('assignSeatToPlayer');
      final result = await callable.call({
        'operationId': operationId,
        'tournamentId': tournamentId,
        'userId': userId,
        'tableId': tableId,
        'seatNumber': seatNumber,
        if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
      });

      final response = result.data as Map<String, dynamic>;
      return response;
    } catch (e) {
      throw Exception('待機者着席に失敗しました: $e');
    }
  }

  @override
  Future<AssignOkibakeTemporaryEntryToSeatResult> assignOkibakeTemporaryEntryToSeat({
    required String tournamentId,
    required String okibakeEntryId,
    required String tableId,
    required String seatKey,
  }) async {
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final callable = _functions.httpsCallable('assignOkibakeTemporaryEntryToSeat');
      final result = await callable
          .call({
            'operationId': operationId,
            'tournamentId': tournamentId,
            'okibakeEntryId': okibakeEntryId,
            'tableId': tableId,
            'seatKey': seatKey,
            if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
          })
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw Exception('Cloud Functionの呼び出しがタイムアウトしました'),
          );

      return AssignOkibakeTemporaryEntryToSeatResult.fromCallableData(result.data);
    } catch (e) {
      return AssignOkibakeTemporaryEntryToSeatResult.fromException(e);
    }
  }

  @override
  Future<ApplyOkibakeAddonResult> applyOkibakeAddon({
    required String tournamentId,
    required String okibakeEntryId,
  }) async {
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final callable = _functions.httpsCallable('applyOkibakeAddon');
      final result = await callable
          .call({
            'operationId': operationId,
            'tournamentId': tournamentId,
            'okibakeEntryId': okibakeEntryId,
            if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
          })
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw Exception('Cloud Functionの呼び出しがタイムアウトしました'),
          );

      return ApplyOkibakeAddonResult.fromCallableData(result.data);
    } catch (e) {
      return ApplyOkibakeAddonResult.fromException(e);
    }
  }

  @override
  Future<ApplyUserAddonResult> applyUserAddon({
    required String tournamentId,
    required String userId,
    required String pokerName,
  }) async {
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final callable = _functions.httpsCallable('addon');
      final result = await callable
          .call({
            'operationId': operationId,
            'tournamentId': tournamentId,
            'userId': userId,
            'pokerName': pokerName,
            if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
          })
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw Exception('Cloud Functionの呼び出しがタイムアウトしました'),
          );

      return ApplyUserAddonResult.fromCallableData(result.data);
    } catch (e) {
      return ApplyUserAddonResult.fromException(e);
    }
  }

  @override
  Future<BustOkibakeTemporaryEntryResult> bustOkibakeTemporaryEntry({
    required String tournamentId,
    required String okibakeEntryId,
  }) async {
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final callable = _functions.httpsCallable('bustOkibakeTemporaryEntry');
      final result = await callable
          .call({
            'operationId': operationId,
            'tournamentId': tournamentId,
            'okibakeEntryId': okibakeEntryId,
            if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
          })
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw Exception('Cloud Functionの呼び出しがタイムアウトしました'),
          );

      return BustOkibakeTemporaryEntryResult.fromCallableData(result.data);
    } catch (e) {
      return BustOkibakeTemporaryEntryResult.fromException(e);
    }
  }

  @override
  Future<LinkOkibakeTemporaryEntryToBillResult> linkOkibakeTemporaryEntryToBill({
    required String tournamentId,
    required String okibakeEntryId,
    required String userId,
    required String billId,
  }) async {
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final callable = _functions.httpsCallable('linkOkibakeTemporaryEntryToBill');
      final result = await callable
          .call(
            buildLinkOkibakeBillCallablePayload(
              operationId: operationId,
              tournamentId: tournamentId,
              okibakeEntryId: okibakeEntryId,
              userId: userId,
              billId: billId,
              deviceName: deviceName,
            ),
          )
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw Exception('Cloud Functionの呼び出しがタイムアウトしました'),
          );

      return LinkOkibakeTemporaryEntryToBillResult.fromCallableData(result.data);
    } catch (e) {
      return LinkOkibakeTemporaryEntryToBillResult.fromException(e);
    }
  }
  
  @override
  Future<Map<String, dynamic>> reseatAllPlayers({
    required String tournamentId,
    required List<Map<String, dynamic>> playerAssignments,
  }) async {
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final callable = _functions.httpsCallable('reseatAllPlayers');
      final result = await callable.call({
        'operationId': operationId,
        'tournamentId': tournamentId,
        'playerAssignments': playerAssignments,
        if (deviceName != null) 'deviceName': deviceName,
      });

      final response = result.data as Map<String, dynamic>;
      return response;
    } catch (e) {
      throw Exception('全員リシートに失敗しました: $e');
    }
  }

  @override
  Future<Map<String, dynamic>> bustAndExit({
    required String tournamentId,
    required String userId,
    required String tableId,
    required int seatNumber,
  }) async {
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final callable = _functions.httpsCallable('bustAndExit');
      final result = await callable.call({
        'operationId': operationId,
        'tournamentId': tournamentId,
        'userId': userId,
        'tableId': tableId,
        'seatNumber': seatNumber,
        if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
      });

      final response = result.data as Map<String, dynamic>;
      return response;
    } catch (e) {
      throw Exception('Bust&退席に失敗しました: $e');
    }
  }

  @override
  Future<bool> startTournament(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> pauseTournament(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> resumeTournament(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> endTournament(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> startNextLevel(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> pauseLevel(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> resumeLevel(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }
}

// Mock実装（開発用）
class MockTournamentService implements TournamentService {
  @override
  Future<Map<String, dynamic>> createScheduledTournament({
    required String templateId,
    required DateTime startAt,
    required DateTime regEndAt,
    required String storeId,
    required String tenantId,
    bool freeze = false,
    BuildContext? context,
  }) async {
    await Future.delayed(const Duration(milliseconds: 1000));
    
    // Mock response
    return {
      'success': true,
      'tournamentId': 'mock-tournament-${DateTime.now().millisecondsSinceEpoch}',
      'message': 'モックトーナメントが作成されました',
      'isNew': true,
      'data': {
        'templateId': templateId,
        'startAt': startAt.toIso8601String(),
        'regEndAt': regEndAt.toIso8601String(),
        'status': 'scheduled',
      },
    };
  }

  @override
  Future<bool> registerEntry(String tournamentId, String userId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> registerReentry(String tournamentId, String userId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> registerAddon(String tournamentId, String userId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> assignSeat(String tournamentId, String userId, String tableId, int seatNo) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> moveSeat(String tournamentId, String userId, String newTableId, int newSeatNo) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> unseatPlayer(String tournamentId, String userId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }
  
  // Phase 3: 新機能のモック実装
  @override
  Future<Map<String, dynamic>> registerParticipants({
    required String tournamentId,
    required List<String> userIds,
  }) async {
    await Future.delayed(const Duration(milliseconds: 800));
    
    // Mock response
    return {
      'success': true,
      'results': userIds.map((userId) => {
        'success': true,
        'userId': userId,
      }).toList(),
      'summary': {
        'total': userIds.length,
        'success': userIds.length,
        'failure': 0,
      },
      'message': 'モック参加者登録が完了しました',
    };
  }

  @override
  Future<CreateOkibakeTemporaryEntryResult> createOkibakeTemporaryEntry({
    required String operationId,
    required String tournamentId,
    required String addonIntent,
    String? linkedUserId,
    String? linkedUserPokerName,
    String? memo,
    String? deviceName,
  }) async {
    await Future.delayed(const Duration(milliseconds: 400));
    return CreateOkibakeTemporaryEntryResult(
      success: true,
      okibakeEntryId: 'mock-${DateTime.now().millisecondsSinceEpoch}',
      temporaryDisplayName: 'オキバケモック',
      replay: false,
    );
  }

  @override
  Future<Map<String, dynamic>> addTableToTournament({
    required String tournamentId,
    required String tableId,
    required int maxSeats,
  }) async {
    await Future.delayed(const Duration(milliseconds: 800));
    
    // Mock response
    return {
      'success': true,
      'tableId': tableId,
      'maxSeats': maxSeats,
      'message': 'モック卓追加が完了しました',
    };
  }
  
  @override
  Future<Map<String, dynamic>> removeTableFromTournament({
    required String tournamentId,
    required String tableId,
  }) async {
    await Future.delayed(const Duration(milliseconds: 800));
    
    // Mock response
    return {
      'success': true,
      'tableId': tableId,
      'message': 'モック卓削除が完了しました',
    };
  }
  
  @override
  Future<Map<String, dynamic>> assignSeatToPlayer({
    required String tournamentId,
    required String userId,
    required String tableId,
    required int seatNumber,
  }) async {
    await Future.delayed(const Duration(milliseconds: 600));
    
    // Mock response
    return {
      'success': true,
      'userId': userId,
      'tableId': tableId,
      'seatNumber': seatNumber,
      'message': 'モック着席が完了しました',
    };
  }

  @override
  Future<AssignOkibakeTemporaryEntryToSeatResult> assignOkibakeTemporaryEntryToSeat({
    required String tournamentId,
    required String okibakeEntryId,
    required String tableId,
    required String seatKey,
  }) async {
    await Future.delayed(const Duration(milliseconds: 600));
    return const AssignOkibakeTemporaryEntryToSeatResult(success: true, replay: false);
  }

  @override
  Future<ApplyOkibakeAddonResult> applyOkibakeAddon({
    required String tournamentId,
    required String okibakeEntryId,
  }) async {
    await Future.delayed(const Duration(milliseconds: 400));
    return const ApplyOkibakeAddonResult(
      success: true,
      replay: false,
      addonRecordId: 'mock-addon-record',
    );
  }

  @override
  Future<ApplyUserAddonResult> applyUserAddon({
    required String tournamentId,
    required String userId,
    required String pokerName,
  }) async {
    await Future.delayed(const Duration(milliseconds: 400));
    return const ApplyUserAddonResult(success: true, replay: false);
  }

  @override
  Future<BustOkibakeTemporaryEntryResult> bustOkibakeTemporaryEntry({
    required String tournamentId,
    required String okibakeEntryId,
  }) async {
    await Future.delayed(const Duration(milliseconds: 400));
    return const BustOkibakeTemporaryEntryResult(success: true, replay: false);
  }

  @override
  Future<LinkOkibakeTemporaryEntryToBillResult> linkOkibakeTemporaryEntryToBill({
    required String tournamentId,
    required String okibakeEntryId,
    required String userId,
    required String billId,
  }) async {
    await Future.delayed(const Duration(milliseconds: 400));
    return LinkOkibakeTemporaryEntryToBillResult(
      success: true,
      replay: false,
      billId: billId,
      okibakeEntryId: okibakeEntryId,
    );
  }
  
  @override
  Future<Map<String, dynamic>> reseatAllPlayers({
    required String tournamentId,
    required List<Map<String, dynamic>> playerAssignments,
  }) async {
    await Future.delayed(const Duration(milliseconds: 1000));
    
    // Mock response
    return {
      'success': true,
      'playerCount': playerAssignments.length,
      'message': 'モック全員リシートが完了しました',
    };
  }

  @override
  Future<Map<String, dynamic>> bustAndExit({
    required String tournamentId,
    required String userId,
    required String tableId,
    required int seatNumber,
  }) async {
    await Future.delayed(const Duration(milliseconds: 600));
    
    // Mock response
    return {
      'success': true,
      'userId': userId,
      'tableId': tableId,
      'seatNumber': seatNumber,
      'message': 'モックBust&退席が完了しました',
    };
  }

  @override
  Future<bool> startTournament(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> pauseTournament(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> resumeTournament(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> endTournament(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> startNextLevel(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> pauseLevel(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }

  @override
  Future<bool> resumeLevel(String tournamentId) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return true;
  }
}
