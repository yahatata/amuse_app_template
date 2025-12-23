import 'package:amuse_app_template/UserLogin/UserManualCheckInPage.dart';
import 'package:amuse_app_template/UserRegisterView/userQRCheckInPage.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/HomeBackAction.dart';

class UserCheckInPage extends StatefulWidget {
  final bool showDialogOnLoad;
  final String? dialogMessage;
  final bool? isSuccess;

  const UserCheckInPage({
    super.key,
    this.showDialogOnLoad = false,
    this.dialogMessage,
    this.isSuccess,
  });

  @override
  State<UserCheckInPage> createState() => _UserCheckInPageState();
}

class _UserCheckInPageState extends State<UserCheckInPage> {
  @override
  void initState() {
    super.initState();
    // ダイアログを表示する必要がある場合、画面構築後に表示
    if (widget.showDialogOnLoad && widget.dialogMessage != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showResultDialog();
      });
    }
  }

  void _showResultDialog() {
    if (!mounted) return;
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(
              widget.isSuccess == true ? Icons.check_circle : Icons.error,
              color: widget.isSuccess == true ? Colors.green : Colors.red,
            ),
            const SizedBox(width: 8),
            Text(
              widget.isSuccess == true ? 'ログイン成功' : 'ログイン失敗',
              style: TextStyle(
                color: widget.isSuccess == true ? Colors.green : Colors.red,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        content: Text(widget.dialogMessage ?? ''),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
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
