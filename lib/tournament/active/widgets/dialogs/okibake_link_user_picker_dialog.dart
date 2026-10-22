import 'package:amuse_app_template/user/user_type_display.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// 「未入店」を判定するためにまとめる users 一覧のフェッチ上限（Phase2 軽量実装）
const int kOkibakeUsersFetchLimit = 500;

/// 置きバケへ「新規紐付け」する候補として users ドキュメントを含めてよいか。
///
/// - 移行済み店舗管理（`store_managed` + `isMigrated == true`）のみ除外
/// - LINE・未移行店舗管理・`userType` 未設定は含める（種別の推測・自動判定はしない）
/// - クラッシュしないよう欠落フィールドは [isMigratedStoreManagedUser] 側で安全に扱う
bool isEligibleForOkibakeNewLink(Map<String, dynamic> userData) {
  return !isMigratedStoreManagedUser(userData);
}

/// 置きバケリンク候補（`users` ドキュメントに基づく）。表示・Callable 送信は [displayLabel] / [linkedPokerName] に統一。
class OkibakeLinkCandidate {
  OkibakeLinkCandidate({
    required this.userId,
    this.lastCheckInAt,

    /// 非 null でも trim 済み／空なら名前欠損扱い（[userId] へフォールバック）
    this.pokerName,
  }) : assert(userId.isNotEmpty);

  final String userId;

  /// Firestore の `users.lastCheckInAt` を [DateTime] にしたもの。
  final DateTime? lastCheckInAt;

  /// 空・null のときは名前欠損（UI / linked は userId）。
  final String? pokerName;

  /// UI 一覧・ボタン表示用（pokerName または userId）
  String get displayLabel => pokerName != null && pokerName!.trim().isNotEmpty
      ? pokerName!.trim()
      : userId;

  /// Callable `linkedUserPokerName`
  String get linkedPokerName => displayLabel;

  /// ソートキー（pokerName が欠損のときのみ userId）
  String get nameSortKey => pokerName != null && pokerName!.trim().isNotEmpty
      ? pokerName!.trim()
      : userId;
}

/// 対象ユーザー候補の表示順（取得・入店中除外後に Flutter 側で適用）。
/// 1: `lastCheckInAt` ありは新しい順、2: フィールド無しは後方、同順位は [OkibakeLinkCandidate.nameSortKey] 昇順。
int compareOkibakeLinkCandidates(
  OkibakeLinkCandidate a,
  OkibakeLinkCandidate b,
) {
  final ha = a.lastCheckInAt != null;
  final hb = b.lastCheckInAt != null;
  if (ha && !hb) return -1;
  if (!ha && hb) return 1;
  if (ha && hb) {
    final byTime = b.lastCheckInAt!.compareTo(a.lastCheckInAt!);
    if (byTime != 0) return byTime;
  }
  return a.nameSortKey.compareTo(b.nameSortKey);
}

Future<List<OkibakeLinkCandidate>> fetchOkibakeLinkCandidates() async {
  final qs = await FirebaseFirestore.instance
      .collection('users')
      .limit(kOkibakeUsersFetchLimit)
      .get();

  final list = <OkibakeLinkCandidate>[];
  for (final d in qs.docs) {
    final m = d.data();
    if (!isEligibleForOkibakeNewLink(m)) {
      continue;
    }
    final pn = m['pokerName'];
    final trimmedPn = pn is String ? pn.trim() : '';
    final pokerName = trimmedPn.isNotEmpty ? trimmedPn : null;

    DateTime? lastCheckInAt;
    final lc = m['lastCheckInAt'];
    if (lc is Timestamp) {
      lastCheckInAt = lc.toDate();
    }

    list.add(
      OkibakeLinkCandidate(
        userId: d.id,
        lastCheckInAt: lastCheckInAt,
        pokerName: pokerName,
      ),
    );
  }
  return list;
}

/// [staySnap]: `ActiveStaysService`（`isActive == true` のドキュメント。docId = userId）
List<OkibakeLinkCandidate> filterOkibakeLinkCandidatesNotStaying(
  List<OkibakeLinkCandidate> candidates,
  QuerySnapshot<Map<String, dynamic>> staySnap,
) {
  final inStore = staySnap.docs.map((d) => d.id).toSet();
  return candidates.where((c) => !inStore.contains(c.userId)).toList()
    ..sort(compareOkibakeLinkCandidates);
}

Future<Set<String>> fetchUsedOkibakeLinkedUserIds({
  required String tournamentId,
  String? excludeOkibakeEntryId,
}) async {
  final snap = await FirebaseFirestore.instance
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('okibakeTemporaryEntries')
      .get();

  final used = <String>{};
  for (final doc in snap.docs) {
    if (excludeOkibakeEntryId != null && doc.id == excludeOkibakeEntryId) {
      continue;
    }
    final data = doc.data();
    final entryStatus = (data['entryStatus'] as String?) ?? '';
    if (entryStatus == 'voided') continue;
    final linkedUserId = (data['linkedUserId'] as String?)?.trim() ?? '';
    if (linkedUserId.isEmpty) continue;
    used.add(linkedUserId);
  }
  return used;
}

List<OkibakeLinkCandidate> filterOkibakeLinkCandidatesUnusedByOkibake(
  List<OkibakeLinkCandidate> candidates,
  Set<String> usedUserIds,
) {
  return candidates.where((c) => !usedUserIds.contains(c.userId)).toList()
    ..sort(compareOkibakeLinkCandidates);
}

/// 管理者ユーザー一覧と同じ pokerName 検索（完全一致 → 前方一致 → 部分一致）。
/// [searchQuery] が空のときは入力順を維持したコピーを返す。userId は検索対象外。
List<OkibakeLinkCandidate> filterOkibakeLinkCandidatesBySearch(
  List<OkibakeLinkCandidate> candidates,
  String searchQuery,
) {
  final q = searchQuery.trim();
  if (q.isEmpty) {
    return List<OkibakeLinkCandidate>.from(candidates);
  }

  final exact = <OkibakeLinkCandidate>[];
  final prefix = <OkibakeLinkCandidate>[];
  final partial = <OkibakeLinkCandidate>[];

  for (final c in candidates) {
    final name = c.pokerName ?? '';
    switch (pokerNameSearchMatch(name, q)) {
      case AdminUserPokerNameSearchMatch.exact:
        exact.add(c);
      case AdminUserPokerNameSearchMatch.prefix:
        prefix.add(c);
      case AdminUserPokerNameSearchMatch.partial:
        partial.add(c);
      case AdminUserPokerNameSearchMatch.none:
        break;
    }
  }

  return [...exact, ...prefix, ...partial];
}

/// 置きバケリンク先ユーザーの一覧選択。検索用 [TextEditingController] はダイアログが破棄されるまで保持し、[State.dispose] で解放する。
class OkibakeLinkUserPickerDialog extends StatefulWidget {
  const OkibakeLinkUserPickerDialog({
    super.key,
    required this.available,
    required this.initialSelectedUserId,
    this.allowClear = true,
    this.title = '対象ユーザー（任意）',
  });

  final List<OkibakeLinkCandidate> available;
  final String? initialSelectedUserId;
  final bool allowClear;
  final String title;

  @override
  State<OkibakeLinkUserPickerDialog> createState() =>
      _OkibakeLinkUserPickerDialogState();
}

class _OkibakeLinkUserPickerDialogState
    extends State<OkibakeLinkUserPickerDialog> {
  late final TextEditingController _queryController;
  late final ScrollController _scrollController;
  late List<OkibakeLinkCandidate> _filtered;

  @override
  void initState() {
    super.initState();
    _queryController = TextEditingController();
    _scrollController = ScrollController();
    _filtered = List<OkibakeLinkCandidate>.from(widget.available);
  }

  @override
  void dispose() {
    _queryController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _applyFilter(String q) {
    setState(() {
      _filtered = filterOkibakeLinkCandidatesBySearch(widget.available, q);
    });
  }

  @override
  Widget build(BuildContext context) {
    final available = widget.available;
    final initialId = widget.initialSelectedUserId;

    return AlertDialog(
      title: Text(widget.title),
      content: SizedBox(
        width: 440,
        height: 380,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _queryController,
              autofocus: false,
              decoration: const InputDecoration(
                labelText: 'ポーカーネームで検索',
                border: OutlineInputBorder(),
              ),
              onChanged: _applyFilter,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _filtered.isEmpty
                  ? Center(
                      child: Text(
                        available.isEmpty
                            ? '候補がありません。\nユーザーが取得できていないか、条件に該当しません。'
                            : '一致するユーザーがいません。',
                        textAlign: TextAlign.center,
                      ),
                    )
                  : Scrollbar(
                      controller: _scrollController,
                      thumbVisibility: true,
                      child: ListView.builder(
                        controller: _scrollController,
                        itemCount: _filtered.length + (widget.allowClear ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (widget.allowClear && i == 0) {
                            return ListTile(
                              leading: const Icon(Icons.person_off_outlined),
                              title: const Text('対象ユーザーなし（未選択）'),
                              onTap: () => Navigator.pop(context, '*clear*'),
                            );
                          }
                          final c = _filtered[i - (widget.allowClear ? 1 : 0)];
                          final selectedMark = initialId == c.userId ? ' ✓' : '';
                          return ListTile(
                            title: Text('${c.displayLabel}$selectedMark'),
                            subtitle: Text(
                              'タップするとこのユーザーを対象として選びます',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey[600],
                              ),
                            ),
                            onTap: () => Navigator.pop(context, c.userId),
                          );
                        },
                      ),
                    ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('キャンセル'),
        ),
      ],
    );
  }
}
