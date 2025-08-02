import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:flutter/services.dart';
import 'package:amuse_app_template/HomeBackAction.dart';

class CreateStaffAccount extends StatefulWidget {
  const CreateStaffAccount({super.key});

  @override
  State<CreateStaffAccount> createState() => _CreateStaffAccountState();
}

class _CreateStaffAccountState extends State<CreateStaffAccount> {
  final _formKey = GlobalKey<FormState>();
  final _fullNameController = TextEditingController();
  final _fullNameKanaController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneNumberController = TextEditingController();
  final _birthMonthDayController = TextEditingController();

  bool _isLoading = false;

  Future<bool> _isStaffNameTaken(String fullNameKana) async {
    try {
      final callable = FirebaseFunctions.instance.httpsCallable('checkNameExists');
      final result = await callable.call({'staffName': fullNameKana});
      return result.data['exists'] as bool;
    } catch (e) {
      debugPrint("Error checking Name: $e");
      return false;
    }
  }

  Future<void> _signUp() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);

      final fullName = _fullNameController.text.trim();
      final fullNameKana = _fullNameKanaController.text.trim();
      final email = _emailController.text.trim();
      final birthDay = _birthMonthDayController.text.trim();
      final phoneNumber = _phoneNumberController.text.trim();
      final loginId = "$fullNameKana$birthDay";
      const password = "YourFixedPassword123";

      if (await _isStaffNameTaken(fullNameKana)) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("このStaffNameは既に使用されています　※管理者に問い合わせをお願いします。")),
        );
        return;
      }

      try {
        final userCredential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
          email: email,
          password: password,
        );

        final staff = userCredential.user;
        if (staff != null) {
          await staff.updateDisplayName(fullNameKana);
          await staff.reload();

          await FirebaseFirestore.instance.collection('staffs').doc(staff.uid).set({
            'uid': staff.uid,
            'StaffName': fullNameKana,
            'StaffFullName': fullName,
            'email': email,
            'phoneNumber':phoneNumber,
            'birthMonthDay': birthDay,
            'loginId': loginId,
            'staffRole': 'staff',
            'createdAt': FieldValue.serverTimestamp(),
            'lastLogin': FieldValue.serverTimestamp(),
            'isStaying': false,
          });

          await _generateQRCodeAndSendEmail(staff.uid, loginId, email);
        }

        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("アカウントが作成されました！")),
        );
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const PlaceholderPage(title: "")));
      } on FirebaseAuthException catch (e) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? "登録に失敗しました")),
        );
      }
    }
  }

  Future<void> _generateQRCodeAndSendEmail(String uid, String loginId, String email) async {
    try {
      final qrData = jsonEncode({'uid': uid, 'loginId': loginId});
      final validation = QrValidator.validate(
        data: qrData,
        version: QrVersions.auto,
        errorCorrectionLevel: QrErrorCorrectLevel.L,
      );
      if (validation.status != QrValidationStatus.valid) throw Exception("QRコードの生成に失敗");

      final painter = QrPainter.withQr(
        qr: validation.qrCode!,
        color: Colors.black,
        emptyColor: Colors.white,
        gapless: true,
      );

      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$loginId.png');
      final imageData = await painter.toImageData(300);
      await file.writeAsBytes(imageData!.buffer.asUint8List());

      final ref = FirebaseStorage.instance.ref().child('qr_codes/$loginId.png');
      await ref.putFile(file);

      final url = await ref.getDownloadURL();
      await FirebaseFirestore.instance.collection('users').doc(uid).update({
        'qrCodeUrl': url,
      });

      print("QRコード発行: $url");
    } catch (e) {
      print("QRコード処理エラー: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("新規スタッフアカウント作成"),
        actions: [
          buildHomeButton(context), // ← 追加
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: SingleChildScrollView(
            child: Form(
              key: _formKey,
              child: Column(
                children: [
                  const Icon(Icons.person_add, size: 80, color: Colors.blue),
                  const SizedBox(height: 20),
                  _buildTextField(_fullNameController, "姓＋名(漢字)", Icons.person),
                  const SizedBox(height: 15),
                  _buildTextField(_fullNameKanaController, "姓のみカタカナ", Icons.person),
                  const SizedBox(height: 15),
                  _buildTextField(_emailController, "MailAddress", Icons.email, isEmail: true),
                  const SizedBox(height: 15),
                  _buildTextField(_phoneNumberController, "電話番号(スペース/ハイフンなし)", Icons.phone, isPhoneNumber: true),
                  const SizedBox(height: 15),
                  _buildTextField(_birthMonthDayController, "BirthDay (MMDD)", Icons.calendar_today, isBirthMonthDay: true),
                  const SizedBox(height: 20),
                  _isLoading
                      ? const CircularProgressIndicator()
                      : ElevatedButton(
                    onPressed: _signUp,
                    style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 50)),
                    child: const Text("新規登録"),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField(
      TextEditingController controller,
      String label,
      IconData icon, {
        bool isEmail = false,
        bool isPhoneNumber = false,
        bool isBirthMonthDay = false,
      }) {
    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.grey),
        border: const OutlineInputBorder(),
        prefixIcon: Icon(icon),
      ),
      keyboardType: isPhoneNumber
          ? TextInputType.number
          : isBirthMonthDay
          ? TextInputType.number
          : isEmail
          ? TextInputType.emailAddress
          : TextInputType.text,
      inputFormatters: isPhoneNumber
          ? [FilteringTextInputFormatter.digitsOnly] // ← 数字のみ許可（変更点①）
          : null,
      validator: (value) {
        if (value == null || value.isEmpty) {
          return "$label を入力してください";
        }

        if (isPhoneNumber) {
          final phoneRegExp = RegExp(r'^(0[5789]0\d{8}|0[1-9]\d{8,9})$'); // ← 形式チェック（変更点②）
          if (!phoneRegExp.hasMatch(value)) {
            return "無効な電話番号形式です（ハイフンなしで10〜11桁）"; // ← メッセージ変更（変更点③）
          }
        }

        return null;
      },
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
