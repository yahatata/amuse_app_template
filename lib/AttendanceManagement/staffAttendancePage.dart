import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/AttendanceManagement/qrScanPage.dart';
import 'package:amuse_app_template/AttendanceManagement/admin_attendance_list_page.dart';
import 'package:amuse_app_template/Home/unclocked_attendance_list_page.dart';
import 'package:amuse_app_template/AttendanceManagement/attendanceService.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';

/// Phase4 01: 勤怠管理・スタッフ打刻ページ
///
/// CORRECTIONS_NEEDED §3 準拠: 3タブ + ExpansionTile + 3ボタン
class StaffAttendancePage extends StatefulWidget {
  const StaffAttendancePage({super.key});

  @override
  State<StaffAttendancePage> createState() => _StaffAttendancePageState();
}

class _StaffAttendancePageState extends State<StaffAttendancePage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final AttendanceService _attendanceService = AttendanceService();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('勤怠管理・スタッフ打刻'),
        centerTitle: true,
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: '勤怠記録'),
            Tab(text: 'シフト一覧'),
            Tab(text: '未退勤データ一覧（前日以前分）'),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: StreamBuilder<StoreConfigData>(
              stream: StoreConfigService.instance.stream,
              builder: (context, configSnapshot) {
                final config =
                    configSnapshot.data ?? StoreConfigData.fromDefaults();
                return TabBarView(
                  controller: _tabController,
                  children: [
                    _AttendanceRecordTab(
                      attendanceService: _attendanceService,
                      config: config,
                    ),
                    _ShiftListTab(
                      attendanceService: _attendanceService,
                      config: config,
                    ),
                    const UnclockedAttendanceListPage(embedded: true),
                  ],
                );
              },
            ),
          ),
          _buildBottomActionBar(),
        ],
      ),
    );
  }

  /// ExpansionTile: 出勤登録（QR）、退勤登録（QR）、管理者用編集
  Widget _buildBottomActionBar() {
    return ExpansionTile(
      title: const Text(
        '打刻操作',
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
        ),
      ),
      leading: const Icon(Icons.touch_app),
      backgroundColor: Colors.grey[50],
      collapsedBackgroundColor: Colors.grey[100],
      childrenPadding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => _navigateToQRScan(isClockIn: true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green[600],
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('出勤登録（QR）'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: () => _navigateToQRScan(isClockIn: false),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red[600],
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('退勤登録（QR）'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _showAdminEditPasswordDialog,
                icon: const Icon(Icons.edit),
                label: const Text('管理者用編集'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _navigateToQRScan({required bool isClockIn}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => QRScanPage(initialMode: isClockIn),
      ),
    );
  }

  void _showAdminEditPasswordDialog() {
    final controller = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('管理者用編集'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '編集操作を行うにはパスワードを入力してください。',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'パスワード',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _onAdminEditPasswordSubmitted(ctx, controller.text),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () => _onAdminEditPasswordSubmitted(ctx, controller.text),
            child: const Text('確定'),
          ),
        ],
      ),
    ).then((_) => controller.dispose());
  }

  void _onAdminEditPasswordSubmitted(BuildContext dialogContext, String password) {
    Navigator.of(dialogContext).pop();
    if (password.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('パスワードを入力してください'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }
    _verifyAndOpenAdminPage(password.trim());
  }

  Future<void> _verifyAndOpenAdminPage(String password) async {
    try {
      final callable = FirebaseFunctions.instance
          .httpsCallable('verifyUnclockedAttendanceEditPassword');
      await callable.call({'password': password});
      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => const AdminAttendanceListPage(),
        ),
      );
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message ?? 'パスワードが一致しません'),
          backgroundColor: Colors.red,
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('パスワードが一致しません'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}

/// 勤怠記録タブ: 当日勤怠 + 未退勤セクション
class _AttendanceRecordTab extends StatelessWidget {
  final AttendanceService attendanceService;
  final StoreConfigData config;

  const _AttendanceRecordTab({
    required this.attendanceService,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, metaSnapshot) {
        if (!metaSnapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final meta = metaSnapshot.data!;
        final status = meta.status ?? '';
        final dateKey = meta.isRunning
            ? (meta.currentBusinessDateKey ?? '—')
            : (meta.lastClosedBusinessDateKey ?? '—');
        final displayDate = _formatDateBar(dateKey);

        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 64),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildSection(
                context,
                title: '$displayDate の勤怠データ',
                child: _TodayAttendanceList(
                  dateKey: dateKey,
                  status: status,
                  attendanceService: attendanceService,
                  config: config,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSection(
    BuildContext context, {
    required String title,
    required Widget child,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.blue[100],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            title,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.blue[900],
              fontSize: 14,
            ),
          ),
        ),
        const SizedBox(height: 8),
        child,
      ],
    );
  }

  String _formatDateBar(String dateKey) {
    if (dateKey.isEmpty || dateKey == '—') return '—';
    final parts = dateKey.split('-');
    if (parts.length != 3) return dateKey;
    try {
      final dt = DateTime(
        int.parse(parts[0]),
        int.parse(parts[1]),
        int.parse(parts[2]),
      );
      const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
      final w = weekdays[dt.weekday - 1];
      return '${dt.month}/${dt.day}($w)';
    } catch (_) {
      return dateKey;
    }
  }
}

/// 当日 + 翌日の勤怠データ一覧
class _TodayAttendanceList extends StatelessWidget {
  final String dateKey;
  final String status;
  final AttendanceService attendanceService;
  final StoreConfigData config;

  const _TodayAttendanceList({
    required this.dateKey,
    required this.status,
    required this.attendanceService,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    if (dateKey.isEmpty || dateKey == '—') {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Text('営業日が取得できません', style: TextStyle(color: Colors.grey)),
      );
    }
    final nextDateKey = _addDays(dateKey, 1);
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('attendances')
          .where('date', whereIn: [dateKey, nextDateKey])
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Text('エラー: ${snapshot.error}', style: const TextStyle(color: Colors.red));
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        var docs = snapshot.data!.docs;
        docs = List.from(docs)
          ..sort((a, b) {
            final dA = a.data();
            final dB = b.data();
            final cmpDate = (dA['date'] ?? '').toString().compareTo((dB['date'] ?? '').toString());
            if (cmpDate != 0) return cmpDate;
            final cA = dA['clockIn'];
            final cB = dB['clockIn'];
            if (cA is Timestamp && cB is Timestamp) {
              return cB.compareTo(cA);
            }
            return 0;
          });
        if (docs.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text('該当データがありません', style: TextStyle(color: Colors.grey)),
          );
        }
        return LayoutBuilder(
          builder: (context, constraints) {
            final maxW = constraints.maxWidth.isFinite
                ? constraints.maxWidth
                : MediaQuery.of(context).size.width;
            final widths =
                _computeColumnWidths(maxW, config.createAttendanceByManual);
            final bodyHeight =
                (MediaQuery.of(context).size.height - 250).clamp(280.0, 550.0);
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeaderTable(widths, config.createAttendanceByManual),
                SizedBox(
                  height: bodyHeight,
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildBodyTable(
                          context,
                          docs,
                          widths,
                          config.createAttendanceByManual,
                        ),
                        const SizedBox(height: 48),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  /// 画面幅に応じてカラム幅を計算。仕様: 氏名7文字、勤務状況4文字、合計分3桁を最低保証。
  /// 重みで按分し、合計が利用可能幅を超えないようにする。
  List<double> _computeColumnWidths(double availableWidth, bool showManual) {
    const horizontalPadding = 32.0;
    final w = (availableWidth - horizontalPadding).clamp(360.0, double.infinity);
    // 重み（氏名18, 勤務10, date10, 出勤5, 退勤5, 合計5, 作成6, 更新6, 退勤処理5）
    final weights = showManual
        ? [18.0, 10.0, 10.0, 5.0, 5.0, 5.0, 6.0, 6.0, 5.0]
        : [20.0, 12.0, 12.0, 7.0, 7.0, 6.0, 8.0, 8.0];
    final total = weights.reduce((a, b) => a + b);
    return weights.map((v) => (v / total) * w).toList();
  }

  static const _bodyFontSize = 12.0;

  static final _borderColor = Colors.grey.shade400;

  Widget _buildHeaderTable(List<double> widths, bool showManual) {
    return Table(
      columnWidths: {
        for (var i = 0; i < widths.length; i++) i: FixedColumnWidth(widths[i]),
      },
      border: TableBorder.all(color: _borderColor),
      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
      children: [
        TableRow(
          decoration: BoxDecoration(color: Colors.grey.shade300),
          children: [
            _headerCell('氏名', widths[0]),
            _headerCell('勤務状況', widths[1]),
            _headerCell('date', widths[2]),
            _headerCell('出勤', widths[3]),
            _headerCell('退勤', widths[4]),
            _headerCell('合計分', widths[5]),
            _headerCell('作成日時', widths[6]),
            _headerCell('更新日時', widths[7]),
            if (showManual) _headerCell('退勤処理', widths[8]),
          ],
        ),
      ],
    );
  }

  Widget _buildBodyTable(
    BuildContext context,
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
    List<double> widths,
    bool showManual,
  ) {
    return Table(
      columnWidths: {
        for (var i = 0; i < widths.length; i++) i: FixedColumnWidth(widths[i]),
      },
      border: TableBorder(
        top: const BorderSide(width: 0),
        left: BorderSide(color: _borderColor),
        right: BorderSide(color: _borderColor),
        bottom: BorderSide(color: _borderColor),
        horizontalInside: BorderSide(color: _borderColor),
        verticalInside: BorderSide(color: _borderColor),
      ),
      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
      children: [
        ...docs.map((doc) => _buildTableRow(context, doc, widths, showManual)),
        _buildPlaceholderRow(widths, showManual),
      ],
    );
  }

  /// 表の最終行: 全カラムを "-" で埋めたプレースホルダー行
  TableRow _buildPlaceholderRow(List<double> widths, bool showManual) {
    return TableRow(
      children: [
        _dataCell('—', widths[0]),
        _dataCell('—', widths[1]),
        _dataCell('—', widths[2]),
        _dataCell('—', widths[3]),
        _dataCell('—', widths[4]),
        _dataCell('—', widths[5]),
        _dataCell('—', widths[6]),
        _dataCell('—', widths[7]),
        if (showManual) _dataCell('—', widths[8]),
      ],
    );
  }

  Widget _headerCell(String label, double w) {
    return SizedBox(
      width: w,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        child: Text(
          label,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: _bodyFontSize,
          ),
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }

  TableRow _buildTableRow(
    BuildContext context,
    DocumentSnapshot<Map<String, dynamic>> doc,
    List<double> widths,
    bool showManual,
  ) {
    final d = doc.data() ?? {};
    final clockOut = d['clockOut'];
    final isWorking = clockOut == null;
    final statusColor = isWorking ? Colors.red[100]! : Colors.green[100]!;
    final statusText = isWorking ? '勤務中' : '退勤済み';

    return TableRow(
      children: [
        _dataCell(d['staffsFullName']?.toString() ?? '—', widths[0]),
        _dataCellWithBg(statusText, widths[1], statusColor),
        _dataCell(d['date']?.toString() ?? '—', widths[2]),
        _dataCell(_formatTimestamp(d['clockIn']), widths[3]),
        _dataCellWithBg(
          _formatTimestamp(clockOut),
          widths[4],
          isWorking ? Colors.red[100]! : Colors.green[100]!,
        ),
        _dataCell((d['totalMinutes'] ?? '').toString(), widths[5]),
        _dataCell(_formatTimestampFull(d['createdAt']), widths[6]),
        _dataCell(_formatTimestampFull(d['updatedAt']), widths[7]),
        if (showManual) _actionCell(context, doc, isWorking, widths[8]),
      ],
    );
  }

  Widget _dataCell(String text, double w) {
    return SizedBox(
      width: w,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Text(
          text,
          style: const TextStyle(fontSize: _bodyFontSize),
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
        ),
      ),
    );
  }

  Widget _dataCellWithBg(String text, double w, Color bg) {
    return Container(
      width: w,
      color: bg,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      child: Text(
        text,
        style: const TextStyle(fontSize: _bodyFontSize),
        overflow: TextOverflow.ellipsis,
        maxLines: 1,
      ),
    );
  }

  Widget _actionCell(
    BuildContext context,
    DocumentSnapshot<Map<String, dynamic>> doc,
    bool isWorking,
    double w,
  ) {
    return SizedBox(
      width: w,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: ElevatedButton(
          onPressed: isWorking ? () => _onClockOutTap(context, doc) : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: isWorking ? Colors.blue : Colors.grey,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            minimumSize: Size.zero,
          ),
          child: const Text('退勤処理', style: TextStyle(fontSize: _bodyFontSize)),
        ),
      ),
    );
  }

  void _onClockOutTap(
    BuildContext context,
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final staffId = data['staffId']?.toString() ?? '';
    final staffName = data['staffsFullName']?.toString() ?? '—';
    if (staffId.isEmpty) {
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('退勤処理エラー'),
          content: const Text('スタッフIDが取得できないため退勤処理できません'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    final options = _buildAdjustmentOptions(config);
    int selectedOffset = 0;
    final birthController = TextEditingController();
    bool isSubmitting = false;
    String? errorText;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocalState) => AlertDialog(
          title: const Text('退勤処理'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('氏名: $staffName'),
                const SizedBox(height: 6),
                Text('出勤時刻: ${_formatTimestamp(data['clockIn'])}'),
                const SizedBox(height: 10),
                const Text(
                  '上記の退勤処理を行う場合は誕生日を4桁で入力して下さい(例：4月3日→0403)',
                  style: TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: birthController,
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  decoration: const InputDecoration(
                    labelText: '誕生日 (MMDD)',
                    counterText: '',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (config.attendanceTimeAdjustmentEnabled) ...[
                  const SizedBox(height: 10),
                  DropdownButtonFormField<int>(
                    value: selectedOffset,
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
                    onChanged: isSubmitting
                        ? null
                        : (v) {
                            if (v == null) return;
                            setLocalState(() {
                              selectedOffset = v;
                            });
                          },
                  ),
                ],
                if (errorText != null) ...[
                  const SizedBox(height: 10),
                  Text(errorText!, style: const TextStyle(color: Colors.red)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: isSubmitting ? null : () => Navigator.pop(ctx),
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: isSubmitting
                  ? null
                  : () async {
                      setLocalState(() {
                        isSubmitting = true;
                        errorText = null;
                      });
                      try {
                        final staffDoc = await FirebaseFirestore.instance
                            .collection('staffs')
                            .doc(staffId)
                            .get();
                        final birthMonthDay =
                            staffDoc.data()?['birthMonthDay']?.toString() ?? '';
                        if (birthMonthDay.isEmpty) {
                          setLocalState(() {
                            errorText =
                                'スタッフに誕生日が登録されていません。先行して誕生日の登録を行って下さい。';
                            isSubmitting = false;
                          });
                          return;
                        }
                        final entered = birthController.text.trim();
                        if (entered != birthMonthDay) {
                          setLocalState(() {
                            errorText =
                                '選択されたユーザーの誕生日が適切に入力されていません。選択したユーザーが正しいか、また入力した誕生日が正しいかを確認して下さい。';
                            isSubmitting = false;
                          });
                          return;
                        }
                        final result =
                            await attendanceService.updateManualClockOutRecord(
                          doc.id,
                          adjustmentOffsetMinutes:
                              config.attendanceTimeAdjustmentEnabled
                                  ? selectedOffset
                                  : null,
                        );
                        if (!ctx.mounted) return;
                        Navigator.pop(ctx);
                        if (result.warning != null) {
                          await showDialog<void>(
                            context: context,
                            builder: (dCtx) => AlertDialog(
                              title: const Text('退勤処理（注意）'),
                              content: Text(
                                  '${result.message}\n\n${result.warning}'),
                              actions: [
                                TextButton(
                                  onPressed: () =>
                                      Navigator.of(dCtx).pop(),
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
                            ),
                          );
                        }
                      } catch (e) {
                        setLocalState(() {
                          errorText = e.toString().replaceFirst('Exception: ', '');
                          isSubmitting = false;
                        });
                      }
                    },
              child: const Text('確定'),
            ),
          ],
        ),
      ),
    ).then((_) {
      birthController.dispose();
    });
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

  String _formatTimestamp(dynamic v) {
    if (v == null) return '';
    if (v is Timestamp) {
      final dt = v.toDate();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    return v.toString();
  }

  /// createdAt / updatedAt 用: Timestamp を M/d HH:mm 形式で表示（日本時間）
  String _formatTimestampFull(dynamic v) {
    if (v == null) return '—';
    if (v is Timestamp) {
      final dt = v.toDate();
      final jst = dt.toUtc().add(const Duration(hours: 9));
      return '${jst.month}/${jst.day} '
          '${jst.hour.toString().padLeft(2, '0')}:${jst.minute.toString().padLeft(2, '0')}';
    }
    return v.toString();
  }

  String _addDays(String dateKey, int days) {
    final parts = dateKey.split('-');
    if (parts.length != 3) return dateKey;
    try {
      final dt = DateTime(
        int.parse(parts[0]),
        int.parse(parts[1]),
        int.parse(parts[2]),
      ).add(Duration(days: days));
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return dateKey;
    }
  }
}

/// シフト一覧タブ
class _ShiftListTab extends StatelessWidget {
  final AttendanceService attendanceService;
  final StoreConfigData config;

  const _ShiftListTab({
    required this.attendanceService,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, metaSnapshot) {
        if (!metaSnapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final meta = metaSnapshot.data!;
        final shiftDate = meta.isRunning
            ? (meta.currentBusinessDateKey ?? '')
            : _shiftDateForNonRunning(meta.lastClosedBusinessDateKey ?? '');
        return _ShiftListContent(
          shiftDate: shiftDate,
          attendanceService: attendanceService,
          config: config,
        );
      },
    );
  }

  String _shiftDateForNonRunning(String lastClosed) {
    if (lastClosed.isEmpty) {
      final now = DateTime.now();
      final next = now.add(const Duration(days: 1));
      return '${next.year}-${next.month.toString().padLeft(2, '0')}-${next.day.toString().padLeft(2, '0')}';
    }
    final parts = lastClosed.split('-');
    if (parts.length != 3) return lastClosed;
    try {
      final dt = DateTime(
        int.parse(parts[0]),
        int.parse(parts[1]),
        int.parse(parts[2]),
      ).add(const Duration(days: 1));
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return lastClosed;
    }
  }
}

class _ShiftListContent extends StatelessWidget {
  final String shiftDate;
  final AttendanceService attendanceService;
  final StoreConfigData config;

  const _ShiftListContent({
    required this.shiftDate,
    required this.attendanceService,
    required this.config,
  });

  /// startMinute/endMinute（0時からの分数）を "HH:MM" 形式に変換
  static String _minuteToTime(int minute) {
    final h = minute ~/ 60;
    final m = minute % 60;
    return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    if (shiftDate.isEmpty) {
      return const Center(child: Text('日付が取得できません'));
    }
    // shiftDate は YYYY-MM-DD。shifts/{yearMonth}/days/{dateKey} のパスを構築
    final yearMonth = shiftDate.length >= 7 ? shiftDate.substring(0, 7) : '';
    if (yearMonth.isEmpty) {
      return const Center(child: Text('日付形式が不正です'));
    }
    final dayDocRef = FirebaseFirestore.instance
        .collection('shifts')
        .doc(yearMonth)
        .collection('days')
        .doc(shiftDate);

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: dayDocRef.snapshots(),
      builder: (context, daySnapshot) {
        if (!daySnapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final dayDoc = daySnapshot.data!;
        final dayData = dayDoc.data();
        final assignments = (dayData?['assignments'] as List<dynamic>?) ?? [];

        if (assignments.isEmpty) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    'シフト日: $shiftDate',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                    child: Text(
                      '該当日のシフトはありません',
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                ),
              ],
            ),
          );
        }

        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection('attendances')
              .where('date', isEqualTo: shiftDate)
              .snapshots(),
          builder: (context, attSnapshot) {
            if (!attSnapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final attByStaff = <String, Map<String, dynamic>>{};
            for (final doc in attSnapshot.data!.docs) {
              final d = doc.data();
              final sid = d['staffId']?.toString() ?? '';
              if (sid.isNotEmpty) {
                attByStaff[sid] = {...d, 'docId': doc.id};
              }
            }

            final rows = <_ShiftRowData>[];
            for (final a in assignments) {
              final map = a is Map ? Map<String, dynamic>.from(a) : <String, dynamic>{};
              final staffId = map['staffId']?.toString() ?? '';
              final staffName = map['staffName']?.toString() ?? '—';
              final startMinute = map['startMinute'];
              final endMinute = map['endMinute'];

              String start = '—';
              String end = '—';
              if (startMinute is int) {
                start = _minuteToTime(startMinute);
              }
              if (endMinute is int) {
                end = _minuteToTime(endMinute);
              }

              final att = staffId.isNotEmpty ? attByStaff[staffId] : null;
              String workStatus = '出勤前';
              if (att != null) {
                workStatus = att['clockOut'] == null ? '勤務中' : '退勤済み';
              }

              rows.add(_ShiftRowData(
                staffId: staffId,
                staffName: staffName,
                workStatus: workStatus,
                start: start,
                end: end,
                canClockIn: att == null,
              ));
            }
            rows.sort((a, b) => a.staffName.compareTo(b.staffName));

            return SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      'シフト日: $shiftDate',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  ...rows.map(
                    (r) => _ShiftListTile(
                      data: r,
                      attendanceService: attendanceService,
                      config: config,
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _ShiftRowData {
  final String staffId;
  final String staffName;
  final String workStatus;
  final String start;
  final String end;
  final bool canClockIn;

  _ShiftRowData({
    required this.staffId,
    required this.staffName,
    required this.workStatus,
    required this.start,
    required this.end,
    required this.canClockIn,
  });
}

class _ShiftListTile extends StatelessWidget {
  final _ShiftRowData data;
  final AttendanceService attendanceService;
  final StoreConfigData config;

  const _ShiftListTile({
    required this.data,
    required this.attendanceService,
    required this.config,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(data.staffName),
        subtitle: Text(
          '勤務状態: ${data.workStatus} | 開始: ${data.start} | 終了: ${data.end}',
          style: const TextStyle(fontSize: 12),
        ),
        trailing: config.createAttendanceByManual
            ? ElevatedButton(
                onPressed:
                    data.canClockIn ? () => _showManualClockInDialog(context) : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: data.canClockIn ? Colors.green : Colors.grey,
                  foregroundColor: Colors.white,
                ),
                child: const Text('出勤登録'),
              )
            : null,
      ),
    );
  }

  void _showManualClockInDialog(BuildContext context) {
    if (data.staffId.isEmpty) {
      showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('出勤処理エラー'),
          content: const Text('スタッフIDが取得できないため出勤登録できません'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    final options = _buildAdjustmentOptions(config);
    int selectedOffset = 0;
    final birthController = TextEditingController();
    bool isSubmitting = false;
    String? errorText;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocalState) => AlertDialog(
          title: const Text('出勤処理'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('氏名: ${data.staffName}'),
                const SizedBox(height: 10),
                const Text(
                  '上記の出勤処理を行う場合は誕生日を4桁で入力して下さい(例：4月3日→0403)',
                  style: TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: birthController,
                  keyboardType: TextInputType.number,
                  maxLength: 4,
                  decoration: const InputDecoration(
                    labelText: '誕生日 (MMDD)',
                    counterText: '',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (config.attendanceTimeAdjustmentEnabled) ...[
                  const SizedBox(height: 10),
                  DropdownButtonFormField<int>(
                    value: selectedOffset,
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
                    onChanged: isSubmitting
                        ? null
                        : (v) {
                            if (v == null) return;
                            setLocalState(() => selectedOffset = v);
                          },
                  ),
                ],
                if (errorText != null) ...[
                  const SizedBox(height: 10),
                  Text(errorText!, style: const TextStyle(color: Colors.red)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: isSubmitting ? null : () => Navigator.pop(ctx),
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: isSubmitting
                  ? null
                  : () async {
                      setLocalState(() {
                        isSubmitting = true;
                        errorText = null;
                      });
                      try {
                        final staffDoc = await FirebaseFirestore.instance
                            .collection('staffs')
                            .doc(data.staffId)
                            .get();
                        final birthMonthDay =
                            staffDoc.data()?['birthMonthDay']?.toString() ?? '';
                        if (birthMonthDay.isEmpty) {
                          setLocalState(() {
                            errorText =
                                'スタッフに誕生日が登録されていません。先行して誕生日の登録を行って下さい。';
                            isSubmitting = false;
                          });
                          return;
                        }
                        final entered = birthController.text.trim();
                        if (entered != birthMonthDay) {
                          setLocalState(() {
                            errorText =
                                '選択されたユーザーの誕生日が適切に入力されていません。選択したユーザーが正しいか、また入力した誕生日が正しいかを確認して下さい。';
                            isSubmitting = false;
                          });
                          return;
                        }
                        final result =
                            await attendanceService.createManualClockInRecord(
                          data.staffId,
                          data.staffName,
                          adjustmentOffsetMinutes:
                              config.attendanceTimeAdjustmentEnabled
                                  ? selectedOffset
                                  : null,
                        );
                        if (!ctx.mounted) return;
                        Navigator.pop(ctx);
                        if (result.warning != null) {
                          await showDialog<void>(
                            context: context,
                            builder: (dCtx) => AlertDialog(
                              title: const Text('出勤処理（注意）'),
                              content: Text(
                                  '${result.message}\n\n${result.warning}'),
                              actions: [
                                TextButton(
                                  onPressed: () =>
                                      Navigator.of(dCtx).pop(),
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
                            ),
                          );
                        }
                      } catch (e) {
                        setLocalState(() {
                          errorText = e.toString().replaceFirst('Exception: ', '');
                          isSubmitting = false;
                        });
                      }
                    },
              child: const Text('確定'),
            ),
          ],
        ),
      ),
    ).then((_) {
      birthController.dispose();
    });
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
