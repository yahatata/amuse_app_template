import 'package:amuse_app_template/UserRegisterView/UserManualCheckInPage.dart';
import 'package:amuse_app_template/UserRegisterView/userQRCheckInPage.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/appbarUtils.dart';

class UserCheckInPage extends StatelessWidget {
  const UserCheckInPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: defaultStyledAppBar(
        title: const Text('ユーザーログイン'),
        centerTitle: true,
        actions: [
          buildHomeButton(context), // ← 追加
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ElevatedButton.icon(
                icon: const Icon(Icons.qr_code),
                label: const Text('QRチェックイン'),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 50),
                  textStyle: const TextStyle(fontSize: 18),
                ),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const UserQRCheckInPage()),
                  );
                },
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                icon: const Icon(Icons.edit),
                label: const Text('手動チェックイン'),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 50),
                  textStyle: const TextStyle(fontSize: 18),
                ),
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const UserManualCheckInPage()),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
