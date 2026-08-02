import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter/material.dart';
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

  void _resetForm() {
    _fullNameController.clear();
    _fullNameKanaController.clear();
    _emailController.clear();
    _phoneNumberController.clear();
    _birthMonthDayController.clear();
    if (mounted) setState(() {});
  }

  Future<void> _signUp() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final fullName = _fullNameController.text.trim();
    final fullNameKana = _fullNameKanaController.text.trim();
    final email = _emailController.text.trim();
    final birthDay = _birthMonthDayController.text.trim();
    final phoneNumber = _phoneNumberController.text.trim();

    try {
      final callable = FunctionsClient.instance.httpsCallable('createStaffByApp');
      await callable.call({
        'fullName': fullName,
        'fullNameKana': fullNameKana,
        'email': email,
        'phoneNumber': phoneNumber,
        'birthMonthDay': birthDay,
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("アカウントが作成されました")),
      );
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _resetForm();
      });
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      final message = e.message ?? e.code;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("登録に失敗しました: $e")),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          Scaffold(
            appBar: AppBar(
              title: const Text("新規スタッフアカウント作成"),
              actions: [
                buildHomeButton(context, enabled: !_isLoading),
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
                          ElevatedButton(
                            onPressed: _isLoading ? null : _signUp,
                            style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 50)),
                            child: const Text("新規登録"),
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

