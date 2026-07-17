import 'dart:math';

import 'package:amuse_app_template/core/utils/formatters.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/user/a6_callable_errors.dart';
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
  final TextEditingController _pointAController = TextEditingController();
  final TextEditingController _pointBController = TextEditingController();
  final TextEditingController _chipController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final _random = Random();

  late Map<String, dynamic> _data;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _data = Map<String, dynamic>.from(widget.initialData);
    _pointAController.text = _balanceEditText(_data['pointA']);
    _pointBController.text = _balanceEditText(_data['pointB']);
    _chipController.text = _balanceEditText(_data['sideGameChip']);
  }

  @override
  void dispose() {
    _pointAController.dispose();
    _pointBController.dispose();
    _chipController.dispose();
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
      _pointAController.text = _balanceEditText(data['pointA']);
      _pointBController.text = _balanceEditText(data['pointB']);
      _chipController.text = _balanceEditText(data['sideGameChip']);
    });
  }

  Future<void> _onSavePressed() async {
    if (_isLoading) return;
    if (isMigratedStoreManagedUser(_data)) {
      _showSnack(kA6ErrorKeyMessages['USER_MIGRATED']!, Colors.red);
      return;
    }
    if (!_formKey.currentState!.validate()) return;

    final pointA = parseNonNegativeIntInput(_pointAController.text);
    final pointB = parseNonNegativeIntInput(_pointBController.text);
    final chip = parseNonNegativeIntInput(_chipController.text);
    if (pointA == null || pointB == null || chip == null) {
      _showSnack('ポイントは0以上の整数で入力してください', Colors.red);
      return;
    }

    final currentA = _data['pointA'];
    final currentB = _data['pointB'];
    final currentChip = _data['sideGameChip'];
    final hasInitial = _data['initialBalanceSetAt'] != null;
    final pokerName = displayOrUnset(_data['pokerName']);

    final confirmed = await showDialog<bool>(
      context: context,
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
                  '現在のポイント',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                Text(
                  '${Formatters.getPaymentMethodDisplayName('pointA')}: ${formatUserBalance(currentA)}',
                ),
                Text(
                  '${Formatters.getPaymentMethodDisplayName('pointB')}: ${formatUserBalance(currentB)}',
                ),
                Text(
                  '${Formatters.getPaymentMethodDisplayName('sideGameChip')}: ${formatUserBalance(currentChip)}',
                ),
                const SizedBox(height: 12),
                const Text('↓', style: TextStyle(fontSize: 18)),
                const SizedBox(height: 8),
                const Text(
                  '設定後のポイント',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                Text(
                  '${Formatters.getPaymentMethodDisplayName('pointA')}: $pointA',
                ),
                Text(
                  '${Formatters.getPaymentMethodDisplayName('pointB')}: $pointB',
                ),
                Text(
                  '${Formatters.getPaymentMethodDisplayName('sideGameChip')}: $chip',
                ),
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
    await _submit(
      pointA: pointA,
      pointB: pointB,
      sideGameChip: chip,
    );
  }

  Future<void> _submit({
    required int pointA,
    required int pointB,
    required int sideGameChip,
  }) async {
    setState(() => _isLoading = true);
    final note = _noteController.text.trim();
    String? successMessage;
    String? errorMessage;
    try {
      final callable = _functions.httpsCallable('setInitialUserBalances');
      final result = await callable.call({
        'targetUserId': widget.uid,
        'balances': {
          'pointA': pointA,
          'pointB': pointB,
          'sideGameChip': sideGameChip,
        },
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
    if (parseNonNegativeIntInput(value ?? '') == null) {
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
                          Text(
                            '現在のポイントA: ${formatUserBalance(_data['pointA'])}',
                          ),
                          Text(
                            '現在のポイントB: ${formatUserBalance(_data['pointB'])}',
                          ),
                          Text(
                            '現在のサイドゲームチップ: ${formatUserBalance(_data['sideGameChip'])}',
                          ),
                          Text(
                            '初期ポイント設定日時: ${formatUserTimestamp(_data['initialBalanceSetAt'])}',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _balanceField(
                    controller: _pointAController,
                    label: Formatters.getPaymentMethodDisplayName('pointA'),
                    enabled: !migrated,
                  ),
                  const SizedBox(height: 12),
                  _balanceField(
                    controller: _pointBController,
                    label: Formatters.getPaymentMethodDisplayName('pointB'),
                    enabled: !migrated,
                  ),
                  const SizedBox(height: 12),
                  _balanceField(
                    controller: _chipController,
                    label:
                        Formatters.getPaymentMethodDisplayName('sideGameChip'),
                    enabled: !migrated,
                  ),
                  const SizedBox(height: 12),
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
                    onPressed: (_isLoading || migrated) ? null : _onSavePressed,
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
        helperText: '0以上の整数（空欄・負数・小数不可）',
      ),
    );
  }
}
