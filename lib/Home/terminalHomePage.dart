import 'package:amuse_app_template/OrderView/MenuView/createMenuPage.dart';
import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:amuse_app_template/UserRegisterView/userCheckInPage.dart';
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
      (label: 'Terminal機能 3', destination: const CreateMenuPage()),
      (label: 'Terminal機能 4', destination: const PlaceholderPage(title: 'Terminal機能 4')),
      (label: 'Terminal機能 5', destination: const PlaceholderPage(title: 'Terminal機能 5')),
      (label: 'Terminal機能 6', destination: const PlaceholderPage(title: 'Terminal機能 6')),
      (label: 'Terminal機能 7', destination: const PlaceholderPage(title: 'Terminal機能 7')),
      (label: 'Terminal機能 8', destination: const PlaceholderPage(title: 'Terminal機能 8')),
      (label: 'Terminal機能 9', destination: const PlaceholderPage(title: 'Terminal機能 9')),
      (label: 'Terminal機能 10', destination: const PlaceholderPage(title: 'Terminal機能 10')),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Terminal ホーム'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('設定は未実装です')),
              );
            },
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
