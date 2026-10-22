import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:amuse_app_template/tournament/active/pages/tournament_home_page.dart';
import 'package:amuse_app_template/Accounting/accountingPage.dart';
import 'package:amuse_app_template/AttendanceManagement/staff_attendance_page_from_terminalHome.dart';
import 'dart:async';

/// Phase4 03: 閉店前確認画面
///
/// 未会計 bills・未退勤スタッフ・未 close トーナメントを表示し、
/// 「確認して閉店する」または「強制閉店する」で closeStoreTerminal を実行する。
class ClosePreConfirmationPage extends StatefulWidget {
  /// 閉店実行完了後のコールバック（loading 表示・closeStoreTerminal 呼び出し・完了ダイアログ・pop を含む）
  final Future<void> Function(bool forceClose) onConfirmClose;
  final Future<Map<String, dynamic>> Function()? integrityDataLoader;
  final Widget Function(Map<String, dynamic> bill)? unsettledBillDestinationBuilder;
  final WidgetBuilder? unclockedStaffDestinationBuilder;

  const ClosePreConfirmationPage({
    super.key,
    required this.onConfirmClose,
    this.integrityDataLoader,
    this.unsettledBillDestinationBuilder,
    this.unclockedStaffDestinationBuilder,
  });

  @override
  State<ClosePreConfirmationPage> createState() =>
      _ClosePreConfirmationPageState();
}

class _ClosePreConfirmationPageState extends State<ClosePreConfirmationPage> {
  bool _loading = true;
  String? _error;
  /// TimeoutException または deadline-exceeded / unavailable による取得失敗。
  bool _errorIsTimeoutOrUnavailable = false;
  bool _loadingRetry = false;

  List<Map<String, dynamic>> _unsettledBills = [];
  int _unsettledBillsReturnedCount = 0;
  bool _unsettledBillsTruncated = false;

  List<Map<String, dynamic>> _unclockedStaff = [];
  List<Map<String, dynamic>> _unclosedTournaments = [];

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  bool _isTimeoutOrUnavailableException(Object e) {
    if (e is TimeoutException) return true;
    if (e is FirebaseFunctionsException) {
      final code = normalizeFirebaseFunctionsCode(e.code);
      return code == 'deadline-exceeded' || code == 'unavailable';
    }
    return false;
  }

  Future<void> _fetch() async {
    if (_loadingRetry) return;
    setState(() {
      _loading = true;
      _error = null;
      _errorIsTimeoutOrUnavailable = false;
      if (!_loadingRetry) _loadingRetry = false;
    });

    try {
      final Map<String, dynamic> data;
      if (widget.integrityDataLoader != null) {
        data = await widget.integrityDataLoader!.call();
      } else {
        if (FirebaseAuth.instance.currentUser == null) {
          await FirebaseAuth.instance.signInAnonymously();
        }
        final callable =
            FunctionsClient.instance.httpsCallable('getCloseIntegrityData');
        final result =
            await callable.call<Map<String, dynamic>>({}).timeout(
                  const Duration(seconds: 120),
                  onTimeout: () => throw TimeoutException(
                    '閉店時確認の実行がタイムアウトしました',
                  ),
                );
        data = result.data;
      }

      if (!mounted) return;

      if (!isCallableSuccessResponse(data)) {
        setState(() {
          _loading = false;
          _error = mapCallableSoftFailMessage(
            data,
            operation: 'getCloseIntegrityData',
          );
          _errorIsTimeoutOrUnavailable = false;
        });
        return;
      }

      final billsRaw = data['unsettledBills'] as List<dynamic>? ?? [];
      _unsettledBills = billsRaw
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      _unsettledBillsReturnedCount =
          (data['unsettledBillsReturnedCount'] as num?)?.toInt() ??
              _unsettledBills.length;
      _unsettledBillsTruncated = data['unsettledBillsTruncated'] == true;

      final staffRaw = data['unclockedStaff'] as List<dynamic>? ?? [];
      _unclockedStaff =
          staffRaw.map((e) => Map<String, dynamic>.from(e as Map)).toList();

      final tournamentsRaw = data['unclosedTournaments'] as List<dynamic>? ?? [];
      _unclosedTournaments = tournamentsRaw
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      setState(() {
        _loading = false;
        _error = null;
        _errorIsTimeoutOrUnavailable = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = mapCallableError(e, operation: 'getCloseIntegrityData').message;
        _errorIsTimeoutOrUnavailable = _isTimeoutOrUnavailableException(e);
      });
    } finally {
      if (mounted) setState(() => _loadingRetry = false);
    }
  }

  /// Firestore から受け取った ISO 文字列（UTC）を日本時間の HH:mm で表示。
  /// 格納時は日本時間で登録されているため、そのまま表示する。
  static String _formatIsoToDisplay(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    try {
      final dt = DateTime.parse(iso);
      // toISOString() で送られてくる UTC を日本時間（+9h）に変換して表示
      final jst = dt.toUtc().add(const Duration(hours: 9));
      return '${jst.hour.toString().padLeft(2, '0')}:${jst.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }

  Widget _buildSection({
    required String title,
    String? subtitle,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade400),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.grey.shade200,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                if (subtitle != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(8),
              children: children,
            ),
          ),
        ],
      ),
    );
  }

  void _showTournamentDetailDialog(Map<String, dynamic> t) {
    final rankingConfirmed = t['rankingConfirmed'] == true;
    final prizeConfirmed = t['prizeConfirmed'] == true;
    final reentries = (t['reentries'] as num?)?.toInt() ?? 0;
    final entries = (t['entries'] as num?)?.toInt() ?? 0;
    final playersBusted = (t['playersBusted'] as num?)?.toInt() ?? 0;
    final remainingCount = (reentries + entries - playersBusted).clamp(0, 999);

    final screenSize = MediaQuery.of(context).size;
    final baseWidth = screenSize.width * 0.56;
    final dialogWidth = (baseWidth * 1.4).clamp(280.0, screenSize.width * 0.95);

    final name = t['snapshotName'] ?? 'トーナメント';
    final startAtStr = _formatIsoToTimeRange(t['startAt'] as String?);
    final tournamentId = t['tournamentId'] as String? ?? '';

    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                name,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              startAtStr,
              style: TextStyle(
                fontSize: 10,
                color: Theme.of(ctx).hintColor,
              ),
            ),
          ],
        ),
        contentPadding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
        content: SizedBox(
          width: dialogWidth,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildDetailRow('順位の確定', rankingConfirmed),
                const SizedBox(height: 8),
                _buildDetailRow('プライズの確定', prizeConfirmed),
                const SizedBox(height: 8),
                _buildDetailRowRemaining('トーナメントの残プレーヤー', remainingCount),
              ],
            ),
          ),
        ),
        actions: [
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  fullscreenDialog: true,
                  builder: (_) => TournamentHomePage(
                    tournamentId: tournamentId,
                    tournamentName: name,
                    suppressStoreStrongWarning: true,
                  ),
                ),
              );
              if (mounted) _fetch();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue.shade700,
              foregroundColor: Colors.white,
            ),
            child: const Text('トーナメントページへ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  /// Firestore から受け取った ISO 文字列（UTC）を日本時間の HH:mm~ で表示。
  String _formatIsoToTimeRange(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    try {
      final dt = DateTime.parse(iso);
      final jst = dt.toUtc().add(const Duration(hours: 9));
      final h = jst.hour.toString().padLeft(2, '0');
      final m = jst.minute.toString().padLeft(2, '0');
      return '$h:$m~';
    } catch (_) {
      return '—';
    }
  }

  Widget _buildDetailRowRemaining(String label, int remainingCount) {
    final done = remainingCount == 0;
    final displayText = '$remainingCount人';
    return Row(
      children: [
        Expanded(child: Text(label, style: const TextStyle(fontSize: 13))),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: done ? Colors.green.shade100 : Colors.orange.shade100,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            displayText,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: done ? Colors.green.shade800 : Colors.orange.shade800,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTournamentSection(double screenWidth) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade400),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.grey.shade200,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
            ),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  '終了処理がされていないトーナメント',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                if (_unclosedTournaments.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Text(
                    '終了処理を終えてから閉店処理を行って下さい',
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.blue.shade700,
                    ),
                    overflow: TextOverflow.ellipsis,
                    maxLines: 2,
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: _unclosedTournaments.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(8),
                    child: Center(
                      child: Text(
                        'なし',
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ),
                  )
                : LayoutBuilder(
                    builder: (context, bc) {
                      final crossAxisCount = 2;
                      final spacing = 8.0;
                      final screenHeight = MediaQuery.of(context).size.height;
                      final cardWidth = (bc.maxWidth - spacing - 16) / crossAxisCount;
                      final cardHeight = screenHeight * 0.09;
                      return GridView.builder(
                        padding: const EdgeInsets.all(8),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: crossAxisCount,
                          childAspectRatio: cardWidth / cardHeight,
                          crossAxisSpacing: spacing,
                          mainAxisSpacing: spacing,
                        ),
                        itemCount: _unclosedTournaments.length,
                        itemBuilder: (context, i) {
                          final e = _unclosedTournaments[i];
                          return _buildTournamentCard(e);
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildTournamentCard(Map<String, dynamic> e) {
    final name = e['snapshotName'] ?? '—';
    final startAt = _formatIsoToDisplay(e['startAt'] as String?);
    final status = e['status'] ?? '';

    final cardBg = Color.lerp(Colors.blueGrey.shade50, Colors.white, 0.5)!;
    return Material(
      color: cardBg,
      child: InkWell(
        onTap: () => _showTournamentDetailDialog(e),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: cardBg,
            border: Border.all(color: Colors.grey.shade400),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                '$startAt  ($status)',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDisplayAmount(dynamic amount) {
    if (amount is num) return '¥${amount.toStringAsFixed(0)}';
    return '—';
  }

  void _showUnsettledBillDetailDialog(Map<String, dynamic> bill) {
    final pokerName = bill['pokerName'] ?? '—';
    final amountStr = _formatDisplayAmount(bill['displayAmount']);
    final createdAt = _formatIsoToDisplay(bill['createdAt'] as String?);

    final screenSize = MediaQuery.of(context).size;
    final baseWidth = screenSize.width * 0.56;
    final dialogWidth = (baseWidth * 1.4).clamp(280.0, screenSize.width * 0.95);

    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                pokerName,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              amountStr,
              style: TextStyle(
                fontSize: 10,
                color: Theme.of(ctx).hintColor,
              ),
            ),
          ],
        ),
        contentPadding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
        content: SizedBox(
          width: dialogWidth,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildDetailTextRow('請求金額', amountStr),
                const SizedBox(height: 8),
                _buildDetailTextRow('作成時刻', createdAt),
              ],
            ),
          ),
        ),
        actions: [
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await _navigateToUnsettledBill(bill);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue.shade700,
              foregroundColor: Colors.white,
            ),
            child: const Text('会計画面へ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  void _showUnclockedStaffDetailDialog(Map<String, dynamic> staff) {
    final staffName = staff['staffName'] ?? '—';
    final clockIn = _formatIsoToDisplay(staff['clockIn'] as String?);

    final screenSize = MediaQuery.of(context).size;
    final baseWidth = screenSize.width * 0.56;
    final dialogWidth = (baseWidth * 1.4).clamp(280.0, screenSize.width * 0.95);

    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          staffName,
          overflow: TextOverflow.ellipsis,
        ),
        contentPadding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
        content: SizedBox(
          width: dialogWidth,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildDetailTextRow('出勤時刻', clockIn),
                const SizedBox(height: 8),
                _buildDetailTextRow('退勤', '未退勤'),
              ],
            ),
          ),
        ),
        actions: [
          ElevatedButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              await _navigateToStaffAttendance();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.blue.shade700,
              foregroundColor: Colors.white,
            ),
            child: const Text('勤怠管理へ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailTextRow(String label, String value) {
    return Row(
      children: [
        Expanded(child: Text(label, style: const TextStyle(fontSize: 13))),
        Text(
          value,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  Widget _buildUnsettledBillCard(Map<String, dynamic> e) {
    final pokerName = e['pokerName'] ?? '—';
    final amountStr = _formatDisplayAmount(e['displayAmount']);
    final createdAt = _formatIsoToDisplay(e['createdAt'] as String?);

    final cardBg = Color.lerp(Colors.blueGrey.shade50, Colors.white, 0.5)!;
    return Material(
      color: cardBg,
      child: InkWell(
        onTap: () => _showUnsettledBillDetailDialog(e),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: cardBg,
            border: Border.all(color: Colors.grey.shade400),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                pokerName,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                '$amountStr  ($createdAt~)',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildUnclockedStaffCard(Map<String, dynamic> e) {
    final staffName = e['staffName'] ?? '—';
    final clockIn = _formatIsoToDisplay(e['clockIn'] as String?);

    final cardBg = Color.lerp(Colors.blueGrey.shade50, Colors.white, 0.5)!;
    return Material(
      color: cardBg,
      child: InkWell(
        onTap: () => _showUnclockedStaffDetailDialog(e),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: cardBg,
            border: Border.all(color: Colors.grey.shade400),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                staffName,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                '$clockIn出勤',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _navigateToUnsettledBill(Map<String, dynamic> bill) async {
    final billId = bill['billId'] as String? ?? '';
    final userId = bill['userId'] as String? ?? '';
    if (billId.isEmpty) return;
    final destinationBuilder = widget.unsettledBillDestinationBuilder;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => destinationBuilder != null
            ? destinationBuilder(bill)
            : AccountingPage(
                forUnsettledBillId: billId,
                forUnsettledUserId: userId.isNotEmpty ? userId : null,
              ),
      ),
    );
    if (mounted) _fetch();
  }

  Future<void> _navigateToStaffAttendance() async {
    final destinationBuilder = widget.unclockedStaffDestinationBuilder;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: destinationBuilder ?? (_) => const StaffAttendancePage(),
      ),
    );
    if (mounted) _fetch();
  }

  Widget _buildDetailRow(String label, bool done) {
    return Row(
      children: [
        Expanded(child: Text(label, style: const TextStyle(fontSize: 13))),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: done ? Colors.green.shade100 : Colors.orange.shade100,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            done ? '完了' : '未完了',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: done ? Colors.green.shade800 : Colors.orange.shade800,
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _onConfirmCloseTapped() async {
    final forceClose = _unclosedTournaments.isNotEmpty;

    if (forceClose) {
      // 強制閉店: 第1段階ダイアログ
      final proceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('強制閉店の確認'),
          content: const Text(
            'トーナメントの終了処理をせずに閉店処理を実行しようとしていますが、'
            'エラー等でトーナメントの終了処理ができない場合を除き推奨していません。'
            '本当に強制閉店処理に進んで良いです？',
            style: TextStyle(fontSize: 13),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('確認'),
            ),
          ],
        ),
      );
      if (proceed != true || !mounted) return;

      // 再取得
      final overlayState = Overlay.maybeOf(context, rootOverlay: true);
      late OverlayEntry loadingOverlay;
      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('閉店時確認の実行中...'),
                ],
              ),
            ),
          ),
        ),
      );
      overlayState?.insert(loadingOverlay);
      try {
        await _fetch();
      } finally {
        try {
          loadingOverlay.remove();
        } catch (_) {}
      }
      if (!mounted) return;

      // 第2段階: 確認ダイアログ
      final confirmed = await _showConfirmDialog();
      if (confirmed != true || !mounted) return;

      await widget.onConfirmClose(true);
      return;
    }

    // 通常閉店: 再取得 → 確認ダイアログ
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    late OverlayEntry loadingOverlay;
    loadingOverlay = OverlayEntry(
      builder: (_) => Material(
        color: Colors.black54,
        child: Center(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                SizedBox(width: 16),
                Text('閉店時確認の実行中...'),
              ],
            ),
          ),
        ),
      ),
    );
    overlayState?.insert(loadingOverlay);
    try {
      await _fetch();
    } finally {
      try {
        loadingOverlay.remove();
      } catch (_) {}
    }
    if (!mounted) return;

    final confirmed = await _showConfirmDialog();
    if (confirmed != true || !mounted) return;

    await widget.onConfirmClose(false);
  }

  Future<bool?> _showConfirmDialog() {
    final billsCount = _unsettledBills.length;
    final staffCount = _unclockedStaff.length;
    final tournamentCount = _unclosedTournaments.length;

    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('閉店の最終確認'),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('未会計: $billsCount 件', style: const TextStyle(fontSize: 13)),
                if (billsCount > 0) ...[
                  ..._unsettledBills.take(10).map((e) {
                    final amount = e['displayAmount'];
                    final amountStr = amount is num
                        ? '¥${amount.toStringAsFixed(0)}'
                        : '—';
                    return Padding(
                      padding: const EdgeInsets.only(left: 12, bottom: 4),
                      child: Text(
                        '${e['pokerName'] ?? '—'}  $amountStr',
                        style: const TextStyle(fontSize: 12),
                      ),
                    );
                  }),
                  if (billsCount > 10)
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Text(
                        '他 ${billsCount - 10} 件...',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  const SizedBox(height: 8),
                ],
                Text('未退勤スタッフ: $staffCount 件',
                    style: const TextStyle(fontSize: 13)),
                if (staffCount > 0) ...[
                  ..._unclockedStaff.take(10).map((e) {
                    return Padding(
                      padding: const EdgeInsets.only(left: 12, bottom: 4),
                      child: Text(
                        '${e['staffName'] ?? '—'}  ${_formatIsoToDisplay(e['clockIn'] as String?)}出勤',
                        style: const TextStyle(fontSize: 12),
                      ),
                    );
                  }),
                  if (staffCount > 10)
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Text(
                        '他 ${staffCount - 10} 件...',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  const SizedBox(height: 8),
                ],
                Text('未 close トーナメント: $tournamentCount 件',
                    style: const TextStyle(fontSize: 13)),
                if (tournamentCount > 0) ...[
                  ..._unclosedTournaments.take(10).map((e) {
                    return Padding(
                      padding: const EdgeInsets.only(left: 12, bottom: 4),
                      child: Text(
                        '${e['snapshotName'] ?? '—'} (${e['displayMessage'] ?? ''})',
                        style: const TextStyle(fontSize: 12),
                      ),
                    );
                  }),
                  if (tournamentCount > 10)
                    Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Text(
                        '他 ${tournamentCount - 10} 件...',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                ],
                const SizedBox(height: 12),
                const Text(
                  '上記の内容で閉店処理を実行します。',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('実行'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('閉店前確認'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12, top: 8, bottom: 8),
            child: OutlinedButton(
              onPressed: _loading ? null : _fetch,
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: const Text('更新する'),
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('閉店時確認の実行中...'),
                ],
              ),
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '取得失敗: $_error',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.red),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: () => _fetch(),
                          child: const Text('再試行'),
                        ),
                        if (_errorIsTimeoutOrUnavailable) ...[
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => _fetch(),
                            child: const Text('再実行'),
                          ),
                        ],
                      ],
                    ),
                  ),
                )
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final topHeight = constraints.maxHeight * 0.45;
                    final bottomHeight = constraints.maxHeight * 0.35;
                    return SingleChildScrollView(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: constraints.maxHeight,
                        ),
                        child: IntrinsicHeight(
                          child: Column(
                            children: [
                              SizedBox(
                                height: topHeight,
                                child: Row(
                                  children: [
                                    const Spacer(flex: 25), // 2.5%
                                    Expanded(
                                      flex: 450, // 45%
                                      child: _buildSection(
                                        title: '未会計の請求者'
                                            '${_unsettledBillsTruncated ? ' (${_unsettledBillsReturnedCount}件表示)' : ''}',
                                        subtitle: 'このまま閉店処理を進めると、未会計の請求書として登録されます',
                                        children: _unsettledBills.isEmpty
                                            ? [
                                                const Padding(
                                                  padding: EdgeInsets.all(8),
                                                  child: Text(
                                                    'なし',
                                                    style: TextStyle(
                                                        fontSize: 12,
                                                        color: Colors.grey),
                                                  ),
                                                ),
                                              ]
                                            : _unsettledBills.map((e) {
                                                return Padding(
                                                  padding: const EdgeInsets.only(
                                                    left: 8,
                                                    right: 8,
                                                    bottom: 8,
                                                  ),
                                                  child: _buildUnsettledBillCard(e),
                                                );
                                              }).toList(),
                                      ),
                                    ),
                                    const Spacer(flex: 50), // 5%
                                    Expanded(
                                      flex: 450, // 45%
                                      child: _buildSection(
                                        title: '未退勤スタッフ',
                                        subtitle: 'このまま閉店処理を進めると、退勤漏れ一覧に追加されます。'
                                            '閉店処理後から1時間以内は通常フローでの退勤が可能です。',
                                        children: _unclockedStaff.isEmpty
                                            ? [
                                                const Padding(
                                                  padding: EdgeInsets.all(8),
                                                  child: Text(
                                                    'なし',
                                                    style: TextStyle(
                                                        fontSize: 12,
                                                        color: Colors.grey),
                                                  ),
                                                ),
                                              ]
                                            : _unclockedStaff.map((e) {
                                                return Padding(
                                                  padding: const EdgeInsets.only(
                                                    left: 8,
                                                    right: 8,
                                                    bottom: 8,
                                                  ),
                                                  child: _buildUnclockedStaffCard(e),
                                                );
                                              }).toList(),
                                      ),
                                    ),
                                    const Spacer(flex: 25), // 2.5%
                                  ],
                                ),
                              ),
                              const SizedBox(height: 12),
                              SizedBox(
                                height: bottomHeight,
                                child: Row(
                                  children: [
                                    const Spacer(flex: 25), // 2.5%
                                    Expanded(
                                      flex: 950, // 95%
                                      child: _buildTournamentSection(constraints.maxWidth),
                                    ),
                                    const Spacer(flex: 25), // 2.5%
                                  ],
                                ),
                              ),
                              const Spacer(),
                              Padding(
                                padding: const EdgeInsets.all(16),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    if (_unclosedTournaments.isEmpty)
                                      ElevatedButton(
                                        onPressed: _onConfirmCloseTapped,
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: Colors.red.shade700,
                                          foregroundColor: Colors.white,
                                        ),
                                        child: const Text('確認して閉店する'),
                                      )
                                    else
                                      ElevatedButton(
                                        onPressed: _onConfirmCloseTapped,
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: Colors.orange.shade800,
                                          foregroundColor: Colors.white,
                                        ),
                                        child: const Text('強制閉店する'),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
