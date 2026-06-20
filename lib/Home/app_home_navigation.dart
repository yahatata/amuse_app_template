import 'package:flutter/material.dart';
import 'package:amuse_app_template/Home/adminHomePage.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/tableDevice/pages/table_device_home_page.dart';

/// admin 端末は [AdminHomePage]（切り替えボタン付き）、それ以外は [terminalHomePage] へ戻す。
Future<void> navigateToAppHome(
  BuildContext context, {
  bool adminInitialTerminalMode = false,
}) async {
  final device = await DeviceService().getCurrentDevice();
  if (!context.mounted) return;

  final isAdminDevice = device?.role == 'admin';
  Navigator.of(context).pushAndRemoveUntil(
    MaterialPageRoute<void>(
      builder: (_) => isAdminDevice
          ? AdminHomePage(initialTerminalMode: adminInitialTerminalMode)
          : device?.role == 'table'
          ? const TableDedicatedHomePage()
          : const terminalHomePage(),
    ),
    (route) => false,
  );
}
