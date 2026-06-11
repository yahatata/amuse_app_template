import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
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
  final FirebaseFunctions _functions = FunctionsClient.instance;

  Future<void> _showManualCheckInErrorDialog(String message) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.error, color: Colors.red),
            SizedBox(width: 8),
            Text(
              'ログイン失敗',
              style: TextStyle(
                color: Colors.red,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
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
          final billId = data['billId']?.toString();
          final message = data['message'] ?? '$pokerName様のログイン処理が完了しました';
          final okibakeLoginPromptRaw = response['okibakeLoginPrompt'];
          final okibakeLoginPrompt = okibakeLoginPromptRaw is Map
              ? OkibakeLoginPromptData.fromMap(okibakeLoginPromptRaw)
              : null;

          await _saveUserUID(uid);

          if (!mounted) return;
          setState(() => _isLoading = false);
          Navigator.pop(
            context,
            UserCheckInResult(
              success: true,
              message: message,
              userId: uid?.toString(),
              billId: billId,
              okibakeLoginPrompt: okibakeLoginPrompt,
            ),
          );
        } else {
          final error = response['error'] ?? 'ログイン処理に失敗しました';
          if (!mounted) return;
          setState(() => _isLoading = false);
          await _showManualCheckInErrorDialog(error);
        }
      } catch (e) {
        if (!mounted) return;
        setState(() => _isLoading = false);
        await _showManualCheckInErrorDialog('ログイン処理に失敗しました: $e');
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
    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          Scaffold(
            appBar: AppBar(
              title: const Text('ユーザーログイン'),
              centerTitle: true,
              actions: [
                buildHomeButton(context, enabled: !_isLoading),
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
                          readOnly: _isLoading,
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
                          readOnly: _isLoading,
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
                        ElevatedButton(
                          onPressed: _isLoading ? null : _loginWithAuthFirst,
                          child: const Text("ログイン"),
                        ),
                        TextButton(
                          onPressed: _isLoading
                              ? null
                              : () {
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (context) => const CreateUserAccount(),
                                    ),
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
          ),
          if (_isLoading)
            Positioned.fill(
              child: AbsorbPointer(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.35),
                  child: const Center(
                    child: CircularProgressIndicator(),
                  ),
                ),
              ),
            ),
        ],
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
