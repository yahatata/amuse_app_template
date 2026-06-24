import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:amuse_app_template/tournament/active/utils/tournament_read_only.dart';

bool isTablesSeatEnabled(Map<String, dynamic>? data) {
  if (data == null) return true;
  return data['isEnabled'] as bool? ?? true;
}

/// 開催中は [isEnabled] な卓のみ、終了後は論理削除済みも履歴として表示する。
bool shouldShowTablesSeatDoc({
  required String docId,
  required Map<String, dynamic>? data,
  required String? tournamentStatus,
}) {
  if (docId == 'waiting' || docId == 'busted') return false;
  if (isTournamentReadOnlyStatus(tournamentStatus)) return true;
  return isTablesSeatEnabled(data);
}

List<T> filterTablesSeatDocsForDisplay<T extends QueryDocumentSnapshot<Object?>>(
  Iterable<T> docs,
  String? tournamentStatus,
) {
  return docs.where((doc) {
    final data = doc.data();
    final map = data is Map ? Map<String, dynamic>.from(data) : null;
    return shouldShowTablesSeatDoc(
      docId: doc.id,
      data: map,
      tournamentStatus: tournamentStatus,
    );
  }).toList();
}
