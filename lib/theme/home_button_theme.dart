// G5-01 相当: ホームボタンのカラー・アイコン定義
//
// Terminal ホーム / Admin ホーム で共通参照する。
// カラーを変更する場合はこのファイルのみを編集すること。

import 'package:flutter/material.dart';

// ─────────────────────────────────────────────
// カテゴリテーマ（背景色 + 前景色）
// ─────────────────────────────────────────────

class HomeCategoryTheme {
  final String label; // カテゴリ表示名（絵文字含む）
  final Color bg; // ボタン背景色
  final Color fg; // アイコン・テキスト色

  const HomeCategoryTheme({
    required this.label,
    required this.bg,
    required this.fg,
  });
}

// ─────────────────────────────────────────────
// Terminal カテゴリ定義
// ─────────────────────────────────────────────

class TerminalCategoryColors {
  TerminalCategoryColors._();

  static const operations = HomeCategoryTheme(
    label: '⚙️  営業',
    bg: Color(0xFFE3F2FD),
    fg: Color(0xFF1565C0),
  );

  static const user = HomeCategoryTheme(
    label: '👤  ユーザー',
    bg: Color(0xFFF3E5F5),
    fg: Color(0xFF6A1B9A),
  );

  static const accounting = HomeCategoryTheme(
    label: '💴  会計',
    bg: Color(0xFFFFF8E1),
    fg: Color(0xFFE65100),
  );

  static const order = HomeCategoryTheme(
    label: '🍽️  注文',
    bg: Color(0xFFFBE9E7),
    fg: Color(0xFFB71C1C),
  );

  static const tournament = HomeCategoryTheme(
    label: '🏆  トーナメント',
    bg: Color(0xFFE8F5E9),
    fg: Color(0xFF1B5E20),
  );

  static const sideGame = HomeCategoryTheme(
    label: '🎲  サイドゲーム',
    bg: Color(0xFFE0F2F1),
    fg: Color(0xFF004D40),
  );
}

// ─────────────────────────────────────────────
// Admin カテゴリ定義
// ─────────────────────────────────────────────

class AdminCategoryColors {
  AdminCategoryColors._();

  static const shift = HomeCategoryTheme(
    label: '📅  営業日・シフト管理',
    bg: Color(0xFFE3F2FD),
    fg: Color(0xFF1565C0),
  );

  static const attendance = HomeCategoryTheme(
    label: '⏰  勤怠',
    bg: Color(0xFFF3E5F5),
    fg: Color(0xFF6A1B9A),
  );

  static const staff = HomeCategoryTheme(
    label: '👥  スタッフ管理',
    bg: Color(0xFFE8F5E9),
    fg: Color(0xFF1B5E20),
  );

  static const settings = HomeCategoryTheme(
    label: '🔧  設定・分析',
    bg: Color(0xFFEFEBE9),
    fg: Color(0xFF3E2723),
  );
}

// ─────────────────────────────────────────────
// グレーアウト時スタイル（DeviceOption 非保有ボタン）
// ─────────────────────────────────────────────

class HomeButtonGreyTheme {
  HomeButtonGreyTheme._();

  static const bg = Color(0xFFF5F5F5);
  static const fg = Color(0xFFBDBDBD);
  static const borderColor = Color(0xFFE0E0E0);
}

// ─────────────────────────────────────────────
// ボタン定義
// ─────────────────────────────────────────────

/// ホームボタン1つの定義
class HomeBtnDef {
  /// ボタンラベル
  final String label;

  /// アイコン
  final IconData icon;

  /// 必要な DeviceOptionKey のリスト
  /// - null: 常にアクティブ（オプション不要）
  /// - 空でない: いずれか1つでも true であればアクティブ
  final List<String>? optionKeys;

  /// 遷移先ページ
  /// - null の場合は [isStoreManagementDialog] = true であること
  final Widget? destination;

  /// true のとき、タップで開閉店管理ダイアログを開く（遷移しない）
  /// 営業管理ボタンのみ true
  final bool isStoreManagementDialog;

  const HomeBtnDef({
    required this.label,
    required this.icon,
    this.optionKeys,
    this.destination,
    this.isStoreManagementDialog = false,
  }) : assert(
          destination != null || isStoreManagementDialog,
          'destination が null の場合は isStoreManagementDialog を true にすること',
        );
}

// ─────────────────────────────────────────────
// レイアウト定数（Terminal / Admin 共通）
// ─────────────────────────────────────────────

class HomeLayoutConst {
  HomeLayoutConst._();

  static const hPad = 14.0; // 左右パディング
  static const vPad = 10.0; // 上下パディング
  static const btnGap = 10.0; // カテゴリ内ボタン間隔
  static const catDividerGap = 22.0; // カテゴリ間隔（行内の2カテゴリを区切る）
  static const rowGap = 16.0; // 行間（ペア行同士の間隔）
  static const headerH = 18.0; // カテゴリヘッダー高さ
  static const headerGap = 6.0; // ヘッダー→ボタン間隔

  // Terminal: 6スロット
  // gap = (6-2)*btnGap + catDividerGap = 4*10 + 22 = 62
  static const terminalSlots = 6;
  static const terminalHGap = (terminalSlots - 2) * btnGap + catDividerGap; // 62.0

  // Admin: 5スロット
  // gap = (5-2)*btnGap + catDividerGap = 3*10 + 22 = 52
  static const adminSlots = 5;
  static const adminHGap = (adminSlots - 2) * btnGap + catDividerGap; // 52.0

  /// ボタン幅計算
  /// [availW]: 利用可能幅（LayoutBuilder の maxWidth）
  /// [numSlots]: スロット数（Terminal=6, Admin=5）
  static double calcBtnW(double availW, {required int numSlots}) {
    final totalGap = (numSlots - 2) * btnGap + catDividerGap;
    return (availW - hPad * 2 - totalGap) / numSlots;
  }

  /// Terminal ボタン高さ計算（3行）
  static double calcTerminalBtnH(double availH) {
    const fixed = vPad * 2
        + 3 * (headerH + headerGap)
        + 2 * rowGap; // = 20 + 72 + 32 = 124
    return ((availH - fixed) / 3).clamp(48.0, double.infinity);
  }

  /// Admin ボタン高さ計算（2行 + 正方形上限）
  /// 余剰スペースを上下均等配分するための extraVPad も返す
  static ({double btnH, double extraVPad}) calcAdminBtnH(
    double availH,
    double btnW,
  ) {
    const fixed = vPad * 2
        + 2 * (headerH + headerGap)
        + 1 * rowGap; // = 20 + 48 + 16 = 84
    final rawH = (availH - fixed) / 2;
    final btnH = rawH.clamp(48.0, btnW * 1.3); // 縦横比上限（横の1.3倍まで許容）
    // 余剰スペースを上下に均等配分
    final contentH = fixed + 2 * btnH;
    final extra = ((availH - contentH) / 2).clamp(0.0, double.infinity);
    return (btnH: btnH, extraVPad: extra);
  }
}
