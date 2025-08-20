import 'package:flutter/material.dart';
import 'createTournamentBlindDetail.dart';

class CreateTournamentBlindBasic extends StatefulWidget {
  final String tournamentTemplateId;
  final String tournamentTemplateName;
  final Map<String, dynamic>? existingBlindTemplate; // 編集用の既存データ

  const CreateTournamentBlindBasic({
    super.key,
    required this.tournamentTemplateId,
    required this.tournamentTemplateName,
    this.existingBlindTemplate,
  });

  @override
  State<CreateTournamentBlindBasic> createState() => _CreateTournamentBlindBasicState();
}

class _CreateTournamentBlindBasicState extends State<CreateTournamentBlindBasic> {
  final _formKey = GlobalKey<FormState>();
  final _blindNameController = TextEditingController();
  final _descriptionController = TextEditingController();
  
  int _numberOfBlindLevels = 30;
  int _defaultStartingChips = 10000;
  int _blindIntervalBeforeReg = 15;
  int _blindIntervalAfterReg = 15;
  String _anteType = 'BBA';
  int _lateRegUntilLevel = 3;
  int _breakTime = 10;
  String _startingBlindType = '100/200';

  final List<String> _anteTypes = [
    'BBA',
    'None',
  ];

  final List<String> _startingBlindTypes = [
    '100/200',
    '100/100',
  ];

  final List<int> _breakTimeOptions = [5, 10, 15, 20, 25, 30];

  @override
  void initState() {
    super.initState();
    
    // 編集モードの場合、既存データで初期値を設定
    if (widget.existingBlindTemplate != null) {
      final template = widget.existingBlindTemplate!;
      _blindNameController.text = template['blindName'] ?? '';
      _descriptionController.text = template['description'] ?? '';
      _numberOfBlindLevels = template['numberOfBlindLevels'] ?? 30;
      _defaultStartingChips = template['defaultStartingChips'] ?? 10000;
      _blindIntervalBeforeReg = template['blindIntervalBeforeRegLev'] ?? 15;
      _blindIntervalAfterReg = template['blindIntervalAfterRegLev'] ?? 15;
      _anteType = template['anteType'] ?? 'BBA';
      _lateRegUntilLevel = template['lateRegUntilLev'] ?? 3;
      _breakTime = template['breakDuration'] ?? 10;
      
      // 開始ブラインドタイプを推定（既存データから）
      final levels = template['levels'] as List? ?? [];
      if (levels.isNotEmpty) {
        final firstLevel = levels.first;
        final smallBlind = firstLevel['smallBlind'] ?? 0;
        final bigBlind = firstLevel['bigBlind'] ?? 0;
        
        if (smallBlind == 100 && bigBlind == 100) {
          _startingBlindType = '100/100';
        } else {
          _startingBlindType = '100/200';
        }
      }
    }
  }

  /// 詳細入力ページに遷移する
  void _navigateToDetail() {
    if (_formKey.currentState!.validate()) {
      final basicData = {
        'blindName': _blindNameController.text.trim(),
        'description': _descriptionController.text.trim(),
        'numberOfBlindLevels': _numberOfBlindLevels,
        'defaultStartingChips': _defaultStartingChips,
        'blindIntervalBeforeReg': _blindIntervalBeforeReg,
        'blindIntervalAfterReg': _blindIntervalAfterReg,
        'anteType': _anteType,
        'lateRegUntilLevel': _lateRegUntilLevel,
        'breakTime': _breakTime,
        'startingBlindType': _startingBlindType,
        'tournamentTemplateId': widget.tournamentTemplateId,
        'tournamentTemplateName': widget.tournamentTemplateName,
      };

      // デバッグログ: 送信するデータを確認
      print('=== デバッグ: 送信する基本データ ===');
      print('startingBlindType: ${_startingBlindType}');
      print('basicData[\'startingBlindType\']: ${basicData['startingBlindType']}');
      print('=====================================');

      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => CreateTournamentBlindDetail(
            basicData: basicData,
            existingBlindTemplate: widget.existingBlindTemplate,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.existingBlindTemplate != null 
          ? 'ブラインドテンプレート編集 - 基本設定' 
          : 'ブラインドテンプレート作成 - 基本設定'),
        backgroundColor: Colors.purple,
        foregroundColor: Colors.white,
      ),
      body: Form(
        key: _formKey,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // トーナメントテンプレート情報
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'トーナメントテンプレート',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.purple,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        widget.tournamentTemplateName,
                        style: const TextStyle(fontSize: 16),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // ブラインド名
              TextFormField(
                controller: _blindNameController,
                decoration: const InputDecoration(
                  labelText: 'ブラインドテンプレート名 *',
                  border: OutlineInputBorder(),
                  hintText: '例: 標準ブラインド',
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'ブラインドテンプレート名を入力してください';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // 説明
              TextFormField(
                controller: _descriptionController,
                decoration: const InputDecoration(
                  labelText: '説明',
                  border: OutlineInputBorder(),
                  hintText: 'ブラインドテンプレートの説明',
                ),
                maxLines: 3,
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
                          color: Colors.blue,
                        ),
                      ),
                      const SizedBox(height: 16),

                                             // ブラインドレベル数と開始チップ数
                       Row(
                         children: [
                           Expanded(
                             child: TextFormField(
                               initialValue: _numberOfBlindLevels.toString(),
                               decoration: const InputDecoration(
                                 labelText: 'ブラインドレベル数 *',
                                 border: OutlineInputBorder(),
                               ),
                               keyboardType: TextInputType.number,
                               validator: (value) {
                                 if (value == null || value.isEmpty) {
                                   return 'ブラインドレベル数を入力してください';
                                 }
                                 final number = int.tryParse(value);
                                 if (number == null || number <= 0) {
                                   return '有効な数値を入力してください';
                                 }
                                 return null;
                               },
                               onChanged: (value) {
                                 _numberOfBlindLevels = int.tryParse(value) ?? 30;
                               },
                             ),
                           ),
                           const SizedBox(width: 16),
                           Expanded(
                             child: TextFormField(
                               initialValue: _defaultStartingChips.toString(),
                               decoration: const InputDecoration(
                                 labelText: '開始チップ数 *',
                                 border: OutlineInputBorder(),
                               ),
                               keyboardType: TextInputType.number,
                               validator: (value) {
                                 if (value == null || value.isEmpty) {
                                   return '開始チップ数を入力してください';
                                 }
                                 final number = int.tryParse(value);
                                 if (number == null || number <= 0) {
                                   return '有効な数値を入力してください';
                                 }
                                 return null;
                               },
                               onChanged: (value) {
                                 _defaultStartingChips = int.tryParse(value) ?? 10000;
                               },
                             ),
                           ),
                         ],
                       ),
                       const SizedBox(height: 16),

                       // レジスト前・レジスト後ブラインド間隔
                       Row(
                         children: [
                           Expanded(
                             child: TextFormField(
                               initialValue: _blindIntervalBeforeReg.toString(),
                               decoration: const InputDecoration(
                                 labelText: 'レジスト前ブラインド間隔（分） *',
                                 border: OutlineInputBorder(),
                               ),
                               keyboardType: TextInputType.number,
                               validator: (value) {
                                 if (value == null || value.isEmpty) {
                                   return 'レジスト前ブラインド間隔を入力してください';
                                 }
                                 final number = int.tryParse(value);
                                 if (number == null || number <= 0) {
                                   return '有効な数値を入力してください';
                                 }
                                 return null;
                               },
                               onChanged: (value) {
                                 _blindIntervalBeforeReg = int.tryParse(value) ?? 15;
                               },
                             ),
                           ),
                           const SizedBox(width: 16),
                           Expanded(
                             child: TextFormField(
                               initialValue: _blindIntervalAfterReg.toString(),
                               decoration: const InputDecoration(
                                 labelText: 'レジスト後ブラインド間隔（分） *',
                                 border: OutlineInputBorder(),
                               ),
                               keyboardType: TextInputType.number,
                               validator: (value) {
                                 if (value == null || value.isEmpty) {
                                   return 'レジスト後ブラインド間隔を入力してください';
                                 }
                                 final number = int.tryParse(value);
                                 if (number == null || number <= 0) {
                                   return '有効な数値を入力してください';
                                 }
                                 return null;
                               },
                               onChanged: (value) {
                                 _blindIntervalAfterReg = int.tryParse(value) ?? 15;
                               },
                             ),
                           ),
                         ],
                       ),
                      const SizedBox(height: 16),

                                             // 開始ブラインド
                       DropdownButtonFormField<String>(
                         value: _startingBlindType,
                         decoration: const InputDecoration(
                           labelText: '開始ブラインド *',
                           border: OutlineInputBorder(),
                         ),
                         items: _startingBlindTypes.map((type) {
                           return DropdownMenuItem(
                             value: type,
                             child: Text(type),
                           );
                         }).toList(),
                         onChanged: (value) {
                           if (value != null) {
                             setState(() {
                               _startingBlindType = value;
                             });
                           }
                         },
                       ),
                      const SizedBox(height: 16),

                                             // アンティタイプとレイトレジ
                       Row(
                         children: [
                           Expanded(
                             child: DropdownButtonFormField<String>(
                               value: _anteType,
                               decoration: const InputDecoration(
                                 labelText: 'アンティタイプ *',
                                 border: OutlineInputBorder(),
                               ),
                               items: _anteTypes.map((type) {
                                 return DropdownMenuItem(
                                   value: type,
                                   child: Text(type == 'BBA' ? 'BBA' : 'なし'),
                                 );
                               }).toList(),
                               onChanged: (value) {
                                 if (value != null) {
                                   setState(() {
                                     _anteType = value;
                                   });
                                 }
                               },
                             ),
                           ),
                           const SizedBox(width: 16),
                           Expanded(
                             child: DropdownButtonFormField<int>(
                               value: _lateRegUntilLevel,
                               decoration: const InputDecoration(
                                 labelText: 'レイトレジ終了レベル *',
                                 border: OutlineInputBorder(),
                               ),
                               items: List.generate(_numberOfBlindLevels, (index) {
                                 return DropdownMenuItem(
                                   value: index + 1,
                                   child: Text('レベル ${index + 1}'),
                                 );
                               }),
                               onChanged: (value) {
                                 if (value != null) {
                                   setState(() {
                                     _lateRegUntilLevel = value;
                                   });
                                 }
                               },
                             ),
                           ),
                         ],
                       ),
                      const SizedBox(height: 16),

                                             // ブレイク時間
                       DropdownButtonFormField<int>(
                         value: _breakTime,
                         decoration: const InputDecoration(
                           labelText: 'ブレイク時間（分） *',
                           border: OutlineInputBorder(),
                         ),
                         items: _breakTimeOptions.map((time) {
                           return DropdownMenuItem(
                             value: time,
                             child: Text('${time}分'),
                           );
                         }).toList(),
                         onChanged: (value) {
                           if (value != null) {
                             setState(() {
                               _breakTime = value;
                             });
                           }
                         },
                       ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 32),

              // 詳細設定ボタン
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _navigateToDetail,
                  icon: const Icon(Icons.arrow_forward),
                  label: const Text('詳細設定へ進む'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.purple,
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
    _blindNameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }
}
