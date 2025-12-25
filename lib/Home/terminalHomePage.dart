import 'package:amuse_app_template/Home/stayingUsersListPage.dart';
import 'package:amuse_app_template/AttendanceManagement/staffAttendancePage.dart';
import 'package:amuse_app_template/OrderView/MenuView/categorySelectPage.dart';
import 'package:amuse_app_template/OrderView/MenuView/menuEditorListPage.dart';
import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:amuse_app_template/UserLogin/userCheckInPage.dart';
import 'package:amuse_app_template/tournament/scheduling/pages/scheduled_tournament_list_page.dart';
import 'package:amuse_app_template/Home/systemSettingsPage.dart';
import 'package:amuse_app_template/tournament/scheduling/pages/tournament_creation_menu_page.dart';
import 'package:amuse_app_template/Accounting/accountingPage.dart';
import 'package:amuse_app_template/Accounting/payment_split_test_page.dart';
import 'package:amuse_app_template/Accounting/postAccountingAdjustmentsPage.dart';
import 'package:amuse_app_template/sideGame/pages/side_game_table_list.dart';
import 'package:amuse_app_template/OrderView/OrderManagement/order_management_page.dart';
import 'package:amuse_app_template/dashboard/home/dashboard_home_page.dart';
import 'package:amuse_app_template/Utils/firestore_size_page.dart';
import 'package:amuse_app_template/tournament/pages/tournament_select_page.dart';
import 'package:amuse_app_template/tournament/pages/table_select_page.dart';
import 'package:amuse_app_template/tournament/active/pages/table_detail_page.dart';
import 'package:amuse_app_template/tournament/active/pages/blind_timer_page.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';

class terminalHomePage extends StatefulWidget {
  const terminalHomePage({super.key});

  @override
  State<terminalHomePage> createState() => _terminalHomePageState();
}

class _terminalHomePageState extends State<terminalHomePage> {
  final DeviceService _deviceService = DeviceService();
  bool _loadingDevice = true;
  bool _isAdminDevice = false;
  Map<String, bool> _deviceOptions = const {};

  @override
  void initState() {
    super.initState();
    _initDevice();
  }

  Future<void> _initDevice() async {
    final device = await _deviceService.getCurrentDevice();
    if (!mounted) return;
    setState(() {
      _loadingDevice = false;
      _isAdminDevice = (device?.role == 'admin');
      _deviceOptions = device?.options ?? const {};
    });
  }

  /// 卓ページへの遷移（トーナメント選択→卓選択→卓詳細ページ）
  Future<void> _navigateToTablePage(BuildContext context) async {
    // デバイスに卓番が指定されているか確認
    final device = await _deviceService.getCurrentDevice();
    final myTableId = device?.getTableIdForOption(DeviceOptionKeys.tournamentTable);
    final hasTableAssignment = myTableId != null;

    if (!context.mounted) return;

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TournamentSelectPage(
          title: '卓ページ - トーナメント選択',
          filterByDeviceTable: hasTableAssignment, // 卓番指定がある場合のみフィルタ
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
        ),
      ),
    );
  }

  /// ブラインドタイマーへの遷移（トーナメント選択→タイマーページ）
  void _navigateToBlindTimer(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TournamentSelectPage(
          title: 'ブラインドタイマー - トーナメント選択',
          onSelected: (tournamentId, tournamentName) {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => BlindTimerPage(
                  tournamentId: tournamentId,
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final buttonHeight = (screenHeight - kToolbarHeight - 80) / 2.3;

    // 通常のボタン（直接遷移）
    final List<({String label, Widget destination, String? optionKey})> buttons = [
      (label: 'ユーザー作成', destination: const CreateUserAccount(), optionKey: null),
      (label: 'ユーザーログイン', destination: const UserCheckInPage(), optionKey: DeviceOptionKeys.userEntryExit),
      (label: 'メニュー追加', destination: const MenuEditorListPage(), optionKey: null),
      (label: '注文画面', destination: const CategorySelectPage(), optionKey: DeviceOptionKeys.order),
      (label: '入店中user一覧', destination: const StayingUsersListPage(), optionKey: null),
      (label: 'Tournament 作成', destination: const TournamentCreationMenuPage(), optionKey: DeviceOptionKeys.tournament),
      (label: 'Tournament Home', destination: const ScheduledTournamentListPage(), optionKey: DeviceOptionKeys.tournament),
      (label: 'sideGame', destination: const SideGameTableListPage(), optionKey: DeviceOptionKeys.sideGame),
      (label: '注文管理', destination: const OrderManagementPage(), optionKey: DeviceOptionKeys.kitchen),
      (label: 'スタッフ打刻', destination: const StaffAttendancePage(), optionKey: DeviceOptionKeys.staffEntryExit),
      (label: '会計管理', destination: const AccountingPage(), optionKey: DeviceOptionKeys.accounting),
      (label: '売上ダッシュボード', destination: const DashboardHomePage(), optionKey: null),
      (label: '支払い分割テスト', destination: const PaymentSplitTestPage(), optionKey: null),
      (label: 'Firestoreサイズ計算', destination: const FirestoreSizePage(), optionKey: null),
      // テスト用: 会計後調整画面への遷移ボタン
      (label: '会計後調整（テスト）', destination: const PostAccountingAdjustmentsPage(), optionKey: null),
    ];

    final visibleButtons = buttons.where((btn) {
      // 管理者端末は全表示
      if (_isAdminDevice) return true;
      // オプションがまだ付与されていない（空）場合は従来通り全表示
      if (_deviceOptions.isEmpty) return true;
      // オプションキーが無いボタンは常に表示（一般系）
      if (btn.optionKey == null) return true;
      // 付与済みオプションのみ表示
      return _deviceOptions[btn.optionKey!] == true;
    }).toList();

    // 特殊ボタン（ダイアログ経由で遷移）
    final showTablePageButton = _isAdminDevice ||
        _deviceOptions.isEmpty ||
        _deviceOptions[DeviceOptionKeys.tournament] == true ||
        _deviceOptions[DeviceOptionKeys.tournamentTable] == true;

    final showBlindTimerButton = _isAdminDevice ||
        _deviceOptions.isEmpty ||
        _deviceOptions[DeviceOptionKeys.tournament] == true;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Terminal ホーム'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const SystemSettingsPage(),
                ),
              );
            },
            tooltip: 'システム設定',
          ),
        ],
      ),
      body: _loadingDevice
          ? const Center(child: CircularProgressIndicator())
          : GridView.custom(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(), // スクロール可能に変更
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 5,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          mainAxisExtent: buttonHeight,
        ),
        childrenDelegate: SliverChildListDelegate.fixed([
          // 通常ボタン
          ...visibleButtons.map((btn) {
            return ElevatedButton(
              onPressed: () async {
                // オプションチェック（optionKeyが指定されている場合のみ）
                if (btn.optionKey != null) {
                  final ok = await _deviceService.hasOption(btn.optionKey!);
                  if (!ok) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('権限がありません: ${DeviceOptionKeys.label(btn.optionKey!)}'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                    return;
                  }
                }
                if (context.mounted) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => btn.destination),
                  );
                }
              },
              child: Text(btn.label, textAlign: TextAlign.center),
            );
          }),
          // 卓ページボタン
          if (showTablePageButton)
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal,
                foregroundColor: Colors.white,
              ),
              onPressed: () => _navigateToTablePage(context),
              child: const Text('卓ページ', textAlign: TextAlign.center),
            ),
          // ブラインドタイマーボタン
          if (showBlindTimerButton)
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepPurple,
                foregroundColor: Colors.white,
              ),
              onPressed: () => _navigateToBlindTimer(context),
              child: const Text('ブラインドタイマー', textAlign: TextAlign.center),
            ),
        ]),
      ),
    );
  }
}

class PlaceholderPage extends StatelessWidget {
  final String title;

  const PlaceholderPage({super.key, required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title の遷移先（未実装）')),
    );
  }
}
