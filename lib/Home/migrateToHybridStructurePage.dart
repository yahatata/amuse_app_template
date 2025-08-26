import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

class MigrateToHybridStructurePage extends StatefulWidget {
  const MigrateToHybridStructurePage({super.key});

  @override
  State<MigrateToHybridStructurePage> createState() => _MigrateToHybridStructurePageState();
}

class _MigrateToHybridStructurePageState extends State<MigrateToHybridStructurePage> {
  bool _isLoading = false;
  String _status = '待機中';
  String _result = '';
  bool _isCompleted = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ハイブリッド形式移行'),
        centerTitle: true,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
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
                    'ハイブリッド形式移行について',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'この機能は既存のデータを新しいハイブリッド形式に変換します。\n\n'
                    '• waitingデータ: {userId: true} → {userId: {pokerName, joinedAt, order}}\n'
                    '• seatsデータ: {seat1: userId} → {seat01UserId: userId, seat01PokerName: pokerName}\n\n'
                    '⚠️ 注意: この処理は既存データを変更します。実行前にバックアップを推奨します。',
                    style: TextStyle(fontSize: 14),
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 24),
            
            // 実行ボタン
            ElevatedButton(
              onPressed: _isLoading ? null : _executeMigration,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                backgroundColor: _isCompleted ? Colors.green : Colors.blue,
              ),
              child: _isLoading
                  ? const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        ),
                        SizedBox(width: 8),
                        Text('移行実行中...', style: TextStyle(color: Colors.white)),
                      ],
                    )
                  : Text(
                      _isCompleted ? '移行完了' : '移行を実行',
                      style: const TextStyle(fontSize: 16, color: Colors.white),
                    ),
            ),
            
            const SizedBox(height: 24),
            
            // ステータス表示
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'ステータス',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(_status),
                ],
              ),
            ),
            
            const SizedBox(height: 16),
            
            // 結果表示
            if (_result.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _isCompleted ? Colors.green.shade50 : Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: _isCompleted ? Colors.green.shade200 : Colors.orange.shade200,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _isCompleted ? '移行結果' : '実行結果',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _result,
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
            
            const Spacer(),
            
            // 注意事項
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '⚠️ 重要',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.red,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    '• この処理は既存データを変更します\n'
                    '• 実行中は他の操作を避けてください\n'
                    '• 処理には数分かかる場合があります\n'
                    '• 移行完了後はこの機能を削除してください',
                    style: TextStyle(fontSize: 12, color: Colors.red),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _executeMigration() async {
    setState(() {
      _isLoading = true;
      _status = '移行処理を開始しています...';
      _result = '';
      _isCompleted = false;
    });

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('migrateToHybridStructureCallable');
      
      setState(() {
        _status = 'Cloud Functionを呼び出しています...';
      });
      
      final result = await callable.call();
      final data = result.data as Map<String, dynamic>;
      
      if (data['success'] == true) {
        setState(() {
          _isLoading = false;
          _status = '移行が正常に完了しました';
          _result = data['message'] ?? '移行が完了しました';
          _isCompleted = true;
        });
        
        // 成功時のスナックバー
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('ハイブリッド形式への移行が完了しました'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        throw Exception(data['error'] ?? '移行に失敗しました');
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _status = '移行中にエラーが発生しました';
        _result = 'エラー詳細: $e';
        _isCompleted = false;
      });
      
      // エラー時のスナックバー
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('移行に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
