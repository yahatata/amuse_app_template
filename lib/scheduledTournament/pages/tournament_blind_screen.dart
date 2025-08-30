import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../model/runtime_main.dart';
import '../repositories/tournament_repo.dart';
import '../services/stage_builder.dart';
import '../services/server_time_helper.dart';
import '../widgets/countdown_display.dart';
import '../widgets/admin_controls.dart';

/// トーナメント進行中画面（カウントダウン・現在ステージ・次ステージ）
class TournamentBlindScreen extends StatefulWidget {
  final String tournamentId;

  const TournamentBlindScreen({
    super.key,
    required this.tournamentId,
  });

  @override
  State<TournamentBlindScreen> createState() => _TournamentBlindScreenState();
}

class _TournamentBlindScreenState extends State<TournamentBlindScreen>
    with WidgetsBindingObserver {
  final TournamentRepository _repository = TournamentRepository();
  RuntimeMain? _runtime;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeServerOffset();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    // フォアグラウンド復帰時の処理はTimerWidget内で自動的に行われる
  }

  /// サーバ時刻オフセットを初期化
  Future<void> _initializeServerOffset() async {
    await ServerTimeHelper.getServerOffset();
  }



  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('トーナメント進行'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              // リフレッシュ処理はStreamBuilderが自動的に行う
            },
          ),
        ],
      ),
      body: StreamBuilder<RuntimeMain?>(
        stream: _repository.watchRuntime(widget.tournamentId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 64,
                    color: Colors.red,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'エラーが発生しました',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    snapshot.error.toString(),
                    style: Theme.of(context).textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            );
          }

          final runtime = snapshot.data;
          if (runtime == null) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.info_outline,
                    size: 64,
                    color: Colors.blue,
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Runtime データが見つかりません',
                    style: TextStyle(fontSize: 18),
                  ),
                ],
              ),
            );
          }

          // Runtime データを更新
          _runtime = runtime;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                // メインカウントダウン表示
                CountdownDisplay(
                  startedAt: runtime.startedAt,
                  shiftSec: runtime.shiftSec,
                  pausedAt: runtime.pausedAt,
                  status: runtime.status,
                  stages: runtime.stages,
                  isRegClosed: runtime.registAt != null,
                  isPaused: runtime.status == 'paused',
                ),
                
                const SizedBox(height: 24),
                
                // 管理コントロール（管理者のみ）
                AdminControls(
                  tournamentId: widget.tournamentId,
                  currentStatus: runtime.status,
                  startRev: runtime.startRev,
                  registRev: runtime.registRev,
                  plannedStartAt: runtime.plannedStartAt?.toDate(),
                  plannedRegistAt: runtime.plannedRegistAt?.toDate(),
                  onStatusChanged: () {
                    // 状態変更時にStreamBuilderを再構築
                    setState(() {});
                  },
                ),
                
                const SizedBox(height: 24),
                
                // デバッグ情報（開発時のみ）
                if (Theme.of(context).platform == TargetPlatform.iOS ||
                    Theme.of(context).platform == TargetPlatform.android)
                  _buildDebugInfo(runtime),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildDebugInfo(RuntimeMain runtime) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'デバッグ情報',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 8),
          _buildDebugItem('Status', runtime.status),
          _buildDebugItem('Started At', runtime.startedAt?.toDate().toIso8601String() ?? 'null'),
          _buildDebugItem('Paused At', runtime.pausedAt?.toDate().toIso8601String() ?? 'null'),
          _buildDebugItem('Shift Sec', runtime.shiftSec.toString()),
          _buildDebugItem('Regist At', runtime.registAt?.toDate().toIso8601String() ?? 'null'),
          _buildDebugItem('Server Offset', ServerTimeHelper.currentOffset?.inMilliseconds.toString() ?? 'null'),
        ],
      ),
    );
  }

  Widget _buildDebugItem(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontWeight: FontWeight.w500,
                fontSize: 12,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}