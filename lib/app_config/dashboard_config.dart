/// ダッシュボードUI設定
/// 
/// 責務: ダッシュボードのUIカラー設定を一元管理
/// 参照: lib/dashboard内の全UIファイル

import 'package:flutter/material.dart';

class DashboardConfig {
  // シングルトンインスタンス
  static final DashboardConfig _instance = DashboardConfig._internal();
  factory DashboardConfig() => _instance;
  DashboardConfig._internal();

  // AppBarのカラー
  Color appBarColor = Colors.grey[800]!;

  // AppBar内の文字のカラー
  Color appBarTextColor = Colors.white;

  // Bodyの背景色
  Color bodyBackgroundColor = Colors.brown[50]!;

  // タブのカラー←これ何の色か謎
  Color tabColor = Colors.white;

  // タブ内の文字の色
  Color tabTextColor = Colors.white;

  // タブの背景色
  Color tabBackgroundColor = Colors.grey[700]!;
}

