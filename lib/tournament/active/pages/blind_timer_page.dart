import 'dart:async';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
// import '../model/runtime_main.dart';
// import '../repositories/tournament_repo.dart';
import 'package:amuse_app_template/tournament/active/utils/blind_stage_display_helpers.dart';
import 'package:amuse_app_template/tournament/active/utils/blind_avg_stack_display_helpers.dart';
import 'package:amuse_app_template/tournament/active/utils/blind_timer_display_helpers.dart';
import 'package:amuse_app_template/tournament/active/services/stage_builder.dart';
import 'package:amuse_app_template/tournament/active/services/server_time_helper.dart';
import 'package:amuse_app_template/tournament/active/widgets/display/timer_widget.dart';

/// ブラインドタイマー表示前にサーバー時刻オフセットを取得する。
@visibleForTesting
Future<void> initializeBlindTimerServerTimeOffset({
  Future<Duration?> Function()? getServerOffset,
  void Function(String message)? logWarning,
}) async {
  final fetchOffset = getServerOffset ?? ServerTimeHelper.getServerOffset;
  final log = logWarning ?? debugPrint;

  try {
    final offset = await fetchOffset();
    if (offset == null) {
      log('BlindTimerPage: server time offset unavailable, using device time');
    }
  } catch (e, st) {
    log('BlindTimerPage: failed to initialize server time offset: $e\n$st');
  }
}

/// ブラインドタイマー画面
class BlindTimerPage extends StatefulWidget {
  final String tournamentId;

  const BlindTimerPage({
    super.key,
    required this.tournamentId,
  });

  @override
  State<BlindTimerPage> createState() => _BlindTimerPageState();
}

class _BlindTimerPageState extends State<BlindTimerPage> {
  // 削除されたTournamentRepositoryを直接Firestoreアクセスに置き換え
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  
  Map<String, dynamic>? _tournamentData;
  Map<String, dynamic>? _mainViewData;
  Map<String, dynamic>? _runtimeData;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initializeServerTimeOffset();
    _loadTournamentData();
  }

  Future<void> _initializeServerTimeOffset() async {
    await initializeBlindTimerServerTimeOffset();
    if (!mounted) return;
  }

  Future<void> _loadTournamentData() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      // トーナメント基本データを取得
      final tournamentSnapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .get();

      if (!tournamentSnapshot.exists) {
        throw Exception('トーナメントが見つかりません');
      }

      // main view データを取得
      final mainViewSnapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('views')
          .doc('main')
          .get();

      setState(() {
        _tournamentData = tournamentSnapshot.data();
        _mainViewData = mainViewSnapshot.exists ? mainViewSnapshot.data() : {};
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenSize = MediaQuery.of(context).size;
    
    if (_isLoading) {
      return Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(
                'トーナメント情報を読み込み中...',
                style: TextStyle(fontSize: screenSize.height * 0.02),
              ),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('エラー'),
          backgroundColor: Colors.red[700],
          foregroundColor: Colors.white,
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.error_outline,
                size: 64,
                color: Colors.red[400],
              ),
              const SizedBox(height: 16),
              Text(
                'エラーが発生しました',
                style: TextStyle(
                  fontSize: screenSize.height * 0.025,
                  color: Colors.red[600],
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(
                  fontSize: screenSize.height * 0.015,
                  color: Colors.red[600],
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      body: StreamBuilder<DocumentSnapshot>(
        stream: _firestore
            .collection('scheduledTournaments')
            .doc(widget.tournamentId)
            .collection('views')
            .doc('runtime')
            .snapshots(),
        builder: (context, runtimeSnapshot) {
          if (runtimeSnapshot.hasError) {
            return _buildErrorWidget(runtimeSnapshot.error.toString(), screenSize);
          }

          if (!runtimeSnapshot.hasData || !runtimeSnapshot.data!.exists) {
            return _buildLoadingWidget(screenSize);
          }

          final runtimeData = runtimeSnapshot.data!.data() as Map<String, dynamic>?;
          if (runtimeData == null) {
            return _buildLoadingWidget(screenSize);
          }

          return StreamBuilder<DocumentSnapshot>(
            stream: _firestore
                .collection('scheduledTournaments')
                .doc(widget.tournamentId)
                .collection('views')
                .doc('main')
                .snapshots(),
            builder: (context, mainSnapshot) {
              if (mainSnapshot.hasData) {
                _mainViewData = mainSnapshot.data!.data() as Map<String, dynamic>? ?? {};
              }
              
              // リアルタイムで更新するためにStreamBuilderを使用
              return StreamBuilder<int>(
                stream: Stream.periodic(const Duration(seconds: 1), (count) => count),
                builder: (context, timerSnapshot) {
                  return _buildMainContent(runtimeData, screenSize);
                },
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildErrorWidget(String error, Size screenSize) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.error_outline,
            size: 64,
            color: Colors.red[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Runtime データの読み込みエラー',
            style: TextStyle(
              fontSize: screenSize.height * 0.025,
              color: Colors.red[600],
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            error,
            style: TextStyle(
              fontSize: screenSize.height * 0.015,
              color: Colors.red[600],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingWidget(Size screenSize) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text(
            'Runtime データを読み込み中...',
            style: TextStyle(fontSize: screenSize.height * 0.02),
          ),
        ],
      ),
    );
  }

  Widget _buildMainContent(Map<String, dynamic> runtimeData, Size screenSize) {
    final currentTime = ServerTimeHelper.getCurrentTime();
    final progress = StageBuilder.calculateProgress(
      startedAt: runtimeData['startedAt'] as Timestamp?,
      shiftSec: runtimeData['shiftSec'] as int? ?? 0,
      pausedAt: runtimeData['pausedAt'] as Timestamp?,
      status: runtimeData['status'] as String? ?? 'scheduled',
      stages: (runtimeData['stages'] as List?)?.cast<Map<String, dynamic>>() ?? [],
      now: currentTime,
    );

    // Stack の子がすべて Positioned だと Stack がサイズを持たず描画されないため、
    // 明示的に画面全体のサイズを指定する
    return SizedBox.expand(
      child: Stack(
        children: [
          // 画面上部 - トーナメント名
          Positioned(
            left: screenSize.width * 0.5 - (screenSize.width * 0.4),
            top: screenSize.height * 0.1 - (screenSize.height * 0.075),
            child: Text(
              _getTournamentName(),
              style: TextStyle(
                fontSize: screenSize.height * 0.075, // 半分に変更
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
          ),

        // 画面中央 - ブラインド情報
        _buildCenterContent(progress, runtimeData, screenSize),

        // 画面左部 - 統計情報・プライズ
        _buildLeftContent(screenSize),

        // 画面右部 - 追加情報
        _buildRightContent(screenSize, progress, runtimeData),
        ],
      ),
    );
  }

  Widget _buildCenterContent(StageProgress progress, Map<String, dynamic> runtimeData, Size screenSize) {
    final currentStage = progress.currentStage;
    final isNotStarted = progress.isNotStarted;
    
    // nextStageを取得（durationSecが0のステージはスキップ）
    Map<String, dynamic>? nextStage = _getNextMeaningfulStage(progress, runtimeData);
    
    return Positioned(
      left: screenSize.width * 0.5 - (screenSize.width * 0.4),
      top: screenSize.height * 0.25 - (screenSize.height * 0.1),
      child: SizedBox(
        width: screenSize.width * 0.8,
        child: Column(
          children: [
            // 現在のブラインドレベル
            Text(
              _getCurrentBlindLevel(currentStage, isNotStarted),
              style: TextStyle(
                fontSize: screenSize.height * 0.08,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: screenSize.height * 0.01),

            // タイマー
            TimerWidget(
              startedAt: runtimeData['startedAt'] as Timestamp?,
              shiftSec: runtimeData['shiftSec'] as int? ?? 0,
              pausedAt: runtimeData['pausedAt'] as Timestamp?,
              status: runtimeData['status'] as String? ?? 'scheduled',
              stages: (runtimeData['stages'] as List?)?.cast<Map<String, dynamic>>() ?? [],
            ),
            SizedBox(height: screenSize.height * 0.01),

            // SB / BB / Ante ラベル
            Text(
              'SB   /   BB   /   Ante',
              style: TextStyle(
                fontSize: screenSize.height * 0.06,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: screenSize.height * 0.01),

            // SB / BB / Ante 数値
            Text(
              _getBlindValues(currentStage),
              style: TextStyle(
                fontSize: screenSize.height * 0.06,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: screenSize.height * 0.01),

            // Next Blind ラベル
            Text(
              'Next Blind',
              style: TextStyle(
                fontSize: screenSize.height * 0.04,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: screenSize.height * 0.01),

            // Next Blind 数値
            Text(
              _getBlindValues(nextStage),
              style: TextStyle(
                fontSize: screenSize.height * 0.04,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLeftContent(Size screenSize) {
    return Positioned(
      left: 0,
      top: screenSize.height * 0.2,
      child: StreamBuilder<DocumentSnapshot>(
        stream: _firestore
            .collection('scheduledTournaments')
            .doc(widget.tournamentId)
            .collection('views')
            .doc('main')
            .snapshots(),
        builder: (context, snapshot) {
          BlindPrizeDisplay? prizeDisplay;
          if (snapshot.hasData && snapshot.data!.exists) {
            final data = snapshot.data!.data() as Map<String, dynamic>?;
            prizeDisplay = parseBlindPrizeDisplay(data);
          }

          final prizeGroups = prizeDisplay != null
              ? groupBlindPrizeRanksForDisplay(prizeDisplay.ranks)
              : const <BlindPrizeRankGroup>[];

          return Container(
            width: screenSize.width * 0.25,
            height: screenSize.height * 0.6,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: Column(
              children: [
                _buildLeftItem(
                  '残プレイヤー',
                  _getPlayerCount(),
                  screenSize,
                ),
                _buildLeftItem(
                  'Avg Stack',
                  _getAvgStack(),
                  screenSize,
                ),
                if (prizeDisplay != null)
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final display = prizeDisplay!;
                      return FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.topCenter,
                        child: SizedBox(
                          width: constraints.maxWidth,
                          child: _buildLeftPrizeSection(
                            display,
                            screenSize,
                            prizeGroups: prizeGroups,
                          ),
                        ),
                      );
                    },
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildLeftPrizeSection(
    BlindPrizeDisplay prizeDisplay,
    Size screenSize, {
    required List<BlindPrizeRankGroup> prizeGroups,
  }) {
    final safeHeight = screenSize.height > 0 ? screenSize.height : 100.0;
    final infoFontSize = safeHeight * 0.016;
    final maxRankFontSize = safeHeight * 0.018;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
          child: Text(
            'Prize',
            style: TextStyle(
              fontSize: safeHeight * 0.015,
              color: Colors.grey[600],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Text(
            formatBlindPrizeReceiverCount(prizeDisplay.prizeReceiverCount),
            style: TextStyle(
              fontSize: infoFontSize,
              fontWeight: FontWeight.bold,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(height: 2),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Text(
            formatBlindPrizePoolLine(prizeDisplay.prizePool),
            style: TextStyle(
              fontSize: infoFontSize,
              fontWeight: FontWeight.bold,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(height: 4),
        _RotatingBlindPrizeRankList(
          prizeGroups: prizeGroups,
          infoFontSize: infoFontSize,
          maxRankFontSize: maxRankFontSize,
        ),
      ],
    );
  }

  Widget _buildLeftItem(
    String label,
    String value,
    Size screenSize,
  ) {
    return Expanded(
      child: Container(
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: Colors.grey[300]!),
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              left: 8,
              top: 8,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: screenSize.height * 0.015,
                  color: Colors.grey[600],
                ),
              ),
            ),
            Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    value,
                    style: TextStyle(
                      fontSize: screenSize.height * 0.0375,
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRightContent(Size screenSize, StageProgress progress, Map<String, dynamic> runtimeData) {
    return Positioned(
      right: 0,
      top: screenSize.height * 0.2,
      child: Container(
        width: screenSize.width * 0.25,
        height: screenSize.height * 0.6,
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey[300]!),
        ),
        child: Column(
          children: [
            _buildRightItem('Total Time', _getTotalTime(runtimeData), screenSize),
            _buildRightItem(
              'レジストまでの残り時間',
              _getRegistrationStatusDisplay(runtimeData, progress),
              screenSize,
            ),
            _buildRightItem(
              'Reentry',
              _getReentryConditionDisplay(),
              screenSize,
              compact: true,
            ),
            _buildRightItem(
              'Addon',
              _getAddonConditionDisplay(),
              screenSize,
              compact: true,
            ),
            _buildRightItem('Next Break', _getNextBreak(progress, runtimeData), screenSize),
          ],
        ),
      ),
    );
  }

  Widget _buildRightItem(
    String label,
    String value,
    Size screenSize, {
    bool compact = false,
  }) {
    final valueFontSize = compact
        ? screenSize.height * 0.028
        : screenSize.height * 0.0375;

    return Expanded(
      child: Container(
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: Colors.grey[300]!),
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              right: 8,
              top: 8,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: screenSize.height * 0.015,
                  color: Colors.grey[600],
                ),
              ),
            ),
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  value,
                  style: TextStyle(
                    fontSize: valueFontSize,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                  maxLines: compact ? 3 : 1,
                  overflow: TextOverflow.ellipsis,
                  softWrap: true,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Map<String, dynamic> get _snapshot =>
      _tournamentData?['snapshot'] as Map<String, dynamic>? ?? {};

  String _stripConditionPrefix(String formatted, String prefix) {
    if (formatted.startsWith(prefix)) {
      return formatted.substring(prefix.length);
    }
    return formatted;
  }

  String _getReentryConditionDisplay() {
    return _stripConditionPrefix(
      formatBlindReentryCondition(_snapshot),
      'Reentry: ',
    );
  }

  String _getAddonConditionDisplay() {
    return _stripConditionPrefix(
      formatBlindAddonCondition(_snapshot),
      'Addon: ',
    );
  }

  String _getTournamentName() {
    final snapshot = _tournamentData?['snapshot'] as Map<String, dynamic>? ?? {};
    return snapshot['name'] ?? 'トーナメント名なし';
  }

  /// 次の意味のあるステージを取得（durationSec = 0 のステージはスキップ）
  Map<String, dynamic>? _getNextMeaningfulStage(StageProgress progress, Map<String, dynamic> runtimeData) {
    final stages = (runtimeData['stages'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final currentIndex = progress.currentStageIndex;
    
    // 現在のインデックスの次から探索
    for (int i = currentIndex + 1; i < stages.length; i++) {
      final stage = stages[i];
      final durationSec = stage['durationSec'] as int? ?? 0;
      
      // durationSecが0より大きいステージを見つけたら返す
      if (durationSec > 0) {
        return stage;
      }
    }
    
    // 見つからない場合はnull
    return null;
  }

  String _getCurrentBlindLevel(Map<String, dynamic>? stage, bool isNotStarted) {
    // 開始前の場合はstartAtを参照
    if (isNotStarted) {
      final startAt = _tournamentData?['startAt'] as Timestamp?;
      if (startAt != null) {
        final startTime = startAt.toDate();
        final hours = startTime.hour.toString().padLeft(2, '0');
        final minutes = startTime.minute.toString().padLeft(2, '0');
        return '$hours:$minutesより開始予定';
      }
      return '開始予定';
    }
    
    if (stage == null) return 'BREAK';
    
    switch (stage['type']) {
      case 'level':
        return 'Level ${stage['lev'] ?? 1}';
      case 'break':
        return 'BREAK';
      case 'regist':
        return 'REGISTRATION';
      default:
        return 'UNKNOWN';
    }
  }

  String _getBlindValues(Map<String, dynamic>? stage) {
    return formatBlindValuesFromStage(stage);
  }

  String _getPlayerCount() {
    // main view データから取得
    // XX: playersIn
    // YY: entries + reentries - playersBusted
    final playersIn = _mainViewData?['playersIn'] as int? ?? 0;
    final entries = _mainViewData?['entries'] as int? ?? 0;
    final reentries = _mainViewData?['reentries'] as int? ?? 0;
    final playersBusted = _mainViewData?['playersBusted'] as int? ?? 0;
    final yy = entries + reentries - playersBusted;
    return '$yy/$playersIn';
  }

  String _getAvgStack() {
    return formatBlindAvgStack(_mainViewData?['avgStack']);
  }

  String _getTotalTime(Map<String, dynamic> runtimeData) {
    final startedAt = runtimeData['startedAt'] as Timestamp?;
    final pausedAt = runtimeData['pausedAt'] as Timestamp?;
    final shiftSec = runtimeData['shiftSec'] as int? ?? 0;
    final status = runtimeData['status'] as String? ?? 'scheduled';
    
    // 開始していない場合
    if (startedAt == null) {
      return '00:00:00';
    }
    
    // 評価時刻を決定
    DateTime evaluationTime;
    if (status == 'paused' && pausedAt != null) {
      evaluationTime = pausedAt.toDate();
    } else {
      evaluationTime = ServerTimeHelper.getCurrentTime();
    }
    
    // 経過秒数を計算
    final startTime = startedAt.toDate();
    final elapsedSec = evaluationTime.difference(startTime).inSeconds - shiftSec;
    
    // 負の値の場合は0:00:00
    if (elapsedSec < 0) {
      return '00:00:00';
    }
    
    // XX:YY:ZZ形式にフォーマット
    final hours = elapsedSec ~/ 3600;
    final minutes = (elapsedSec % 3600) ~/ 60;
    final seconds = elapsedSec % 60;
    
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  String _getNextBreak(StageProgress progress, Map<String, dynamic> runtimeData) {
    final currentStage = progress.currentStage;
    
    // 現在がBreak中の場合は'-'を返す
    if (currentStage != null && currentStage['type'] == 'break') {
      return '-';
    }
    
    final stages = (runtimeData['stages'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final currentIndex = progress.currentStageIndex;
    
    if (currentIndex < 0 || currentIndex >= stages.length) {
      return '-';
    }
    
    // 現在のステージの残り時間
    int timeToBreak = progress.remainingSec;
    
    // 現在のステージの次から順に探索
    for (int i = currentIndex + 1; i < stages.length; i++) {
      final stage = stages[i];
      final stageType = stage['type'] as String?;
      
      if (stageType == 'break') {
        // Breakが見つかった場合、時間をフォーマットして返す
        final minutes = timeToBreak ~/ 60;
        final seconds = timeToBreak % 60;
        return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
      }
      
      // Breakでない場合は、そのステージの時間を加算
      final stageDuration = stage['durationSec'] as int? ?? 0;
      timeToBreak += stageDuration;
    }
    
    // Breakが見つからなかった場合
    return '-';
  }

  String _getRegistrationStatusDisplay(
    Map<String, dynamic> runtimeData,
    StageProgress progress,
  ) {
    final startedAt = parseBlindStartedAt(runtimeData['startedAt']);

    return formatBlindRegistrationStatus(
      registrationOffsetSec: calculateBlindRegistrationOffsetSec(
        startAt: parseBlindStartAt(_tournamentData?['startAt']),
        regEndAt: parseBlindRegEndAt(_tournamentData?['regEndAt']),
      ),
      tournamentElapsedSec: startedAt == null ? null : progress.elapsedSec,
      status: _tournamentData?['status'] as String?,
      registAt: parseBlindRegistAt(runtimeData['registAt']),
    );
  }
}

class _RotatingBlindPrizeRankList extends StatefulWidget {
  const _RotatingBlindPrizeRankList({
    required this.prizeGroups,
    required this.infoFontSize,
    required this.maxRankFontSize,
  });

  final List<BlindPrizeRankGroup> prizeGroups;
  final double infoFontSize;
  final double maxRankFontSize;

  @override
  State<_RotatingBlindPrizeRankList> createState() =>
      _RotatingBlindPrizeRankListState();
}

class _RotatingBlindPrizeRankListState
    extends State<_RotatingBlindPrizeRankList> {
  Timer? _rotationTimer;
  int _pageIndex = 0;

  @override
  void initState() {
    super.initState();
    _restartRotationIfNeeded();
  }

  @override
  void didUpdateWidget(covariant _RotatingBlindPrizeRankList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!blindPrizeRankGroupsEqual(
      oldWidget.prizeGroups,
      widget.prizeGroups,
    )) {
      _pageIndex = 0;
      _restartRotationIfNeeded();
    }
  }

  void _restartRotationIfNeeded() {
    _rotationTimer?.cancel();
    _rotationTimer = null;

    final pageCount = blindPrizeRankListPageCount(widget.prizeGroups.length);
    if (pageCount <= 1) return;

    _rotationTimer = Timer.periodic(
      kBlindPrizeRankListRotationInterval,
      (_) {
        if (!mounted) return;
        setState(() {
          final totalPages = blindPrizeRankListPageCount(
            widget.prizeGroups.length,
          );
          if (totalPages <= 1) {
            _pageIndex = 0;
            return;
          }
          _pageIndex = (_pageIndex + 1) % totalPages;
        });
      },
    );
  }

  @override
  void dispose() {
    _rotationTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visibleGroups = visibleBlindPrizeRankGroupsForPage(
      widget.prizeGroups,
      _pageIndex,
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < visibleGroups.length; i++) ...[
            if (i > 0) const SizedBox(height: 2),
            Row(
              children: [
                Expanded(
                  child: Text(
                    formatBlindPrizeRankLabel(
                      visibleGroups[i].startRank,
                      visibleGroups[i].endRank,
                    ),
                    style: TextStyle(
                      fontSize: widget.infoFontSize,
                      fontWeight: FontWeight.bold,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  formatBlindPrizeAmount(visibleGroups[i].amount),
                  style: TextStyle(
                    fontSize: widget.maxRankFontSize,
                    fontWeight: FontWeight.bold,
                    color: Colors.amber[700],
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
