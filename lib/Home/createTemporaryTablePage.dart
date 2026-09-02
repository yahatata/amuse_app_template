import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';

class CreateTemporaryTablePage extends StatefulWidget {
  const CreateTemporaryTablePage({super.key});

  @override
  State<CreateTemporaryTablePage> createState() => _CreateTemporaryTablePageState();
}

class _CreateTemporaryTablePageState extends State<CreateTemporaryTablePage> {
  final _formKey = GlobalKey<FormState>();
  final _tableNameController = TextEditingController();
  final _maxSeatsController = TextEditingController();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    // デフォルト値を設定
    _maxSeatsController.text = '6';
  }

  @override
  void dispose() {
    _tableNameController.dispose();
    _maxSeatsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          Scaffold(
      appBar: AppBar(
        title: const Text('一時テーブル作成'),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // テーブル名称入力
              TextFormField(
                controller: _tableNameController,
                readOnly: _isLoading,
                decoration: const InputDecoration(
                  labelText: 'テーブル名称 *',
                  hintText: '例: テーブルA',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'テーブル名称を入力してください';
                  }
                  // テーブル名の形式チェック（英数字、アンダースコア、ハイフンのみ許可）
                  final validPattern = RegExp(r'^[a-zA-Z0-9_-]+$');
                  if (!validPattern.hasMatch(value.trim())) {
                    return 'テーブル名は英数字、アンダースコア(_)、ハイフン(-)のみ使用可能です';
                  }
                  // 長さチェック
                  if (value.trim().length > 50) {
                    return 'テーブル名は50文字以内で入力してください';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // 最大座席数入力
              TextFormField(
                controller: _maxSeatsController,
                readOnly: _isLoading,
                decoration: const InputDecoration(
                  labelText: '最大座席数 *',
                  hintText: '例: 6',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return '最大座席数を入力してください';
                  }
                  final seats = int.tryParse(value);
                  if (seats == null || seats <= 0) {
                    return '有効な座席数を入力してください';
                  }
                  if (seats > 20) {
                    return '最大座席数は20までです';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 24),
              
              // 作成ボタン
              ElevatedButton(
                onPressed: _isLoading ? null : _createTable,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: const Text(
                  'テーブルを作成',
                  style: TextStyle(fontSize: 16),
                ),
              ),
              
              const SizedBox(height: 24),
              
              // 説明文
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                                         const Text(
                       '作成されるテーブルの構造:',
                       style: TextStyle(
                         fontWeight: FontWeight.bold,
                         fontSize: 16,
                       ),
                     ),
                     const SizedBox(height: 8),
                     const Text(
                       '• ドキュメントID: テーブル名（ユニーク）\n'
                       '• 座席構造: seat01UserId, seat01PokerName, seat02UserId, seat02PokerName...\n'
                       '• ステータス: open\n'
                       '• isEnabled: true\n'
                       '• 作成日時・更新日時: 現在時刻\n'
                       '• テーブル名制限: 英数字、アンダースコア(_)、ハイフン(-)のみ',
                       style: TextStyle(fontSize: 14),
                     ),
                  ],
                ),
              ),
            ],
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

  Future<void> _createTable() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('createTemporaryTable');
      
      final result = await callable.call({
        'tableName': _tableNameController.text.trim(),
        'maxSeats': int.parse(_maxSeatsController.text.trim()),
      });

      final data = result.data;

      if (isCallableSuccessResponse(data)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('テーブルが正常に作成されました'),
              backgroundColor: Colors.green,
            ),
          );

          // 成功時にフォームをクリア
          _tableNameController.clear();
          _maxSeatsController.text = '6';

          // 作成結果を表示
          if (data is Map<String, dynamic>) {
            _showSuccessDialog(data);
          } else if (data is Map) {
            _showSuccessDialog(Map<String, dynamic>.from(data));
          }
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapCallableSoftFailMessage(
                data,
                operation: 'table.createTemporary',
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapCallableError(e, operation: 'table.createTemporary').message,
            ),
            backgroundColor: Colors.red,
          ),
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

  void _showSuccessDialog(Map<String, dynamic> data) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('テーブル作成完了'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('テーブル名称: ${data['tableName']}'),
              Text('テーブルID: ${data['tableId']}'),
              Text('最大座席数: ${data['maxSeats']}'),
              const SizedBox(height: 16),
              const Text(
                '作成された座席構造:',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              ...List.generate(
                data['maxSeats'] as int,
                (index) {
                  final seatNumber = (index + 1).toString().padLeft(2, '0');
                  return Text('seat${seatNumber}UserId, seat${seatNumber}PokerName');
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
  }
}
