import 'package:amuse_app_template/tournament/active/widgets/okibake_addon_display_helpers.dart';
import 'package:flutter/material.dart';

/// 待機中通常参加者の操作選択結果。
enum RegularWaitingAction {
  assignSeat,
  addon,
}

/// 待機中通常参加者カードタップ後の中間ダイアログ。
Future<RegularWaitingAction?> showRegularWaitingActionDialog({
  required BuildContext context,
  required String displayName,
  required String addonLine,
  required bool addonDisabled,
  required int waitingMinutes,
}) {
  return showDialog<RegularWaitingAction>(
    context: context,
    barrierDismissible: false,
    builder: (dialogCtx) {
      return Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
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
                    Icon(Icons.person_outline, color: Colors.orange.shade700),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        '待機者操作',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
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
                Text(
                  displayName,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '待機時間: ${waitingMinutes}分',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 4),
                Text(
                  addonLine,
                  style: TextStyle(
                    fontSize: 13,
                    color: addonDisabled ? Colors.grey.shade600 : Colors.orange.shade800,
                  ),
                ),
                const SizedBox(height: 16),
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.35,
                  children: [
                    _RegularWaitingMenuTile(
                      label: '席へ',
                      iconData: Icons.event_seat,
                      color: Colors.green,
                      onTap: () => Navigator.of(dialogCtx).pop(RegularWaitingAction.assignSeat),
                    ),
                    _RegularWaitingMenuTile(
                      label: 'Addon',
                      iconData: Icons.add_circle_outline,
                      color: Colors.green,
                      onTap: addonDisabled
                          ? null
                          : () => Navigator.of(dialogCtx).pop(RegularWaitingAction.addon),
                    ),
                  ],
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

class _RegularWaitingMenuTile extends StatelessWidget {
  const _RegularWaitingMenuTile({
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
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
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

/// 中間ダイアログ用 Addon disabled 判定（busy 除外）。
bool isRegularWaitingActionAddonDisabled({
  required int addonCount,
  required int resolvedAddonLimit,
  bool addonLimitLoading = false,
  bool countLoadFailed = false,
}) {
  return isAddonUiDisabled(
    addonCount: addonCount,
    resolvedAddonLimit: resolvedAddonLimit,
    loading: addonLimitLoading,
    busy: false,
    countLoadFailed: countLoadFailed,
  );
}
