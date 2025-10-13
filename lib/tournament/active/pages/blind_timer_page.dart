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
              
              return _buildMainContent(runtimeData, screenSize);
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

    return Stack(
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
        _buildRightContent(screenSize),
      ],
    );
  }

  Widget _buildCenterContent(StageProgress progress, Map<String, dynamic> runtimeData, Size screenSize) {
    final currentStage = progress.currentStage;
    final nextStage = progress.nextStage;
    
    return Positioned(
      left: screenSize.width * 0.5 - (screenSize.width * 0.4),
      top: screenSize.height * 0.25 - (screenSize.height * 0.1),
      child: SizedBox(
        width: screenSize.width * 0.8,
        child: Column(
          children: [
            // 現在のブラインドレベル
            Text(
              _getCurrentBlindLevel(currentStage),
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
            _buildLeftItem('総エントリー', _getTotalEntries(), screenSize),
            _buildLeftItem('Reentry', _getReentryCount(), screenSize),
            _buildLeftItem('Addon', _getAddonCount(), screenSize),
            _buildLeftItem('Avg Stack', _getAvgStack(), screenSize),
            _buildLeftItem('Players', _getPlayerCount(), screenSize),
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

  Widget _buildRightContent(Size screenSize) {
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
            _buildRightItem('Total Time', _getTotalTime(), screenSize),
            _buildRightItem('Reentry情報', _getReentryInfo(), screenSize),
            _buildRightItem('Addon情報', _getAddonInfo(), screenSize),
            _buildRightItem('Next Break', _getNextBreak(), screenSize),
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

  String _getCurrentBlindLevel(Map<String, dynamic>? stage) {
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
        final lev = stage['lev'] as int? ?? 1;
        // ブラインド構造は仮の値（実際のテンプレートから取得する必要がある）
        final sb = lev * 25;
        final bb = lev * 50;
        final ante = lev * 5;
        return '$sb / $bb / $ante';
      case 'break':
        return '-';
      case 'regist':
        return '-';
      default:
        return '-';
    }
  }

  String _getTotalEntries() {
    // main view データから取得
    final entries = _mainViewData?['entries'] as int? ?? 0;
    return entries.toString();
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
    final playersIn = _mainViewData?['playersIn'] as int? ?? 0;
    final entries = _mainViewData?['entries'] as int? ?? 0;
    return '$playersIn/$entries';
  }

  String _getTotalTime() {
    // main view データから取得
    final totalTime = _mainViewData?['totalTime'] as String? ?? '0:00:00';
    return totalTime;
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

  String _getNextBreak() {
    // main view データから取得
    final nextBreak = _mainViewData?['nextBreak'] as String? ?? '-';
    return nextBreak;
  }


}
