import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/Home/staff_retired_ui_helpers.dart';

import 'admin_attendance_editAndCreate_page.dart';

class AdminAttendanceListPage extends StatefulWidget {
  const AdminAttendanceListPage({super.key});

  @override
  State<AdminAttendanceListPage> createState() => _AdminAttendanceListPageState();
}

class _AdminAttendanceListPageState extends State<AdminAttendanceListPage> {
  late DateTime _selectedDate;
  Set<String> _retiredStaffIds = {};

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selectedDate = DateTime(now.year, now.month, now.day);
    _loadRetiredStaffIds();
  }

  Future<void> _loadRetiredStaffIds() async {
    final ids = await StaffRetiredUi.fetchRetiredStaffIds();
    if (mounted) {
      setState(() {
        _retiredStaffIds = ids;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateKey = _fmtDateKey(_selectedDate);
    return Scaffold(
      appBar: AppBar(title: const Text('管理者用・勤怠データ一覧')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddPage,
        label: const Text('出勤データの追加'),
        icon: const Icon(Icons.add),
      ),
      body: Column(
        children: [
          const SizedBox(height: 12),
          Center(
            child: InkWell(
              onTap: _pickRecentDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey.shade400),
                  color: Colors.white,
                ),
                child: Text(
                  _fmtDate(_selectedDate),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          const Text('日付をタップすると直近30日を選択できます', style: TextStyle(fontSize: 12)),
          const SizedBox(height: 8),
          Expanded(
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: FirebaseFirestore.instance
                  .collection('attendances')
                  .where('date', isEqualTo: dateKey)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(child: Text('エラー: ${snapshot.error}'));
                }
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                final docs = snapshot.data!.docs.toList()
                  ..sort((a, b) {
                    final aIn = a.data()['clockIn'];
                    final bIn = b.data()['clockIn'];
                    if (aIn is Timestamp && bIn is Timestamp) return aIn.compareTo(bIn);
                    return 0;
                  });
                if (docs.isEmpty) {
                  return const Center(child: Text('データがありません'));
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: docs.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final doc = docs[index];
                    final d = doc.data();
                    final clockOut = d['clockOut'];
                    final closedWithout = d['closedStoreWithoutClockOut'] == true;
                    final bool isUnclocked = clockOut == null && closedWithout;
                    final bool isWorking = clockOut == null && !closedWithout;
                    final bool isDeleted = d['isDeleted'] == true;
                    final bool isOnBreak = d['isOnBreak'] == true;
                    final String status;
                    Color tileColor;
                    if (isDeleted) {
                      status = '削除済み';
                      tileColor = Colors.grey[300]!;
                    } else if (isOnBreak && isWorking) {
                      status = '休憩中';
                      tileColor = Colors.orange[50]!;
                    } else if (isUnclocked) {
                      status = '未退勤データ';
                      tileColor = Colors.red[100]!;
                    } else if (isWorking) {
                      status = '勤務中';
                      tileColor = Colors.white;
                    } else {
                      status = '退勤済み';
                      tileColor = Colors.grey[200]!;
                    }
                    final showWorkTimes = status == '退勤済み';
                    final workMin = d['actualWorkMinutes'] ?? d['totalMinutes'];
                    final nightMin = d['nightWorkMinutes'] ?? d['nightMinutes'];
                    final workStr = showWorkTimes && workMin != null
                        ? '実働:${workMin}分(うち深夜:${nightMin ?? 0}分)'
                        : '実働:-(うち深夜:-)';
                    final breakMin = d['breakMinutes'];
                    final breakStr = showWorkTimes
                        ? (breakMin != null ? '${breakMin}分' : '-')
                        : '-';
                    final staffName = d['staffsFullName']?.toString() ?? '—';
                    final staffId = d['staffId']?.toString() ?? '';
                    return ListTile(
                      tileColor: tileColor,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                        side: BorderSide(color: Colors.grey.shade300),
                      ),
                      title: StaffRetiredUi.nameWithRetiredBadge(
                        name: staffName,
                        isRetired: staffId.isNotEmpty &&
                            _retiredStaffIds.contains(staffId),
                      ),
                      subtitle: Text(
                        '勤務状況: $status\n'
                        '出勤: ${_fmtTs(d['clockIn'])}  退勤: ${_fmtTs(d['clockOut'])}\n'
                        '$workStr 休憩: $breakStr'
                        '${isDeleted ? '\n（論理削除済み）' : ''}',
                      ),
                      trailing: TextButton.icon(
                        onPressed: isDeleted ? null : () => _openEditPage(doc.id, d),
                        icon: const Icon(Icons.edit),
                        label: const Text('編集'),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickRecentDate() async {
    final candidates = List<DateTime>.generate(
      30,
      (i) => DateTime.now().subtract(Duration(days: i)),
    );
    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      builder: (ctx) => ListView.builder(
        itemCount: candidates.length,
        itemBuilder: (context, index) {
          final d = candidates[index];
          return ListTile(
            title: Text(_fmtDate(d)),
            onTap: () => Navigator.pop(ctx, DateTime(d.year, d.month, d.day)),
          );
        },
      ),
    );
    if (picked == null) return;
    setState(() => _selectedDate = picked);
  }

  Future<void> _openAddPage() async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => AdminAttendanceFormPage.add(initialDate: _selectedDate),
      ),
    );
    if (changed == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('勤怠データを登録しました'), backgroundColor: Colors.green),
      );
    }
  }

  Future<void> _openEditPage(String docId, Map<String, dynamic> data) async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => AdminAttendanceFormPage.edit(
          initialDate: _selectedDate,
          attendanceDocId: docId,
          initialData: data,
        ),
      ),
    );
    if (changed == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('勤怠データを更新しました'), backgroundColor: Colors.green),
      );
    }
  }

  static String _fmtDate(DateTime d) =>
      '${d.year}/${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}';

  static String _fmtDateKey(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String _fmtTs(dynamic ts) {
    if (ts is! Timestamp) return '—';
    final dt = ts.toDate();
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
