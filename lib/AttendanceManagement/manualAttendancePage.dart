import 'package:flutter/material.dart';
import 'package:amuse_app_template/AttendanceManagement/attendanceService.dart';

/// 時刻を日本時間の文字列に変換するユーティリティ関数
String formatToJST(String? timeString) {
  if (timeString == null || timeString.isEmpty) return '不明';
  
  try {
    // ISO 8601形式の時刻文字列をパース
    final dateTime = DateTime.parse(timeString);
    
    // UTCからJST（+9時間）に変換
    final jstDateTime = dateTime.toUtc().add(const Duration(hours: 9));
    
    // 日本時間形式でフォーマット
    return '${jstDateTime.year}年${jstDateTime.month}月${jstDateTime.day}日 '
           '${jstDateTime.hour.toString().padLeft(2, '0')}:'
           '${jstDateTime.minute.toString().padLeft(2, '0')}';
  } catch (e) {
    // パースに失敗した場合は元の文字列を返す
    return timeString;
  }
}

class ManualAttendancePage extends StatefulWidget {
  final bool isClockInMode; // true: 出勤モード, false: 退勤モード

  const ManualAttendancePage({
    super.key,
    required this.isClockInMode,
  });

  @override
  State<ManualAttendancePage> createState() => _ManualAttendancePageState();
}

class _ManualAttendancePageState extends State<ManualAttendancePage> {
  final AttendanceService _attendanceService = AttendanceService();
  List<StaffData> _staffList = [];
  List<StaffData> _separateSectionStaff = []; // CHANGESPEC 6-4: 別枠（closedStoreWithoutClockOut=false && clockOut=null）
  String _displayDate = '';
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadStaffList();
  }

  /// スタッフ一覧を読み込み
  Future<void> _loadStaffList() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });

      final result = await _attendanceService.getStaffList(widget.isClockInMode);

      setState(() {
        _staffList = result.staffList;
        _separateSectionStaff = result.separateSectionStaff;
        _displayDate = result.date;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isClockInMode ? '手動出勤' : '手動退勤'),
        centerTitle: true,
        backgroundColor: widget.isClockInMode ? Colors.green : Colors.red,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            // ヘッダー情報
            _buildHeader(),
            const SizedBox(height: 24),
            
            // スタッフ一覧表示
            Expanded(
              child: _buildStaffList(),
            ),
            // CHANGESPEC 6-4: 別枠（退勤モード時のみ、closedStoreWithoutClockOut=false かつ clockOut=null）
            if (!widget.isClockInMode && _separateSectionStaff.isNotEmpty) ...[
              const SizedBox(height: 12),
              _buildSeparateSection(),
            ],
          ],
        ),
      ),
    );
  }

  // ヘッダー情報
  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: widget.isClockInMode ? Colors.green[50] : Colors.red[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: widget.isClockInMode ? Colors.green[300]! : Colors.red[300]!,
        ),
      ),
      child: Row(
        children: [
          Icon(
            widget.isClockInMode ? Icons.login : Icons.logout,
            color: widget.isClockInMode ? Colors.green[700] : Colors.red[700],
            size: 32,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.isClockInMode ? '出勤処理' : '退勤処理',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: widget.isClockInMode ? Colors.green[700] : Colors.red[700],
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.isClockInMode
                      ? '出勤可能なスタッフを選択してください'
                      : '退勤可能なスタッフを選択してください',
                  style: TextStyle(
                    fontSize: 14,
                    color: widget.isClockInMode ? Colors.green[600] : Colors.red[600],
                  ),
                ),
                if (_displayDate.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '対象日: $_displayDate',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // スタッフ一覧表示
  Widget _buildStaffList() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: Column(
        children: [
          // リストヘッダー
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                topRight: Radius.circular(12),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.people,
                  color: Colors.blue[700],
                  size: 24,
                ),
                const SizedBox(width: 8),
                Text(
                  widget.isClockInMode ? '出勤可能なスタッフ' : '退勤可能なスタッフ',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.blue[700],
                  ),
                ),
                const Spacer(),
                Text(
                  '${_getAvailableStaffCount()}名',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    color: Colors.blue[600],
                  ),
                ),
              ],
            ),
          ),
          
          // スタッフリスト
          Expanded(
            child: _buildStaffListContent(),
          ),
        ],
      ),
    );
  }

  // スタッフリストの内容
  Widget _buildStaffListContent() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_errorMessage != null) {
      return Center(
        child: Text(
          _errorMessage!,
          style: const TextStyle(color: Colors.red),
        ),
      );
    }

    if (_staffList.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.people_outline,
              size: 64,
              color: Colors.grey,
            ),
            SizedBox(height: 16),
            Text(
              'スタッフが見つかりません',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(8),
      itemCount: _staffList.length,
      itemBuilder: (context, index) {
        final staff = _staffList[index];
        return Card(
          margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
          elevation: 2,
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: Colors.blue[100],
              radius: 24,
              child: Text(
                staff.fullName[0],
                style: TextStyle(
                  color: Colors.blue[700],
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
            ),
            title: Text(
              staff.fullName,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 16,
              ),
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  staff.position ?? 'スタッフ',
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontSize: 14,
                  ),
                ),
                if (widget.isClockInMode && staff.shiftStart != null)
                  Text(
                    'シフト開始: ${formatToJST(staff.shiftStart)}',
                    style: TextStyle(
                      color: Colors.green[600],
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),

              ],
            ),
            trailing: ElevatedButton(
              onPressed: () {
                _selectStaff(staff);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: widget.isClockInMode ? Colors.green : Colors.red,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: Text(
                widget.isClockInMode ? '出勤' : '退勤',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          ),
        );
      },
    );
  }

  // 利用可能なスタッフ数を取得
  int _getAvailableStaffCount() {
    return _staffList.length;
  }

  /// CHANGESPEC 6-4: 別枠（closedStoreWithoutClockOut=false かつ clockOut=null の退勤前データ）
  Widget _buildSeparateSection() {
    return Container(
      constraints: const BoxConstraints(maxHeight: 200),
      decoration: BoxDecoration(
        color: Colors.amber[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber[300]!),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber[100],
              borderRadius: const BorderRadius.vertical(top: Radius.circular(11)),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: Colors.amber[800], size: 20),
                const SizedBox(width: 8),
                Text(
                  '退勤前のデータ（別枠）',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.amber[900],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.all(8),
              itemCount: _separateSectionStaff.length,
              itemBuilder: (context, index) {
                final staff = _separateSectionStaff[index];
                return Card(
                  margin: const EdgeInsets.symmetric(vertical: 2),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Colors.amber[100],
                      radius: 20,
                      child: Text(
                        staff.fullName.isNotEmpty ? staff.fullName[0] : '?',
                        style: TextStyle(color: Colors.amber[800], fontWeight: FontWeight.bold),
                      ),
                    ),
                    title: Text(staff.fullName, style: const TextStyle(fontSize: 14)),
                    subtitle: Text(
                      '出勤: ${staff.clockIn ?? "—"}',
                      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                    ),
                    trailing: ElevatedButton(
                      onPressed: () => _selectStaff(staff),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      ),
                      child: const Text('退勤'),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // スタッフ選択処理
  void _selectStaff(StaffData staff) {
    // 確認ダイアログを表示
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text(
            widget.isClockInMode ? '出勤確認' : '退勤確認',
            style: TextStyle(
              color: widget.isClockInMode ? Colors.green[700] : Colors.red[700],
            ),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('以下のスタッフの${widget.isClockInMode ? '出勤' : '退勤'}処理を実行しますか？'),
              const SizedBox(height: 16),
              Text(
                '名前: ${staff.fullName}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              if (staff.position != null)
                Text('役職: ${staff.position}'),
              if (widget.isClockInMode && staff.shiftStart != null)
                Text('シフト開始: ${formatToJST(staff.shiftStart)}'),

            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).pop();
                _processAttendance(staff);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: widget.isClockInMode ? Colors.green : Colors.red,
                foregroundColor: Colors.white,
              ),
              child: Text(widget.isClockInMode ? '出勤' : '退勤'),
            ),
          ],
        );
      },
    );
  }

      // 勤怠処理の実行（Phase4 01: clockIn/clockOut 経由に統一）
    Future<void> _processAttendance(StaffData staff) async {
      try {
        if (widget.isClockInMode) {
          // 出勤処理（clockIn Callable）
          final result = await _attendanceService.clockIn(
            staff.uid,
            staffName: staff.fullName,
          );

          if (result.warning != null && mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('${result.message}\n（${result.warning}）'),
                backgroundColor: Colors.orange,
                duration: const Duration(seconds: 3),
              ),
            );
          } else if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(result.message),
                backgroundColor: Colors.green,
              ),
            );
          }
        } else {
          // 退勤処理（clockOut Callable、docId 優先）
          final docId = staff.attendanceDocId;
          final result = await _attendanceService.clockOut(
            staff.uid,
            docId: docId,
          );

          if (result.warning != null && mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('${result.message}\n（${result.warning}）'),
                backgroundColor: Colors.orange,
                duration: const Duration(seconds: 3),
              ),
            );
          } else if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(result.message),
                backgroundColor: Colors.red,
              ),
            );
          }
        }

        // 処理完了後、スタッフリストを更新
        if (mounted) await _loadStaffList();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('エラーが発生しました: ${e.toString().replaceFirst('Exception: ', '')}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
}
