import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/tournament/active/models/okibake_temporary_entry.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/okibake_bill_link_stay_candidates.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_link_user_picker_dialog.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// 伝票紐付け成功時、紐付け先ユーザー表示名を返す。キャンセル・失敗は `null`。
Future<String?> showOkibakeLinkBillDialog({
  required BuildContext context,
  required String tournamentId,
  required String okibakeEntryId,
  required String displayName,
  required TournamentService service,
}) {
  return showDialog<String?>(
    context: context,
    barrierDismissible: false,
    builder: (dialogCtx) {
      return OkibakeLinkBillDialog(
        tournamentId: tournamentId,
        okibakeEntryId: okibakeEntryId,
        displayName: displayName,
        service: service,
      );
    },
  );
}

class OkibakeLinkBillDialog extends StatefulWidget {
  const OkibakeLinkBillDialog({
    super.key,
    required this.tournamentId,
    required this.okibakeEntryId,
    required this.displayName,
    required this.service,
  });

  final String tournamentId;
  final String okibakeEntryId;
  final String displayName;
  final TournamentService service;

  @override
  State<OkibakeLinkBillDialog> createState() => _OkibakeLinkBillDialogState();
}

class _OkibakeLinkBillDialogState extends State<OkibakeLinkBillDialog> {
  bool _submitting = false;
  bool _entryLoading = true;
  String? _entryLoadError;

  String? _linkedUserId;
  String? _linkedUserPokerName;
  String? _memo;
  String _billLinkStatus = 'unlinked';
  String? _templateId;

  String? _selectedUserId;
  bool _initialSelectionApplied = false;
  int _stayRetryToken = 0;

  QuerySnapshot<Map<String, dynamic>>? _cachedStaySnapshot;
  String? _cachedLinkedUserId;
  Future<List<OkibakeBillLinkStayCandidate>>? _cachedCandidatesFuture;

  @override
  void initState() {
    super.initState();
    _loadDialogContext();
  }

  Future<List<OkibakeBillLinkStayCandidate>> _loadCandidates(
    QuerySnapshot<Map<String, dynamic>> staySnap,
  ) async {
    final templateId = _templateId;
    if (templateId == null || templateId.isEmpty) {
      return const [];
    }
    if (identical(_cachedStaySnapshot, staySnap) &&
        _cachedLinkedUserId == _linkedUserId &&
        _cachedCandidatesFuture != null) {
      return _cachedCandidatesFuture!;
    }
    final usedLinkedUserIds = await fetchUsedOkibakeLinkedUserIds(
      tournamentId: widget.tournamentId,
      excludeOkibakeEntryId: widget.okibakeEntryId,
    );
    _cachedStaySnapshot = staySnap;
    _cachedLinkedUserId = _linkedUserId;
    _cachedCandidatesFuture =
        filterOkibakeBillLinkStayCandidatesExcludingRegistered(
      staySnapshot: staySnap,
      templateId: templateId,
      linkedUserId: _linkedUserId,
      excludedUserIds: usedLinkedUserIds,
    );
    return _cachedCandidatesFuture!;
  }

  Future<void> _loadDialogContext() async {
    setState(() {
      _entryLoading = true;
      _entryLoadError = null;
    });
    try {
      final db = FirebaseFirestore.instance;
      final tourRef =
          db.collection('scheduledTournaments').doc(widget.tournamentId);
      final entryRef =
          tourRef.collection('okibakeTemporaryEntries').doc(widget.okibakeEntryId);

      final results = await Future.wait([
        tourRef.get().timeout(const Duration(seconds: 15)),
        entryRef.get().timeout(const Duration(seconds: 15)),
      ]);

      if (!mounted) return;

      final tourSnap = results[0];
      final entrySnap = results[1];

      if (!entrySnap.exists) {
        setState(() {
          _entryLoading = false;
          _entryLoadError = kTournamentOkibakeNotFoundMessage;
        });
        return;
      }

      final tourData = tourSnap.data() ?? {};
      final templateId = tourData['templateId'];
      if (templateId is! String || templateId.trim().isEmpty) {
        setState(() {
          _entryLoading = false;
          _entryLoadError = kTournamentOkibakeBadDataMessage;
        });
        return;
      }

      final entry = OkibakeTemporaryEntry.fromDoc(entrySnap);
      setState(() {
        _templateId = templateId.trim();
        _linkedUserId = entry.linkedUserId;
        _linkedUserPokerName = entry.linkedUserPokerName;
        _memo = entry.memo;
        _billLinkStatus = entry.billLinkStatus;
        _entryLoading = false;
        _cachedStaySnapshot = null;
        _cachedLinkedUserId = null;
        _cachedCandidatesFuture = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _entryLoading = false;
        _entryLoadError = mapTournamentOkibakeEntryLoadError(e);
      });
    }
  }

  OkibakeBillLinkStayCandidate? _selectedCandidate(
    List<OkibakeBillLinkStayCandidate> candidates,
  ) =>
      findOkibakeBillLinkStayCandidate(candidates, _selectedUserId);

  bool get _canLinkBill =>
      _billLinkStatus == 'unlinked' || _billLinkStatus == 'pending_review';

  Future<bool> _confirmLink(OkibakeBillLinkStayCandidate selected) async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (confirmCtx) {
        return AlertDialog(
          title: const Text('伝票紐付けの確認'),
          content: Text(
            'この置きバケを ${selected.displayLabel} の伝票に紐付けますか？',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(confirmCtx).pop(false),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(confirmCtx).pop(true),
              child: const Text('紐付ける'),
            ),
          ],
        );
      },
    );
    return ok == true;
  }

  Future<void> _submit(OkibakeBillLinkStayCandidate selected) async {
    if (_submitting || !_canLinkBill) return;

    final proceed = await _confirmLink(selected);
    if (!mounted || !proceed) return;

    setState(() => _submitting = true);
    try {
      final result = await widget.service.linkOkibakeTemporaryEntryToBill(
        tournamentId: widget.tournamentId,
        okibakeEntryId: widget.okibakeEntryId,
        userId: selected.userId,
        billId: selected.billId,
      );
      if (!mounted) return;

      if (result.success) {
        Navigator.of(context).pop(selected.displayLabel);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              result.errorMessage != null && result.errorMessage!.isNotEmpty
                  ? '伝票紐付けに失敗しました: ${result.errorMessage}'
                  : '伝票紐付けに失敗しました',
            ),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Widget _buildTargetHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          runSpacing: 6,
          children: [
            Text(
              widget.displayName,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.amber.shade100,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.amber.shade700),
              ),
              child: Text(
                '置きバケ',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: Colors.amber.shade900,
                ),
              ),
            ),
          ],
        ),
        if (_memo != null) ...[
          const SizedBox(height: 8),
          Text(
            'メモ: $_memo',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade800),
          ),
        ],
        if (_linkedUserPokerName != null &&
            (_linkedUserId == null ||
                _selectedUserId == null ||
                _selectedUserId != _linkedUserId)) ...[
          const SizedBox(height: 6),
          Text(
            '登録時候補: $_linkedUserPokerName',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          ),
        ],
        if (!_canLinkBill) ...[
          const SizedBox(height: 8),
          Text(
            _billLinkStatus == 'linked'
                ? 'この置きバケはすでに伝票に紐付け済みです。'
                : '現在の状態では伝票紐付けできません。',
            style: TextStyle(fontSize: 13, color: Colors.red.shade700),
          ),
        ],
      ],
    );
  }

  Widget _buildCandidateArea(List<OkibakeBillLinkStayCandidate> candidates) {
    if (candidates.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text(
          formatOkibakeBillLinkEmptyCandidatesMessage(linkedUserId: _linkedUserId),
          style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
          textAlign: TextAlign.center,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '来店中ユーザー',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: Colors.grey.shade800,
          ),
        ),
        const SizedBox(height: 8),
        ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 240),
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: candidates.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final c = candidates[index];
              final selected = _selectedUserId == c.userId;
              return ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  selected ? Icons.radio_button_checked : Icons.radio_button_off,
                  color: selected ? Colors.amber.shade800 : Colors.grey,
                ),
                title: Text(c.displayLabel),
                onTap: _submitting
                    ? null
                    : () => setState(() => _selectedUserId = c.userId),
              );
            },
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);

    return PopScope(
      canPop: !_submitting,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: AlertDialog(
                title: const Text('伝票紐付け'),
                content: SizedBox(
                  width: 460,
                  child: _entryLoading
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(child: CircularProgressIndicator()),
                        )
                      : _entryLoadError != null
                          ? Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  _entryLoadError!,
                                  style:
                                      TextStyle(color: Colors.red.shade700),
                                ),
                                const SizedBox(height: 12),
                                ElevatedButton(
                                  onPressed: _submitting
                                      ? null
                                      : _loadDialogContext,
                                  child: const Text('再試行'),
                                ),
                              ],
                            )
                          : StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                              key: ValueKey('okibake-link-stay-$_stayRetryToken'),
                              stream: ActiveStaysService.instance.stream,
                              builder: (context, staySnap) {
                                if (staySnap.hasError) {
                                  return Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        kTournamentActiveStaysLoadFailedMessage,
                                        style: TextStyle(
                                          color: Colors.red.shade700,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      TextButton(
                                        onPressed: _submitting
                                            ? null
                                            : () => setState(() {
                                                  _stayRetryToken++;
                                                  _selectedUserId = null;
                                                  _initialSelectionApplied =
                                                      false;
                                                  _cachedStaySnapshot = null;
                                                  _cachedCandidatesFuture =
                                                      null;
                                                }),
                                        child: const Text('再試行'),
                                      ),
                                    ],
                                  );
                                }
                                if (!staySnap.hasData) {
                                  return const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 16),
                                    child: Center(
                                      child: CircularProgressIndicator(),
                                    ),
                                  );
                                }

                                return FutureBuilder<
                                    List<OkibakeBillLinkStayCandidate>>(
                                  future: _loadCandidates(staySnap.data!),
                                  builder: (context, candSnap) {
                                    if (candSnap.connectionState ==
                                        ConnectionState.waiting) {
                                      return const Padding(
                                        padding:
                                            EdgeInsets.symmetric(vertical: 16),
                                        child: Center(
                                          child: CircularProgressIndicator(),
                                        ),
                                      );
                                    }
                                    if (candSnap.hasError) {
                                      return Column(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            kTournamentCandidatesLoadFailedMessage,
                                            style: TextStyle(
                                              color: Colors.red.shade700,
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          TextButton(
                                            onPressed: _submitting
                                                ? null
                                                : () => setState(() {
                                                      _cachedStaySnapshot =
                                                          null;
                                                      _cachedCandidatesFuture =
                                                          null;
                                                      _selectedUserId = null;
                                                      _initialSelectionApplied =
                                                          false;
                                                    }),
                                            child: const Text('再試行'),
                                          ),
                                        ],
                                      );
                                    }

                                    final candidates =
                                        candSnap.data ?? const [];

                                    if (!_initialSelectionApplied) {
                                      WidgetsBinding.instance
                                          .addPostFrameCallback((_) {
                                        if (!mounted ||
                                            _initialSelectionApplied) {
                                          return;
                                        }
                                        final initial =
                                            resolveInitialOkibakeBillLinkUserId(
                                          _linkedUserId,
                                          candidates,
                                        );
                                        setState(() {
                                          if (initial != null) {
                                            _selectedUserId = initial;
                                          }
                                          _initialSelectionApplied = true;
                                        });
                                      });
                                    }
                                    final selected =
                                        _selectedCandidate(candidates);

                                    return SingleChildScrollView(
                                      child: Column(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment:
                                            CrossAxisAlignment.stretch,
                                        children: [
                                          _buildTargetHeader(),
                                          const SizedBox(height: 16),
                                          _buildCandidateArea(candidates),
                                          if (selected != null) ...[
                                            const SizedBox(height: 12),
                                            Text(
                                              '選択中: ${selected.displayLabel}',
                                              style: TextStyle(
                                                fontSize: 13,
                                                fontWeight: FontWeight.w600,
                                                color: Colors.amber.shade900,
                                              ),
                                            ),
                                          ],
                                        ],
                                      ),
                                    );
                                  },
                                );
                              },
                            ),
                ),
                actions: [
                  TextButton(
                    onPressed: _submitting
                        ? null
                        : () => Navigator.of(context).pop(null),
                    child: const Text('閉じる'),
                  ),
                  StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                    key: ValueKey('okibake-link-actions-$_stayRetryToken'),
                    stream: ActiveStaysService.instance.stream,
                    builder: (context, staySnap) {
                      final streamFailed = staySnap.hasError;
                      return FutureBuilder<List<OkibakeBillLinkStayCandidate>>(
                        future: staySnap.hasData &&
                                !streamFailed &&
                                _templateId != null
                            ? _loadCandidates(staySnap.data!)
                            : Future.value(const []),
                        builder: (context, candSnap) {
                          final candidates = candSnap.data ?? const [];
                          final selected = _selectedCandidate(candidates);
                          final enabled = !_submitting &&
                              !_entryLoading &&
                              _entryLoadError == null &&
                              !streamFailed &&
                              !candSnap.hasError &&
                              _canLinkBill &&
                              candSnap.connectionState ==
                                  ConnectionState.done &&
                              isOkibakeBillLinkSubmitEnabled(selected);

                          return ElevatedButton(
                            onPressed: enabled && selected != null
                                ? () => _submit(selected)
                                : null,
                            child: const Text('紐付ける'),
                          );
                        },
                      );
                    },
                  ),
                ],
              ),
            ),
            if (_submitting)
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
}
