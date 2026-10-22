import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/utils/available_tables_filter.dart';

void main() {
  group('activeRegisteredTableIdsFromTablesSeat', () {
    test('isEnabled: true の卓は登録済みとして除外する', () {
      final ids = activeRegisteredTableIdsFromTablesSeat([
        const MapEntry('table_a', {'isEnabled': true}),
      ]);
      expect(ids, {'table_a'});
    });

    test('isEnabled: false の卓は論理削除扱いで除外しない', () {
      final ids = activeRegisteredTableIdsFromTablesSeat([
        const MapEntry('table_a', {'isEnabled': false}),
      ]);
      expect(ids, isEmpty);
    });

    test('isEnabled 未設定は登録済みとして除外する', () {
      final ids = activeRegisteredTableIdsFromTablesSeat([
        const MapEntry('table_a', {}),
      ]);
      expect(ids, {'table_a'});
    });

    test('waiting / busted は対象外', () {
      final ids = activeRegisteredTableIdsFromTablesSeat([
        const MapEntry('waiting', {'isEnabled': true}),
        const MapEntry('busted', {'isEnabled': true}),
        const MapEntry('table_a', {'isEnabled': true}),
      ]);
      expect(ids, {'table_a'});
    });
  });
}
