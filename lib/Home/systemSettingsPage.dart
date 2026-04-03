import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import '../globalConstant.dart';
import 'createTemporaryTablePage.dart';

class SystemSettingsPage extends StatefulWidget {
  const SystemSettingsPage({super.key});

  @override
  State<SystemSettingsPage> createState() => _SystemSettingsPageState();
}

class _SystemSettingsPageState extends State<SystemSettingsPage> {
  final FirebaseFunctions _functions = FunctionsClient.instance;
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
            
            // 勤怠デモデータ投入（一時・後で削除）
            Card(
              child: ListTile(
                leading: const Icon(Icons.person_add, color: Colors.deepOrange),
                title: const Text('勤怠デモデータ投入（開発用）'),
                subtitle: const Text('2026/03/15の勤怠データを7件追加（勤務中4件・退勤済み3件）'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _showSeedAttendancesDemoDialog,
              ),
            ),
            const SizedBox(height: 16),
            // 給与検証用デモ（staffs 30 + attendances 200）
            Card(
              child: ListTile(
                leading: const Icon(Icons.payments_outlined, color: Colors.deepPurple),
                title: const Text('給与検証デモデータ投入'),
                subtitle: const Text('staffs 30人・2026/3月の勤怠200件（削除フラグ付き）'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _showSeedPayrollDemoDialog,
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: ListTile(
                leading: const Icon(Icons.delete_sweep_outlined, color: Colors.redAccent),
                title: const Text('給与検証デモデータ削除'),
                subtitle: const Text('isPayrollDemoSeed 付きの staffs / attendances を一括削除'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _showDeletePayrollDemoDialog,
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
            // 未会計billsの移管（Phase6 Step2）
            Card(
              child: ListTile(
                leading: const Icon(Icons.receipt_long, color: Colors.brown),
                title: const Text('未会計billsの移管'),
                subtitle: const Text('当日営業日の未会計伝票に閉店時ラベル（closeSnapshot）を付与します'),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.arrow_forward_ios),
                onTap: _isProcessing ? null : _openUnsettledBillsFlow,
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
              '• 未会計billsの移管: 当日営業日の未会計伝票に閉店時ラベル（closeSnapshot）を付与\n'
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
      debugPrint('移管処理開始: storeMeta から営業日を取得して移管します');
      // 営業日は Cloud Functions 側で storeMeta/currentBusinessDay の
      // currentBusinessDateKey（優先）または lastClosedBusinessDateKey から決定されます。
      final callable = _functions.httpsCallable('migrateSettledBillsForBusinessDay');
      final result = await callable.call(<String, dynamic>{});

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

  void _showSeedAttendancesDemoDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('勤怠デモデータ投入'),
          content: const Text(
            '2026/03/15 の勤怠データを7件追加します。\n\n'
            '• 勤務中: 4件（clockOut: null）\n'
            '• 退勤済み: 3件（clockOut・totalMinutes あり）\n\n'
            '氏名・ID・時刻はランダムです。開発用です。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _executeSeedAttendancesDemo,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepOrange,
                foregroundColor: Colors.white,
              ),
              child: const Text('投入'),
            ),
          ],
        );
      },
    );
  }

  void _showSeedPayrollDemoDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('給与検証デモデータ投入'),
          content: const Text(
            '次のデータを Firestore に作成します。\n\n'
            '• staffs: 30件（LIFF 登録時と同様のフィールド + hourlyWage）\n'
            '• attendances: 200件（2026/03/01〜03/31、上記スタッフに紐づく）\n'
            '• 退勤済み・勤務中・休憩中など複数パターン\n\n'
            '既に投入済みの場合は先に「給与検証デモデータ削除」を実行してください。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _executeSeedPayrollDemo,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepPurple,
                foregroundColor: Colors.white,
              ),
              child: const Text('投入'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _executeSeedPayrollDemo() async {
    Navigator.of(context).pop();
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    setState(() => _isProcessing = true);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('給与検証デモデータ投入中...'),
          ],
        ),
      ),
    );
    try {
      final callable = _functions.httpsCallable('seedPayrollDemoData');
      final result = await callable.call();
      if (!mounted) return;
      if (Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.data['message'] ?? '投入完了'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        _showErrorDialog(result.data['error'] ?? '投入に失敗しました');
      }
    } catch (e) {
      debugPrint('seedPayrollDemoData error: $e');
      if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (e is FirebaseFunctionsException) {
        if (e.code == 'unauthenticated' || e.code == 'permission-denied') {
          _showErrorDialog('認証エラー: 管理者でログインしてから再度お試しください。');
          return;
        }
        if (e.code == 'failed-precondition') {
          _showErrorDialog(e.message ?? '既にデモデータが存在します。先に削除してください。');
          return;
        }
      }
      _showErrorDialog('投入に失敗しました: $e');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _showDeletePayrollDemoDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('給与検証デモデータ削除'),
          content: const Text(
            'isPayrollDemoSeed が true の attendances（breaks 含む）と staffs をすべて削除します。\n\n'
            'この操作は取り消せません。',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: _executeDeletePayrollDemo,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.redAccent,
                foregroundColor: Colors.white,
              ),
              child: const Text('削除'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _executeDeletePayrollDemo() async {
    Navigator.of(context).pop();
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    setState(() => _isProcessing = true);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('給与検証デモデータ削除中...'),
          ],
        ),
      ),
    );
    try {
      final callable = _functions.httpsCallable('deletePayrollDemoData');
      final result = await callable.call();
      if (!mounted) return;
      if (Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.data['message'] ?? '削除完了'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        _showErrorDialog(result.data['error'] ?? '削除に失敗しました');
      }
    } catch (e) {
      debugPrint('deletePayrollDemoData error: $e');
      if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (e is FirebaseFunctionsException) {
        if (e.code == 'unauthenticated' || e.code == 'permission-denied') {
          _showErrorDialog('認証エラー: 管理者でログインしてから再度お試しください。');
          return;
        }
      }
      _showErrorDialog('削除に失敗しました: $e');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _executeSeedAttendancesDemo() async {
    Navigator.of(context).pop();
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    setState(() => _isProcessing = true);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('勤怠デモデータ投入中...'),
          ],
        ),
      ),
    );
    try {
      final callable = _functions.httpsCallable('seedAttendancesDemo');
      final result = await callable.call();
      if (!mounted) return;
      if (Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.data['message'] ?? '投入完了'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        _showErrorDialog(result.data['error'] ?? '投入に失敗しました');
      }
    } catch (e) {
      debugPrint('seedAttendancesDemo error: $e');
      if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (e is FirebaseFunctionsException) {
        if (e.code == 'unauthenticated' || e.code == 'permission-denied') {
          _showErrorDialog('認証エラー: 管理者でログインしてから再度お試しください。');
          return;
        }
      }
      _showErrorDialog('投入に失敗しました: $e');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
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

  /// 未会計billsの移管: 取得 → 一覧ダイアログ → 確定 or 0件表示（Phase6 Step2）
  Future<void> _openUnsettledBillsFlow() async {
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    setState(() => _isProcessing = true);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('未会計伝票を取得中...'),
          ],
        ),
      ),
    );
    try {
      final callable = _functions.httpsCallable('getUnsettledBillsForClose');
      final result = await callable.call();
      if (!mounted) return;
      if (Navigator.of(context).canPop()) Navigator.of(context).pop(); // ローディングを閉じる
      if (result.data['success'] != true) {
        _showErrorDialog(result.data['error'] ?? '未会計伝票の取得に失敗しました');
        return;
      }
      final data = result.data['data'] as List<dynamic>? ?? [];
      if (data.isEmpty) {
        showDialog(
          context: context,
          builder: (BuildContext ctx) => AlertDialog(
            title: const Text('未会計billsの移管'),
            content: const Text('未会計の伝票はありません。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
        return;
      }
      final list = data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      _showUnsettledBillsListDialog(list);
    } catch (e) {
      debugPrint('getUnsettledBillsForClose error: $e');
      if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (e is FirebaseFunctionsException) {
        if (e.code == 'unauthenticated' || e.code == 'permission-denied') {
          _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
          return;
        }
      }
      _showErrorDialog('未会計伝票の取得に失敗しました: $e');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _showUnsettledBillsListDialog(List<Map<String, dynamic>> list) {
    showDialog(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          title: const Text('未会計billsの移管'),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${list.length}件の未会計伝票があります。全件に閉店時ラベルを付与します。', style: const TextStyle(fontSize: 12)),
                  const SizedBox(height: 12),
                  ...list.map((e) {
                    final createdAt = e['createdAt'] as String?;
                    final dispDate = createdAt != null && createdAt.isNotEmpty
                        ? _formatIsoToDisplay(createdAt)
                        : '—';
                    final amount = e['displayAmount'];
                    final amountStr = amount is int ? '¥$amount' : (amount is double ? '¥${amount.toStringAsFixed(0)}' : (amount?.toString() ?? '—'));
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '${e['pokerName'] ?? '—'}  $amountStr  入店: $dispDate',
                        style: const TextStyle(fontSize: 13),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () {
                final billIds = list.map((e) => e['billId'] as String?).whereType<String>().toList();
                final amountsByBillId = <String, double>{};
                for (final e in list) {
                  final id = e['billId'] as String?;
                  if (id == null || id.isEmpty) continue;
                  final amount = e['displayAmount'];
                  if (amount is num) {
                    amountsByBillId[id] = amount.toDouble();
                  }
                }
                Navigator.of(ctx).pop();
                _executeApplyCloseSnapshot(billIds, amountsByBillId);
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.brown, foregroundColor: Colors.white),
              child: const Text('全件確定'),
            ),
          ],
        );
      },
    );
  }

  static String _skippedReasonDisplayText(String reason) {
    switch (reason) {
      case 'invalid_closeSnapshot_shape':
        return 'closeSnapshotが壊れているため手動修正が必要';
      case 'missing_amount':
        return '金額が取得できません（データ不備）';
      case 'missing_user_id':
        return 'ユーザーIDが無いためスキップ';
      default:
        return reason;
    }
  }

  /// Firestore の Timestamp は UTC で保持されているため、ISO 文字列をパース後はローカル（JST）に変換して表示する。
  static String _formatIsoToDisplay(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return DateFormat('yyyy/MM/dd HH:mm').format(dt.toLocal());
    } catch (_) {
      return iso;
    }
  }

  Future<void> _executeApplyCloseSnapshot(List<String> billIds, Map<String, double> amountsByBillId) async {
    if (billIds.isEmpty) return;
    final user = _auth.currentUser;
    if (user == null) {
      _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
      return;
    }
    setState(() => _isProcessing = true);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) => const AlertDialog(
        content: Row(
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('閉店時ラベルを付与中...'),
          ],
        ),
      ),
    );
    try {
      final callable = _functions.httpsCallable('applyCloseSnapshot');
      final result = await callable.call({
        'billIds': billIds,
        'amountsByBillId': amountsByBillId,
      });
      if (!mounted) return;
      if (Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (result.data['success'] != true) {
        _showErrorDialog(result.data['error'] ?? '閉店時ラベルの付与に失敗しました');
        return;
      }
      final updatedBillIds = List<String>.from(result.data['updatedBillIds'] ?? []);
      final skippedRaw = result.data['skipped'] as List<dynamic>? ?? [];
      final skipped = skippedRaw.map((e) => Map<String, String>.from(e as Map)).toList();
      final usersUpdateFailed = List<String>.from(result.data['usersUpdateFailed'] as List<dynamic>? ?? []);
      _showApplyCloseSnapshotResultDialog(updatedBillIds, skipped, usersUpdateFailed, amountsByBillId);
    } catch (e) {
      debugPrint('applyCloseSnapshot error: $e');
      if (mounted && Navigator.of(context).canPop()) Navigator.of(context).pop();
      if (e is FirebaseFunctionsException) {
        if (e.code == 'unauthenticated' || e.code == 'permission-denied') {
          _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
          return;
        }
      }
      _showErrorDialog('閉店時ラベルの付与に失敗しました: $e');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _showApplyCloseSnapshotResultDialog(
    List<String> updatedBillIds,
    List<Map<String, String>> skipped,
    List<String> usersUpdateFailed,
    Map<String, double> amountsByBillId,
  ) {
    // データ不備・上書き不可は再試行しても成功しづらいため除外。txn_failed のみ再試行対象。
    final retryable = skipped
        .where((e) =>
            e['reason'] != 'already_marked' &&
            e['reason'] != 'invalid_closeSnapshot_shape' &&
            e['reason'] != 'missing_user_id' &&
            e['reason'] != 'missing_amount')
        .toList();
    showDialog(
      context: context,
      builder: (BuildContext ctx) {
        return AlertDialog(
          title: const Text('移管結果'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('完了: ${updatedBillIds.length}件', style: const TextStyle(fontWeight: FontWeight.bold)),
                if (usersUpdateFailed.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Text('ユーザー集計更新に失敗したuserId:', style: TextStyle(fontWeight: FontWeight.bold)),
                  Padding(
                    padding: const EdgeInsets.only(left: 8, top: 4),
                    child: Text(usersUpdateFailed.join(', '), style: const TextStyle(fontSize: 12)),
                  ),
                ],
                if (skipped.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Text('スキップ:', style: TextStyle(fontWeight: FontWeight.bold)),
                  ...skipped.map((e) {
                    final reason = e['reason'] ?? '—';
                    final displayReason = _skippedReasonDisplayText(reason);
                    return Padding(
                      padding: const EdgeInsets.only(left: 8, top: 4),
                      child: Text('${e['billId'] ?? '—'} … $displayReason', style: const TextStyle(fontSize: 12)),
                    );
                  }),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('閉じる'),
            ),
            if (retryable.isNotEmpty)
              ElevatedButton(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  final ids = retryable.map((e) => e['billId'] ?? '').where((s) => s.isNotEmpty).toList();
                  final retryAmounts = <String, double>{};
                  for (final id in ids) {
                    final v = amountsByBillId[id];
                    if (v != null) retryAmounts[id] = v;
                  }
                  _executeApplyCloseSnapshot(ids, retryAmounts);
                },
                style: ElevatedButton.styleFrom(backgroundColor: Colors.orange, foregroundColor: Colors.white),
                child: const Text('再試行'),
              ),
          ],
        );
      },
    );
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