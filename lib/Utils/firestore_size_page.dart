import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// Firestoreのサイズ計算結果を表示する画面
class FirestoreSizePage extends StatefulWidget {
  const FirestoreSizePage({super.key});

  @override
  State<FirestoreSizePage> createState() => _FirestoreSizePageState();
}

class _FirestoreSizePageState extends State<FirestoreSizePage> {
  final FirebaseFunctions _functions = FunctionsClient.instance;
  bool _isCalculating = false;
  Map<String, dynamic>? _result;

  Future<void> _calculateSize() async {
    setState(() {
      _isCalculating = true;
      _result = null;
    });

    try {
      final result = await _functions
          .httpsCallable(
            'calculateFirestoreSize',
            options: HttpsCallableOptions(
              timeout: const Duration(minutes: 10), // 10分に設定
            ),
          )
          .call();
      
      if (mounted) {
        setState(() {
          _result = Map<String, dynamic>.from(result.data as Map);
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(mapCallableError(e).message),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isCalculating = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Firestoreサイズ計算'),
        backgroundColor: Colors.blue,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Firestoreストレージサイズ計算',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '全コレクション・サブコレクションを再帰的にスキャンし、ドキュメントサイズを計算します。',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            ),
            const SizedBox(height: 24),
            
            Card(
              color: Colors.orange.shade50,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.warning, color: Colors.orange.shade700),
                        const SizedBox(width: 8),
                        const Text(
                          '注意事項',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '• 全ドキュメントを読み取るため、読み取り課金が発生します\n'
                      '• 大量データがある場合、処理に数分かかることがあります\n'
                      '• 計算結果は概算値です（実際のサイズより小さめ）',
                      style: TextStyle(fontSize: 14),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isCalculating ? null : _calculateSize,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                ),
                child: _isCalculating
                    ? const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          ),
                          SizedBox(width: 12),
                          Text('計算中...'),
                        ],
                      )
                    : const Text(
                        'サイズを計算',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ),
            const SizedBox(height: 32),
            
            if (_result != null) ...[
              if (_result!['success'] == true) ...[
                const Text(
                  '計算結果',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        _buildResultRow(
                          'ドキュメント数',
                          '${_result!['docCount']?.toString() ?? '0'}件',
                          Icons.description,
                        ),
                        const Divider(height: 24),
                        _buildResultRow(
                          'コレクション数',
                          '${_result!['collectionCount']?.toString() ?? '0'}個',
                          Icons.folder,
                        ),
                        const Divider(height: 24),
                        _buildResultRow(
                          '概算サイズ（JSON）',
                          '${_result!['approxDocMB']?.toString() ?? '0'} MB',
                          Icons.data_usage,
                        ),
                        const Divider(height: 24),
                        _buildResultRow(
                          '推定実サイズ',
                          '${_result!['estimatedActualMB']?.toString() ?? '0'} MB',
                          Icons.storage,
                          color: Colors.blue,
                          bold: true,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  color: Colors.blue.shade50,
                  child: const Padding(
                    padding: EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '補足',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          '• 推定実サイズは概算サイズの1.3倍で算出\n'
                          '• フィールド名やインデックスのオーバーヘッドを考慮\n'
                          '• 正確なサイズはFirebase Consoleで確認してください',
                          style: TextStyle(fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                ),
              ] else ...[
                Card(
                  color: Colors.red.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.error, color: Colors.red.shade700),
                            const SizedBox(width: 8),
                            const Text(
                              'エラー',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _result!['error']?.toString() ?? '不明なエラー',
                          style: const TextStyle(fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildResultRow(
    String label,
    String value,
    IconData icon, {
    Color? color,
    bool bold = false,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Icon(icon, color: color ?? Colors.grey.shade700, size: 20),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 16,
                fontWeight: bold ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: bold ? FontWeight.bold : FontWeight.w500,
            color: color,
          ),
        ),
      ],
    );
  }
}

