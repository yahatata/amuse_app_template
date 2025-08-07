import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:bcrypt/bcrypt.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:amuse_app_template/HomeBackAction.dart';


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
        String fixedPassword = "YourFixedPassword123";

        QuerySnapshot querySnapshot = await FirebaseFirestore.instance
            .collection('users')
            .where('loginId', isEqualTo: loginIdInput)
            .limit(1)
            .get();

        if (querySnapshot.docs.isNotEmpty) {
          var userDoc = querySnapshot.docs.first;
          String storedHashedPin = userDoc['hashedPin'];
          String? email = userDoc['email'];
          String uid = userDoc['uid'];
          String pokerName = userDoc['pokerName'];

          bool isPinCorrect = BCrypt.checkpw(pinInput, storedHashedPin);
          if (!isPinCorrect) throw Exception("PINが正しくありません");

          if (email != null) {
            UserCredential userCredential = await FirebaseAuth.instance.signInWithEmailAndPassword(
              email: email,
              password: fixedPassword,
            );
            User? user = userCredential.user;

            if (user != null) {
              await updateLastLogin(user);
              await _saveUserUID(uid);
              await FirebaseFirestore.instance.collection('users').doc(uid).update({
                'isStaying': true,
              });


              setState(() => _isLoading = false);
              _showSnackbar(context, "$pokerName様のログイン処理が完了しました");
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (_) => const PlaceholderPage(title: '仮ホーム')),
              );
            } else {
              throw Exception("ログインに失敗しました");
            }
          } else {
            throw Exception("メールアドレスが見つかりません");
          }
        } else {
          throw Exception("ログインIDが見つかりません");
        }
      } on FirebaseAuthException catch (e) {
        setState(() => _isLoading = false);
        _showSnackbar(context, "ログイン失敗: \${e.message ?? '不明なエラー'}");
      } catch (e) {
        setState(() => _isLoading = false);
        _showSnackbar(context, "ログイン失敗: ${e.toString()}");
      }
    }
  }

  Future<void> updateLastLogin(User user) async {
    try {
      await FirebaseFirestore.instance.collection('users').doc(user.uid).update({
        'lastLogin': FieldValue.serverTimestamp(),
      });
    } catch (_) {}
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
