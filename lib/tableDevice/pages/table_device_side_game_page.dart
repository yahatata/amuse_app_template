import 'package:flutter/material.dart';

import 'package:amuse_app_template/sideGame/pages/side_game_table_home.dart';
import 'package:amuse_app_template/tableDevice/pages/table_device_home_page.dart';
import 'package:amuse_app_template/tableDevice/widgets/table_device_drawer.dart';

class TableDeviceSideGamePage extends StatelessWidget {
  const TableDeviceSideGamePage({
    super.key,
    required this.tableId,
    required this.gameName,
  });

  final String tableId;
  final String gameName;

  @override
  Widget build(BuildContext context) {
    return SideGameTableHomePage(
      tableId: tableId,
      gameName: gameName,
      drawer: TableDeviceDrawer(tableId: tableId),
      disableBackNavigation: true,
      automaticallyImplyLeading: false,
      showDebugActions: false,
      showEndGameButton: false,
      onGameEnded: () {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(
            builder: (_) => TableDedicatedHomePage(tableId: tableId),
          ),
          (route) => false,
        );
      },
    );
  }
}
