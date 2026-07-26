import 'dart:math';

import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/user/a6_callable_errors.dart';
import 'package:amuse_app_template/user/balance_display.dart';
import 'package:amuse_app_template/user/user_type_display.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// 初期ポイント設定の保存成功時に、選択画面へ返す更新済みユーザー情報。
class AdminInitialPointSettingResult {
  const AdminInitialPointSettingResult({
    required this.uid,
    required this.data,
  });

  final String uid;
  final Map<String, dynamic> data;
}

/// 選択ユーザー1名の初期ポイント設定画面。
/// Callable: `setInitialUserBalances`
class AdminInitialPointSettingPage extends StatefulWidget {
  const AdminInitialPointSettingPage({
    super.key,
    required this.uid,
    required this.initialData,
  });

  final String uid;
  final Map<String, dynamic> initialData;

  @override
  State<AdminInitialPointSettingPage> createState() =>
      _AdminInitialPointSettingPageState();
}

class _AdminInitialPointSettingPageState
    extends State<AdminInitialPointSettingPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FunctionsClient.instance;
  final TextEditingController _noteController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final _random = Random();

  late Map<String, dynamic> _data;
  late List<String> _enabledIds;
  late Map<String, TextEditingController> _controllers;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _data = Map<String, dynamic>.from(widget.initialData);
    _enabledIds = enabledBalanceIdsFromStoreConfig();
    _controllers = {
      for (final id in _enabledIds)
        id: TextEditingController(text: _balanceEditText(_data[id])),
    };
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _noteController.dispose();
    super.dispose();
  }

  String _balanceEditText(dynamic value) {
    if (value is int) return value.toString();
    if (value is num) return value.round().toString();
    return '0';
  }

  String _newClientNonce() {
    final ms = DateTime.now().microsecondsSinceEpoch;
    final r = _random.nextInt(1 << 32);
    return 'initbal_${ms}_$r';
  }

  Future<void> _reloadUser() async {
    final snap = await _firestore.collection('users').doc(widget.uid).get();
    if (!mounted || !snap.exists) return;
    final data = snap.data() ?? {};
    setState(() {
      _data = data;
      for (final id in _enabledIds) {
        _controllers[id]?.text = _balanceEditText(data[id]);
      }
    });
  }

  Map<String, int>? _parseBalancesFromForm() {
    final out = <String, int>{};
    for (final id in _enabledIds) {
      final raw = _controllers[id]?.text ?? '';
      // 空は 0
      final trimmed = raw.trim();
      final value = trimmed.isEmpty ? 0 : parseNonNegativeIntInput(trimmed);
      if (value == null) return null;
      out[id] = value;
    }
    return out;
  }

  Future<void> _onSavePressed() async {
    if (_isLoading) return;
    if (isMigratedStoreManagedUser(_data)) {
      _showSnack(kA6ErrorKeyMessages['USER_MIGRATED']!, Colors.red);
      return;
    }
    if (_enabledIds.isEmpty) {
      _showSnack('有効なポイントがありません。店舗設定を確認してください。', Colors.red);
      return;
    }
    if (!_formKey.currentState!.validate()) return;

    final balances = _parseBalancesFromForm();
    if (balances == null) {
      _showSnack('ポイントは0以上の整数で入力してください', Colors.red);
      return;
    }

    final hasInitial = _data['initialBalanceSetAt'] != null;
    final pokerName = displayOrUnset(_data['pokerName']);

    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          title: Text(hasInitial ? '初期ポイントを上書きします' : '初期ポイントを設定します'),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('対象: $pokerName'),
                const SizedBox(height: 12),
                if (hasInitial)
                  const Text(
                    '既に初期ポイントが設定されています。現在のポイントを次の値で上書きします。',
                    style: TextStyle(
                      color: Colors.red,
                      fontWeight: FontWeight.bold,
                    ),
                  )
                else
                  const Text('次のポイントで初期設定します（上書きとして適用されます）。'),
                const SizedBox(height: 12),
                const Text(
                  '現在のポイント（有効分）',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                for (final id in _enabledIds)
                  Text(
                    '${balanceDisplayName(id)}: ${formatUserBalance(_data[id])}',
                  ),
                const SizedBox(height: 12),
                const Text('↓', style: TextStyle(fontSize: 18)),
                const SizedBox(height: 8),
                const Text(
                  '設定後のポイント（有効分）',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                for (final id in _enabledIds)
                  Text('${balanceDisplayName(id)}: ${balances[id]}'),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('キャンセル'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: Text(hasInitial ? '上書きして保存' : '保存する'),
            ),
          ],
        );
      },
    );

    if (confirmed != true || !mounted) return;
    await _submit(balances);
  }

  Future<void> _submit(Map<String, int> balances) async {
    setState(() => _isLoading = true);
    final note = _noteController.text.trim();
    String? successMessage;
    String? errorMessage;
    try {
      final callable = _functions.httpsCallable('setInitialUserBalances');
      final result = await callable.call({
        'targetUserId': widget.uid,
        'balances': balances,
        if (note.isNotEmpty) 'note': note,
        'clientNonce': _newClientNonce(),
        'confirmOverwrite': true,
      });

      final data = result.data;
      final reused = data is Map && data['reused'] == true;
      successMessage =
          reused ? '初期ポイントを設定しました（冪等・再送）' : '初期ポイントを設定しました';
      await _reloadUser();
    } catch (e) {
      errorMessage = formatA6CallableError(e);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
    if (!mounted) return;
    if (successMessage != null) {
      _showSnack(successMessage, Colors.green);
      Navigator.pop(
        context,
        AdminInitialPointSettingResult(
          uid: widget.uid,
          data: Map<String, dynamic>.from(_data),
        ),
      );
    } else if (errorMessage != null) {
      _showSnack(errorMessage, Colors.red);
    }
  }

  void _showSnack(String message, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: color),
    );
  }

  String? _balanceValidator(String? value) {
    final trimmed = (value ?? '').trim();
    if (trimmed.isEmpty) return null; // 空は 0
    if (parseNonNegativeIntInput(trimmed) == null) {
      return '0以上の整数を入力';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final migrated = isMigratedStoreManagedUser(_data);
    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          Scaffold(
            appBar: AppBar(
              title: const Text('初期ポイント設定'),
              backgroundColor: Colors.deepPurple,
              foregroundColor: Colors.white,
            ),
            body: Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            displayOrUnset(_data['pokerName']),
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          if (migrated)
                            const Text(
                              '移行済みユーザーです。初期ポイント設定はできません。',
                              style: TextStyle(color: Colors.red),
                            ),
                          const SizedBox(height: 8),
                          if (_enabledIds.isEmpty)
                            const Text(
                              '有効なポイントがありません。',
                              style: TextStyle(color: Colors.red),
                            )
                          else
                            for (final id in _enabledIds)
                              Text(
                                '現在の${balanceDisplayName(id)}: ${formatUserBalance(_data[id])}',
                              ),
                          Text(
                            '初期ポイント設定日時: ${formatUserTimestamp(_data['initialBalanceSetAt'])}',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  for (final id in _enabledIds) ...[
                    _balanceField(
                      controller: _controllers[id]!,
                      label: balanceDisplayName(id),
                      enabled: !migrated,
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    controller: _noteController,
                    enabled: !_isLoading && !migrated,
                    maxLength: 200,
                    decoration: const InputDecoration(
                      labelText: 'メモ（任意）',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: (_isLoading || migrated || _enabledIds.isEmpty)
                        ? null
                        : _onSavePressed,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.deepPurple,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    child: const Text('保存'),
                  ),
                ],
              ),
            ),
          ),
          if (_isLoading)
            Positioned.fill(
              child: AbsorbPointer(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.35),
                  child: const Center(child: CircularProgressIndicator()),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _balanceField({
    required TextEditingController controller,
    required String label,
    required bool enabled,
  }) {
    return TextFormField(
      controller: controller,
      enabled: !_isLoading && enabled,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      validator: _balanceValidator,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        helperText: '0以上の整数（空欄は0・負数・小数不可）',
      ),
    );
  }
}
