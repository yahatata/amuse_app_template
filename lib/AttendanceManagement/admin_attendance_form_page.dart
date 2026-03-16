import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

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

class _AdminAttendanceFormPageState extends State<AdminAttendanceFormPage> {
  bool _isSaving = false;
  bool _isLoadingStaffs = true;
  String? _errorText;

  List<_StaffOption> _staffs = <_StaffOption>[];
  String? _selectedStaffId;
  String? _selectedStaffName;
  late DateTime _selectedDate;
  TimeOfDay? _clockInTime;
  TimeOfDay? _clockOutTime;

  @override
  void initState() {
    super.initState();
    _selectedDate = DateTime(
      widget.initialDate.year,
      widget.initialDate.month,
      widget.initialDate.day,
    );
    _initializeFromInitialData();
    _loadStaffs();
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

  Future<void> _loadStaffs() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('staffs')
          .orderBy('fullName')
          .get();
      final staffs = snap.docs
          .map((d) => _StaffOption(id: d.id, name: d.data()['fullName']?.toString() ?? '—'))
          .toList();
      if (!mounted) return;
      setState(() {
        _staffs = staffs;
        _isLoadingStaffs = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoadingStaffs = false;
        _errorText = 'スタッフ取得に失敗しました: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isEdit ? '管理者用・勤怠データ編集' : '管理者用・勤怠データ登録'),
      ),
      body: _isLoadingStaffs
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_errorText != null) ...[
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 12),
                ],
                _buildStaffField(),
                const SizedBox(height: 12),
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
                FilledButton(
                  onPressed: _isSaving ? null : _onSubmit,
                  child: Text(widget.isEdit ? '登録' : '登録'),
                ),
              ],
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

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('内容確認'),
        content: Text(
          'スタッフ: ${_selectedStaffName!}\n'
          '日付: ${_fmtDate(_selectedDate)}\n'
          '出勤: ${_fmtTime(_clockInTime!)}\n'
          '退勤: ${clockOutAt == null ? '未入力' : _fmtTime(_clockOutTime!)}\n'
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
      final totalMinutes = (clockOutAt == null) ? 0 : clockOutAt.difference(clockInAt).inMinutes;
      final nightMinutes = (clockOutAt == null) ? 0 : _calculateNightMinutes(clockInAt, clockOutAt);
      final dateKey = _fmtDateKey(_selectedDate);
      final payload = <String, dynamic>{
        'staffId': _selectedStaffId,
        'staffsFullName': _selectedStaffName,
        'date': dateKey,
        'clockIn': Timestamp.fromDate(clockInAt),
        'clockOut': clockOutAt == null ? null : Timestamp.fromDate(clockOutAt),
        'closedStoreWithoutClockOut': false,
        'isManual': true,
        'totalMinutes': totalMinutes,
        'nightMinutes': nightMinutes,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (widget.isEdit) {
        await FirebaseFirestore.instance
            .collection('attendances')
            .doc(widget.attendanceDocId!)
            .update(payload);
      } else {
        await FirebaseFirestore.instance.collection('attendances').add({
          ...payload,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorText = '保存に失敗しました: $e');
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

  static int _calculateNightMinutes(DateTime clockIn, DateTime clockOut) {
    int nightMinutes = 0;
    var current = DateTime(clockIn.year, clockIn.month, clockIn.day, clockIn.hour, clockIn.minute);
    while (current.isBefore(clockOut)) {
      final hour = current.hour;
      if (hour >= 22 || hour < 5) {
        nightMinutes++;
      }
      current = current.add(const Duration(minutes: 1));
    }
    return nightMinutes;
  }
}

class _StaffOption {
  final String id;
  final String name;
  _StaffOption({required this.id, required this.name});
}
