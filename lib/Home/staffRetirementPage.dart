import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_functions/cloud_functions.dart';

class StaffRetirementPage extends StatefulWidget {
  final String staffId;
  final Map<String, dynamic> staffData;

  const StaffRetirementPage({
    super.key,
    required this.staffId,
    required this.staffData,
  });

  @override
  State<StaffRetirementPage> createState() => _StaffRetirementPageState();
}

class _StaffRetirementPageState extends State<StaffRetirementPage> {
  final FirebaseFunctions _functions = FunctionsClient.instance;
  final TextEditingController _retiredDateController = TextEditingController();
  final TextEditingController _retiredReasonController = TextEditingController();

  bool _isLoading = false;
  bool _confirmedNotice = false;

  @override
  void initState() {
    super.initState();
    _retiredDateController.text = _defaultRetiredDateJst();
  }

  @override
  void dispose() {
    _retiredDateController.dispose();
    _retiredReasonController.dispose();
    super.dispose();
  }

  String _defaultRetiredDateJst() {
    final jst = DateTime.now().toUtc().add(const Duration(hours: 9));
    final y = jst.year.toString().padLeft(4, '0');
    final m = jst.month.toString().padLeft(2, '0');
    final d = jst.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  Future<void> _onExecuteButtonPressed() async {
    final staffName = widget.staffData['fullName']?.toString() ?? '名前不明';
    final retiredDate = _retiredDateController.text.trim();
    final retiredReason = _retiredReasonController.text.trim();
    final reasonDisplay =
        retiredReason.isEmpty ? '未入力' : retiredReason;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('退職手続きを実行します'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'この操作を実行すると、対象スタッフは退職済みとなり、'
                  'スタッフ本人LIFF、QR生成、出勤、退勤、休憩、シフト申請などを利用できなくなります。',
                ),
                const SizedBox(height: 12),
                const Text(
                  '過去勤怠、給与、支払い情報は削除されず、管理者画面から確認できます。',
                ),
                const SizedBox(height: 16),
                Text('対象スタッフ:\n$staffName'),
                const SizedBox(height: 12),
                Text('退職日:\n$retiredDate'),
                const SizedBox(height: 12),
                Text('退職理由:\n$reasonDisplay'),
                const SizedBox(height: 16),
                const Text('退職手続きを実行しますか？'),
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
              child: const Text('退職手続きを実行する'),
            ),
          ],
        );
      },
    );

    if (confirmed == true && mounted) {
      await _executeRetirement();
    }
  }

  Future<void> _executeRetirement() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final result = await _functions.httpsCallable('retireStaff').call({
        'staffId': widget.staffId,
        'retiredDate': _retiredDateController.text.trim(),
        'retiredReason': _retiredReasonController.text.trim().isEmpty
            ? null
            : _retiredReasonController.text.trim(),
      });

      if (!mounted) return;
      if (result.data is Map && result.data['success'] == true) {
        Navigator.pop(context, true);
        return;
      }
      throw Exception('退職手続きに失敗しました');
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      final details = e.details;
      if (details is Map && details['errorKey'] == 'STAFF_FUTURE_SCHEDULE_EXISTS') {
        final summary = details['blockingSummary'];
        var message =
            '未来のシフト予定が残っています。シフトを整理してから退職手続きを実行してください。';
        if (summary is Map) {
          final shiftCount = summary['shiftRequestCount'];
          final assignmentCount = summary['assignmentCount'];
          if (shiftCount != null || assignmentCount != null) {
            message +=
                '\n（申請: ${shiftCount ?? 0}件 / 割当: ${assignmentCount ?? 0}件）';
          }
        }
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      } else if (details is Map && details['errorKey'] == 'STAFF_ALREADY_RETIRED') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('このスタッフは既に退職済みです')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('退職手続きに失敗しました: ${e.message ?? e}')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('退職手続きに失敗しました: $e')),
        );
      }
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
    final staffName = widget.staffData['fullName']?.toString() ?? '名前不明';

    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          Scaffold(
            appBar: AppBar(
              title: const Text('退職手続き'),
              backgroundColor: Colors.blue[600],
              foregroundColor: Colors.white,
            ),
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    elevation: 4,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            staffName,
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _retiredDateController,
                    readOnly: _isLoading,
                    decoration: const InputDecoration(
                      labelText: '退職日（YYYY-MM-DD）',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _retiredReasonController,
                    readOnly: _isLoading,
                    decoration: const InputDecoration(
                      labelText: '退職理由（任意）',
                      border: OutlineInputBorder(),
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 16),
                  Card(
                    color: Colors.orange[50],
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: const [
                          Text(
                            '注意事項',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            '退職手続きを実行すると、このスタッフはスタッフ本人LIFF、QR生成、出勤、退勤、休憩、シフト申請などを利用できなくなります。',
                          ),
                          SizedBox(height: 8),
                          Text(
                            '過去勤怠、給与、支払い情報は削除されず、管理者画面から確認できます。',
                          ),
                          SizedBox(height: 8),
                          Text(
                            '未来のシフト予定が残っている場合、退職手続きは実行できません。',
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  CheckboxListTile(
                    value: _confirmedNotice,
                    onChanged: _isLoading
                        ? null
                        : (value) {
                            setState(() {
                              _confirmedNotice = value ?? false;
                            });
                          },
                    title: const Text('上記内容を確認しました'),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: (_isLoading || !_confirmedNotice)
                        ? null
                        : _onExecuteButtonPressed,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const Text('退職手続きを実行する'),
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
