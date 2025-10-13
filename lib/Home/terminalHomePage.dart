import 'package:amuse_app_template/Home/stayingUsersListPage.dart';
import 'package:amuse_app_template/AttendanceManagement/staffAttendancePage.dart';
import 'package:amuse_app_template/OrderView/MenuView/categorySelectPage.dart';
import 'package:amuse_app_template/OrderView/MenuView/menuEditorListPage.dart';
import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:amuse_app_template/UserLogin/userCheckInPage.dart';
import 'package:amuse_app_template/tournament/scheduling/pages/scheduled_tournament_list_page.dart';
import 'package:amuse_app_template/Home/systemSettingsPage.dart';
import 'package:amuse_app_template/tournament/scheduling/pages/tournament_creation_menu_page.dart';
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
      (label: 'デモ1', destination: const PlaceholderPage(title: 'demo1')),
      (label: 'デモ2', destination: const PlaceholderPage(title: 'demo2')),
      (label: 'スタッフ打刻', destination: const StaffAttendancePage()),
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
        physics: const NeverScrollableScrollPhysics(),
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
