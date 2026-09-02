import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/HomeBackAction.dart';

class CreateUserAccount extends StatefulWidget {
  const CreateUserAccount({super.key});

  @override
  State<CreateUserAccount> createState() => _CreateUserAccountState();
}

class _CreateUserAccountState extends State<CreateUserAccount> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _pinController = TextEditingController();
  final _birthMonthDayController = TextEditingController();

  bool _isLoading = false;

  void _resetForm() {
    _nameController.clear();
    _emailController.clear();
    _pinController.clear();
    _birthMonthDayController.clear();
    // FormState.reset() はフィールドを initialValue に戻すため、controller の clear が
    // 上書きされることがある。controller のみクリアし setState で再描画する。
    if (mounted) setState(() {});
  }

  Future<void> _signUp() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final pin = _pinController.text.trim();
    final birthDay = _birthMonthDayController.text.trim();

    try {
      final callable = FunctionsClient.instance.httpsCallable('createUserByApp');
      final result = await callable.call({
        'pokerName': name,
        'email': email,
        'pin': pin,
        'birthMonthDay': birthDay,
      });

      final response = result.data;
      if (!context.mounted) return;
      if (isCallableSuccessResponse(response)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('アカウントが作成されました')),
        );
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _resetForm();
        });
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapCallableSoftFailMessage(
                response,
                operation: 'createUserByApp',
              ),
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapCallableError(e, operation: 'createUserByApp').message,
            ),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapCallableError(e, operation: 'createUserByApp').message,
            ),
          ),
        );
      }
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
              title: const Text("新規アカウント作成"),
              actions: [buildHomeButton(context, enabled: !_isLoading)],
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
                          _buildTextField(_nameController, "PokerName", Icons.person),
                          const SizedBox(height: 15),
                          _buildTextField(_emailController, "MailAddress", Icons.email, isEmail: true),
                          const SizedBox(height: 15),
                          _buildTextField(_pinController, "PIN (4桁数字)", Icons.lock, isPin: true),
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
        bool isPin = false,
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
      keyboardType: isPin || isBirthMonthDay ? TextInputType.number : isEmail ? TextInputType.emailAddress : TextInputType.text,
      validator: (value) {
        if (value == null || value.isEmpty) return "$label を入力してください";
        if (isPin && !RegExp(r'^\d{4}$').hasMatch(value)) return "PINは4桁の数字で入力してください";
        return null;
      },
    );
  }
}

