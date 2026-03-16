import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// トーナメント管理用のコントロールウィジェット
/// Pause/Resume機能を提供
class AdminControls extends StatefulWidget {
  final String tournamentId;
  final String currentStatus;
  final VoidCallback? onStatusChanged;
  final int? startRev;
  final int? registRev;
  final DateTime? plannedStartAt;
  final DateTime? plannedRegistAt;

  const AdminControls({
    super.key,
    required this.tournamentId,
    required this.currentStatus,
    this.onStatusChanged,
    this.startRev,
    this.registRev,
    this.plannedStartAt,
    this.plannedRegistAt,
  });

  @override
  State<AdminControls> createState() => _AdminControlsState();
}

class _AdminControlsState extends State<AdminControls> {
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '管理コントロール',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildPauseButton(),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildResumeButton(),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '現在のステータス: ${_getStatusDisplayName(widget.currentStatus)}',
              style: TextStyle(
                color: _getStatusColor(widget.currentStatus),
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            _buildTaskInfo(),
          ],
        ),
      ),
    );
  }

  Widget _buildPauseButton() {
    final canPause = widget.currentStatus == 'running';
    
    return ElevatedButton.icon(
      onPressed: canPause && !_isLoading ? _pauseTournament : null,
      icon: const Icon(Icons.pause),
      label: const Text('一時停止'),
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.orange,
        foregroundColor: Colors.white,
      ),
    );
  }

  Widget _buildResumeButton() {
    final canResume = widget.currentStatus == 'paused';
    
    return ElevatedButton.icon(
      onPressed: canResume && !_isLoading ? _resumeTournament : null,
      icon: const Icon(Icons.play_arrow),
      label: const Text('再開'),
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
      ),
    );
  }

  Future<void> _pauseTournament() async {
    if (_isLoading) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('pauseTournament');
      
      final result = await callable.call({
        'tournamentId': widget.tournamentId,
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('トーナメントを一時停止しました'),
              backgroundColor: Colors.orange,
            ),
          );
          
          // コールバックで親ウィジェットに状態変更を通知
          widget.onStatusChanged?.call();
        }
      } else {
        throw Exception('Pause failed: ${result.data['message']}');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('一時停止に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _resumeTournament() async {
    if (_isLoading) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('resumeTournament');
      
      final result = await callable.call({
        'tournamentId': widget.tournamentId,
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('トーナメントを再開しました'),
              backgroundColor: Colors.green,
            ),
          );
          
          // コールバックで親ウィジェットに状態変更を通知
          widget.onStatusChanged?.call();
        }
      } else {
        throw Exception('Resume failed: ${result.data['message']}');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('再開に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  String _getStatusDisplayName(String status) {
    switch (status) {
      case 'scheduled':
        return '予定済み';
      case 'running':
        return '実行中';
      case 'paused':
        return '一時停止中';
      case 'registered':
        return 'レジスト確定済み';
      case 'ended':
      case 'force_ended':
        return '終了';
      default:
        return status;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'scheduled':
        return Colors.blue;
      case 'running':
        return Colors.green;
      case 'paused':
        return Colors.orange;
      case 'registered':
        return Colors.purple;
      case 'ended':
      case 'force_ended':
        return Colors.grey;
      default:
        return Colors.black;
    }
  }

  Widget _buildTaskInfo() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'タスク情報',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 8),
          if (widget.plannedStartAt != null)
            _buildTaskItem(
              '開始タスク',
              widget.plannedStartAt!,
              widget.startRev ?? 1,
            ),
          if (widget.plannedRegistAt != null)
            _buildTaskItem(
              'レジストタスク',
              widget.plannedRegistAt!,
              widget.registRev ?? 1,
            ),
        ],
      ),
    );
  }

  Widget _buildTaskItem(String label, DateTime eta, int rev) {
    final now = DateTime.now();
    final isPast = eta.isBefore(now);
    final timeUntil = eta.difference(now);
    
    String timeText;
    Color timeColor;
    
    if (isPast) {
      timeText = '過去の時刻';
      timeColor = Colors.red;
    } else if (timeUntil.inSeconds < 60) {
      timeText = '${timeUntil.inSeconds}秒後';
      timeColor = Colors.orange;
    } else if (timeUntil.inMinutes < 60) {
      timeText = '${timeUntil.inMinutes}分後';
      timeColor = Colors.blue;
    } else {
      timeText = '${timeUntil.inHours}時間後';
      timeColor = Colors.green;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: const TextStyle(fontSize: 12),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              timeText,
              style: TextStyle(
                fontSize: 12,
                color: timeColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            flex: 1,
            child: Text(
              'Rev:$rev',
              style: const TextStyle(
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
