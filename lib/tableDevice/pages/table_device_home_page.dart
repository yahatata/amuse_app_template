import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/tableDevice/models/table_device_home_state.dart';
import 'package:amuse_app_template/tableDevice/pages/table_device_side_game_page.dart';
import 'package:amuse_app_template/tableDevice/pages/table_device_table_detail_page.dart';
import 'package:amuse_app_template/tableDevice/services/table_device_service.dart';
import 'package:amuse_app_template/tableDevice/widgets/table_device_drawer.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';

class TableDedicatedHomePage extends StatefulWidget {
  const TableDedicatedHomePage({
    super.key,
    this.tableId,
  });

  final String? tableId;

  @override
  State<TableDedicatedHomePage> createState() => _TableDedicatedHomePageState();
}

class _TableDedicatedHomePageState extends State<TableDedicatedHomePage> {
  final TableDeviceService _tableDeviceService = TableDeviceService();
  bool _isLoading = true;
  bool _isRegistering = false;
  String? _resolvedTableId;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    final tableId = widget.tableId ?? await _tableDeviceService.getCurrentTableId();
    if (!mounted) return;
    setState(() {
      _resolvedTableId = tableId;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_resolvedTableId == null) {
      return PopScope(
        canPop: false,
        child: Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            title: Text('卓専用端末'),
            centerTitle: true,
          ),
          body: const TableDeviceUnboundNotice(),
        ),
      );
    }

    return PopScope(
      canPop: false,
      child: StreamBuilder<TableDeviceHomeState>(
        stream: _tableDeviceService.watchHomeState(_resolvedTableId),
        initialData: TableDeviceHomeState(
          kind: TableDeviceHomeKind.idle,
          tableId: _resolvedTableId,
          tableName: _resolvedTableId,
          registrationEnabled: false,
        ),
        builder: (context, snapshot) {
          // TD-07: hasError を空データ扱いにせず、raw error も出さない。
          if (tableDeviceHomeStreamHasError(snapshot)) {
            return Scaffold(
              appBar: AppBar(
                automaticallyImplyLeading: false,
                title: const Text('卓専用端末'),
                centerTitle: true,
              ),
              body: TableDeviceHomeStreamErrorView(
                onRetry: () {
                  if (!mounted) return;
                  setState(() {});
                },
              ),
            );
          }

          final state = snapshot.data!;
          return Stack(
            children: [
              Scaffold(
            appBar: AppBar(
              title: Text(state.tableName ?? state.tableId ?? '卓専用端末'),
              centerTitle: true,
              actions: [
                _TableDeviceStoreStatusAction(
                  textColor: Colors.white,
                ),
              ],
            ),
            drawer: TableDeviceDrawer(
              tableId: state.tableId,
              initialState: state,
            ),
            body: LayoutBuilder(
              builder: (context, constraints) {
                final isNarrow = constraints.maxWidth < 900;
                final children = [
                  Expanded(
                    flex: isNarrow ? 0 : 3,
                    child: _buildMainArea(context, state),
                  ),
                  const SizedBox(width: 16, height: 16),
                  Expanded(
                    flex: isNarrow ? 0 : 2,
                    child: _buildSideArea(context, state),
                  ),
                ];

                return Padding(
                  padding: const EdgeInsets.all(16),
                  child: isNarrow
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: children,
                        )
                      : Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: children,
                        ),
                );
              },
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
          );
        },
      ),
    );
  }

  Widget _buildMainArea(BuildContext context, TableDeviceHomeState state) {
    final content = switch (state.kind) {
      TableDeviceHomeKind.tournamentActive => _buildProgressCard(
        icon: Icons.emoji_events,
        title: state.tournamentName ?? 'トーナメント',
        subtitle: '進行中',
        detail: 'タップして卓ページを開く',
        color: Colors.orange,
        onTap: () => _openProgressPage(context, state),
      ),
      TableDeviceHomeKind.tournamentScheduled => _buildProgressCard(
        icon: Icons.event,
        title: state.tournamentName ?? 'トーナメント',
        subtitle: '開始前',
        detail: 'タップして卓ページを開く',
        color: Colors.blueGrey,
        onTap: () => _openProgressPage(context, state),
      ),
      TableDeviceHomeKind.sideGameActive => _buildProgressCard(
        icon: Icons.casino,
        title: state.gameName ?? 'サイドゲーム',
        subtitle: '進行中',
        detail: state.tournamentName != null
            ? '終了後に ${state.tournamentName} へ戻ります'
            : 'タップして卓ページを開く',
        color: Colors.blue,
        onTap: () => _openProgressPage(context, state),
      ),
      TableDeviceHomeKind.inconsistent => _buildProgressCard(
        icon: Icons.warning_amber_rounded,
        title: '卓データの整合が取れていません',
        subtitle: '要確認',
        detail: state.message ?? '',
        color: Colors.red,
        onTap: () => _showInconsistentDialog(context, state),
      ),
      TableDeviceHomeKind.otherInUse => _buildProgressCard(
        icon: Icons.lock_clock,
        title: '現在他用途で使用中です',
        subtitle: state.currentStatus ?? '使用中',
        detail: state.message ?? '',
        color: Colors.grey,
      ),
      _ => _buildProgressCard(
        icon: Icons.table_restaurant,
        title: '現在進行中のゲームはありません',
        subtitle: '待機中',
        detail: state.registrationEnabled
            ? '右側の登録操作から開始できます'
            : '登録機能は現在オフです',
        color: Colors.grey,
      ),
    };

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: content,
      ),
    );
  }

  Widget _buildSideArea(BuildContext context, TableDeviceHomeState state) {
    final sideGameTypes =
        StoreConfigService.instance.latestData?.sideGameTypes ?? kDefaultSideGameTypes;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '操作',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            if (state.canRegisterTournament && !_isRegistering)
              FilledButton.icon(
                onPressed: () => _handleTournamentRegistration(context, state),
                icon: const Icon(Icons.emoji_events),
                label: const Text('トーナメントに登録'),
              )
            else
              OutlinedButton.icon(
                onPressed: null,
                icon: const Icon(Icons.emoji_events_outlined),
                label: const Text('トーナメントに登録'),
              ),
            const SizedBox(height: 12),
            if (state.canRegisterSideGame && !_isRegistering)
              FilledButton.icon(
                onPressed: () => _handleSideGameRegistration(
                  context,
                  state,
                  sideGameTypes,
                ),
                icon: const Icon(Icons.casino),
                label: const Text('サイドゲームに登録'),
              )
            else
              OutlinedButton.icon(
                onPressed: null,
                icon: const Icon(Icons.casino_outlined),
                label: const Text('サイドゲームに登録'),
              ),
            const SizedBox(height: 16),
            Text(
              _buildSideAreaDescription(state),
              style: TextStyle(
                color: Colors.grey.shade700,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _buildSideAreaDescription(TableDeviceHomeState state) {
    if (!state.registrationEnabled) {
      return 'storeMeta/config.features.tableDeviceRegistrationEnabled が false のため、登録導線は表示されません。';
    }
    if (state.canRegisterTournament || state.canRegisterSideGame) {
      return 'この卓が空き状態のときのみ、新規登録を実行できます。';
    }
    if (state.canOpenProgress) {
      return '現在進行中のゲームがあります。必要に応じてカードをタップして卓ページを開いてください。';
    }
    return '現在の卓状態では新規登録を実行できません。';
  }

  Widget _buildProgressCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    String? detail,
    VoidCallback? onTap,
  }) {
    final cardChild = Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.35)),
        color: color.withValues(alpha: 0.08),
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 48, color: color),
          const SizedBox(height: 20),
          Text(
            title,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              subtitle,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (detail != null && detail.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              detail,
              style: TextStyle(
                color: Colors.grey.shade800,
                height: 1.5,
              ),
            ),
          ],
        ],
      ),
    );

    if (onTap == null) {
      return cardChild;
    }

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: cardChild,
    );
  }

  void _openProgressPage(BuildContext context, TableDeviceHomeState state) {
    if (state.kind == TableDeviceHomeKind.sideGameActive) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => TableDeviceSideGamePage(
            tableId: state.tableId!,
            gameName: state.gameName ?? '',
          ),
        ),
      );
      return;
    }

    if ((state.kind == TableDeviceHomeKind.tournamentActive ||
            state.kind == TableDeviceHomeKind.tournamentScheduled) &&
        state.tournamentId != null &&
        state.tableId != null) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => TableDeviceTableDetailPage(
            tournamentId: state.tournamentId!,
            tableId: state.tableId!,
          ),
        ),
      );
    }
  }

  void _showInconsistentDialog(
    BuildContext context,
    TableDeviceHomeState state,
  ) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('卓データの整合が取れていません'),
        content: Text(
          state.message ?? '管理者に連絡してください。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  Future<void> _handleTournamentRegistration(
    BuildContext context,
    TableDeviceHomeState state,
  ) async {
    final tableId = state.tableId;
    if (tableId == null || _isRegistering) return;

    final candidate = await _showTournamentPicker(context, tableId);
    if (!mounted || candidate == null) return;

    setState(() => _isRegistering = true);
    String? errorMessage;
    try {
      await _tableDeviceService.registerTableToTournament(
        tableId: tableId,
        tournamentId: candidate.tournamentId,
      );
    } catch (error) {
      errorMessage = _tableDeviceService.formatFunctionsError(error);
    } finally {
      if (mounted) {
        setState(() => _isRegistering = false);
      }
    }
    if (!mounted) return;
    if (errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMessage),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${candidate.tournamentName} に登録しました'),
        backgroundColor: Colors.green,
      ),
    );
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => TableDeviceTableDetailPage(
          tournamentId: candidate.tournamentId,
          tableId: tableId,
        ),
      ),
    );
  }

  Future<TableDeviceTournamentCandidate?> _showTournamentPicker(
    BuildContext context,
    String tableId,
  ) async {
    final candidates = await _tableDeviceService.getRegisterableTournaments(tableId);
    if (!mounted) return null;

    if (candidates.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('登録可能なトーナメントがありません'),
        ),
      );
      return null;
    }

    return showDialog<TableDeviceTournamentCandidate>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('登録先トーナメントを選択'),
        content: SizedBox(
          width: 420,
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: candidates.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final candidate = candidates[index];
              return ListTile(
                leading: const Icon(Icons.emoji_events),
                title: Text(candidate.tournamentName),
                subtitle: Text(
                  '${_formatTournamentStatus(candidate.status)}  ${_formatStartAt(candidate.startAt)}',
                ),
                onTap: () => Navigator.of(context).pop(candidate),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  Future<void> _handleSideGameRegistration(
    BuildContext context,
    TableDeviceHomeState state,
    List<String> sideGameTypes,
  ) async {
    final tableId = state.tableId;
    if (tableId == null || sideGameTypes.isEmpty || _isRegistering) return;

    final gameName = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('サイドゲームを選択'),
        content: SizedBox(
          width: 420,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: sideGameTypes.length,
            itemBuilder: (context, index) {
              final game = sideGameTypes[index];
              return ListTile(
                leading: const Icon(Icons.casino),
                title: Text(game),
                onTap: () => Navigator.of(context).pop(game),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
        ],
      ),
    );
    if (!mounted || gameName == null) return;

    setState(() => _isRegistering = true);
    String? errorMessage;
    try {
      await _tableDeviceService.registerTableToSideGame(
        tableId: tableId,
        gameName: gameName,
      );
    } catch (error) {
      errorMessage = _tableDeviceService.formatFunctionsError(error);
    } finally {
      if (mounted) {
        setState(() => _isRegistering = false);
      }
    }
    if (!mounted) return;
    if (errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMessage),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$gameName を開始しました'),
        backgroundColor: Colors.green,
      ),
    );
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => TableDeviceSideGamePage(
          tableId: tableId,
          gameName: gameName,
        ),
      ),
    );
  }

  String _formatTournamentStatus(String status) {
    return switch (status) {
      'running' => '進行中',
      'registered' => 'レジスト済',
      'paused' => '一時停止',
      'scheduled' => '開始前',
      _ => status,
    };
  }

  String _formatStartAt(Timestamp timestamp) {
    final value = timestamp.toDate();
    return DateFormat('M/d HH:mm').format(value);
  }
}

/// Home [StreamBuilder] の hasError 判定（initialData があっても error を idle 扱いにしない）。
bool tableDeviceHomeStreamHasError(AsyncSnapshot<Object?> snapshot) {
  return snapshot.hasError;
}

/// Home stream 失敗時の固定文言。`snapshot.error` は絶対に出さない。
String tableDeviceHomeStreamErrorMessage([Object? error]) {
  return TableDeviceHomeStreamErrorView.message;
}

class TableDeviceHomeStreamErrorView extends StatelessWidget {
  const TableDeviceHomeStreamErrorView({
    super.key,
    this.onRetry,
  });

  final VoidCallback? onRetry;

  static const message =
      'データを取得できませんでした。画面を更新して再度お試しください。';

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              size: 72,
              color: Colors.orange,
            ),
            const SizedBox(height: 20),
            const Text(
              '卓情報を表示できません',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            const Text(
              message,
              style: TextStyle(
                fontSize: 16,
                height: 1.6,
              ),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('再読み込み'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class TableDeviceUnboundNotice extends StatelessWidget {
  const TableDeviceUnboundNotice({super.key});

  static const message =
      '管理者に報告して、adminデバイスからテーブルの紐付けを行う。もしくはroleを変更してください。';

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Icon(
              Icons.link_off,
              size: 72,
              color: Colors.orange,
            ),
            SizedBox(height: 20),
            Text(
              '卓の紐付けが未設定です',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 12),
            Text(
              message,
              style: TextStyle(
                fontSize: 16,
                height: 1.6,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _TableDeviceStoreStatusAction extends StatelessWidget {
  const _TableDeviceStoreStatusAction({
    required this.textColor,
  });

  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: textColor,
              ),
            ),
          );
        }

        final data = snapshot.data!;
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
                padding: const EdgeInsets.only(right: 8),
                child: Center(
                  child: warningLabel != null
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.warning_amber_rounded,
                              size: 18,
                              color: Colors.orange,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              formatted,
                              style: TextStyle(color: textColor),
                            ),
                          ],
                        )
                      : Text(
                          formatted,
                          style: TextStyle(color: textColor),
                        ),
                ),
              );
            } catch (_) {}
          }
        }

        if (data.isClosed) {
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Text(
              '閉店中',
              style: TextStyle(color: textColor),
            ),
          );
        }

        return const SizedBox.shrink();
      },
    );
  }
}
