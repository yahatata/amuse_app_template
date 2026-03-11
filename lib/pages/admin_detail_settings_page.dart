// 管理者向け詳細設定ページ
// 初期セットアップ等を集約。開発側のみが操作（admin デバイスでログイン時のみ表示）。
// 参照: docs/config_migration/phase1/PHASE1_UPDATE_PATH_DESIGN.md

import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class AdminDetailSettingsPage extends StatefulWidget {
  const AdminDetailSettingsPage({super.key});

  @override
  State<AdminDetailSettingsPage> createState() => _AdminDetailSettingsPageState();
}

class _AdminDetailSettingsPageState extends State<AdminDetailSettingsPage> {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  bool _isProcessing = false;

  Future<void> _callCallable(String name, String loadingLabel) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      if (!mounted) return;
      _showSnackBar('$loadingLabel 実行中...', Colors.blue);

      final callable = _functions.httpsCallable(name);
      final result = await callable.call({}).timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw TimeoutException('呼び出しがタイムアウトしました'),
          );

      if (!mounted) return;
      final data = result.data as Map<String, dynamic>? ?? {};
      final success = data['success'] == true;
      final message = data['message'] as String? ?? (success ? '完了' : '失敗');

      _showSnackBar(
        message,
        success ? Colors.green : Colors.orange,
      );
    } catch (e) {
      if (!mounted) return;
      _showSnackBar('エラー: $e', Colors.red);
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  void _showSnackBar(String msg, Color bgColor) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: bgColor),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('詳細設定'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '初期セットアップ',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.settings, color: Colors.deepPurple),
                title: const Text('storeMeta/config 初期セットアップ'),
                subtitle: const Text(
                  'storeMeta/config と storeMeta/requiredStaffByTimeSlot を作成します。未存在時のみ作成。',
                ),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.play_arrow),
                onTap: _isProcessing
                    ? null
                    : () => _callCallable(
                          'initializeStoreConfigCallable',
                          'storeMeta/config',
                        ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.calendar_today, color: Colors.teal),
                title: const Text('currentBusinessDay 初期化'),
                subtitle: const Text(
                  'storeMeta/currentBusinessDay を作成します。未存在時のみ作成。',
                ),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.play_arrow),
                onTap: _isProcessing
                    ? null
                    : () => _callCallable(
                          'createInitialStateDocCallable',
                          'currentBusinessDay',
                        ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
