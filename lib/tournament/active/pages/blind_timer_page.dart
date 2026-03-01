import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
// 削除されたファイルへの参照を削除:
// import '../model/runtime_main.dart';
// import '../repositories/tournament_repo.dart';
import 'package:amuse_app_template/tournament/active/services/stage_builder.dart';
import 'package:amuse_app_template/tournament/active/services/server_time_helper.dart';
import 'package:amuse_app_template/tournament/active/widgets/display/timer_widget.dart';

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
    _loadTournamentData();
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

        // 画面左部 - 統計情報
        _buildLeftContent(screenSize),

        // 画面右部 - 追加情報
        _buildRightContent(screenSize, progress, runtimeData),
        
        // 画面下部 - プライズ情報
        _buildPrizeContent(screenSize),
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
      child: Container(
        width: screenSize.width * 0.25,
        height: screenSize.height * 0.6,
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey[300]!),
        ),
        child: Column(
          children: [
            _buildLeftItem('Players', _getPlayerCount(), screenSize),
            _buildLeftItem('総エントリー', _getTotalEntries(), screenSize),
            _buildLeftItem('Addon', _getAddonCount(), screenSize),
            _buildLeftItem('Avg Stack', _getAvgStack(), screenSize),
            _buildLeftItem('Reentry', _getReentryCount(), screenSize),
          ],
        ),
      ),
    );
  }

  Widget _buildLeftItem(String label, String value, Size screenSize) {
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
              child: Text(
                value,
                style: TextStyle(
                  fontSize: screenSize.height * 0.0375,
                  fontWeight: FontWeight.bold,
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
            _buildRightItem('レジストまでの残り時間', _getTimeToRegist(progress, runtimeData), screenSize),
            _buildRightItem('Reentry情報', _getReentryInfo(), screenSize),
            _buildRightItem('Addon情報', _getAddonInfo(), screenSize),
            _buildRightItem('Next Break', _getNextBreak(progress, runtimeData), screenSize),
          ],
        ),
      ),
    );
  }

  Widget _buildRightItem(String label, String value, Size screenSize) {
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
              child: Text(
                value,
                style: TextStyle(
                  fontSize: screenSize.height * 0.0375,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
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
    if (stage == null) return '-';
    
    switch (stage['type']) {
      case 'level':
        // stagesに埋め込まれたブラインド情報を取得
        final sb = stage['sb'] as int?;
        final bb = stage['bb'] as int?;
        final ante = stage['ante'] as int?;
        
        if (sb != null && bb != null) {
          if (ante != null && ante > 0) {
            return '$sb / $bb / $ante';
          } else {
            return '$sb / $bb / 0';
          }
        }
        
        // ブラインド情報がない場合は仮の値
        final lev = stage['lev'] as int? ?? 1;
        final defaultSb = lev * 25;
        final defaultBb = lev * 50;
        final defaultAnte = lev * 5;
        return '$defaultSb / $defaultBb / $defaultAnte';
      case 'break':
        return '- / - / -';
      case 'regist':
        return '-';
      default:
        return '-';
    }
  }

  String _getTotalEntries() {
    // main view データから取得
    final entries = _mainViewData?['entries'] as int? ?? 0;
    final reentries = _mainViewData?['reentries'] as int? ?? 0;
    return (entries + reentries).toString();
  }

  String _getReentryCount() {
    // main view データから取得
    final reentries = _mainViewData?['reentries'] as int? ?? 0;
    return reentries.toString();
  }

  String _getAddonCount() {
    // main view データから取得
    final addons = _mainViewData?['addons'] as int? ?? 0;
    return addons.toString();
  }

  String _getAvgStack() {
    // main view データから取得
    final avgStack = _mainViewData?['avgStack'] as int? ?? 0;
    return avgStack.toString();
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

  String _getReentryInfo() {
    final snapshot = _tournamentData?['snapshot'] as Map<String, dynamic>? ?? {};
    final isReentry = snapshot['isReentry'] as bool? ?? false;
    final maxReentries = snapshot['maxReentriesPerPlayer'] as int?;
    
    if (!isReentry) {
      return 'Reentry不可';
    } else if (maxReentries == null) {
      return '無制限';
    } else {
      return '$maxReentries回まで';
    }
  }

  String _getAddonInfo() {
    final snapshot = _tournamentData?['snapshot'] as Map<String, dynamic>? ?? {};
    final isAddon = snapshot['isAddon'] as bool? ?? false;
    final addonStack = snapshot['addonStack'] as int?;
    
    if (!isAddon) {
      return 'Addon不可';
    } else {
      return '${addonStack ?? 0}';
    }
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

  String _getTimeToRegist(StageProgress progress, Map<String, dynamic> runtimeData) {
    final stages = (runtimeData['stages'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final currentIndex = progress.currentStageIndex;
    
    // 開始前の場合
    if (progress.isNotStarted) {
      return '-';
    }
    
    // registステージを探す
    int registIndex = -1;
    for (int i = 0; i < stages.length; i++) {
      if (stages[i]['type'] == 'regist') {
        registIndex = i;
        break;
      }
    }
    
    // registステージが見つからない場合
    if (registIndex == -1) {
      return '-';
    }
    
    // すでにregistステージを通過している場合
    if (currentIndex >= registIndex) {
      return 'レジスト済み';
    }
    
    // registステージまでの残り時間を計算
    int timeToRegist = progress.remainingSec;
    
    // 現在のステージの次からregistステージの前まで加算
    for (int i = currentIndex + 1; i < registIndex; i++) {
      final stageDuration = stages[i]['durationSec'] as int? ?? 0;
      timeToRegist += stageDuration;
    }
    
    // XX:YY形式にフォーマット
    final minutes = timeToRegist ~/ 60;
    final seconds = timeToRegist % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  Widget _buildPrizeContent(Size screenSize) {
    return StreamBuilder<DocumentSnapshot>(
      stream: _firestore
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('views')
          .doc('main')
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData || !snapshot.data!.exists) {
          return const SizedBox.shrink();
        }

        final data = snapshot.data!.data() as Map<String, dynamic>?;
        final prizeReceiverCount = data?['prizeReceiverCount'] as int?;

        // prizeReceiverCountが存在しない場合は表示しない
        if (prizeReceiverCount == null || prizeReceiverCount <= 0) {
          return const SizedBox.shrink();
        }

        // プライズ情報を取得
        final prizes = <Map<String, dynamic>>[];
        for (int i = 1; i <= prizeReceiverCount; i++) {
          final prizeKey = '${i}stPrize';
          final prizeValue = data?[prizeKey];
          if (prizeValue != null) {
            prizes.add({
              'rank': i,
              'prize': prizeValue,
            });
          }
        }

        if (prizes.isEmpty) {
          return const SizedBox.shrink();
        }

        // 画面サイズの安全性チェック
        final safeWidth = screenSize.width > 0 ? screenSize.width : 100.0;
        final safeHeight = screenSize.height > 0 ? screenSize.height : 100.0;
        
        // 枠のサイズを計算（個数によって横幅を調整）
        // 余白を考慮して安全性を向上（左右に各1%の余白）
        final padding = safeWidth * 0.01;
        final availableWidth = safeWidth - (padding * 2);
        final prizeHeight = safeHeight * 0.15;

        return Positioned(
          left: 0,
          bottom: 0,
          child: Container(
            width: safeWidth,
            height: prizeHeight,
            padding: EdgeInsets.symmetric(horizontal: padding),
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey[300]!),
              color: Colors.white,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.max,
              children: prizes.asMap().entries.map((entry) {
                final index = entry.key;
                final prize = entry.value;
                final isLast = index == prizes.length - 1;
                
                return Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      border: isLast 
                          ? null 
                          : Border(
                              right: BorderSide(color: Colors.grey[300]!),
                            ),
                    ),
                    child: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              '${prize['rank']}stPrize',
                              style: TextStyle(
                                fontSize: safeHeight * 0.02,
                                fontWeight: FontWeight.bold,
                              ),
                              textAlign: TextAlign.center,
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Flexible(
                            child: Text(
                              '¥${prize['prize']}',
                              style: TextStyle(
                                fontSize: safeHeight * 0.025,
                                fontWeight: FontWeight.bold,
                                color: Colors.amber[700],
                              ),
                              textAlign: TextAlign.center,
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        );
      },
    );
  }


}
