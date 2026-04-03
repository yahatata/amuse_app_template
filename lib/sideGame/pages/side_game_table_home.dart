import 'dart:math' as Math;
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user_actions/user_action_home.dart';
import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';
import 'package:intl/intl.dart';

class SideGameTableHomePage extends StatefulWidget {
  final String tableId;
  final String gameName;

  const SideGameTableHomePage({
    super.key,
    required this.tableId,
    required this.gameName,
  });

  @override
  State<SideGameTableHomePage> createState() => _SideGameTableHomePageState();
}

class _SideGameTableHomePageState extends State<SideGameTableHomePage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  String _currentGameName = '';

  @override
  void initState() {
    super.initState();
    _currentGameName = widget.gameName;
  }

  /// AppBar用: storeMeta の営業状態を表示（Phase6 Step1、グレーAppBar用に白表示）
  Widget _buildStoreStatusAction(BuildContext context) {
    const textColor = Colors.white;
    return StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: textColor),
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
                            Text(formatted, style: const TextStyle(fontSize: 14, color: textColor)),
                          ],
                        )
                      : Text(formatted, style: const TextStyle(fontSize: 14, color: textColor)),
                ),
              );
            } catch (_) {}
          }
        }
        if (data.isClosed) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Center(
              child: Text('閉店中', style: TextStyle(fontSize: 14, color: textColor)),
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
        title: Text(widget.tableId),
        centerTitle: true,
        backgroundColor: Colors.grey,
        foregroundColor: Colors.white,
        actions: [
          _buildStoreStatusAction(context),
          // ゲーム名表示と変更ボタン
          PopupMenuButton<String>(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withOpacity(0.3)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _currentGameName,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.arrow_drop_down, 
                    color: Colors.white,
                    size: 20,
                  ),
                ],
              ),
            ),
            onSelected: (String gameName) {
              setState(() {
                _currentGameName = gameName;
              });
              _updateGameName(gameName);
            },
            itemBuilder: (BuildContext context) {
              return (StoreConfigService.instance.latestData?.sideGameTypes ?? kDefaultSideGameTypes).map((String gameName) {
                return PopupMenuItem<String>(
                  value: gameName,
                  child: Text(gameName),
                );
              }).toList();
            },
          ),
        ],
      ),
      body: StreamBuilder<DocumentSnapshot>(
        stream: _firestore.collection('sideGame').doc(widget.tableId).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  const Text(
                    'エラーが発生しました',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text('エラー: ${snapshot.error}'),
                  const SizedBox(height: 8),
                  Text('テーブルID: ${widget.tableId}'),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      _createSideGameDocument();
                    },
                    child: const Text('ドキュメントを作成'),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: () {
                      _debugSideGame();
                    },
                    child: const Text('デバッグ実行'),
                  ),
                ],
              ),
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || !snapshot.data!.exists) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.table_chart, size: 64, color: Colors.grey),
                  const SizedBox(height: 16),
                  const Text(
                    'テーブルデータが見つかりません',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text('テーブルID: ${widget.tableId}'),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      _createSideGameDocument();
                    },
                    child: const Text('ドキュメントを作成'),
                  ),
                ],
              ),
            );
          }

          final data = snapshot.data!.data() as Map<String, dynamic>;
          final maxSeats = data['maxSeats'] as int? ?? 6;
          final seats = data['seats'] as Map<String, dynamic>? ?? {};

          return Column(
            children: [
              // テーブル表示
              Expanded(
                child: _buildTableDisplay(maxSeats, seats),
              ),
              
              // 終了処理ボタン
              Padding(
                padding: const EdgeInsets.all(16),
                child: Align(
                  alignment: Alignment.bottomRight,
                  child: ElevatedButton.icon(
                    onPressed: _showEndGameDialog,
                    icon: const Icon(Icons.stop),
                    label: const Text('終了処理'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildTableDisplay(int maxSeats, Map<String, dynamic> seats) {
    return Container(
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
                      // ゲーム名称（テーブル内中央上部）
                      Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              _currentGameName,
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'SIDE GAME',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Colors.white70,
                              ),
                            ),
                          ],
                        ),
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
                            child: const Center(
                              child: Text(
                                'DEALER',
                                style: TextStyle(
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
    );
  }

  List<Widget> _buildSeatPositions(Map<String, dynamic> seats, int maxSeats) {
    final widgets = <Widget>[];
    
    // テーブルの中心位置を画面中央に設定
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;
    final tableCenterX = screenWidth * 0.5; // 画面中央
    final tableCenterY = screenHeight * 0.5; // 画面中央
    
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
      
      // 楕円の配置（画面サイズに応じた楕円周上に配置）
      final ellipseWidth = MediaQuery.of(context).size.width * 0.64; // 画面幅の64%
      final ellipseHeight = MediaQuery.of(context).size.width * 0.44; // 画面幅の44%（3:2の比率）
      final a = ellipseWidth / 2; // 楕円の横半径
      final b = ellipseHeight / 2; // 楕円の縦半径
      
      final x = tableCenterX - a * Math.cos(angle); // 左右反転
      final y = tableCenterY - b * Math.sin(angle); // 上下反転
      
      widgets.add(
        Positioned(
          left: x - 60, // 120pxの座席サイズの半分
          top: y - 100,  // 60pxの座席サイズの半分
          child: _buildSeatWidget(
            seatNumber: i,
            userId: userId,
            pokerName: pokerName,
            isOccupied: isOccupied,
          ),
        ),
      );
    }
    
    return widgets;
  }

  Widget _buildSeatWidget({
    required int seatNumber,
    required String? userId,
    required String? pokerName,
    required bool isOccupied,
  }) {
    return GestureDetector(
      onTap: () => _handleSeatTap(seatNumber, userId, pokerName),
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
              : Text(
                  seatNumber.toString(),
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.grey.shade600,
                  ),
                ),
        ),
      ),
    );
  }

  void _handleSeatTap(int seatNumber, String? userId, String? pokerName) {
    if (userId != null && userId.isNotEmpty) {
      // 着席済みの場合はユーザーアクションポップを表示
      _showUserActionPop(seatNumber, userId, pokerName ?? '');
    } else {
      // 空席の場合は参加者登録ダイアログを表示
      _showParticipantRegistrationDialog(seatNumber);
    }
  }

  void _showUserActionPop(int seatNumber, String userId, String pokerName) async {
    // activeStaysからbillIdを取得
    String? billId;
    try {
      final activeStayDoc = await _firestore.collection('activeStays').doc(userId).get();
      if (activeStayDoc.exists) {
        final data = activeStayDoc.data();
        billId = data?['billId'] as String?;
      }
    } catch (e) {
      print('activeStaysからのbillId取得に失敗: $e');
    }

    if (billId == null || billId.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('伝票IDが見つかりません'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    showUserActionHome(
      context: context,
      sourcePage: 'sideGameTableHome',
      user: {
        'userId': userId,
        'pokerName': pokerName,
        'billId': billId, // billIdを追加
        'tableId': widget.tableId,
        'seatNumber': seatNumber,
      },
    );
  }

  void _showParticipantRegistrationDialog(int seatNumber) {
    showDialog(
      context: context,
      builder: (context) => _ParticipantRegistrationDialog(
        tableId: widget.tableId,
        seatNumber: seatNumber,
        onParticipantRegistered: () {
          // 参加者が登録された時の処理（自動的にStreamBuilderで更新される）
        },
      ),
    );
  }

  void _showEndGameDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('ゲーム終了'),
        content: const Text('サイドゲームを終了しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              _endGame();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('終了'),
          ),
        ],
      ),
    );
  }

  Future<void> _endGame() async {
    try {
      // sideGameコレクションの座席を全てnullに設定（seatsマップ内）
      final seatsUpdate = <String, dynamic>{};
      for (int i = 1; i <= 10; i++) { // 最大10席まで対応
        final seatNumber = i.toString().padLeft(2, '0');
        seatsUpdate['seats.seat${seatNumber}UserId'] = null;
        seatsUpdate['seats.seat${seatNumber}PokerName'] = null;
      }

      await _firestore.collection('sideGame').doc(widget.tableId).update({
        ...seatsUpdate,
        'active': false,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      // tablesコレクションのstatusを'open'に変更
      await _firestore.collection('tables').doc(widget.tableId).update({
        'status': 'open',
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('ゲームを終了しました'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('終了処理に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _updateGameName(String gameName) async {
    try {
      await _firestore.collection('sideGame').doc(widget.tableId).update({
        'gameName': gameName,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('ゲーム名の更新に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// sideGameドキュメントを手動作成するメソッド
  Future<void> _createSideGameDocument() async {
    try {
      // テーブル情報を取得
      final tableDoc = await _firestore.collection('tables').doc(widget.tableId).get();
      if (!tableDoc.exists) {
        throw Exception('テーブル ${widget.tableId} が見つかりません');
      }
      
      final tableData = tableDoc.data()!;
      final maxSeats = tableData['maxSeats'] as int? ?? 6;
      
      // 座席情報を生成
      final seats = <String, dynamic>{};
      for (int i = 1; i <= maxSeats; i++) {
        final seatNumber = i.toString().padLeft(2, '0');
        seats['seat${seatNumber}UserId'] = null;
        seats['seat${seatNumber}PokerName'] = null;
      }
      
      // sideGameドキュメントを作成
      await _firestore.collection('sideGame').doc(widget.tableId).set({
        'tableId': widget.tableId,
        'name': widget.tableId,
        'maxSeats': maxSeats,
        'seats': seats,
        'active': false,
        'isEnabled': true,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('sideGameドキュメントを作成しました'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('ドキュメント作成に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// デバッグ用Cloud Functionを呼び出すメソッド
  Future<void> _debugSideGame() async {
    try {
      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('debugSideGame');
      
      final result = await callable.call({
        'tableId': widget.tableId,
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('デバッグ完了: ${result.data['message']}'),
            backgroundColor: Colors.blue,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('デバッグ実行に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}

class _ParticipantRegistrationDialog extends StatefulWidget {
  final String tableId;
  final int seatNumber;
  final VoidCallback onParticipantRegistered;

  const _ParticipantRegistrationDialog({
    required this.tableId,
    required this.seatNumber,
    required this.onParticipantRegistered,
  });

  @override
  State<_ParticipantRegistrationDialog> createState() => _ParticipantRegistrationDialogState();
}

class _ParticipantRegistrationDialogState extends State<_ParticipantRegistrationDialog> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  String? _selectedUserId;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('座席${widget.seatNumber} 参加者登録'),
      content: SizedBox(
        width: double.maxFinite,
        height: 400,
        child: StreamBuilder<QuerySnapshot>(
          stream: ActiveStaysService.instance.stream,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(
                child: Text(
                  '参加者リストの読み込みに失敗しました: ${snapshot.error}',
                  style: const TextStyle(color: Colors.red),
                ),
              );
            }

            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

            final activeStays = snapshot.data?.docs ?? [];
            final availableParticipants = <Map<String, dynamic>>[];

            for (final doc in activeStays) {
              final data = doc.data() as Map<String, dynamic>?;
              if (data == null) continue;

              final uid = doc.id; // activeStays のドキュメントID = uid
              final pokerName = data['pokerName'] as String?;

              if (pokerName != null && uid.isNotEmpty) {
                availableParticipants.add({
                  'userId': uid,
                  'pokerName': pokerName,
                });
              }
            }

            if (availableParticipants.isEmpty) {
              return const Center(
                child: Text('利用可能な参加者がいません'),
              );
            }

            return ListView.builder(
              itemCount: availableParticipants.length,
              itemBuilder: (context, index) {
                final participant = availableParticipants[index];
                final isSelected = _selectedUserId == participant['userId'];

                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: isSelected ? Colors.blue : Colors.grey,
                    child: Text(
                      participant['pokerName'].toString().substring(0, 1).toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  title: Text(participant['pokerName']),
                  subtitle: Text('ID: ${participant['userId']}'),
                  selected: isSelected,
                  onTap: () {
                    setState(() {
                      _selectedUserId = participant['userId'];
                    });
                  },
                );
              },
            );
          },
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: _selectedUserId != null ? _registerParticipant : null,
          child: const Text('登録'),
        ),
      ],
    );
  }

  Future<void> _registerParticipant() async {
    if (_selectedUserId == null) return;

    // 処理中ダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(width: 16),
            const Text('登録処理中...'),
          ],
        ),
      ),
    );

    try {
      print('=== 参加登録開始 ===');
      print('tableId: ${widget.tableId}');
      print('seatNumber: ${widget.seatNumber}');
      print('userId: $_selectedUserId');

      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('registerForSideGame');
      
      final result = await callable.call({
        'tableId': widget.tableId,
        'seatNumber': widget.seatNumber,
        'userId': _selectedUserId,
      });

      print('=== 参加登録結果 ===');
      print('success: ${result.data['success']}');
      print('message: ${result.data['message']}');
      print('data: ${result.data['data']}');

      // 処理中ダイアログを閉じる
      if (mounted) {
        Navigator.of(context).pop();
      }

      if (mounted) {
        // 参加登録ダイアログを閉じる
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${result.data['data']['pokerName']}さんを座席${widget.seatNumber}に登録しました'),
            backgroundColor: Colors.green,
          ),
        );
        widget.onParticipantRegistered();
      }
    } catch (e) {
      print('=== 参加登録エラー ===');
      print('エラー: $e');
      print('エラータイプ: ${e.runtimeType}');
      
      // 処理中ダイアログを閉じる
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('登録に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}