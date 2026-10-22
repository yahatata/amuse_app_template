import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/models/device.dart';
import 'package:amuse_app_template/services/device_options.dart';

void main() {
  group('table device basics', () {
    test('DeviceRole.fromString で table を解釈できる', () {
      expect(DeviceRole.fromString('table'), DeviceRole.table);
    });

    test('table_device_table から卓IDを取得できる', () {
      final device = Device(
        id: 'device-1',
        name: 'Table Device',
        role: 'table',
        uid: 'uid-1',
        installationId: 'installation-1',
        platform: 'ios',
        createdAt: DateTime(2026, 6, 18),
        updatedAt: DateTime(2026, 6, 18),
        status: 'active',
        optionParams: const {
          DeviceOptionKeys.tableDeviceTable: {
            'tableId': 'TableA',
          },
        },
      );

      expect(
        device.getTableIdForOption(DeviceOptionKeys.tableDeviceTable),
        'TableA',
      );
    });
  });
}
