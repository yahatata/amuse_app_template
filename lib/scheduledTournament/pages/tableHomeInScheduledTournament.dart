import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:math';
import '../../UserAction/userActionHome.dart';

class TableHomeInScheduledTournament extends StatefulWidget {
  final String tournamentId;
  final String tableId;

  const TableHomeInScheduledTournament({
    super.key,
    required this.tournamentId,
    required this.tableId,
  });

  @override
  State<TableHomeInScheduledTournament> createState() => _TableHomeInScheduledTournamentState();
}

class _TableHomeInScheduledTournamentState extends State<TableHomeInScheduledTournament> {
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('卓 ${widget.tableId}'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadTableData,
            tooltip: '更新',
          ),
        ],
      ),
      body: StreamBuilder<DocumentSnapshot>(
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
    // mainドキュメントからデータを取得（実際のFirestoreフィールド名に修正）
    final entryCount = _mainViewData?['entries']?.toString() ?? '0';
    final activePlayers = _mainViewData?['playersIn']?.toString() ?? '0';
    final reEntryCount = _mainViewData?['reentries']?.toString() ?? '0';
    final addOnCount = _mainViewData?['addons']?.toString() ?? '0';
    
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'トーナメント情報',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 24),
          
          _buildTournamentInfoItem(Icons.emoji_events, 'エントリー数', entryCount),
          _buildDivider(),
          _buildTournamentInfoItem(Icons.people, '参加中人数', activePlayers),
          _buildDivider(),
          _buildTournamentInfoItem(Icons.replay, 'リエントリー数', reEntryCount),
          _buildDivider(),
          _buildTournamentInfoItem(Icons.add_circle, 'アドオン数', addOnCount),
          _buildDivider(),
          _buildSeatedCountItem(),
        ],
      ),
    );
  }

  Widget _buildTournamentInfoItem(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            color: Colors.blue.shade700,
            size: 24,
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.blue.shade700,
            ),
          ),
        ],
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

  Widget _buildSeatedCountItem() {
    return StreamBuilder<QuerySnapshot>(
      stream: _getTablesSeatStream(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _buildTournamentInfoItem(Icons.event_seat, '着席中人数', 'エラー');
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return _buildTournamentInfoItem(Icons.event_seat, '着席中人数', '...');
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
        return _buildTournamentInfoItem(Icons.event_seat, '着席中人数', displayText);
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
                  width: 720, // 1.8倍に拡大 (400 * 1.8)
                  height: 504, // 1.8倍に拡大 (280 * 1.8)
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(252), // 楕円形 (504 / 2)
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
      
      // 座席の位置を計算（左右反転）
      // 左右反転: -cos(angle) を使用
      final angle = i * (2 * 3.14159 / totalPositions) - (3.14159 / 2); // 12時方向から開始
      
      // 楕円の配置（正確な楕円周上に配置）
      final ellipseWidth = 790.0;
      final ellipseHeight = 530.0;
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
}
