import 'package:amuse_app_template/StaffDate/businessDayMenuPage.dart';
import 'package:amuse_app_template/StaffDate/shiftMenuPage.dart';
import 'package:amuse_app_template/theme/home_button_theme.dart';
import 'package:amuse_app_template/Home/terminal_mode_state.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart';
import 'package:amuse_app_template/AttendanceManagement/attendanceCorrectionRequestsPage.dart';
import 'package:amuse_app_template/pages/device_management_page.dart';
import 'package:amuse_app_template/pages/admin_detail_settings_page.dart';
import 'package:amuse_app_template/Home/staffListPage.dart';
import 'package:amuse_app_template/dashboard/home/dashboard_home_page.dart';
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

class _AdminHomePageState extends State<AdminHomePage> with RouteAware {
  // G4: ローカル状態を削除。terminalModeNotifier / isOnHomeScreenNotifier を使用。

  @override
  void initState() {
    super.initState();
    // G4: グローバルノティファーをこの AdminHomePage の初期値で初期化
    terminalModeNotifier.value = widget.initialTerminalMode;
    isOnHomeScreenNotifier.value = true;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // G4: RouteObserver にこのページを登録（ルート変化の追跡開始）
    final route = ModalRoute.of(context);
    if (route != null) {
      appRouteObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    // G4: RouteObserver の登録解除 + ノティファーをリセット
    appRouteObserver.unsubscribe(this);
    terminalModeNotifier.value = false;
    isOnHomeScreenNotifier.value = true;
    super.dispose();
  }

  // G4: サブページへ遷移したとき → ボタンを無効化
  @override
  void didPushNext() {
    isOnHomeScreenNotifier.value = false;
  }

  // G4: サブページから戻ってきたとき → ボタンを有効化
  @override
  void didPopNext() {
    isOnHomeScreenNotifier.value = true;
  }

  void _toggleMode() {
    // G4: ローカル setState ではなくグローバルノティファーを更新
    terminalModeNotifier.value = !terminalModeNotifier.value;
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
            child: const Icon(Icons.notifications_outlined),
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

  // ── Admin レイアウト定数 ──────────────────────────
  static const _rowPairs = <(int, int)>[(0, 1), (2, 3)];

  List<(HomeCategoryTheme, List<HomeBtnDef>)> get _catDefs => [
    // [0] 営業日・シフト管理
    (
      AdminCategoryColors.shift,
      [
        HomeBtnDef(
          label: '営業日',
          icon: Icons.business_center,
          destination: const BusinessDayMenuPage(),
        ),
        HomeBtnDef(
          label: 'シフト',
          icon: Icons.calendar_month,
          destination: const ShiftMenuPage(),
        ),
      ],
    ),
    // [1] 勤怠
    (
      AdminCategoryColors.attendance,
      [
        HomeBtnDef(
          label: '全スタッフ勤怠',
          icon: Icons.people,
          destination: const AllStaffAttendancePage(),
        ),
        HomeBtnDef(
          label: '勤怠修正申請',
          icon: Icons.edit_note,
          destination: const AttendanceCorrectionRequestsPage(),
        ),
      ],
    ),
    // [2] スタッフ管理
    (
      AdminCategoryColors.staff,
      [
        HomeBtnDef(
          label: 'スタッフ一覧',
          icon: Icons.badge,
          destination: const StaffListPage(),
        ),
        HomeBtnDef(
          label: '給与計算',
          icon: Icons.payments,
          destination: const PayrollCalcPage(),
        ),
      ],
    ),
    // [3] 設定・分析
    (
      AdminCategoryColors.settings,
      [
        HomeBtnDef(
          label: '売上ダッシュボード',
          icon: Icons.bar_chart,
          destination: const DashboardHomePage(),
        ),
        HomeBtnDef(
          label: 'デバイス管理',
          icon: Icons.devices,
          destination: const DeviceManagementPage(),
        ),
        HomeBtnDef(
          label: '詳細設定',
          icon: Icons.settings,
          destination: const AdminDetailSettingsPage(),
        ),
      ],
    ),
  ];

  Widget _buildAdminLayout(BuildContext context) {
    final cats = _catDefs;
    return LayoutBuilder(
      builder: (context, constraints) {
        final availH = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : MediaQuery.of(context).size.height - kToolbarHeight - MediaQuery.of(context).padding.top;
        final btnW = HomeLayoutConst.calcBtnW(
          constraints.maxWidth,
          numSlots: HomeLayoutConst.adminSlots,
        );
        final (:btnH, :extraVPad) =
            HomeLayoutConst.calcAdminBtnH(availH, btnW);

        return SingleChildScrollView(
          physics: const NeverScrollableScrollPhysics(),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: HomeLayoutConst.hPad,
              vertical: HomeLayoutConst.vPad + extraVPad,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (int i = 0; i < _rowPairs.length; i++) ...[
                  if (i > 0)
                    const SizedBox(height: HomeLayoutConst.rowGap),
                  _buildPairRow(
                    context,
                    cats[_rowPairs[i].$1],
                    cats[_rowPairs[i].$2],
                    btnW,
                    btnH,
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPairRow(
    BuildContext context,
    (HomeCategoryTheme, List<HomeBtnDef>) cat1Data,
    (HomeCategoryTheme, List<HomeBtnDef>) cat2Data,
    double btnW,
    double btnH,
  ) {
    final sectionH = HomeLayoutConst.headerH + HomeLayoutConst.headerGap + btnH;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildCatSection(context, cat1Data.$1, cat1Data.$2, btnW, btnH),
        SizedBox(
          width: HomeLayoutConst.catDividerGap,
          height: sectionH,
          child: Center(
            child: Container(
              width: 1,
              height: btnH * 0.65,
              color: Colors.grey.shade300,
            ),
          ),
        ),
        _buildCatSection(context, cat2Data.$1, cat2Data.$2, btnW, btnH),
      ],
    );
  }

  Widget _buildCatSection(
    BuildContext context,
    HomeCategoryTheme theme,
    List<HomeBtnDef> buttons,
    double btnW,
    double btnH,
  ) {
    final sectionW = buttons.length * btnW +
        (buttons.length - 1) * HomeLayoutConst.btnGap;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: sectionW,
          height: HomeLayoutConst.headerH,
          child: Row(
            children: [
              Container(
                width: 4,
                height: 14,
                decoration: BoxDecoration(
                  color: theme.fg,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  theme.label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.grey.shade600,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: HomeLayoutConst.headerGap),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (int i = 0; i < buttons.length; i++) ...[
              if (i > 0) const SizedBox(width: HomeLayoutConst.btnGap),
              SizedBox(
                width: btnW,
                height: btnH,
                child: _buildBtn(context, buttons[i], theme, btnH),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _buildBtn(
    BuildContext context,
    HomeBtnDef btn,
    HomeCategoryTheme catTheme,
    double height,
  ) {
    final iconSize = (height * 0.28).clamp(18.0, 40.0);
    final fontSize = (height * 0.10).clamp(10.0, 14.0);

    return Material(
      color: catTheme.bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: Colors.grey.shade300),
      ),
      child: InkWell(
        customBorder: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        onTap: btn.destination != null
            ? () {
                if (context.mounted) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => btn.destination!),
                  );
                }
              }
            : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(btn.icon, color: catTheme.fg, size: iconSize),
              const SizedBox(height: 6),
              Text(
                btn.label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: catTheme.fg,
                  fontSize: fontSize,
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // G4: terminalModeNotifier を監視してビルドを切り替える
    return ValueListenableBuilder<bool>(
      valueListenable: terminalModeNotifier,
      builder: (context, isTerminalMode, _) {
        return Scaffold(
          // G4: Terminal モード中は terminalHomePage 自身の AppBar を使うため非表示
          // （バナーがモード表示を担い、terminalHomePage AppBar が営業状態を表示する）
          appBar: isTerminalMode
              ? null
              : AppBar(
                  titleSpacing: 16,
                  title: const Text('Admin', style: TextStyle(fontSize: 30)),
                  actions: [
                    _buildNotificationBell(),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: TextButton.icon(
                        onPressed: _toggleMode,
                        icon: const Icon(Icons.switch_right, color: Colors.white),
                        label: const Text(
                          'Adminモード中',
                          style: TextStyle(color: Colors.white),
                        ),
                        style: TextButton.styleFrom(
                          backgroundColor: Colors.deepPurple,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),
                  ],
                  bottom: PreferredSize(
                    preferredSize: const Size.fromHeight(1),
                    child: Divider(height: 1, thickness: 1, color: Colors.black.withValues(alpha: 0.10)),
                  ),
                ),
          body: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: isTerminalMode
                ? const terminalHomePage(key: ValueKey('terminal'))
                : KeyedSubtree(
                    key: const ValueKey('admin'),
                    child: _buildAdminLayout(context),
                  ),
          ),
        );
      },
    );
  }
}
