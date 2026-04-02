// 管理者向け: errorShapeProbe Callable の手動実行（Cloud Logging で shape 確認用）

import 'dart:async';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class ErrorShapeProbePage extends StatefulWidget {
  const ErrorShapeProbePage({super.key});

  @override
  State<ErrorShapeProbePage> createState() => _ErrorShapeProbePageState();
}

class _ErrorShapeProbePageState extends State<ErrorShapeProbePage> {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  String? _running;

  Future<void> _runProbe(String callableName, String label) async {
    if (_running != null) return;
    setState(() => _running = callableName);

    try {
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      if (!mounted) return;
      _showSnackBar('$label 実行中…', Colors.blue);

      final callable = _functions.httpsCallable(callableName);
      final result = await callable.call({}).timeout(
        const Duration(seconds: 60),
        onTimeout: () =>
            throw TimeoutException('呼び出しがタイムアウトしました'),
      );

      if (!mounted) return;
      final data = result.data;
      if (data is Map) {
        final probe = data['probe']?.toString() ?? '';
        final ok = data['ok'];
        _showSnackBar(
          '完了: probe=$probe ok=$ok（ログは Cloud Logging の errorShapeProbe:* を参照）',
          Colors.green,
        );
      } else {
        _showSnackBar('完了: $data', Colors.green);
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e is FirebaseFunctionsException
          ? (e.message ?? e.code)
          : e.toString();
      _showSnackBar('エラー: $msg', Colors.red);
    } finally {
      if (mounted) {
        setState(() => _running = null);
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
    final probes = <({String name, String label, String subtitle, IconData icon})>[
      (
        name: 'probeFirestoreErrorShape',
        label: 'Firestore (NOT_FOUND)',
        subtitle: '存在しない doc への update で発生するエラーを観察',
        icon: Icons.storage,
      ),
      (
        name: 'probeFirestoreErrorShapeInvalidArgument',
        label: 'Firestore (INVALID_ARG)',
        subtitle: '無効な limit（-1）のクエリで発生するエラーを観察',
        icon: Icons.data_object,
      ),
      (
        name: 'probeAuthErrorShape',
        label: 'Auth',
        subtitle: '存在しない UID の getUser を観察',
        icon: Icons.person_off,
      ),
      (
        name: 'probeStorageErrorShape',
        label: 'Storage',
        subtitle: '存在しないオブジェクトの getMetadata を観察',
        icon: Icons.folder_off,
      ),
      (
        name: 'probeCloudTasksErrorShape',
        label: 'Cloud Tasks',
        subtitle: '存在しないキューへの createTask を観察',
        icon: Icons.task_alt,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('エラーShape probe'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '各ボタンで対応する Callable を実行します。結果はサーバ側で Cloud Logging に記録されます（devices.role === admin のみ）。',
              style: TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 16),
            ...probes.map((p) {
              final busy = _running == p.name;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Card(
                  child: ListTile(
                    leading: Icon(p.icon, color: Colors.deepPurple),
                    title: Text(p.label),
                    subtitle: Text(p.subtitle),
                    trailing: busy
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.play_arrow),
                    onTap: busy
                        ? null
                        : () => _runProbe(p.name, p.label),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
