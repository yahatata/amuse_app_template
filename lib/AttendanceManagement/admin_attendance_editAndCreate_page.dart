import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/AttendanceManagement/attendance_user_facing_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';

import 'attendanceService.dart';

class AdminAttendanceFormPage extends StatefulWidget {
  final DateTime initialDate;
  final String? attendanceDocId;
  final Map<String, dynamic>? initialData;

  const AdminAttendanceFormPage.add({
    super.key,
    required this.initialDate,
  })  : attendanceDocId = null,
        initialData = null;

  const AdminAttendanceFormPage.edit({
    super.key,
    required this.initialDate,
    required this.attendanceDocId,
    required this.initialData,
  });

  bool get isEdit => attendanceDocId != null;

  @override
  State<AdminAttendanceFormPage> createState() => _AdminAttendanceFormPageState();
}

class _BreakEditItem {
  String breakId;
  DateTime startedAt;
  DateTime endedAt;
  bool isDeleted;

  _BreakEditItem({
    required this.breakId,
    required this.startedAt,
    required this.endedAt,
    required this.isDeleted,
  });
}

class _AdminAttendanceFormPageState extends State<AdminAttendanceFormPage>
    with SingleTickerProviderStateMixin {
  bool _isSaving = false;
  bool _isLoadingStaffs = true;
  bool _breaksLoadFailed = false;
  bool _staffsLoadFailed = false;
  String? _errorText;

  late TabController _tabController;

  final AttendanceService _attendanceService = AttendanceService();

  List<_StaffOption> _staffs = <_StaffOption>[];
  String? _selectedStaffId;
  String? _selectedStaffName;
  late DateTime _selectedDate;
  TimeOfDay? _clockInTime;
  TimeOfDay? _clockOutTime;

  List<_BreakEditItem> _breaks = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: widget.isEdit ? 2 : 1,
      vsync: this,
    );
    _selectedDate = DateTime(
      widget.initialDate.year,
      widget.initialDate.month,
      widget.initialDate.day,
    );
    _initializeFromInitialData();
    _loadStaffs();
    if (widget.isEdit && widget.attendanceDocId != null) {
      _loadBreaks();
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _initializeFromInitialData() {
    if (!widget.isEdit || widget.initialData == null) return;
    final data = widget.initialData!;
    _selectedStaffId = data['staffId']?.toString();
    _selectedStaffName = data['staffsFullName']?.toString();
    final clockIn = data['clockIn'];
    final clockOut = data['clockOut'];
    if (clockIn is Timestamp) {
      final dt = clockIn.toDate();
      _clockInTime = TimeOfDay(hour: dt.hour, minute: dt.minute);
    }
    if (clockOut is Timestamp) {
      final dt = clockOut.toDate();
      _clockOutTime = TimeOfDay(hour: dt.hour, minute: dt.minute);
    }
  }

  Future<void> _loadBreaks() async {
    if (widget.attendanceDocId == null) return;
    try {
      final snap = await FirebaseFirestore.instance
          .collection('attendances')
          .doc(widget.attendanceDocId)
          .collection('breaks')
          .orderBy('startedAt', descending: false)
          .get();

      final items = <_BreakEditItem>[];
      for (final doc in snap.docs) {
        final d = doc.data();
        final isDeleted = d['isDeleted'] == true;
        final startedAt = d['startedAt'];
        final endedAt = d['endedAt'];
        if (startedAt is Timestamp && endedAt is Timestamp) {
          items.add(_BreakEditItem(
            breakId: doc.id,
            startedAt: startedAt.toDate(),
            endedAt: endedAt.toDate(),
            isDeleted: isDeleted,
          ));
        }
      }
      if (!mounted) return;
      setState(() {
        _breaks = items;
        _breaksLoadFailed = false;
      });
    } catch (_) {
      if (!mounted) return;
      // ATT-12: 失敗と空一覧（0件）を区別。raw Firestore は出さない。
      setState(() {
        _breaksLoadFailed = true;
        _errorText = kAttendanceBreaksLoadFailedMessage;
      });
    }
  }

  bool get _isDeleted => widget.isEdit &&
      widget.initialData != null &&
      widget.initialData!['isDeleted'] == true;

  Future<void> _loadStaffs() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('staffs')
          .orderBy('fullName')
          .get();
      final staffs = snap.docs
          .where((d) => d.data()['status'] != 'retired')
          .map((d) => _StaffOption(id: d.id, name: d.data()['fullName']?.toString() ?? '—'))
          .toList();
      if (!mounted) return;
      setState(() {
        _staffs = staffs;
        _isLoadingStaffs = false;
        _staffsLoadFailed = false;
      });
    } catch (_) {
      if (!mounted) return;
      // ATT-13: 失敗と空一覧を区別。raw Firestore は出さない。
      setState(() {
        _isLoadingStaffs = false;
        _staffsLoadFailed = true;
        _errorText = kAttendanceStaffListLoadFailedMessage;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isSaving,
      child: Stack(
        children: [
          Scaffold(
            appBar: AppBar(
              title: Text(
                widget.isEdit ? '管理者用・勤怠データ編集' : '管理者用・勤怠データ登録',
              ),
              bottom: widget.isEdit
                  ? TabBar(
                      controller: _tabController,
                      tabs: const [
                        Tab(text: '勤怠概要'),
                        Tab(text: '休憩データ'),
                      ],
                    )
                  : null,
            ),
            body: _isLoadingStaffs
                ? const Center(child: CircularProgressIndicator())
                : widget.isEdit
                    ? TabBarView(
                        controller: _tabController,
                        children: [
                          _buildOverviewTab(),
                          _buildBreaksTab(),
                        ],
                      )
                    : _buildOverviewTab(),
          ),
          if (_isSaving)
            Positioned.fill(
              child: AbsorbPointer(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.35),
                  child: const Center(
                    child: CircularProgressIndicator(),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildOverviewTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_errorText != null) ...[
          Text(_errorText!, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 12),
        ],
        if (!_staffsLoadFailed) ...[
          _buildStaffField(),
          const SizedBox(height: 12),
        ],
        _buildDateField(),
        const SizedBox(height: 12),
        _buildTimeField(
          label: '出勤時刻(必須)',
          value: _clockInTime,
          required: true,
          onSelect: (v) => setState(() => _clockInTime = v),
        ),
        const SizedBox(height: 12),
        _buildTimeField(
          label: '退勤時刻(任意)',
          value: _clockOutTime,
          required: false,
          onSelect: (v) => setState(() => _clockOutTime = v),
        ),
        const SizedBox(height: 24),
        if (_isDeleted)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text(
              'この勤怠は削除済みです。編集・論理削除はできません。',
              style: TextStyle(color: Colors.grey),
            ),
          )
        else ...[
          FilledButton(
            onPressed: _isSaving ? null : _onSubmit,
            child: Text(widget.isEdit ? '登録' : '登録'),
          ),
          if (widget.isEdit) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _isSaving ? null : _onMarkDeleted,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
                side: const BorderSide(color: Colors.red),
              ),
              child: const Text('この勤怠データ自体を削除する'),
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildBreaksTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_errorText != null) ...[
          Text(_errorText!, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 12),
        ],
        if (_breaksLoadFailed)
          const SizedBox.shrink()
        else if (_breaks.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Text(
              '休憩データがありません',
              style: TextStyle(fontSize: 16, color: Colors.grey),
            ),
          )
        else
          ...List.generate(_breaks.length, (index) {
            final item = _breaks[index];
            return _buildBreakRow(item, index + 1);
          }),
        const SizedBox(height: 24),
        if (_isDeleted)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text(
              'この勤怠は削除済みです。編集・論理削除はできません。',
              style: TextStyle(color: Colors.grey),
            ),
          )
        else ...[
          FilledButton(
            onPressed: _isSaving ? null : _onSubmit,
            child: Text(widget.isEdit ? '登録' : '登録'),
          ),
          if (widget.isEdit) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _isSaving ? null : _onMarkDeleted,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
                side: const BorderSide(color: Colors.red),
              ),
              child: const Text('この勤怠データ自体を削除する'),
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildBreakRow(_BreakEditItem item, int index) {
    final line = '開始：${_fmtDate(item.startedAt)} ${_fmtTime(TimeOfDay(hour: item.startedAt.hour, minute: item.startedAt.minute))}  ~  終了：${_fmtDate(item.endedAt)} ${_fmtTime(TimeOfDay(hour: item.endedAt.hour, minute: item.endedAt.minute))}';
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: item.isDeleted || _isDeleted
            ? null
            : () => _showBreakEditDialog(item),
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Text(
                          '休憩$index',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: item.isDeleted ? Colors.grey : null,
                            decoration: item.isDeleted ? TextDecoration.lineThrough : null,
                          ),
                        ),
                        if (item.isDeleted) ...[
                          const SizedBox(width: 8),
                          Text(
                            '削除済み',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      line,
                      style: TextStyle(
                        fontSize: 13,
                        color: item.isDeleted ? Colors.grey : null,
                        decoration: item.isDeleted ? TextDecoration.lineThrough : null,
                      ),
                    ),
                  ],
                ),
              ),
              if (!_isDeleted)
                item.isDeleted
                    ? TextButton.icon(
                        icon: const Icon(Icons.restore, size: 18),
                        label: const Text('復元'),
                        onPressed: () => _onRestoreBreak(item),
                      )
                    : IconButton(
                        icon: const Icon(Icons.delete_outline, color: Colors.red, size: 22),
                        onPressed: () => _onDeleteBreak(item),
                        tooltip: '休憩を削除',
                      ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showBreakEditDialog(_BreakEditItem item) async {
    DateTime startedAt = item.startedAt;
    DateTime endedAt = item.endedAt;
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text('休憩の編集（${_breaks.indexOf(item) + 1}件目）'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildBreakTimeField(
                  label: '開始時刻',
                  value: startedAt,
                  onSelect: (dt) {
                    setDialogState(() {
                      startedAt = dt;
                      if (endedAt.isBefore(dt)) endedAt = dt;
                    });
                  },
                ),
                const SizedBox(height: 12),
                _buildBreakTimeField(
                  label: '終了時刻',
                  value: endedAt,
                  onSelect: (dt) {
                    setDialogState(() {
                      if (dt.isAfter(startedAt)) endedAt = dt;
                    });
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('反映'),
            ),
          ],
        ),
      ),
    );
    if (result == true) {
      setState(() {
        item.startedAt = startedAt;
        item.endedAt = endedAt;
      });
    }
  }

  Future<void> _onDeleteBreak(_BreakEditItem item) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('休憩データの削除'),
        content: Text(
          '休憩${_breaks.indexOf(item) + 1}（${_fmtTime(TimeOfDay(hour: item.startedAt.hour, minute: item.startedAt.minute))} 〜 ${_fmtTime(TimeOfDay(hour: item.endedAt.hour, minute: item.endedAt.minute))}）を削除します。\n\n'
          '削除すると実働時間の計算から除外されます。この操作は取り消せません。\n\n'
          '本当に削除しますか？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('削除する'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() {
      _isSaving = true;
      _errorText = null;
    });
    try {
      final response = await _attendanceService.updateAttendance(
        attendanceId: widget.attendanceDocId!,
        deleteBreakIds: [item.breakId],
      );
      if (!isCallableSuccessResponse(response)) {
        if (!mounted) return;
        setState(() => _errorText = mapCallableSoftFailMessage(response));
        return;
      }
      await _loadBreaks();
      if (!mounted) return;
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = mapCallableError(e, operation: 'updateAttendance').message);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _onRestoreBreak(_BreakEditItem item) async {
    setState(() {
      _isSaving = true;
      _errorText = null;
    });
    try {
      final response = await _attendanceService.updateAttendance(
        attendanceId: widget.attendanceDocId!,
        restoreBreakIds: [item.breakId],
      );
      if (!isCallableSuccessResponse(response)) {
        if (!mounted) return;
        setState(() => _errorText = mapCallableSoftFailMessage(response));
        return;
      }
      await _loadBreaks();
      if (!mounted) return;
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = mapCallableError(e, operation: 'updateAttendance').message);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Widget _buildBreakTimeField({
    required String label,
    required DateTime value,
    required ValueChanged<DateTime> onSelect,
  }) {
    final time = TimeOfDay(hour: value.hour, minute: value.minute);
    return InkWell(
      onTap: () async {
        final picked = await showTimePicker(
          context: context,
          initialTime: time,
        );
        if (picked != null) {
          onSelect(DateTime(
            value.year,
            value.month,
            value.day,
            picked.hour,
            picked.minute,
          ));
        }
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
        child: Text(_fmtTime(time)),
      ),
    );
  }

  Widget _buildStaffField() {
    if (widget.isEdit) {
      return TextFormField(
        readOnly: true,
        initialValue: _selectedStaffName ?? '—',
        decoration: const InputDecoration(
          labelText: 'スタッフ(必須)',
          border: OutlineInputBorder(),
        ),
      );
    }
    return DropdownButtonFormField<String>(
      value: _selectedStaffId,
      decoration: const InputDecoration(
        labelText: 'スタッフ(必須)',
        border: OutlineInputBorder(),
      ),
      items: _staffs
          .map((s) => DropdownMenuItem<String>(value: s.id, child: Text(s.name)))
          .toList(),
      onChanged: (v) {
        if (v == null) return;
        final selected = _staffs.firstWhere((e) => e.id == v);
        setState(() {
          _selectedStaffId = selected.id;
          _selectedStaffName = selected.name;
        });
      },
    );
  }

  Widget _buildDateField() {
    return InkWell(
      onTap: widget.isEdit ? null : _pickDate,
      child: InputDecorator(
        decoration: const InputDecoration(
          labelText: '日付(必須)',
          border: OutlineInputBorder(),
        ),
        child: Text(_fmtDate(_selectedDate)),
      ),
    );
  }

  Widget _buildTimeField({
    required String label,
    required TimeOfDay? value,
    required bool required,
    required ValueChanged<TimeOfDay?> onSelect,
  }) {
    return Row(
      children: [
        Expanded(
          child: InkWell(
            onTap: () async {
              final picked = await showTimePicker(
                context: context,
                initialTime: value ?? const TimeOfDay(hour: 18, minute: 0),
              );
              if (picked != null) onSelect(picked);
            },
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: label,
                border: const OutlineInputBorder(),
                errorText: required && value == null ? '必須' : null,
              ),
              child: Text(value == null ? '' : _fmtTime(value)),
            ),
          ),
        ),
        if (!required) ...[
          const SizedBox(width: 8),
          TextButton(
            onPressed: () => onSelect(null),
            child: const Text('クリア'),
          ),
        ],
      ],
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020, 1, 1),
      lastDate: DateTime(2100, 12, 31),
    );
    if (picked == null) return;
    setState(() => _selectedDate = DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _onSubmit() async {
    if (_clockInTime == null) {
      setState(() => _errorText = '出勤時刻を入力してください');
      return;
    }
    if (_selectedStaffId == null || _selectedStaffName == null) {
      setState(() => _errorText = 'スタッフを選択してください');
      return;
    }

    final clockInAt = DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      _clockInTime!.hour,
      _clockInTime!.minute,
    );
    DateTime? clockOutAt;
    if (_clockOutTime != null) {
      clockOutAt = DateTime(
        _selectedDate.year,
        _selectedDate.month,
        _selectedDate.day,
        _clockOutTime!.hour,
        _clockOutTime!.minute,
      );
      if (clockOutAt.isBefore(clockInAt)) {
        setState(() => _errorText = '退勤時刻は出勤時刻より後にしてください');
        return;
      }
    }

    final activeBreaks = _breaks.where((b) => !b.isDeleted).toList();
    List<Map<String, dynamic>>? updateBreaks;
    if (widget.isEdit && activeBreaks.isNotEmpty) {
      updateBreaks = activeBreaks.map((b) => {
        'breakId': b.breakId,
        'startedAt': b.startedAt,
        'endedAt': b.endedAt,
      }).toList();
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('内容確認'),
        content: Text(
          'スタッフ: ${_selectedStaffName!}\n'
          '日付: ${_fmtDate(_selectedDate)}\n'
          '出勤: ${_fmtTime(_clockInTime!)}\n'
          '退勤: ${clockOutAt == null ? '未入力' : _fmtTime(_clockOutTime!)}\n'
          '${widget.isEdit && activeBreaks.isNotEmpty ? '休憩: ${activeBreaks.length}件を更新\n' : ''}'
          'この内容で登録しますか？',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('キャンセル')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('確認')),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() {
      _isSaving = true;
      _errorText = null;
    });
    try {
      final dateKey = _fmtDateKey(_selectedDate);

      final Map<String, dynamic> response;
      if (widget.isEdit) {
        response = await _attendanceService.updateAttendance(
          attendanceId: widget.attendanceDocId!,
          clockIn: clockInAt,
          clockOut: clockOutAt,
          updateBreaks: updateBreaks,
        );
      } else {
        response = await _attendanceService.createAttendance(
          staffId: _selectedStaffId!,
          staffName: _selectedStaffName!,
          date: dateKey,
          clockIn: clockInAt,
          clockOut: clockOutAt,
        );
      }

      if (!isCallableSuccessResponse(response)) {
        if (!mounted) return;
        setState(() => _errorText = mapCallableSoftFailMessage(response));
        return;
      }

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = mapCallableError(
            e,
            operation: widget.isEdit ? 'updateAttendance' : 'createAttendance',
          ).message);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _onMarkDeleted() async {
    if (widget.attendanceDocId == null) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('勤怠データの削除の確認'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '[警告]',
              style: TextStyle(
                color: Colors.red,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: 12),
            Text(
              'この勤怠を論理削除します。\n'
              '削除後は給与計算の対象外となり、スタッフの勤怠一覧には表示されません。\n'
              '本当に削除しますか？',
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('削除する'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() {
      _isSaving = true;
      _errorText = null;
    });
    try {
      final response = await _attendanceService.updateAttendance(
        attendanceId: widget.attendanceDocId!,
        markDeleted: true,
      );
      if (!isCallableSuccessResponse(response)) {
        if (!mounted) return;
        setState(() => _errorText = mapCallableSoftFailMessage(response));
        return;
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = mapCallableError(e, operation: 'updateAttendance').message);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  static String _fmtDate(DateTime d) =>
      '${d.year}/${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}';

  static String _fmtDateKey(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String _fmtTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

class _StaffOption {
  final String id;
  final String name;
  _StaffOption({required this.id, required this.name});
}
