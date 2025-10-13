import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/tournament/active/services/stage_builder.dart';
import 'package:amuse_app_template/tournament/active/services/server_time_helper.dart';

/// タイマー専用ウィジェット（フリッカー対策）
class TimerWidget extends StatefulWidget {
  final Timestamp? startedAt;
  final int shiftSec;
  final Timestamp? pausedAt;
  final String status;
  final List<Map<String, dynamic>> stages;

  const TimerWidget({
    super.key,
    required this.startedAt,
    required this.shiftSec,
    required this.pausedAt,
    required this.status,
    required this.stages,
  });

  @override
  State<TimerWidget> createState() => _TimerWidgetState();
}

class _TimerWidgetState extends State<TimerWidget> {
  Timer? _timer;
  final ValueNotifier<int> _remainingSecondsNotifier = ValueNotifier<int>(0);
  final ValueNotifier<StageProgress> _progressNotifier = ValueNotifier<StageProgress>(
    const StageProgress(
      currentStageIndex: -1,
      remainingSec: 0,
      isFinished: false,
      isNotStarted: true,
      elapsedSec: 0,
    ),
  );
  int _lastRemainingSeconds = -1;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _remainingSecondsNotifier.dispose();
    _progressNotifier.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(TimerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    
    // 重要なパラメータが変更された場合のみ再計算
    if (oldWidget.startedAt != widget.startedAt ||
        oldWidget.shiftSec != widget.shiftSec ||
        oldWidget.pausedAt != widget.pausedAt ||
        oldWidget.status != widget.status ||
        oldWidget.stages != widget.stages) {
      _updateProgress();
    }
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      _updateProgress();
    });
    // 初期計算
    _updateProgress();
  }

  void _updateProgress() {
    if (widget.startedAt == null) {
      _remainingSecondsNotifier.value = 0;
      return;
    }

    final now = ServerTimeHelper.getCurrentTime();
    final progress = StageBuilder.calculateProgress(
      startedAt: widget.startedAt,
      shiftSec: widget.shiftSec,
      pausedAt: widget.pausedAt,
      status: widget.status,
      stages: widget.stages,
      now: now,
    );

    // 秒数が変わった場合のみ更新（フリッカー対策）
    if (progress.remainingSec != _lastRemainingSeconds) {
      _remainingSecondsNotifier.value = progress.remainingSec;
      _progressNotifier.value = progress;
      _lastRemainingSeconds = progress.remainingSec;
    }
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: ValueListenableBuilder<int>(
        valueListenable: _remainingSecondsNotifier,
        builder: (context, remainingSeconds, child) {
          // AnimatedSwitcherをコメントアウト（バウンド問題のため）
          // return AnimatedSwitcher(
          //   duration: const Duration(milliseconds: 250),
          //   transitionBuilder: (Widget child, Animation<double> animation) {
          //     return FadeTransition(
          //       opacity: animation,
          //       child: SlideTransition(
          //         position: Tween<Offset>(
          //           begin: const Offset(0.0, 0.1),
          //           end: Offset.zero,
          //         ).animate(CurvedAnimation(
          //           parent: animation,
          //           curve: Curves.easeOut,
          //         )),
          //         child: child,
          //       ),
          //     );
          //   },
          //   child: Text(
          //     StageBuilder.formatTime(remainingSeconds),
          //     key: ValueKey(remainingSeconds),
          //     style: const TextStyle(
          //       fontSize: 48,
          //       fontWeight: FontWeight.bold,
          //       fontFamily: 'monospace',
          //     ),
          //   ),
          // );
          
          // シンプルなText表示（バウンド問題を回避）
          return Text(
            StageBuilder.formatTime(remainingSeconds),
            style: const TextStyle(
              fontSize: 48,
              fontWeight: FontWeight.bold,
              fontFamily: 'monospace',
            ),
          );
        },
      ),
    );
  }
}

/// ステージ情報専用ウィジェット（フリッカー対策）
class StageInfoWidget extends StatefulWidget {
  final Timestamp? startedAt;
  final int shiftSec;
  final Timestamp? pausedAt;
  final String status;
  final List<Map<String, dynamic>> stages;

  const StageInfoWidget({
    super.key,
    required this.startedAt,
    required this.shiftSec,
    required this.pausedAt,
    required this.status,
    required this.stages,
  });

  @override
  State<StageInfoWidget> createState() => _StageInfoWidgetState();
}

class _StageInfoWidgetState extends State<StageInfoWidget> {
  Timer? _timer;
  final ValueNotifier<StageProgress> _progressNotifier = ValueNotifier<StageProgress>(
    const StageProgress(
      currentStageIndex: -1,
      remainingSec: 0,
      isFinished: false,
      isNotStarted: true,
      elapsedSec: 0,
    ),
  );

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _progressNotifier.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(StageInfoWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    
    // 重要なパラメータが変更された場合のみ再計算
    if (oldWidget.startedAt != widget.startedAt ||
        oldWidget.shiftSec != widget.shiftSec ||
        oldWidget.pausedAt != widget.pausedAt ||
        oldWidget.status != widget.status ||
        oldWidget.stages != widget.stages) {
      _updateProgress();
    }
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      _updateProgress();
    });
    // 初期計算
    _updateProgress();
  }

  void _updateProgress() {
    if (widget.startedAt == null) {
      return;
    }

    final now = ServerTimeHelper.getCurrentTime();
    final progress = StageBuilder.calculateProgress(
      startedAt: widget.startedAt,
      shiftSec: widget.shiftSec,
      pausedAt: widget.pausedAt,
      status: widget.status,
      stages: widget.stages,
      now: now,
    );

    _progressNotifier.value = progress;
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: ValueListenableBuilder<StageProgress>(
        valueListenable: _progressNotifier,
        builder: (context, progress, child) {
          return Column(
            children: [
              // 現在ステージ情報
              if (progress.currentStage != null)
                _buildCurrentStageInfo(progress.currentStage!),
              
              const SizedBox(height: 12),
              
              // 次のステージ情報
              if (progress.nextStage != null)
                _buildNextStageInfo(progress.nextStage!),
            ],
          );
        },
      ),
    );
  }

  Widget _buildCurrentStageInfo(Map<String, dynamic> stage) {
    final stageName = StageBuilder.getStageName(stage);
    final stageDetails = StageBuilder.getStageDetails(stage);
    final stageColor = Color(StageBuilder.getStageColor(stage));
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: stageColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: stageColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Text(
            'CURRENT',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: stageColor,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            stageName,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: stageColor,
            ),
          ),
          if (stageDetails.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              stageDetails,
              style: TextStyle(
                fontSize: 14,
                color: stageColor.withValues(alpha: 0.8),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildNextStageInfo(Map<String, dynamic> stage) {
    final stageName = StageBuilder.getStageName(stage);
    final stageDetails = StageBuilder.getStageDetails(stage);
    final stageColor = Color(StageBuilder.getStageColor(stage));
    
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: stageColor.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: stageColor.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Text(
            'NEXT',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: stageColor,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            stageName,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: stageColor,
            ),
          ),
          if (stageDetails.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              stageDetails,
              style: TextStyle(
                fontSize: 12,
                color: stageColor.withValues(alpha: 0.7),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}
