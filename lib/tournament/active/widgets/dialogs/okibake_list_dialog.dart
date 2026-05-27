import 'package:amuse_app_template/tournament/active/models/okibake_temporary_entry.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_busted_action_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_link_bill_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_seat_action_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_waiting_action_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/okibake_addon_display_helpers.dart';
import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// Phase 4 補完: トーナメント操作タブ「置きバケ一覧」（§12.8）。
///
/// 表示対象は `registered` / `seated` / `busted` の `unlinked` 置きバケ。
/// 主目的は、現状 UI から到達できない `busted + unlinked` の置きバケに対する
/// 伝票紐付け導線を提供すること。
///
/// 席配置は親側で `AssignSeatDialog` を開くため、`onRequestAssignSeat` を渡す。
Future<void> showOkibakeListDialog({
  required BuildContext context,
  required String tournamentId,
  required TournamentService service,
  required void Function(String okibakeEntryId, String displayName)
      onRequestAssignSeat,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (dialogCtx) {
      return OkibakeListDialog(
        tournamentId: tournamentId,
        service: service,
        onRequestAssignSeat: onRequestAssignSeat,
      );
    },
  );
}

class OkibakeListDialog extends StatefulWidget {
  const OkibakeListDialog({
    super.key,
    required this.tournamentId,
    required this.service,
    required this.onRequestAssignSeat,
  });

  final String tournamentId;
  final TournamentService service;

  /// 席配置が要求されたら、このダイアログ自体は閉じて呼び出し元で
  /// `AssignSeatDialog` を開く（§12.8.4 registered の席配置）。
  final void Function(String okibakeEntryId, String displayName)
      onRequestAssignSeat;

  @override
  State<OkibakeListDialog> createState() => _OkibakeListDialogState();
}

class _OkibakeListDialogState extends State<OkibakeListDialog> {
  void _showSnack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red.shade700 : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 560,
          maxHeight: size.height - 64,
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.list_alt, color: Colors.amber.shade800),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        '置きバケ一覧',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      tooltip: '閉じる',
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '未リンクの置きバケを操作できます（伝票紐付けが主目的）',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 12),
                Flexible(
                  child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                    stream: FirebaseFirestore.instance
                        .collection('scheduledTournaments')
                        .doc(widget.tournamentId)
                        .snapshots(),
                    builder: (context, tourSnap) {
                      var resolvedAddonLimit = -1;
                      final addonLimitLoading =
                          tourSnap.connectionState == ConnectionState.waiting &&
                              !tourSnap.hasData;
                      if (tourSnap.hasData && tourSnap.data!.exists) {
                        final tourData = tourSnap.data!.data() ?? {};
                        final snap = Map<String, dynamic>.from(
                          (tourData['snapshot'] as Map?) ?? {},
                        );
                        resolvedAddonLimit = resolveAddonLimitPerPlayerUi(
                          isAddon: snap['isAddon'] == true,
                          addonLimitPerPlayer: snap['addonLimitPerPlayer'],
                        );
                      }

                      return StreamBuilder<
                          QuerySnapshot<Map<String, dynamic>>>(
                        stream: FirebaseFirestore.instance
                            .collection('scheduledTournaments')
                            .doc(widget.tournamentId)
                            .collection('okibakeTemporaryEntries')
                            .snapshots(),
                        builder: (context, snap) {
                          if (snap.hasError) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 24),
                              child: Text(
                                '置きバケ一覧の取得に失敗しました: ${snap.error}',
                                style:
                                    TextStyle(color: Colors.red.shade700),
                              ),
                            );
                          }
                          if (!snap.hasData) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 24),
                              child: Center(
                                  child: CircularProgressIndicator()),
                            );
                          }

                          final entries = filterOkibakeListEntries(
                            snap.data!.docs
                                .map(OkibakeTemporaryEntry.fromDoc)
                                .toList(),
                          );

                          if (entries.isEmpty) {
                            return Padding(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 24),
                              child: Center(
                                child: Text(
                                  '対象の置きバケはいません',
                                  style: TextStyle(
                                      color: Colors.grey.shade700),
                                ),
                              ),
                            );
                          }

                          return ListView.separated(
                            shrinkWrap: true,
                            itemCount: entries.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 4),
                            itemBuilder: (context, index) {
                              final e = entries[index];
                              return _OkibakeListTile(
                                tournamentId: widget.tournamentId,
                                entry: e,
                                service: widget.service,
                                resolvedAddonLimit: resolvedAddonLimit,
                                addonLimitLoading: addonLimitLoading,
                                onRequestAssignSeat: (entryId, displayName) {
                                  Navigator.of(context).pop();
                                  widget.onRequestAssignSeat(
                                      entryId, displayName);
                                },
                                showSnack: _showSnack,
                              );
                            },
                          );
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('閉じる'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 「置きバケ一覧」表示対象を unlinked かつ registered / seated / busted に絞り、
/// 状態ごとに分類した順（registered → seated → busted）に並べる。
/// 各群内では `createdAt` 降順（新しい順）。
List<OkibakeTemporaryEntry> filterOkibakeListEntries(
  List<OkibakeTemporaryEntry> source,
) {
  final filtered = source.where((e) => e.isListTarget).toList();
  int statusOrder(String s) {
    switch (s) {
      case 'registered':
        return 0;
      case 'seated':
        return 1;
      case 'busted':
        return 2;
      default:
        return 99;
    }
  }

  filtered.sort((a, b) {
    final o = statusOrder(a.entryStatus) - statusOrder(b.entryStatus);
    if (o != 0) return o;
    final aTs =
        a.createdAt?.millisecondsSinceEpoch ?? -1 << 62;
    final bTs =
        b.createdAt?.millisecondsSinceEpoch ?? -1 << 62;
    return bTs.compareTo(aTs);
  });
  return filtered;
}

class _OkibakeListTile extends StatefulWidget {
  const _OkibakeListTile({
    required this.tournamentId,
    required this.entry,
    required this.service,
    required this.resolvedAddonLimit,
    required this.addonLimitLoading,
    required this.onRequestAssignSeat,
    required this.showSnack,
  });

  final String tournamentId;
  final OkibakeTemporaryEntry entry;
  final TournamentService service;
  final int resolvedAddonLimit;
  final bool addonLimitLoading;
  final void Function(String okibakeEntryId, String displayName)
      onRequestAssignSeat;
  final void Function(String message, {bool isError}) showSnack;

  @override
  State<_OkibakeListTile> createState() => _OkibakeListTileState();
}

class _OkibakeListTileState extends State<_OkibakeListTile> {
  bool _busy = false;

  String get _displayName {
    final lpn = widget.entry.linkedUserPokerName;
    if (lpn != null && lpn.isNotEmpty) return lpn;
    final t = widget.entry.temporaryDisplayName;
    return t.isNotEmpty ? t : '置きバケ';
  }

  String get _addonLine => formatOkibakeAddonStatusLine(
        okibakeAddonCount: widget.entry.okibakeAddonCount,
        resolvedAddonLimit: widget.resolvedAddonLimit,
        loading: widget.addonLimitLoading,
      );

  bool get _addonDisabled => isOkibakeAddonUiDisabled(
        okibakeAddonCount: widget.entry.okibakeAddonCount,
        resolvedAddonLimit: widget.resolvedAddonLimit,
        loading: widget.addonLimitLoading,
        busy: _busy,
      );

  String get _statusLabel {
    switch (widget.entry.entryStatus) {
      case 'registered':
        return '待機中';
      case 'seated':
        return '着席中';
      case 'busted':
        return '退席済み';
      default:
        return widget.entry.entryStatus;
    }
  }

  Color get _statusColor {
    switch (widget.entry.entryStatus) {
      case 'registered':
        return Colors.amber.shade100;
      case 'seated':
        return Colors.green.shade100;
      case 'busted':
        return Colors.grey.shade300;
      default:
        return Colors.grey.shade200;
    }
  }

  Color get _statusTextColor {
    switch (widget.entry.entryStatus) {
      case 'registered':
        return Colors.amber.shade900;
      case 'seated':
        return Colors.green.shade900;
      case 'busted':
        return Colors.grey.shade800;
      default:
        return Colors.grey.shade800;
    }
  }

  String get _auxiliaryLine {
    switch (widget.entry.entryStatus) {
      case 'registered':
        final c = widget.entry.createdAt;
        if (c == null) return '';
        final minutes = DateTime.now().difference(c).inMinutes;
        return '待機時間: ${minutes < 0 ? 0 : minutes}分';
      case 'seated':
        return '着席中（卓の Bust は卓画面から）';
      case 'busted':
        return formatOkibakeBustedInfoLine(bustedAt: widget.entry.bustedAt);
      default:
        return '';
    }
  }

  Future<bool> _confirmAddon() async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (confirmCtx) {
        return AlertDialog(
          title: const Text('Addon の確認'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$_displayName に Addon を実行しますか？'),
                const SizedBox(height: 8),
                Text(
                  _addonLine,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.black54,
                      ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(confirmCtx).pop(false),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(confirmCtx).pop(true),
              child: const Text('実行'),
            ),
          ],
        );
      },
    );
    return ok == true;
  }

  Future<void> _executeAddon() async {
    if (_busy || _addonDisabled) return;
    final proceed = await _confirmAddon();
    if (!mounted || !proceed) return;

    setState(() => _busy = true);
    try {
      final result = await widget.service.applyOkibakeAddon(
        tournamentId: widget.tournamentId,
        okibakeEntryId: widget.entry.okibakeEntryId,
      );
      if (!mounted) return;
      if (result.success) {
        widget.showSnack('Addon を実行しました');
      } else {
        widget.showSnack(
          result.errorMessage != null && result.errorMessage!.isNotEmpty
              ? 'Addon に失敗しました: ${result.errorMessage}'
              : 'Addon に失敗しました',
          isError: true,
        );
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _executeLinkBill() async {
    if (_busy) return;
    final linkedName = await showOkibakeLinkBillDialog(
      context: context,
      tournamentId: widget.tournamentId,
      okibakeEntryId: widget.entry.okibakeEntryId,
      displayName: _displayName,
      service: widget.service,
    );
    if (!mounted || linkedName == null) return;
    widget.showSnack('$linkedName の伝票に紐付けました');
  }

  Future<void> _onCardTap() async {
    if (_busy) return;
    switch (widget.entry.entryStatus) {
      case 'registered':
        await _handleRegistered();
      case 'seated':
        await _handleSeated();
      case 'busted':
        await _handleBusted();
      default:
        return;
    }
  }

  Future<void> _handleRegistered() async {
    final waitingMinutes = widget.entry.createdAt == null
        ? 0
        : DateTime.now().difference(widget.entry.createdAt!).inMinutes;
    final action = await showOkibakeWaitingActionDialog(
      context: context,
      displayName: _displayName,
      addonLine: _addonLine,
      addonDisabled: _addonDisabled,
      waitingMinutes: waitingMinutes < 0 ? 0 : waitingMinutes,
      billLinkStatus: widget.entry.billLinkStatus,
    );
    if (!mounted || action == null) return;

    switch (action) {
      case OkibakeWaitingAction.assignSeat:
        widget.onRequestAssignSeat(
          widget.entry.okibakeEntryId,
          _displayName,
        );
      case OkibakeWaitingAction.addon:
        await _executeAddon();
      case OkibakeWaitingAction.linkBill:
        await _executeLinkBill();
    }
  }

  Future<void> _handleSeated() async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        return OkibakeSeatActionDialog(
          tournamentId: widget.tournamentId,
          okibakeEntryId: widget.entry.okibakeEntryId,
          displayName: _displayName,
          service: widget.service,
          showBustAction: false,
          showResultSnackBar: (message, isError) =>
              widget.showSnack(message, isError: isError),
        );
      },
    );
  }

  Future<void> _handleBusted() async {
    final action = await showOkibakeBustedActionDialog(
      context: context,
      displayName: _displayName,
      billLinkStatus: widget.entry.billLinkStatus,
      bustedInfoLine: formatOkibakeBustedInfoLine(
        bustedAt: widget.entry.bustedAt,
      ),
    );
    if (!mounted || action == null) return;
    if (action == OkibakeBustedAction.linkBill) {
      await _executeLinkBill();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          InkWell(
            onTap: _busy ? null : _onCardTap,
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 6,
                          runSpacing: 4,
                          children: [
                            Text(
                              _displayName,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.amber.shade100,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                    color: Colors.amber.shade700),
                              ),
                              child: Text(
                                '置きバケ',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.amber.shade900,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: _statusColor,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                _statusLabel,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: _statusTextColor,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        if (_auxiliaryLine.isNotEmpty)
                          Text(
                            _auxiliaryLine,
                            style: TextStyle(
                                fontSize: 12, color: Colors.grey.shade700),
                          ),
                        Text(
                          formatOkibakeBillLinkStatusLabel(
                              widget.entry.billLinkStatus),
                          style: TextStyle(
                              fontSize: 12, color: Colors.grey.shade700),
                        ),
                        if (widget.entry.entryStatus != 'busted')
                          Text(
                            _addonLine,
                            style: TextStyle(
                              fontSize: 12,
                              color: _addonDisabled &&
                                      !widget.addonLimitLoading
                                  ? Colors.grey.shade600
                                  : Colors.amber.shade900,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Icon(Icons.chevron_right,
                        color: Colors.amber.shade700),
                  ),
                ],
              ),
            ),
          ),
          if (_busy)
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
    );
  }
}
