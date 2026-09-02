import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/sideGame/pages/side_game_table_home.dart';
import 'package:amuse_app_template/sideGame/services/side_game_table_mutation_service.dart';
import 'package:amuse_app_template/sideGame/side_game_user_facing_errors.dart';
import 'package:amuse_app_template/Home/app_home_navigation.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';
import 'package:amuse_app_template/tournament/active/utils/active_tournament_table_usage.dart';
import 'package:amuse_app_template/utils/store_strong_warning_ui.dart';

class SideGameTableListPage extends StatefulWidget {
  const SideGameTableListPage({super.key});

  @override
  State<SideGameTableListPage> createState() => _SideGameTableListPageState();
}

class _SideGameTableListPageState extends State<SideGameTableListPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final DeviceService _deviceService = DeviceService();

  List<String> get _sideGameTypes =>
      StoreConfigService.instance.latestData?.sideGameTypes ?? kDefaultSideGameTypes;

  final SideGameTableMutationService _mutationService =
      SideGameTableMutationService();

  String? _myTableId;
  Set<String> _excludedTableIds = {};
  bool _isLoadingPermissions = true;
  bool _permissionsLoadFailed = false;
  bool _isStartingSideGame = false;
  int _tablesStreamReloadToken = 0;

  @override
  void initState() {
    super.initState();
    _loadPermissions();
  }

  void _retryTablesStream() {
    setState(() {
      _tablesStreamReloadToken++;
    });
  }

  Future<void> _loadPermissions() async {
    if (!mounted) return;
    setState(() {
      _isLoadingPermissions = true;
      _permissionsLoadFailed = false;
    });
    try {
      // 1. 現在のデバイス情報を取得
      final device = await _deviceService.getCurrentDevice();
      _myTableId = device?.getTableIdForOption(DeviceOptionKeys.sideGame);

      // 2. 他デバイスでtournament_table用に指定された卓を除外リストに追加
      final devicesSnap = await _firestore.collection('devices').get();
      final excluded = <String>{};
      for (final doc in devicesSnap.docs) {
        if (doc.id == device?.id) continue; // 自分自身は除外対象外
        final params = doc.data()['optionParams'] as Map<String, dynamic>?;
        final tableId = params?[DeviceOptionKeys.tournamentTable]?['tableId'] as String?;
        if (tableId != null) {
          excluded.add(tableId);
        }
      }

      if (mounted) {
        setState(() {
          _excludedTableIds = excluded;
          _permissionsLoadFailed = false;
          _isLoadingPermissions = false;
        });
      }
    } catch (e) {
      print('権限読み込みエラー');
      if (mounted) {
        setState(() {
          _permissionsLoadFailed = true;
          _isLoadingPermissions = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Scaffold(
      appBar: AppBar(
        title: const Text('サイドゲーム テーブル選択'),
        centerTitle: true,
      ),
      body: StoreStrongWarningWrapper(
        onCloseStore: () {
          navigateToAppHome(context, adminInitialTerminalMode: true);
        },
        onBusinessContinue: () {
          navigateToAppHome(context, adminInitialTerminalMode: true);
        },
        child: _isLoadingPermissions
          ? const Center(child: CircularProgressIndicator())
          : _permissionsLoadFailed
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          kSideGameTableListLoadFailedMessage,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loadPermissions,
                          child: const Text('再試行'),
                        ),
                      ],
                    ),
                  ),
                )
          : StreamBuilder<QuerySnapshot>(
              key: ValueKey('side-game-tables-$_tablesStreamReloadToken'),
              stream: _firestore.collection('tables').snapshots(),
              builder: (context, snapshot) {
                final hasData = snapshot.hasData;

                if (snapshot.hasError && !hasData) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            sideGameTableListStreamErrorMessage(snapshot.error),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(
                            onPressed: _retryTablesStream,
                            child: const Text('再試行'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                if (snapshot.connectionState == ConnectionState.waiting &&
                    !hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (!hasData) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            sideGameTableListStreamErrorMessage(),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(
                            onPressed: _retryTablesStream,
                            child: const Text('再試行'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                final tables = snapshot.data!.docs
                    .where((doc) {
                      final data = doc.data() as Map<String, dynamic>;
                      if (data['isEnabled'] != true) return false;

                      // 自分に卓番付与がある場合はその卓のみ
                      if (_myTableId != null && doc.id != _myTableId) return false;

                      // 他デバイスでtournament_table用に指定された卓は除外
                      if (_excludedTableIds.contains(doc.id)) return false;

                      return true;
                    })
                    .toList();

                if (tables.isEmpty) {
                  return Center(
                    child: Text(
                      _myTableId != null
                          ? '指定された卓が見つかりません'
                          : '利用可能な卓がありません',
                      style: const TextStyle(color: Colors.grey),
                    ),
                  );
                }

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
                                onPressed: _retryTablesStream,
                                child: const Text('再試行'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    Expanded(child: _buildTableGrid(tables)),
                  ],
                );
              },
            ),
      ),
    ),
        if (_isStartingSideGame)
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

  String _tablesUsageLookupKey(List<QueryDocumentSnapshot> tables) {
    return tables
        .map((doc) {
          final data = doc.data() as Map<String, dynamic>;
          final status = data['status'] as String? ?? 'open';
          return '${doc.id}:$status';
        })
        .join(',');
  }

  Widget _buildTableGrid(List<QueryDocumentSnapshot> tables) {
    final usageLookupKey = _tablesUsageLookupKey(tables);

    return FutureBuilder<Map<String, ActiveTournamentTableUsage>>(
      key: ValueKey(usageLookupKey),
      future: findActiveTournamentTableUsageByTableIds(
        _firestore,
        tables.map((doc) => doc.id),
      ),
      builder: (context, usageSnapshot) {
        if (usageSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final usageByTableId =
            usageSnapshot.data ?? <String, ActiveTournamentTableUsage>{};

        return Padding(
          padding: const EdgeInsets.all(16.0),
          child: GridView.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 5,
              childAspectRatio: 0.8,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
            ),
            itemCount: tables.length,
            itemBuilder: (context, index) {
              final table = tables[index];
              final data = table.data() as Map<String, dynamic>;
              final usage =
                  usageByTableId[table.id] ?? ActiveTournamentTableUsage.empty;
              return _buildTableCard(table.id, data, usage);
            },
          ),
        );
      },
    );
  }

  ({
    Color cardColor,
    Color iconColor,
    Color titleColor,
    Color subtitleColor,
    Color badgeBackground,
    Color badgeForeground,
  }) _presentationColors(SideGameTableListPresentationKind kind) {
    switch (kind) {
      case SideGameTableListPresentationKind.available:
      case SideGameTableListPresentationKind.tournamentRegistered:
        return (
          cardColor: Colors.white,
          iconColor: Colors.green,
          titleColor: Colors.black,
          subtitleColor: Colors.black87,
          badgeBackground: Colors.green.shade100,
          badgeForeground: Colors.green.shade800,
        );
      case SideGameTableListPresentationKind.sideGameActive:
        return (
          cardColor: Colors.grey.shade300,
          iconColor: Colors.grey,
          titleColor: Colors.grey.shade600,
          subtitleColor: Colors.grey.shade600,
          badgeBackground: Colors.blue.shade100,
          badgeForeground: Colors.blue.shade800,
        );
      case SideGameTableListPresentationKind.tournamentSeated:
        return (
          cardColor: Colors.grey.shade300,
          iconColor: Colors.red.shade400,
          titleColor: Colors.grey.shade600,
          subtitleColor: Colors.grey.shade600,
          badgeBackground: Colors.red.shade100,
          badgeForeground: Colors.red.shade800,
        );
      case SideGameTableListPresentationKind.otherInUse:
        return (
          cardColor: Colors.grey.shade300,
          iconColor: Colors.grey,
          titleColor: Colors.grey.shade600,
          subtitleColor: Colors.grey.shade600,
          badgeBackground: Colors.orange.shade100,
          badgeForeground: Colors.orange.shade800,
        );
    }
  }

  Widget _buildTableCard(
    String tableId,
    Map<String, dynamic> data,
    ActiveTournamentTableUsage usage,
  ) {
    final name = data['name'] as String? ?? tableId;
    final status = data['status'] as String? ?? 'open';
    final maxSeats = data['maxSeats'] as int? ?? 6;

    final presentation = resolveSideGameTableListPresentation(
      tablesStatus: status,
      sideGameTypes: _sideGameTypes,
      usage: usage,
    );
    final colors = _presentationColors(presentation.kind);

    return Card(
      elevation: 4,
      color: colors.cardColor,
      child: InkWell(
        onTap: () => _handleTableSelection(
          tableId,
          status,
          cachedUsage: usage,
        ),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.table_restaurant,
                size: 40,
                color: colors.iconColor,
              ),
              const SizedBox(height: 8),
              Text(
                name,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: colors.titleColor,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Text(
                '$maxSeats席',
                style: TextStyle(
                  fontSize: 14,
                  color: colors.subtitleColor,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: colors.badgeBackground,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  presentation.label,
                  style: TextStyle(
                    fontSize: 12,
                    color: colors.badgeForeground,
                    fontWeight: FontWeight.w500,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _handleTableSelection(
    String tableId,
    String status, {
    ActiveTournamentTableUsage? cachedUsage,
  }) async {
    final usage = cachedUsage ??
        await findActiveTournamentTableUsage(_firestore, tableId);
    if (shouldRejectSideGameStartForTournamentUsage(usage)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(kSideGameTournamentSeatedBlockMessage),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (_sideGameTypes.contains(status)) {
      _navigateToTableHome(tableId, status);
      return;
    }

    if (shouldShowSideGameOverwriteWarning(
      tablesStatus: status,
      sideGameTypes: _sideGameTypes,
      usage: usage,
    )) {
      final presentation = resolveSideGameTableListPresentation(
        tablesStatus: status,
        sideGameTypes: _sideGameTypes,
        usage: usage,
      );
      final confirmed = await _showWarningDialog(presentation);
      if (!confirmed) return;
      final selectedGame = await _showGameSelectionAndStartDialog(
        tableId: tableId,
        allowOverride: true,
      );
      if (selectedGame != null && mounted) {
        _navigateToTableHome(tableId, selectedGame);
      }
      return;
    }

    final selectedGame = await _showGameSelectionAndStartDialog(
      tableId: tableId,
    );
    if (selectedGame != null && mounted) {
      _navigateToTableHome(tableId, selectedGame);
    }
  }

  Future<bool> _showWarningDialog(
    SideGameTableListPresentation presentation,
  ) async {
    final content =
        presentation.kind == SideGameTableListPresentationKind.tournamentRegistered
            ? 'トーナメント登録中ですが使用しますか？\n'
                'サイドゲーム終了後に登録されたトーナメントにて使用可能になります。'
            : 'この卓は現在他の用途で使用中ですが、サイドゲームを開始しますか？\n\n'
                '現在の状態: ${presentation.label}';

    return await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(
          Icons.warning,
          color: Colors.orange,
          size: 48,
        ),
        title: const Text('確認'),
        content: Text(content),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.orange,
              foregroundColor: Colors.white,
            ),
            child: const Text('確認'),
          ),
        ],
      ),
    ) ?? false;
  }

  /// ゲーム選択ダイアログ。開始成功時のみ閉じる（SG-10）。
  Future<String?> _showGameSelectionAndStartDialog({
    required String tableId,
    bool allowOverride = false,
  }) async {
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        var isStarting = false;
        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> startGame(String game) async {
              if (isStarting || _isStartingSideGame) return;
              setDialogState(() {
                isStarting = true;
              });
              setState(() {
                _isStartingSideGame = true;
              });
              try {
                final started = await _registerTableToSideGame(
                  tableId,
                  game,
                  allowOverride: allowOverride,
                );
                if (started && dialogContext.mounted) {
                  Navigator.of(dialogContext).pop(game);
                }
              } finally {
                if (mounted) {
                  setState(() {
                    _isStartingSideGame = false;
                  });
                }
                if (dialogContext.mounted) {
                  setDialogState(() {
                    isStarting = false;
                  });
                }
              }
            }

            return PopScope(
              canPop: !isStarting,
              child: Stack(
                children: [
                  AlertDialog(
                    title: const Text('ゲームを選択してください'),
                    content: SizedBox(
                      width: double.maxFinite,
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: _sideGameTypes.length,
                        itemBuilder: (context, index) {
                          final game = _sideGameTypes[index];
                          return ListTile(
                            leading: const Icon(Icons.casino),
                            title: Text(game),
                            onTap: isStarting ? null : () => startGame(game),
                          );
                        },
                      ),
                    ),
                    actions: [
                      TextButton(
                        onPressed: isStarting
                            ? null
                            : () => Navigator.of(dialogContext).pop(),
                        child: const Text('キャンセル'),
                      ),
                    ],
                  ),
                  if (isStarting)
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
            );
          },
        );
      },
    );
  }

  /// 開始 Callable。成功時のみ true（SG-10）。
  Future<bool> _registerTableToSideGame(
    String tableId,
    String gameName, {
    bool allowOverride = false,
  }) async {
    try {
      await _mutationService.registerTableToSideGame(
        tableId: tableId,
        gameName: gameName,
        allowOverride: allowOverride,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$gameName でテーブルを開始しました'),
            backgroundColor: Colors.green,
          ),
        );
      }
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapSideGameCallableError(
                e,
                operation: 'registerTableToSideGame',
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
      return false;
    }
  }

  void _navigateToTableHome(String tableId, String gameName) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => SideGameTableHomePage(
          tableId: tableId,
          gameName: gameName,
        ),
      ),
    );
  }
}
