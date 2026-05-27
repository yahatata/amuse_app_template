import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/globalConstant.dart';
import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';

class EditTournamentTemplatePage extends StatefulWidget {
  final String templateId;
  final Map<String, dynamic> templateData;

  const EditTournamentTemplatePage({
    super.key,
    required this.templateId,
    required this.templateData,
  });

  @override
  State<EditTournamentTemplatePage> createState() => _EditTournamentTemplatePageState();
}

class _EditTournamentTemplatePageState extends State<EditTournamentTemplatePage> {
  final _formKey = GlobalKey<FormState>();
  final _functions = FunctionsClient.instance;

  // 基本設定
  final _nameController = TextEditingController();
  late final TextEditingController _addonLimitController;
  int _entryFee = 1000;
  int _startStack = 10000;
  double _prizeRatio = 0.7;
  
  // リエントリー設定
  bool _isReentry = false;
  int? _maxReentries;
  int? _reentryFee;
  
  // アドオン設定
  bool _isAddon = false;
  int _addonFee = 1000;
  int _addonStack = 10000;
  int _addonLimitPerPlayer = 1;
  
  // ブラインド構造
  String _selectedBlindTemplateId = '';
  String _selectedBlindTemplateName = '';
  
  // 色設定
  Color _selectedColor = Colors.blue;
  Color _originalColor = Colors.blue;
  
  // ポイントタイプ
  String _selectedPointType = 'pointA';
  
  // スケジュール済みトーナメント選択
  List<String> _selectedTournamentIds = [];

  // データ
  List<Map<String, dynamic>> _blindTemplates = [];
  List<Map<String, dynamic>> _scheduledTournaments = [];
  bool _isLoading = false;
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _addonLimitController = TextEditingController();
    _initializeData();
    _loadBlindTemplates();
    _loadScheduledTournaments();
  }

  @override
  void dispose() {
    _addonLimitController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _initializeData() {
    final template = widget.templateData;
    _nameController.text = template['name'] ?? '';
    _entryFee = template['entryFee'] ?? 1000;
    _startStack = template['startStack'] ?? 10000;
    _prizeRatio = template['prizeRatio'] ?? 0.7;
    _isReentry = template['isReentry'] ?? false;
    _maxReentries = template['maxReentries'];
    _reentryFee = template['reentryFee'];
    _isAddon = template['isAddon'] ?? false;
    _addonFee = template['addonFee'] ?? 1000;
    _addonStack = template['addonStack'] ?? 10000;
    _addonLimitPerPlayer = resolveAddonLimitPerPlayerUi(
      isAddon: _isAddon,
      addonLimitPerPlayer: template['addonLimitPerPlayer'],
    );
    _addonLimitController.text = _addonLimitPerPlayer.toString();
    _selectedBlindTemplateId = template['blindStructure'] ?? '';
    _selectedPointType = template['pointType'] ?? 'pointA';
    
    // 色の初期化
    if (template['color'] != null) {
      _selectedColor = Color(int.parse(template['color'].replaceFirst('#', '0xFF')));
      _originalColor = _selectedColor;
    }
  }

  Future<void> _loadBlindTemplates() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final callable = _functions.httpsCallable('getBlindTemplates');
      final result = await callable.call();
      final response = result.data;

      if (response['success'] == true) {
        final templatesRaw = response['blindTemplates'] as List;
        setState(() {
          _blindTemplates = templatesRaw.map((template) => 
            Map<String, dynamic>.from(template as Map)).toList();
          
          // 選択されているブラインドテンプレート名を設定
          final selectedTemplate = _blindTemplates.firstWhere(
            (template) => template['id'] == _selectedBlindTemplateId,
            orElse: () => {'blindName': '読み込み中...'},
          );
          _selectedBlindTemplateName = selectedTemplate['blindName'] ?? '読み込み中...';
        });
      } else {
        setState(() {
          _errorMessage = response['error'] ?? 'ブラインドテンプレートの読み込みに失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'ブラインドテンプレートの読み込みに失敗しました: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _loadScheduledTournaments() async {
    try {
      final callable = _functions.httpsCallable('getScheduledTournamentsForEdit');
      final result = await callable.call({
        'type': 'template',
        'id': widget.templateId,
      });
      final response = result.data;

      if (response['success'] == true) {
        final tournamentsRaw = response['tournaments'] as List;
        setState(() {
          _scheduledTournaments = tournamentsRaw.map((tournament) {
            final tournamentMap = Map<String, dynamic>.from(tournament as Map);
            
            // startAtの型変換（Firestore Timestamp -> DateTime）
            if (tournamentMap['startAt'] != null) {
              final startAtValue = tournamentMap['startAt'];
              if (startAtValue is Map && startAtValue.containsKey('_seconds')) {
                // Firestore Timestamp形式の場合
                final seconds = startAtValue['_seconds'] as int;
                final nanoseconds = startAtValue['_nanoseconds'] as int? ?? 0;
                tournamentMap['startAt'] = DateTime.fromMillisecondsSinceEpoch(
                  seconds * 1000 + (nanoseconds / 1000000).round(),
                );
              } else if (startAtValue is String) {
                // ISO文字列の場合
                tournamentMap['startAt'] = DateTime.parse(startAtValue);
              }
            }
            
            return tournamentMap;
          }).toList();
          
          // startAtでソート（古い順、左上から右へ）
          _scheduledTournaments.sort((a, b) {
            final aStartAt = a['startAt'] as DateTime?;
            final bStartAt = b['startAt'] as DateTime?;
            if (aStartAt == null && bStartAt == null) return 0;
            if (aStartAt == null) return 1;
            if (bStartAt == null) return -1;
            return aStartAt.compareTo(bStartAt);
          });
        });
      } else {
        setState(() {
          _errorMessage = response['error'] ?? 'スケジュール済みトーナメントの読み込みに失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'スケジュール済みトーナメントの読み込みに失敗しました: $e';
      });
    }
  }

  void _showColorPicker() {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('色を選択'),
          content: SingleChildScrollView(
            child: ColorPicker(
              pickerColor: _selectedColor,
              onColorChanged: (Color color) {
                setState(() {
                  _selectedColor = color;
                });
              },
              pickerAreaHeightPercent: 0.8,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('決定'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _saveChanges() async {
    if (!_formKey.currentState!.validate()) return;

    if (_isAddon) {
      final p = int.tryParse(_addonLimitController.text.trim());
      if (p != null && p >= 1) {
        _addonLimitPerPlayer = p;
      }
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final callable = _functions.httpsCallable('updateTournamentTemplate');
      final result = await callable.call({
        'templateId': widget.templateId,
        'name': _nameController.text,
        'entryFee': _entryFee,
        'isReentry': _isReentry,
        'maxReentries': _maxReentries,
        'reentryFee': _isReentry ? _reentryFee : null,
        'startStack': _startStack,
        'isAddon': _isAddon,
        'addonFee': _isAddon ? _addonFee : null,
        'addonStack': _isAddon ? _addonStack : null,
        'addonLimitPerPlayer': _isAddon ? _addonLimitPerPlayer : 0,
        'blindStructure': _selectedBlindTemplateId,
        'prizeRatio': _prizeRatio,
        'color': _selectedColor != _originalColor 
            ? '#${_selectedColor.value.toRadixString(16).substring(2).toUpperCase()}'
            : null, // 変更されていない場合はnullを送信（上書きしない）
        'pointType': _selectedPointType,
        'selectedTournamentIds': _selectedTournamentIds,
      });
      final response = result.data;

      if (response['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? '更新が完了しました')),
        );
        Navigator.pop(context);
      } else {
        setState(() {
          _errorMessage = response['error'] ?? '更新に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = '更新に失敗しました: $e';
      });
    } finally {
      setState(() {
        _isSaving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Scaffold(
      appBar: AppBar(
        title: const Text('トーナメントテンプレート編集'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
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

                    const SizedBox(height: 16),

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
                              ),
                            ),
                            const SizedBox(height: 16),

                            // トーナメント名
                            TextFormField(
                              controller: _nameController,
                              decoration: const InputDecoration(
                                labelText: 'トーナメント名 *',
                                border: OutlineInputBorder(),
                              ),
                              validator: (value) {
                                if (value == null || value.isEmpty) {
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
                                prefixText: '¥',
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
                                  return '0-100の範囲で入力してください';
                                }
                                return null;
                              },
                              onChanged: (value) {
                                final number = double.tryParse(value);
                                if (number != null) {
                                  _prizeRatio = number / 100;
                                }
                              },
                            ),
                            const SizedBox(height: 16),

                            // 色選択
                            InkWell(
                              onTap: _showColorPicker,
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  border: Border.all(color: Colors.grey),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 40,
                                      height: 40,
                                      decoration: BoxDecoration(
                                        color: _selectedColor,
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: Colors.grey),
                                      ),
                                    ),
                                    const SizedBox(width: 16),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text(
                                          '色を選択',
                                          style: TextStyle(fontSize: 16),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '現在: #${_selectedColor.value.toRadixString(16).substring(2).toUpperCase()}',
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: Colors.grey,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const Spacer(),
                                    const Icon(Icons.arrow_forward_ios, size: 16),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),

                            // ポイントタイプ
                            DropdownButtonFormField<String>(
                              value: _selectedPointType,
                              decoration: const InputDecoration(
                                labelText: 'ポイントタイプ',
                                border: OutlineInputBorder(),
                              ),
                              items: GlobalConstants.pointTypes.map<DropdownMenuItem<String>>((pointType) {
                                return DropdownMenuItem<String>(
                                  value: pointType,
                                  child: Text(pointType),
                                );
                              }).toList(),
                              onChanged: (value) {
                                if (value != null) {
                                  setState(() {
                                    _selectedPointType = value;
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
                              ),
                            ),
                            const SizedBox(height: 16),
                            SwitchListTile(
                              title: const Text('リエントリーを許可する'),
                              value: _isReentry,
                              onChanged: (value) {
                                setState(() {
                                  _isReentry = value;
                                  if (!value) {
                                    _maxReentries = null;
                                    _reentryFee = null;
                                  }
                                });
                              },
                            ),
                            if (_isReentry) ...[
                              const SizedBox(height: 16),
                              TextFormField(
                                initialValue: _maxReentries?.toString() ?? '',
                                decoration: const InputDecoration(
                                  labelText: '最大リエントリー回数',
                                  border: OutlineInputBorder(),
                                ),
                                keyboardType: TextInputType.number,
                                onChanged: (value) {
                                  if (value.isEmpty) {
                                    _maxReentries = null;
                                  } else {
                                    _maxReentries = int.tryParse(value);
                                  }
                                },
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                initialValue: _reentryFee?.toString() ?? '',
                                decoration: const InputDecoration(
                                  labelText: 'リエントリーフィー',
                                  border: OutlineInputBorder(),
                                  prefixText: '¥',
                                ),
                                keyboardType: TextInputType.number,
                                onChanged: (value) {
                                  if (value.isEmpty) {
                                    _reentryFee = null;
                                  } else {
                                    _reentryFee = int.tryParse(value);
                                  }
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
                              ),
                            ),
                            const SizedBox(height: 16),
                            SwitchListTile(
                              title: const Text('アドオンを許可する'),
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
                                  prefixText: '¥',
                                ),
                                keyboardType: TextInputType.number,
                                validator: (value) {
                                  if (_isAddon && (value == null || value.isEmpty)) {
                                    return 'アドオンフィーを入力してください';
                                  }
                                  final number = int.tryParse(value ?? '');
                                  if (_isAddon && (number == null || number <= 0)) {
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
                                ),
                                keyboardType: TextInputType.number,
                                validator: (value) {
                                  if (_isAddon && (value == null || value.isEmpty)) {
                                    return 'アドオンスタックを入力してください';
                                  }
                                  final number = int.tryParse(value ?? '');
                                  if (_isAddon && (number == null || number <= 0)) {
                                    return '有効な数値を入力してください';
                                  }
                                  return null;
                                },
                                onChanged: (value) {
                                  _addonStack = int.tryParse(value) ?? 10000;
                                },
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                controller: _addonLimitController,
                                decoration: const InputDecoration(
                                  labelText: '1人あたり Addon 上限回数 *',
                                  border: OutlineInputBorder(),
                                ),
                                keyboardType: TextInputType.number,
                                validator: (value) {
                                  if (!_isAddon) return null;
                                  if (value == null || value.trim().isEmpty) {
                                    return '上限回数を入力してください';
                                  }
                                  final n = int.tryParse(value.trim());
                                  if (n == null || n < 1) {
                                    return '1 以上の整数を入力してください';
                                  }
                                  return null;
                                },
                                onChanged: (value) {
                                  final n = int.tryParse(value.trim());
                                  if (n != null && n >= 1) {
                                    _addonLimitPerPlayer = n;
                                  }
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
                              ),
                            ),
                            const SizedBox(height: 16),
                            DropdownButtonFormField<String>(
                              value: _selectedBlindTemplateId.isNotEmpty ? _selectedBlindTemplateId : null,
                              decoration: const InputDecoration(
                                labelText: 'ブラインド構造 *',
                                border: OutlineInputBorder(),
                              ),
                              items: _blindTemplates.map<DropdownMenuItem<String>>((template) {
                                return DropdownMenuItem<String>(
                                  value: template['id'] as String,
                                  child: Text(template['blindName'] ?? '無名テンプレート'),
                                );
                              }).toList(),
                              onChanged: (value) {
                                setState(() {
                                  _selectedBlindTemplateId = value ?? '';
                                  final selectedTemplate = _blindTemplates.firstWhere(
                                    (template) => template['id'] == value,
                                    orElse: () => {'blindName': ''},
                                  );
                                  _selectedBlindTemplateName = selectedTemplate['blindName'] ?? '';
                                });
                              },
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    // スケジュール済みトーナメント選択
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'スケジュール済みのトーナメントへの適用',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              '今回の編集内容を適用するトーナメントを選択してください',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              '※すでにスケジュールされたトーナメントを全て表示しています。',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                            const SizedBox(height: 16),
                            if (_scheduledTournaments.isEmpty)
                              const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(32),
                                  child: Text(
                                    'スケジュール済みのトーナメントはありません',
                                    style: TextStyle(color: Colors.grey),
                                  ),
                                ),
                              )
                            else
                              GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 8,
                                  childAspectRatio: 1.2,
                                  crossAxisSpacing: 8,
                                  mainAxisSpacing: 8,
                                ),
                                itemCount: _scheduledTournaments.length,
                                itemBuilder: (context, index) {
                                  final tournament = _scheduledTournaments[index];
                                  final isSelected = _selectedTournamentIds.contains(tournament['id']);
                                  final startAt = tournament['startAt'] as DateTime;
                                  
                                  return GestureDetector(
                                    onTap: () {
                                      setState(() {
                                        if (isSelected) {
                                          _selectedTournamentIds.remove(tournament['id']);
                                        } else {
                                          _selectedTournamentIds.add(tournament['id']);
                                        }
                                      });
                                    },
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: isSelected ? Colors.blue : Colors.grey[300],
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(
                                          color: isSelected ? Colors.blue : Colors.grey,
                                          width: 2,
                                        ),
                                      ),
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            DateFormat('M/d').format(startAt),
                                            style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.bold,
                                              color: isSelected ? Colors.white : Colors.black,
                                            ),
                                          ),
                                          Text(
                                            DateFormat('HH:mm').format(startAt),
                                            style: TextStyle(
                                              fontSize: 8,
                                              color: isSelected ? Colors.white : Colors.black,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // 保存ボタン
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _isSaving ? null : _saveChanges,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: const Text(
                          '変更を保存',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ),
        if (_isSaving)
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
    );
  }
}
