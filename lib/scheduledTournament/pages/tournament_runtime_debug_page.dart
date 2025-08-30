import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'dart:convert';
import '../model/runtime_main.dart';
import '../repositories/tournament_repo.dart';
import '../widgets/stage_preview_list.dart';
import '../widgets/admin_controls.dart';
import 'tournament_blind_screen.dart';

/// トーナメントのRuntime状態をデバッグ表示するページ
class TournamentRuntimeDebugPage extends StatefulWidget {
  final String tournamentId;

  const TournamentRuntimeDebugPage({
    Key? key,
    required this.tournamentId,
  }) : super(key: key);

  @override
  State<TournamentRuntimeDebugPage> createState() => _TournamentRuntimeDebugPageState();
}

class _TournamentRuntimeDebugPageState extends State<TournamentRuntimeDebugPage> {
  final TournamentRepository _repository = TournamentRepository();
  bool _isInitializing = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Runtime Debug - ${widget.tournamentId}'),
        backgroundColor: Colors.blue[700],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refreshData,
            tooltip: '更新',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // トーナメント情報ヘッダー
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
              ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'トーナメントID: ${widget.tournamentId}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                  Text(
                    'Runtime ドキュメントパス:',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                  Text(
                    'scheduledTournaments/${widget.tournamentId}/views/runtime',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 16),
            
            // 管理コントロール
            StreamBuilder<RuntimeMain?>(
              stream: _repository.watchRuntime(widget.tournamentId),
              builder: (context, snapshot) {
                // エラーログを出力
                if (snapshot.hasError) {
                  print('=== AdminControls StreamBuilder Error ===');
                  print('Tournament ID: ${widget.tournamentId}');
                  print('Error: ${snapshot.error}');
                  print('Error Type: ${snapshot.error.runtimeType}');
                  print('=========================================');
                }
                
                if (snapshot.hasData && snapshot.data != null) {
                  return AdminControls(
                    tournamentId: widget.tournamentId,
                    currentStatus: snapshot.data!.status,
                    startRev: snapshot.data!.startRev,
                    registRev: snapshot.data!.registRev,
                    plannedStartAt: snapshot.data!.plannedStartAt?.toDate(),
                    plannedRegistAt: snapshot.data!.plannedRegistAt?.toDate(),
                    onStatusChanged: () {
                      // 状態変更時にStreamBuilderを再構築
                      setState(() {});
                    },
                  );
                }
                return const SizedBox.shrink();
              },
            ),
            
            const SizedBox(height: 16),
            
            // ボタンセクション
            _buildButtonSection(),
            
            const SizedBox(height: 16),
            
            // Runtime状態の表示
            StreamBuilder<RuntimeMain?>(
              stream: _repository.watchRuntime(widget.tournamentId),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircularProgressIndicator(),
                        SizedBox(height: 16),
                        Text('Runtime データを読み込み中...'),
                      ],
                    ),
                  );
                }

                if (snapshot.hasError) {
                  // エラーログを出力
                  print('=== Runtime Debug Page Error ===');
                  print('Tournament ID: ${widget.tournamentId}');
                  print('Error: ${snapshot.error}');
                  print('Error Type: ${snapshot.error.runtimeType}');
                  print('Connection State: ${snapshot.connectionState}');
                  print('Has Data: ${snapshot.hasData}');
                  print('Data: ${snapshot.data}');
                  print('================================');
                  
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.error_outline,
                          size: 64,
                          color: Colors.red[400],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Runtime データの読み込みエラー',
                          style: TextStyle(
                            fontSize: 18,
                            color: Colors.red[600],
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          snapshot.error.toString(),
                          style: TextStyle(color: Colors.red[600]),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 16),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.grey[100],
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'デバッグ情報:',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.grey[700],
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Tournament ID: ${widget.tournamentId}',
                                style: TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                  color: Colors.grey[600],
                                ),
                              ),
                              Text(
                                'Firestore Path: scheduledTournaments/${widget.tournamentId}/views/runtime',
                                style: TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                  color: Colors.grey[600],
                                ),
                              ),
                              Text(
                                'Error Type: ${snapshot.error.runtimeType}',
                                style: TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                  color: Colors.grey[600],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }

                final runtime = snapshot.data;
                
                if (runtime == null) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.info_outline,
                          size: 64,
                          color: Colors.orange[400],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Runtime ドキュメントが見つかりません',
                          style: TextStyle(
                            fontSize: 18,
                            color: Colors.orange[600],
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          '「Runtime初期化」をクリックしてドキュメントを作成してください',
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  );
                }

                return _buildRuntimeDisplay(runtime);
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRuntimeDisplay(RuntimeMain runtime) {
    final debugMap = runtime.toDebugMap();
    final jsonString = const JsonEncoder.withIndent('  ').convert(debugMap);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ステータス表示
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: _getStatusColor(runtime.status),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '現在の状態',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  runtime.status.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
          
          const SizedBox(height: 16),
          
          // タイムスタンプ情報
          _buildTimestampSection(runtime),
          
          const SizedBox(height: 16),
          
          // 数値情報
          _buildNumericSection(runtime),
          
          const SizedBox(height: 16),
          
          // ステージプレビュー
          _buildStagePreviewSection(runtime),
          
          const SizedBox(height: 16),
          
          // JSON表示
                  const Text(
          '生JSONデータ',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: SelectableText(
              jsonString,
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

  Widget _buildTimestampSection(RuntimeMain runtime) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'タイムスタンプ',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        _buildTimestampItem('開始時刻', runtime.startedAt),
        _buildTimestampItem('一時停止時刻', runtime.pausedAt),
        _buildTimestampItem('レイトレジ締切時刻', runtime.regClosedAt),
        _buildTimestampItem('予定開始時刻', runtime.plannedStartAt),
        _buildTimestampItem('予定レイトレジ締切時刻', runtime.plannedRegistAt),
        _buildTimestampItem('実際のレイトレジ締切時刻', runtime.registAt),
        _buildTimestampItem('最終更新時刻', runtime.updatedAt),
      ],
    );
  }

  Widget _buildTimestampItem(String label, Timestamp? timestamp) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(
            child: Text(
              timestamp?.toDate().toIso8601String() ?? 'null',
              style: TextStyle(
                fontFamily: 'monospace',
                color: timestamp == null ? Colors.grey[600] : Colors.black,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNumericSection(RuntimeMain runtime) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '数値',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        _buildNumericItem('シフト秒数', runtime.shiftSec),
        _buildNumericItem('開始タスクRev', runtime.startRev),
        _buildNumericItem('レジストタスクRev', runtime.registRev),
      ],
    );
  }

  Widget _buildNumericItem(String label, int value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 180,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Text(
            value.toString(),
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStagePreviewSection(RuntimeMain runtime) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'ステージプレビュー',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          height: 300,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey[300]!),
            borderRadius: BorderRadius.circular(8),
          ),
          child: StagePreviewList(
            stages: runtime.stages,
            lateRegUntilLev: runtime.lateRegUntilLev,
            breakDurationSec: runtime.breakDurationSec,
          ),
        ),
      ],
    );
  }

  Widget _buildButtonSection() {
    return Column(
      children: [
        // 初期化ボタン
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _isInitializing ? null : _initializeRuntime,
            icon: _isInitializing 
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.add_circle),
            label: Text(_isInitializing ? '初期化中...' : 'Runtime初期化'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green[600],
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
        
        const SizedBox(height: 12),
        
        
        // 進行中画面への遷移ボタン
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _navigateToBlindScreen,
            icon: const Icon(Icons.timer),
            label: const Text('進行中画面を開く'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.purple[600],
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
      ],
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'scheduled':
        return Colors.blue[600]!;
      case 'running':
        return Colors.green[600]!;
      case 'paused':
        return Colors.orange[600]!;
      case 'ended':
        return Colors.red[600]!;
      default:
        return Colors.grey[600]!;
    }
  }

  Future<void> _initializeRuntime() async {
    setState(() {
      _isInitializing = true;
    });

    try {
      await _repository.initializeRuntime(widget.tournamentId);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Runtime ドキュメントが正常に初期化されました！'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Runtime初期化エラー: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isInitializing = false;
        });
      }
    }
  }

  void _refreshData() {
    setState(() {
      // StreamBuilderが自動的に再構築される
    });
  }



  void _navigateToBlindScreen() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => TournamentBlindScreen(
          tournamentId: widget.tournamentId,
        ),
      ),
    );
  }
}
