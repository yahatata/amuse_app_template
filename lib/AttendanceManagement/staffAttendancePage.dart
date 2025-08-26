import 'package:flutter/material.dart';
import 'package:amuse_app_template/AttendanceManagement/manualAttendancePage.dart';
import 'package:amuse_app_template/AttendanceManagement/qrScanPage.dart';

class StaffAttendancePage extends StatefulWidget {
  const StaffAttendancePage({super.key});

  @override
  State<StaffAttendancePage> createState() => _StaffAttendancePageState();
}

class _StaffAttendancePageState extends State<StaffAttendancePage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('スタッフ打刻'),
        centerTitle: true,
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            // 説明セクション
            _buildDescriptionSection(),
            const SizedBox(height: 32),
            
            // QR読み取りボタン
            _buildQRScanButton(),
            const SizedBox(height: 24),
            
            // または区切り線
            _buildDivider(),
            const SizedBox(height: 24),
            
            // 手動打刻ボタン
            _buildManualAttendanceButton(),
          ],
        ),
      ),
    );
  }

  // 説明セクション
  Widget _buildDescriptionSection() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.blue[50],
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.blue[200]!),
      ),
      child: Column(
        children: [
          Icon(
            Icons.qr_code_scanner,
            size: 48,
            color: Colors.blue[600],
          ),
          const SizedBox(height: 16),
          Text(
            'QRコードで自動判定',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.blue[700],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'スタッフのQRコードを読み取ると、システムが自動で出勤・退勤を判定します。\n\n'
            '• 出勤記録がない場合 → 出勤として処理\n'
            '• 出勤記録がある場合 → 退勤として処理',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              color: Colors.blue[600],
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  // QR読み取りボタン
  Widget _buildQRScanButton() {
    return Container(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () {
          _scanQRCode();
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.blue[600],
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          elevation: 4,
        ),
        icon: const Icon(Icons.qr_code_scanner, size: 32),
        label: const Text(
          'QRコードをスキャン',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  // 区切り線
  Widget _buildDivider() {
    return Row(
      children: [
        Expanded(child: Divider(color: Colors.grey[400])),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'または',
            style: TextStyle(
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Expanded(child: Divider(color: Colors.grey[400])),
      ],
    );
  }

  // 手動打刻ボタン
  Widget _buildManualAttendanceButton() {
    return Container(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () {
          _navigateToManualAttendance();
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.orange[600],
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 20),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          elevation: 2,
        ),
        icon: const Icon(Icons.people, size: 28),
        label: const Text(
          '手動で打刻処理',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  // QRコードスキャン処理
  void _scanQRCode() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const QRScanPage(),
      ),
    );
  }

  // 手動打刻ページへの遷移
  void _navigateToManualAttendance() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => const ManualAttendancePage(
          isClockInMode: true, // デフォルトで出勤モード
        ),
      ),
    );
  }
}

