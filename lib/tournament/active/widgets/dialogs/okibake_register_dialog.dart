import 'dart:math';

import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_link_user_picker_dialog.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Phase2 置きバケ一時参加者を Callable 経由で登録する。
class OkibakeRegisterDialog extends StatefulWidget {
  const OkibakeRegisterDialog({
    super.key,
    required this.tournamentId,
    required this.service,
    required this.onRegistered,
  });

  final String tournamentId;
  final TournamentService service;
  final VoidCallback onRegistered;

  @override
  State<OkibakeRegisterDialog> createState() => _OkibakeRegisterDialogState();
}

class _OkibakeRegisterDialogState extends State<OkibakeRegisterDialog> {
  bool _submitting = false;
  final _memoController = TextEditingController();

  /// Callable 送信値・ドロップダウン表示順は yes が先頭（初期値と揃える）
  static const List<String> _addonValues = ['yes', 'no', 'unknown'];

  /// UI 文言（DB／Callable は英語値のまま）
  static String _addonLabelJa(String serverValue) {
    switch (serverValue) {
      case 'yes':
        return '希望する';
      case 'no':
        return '希望しない';
      default:
        return 'わからない';
    }
  }

  String _addonIntent = 'yes';

  /// Firestore `users` から取得済み（入店中フィルタ前）
  List<OkibakeLinkCandidate> _allCandidates = [];
  Set<String> _usedLinkedUserIds = const {};

  Future<void>? _usersLoadFuture;
  int _usersRetryToken = 0;
  int _stayRetryToken = 0;

  String? _selectedUserId;
  String? _selectedPokerName;

  Future<void> _loadUsersDocuments() async {
    final results = await Future.wait<dynamic>([
      fetchOkibakeLinkCandidates(),
      fetchUsedOkibakeLinkedUserIds(tournamentId: widget.tournamentId),
    ]);
    final list = results[0] as List<OkibakeLinkCandidate>;
    final used = results[1] as Set<String>;
    if (!mounted) return;
    setState(() {
      _allCandidates = list;
      _usedLinkedUserIds = used;
      if (_selectedUserId != null &&
          !list.any((c) => c.userId == _selectedUserId)) {
        _selectedUserId = null;
        _selectedPokerName = null;
      }
    });
  }

  void _retryUsersLoad() {
    setState(() {
      _selectedUserId = null;
      _selectedPokerName = null;
      _usersRetryToken++;
      _usersLoadFuture = _loadUsersDocuments();
    });
  }

  void _retryStayStream() {
    setState(() {
      _selectedUserId = null;
      _selectedPokerName = null;
      _stayRetryToken++;
    });
  }

  /// [staySnap]: `ActiveStaysService`（`isActive == true` のドキュメント。docId = userId）
  List<OkibakeLinkCandidate> _filterNotStaying(
    QuerySnapshot<Map<String, dynamic>> staySnap,
  ) {
    final notStaying = filterOkibakeLinkCandidatesNotStaying(_allCandidates, staySnap);
    return filterOkibakeLinkCandidatesUnusedByOkibake(notStaying, _usedLinkedUserIds);
  }

  @override
  void initState() {
    super.initState();
    _usersLoadFuture = _loadUsersDocuments();
  }

  @override
  void dispose() {
    _memoController.dispose();
    super.dispose();
  }

  Future<void> _pickUser(
    BuildContext outerContext,
    List<OkibakeLinkCandidate> available,
  ) async {
    final pickedId = await showDialog<String>(
      context: outerContext,
      builder: (_) => OkibakeLinkUserPickerDialog(
        available: available,
        initialSelectedUserId: _selectedUserId,
      ),
    );

    if (!mounted) return;
    if (pickedId == '*clear*') {
      setState(() {
        _selectedUserId = null;
        _selectedPokerName = null;
      });
      return;
    }
    if (pickedId == null) return;

    OkibakeLinkCandidate? cand;
    for (final c in available) {
      if (c.userId == pickedId) {
        cand = c;
        break;
      }
    }

    final name = cand?.linkedPokerName;
    setState(() {
      _selectedUserId = pickedId;
      _selectedPokerName = name;
    });
  }

  Future<void> _submit() async {
    if (_submitting) return;

    final confirmed = await _confirmSubmit();
    if (!mounted || !confirmed) return;

    setState(() => _submitting = true);
    late CreateOkibakeTemporaryEntryResult result;
    try {
      final operationId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
      final device = await DeviceService().getCurrentDevice();
      final deviceName = device?.name;

      final memoRaw = _memoController.text.trim();
      final memo = memoRaw.isEmpty ? null : memoRaw;

      final bool hasLinked =
          _selectedUserId != null && _selectedPokerName != null;
      final lid = hasLinked ? _selectedUserId : null;
      final lpn = hasLinked ? _selectedPokerName : null;

      result = await widget.service.createOkibakeTemporaryEntry(
        operationId: operationId,
        tournamentId: widget.tournamentId,
        addonIntent: _addonIntent,
        linkedUserId: lid,
        linkedUserPokerName: lpn,
        memo: memo,
        deviceName: deviceName,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }

    if (!mounted) return;

    final messenger = ScaffoldMessenger.of(context);

    if (result.success) {
      final label =
          result.temporaryDisplayName ?? result.okibakeEntryId ?? '登録';
      if (_selectedUserId != null) {
        _usedLinkedUserIds = {..._usedLinkedUserIds, _selectedUserId!};
      }
      Navigator.of(context).pop();
      messenger.showSnackBar(
        SnackBar(content: Text(formatOkibakeRegisterSuccessMessage(label))),
      );
      widget.onRegistered();
    } else {
      messenger.showSnackBar(
        SnackBar(
          content: Text(result.errorMessage ?? '置きバケの登録に失敗しました'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<bool> _confirmSubmit() async {
    final selectedName = _selectedPokerName;
    final body = selectedName != null && selectedName.trim().isNotEmpty
        ? '対象ユーザーは「${selectedName.trim()}」です。\nこの内容で置きバケを登録しますか？'
        : '対象ユーザーは未設定です。\nこの内容で置きバケを登録しますか？';
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (confirmCtx) {
        return AlertDialog(
          title: const Text('置きバケ登録の確認'),
          content: Text(body),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(confirmCtx).pop(false),
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(confirmCtx).pop(true),
              child: const Text('登録'),
            ),
          ],
        );
      },
    );
    return ok == true;
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
                title: const Text('置きバケ登録'),
                content: SizedBox(
                  width: 460,
                  child: FutureBuilder<void>(
                    key: ValueKey('okibake-reg-users-$_usersRetryToken'),
                    future: _usersLoadFuture,
                    builder: (context, loadSnap) {
                      return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                        key: ValueKey('okibake-reg-stay-$_stayRetryToken'),
                        stream: ActiveStaysService.instance.stream,
                        builder: (context, stayShot) {
                          final usersLoaded =
                              loadSnap.connectionState !=
                              ConnectionState.waiting;
                          final stayReady =
                              stayShot.hasData && stayShot.data != null;
                          final notStaying =
                              usersLoaded &&
                                  stayShot.hasData &&
                                  stayShot.data != null &&
                                  !stayShot.hasError &&
                                  !loadSnap.hasError
                              ? _filterNotStaying(stayShot.data!)
                              : <OkibakeLinkCandidate>[];

                          // 候補が変わった場合は誤選択を防ぐ
                          if (_selectedUserId != null &&
                              usersLoaded &&
                              stayReady &&
                              !stayShot.hasError &&
                              !loadSnap.hasError &&
                              !notStaying
                                  .any((c) => c.userId == _selectedUserId)) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (!mounted) return;
                              if (_selectedUserId == null) return;
                              if (notStaying
                                  .any((c) => c.userId == _selectedUserId)) {
                                return;
                              }
                              setState(() {
                                _selectedUserId = null;
                                _selectedPokerName = null;
                              });
                            });
                          }

                          Widget userArea;
                          if (loadSnap.connectionState ==
                              ConnectionState.waiting) {
                            userArea = const Padding(
                              padding: EdgeInsets.symmetric(vertical: 24),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          } else if (loadSnap.hasError) {
                            userArea = Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  kTournamentUsersLoadFailedMessage,
                                  style: TextStyle(
                                    color: Colors.red.shade700,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: TextButton(
                                    onPressed:
                                        _submitting ? null : _retryUsersLoad,
                                    child: const Text('再試行'),
                                  ),
                                ),
                              ],
                            );
                          } else if (stayShot.hasError) {
                            userArea = Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  kTournamentActiveStaysLoadFailedMessage,
                                  style: TextStyle(
                                    color: Colors.red.shade700,
                                    fontSize: 13,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Align(
                                  alignment: Alignment.centerLeft,
                                  child: TextButton(
                                    onPressed:
                                        _submitting ? null : _retryStayStream,
                                    child: const Text('再試行'),
                                  ),
                                ),
                              ],
                            );
                          } else if (!stayReady) {
                            userArea = const Padding(
                              padding: EdgeInsets.symmetric(vertical: 12),
                              child: Center(
                                child: Text(
                                  '入店情報を読み込み中です。しばらくお待ちください。',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: Colors.black54,
                                  ),
                                ),
                              ),
                            );
                          } else {
                            userArea = Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                OutlinedButton.icon(
                                  icon: Icon(
                                    _selectedUserId != null
                                        ? Icons.edit
                                        : Icons.person_search,
                                  ),
                                  onPressed: _submitting
                                      ? null
                                      : () => _pickUser(context, notStaying),
                                  label: Text(
                                    _selectedUserId != null
                                        ? '対象: ${_selectedPokerName ?? ''}'
                                        : '対象ユーザーを選択（任意）',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '分かる場合は対象ユーザーを選択してください。',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey[700],
                                  ),
                                ),
                              ],
                            );
                          }

                          return SingleChildScrollView(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                DropdownButtonFormField<String>(
                                  decoration: const InputDecoration(
                                    labelText: 'アドオン意向',
                                    border: OutlineInputBorder(),
                                  ),
                                  // ignore: deprecated_member_use
                                  value: _addonIntent,
                                  items: _addonValues
                                      .map(
                                        (v) => DropdownMenuItem(
                                          value: v,
                                          child: Text(_addonLabelJa(v)),
                                        ),
                                      )
                                      .toList(),
                                  onChanged: _submitting
                                      ? null
                                      : (v) {
                                          if (v != null) {
                                            setState(() => _addonIntent = v);
                                          }
                                        },
                                ),
                                const SizedBox(height: 16),
                                userArea,
                                const SizedBox(height: 12),
                                TextField(
                                  controller: _memoController,
                                  enabled: !_submitting,
                                  maxLines: 2,
                                  maxLength: 200,
                                  decoration: const InputDecoration(
                                    labelText: 'メモ（任意・最大200文字）',
                                    border: OutlineInputBorder(),
                                  ),
                                ),
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
                        : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    child: const Text('登録'),
                  ),
                ],
              ),
            ),
            if (_submitting)
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
    );
  }
}
