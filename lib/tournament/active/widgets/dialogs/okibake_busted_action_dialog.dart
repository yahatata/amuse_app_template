import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_action_menu_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_action_menu_tile.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_waiting_action_dialog.dart';
import 'package:flutter/material.dart';

/// Phase 4 補完: 退席済み (`busted`) かつ `unlinked` の置きバケに対する操作選択（§12.8.4）。
///
/// 「置きバケ一覧」からタップしたときに出す中間ダイアログ。
/// 操作は伝票紐付けのみ（席配置・Addon・Bust は出さない）。
enum OkibakeBustedAction { linkBill, setLinkedUser }

/// 退席済み置きバケカードタップ後の中間ダイアログ。
Future<OkibakeBustedAction?> showOkibakeBustedActionDialog({
  required BuildContext context,
  required String displayName,
  required String billLinkStatus,
  required String bustedInfoLine,
  String? addonIntent,
  bool canSetLinkedUser = false,
}) {
  return showDialog<OkibakeBustedAction>(
    context: context,
    barrierDismissible: false,
    builder: (dialogCtx) {
      final linkBillEnabled = billLinkStatus == 'unlinked';
      return OkibakeActionMenuDialog(
        title: '置きバケ操作（退席済み）',
        displayName: displayName,
        onClose: () => Navigator.of(dialogCtx).pop(),
        statusChips: [
          OkibakeActionStatusChip(
            label: '退席済み',
            backgroundColor: Colors.grey.shade200,
            foregroundColor: Colors.grey.shade800,
          ),
        ],
        detailLines: [
          Text(
            bustedInfoLine,
            style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
          ),
          Text(
            formatOkibakeBillLinkStatusLabel(billLinkStatus),
            style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
          ),
          Text(
            'アドオン意思: ${formatOkibakeAddonIntentLabel(addonIntent)}',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
          ),
        ],
        actions: [
          OkibakeActionMenuTile(
            label: '伝票紐付け',
            iconData: Icons.receipt_long_outlined,
            color: Colors.blue.shade700,
            onTap: linkBillEnabled
                ? () =>
                      Navigator.of(dialogCtx).pop(OkibakeBustedAction.linkBill)
                : null,
          ),
          if (canSetLinkedUser)
            OkibakeActionMenuTile(
              label: '対象ユーザー設定',
              iconData: Icons.person_add_alt_1_outlined,
              color: Colors.indigo.shade600,
              onTap: () => Navigator.of(
                dialogCtx,
              ).pop(OkibakeBustedAction.setLinkedUser),
            ),
        ],
      );
    },
  );
}

/// busted カード/ダイアログで表示する補助情報行（例: 退席時刻 / 経過時間）。
/// `bustedAt` がない場合は「退席済み」のみ表示。
String formatOkibakeBustedInfoLine({DateTime? bustedAt, DateTime? now}) {
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
    return remainMin == 0 ? '退席: $hours 時間前' : '退席: $hours 時間 $remainMin 分前';
  }
  return '退席済み';
}
