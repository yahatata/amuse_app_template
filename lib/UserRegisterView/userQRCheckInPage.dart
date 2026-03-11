import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:amuse_app_template/UserLogin/userCheckInPage.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

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
    facing: CameraFacing.front,
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

    // 認証チェックを削除（注文処理と同様に認証なしで動作）

    try {
      // When: QRを読み取った直後
      // Where: Flutter → Cloud Functions
      // What: 読み取った文字列(raw)を `processVisitByQR` に渡す
      // How: Cloud Functions(Callable)へ httpsCallable で呼び出し
      final callable = FirebaseFunctions.instance.httpsCallable('processVisitByQR');
      final result = await callable.call({
        'qrData': raw,
        'entranceFee': StoreConfigService.instance.latestData?.entranceFee ?? kDefaultEntranceFee,
        'entranceFeeDescription': StoreConfigService.instance.latestData?.entranceFeeDescription ?? kDefaultEntranceFeeDescription,
        'chargeEntranceFeeOnReentry': StoreConfigService.instance.latestData?.chargeEntranceFeeOnReentry ?? kDefaultChargeEntranceFeeOnReentry,
      });
      final data = result.data as Map<dynamic, dynamic>;

      final success = data['success'] == true;
      final action = data['action']?.toString();
      final message = data['message']?.toString() ?? '';
      final pokerName = (data['user'] as Map<dynamic, dynamic>?)?['pokerName']?.toString() ?? 
                        (data['data'] as Map<dynamic, dynamic>?)?['pokerName']?.toString();

      // スキャンを停止
      await _scannerController.stop();

      // userCheckInPage に遷移してダイアログを表示
      if (mounted) {
        final displayMessage = success 
          ? (pokerName != null ? '$pokerName様のログイン処理が完了しました' : 'ログイン処理が完了しました')
          : (message.isNotEmpty ? message : 'ログイン処理に失敗しました');
        
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => UserCheckInPage(
              showDialogOnLoad: true,
              dialogMessage: displayMessage,
              isSuccess: success,
            ),
          ),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      final message = e.message ?? 'Cloud Functions 呼び出しに失敗しました';
      // スキャンを停止
      await _scannerController.stop();
      
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => UserCheckInPage(
              showDialogOnLoad: true,
              dialogMessage: 'ログイン処理に失敗しました: $message',
              isSuccess: false,
            ),
          ),
        );
      }
    } catch (e) {
      // スキャンを停止
      await _scannerController.stop();
      
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => UserCheckInPage(
              showDialogOnLoad: true,
              dialogMessage: 'ログイン処理に失敗しました: $e',
              isSuccess: false,
            ),
          ),
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
            child: Transform.rotate(
              angle: -1.5708, // -90度（反時計回りに90度回転）をラジアンで指定（-π/2 ≈ -1.5708）
              child: MobileScanner(
                controller: _scannerController,
                onDetect: _handleDetect,
              ),
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
