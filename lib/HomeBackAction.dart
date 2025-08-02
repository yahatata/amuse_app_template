import 'package:flutter/material.dart';
import 'package:amuse_app_template/Home/adminHomePage.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';

/// AppBar右上に表示するHomeボタン（遷移ロジック含む）
///
/// 将来的に role を Firebase や SharedPreferences から取得し、
/// 以下のように分岐させる予定：
///
/// ```dart
/// final role = await fetchRoleFromFirebaseOrPrefs();
/// if (role == 'admin') return AdminHomePage();
/// if (role == 'terminal') return TerminalHomePage();
/// ```
///
/// ただし現在は仮で AdminHomePage に遷移。
Widget buildHomeButton(BuildContext context) {
  return IconButton(
    icon: const Icon(Icons.home),
    tooltip: 'Homeへ戻る',
    onPressed: () {
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => const AdminHomePage(), // ← 仮：将来的に role に応じて分岐
        ),
            (route) => false, // 履歴をすべて削除してから遷移
      );
    },
  );
}
