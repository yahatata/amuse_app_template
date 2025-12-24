import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/services/active_stays_service.dart';

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
  State<RegisterParticipantsDialog> createState() => _RegisterParticipantsDialogState();
}

class _RegisterParticipantsDialogState extends State<RegisterParticipantsDialog> {
  final Set<String> _selectedUserIds = {};
  bool _isRegistering = false;

  /// 座席に着席しているユーザーIDと待機リストのユーザーIDのセットを取得
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
        // 待機リストからユーザーIDを収集
        final waiting = data['waiting'] as Map<String, dynamic>? ?? {};
        excludedUserIds.addAll(waiting.keys);
      } else {
        // 座席からユーザーIDを収集
        final seats = data['seats'] as Map<String, dynamic>? ?? {};
        
        // seatXXUserIdフィールドからユーザーIDを収集
        for (final entry in seats.entries) {
          if (entry.key.endsWith('UserId') && entry.value != null) {
            excludedUserIds.add(entry.value as String);
          }
        }
      }
    }
    
    return excludedUserIds;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
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
                stream: ActiveStaysService.instance.stream,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return Center(
                      child: Text(
                        'ユーザー情報の読み込みに失敗しました： ${snapshot.error}',
                        style: const TextStyle(color: Colors.red),
                      ),
                    );
                  }

                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  final activeStays = snapshot.data?.docs ?? [];
                  final availableUsers = <Map<String, dynamic>>[];

                  // FutureBuilderを使用して非同期処理を行う
                  return FutureBuilder<Set<String>>(
                    future: _getExcludedUserIds(),
                    builder: (context, excludedSnapshot) {
                      if (excludedSnapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      if (excludedSnapshot.hasError) {
                        return Center(
                          child: Text('エラー: ${excludedSnapshot.error}'),
                        );
                      }

                      final excludedUserIds = excludedSnapshot.data ?? <String>{};
                      
                      for (final doc in activeStays) {
                        try {
                          final data = doc.data() as Map<String, dynamic>?;
                          if (data == null) continue;

                          final uid = doc.id; // activeStays のドキュメントID = uid
                          final pokerName = data['pokerName'] as String? ?? 'Unknown';
                          final billId = data['billId'] as String?;
                          
                          // uidが存在しない場合は除外
                          if (uid.isEmpty) {
                            debugPrint('uidが存在しません (docId: ${doc.id})');
                            continue;
                          }
                          
                          // 既に座席に着席しているか、または待機リストに入っているかチェック
                          final isAlreadyInvolved = excludedUserIds.contains(uid);

                          if (!isAlreadyInvolved) {
                            availableUsers.add({
                              'userId': uid,
                              'billId': billId,
                              'pokerName': pokerName,
                              'status': 'open',
                            });
                          }
                        } catch (e) {
                          debugPrint('ユーザーデータ処理エラー (docId: ${doc.id}): $e');
                          // エラーの場合は安全のため除外
                        }
                      }

                      if (availableUsers.isEmpty) {
                        return Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.people_outline, color: Colors.grey, size: 48),
                              const SizedBox(height: 16),
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
                          final pokerName = user['pokerName'] as String? ?? 'Unknown';
                          final isSelected = _selectedUserIds.contains(userId);
                          
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: CheckboxListTile(
                              value: isSelected,
                              onChanged: (bool? value) {
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
                                style: TextStyle(fontSize: 12),
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
          onPressed: _isRegistering ? null : () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: _isRegistering || _selectedUserIds.isEmpty
              ? null
              : _registerParticipants,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green[700],
            foregroundColor: Colors.white,
          ),
          child: _isRegistering
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text('参加登録 (${_selectedUserIds.length}人)'),
        ),
      ],
    );
  }

  /// 参加者登録を実行
  Future<void> _registerParticipants() async {
    if (_selectedUserIds.isEmpty) return;

    setState(() {
      _isRegistering = true;
    });

    try {
      final selectedUserIds = _selectedUserIds.toList();
      
      debugPrint('参加登録開始: ${selectedUserIds.length}人');
      debugPrint('選択されたユーザー: $selectedUserIds');

      final result = await widget.service.registerParticipants(
        tournamentId: widget.tournamentId,
        userIds: selectedUserIds,
      );

      // 型安全な結果処理
      if (result is Map) {
        final resultMap = Map<String, dynamic>.from(result);
        if (resultMap['success'] == true) {
          final summaryRaw = resultMap['summary'];
          Map<String, dynamic>? summary;
          if (summaryRaw is Map) {
            summary = Map<String, dynamic>.from(summaryRaw);
          }
          if (summary != null) {
            final successCount = summary['success'] as int? ?? 0;
            final failureCount = summary['failure'] as int? ?? 0;

            if (mounted) {
              // 選択状態をリセット
              setState(() {
                _selectedUserIds.clear();
              });
              
              Navigator.of(context).pop();
              
              // 結果を表示
              String message;
              if (failureCount == 0) {
                message = '$successCount人の参加登録が完了しました';
              } else {
                message = '$successCount人成功、$failureCount人失敗しました';
              }
              
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(message),
                  backgroundColor: failureCount == 0 ? Colors.green : Colors.orange,
                ),
              );

              // コールバック実行
              widget.onRegistrationCompleted();
            }
          } else {
            // summaryがない場合でも成功として扱う
            if (mounted) {
              // 選択状態をリセット
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
          }
        } else {
          // エラーレスポンスの場合
          final errorMessage = resultMap['error'] as String? ?? '参加登録に失敗しました';
          throw Exception(errorMessage);
        }
      } else {
        throw Exception('予期しないレスポンス形式です');
      }
    } catch (e) {
      debugPrint('参加登録エラー: $e');
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('参加登録に失敗しました。：$e'),
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
