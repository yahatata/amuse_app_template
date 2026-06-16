import 'package:amuse_app_template/models/device.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DeviceStatus', () {
    test('retired は archived 相当として読み取る', () {
      expect(DeviceStatus.fromString('retired'), DeviceStatus.archived);
      expect(DeviceStatus.fromString('retired').isRemovedFromService, isTrue);
      expect(DeviceStatus.fromString('retired').isVisibleInManagementList, isFalse);
    });

    test('active / blocked は管理一覧に表示する', () {
      expect(DeviceStatus.fromString('active').isVisibleInManagementList, isTrue);
      expect(DeviceStatus.fromString('blocked').isVisibleInManagementList, isTrue);
      expect(DeviceStatus.fromString('archived').isVisibleInManagementList, isFalse);
    });
  });
}
