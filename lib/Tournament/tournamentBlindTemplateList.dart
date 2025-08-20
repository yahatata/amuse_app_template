import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'createTournamentBlindBasic.dart';

class TournamentBlindTemplateList extends StatefulWidget {
  final String tournamentTemplateId;
  final String tournamentTemplateName;

  const TournamentBlindTemplateList({
    super.key,
    required this.tournamentTemplateId,
    required this.tournamentTemplateName,
  });

  @override
  State<TournamentBlindTemplateList> createState() => _TournamentBlindTemplateListState();
}

class _TournamentBlindTemplateListState extends State<TournamentBlindTemplateList> {
  List<Map<String, dynamic>> _blindTemplates = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadBlindTemplates();
  }

  /// ブラインドテンプレートを読み込む
  Future<void> _loadBlindTemplates() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('getBlindTemplates');

      final result = await callable.call();
      final response = result.data;

      if (response['success'] == true) {
        setState(() {
          // Cloud Functionsから返されるデータを適切な型に変換
          final rawTemplates = response['blindTemplates'] as List? ?? [];
          _blindTemplates = rawTemplates.map((template) {
            final Map<String, dynamic> convertedTemplate = {};
            (template as Map).forEach((key, value) {
              convertedTemplate[key.toString()] = value;
            });
            return convertedTemplate;
          }).toList();
          _isLoading = false;
        });
      } else {
        setState(() {
          _errorMessage = response['error'] ?? 'ブラインドテンプレートの取得に失敗しました';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'ブラインドテンプレートの取得に失敗しました: $e';
        _isLoading = false;
      });
    }
  }

  /// ブラインドテンプレートをアーカイブする
  Future<void> _archiveBlindTemplate(String blindTemplateId) async {
    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('archiveBlindTemplate');

      final result = await callable.call({'blindTemplateId': blindTemplateId});
      final response = result.data;

      if (response['success'] == true) {
        setState(() {
          _blindTemplates.removeWhere((template) => template['id'] == blindTemplateId);
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? 'ブラインドテンプレートをアーカイブしました')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['error'] ?? 'アーカイブに失敗しました')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('アーカイブに失敗しました: $e')),
      );
    }
  }

  /// ブラインドテンプレートの詳細を表示する
  void _showBlindTemplateDetail(Map<String, dynamic> blindTemplate) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text(blindTemplate['blindName'] ?? '無名テンプレート'),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('レベル数: ${blindTemplate['numberOfBlindLevels']}'),
                Text('開始チップ数: ${blindTemplate['defaultStartingChips']}'),
                Text('レジスト前間隔: ${blindTemplate['blindIntervalBeforeRegLev']}分'),
                Text('レジスト後間隔: ${blindTemplate['blindIntervalAfterRegLev']}分'),
                Text('レジスト終了レベル: ${blindTemplate['lateRegUntilLev']}'),
                Text('アンティタイプ: ${blindTemplate['anteType']}'),
                Text('ブレイク時間: ${blindTemplate['breakDuration']}分'),
                const SizedBox(height: 16),
                const Text('ブラインドレベル:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                ...(blindTemplate['levels'] as List? ?? []).take(5).map((level) => 
                  Text('レベル${level['level']}: ${level['smallBlind']}/${level['bigBlind']} (${level['duration']}分)')
                ).toList(),
                if ((blindTemplate['levels'] as List? ?? []).length > 5)
                  Text('... (他${(blindTemplate['levels'] as List).length - 5}レベル)'),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('閉じる'),
            ),
          ],
        );
      },
    );
  }

  /// アーカイブ確認ダイアログを表示する
  void _showArchiveDialog(String blindTemplateId, String blindTemplateName) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('ブラインドテンプレートアーカイブ'),
          content: Text('「$blindTemplateName」をアーカイブしますか？\nアーカイブされたテンプレートは一覧から非表示になります。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                _archiveBlindTemplate(blindTemplateId);
              },
              child: const Text('アーカイブ', style: TextStyle(color: Colors.orange)),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.tournamentTemplateName} - ブラインドテンプレート'),
        backgroundColor: Colors.purple,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _isLoading ? null : _loadBlindTemplates,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_errorMessage!, style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadBlindTemplates,
                        child: const Text('再試行'),
                      ),
                    ],
                  ),
                )
              : _blindTemplates.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.casino, size: 64, color: Colors.grey),
                          SizedBox(height: 16),
                          Text(
                            'ブラインドテンプレートがありません',
                            style: TextStyle(fontSize: 18, color: Colors.grey),
                          ),
                          SizedBox(height: 8),
                          Text(
                            '新しいブラインドテンプレートを作成してください',
                            style: TextStyle(fontSize: 14, color: Colors.grey),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _blindTemplates.length,
                      itemBuilder: (context, index) {
                        final blindTemplate = _blindTemplates[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          child: ListTile(
                            leading: const Icon(Icons.casino, color: Colors.purple),
                            title: Text(
                              blindTemplate['blindName'] ?? '無名ブラインド',
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'ブラインドレベル数: ${blindTemplate['numberOfBlindLevels'] ?? 0}',
                                  style: const TextStyle(color: Colors.grey),
                                ),
                                Text(
                                  '開始チップ: ${blindTemplate['defaultStartingChips'] ?? 0}',
                                  style: const TextStyle(color: Colors.blue),
                                ),
                                Text(
                                  'レジスト前間隔: ${blindTemplate['blindIntervalBeforeRegLev'] ?? 0}分 | レジスト後間隔: ${blindTemplate['blindIntervalAfterRegLev'] ?? 0}分',
                                  style: const TextStyle(color: Colors.orange),
                                ),
                                Text(
                                  'レジストまでの時間: ${_calculateRegTime(blindTemplate)}',
                                  style: const TextStyle(color: Colors.purple),
                                ),
                              ],
                            ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.edit, color: Colors.blue),
                                  tooltip: '編集',
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) => CreateTournamentBlindBasic(
                                          tournamentTemplateId: widget.tournamentTemplateId,
                                          tournamentTemplateName: widget.tournamentTemplateName,
                                          existingBlindTemplate: blindTemplate,
                                        ),
                                      ),
                                    );
                                  },
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete, color: Colors.red),
                                  tooltip: 'アーカイブ',
                                  onPressed: () {
                                    _showArchiveDialog(
                                      blindTemplate['id'],
                                      blindTemplate['blindName'] ?? '無名ブラインド',
                                    );
                                  },
                                ),
                              ],
                            ),
                            onTap: () {
                              _showBlindTemplateDetail(blindTemplate);
                            },
                          ),
                        );
                      },
                    ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => CreateTournamentBlindBasic(
                tournamentTemplateId: widget.tournamentTemplateId,
                tournamentTemplateName: widget.tournamentTemplateName,
              ),
            ),
          );
        },
        backgroundColor: Colors.purple,
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
    );
  }

  /// レジストまでの時間を計算する
  String _calculateRegTime(Map<String, dynamic> blindTemplate) {
    final lateRegUntilLevel = blindTemplate['lateRegUntilLev'] as int? ?? 0;
    final blindIntervalBeforeReg = blindTemplate['blindIntervalBeforeRegLev'] as int? ?? 0;
    
    if (lateRegUntilLevel <= 0 || blindIntervalBeforeReg <= 0) {
      return '計算不可';
    }
    
    final totalMinutes = lateRegUntilLevel * blindIntervalBeforeReg;
    final hours = totalMinutes ~/ 60;
    final minutes = totalMinutes % 60;
    
    if (hours > 0) {
      return '${hours}時間${minutes}分';
    } else {
      return '${minutes}分';
    }
  }
}
