import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user/balance_display.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('enabledBalanceIdsFromStoreConfig は有効分のみ', () {
    final config = StoreConfigData(
      pointSettings: {
        'pointA': {'enabled': true, 'displayName': 'トーナメントポイント'},
        'pointB': {'enabled': false, 'displayName': 'B'},
        'pointC': {'enabled': true, 'displayName': 'C'},
        'pointD': {'enabled': false, 'displayName': 'D'},
        'pointE': {'enabled': false, 'displayName': 'E'},
      },
      sideGameChipSettings: {
        'enabled': true,
        'displayName': 'サイドゲームチップ',
      },
    );
    expect(enabledBalanceIdsFromStoreConfig(config), [
      'pointA',
      'pointC',
      'sideGameChip',
    ]);
    expect(balanceDisplayName('pointA', config), 'トーナメントポイント');
    expect(balanceDisplayName('sideGameChip', config), 'サイドゲームチップ');
  });

  test('chip disabled なら候補から外れる', () {
    final config = StoreConfigData(
      pointSettings: {
        'pointA': {'enabled': true, 'displayName': 'A'},
        'pointB': {'enabled': true, 'displayName': 'B'},
        'pointC': {'enabled': false, 'displayName': 'C'},
        'pointD': {'enabled': false, 'displayName': 'D'},
        'pointE': {'enabled': false, 'displayName': 'E'},
      },
      sideGameChipSettings: {
        'enabled': false,
        'displayName': 'Chip',
      },
    );
    expect(enabledBalanceIdsFromStoreConfig(config), ['pointA', 'pointB']);
  });
}
