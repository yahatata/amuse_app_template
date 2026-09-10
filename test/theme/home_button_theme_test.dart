// G1: home_button_theme.dart ユニットテスト
//
// テスト対象: カラー定義・HomeBtnDef の型定義・グレーアウトテーマ
// Firebase依存なし。

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/theme/home_button_theme.dart';

void main() {
  group('TerminalCategoryColors', () {
    test('operations: bg=#E3F2FD, fg=#1565C0', () {
      expect(TerminalCategoryColors.operations.bg, equals(const Color(0xFFE3F2FD)));
      expect(TerminalCategoryColors.operations.fg, equals(const Color(0xFF1565C0)));
    });

    test('user: bg=#F3E5F5, fg=#6A1B9A', () {
      expect(TerminalCategoryColors.user.bg, equals(const Color(0xFFF3E5F5)));
      expect(TerminalCategoryColors.user.fg, equals(const Color(0xFF6A1B9A)));
    });

    test('accounting: bg=#FFF8E1, fg=#E65100', () {
      expect(TerminalCategoryColors.accounting.bg, equals(const Color(0xFFFFF8E1)));
      expect(TerminalCategoryColors.accounting.fg, equals(const Color(0xFFE65100)));
    });

    test('order: bg=#FBE9E7, fg=#B71C1C', () {
      expect(TerminalCategoryColors.order.bg, equals(const Color(0xFFFBE9E7)));
      expect(TerminalCategoryColors.order.fg, equals(const Color(0xFFB71C1C)));
    });

    test('tournament: bg=#E8F5E9, fg=#1B5E20', () {
      expect(TerminalCategoryColors.tournament.bg, equals(const Color(0xFFE8F5E9)));
      expect(TerminalCategoryColors.tournament.fg, equals(const Color(0xFF1B5E20)));
    });

    test('sideGame: bg=#E0F2F1, fg=#004D40', () {
      expect(TerminalCategoryColors.sideGame.bg, equals(const Color(0xFFE0F2F1)));
      expect(TerminalCategoryColors.sideGame.fg, equals(const Color(0xFF004D40)));
    });
  });

  group('AdminCategoryColors', () {
    test('shift: bg=#E3F2FD, fg=#1565C0', () {
      expect(AdminCategoryColors.shift.bg, equals(const Color(0xFFE3F2FD)));
      expect(AdminCategoryColors.shift.fg, equals(const Color(0xFF1565C0)));
    });

    test('attendance: bg=#F3E5F5, fg=#6A1B9A', () {
      expect(AdminCategoryColors.attendance.bg, equals(const Color(0xFFF3E5F5)));
      expect(AdminCategoryColors.attendance.fg, equals(const Color(0xFF6A1B9A)));
    });

    test('staff: bg=#E8F5E9, fg=#1B5E20', () {
      expect(AdminCategoryColors.staff.bg, equals(const Color(0xFFE8F5E9)));
      expect(AdminCategoryColors.staff.fg, equals(const Color(0xFF1B5E20)));
    });

    test('settings: bg=#EFEBE9, fg=#3E2723', () {
      expect(AdminCategoryColors.settings.bg, equals(const Color(0xFFEFEBE9)));
      expect(AdminCategoryColors.settings.fg, equals(const Color(0xFF3E2723)));
    });
  });

  group('HomeButtonGreyTheme', () {
    test('bg, fg, borderColor が定義されている', () {
      expect(HomeButtonGreyTheme.bg, isA<Color>());
      expect(HomeButtonGreyTheme.fg, isA<Color>());
      expect(HomeButtonGreyTheme.borderColor, isA<Color>());
    });

    test('bg は白に近いグレー（輝度が高い）', () {
      final bg = HomeButtonGreyTheme.bg;
      final hsl = HSLColor.fromColor(bg);
      // lightness が 0.8 以上であることで「白に近い」を確認
      expect(hsl.lightness, greaterThanOrEqualTo(0.8));
    });

    test('fg は暗めのグレー（輝度が低い）', () {
      final fg = HomeButtonGreyTheme.fg;
      final hsl = HSLColor.fromColor(fg);
      expect(hsl.lightness, lessThan(0.8));
    });
  });

  group('HomeBtnDef', () {
    test('destination ありの通常ボタンが作れる', () {
      final btn = HomeBtnDef(
        label: 'テスト',
        icon: Icons.star,
        destination: const SizedBox(),
      );
      expect(btn.label, equals('テスト'));
      expect(btn.isStoreManagementDialog, isFalse);
      expect(btn.optionKeys, isNull);
    });

    test('isStoreManagementDialog=true のボタンが作れる', () {
      const btn = HomeBtnDef(
        label: '営業管理',
        icon: Icons.store,
        optionKeys: ['store_management'],
        isStoreManagementDialog: true,
      );
      expect(btn.isStoreManagementDialog, isTrue);
      expect(btn.destination, isNull);
    });

    test('optionKeys=null は常にアクティブ扱い（直接確認はできないが型が正しい）', () {
      const btn = HomeBtnDef(
        label: 'テスト',
        icon: Icons.star,
        isStoreManagementDialog: true,
      );
      expect(btn.optionKeys, isNull);
    });
  });
}
