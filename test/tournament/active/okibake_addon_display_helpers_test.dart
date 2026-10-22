import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/widgets/okibake_addon_display_helpers.dart';

void main() {
  group('formatAddonStatusLine / formatOkibakeAddonStatusLine', () {
    test('通常表示', () {
      expect(
        formatAddonStatusLine(addonCount: 0, resolvedAddonLimit: 2),
        'Addon: 現在 0 / 2 回',
      );
      expect(
        formatOkibakeAddonStatusLine(okibakeAddonCount: 1, resolvedAddonLimit: 2),
        'Addon: 現在 1 / 2 回',
      );
    });

    test('上限到達', () {
      expect(
        formatOkibakeAddonStatusLine(okibakeAddonCount: 2, resolvedAddonLimit: 2),
        'Addon: 上限到達 2 / 2 回',
      );
    });

    test('loading', () {
      expect(
        formatAddonStatusLine(
          addonCount: 0,
          resolvedAddonLimit: 2,
          loading: true,
        ),
        'Addon: 可否・上限を確認中です',
      );
    });

    test('無効・未取得', () {
      expect(
        formatOkibakeAddonStatusLine(okibakeAddonCount: 0, resolvedAddonLimit: 0),
        'Addon: 無効',
      );
      expect(
        formatOkibakeAddonStatusLine(okibakeAddonCount: 0, resolvedAddonLimit: -1),
        'Addon: 回数情報を取得できませんでした',
      );
    });
  });

  group('isAddonUiDisabled / isOkibakeAddonUiDisabled', () {
    test('上限到達で disabled', () {
      expect(
        isOkibakeAddonUiDisabled(
          okibakeAddonCount: 2,
          resolvedAddonLimit: 2,
        ),
        true,
      );
    });

    test('addonLimit <= 0 で disabled', () {
      expect(
        isOkibakeAddonUiDisabled(
          okibakeAddonCount: 0,
          resolvedAddonLimit: 0,
        ),
        true,
      );
    });

    test('実行可能', () {
      expect(
        isOkibakeAddonUiDisabled(
          okibakeAddonCount: 0,
          resolvedAddonLimit: 2,
        ),
        false,
      );
    });

    test('countLoadFailed で disabled', () {
      expect(
        isAddonUiDisabled(
          addonCount: 0,
          resolvedAddonLimit: 2,
          countLoadFailed: true,
        ),
        true,
      );
    });
  });
}
