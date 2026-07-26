import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/tournament/ranking_reward_point_candidates.dart';
import 'package:flutter_test/flutter_test.dart';

StoreConfigData configWith({
  Map<String, dynamic>? pointSettings,
  Map<String, dynamic>? sideGameChipSettings,
  Object? rankingRewardPointTypes,
}) {
  return StoreConfigData(
    pointSettings: pointSettings ??
        {
          'pointA': {'enabled': true, 'displayName': 'A'},
          'pointB': {'enabled': true, 'displayName': 'B'},
          'pointC': {'enabled': false, 'displayName': 'C'},
          'pointD': {'enabled': false, 'displayName': 'D'},
          'pointE': {'enabled': false, 'displayName': 'E'},
        },
    sideGameChipSettings: sideGameChipSettings ??
        {
          'enabled': true,
          'displayName': 'Chip',
        },
    rankingRewardPointTypes: rankingRewardPointTypes ?? ['pointA', 'pointB'],
  );
}

void main() {
  test('候補は rankingReward ∩ enabled のみで sideGameChip を含まない', () {
    final candidates = rankingRewardPointCandidates(
      configWith(
        rankingRewardPointTypes: ['pointA', 'pointB', 'pointC', 'sideGameChip'],
      ),
    );
    expect(candidates.map((c) => c.id).toList(), ['pointA', 'pointB']);
    expect(candidates.any((c) => c.id == 'sideGameChip'), isFalse);
  });

  test('disabled chip は isSideGameChipEnabled=false', () {
    expect(
      isSideGameChipEnabled(
        configWith(sideGameChipSettings: {
          'enabled': false,
          'displayName': 'Chip',
        }),
      ),
      isFalse,
    );
    expect(isSideGameChipEnabled(configWith()), isTrue);
  });
}
