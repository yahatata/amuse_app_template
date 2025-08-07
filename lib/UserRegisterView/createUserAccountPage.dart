import 'package:cloud_functions/cloud_functions.dart';
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

  Future<void> _signUp() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);

      final name = _nameController.text.trim();
      final email = _emailController.text.trim();
      final pin = _pinController.text.trim();
      final birthDay = _birthMonthDayController.text.trim();

      try {
        final callable = FirebaseFunctions.instance.httpsCallable('createUserByApp');
        final result = await callable.call({
          'pokerName': name,
          'email': email,
          'pin': pin,
          'birthMonthDay': birthDay,
        });

        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("アカウントが作成されました！")),
        );
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const PlaceholderPage(title: "")),
        );
      } on FirebaseFunctionsException catch (e) {
        setState(() => _isLoading = false);
        final message = e.message ?? "登録に失敗しました";
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      } catch (e) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("エラーが発生しました")),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("新規アカウント作成"),
        actions: [buildHomeButton(context)],
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
