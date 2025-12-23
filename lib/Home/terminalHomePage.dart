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
import 'package:flutter/material.dart';

class terminalHomePage extends StatefulWidget {
  const terminalHomePage({super.key});

  @override
  State<terminalHomePage> createState() => _terminalHomePageState();
}

class _terminalHomePageState extends State<terminalHomePage> {
  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final buttonHeight = (screenHeight - kToolbarHeight - 80) / 2.3;

    final List<({String label, Widget destination})> buttons = [
      (label: 'ユーザー作成', destination: const CreateUserAccount()),
      (label: 'ユーザーログイン', destination: const UserCheckInPage()),
      (label: 'メニュー追加', destination: const MenuEditorListPage()),
      (label: '注文画面', destination: const CategorySelectPage()),
      (label: '入店中user一覧', destination: const StayingUsersListPage()),
      (label: 'Tournament 作成', destination: const TournamentCreationMenuPage()),
      (label: 'Tournament Home', destination: const ScheduledTournamentListPage()),
      (label: 'sideGame', destination: const SideGameTableListPage()),
      (label: '注文管理', destination: const OrderManagementPage()),
      (label: 'スタッフ打刻', destination: const StaffAttendancePage()),
      (label: '会計管理', destination: const AccountingPage()),
      (label: '売上ダッシュボード', destination: const DashboardHomePage()),
      (label: '支払い分割テスト', destination: const PaymentSplitTestPage()),
      (label: 'Firestoreサイズ計算', destination: const FirestoreSizePage()),
      // テスト用: 会計後調整画面への遷移ボタン
      (label: '会計後調整（テスト）', destination: const PostAccountingAdjustmentsPage()),
    ];

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
      body: GridView.custom(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(), // スクロール可能に変更
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 5,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          mainAxisExtent: buttonHeight,
        ),
        childrenDelegate: SliverChildListDelegate.fixed(
          buttons.map((btn) {
            return ElevatedButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => btn.destination),
                );
              },
              child: Text(btn.label, textAlign: TextAlign.center),
            );
          }).toList(),
        ),
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
