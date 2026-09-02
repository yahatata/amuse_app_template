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
  bool _isRegistering = false;
  bool _listLoadFailed = false;
  int _streamRetryToken = 0;
  int _exclusionRetryToken = 0;

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

  void _setListLoadFailed(bool failed) {
    if (!mounted || _listLoadFailed == failed) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _listLoadFailed == failed) return;
      setState(() {
        _listLoadFailed = failed;
        if (failed) {
          _selectedUserIds.clear();
        }
      });
    });
  }

  void _retryListLoad() {
    setState(() {
      _listLoadFailed = false;
      _selectedUserIds.clear();
      _streamRetryToken++;
      _exclusionRetryToken++;
    });
  }

  Widget _buildLoadFailed(String message) {
    _setListLoadFailed(true);
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            message,
            style: TextStyle(color: Colors.red.shade700),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _isRegistering ? null : _retryListLoad,
            child: const Text('再試行'),
          ),
        ],
      ),
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
                      Expanded(
                        child: StreamBuilder<QuerySnapshot>(
                          key: ValueKey('register-stays-$_streamRetryToken'),
                          stream: ActiveStaysService.instance.stream,
                          builder: (context, snapshot) {
                            if (snapshot.hasError) {
                              return _buildLoadFailed(
                                kTournamentActiveStaysLoadFailedMessage,
                              );
                            }

                            if (snapshot.connectionState ==
                                ConnectionState.waiting) {
                              return const Center(
                                child: CircularProgressIndicator(),
                              );
                            }

                            final activeStays = snapshot.data?.docs ?? [];

                            return FutureBuilder<Set<String>>(
                              key: ValueKey(
                                'register-excl-$_exclusionRetryToken',
                              ),
                              future: _getUnavailableUserIds(),
                              builder: (context, excludedSnapshot) {
                                if (excludedSnapshot.connectionState ==
                                    ConnectionState.waiting) {
                                  return const Center(
                                    child: CircularProgressIndicator(),
                                  );
                                }

                                if (excludedSnapshot.hasError) {
                                  return _buildLoadFailed(
                                    kTournamentParticipantsLoadFailedMessage,
                                  );
                                }

                                _setListLoadFailed(false);

                                final excludedUserIds =
                                    excludedSnapshot.data ?? <String>{};
                                final availableUsers =
                                    <Map<String, dynamic>>[];

                                for (final doc in activeStays) {
                                  try {
                                    final data =
                                        doc.data() as Map<String, dynamic>?;
                                    if (data == null) continue;

                                    final uid = doc.id;
                                    final pokerName =
                                        data['pokerName'] as String? ??
                                            'Unknown';
                                    final billId = data['billId'] as String?;

                                    if (uid.isEmpty) continue;

                                    final isAlreadyInvolved =
                                        excludedUserIds.contains(uid);

                                    if (!isAlreadyInvolved) {
                                      availableUsers.add({
                                        'userId': uid,
                                        'billId': billId,
                                        'pokerName': pokerName,
                                        'status': 'open',
                                      });
                                    }
                                  } catch (_) {
                                    // 個別行のパース失敗は候補から除外（全体 fail にしない）
                                  }
                                }

                                if (availableUsers.isEmpty) {
                                  return const Center(
                                    child: Column(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
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
                                  itemCount: availableUsers.length,
                                  itemBuilder: (context, index) {
                                    final user = availableUsers[index];
                                    final userId = user['userId'] as String;
                                    final pokerName =
                                        user['pokerName'] as String? ??
                                            'Unknown';
                                    final isSelected =
                                        _selectedUserIds.contains(userId);

                                    return Card(
                                      margin:
                                          const EdgeInsets.only(bottom: 8),
                                      child: CheckboxListTile(
                                        value: isSelected,
                                        onChanged: _isRegistering
                                            ? null
                                            : (bool? value) {
                                                setState(() {
                                                  if (value == true) {
                                                    _selectedUserIds
                                                        .add(userId);
                                                  } else {
                                                    _selectedUserIds
                                                        .remove(userId);
                                                  }
                                                });
                                              },
                                        title: Text(
                                          pokerName,
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            color: isSelected
                                                ? Colors.green[700]
                                                : null,
                                          ),
                                        ),
                                        subtitle: Text(
                                          'User ID: $userId',
                                          style: const TextStyle(fontSize: 12),
                                        ),
                                        secondary: Icon(
                                          Icons.person,
                                          color: isSelected
                                              ? Colors.green[700]
                                              : Colors.grey,
                                        ),
                                        activeColor: Colors.green[700],
                                      ),
                                    );
                                  },
                                );
                              },
                            );
                          },
                        ),
                      ),
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
    if (_isRegistering || _listLoadFailed || _selectedUserIds.isEmpty) return;

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
        } else if (mounted) {
          setState(() {
            _selectedUserIds.clear();
          });

          Navigator.of(context).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('参加登録が完了しました'),
              backgroundColor: Colors.green,
            ),
          );
          widget.onRegistrationCompleted();
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(mapCallableSoftFailMessage(resultMap)),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(mapCallableError(e).message),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isRegistering = false;
        });
      }
    }
  }
}
