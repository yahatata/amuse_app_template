import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_link_user_picker_dialog.dart';

class RegisterParticipantsDialog extends StatefulWidget {
  final String tournamentId;
  final VoidCallback onRegistrationCompleted;
  final TournamentService service;

  const RegisterParticipantsDialog({
    super.key,
    required this.tournamentId,
    required this.onRegistrationCompleted,
    required this.service,
  });

  @override
  State<RegisterParticipantsDialog> createState() =>
      _RegisterParticipantsDialogState();
}

class _RegisterParticipantsDialogState
    extends State<RegisterParticipantsDialog> {
  final Set<String> _selectedUserIds = {};
  final ScrollController _listScrollController = ScrollController();

  /// まとめてAddon / 置きバケ候補と同様: 一覧は先に確定し、選択は setState のみ。
  List<Map<String, dynamic>> _availableUsers = [];
  bool _isLoadingList = true;
  bool _listLoadFailed = false;
  String? _listLoadErrorMessage;
  bool _isRegistering = false;

  @override
  void initState() {
    super.initState();
    _loadAvailableUsers();
  }

  @override
  void dispose() {
    _listScrollController.dispose();
    super.dispose();
  }

  Future<Set<String>> _getExcludedUserIds() async {
    final tablesSeatSnapshot = await FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(widget.tournamentId)
        .collection('tablesSeat')
        .get();

    final excludedUserIds = <String>{};

    for (final doc in tablesSeatSnapshot.docs) {
      final data = doc.data();

      if (doc.id == 'waiting') {
        final waiting = data['waiting'] as Map<String, dynamic>? ?? {};
        excludedUserIds.addAll(waiting.keys);
      } else {
        final seats = data['seats'] as Map<String, dynamic>? ?? {};
        for (final entry in seats.entries) {
          if (entry.key.endsWith('UserId') && entry.value != null) {
            excludedUserIds.add(entry.value as String);
          }
        }
      }
    }

    return excludedUserIds;
  }

  Future<Set<String>> _getUnavailableUserIds() async {
    final results = await Future.wait<dynamic>([
      _getExcludedUserIds(),
      fetchUsedOkibakeLinkedUserIds(tournamentId: widget.tournamentId),
    ]);
    final blocked = <String>{};
    blocked.addAll(results[0] as Set<String>);
    blocked.addAll(results[1] as Set<String>);
    return blocked;
  }

  Future<void> _loadAvailableUsers() async {
    setState(() {
      _isLoadingList = true;
      _listLoadFailed = false;
      _listLoadErrorMessage = null;
      _selectedUserIds.clear();
    });

    try {
      final excludedUserIds = await _getUnavailableUserIds();
      // ActiveStaysService.stream は getter のたびに新しい Stream になるため、
      // 選択中の rebuild では購読しない（一度だけ取得）。
      final staysSnap = await ActiveStaysService.instance.stream.first;

      final availableUsers = <Map<String, dynamic>>[];
      for (final doc in staysSnap.docs) {
        try {
          final data = doc.data();
          final uid = doc.id;
          final pokerName = data['pokerName'] as String? ?? 'Unknown';
          final billId = data['billId'] as String?;
          if (uid.isEmpty) continue;
          if (excludedUserIds.contains(uid)) continue;
          availableUsers.add({
            'userId': uid,
            'billId': billId,
            'pokerName': pokerName,
            'status': 'open',
          });
        } catch (_) {
          // 個別行のパース失敗は候補から除外
        }
      }

      if (!mounted) return;
      setState(() {
        _availableUsers = availableUsers;
        _isLoadingList = false;
        _listLoadFailed = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoadingList = false;
        _listLoadFailed = true;
        _listLoadErrorMessage = kTournamentParticipantsLoadFailedMessage;
        _availableUsers = [];
        _selectedUserIds.clear();
      });
    }
  }

  Widget _buildListBody() {
    if (_isLoadingList) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_listLoadFailed) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              _listLoadErrorMessage ?? kTournamentParticipantsLoadFailedMessage,
              style: TextStyle(color: Colors.red.shade700),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _isRegistering ? null : _loadAvailableUsers,
              child: const Text('再試行'),
            ),
          ],
        ),
      );
    }

    if (_availableUsers.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.people_outline,
              color: Colors.grey,
              size: 48,
            ),
            SizedBox(height: 16),
            Text(
              '入店中のユーザーがいません',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      controller: _listScrollController,
      itemCount: _availableUsers.length,
      itemBuilder: (context, index) {
        final user = _availableUsers[index];
        final userId = user['userId'] as String;
        final pokerName = user['pokerName'] as String? ?? 'Unknown';
        final isSelected = _selectedUserIds.contains(userId);

        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: CheckboxListTile(
            value: isSelected,
            onChanged: _isRegistering
                ? null
                : (bool? value) {
                    setState(() {
                      if (value == true) {
                        _selectedUserIds.add(userId);
                      } else {
                        _selectedUserIds.remove(userId);
                      }
                    });
                  },
            title: Text(
              pokerName,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: isSelected ? Colors.green[700] : null,
              ),
            ),
            subtitle: Text(
              'User ID: $userId',
              style: const TextStyle(fontSize: 12),
            ),
            secondary: Icon(
              Icons.person,
              color: isSelected ? Colors.green[700] : Colors.grey,
            ),
            activeColor: Colors.green[700],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_isRegistering,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: AlertDialog(
                title: const Text('参加者登録'),
                content: SizedBox(
                  width: double.maxFinite,
                  height: 400,
                  child: Column(
                    children: [
                      const Text(
                        '登録する参加者を選択してください',
                        style: TextStyle(fontSize: 16),
                      ),
                      const SizedBox(height: 16),
                      Expanded(child: _buildListBody()),
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: _isRegistering
                        ? null
                        : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  ElevatedButton(
                    onPressed: _isRegistering ||
                            _listLoadFailed ||
                            _isLoadingList ||
                            _selectedUserIds.isEmpty
                        ? null
                        : _registerParticipants,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green[700],
                      foregroundColor: Colors.white,
                    ),
                    child: Text('参加登録 (${_selectedUserIds.length}人)'),
                  ),
                ],
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
        ),
      ),
    );
  }

  Future<void> _registerParticipants() async {
    if (_isRegistering ||
        _listLoadFailed ||
        _isLoadingList ||
        _selectedUserIds.isEmpty) {
      return;
    }

    setState(() {
      _isRegistering = true;
    });

    try {
      final selectedUserIds = _selectedUserIds.toList();

      final result = await widget.service.registerParticipants(
        tournamentId: widget.tournamentId,
        userIds: selectedUserIds,
      );

      final resultMap = Map<String, dynamic>.from(result);
      // TOUR-41: soft-fail は D-1。raw data['error'] は出さない。
      if (isCallableSuccessResponse(resultMap)) {
        final summaryRaw = resultMap['summary'];
        Map<String, dynamic>? summary;
        if (summaryRaw is Map) {
          summary = Map<String, dynamic>.from(summaryRaw);
        }
        if (summary != null) {
          final successCount = summary['success'] as int? ?? 0;
          final failureCount = summary['failure'] as int? ?? 0;

          if (mounted) {
            setState(() {
              _selectedUserIds.clear();
            });

            Navigator.of(context).pop();

            String message;
            if (failureCount == 0) {
              message = '$successCount人の参加登録が完了しました';
            } else {
              message = '$successCount人成功、$failureCount人失敗しました';
            }

            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(message),
                backgroundColor:
                    failureCount == 0 ? Colors.green : Colors.orange,
              ),
            );

            widget.onRegistrationCompleted();
          }
        }
      } else {
        if (mounted) {
          setState(() {
            _selectedUserIds.clear();
            _isRegistering = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                mapCallableSoftFailMessage(
                  resultMap,
                  operation: 'registerParticipants',
                ),
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isRegistering = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapCallableError(e, operation: 'registerParticipants').message,
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
