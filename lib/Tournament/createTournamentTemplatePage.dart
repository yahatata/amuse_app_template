import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'tournamentBlindTemplateList.dart';
import '../globalConstant.dart';

class CreateTournamentTemplatePage extends StatefulWidget {
  final Map<String, dynamic>? existingTemplate;
  
  const CreateTournamentTemplatePage({
    super.key,
    this.existingTemplate,
  });

  @override
  State<CreateTournamentTemplatePage> createState() => _CreateTournamentTemplatePageState();
}

class _CreateTournamentTemplatePageState extends State<CreateTournamentTemplatePage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  
  // 基本設定
  int _entryFee = 1000;
  int _startStack = 10000;
  double _prizeRatio = GlobalConstants.defaultPrizeRatio;
  
  // リエントリー設定
  bool _isReentry = false;
  int? _maxReentries;
  int? _reentryFee;
  
  // アドオン設定
  bool _isAddon = false;
  int _addonFee = 1000;
  int _addonStack = 10000;
  
  // ブラインド構造
  String _selectedBlindTemplateId = '';
  String _selectedBlindTemplateName = '';
  
  // トーナメントカテゴリ
  String _tournamentCategory = 'regular';
  
  // 状態管理
  bool _isLoading = false;
  bool _isSaving = false;
  String? _errorMessage;
  
  // ブラインドテンプレート一覧
  List<Map<String, dynamic>> _blindTemplates = [];

  @override
  void initState() {
    super.initState();
    _loadBlindTemplates();
    _initializeExistingTemplate();
  }

  /// 既存のテンプレートデータを初期化
  void _initializeExistingTemplate() {
    if (widget.existingTemplate != null) {
      final template = widget.existingTemplate!;
      _nameController.text = template['name'] ?? '';
      _entryFee = template['entryFee'] ?? 1000;
      _startStack = template['startStack'] ?? 10000;
      _prizeRatio = template['prizeRatio'] ?? GlobalConstants.defaultPrizeRatio;
      _isReentry = template['isReentry'] ?? false;
      _maxReentries = template['maxReentries'];
      _reentryFee = template['reentryFee'];
      _isAddon = template['isAddon'] ?? false;
      _addonFee = template['addonFee'] ?? 1000;
      _addonStack = template['addonStack'] ?? 10000;
      _selectedBlindTemplateId = template['blindStructure'] ?? '';
      _tournamentCategory = template['tournamentCategory'] ?? 'regular';
      
      // ブラインドテンプレート名を設定（後でロード後に更新）
      _selectedBlindTemplateName = '読み込み中...';
    }
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
        // Cloud Functionsから返されるデータの型変換
        final List<dynamic> rawTemplates = response['blindTemplates'] ?? [];
        final List<Map<String, dynamic>> convertedTemplates = rawTemplates.map((template) {
          final Map<String, dynamic> converted = {};
          (template as Map).forEach((key, value) {
            converted[key.toString()] = value;
          });
          return converted;
        }).toList();
        
        setState(() {
          _blindTemplates = convertedTemplates;
          _isLoading = false;
        });
        
        // 既存のテンプレートがある場合、ブラインドテンプレート名を設定
        if (widget.existingTemplate != null && _selectedBlindTemplateId.isNotEmpty) {
          final selectedTemplate = _blindTemplates.firstWhere(
            (template) => template['id'] == _selectedBlindTemplateId,
            orElse: () => <String, dynamic>{},
          );
          if (selectedTemplate.isNotEmpty) {
            setState(() {
              _selectedBlindTemplateName = selectedTemplate['blindName'] ?? '無名テンプレート';
            });
          }
        }
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

  /// ブラインドテンプレート選択ダイアログを表示
  void _showBlindTemplateSelector() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('ブラインドテンプレートを選択'),
          content: SizedBox(
            width: double.maxFinite,
            height: 400,
            child: ListView.builder(
              itemCount: _blindTemplates.length,
              itemBuilder: (context, index) {
                final template = _blindTemplates[index];
                return Card(
                  margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
                  child: ListTile(
                    title: Text(
                      template['blindName'] ?? '無名テンプレート',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${template['anteType'] ?? ''} | レジスト前: ${template['blindIntervalBeforeRegLev'] ?? 0}分 | レジスト後: ${template['blindIntervalAfterRegLev'] ?? 0}分'),
                        Text('レジストまでの時間: ${_calculateRegTime(template)}分 ※ブレイクの時間を含まないため正確でない場合があります'),
                      ],
                    ),
                    onTap: () {
                      setState(() {
                        _selectedBlindTemplateId = template['id'];
                        _selectedBlindTemplateName = template['blindName'] ?? '無名テンプレート';
                      });
                      Navigator.of(context).pop();
                    },
                  ),
                );
              },
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
          ],
        );
      },
    );
  }

  /// レジストまでの時間を計算
  String _calculateRegTime(Map<String, dynamic> template) {
    final lateRegUntilLevel = (template['lateRegUntilLev'] ?? 0) as int;
    final blindIntervalBeforeReg = (template['blindIntervalBeforeRegLev'] ?? 0) as int;
    
    // ブレイクの時間を含まずに計算
    final totalTime = blindIntervalBeforeReg * lateRegUntilLevel;
    
    return totalTime.toString();
  }

  /// トーナメントテンプレートを保存する
  Future<void> _saveTournamentTemplate() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedBlindTemplateId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ブラインドテンプレートを選択してください')),
      );
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('createTournamentTemplate');

      final tournamentTemplateData = {
        'name': _nameController.text.trim(),
        'entryFee': _entryFee,
        'isReentry': _isReentry,
        'maxReentries': _maxReentries,
        'reentryFee': _reentryFee,
        'startStack': _startStack,
        'isAddon': _isAddon,
        'addonFee': _isAddon ? _addonFee : null,
        'addonStack': _isAddon ? _addonStack : null,
        'blindStructure': _selectedBlindTemplateId,
        'prizeRatio': _prizeRatio,
        'tournamentCategory': _tournamentCategory,
      };

      final result = await callable.call(tournamentTemplateData);
      final response = result.data;

      if (response['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? 'トーナメントテンプレートが正常に作成されました')),
        );
        Navigator.pop(context, true);
      } else {
        setState(() {
          _errorMessage = response['error'] ?? '保存に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = '保存に失敗しました: $e';
      });
    } finally {
      setState(() {
        _isSaving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existingTemplate != null 
          ? 'トーナメントテンプレート編集' 
          : 'トーナメントテンプレート作成'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              ),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // エラーメッセージ
                    if (_errorMessage != null)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        color: Colors.red[100],
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),

                    // 基本設定
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              '基本設定',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Colors.green,
                              ),
                            ),
                            const SizedBox(height: 16),

                            // トーナメント名
                            TextFormField(
                              controller: _nameController,
                              decoration: const InputDecoration(
                                labelText: 'トーナメント名 *',
                                border: OutlineInputBorder(),
                                hintText: '例: 週末トーナメント',
                              ),
                              validator: (value) {
                                if (value == null || value.trim().isEmpty) {
                                  return 'トーナメント名を入力してください';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),

                            // エントリーフィー
                            TextFormField(
                              initialValue: _entryFee.toString(),
                              decoration: const InputDecoration(
                                labelText: 'エントリーフィー *',
                                border: OutlineInputBorder(),
                                suffixText: '円',
                              ),
                              keyboardType: TextInputType.number,
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'エントリーフィーを入力してください';
                                }
                                final number = int.tryParse(value);
                                if (number == null || number <= 0) {
                                  return '有効な数値を入力してください';
                                }
                                return null;
                              },
                              onChanged: (value) {
                                _entryFee = int.tryParse(value) ?? 1000;
                              },
                            ),
                            const SizedBox(height: 16),

                            // 開始スタック
                            TextFormField(
                              initialValue: _startStack.toString(),
                              decoration: const InputDecoration(
                                labelText: '開始スタック *',
                                border: OutlineInputBorder(),
                                suffixText: 'チップ',
                              ),
                              keyboardType: TextInputType.number,
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return '開始スタックを入力してください';
                                }
                                final number = int.tryParse(value);
                                if (number == null || number <= 0) {
                                  return '有効な数値を入力してください';
                                }
                                return null;
                              },
                              onChanged: (value) {
                                _startStack = int.tryParse(value) ?? 10000;
                              },
                            ),
                            const SizedBox(height: 16),

                            // プライズ割合
                            TextFormField(
                              initialValue: (_prizeRatio * 100).toString(),
                              decoration: const InputDecoration(
                                labelText: 'プライズ割合 *',
                                border: OutlineInputBorder(),
                                suffixText: '%',
                              ),
                              keyboardType: TextInputType.number,
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'プライズ割合を入力してください';
                                }
                                final number = double.tryParse(value);
                                if (number == null || number <= 0 || number > 100) {
                                  return '0より大きく100以下の数値を入力してください';
                                }
                                return null;
                              },
                              onChanged: (value) {
                                final percentage = double.tryParse(value) ?? 70.0;
                                _prizeRatio = percentage / 100;
                              },
                            ),
                            const SizedBox(height: 16),





                            // トーナメントカテゴリ
                            DropdownButtonFormField<String>(
                              value: _tournamentCategory,
                              decoration: const InputDecoration(
                                labelText: 'トーナメントカテゴリ *',
                                border: OutlineInputBorder(),
                              ),
                              items: const [
                                DropdownMenuItem(value: 'regular', child: Text('レギュラー')),
                                DropdownMenuItem(value: 'irregular', child: Text('イレギュラー')),
                              ],
                              onChanged: (value) {
                                if (value != null) {
                                  setState(() {
                                    _tournamentCategory = value;
                                  });
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // リエントリー設定
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'リエントリー設定',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Colors.green,
                              ),
                            ),
                            const SizedBox(height: 16),

                            SwitchListTile(
                              title: const Text('リエントリー可能'),
                              subtitle: const Text('リエントリーを許可する'),
                              value: _isReentry,
                              onChanged: (value) {
                                setState(() {
                                  _isReentry = value;
                                });
                              },
                            ),

                            if (_isReentry) ...[
                              const SizedBox(height: 16),
                              TextFormField(
                                initialValue: _maxReentries?.toString() ?? '',
                                decoration: const InputDecoration(
                                  labelText: '1人当たりの最大リエントリー数（任意）',
                                  border: OutlineInputBorder(),
                                  suffixText: '回',
                                  helperText: '※無制限の場合空白',
                                ),
                                keyboardType: TextInputType.number,
                                onChanged: (value) {
                                  _maxReentries = value.isEmpty ? null : int.tryParse(value);
                                },
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                initialValue: _reentryFee?.toString() ?? '',
                                decoration: const InputDecoration(
                                  labelText: 'リエントリーフィー（任意）',
                                  border: OutlineInputBorder(),
                                  suffixText: '円',
                                ),
                                keyboardType: TextInputType.number,
                                onChanged: (value) {
                                  _reentryFee = value.isEmpty ? null : int.tryParse(value);
                                },
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // アドオン設定
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'アドオン設定',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Colors.green,
                              ),
                            ),
                            const SizedBox(height: 16),

                            SwitchListTile(
                              title: const Text('アドオン可能'),
                              subtitle: const Text('アドオンを許可する'),
                              value: _isAddon,
                              onChanged: (value) {
                                setState(() {
                                  _isAddon = value;
                                });
                              },
                            ),

                            if (_isAddon) ...[
                              const SizedBox(height: 16),
                              TextFormField(
                                initialValue: _addonFee.toString(),
                                decoration: const InputDecoration(
                                  labelText: 'アドオンフィー *',
                                  border: OutlineInputBorder(),
                                  suffixText: '円',
                                ),
                                keyboardType: TextInputType.number,
                                validator: (value) {
                                  if (!_isAddon) return null;
                                  if (value == null || value.isEmpty) {
                                    return 'アドオンフィーを入力してください';
                                  }
                                  final number = int.tryParse(value);
                                  if (number == null || number <= 0) {
                                    return '有効な数値を入力してください';
                                  }
                                  return null;
                                },
                                onChanged: (value) {
                                  _addonFee = int.tryParse(value) ?? 1000;
                                },
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                initialValue: _addonStack.toString(),
                                decoration: const InputDecoration(
                                  labelText: 'アドオンスタック *',
                                  border: OutlineInputBorder(),
                                  suffixText: 'チップ',
                                ),
                                keyboardType: TextInputType.number,
                                validator: (value) {
                                  if (!_isAddon) return null;
                                  if (value == null || value.isEmpty) {
                                    return 'アドオンスタックを入力してください';
                                  }
                                  final number = int.tryParse(value);
                                  if (number == null || number <= 0) {
                                    return '有効な数値を入力してください';
                                  }
                                  return null;
                                },
                                onChanged: (value) {
                                  _addonStack = int.tryParse(value) ?? 10000;
                                },
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ブラインド構造
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'ブラインド構造',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Colors.green,
                              ),
                            ),
                            const SizedBox(height: 16),

                            ListTile(
                              title: const Text('ブラインドテンプレート'),
                              subtitle: Text(_selectedBlindTemplateName.isEmpty 
                                ? 'ブラインドテンプレートを選択してください' 
                                : _selectedBlindTemplateName),
                              trailing: const Icon(Icons.arrow_forward_ios),
                              onTap: _showBlindTemplateSelector,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),

                    // 保存ボタン
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isSaving ? null : _saveTournamentTemplate,
                        icon: const Icon(Icons.save),
                        label: Text(widget.existingTemplate != null 
                          ? 'トーナメントテンプレートを更新' 
                          : 'トーナメントテンプレートを保存'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }
}
