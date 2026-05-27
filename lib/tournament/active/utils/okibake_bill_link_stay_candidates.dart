import 'package:cloud_firestore/cloud_firestore.dart';

/// 伝票紐付け UI 用の来店中ユーザー候補（`activeStays` ベース）。
class OkibakeBillLinkStayCandidate {
  const OkibakeBillLinkStayCandidate({
    required this.userId,
    required this.billId,
    required this.pokerName,
    this.startedAt,
  });

  final String userId;
  final String billId;
  final String pokerName;
  final DateTime? startedAt;

  String get displayLabel =>
      pokerName.trim().isNotEmpty ? pokerName.trim() : userId;
}

/// `ActiveStaysService` の snapshot から候補を生成（`billId` 必須）。
///
/// 同一トーナメント未参加フィルタは [filterOkibakeBillLinkStayCandidatesExcludingRegistered]。
List<OkibakeBillLinkStayCandidate> parseOkibakeBillLinkStayCandidates(
  QuerySnapshot<Map<String, dynamic>> snapshot,
) {
  final out = <OkibakeBillLinkStayCandidate>[];
  for (final doc in snapshot.docs) {
    final data = doc.data();
    final billId = data['billId'];
    if (billId is! String || billId.trim().isEmpty) continue;

    final rawName = data['pokerName'];
    final pokerName = rawName is String ? rawName : '';

    DateTime? startedAt;
    final startedRaw = data['startedAt'];
    if (startedRaw is Timestamp) {
      startedAt = startedRaw.toDate();
    }

    out.add(
      OkibakeBillLinkStayCandidate(
        userId: doc.id,
        billId: billId.trim(),
        pokerName: pokerName,
        startedAt: startedAt,
      ),
    );
  }

  out.sort(_compareOkibakeBillLinkStayCandidates);
  return out;
}

int _compareOkibakeBillLinkStayCandidates(
  OkibakeBillLinkStayCandidate a,
  OkibakeBillLinkStayCandidate b,
) {
  final sa = a.startedAt;
  final sb = b.startedAt;
  if (sa != null && sb != null) {
    final byTime = sb.compareTo(sa);
    if (byTime != 0) return byTime;
  } else if (sa != null) {
    return -1;
  } else if (sb != null) {
    return 1;
  }
  return a.displayLabel.compareTo(b.displayLabel);
}

/// `bills/{billId}/tournaments/{templateId}` が存在しない候補のみ返す。
///
/// [linkedUserId] が指定されている場合、同一 userId の候補のみに絞る。
Future<List<OkibakeBillLinkStayCandidate>>
    filterOkibakeBillLinkStayCandidatesExcludingRegistered({
  required QuerySnapshot<Map<String, dynamic>> staySnapshot,
  required String templateId,
  String? linkedUserId,
  FirebaseFirestore? firestore,
}) {
  final base = parseOkibakeBillLinkStayCandidates(staySnapshot);
  return filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered(
    baseCandidates: base,
    templateId: templateId,
    linkedUserId: linkedUserId,
    firestore: firestore,
  );
}

/// [linkedUserId] が指定されている場合、同一 userId の候補のみ返す。
List<OkibakeBillLinkStayCandidate> filterOkibakeBillLinkStayCandidatesByLinkedUserId(
  List<OkibakeBillLinkStayCandidate> candidates,
  String? linkedUserId,
) {
  if (linkedUserId == null || linkedUserId.trim().isEmpty) return candidates;
  final id = linkedUserId.trim();
  return candidates.where((c) => c.userId == id).toList();
}

/// テスト可能な bill tournaments 存在チェック付きフィルタ。
Future<List<OkibakeBillLinkStayCandidate>>
    filterOkibakeBillLinkStayCandidatesFromBaseExcludingRegistered({
  required List<OkibakeBillLinkStayCandidate> baseCandidates,
  required String templateId,
  String? linkedUserId,
  FirebaseFirestore? firestore,
  Future<bool> Function(String billId, String templateId)? billTournamentExists,
}) async {
  final tid = templateId.trim();
  if (tid.isEmpty) return const [];

  final linkedFiltered = filterOkibakeBillLinkStayCandidatesByLinkedUserId(
    baseCandidates,
    linkedUserId,
  );

  final existsChecker = billTournamentExists ??
      (billId, tplId) async {
        final doc = await (firestore ?? FirebaseFirestore.instance)
            .collection('bills')
            .doc(billId)
            .collection('tournaments')
            .doc(tplId)
            .get();
        return doc.exists;
      };

  final out = <OkibakeBillLinkStayCandidate>[];
  for (final c in linkedFiltered) {
    if (await existsChecker(c.billId, tid)) continue;
    out.add(c);
  }
  return out;
}

/// 候補0件時の説明文。
String formatOkibakeBillLinkEmptyCandidatesMessage({String? linkedUserId}) {
  if (linkedUserId != null && linkedUserId.trim().isNotEmpty) {
    return '対象ユーザーが入店中でない、または紐付け可能な伝票がありません。\n'
        '登録時に選択された対象ユーザーのみ、伝票紐付け候補に表示されます。';
  }
  return '紐付け可能な入店中ユーザーがいません。\n'
      '入店中で、かつこのトーナメントに未参加のユーザーのみ表示されます。';
}

/// `linkedUserId` が候補にあれば初期選択 userId を返す。
String? resolveInitialOkibakeBillLinkUserId(
  String? linkedUserId,
  List<OkibakeBillLinkStayCandidate> candidates,
) {
  if (linkedUserId == null || linkedUserId.trim().isEmpty) return null;
  final id = linkedUserId.trim();
  for (final c in candidates) {
    if (c.userId == id) return id;
  }
  return null;
}

OkibakeBillLinkStayCandidate? findOkibakeBillLinkStayCandidate(
  List<OkibakeBillLinkStayCandidate> candidates,
  String? userId,
) {
  if (userId == null || userId.isEmpty) return null;
  for (final c in candidates) {
    if (c.userId == userId) return c;
  }
  return null;
}

bool isOkibakeBillLinkSubmitEnabled(
  OkibakeBillLinkStayCandidate? selected,
) =>
    selected != null &&
    selected.userId.isNotEmpty &&
    selected.billId.isNotEmpty;
