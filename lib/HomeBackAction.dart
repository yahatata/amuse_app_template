import 'package:flutter/material.dart';
import 'package:amuse_app_template/Home/app_home_navigation.dart';

/// AppBar右上に表示するHomeボタン（遷移ロジック含む）
Widget buildHomeButton(BuildContext context, {bool enabled = true}) {
  return IconButton(
    icon: const Icon(Icons.home),
    tooltip: 'Homeへ戻る',
    onPressed: enabled
        ? () => navigateToAppHome(context)
        : null,
  );
}
