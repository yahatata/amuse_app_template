import 'dart:math' as Math;
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/sideGame/services/side_game_table_mutation_service.dart';
import 'package:amuse_app_template/sideGame/side_game_user_facing_errors.dart';
import 'package:amuse_app_template/user_actions/user_action_home.dart';
import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';
import 'package:intl/intl.dart';

class SideGameTableHomePage extends StatefulWidget {
  final String tableId;
  final String gameName;
  final Widget? drawer;
  final bool disableBackNavigation;
  final bool automaticallyImplyLeading;
  final bool allowGameNameChange;
  final bool showEndGameButton;
  final VoidCallback? onGameEnded;

  const SideGameTableHomePage({
    super.key,
    required this.tableId,
    required this.gameName,
    this.drawer,
    this.disableBackNavigation = false,
    this.automaticallyImplyLeading = true,
    this.allowGameNameChange = true,
    this.showEndGameButton = true,
    this.onGameEnded,
  });

  @override
  State<SideGameTableHomePage> createState() => _SideGameTableHomePageState();
}

class _SideGameTableHomePageState extends State<SideGameTableHomePage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final SideGameTableMutationService _mutationService =
      SideGameTableMutationService();
  String _currentGameName = '';
  bool _isEndingGame = false;
  bool _isUpdatingGameName = false;
  int _tableStreamReloadToken = 0;

  @override
  void initState() {
    super.initState();
    _currentGameName = widget.gameName;
  }

  void _retryTableStream() {
    setState(() {
      _tableStreamReloadToken++;
    });
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
    final scaffold = Scaffold(
      drawer: widget.drawer,
      appBar: AppBar(
        automaticallyImplyLeading: widget.automaticallyImplyLeading,
        leading: widget.drawer != null
            ? Builder(
                builder: (context) => IconButton(
                  icon: const Icon(Icons.menu),
                  onPressed: () => Scaffold.of(context).openDrawer(),
                ),
              )
            : null,
        title: Text(widget.tableId),
        centerTitle: true,
        backgroundColor: Colors.grey,
        foregroundColor: Colors.white,
        actions: [
          _buildStoreStatusAction(context),
          // ゲーム名表示と変更ボタン
          if (widget.allowGameNameChange)
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
              if (_isUpdatingGameName || _isEndingGame) return;
              if (gameName == _currentGameName) return;
              final previousName = _currentGameName;
              setState(() {
                _currentGameName = gameName;
              });
              _updateGameName(gameName, previousName: previousName);
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
        key: ValueKey('side-game-table-$_tableStreamReloadToken'),
        stream: _firestore.collection('sideGame').doc(widget.tableId).snapshots(),
        builder: (context, snapshot) {
          final hasUsableData =
              snapshot.hasData && snapshot.data != null && snapshot.data!.exists;

          if (snapshot.hasError && !hasUsableData) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, size: 64, color: Colors.red),
                    const SizedBox(height: 16),
                    Text(
                      sideGameTableStreamErrorMessage(snapshot.error),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _retryTableStream,
                      child: const Text('再試行'),
                    ),
                  ],
                ),
              ),
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting &&
              !hasUsableData) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!hasUsableData) {
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
                ],
              ),
            );
          }

          final data = snapshot.data!.data() as Map<String, dynamic>;
          final maxSeats = data['maxSeats'] as int? ?? 6;
          final seats = data['seats'] as Map<String, dynamic>? ?? {};

          return Column(
            children: [
              if (snapshot.hasError)
                Material(
                  color: Colors.red.shade50,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.warning_amber_rounded,
                            color: Colors.red),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            kSideGameTableRealtimeFailedMessage,
                            style: TextStyle(color: Colors.red.shade800),
                          ),
                        ),
                        TextButton(
                          onPressed: _retryTableStream,
                          child: const Text('再試行'),
                        ),
                      ],
                    ),
                  ),
                ),
              // テーブル表示
              Expanded(
                child: _buildTableDisplay(maxSeats, seats),
              ),
              
              if (widget.showEndGameButton)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Align(
                    alignment: Alignment.bottomRight,
                    child: ElevatedButton.icon(
                      onPressed: (_isEndingGame || _isUpdatingGameName)
                          ? null
                          : _showEndGameDialog,
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

    if (widget.disableBackNavigation) {
      return PopScope(
        canPop: false,
        child: _wrapWithMutationLoading(scaffold),
      );
    }

    return _wrapWithMutationLoading(scaffold);
  }

  Widget _wrapWithMutationLoading(Widget child) {
    final isLocked = _isEndingGame || _isUpdatingGameName;
    return Stack(
      children: [
        child,
        if (isLocked)
          Positioned.fill(
            child: AbsorbPointer(
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.35),
                child: const Center(child: CircularProgressIndicator()),
              ),
            ),
          ),
      ],
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
            content: Text(kSideGameBillMissingMessage),
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
    if (_isEndingGame || _isUpdatingGameName) return;
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
    if (_isEndingGame) return;
    setState(() {
      _isEndingGame = true;
    });

    try {
      await _mutationService.endSideGameSession(tableId: widget.tableId);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('ゲームを終了しました'),
            backgroundColor: Colors.green,
          ),
        );
        if (widget.onGameEnded != null) {
          widget.onGameEnded!.call();
        } else {
          Navigator.of(context).pop();
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapSideGameCallableError(e, operation: 'endSideGameSession'),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isEndingGame = false;
        });
      }
    }
  }

  Future<void> _updateGameName(
    String gameName, {
    required String previousName,
  }) async {
    if (_isUpdatingGameName) return;
    setState(() {
      _isUpdatingGameName = true;
    });

    try {
      await _mutationService.changeSideGameTableGameName(
        tableId: widget.tableId,
        gameName: gameName,
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _currentGameName = previousName;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapSideGameCallableError(
                e,
                operation: 'changeSideGameTableGameName',
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUpdatingGameName = false;
        });
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
  String? _selectedUserId;
  bool _isRegistering = false;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_isRegistering,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: AlertDialog(
                title: Text('座席${widget.seatNumber} 参加者登録'),
                content: SizedBox(
                  width: double.maxFinite,
                  height: 400,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        '登録する参加者を選択してください',
                        style: TextStyle(fontSize: 16),
                      ),
                      const SizedBox(height: 16),
                      Expanded(
                        child: StreamBuilder<QuerySnapshot>(
                          stream: ActiveStaysService.instance.stream,
                          builder: (context, snapshot) {
                            final hasData = snapshot.hasData;

                            if (snapshot.hasError && !hasData) {
                              return Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Text(
                                    sideGameParticipantsStreamErrorMessage(
                                      snapshot.error,
                                    ),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(color: Colors.red),
                                  ),
                                ),
                              );
                            }

                            if (snapshot.connectionState ==
                                    ConnectionState.waiting &&
                                !hasData) {
                              return const Center(
                                child: CircularProgressIndicator(),
                              );
                            }

                            if (snapshot.hasError && hasData) {
                              return Column(
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Text(
                                      sideGameParticipantsStreamErrorMessage(
                                        snapshot.error,
                                      ),
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        color: Colors.red,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ),
                                  Expanded(
                                    child: _buildParticipantsList(
                                      snapshot.data!.docs,
                                    ),
                                  ),
                                ],
                              );
                            }

                            return _buildParticipantsList(
                              snapshot.data?.docs ?? [],
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: _isRegistering
                        ? null
                        : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  ElevatedButton(
                    onPressed: _isRegistering || _selectedUserId == null
                        ? null
                        : _registerParticipant,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green[700],
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('登録'),
                  ),
                ],
              ),
            ),
            if (_isRegistering)
              Positioned.fill(
                child: AbsorbPointer(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.35),
                    child: const Center(
                      child: CircularProgressIndicator(),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildParticipantsList(List<QueryDocumentSnapshot> activeStays) {
    final availableParticipants = <Map<String, dynamic>>[];

    for (final doc in activeStays) {
      final data = doc.data() as Map<String, dynamic>?;
      if (data == null) continue;

      final uid = doc.id;
      final pokerName = data['pokerName'] as String?;

      if (pokerName != null && uid.isNotEmpty) {
        availableParticipants.add({
          'userId': uid,
          'pokerName': pokerName,
        });
      }
    }

    if (availableParticipants.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.people_outline,
              color: Colors.grey,
              size: 48,
            ),
            const SizedBox(height: 16),
            Text(
              '利用可能な参加者がいません',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      itemCount: availableParticipants.length,
      itemBuilder: (context, index) {
        final participant = availableParticipants[index];
        final userId = participant['userId'] as String;
        final pokerName = participant['pokerName'] as String;
        final isSelected = _selectedUserId == userId;

        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: CheckboxListTile(
            value: isSelected,
            onChanged: _isRegistering
                ? null
                : (bool? value) {
                    setState(() {
                      if (value == true) {
                        _selectedUserId = userId;
                      } else if (_selectedUserId == userId) {
                        _selectedUserId = null;
                      }
                    });
                  },
            title: Text(
              pokerName,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: isSelected ? Colors.green[700] : null,
              ),
            ),
            secondary: Icon(
              Icons.person,
              color: isSelected ? Colors.green[700] : Colors.grey,
            ),
            activeColor: Colors.green[700],
          ),
        );
      },
    );
  }

  Future<void> _registerParticipant() async {
    if (_selectedUserId == null || _isRegistering) return;

    setState(() {
      _isRegistering = true;
    });

    try {
      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('registerForSideGame');

      final result = await callable.call({
        'tableId': widget.tableId,
        'seatNumber': widget.seatNumber,
        'userId': _selectedUserId,
      });

      if (!mounted) return;

      if (!isCallableSuccessResponse(result.data)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapSideGameSoftFailMessage(
                result.data,
                operation: 'registerForSideGame',
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      final raw = result.data;
      String pokerName = '参加者';
      if (raw is Map) {
        final data = raw['data'];
        if (data is Map && data['pokerName'] is String) {
          final name = data['pokerName'] as String;
          if (name.isNotEmpty) pokerName = name;
        }
      }

      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$pokerNameさんを座席${widget.seatNumber}に登録しました',
          ),
          backgroundColor: Colors.green,
        ),
      );
      widget.onParticipantRegistered();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapSideGameCallableError(e, operation: 'registerForSideGame'),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isRegistering = false;
        });
      }
    }
  }
}
