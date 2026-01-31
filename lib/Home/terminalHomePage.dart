import 'package:amuse_app_template/Home/stayingUsersListPage.dart';
import 'package:amuse_app_template/AttendanceManagement/staffAttendancePage.dart';
import 'package:amuse_app_template/OrderView/MenuView/categorySelectPage.dart';
import 'package:amuse_app_template/OrderView/MenuView/menuEditorListPage.dart';
import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:amuse_app_template/UserLogin/userCheckInPage.dart';
import 'package:amuse_app_template/tournament/scheduling/pages/scheduled_tournament_list_page.dart';
import 'package:amuse_app_template/Home/systemSettingsPage.dart';
import 'package:amuse_app_template/tournament/scheduling/pages/tournament_creation_menu_page.dart';
import 'package:amuse_app_template/Accounting/accountingPage.dart';
import 'package:amuse_app_template/Accounting/payment_split_test_page.dart';
import 'package:amuse_app_template/Accounting/postAccountingAdjustmentsPage.dart';
import 'package:amuse_app_template/sideGame/pages/side_game_table_list.dart';
import 'package:amuse_app_template/OrderView/OrderManagement/order_management_page.dart';
import 'package:amuse_app_template/dashboard/home/dashboard_home_page.dart';
import 'package:amuse_app_template/Utils/firestore_size_page.dart';
import 'package:amuse_app_template/tournament/pages/tournament_select_page.dart';
import 'package:amuse_app_template/tournament/pages/table_select_page.dart';
import 'package:amuse_app_template/tournament/active/pages/table_detail_page.dart';
import 'package:amuse_app_template/tournament/active/pages/blind_timer_page.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'dart:async';

class terminalHomePage extends StatefulWidget {
  const terminalHomePage({super.key});

  @override
  State<terminalHomePage> createState() => _terminalHomePageState();
}

class _terminalHomePageState extends State<terminalHomePage> {
  final DeviceService _deviceService = DeviceService();
  bool _loadingDevice = true;
  bool _isAdminDevice = false;
  Map<String, bool> _deviceOptions = const {};

  @override
  void initState() {
    super.initState();
    _initDevice();
  }

  Future<void> _initDevice() async {
    final device = await _deviceService.getCurrentDevice();
    if (!mounted) return;
    setState(() {
      _loadingDevice = false;
      _isAdminDevice = (device?.role == 'admin');
      _deviceOptions = device?.options ?? const {};
    });
  }

  /// 卓ページへの遷移（トーナメント選択→卓選択→卓詳細ページ）
  Future<void> _navigateToTablePage(BuildContext context) async {
    // デバイスに卓番が指定されているか確認
    final device = await _deviceService.getCurrentDevice();
    final myTableId = device?.getTableIdForOption(DeviceOptionKeys.tournamentTable);
    final hasTableAssignment = myTableId != null;

    if (!context.mounted) return;

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TournamentSelectPage(
          title: '卓ページ - トーナメント選択',
          filterByDeviceTable: hasTableAssignment, // 卓番指定がある場合のみフィルタ
          onSelected: (tournamentId, tournamentName) {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => TableSelectPage(
                  tournamentId: tournamentId,
                  tournamentName: tournamentName,
                  onSelected: (tableId, tableName) {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => TableDetailPage(
                          tournamentId: tournamentId,
                          tableId: tableId,
                        ),
                      ),
                    );
                  },
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  /// ブラインドタイマーへの遷移（トーナメント選択→タイマーページ）
  void _navigateToBlindTimer(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TournamentSelectPage(
          title: 'ブラインドタイマー - トーナメント選択',
          onSelected: (tournamentId, tournamentName) {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => BlindTimerPage(
                  tournamentId: tournamentId,
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  /// 開閉店管理ダイアログを表示
  void _showStoreManagementDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: const Text('開閉店管理'),
          content: const Text('開店または閉店を実行しますか？'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('キャンセル'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                _callCreateInitialStateDoc(context);
              },
              child: const Text('初期化', style: TextStyle(color: Colors.blue)),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                _callOpenStore(context);
              },
              child: const Text('開店', style: TextStyle(color: Colors.green)),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                _callCloseStore(context);
              },
              child: const Text('閉店', style: TextStyle(color: Colors.red)),
            ),
          ],
        );
      },
    );
  }

  /// createInitialStateDocCallable Cloud Functionを呼び出す
  Future<void> _callCreateInitialStateDoc(BuildContext context) async {
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    OverlayEntry? loadingOverlay;
    bool loadingShown = false;

    void hideLoading() {
      if (loadingShown) {
        try {
          loadingOverlay?.remove();
        } catch (_) {
          // noop
        }
        loadingOverlay = null;
        loadingShown = false;
      }
    }

    try {
      // 認証状態を確認（未認証の場合は匿名認証を実行）
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      // ローディング表示
      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('初期化処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      if (overlayState != null) {
        overlayState.insert(loadingOverlay!);
        loadingShown = true;
      }

      // Cloud Function呼び出し
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('createInitialStateDocCallable');

      final result = await callable.call({}).timeout(
        const Duration(seconds: 30),
        onTimeout: () => throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
      );

      hideLoading();

      if (!context.mounted) return;

      final data = result.data as Map<String, dynamic>? ?? {};
      final bool success = data['success'] == true;

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(data['message'] ?? '初期化が完了しました'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('初期化に失敗しました'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      hideLoading();
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('エラー: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  /// openStore Cloud Functionを呼び出す
  Future<void> _callOpenStore(BuildContext context) async {
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    OverlayEntry? loadingOverlay;
    bool loadingShown = false;

    void hideLoading() {
      if (loadingShown) {
        try {
          loadingOverlay?.remove();
        } catch (_) {
          // noop
        }
        loadingOverlay = null;
        loadingShown = false;
      }
    }

    try {
      // 認証状態を確認（未認証の場合は匿名認証を実行）
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      // ローディング表示
      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('開店処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      if (overlayState != null) {
        overlayState.insert(loadingOverlay!);
        loadingShown = true;
      }

      // Cloud Function呼び出し
      // 注意: リージョン指定が必要な場合は、Firebase Functionsのデフォルト設定で
      // リージョンが設定されている場合、instanceForを使用する必要がありますが、
      // 認証トークンが正しく送信されない可能性があるため、まずはinstanceを試します
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('openStore');

      final result = await callable.call({}).timeout(
        const Duration(seconds: 30),
        onTimeout: () => throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
      );

      hideLoading();

      if (!context.mounted) return;

      final data = result.data as Map<String, dynamic>? ?? {};
      final bool success = data['success'] == true;

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('開店しました。営業日: ${data['businessDateKey'] ?? '不明'}'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('開店に失敗しました'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      hideLoading();
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('エラー: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  /// closeStore Cloud Functionを呼び出す
  Future<void> _callCloseStore(BuildContext context) async {
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    OverlayEntry? loadingOverlay;
    bool loadingShown = false;

    void hideLoading() {
      if (loadingShown) {
        try {
          loadingOverlay?.remove();
        } catch (_) {
          // noop
        }
        loadingOverlay = null;
        loadingShown = false;
      }
    }

    try {
      // 認証状態を確認（未認証の場合は匿名認証を実行）
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      // ローディング表示
      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('閉店処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      if (overlayState != null) {
        overlayState.insert(loadingOverlay!);
        loadingShown = true;
      }

      // Cloud Function呼び出し
      // 注意: リージョン指定が必要な場合は、Firebase Functionsのデフォルト設定で
      // リージョンが設定されている場合、instanceForを使用する必要がありますが、
      // 認証トークンが正しく送信されない可能性があるため、まずはinstanceを試します
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('closeStore');

      final result = await callable.call({}).timeout(
        const Duration(seconds: 30),
        onTimeout: () => throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
      );

      hideLoading();

      if (!context.mounted) return;

      final data = result.data as Map<String, dynamic>? ?? {};
      final bool success = data['success'] == true;

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('閉店しました。最終営業日: ${data['lastClosedBusinessDateKey'] ?? '不明'}'),
            backgroundColor: Colors.orange,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('閉店に失敗しました'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      hideLoading();
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('エラー: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final buttonHeight = (screenHeight - kToolbarHeight - 80) / 2.3;

    // 通常のボタン（直接遷移）
    final List<({String label, Widget destination, String? optionKey})> buttons = [
      (label: 'ユーザー作成', destination: const CreateUserAccount(), optionKey: null),
      (label: 'ユーザーログイン', destination: const UserCheckInPage(), optionKey: DeviceOptionKeys.userEntryExit),
      (label: 'メニュー追加', destination: const MenuEditorListPage(), optionKey: null),
      (label: '注文画面', destination: const CategorySelectPage(), optionKey: DeviceOptionKeys.order),
      (label: '入店中user一覧', destination: const StayingUsersListPage(), optionKey: null),
      (label: 'Tournament 作成', destination: const TournamentCreationMenuPage(), optionKey: DeviceOptionKeys.tournament),
      (label: 'Tournament Home', destination: const ScheduledTournamentListPage(), optionKey: DeviceOptionKeys.tournament),
      (label: 'sideGame', destination: const SideGameTableListPage(), optionKey: DeviceOptionKeys.sideGame),
      (label: '注文管理', destination: const OrderManagementPage(), optionKey: DeviceOptionKeys.kitchen),
      (label: 'スタッフ打刻', destination: const StaffAttendancePage(), optionKey: DeviceOptionKeys.staffEntryExit),
      (label: '会計管理', destination: const AccountingPage(), optionKey: DeviceOptionKeys.accounting),
      (label: '売上ダッシュボード', destination: const DashboardHomePage(), optionKey: null),
      (label: '支払い分割テスト', destination: const PaymentSplitTestPage(), optionKey: null),
      (label: 'Firestoreサイズ計算', destination: const FirestoreSizePage(), optionKey: null),
      // テスト用: 会計後調整画面への遷移ボタン
      (label: '会計後調整（テスト）', destination: const PostAccountingAdjustmentsPage(), optionKey: null),
    ];

    final visibleButtons = buttons.where((btn) {
      // 管理者端末は全表示
      if (_isAdminDevice) return true;
      // オプションがまだ付与されていない（空）場合は従来通り全表示
      if (_deviceOptions.isEmpty) return true;
      // オプションキーが無いボタンは常に表示（一般系）
      if (btn.optionKey == null) return true;
      // 付与済みオプションのみ表示
      return _deviceOptions[btn.optionKey!] == true;
    }).toList();

    // 特殊ボタン（ダイアログ経由で遷移）
    final showTablePageButton = _isAdminDevice ||
        _deviceOptions.isEmpty ||
        _deviceOptions[DeviceOptionKeys.tournament] == true ||
        _deviceOptions[DeviceOptionKeys.tournamentTable] == true;

    final showBlindTimerButton = _isAdminDevice ||
        _deviceOptions.isEmpty ||
        _deviceOptions[DeviceOptionKeys.tournament] == true;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Terminal ホーム'),
        centerTitle: true,
        actions: [
          // 一時的な開閉店管理ボタン（Phase1用）
          if (_isAdminDevice)
            IconButton(
              icon: const Icon(Icons.store),
              onPressed: () => _showStoreManagementDialog(context),
              tooltip: '開閉店管理',
            ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const SystemSettingsPage(),
                ),
              );
            },
            tooltip: 'システム設定',
          ),
        ],
      ),
      body: _loadingDevice
          ? const Center(child: CircularProgressIndicator())
          : GridView.custom(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(), // スクロール可能に変更
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 5,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          mainAxisExtent: buttonHeight,
        ),
        childrenDelegate: SliverChildListDelegate.fixed([
          // 通常ボタン
          ...visibleButtons.map((btn) {
            return ElevatedButton(
              onPressed: () async {
                // オプションチェック（optionKeyが指定されている場合のみ）
                if (btn.optionKey != null) {
                  final ok = await _deviceService.hasOption(btn.optionKey!);
                  if (!ok) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('権限がありません: ${DeviceOptionKeys.label(btn.optionKey!)}'),
                          backgroundColor: Colors.red,
                        ),
                      );
                    }
                    return;
                  }
                }
                if (context.mounted) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => btn.destination),
                  );
                }
              },
              child: Text(btn.label, textAlign: TextAlign.center),
            );
          }),
          // 卓ページボタン
          if (showTablePageButton)
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.teal,
                foregroundColor: Colors.white,
              ),
              onPressed: () => _navigateToTablePage(context),
              child: const Text('卓ページ', textAlign: TextAlign.center),
            ),
          // ブラインドタイマーボタン
          if (showBlindTimerButton)
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.deepPurple,
                foregroundColor: Colors.white,
              ),
              onPressed: () => _navigateToBlindTimer(context),
              child: const Text('ブラインドタイマー', textAlign: TextAlign.center),
            ),
        ]),
      ),
    );
  }
}

class PlaceholderPage extends StatelessWidget {
  final String title;

  const PlaceholderPage({super.key, required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title の遷移先（未実装）')),
    );
  }
}
