import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_link_bill_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_update_linked_user_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_waiting_action_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/okibake_addon_display_helpers.dart';
import 'package:flutter/material.dart';

/// Phase 3C-3-3: 待機一覧の置きバケ行（カードタップ → 操作選択 → 席配置 / Addon）。
class OkibakeWaitingListTile extends StatefulWidget {
  const OkibakeWaitingListTile({
    super.key,
    required this.tournamentId,
    required this.player,
    required this.listIndex,
    required this.resolvedAddonLimit,
    required this.addonLimitLoading,
    required this.service,
    required this.onAssignSeat,
  });

  final String tournamentId;
  final WaitingPlayer player;
  final int listIndex;
  final int resolvedAddonLimit;
  final bool addonLimitLoading;
  final TournamentService service;
  final VoidCallback onAssignSeat;

  @override
  State<OkibakeWaitingListTile> createState() => _OkibakeWaitingListTileState();
}

class _OkibakeWaitingListTileState extends State<OkibakeWaitingListTile> {
  bool _busy = false;

  String get _addonLine => formatOkibakeAddonStatusLine(
    okibakeAddonCount: widget.player.okibakeAddonCount,
    resolvedAddonLimit: widget.resolvedAddonLimit,
    loading: widget.addonLimitLoading,
  );

  bool get _addonDisabled => isOkibakeWaitingActionAddonDisabled(
    okibakeAddonCount: widget.player.okibakeAddonCount,
    resolvedAddonLimit: widget.resolvedAddonLimit,
    addonLimitLoading: widget.addonLimitLoading,
  );

  bool get _canSetLinkedUser =>
      (widget.player.okibakeBillLinkStatus ?? 'unlinked') == 'unlinked' &&
      (widget.player.okibakeLinkedUserId == null ||
          widget.player.okibakeLinkedUserId!.trim().isEmpty);

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
                Text('${widget.player.displayName} に Addon を実行しますか？'),
                const SizedBox(height: 8),
                Text(
                  _addonLine,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Colors.black54),
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

    final entryId = widget.player.okibakeEntryId;
    if (entryId == null || entryId.isEmpty) return;

    final proceed = await _confirmAddon();
    if (!mounted || !proceed) return;

    setState(() => _busy = true);
    try {
      final result = await widget.service.applyOkibakeAddon(
        tournamentId: widget.tournamentId,
        okibakeEntryId: entryId,
      );
      if (!mounted) return;

      if (result.success) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Addon を実行しました')));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.errorMessage != null && result.errorMessage!.isNotEmpty
                  ? 'Addon に失敗しました: ${result.errorMessage}'
                  : 'Addon に失敗しました',
            ),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _onCardTap() async {
    if (_busy) return;

    final action = await showOkibakeWaitingActionDialog(
      context: context,
      displayName: widget.player.displayName,
      addonLine: _addonLine,
      addonDisabled: _addonDisabled,
      waitingMinutes: widget.player.waitingMinutes,
      billLinkStatus: widget.player.okibakeBillLinkStatus ?? 'unlinked',
      addonIntent: widget.player.okibakeAddonIntent,
      canSetLinkedUser: _canSetLinkedUser,
    );
    if (!mounted || action == null) return;

    switch (action) {
      case OkibakeWaitingAction.assignSeat:
        widget.onAssignSeat();
      case OkibakeWaitingAction.addon:
        await _executeAddon();
      case OkibakeWaitingAction.linkBill:
        await _executeLinkBill();
      case OkibakeWaitingAction.setLinkedUser:
        await _executeSetLinkedUser();
    }
  }

  Future<void> _executeSetLinkedUser() async {
    if (_busy || !_canSetLinkedUser) return;

    final entryId = widget.player.okibakeEntryId;
    if (entryId == null || entryId.isEmpty) return;

    final success = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        return OkibakeUpdateLinkedUserDialog(
          tournamentId: widget.tournamentId,
          okibakeEntryId: entryId,
          displayName: widget.player.displayName,
          service: widget.service,
        );
      },
    );
    if (!mounted || success != true) return;

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('対象ユーザーを設定しました')));
  }

  Future<void> _executeLinkBill() async {
    if (_busy) return;

    final entryId = widget.player.okibakeEntryId;
    if (entryId == null || entryId.isEmpty) return;

    final linkedName = await showOkibakeLinkBillDialog(
      context: context,
      tournamentId: widget.tournamentId,
      okibakeEntryId: entryId,
      displayName: widget.player.displayName,
      service: widget.service,
    );
    if (!mounted || linkedName == null) return;

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text('$linkedName の伝票に紐付けました')));
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 4),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          InkWell(
            onTap: _busy ? null : _onCardTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    backgroundColor: Colors.amber.shade100,
                    child: Text(
                      '${widget.listIndex + 1}',
                      style: TextStyle(
                        color: Colors.amber.shade900,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Wrap(
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 8,
                          runSpacing: 4,
                          children: [
                            Text(
                              widget.player.displayName,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w500,
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
                                  color: Colors.amber.shade700,
                                ),
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
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '待機時間: ${widget.player.waitingMinutes}分',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey.shade700,
                          ),
                        ),
                        Text(
                          _addonLine,
                          style: TextStyle(
                            fontSize: 12,
                            color: _addonDisabled && !widget.addonLimitLoading
                                ? Colors.grey.shade600
                                : Colors.amber.shade900,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Icon(
                      Icons.chevron_right,
                      color: Colors.amber.shade700,
                    ),
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
                  child: const Center(child: CircularProgressIndicator()),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
