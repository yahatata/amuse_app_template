import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_waiting_action_dialog.dart';
import 'package:flutter/material.dart';

/// Phase 4 補完: 退席済み (`busted`) かつ `unlinked` の置きバケに対する操作選択（§12.8.4）。
///
/// 「置きバケ一覧」からタップしたときに出す中間ダイアログ。
/// 操作は伝票紐付けのみ（席配置・Addon・Bust は出さない）。
enum OkibakeBustedAction {
  linkBill,
}

/// 退席済み置きバケカードタップ後の中間ダイアログ。
Future<OkibakeBustedAction?> showOkibakeBustedActionDialog({
  required BuildContext context,
  required String displayName,
  required String billLinkStatus,
  required String bustedInfoLine,
}) {
  return showDialog<OkibakeBustedAction>(
    context: context,
    barrierDismissible: false,
    builder: (dialogCtx) {
      final linkBillEnabled = billLinkStatus == 'unlinked';
      return Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding:
            const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.face_retouching_natural,
                        color: Colors.amber.shade800),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        '置きバケ操作（退席済み）',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      tooltip: '閉じる',
                      onPressed: () => Navigator.of(dialogCtx).pop(),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    Text(
                      displayName,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade100,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.amber.shade700),
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
                      padding:
                          const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '退席済み',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.grey.shade800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  bustedInfoLine,
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                ),
                Text(
                  formatOkibakeBillLinkStatusLabel(billLinkStatus),
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 16),
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 220),
                    child: _OkibakeBustedMenuTile(
                      label: '伝票紐付け',
                      iconData: Icons.receipt_long_outlined,
                      color: Colors.blue.shade700,
                      onTap: linkBillEnabled
                          ? () => Navigator.of(dialogCtx)
                              .pop(OkibakeBustedAction.linkBill)
                          : null,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(dialogCtx).pop(),
                    child: const Text('閉じる'),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _OkibakeBustedMenuTile extends StatelessWidget {
  const _OkibakeBustedMenuTile({
    required this.label,
    required this.iconData,
    required this.color,
    required this.onTap,
  });

  final String label;
  final IconData iconData;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    Widget tile = InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.15),
              foregroundColor: color,
              radius: 22,
              child: Icon(iconData),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                color: enabled ? null : Colors.grey.shade500,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
    if (!enabled) {
      tile = Opacity(opacity: 0.45, child: IgnorePointer(child: tile));
    }
    return tile;
  }
}

/// busted カード/ダイアログで表示する補助情報行（例: 退席時刻 / 経過時間）。
/// `bustedAt` がない場合は「退席済み」のみ表示。
String formatOkibakeBustedInfoLine({
  DateTime? bustedAt,
  DateTime? now,
}) {
  if (bustedAt == null) {
    return '退席済み';
  }
  final n = now ?? DateTime.now();
  final diff = n.difference(bustedAt);
  if (diff.isNegative) {
    return '退席済み';
  }
  final minutes = diff.inMinutes;
  if (minutes < 1) {
    return '退席: 1 分未満前';
  }
  if (minutes < 60) {
    return '退席: $minutes 分前';
  }
  final hours = diff.inHours;
  final remainMin = minutes - hours * 60;
  if (hours < 24) {
    return remainMin == 0
        ? '退席: $hours 時間前'
        : '退席: $hours 時間 $remainMin 分前';
  }
  return '退席済み';
}
