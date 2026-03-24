import 'package:flutter/material.dart';
import '../services/device_service.dart';
import '../Home/adminHomePage.dart';
import '../Home/terminalHomePage.dart';

/// デバイス登録画面
class DeviceRegistrationPage extends StatefulWidget {
  const DeviceRegistrationPage({super.key});

  @override
  State<DeviceRegistrationPage> createState() => _DeviceRegistrationPageState();
}

class _DeviceRegistrationPageState extends State<DeviceRegistrationPage> {
  final DeviceService _deviceService = DeviceService();
  final TextEditingController _nameController = TextEditingController();
  String _selectedRole = 'terminal';
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _registerDevice() async {
    if (_nameController.text.trim().isEmpty) {
      setState(() {
        _error = 'デバイス名を入力してください';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final device = await _deviceService.registerDevice(
        name: _nameController.text.trim(),
        role: _selectedRole,
      );

      if (device != null) {
        // 登録成功 - デバイスの役割に応じて適切な画面に遷移
        if (mounted) {
          if (device.role == 'admin') {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (context) => const AdminHomePage()),
            );
          } else {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (context) => const terminalHomePage()),
            );
          }
        }
      } else {
        setState(() {
          _error = 'デバイス登録に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _error = 'エラー: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          Scaffold(
            backgroundColor: Colors.blue[50],
            body: SafeArea(
              child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.of(context).size.height - 
                         MediaQuery.of(context).padding.top - 
                         MediaQuery.of(context).padding.bottom - 48, // 24*2 for padding
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
              // アイコン
              Icon(
                Icons.devices,
                size: 80,
                color: Colors.blue[700],
              ),
              const SizedBox(height: 24),

              // タイトル
              Text(
                'デバイス登録',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue[700],
                ),
              ),
              const SizedBox(height: 8),

              // 説明文
              Text(
                'このデバイスに名前を付けて、\n役割を設定してください',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 16,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 40),

              // デバイス名入力
              Card(
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'デバイス名',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.grey[700],
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _nameController,
                        readOnly: _isLoading,
                        decoration: InputDecoration(
                          hintText: '例: 受付タブレット、管理PC',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 16,
                          ),
                        ),
                        maxLength: 50,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // 役割選択
              Card(
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '役割',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.grey[700],
                        ),
                      ),
                      const SizedBox(height: 12),
                      RadioListTile<String>(
                        title: const Text('管理者'),
                        subtitle: const Text('全機能にアクセス可能'),
                        value: 'admin',
                        groupValue: _selectedRole,
                        onChanged: _isLoading
                            ? null
                            : (value) {
                                setState(() {
                                  _selectedRole = value!;
                                });
                              },
                        activeColor: Colors.blue[700],
                      ),
                      RadioListTile<String>(
                        title: const Text('ターミナル'),
                        subtitle: const Text('基本的な操作のみ'),
                        value: 'terminal',
                        groupValue: _selectedRole,
                        onChanged: _isLoading
                            ? null
                            : (value) {
                                setState(() {
                                  _selectedRole = value!;
                                });
                              },
                        activeColor: Colors.blue[700],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 32),

              // エラーメッセージ
              if (_error != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.red[50],
                    border: Border.all(color: Colors.red[200]!),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.error_outline, color: Colors.red[600]),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: TextStyle(color: Colors.red[600]),
                        ),
                      ),
                    ],
                  ),
                ),

              // 登録ボタン
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _registerDevice,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.blue[700],
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    elevation: 2,
                  ),
                  child: const Text(
                    'デバイスを登録',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
              // 下部に余白を追加（スクロール時の見た目を改善）
              const SizedBox(height: 40),
              ],
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
