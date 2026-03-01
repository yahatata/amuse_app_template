import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';
import 'package:amuse_app_template/utils/store_strong_warning_ui.dart';
import 'package:intl/intl.dart';
import 'dart:math';
import 'dart:async'; // For TimeoutException
import 'package:amuse_app_template/user_actions/user_action_home.dart';
import 'package:amuse_app_template/user_actions/bulk_addon_popup.dart';
import 'package:amuse_app_template/ActionHistory/tournamentActionsHistoryPage.dart';
import 'package:amuse_app_template/services/device_service.dart';

class TableDetailPage extends StatefulWidget {
  final String tournamentId;
  final String tableId;

  const TableDetailPage({
    super.key,
    required this.tournamentId,
    required this.tableId,
  });

  @override
  State<TableDetailPage> createState() => _TableDetailPageState();
}

class _TableDetailPageState extends State<TableDetailPage> {
  Map<String, dynamic>? _tableData;
  Map<String, dynamic>? _mainViewData;

  @override
  void initState() {
    super.initState();
    _loadTableData();
  }

  Future<void> _loadTableData() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('tablesSeat')
          .doc(widget.tableId)
          .get();

      if (doc.exists) {
        setState(() {
          _tableData = doc.data();
        });
      }
    } catch (e) {
      // エラーはStreamBuilderで処理されるため、ここでは何もしない
    }
  }

  Stream<DocumentSnapshot> _getTableDataStream() {
    return FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(widget.tournamentId)
        .collection('tablesSeat')
        .doc(widget.tableId)
        .snapshots();
  }

  Stream<DocumentSnapshot> _getMainViewDataStream() {
    return FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(widget.tournamentId)
        .collection('views')
        .doc('main')
        .snapshots();
  }

  Stream<QuerySnapshot> _getTablesSeatStream() {
    return FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(widget.tournamentId)
        .collection('tablesSeat')
        .where('isEnabled', isEqualTo: true)
        .snapshots();
  }

  /// AppBar用: storeMeta の営業状態を表示（Phase6 Step1）
  Widget _buildStoreStatusAction(BuildContext context) {
    return StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        }
        if (snapshot.hasError) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Icon(Icons.error, color: Colors.red, size: 20),
          );
        }
        final data = snapshot.data!;
        if (data.isUnknownStatus) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Icon(Icons.help_outline, color: Colors.grey, size: 20),
          );
        }
        if (data.isRunning && data.currentBusinessDateKey != null) {
          final parts = data.currentBusinessDateKey!.split('-');
          if (parts.length == 3) {
            try {
              final year = int.parse(parts[0]);
              final month = int.parse(parts[1]);
              final day = int.parse(parts[2]);
              final date = DateTime(year, month, day);
              final formatted = DateFormat('M/d(E)', 'ja_JP').format(date);
              final warningLabel = getDateWarningLabel(data);
              return Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Center(
                  child: warningLabel != null
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.warning_amber_rounded, size: 18, color: Colors.orange),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                warningLabel,
                                style: const TextStyle(fontSize: 11, color: Colors.orange),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(formatted, style: const TextStyle(fontSize: 14)),
                          ],
                        )
                      : Text(formatted, style: const TextStyle(fontSize: 14)),
                ),
              );
            } catch (_) {}
          }
        }
        if (data.isClosed) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Center(
              child: Text('閉店中', style: TextStyle(fontSize: 14)),
            ),
          );
        }
        if (data.isError) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Icon(Icons.error_outline, color: Colors.orange, size: 20),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('卓 ${widget.tableId}'),
        centerTitle: true,
        actions: [
          _buildStoreStatusAction(context),
          Container(
            margin: const EdgeInsets.only(right: 8),
            child: ElevatedButton.icon(
              onPressed: () {
                showBulkAddonDialog(
                  context: context,
                  tournamentId: widget.tournamentId,
                  tableId: widget.tableId,
                );
              },
              icon: const Icon(Icons.group_add, size: 18),
              label: const Text('まとめてAddon', style: TextStyle(fontSize: 12)),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue.shade50,
                foregroundColor: Colors.blue.shade700,
                elevation: 1,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(color: Colors.blue.shade200),
                ),
              ),
            ),
          ),
          Container(
            margin: const EdgeInsets.only(right: 8),
            child: ElevatedButton.icon(
              onPressed: () {
                _showActionHistoryDialog();
              },
              icon: const Icon(Icons.history, size: 18),
              label: const Text('操作履歴確認', style: TextStyle(fontSize: 12)),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange.shade50,
                foregroundColor: Colors.orange.shade700,
                elevation: 1,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(color: Colors.orange.shade200),
                ),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadTableData,
            tooltip: '更新',
          ),
        ],
      ),
      body: StoreStrongWarningWrapper(
        onCloseStore: () {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const terminalHomePage()),
            (route) => false,
          );
        },
        onBusinessContinue: () {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const terminalHomePage()),
            (route) => false,
          );
        },
        child: StreamBuilder<DocumentSnapshot>(
        stream: _getTableDataStream(),
        builder: (context, tableSnapshot) {
          return StreamBuilder<DocumentSnapshot>(
            stream: _getMainViewDataStream(),
            builder: (context, mainSnapshot) {
              // エラーハンドリング
              if (tableSnapshot.hasError || mainSnapshot.hasError) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error, color: Colors.red, size: 48),
                      const SizedBox(height: 16),
                      Text('エラー: ${tableSnapshot.hasError ? tableSnapshot.error : mainSnapshot.error}', 
                           style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadTableData,
                        child: const Text('再試行'),
                      ),
                    ],
                  ),
                );
              }

              // ローディング状態
              if ((tableSnapshot.connectionState == ConnectionState.waiting && _tableData == null) ||
                  (mainSnapshot.connectionState == ConnectionState.waiting && _mainViewData == null)) {
                return const Center(child: CircularProgressIndicator());
              }

              // データ存在チェック
              if (!tableSnapshot.hasData || !tableSnapshot.data!.exists) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error, color: Colors.red, size: 48),
                      const SizedBox(height: 16),
                      const Text('テーブルが見つかりません', style: TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadTableData,
                        child: const Text('再試行'),
                      ),
                    ],
                  ),
                );
              }

              // リアルタイムデータを更新
              _tableData = tableSnapshot.data!.data() as Map<String, dynamic>?;
              _mainViewData = mainSnapshot.data?.data() as Map<String, dynamic>?;
              
              return _buildTableContent();
            },
          );
        },
      ),
      ),
    );
  }

  Widget _buildTableContent() {
    final seats = _tableData?['seats'] as Map<String, dynamic>? ?? {};
    final maxSeats = _tableData?['maxSeats'] as int? ?? 10;
    
    return Row(
      children: [
        // 左側: トーナメント情報
        Expanded(
          flex: 1,
          child: _buildTournamentInfoPanel(),
        ),
        
        // 中央: ポーカーテーブル
        Expanded(
          flex: 4,
          child: _buildPokerTable(seats, maxSeats),
        ),
      ],
    );
  }

  Widget _buildTournamentInfoPanel() {
    // mainドキュメントからデータを取得
    final entryCount = _mainViewData?['entries'] as int? ?? 0;
    final reEntryCount = _mainViewData?['reentries'] as int? ?? 0;
    final totalEntries = entryCount + reEntryCount; // 総エントリー数
    
    final screenSize = MediaQuery.of(context).size;
    final appBarHeight = kToolbarHeight;
    final padding = screenSize.height * 0.04 * 2; // 上下のpadding
    final dividerHeight = 1.0; // dividerの高さ
    final dividerMargin = 8.0 * 2; // dividerの上下マージン
    
    // 利用可能な高さを計算（画面高さ - AppBar - padding）
    final availableHeight = screenSize.height - MediaQuery.of(context).padding.top - appBarHeight - padding;
    
    // 5つの要素 + 4つのdivider（各要素の間に1つずつ）
    const itemCount = 5;
    const dividerCount = 4;
    final totalDividerHeight = dividerCount * (dividerHeight + dividerMargin);
    
    // 各要素に割り当てる高さを計算
    final itemHeight = (availableHeight - totalDividerHeight) / itemCount;
    
    // 各要素内のサイズを計算（アイコン、ラベル、値のサイズを動的に決定）
    // 安全なマージンを確保するため、要素高さの70%を実際のコンテンツに使用
    final contentHeight = itemHeight * 0.7;
    final iconSize = contentHeight * 0.35; // コンテンツ高さの35%
    final labelFontSize = contentHeight * 0.18; // コンテンツ高さの18%
    final valueFontSize = contentHeight * 0.28; // コンテンツ高さの28%
    final spacing = contentHeight * 0.1; // コンテンツ高さの10%をスペーシングに
    
    return Container(
      padding: EdgeInsets.all(screenSize.height * 0.04),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 一番上に総エントリー数を表示
          SizedBox(
            height: itemHeight,
            child: _buildTournamentInfoItem(
              Icons.emoji_events, 
              '総エントリー数', 
              totalEntries.toString(),
              iconSize: iconSize,
              labelFontSize: labelFontSize,
              valueFontSize: valueFontSize,
              spacing: spacing,
            ),
          ),
          _buildDivider(),
          
          SizedBox(
            height: itemHeight,
            child: _buildTournamentInfoItem(
              Icons.replay, 
              'リエントリー数', 
              reEntryCount.toString(),
              iconSize: iconSize,
              labelFontSize: labelFontSize,
              valueFontSize: valueFontSize,
              spacing: spacing,
            ),
          ),
          _buildDivider(),
          
          SizedBox(
            height: itemHeight,
            child: _buildTournamentInfoItem(
              Icons.add_circle, 
              'アドオン数', 
              (_mainViewData?['addons'] as int? ?? 0).toString(),
              iconSize: iconSize,
              labelFontSize: labelFontSize,
              valueFontSize: valueFontSize,
              spacing: spacing,
            ),
          ),
          _buildDivider(),
          
          SizedBox(
            height: itemHeight,
            child: _buildSeatedCountItem(
              iconSize: iconSize,
              labelFontSize: labelFontSize,
              valueFontSize: valueFontSize,
              spacing: spacing,
            ),
          ),
          _buildDivider(),
          
          // 一番下にWaiting Playerを表示
          SizedBox(
            height: itemHeight,
            child: _buildWaitingPlayerItem(
              iconSize: iconSize,
              labelFontSize: labelFontSize,
              valueFontSize: valueFontSize,
              spacing: spacing,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTournamentInfoItem(
    IconData icon, 
    String label, 
    String value, {
    required double iconSize,
    required double labelFontSize,
    required double valueFontSize,
    required double spacing,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              color: Colors.blue.shade700,
              size: iconSize,
            ),
            SizedBox(height: spacing),
            Text(
              label,
              style: TextStyle(
                fontSize: labelFontSize,
                color: Colors.grey[600],
              ),
            ),
            SizedBox(height: spacing * 0.5),
            Text(
              value,
              style: TextStyle(
                fontSize: valueFontSize,
                fontWeight: FontWeight.bold,
                color: Colors.blue.shade700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDivider() {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      height: 1,
      color: Colors.grey.shade300,
    );
  }

  Widget _buildSeatedCountItem({
    required double iconSize,
    required double labelFontSize,
    required double valueFontSize,
    required double spacing,
  }) {
    return StreamBuilder<QuerySnapshot>(
      stream: _getTablesSeatStream(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _buildTournamentInfoItem(
            Icons.event_seat, 
            '着席中人数', 
            'エラー',
            iconSize: iconSize,
            labelFontSize: labelFontSize,
            valueFontSize: valueFontSize,
            spacing: spacing,
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return _buildTournamentInfoItem(
            Icons.event_seat, 
            '着席中人数', 
            '...',
            iconSize: iconSize,
            labelFontSize: labelFontSize,
            valueFontSize: valueFontSize,
            spacing: spacing,
          );
        }

        final docs = snapshot.data?.docs ?? [];
        int totalSeats = 0;
        int occupiedSeats = 0;

        for (final doc in docs) {
          if (doc.id == 'waiting') continue; // waitingドキュメントを除外
          
          final data = doc.data() as Map<String, dynamic>?;
          if (data == null) continue;

          final seats = data['seats'] as Map<String, dynamic>? ?? {};
          
          // seatXXUserIdフィールドをカウント
          for (final entry in seats.entries) {
            if (entry.key.endsWith('UserId')) {
              totalSeats++;
              if (entry.value != null && entry.value.toString().isNotEmpty) {
                occupiedSeats++;
              }
            }
          }
        }

        final displayText = '$occupiedSeats/$totalSeats';
        return _buildTournamentInfoItem(
          Icons.event_seat, 
          '着席中人数', 
          displayText,
          iconSize: iconSize,
          labelFontSize: labelFontSize,
          valueFontSize: valueFontSize,
          spacing: spacing,
        );
      },
    );
  }

  Widget _buildWaitingPlayerItem({
    required double iconSize,
    required double labelFontSize,
    required double valueFontSize,
    required double spacing,
  }) {
    return StreamBuilder<DocumentSnapshot>(
      stream: _getWaitingDocumentStream(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _buildTournamentInfoItem(
            Icons.people_outline, 
            'Waiting Player', 
            'エラー',
            iconSize: iconSize,
            labelFontSize: labelFontSize,
            valueFontSize: valueFontSize,
            spacing: spacing,
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return _buildTournamentInfoItem(
            Icons.people_outline, 
            'Waiting Player', 
            '...',
            iconSize: iconSize,
            labelFontSize: labelFontSize,
            valueFontSize: valueFontSize,
            spacing: spacing,
          );
        }

        final data = snapshot.data?.data() as Map<String, dynamic>?;
        final waitingCount = data?['count'] as int? ?? 0;
        
        return _buildTournamentInfoItem(
          Icons.people_outline, 
          'Waiting Player', 
          waitingCount.toString(),
          iconSize: iconSize,
          labelFontSize: labelFontSize,
          valueFontSize: valueFontSize,
          spacing: spacing,
        );
      },
    );
  }

  Widget _buildPokerTable(Map<String, dynamic> seats, int maxSeats) {
    return Container(
      padding: const EdgeInsets.all(20),
      child: Container(
        width: double.infinity,
        height: double.infinity,
        child: Stack(
          children: [
            // ポーカーテーブル（横長楕円形）
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              child: Center(
                child: Container(
                  width: MediaQuery.of(context).size.width * 0.6, // 画面幅の60%
                  height: MediaQuery.of(context).size.width * 0.4, // 画面幅の40%（3:2の比率）
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(MediaQuery.of(context).size.width * 0.2), // 楕円形（画面幅の20%）
                    color: Colors.green.shade800,
                    border: Border.all(color: Colors.green.shade900, width: 3),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.3),
                        blurRadius: 10,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: Stack(
                    children: [
                      // ブラインド情報（テーブル内中央）
                      Center(
                        child: _buildBlindInfo(),
                      ),
                      
                      // ディーラーポジション（中央下部）
                      Positioned(
                        bottom: 20,
                        left: 0,
                        right: 0,
                        child: Center(
                          child: Container(
                            width: 60,
                            height: 30,
                            decoration: BoxDecoration(
                              color: Colors.red.shade700,
                              borderRadius: BorderRadius.circular(15),
                            ),
                            child: Center(
                              child: Text(
                                'DEALER',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            
            // 座席配置（テーブル周囲）
            ..._buildSeatPositions(seats, maxSeats),
          ],
        ),
      ),
    );
  }

  Widget _buildBlindInfo() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 残り時間（文字サイズ3倍）
        Text(
          '15:30', // TODO: 後ほど実装
          style: TextStyle(
            fontSize: 36, // 3倍 (12 * 3)
            fontWeight: FontWeight.bold,
            color: Colors.orange.shade700,
          ),
        ),
        const SizedBox(height: 8),
        
        // 現在のレベル（文字サイズ2倍）
        Text(
          'Level 1', // TODO: 後ほど実装
          style: TextStyle(
            fontSize: 24, // 2倍 (12 * 2)
            fontWeight: FontWeight.bold,
            color: Colors.black,
          ),
        ),
        const SizedBox(height: 8),
        
        // SB/BB/BBA（文字サイズ3倍）
        Text(
          '25/50/50', // TODO: 後ほど実装
          style: TextStyle(
            fontSize: 36, // 3倍 (12 * 3)
            fontWeight: FontWeight.bold,
            color: Colors.black,
          ),
        ),
        const SizedBox(height: 8),
        
        // 次のレベル
        Text(
          'Next Level : 50/100/100', // TODO: 後ほど実装
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Colors.purple.shade700,
          ),
        ),
      ],
    );
  }

  List<Widget> _buildSeatPositions(Map<String, dynamic> seats, int maxSeats) {
    final widgets = <Widget>[];
    
    // デバッグログ（まとめてAddonと比較用）
    print('=== tableHomeInScheduledTournament 着席者判定デバッグ ===');
    print('seats: $seats');
    print('maxSeats: $maxSeats');
    
    // テーブルの中心位置を修正
    // 画面全体の幅を5分割し、左側1/5がトーナメント情報、残り4/5の中央にテーブル配置
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;
    final availableWidth = screenWidth * 0.8; // 右側4/5のスペース
    final tableCenterX = screenWidth * 0.1 + availableWidth * 0.5 - screenWidth * 0.115; // 左にずらす
    final tableCenterY = screenHeight * 0.5 - screenHeight * 0.07; // 上にずらす
    
    // 座席数 + 1（ディーラーポジション含む）で等間隔配置
    final totalPositions = maxSeats + 1;
    
    for (int i = 1; i <= maxSeats; i++) {
      final seatNoStr = i.toString().padLeft(2, '0');
      final userId = seats['seat${seatNoStr}UserId'] as String?;
      final pokerName = seats['seat${seatNoStr}PokerName'] as String?;
      final isOccupied = userId != null && userId.isNotEmpty;
      
      print('席番号 $i:');
      print('  seatUserId: $userId');
      print('  seatPokerName: $pokerName');
      print('  isOccupied: $isOccupied');
      
      // 座席の位置を計算（左右反転）
      // 左右反転: -cos(angle) を使用
      final angle = i * (2 * 3.14159 / totalPositions) - (3.14159 / 2); // 12時方向から開始
      
      // 楕円の配置（画面サイズに応じた楕円周上に配置）
      final ellipseWidth = MediaQuery.of(context).size.width * 0.64; // 画面幅の75%
      final ellipseHeight = MediaQuery.of(context).size.width * 0.44; // 画面幅の50%（3:2の比率）
      final a = ellipseWidth / 2; // 楕円の横半径
      final b = ellipseHeight / 2; // 楕円の縦半径
      
      final x = tableCenterX - a * cos(angle); // 左右反転
      final y = tableCenterY - b * sin(angle); // 上下反転
      
      widgets.add(
        Positioned(
          left: x - 60, // 120pxの座席サイズの半分（横幅が2倍になったため）
          top: y - 30,  // 60pxの座席サイズの半分（縦幅は変わらない）
          child: _buildSeatWidget(i, isOccupied, pokerName, userId),
        ),
      );
    }
    
    return widgets;
  }

  Widget _buildSeatWidget(int seatNo, bool isOccupied, String? pokerName, String? userId) {
    return GestureDetector(
      onTap: isOccupied && userId != null && pokerName != null 
          ? () => _showPlayerInfo(userId!, pokerName!, seatNo)
          : !isOccupied 
              ? () => _showSeatAssignmentDialog(seatNo)
              : null,
      child: Container(
        width: 120, // 横幅を2倍に変更（60 * 2）
        height: 60, // 縦幅はそのまま
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(30), // 楕円形にする（height/2）
          color: isOccupied ? Colors.white : Colors.grey.shade300,
          border: Border.all(
            color: isOccupied ? Colors.blue : Colors.grey.shade400,
            width: 2,
          ),
          boxShadow: isOccupied ? [
            BoxShadow(
              color: Colors.blue.withValues(alpha: 0.3),
              blurRadius: 5,
              offset: const Offset(0, 2),
            ),
          ] : null,
        ),
        child: Center(
          child: isOccupied
              ? Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                                         Icon(
                       Icons.person,
                       size: 20,
                       color: Colors.blue.shade700,
                     ),
                                         Text(
                       pokerName ?? 'Unknown',
                       style: TextStyle(
                         fontSize: 10,
                         color: Colors.blue.shade700,
                         fontWeight: FontWeight.bold,
                       ),
                       textAlign: TextAlign.center,
                       maxLines: 1,
                       overflow: TextOverflow.ellipsis,
                       ),
                  ],
                )
              :                    Text(
                     seatNo.toString(),
                     style: TextStyle(
                       fontSize: 14,
                       color: Colors.grey.shade600,
                       fontWeight: FontWeight.bold,
                     ),
                   ),
        ),
      ),
    );
  }

  /// プレイヤー情報を表示
  void _showPlayerInfo(String userId, String pokerName, int seatNumber) {
    final user = {
      'userId': userId,
      'pokerName': pokerName,
      'tournamentId': widget.tournamentId,
      'tableId': widget.tableId,
      'seatNumber': seatNumber,
    };
    
    showUserActionHome(
      context: context,
      sourcePage: 'tableHomeInScheduledTournament',
      user: user,
    );
  }

  /// waitingドキュメントのストリームを取得
  Stream<DocumentSnapshot> _getWaitingDocumentStream() {
    return FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(widget.tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .snapshots();
  }

  /// 空席への着席ダイアログを表示
  void _showSeatAssignmentDialog(int seatNumber) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Row(
            children: [
              Icon(Icons.event_seat, color: Colors.blue),
              const SizedBox(width: 8),
              Text('シート $seatNumber への着席'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('シート $seatNumber に着席するユーザーを選択してください'),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('卓: ${widget.tableId}'),
                    Text('シート: $seatNumber'),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () async {
                Navigator.of(context).pop();
                await _showWaitingUserSelectionDialog(seatNumber);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
              ),
              child: const Text('ユーザー選択'),
            ),
          ],
        );
      },
    );
  }

  /// waitingユーザー選択ダイアログを表示
  Future<void> _showWaitingUserSelectionDialog(int seatNumber) async {
    // 選択されたユーザーIDを管理（StatefulBuilderの外で定義）
    String? selectedUserId;
    String? selectedPokerName;
    
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return StreamBuilder<DocumentSnapshot>(
          stream: _getWaitingDocumentStream(),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return AlertDialog(
                title: const Text('エラー'),
                content: Text('データの取得に失敗しました: ${snapshot.error}'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('OK'),
                  ),
                ],
              );
            }

            if (snapshot.connectionState == ConnectionState.waiting) {
              return const AlertDialog(
                title: Text('読み込み中'),
                content: Center(child: CircularProgressIndicator()),
              );
            }

            final data = snapshot.data?.data() as Map<String, dynamic>?;
            final waiting = data?['waiting'] as Map<String, dynamic>? ?? {};

            if (waiting.isEmpty) {
              return AlertDialog(
                title: const Text('待機者なし'),
                content: const Text('現在待機中のユーザーはいません'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('OK'),
                  ),
                ],
              );
            }

            return StatefulBuilder(
              builder: (context, setState) {
                return AlertDialog(
                  title: const Text('待機者から選択'),
                  content: SizedBox(
                    width: double.maxFinite,
                    height: 150, // サイズを半分に調整
                    child: Column(
                      children: [
                        Expanded(
                          child: ListView.builder(
                            itemCount: waiting.length,
                            itemBuilder: (context, index) {
                              final userId = waiting.keys.elementAt(index);
                              final userData = waiting[userId] as Map<String, dynamic>?;
                              final pokerName = userData?['pokerName'] as String? ?? 'Unknown';

                              return CheckboxListTile(
                                title: Text(pokerName), // IDは非表示
                                value: selectedUserId == userId,
                                onChanged: (bool? value) {
                                  setState(() {
                                    if (value == true) {
                                      selectedUserId = userId;
                                      selectedPokerName = pokerName;
                                    } else {
                                      selectedUserId = null;
                                      selectedPokerName = null;
                                    }
                                  });
                                  print('選択状態更新: userId=$selectedUserId, pokerName=$selectedPokerName'); // デバッグ用
                                },
                                controlAffinity: ListTileControlAffinity.leading,
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 16),
                        // 確定ボタンを中央下部に配置
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: selectedUserId != null && selectedPokerName != null
                                ? () async {
                                    print('確定ボタン押下: userId=$selectedUserId, pokerName=$selectedPokerName'); // デバッグ用
                                    Navigator.of(context).pop();
                                    await _assignSeatToUser(selectedUserId!, selectedPokerName!, seatNumber);
                                  }
                                : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: selectedUserId != null ? Colors.blue : Colors.grey,
                              foregroundColor: Colors.white,
                            ),
                            child: Text(selectedUserId != null ? '確定' : 'ユーザーを選択してください'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: const Text('キャンセル'),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }

  /// ユーザーを指定席に着席させる
  Future<void> _assignSeatToUser(String userId, String pokerName, int seatNumber) async {
    // Overlayを使用したローディング表示
    OverlayEntry? loadingOverlay;
    
    try {
      // ローディング表示
      loadingOverlay = OverlayEntry(
        builder: (context) => Material(
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
                  Text('着席処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      
      // Overlayに追加
      Overlay.of(context).insert(loadingOverlay);
      
      print('=== 着席処理開始 ===');
      print('userId: $userId');
      print('pokerName: $pokerName');
      print('seatNumber: $seatNumber');
      
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('assignSeatToPlayer');

      print('=== Cloud Function呼び出し実行中 ===');
      final result = await callable.call({
        'operationId': operationId,
        'tournamentId': widget.tournamentId,
        'tableId': widget.tableId,
        'seatNumber': seatNumber,
        'userId': userId,
        'pokerName': pokerName,
        if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
      }).timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          print('=== タイムアウト発生 ===');
          throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました');
        },
      );
      print('=== Cloud Function呼び出し完了 ===');

      print('=== Cloud Function応答 ===');
      print('result.data: ${result.data}');

      // 結果を確認
      final data = result.data as Map<String, dynamic>;
      
      print('=== レスポンス解析 ===');
      print('response: $data');
      print('success: ${data['success']}');
      
      if (data['success'] == true) {
        // 成功メッセージを表示
        if (context.mounted) {
          showDialog(
            context: context,
            builder: (BuildContext context) {
              return AlertDialog(
                title: Row(
                  children: [
                    Icon(Icons.check_circle, color: Colors.green),
                    const SizedBox(width: 8),
                    const Text('完了'),
                  ],
                ),
                content: Text('$pokerName様がシート $seatNumber に着席しました'),
                actions: [
                  ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('OK'),
                  ),
                ],
              );
            },
          );
        }
      } else {
        // エラーメッセージを表示
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('着席処理に失敗しました: ${data['error'] ?? '不明なエラー'}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      print('=== 着席処理エラー ===');
      print('error: $e');
      
      // エラーメッセージを表示
      if (context.mounted) {
        String errorMessage = '着席処理に失敗しました';
        
        if (e is TimeoutException) {
          errorMessage = '処理がタイムアウトしました。しばらく待ってから再試行してください。';
        } else if (e.toString().contains('network')) {
          errorMessage = 'ネットワークエラーが発生しました。接続を確認してください。';
        } else if (e.toString().contains('permission')) {
          errorMessage = '権限が不足しています。管理者に連絡してください。';
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
            action: SnackBarAction(
              label: '詳細',
              textColor: Colors.white,
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('詳細エラー: $e'),
                    backgroundColor: Colors.red.shade800,
                    duration: const Duration(seconds: 3),
                  ),
                );
              },
            ),
          ),
        );
      }
    } finally {
      // ローディングを確実に閉じる
      if (loadingOverlay != null) {
        loadingOverlay.remove();
      }
    }
  }

  void _showActionHistoryDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('操作履歴の確認'),
          content: const Text('操作履歴の確認を行いますか？'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).pop();
                _navigateToActionHistory();
              },
              child: const Text('表示する'),
            ),
          ],
        );
      },
    );
  }

  void _navigateToActionHistory() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => TournamentActionsHistoryPage(
          tournamentId: widget.tournamentId,
          tableId: widget.tableId,
        ),
      ),
    );
  }
}
