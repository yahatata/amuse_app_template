import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_link_user_picker_dialog.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class OkibakeUpdateLinkedUserDialog extends StatefulWidget {
  const OkibakeUpdateLinkedUserDialog({
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
  State<OkibakeUpdateLinkedUserDialog> createState() =>
      _OkibakeUpdateLinkedUserDialogState();
}

class _OkibakeUpdateLinkedUserDialogState
    extends State<OkibakeUpdateLinkedUserDialog> {
  bool _submitting = false;
  List<OkibakeLinkCandidate> _allCandidates = [];
  Set<String> _usedLinkedUserIds = const {};
  Future<void>? _usersLoadFuture;
  OkibakeLinkCandidate? _selected;

  @override
  void initState() {
    super.initState();
    _usersLoadFuture = _loadUsersDocuments();
  }

  Future<void> _loadUsersDocuments() async {
    final results = await Future.wait<dynamic>([
      fetchOkibakeLinkCandidates(),
      fetchUsedOkibakeLinkedUserIds(
        tournamentId: widget.tournamentId,
        excludeOkibakeEntryId: widget.okibakeEntryId,
      ),
    ]);
    final list = results[0] as List<OkibakeLinkCandidate>;
    final used = results[1] as Set<String>;
    if (!mounted) return;
    setState(() {
      _allCandidates = list;
      _usedLinkedUserIds = used;
    });
  }

  List<OkibakeLinkCandidate> _filterNotStaying(
    QuerySnapshot<Map<String, dynamic>> staySnap,
  ) {
    final notStaying = filterOkibakeLinkCandidatesNotStaying(_allCandidates, staySnap);
    return filterOkibakeLinkCandidatesUnusedByOkibake(notStaying, _usedLinkedUserIds);
  }

  Future<void> _pickUser(
    BuildContext outerContext,
    List<OkibakeLinkCandidate> available,
  ) async {
    final pickedId = await showDialog<String>(
      context: outerContext,
      builder: (_) => OkibakeLinkUserPickerDialog(
        available: available,
        initialSelectedUserId: _selected?.userId,
        allowClear: false,
        title: '対象ユーザー設定',
      ),
    );

    if (!mounted || pickedId == null) return;

    OkibakeLinkCandidate? cand;
    for (final c in available) {
      if (c.userId == pickedId) {
        cand = c;
        break;
      }
    }
    if (cand == null) return;
    setState(() => _selected = cand);
  }

  Future<bool> _confirmSave(OkibakeLinkCandidate candidate) async {
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (confirmCtx) {
        return AlertDialog(
          title: const Text('対象ユーザー設定の確認'),
          content: Text('この置きバケの対象ユーザーを「${candidate.displayLabel}」に設定しますか？'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(confirmCtx).pop(false),
              child: const Text('キャンセル'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(confirmCtx).pop(true),
              child: const Text('設定'),
            ),
          ],
        );
      },
    );
    return ok == true;
  }

  Future<void> _save() async {
    if (_submitting) return;
    final selected = _selected;
    if (selected == null) return;

    final proceed = await _confirmSave(selected);
    if (!mounted || !proceed) return;

    setState(() => _submitting = true);
    late UpdateOkibakeTemporaryEntryLinkedUserResult result;
    try {
      result = await widget.service.updateOkibakeTemporaryEntryLinkedUser(
        tournamentId: widget.tournamentId,
        okibakeEntryId: widget.okibakeEntryId,
        linkedUserId: selected.userId,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }

    if (!mounted) return;

    if (result.success) {
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result.errorMessage ?? '対象ユーザーの設定に失敗しました'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    }
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
                title: const Text('対象ユーザー設定'),
                content: SizedBox(
                  width: 460,
                  child: FutureBuilder<void>(
                    future: _usersLoadFuture,
                    builder: (context, loadSnap) {
                      return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
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
                                  !stayShot.hasError
                              ? _filterNotStaying(stayShot.data!)
                              : <OkibakeLinkCandidate>[];

                          Widget userArea;
                          if (loadSnap.connectionState ==
                              ConnectionState.waiting) {
                            userArea = const Padding(
                              padding: EdgeInsets.symmetric(vertical: 24),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          } else if (loadSnap.hasError) {
                            userArea = Text(
                              'ユーザー一覧の取得に失敗しました: ${loadSnap.error}',
                              style: const TextStyle(
                                color: Colors.red,
                                fontSize: 13,
                              ),
                            );
                          } else if (stayShot.hasError) {
                            userArea = Text(
                              '入店情報の取得に失敗しました: ${stayShot.error}',
                              style: const TextStyle(
                                color: Colors.red,
                                fontSize: 13,
                              ),
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
                                  icon: const Icon(Icons.person_search),
                                  onPressed: _submitting
                                      ? null
                                      : () => _pickUser(context, notStaying),
                                  label: Text(
                                    _selected != null
                                        ? '対象: ${_selected!.displayLabel}'
                                        : '対象ユーザーを選択',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  '対象ユーザー未設定の置きバケに、後から対象ユーザーを設定します。',
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
                                Text(
                                  widget.displayName.isNotEmpty
                                      ? widget.displayName
                                      : '置きバケ',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  '現在の対象ユーザー: 未設定',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: Colors.black54,
                                  ),
                                ),
                                const SizedBox(height: 16),
                                userArea,
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
                        : () => Navigator.of(context).pop(false),
                    child: const Text('閉じる'),
                  ),
                  FilledButton(
                    onPressed: _submitting || _selected == null ? null : _save,
                    child: const Text('保存'),
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
