import 'package:amuse_app_template/StaffDate/createStaffAccountPage.dart';
import 'package:amuse_app_template/StaffDate/businessDayMenuPage.dart';
import 'package:amuse_app_template/StaffDate/shiftMenuPage.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart';
import 'package:amuse_app_template/AttendanceManagement/attendanceCorrectionRequestsPage.dart';
import 'package:amuse_app_template/pages/device_management_page.dart';
import 'package:amuse_app_template/pages/admin_detail_settings_page.dart';
import 'package:amuse_app_template/pages/log_ops_error_sample_page.dart';
import 'package:amuse_app_template/Home/adminUserListPage.dart';
import 'package:amuse_app_template/Home/staffListPage.dart';
import 'package:amuse_app_template/payroll/payroll_calc_page.dart';
import 'package:amuse_app_template/payroll/widgets/notification_list.dart';

class AdminHomePage extends StatefulWidget {
  final bool initialTerminalMode;

  const AdminHomePage({
    super.key,
    this.initialTerminalMode = false,
  });

  @override
  State<AdminHomePage> createState() => _AdminHomePageState();
}

class _AdminHomePageState extends State<AdminHomePage> {
  late bool _isTerminalMode;

  @override
  void initState() {
    super.initState();
    _isTerminalMode = widget.initialTerminalMode;
  }

  void _toggleMode() {
    setState(() {
      _isTerminalMode = !_isTerminalMode;
    });
  }

  Widget _buildNotificationBell() {
    final twoMonthsAgo = DateTime.now().subtract(const Duration(days: 60));
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('notifications')
          .where('operationCategory', isEqualTo: 'payroll')
          .where('isRead', isEqualTo: false)
          .where('createdAt',
              isGreaterThanOrEqualTo: Timestamp.fromDate(twoMonthsAgo))
          .snapshots(),
      builder: (context, snapshot) {
        final unreadCount = snapshot.data?.docs.length ?? 0;
        return IconButton(
          icon: Badge(
            isLabelVisible: unreadCount > 0,
            label: Text('$unreadCount', style: const TextStyle(fontSize: 10)),
            child: const Icon(Icons.notifications_outlined, color: Colors.white),
          ),
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const PayrollNotificationListPage(),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final buttonHeight = (screenHeight - kToolbarHeight - 80) / 2.3;

          final List<({String label, Widget destination})> buttons = [
        (label: 'シフト', destination: const ShiftMenuPage()),
        (label: '営業日', destination: const BusinessDayMenuPage()),
        (label: '全スタッフ勤怠', destination: const AllStaffAttendancePage()),
        (label: '勤怠修正申請', destination: const AttendanceCorrectionRequestsPage()),
        (label: 'デバイス管理', destination: const DeviceManagementPage()),
        (label: '詳細設定', destination: const AdminDetailSettingsPage()),
        (label: 'logOpsError 代表サンプル', destination: const LogOpsErrorSamplePage()),
        (label: 'スタッフ一覧', destination: const StaffListPage()),
        (label: 'ユーザー一覧', destination: const AdminUserListPage()),
        (label: 'Staff作成', destination: const CreateStaffAccount()),
        (label: '給与計算', destination: const PayrollCalcPage()),
      ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Text(
          _isTerminalMode ? 'Terminal' : 'Admin',
          style: const TextStyle(fontSize: 30),
        ),
        actions: [
          if (!_isTerminalMode) _buildNotificationBell(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: TextButton.icon(
              onPressed: _toggleMode,
              icon: Icon(
                _isTerminalMode ? Icons.switch_left : Icons.switch_right,
                color: Colors.white,
              ),
              label: Text(
                _isTerminalMode ? 'Terminalモード中' : 'Adminモード中',
                style: const TextStyle(color: Colors.white),
              ),
              style: TextButton.styleFrom(
                backgroundColor: _isTerminalMode ? Colors.teal : Colors.deepPurple,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),
        ],
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        child: _isTerminalMode
            ? const terminalHomePage(key: ValueKey('terminal'))
            : GridView.custom(
          key: const ValueKey('admin'),
          padding: const EdgeInsets.all(16),
          physics: const ClampingScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            mainAxisExtent: buttonHeight,
          ),
          childrenDelegate: SliverChildListDelegate.fixed(
            buttons.map((btn) {
              return ElevatedButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => btn.destination),
                  );
                },
                child: Text(btn.label, textAlign: TextAlign.center),
              );
            }).toList(),
          ),
        ),
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