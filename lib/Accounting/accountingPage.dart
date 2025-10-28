import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/Accounting/accountingHistoryPage.dart';
import 'package:amuse_app_template/Accounting/accountingEditDialog.dart';
import 'package:amuse_app_template/Accounting/accountingCancelDialog.dart';
import 'package:amuse_app_template/Accounting/refundProcessingDialog.dart';
import 'package:amuse_app_template/Accounting/paymentMethodDialog.dart';
import 'package:amuse_app_template/Accounting/categoryDetailDialog.dart';
import 'package:amuse_app_template/Accounting/categoryPaymentMethodDialog.dart';
import 'package:amuse_app_template/globalConstant.dart';

class AccountingPage extends StatefulWidget {
  const AccountingPage({super.key});

  @override
  State<AccountingPage> createState() => _AccountingPageState();
}

class _AccountingPageState extends State<AccountingPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  
  List<Map<String, dynamic>> _activeBills = [];
  List<Map<String, dynamic>> _settledBills = [];
  bool _isLoading = false;
  bool _showSettledBills = false;

  @override
  void initState() {
    super.initState();
    _loadActiveBills();
    _loadSettledBills();
  }

  // 営業日を計算する関数
  String _getBusinessDate() {
    final now = DateTime.now();
    final closeHour = GlobalConstants.STORE_CLOSE_HOUR;
    
    // 現在時刻が店舗締め時間より前の場合は前日の営業日
    if (now.hour < closeHour) {
      final businessDate = now.subtract(const Duration(days: 1));
      return businessDate.toIso8601String().split('T')[0];
    } else {
      // 店舗締め時間以降は当日の営業日
      return now.toIso8601String().split('T')[0];
    }
  }

  Future<void> _loadActiveBills() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // 営業日の未会計の請求書を取得
      final businessDate = _getBusinessDate();
      final querySnapshot = await _firestore
          .collection('todaysBills')
          .where('date', isEqualTo: businessDate)
          .where('status', isEqualTo: 'open')
          .get();

      setState(() {
        _activeBills = querySnapshot.docs.map((doc) {
          final data = doc.data();
          return {
            'id': doc.id,
            ...data,
          };
        }).toList();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('データの取得に失敗しました: $e')),
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

  Future<void> _loadSettledBills() async {
    try {
      // 営業日の会計完了済みの請求書を取得
      final businessDate = _getBusinessDate();
      final querySnapshot = await _firestore
          .collection('todaysBills')
          .where('date', isEqualTo: businessDate)
          .where('status', isEqualTo: 'settled')
          .orderBy('accountingCompletedAt', descending: true)
          .get();

      setState(() {
        _settledBills = querySnapshot.docs.map((doc) {
          final data = doc.data();
          return {
            'id': doc.id,
            ...data,
          };
        }).toList();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('会計完了データの取得に失敗しました: $e')),
        );
      }
    }
  }

  Future<void> _startAccounting(String billId) async {
    // 請求書データを取得
    final bill = _activeBills.firstWhere((b) => b['id'] == billId, orElse: () => {});
    
    if (bill.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('請求書が見つかりません')),
      );
      return;
    }

    // カテゴリ別支払い方法選択ダイアログを表示
    final selectedPaymentMethodsByCategory = await showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (context) => CategoryPaymentMethodDialog(bill: bill),
    );

    // キャンセルされた場合は何もしない
    if (selectedPaymentMethodsByCategory == null) return;

    // ダイアログを閉じた後に会計処理を実行
    try {
      final result = await _functions.httpsCallable('startAccounting').call({
        'billId': billId,
        'paymentMethodsByCategory': selectedPaymentMethodsByCategory,
      });

      if (mounted) {
        if (result.data['success'] == true) {
          // 会計開始成功 - 会計完了するか確認するダイアログを表示
          final shouldComplete = await showDialog<bool>(
            context: context,
            barrierDismissible: false,
            builder: (context) => AlertDialog(
              title: const Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green),
                  SizedBox(width: 8),
                  Text('会計開始完了'),
                ],
              ),
              content: const Text(
                '会計を開始しました。\n\nこのまま会計を完了しますか？',
                style: TextStyle(fontSize: 16),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text(
                    '後で',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text(
                    '会計完了',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          );

          if (shouldComplete == true) {
            // 会計完了を実行
            await _completeAccounting(billId);
          } else {
            // 後で完了する場合は、データを再読み込み
            _loadActiveBills();
          }
        } else {
          // エラーメッセージをポップアップで表示
          await showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Row(
                children: [
                  Icon(Icons.error_outline, color: Colors.red),
                  SizedBox(width: 8),
                  Text('会計開始エラー'),
                ],
              ),
              content: Text(result.data['message'] ?? '会計開始に失敗しました'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('閉じる'),
                ),
              ],
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        // エラーをポップアップで表示
        await showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.error_outline, color: Colors.red),
                SizedBox(width: 8),
                Text('会計開始エラー'),
              ],
            ),
            content: Text(_extractUserFriendlyMessage(e.toString())),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('閉じる'),
              ),
            ],
          ),
        );
      }
    }
  }

  Future<void> _completeAccounting(String billId) async {
    try {
      final result = await _functions.httpsCallable('completeAccounting').call({
        'billId': billId,
      });

      // デバッグログを追加
      print('会計完了結果: ${result.data}');
      print('success値: ${result.data['success']}');
      print('successの型: ${result.data['success'].runtimeType}');

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('会計を完了しました')),
        );
        _loadActiveBills(); // データを再読み込み
        _loadSettledBills(); // 会計完了データも再読み込み
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('会計完了に失敗しました: ${result.data['message']}')),
        );
      }
    } catch (e) {
      print('会計完了エラー: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('会計完了に失敗しました: $e')),
      );
    }
  }

  // 支払い方法の表示名を取得
  String _getPaymentMethodName(String paymentMethod) {
    switch (paymentMethod) {
      case 'cash':
        return '現金';
      case 'credit_card':
        return 'クレジットカード';
      case 'electronic_money':
        return '電子マネー';
      case 'pointA':
        return 'ポイントA';
      case 'pointB':
        return 'ポイントB';
      case 'sideGameTip':
        return 'サイドゲームチップ';
      default:
        return '現金';
    }
  }

  // 支払い方法のアイコンを取得
  IconData _getPaymentMethodIcon(String paymentMethod) {
    switch (paymentMethod) {
      case 'cash':
        return Icons.attach_money;
      case 'credit_card':
        return Icons.credit_card;
      case 'electronic_money':
        return Icons.qr_code;
      case 'pointA':
        return Icons.star;
      case 'pointB':
        return Icons.stars;
      case 'sideGameTip':
        return Icons.casino;
      default:
        return Icons.attach_money;
    }
  }

  // エラーメッセージからユーザーフレンドリーな部分のみを抽出
  String _extractUserFriendlyMessage(String errorMessage) {
    // Firebase Functions のエラーメッセージから実際のメッセージ部分を抽出
    final regex = RegExp(r'の残高が不足しています。現在の残高: \d+円、必要な金額: \d+円');
    final match = regex.firstMatch(errorMessage);
    
    if (match != null) {
      // マッチした部分の前後を含めて、より自然なメッセージを構築
      final beforeMatch = errorMessage.substring(0, match.start);
      final matchedPart = match.group(0)!;
      
      // 技術的な部分を除去して、ポイント名と残高不足メッセージのみを抽出
      if (beforeMatch.contains('ポイントA')) {
        return 'ポイントA$matchedPart';
      } else if (beforeMatch.contains('ポイントB')) {
        return 'ポイントB$matchedPart';
      } else if (beforeMatch.contains('サイドゲームチップ')) {
        return 'サイドゲームチップ$matchedPart';
      }
    }
    
    // マッチしない場合は元のメッセージを返す（フォールバック）
    return errorMessage;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('会計管理'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const AccountingHistoryPage(),
                ),
              );
            },
            tooltip: '会計履歴',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              _loadActiveBills();
              _loadSettledBills();
            },
            tooltip: '更新',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : DefaultTabController(
              length: 2,
              child: Column(
                children: [
                  const TabBar(
                    tabs: [
                      Tab(text: '未会計'),
                      Tab(text: '会計完了'),
                    ],
                  ),
                  Expanded(
                    child: TabBarView(
                      children: [
                        _buildActiveBillsTab(),
                        _buildSettledBillsTab(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildActiveBillsTab() {
    if (_activeBills.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.receipt_long,
              size: 64,
              color: Colors.grey,
            ),
            SizedBox(height: 16),
            Text(
              '未会計の請求書はありません',
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _activeBills.length,
      itemBuilder: (context, index) {
        final bill = _activeBills[index];
        return _buildBillCard(bill);
      },
    );
  }

  Widget _buildSettledBillsTab() {
    if (_settledBills.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.check_circle_outline,
              size: 64,
              color: Colors.grey,
            ),
            SizedBox(height: 16),
            Text(
              '会計完了済みの請求書はありません',
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _settledBills.length,
      itemBuilder: (context, index) {
        final bill = _settledBills[index];
        return _buildSettledBillCard(bill);
      },
    );
  }

  Widget _buildBillCard(Map<String, dynamic> bill) {
    final totalPrice = bill['totalPrice'] ?? 0;
    final status = bill['status'] ?? 'open';
    final accountingStarted = bill['accountingStartedAt'] != null;
    final pokerName = bill['pokerName'] ?? '不明';
    final createdAt = bill['createdAt']?.toDate() ?? DateTime.now();

    return Card(
      elevation: 4,
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ヘッダー
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  pokerName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: accountingStarted ? Colors.orange : Colors.blue,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    accountingStarted ? '会計中' : '未会計',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '作成日時: ${_formatDateTime(createdAt)}',
              style: TextStyle(
                color: Colors.grey[600],
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 16),

            // 会計額表示
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue[200]!),
              ),
              child: Column(
                children: [
                  Text(
                    '¥${totalPrice.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '会計額',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.blue,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 内訳表示
            _buildBillBreakdown(bill),

            const SizedBox(height: 16),

            // アクションボタン
            if (accountingStarted)
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _completeAccounting(bill['id']),
                      icon: const Icon(Icons.check),
                      label: const Text('会計完了'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              )
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _showEditDialog(bill),
                      icon: const Icon(Icons.edit),
                      label: const Text('修正'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.blue,
                        side: const BorderSide(color: Colors.blue),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: () => _startAccounting(bill['id']),
                      icon: const Icon(Icons.play_arrow),
                      label: const Text('会計開始'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSettledBillCard(Map<String, dynamic> bill) {
    final billId = bill['id'] ?? 'unknown';
    final totalPrice = bill['totalPrice'] ?? 0;
    final pokerName = bill['pokerName'] ?? '不明';
    final accountingCompletedAt = bill['accountingCompletedAt']?.toDate() ?? DateTime.now();
    final refundAmount = bill['refundAmount'] ?? 0;
    final paymentMethod = bill['paymentMethod'] ?? 'cash';
    
    print('=== _buildSettledBillCard ===');
    print('billId: $billId, pokerName: $pokerName');

    return Card(
      elevation: 4,
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ヘッダー
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  pokerName,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.green,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    '会計完了',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            // 会計完了日時
            Text(
              '会計完了: ${accountingCompletedAt.year}年${accountingCompletedAt.month}月${accountingCompletedAt.day}日 ${accountingCompletedAt.hour.toString().padLeft(2, '0')}:${accountingCompletedAt.minute.toString().padLeft(2, '0')}',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade600,
              ),
            ),

            const SizedBox(height: 16),

            // 合計金額
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green.shade200),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    '会計額',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.green,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    '${totalPrice}円',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.green.shade700,
                    ),
                  ),
                ],
              ),
            ),


            const SizedBox(height: 16),

            // 内訳表示
            _buildBillBreakdown(bill),

            const SizedBox(height: 16),

            // アクションボタン
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showEditDialog(bill),
                    icon: const Icon(Icons.edit),
                    label: const Text('修正'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.blue,
                      side: const BorderSide(color: Colors.blue),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showCancelDialog(bill),
                    icon: const Icon(Icons.cancel),
                    label: const Text('キャンセル'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBillBreakdown(Map<String, dynamic> bill) {
    final breakdown = <Widget>[];

    // 入店料（extraCost配列から取得）
    final extraCosts = bill['extraCost'] as List<dynamic>? ?? [];
    int totalExtraCost = 0;
    for (final extraCost in extraCosts) {
      totalExtraCost += (extraCost['price'] as num? ?? 0).toInt();
    }
    if (totalExtraCost > 0) {
      breakdown.add(_buildBreakdownItem('入店料', totalExtraCost, bill, 'extraCost'));
    }

    // トーナメント参加費
    final tournamentsData = bill['tournaments'];
    int totalTournamentFee = 0;
    
    // tournamentsはMapまたはListの可能性があるため、型チェックを行う
    if (tournamentsData is Map<String, dynamic>) {
      for (final tournamentEntry in tournamentsData.values) {
        if (tournamentEntry is Map<String, dynamic>) {
          totalTournamentFee += (tournamentEntry['entryFee'] as num? ?? 0).toInt();
        }
      }
    } else if (tournamentsData is List) {
      // Listの場合は空配列なので何もしない
    }
    
    if (totalTournamentFee > 0) {
      breakdown.add(_buildBreakdownItem('トーナメント参加費', totalTournamentFee, bill, 'tournaments'));
    }

    // フード・ドリンク（items配列から取得）
    final items = bill['items'] as List<dynamic>? ?? [];
    int totalOrderAmount = 0;
    for (final item in items) {
      final price = (item['price'] as num? ?? 0).toInt();
      final quantity = (item['quantity'] as num? ?? 0).toInt();
      totalOrderAmount += price * quantity;
    }
    if (totalOrderAmount > 0) {
      breakdown.add(_buildBreakdownItem('フード・ドリンク', totalOrderAmount, bill, 'items'));
    }

    // サイドゲームチップ（sideGameChip配列から取得、action='purchase'のみ）
    final sideGameChips = bill['sideGameChip'] as List<dynamic>? ?? [];
    int totalSideGameChipAmount = 0;
    for (final chip in sideGameChips) {
      // action='purchase'のデータのみを集計
      if (chip['action'] == 'purchase') {
        totalSideGameChipAmount += (chip['price'] as num? ?? 0).toInt();
      }
    }
    if (totalSideGameChipAmount > 0) {
      breakdown.add(_buildBreakdownItem('サイドゲームチップ', totalSideGameChipAmount, bill, 'sideGameChip'));
    }

    if (breakdown.isEmpty) {
      breakdown.add(const Text(
        '内訳なし',
        style: TextStyle(color: Colors.grey),
      ));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '内訳',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        ...breakdown,
      ],
    );
  }

  Widget _buildBreakdownItem(String label, int amount, Map<String, dynamic> bill, String categoryKey) {
    // カテゴリ別支払い方法を取得
    final paymentMethodsByCategoryData = bill['paymentMethodsByCategory'];
    Map<String, dynamic> paymentMethodsByCategory = {};
    
    // paymentMethodsByCategoryがMapの場合のみ使用
    if (paymentMethodsByCategoryData is Map<String, dynamic>) {
      paymentMethodsByCategory = paymentMethodsByCategoryData;
    }
    
    final paymentValue = paymentMethodsByCategory[categoryKey] ?? 'cash';

    // デバッグログ
    print('=== _buildBreakdownItem ===');
    print('label: $label, categoryKey: $categoryKey');
    print('paymentValue type: ${paymentValue.runtimeType}');
    print('paymentValue: $paymentValue');

    // 支払い方法のバッジを作成
    List<Widget> paymentBadges = [];
    
    // 文字列の場合（単一支払い方法）- 既存の動作
    if (paymentValue is String) {
      print('String型の支払い方法: $paymentValue');
      paymentBadges.add(_buildPaymentBadge(paymentValue, null));
    }
    // 配列の場合（分割支払い）- 新機能
    else if (paymentValue is List) {
      print('配列型の支払い方法を処理中: ${paymentValue.length}個');
      for (int i = 0; i < paymentValue.length; i++) {
        final split = paymentValue[i];
        print('split[$i]: $split, type: ${split.runtimeType}');
        
        if (split is Map) {
          final method = split['method']?.toString() ?? 'cash';
          final splitAmount = (split['amount'] as num?)?.toInt();
          print('  → method: $method, amount: $splitAmount');
          paymentBadges.add(_buildPaymentBadge(method, splitAmount));
          
          if (i < paymentValue.length - 1) {
            paymentBadges.add(const SizedBox(width: 4));
            paymentBadges.add(Text('+', style: TextStyle(fontSize: 10, color: Colors.grey.shade600)));
            paymentBadges.add(const SizedBox(width: 4));
          }
        } else {
          print('  ⚠️ split is not Map: ${split.runtimeType}');
        }
      }
      print('paymentBadges count: ${paymentBadges.length}');
    } else {
      print('⚠️ Unknown paymentValue type: ${paymentValue.runtimeType}');
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: InkWell(
        onTap: () => _showCategoryDetail(label, bill),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(label),
                  const SizedBox(width: 4),
                  Icon(
                    Icons.info_outline,
                    size: 16,
                    color: Colors.grey.shade600,
                  ),
                ],
              ),
              Row(
                children: [
                  Text(
                    '¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(width: 8),
                  ...paymentBadges,
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // 支払い方法バッジを作成
  Widget _buildPaymentBadge(String method, int? amount) {
    // サイドゲームチップの場合は換算して表示
    String displayText;
    if (method == 'sideGameTip' && amount != null) {
      final chipValue = (amount * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE).toInt();
      displayText = '${_getPaymentMethodName(method)} チップ${amount}枚 (¥${chipValue.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')})';
    } else if (amount != null) {
      displayText = '${_getPaymentMethodName(method)} ¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}';
    } else {
      displayText = _getPaymentMethodName(method);
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _getPaymentMethodIcon(method),
            size: 14,
            color: Colors.blue.shade700,
          ),
          const SizedBox(width: 4),
          Text(
            displayText,
            style: TextStyle(
              fontSize: 11,
              color: Colors.blue.shade700,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }


  void _showCategoryDetail(String categoryName, Map<String, dynamic> bill) {
    List<dynamic> items = [];
    
    switch (categoryName) {
      case '入店料':
        items = bill['extraCost'] as List<dynamic>? ?? [];
        break;
      case 'トーナメント参加費':
        final tournamentsData = bill['tournaments'];
        if (tournamentsData is Map<String, dynamic>) {
          items = tournamentsData.values.toList();
        }
        break;
      case 'フード・ドリンク':
        items = bill['items'] as List<dynamic>? ?? [];
        break;
      case 'サイドゲームチップ':
        final allSideGameChips = bill['sideGameChip'] as List<dynamic>? ?? [];
        // action='purchase'のデータのみを表示
        items = allSideGameChips.where((chip) => chip['action'] == 'purchase').toList();
        break;
    }

    if (items.isNotEmpty) {
      showDialog(
        context: context,
        builder: (context) => CategoryDetailDialog(
          categoryName: categoryName,
          items: items,
          totalAmount: _calculateCategoryTotal(categoryName, bill),
        ),
      );
    }
  }

  int _calculateCategoryTotal(String categoryName, Map<String, dynamic> bill) {
    switch (categoryName) {
      case '入店料':
        final extraCosts = bill['extraCost'] as List<dynamic>? ?? [];
        return extraCosts.fold(0, (sum, item) => sum + ((item['price'] as num? ?? 0).toInt()));
      case 'トーナメント参加費':
        final tournamentsData = bill['tournaments'];
        if (tournamentsData is Map<String, dynamic>) {
          return tournamentsData.values.fold(0, (sum, item) => sum + ((item['entryFee'] as num? ?? 0).toInt()));
        }
        return 0;
      case 'フード・ドリンク':
        final items = bill['items'] as List<dynamic>? ?? [];
        return items.fold(0, (sum, item) => sum + ((item['price'] as num? ?? 0).toInt() * (item['quantity'] as num? ?? 0).toInt()));
      case 'サイドゲームチップ':
        final sideGameChips = bill['sideGameChip'] as List<dynamic>? ?? [];
        // action='purchase'のデータのみを集計
        return sideGameChips
            .where((chip) => chip['action'] == 'purchase')
            .fold(0, (sum, item) => sum + ((item['price'] as num? ?? 0).toInt()));
      default:
        return 0;
    }
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.month}/${dateTime.day} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }

  void _showEditDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => AccountingEditDialog(
        bill: bill,
        onUpdated: () {
          _loadActiveBills();
          _loadSettledBills();
        },
      ),
    );
  }

  void _showCancelDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => AccountingCancelDialog(
        bill: bill,
        onUpdated: () {
          _loadActiveBills();
          _loadSettledBills();
        },
      ),
    );
  }

  void _showRefundDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => RefundProcessingDialog(
        bill: bill,
        onUpdated: () {
          _loadActiveBills();
          _loadSettledBills();
        },
      ),
    );
  }
}
