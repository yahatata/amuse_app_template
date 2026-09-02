import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/services/tournament_data_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';

class AddTableDialog extends StatefulWidget {
  final String tournamentId;
  final VoidCallback onTableAdded;
  final TournamentService service;

  const AddTableDialog({
    super.key,
    required this.tournamentId,
    required this.onTableAdded,
    required this.service,
  });

  @override
  State<AddTableDialog> createState() => _AddTableDialogState();
}

class _AddTableDialogState extends State<AddTableDialog> {
  String? _selectedTableId;
  bool _isLoading = false;
  bool _isLoadingTables = true;
  bool _tablesLoadFailed = false;
  List<Map<String, dynamic>> _availableTables = [];
  final TournamentDataService _dataService = TournamentDataService();

  @override
  void initState() {
    super.initState();
    _loadAvailableTables();
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
                title: const Text('卓を追加'),
                content: SizedBox(
                  width: double.maxFinite,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('使用可能なテーブルを選択してください'),
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
                              onPressed: _isLoading ? null : _loadAvailableTables,
                              child: const Text('再試行'),
                            ),
                          ],
                        )
                      else ...[
                        Text('利用可能テーブル数: ${_availableTables.length}'),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<String>(
                          decoration: const InputDecoration(
                            labelText: 'テーブル',
                            border: OutlineInputBorder(),
                          ),
                          value: _selectedTableId,
                          items: _availableTables
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
                      const SizedBox(height: 16),
                      if (_selectedTableId != null && !_tablesLoadFailed) ...[
                        _buildSelectedTableInfo(),
                        const SizedBox(height: 16),
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
                            _selectedTableId == null
                        ? null
                        : _addTableToTournament,
                    child: const Text('追加'),
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

  Widget _buildSelectedTableInfo() {
    final selectedTable = _availableTables.firstWhere(
      (table) => table['tableId'] == _selectedTableId,
    );

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '選択されたテーブル',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.blue[700],
            ),
          ),
          const SizedBox(height: 8),
          Text('テーブル名: ${selectedTable['name']}'),
          Text('最大座席数: ${selectedTable['maxSeats']}席'),
          Text('ステータス: ${_getStatusText(selectedTable['status'])}'),
        ],
      ),
    );
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'open':
        return '使用可能';
      case 'tournament':
        return 'トーナメント中';
      case 'sideGame':
        return 'サイドゲーム中';
      default:
        return status;
    }
  }

  Future<void> _addTableToTournament() async {
    if (_isLoading || _tablesLoadFailed || _selectedTableId == null) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final selectedTable = _availableTables.firstWhere(
        (table) => table['tableId'] == _selectedTableId,
      );

      final result = await widget.service.addTableToTournament(
        tournamentId: widget.tournamentId,
        tableId: _selectedTableId!,
        maxSeats: selectedTable['maxSeats'],
      );

      if (!mounted) return;

      if (isCallableSuccessResponse(result)) {
        Navigator.of(context).pop();
        widget.onTableAdded();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentOpsSoftFail(
                result,
                operation: kAddTableToTournamentOperation,
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
                operation: kAddTableToTournamentOperation,
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

  Future<void> _loadAvailableTables() async {
    setState(() {
      _isLoadingTables = true;
      _tablesLoadFailed = false;
      _selectedTableId = null;
    });

    try {
      final tables =
          await _dataService.getAvailableTables(widget.tournamentId);

      if (!mounted) return;
      setState(() {
        _availableTables = tables;
        _isLoadingTables = false;
        _tablesLoadFailed = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _availableTables = [];
        _isLoadingTables = false;
        _tablesLoadFailed = true;
        _selectedTableId = null;
      });
    }
  }
}
