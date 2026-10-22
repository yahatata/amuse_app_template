import 'package:cloud_firestore/cloud_firestore.dart';

/// 通常参加者の Addon 回数（bills 側）読み取り結果。
class UserTournamentAddonCountResult {
  const UserTournamentAddonCountResult({
    required this.addonCount,
    required this.loadFailed,
  });

  final int addonCount;
  final bool loadFailed;

  static const failed = UserTournamentAddonCountResult(addonCount: 0, loadFailed: true);
}

/// `activeStays` → `bills/.../tournaments/{templateId}.addonCount` を読む。
Future<UserTournamentAddonCountResult> loadUserTournamentAddonCount({
  required String tournamentId,
  required String userId,
}) async {
  try {
    final tournamentDoc = await FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .get();
    if (!tournamentDoc.exists) {
      return UserTournamentAddonCountResult.failed;
    }

    final tData = tournamentDoc.data() ?? <String, dynamic>{};
    final snapshot =
        Map<String, dynamic>.from((tData['snapshot'] as Map?) ?? {});
    final templateIdRaw = snapshot['templateId'] ?? tData['templateId'];
    final templateId = templateIdRaw is String ? templateIdRaw.trim() : '';
    if (templateId.isEmpty) {
      return UserTournamentAddonCountResult.failed;
    }

    final activeStayDoc = await FirebaseFirestore.instance
        .collection('activeStays')
        .doc(userId)
        .get();
    if (!activeStayDoc.exists || activeStayDoc.data()?['isActive'] != true) {
      return const UserTournamentAddonCountResult(addonCount: 0, loadFailed: false);
    }

    final billIdRaw = activeStayDoc.data()?['billId'];
    final billId = billIdRaw is String ? billIdRaw : '';
    if (billId.isEmpty) {
      return const UserTournamentAddonCountResult(addonCount: 0, loadFailed: false);
    }

    final billTournamentDoc = await FirebaseFirestore.instance
        .collection('bills')
        .doc(billId)
        .collection('tournaments')
        .doc(templateId)
        .get();

    var addonCount = 0;
    if (billTournamentDoc.exists) {
      final bd = billTournamentDoc.data() ?? <String, dynamic>{};
      final c = bd['addonCount'];
      if (c is int) {
        addonCount = c;
      } else if (c is num) {
        addonCount = c.toInt();
      }
    }

    return UserTournamentAddonCountResult(addonCount: addonCount, loadFailed: false);
  } catch (_) {
    return UserTournamentAddonCountResult.failed;
  }
}
