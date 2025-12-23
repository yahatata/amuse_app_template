import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../globalConstant.dart';
import 'createTemporaryTablePage.dart';

class SystemSettingsPage extends StatefulWidget {
  const SystemSettingsPage({super.key});

  @override
  State<SystemSettingsPage> createState() => _SystemSettingsPageState();
}

class _SystemSettingsPageState extends State<SystemSettingsPage> {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  bool _isProcessing = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('システム設定'),
        backgroundColor: Colors.blue[700],
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
            const Text(
              'データ管理',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            // 一時テーブル作成機能
            Card(
              child: ListTile(
                leading: const Icon(Icons.table_chart, color: Colors.blue),
                title: const Text('一時テーブル作成'),
                subtitle: const Text('トーナメント用の一時テーブルを作成します'),
                trailing: const Icon(Icons.arrow_forward_ios),
                onTap: () {
                  // TODO: 一時テーブル作成機能の実装
                  Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const CreateTemporaryTablePage(),
                        ),
                      );
                },
              ),
            ),
            const SizedBox(height: 16),
            
            // settledBills移管処理
            Card(
              child: ListTile(
                leading: const Icon(Icons.swap_horiz, color: Colors.orange),
                title: const Text('settledBillsへの移管処理（開発用）'),
                subtitle: const Text('売上データをanalyticsMonthlyに移管します'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _showMigrationDialog,
              ),
            ),
            const SizedBox(height: 16),
            
            // ダミーデータ生成機能
            Card(
              child: ListTile(
                leading: const Icon(Icons.data_usage, color: Colors.purple),
                title: const Text('ダミーデータ生成（テスト用）'),
                subtitle: const Text('analyticsMonthlyに2025-05〜2025-08のダミーデータを生成します'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _showDummyDataDialog,
              ),
            ),
            const SizedBox(height: 16),
            
            // 全テーブルリセット機能
            Card(
              child: ListTile(
                leading: const Icon(Icons.refresh, color: Colors.teal),
                title: const Text('全テーブルリセット'),
                subtitle: const Text('全テーブルのステータスをopenに戻します'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _showResetTablesDialog,
              ),
            ),
            const SizedBox(height: 16),
            
            // 全サイドゲームリセット機能
            Card(
              child: ListTile(
                leading: const Icon(Icons.casino, color: Colors.indigo),
                title: const Text('全サイドゲームリセット'),
                subtitle: const Text('全サイドゲームをクリアします'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _showResetSideGamesDialog,
              ),
            ),
            const SizedBox(height: 16),
            
            // 閉店クリーンアップ機能
            Card(
              child: ListTile(
                leading: const Icon(Icons.cleaning_services, color: Colors.red),
                title: const Text('閉店クリーンアップ'),
                subtitle: const Text('activeStays を全削除します（isActiveの値に関係なく）'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _showCleanupActiveStaysDialog,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              '注意事項',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.red,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '• 一時テーブル作成: トーナメント用のテーブルを動的に作成\n'
              '• settledBills移管: 本機能は開発用です\n'
              '• ダミーデータ生成: テスト用のダミーデータを生成します\n'
              '• 全テーブルリセット: 全テーブルのステータスをopenにリセット\n'
              '• 全サイドゲームリセット: 全サイドゲームをクリア\n'
              '• 閉店クリーンアップ: activeStays を全削除（isActiveの値に関係なく、開店時に空にする）\n'
              '• 本番環境では自動バッチ処理で実行されます\n'
              '• 処理中は他の操作を行わないでください',
              style: TextStyle(color: Colors.red),
            ),
          ],
          ),
        ),
      ),
    );
  }

  void _showMigrationDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('最終確認'),
          content: const Text(
            'settledBillsへの移管処理を実行しますか？\n\n'
            '本番では自動バッチ想定・本操作は開発用です。\n'
            '処理中は他の操作を行わないでください。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _executeMigration,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
              ),
              child: const Text('実行'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _executeMigration() async {
    Navigator.of(context).pop(); // ダイアログを閉じる
    
    // 認証状態を確認
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    
    setState(() {
      _isProcessing = true;
    });

    // ローディングダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return const AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('移管処理中...'),
            ],
          ),
        );
      },
    );

    try {
      debugPrint('移管処理開始: storeCloseHour=${GlobalConstants.STORE_CLOSE_HOUR}');
      
      // 注意: GlobalConstants.STORE_CLOSE_HOUR をそのまま渡す。
      // migrateSettledBillsForBusinessDay 内の resolveBusinessDate で
      // normalizeStoreCloseHour() により正規化される（24以上は翌日繰り上がり）。
      final callable = _functions.httpsCallable('migrateSettledBillsForBusinessDay');
      final result = await callable.call({
        'storeCloseHour': GlobalConstants.STORE_CLOSE_HOUR,
      });

      debugPrint('移管処理結果: $result');

      // ローディングダイアログを閉じる
      Navigator.of(context).pop();

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('移管完了: ${result.data['message'] ?? ''}'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        _showErrorDialog(result.data['error'] ?? '移管処理に失敗しました');
      }
    } catch (e) {
      debugPrint('移管処理エラー: $e');
      
      // ローディングダイアログを閉じる
      Navigator.of(context).pop();
      
      if (e.toString().contains('UNAUTHENTICATED')) {
        _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
      } else {
        _showErrorDialog('移管処理に失敗しました: $e');
      }
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }

  void _showDummyDataDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('ダミーデータ生成'),
          content: const Text(
            'analyticsMonthlyに2025-05〜2025-08のダミーデータを生成しますか？\n\n'
            '生成されるデータ（各月）:\n'
            '• 月次インデックス: 1件\n'
            '• 日次サマリー: 30件\n'
            '• カテゴリ別: 1件\n'
            '• トーナメントテンプレート別: 30件\n'
            '• ユーザー別: 80件\n\n'
            '合計: 4ヶ月分のデータ\n'
            '本機能はテスト用です。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _executeDummyDataGeneration,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.purple,
                foregroundColor: Colors.white,
              ),
              child: const Text('生成'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _executeDummyDataGeneration() async {
    Navigator.of(context).pop(); // ダイアログを閉じる
    
    // 認証状態を確認
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    
    setState(() {
      _isProcessing = true;
    });

    // ローディングダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return const AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('4ヶ月分のダミーデータ生成中...'),
            ],
          ),
        );
      },
    );

    try {
      debugPrint('4ヶ月分のダミーデータ生成開始');
      
      final callable = _functions.httpsCallable('generateDummyData');
      final result = await callable.call();

      debugPrint('4ヶ月分のダミーデータ生成結果: $result');

      // ローディングダイアログを閉じる
      Navigator.of(context).pop();

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('4ヶ月分のダミーデータ生成完了: ${result.data['message'] ?? ''}'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        _showErrorDialog(result.data['error'] ?? 'ダミーデータ生成に失敗しました');
      }
    } catch (e) {
      debugPrint('4ヶ月分のダミーデータ生成エラー: $e');
      
      // ローディングダイアログを閉じる
      Navigator.of(context).pop();
      
      if (e.toString().contains('UNAUTHENTICATED')) {
        _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
      } else {
        _showErrorDialog('4ヶ月分のダミーデータ生成に失敗しました: $e');
      }
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }

  void _showResetTablesDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('最終確認'),
          content: const Text(
            '全テーブルのステータスをopenにリセットしますか？\n\n'
            'すべてのテーブルが開店状態に戻ります。\n'
            '処理中は他の操作を行わないでください。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _executeResetTables,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal,
                foregroundColor: Colors.white,
              ),
              child: const Text('実行'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _executeResetTables() async {
    Navigator.of(context).pop(); // ダイアログを閉じる
    
    // 認証状態を確認
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    
    setState(() {
      _isProcessing = true;
    });

    // ローディングダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return const AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('全テーブルリセット中...'),
            ],
          ),
        );
      },
    );

    try {
      debugPrint('全テーブルリセット開始');
      
      final callable = _functions.httpsCallable('resetAllTables');
      final result = await callable.call();

      debugPrint('全テーブルリセット結果: $result');

      // ローディングダイアログを閉じる
      Navigator.of(context).pop();

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('全テーブルリセット完了: ${result.data['message'] ?? ''}'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        _showErrorDialog(result.data['error'] ?? '全テーブルリセットに失敗しました');
      }
    } catch (e) {
      debugPrint('全テーブルリセットエラー: $e');
      
      // ローディングダイアログを閉じる
      Navigator.of(context).pop();
      
      if (e.toString().contains('UNAUTHENTICATED')) {
        _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
      } else {
        _showErrorDialog('全テーブルリセットに失敗しました: $e');
      }
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }

  void _showResetSideGamesDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('最終確認'),
          content: const Text(
            '全サイドゲームをリセットしますか？\n\n'
            'すべてのサイドゲームの座席情報とゲーム情報がクリアされます。\n'
            '処理中は他の操作を行わないでください。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _executeResetSideGames,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.indigo,
                foregroundColor: Colors.white,
              ),
              child: const Text('実行'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _executeResetSideGames() async {
    Navigator.of(context).pop(); // ダイアログを閉じる
    
    // 認証状態を確認
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    
    setState(() {
      _isProcessing = true;
    });

    // ローディングダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return const AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('全サイドゲームリセット中...'),
            ],
          ),
        );
      },
    );

    try {
      debugPrint('全サイドゲームリセット開始');
      
      final callable = _functions.httpsCallable('resetAllSideGames');
      final result = await callable.call();

      debugPrint('全サイドゲームリセット結果: $result');

      // ローディングダイアログを閉じる
      Navigator.of(context).pop();

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('全サイドゲームリセット完了: ${result.data['message'] ?? ''}'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        _showErrorDialog(result.data['error'] ?? '全サイドゲームリセットに失敗しました');
      }
    } catch (e) {
      debugPrint('全サイドゲームリセットエラー: $e');
      
      // ローディングダイアログを閉じる
      Navigator.of(context).pop();
      
      if (e.toString().contains('UNAUTHENTICATED')) {
        _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
      } else {
        _showErrorDialog('全サイドゲームリセットに失敗しました: $e');
      }
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }

  void _showCleanupActiveStaysDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('最終確認'),
          content: const Text(
            'activeStays を全削除しますか？\n\n'
            'isActiveの値に関係なく、すべてのactiveStaysドキュメントが削除されます。\n'
            '開店時に activeStays を空にするために使用します。\n'
            '処理中は他の操作を行わないでください。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _executeCleanupActiveStays,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('実行'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _executeCleanupActiveStays() async {
    Navigator.of(context).pop(); // ダイアログを閉じる
    
    // 認証状態を確認
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    
    setState(() {
      _isProcessing = true;
    });

    // ローディングダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return const AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('閉店クリーンアップ中...'),
            ],
          ),
        );
      },
    );

    try {
      debugPrint('閉店クリーンアップ開始');
      
      final callable = _functions.httpsCallable('cleanupActiveStaysOnClose');
      final result = await callable.call();

      debugPrint('閉店クリーンアップ結果: $result');

      // ローディングダイアログを閉じる
      Navigator.of(context).pop();

      if (result.data['success'] == true) {
        final deleted = result.data['deleted'] ?? 0;
        final failed = result.data['failed'] ?? 0;
        final message = 'Active stays cleanup: deleted=$deleted, failed=$failed';
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(message),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        _showErrorDialog(result.data['error'] ?? '閉店クリーンアップに失敗しました');
      }
    } catch (e) {
      debugPrint('閉店クリーンアップエラー: $e');
      
      // ローディングダイアログを閉じる
      Navigator.of(context).pop();
      
      if (e.toString().contains('UNAUTHENTICATED')) {
        _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
      } else {
        _showErrorDialog('閉店クリーンアップに失敗しました: $e');
      }
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }

  void _showErrorDialog(String errorMessage) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('エラー'),
          content: Text(errorMessage),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
  }
}