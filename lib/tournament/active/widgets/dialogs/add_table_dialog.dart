import 'package:flutter/material.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';

import 'package:amuse_app_template/tournament/active/services/tournament_data_service.dart';


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
  List<Map<String, dynamic>> _availableTables = [];
  final TournamentDataService _dataService = TournamentDataService();
  
  @override
  void initState() {
    super.initState();
    _loadAvailableTables();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('卓を追加'),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('使用可能なテーブルを選択してください'),
            const SizedBox(height: 16),
            // テーブル選択ドロップダウン
            if (_isLoadingTables)
              const Center(child: CircularProgressIndicator())
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
                          child: Text('${table['name']} (${table['maxSeats']}席)'),
                        ))
                    .toList(),
                onChanged: (value) {
                  print('テーブル選択: $value');
                  setState(() {
                    _selectedTableId = value;
                  });
                },
              ),
            ],
            const SizedBox(height: 16),
            // 選択されたテーブルの詳細表示
            if (_selectedTableId != null) ...[
              _buildSelectedTableInfo(),
              const SizedBox(height: 16),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: _isLoading || _selectedTableId == null
              ? null
              : _addTableToTournament,
          child: _isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('追加'),
        ),
      ],
    );
  }

  /// 選択されたテーブルの詳細情報を表示
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

  /// ステータスの日本語表示
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

  /// 卓をトーナメントに追加
  Future<void> _addTableToTournament() async {
    if (_selectedTableId == null) return;

    setState(() {
      _isLoading = true;
    });

    try {
      final selectedTable = _availableTables.firstWhere(
        (table) => table['tableId'] == _selectedTableId,
      );

      // デバッグログ
      print('=== 卓追加: パラメータ確認 ===');
      print('tournamentId: ${widget.tournamentId}');
      print('tableId: ${_selectedTableId}');
      print('maxSeats: ${selectedTable['maxSeats']}');
      print('selectedTable: $selectedTable');
      
      final result = await widget.service.addTableToTournament(
        tournamentId: widget.tournamentId,
        tableId: _selectedTableId!,
        maxSeats: selectedTable['maxSeats'],
      );

      if (result['success'] == true) {
        if (mounted) {
          Navigator.of(context).pop();
          widget.onTableAdded();
        }
      } else {
        throw Exception('卓追加に失敗しました');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('エラーが発生しました: $e'),
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
  
  /// 利用可能なテーブルを読み込み
  Future<void> _loadAvailableTables() async {
    try {
      print('=== 卓追加ダイアログ: テーブル読み込み開始 ===');
      final tables = await _dataService.getAvailableTables();
      print('取得したテーブル数: ${tables.length}');
      print('テーブル詳細: $tables');
      
      setState(() {
        _availableTables = tables;
        _isLoadingTables = false;
      });
      print('状態更新完了: _availableTables.length = ${_availableTables.length}');
    } catch (e) {
      print('テーブル読み込みエラー: $e');
      setState(() {
        _isLoadingTables = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('テーブル情報の読み込みに失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
