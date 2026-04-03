import 'dart:math';
import 'package:amuse_app_template/core/utils/functions_client.dart';

import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../services/device_service.dart';
import '../../utils/business_date_ambiguous_dialog.dart';

/// Phase0A D-13: storeId/tenantId は必須。供給元未実装時は開発用仮値で呼び出し。
/// 本番では Build/Deploy で注入する想定。
const String kDevPlaceholderStoreId = 'test-store';
const String kDevPlaceholderTenantId = 'test-tenant';

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
