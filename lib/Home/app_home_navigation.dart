import 'package:flutter/material.dart';
import 'package:amuse_app_template/Home/adminHomePage.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/Home/terminal_mode_state.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/tableDevice/pages/table_device_home_page.dart';

/// admin 端末は [AdminHomePage]（切り替えボタン付き）、それ以外は [terminalHomePage] へ戻す。
///
/// [adminInitialTerminalMode] が明示されている場合はその値を優先する。
/// 未指定時は [terminalModeNotifier] の現在値を使い、Terminal モード中の Home 戻りを維持する。
Future<void> navigateToAppHome(
  BuildContext context, {
  bool? adminInitialTerminalMode,
}) async {
  final device = await DeviceService().getCurrentDevice();
  if (!context.mounted) return;

  final isAdminDevice = device?.role == 'admin';
  final initialTerminalMode =
      adminInitialTerminalMode ?? terminalModeNotifier.value;
  Navigator.of(context).pushAndRemoveUntil(
    MaterialPageRoute<void>(
      builder: (_) => isAdminDevice
          ? AdminHomePage(initialTerminalMode: initialTerminalMode)
          : device?.role == 'table'
          ? const TableDedicatedHomePage()
          : const terminalHomePage(),
    ),
    (route) => false,
  );
}
