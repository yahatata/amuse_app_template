import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/services/user_tournament_addon_counter.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/regular_waiting_action_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/okibake_addon_display_helpers.dart';
import 'package:flutter/material.dart';

/// 待機一覧の通常参加者行（カードタップ → 操作選択 → 席配置 / Addon）。
class RegularWaitingListTile extends StatefulWidget {
  const RegularWaitingListTile({
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
  State<RegularWaitingListTile> createState() => _RegularWaitingListTileState();
}

class _RegularWaitingListTileState extends State<RegularWaitingListTile> {
  bool _busy = false;
  bool _loadingCount = true;
  bool _countLoadFailed = false;
  int _addonCount = 0;

  @override
  void initState() {
    super.initState();
    _loadAddonCount();
  }

  @override
  void didUpdateWidget(RegularWaitingListTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.player.userId != widget.player.userId ||
        oldWidget.tournamentId != widget.tournamentId) {
      _loadAddonCount();
    }
  }

  Future<void> _loadAddonCount() async {
    if (!mounted) return;
    setState(() {
      _loadingCount = true;
      _countLoadFailed = false;
    });
    final result = await loadUserTournamentAddonCount(
      tournamentId: widget.tournamentId,
      userId: widget.player.userId,
    );
    if (!mounted) return;
    setState(() {
      _loadingCount = false;
      _countLoadFailed = result.loadFailed;
      _addonCount = result.addonCount;
    });
  }

  String get _addonLine => formatAddonStatusLine(
        addonCount: _addonCount,
        resolvedAddonLimit: widget.resolvedAddonLimit,
        loading: widget.addonLimitLoading || _loadingCount,
        countLoadFailed: _countLoadFailed,
      );

  bool get _addonDisabled => isRegularWaitingActionAddonDisabled(
        addonCount: _addonCount,
        resolvedAddonLimit: widget.resolvedAddonLimit,
        addonLimitLoading: widget.addonLimitLoading || _loadingCount,
        countLoadFailed: _countLoadFailed,
      );

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
      final result = await widget.service.applyUserAddon(
        tournamentId: widget.tournamentId,
        userId: widget.player.userId,
        pokerName: widget.player.displayName,
      );
      if (!mounted) return;

      if (result.success) {
        await _loadAddonCount();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Addon を実行しました')),
        );
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

    final action = await showRegularWaitingActionDialog(
      context: context,
      displayName: widget.player.displayName,
      addonLine: _addonLine,
      addonDisabled: _addonDisabled,
      waitingMinutes: widget.player.waitingMinutes,
    );
    if (!mounted || action == null) return;

    switch (action) {
      case RegularWaitingAction.assignSeat:
        widget.onAssignSeat();
      case RegularWaitingAction.addon:
        await _executeAddon();
    }
  }

  @override
  Widget build(BuildContext context) {
    final addonDisabledOnCard = isAddonUiDisabled(
      addonCount: _addonCount,
      resolvedAddonLimit: widget.resolvedAddonLimit,
      loading: widget.addonLimitLoading || _loadingCount,
      busy: _busy,
      countLoadFailed: _countLoadFailed,
    );

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
                    backgroundColor: Colors.orange[100]!,
                    child: Text(
                      '${widget.listIndex + 1}',
                      style: TextStyle(
                        color: Colors.orange[700]!,
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
                        Text(
                          widget.player.displayName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '待機時間: ${widget.player.waitingMinutes}分',
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                        ),
                        Text(
                          _addonLine,
                          style: TextStyle(
                            fontSize: 12,
                            color: addonDisabledOnCard &&
                                    !widget.addonLimitLoading &&
                                    !_loadingCount
                                ? Colors.grey.shade600
                                : Colors.orange.shade800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Icon(
                      Icons.chevron_right,
                      color: Colors.orange.shade700,
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
