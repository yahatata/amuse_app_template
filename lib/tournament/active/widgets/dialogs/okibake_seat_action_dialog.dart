import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_link_bill_dialog.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/widgets/okibake_addon_display_helpers.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_action_menu_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_action_menu_tile.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_waiting_action_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_update_linked_user_dialog.dart';
import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// 着席済み置きバケ席用の結果通知（SnackBar 等）。
typedef OkibakeSeatActionSnackBar = void Function(String message, bool isError);

/// Phase 3C-3-2: 卓上・着席済み置きバケのアクション（Addon / Bust）。
///
/// メニューの見た目は `user_action_home.dart` の `showUserActionHome`
/// と同パターン（`Dialog`・角丸・4列 Grid・ブロックタイル）。
/// 更新系ロックは AssignSeatDialog と同様に `SizedBox` + `Stack` の全面 CPI。
class OkibakeSeatActionDialog extends StatefulWidget {
  const OkibakeSeatActionDialog({
    super.key,
    required this.tournamentId,
    required this.okibakeEntryId,
    required this.displayName,
    required this.service,
    required this.showResultSnackBar,
    this.showBustAction = true,
    this.addonIntent,
  });

  final String tournamentId;
  final String okibakeEntryId;

  /// 表示名（席の pokerName）。
  final String displayName;
  final TournamentService service;

  /// ローディング解除後に呼ぶ（SnackBar はダイアログ外の context を使う）。
  final OkibakeSeatActionSnackBar showResultSnackBar;

  /// Phase 4 補完: 「置きバケ一覧」経由のときは Bust を出さない（§12.8.4）。
  /// 卓席タップ導線では `true` を維持する。
  final bool showBustAction;
  final String? addonIntent;

  @override
  State<OkibakeSeatActionDialog> createState() =>
      _OkibakeSeatActionDialogState();
}

class _OkibakeSeatActionDialogState extends State<OkibakeSeatActionDialog> {
  bool _busy = false;
  bool _loadingAddonHints = false;

  /// `resolveAddonLimitPerPlayerUi` の結果。-1 は未取得。
  int _resolvedAddonLimit = -1;

  int _okibakeAddonCount = 0;
  String _billLinkStatus = 'unlinked';
  String? _linkedUserId;
  String? _addonIntentFromEntry;

  @override
  void initState() {
    super.initState();
    _loadAddonHints();
  }

  Future<void> _loadAddonHints() async {
    if (!mounted) return;
    setState(() => _loadingAddonHints = true);
    try {
      final tRef = FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId);

      final tSnap = await tRef.get().timeout(const Duration(seconds: 15));

      final eSnap = await tRef
          .collection('okibakeTemporaryEntries')
          .doc(widget.okibakeEntryId)
          .get()
          .timeout(const Duration(seconds: 15));

      if (!mounted) return;

      final tData = tSnap.data() ?? <String, dynamic>{};
      final snap = Map<String, dynamic>.from((tData['snapshot'] as Map?) ?? {});

      final limitUi = resolveAddonLimitPerPlayerUi(
        isAddon: snap['isAddon'] == true,
        addonLimitPerPlayer: snap['addonLimitPerPlayer'],
      );

      var count = 0;
      var billLinkStatus = 'unlinked';
      String? linkedUserId;
      final eData = eSnap.data();
      if (eData != null) {
        final c = eData['okibakeAddonCount'];
        if (c is int) {
          count = c;
        } else if (c is num) {
          count = c.toInt();
        }
        final bls = eData['billLinkStatus'];
        if (bls is String && bls.isNotEmpty) {
          billLinkStatus = bls;
        }
        final linked = eData['linkedUserId'];
        linkedUserId = linked is String && linked.trim().isNotEmpty
            ? linked.trim()
            : null;
        final addonIntentRaw = eData['addonIntent'];
        if (addonIntentRaw is String && addonIntentRaw.trim().isNotEmpty) {
          _addonIntentFromEntry = addonIntentRaw.trim();
        } else {
          _addonIntentFromEntry = null;
        }
      }

      setState(() {
        _resolvedAddonLimit = limitUi;
        _okibakeAddonCount = count;
        _billLinkStatus = billLinkStatus;
        _linkedUserId = linkedUserId;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _resolvedAddonLimit = -1);
    } finally {
      if (mounted) {
        setState(() => _loadingAddonHints = false);
      }
    }
  }

  bool get _addonUiDisabled =>
      !_loadingAddonHints &&
      _resolvedAddonLimit >= 0 &&
      (_resolvedAddonLimit <= 0 || _okibakeAddonCount >= _resolvedAddonLimit);

  String get _addonLine => formatOkibakeAddonStatusLine(
    okibakeAddonCount: _okibakeAddonCount,
    resolvedAddonLimit: _resolvedAddonLimit,
    loading: _loadingAddonHints,
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
                const Text('この置きバケに Addon を実行しますか？'),
                const SizedBox(height: 8),
                Text(
                  _addonLine,
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Colors.black54),
                ),
                if (_loadingAddonHints || _resolvedAddonLimit < 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    '最終判断はサーバー側で行われます。',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: Colors.black45),
                  ),
                ],
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

  Future<bool> _confirmBust() async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (confirmCtx) {
        return AlertDialog(
          title: const Text('Bust の確認'),
          content: const Text('この置きバケを Bust しますか？\nこの操作後、席は空席になります。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(confirmCtx).pop(false),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red.shade700,
                foregroundColor: Colors.white,
              ),
              onPressed: () => Navigator.of(confirmCtx).pop(true),
              child: const Text('Bust'),
            ),
          ],
        );
      },
    );
    return ok == true;
  }

  Future<void> _executeAddon() async {
    if (_busy) return;

    final proceed = await _confirmAddon();
    if (!mounted || !proceed) return;

    setState(() => _busy = true);
    try {
      final result = await widget.service.applyOkibakeAddon(
        tournamentId: widget.tournamentId,
        okibakeEntryId: widget.okibakeEntryId,
      );
      if (!mounted) return;
      // ロック解除後にSnackBarへ（親 callback）
      if (result.success) {
        Navigator.of(context).pop();
        widget.showResultSnackBar('Addon を実行しました', false);
      } else {
        widget.showResultSnackBar(result.errorMessage ?? 'Addon に失敗しました', true);
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _executeBust() async {
    if (_busy) return;

    final proceed = await _confirmBust();
    if (!mounted || !proceed) return;

    setState(() => _busy = true);
    try {
      final result = await widget.service.bustOkibakeTemporaryEntry(
        tournamentId: widget.tournamentId,
        okibakeEntryId: widget.okibakeEntryId,
      );
      if (!mounted) return;

      if (result.success) {
        Navigator.of(context).pop();
        widget.showResultSnackBar('Bust しました', false);
      } else {
        widget.showResultSnackBar(result.errorMessage ?? 'Bust に失敗しました', true);
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  bool get _showLinkBill => _billLinkStatus == 'unlinked';
  bool get _showSetLinkedUser =>
      _billLinkStatus == 'unlinked' && _linkedUserId == null;

  Future<void> _executeLinkBill() async {
    if (_busy) return;

    final linkedName = await showOkibakeLinkBillDialog(
      context: context,
      tournamentId: widget.tournamentId,
      okibakeEntryId: widget.okibakeEntryId,
      displayName: widget.displayName,
      service: widget.service,
    );
    if (!mounted || linkedName == null) return;

    Navigator.of(context).pop();
    widget.showResultSnackBar('$linkedName の伝票に紐付けました', false);
  }

  Future<void> _executeSetLinkedUser() async {
    if (_busy) return;

    final success = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        return OkibakeUpdateLinkedUserDialog(
          tournamentId: widget.tournamentId,
          okibakeEntryId: widget.okibakeEntryId,
          displayName: widget.displayName,
          service: widget.service,
        );
      },
    );
    if (!mounted || success != true) return;

    Navigator.of(context).pop();
    widget.showResultSnackBar('対象ユーザーを設定しました', false);
  }

  Widget _buildAddonHintsBanner(BuildContext context) {
    var addonColor = Colors.black54;

    if (!_loadingAddonHints && _resolvedAddonLimit == 0) {
      addonColor = Colors.red.shade700;
    } else if (!_loadingAddonHints &&
        _resolvedAddonLimit > 0 &&
        _okibakeAddonCount >= _resolvedAddonLimit) {
      addonColor = Colors.grey.shade600;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          formatOkibakeBillLinkStatusLabel(_billLinkStatus),
          style: const TextStyle(
            fontSize: 13,
            height: 1.35,
            color: Colors.black54,
          ),
        ),
        Text(
          'アドオン意思: ${formatOkibakeAddonIntentLabel(_addonIntentFromEntry ?? widget.addonIntent)}',
          style: const TextStyle(
            fontSize: 13,
            height: 1.35,
            color: Colors.black54,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _addonLine,
          style: TextStyle(fontSize: 13, height: 1.35, color: addonColor),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    // showUserActionHome と同一のレイアウト定数・パターン
    final size = MediaQuery.sizeOf(context);
    const double scale = 1.2;
    final double maxHeight = size.height - 48;

    return PopScope(
      canPop: !_busy,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: Builder(
                builder: (context) {
                  final tiles = <Widget>[
                    OkibakeActionMenuTile(
                      label: 'Addon',
                      iconData: Icons.add_circle_outline,
                      color: Colors.green,
                      onTap: (!_busy && !_addonUiDisabled)
                          ? () => _executeAddon()
                          : null,
                    ),
                    if (widget.showBustAction)
                      OkibakeActionMenuTile(
                        label: 'Bust',
                        iconData: Icons.exit_to_app,
                        color: Colors.red,
                        onTap: !_busy ? () => _executeBust() : null,
                      ),
                    if (_showLinkBill)
                      OkibakeActionMenuTile(
                        label: '伝票紐付け',
                        iconData: Icons.receipt_long_outlined,
                        color: Colors.blue.shade700,
                        onTap: !_busy ? () => _executeLinkBill() : null,
                      ),
                    if (_showSetLinkedUser)
                      OkibakeActionMenuTile(
                        label: '対象ユーザー設定',
                        iconData: Icons.person_add_alt_1_outlined,
                        color: Colors.indigo.shade600,
                        onTap: !_busy ? () => _executeSetLinkedUser() : null,
                      ),
                  ];

                  return OkibakeActionMenuDialog(
                    title: '置きバケ操作',
                    displayName: widget.displayName,
                    detailLines: [_buildAddonHintsBanner(context)],
                    actions: tiles,
                    canClose: !_busy,
                    maxWidth: 520 * scale,
                    maxHeight: maxHeight,
                    onClose: () => Navigator.of(context).pop<void>(),
                  );
                },
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
      ),
    );
  }
}
