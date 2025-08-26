import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:amuse_app_template/AttendanceManagement/manualAttendancePage.dart';
import 'package:amuse_app_template/AttendanceManagement/attendanceService.dart';

class QRScanPage extends StatefulWidget {
  const QRScanPage({super.key});

  @override
  State<QRScanPage> createState() => _QRScanPageState();
}

class _QRScanPageState extends State<QRScanPage> {
  MobileScannerController cameraController = MobileScannerController();
  bool _isScanning = true;
  String? _scannedData;
  bool _isProcessing = false;
  bool? _isClockInMode; // null: 未判定, true: 出勤, false: 退勤
  String? _staffName; // スタッフ名
  String? _existingDocId; // 既存のドキュメントID（退勤時）
  String? _extractedStaffId; // 抽出されたスタッフID
  
  final AttendanceService _attendanceService = AttendanceService();

  @override
  void dispose() {
    cameraController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('QRコードスキャン - 自動判定'),
        centerTitle: true,
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: Icon(_isScanning ? Icons.pause : Icons.play_arrow),
            onPressed: () {
              setState(() {
                _isScanning = !_isScanning;
                if (_isScanning) {
                  cameraController.start();
                } else {
                  cameraController.stop();
                }
              });
            },
          ),
          IconButton(
            icon: const Icon(Icons.flip_camera_ios),
            onPressed: () {
              cameraController.switchCamera();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // カメラビュー
          Expanded(
            child: _buildCameraView(),
          ),
          
          // スキャン結果表示エリア
          if (_scannedData != null) _buildScanResult(),
          
          // 手動打刻ボタン
          _buildManualButton(),
        ],
      ),
    );
  }

  // カメラビュー
  Widget _buildCameraView() {
    return Stack(
      children: [
        // カメラビュー
        MobileScanner(
          controller: cameraController,
          onDetect: (capture) {
            final List<Barcode> barcodes = capture.barcodes;
            for (final barcode in barcodes) {
              if (barcode.rawValue != null) {
                _onQRCodeDetected(barcode.rawValue!);
                break;
              }
            }
          },
        ),
        
        // スキャンエリアのオーバーレイ
        _buildScanOverlay(),
        
        // 処理中インジケーター
        if (_isProcessing)
          Container(
            color: Colors.black54,
            child: const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                  SizedBox(height: 16),
                  Text(
                    '処理中...',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  // スキャンエリアのオーバーレイ
  Widget _buildScanOverlay() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black54,
      ),
      child: Center(
        child: Container(
          width: 250,
          height: 250,
          decoration: BoxDecoration(
            border: Border.all(
              color: Colors.blue,
              width: 3,
            ),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Stack(
            children: [
              // 左上のコーナー
              Positioned(
                top: 0,
                left: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: Colors.blue,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(20),
                    ),
                  ),
                ),
              ),
              // 右上のコーナー
              Positioned(
                top: 0,
                right: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: Colors.blue,
                    borderRadius: const BorderRadius.only(
                      topRight: Radius.circular(20),
                    ),
                  ),
                ),
              ),
              // 左下のコーナー
              Positioned(
                bottom: 0,
                left: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: Colors.blue,
                    borderRadius: const BorderRadius.only(
                      bottomLeft: Radius.circular(20),
                    ),
                  ),
                ),
              ),
              // 右下のコーナー
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: Colors.blue,
                    borderRadius: const BorderRadius.only(
                      bottomRight: Radius.circular(20),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // スキャン結果表示
  Widget _buildScanResult() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.qr_code,
                color: _isClockInMode == null ? Colors.blue : (_isClockInMode! ? Colors.green : Colors.red),
                size: 24,
              ),
              const SizedBox(width: 8),
              Text(
                'スキャン結果',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey[700],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          
          // 判定結果表示
          if (_isClockInMode != null) _buildJudgmentResult(),
          
          Text(
            'QRコードデータ:',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: Text(
              _scannedData!,
              style: const TextStyle(
                fontSize: 14,
                fontFamily: 'monospace',
              ),
            ),
          ),
          const SizedBox(height: 16),
          
          // 処理ボタン
          if (_isClockInMode != null) _buildProcessButtons(),
        ],
      ),
    );
  }

  // 判定結果表示
  Widget _buildJudgmentResult() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: _isClockInMode! ? Colors.green[50] : Colors.red[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: _isClockInMode! ? Colors.green[300]! : Colors.red[300]!,
        ),
      ),
      child: Row(
        children: [
          Icon(
            _isClockInMode! ? Icons.login : Icons.logout,
            color: _isClockInMode! ? Colors.green[700] : Colors.red[700],
            size: 24,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isClockInMode! ? '出勤判定' : '退勤判定',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: _isClockInMode! ? Colors.green[700] : Colors.red[700],
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _isClockInMode! 
                    ? 'スタッフ: ${_staffName ?? '不明'}'
                    : 'スタッフ: ${_staffName ?? '不明'}',
                  style: TextStyle(
                    fontSize: 14,
                    color: _isClockInMode! ? Colors.green[600] : Colors.red[600],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // 処理ボタン
  Widget _buildProcessButtons() {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton(
            onPressed: _isProcessing ? null : () {
              _processAttendance();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: _isClockInMode! ? Colors.green : Colors.red,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: Text(
              _isClockInMode! ? '出勤処理' : '退勤処理',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: OutlinedButton(
            onPressed: _isProcessing ? null : () {
              setState(() {
                _scannedData = null;
                _isClockInMode = null;
                _staffName = null;
                _existingDocId = null;
                _extractedStaffId = null;
              });
              cameraController.start();
            },
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: const Text('再スキャン'),
          ),
        ),
      ],
    );
  }

  // 手動打刻ボタン
  Widget _buildManualButton() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      child: ElevatedButton.icon(
        onPressed: () {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (context) => const ManualAttendancePage(
                isClockInMode: true, // デフォルトで出勤モード
              ),
            ),
          );
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.orange[600],
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        icon: const Icon(Icons.people, size: 24),
        label: const Text(
          '手動打刻に切り替え',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  // QRコード検出時の処理
  void _onQRCodeDetected(String data) {
    if (_isProcessing) return;
    
    setState(() {
      _scannedData = data;
      _isScanning = false;
    });
    
    cameraController.stop();
    
    // 自動判定処理
    _determineAttendanceMode(data);
    
    // 成功音やバイブレーション（必要に応じて）
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('QRコードを検出しました: ${data.substring(0, data.length > 20 ? 20 : data.length)}...'),
        backgroundColor: Colors.green,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  // 出勤・退勤モードの自動判定
  void _determineAttendanceMode(String qrData) async {
    setState(() {
      _isProcessing = true;
    });
    
    try {
      // QRコードからスタッフIDを抽出
      final staffId = _attendanceService.extractStaffIdFromQR(qrData);
      
      // Cloud Functionsで出勤・退勤を判定
      final result = await _attendanceService.determineAttendanceMode(qrData);
      
      setState(() {
        _isClockInMode = result.isClockIn;
        _staffName = result.staffName;
        _existingDocId = result.existingDocId;
        _extractedStaffId = staffId; // 抽出されたスタッフIDを保存
        _isProcessing = false;
      });
      
      // 成功メッセージを表示
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.message),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );
      }
      
    } catch (e) {
      // エラー時の処理
      setState(() {
        _isProcessing = false;
      });
      
      if (mounted) {
        String errorMessage = '判定処理でエラーが発生しました';
        
        // QRコード関連のエラーの場合は、より分かりやすいメッセージを表示
        if (e.toString().contains('QRコード')) {
          errorMessage = e.toString();
        } else if (e.toString().contains('スタッフ')) {
          errorMessage = e.toString();
        } else if (e.toString().contains('期限')) {
          errorMessage = e.toString();
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  // 勤怠処理の実行
  void _processAttendance() async {
    if (_isClockInMode == null || _scannedData == null) return;
    
    setState(() {
      _isProcessing = true;
    });
    
    try {
      if (_isClockInMode!) {
        // 出勤処理
        
        if (_extractedStaffId == null) {
          throw Exception('スタッフIDが取得できません');
        }
        
        final result = await _attendanceService.createClockInRecord(
          _extractedStaffId!,
          _staffName ?? 'Unknown Staff',
        );
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(result.message),
              backgroundColor: Colors.green,
              duration: const Duration(seconds: 2),
            ),
          );
          
          // 前の画面に戻る
          Navigator.pop(context);
        }
      } else {
        // 退勤処理
        if (_existingDocId != null) {
          final result = await _attendanceService.updateClockOutRecord(_existingDocId!);
          
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(result.message),
                backgroundColor: Colors.green,
                duration: const Duration(seconds: 2),
              ),
            );
            
            // 前の画面に戻る
            Navigator.pop(context);
          }
        } else {
          throw Exception('退勤処理に必要なドキュメントIDが見つかりません');
        }
      }
    } catch (e) {
      // エラー時の処理
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('エラーが発生しました: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
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
}
