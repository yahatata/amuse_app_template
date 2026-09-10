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
  bool _obscurePin = true;

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
          const SnackBar(content: Text('アカウントが作成されました'), backgroundColor: Colors.green),
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
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: Card(
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Icon(Icons.person_add, size: 48, color: Colors.blue),
                              const SizedBox(height: 12),
                              const Text(
                                '新規アカウント作成',
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                              ),
                              const Divider(height: 32),
                              _buildTextField(_nameController, "ポーカーネーム", Icons.person),
                              const SizedBox(height: 16),
                              _buildTextField(_emailController, "メールアドレス", Icons.email, isEmail: true),
                              const SizedBox(height: 16),
                              _buildTextField(_pinController, "PIN（4桁）", Icons.lock, isPin: true, obscure: _obscurePin, onToggleObscure: () => setState(() => _obscurePin = !_obscurePin)),
                              const SizedBox(height: 16),
                              _buildTextField(_birthMonthDayController, "生年月日（MM/DD）", Icons.calendar_today, isBirthMonthDay: true),
                              const SizedBox(height: 24),
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
                ),          // SingleChildScrollView
              ),            // Center
            ),              // Padding (body)
          ),                // Scaffold
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
        bool obscure = false,
        VoidCallback? onToggleObscure,
      }) {
    // 入力BOX内のヒントテキスト（入力前に薄く表示）
    final String hintText;
    if (isPin) {
      hintText = '4桁の数字';
    } else if (isBirthMonthDay) {
      hintText = '（例）1月1日→0101';
    } else if (isEmail) {
      hintText = '（例）example@mail.com';
    } else {
      hintText = '（例）yamaTaro';
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ラベル（入力BOX左側に固定表示）
        SizedBox(
          width: 140,
          child: Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Text(
              label,
              style: const TextStyle(fontSize: 14, color: Colors.black87),
            ),
          ),
        ),
        const SizedBox(width: 8),
        // 入力BOX
        Expanded(
          child: TextFormField(
            controller: controller,
            obscureText: obscure,
            decoration: InputDecoration(
              hintText: hintText,
              hintStyle: const TextStyle(color: Colors.grey),
              border: const OutlineInputBorder(),
              prefixIcon: Icon(icon),
              suffixIcon: onToggleObscure != null
                  ? IconButton(
                      icon: Icon(obscure ? Icons.visibility_off : Icons.visibility),
                      onPressed: onToggleObscure,
                    )
                  : null,
            ),
            keyboardType: isPin || isBirthMonthDay ? TextInputType.number : isEmail ? TextInputType.emailAddress : TextInputType.text,
            validator: (value) {
              if (value == null || value.isEmpty) return "$label を入力してください";
              if (isPin && !RegExp(r'^\d{4}$').hasMatch(value)) return "PINは4桁の数字で入力してください";
              return null;
            },
          ),
        ),
      ],
    );
  }
}

