import 'package:flutter/material.dart';

import 'package:amuse_app_template/tableDevice/models/table_device_home_state.dart';
import 'package:amuse_app_template/tableDevice/pages/table_device_home_page.dart';
import 'package:amuse_app_template/tableDevice/services/table_device_service.dart';

class TableDeviceDrawer extends StatelessWidget {
  TableDeviceDrawer({
    super.key,
    required this.tableId,
    this.initialState,
    TableDeviceService? service,
  }) : _service = service ?? TableDeviceService();

  final String? tableId;
  final TableDeviceHomeState? initialState;
  final TableDeviceService _service;

  @override
  Widget build(BuildContext context) {
    if (tableId == null) {
      return _buildDrawerContent(context, TableDeviceHomeState.unbound);
    }

    return Drawer(
      child: SafeArea(
        child: StreamBuilder<TableDeviceHomeState>(
          stream: _service.watchHomeState(tableId),
          initialData:
              initialState ??
              TableDeviceHomeState(
                kind: TableDeviceHomeKind.idle,
                tableId: tableId,
                tableName: tableId,
                registrationEnabled: false,
              ),
          builder: (context, snapshot) {
            return _buildDrawerContent(context, snapshot.data!);
          },
        ),
      ),
    );
  }

  Widget _buildDrawerContent(BuildContext context, TableDeviceHomeState state) {
    return ListView(
      children: [
        const DrawerHeader(
          child: Align(
            alignment: Alignment.bottomLeft,
            child: Text(
              '卓専用メニュー',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.home),
          title: const Text('卓ホームに戻る'),
          onTap: () => _navigateHome(context),
        ),
        if (state.kind == TableDeviceHomeKind.tournamentActive ||
            state.kind == TableDeviceHomeKind.tournamentScheduled)
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('トーナメントから登録解除'),
            onTap: () => _handleTournamentUnregister(context, state),
          ),
        if (state.kind == TableDeviceHomeKind.sideGameActive)
          ListTile(
            leading: const Icon(Icons.stop_circle_outlined),
            title: const Text('サイドゲームから登録解除'),
            onTap: () => _handleSideGameUnregister(context, state),
          ),
      ],
    );
  }

  Future<void> _handleTournamentUnregister(
    BuildContext context,
    TableDeviceHomeState state,
  ) async {
    final tableId = state.tableId;
    final tournamentId = state.tournamentId;
    if (tableId == null || tournamentId == null) {
      return;
    }

    final pageContext = Navigator.of(context, rootNavigator: true).context;
    Navigator.of(context).pop();
    final occupiedCount = await _resolveTournamentOccupiedCount(
      pageContext,
      tournamentId: tournamentId,
      tableId: tableId,
    );
    if (!pageContext.mounted || occupiedCount == null) return;

    String? passcode;
    if (occupiedCount > 0) {
      passcode = await _showForceClearDialog(pageContext, occupiedCount);
      if (!pageContext.mounted || passcode == null) return;
    }

    final completed = await _runWithLoadingDialog(
      pageContext,
      loadingMessage: 'トーナメント登録を解除しています...',
      action: () async {
        await _service.unregisterTableFromTournament(
          tableId: tableId,
          tournamentId: tournamentId,
          force: occupiedCount > 0,
          passcode: passcode,
        );
      },
      errorTitle: 'トーナメント解除に失敗しました',
    );
    if (!pageContext.mounted || !completed) return;

    await _showMessageDialog(
      pageContext,
      title: 'トーナメント登録を解除しました',
      message: '卓をトーナメントから登録解除しました。',
    );
    if (!pageContext.mounted) return;
    _navigateHome(pageContext);
  }

  Future<void> _handleSideGameUnregister(
    BuildContext context,
    TableDeviceHomeState state,
  ) async {
    final tableId = state.tableId;
    if (tableId == null) return;

    final pageContext = Navigator.of(context, rootNavigator: true).context;
    Navigator.of(context).pop();
    final occupiedCount = await _resolveSideGameOccupiedCount(
      pageContext,
      tableId,
    );
    if (!pageContext.mounted || occupiedCount == null) return;

    String? passcode;
    if (occupiedCount > 0) {
      passcode = await _showForceClearDialog(pageContext, occupiedCount);
      if (!pageContext.mounted || passcode == null) return;
    }

    final completed = await _runWithLoadingDialog(
      pageContext,
      loadingMessage: 'サイドゲームを終了しています...',
      action: () async {
        await _service.unregisterTableFromSideGame(
          tableId: tableId,
          force: occupiedCount > 0,
          passcode: passcode,
        );
      },
      errorTitle: 'サイドゲーム終了に失敗しました',
    );
    if (!pageContext.mounted || !completed) return;

    await _showMessageDialog(
      pageContext,
      title: 'サイドゲームを終了しました',
      message: '卓のサイドゲームを終了しました。',
    );
    if (!pageContext.mounted) return;
    _navigateHome(pageContext);
  }

  Future<int?> _resolveTournamentOccupiedCount(
    BuildContext context, {
    required String tournamentId,
    required String tableId,
  }) async {
    try {
      return await _service.getTournamentOccupiedSeatCount(
        tournamentId: tournamentId,
        tableId: tableId,
      );
    } catch (error) {
      if (!context.mounted) return null;
      await _showMessageDialog(
        context,
        title: 'トーナメント解除に失敗しました',
        message: _service.formatFunctionsError(error),
      );
      return null;
    }
  }

  Future<int?> _resolveSideGameOccupiedCount(
    BuildContext context,
    String tableId,
  ) async {
    try {
      return await _service.getSideGameOccupiedSeatCount(tableId);
    } catch (error) {
      if (!context.mounted) return null;
      await _showMessageDialog(
        context,
        title: 'サイドゲーム終了に失敗しました',
        message: _service.formatFunctionsError(error),
      );
      return null;
    }
  }

  Future<String?> _showForceClearDialog(
    BuildContext context,
    int occupiedCount,
  ) async {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('強制クリア確認'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '警告: 着席者が $occupiedCount 名いる状態でトーナメントから卓を解除すると、'
              'トーナメント進行データが破損する可能性があります。',
              style: const TextStyle(
                color: Colors.red,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'この操作の前に、卓端末で「バーストし離席する」を行うか、'
              '管理用デバイスから別卓へ移動させてください。',
            ),
            const SizedBox(height: 12),
            const Text('やむを得ず強制解除する場合のみ、管理用の4桁パスコードを入力してください。'),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              maxLength: 4,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: '強制解除用4桁パスコード',
                border: OutlineInputBorder(),
                counterText: '',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('解除する'),
          ),
        ],
      ),
    );
  }

  Future<bool> _runWithLoadingDialog(
    BuildContext context, {
    required String loadingMessage,
    required Future<void> Function() action,
    required String errorTitle,
  }) async {
    var loadingVisible = true;
    void closeLoading() {
      if (!loadingVisible || !context.mounted) {
        return;
      }
      loadingVisible = false;
      Navigator.of(context, rootNavigator: true).pop();
    }

    _showLoadingDialog(context, message: loadingMessage);
    try {
      await action();
      return true;
    } catch (error) {
      if (context.mounted) {
        closeLoading();
        await _showMessageDialog(
          context,
          title: errorTitle,
          message: _service.formatFunctionsError(error),
        );
      }
      return false;
    } finally {
      closeLoading();
    }
  }

  void _showLoadingDialog(BuildContext context, {required String message}) {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      useRootNavigator: true,
      builder: (dialogContext) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
              const SizedBox(width: 16),
              Expanded(child: Text(message)),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showMessageDialog(
    BuildContext context, {
    required String title,
    required String message,
  }) async {
    await showDialog<void>(
      context: context,
      useRootNavigator: true,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          FilledButton(
            onPressed: () =>
                Navigator.of(dialogContext, rootNavigator: true).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _navigateHome(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => TableDedicatedHomePage(tableId: tableId),
      ),
      (route) => false,
    );
  }
}
