import 'package:flutter/material.dart';

/// 置きバケ操作ダイアログで共通利用するメニュータイル。
class OkibakeActionMenuTile extends StatelessWidget {
  const OkibakeActionMenuTile({
    super.key,
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
