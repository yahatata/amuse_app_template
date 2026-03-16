import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/AttendanceManagement/attendanceService.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

/// QRコードスキャンによる出勤・退勤打刻ページ
///
/// [initialMode] を指定すると、出勤/退勤のいずれかに事前選択して表示。
/// null の場合はスキャン後に出勤・退勤を選択する従来フロー。
class QRScanPage extends StatefulWidget {
  /// 出勤(true) または 退勤(false) を事前選択。null の場合は両方表示
  final bool? initialMode;

  const QRScanPage({super.key, this.initialMode});

  @override
  State<QRScanPage> createState() => _QRScanPageState();
}

class _QRScanPageState extends State<QRScanPage> {
  MobileScannerController cameraController =
      MobileScannerController(facing: CameraFacing.front);
  bool _isScanning = true;
  String? _scannedData;
  bool _isProcessing = false;
  String? _extractedStaffId; // 抽出されたスタッフID（Phase4 01: determineAttendanceMode 廃止）
  String _staffFullName = '取得中...';
  String? _extractionError; // staffId 抽出時のエラーメッセージ
  int _selectedAdjustmentOffsetMinutes = 0;

  final AttendanceService _attendanceService = AttendanceService();

  @override
  void dispose() {
    cameraController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final modeLabel = widget.initialMode == true
        ? '出勤'
        : (widget.initialMode == false ? '退勤' : '出勤・退勤');
    return Scaffold(
      appBar: AppBar(
        title: Text('QRコードスキャン - $modeLabel'),
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
        ],
      ),
    );
  }

  // カメラビュー
  Widget _buildCameraView() {
    return Stack(
      children: [
        // カメラビュー（インカメラ + 270度回転）
        Transform.rotate(
          angle: 4.71238898, // 約270度（時計回り）
          child: MobileScanner(
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
                color: _extractedStaffId != null ? Colors.blue : (_extractionError != null ? Colors.red : Colors.blue),
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
          if (_extractionError != null) _buildExtractionError(),
          if (_extractedStaffId != null) _buildStaffInfo(),
          if (_extractedStaffId != null) _buildAdjustmentSelector(),
          const SizedBox(height: 8),
          if (_extractedStaffId != null) _buildProcessButtons(),
        ],
      ),
    );
  }

  // staffId 抽出エラー表示
  Widget _buildExtractionError() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.red[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.red[300]!),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _extractionError ?? 'QRコードの解析に失敗しました',
              style: const TextStyle(
                fontSize: 14,
                color: Colors.red,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // スタッフ情報表示（簡易表示）
  Widget _buildStaffInfo() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.blue[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue[300]!),
      ),
      child: Row(
        children: [
          const Icon(Icons.person, color: Colors.blue, size: 24),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'staff氏名: $_staffFullName',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.blue[700],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAdjustmentSelector() {
    final config =
        StoreConfigService.instance.latestData ?? StoreConfigData.fromDefaults();
    if (!config.attendanceTimeAdjustmentEnabled ||
        config.attendanceTimeAdjustmentMaxFutureMinutes == null ||
        config.attendanceTimeAdjustmentMaxPastMinutes == null) {
      return Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade400),
          borderRadius: BorderRadius.circular(4),
          color: Colors.white,
        ),
        child: const Text('登録時刻: 現在時刻で登録'),
      );
    }

    final options = _buildAdjustmentOptions(config);
    if (!options.contains(_selectedAdjustmentOffsetMinutes)) {
      _selectedAdjustmentOffsetMinutes = 0;
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      child: DropdownButtonFormField<int>(
        value: _selectedAdjustmentOffsetMinutes,
        decoration: const InputDecoration(
          labelText: '登録時刻',
          border: OutlineInputBorder(),
        ),
        items: options
            .map(
              (offset) => DropdownMenuItem<int>(
                value: offset,
                child: Text(_adjustmentLabel(offset)),
              ),
            )
            .toList(),
        onChanged: _isProcessing
            ? null
            : (v) {
                if (v == null) return;
                setState(() {
                  _selectedAdjustmentOffsetMinutes = v;
                });
              },
      ),
    );
  }

  // 処理ボタン（出勤・退勤を明示表示、initialMode で一方のみ表示可能）
  Widget _buildProcessButtons() {
    final showClockIn = widget.initialMode != false;
    final showClockOut = widget.initialMode != true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            if (showClockIn)
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isProcessing
                      ? null
                      : () => _processClockIn(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  icon: const Icon(Icons.login, size: 20),
                  label: const Text(
                    '出勤',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            if (showClockIn && showClockOut) const SizedBox(width: 12),
            if (showClockOut)
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isProcessing
                      ? null
                      : () => _processClockOut(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  icon: const Icon(Icons.logout, size: 20),
                  label: const Text(
                    '退勤',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: _isProcessing
              ? null
              : () {
                  setState(() {
                    _scannedData = null;
                    _extractedStaffId = null;
                    _staffFullName = '取得中...';
                    _extractionError = null;
                    _selectedAdjustmentOffsetMinutes = 0;
                  });
                  cameraController.start();
                },
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
          child: const Text('再スキャン'),
        ),
      ],
    );
  }

  // QRコード検出時の処理（Phase4 01: determineAttendanceMode 廃止、staffId 抽出のみ）
  void _onQRCodeDetected(String data) {
    if (_isProcessing) return;

    setState(() {
      _scannedData = data;
      _isScanning = false;
      _extractionError = null;
      _extractedStaffId = null;
      _staffFullName = '取得中...';
      _selectedAdjustmentOffsetMinutes = 0;
    });

    cameraController.stop();

    try {
      final staffId = _attendanceService.extractStaffIdFromQR(data);
      setState(() {
        _extractedStaffId = staffId;
      });
      _loadStaffFullName(staffId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('QRコードを検出しました'),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      final msg = e.toString().replaceFirst('Exception: ', '');
      setState(() {
        _extractionError = msg;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(msg),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  Future<void> _loadStaffFullName(String staffId) async {
    try {
      final staffDoc = await FirebaseFirestore.instance
          .collection('staffs')
          .doc(staffId)
          .get();
      if (!mounted) return;
      final fullName = staffDoc.data()?['fullName']?.toString();
      setState(() {
        _staffFullName = (fullName != null && fullName.isNotEmpty) ? fullName : '不明';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _staffFullName = '不明';
      });
    }
  }

  // 出勤打刻（clockIn Callable）
  Future<void> _processClockIn() async {
    if (_extractedStaffId == null) return;

    setState(() {
      _isProcessing = true;
    });

    try {
      final config =
          StoreConfigService.instance.latestData ?? StoreConfigData.fromDefaults();
      final result = await _attendanceService.clockIn(
        _extractedStaffId!,
        staffName: null, // バックエンドで staffs から取得
        adjustmentOffsetMinutes: config.attendanceTimeAdjustmentEnabled
            ? _selectedAdjustmentOffsetMinutes
            : null,
      );

      if (!mounted) return;

      if (result.warning != null) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('出勤処理（注意）'),
            content: Text('${result.message}\n\n${result.warning}'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.message),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );
      }
      Navigator.pop(context);
    } catch (e) {
      final msg = e.toString().replaceFirst('Exception: ', '');
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('出勤処理エラー'),
            content: Text(msg),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ],
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

  // 退勤打刻（clockOut Callable）
  Future<void> _processClockOut() async {
    if (_extractedStaffId == null) return;

    setState(() {
      _isProcessing = true;
    });

    try {
      final config =
          StoreConfigService.instance.latestData ?? StoreConfigData.fromDefaults();
      final result = await _attendanceService.clockOut(
        _extractedStaffId!,
        adjustmentOffsetMinutes: config.attendanceTimeAdjustmentEnabled
            ? _selectedAdjustmentOffsetMinutes
            : null,
      );

      if (!mounted) return;

      if (result.warning != null) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('退勤処理（注意）'),
            content: Text('${result.message}\n\n${result.warning}'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result.message),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 2),
          ),
        );
      }
      Navigator.pop(context);
    } catch (e) {
      final msg = e.toString().replaceFirst('Exception: ', '');
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('退勤処理エラー'),
            content: Text(msg),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ],
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

  List<int> _buildAdjustmentOptions(StoreConfigData config) {
    if (!config.attendanceTimeAdjustmentEnabled) {
      return const [0];
    }
    final maxFuture = config.attendanceTimeAdjustmentMaxFutureMinutes;
    final maxPast = config.attendanceTimeAdjustmentMaxPastMinutes;
    if (maxFuture == null || maxPast == null) {
      return const [0];
    }
    return List<int>.generate(
      maxFuture + maxPast + 1,
      (index) => index - maxPast,
    );
  }

  String _adjustmentLabel(int offset) {
    if (offset == 0) return '現在時刻で登録';
    if (offset > 0) return '現在時刻から +$offset 分';
    return '現在時刻から -${offset.abs()} 分';
  }
}
