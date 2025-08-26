import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../widgets/add_table_dialog.dart';
import '../widgets/assign_seat_dialog.dart';
import '../widgets/reseat_all_dialog.dart';
import '../widgets/register_participants_dialog.dart';
import '../models/table_and_users.dart';
import '../services/tournament_data_service.dart';
import '../scheduled_tournament_service.dart';
import 'tableHomeInScheduledTournament.dart';

class ScheduledTournamentHomePage extends StatefulWidget {
  final String tournamentId;
  final String tournamentName;

  const ScheduledTournamentHomePage({
    super.key,
    required this.tournamentId,
    required this.tournamentName,
  });

  @override
  State<ScheduledTournamentHomePage> createState() => _ScheduledTournamentHomePageState();
}

class _ScheduledTournamentHomePageState extends State<ScheduledTournamentHomePage> {
  // サービスインスタンス
  final TournamentDataService _dataService = TournamentDataService();
  final ScheduledTournamentService _service = ScheduledTournamentServiceImpl();
  
  // データ状態
  List<TournamentTable> _tournamentTables = [];
  List<WaitingPlayer> _waitingPlayers = [];
  List<TournamentUser> _tournamentUsers = [];
  bool _isLoadingData = true;
  
  // デバッグ用のログ出力
  @override
  void initState() {
    super.initState();
    debugPrint('=== ScheduledTournamentHomePage 初期化 ===');
    debugPrint('tournamentId: ${widget.tournamentId}');
    debugPrint('tournamentName: ${widget.tournamentName}');
    
    // 初期データ読み込み
    _loadTournamentData();
  }

  /// アクションメソッド
  void _assignSeatToWaiting() {
    _showAssignSeatDialog();
  }
  
  /// 待機者着席ダイアログを表示
  void _showAssignSeatDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AssignSeatDialog(
          tournamentId: widget.tournamentId,
          onSeatAssigned: () {
            // 着席後の処理
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('待機者が着席しました')),
            );
            // データを再読み込み
            _loadTournamentData();
          },
          service: _service,
        );
      },
    );
  }
  
  /// 特定の待機者を着席させるダイアログを表示
  void _showAssignSeatDialogForPlayer(String userId) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AssignSeatDialog(
          tournamentId: widget.tournamentId,
          preselectedUserId: userId, // 事前選択されたユーザーID
          onSeatAssigned: () {
            // 着席後の処理
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('待機者が着席しました')),
            );
            // データを再読み込み
            _loadTournamentData();
          },
          service: _service,
        );
      },
    );
  }
  
  /// トーナメントデータを読み込み
  Future<void> _loadTournamentData() async {
    setState(() {
      _isLoadingData = true;
    });
    
    try {
      final result = await _dataService.refreshTournamentData(widget.tournamentId);
      
      if (result['success'] == true) {
        setState(() {
          _tournamentTables = result['tables'] ?? [];
          _waitingPlayers = result['waitingPlayers'] ?? [];
          _tournamentUsers = result['users'] ?? [];
          _isLoadingData = false;
        });
        
        debugPrint('=== データ読み込み完了 ===');
        debugPrint('テーブル数: ${_tournamentTables.length}');
        debugPrint('待機者数: ${_waitingPlayers.length}');
        debugPrint('ユーザー数: ${_tournamentUsers.length}');
      } else {
        throw Exception(result['error'] ?? 'データ読み込みに失敗しました');
      }
    } catch (e) {
      debugPrint('データ読み込みエラー: $e');
      setState(() {
        _isLoadingData = false;
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('データ読み込みエラー: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _addTable() {
    _showAddTableDialog();
  }
  
  /// 卓追加ダイアログを表示
  void _showAddTableDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AddTableDialog(
          tournamentId: widget.tournamentId,
          onTableAdded: () {
            // テーブル追加後の処理
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('卓が追加されました')),
            );
            // データを再読み込み
            _loadTournamentData();
          },
          service: _service,
        );
      },
    );
  }

  void _reseatAllPlayers() {
    _showReseatAllDialog();
  }
  
  /// 全員リシートダイアログを表示
  void _showReseatAllDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return ReseatAllDialog(
          tournamentId: widget.tournamentId,
          onReseatCompleted: () {
            // リシート完了後の処理
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('全員リシートが完了しました')),
            );
            // データを再読み込み
            _loadTournamentData();
          },
          service: _service,
        );
      },
    );
  }

  void _registerParticipant() {
    _showRegisterParticipantsDialog();
  }

  /// 参加者登録ダイアログを表示
  void _showRegisterParticipantsDialog() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return RegisterParticipantsDialog(
          tournamentId: widget.tournamentId,
          onRegistrationCompleted: () {
            // 登録完了後の処理
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('参加者登録が完了しました')),
            );
            // データを再読み込み
            _loadTournamentData();
          },
          service: _service,
        );
      },
    );
  }

  void _confirmPrizes() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('プライズを確定する機能が実装されました')),
    );
  }

  /// 統計アイテムを構築
  Widget _buildStatItem({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
    bool small = false,
  }) {
    return Row(
      children: [
        Icon(icon, color: color, size: small ? 18 : 22),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: Colors.grey[600],
                  fontSize: small ? 11 : 13,
                ),
              ),
              Text(
                value,
                style: TextStyle(
                  color: color,
                  fontSize: small ? 13 : 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _showTableDetail(String tableId) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => TableHomeInScheduledTournament(
          tournamentId: widget.tournamentId,
          tableId: tableId,
        ),
      ),
    );
  }

  /// 下部アクションバーを構築
  Widget _buildBottomActionBar() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        border: Border(
          top: BorderSide(color: Colors.grey[300]!),
        ),
      ),
      child: Row(
        children: [
          // 左側: トーナメント状況表示
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue[200]!),
              ),
              child: StreamBuilder<DocumentSnapshot>(
                stream: FirebaseFirestore.instance
                    .collection('scheduledTournaments')
                    .doc(widget.tournamentId)
                    .collection('views')
                    .doc('main')
                    .snapshots(),
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return Text('エラー: ${snapshot.error}', style: TextStyle(color: Colors.red));
                  }
                  
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  
                  final data = snapshot.data?.data() as Map<String, dynamic>?;
                  
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ヘッダー部分
                      Row(
                        children: [
                          Icon(Icons.emoji_events, color: Colors.blue[700], size: 18),
                          const SizedBox(width: 6),
                          Text(
                            'トーナメント状況',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.blue[700],
                              fontSize: 15,
                            ),
                          ),
                          const Spacer(),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                            decoration: BoxDecoration(
                              color: Colors.blue[100],
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              'LIVE',
                              style: TextStyle(
                                color: Colors.blue[700],
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      
                      if (data != null) ...[
                        // メイン統計情報（3列レイアウト）
                        Row(
                          children: [
                            // 左列: 基本情報
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _buildStatItem(
                                    icon: Icons.people,
                                    label: 'エントリー',
                                    value: '${data['entries'] ?? 0}',
                                    color: Colors.green[700]!,
                                  ),
                                  const SizedBox(height: 8),
                                  _buildStatItem(
                                    icon: Icons.sports_esports,
                                    label: '参加中',
                                    value: '${data['playersIn'] ?? 0}',
                                    color: Colors.blue[700]!,
                                  ),
                                ],
                              ),
                            ),
                            
                            const SizedBox(width: 8),
                            
                            // 中央列: 詳細情報
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _buildStatItem(
                                    icon: Icons.trending_up,
                                    label: 'レベル',
                                    value: '${data['currentLevel'] ?? 0}',
                                    color: Colors.purple[700]!,
                                  ),
                                  const SizedBox(height: 8),
                                  _buildStatItem(
                                    icon: Icons.refresh,
                                    label: 'リエントリー',
                                    value: '${data['reentries'] ?? 0}',
                                    color: Colors.purple[700]!,
                                  ),
                                ],
                              ),
                            ),
                            
                            const SizedBox(width: 8),
                            
                            // 右列: 追加情報
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  _buildStatItem(
                                    icon: Icons.add_circle,
                                    label: 'アドオン',
                                    value: '${data['addons'] ?? 0}',
                                    color: Colors.teal[700]!,
                                  ),
                                  const SizedBox(height: 8),
                                  _buildStatItem(
                                    icon: Icons.remove_circle,
                                    label: 'バースト',
                                    value: '${data['busted'] ?? 0}',
                                    color: Colors.red[700]!,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        
                        const SizedBox(height: 10),
                        
                        // 追加情報（利用可能な場合）
                        if (data['prizePool'] != null || data['timeRemaining'] != null) ...[
                          Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: Colors.blue[100],
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Row(
                              children: [
                                if (data['prizePool'] != null) ...[
                                  Expanded(
                                    child: _buildStatItem(
                                      icon: Icons.attach_money,
                                      label: 'プライズプール',
                                      value: '¥${data['prizePool']}',
                                      color: Colors.amber[700]!,
                                      small: true,
                                    ),
                                  ),
                                ],
                                if (data['timeRemaining'] != null) ...[
                                  Expanded(
                                    child: _buildStatItem(
                                      icon: Icons.timer,
                                      label: '残り時間',
                                      value: '${data['timeRemaining']}分',
                                      color: Colors.indigo[700]!,
                                      small: true,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ] else ...[
                        // データなしの場合
                        Container(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: [
                              Icon(Icons.info_outline, color: Colors.grey, size: 32),
                              const SizedBox(height: 8),
                              Text(
                                'データなし',
                                style: TextStyle(color: Colors.grey, fontSize: 14),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
          
          const SizedBox(width: 16),
          
          // 右側: アクションボタン（縦並び）
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ElevatedButton.icon(
                onPressed: () => _registerParticipant(),
                icon: const Icon(Icons.person_add),
                label: const Text('参加者登録'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(120, 40),
                ),
              ),
              const SizedBox(height: 8),
              ElevatedButton.icon(
                onPressed: () => _reseatAllPlayers(),
                icon: const Icon(Icons.shuffle),
                label: const Text('全員リシート'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.orange,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(120, 40),
                ),
              ),
              const SizedBox(height: 8),
              ElevatedButton.icon(
                onPressed: () => _confirmPrizes(),
                icon: const Icon(Icons.emoji_events),
                label: const Text('プライズ確定'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.purple,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(120, 40),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.tournamentName),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance
            .collection('scheduledTournaments')
            .doc(widget.tournamentId)
            .collection('views')
            .doc('main')
            .snapshots(),
        builder: (context, snapshot) {
          // エラーハンドリング
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(
                    'エラーが発生しました: ${snapshot.error}',
                    style: const TextStyle(color: Colors.red),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          // ローディング状態
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('データを読み込み中...'),
                ],
              ),
            );
          }

          // データがない場合
          if (!snapshot.hasData || !snapshot.data!.exists) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.info_outline, size: 64, color: Colors.blue),
                  const SizedBox(height: 16),
                  const Text(
                    'トーナメントデータが見つかりません',
                    style: TextStyle(color: Colors.blue),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tournament ID: ${widget.tournamentId}',
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            );
          }

          // データ取得成功
          final data = snapshot.data!.data() as Map<String, dynamic>?;
          debugPrint('=== views/main データ取得成功 ===');
          debugPrint('データ: $data');

          return Column(
            children: [
              // メインコンテンツ
              Expanded(
                child: Row(
                  children: [
                    // 左側: 待機者一覧 (30%)
                    Expanded(
                      flex: 3,
                      child: Container(
                        margin: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey[300]!),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          children: [
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.orange[100],
                                borderRadius: const BorderRadius.only(
                                  topLeft: Radius.circular(8),
                                  topRight: Radius.circular(8),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(Icons.hourglass_empty, color: Colors.orange[700]),
                                  const SizedBox(width: 8),
                                  Text(
                                    '待機者一覧',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.orange[700],
                                      fontSize: 16,
                                    ),
                                  ),
                                  const Spacer(),
                                  ElevatedButton.icon(
                                    onPressed: () => _assignSeatToWaiting(),
                                    icon: const Icon(Icons.event_seat, size: 16),
                                    label: const Text('着席', style: TextStyle(fontSize: 12)),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.orange[600],
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      minimumSize: const Size(0, 28),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${_waitingPlayers.length}人',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.orange[700],
                                      fontSize: 18,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Expanded(
                              child: StreamBuilder<DocumentSnapshot>(
                                stream: FirebaseFirestore.instance
                                    .collection('scheduledTournaments')
                                    .doc(widget.tournamentId)
                                    .collection('tablesSeat')
                                    .doc('waiting')
                                    .snapshots(),
                                builder: (context, waitingSnapshot) {
                                  if (waitingSnapshot.hasError) {
                                    return Center(
                                      child: Text(
                                        '待機者データエラー: ${waitingSnapshot.error}',
                                        style: const TextStyle(color: Colors.red),
                                      ),
                                    );
                                  }

                                  if (waitingSnapshot.connectionState == ConnectionState.waiting) {
                                    return const Center(child: CircularProgressIndicator());
                                  }

                                  final waitingData = waitingSnapshot.data?.data() as Map<String, dynamic>?;
                                  final waitingList = waitingData?['waiting'] as Map<String, dynamic>? ?? {};
                                  final waitingCount = waitingList.length;

                                  debugPrint('=== 待機者データ取得成功 ===');
                                  debugPrint('待機者数: $waitingCount');
                                  debugPrint('待機者リスト: $waitingList');

                                  if (waitingCount == 0) {
                                    return const Center(
                                      child: Text(
                                        '待機者がいません',
                                        style: TextStyle(color: Colors.grey),
                                      ),
                                    );
                                  }

                                  // Firestoreから読み込んだデータを使用して待機者リストを表示
                                  if (_isLoadingData) {
                                    return const Center(child: CircularProgressIndicator());
                                  }
                                  
                                  if (_waitingPlayers.isEmpty) {
                                    return const Center(
                                      child: Text(
                                        '待機者がいません',
                                        style: TextStyle(color: Colors.grey),
                                      ),
                                    );
                                  }
                                  
                                  return ListView.builder(
                                    padding: const EdgeInsets.all(8),
                                    itemCount: _waitingPlayers.length,
                                    itemBuilder: (context, index) {
                                      final player = _waitingPlayers[index];
                                      
                                      return Card(
                                        margin: const EdgeInsets.only(bottom: 4),
                                        child: ListTile(
                                          leading: CircleAvatar(
                                            backgroundColor: Colors.orange[100],
                                            child: Text(
                                              '${index + 1}',
                                              style: TextStyle(
                                                color: Colors.orange[700],
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ),
                                          title: Text(player.displayName),
                                          subtitle: Text('待機時間: ${player.waitingMinutes}分'),
                                          trailing: IconButton(
                                            icon: const Icon(Icons.event_seat, color: Colors.green),
                                            onPressed: () => _showAssignSeatDialogForPlayer(player.userId),
                                          ),
                                        ),
                                      );
                                    },
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    
                    // 右側: 卓一覧 (70%)
                    Expanded(
                      flex: 7,
                      child: Container(
                        margin: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey[300]!),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          children: [
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.blue[100],
                                borderRadius: const BorderRadius.only(
                                  topLeft: Radius.circular(8),
                                  topRight: Radius.circular(8),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(Icons.table_restaurant, color: Colors.blue[700]),
                                  const SizedBox(width: 8),
                                  Text(
                                    '卓一覧',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.blue[700],
                                      fontSize: 16,
                                    ),
                                  ),
                                  const Spacer(),
                                  ElevatedButton.icon(
                                    onPressed: () => _addTable(),
                                    icon: const Icon(Icons.add, size: 16),
                                    label: const Text('卓追加', style: TextStyle(fontSize: 12)),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.blue[600],
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      minimumSize: const Size(0, 28),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${data?['seatedCount'] ?? 0}人着席中',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.blue[700],
                                      fontSize: 18,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Expanded(
                              child: StreamBuilder<QuerySnapshot>(
                                stream: FirebaseFirestore.instance
                                    .collection('scheduledTournaments')
                                    .doc(widget.tournamentId)
                                    .collection('tablesSeat')
                                    .snapshots(),
                                builder: (context, tablesSnapshot) {
                                  if (tablesSnapshot.hasError) {
                                    return Center(
                                      child: Text(
                                        '卓データエラー: ${tablesSnapshot.error}',
                                        style: const TextStyle(color: Colors.red),
                                      ),
                                    );
                                  }

                                  if (tablesSnapshot.connectionState == ConnectionState.waiting) {
                                    return const Center(child: CircularProgressIndicator());
                                  }

                                  final allDocs = tablesSnapshot.data?.docs ?? [];
                                  // 'waiting'ドキュメントを除外
                                  final tables = allDocs.where((doc) => doc.id != 'waiting').toList();
                                  debugPrint('=== 卓データ取得成功 ===');
                                  debugPrint('全ドキュメント数: ${allDocs.length}');
                                  debugPrint('卓数: ${tables.length}');

                                  if (tables.isEmpty) {
                                    return const Center(
                                      child: Text(
                                        '卓がありません',
                                        style: TextStyle(color: Colors.grey),
                                      ),
                                    );
                                  }

                                  return GridView.builder(
                                    padding: const EdgeInsets.all(8),
                                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: 3,
                                      childAspectRatio: 1.2,
                                      crossAxisSpacing: 8,
                                      mainAxisSpacing: 8,
                                    ),
                                    itemCount: tables.length,
                                    itemBuilder: (context, index) {
                                      final tableDoc = tables[index];
                                      final tableId = tableDoc.id;
                                      final tableData = tableDoc.data() as Map<String, dynamic>?;
                                      final seats = tableData?['seats'] as Map<String, dynamic>? ?? {};
                                      // seatXXUserIdフィールドの数をカウント
                                      final userIdFields = seats.keys.where((key) => key.endsWith('UserId')).length;
                                      // nullでないseatXXUserIdフィールドの数をカウント
                                      final occupiedSeats = seats.entries
                                          .where((entry) => entry.key.endsWith('UserId') && entry.value != null)
                                          .length;
                                      final totalSeats = userIdFields;
                                      final isOccupied = occupiedSeats > 0;

                                      return Card(
                                        child: InkWell(
                                          onTap: () => _showTableDetail(tableId),
                                          child: Column(
                                            mainAxisAlignment: MainAxisAlignment.center,
                                            children: [
                                              Icon(
                                                isOccupied ? Icons.table_restaurant : Icons.table_bar,
                                                color: isOccupied ? Colors.blue : Colors.grey,
                                                size: 32,
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                tableId,
                                                style: TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  color: isOccupied ? Colors.blue : Colors.grey,
                                                ),
                                              ),
                                              Text(
                                                '$occupiedSeats/$totalSeats',
                                                style: TextStyle(
                                                  fontSize: 12,
                                                  color: isOccupied ? Colors.blue : Colors.grey,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      );
                                    },
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              
              // 下部: アクションバー
              _buildBottomActionBar(),
            ],
          );
        },
      ),
    );
  }
}