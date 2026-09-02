import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String pageSrc;
  late String roleSrc;
  late String statusSrc;
  late String archiveSrc;

  setUpAll(() {
    pageSrc = File('lib/pages/device_management_page.dart').readAsStringSync();
    roleSrc = File(
      'functions/src/shared/devices/callables/updateDeviceRole.ts',
    ).readAsStringSync();
    statusSrc = File(
      'functions/src/shared/devices/callables/updateDeviceStatus.ts',
    ).readAsStringSync();
    archiveSrc = File(
      'functions/src/shared/devices/callables/archiveDevice.ts',
    ).readAsStringSync();
  });

  group('CLN-G3 last-admin protection wiring', () {
    test('UI は self 危険操作を隠し、last-admin 判定は Functions 正本', () {
      expect(
        pageSrc.contains('最後の active admin 保護は Functions 側が正本'),
        isTrue,
      );
      expect(
        pageSrc.contains('// role変更（自分自身は変更不可。最後のadmin判定はFunctions側）'),
        isTrue,
      );
      expect(pageSrc.contains('if (!isCurrentDevice)'), isTrue);
      expect(pageSrc.contains('activeAdminCount'), isFalse);
      expect(pageSrc.contains('countActiveAdmin'), isFalse);
      expect(pageSrc.contains('isLastAdmin'), isFalse);
    });

    test('self 保護と last-admin 保護を UI 側で同一条件にしていない', () {
      expect(
        pageSrc.contains("if (device.status == 'active' && !isCurrentDevice)"),
        isTrue,
      );
      expect(pageSrc.contains('_deleteDevice(device)'), isTrue);
      expect(pageSrc.contains('_updateDeviceRole'), isTrue);
      expect(pageSrc.contains('_updateDeviceStatus'), isTrue);
    });

    test('backend は role / block / archive で last-admin を拒否する', () {
      expect(roleSrc.contains('assertNotRemovingLastActiveAdmin'), isTrue);
      expect(roleSrc.contains('最後の管理者端末のロールは変更できません'), isTrue);
      expect(statusSrc.contains('assertNotRemovingLastActiveAdmin'), isTrue);
      expect(statusSrc.contains('最後の管理者端末はブロックできません'), isTrue);
      expect(archiveSrc.contains('assertNotRemovingLastActiveAdmin'), isTrue);
      expect(archiveSrc.contains('最後の管理者端末は削除できません'), isTrue);
    });
  });
}
