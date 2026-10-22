import 'package:flutter/material.dart';

import 'package:amuse_app_template/tableDevice/pages/table_device_home_page.dart';
import 'package:amuse_app_template/tableDevice/widgets/table_device_drawer.dart';
import 'package:amuse_app_template/tournament/active/pages/table_detail_page.dart';

class TableDeviceTableDetailPage extends StatelessWidget {
  const TableDeviceTableDetailPage({
    super.key,
    required this.tournamentId,
    required this.tableId,
  });

  final String tournamentId;
  final String tableId;

  @override
  Widget build(BuildContext context) {
    return TableDetailPage(
      tournamentId: tournamentId,
      tableId: tableId,
      drawer: TableDeviceDrawer(tableId: tableId),
      disableBackNavigation: true,
      automaticallyImplyLeading: false,
      onNavigateHomeFromStrongWarning: () {
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
