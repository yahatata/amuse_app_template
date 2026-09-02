import 'package:amuse_app_template/core/errors/app_initialize_user_facing_errors.dart';
import 'package:amuse_app_template/Home/adminHomePage.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/models/device.dart';
import 'package:amuse_app_template/pages/device_registration_page.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/payroll_config_service.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/tableDevice/pages/table_device_home_page.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'firebase_options.dart';
import 'Utils/menuItemsManager.dart';



void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform, // ⬅️ 必須！
  );

  // When: アプリ起動時
  // Where: main.dart
  // What: storeMeta/config の購読を早期開始
  // How: StoreConfigService.instance にアクセスしシングルトン構築→snapshots()購読開始。
  //      チェックイン画面への遷移までに初回snapshot到着の余裕を持たせ、latestData null によるデフォルト適用を防ぐ。
  StoreConfigService.instance;
  PayrollConfigService.instance;

  // When: アプリ起動時
  // Where: main.dart
  // What: メニューアイテムを初期取得
  // How: MenuItemsManager経由でFireStoreからデータを取得
  await MenuItemsManager.fetchMenuItems();
  
  runApp(const ProviderScope(child: MyApp()));
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Role Based Routing',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      // 日本語ローカライゼーションの設定
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('ja', 'JP'), // 日本語
        Locale('en', 'US'), // 英語（フォールバック）
      ],
      locale: const Locale('ja', 'JP'), // デフォルトを日本語に設定
      home: const AppInitializer(), // デバイス登録状態をチェックして適切な画面に遷移
    );
  }
}

/// アプリ初期化ウィジェット
class AppInitializer extends StatefulWidget {
  const AppInitializer({super.key});

  @override
  State<AppInitializer> createState() => _AppInitializerState();
}

class _AppInitializerState extends State<AppInitializer> {
  final DeviceService _deviceService = DeviceService();
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initializeApp();
  }

  Future<void> _initializeApp() async {
    try {
      // デバイス登録状態をチェック
      final isRegistered = await _deviceService.isDeviceRegistered();
      
      if (!mounted) return;

      if (isRegistered) {
        final device = await _deviceService.getCurrentDevice();

        if (!mounted) return;

        if (device == null) {
          if (mounted) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (context) => const DeviceRegistrationPage()),
            );
          }
          return;
        }

        final status = DeviceStatus.fromString(device.status);
        if (status == DeviceStatus.active) {
          if (device.role == 'admin') {
            if (mounted) {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (context) => const AdminHomePage()),
              );
            }
          } else if (device.role == 'table') {
            if (mounted) {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(
                  builder: (context) => const TableDedicatedHomePage(),
                ),
              );
            }
          } else {
            if (mounted) {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (context) => const terminalHomePage()),
              );
            }
          }
        } else if (status == DeviceStatus.blocked) {
          setState(() {
            _error = 'このデバイスはブロックされています。管理者にお問い合わせください。';
            _isLoading = false;
          });
        } else if (status.isRemovedFromService) {
          await _deviceService.clearLocalCache();
          if (mounted) {
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(builder: (context) => const DeviceRegistrationPage()),
            );
          }
        } else {
          setState(() {
            _error = 'このデバイスは使用できません。管理者にお問い合わせください。';
            _isLoading = false;
          });
        }
      } else {
        // 未登録の場合、デバイス登録画面に遷移
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (context) => const DeviceRegistrationPage()),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = mapAppInitializeError(e);
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        backgroundColor: Colors.blue[50],
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.devices,
                size: 80,
                color: Colors.blue[700],
              ),
              const SizedBox(height: 24),
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(
                'アプリを初期化中...',
                style: TextStyle(
                  fontSize: 18,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return Scaffold(
        backgroundColor: Colors.red[50],
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.error_outline,
                  size: 80,
                  color: Colors.red[600],
                ),
                const SizedBox(height: 24),
                Text(
                  'エラーが発生しました',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.red[700],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.red[600],
                  ),
                ),
                const SizedBox(height: 32),
                ElevatedButton(
                  onPressed: () {
                    setState(() {
                      _isLoading = true;
                      _error = null;
                    });
                    _initializeApp();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red[700],
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 32,
                      vertical: 16,
                    ),
                  ),
                  child: const Text(kAppInitializeRetryLabel),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
