import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'tournamentBlindTemplateList.dart';

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
      // 現在はダミーデータを使用（トーナメントテンプレート用のCloud Functionは未実装）
      await Future.delayed(const Duration(milliseconds: 500));
      
      setState(() {
        _templates = [
          {
            'id': '1',
            'name': '週末トーナメント',
            'description': '週末開催の標準トーナメント',
            'createdAt': DateTime.now().subtract(const Duration(days: 5)),
          },
          {
            'id': '2',
            'name': '月曜夜トーナメント',
            'description': '月曜日の夜開催トーナメント',
            'createdAt': DateTime.now().subtract(const Duration(days: 2)),
          },
          {
            'id': '3',
            'name': '金曜夜ターボ',
            'description': '金曜日のターボトーナメント',
            'createdAt': DateTime.now().subtract(const Duration(hours: 12)),
          },
        ];
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'テンプレートの取得に失敗しました: $e';
        _isLoading = false;
      });
    }
  }

  /// テンプレートを削除する
  Future<void> _deleteTemplate(String templateId) async {
    try {
      // 現在はダミーの削除処理（トーナメントテンプレート用のCloud Functionは未実装）
      await Future.delayed(const Duration(milliseconds: 300));
      
      setState(() {
        _templates.removeWhere((template) => template['id'] == templateId);
      });
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('テンプレートを削除しました')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('削除に失敗しました: $e')),
      );
    }
  }

  /// 削除確認ダイアログを表示する
  void _showDeleteDialog(String templateId, String templateName) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('テンプレート削除'),
          content: Text('「$templateName」を削除しますか？'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                _deleteTemplate(templateId);
              },
              child: const Text('削除', style: TextStyle(color: Colors.red)),
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
                                  '説明: ${template['description'] ?? '説明なし'}',
                                  style: const TextStyle(color: Colors.grey),
                                ),
                                Text(
                                  '作成日: ${_formatDate(template['createdAt'])}',
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
                                    // TODO: テンプレート編集ページへの遷移
                                  },
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete, color: Colors.red),
                                  onPressed: () {
                                    _showDeleteDialog(
                                      template['id'],
                                      template['name'] ?? '無名テンプレート',
                                    );
                                  },
                                ),
                              ],
                            ),
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => TournamentBlindTemplateList(
                                    tournamentTemplateId: template['id'],
                                    tournamentTemplateName: template['name'] ?? '無名テンプレート',
                                  ),
                                ),
                              );
                            },
                          ),
                        );
                      },
                    ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // TODO: 新規トーナメントテンプレート作成ページへの遷移
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('新規トーナメントテンプレート作成機能は準備中です'),
              duration: Duration(seconds: 2),
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
    if (date is DateTime) {
      return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
    }
    return '日付不明';
  }
}
