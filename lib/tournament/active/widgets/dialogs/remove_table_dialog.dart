import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/models/scheduled_tournament_seat_map.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';

class RemoveTableDialog extends StatefulWidget {
  final String tournamentId;
  final VoidCallback onTableRemoved;
  final TournamentService service;

  const RemoveTableDialog({
    super.key,
    required this.tournamentId,
    required this.onTableRemoved,
    required this.service,
  });

  @override
  State<RemoveTableDialog> createState() => _RemoveTableDialogState();
}

class _RemoveTableDialogState extends State<RemoveTableDialog> {
  String? _selectedTableId;
  bool _isLoading = false;
  bool _isLoadingTables = true;
  bool _tablesLoadFailed = false;
  List<Map<String, dynamic>> _emptyTables = [];
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  @override
  void initState() {
    super.initState();
    _loadEmptyTables();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_isLoading,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: AlertDialog(
                title: const Text('卓を削除'),
                content: SizedBox(
                  width: double.maxFinite,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('削除する卓を選択してください（空いている卓のみ表示）'),
                      const SizedBox(height: 16),
                      if (_isLoadingTables)
                        const Center(child: CircularProgressIndicator())
                      else if (_tablesLoadFailed)
                        Column(
                          children: [
                            Text(
                              kTournamentTablesLoadFailedMessage,
                              style: TextStyle(color: Colors.red.shade700),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 12),
                            ElevatedButton(
                              onPressed: _isLoading ? null : _loadEmptyTables,
                              child: const Text('再試行'),
                            ),
                          ],
                        )
                      else if (_emptyTables.isEmpty)
                        const Text(
                          '削除可能な卓がありません',
                          style: TextStyle(color: Colors.grey),
                        )
                      else ...[
                        Text('削除可能な卓数: ${_emptyTables.length}'),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<String>(
                          decoration: const InputDecoration(
                            labelText: '卓',
                            border: OutlineInputBorder(),
                          ),
                          value: _selectedTableId,
                          items: _emptyTables
                              .map((table) => DropdownMenuItem<String>(
                                    value: table['tableId'] as String,
                                    child: Text(
                                        '${table['name']} (${table['maxSeats']}席)'),
                                  ))
                              .toList(),
                          onChanged: _isLoading
                              ? null
                              : (value) {
                                  setState(() {
                                    _selectedTableId = value;
                                  });
                                },
                        ),
                      ],
                    ],
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed:
                        _isLoading ? null : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  ElevatedButton(
                    onPressed: _isLoading ||
                            _tablesLoadFailed ||
                            _selectedTableId == null ||
                            _emptyTables.isEmpty
                        ? null
                        : _removeTableFromTournament,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('削除'),
                  ),
                ],
              ),
            ),
            if (_isLoading)
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

  Future<void> _loadEmptyTables() async {
    setState(() {
      _isLoadingTables = true;
      _tablesLoadFailed = false;
      _selectedTableId = null;
    });

    try {
      final tablesSeatSnapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('tablesSeat')
          .get();

      final emptyTables = <Map<String, dynamic>>[];

      for (final doc in tablesSeatSnapshot.docs) {
        if (doc.id == 'waiting' || doc.id == 'busted') continue;

        final data = doc.data();
        if (data['isEnabled'] == false) continue;
        final seats = data['seats'] as Map<String, dynamic>? ?? {};

        if (!ScheduledTournamentSeatMap.isTournamentTableEmpty(seats)) {
          continue;
        }

        final tableDoc =
            await _firestore.collection('tables').doc(doc.id).get();
        if (tableDoc.exists) {
          final tableData = tableDoc.data() as Map<String, dynamic>;
          emptyTables.add({
            'tableId': doc.id,
            'name': tableData['name'] ?? doc.id,
            'maxSeats': data['maxSeats'] ?? tableData['maxSeats'] ?? 0,
          });
        }
      }

      if (!mounted) return;
      setState(() {
        _emptyTables = emptyTables;
        _isLoadingTables = false;
        _tablesLoadFailed = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _emptyTables = [];
        _isLoadingTables = false;
        _tablesLoadFailed = true;
        _selectedTableId = null;
      });
    }
  }

  Future<void> _removeTableFromTournament() async {
    if (_isLoading || _tablesLoadFailed || _selectedTableId == null) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final result = await widget.service.removeTableFromTournament(
        tournamentId: widget.tournamentId,
        tableId: _selectedTableId!,
      );

      if (!mounted) return;

      if (isCallableSuccessResponse(result)) {
        Navigator.of(context).pop();
        widget.onTableRemoved();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentOpsSoftFail(
                result,
                operation: kRemoveTableFromTournamentOperation,
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentOpsCallableError(
                e,
                operation: kRemoveTableFromTournamentOperation,
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }
}
