import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';
import 'package:amuse_app_template/utils/store_strong_warning_ui.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/add_table_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/remove_table_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/assign_seat_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/reseat_all_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/register_participants_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_list_dialog.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_register_dialog.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_end_okibake_guard.dart';
import 'package:amuse_app_template/tournament/active/widgets/okibake_waiting_list_tile.dart';
import 'package:amuse_app_template/tournament/active/widgets/regular_waiting_list_tile.dart';
import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/models/scheduled_tournament_seat_map.dart';
import 'package:amuse_app_template/tournament/active/models/okibake_temporary_entry.dart';
import 'package:amuse_app_template/tournament/active/services/tournament_data_service.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/ActionHistory/tournamentActionsHistoryPage.dart';
import 'table_detail_page.dart';
import 'prize_setup_page.dart';
import 'ranking_setup_page.dart';
import 'blind_timer_page.dart';

class TournamentHomePage extends StatefulWidget {
  final String tournamentId;
  final String tournamentName;

  /// 閉店前確認から開いたときなど、強警告ゲートを出さない。
  final bool suppressStoreStrongWarning;

  const TournamentHomePage({
    super.key,
    required this.tournamentId,
    required this.tournamentName,
    this.suppressStoreStrongWarning = false,
  });

  @override
  State<TournamentHomePage> createState() => _TournamentHomePageState();
}

class _TournamentHomePageState extends State<TournamentHomePage> {
  // サービスインスタンス
  final TournamentDataService _dataService = TournamentDataService();
  final TournamentService _service = TournamentServiceImpl();
  
  // データ状態
  List<TournamentTable> _tournamentTables = [];
  List<WaitingPlayer> _waitingPlayers = [];
  List<TournamentUser> _tournamentUsers = [];
  bool _isLoadingData = true;
  
  // デバッグ用のログ出力
  @override
  void initState() {
    super.initState();
    debugPrint('=== TournamentHomePage 初期化 ===');
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
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AssignSeatDialog(
          tournamentId: widget.tournamentId,
          onSeatAssigned: () {
            // 着席後の処理
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('着席操作が完了しました')),
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
      barrierDismissible: false,
      builder: (BuildContext context) {
        return AssignSeatDialog(
          tournamentId: widget.tournamentId,
          preselectedUserId: userId, // 事前選択されたユーザーID
          onSeatAssigned: () {
            // 着席後の処理
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('着席操作が完了しました')),
            );
            // データを再読み込み
            _loadTournamentData();
          },
          service: _service,
        );
      },
    );
  }

  void _offerAssignSeat(WaitingPlayer player) {
    _showAssignSeatDialogForPlayer(player.userId);
  }

  void _showOkibakeRegisterDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return OkibakeRegisterDialog(
          tournamentId: widget.tournamentId,
          service: _service,
          onRegistered: _loadTournamentData,
        );
      },
    );
  }

  /// Phase 4 補完: トーナメント操作タブ「置きバケ一覧」（§12.8）。
  /// 主目的は busted + unlinked の伝票紐付け導線。
  /// registered の席配置は一覧側からは行わず、ダイアログを閉じた上で
  /// 既存の `AssignSeatDialog` を `okibakeTemporary:{id}` で開く。
  void _showOkibakeListDialog() {
    showOkibakeListDialog(
      context: context,
      tournamentId: widget.tournamentId,
      service: _service,
      onRequestAssignSeat: (okibakeEntryId, _) {
        _showAssignSeatDialogForPlayer('okibakeTemporary:$okibakeEntryId');
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
      barrierDismissible: false,
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

  void _removeTable() {
    _showRemoveTableDialog();
  }
  
  /// 卓削除ダイアログを表示
  void _showRemoveTableDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return RemoveTableDialog(
          tournamentId: widget.tournamentId,
          onTableRemoved: () {
            // テーブル削除後の処理
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('卓が削除されました')),
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
      barrierDismissible: false,
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
      barrierDismissible: false,
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

  void _confirmPrizes() async {
    // 遷移前にstatusをチェック
    try {
      final tournamentDoc = await FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .get();
      
      if (!tournamentDoc.exists) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('トーナメントデータが見つかりません')),
        );
        return;
      }
      
      final tournamentData = tournamentDoc.data();
      final status = tournamentData?['status'] ?? '';
      
      if (status == 'ended' || status == 'force_ended') {
        // 既に終了済み
        await showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('エラー'),
            content: const Text(
              'すでに終了済みのためプライズを変更できません。\n'
              '付与するポイントを修正する場合は該当のuser情報を直接修正してください',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
        return;
      } else if (status == 'scheduled' || status == 'running') {
        // レジスト前または実行中の確認
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('確認'),
            content: const Text('レジスト前ですがプライズを確定してよろしいですか？'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('キャンセル'),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('確認'),
              ),
            ],
          ),
        );
        
        if (confirmed != true) {
          return;
        }
      }
      // status == 'registered' の場合はそのまま遷移
      
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => PrizeSetupPage(
            tournamentId: widget.tournamentId,
          ),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('エラーが発生しました: $e')),
      );
    }
  }

  void _confirmRankings() async {
    try {
      // プライズプールの存在確認
      final mainViewDoc = await FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('views')
          .doc('main')
          .get();
      
      if (!mainViewDoc.exists) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('トーナメントデータが見つかりません')),
        );
        return;
      }
      
      final mainViewData = Map<String, dynamic>.from(mainViewDoc.data()!);
      final prizePool = mainViewData['prizePool'];
      
      if (prizePool == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('プライズの確定が行われていないため、先にプライズ確定を行ってください')),
        );
        return;
      }
      
      // 順位確定画面に遷移
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => RankingSetupPage(
            tournamentId: widget.tournamentId,
          ),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('エラーが発生しました: $e')),
      );
    }
  }

  bool _isEndingTournament = false;

  Future<bool> _showLinkedUserRequiredDialog(
    List<BlockingOkibakeEntry> blockingEntries,
  ) {
    return TournamentEndOkibakeGuard.showLinkedUserRequiredDialog(
      context: context,
      tournamentId: widget.tournamentId,
      service: _service,
      blockingEntries: blockingEntries,
      onLinkedUserUpdated: _loadTournamentData,
    );
  }

  List<BlockingOkibakeEntry> _parseBlockingOkibakeEntries(dynamic raw) {
    return TournamentEndOkibakeGuard.parseBlockingOkibakeEntries(raw);
  }

  void _endTournament() async {
    // 二重押下防止
    if (_isEndingTournament) return;
    
    // 検証処理を実行
    await _validateAndEndTournament();
  }

  Future<void> _validateAndEndTournament() async {
    setState(() {
      _isEndingTournament = true;
    });
    bool progressDialogOpen = false;

    try {
      bool isForceEnd = false;
      String? forceReason;

      final functions = FunctionsClient.instance;
      final validateCallable = functions.httpsCallable('validateEndTournament');
      while (true) {
        // 検証ダイアログを表示（画面中央）
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (context) => const Center(
            child: CircularProgressIndicator(),
          ),
        );
        progressDialogOpen = true;

        // 1. 終了前検証
        final validateResult = await validateCallable.call({
          'tournamentId': widget.tournamentId,
        });
        if (progressDialogOpen && mounted) {
          Navigator.of(context, rootNavigator: true).pop();
          progressDialogOpen = false;
        }

        if (validateResult.data['success'] != true) {
        final errorKey = validateResult.data['errorKey'] as String?;
        if (errorKey == 'TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED') {
          final blockingEntries = _parseBlockingOkibakeEntries(
            validateResult.data['blockingOkibakeEntries'],
          );
          final resolvedAll = await _showLinkedUserRequiredDialog(blockingEntries);
          if (resolvedAll) {
            continue;
          }
          return;
        }
        final errorType = validateResult.data['errorType'];
        final message = validateResult.data['message'] ?? '検証に失敗しました';
        
        if (errorType == 'ended') {
          // 既に終了済み
          await showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('エラー'),
              content: Text(message),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
          return;
        } else if (errorType == 'not_registered') {
          // レジスト前の確認
          final shouldForceEnd = await _showNotRegisteredDialog(message, validateResult.data['status']);
          if (!shouldForceEnd) {
            return;
          }
          final confirmed = await _showForceEndConfirmationDialog(
            'レジスト前のトーナメントの終了処理を行って問題ないでしょうか？',
          );
          if (!confirmed) {
            return;
          }
          isForceEnd = true;
          forceReason = 'not_registered';
          break;
        } else if (errorType == 'no_prize') {
          final action = await _showNoPrizeDialog();
          if (action == 'cancel') {
            return;
          } else if (action == 'prize') {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => PrizeSetupPage(
                  tournamentId: widget.tournamentId,
                ),
              ),
            );
            return;
          }
          final confirmed = await _showForceEndConfirmationDialog(
            'プライズ未確定のトーナメントの強制終了処理を実行しますか？',
          );
          if (!confirmed) {
            return;
          }
          isForceEnd = true;
          forceReason = 'no_prize';
          break;
        } else if (errorType == 'no_ranking') {
          final rankingData = validateResult.data['rankingData'];
          final action = await _showNoRankingDialog(rankingData);
          if (action == 'cancel') {
            return;
          } else if (action == 'ranking') {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => RankingSetupPage(
                  tournamentId: widget.tournamentId,
                ),
              ),
            );
            return;
          }
          final confirmed = await _showForceEndConfirmationDialog(
            '順位未確定のトーナメントの強制終了処理を実行しますか？',
          );
          if (!confirmed) {
            return;
          }
          isForceEnd = true;
          forceReason = 'no_ranking';
          break;
        } else {
          await showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('エラー'),
              content: Text(message),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
          return;
        }
        } else {
        // 検証成功 - 順位情報を表示して最終確認（通常終了）
        final rankingData = validateResult.data['rankingData'];
        final confirmed = await _showFinalConfirmationDialog(rankingData);
        if (!confirmed) {
          return;
        }
          break;
        }
      }
      
      // 処理中ダイアログを表示（画面中央）
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: CircularProgressIndicator(),
        ),
      );
      progressDialogOpen = true;
      
      final endCallable = functions.httpsCallable('endTournament');
      final endParams = <String, dynamic>{
        'tournamentId': widget.tournamentId,
        'endType': isForceEnd ? 'force' : 'normal',
      };
      if (isForceEnd && forceReason != null) {
        endParams['forceReason'] = forceReason;
      }
      final endResult = await endCallable.call(endParams);
      if (progressDialogOpen && mounted) {
        Navigator.of(context, rootNavigator: true).pop();
        progressDialogOpen = false;
      }
      
      if (endResult.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('トーナメントを終了しました')),
        );
        Navigator.of(context).pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(endResult.data['error'] ?? '終了処理に失敗しました')),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      if (progressDialogOpen && mounted) {
        Navigator.of(context, rootNavigator: true).pop();
        progressDialogOpen = false;
      }
      final details = e.details;
      final detailsMap = details is Map ? Map<String, dynamic>.from(details) : null;
      final errorKey = detailsMap?['errorKey'] as String?;
      if (errorKey == 'TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED') {
        final blockingEntries = _parseBlockingOkibakeEntries(
          detailsMap?['blockingOkibakeEntries'],
        );
        final resolvedAll = await _showLinkedUserRequiredDialog(blockingEntries);
        if (resolvedAll && mounted) {
          await _validateAndEndTournament();
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('エラーが発生しました: ${e.message ?? e.code}')),
        );
      }
    } catch (e) {
      if (progressDialogOpen && mounted) {
        Navigator.of(context, rootNavigator: true).pop();
        progressDialogOpen = false;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('エラーが発生しました: $e')),
      );
    } finally {
      setState(() {
        _isEndingTournament = false;
      });
    }
  }

  Future<bool> _showNotRegisteredDialog(String message, String status) async {
    return await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('確認'),
        content: Text('$message\n\n強制終了しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('強制終了'),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
          ),
        ],
      ),
    ) ?? false;
  }

  Future<bool> _showForceEndConfirmationDialog(String message) async {
    return await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('最終確認'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('確認'),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
          ),
        ],
      ),
    ) ?? false;
  }

  Future<String> _showNoPrizeDialog() async {
    return await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('プライズ未確定'),
        content: const Text('プライズの確定が行われていない状態です。\nプライズの確定を行ってください'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop('cancel'),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop('prize'),
            child: const Text('プライズ確定画面へ'),
            style: TextButton.styleFrom(foregroundColor: Colors.purple),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop('force_end'),
            child: const Text('強制終了'),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
          ),
        ],
      ),
    ) ?? 'cancel';
  }

  Future<String> _showNoRankingDialog(dynamic rankingData) async {
    final pointType = rankingData?['pointType'] ?? 'pointA';
    final existingRankings = rankingData?['existingRankings'] ?? [];
    final missingRanks = rankingData?['missingRanks'] ?? [];
    
    String content = '順位情報が未確定です。\n\n';
    
    if (existingRankings.isNotEmpty) {
      content += '確定済み順位:\n';
      for (final ranking in existingRankings) {
        final playerName = ranking['playerName'] ?? '（未設定）';
        content += '${ranking['rank']}位: $playerName　$pointType: ${ranking['prize']}\n';
      }
    }
    
    if (missingRanks.isNotEmpty) {
      final rankTexts = missingRanks.map((rank) => '${rank}位').join('、');
      content += '\n$rankTextsのプレイヤーが未確定です。';
    }
    
    return await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('順位未確定'),
        content: SingleChildScrollView(
          child: Text(content),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop('cancel'),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop('ranking'),
            child: const Text('順位確定'),
            style: TextButton.styleFrom(foregroundColor: Colors.indigo),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop('force_end'),
            child: const Text('強制終了'),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
          ),
        ],
      ),
    ) ?? 'cancel';
  }

  Future<bool> _showFinalConfirmationDialog(dynamic rankingData) async {
    final pointType = rankingData?['pointType'] ?? 'pointA';
    final rankings = rankingData?['rankings'] ?? [];
    
    String content = 'pointを付与し、トーナメントの終了処理を進めますか？\n\n';
    content += '順位:\n';
    for (final ranking in rankings) {
      final playerName = ranking['playerName'] ?? '（未設定）';
      content += '${ranking['rank']}位: $playerName　$pointType: ${ranking['prize']}\n';
    }
    
    return await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('最終確認'),
        content: SingleChildScrollView(
          child: Text(content),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('確認'),
          ),
        ],
      ),
    ) ?? false;
  }

  String _getPlayersValue(Map<String, dynamic> data) {
    // XX: playersIn
    // YY: entries + reentries - playersBusted
    final playersIn = data['playersIn'] as int? ?? 0;
    final entries = data['entries'] as int? ?? 0;
    final reentries = data['reentries'] as int? ?? 0;
    final playersBusted = data['playersBusted'] as int? ?? 0;
    final yy = entries + reentries - playersBusted;
    return '$yy/$playersIn';
  }

  String _getTotalEntriesValue(Map<String, dynamic> data) {
    final entries = data['entries'] as int? ?? 0;
    final reentries = data['reentries'] as int? ?? 0;
    return (entries + reentries).toString();
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'scheduled':
        return '開催前';
      case 'running':
        return 'レジスト前';
      case 'registered':
        return 'レジスト後';
      case 'ended':
      case 'force_ended':
        return '終了済';
      default:
        return status;
    }
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
        builder: (context) => TableDetailPage(
          tournamentId: widget.tournamentId,
          tableId: tableId,
          suppressStoreStrongWarning: widget.suppressStoreStrongWarning,
        ),
      ),
    );
  }

  /// 下部アクションバーを構築
  Widget _buildBottomActionBar() {
    return ExpansionTile(
      title: const Text(
        'トーナメント操作',
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
        ),
      ),
      leading: const Icon(Icons.settings),
      backgroundColor: Colors.grey[50],
      collapsedBackgroundColor: Colors.grey[100],
      childrenPadding: const EdgeInsets.all(16),
      children: [
        Row(
        children: [
          // 左側: トーナメント状況表示（画面幅の2/3に固定）
          SizedBox(
            width: MediaQuery.of(context).size.width * 0.67,
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
                  
                  final data = snapshot.data?.data() != null 
                      ? Map<String, dynamic>.from(snapshot.data!.data()! as Map)
                      : null;
                  
                  return StreamBuilder<DocumentSnapshot>(
                    stream: FirebaseFirestore.instance
                        .collection('scheduledTournaments')
                        .doc(widget.tournamentId)
                        .snapshots(),
                    builder: (context, tournamentSnapshot) {
                      final tournamentData = tournamentSnapshot.data?.data() as Map<String, dynamic>?;
                      final status = tournamentData?['status'] as String? ?? 'scheduled';
                      final statusText = _getStatusText(status);
                      
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
                                        label: 'Players',
                                        value: _getPlayersValue(data),
                                        color: Colors.green[700]!,
                                      ),
                                      const SizedBox(height: 8),
                                      _buildStatItem(
                                        icon: Icons.trending_up,
                                        label: 'ステータス',
                                        value: statusText,
                                        color: Colors.purple[700]!,
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
                                        icon: Icons.sports_esports,
                                        label: '総エントリー',
                                        value: _getTotalEntriesValue(data),
                                        color: Colors.blue[700]!,
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
                                        value: '${data['playersBusted'] ?? 0}',
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
                  );
                },
              ),
            ),
          ),
          
          const SizedBox(width: 16),
          
          // 右側: アクションボタン（2列縦並びレイアウト）
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 左列: 参加者登録、全員リシート、プライズ確定、操作履歴
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ElevatedButton.icon(
                    onPressed: () => _registerParticipant(),
                    icon: const Icon(Icons.person_add),
                    label: const Text('参加者登録'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      minimumSize: Size(MediaQuery.of(context).size.width * 0.11, 40),
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
                      minimumSize: Size(MediaQuery.of(context).size.width * 0.11, 40),
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
                      minimumSize: Size(MediaQuery.of(context).size.width * 0.11, 40),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: () => _showActionHistory(),
                    icon: const Icon(Icons.history),
                    label: const Text('操作履歴'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.grey,
                      foregroundColor: Colors.white,
                      minimumSize: Size(MediaQuery.of(context).size.width * 0.11, 40),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 16),
              // 右列: 順位確定、置きバケ登録、終了処理（§11.6: 置きバケは順位の次・終了の前）
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ElevatedButton.icon(
                    onPressed: () => _confirmRankings(),
                    icon: const Icon(Icons.leaderboard),
                    label: const Text('順位確定'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.indigo,
                      foregroundColor: Colors.white,
                      minimumSize: Size(MediaQuery.of(context).size.width * 0.11, 40),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: () => _showOkibakeRegisterDialog(),
                    icon: const Icon(Icons.person_add_alt_1),
                    label: const Text('置きバケ登録'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.teal.shade700,
                      foregroundColor: Colors.white,
                      minimumSize: Size(MediaQuery.of(context).size.width * 0.11, 40),
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Phase 4 補完 §12.8: 「置きバケ登録」と「終了処理」の間に配置。
                  ElevatedButton.icon(
                    onPressed: () => _showOkibakeListDialog(),
                    icon: const Icon(Icons.list_alt),
                    label: const Text('置きバケ一覧'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.amber.shade800,
                      foregroundColor: Colors.white,
                      minimumSize: Size(MediaQuery.of(context).size.width * 0.11, 40),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: _isEndingTournament ? null : () => _endTournament(),
                    icon: const Icon(Icons.stop),
                    label: const Text('終了処理'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                      minimumSize: Size(MediaQuery.of(context).size.width * 0.11, 40),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
        ),
      ],
    );
  }

  void _showActionHistory() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => TournamentActionsHistoryPage(
          tournamentId: widget.tournamentId,
        ),
      ),
    );
  }

  /// AppBar用: storeMeta の営業状態を表示（Phase6 Step1、青AppBar用に白表示）
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
        title: StreamBuilder<DocumentSnapshot>(
          stream: FirebaseFirestore.instance
              .collection('scheduledTournaments')
              .doc(widget.tournamentId)
              .snapshots(),
          builder: (context, snapshot) {
            String title = widget.tournamentName;
            List<String> statusLabels = [];
            
            if (snapshot.hasData && snapshot.data!.exists) {
              final data = snapshot.data!.data() as Map<String, dynamic>?;
              final setedPrize = data?['SetedPrize'] as bool? ?? false;
              final setedRanking = data?['SetedRanking'] as bool? ?? false;
              
              if (setedPrize) {
                statusLabels.add('プライズ確定済み');
              }
              if (setedRanking) {
                statusLabels.add('ランキング確定済み');
              }
            }
            
            if (statusLabels.isNotEmpty) {
              title = '$title (${statusLabels.join('・')})';
            }
            
            return Text(title);
          },
        ),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          _buildStoreStatusAction(context),
          // ブラインドタイマー画面に遷移するボタン
          TextButton.icon(
            icon: const Icon(Icons.timer, color: Colors.white),
            label: const Text(
              'ブラインドタイマー',
              style: TextStyle(color: Colors.white),
            ),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => BlindTimerPage(
                    tournamentId: widget.tournamentId,
                  ),
                ),
              );
            },
          ),
        ],
      ),
      body: StoreStrongWarningWrapper(
        suppressStrongWarning: widget.suppressStoreStrongWarning,
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
          final data = snapshot.data!.data() != null 
              ? Map<String, dynamic>.from(snapshot.data!.data()! as Map)
              : null;
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
                            Expanded(
                              child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                                stream: FirebaseFirestore.instance
                                    .collection('scheduledTournaments')
                                    .doc(widget.tournamentId)
                                    .snapshots(),
                                builder: (context, tourSnap) {
                                  var resolvedAddonLimit = -1;
                                  final addonLimitLoading =
                                      tourSnap.connectionState == ConnectionState.waiting &&
                                          !tourSnap.hasData;
                                  if (tourSnap.hasData && tourSnap.data!.exists) {
                                    final tourData = tourSnap.data!.data() ?? {};
                                    final snap = Map<String, dynamic>.from(
                                      (tourData['snapshot'] as Map?) ?? {},
                                    );
                                    resolvedAddonLimit = resolveAddonLimitPerPlayerUi(
                                      isAddon: snap['isAddon'] == true,
                                      addonLimitPerPlayer: snap['addonLimitPerPlayer'],
                                    );
                                  }

                                  return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                                stream: FirebaseFirestore.instance
                                    .collection('scheduledTournaments')
                                    .doc(widget.tournamentId)
                                    .collection('tablesSeat')
                                    .doc('waiting')
                                    .snapshots(),
                                builder: (context, waitingSnapshot) {
                                  return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                                    stream: FirebaseFirestore.instance
                                        .collection('scheduledTournaments')
                                        .doc(widget.tournamentId)
                                        .collection('okibakeTemporaryEntries')
                                        .where('entryStatus', isEqualTo: 'registered')
                                        .snapshots(),
                                    builder: (context, okibakeSnap) {
                                      final merged = <WaitingPlayer>[];

                                      if (!waitingSnapshot.hasError &&
                                          waitingSnapshot.hasData &&
                                          waitingSnapshot.data!.exists) {
                                        final waitingData =
                                            waitingSnapshot.data!.data() != null
                                                ? Map<String, dynamic>.from(
                                                    waitingSnapshot.data!.data()! as Map)
                                                : null;
                                        final waitingList =
                                            waitingData?['waiting'] as Map<String, dynamic>? ??
                                                {};
                                        for (final e in waitingList.entries) {
                                          final userId = e.key;
                                          final v = e.value;
                                          if (v is Map<String, dynamic>) {
                                            final pokerName =
                                                v['pokerName'] as String? ?? 'ユーザー$userId';
                                            DateTime joinedAt = DateTime.now();
                                            if (v['joinedAt'] != null &&
                                                v['joinedAt'] is Timestamp) {
                                              joinedAt =
                                                  (v['joinedAt'] as Timestamp).toDate();
                                            }
                                            merged.add(WaitingPlayer(
                                              userId: userId,
                                              displayName: pokerName,
                                              joinedAt: joinedAt,
                                            ));
                                          }
                                        }
                                      }

                                      if (!okibakeSnap.hasError && okibakeSnap.hasData) {
                                        for (final doc in okibakeSnap.data!.docs) {
                                          final entry = OkibakeTemporaryEntry.fromDoc(doc);
                                          if (!entry.isWaitingUnlinked) continue;
                                          merged.add(
                                            WaitingPlayer.okibakeTemporary(
                                              okibakeEntryId: entry.okibakeEntryId,
                                              displayName: entry.waitingListDisplayName,
                                              createdAt: entry.createdAt ?? DateTime.now(),
                                              okibakeAddonCount: entry.okibakeAddonCount,
                                              billLinkStatus: entry.billLinkStatus,
                                              linkedUserId: entry.linkedUserId,
                                              addonIntent: entry.addonIntent,
                                            ),
                                          );
                                        }
                                      }

                                      merged.sort((a, b) => b.joinedAt.compareTo(a.joinedAt));

                                      final mainWaitingCount =
                                          (data?['waitingCount'] as num?)?.toInt();
                                      final badgeCount = mainWaitingCount ?? merged.length;

                                      final streamsLoading =
                                          (waitingSnapshot.connectionState ==
                                                      ConnectionState.waiting &&
                                                  !waitingSnapshot.hasData) ||
                                              (okibakeSnap.connectionState ==
                                                      ConnectionState.waiting &&
                                                  !okibakeSnap.hasData);

                                      final errMsgs = [
                                        if (waitingSnapshot.hasError)
                                          '待機: ${waitingSnapshot.error}',
                                        if (okibakeSnap.hasError)
                                          'オキバケ一覧: ${okibakeSnap.error}',
                                      ].join('\n');

                                      return Column(
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
                                                Icon(Icons.hourglass_empty,
                                                    color: Colors.orange[700]),
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
                                                  icon:
                                                      const Icon(Icons.event_seat, size: 16),
                                                  label: const Text('着席',
                                                      style: TextStyle(fontSize: 12)),
                                                  style: ElevatedButton.styleFrom(
                                                    backgroundColor: Colors.orange[600],
                                                    foregroundColor: Colors.white,
                                                    padding:
                                                        const EdgeInsets.symmetric(
                                                            horizontal: 8, vertical: 4),
                                                    minimumSize: const Size(0, 28),
                                                  ),
                                                ),
                                                const SizedBox(width: 8),
                                                Text(
                                                  '$badgeCount人',
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
                                            child: streamsLoading && merged.isEmpty
                                                ? const Center(child: CircularProgressIndicator())
                                                : merged.isEmpty
                                                    ? Center(
                                                        child: Padding(
                                                          padding: const EdgeInsets.all(16),
                                                          child: Text(
                                                            errMsgs.isEmpty ? '待機者がいません' : errMsgs,
                                                            style: TextStyle(
                                                                color:
                                                                    errMsgs.isEmpty ? Colors.grey : Colors.red),
                                                            textAlign: TextAlign.center,
                                                          ),
                                                        ),
                                                      )
                                                    : Column(
                                                        crossAxisAlignment: CrossAxisAlignment.stretch,
                                                        children: [
                                                          if (errMsgs.isNotEmpty)
                                                            Padding(
                                                              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
                                                              child: Text(
                                                                errMsgs,
                                                                style: const TextStyle(color: Colors.red, fontSize: 12),
                                                                textAlign: TextAlign.center,
                                                              ),
                                                            ),
                                                          Expanded(
                                                            child: ListView.builder(
                                                              padding: const EdgeInsets.all(8),
                                                              itemCount: merged.length,
                                                              itemBuilder: (context, index) {
                                                                final player = merged[index];
                                                                if (player.isOkibakeTemporary) {
                                                                  return OkibakeWaitingListTile(
                                                                    tournamentId: widget.tournamentId,
                                                                    player: player,
                                                                    listIndex: index,
                                                                    resolvedAddonLimit: resolvedAddonLimit,
                                                                    addonLimitLoading: addonLimitLoading,
                                                                    service: _service,
                                                                    onAssignSeat: () => _offerAssignSeat(player),
                                                                  );
                                                                }
                                                                return RegularWaitingListTile(
                                                                  tournamentId: widget.tournamentId,
                                                                  player: player,
                                                                  listIndex: index,
                                                                  resolvedAddonLimit: resolvedAddonLimit,
                                                                  addonLimitLoading: addonLimitLoading,
                                                                  service: _service,
                                                                  onAssignSeat: () => _offerAssignSeat(player),
                                                                );
                                                              },
                                                            ),
                                                          ),
                                                        ],
                                                      ),
                                          ),
                                        ],
                                      );
                                    },
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
                                  ElevatedButton.icon(
                                    onPressed: () => _removeTable(),
                                    icon: const Icon(Icons.remove, size: 16),
                                    label: const Text('卓削除', style: TextStyle(fontSize: 12)),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.red[600],
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      minimumSize: const Size(0, 28),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  StreamBuilder<QuerySnapshot>(
                                    stream: FirebaseFirestore.instance
                                        .collection('scheduledTournaments')
                                        .doc(widget.tournamentId)
                                        .collection('tablesSeat')
                                        .snapshots(),
                                    builder: (context, seatedSnapshot) {
                                      if (seatedSnapshot.hasError) {
                                        return Text(
                                          'エラー',
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            color: Colors.red[700],
                                            fontSize: 18,
                                          ),
                                        );
                                      }

                                      if (seatedSnapshot.connectionState == ConnectionState.waiting) {
                                        return Text(
                                          '...人着席中',
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            color: Colors.blue[700],
                                            fontSize: 18,
                                          ),
                                        );
                                      }

                                      final allDocs = seatedSnapshot.data?.docs ?? [];
                                      // 'waiting'と'busted'ドキュメントを除外
                                      final tables = allDocs.where((doc) => doc.id != 'waiting' && doc.id != 'busted').toList();
                                      
                                      int totalOccupiedSeats = 0;
                                      for (final tableDoc in tables) {
                                        final tableData = tableDoc.data() != null 
                                            ? Map<String, dynamic>.from(tableDoc.data()! as Map)
                                            : null;
                                        final seats =
                                            tableData?['seats'] as Map<String, dynamic>? ?? {};
                                        final maxSeats =
                                            ScheduledTournamentSeatMap
                                                .resolvedTableMaxSeats(
                                          tableData?['maxSeats'],
                                          seats,
                                          fallbackWhenUnresolved: 6,
                                        );

                                        final occupiedSeats =
                                            ScheduledTournamentSeatMap
                                                .occupiedCount(
                                          seats,
                                          maxSeats,
                                        );
                                        totalOccupiedSeats += occupiedSeats;
                                      }

                                      return Text(
                                        '${totalOccupiedSeats}人着席中',
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          color: Colors.blue[700],
                                          fontSize: 18,
                                        ),
                                      );
                                    },
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
                                  // 'waiting'と'busted'ドキュメントを除外
                                  final tables = allDocs.where((doc) => doc.id != 'waiting' && doc.id != 'busted').toList();
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
                                      final tableData = tableDoc.data() != null 
                                          ? Map<String, dynamic>.from(tableDoc.data()! as Map)
                                          : null;
                                      final seats = tableData?['seats'] as Map<String, dynamic>? ?? {};
                                      final safeMax =
                                          ScheduledTournamentSeatMap
                                              .resolvedTableMaxSeats(
                                        tableData?['maxSeats'],
                                        seats,
                                        fallbackWhenUnresolved: 6,
                                      );
                                      final occupiedSeats =
                                          ScheduledTournamentSeatMap.occupiedCount(
                                        seats,
                                        safeMax,
                                      );
                                      final totalSeats = safeMax;
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
      ),
    );
  }
}
