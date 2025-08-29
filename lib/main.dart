import 'package:amuse_app_template/Home/adminHomePage.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'firebase_options.dart';
import 'Utils/menuItemsManager.dart';



void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform, // ⬅️ 必須！
  );
  
  // When: アプリ起動時
  // Where: main.dart
  // What: メニューアイテムを初期取得
  // How: MenuItemsManager経由でFireStoreからデータを取得
  await MenuItemsManager.fetchMenuItems();
  
  runApp(MyApp());
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
      home: const AdminHomePage(), // 将来はここで Firebase role を見て分岐
    );
  }
}