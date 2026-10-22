// G1: ホームレイアウト計算ユニットテスト
//
// テスト対象: HomeLayoutConst の calcBtnW / calcTerminalBtnH / calcAdminBtnH
// Firebase依存なし。純粋な計算ロジックのみ。

import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/theme/home_button_theme.dart';

void main() {
  group('HomeLayoutConst - calcBtnW', () {
    test('Terminal 6スロット: availW=1000 のとき', () {
      // btnW = (1000 - 14*2 - (4*10 + 22)) / 6 = (1000 - 28 - 62) / 6 = 910/6
      final result = HomeLayoutConst.calcBtnW(1000, numSlots: 6);
      expect(result, closeTo(910 / 6, 0.01));
    });

    test('Terminal 6スロット: availW=900 のとき', () {
      final result = HomeLayoutConst.calcBtnW(900, numSlots: 6);
      expect(result, closeTo((900 - 28 - 62) / 6, 0.01));
    });

    test('Admin 5スロット: availW=1000 のとき', () {
      // btnW = (1000 - 28 - (3*10 + 22)) / 5 = (1000 - 28 - 52) / 5 = 920/5
      final result = HomeLayoutConst.calcBtnW(1000, numSlots: 5);
      expect(result, closeTo(920 / 5, 0.01));
    });

    test('Admin 5スロット: 小さいスクリーン availW=700', () {
      final result = HomeLayoutConst.calcBtnW(700, numSlots: 5);
      expect(result, closeTo((700 - 28 - 52) / 5, 0.01));
    });

    test('btnW は正数である', () {
      final result = HomeLayoutConst.calcBtnW(800, numSlots: 6);
      expect(result, greaterThan(0));
    });
  });

  group('HomeLayoutConst - calcTerminalBtnH（3行）', () {
    test('availH=600 のとき', () {
      // fixed = 10*2 + 3*(18+6) + 2*16 = 20 + 72 + 32 = 124
      // btnH = (600 - 124) / 3 = 476/3
      final result = HomeLayoutConst.calcTerminalBtnH(600);
      expect(result, closeTo(476 / 3, 0.01));
    });

    test('availH=700 のとき', () {
      final result = HomeLayoutConst.calcTerminalBtnH(700);
      expect(result, closeTo((700 - 124) / 3, 0.01));
    });

    test('Redmi Pad SE 相当 availH=560 のとき 48pt以上であること', () {
      final result = HomeLayoutConst.calcTerminalBtnH(560);
      // raw = (560 - 124) / 3 = 436/3 ≈ 145.3 → clamp不要
      expect(result, greaterThanOrEqualTo(48.0));
      expect(result, closeTo((560 - 124) / 3, 0.01));
    });

    test('非常に小さいavailH でも clamp により 48pt以上', () {
      // clamp(48.0, ∞) の確認
      final result = HomeLayoutConst.calcTerminalBtnH(150);
      expect(result, equals(48.0));
    });

    test('btnH は正数', () {
      expect(HomeLayoutConst.calcTerminalBtnH(500), greaterThan(0));
    });
  });

  group('HomeLayoutConst - calcAdminBtnH（2行 + 正方形上限）', () {
    test('btnH は btnW を超えない（正方形上限）', () {
      // availH=600, btnW=184 → rawH=(600-84)/2=258 → min(258,184)=184
      final r = HomeLayoutConst.calcAdminBtnH(600, 184);
      expect(r.btnH, closeTo(184.0, 0.01));
    });

    test('btnW より rawBtnH が小さければ rawBtnH がそのまま使われる', () {
      // availH=300, btnW=200 → rawH=(300-84)/2=108 → min(108,200)=108
      final r = HomeLayoutConst.calcAdminBtnH(300, 200);
      expect(r.btnH, closeTo(108.0, 0.01));
    });

    test('extraVPad: contentH < availH のとき 正の値', () {
      final r = HomeLayoutConst.calcAdminBtnH(600, 184);
      // contentH = 84 + 2*184 = 452 → extraVPad = (600-452)/2 = 74
      expect(r.extraVPad, closeTo(74.0, 0.01));
    });

    test('extraVPad: contentH >= availH のとき 0', () {
      // availH=200, btnW=50 → rawH=(200-84)/2=58 → btnH=50（正方形）
      // contentH = 84 + 2*50 = 184 < 200 → extraVPad=(200-184)/2=8
      final r = HomeLayoutConst.calcAdminBtnH(200, 50);
      expect(r.extraVPad, greaterThanOrEqualTo(0));
    });

    test('clamp: rawBtnH が 48 を下回る場合は 48', () {
      // availH=100, btnW=200 → rawH=(100-84)/2=8 → max(8,48)=48
      final r = HomeLayoutConst.calcAdminBtnH(100, 200);
      expect(r.btnH, equals(48.0));
    });
  });

  group('レイアウト定数の値確認', () {
    test('terminalSlots=6, adminSlots=5', () {
      expect(HomeLayoutConst.terminalSlots, equals(6));
      expect(HomeLayoutConst.adminSlots, equals(5));
    });

    test('terminalHGap = 62.0', () {
      // (6-2)*10 + 22 = 62
      expect(HomeLayoutConst.terminalHGap, closeTo(62.0, 0.01));
    });

    test('adminHGap = 52.0', () {
      // (5-2)*10 + 22 = 52
      expect(HomeLayoutConst.adminHGap, closeTo(52.0, 0.01));
    });
  });
}
