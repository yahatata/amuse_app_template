import 'package:flutter/material.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';
import 'package:amuse_app_template/tournament/pages/tournament_select_page.dart';
import 'package:amuse_app_template/tournament/pages/table_select_page.dart';
import 'package:amuse_app_template/tournament/active/pages/table_detail_page.dart';

/// 卓ページ用トーナメント選択ページ
/// デバイスに卓番が指定されている場合はその卓が属するトーナメントのみ表示し、
/// トーナメント選択 → 卓選択 → 卓詳細ページへ遷移する
class TableHomePage extends StatefulWidget {
  const TableHomePage({super.key});

  @override
  State<TableHomePage> createState() => _TableHomePageState();
}

class _TableHomePageState extends State<TableHomePage> {
  final DeviceService _deviceService = DeviceService();
  bool _isLoading = true;
  bool _hasTableAssignment = false;

  @override
  void initState() {
    super.initState();
    _loadDeviceInfo();
  }

  Future<void> _loadDeviceInfo() async {
    final device = await _deviceService.getCurrentDevice();
    final myTableId = device?.getTableIdForOption(DeviceOptionKeys.tournamentTable);
    if (mounted) {
      setState(() {
        _hasTableAssignment = myTableId != null;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return TournamentSelectPage(
      title: '卓ページ - トーナメント選択',
      filterByDeviceTable: _hasTableAssignment,
      onSelected: (tournamentId, tournamentName) {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => TableSelectPage(
              tournamentId: tournamentId,
              tournamentName: tournamentName,
              onSelected: (tableId, tableName) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => TableDetailPage(
                      tournamentId: tournamentId,
                      tableId: tableId,
                    ),
                  ),
                );
              },
            ),
          ),
        );
      },
    );
  }
}
