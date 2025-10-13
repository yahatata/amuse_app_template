import 'package:cloud_firestore/cloud_firestore.dart';

/// ステージ進行計算の結果
class StageProgress {
  final int currentStageIndex;
  final int remainingSec;
  final Map<String, dynamic>? currentStage;
  final Map<String, dynamic>? nextStage;
  final bool isFinished;
  final bool isNotStarted;
  final int elapsedSec;

  const StageProgress({
    required this.currentStageIndex,
    required this.remainingSec,
    this.currentStage,
    this.nextStage,
    required this.isFinished,
    required this.isNotStarted,
    required this.elapsedSec,
  });
}

/// ステージ進行計算サービス
class StageBuilder {
  /// 現在のステージ進行状況を計算
  static StageProgress calculateProgress({
    required Timestamp? startedAt,
    required int shiftSec,
    required Timestamp? pausedAt,
    required String status,
    required List<Map<String, dynamic>> stages,
    required DateTime now,
  }) {
    // 開始時刻が未設定の場合は未開始状態
    if (startedAt == null) {
      return StageProgress(
        currentStageIndex: -1,
        remainingSec: 0,
        currentStage: null,
        nextStage: null,
        isFinished: false,
        isNotStarted: true,
        elapsedSec: 0,
      );
    }

    // 評価時刻を決定
    DateTime evaluationTime;
    if (status == 'paused' && pausedAt != null) {
      evaluationTime = pausedAt.toDate();
    } else {
      evaluationTime = now;
    }

    // 経過秒数を計算
    final startTime = startedAt.toDate();
    final elapsedSec = evaluationTime.difference(startTime).inSeconds - shiftSec;

    // まだ開始していない場合
    if (elapsedSec < 0) {
      return StageProgress(
        currentStageIndex: -1,
        remainingSec: -elapsedSec,
        currentStage: null,
        nextStage: stages.isNotEmpty ? stages[0] : null,
        isFinished: false,
        isNotStarted: true,
        elapsedSec: elapsedSec,
      );
    }

    // ステージ総時間を計算
    int totalDurationSec = 0;
    for (final stage in stages) {
      totalDurationSec += stage['durationSec'] as int? ?? 0;
    }

    // 終了超過の場合
    if (elapsedSec >= totalDurationSec) {
      return StageProgress(
        currentStageIndex: stages.length,
        remainingSec: 0,
        currentStage: null,
        nextStage: null,
        isFinished: true,
        isNotStarted: false,
        elapsedSec: elapsedSec,
      );
    }

    // 現在のステージを特定
    int cumulativeSec = 0;
    int currentStageIndex = 0;
    
    for (int i = 0; i < stages.length; i++) {
      final stage = stages[i];
      final stageDuration = stage['durationSec'] as int? ?? 0;
      
      if (elapsedSec < cumulativeSec + stageDuration) {
        currentStageIndex = i;
        break;
      }
      
      cumulativeSec += stageDuration;
    }

    // 現在ステージの残り時間を計算
    final currentStage = stages[currentStageIndex];
    final currentStageDuration = currentStage['durationSec'] as int? ?? 0;
    final remainingSec = (cumulativeSec + currentStageDuration) - elapsedSec;

    // 次のステージを取得
    Map<String, dynamic>? nextStage;
    if (currentStageIndex + 1 < stages.length) {
      nextStage = stages[currentStageIndex + 1];
    }

    return StageProgress(
      currentStageIndex: currentStageIndex,
      remainingSec: remainingSec,
      currentStage: currentStage,
      nextStage: nextStage,
      isFinished: false,
      isNotStarted: false,
      elapsedSec: elapsedSec,
    );
  }

  /// ステージ名を取得
  static String getStageName(Map<String, dynamic> stage) {
    final type = stage['type'] as String? ?? '';
    
    switch (type) {
      case 'level':
        final lev = stage['lev'] as int? ?? 0;
        return 'Level $lev';
      case 'break':
        return 'BREAK';
      case 'regist':
        return 'REG';
      default:
        return type.toUpperCase();
    }
  }

  /// ステージ詳細情報を取得
  static String getStageDetails(Map<String, dynamic> stage) {
    final type = stage['type'] as String? ?? '';
    
    switch (type) {
      case 'level':
        final lev = stage['lev'] as int? ?? 0;
        // ブラインド情報があれば表示（stagesに事前に埋め込まれている前提）
        final sb = stage['sb'] as int?;
        final bb = stage['bb'] as int?;
        final ante = stage['ante'] as int?;
        
        if (sb != null && bb != null) {
          if (ante != null && ante > 0) {
            return 'SB: \$$sb / BB: \$$bb / Ante: \$$ante';
          } else {
            return 'SB: \$$sb / BB: \$$bb';
          }
        }
        return 'Level $lev';
      case 'break':
        return 'Break Time';
      case 'regist':
        return 'Registration';
      default:
        return '';
    }
  }

  /// 秒数をmm:ss形式にフォーマット
  static String formatTime(int seconds) {
    if (seconds < 0) {
      return '--:--';
    }
    
    final minutes = seconds ~/ 60;
    final remainingSeconds = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${remainingSeconds.toString().padLeft(2, '0')}';
  }

  /// ステージの色を取得
  static int getStageColor(Map<String, dynamic> stage) {
    final type = stage['type'] as String? ?? '';
    
    switch (type) {
      case 'level':
        return 0xFF2196F3; // Blue
      case 'break':
        return 0xFFFF9800; // Orange
      case 'regist':
        return 0xFF4CAF50; // Green
      default:
        return 0xFF9E9E9E; // Grey
    }
  }
}
