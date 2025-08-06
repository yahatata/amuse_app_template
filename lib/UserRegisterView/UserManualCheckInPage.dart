import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:amuse_app_template/appbarUtils.dart';


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

  void _showSnackbar(BuildContext context, String message) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    });
  }

  void _loginWithAuthFirst() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);

      try {
        String loginIdInput = _loginIdController.text.trim();
        String pinInput = _pinController.text.trim();

        // Cloud Functionを呼び出し
        final callable = FirebaseFunctions.instance.httpsCallable('manualCheckIn');
        final result = await callable.call({
          'loginId': loginIdInput,
          'pin': pinInput,
        });

        final data = result.data;
        
        if (data['success'] == true) {
          // カスタムトークンでFirebaseAuthにサインイン
          await FirebaseAuth.instance.signInWithCustomToken(data['customToken']);
          
          // ユーザーUIDを保存
          await _saveUserUID(data['uid']);

          setState(() => _isLoading = false);
          _showSnackbar(context, data['message']);
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => const PlaceholderPage(title: '仮ホーム')),
          );
        } else {
          throw Exception("ログインに失敗しました");
        }
      } on FirebaseFunctionsException catch (e) {
        setState(() => _isLoading = false);
        _showSnackbar(context, "ログイン失敗: ${e.message ?? '不明なエラー'}");
      } catch (e) {
        setState(() => _isLoading = false);
        _showSnackbar(context, "ログイン失敗: ${e.toString()}");
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
