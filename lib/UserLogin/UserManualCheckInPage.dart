import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:amuse_app_template/HomeBackAction.dart';
import 'package:amuse_app_template/UserLogin/userCheckInPage.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';


class UserManualCheckInPage extends StatefulWidget {
  const UserManualCheckInPage({super.key});

  @override
  State<UserManualCheckInPage> createState() => _UserManualCheckInPageState();
}

class _UserManualCheckInPageState extends State<UserManualCheckInPage> {
  final GlobalKey<ScaffoldMessengerState> _scaffoldKey = GlobalKey<ScaffoldMessengerState>();
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _loginIdController = TextEditingController();
  final TextEditingController _pinController = TextEditingController();
  bool _isLoading = false;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  void _showSnackbar(BuildContext context, String message) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    });
  }

  // When: 手動チェックイン処理時
  // Where: UserManualCheckInPage
  // What: Cloud Functionsを呼び出してログイン処理を実行
  // How: manualCheckIn関数を呼び出し
  Future<void> _loginWithAuthFirst() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);

      try {
        final loginIdInput = _loginIdController.text.trim();
        final pinInput = _pinController.text.trim();

        final callable = _functions.httpsCallable('manualCheckIn');
        final result = await callable.call({
          'loginId': loginIdInput,
          'pin': pinInput,
          'entranceFee': StoreConfigService.instance.latestData?.entranceFee ?? kDefaultEntranceFee,
          'entranceFeeDescription': StoreConfigService.instance.latestData?.entranceFeeDescription ?? kDefaultEntranceFeeDescription,
          'chargeEntranceFeeOnReentry': StoreConfigService.instance.latestData?.chargeEntranceFeeOnReentry ?? kDefaultChargeEntranceFeeOnReentry,
        });

        final response = result.data;
        if (response['success'] == true) {
          final data = response['data'];
          final uid = data['uid'];
          final pokerName = data['pokerName'];
          final message = data['message'] ?? '${pokerName}様のログイン処理が完了しました';

          // ユーザーUIDを保存
          await _saveUserUID(uid);

          setState(() => _isLoading = false);
          
          // userCheckInPage に遷移してダイアログを表示
          if (mounted) {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                builder: (_) => UserCheckInPage(
                  showDialogOnLoad: true,
                  dialogMessage: message,
                  isSuccess: true,
                ),
              ),
            );
          }
        } else {
          final error = response['error'] ?? 'ログイン処理に失敗しました';
          setState(() => _isLoading = false);
          
          // userCheckInPage に遷移してダイアログを表示
          if (mounted) {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(
                builder: (_) => UserCheckInPage(
                  showDialogOnLoad: true,
                  dialogMessage: error,
                  isSuccess: false,
                ),
              ),
            );
          }
        }
      } catch (e) {
        setState(() => _isLoading = false);
        
        // userCheckInPage に遷移してダイアログを表示
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => UserCheckInPage(
                showDialogOnLoad: true,
                dialogMessage: 'ログイン処理に失敗しました: $e',
                isSuccess: false,
              ),
            ),
          );
        }
      }
    }
  }



  Future<void> _saveUserUID(String uid) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('userUID', uid);
    await prefs.setBool('hasLoggedInBefore', true);
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
      key: _scaffoldKey,
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Center(
          child: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.lock, size: 80, color: Colors.blue),
                  const SizedBox(height: 20),
                  const Text(
                    "ログイン",
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: _loginIdController,
                    decoration: const InputDecoration(
                      labelText: "ログインID",
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.person),
                    ),
                    validator: (value) =>
                    value!.isEmpty ? "ログインIDを入力してください" : null,
                  ),
                  const SizedBox(height: 15),
                  TextFormField(
                    controller: _pinController,
                    decoration: const InputDecoration(
                      labelText: "PIN (4桁)",
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.lock),
                    ),
                    keyboardType: TextInputType.number,
                    obscureText: true,
                    validator: (value) =>
                    value!.length != 4 ? "PINは4桁で入力してください" : null,
                  ),
                  const SizedBox(height: 20),
                  _isLoading
                      ? const CircularProgressIndicator()
                      : ElevatedButton(
                    onPressed: _loginWithAuthFirst,
                    child: const Text("ログイン"),
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (context) => const CreateUserAccount()),
                      );
                    },
                    child: const Text("新規登録はこちら"),
                  ),
                ],
              ),
            ),
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
