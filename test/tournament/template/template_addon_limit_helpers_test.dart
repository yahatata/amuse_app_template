import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('resolveAddonLimitPerPlayerUi', () {
    test('isAddon false は 0', () {
      expect(resolveAddonLimitPerPlayerUi(isAddon: false), 0);
      expect(resolveAddonLimitPerPlayerUi(isAddon: false, addonLimitPerPlayer: 99), 0);
    });

    test('true + 欠損 → 1', () {
      expect(resolveAddonLimitPerPlayerUi(isAddon: true), 1);
    });

    test('true + 正の整数 → その値', () {
      expect(resolveAddonLimitPerPlayerUi(isAddon: true, addonLimitPerPlayer: 1), 1);
      expect(resolveAddonLimitPerPlayerUi(isAddon: true, addonLimitPerPlayer: 3), 3);
      expect(resolveAddonLimitPerPlayerUi(isAddon: true, addonLimitPerPlayer: 2.0), 2);
    });

    test('true + 不正 → 1', () {
      expect(resolveAddonLimitPerPlayerUi(isAddon: true, addonLimitPerPlayer: 0), 1);
      expect(resolveAddonLimitPerPlayerUi(isAddon: true, addonLimitPerPlayer: -2), 1);
      expect(resolveAddonLimitPerPlayerUi(isAddon: true, addonLimitPerPlayer: 2.5), 1);
      expect(resolveAddonLimitPerPlayerUi(isAddon: true, addonLimitPerPlayer: 'x'), 1);
    });
  });
}
