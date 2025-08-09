import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class UserQRCheckInPage extends StatefulWidget {
  const UserQRCheckInPage({super.key});

  @override
  State<UserQRCheckInPage> createState() => _UserQRCheckInPageState();
}

class _UserQRCheckInPageState extends State<UserQRCheckInPage> {
  // When: 画面生成時にスキャナを初期化
  // Where: Flutter側（店舗端末アプリ）
  // What: カメラを起動しQRコードを読み取り、Cloud Functionsに送る
  // How: mobile_scannerで検出→Firebase FunctionsのprocessVisitByQRをcall
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
    torchEnabled: false,
  );

  bool _isProcessing = false;
  String? _lastMessage;

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }

  Future<void> _handleDetect(BarcodeCapture capture) async {
    if (_isProcessing) return;
    final codes = capture.barcodes;
    if (codes.isEmpty) return;

    final raw = codes.first.rawValue;
    if (raw == null) return;

    setState(() {
      _isProcessing = true;
    });

    // 端末がFirebase Authでログイン済みかチェック
    final currentUser = FirebaseAuth.instance.currentUser;
    if (currentUser == null) {
      setState(() {
        _isProcessing = false;
        _lastMessage = '端末が未ログインのため実行できません。スタッフ/端末用アカウントで先にログインしてください。';
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('端末未ログインです。先にスタッフとしてログインしてください。')),
        );
      }
      return;
    }

    try {
      // When: QRを読み取った直後
      // Where: Flutter → Cloud Functions
      // What: 読み取った文字列(raw)を `processVisitByQR` に渡す
      // How: Cloud Functions(Callable)へ httpsCallable で呼び出し
      final callable = FirebaseFunctions.instance.httpsCallable('processVisitByQR');
      final result = await callable.call({ 'qrData': raw });
      final data = result.data as Map<dynamic, dynamic>;

      final success = data['success'] == true;
      final action = data['action']?.toString();
      final message = data['message']?.toString() ?? '';

      setState(() {
        _lastMessage = message.isNotEmpty ? message : (success ? '処理に成功しました' : '処理に失敗しました');
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_lastMessage!)),
        );
      }

      // 処理が成功した場合は一旦スキャンを停止して2秒後に再開
      if (success) {
        await _scannerController.stop();
        await Future.delayed(const Duration(seconds: 2));
        await _scannerController.start();
      }
    } on FirebaseFunctionsException catch (e) {
      final message = e.message ?? 'Cloud Functions 呼び出しに失敗しました';
      setState(() {
        _lastMessage = message;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message)),
        );
      }
    } catch (e) {
      setState(() {
        _lastMessage = '不明なエラー: $e';
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('不明なエラーが発生しました: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('QRチェックイン/チェックアウト'),
      ),
      body: Column(
        children: [
          Expanded(
            child: MobileScanner(
              controller: _scannerController,
              onDetect: _handleDetect,
            ),
          ),
          if (_lastMessage != null)
            Padding(
              padding: const EdgeInsets.all(12.0),
              child: Text(
                _lastMessage!,
                style: const TextStyle(fontSize: 14, color: Colors.grey),
              ),
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
