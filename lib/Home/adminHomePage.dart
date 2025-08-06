import 'package:amuse_app_template/StaffDate/createStaffAccountPage.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';

class AdminHomePage extends StatefulWidget {
  const AdminHomePage({super.key});

  @override
  State<AdminHomePage> createState() => _AdminHomePageState();
}

class _AdminHomePageState extends State<AdminHomePage> {
  bool _isTerminalMode = false;

  void _toggleMode() {
    setState(() {
      _isTerminalMode = !_isTerminalMode;
    });
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final buttonHeight = (screenHeight - kToolbarHeight - 80) / 2.3;

    final List<({String label, Widget destination})> buttons = [
      (label: 'Admin機能 1', destination: const PlaceholderPage(title: 'Admin機能 1')),
      (label: 'Admin機能 2', destination: const PlaceholderPage(title: 'Admin機能 2')),
      (label: 'Admin機能 3', destination: const PlaceholderPage(title: 'Admin機能 3')),
      (label: 'Admin機能 4', destination: const PlaceholderPage(title: 'Admin機能 4')),
      (label: 'Admin機能 5', destination: const PlaceholderPage(title: 'Admin機能 5')),
      (label: 'Staff作成', destination: const CreateStaffAccount()),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        elevation: 4.0,
        title: Text(
          _isTerminalMode ? 'Terminal' : 'Admin',
          style: const TextStyle(fontSize: 30),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: TextButton.icon(
              onPressed: _toggleMode,
              icon: Icon(
                _isTerminalMode ? Icons.switch_left : Icons.switch_right,
                color: Colors.white,
              ),
              label: Text(
                _isTerminalMode ? 'Terminalモード中' : 'Adminモード中',
                style: const TextStyle(color: Colors.white),
              ),
              style: TextButton.styleFrom(
                backgroundColor: _isTerminalMode ? Colors.teal : Colors.deepPurple,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),
        ],
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        child: _isTerminalMode
            ? const terminalHomePage(key: ValueKey('terminal'))
            : GridView.custom(
          key: const ValueKey('admin'),
          padding: const EdgeInsets.all(16),
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
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