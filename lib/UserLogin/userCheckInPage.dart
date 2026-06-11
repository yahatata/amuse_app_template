import 'package:amuse_app_template/UserLogin/UserManualCheckInPage.dart';
import 'package:amuse_app_template/UserRegisterView/userQRCheckInPage.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/HomeBackAction.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';

class OkibakeLoginPromptEntry {
  const OkibakeLoginPromptEntry({
    required this.tournamentId,
    required this.okibakeEntryId,
    required this.entryStatus,
    required this.billLinkStatus,
    this.tournamentName,
    this.displayName,
    this.temporaryDisplayName,
    this.linkedUserPokerName,
  });

  final String tournamentId;
  final String? tournamentName;
  final String okibakeEntryId;
  final String entryStatus;
  final String billLinkStatus;
  final String? displayName;
  final String? temporaryDisplayName;
  final String? linkedUserPokerName;

  String get label {
    final options = [
      linkedUserPokerName,
      temporaryDisplayName,
      displayName,
    ];
    for (final text in options) {
      final v = text?.trim();
      if (v != null && v.isNotEmpty) return v;
    }
    return okibakeEntryId;
  }

  factory OkibakeLoginPromptEntry.fromMap(Map<dynamic, dynamic> map) {
    String str(String key) => (map[key] ?? '').toString();
    return OkibakeLoginPromptEntry(
      tournamentId: str('tournamentId'),
      tournamentName: map['tournamentName']?.toString(),
      okibakeEntryId: str('okibakeEntryId'),
      entryStatus: str('entryStatus'),
      billLinkStatus: str('billLinkStatus'),
      displayName: map['displayName']?.toString(),
      temporaryDisplayName: map['temporaryDisplayName']?.toString(),
      linkedUserPokerName: map['linkedUserPokerName']?.toString(),
    );
  }
}

class OkibakeLoginPromptData {
  const OkibakeLoginPromptData({
    required this.mode,
    required this.count,
    required this.entries,
  });

  final String mode;
  final int count;
  final List<OkibakeLoginPromptEntry> entries;

  bool get hasTargets => count > 0;
  bool get isNoticeOnly => mode == 'notice_only';
  bool get isLinkPrompt => mode == 'link_prompt';
  bool get isNone => mode == 'none';

  factory OkibakeLoginPromptData.fromMap(Map<dynamic, dynamic> map) {
    final rawEntries = map['entries'];
    final parsedEntries = <OkibakeLoginPromptEntry>[];
    if (rawEntries is List) {
      for (final e in rawEntries) {
        if (e is Map) {
          parsedEntries.add(OkibakeLoginPromptEntry.fromMap(e));
        }
      }
    }
    final countRaw = map['count'];
    final count = countRaw is num ? countRaw.toInt() : parsedEntries.length;
    return OkibakeLoginPromptData(
      mode: (map['mode'] ?? 'notice_only').toString(),
      count: count,
      entries: parsedEntries,
    );
  }
}

/// 手動/QR チェックイン画面から親 [UserCheckInPage] へ返す結果。
class UserCheckInResult {
  const UserCheckInResult({
    required this.success,
    required this.message,
    this.userId,
    this.billId,
    this.okibakeLoginPrompt,
  });

  final bool success;
  final String message;
  final String? userId;
  final String? billId;
  final OkibakeLoginPromptData? okibakeLoginPrompt;
}

class UserCheckInPage extends StatefulWidget {
  const UserCheckInPage({super.key});

  @override
  State<UserCheckInPage> createState() => _UserCheckInPageState();
}

class _UserCheckInPageState extends State<UserCheckInPage> {
  bool _linking = false;
  final TournamentService _tournamentService = TournamentServiceImpl();

  Future<void> _openManualCheckIn() async {
    final result = await Navigator.push<UserCheckInResult>(
      context,
      MaterialPageRoute(builder: (_) => const UserManualCheckInPage()),
    );
    if (!mounted || result == null) return;
    _showCheckInResultDialog(result);
  }

  Future<void> _openQRCheckIn() async {
    final result = await Navigator.push<UserCheckInResult>(
      context,
      MaterialPageRoute(builder: (_) => const UserQRCheckInPage()),
    );
    if (!mounted || result == null) return;
    _showCheckInResultDialog(result);
  }

  void _showCheckInResultDialog(UserCheckInResult result) {
    if (!mounted) return;

    final prompt = result.okibakeLoginPrompt;
    final shouldNotice =
        result.success && prompt != null && prompt.hasTargets && !prompt.isNone;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(
              result.success ? Icons.check_circle : Icons.error,
              color: result.success ? Colors.green : Colors.red,
            ),
            const SizedBox(width: 8),
            Text(
              result.success ? 'ログイン成功' : 'ログイン失敗',
              style: TextStyle(
                color: result.success ? Colors.green : Colors.red,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        content: Text(_buildResultMessage(result.message, prompt, shouldNotice)),
        actions: [
          if (shouldNotice && prompt.isLinkPrompt && prompt.entries.isNotEmpty)
            TextButton(
              onPressed: _linking
                  ? null
                  : () async {
                      Navigator.of(context).pop();
                      await _showLinkPromptDialog(
                        prompt,
                        userId: result.userId,
                        billId: result.billId,
                      );
                    },
              child: const Text('伝票紐付け'),
            ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  String _buildResultMessage(
    String base,
    OkibakeLoginPromptData? prompt,
    bool shouldNotice,
  ) {
    if (!shouldNotice || prompt == null) return base;
    final pendingReviewEntries = prompt.entries
        .where((e) => e.billLinkStatus == 'pending_review')
        .toList(growable: false);
    final todayUnlinkedEntries = prompt.entries
        .where((e) => e.billLinkStatus == 'unlinked')
        .toList(growable: false);

    final lines = <String>[];
    if (todayUnlinkedEntries.isNotEmpty) {
      final names = todayUnlinkedEntries
          .map((e) => e.tournamentName?.trim() ?? '')
          .where((name) => name.isNotEmpty)
          .toSet()
          .toList()
        ..sort();
      if (names.isEmpty) {
        lines.add('当日トーナメントに未接続の置きバケがあります。トーナメントページを確認してください。');
      } else if (names.length == 1) {
        lines.add('${names.first}（トーナメント）にて置きバケ配置があります。確認してください。');
      } else {
        lines.add('${names.join('、')} の各トーナメントで置きバケ配置があります。確認してください。');
      }
    }
    if (pendingReviewEntries.isNotEmpty) {
      lines.add('要対応会計に未接続の置きバケがあります。要対応会計ページを確認してください。');
    }

    if (lines.isEmpty) return base;
    return '$base\n\n${lines.join('\n')}';
  }

  Future<void> _showLinkPromptDialog(
    OkibakeLoginPromptData prompt, {
    required String? userId,
    required String? billId,
  }) async {
    if (!mounted) return;
    if (userId == null || userId.isEmpty || billId == null || billId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('伝票情報が不足しているため紐付けできません')),
      );
      return;
    }

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) => PopScope(
            canPop: !_linking,
            child: SizedBox.expand(
              child: Stack(
                children: [
                  AlertDialog(
                  title: const Text('未接続の置きバケ'),
                  content: SizedBox(
                    width: 420,
                    child: AbsorbPointer(
                      absorbing: _linking,
                      child: prompt.entries.isEmpty
                          ? const Text('紐付け対象はありません。')
                          : ListView.separated(
                              shrinkWrap: true,
                              itemCount: prompt.entries.length,
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (_, index) {
                                final entry = prompt.entries[index];
                                return ListTile(
                                  dense: true,
                                  title: Text(
                                    (entry.tournamentName?.trim().isNotEmpty ?? false)
                                        ? '${entry.tournamentName}（トーナメント）'
                                        : 'トーナメントID: ${entry.tournamentId}',
                                  ),
                                  trailing: ElevatedButton(
                                    onPressed: _linking
                                        ? null
                                        : () async {
                                            setLocal(() => _linking = true);
                                            try {
                                              final res = await _tournamentService
                                                  .linkOkibakeTemporaryEntryToBill(
                                                tournamentId: entry.tournamentId,
                                                okibakeEntryId: entry.okibakeEntryId,
                                                userId: userId,
                                                billId: billId,
                                              );
                                              if (!mounted) return;
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                SnackBar(
                                                  content: Text(
                                                    res.success
                                                        ? '伝票紐付けしました'
                                                        : (res.errorMessage?.isNotEmpty ?? false)
                                                            ? '伝票紐付けに失敗しました: ${res.errorMessage}'
                                                            : '伝票紐付けに失敗しました',
                                                  ),
                                                  backgroundColor: res.success
                                                      ? Colors.green
                                                      : Colors.red.shade700,
                                                ),
                                              );
                                            } finally {
                                              if (mounted) {
                                                setLocal(() => _linking = false);
                                              }
                                            }
                                          },
                                    child: const Text('紐付け'),
                                  ),
                                );
                              },
                            ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: _linking ? null : () => Navigator.of(ctx).pop(),
                      child: const Text('閉じる'),
                    ),
                  ],
                ),
                  if (_linking)
                    Positioned.fill(
                      child: AbsorbPointer(
                        child: ColoredBox(
                          color: Colors.black.withValues(alpha: 0.35),
                          child: const Center(child: CircularProgressIndicator()),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ユーザーログイン'),
        centerTitle: true,
        actions: [
          buildHomeButton(context), // ← 追加
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ElevatedButton.icon(
                icon: const Icon(Icons.qr_code),
                label: const Text('QRチェックイン'),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 50),
                  textStyle: const TextStyle(fontSize: 18),
                ),
                onPressed: _openQRCheckIn,
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                icon: const Icon(Icons.edit),
                label: const Text('手動チェックイン'),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 50),
                  textStyle: const TextStyle(fontSize: 18),
                ),
                onPressed: _openManualCheckIn,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
