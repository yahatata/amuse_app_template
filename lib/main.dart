import 'package:amuse_app_template/Home/adminHomePage.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
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
      home: const AdminHomePage(), // 将来はここで Firebase role を見て分岐
    );
  }
}