import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'timer_widget.dart';

/// カウントダウン表示ウィジェット（フリッカー対策版）
class CountdownDisplay extends StatelessWidget {
  final Timestamp? startedAt;
  final int shiftSec;
  final Timestamp? pausedAt;
  final String status;
  final List<Map<String, dynamic>> stages;
  final bool isRegClosed;
  final bool isPaused;

  const CountdownDisplay({
    super.key,
    required this.startedAt,
    required this.shiftSec,
    required this.pausedAt,
    required this.status,
    required this.stages,
    required this.isRegClosed,
    required this.isPaused,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: _getBackgroundGradient(),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ステータスバッジ
          _buildStatusBadge(),
          const SizedBox(height: 16),
          
          // メインカウントダウン（TimerWidget使用）
          TimerWidget(
            startedAt: startedAt,
            shiftSec: shiftSec,
            pausedAt: pausedAt,
            status: status,
            stages: stages,
          ),
          const SizedBox(height: 16),
          
          // ステージ情報（StageInfoWidget使用）
          StageInfoWidget(
            startedAt: startedAt,
            shiftSec: shiftSec,
            pausedAt: pausedAt,
            status: status,
            stages: stages,
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge() {
    if (isRegClosed) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.red,
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Text(
          'REG CLOSED',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          ),
        ),
      );
    }
    
    if (isPaused) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.orange,
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Text(
          'PAUSED',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          ),
        ),
      );
    }
    
    if (startedAt == null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.blue,
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Text(
          'STARTING SOON',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          ),
        ),
      );
    }
    
    // 終了判定は簡略化（実際の判定はTimerWidget内で行う）
    if (status == 'ended') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.grey,
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Text(
          'FINISHED',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          ),
        ),
      );
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.green,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Text(
        'RUNNING',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
          fontSize: 12,
        ),
      ),
    );
  }



  LinearGradient _getBackgroundGradient() {
    if (status == 'ended') {
      return LinearGradient(
        colors: [Colors.grey[300]!, Colors.grey[400]!],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }
    
    if (startedAt == null) {
      return LinearGradient(
        colors: [Colors.blue[100]!, Colors.blue[200]!],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }
    
    if (isPaused) {
      return LinearGradient(
        colors: [Colors.orange[100]!, Colors.orange[200]!],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }
    
    return LinearGradient(
      colors: [Colors.green[100]!, Colors.green[200]!],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
  }


}
