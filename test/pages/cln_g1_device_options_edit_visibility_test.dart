import 'dart:io';

import 'package:amuse_app_template/pages/device_management_action_visibility.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CLN-G1 options-edit visibility', () {
    test('self / other Admin role hides オプション編集', () {
      expect(shouldShowOptionsEditButton('admin'), isFalse);
    });

    test('other Terminal still shows オプション編集', () {
      expect(shouldShowOptionsEditButton('terminal'), isTrue);
    });

    test('table role shows 卓紐付け編集, not オプション編集', () {
      expect(shouldShowOptionsEditButton('table'), isFalse);
      expect(shouldShowTableBindingEditButton('table'), isTrue);
      expect(shouldShowTableBindingEditButton('admin'), isFalse);
      expect(shouldShowTableBindingEditButton('terminal'), isFalse);
    });
  });

  group('CLN-G1 wiring / non-regression', () {
    final pageSrc =
        File('lib/pages/device_management_page.dart').readAsStringSync();
    final serviceSrc =
        File('lib/services/device_service.dart').readAsStringSync();

    test('page uses visibility helpers and does not always emit オプション編集', () {
      expect(
        pageSrc.contains('shouldShowOptionsEditButton(device.role)'),
        isTrue,
      );
      expect(
        pageSrc.contains('shouldShowTableBindingEditButton(device.role)'),
        isTrue,
      );
      expect(pageSrc.contains("label: const Text('オプション編集')"), isTrue);
      expect(pageSrc.contains("label: const Text('卓紐付け編集')"), isTrue);
    });

    test('self device still hides role / status / archive', () {
      expect(pageSrc.contains('if (!isCurrentDevice)'), isTrue);
      expect(
        pageSrc.contains('// role変更（自分自身は変更不可。最後のadmin判定はFunctions側）'),
        isTrue,
      );
      expect(
        pageSrc.contains("if (device.status == 'active' && !isCurrentDevice)"),
        isTrue,
      );
      expect(
        pageSrc.contains("if (device.status == 'blocked' && !isCurrentDevice)"),
        isTrue,
      );
      expect(pageSrc.contains('if (!isCurrentDevice)'), isTrue);
      expect(pageSrc.contains('_deleteDevice(device)'), isTrue);
    });

    test('options save / read logic is unchanged', () {
      expect(serviceSrc.contains('Future<Map<String, bool>> updateDeviceOptions'), isTrue);
      expect(
        serviceSrc.contains("httpsCallable('updateDeviceOptions')"),
        isTrue,
      );
      expect(
        serviceSrc.contains('if (adminBypass && device.role == \'admin\') return true;'),
        isTrue,
      );
      expect(
        serviceSrc.contains('return device.options[optionKey] == true;'),
        isTrue,
      );
    });
  });
}
