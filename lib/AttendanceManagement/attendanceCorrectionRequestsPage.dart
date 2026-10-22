import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/AttendanceManagement/attendance_user_facing_errors.dart';
import 'package:amuse_app_template/AttendanceManagement/attendance_correction_mutation_gate.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

class AttendanceCorrectionRequestsPage extends StatefulWidget {
  const AttendanceCorrectionRequestsPage({super.key});

  @override
  State<AttendanceCorrectionRequestsPage> createState() => _AttendanceCorrectionRequestsPageState();
}

class _AttendanceCorrectionRequestsPageState extends State<AttendanceCorrectionRequestsPage> {
  final FirebaseFunctions _functions = FunctionsClient.instance;
  
  List<Map<String, dynamic>> _correctionRequests = [];
  bool _isLoading = true;
  String? _errorMessage;
  final AttendanceCorrectionMutationGate _mutationGate =
      AttendanceCorrectionMutationGate();

  @override
  void initState() {
    super.initState();
    _loadCorrectionRequests();
  }

  // 勤怠修正申請を読み込み
  Future<void> _loadCorrectionRequests() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });

      // Cloud Functions経由で申請一覧を取得
      final HttpsCallable callable = _functions.httpsCallable('getAttendanceCorrectionRequests');
      final result = await callable.call({
        'status': 'pending',
        'limit': 100,
      });

      if (isCallableSuccessResponse(result.data)) {
        final List<dynamic> requestsData = result.data['requests'];
        final List<Map<String, dynamic>> requests = [];
        
        for (var requestData in requestsData) {
          requests.add(Map<String, dynamic>.from(requestData));
        }

        setState(() {
          _correctionRequests = requests;
          _isLoading = false;
        });
      } else {
        setState(() {
          _errorMessage = mapAttendanceCallableSoftFail(
            result.data,
            operation: 'getAttendanceCorrectionRequests',
          );
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = mapAttendanceCallableError(
          e,
          operation: 'getAttendanceCorrectionRequests',
        );
        // 空一覧と区別するため、失敗時は専用文言へ寄せる（詳細は D-1）
        if (_errorMessage == kFinalFallbackErrorMessage) {
          _errorMessage = kAttendanceCorrectionRequestsLoadFailedMessage;
        }
        _isLoading = false;
      });
    }
  }

  bool get _isMutating => _mutationGate.isLocked;

  Future<bool> _runLockedMutation(Future<void> Function() action) async {
    if (!_mutationGate.tryAcquire()) return false;
    setState(() {});
    try {
      await action();
      return true;
    } finally {
      _mutationGate.release();
      if (mounted) setState(() {});
    }
  }

  // 申請を承認
  Future<void> _approveRequest(String requestId) async {
    String? successMessage;
    String? errorMessage;
    final ran = await _runLockedMutation(() async {
      try {
        const String adminUserId = 'admin_user';
        const String adminUserName = '管理者';

        final HttpsCallable callable =
            _functions.httpsCallable('approveAttendanceCorrectionRequest');
        final result = await callable.call({
          'requestId': requestId,
          'adminUserId': adminUserId,
          'adminUserName': adminUserName,
        });

        if (isCallableSuccessResponse(result.data)) {
          await _loadCorrectionRequests();
          successMessage = '申請を承認しました';
        } else {
          errorMessage = mapCallableSoftFailMessage(
            result.data,
            operation: 'approveAttendanceCorrectionRequest',
          );
        }
      } catch (e) {
        errorMessage = mapCallableError(
          e,
          operation: 'approveAttendanceCorrectionRequest',
        ).message;
      }
    });
    if (!ran || !mounted) return;
    final ok = successMessage;
    final err = errorMessage;
    if (ok != null) {
      _showSuccessSnackBar(ok);
    } else if (err != null) {
      _showErrorSnackBar(err);
    }
  }

  // 申請を却下
  Future<void> _rejectRequest(String requestId) async {
    final String? rejectionReason = await _showRejectionReasonDialog();
    if (rejectionReason == null || rejectionReason.trim().isEmpty) {
      return;
    }

    String? successMessage;
    String? errorMessage;
    final ran = await _runLockedMutation(() async {
      try {
        const String adminUserId = 'admin_user';
        const String adminUserName = '管理者';

        final HttpsCallable callable =
            _functions.httpsCallable('rejectAttendanceCorrectionRequest');
        final result = await callable.call({
          'requestId': requestId,
          'adminUserId': adminUserId,
          'adminUserName': adminUserName,
          'rejectionReason': rejectionReason.trim(),
        });

        if (isCallableSuccessResponse(result.data)) {
          await _loadCorrectionRequests();
          successMessage = '申請を却下しました';
        } else {
          errorMessage = mapCallableSoftFailMessage(
            result.data,
            operation: 'rejectAttendanceCorrectionRequest',
          );
        }
      } catch (e) {
        errorMessage = mapCallableError(
          e,
          operation: 'rejectAttendanceCorrectionRequest',
        ).message;
      }
    });
    if (!ran || !mounted) return;
    final ok = successMessage;
    final err = errorMessage;
    if (ok != null) {
      _showSuccessSnackBar(ok);
    } else if (err != null) {
      _showErrorSnackBar(err);
    }
  }

  // 却下理由入力ダイアログ
  Future<String?> _showRejectionReasonDialog() async {
    final TextEditingController controller = TextEditingController();
    
    return showDialog<String>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('却下理由'),
          content: TextField(
            controller: controller,
            decoration: const InputDecoration(
              hintText: '却下理由を入力してください',
              border: OutlineInputBorder(),
            ),
            maxLines: 3,
            autofocus: true,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(controller.text),
              child: const Text('却下'),
            ),
          ],
        );
      },
    );
  }

  // 成功メッセージを表示
  void _showSuccessSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  // エラーメッセージを表示
  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  // 日付をフォーマット
  String _formatDate(dynamic timestamp) {
    // デバッグログ
    print('=== _formatDate デバッグ ===');
    print('timestamp: $timestamp');
    print('timestamp type: ${timestamp.runtimeType}');
    print('timestamp is Timestamp: ${timestamp is Timestamp}');
    
    if (timestamp is Timestamp) {
      final date = timestamp.toDate();
      print('Timestamp.toDate(): $date');
      return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
    }
    
    // Timestamp以外の型の場合の処理
    if (timestamp != null) {
      print('timestamp is not null, trying to parse...');
      try {
        if (timestamp is Map && timestamp['seconds'] != null) {
          // Firestore Timestamp形式のMapの場合
          final seconds = timestamp['seconds'] as int;
          final date = DateTime.fromMillisecondsSinceEpoch(seconds * 1000);
          print('Parsed from Map: $date');
          return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
        }
      } catch (e) {
        print('Error parsing timestamp: $e');
      }
    }
    
    return '不明';
  }

  // 時間をフォーマット
  String _formatTime(String? time) {
    if (time == null || time.isEmpty) return '--:--';
    return time;
  }

  // 修正種別の表示テキスト
  String _getCorrectionTypeText(String type) {
    switch (type) {
      case 'clockIn':
        return '出勤時刻修正';
      case 'clockOut':
        return '退勤時刻修正';
      case 'both':
        return '出退勤時刻修正';
      default:
        return '不明';
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isMutating,
      child: Stack(
        children: [
          Scaffold(
      appBar: AppBar(
        title: const Text('勤怠修正申請管理'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _isMutating ? null : _loadCorrectionRequests,
            tooltip: '更新',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _errorMessage!,
                        style: const TextStyle(color: Colors.red),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _isMutating ? null : _loadCorrectionRequests,
                        child: const Text('再試行'),
                      ),
                    ],
                  ),
                )
              : _correctionRequests.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.check_circle_outline,
                            size: 64,
                            color: Colors.grey,
                          ),
                          SizedBox(height: 16),
                          Text(
                            '承認待ちの申請はありません',
                            style: TextStyle(
                              fontSize: 18,
                              color: Colors.grey,
                            ),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadCorrectionRequests,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _correctionRequests.length,
                        itemBuilder: (context, index) {
                          final request = _correctionRequests[index];
                          return _buildRequestCard(request);
                        },
                      ),
                    ),
          ),
          if (_isMutating)
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

  // 申請カードを構築
  Widget _buildRequestCard(Map<String, dynamic> request) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ヘッダー部分
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    _getCorrectionTypeText(request['type'] ?? ''),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.orange,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    '承認待ち',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // 基本情報
            _buildInfoRow('申請者', request['staffName'] ?? '不明'),
            _buildInfoRow('申請日', _formatDate(request['createdAt'])),
            _buildInfoRow('修正対象日', request['date'] ?? '不明'),
            _buildInfoRow('修正理由', request['reason'] ?? '不明'),
            
            const SizedBox(height: 16),
            
            // 時刻情報
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '修正前の時刻',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.grey,
                        ),
                      ),
                      const SizedBox(height: 8),
                      _buildTimeRow('出勤', _formatTime(request['currentClockIn'])),
                      _buildTimeRow('退勤', _formatTime(request['currentClockOut'])),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '修正後の時刻',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                        ),
                      ),
                      const SizedBox(height: 8),
                      _buildTimeRow('出勤', _formatTime(request['newClockIn'])),
                      _buildTimeRow('退勤', _formatTime(request['newClockOut'])),
                    ],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 24),
            
            // アクションボタン
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: _isMutating
                        ? null
                        : () => _approveRequest(request['id']),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('承認'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _isMutating
                        ? null
                        : () => _rejectRequest(request['id']),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('却下'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // 情報行を構築
  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.grey,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 16),
            ),
          ),
        ],
      ),
    );
  }

  // 時刻行を構築
  Widget _buildTimeRow(String label, String time) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 40,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontSize: 12,
                color: Colors.grey,
              ),
            ),
          ),
          Text(
            time,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
