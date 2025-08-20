import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'tournamentBlindTemplateList.dart';
import 'createTournamentTemplatePage.dart';

class TournamentTemplateList extends StatefulWidget {
  const TournamentTemplateList({super.key});

  @override
  State<TournamentTemplateList> createState() => _TournamentTemplateListState();
}

class _TournamentTemplateListState extends State<TournamentTemplateList> {
  List<Map<String, dynamic>> _templates = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadTemplates();
  }

  /// トーナメントテンプレートを読み込む
  Future<void> _loadTemplates() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('getTournamentTemplates');

      final result = await callable.call();
      final response = result.data;

      if (response['success'] == true) {
        // Cloud Functionsから返されるデータの型変換
        final List<dynamic> rawTemplates = response['tournamentTemplates'] ?? [];
        final List<Map<String, dynamic>> convertedTemplates = rawTemplates.map((template) {
          final Map<String, dynamic> converted = {};
          (template as Map).forEach((key, value) {
            converted[key.toString()] = value;
          });
          return converted;
        }).toList();
        

        
        setState(() {
          _templates = convertedTemplates;
          _isLoading = false;
        });
      } else {
        setState(() {
          _errorMessage = response['error'] ?? 'トーナメントテンプレートの取得に失敗しました';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'トーナメントテンプレートの取得に失敗しました: $e';
        _isLoading = false;
      });
    }
  }

  /// テンプレートをアーカイブする
  Future<void> _archiveTemplate(String templateId) async {
    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('archiveTournamentTemplate');
      
      final result = await callable.call({'tournamentTemplateId': templateId});
      final response = result.data;
      
      if (response['success'] == true) {
        setState(() {
          _templates.removeWhere((template) => template['id'] == templateId);
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? 'テンプレートをアーカイブしました')),
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

  /// アーカイブ確認ダイアログを表示する
  void _showArchiveDialog(String templateId, String templateName) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('テンプレートアーカイブ'),
          content: Text('「$templateName」をアーカイブしますか？\nアーカイブされたテンプレートは一覧から非表示になります。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                _archiveTemplate(templateId);
              },
              child: const Text('アーカイブ', style: TextStyle(color: Colors.red)),
            ),
          ],
        );
      },
    );
  }

  /// トーナメントテンプレート詳細ダイアログを表示する
  void _showTemplateDetail(Map<String, dynamic> template) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text(template['name'] ?? '無名テンプレート'),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('エントリーフィー: ${template['entryFee'] ?? 0}円'),
                Text('開始スタック: ${template['startStack'] ?? 0}'),
                Text('プライズ割合: ${((template['prizeRatio'] ?? 0) * 100).toStringAsFixed(0)}%'),
                Text('リエントリー: ${template['isReentry'] == true ? '可能' : '不可'}'),
                if (template['isReentry'] == true) ...[
                  if (template['maxReentries'] != null) Text('最大リエントリー数: ${template['maxReentries']}回'),
                  if (template['reentryFee'] != null) Text('リエントリーフィー: ${template['reentryFee']}円'),
                ],
                Text('アドオン: ${template['isAddon'] == true ? '可能' : '不可'}'),
                if (template['isAddon'] == true) ...[
                  if (template['addonFee'] != null) Text('アドオンフィー: ${template['addonFee']}円'),
                  if (template['addonStack'] != null) Text('アドオンスタック: ${template['addonStack']}'),
                ],
                Text('カテゴリ: ${template['tournamentCategory'] == 'regular' ? 'レギュラー' : 'イレギュラー'}'),
                Text('更新日: ${_formatDate(template['updatedAt'])}'),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('トーナメントテンプレート'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.list_alt),
            tooltip: 'ブラインドテンプレート管理',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const TournamentBlindTemplateList(
                    tournamentTemplateId: 'dummy',
                    tournamentTemplateName: 'ブラインドテンプレート管理',
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: '更新',
            onPressed: _isLoading ? null : _loadTemplates,
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
                        onPressed: _loadTemplates,
                        child: const Text('再試行'),
                      ),
                    ],
                  ),
                )
              : _templates.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.list_alt, size: 64, color: Colors.grey),
                          SizedBox(height: 16),
                          Text(
                            'テンプレートがありません',
                            style: TextStyle(fontSize: 18, color: Colors.grey),
                          ),
                          SizedBox(height: 8),
                          Text(
                            '新しいテンプレートを作成してください',
                            style: TextStyle(fontSize: 14, color: Colors.grey),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _templates.length,
                      itemBuilder: (context, index) {
                        final template = _templates[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          child: ListTile(
                            title: Text(
                              template['name'] ?? '無名テンプレート',
                              style: const TextStyle(fontWeight: FontWeight.bold),
                            ),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'エントリーフィー: ${template['entryFee'] ?? 0}円 | 開始スタック: ${template['startStack'] ?? 0}',
                                  style: const TextStyle(color: Colors.grey),
                                ),
                                Text(
                                  'カテゴリ: ${template['tournamentCategory'] == 'regular' ? 'レギュラー' : 'イレギュラー'} | 更新日: ${_formatDate(template['updatedAt'])}',
                                  style: const TextStyle(color: Colors.blue),
                                ),
                              ],
                            ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.edit, color: Colors.blue),
                                  onPressed: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) => CreateTournamentTemplatePage(
                                          existingTemplate: template,
                                        ),
                                      ),
                                    );
                                  },
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete, color: Colors.red),
                                  onPressed: () {
                                    _showArchiveDialog(
                                      template['id'],
                                      template['name'] ?? '無名テンプレート',
                                    );
                                  },
                                ),
                              ],
                            ),
                            onTap: () {
                              _showTemplateDetail(template);
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
              builder: (context) => const CreateTournamentTemplatePage(),
            ),
          );
        },
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
        tooltip: '新規トーナメントテンプレート作成',
        child: const Icon(Icons.add),
      ),
    );
  }

  /// 日付をフォーマットする
  String _formatDate(dynamic date) {
    try {
      if (date is DateTime) {
        return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
      } else if (date is String) {
        // ISO文字列形式の日付を解析
        final parsedDate = DateTime.parse(date);
        return '${parsedDate.year}/${parsedDate.month.toString().padLeft(2, '0')}/${parsedDate.day.toString().padLeft(2, '0')}';
      } else if (date != null) {
        // その他の型の場合、toString()で文字列に変換してから試行
        final parsedDate = DateTime.parse(date.toString());
        return '${parsedDate.year}/${parsedDate.month.toString().padLeft(2, '0')}/${parsedDate.day.toString().padLeft(2, '0')}';
      }
      return '日付不明';
    } catch (e) {
      return '日付不明';
    }
  }
}
