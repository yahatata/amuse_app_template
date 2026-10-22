import 'package:amuse_app_template/tournament/active/widgets/okibake_addon_display_helpers.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_action_menu_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_action_menu_tile.dart';
import 'package:flutter/material.dart';

/// 置きバケ `billLinkStatus` の表示ラベル。
String formatOkibakeBillLinkStatusLabel(String billLinkStatus) {
  switch (billLinkStatus) {
    case 'linked':
      return '伝票: リンク済み';
    case 'pending_review':
      return '伝票: 要確認';
    case 'unlinked':
      return '伝票: 未リンク';
    default:
      return '伝票: 未リンク';
  }
}

String formatOkibakeAddonIntentLabel(String? addonIntent) {
  switch ((addonIntent ?? '').trim()) {
    case 'yes':
      return '希望する';
    case 'no':
      return '希望しない';
    case 'unknown':
      return 'わからない';
    default:
      return '未設定';
  }
}

/// 待機中置きバケの操作選択結果。
enum OkibakeWaitingAction { assignSeat, addon, linkBill, setLinkedUser }

/// 待機中置きバケカードタップ後の中間ダイアログ。
Future<OkibakeWaitingAction?> showOkibakeWaitingActionDialog({
  required BuildContext context,
  required String displayName,
  required String addonLine,
  required bool addonDisabled,
  required int waitingMinutes,
  required String billLinkStatus,
  String? addonIntent,
  bool linkBillEnabled = true,
  bool canSetLinkedUser = false,
}) {
  return showDialog<OkibakeWaitingAction>(
    context: context,
    barrierDismissible: false,
    builder: (dialogCtx) {
      return OkibakeActionMenuDialog(
        title: '置きバケ操作',
        displayName: displayName,
        onClose: () => Navigator.of(dialogCtx).pop(),
        detailLines: [
          Text(
            '待機時間: $waitingMinutes分',
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
          const SizedBox(height: 4),
          Text(
            addonLine,
            style: TextStyle(
              fontSize: 13,
              color: addonDisabled
                  ? Colors.grey.shade600
                  : Colors.amber.shade900,
            ),
          ),
        ],
        actions: [
          OkibakeActionMenuTile(
            label: '席へ',
            iconData: Icons.event_seat,
            color: Colors.amber.shade700,
            onTap: () =>
                Navigator.of(dialogCtx).pop(OkibakeWaitingAction.assignSeat),
          ),
          OkibakeActionMenuTile(
            label: 'Addon',
            iconData: Icons.add_circle_outline,
            color: Colors.green,
            onTap: addonDisabled
                ? null
                : () => Navigator.of(dialogCtx).pop(OkibakeWaitingAction.addon),
          ),
          if (billLinkStatus == 'unlinked' && linkBillEnabled)
            OkibakeActionMenuTile(
              label: '伝票紐付け',
              iconData: Icons.receipt_long_outlined,
              color: Colors.blue.shade700,
              onTap: () =>
                  Navigator.of(dialogCtx).pop(OkibakeWaitingAction.linkBill),
            ),
          if (canSetLinkedUser)
            OkibakeActionMenuTile(
              label: '対象ユーザー設定',
              iconData: Icons.person_add_alt_1_outlined,
              color: Colors.indigo.shade600,
              onTap: () => Navigator.of(
                dialogCtx,
              ).pop(OkibakeWaitingAction.setLinkedUser),
            ),
        ],
      );
    },
  );
}

/// 中間ダイアログ用 Addon disabled 判定（busy 除外）。
bool isOkibakeWaitingActionAddonDisabled({
  required int okibakeAddonCount,
  required int resolvedAddonLimit,
  bool addonLimitLoading = false,
}) {
  return isOkibakeAddonUiDisabled(
    okibakeAddonCount: okibakeAddonCount,
    resolvedAddonLimit: resolvedAddonLimit,
    loading: addonLimitLoading,
    busy: false,
  );
}
