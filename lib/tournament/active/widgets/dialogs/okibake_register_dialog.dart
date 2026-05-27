import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';

/// 「未入店」を判定するためにまとめる users 一覧のフェッチ上限（Phase2 軽量実装）
const int _kOkibakeUsersFetchLimit = 500;

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
  String get displayLabel =>
      pokerName != null && pokerName!.trim().isNotEmpty ? pokerName!.trim() : userId;

  /// Callable `linkedUserPokerName`
  String get linkedPokerName => displayLabel;

  /// ソートキー（pokerName が欠損のときのみ userId）
  String get nameSortKey =>
      pokerName != null && pokerName!.trim().isNotEmpty ? pokerName!.trim() : userId;
}

/// 対象ユーザー候補の表示順（取得・入店中除外後に Flutter 側で適用）。
/// 1: `lastCheckInAt` ありは新しい順、2: フィールド無しは後方、同順位は [OkibakeLinkCandidate.nameSortKey] 昇順。
int compareOkibakeLinkCandidates(OkibakeLinkCandidate a, OkibakeLinkCandidate b) {
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

/// 置きバケリンク先ユーザーの一覧選択。検索用 [TextEditingController] はダイアログが破棄されるまで保持し、[State.dispose] で解放する。
class _OkibakeLinkUserPickerDialog extends StatefulWidget {
  const _OkibakeLinkUserPickerDialog({
    required this.available,
    required this.initialSelectedUserId,
  });

  final List<OkibakeLinkCandidate> available;
  final String? initialSelectedUserId;

  @override
  State<_OkibakeLinkUserPickerDialog> createState() =>
      _OkibakeLinkUserPickerDialogState();
}

class _OkibakeLinkUserPickerDialogState extends State<_OkibakeLinkUserPickerDialog> {
  late final TextEditingController _queryController;
  late List<OkibakeLinkCandidate> _filtered;

  @override
  void initState() {
    super.initState();
    _queryController = TextEditingController();
    _filtered = List<OkibakeLinkCandidate>.from(widget.available);
  }

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  void _applyFilter(String q) {
    final ql = q.trim().toLowerCase();
    setState(() {
      if (ql.isEmpty) {
        _filtered = List<OkibakeLinkCandidate>.from(widget.available);
      } else {
        _filtered = widget.available
            .where(
              (c) =>
                  c.displayLabel.toLowerCase().contains(ql) ||
                  c.userId.toLowerCase().contains(ql),
            )
            .toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final available = widget.available;
    final initialId = widget.initialSelectedUserId;

    return AlertDialog(
      title: const Text('対象ユーザー（任意）'),
      content: SizedBox(
        width: 440,
        height: 380,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _queryController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: '名前で絞り込み',
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
                  : ListView.builder(
                      itemCount: _filtered.length + 1,
                      itemBuilder: (context, i) {
                        if (i == 0) {
                          return ListTile(
                            leading: const Icon(Icons.person_off_outlined),
                            title: const Text('対象ユーザーなし（未選択）'),
                            onTap: () => Navigator.pop(context, '*clear*'),
                          );
                        }
                        final c = _filtered[i - 1];
                        final selectedMark = initialId == c.userId ? ' ✓' : '';
                        return ListTile(
                          title: Text('${c.displayLabel}$selectedMark'),
                          subtitle: Text(
                            'タップするとこのユーザーを対象として選びます',
                            style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                          ),
                          onTap: () => Navigator.pop(context, c.userId),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('キャンセル')),
      ],
    );
  }
}

/// Phase2 置きバケ一時参加者を Callable 経由で登録する。
class OkibakeRegisterDialog extends StatefulWidget {
  const OkibakeRegisterDialog({
    super.key,
    required this.tournamentId,
    required this.service,
    required this.onRegistered,
  });

  final String tournamentId;
  final TournamentService service;
  final VoidCallback onRegistered;

  @override
  State<OkibakeRegisterDialog> createState() => _OkibakeRegisterDialogState();
}

class _OkibakeRegisterDialogState extends State<OkibakeRegisterDialog> {
  bool _submitting = false;
  final _memoController = TextEditingController();

  /// Callable 送信値・ドロップダウン表示順は yes が先頭（初期値と揃える）
  static const List<String> _addonValues = ['yes', 'no', 'unknown'];

  /// UI 文言（DB／Callable は英語値のまま）
  static String _addonLabelJa(String serverValue) {
    switch (serverValue) {
      case 'yes':
        return '希望する';
      case 'no':
        return '希望しない';
      default:
        return 'わからない';
    }
  }

  String _addonIntent = 'yes';

  /// Firestore `users` から取得済み（入店中フィルタ前）
  List<OkibakeLinkCandidate> _allCandidates = [];

  Future<void>? _usersLoadFuture;

  String? _selectedUserId;
  String? _selectedPokerName;

  Future<void> _loadUsersDocuments() async {
    final qs = await FirebaseFirestore.instance
        .collection('users')
        .limit(_kOkibakeUsersFetchLimit)
        .get();

    final list = <OkibakeLinkCandidate>[];
    for (final d in qs.docs) {
      final m = d.data();
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
    if (!mounted) return;
    setState(() {
      _allCandidates = list;
    });
  }

  /// [staySnap]: `ActiveStaysService`（`isActive == true` のドキュメント。docId = userId）
  List<OkibakeLinkCandidate> _filterNotStaying(QuerySnapshot<Map<String, dynamic>> staySnap) {
    final inStore = staySnap.docs.map((d) => d.id).toSet();
    final out = _allCandidates.where((c) => !inStore.contains(c.userId)).toList()
      ..sort(compareOkibakeLinkCandidates);
    return out;
  }

  @override
  void initState() {
    super.initState();
    _usersLoadFuture = _loadUsersDocuments();
  }

  @override
  void dispose() {
    _memoController.dispose();
    super.dispose();
  }

  Future<void> _pickUser(BuildContext outerContext, List<OkibakeLinkCandidate> available) async {
    final pickedId = await showDialog<String>(
      context: outerContext,
      builder: (_) => _OkibakeLinkUserPickerDialog(
        available: available,
        initialSelectedUserId: _selectedUserId,
      ),
    );

    if (!mounted) return;
    if (pickedId == '*clear*') {
      setState(() {
        _selectedUserId = null;
        _selectedPokerName = null;
      });
      return;
    }
    if (pickedId == null) return;

    OkibakeLinkCandidate? cand;
    for (final c in available) {
      if (c.userId == pickedId) {
        cand = c;
        break;
      }
    }

    final name = cand?.linkedPokerName;
    setState(() {
      _selectedUserId = pickedId;
      _selectedPokerName = name;
    });
  }

  Future<void> _submit() async {
    if (_submitting) return;

    setState(() => _submitting = true);
    late CreateOkibakeTemporaryEntryResult result;
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final memoRaw = _memoController.text.trim();
      final memo = memoRaw.isEmpty ? null : memoRaw;

      final bool hasLinked = _selectedUserId != null && _selectedPokerName != null;
      final lid = hasLinked ? _selectedUserId : null;
      final lpn = hasLinked ? _selectedPokerName : null;

      result = await widget.service.createOkibakeTemporaryEntry(
        operationId: operationId,
        tournamentId: widget.tournamentId,
        addonIntent: _addonIntent,
        linkedUserId: lid,
        linkedUserPokerName: lpn,
        memo: memo,
        deviceName: deviceName,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }

    if (!mounted) return;

    final messenger = ScaffoldMessenger.of(context);

    if (result.success) {
      final label = result.temporaryDisplayName ?? result.okibakeEntryId ?? '登録';
      Navigator.of(context).pop();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            formatOkibakeRegisterSuccessMessage(label),
          ),
        ),
      );
      widget.onRegistered();
    } else {
      messenger.showSnackBar(
        SnackBar(
          content: Text(result.errorMessage ?? '置きバケの登録に失敗しました'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_submitting,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: AlertDialog(
                title: const Text('置きバケ登録'),
                content: SizedBox(
                  width: 460,
                  child: FutureBuilder<void>(
                    future: _usersLoadFuture,
                    builder: (context, loadSnap) {
                      return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                        stream: ActiveStaysService.instance.stream,
                        builder: (context, stayShot) {
                          final usersLoaded =
                              loadSnap.connectionState != ConnectionState.waiting;
                          final stayReady = stayShot.hasData && stayShot.data != null;
                          final notStaying = usersLoaded &&
                                  stayShot.hasData &&
                                  stayShot.data != null &&
                                  !stayShot.hasError
                              ? _filterNotStaying(stayShot.data!)
                              : <OkibakeLinkCandidate>[];

                          Widget userArea;
                          if (loadSnap.connectionState == ConnectionState.waiting) {
                            userArea = const Padding(
                              padding: EdgeInsets.symmetric(vertical: 24),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          } else if (loadSnap.hasError) {
                            userArea = Text(
                              'ユーザー一覧の取得に失敗しました: ${loadSnap.error}',
                              style: const TextStyle(color: Colors.red, fontSize: 13),
                            );
                          } else if (stayShot.hasError) {
                            userArea = Text(
                              '入店情報の取得に失敗しました: ${stayShot.error}',
                              style: const TextStyle(color: Colors.red, fontSize: 13),
                            );
                          } else if (!stayReady) {
                            userArea = const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Center(
                                child: Text(
                                  '入店情報を読み込み中です。しばらくお待ちください。',
                                  style: TextStyle(fontSize: 13, color: Colors.black54),
                                ),
                              ),
                            );
                          } else {
                            userArea = Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                OutlinedButton.icon(
                                  icon: Icon(
                                    _selectedUserId != null
                                        ? Icons.edit
                                        : Icons.person_search,
                                  ),
                                  onPressed: _submitting
                                      ? null
                                      : () => _pickUser(context, notStaying),
                                  label: Text(
                                    _selectedUserId != null
                                        ? '対象: ${_selectedPokerName ?? ''}'
                                        : '対象ユーザーを選択（任意）',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '分かる場合は対象ユーザーを選択してください。',
                                  style: TextStyle(fontSize: 12, color: Colors.grey[700]),
                                ),
                              ],
                            );
                          }

                          return SingleChildScrollView(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                DropdownButtonFormField<String>(
                                  decoration: const InputDecoration(
                                    labelText: 'アドオン意向',
                                    border: OutlineInputBorder(),
                                  ),
                                  // ignore: deprecated_member_use
                                  value: _addonIntent,
                                  items: _addonValues
                                      .map(
                                        (v) => DropdownMenuItem(
                                          value: v,
                                          child: Text(_addonLabelJa(v)),
                                        ),
                                      )
                                      .toList(),
                                  onChanged: _submitting
                                      ? null
                                      : (v) {
                                          if (v != null) setState(() => _addonIntent = v);
                                        },
                                ),
                                const SizedBox(height: 16),
                                userArea,
                                const SizedBox(height: 12),
                                TextField(
                                  controller: _memoController,
                                  enabled: !_submitting,
                                  maxLines: 2,
                                  maxLength: 200,
                                  decoration: const InputDecoration(
                                    labelText: 'メモ（任意・最大200文字）',
                                    border: OutlineInputBorder(),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      );
                    },
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: _submitting ? null : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    child: const Text('登録'),
                  ),
                ],
              ),
            ),
            if (_submitting)
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
        ),
      ),
    );
  }
}
