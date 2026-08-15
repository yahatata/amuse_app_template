import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// Addon 回数表示の読込失敗（USER-14）。回数 0 とは別。
const String kTournamentUserAddonCountLoadFailedMessage =
    'Addon回数を取得できませんでした。再読み込みしてください。';

/// Tournament 卓 UserAction 用の Addon 回数表示スナップショット。
class AddonCounterSnapshot {
  const AddonCounterSnapshot({
    required this.isAddonEnabled,
    required this.limit,
    required this.count,
    required this.loadFailed,
  });

  final bool isAddonEnabled;
  final int limit;
  final int count;
  final bool loadFailed;
}

typedef AddonCounterLoader = Future<AddonCounterSnapshot> Function({
  required String tournamentId,
  required String userId,
});

/// Firestore から Addon 回数を読む（本番 loader）。
Future<AddonCounterSnapshot> loadAddonCounterSnapshot({
  required String tournamentId,
  required String userId,
  FirebaseFirestore? firestore,
}) async {
  final db = firestore ?? FirebaseFirestore.instance;
  try {
    final tournamentDoc =
        await db.collection('scheduledTournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
      return const AddonCounterSnapshot(
        isAddonEnabled: false,
        limit: 0,
        count: 0,
        loadFailed: true,
      );
    }

    final tData = tournamentDoc.data() ?? <String, dynamic>{};
    final snapshot =
        Map<String, dynamic>.from((tData['snapshot'] as Map?) ?? {});
    final isAddon = snapshot['isAddon'] == true;
    final limit = resolveAddonLimitPerPlayerUi(
      isAddon: isAddon,
      addonLimitPerPlayer: snapshot['addonLimitPerPlayer'],
    );

    if (!isAddon || limit <= 0) {
      return const AddonCounterSnapshot(
        isAddonEnabled: false,
        limit: 0,
        count: 0,
        loadFailed: false,
      );
    }

    final templateIdRaw = snapshot['templateId'] ?? tData['templateId'];
    final templateId = templateIdRaw is String ? templateIdRaw.trim() : '';
    if (templateId.isEmpty) {
      return AddonCounterSnapshot(
        isAddonEnabled: true,
        limit: limit,
        count: 0,
        loadFailed: true,
      );
    }

    var addonCount = 0;
    final activeStayDoc = await db.collection('activeStays').doc(userId).get();
    if (activeStayDoc.exists && activeStayDoc.data()?['isActive'] == true) {
      final billIdRaw = activeStayDoc.data()?['billId'];
      final billId = billIdRaw is String ? billIdRaw : '';
      if (billId.isNotEmpty) {
        final billTournamentDoc = await db
            .collection('bills')
            .doc(billId)
            .collection('tournaments')
            .doc(templateId)
            .get();
        if (billTournamentDoc.exists) {
          final bd = billTournamentDoc.data() ?? <String, dynamic>{};
          final c = bd['addonCount'];
          if (c is int) {
            addonCount = c;
          } else if (c is num) {
            addonCount = c.toInt();
          }
        }
      }
    }

    return AddonCounterSnapshot(
      isAddonEnabled: true,
      limit: limit,
      count: addonCount,
      loadFailed: false,
    );
  } catch (_) {
    return const AddonCounterSnapshot(
      isAddonEnabled: false,
      limit: 0,
      count: 0,
      loadFailed: true,
    );
  }
}

/// 個別参加者ダイアログの Addon カウンタ。
///
/// Future は State に保持し、親 rebuild では再生成しない。
class TournamentUserAddonCounter extends StatefulWidget {
  const TournamentUserAddonCounter({
    super.key,
    required this.tournamentId,
    required this.userId,
    this.onLoadFailedChanged,
    this.onLoadBusyChanged,
    this.loader,
  });

  final String tournamentId;
  final String userId;
  final ValueChanged<bool>? onLoadFailedChanged;
  final ValueChanged<bool>? onLoadBusyChanged;
  final AddonCounterLoader? loader;

  @override
  State<TournamentUserAddonCounter> createState() =>
      TournamentUserAddonCounterState();
}

@visibleForTesting
class TournamentUserAddonCounterState
    extends State<TournamentUserAddonCounter> {
  late Future<AddonCounterSnapshot> _future;
  int _loadGeneration = 0;

  @visibleForTesting
  int get loadGeneration => _loadGeneration;

  @visibleForTesting
  Future<AddonCounterSnapshot> get future => _future;

  @override
  void initState() {
    super.initState();
    _future = _startLoad();
  }

  @override
  void didUpdateWidget(covariant TournamentUserAddonCounter oldWidget) {
    super.didUpdateWidget(oldWidget);
    // loader はテスト注入用。参照比較すると親 rebuild のたびに再取得してしまう。
    if (oldWidget.tournamentId != widget.tournamentId ||
        oldWidget.userId != widget.userId) {
      _future = _startLoad();
    }
  }

  Future<AddonCounterSnapshot> _startLoad() {
    _loadGeneration++;
    final loader = widget.loader ?? loadAddonCounterSnapshot;
    return loader(
      tournamentId: widget.tournamentId,
      userId: widget.userId,
    );
  }

  void _reload() {
    setState(() {
      _future = _startLoad();
    });
  }

  void _notifyFailed(bool failed) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.onLoadFailedChanged?.call(failed);
    });
  }

  void _notifyBusy(bool busy) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.onLoadBusyChanged?.call(busy);
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AddonCounterSnapshot>(
      future: _future,
      builder: (context, snap) {
        final style = Theme.of(context)
            .textTheme
            .bodySmall
            ?.copyWith(color: Colors.black54);

        if (snap.connectionState == ConnectionState.waiting) {
          _notifyBusy(true);
          return Row(
            children: [
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 8),
              Text('Addon: 読み込み中...', style: style),
            ],
          );
        }

        _notifyBusy(false);
        final data = snap.data;
        if (data == null || data.loadFailed) {
          _notifyFailed(true);
          return Row(
            children: [
              Expanded(
                child: Text(
                  kTournamentUserAddonCountLoadFailedMessage,
                  style: style?.copyWith(color: Colors.red[700]),
                ),
              ),
              TextButton(
                onPressed: _reload,
                child: const Text('再読み込み'),
              ),
            ],
          );
        }

        _notifyFailed(false);
        if (!data.isAddonEnabled || data.limit <= 0) {
          return Text('Addon: 無効', style: style);
        }
        return Text(
          'Addon: 現在 ${data.count} / ${data.limit} 回',
          style: style,
        );
      },
    );
  }
}
