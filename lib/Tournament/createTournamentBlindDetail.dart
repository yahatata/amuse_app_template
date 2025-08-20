import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

class CreateTournamentBlindDetail extends StatefulWidget {
  final Map<String, dynamic> basicData;
  final Map<String, dynamic>? existingBlindTemplate; // 編集用の既存データ

  const CreateTournamentBlindDetail({
    super.key,
    required this.basicData,
    this.existingBlindTemplate,
  });

  @override
  State<CreateTournamentBlindDetail> createState() => _CreateTournamentBlindDetailState();
}

class _CreateTournamentBlindDetailState extends State<CreateTournamentBlindDetail> {
  final _formKey = GlobalKey<FormState>();
  List<Map<String, dynamic>> _blindLevels = [];
  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _generateBlindLevels();
  }

  @override
  void didUpdateWidget(CreateTournamentBlindDetail oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 基本データが変更された場合、ブラインドレベルを再生成
    if (oldWidget.basicData != widget.basicData) {
      _generateBlindLevels();
    }
  }

  /// 基本データからブラインドレベルを自動生成する
  void _generateBlindLevels() {
    setState(() {
      _isLoading = true;
    });

    // 既存のブラインドテンプレートがある場合はそれを使用
    if (widget.existingBlindTemplate != null) {
      final existingLevels = widget.existingBlindTemplate!['levels'] as List? ?? [];
      _blindLevels = existingLevels.map((level) {
        final Map<String, dynamic> convertedLevel = {};
        (level as Map).forEach((key, value) {
          // null値を適切なデフォルト値に変換
          if (key == 'hasBreakAfter') {
            convertedLevel[key.toString()] = value ?? false;
          } else if (key == 'isLateReg') {
            convertedLevel[key.toString()] = value ?? false;
          } else if (key == 'ante') {
            convertedLevel[key.toString()] = value ?? 0;
          } else if (key == 'endTime') {
            convertedLevel[key.toString()] = value ?? 0;
          } else if (key == 'timeFromLastBreak') {
            convertedLevel[key.toString()] = value ?? 0;
          } else if (key == 'breakDuration') {
            convertedLevel[key.toString()] = value ?? 0;
          } else {
            convertedLevel[key.toString()] = value;
          }
        });
        return convertedLevel;
      }).toList();
      _calculateTimes();
      setState(() {
        _isLoading = false;
      });
      return;
    }

    // 新規作成の場合
    final numberOfLevels = widget.basicData['numberOfBlindLevels'] as int;
    final startingBlindType = widget.basicData['startingBlindType'] as String;
    final anteType = widget.basicData['anteType'] as String;
    final lateRegUntilLevel = widget.basicData['lateRegUntilLevel'] as int;
    final blindIntervalBeforeReg = widget.basicData['blindIntervalBeforeReg'] as int;
    final blindIntervalAfterReg = widget.basicData['blindIntervalAfterReg'] as int;
    final breakTime = widget.basicData['breakTime'] as int;

    // デバッグログ: 受け取ったデータを確認
    print('=== デバッグ: 受け取った基本データ ===');
    print('startingBlindType: $startingBlindType');
    print('numberOfLevels: $numberOfLevels');
    print('lateRegUntilLevel: $lateRegUntilLevel');
    print('blindIntervalBeforeReg: $blindIntervalBeforeReg');
    print('blindIntervalAfterReg: $blindIntervalAfterReg');
    print('breakTime: $breakTime');
    print('=====================================');

    // まずレジスト期間中のブラインドを計算
    List<Map<String, dynamic>> blindLevels = [];
    
    for (int index = 0; index < numberOfLevels; index++) {
      final level = index + 1;
      
      // 開始ブラインドタイプに基づいてブラインドを計算
      int smallBlind, bigBlind;
      
      if (level <= lateRegUntilLevel) {
        // レジスト期間中のブラインド計算
        print('レベル$level: startingBlindType = $startingBlindType'); // デバッグログ
        
        if (startingBlindType == '100/200') {
          // 100/200(200)の場合
          smallBlind = 100 * (1 << (index));
          bigBlind = smallBlind * 2;
          print('レベル$level: 100/200パターン - SB: $smallBlind, BB: $bigBlind'); // デバッグログ
        } else {
          // 100/100(100)の場合
          if (index == 0) {
            // 1回目は100/100
            smallBlind = 100;
            bigBlind = 100;
            print('レベル$level: 100/100パターン（1回目） - SB: $smallBlind, BB: $bigBlind'); // デバッグログ
          } else if (index == 1) {
            // 2回目は100/200
            smallBlind = 100;
            bigBlind = 200;
            print('レベル$level: 100/100パターン（2回目） - SB: $smallBlind, BB: $bigBlind'); // デバッグログ
          } else {
            // 3回目以降は200/400, 400/800と倍になる
            smallBlind = 200 * (1 << (index - 2));
            bigBlind = smallBlind * 2;
            print('レベル$level: 100/100パターン（3回目以降） - SB: $smallBlind, BB: $bigBlind'); // デバッグログ
          }
        }
      } else {
        // レジスト後のブラインド計算（カラーアップ）
        if (level == lateRegUntilLevel + 1) {
          // レジスト直後のブラインド（カラーアップ）
          // BBが1000に届いていない場合は切り上げ、1000より大きい場合は切り捨て
          final previousBigBlind = blindLevels[lateRegUntilLevel - 1]['bigBlind'] as int;
          print('カラーアップ計算: レベル$level, 前のBB: $previousBigBlind'); // デバッグログ
          
          if (previousBigBlind < 1000) {
            // 1000に届いていない場合は切り上げ
            smallBlind = 1000;
          } else {
            // 1000より大きい場合は1000単位に切り捨て
            smallBlind = (previousBigBlind ~/ 1000) * 1000;
          }
          
          bigBlind = smallBlind * 2;
          print('カラーアップ結果: SB: $smallBlind, BB: $bigBlind'); // デバッグログ
        } else {
          // レジスト後2番目以降のブラインド（通常の倍増）
          final previousSmallBlind = blindLevels[level - 2]['smallBlind'] as int;
          smallBlind = previousSmallBlind * 2;
          bigBlind = smallBlind * 2;
        }
      }
      
      final ante = anteType == 'BBA' ? bigBlind : 0;
      final duration = level <= lateRegUntilLevel ? blindIntervalBeforeReg : blindIntervalAfterReg;
      
      // レイトレジ終了レベルには必ずブレイクを挿入
      final hasBreakAfter = level == lateRegUntilLevel;
      
      blindLevels.add({
        'level': level,
        'smallBlind': smallBlind,
        'bigBlind': bigBlind,
        'ante': ante,
        'duration': duration,
        'isLateReg': level <= lateRegUntilLevel,
        'isBreak': false, // デフォルトではブレイクなし
        'hasBreakAfter': hasBreakAfter, // レイトレジ終了レベルには必ずブレイク
        'breakDuration': hasBreakAfter ? breakTime : 0,
        'endTime': 0, // 終了時間（後で計算）
        'timeFromLastBreak': 0, // 前回ブレイクからの時間（後で計算）
      });
    }

    _blindLevels = blindLevels;

    // 時間計算を行う
    _calculateTimes();

    setState(() {
      _isLoading = false;
    });
  }

  /// ブラインドレベルを再生成する（手動呼び出し用）
  void _regenerateBlindLevels() {
    _generateBlindLevels();
  }

  /// 各レベルの終了時間とブレイクからの時間を計算する
  void _calculateTimes() {
    int currentTime = 0; // トーナメント開始からの時間（分）
    int timeFromLastBreak = 0; // 前回ブレイクからの時間（分）
    final breakTime = widget.basicData['breakTime'] as int;

    for (int i = 0; i < _blindLevels.length; i++) {
      final level = _blindLevels[i];
      
      // このレベルの持続時間を加算
      currentTime += level['duration'] as int;
      timeFromLastBreak += level['duration'] as int;
      
      // 終了時間を設定（ブレイク時間は含まない）
      level['endTime'] = currentTime;
      
      // 前回ブレイクからの時間を設定（当該ブラインド終了時点）
      level['timeFromLastBreak'] = timeFromLastBreak;
      
      // ブレイクがある場合は時間を追加（次のレベルの計算用）
      if (level['hasBreakAfter'] == true) {
        currentTime += breakTime;
        timeFromLastBreak = 0; // ブレイク後はリセット
      }
    }
  }



  /// ブラインドレベルを更新する
  void _updateBlindLevel(int index, String field, dynamic value) {
    setState(() {
      _blindLevels[index][field] = value;
    });
  }

  /// 時間をフォーマットする（分を時間:分の形式に変換）
  String _formatTime(dynamic minutes) {
    final mins = minutes ?? 0;
    final hours = mins ~/ 60;
    final remainingMins = mins % 60;
    if (hours > 0) {
      return '${hours}時間${remainingMins}分';
    } else {
      return '${remainingMins}分';
    }
  }

  /// ブラインドテンプレートを保存する
  Future<void> _saveBlindTemplate() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final functions = FirebaseFunctions.instance;
      
      // 編集モードかどうかで呼び出す関数を分ける
      final isEditMode = widget.existingBlindTemplate != null;
      final functionName = isEditMode ? 'updateBlindTemplate' : 'createBlindTemplate';
      final callable = functions.httpsCallable(functionName);

      // Cloud Functionsに送信するデータを構築
      final blindTemplateData = {
        if (isEditMode) 'blindTemplateId': widget.existingBlindTemplate!['id'],
        'blindName': widget.basicData['blindName'],
        'numberOfBlindLevels': widget.basicData['numberOfBlindLevels'],
        'defaultStartingChips': widget.basicData['defaultStartingChips'],
        'blindIntervalBeforeReg': widget.basicData['blindIntervalBeforeReg'],
        'blindIntervalAfterReg': widget.basicData['blindIntervalAfterReg'],
        'anteType': widget.basicData['anteType'],
        'lateRegUntilLevel': widget.basicData['lateRegUntilLevel'],
        'breakTime': widget.basicData['breakTime'],
        'levels': _blindLevels.map((level) => ({
          'ante': level['ante'],
          'bigBlind': level['bigBlind'],
          'duration': level['duration'],
          'level': level['level'],
          'smallBlind': level['smallBlind'],
          'hasBreakAfter': level['hasBreakAfter'],
          'endTime': level['endTime'],
          'timeFromLastBreak': level['timeFromLastBreak'],
        })).toList(),
        'isArchive': false,
      };

      final result = await callable.call(blindTemplateData);
      final response = result.data;

      if (response['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(response['message'] ?? 
            (isEditMode ? 'ブラインドテンプレートが正常に更新されました' : 'ブラインドテンプレートが正常に作成されました'))),
        );
        Navigator.pop(context, true); // 成功フラグを返す
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
        title: Text(widget.existingBlindTemplate != null 
          ? 'ブラインドテンプレート編集 - 詳細設定' 
          : 'ブラインドテンプレート作成 - 詳細設定'),
        backgroundColor: Colors.purple,
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
              child: Column(
                children: [
                  // 基本情報表示
                  Container(
                    padding: const EdgeInsets.all(16),
                    color: Colors.grey[100],
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${widget.basicData['blindName']}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.purple,
                          ),
                        ),
                        const SizedBox(height: 4),
                                                                         Text(
                          'レベル数: ${widget.basicData['numberOfBlindLevels']} | '
                          '開始ブラインド: ${widget.basicData['startingBlindType']} | '
                          'レジスト前間隔: ${widget.basicData['blindIntervalBeforeReg']}分 | '
                          'レジスト後間隔: ${widget.basicData['blindIntervalAfterReg']}分',
                          style: const TextStyle(color: Colors.grey),
                        ),
                        const SizedBox(height: 8),
                        ElevatedButton.icon(
                          onPressed: _regenerateBlindLevels,
                          icon: const Icon(Icons.refresh),
                          label: const Text('ブラインドレベルを再計算'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blue,
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),

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

                  // ブラインドレベル一覧
                  Expanded(
                    child: ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _blindLevels.length,
                      itemBuilder: (context, index) {
                        final level = _blindLevels[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ExpansionTile(
                            title: Row(
                              children: [
                                Text(
                                  'レベル ${level['level']}',
                                  style: const TextStyle(fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(width: 8),
                                                                 if (level['isLateReg'] ?? false)
                                   Container(
                                     padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                     decoration: BoxDecoration(
                                       color: Colors.blue,
                                       borderRadius: BorderRadius.circular(12),
                                     ),
                                     child: const Text(
                                       'レイトレジスト',
                                       style: TextStyle(color: Colors.white, fontSize: 12),
                                     ),
                                   ),
                                 if (level['hasBreakAfter'] ?? false)
                                   Container(
                                     margin: const EdgeInsets.only(left: 8),
                                     padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                     decoration: BoxDecoration(
                                       color: Colors.orange,
                                       borderRadius: BorderRadius.circular(12),
                                     ),
                                     child: const Text(
                                       'ブレイク',
                                       style: TextStyle(color: Colors.white, fontSize: 12),
                                     ),
                                   ),
                              ],
                            ),
                                                         subtitle: Column(
                               crossAxisAlignment: CrossAxisAlignment.start,
                               children: [
                                 Text(
                                   'SB: ${level['smallBlind']} / BB: ${level['bigBlind']}${(level['ante'] ?? 0) > 0 ? ' / Ante: ${level['ante']}' : ''}',
                                   style: const TextStyle(color: Colors.grey),
                                 ),
                                 Text(
                                   '開始後${_formatTime(level['endTime'])}まで | 前回ブレイクから${_formatTime(level['timeFromLastBreak'])}経過（当該ブラインド終了時点）',
                                   style: const TextStyle(color: Colors.blue, fontSize: 12),
                                 ),
                               ],
                             ),
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  children: [
                                    // スモールブラインド
                                    TextFormField(
                                      initialValue: level['smallBlind'].toString(),
                                      decoration: const InputDecoration(
                                        labelText: 'スモールブラインド',
                                        border: OutlineInputBorder(),
                                      ),
                                      keyboardType: TextInputType.number,
                                      validator: (value) {
                                        if (value == null || value.isEmpty) {
                                          return 'スモールブラインドを入力してください';
                                        }
                                        final number = int.tryParse(value);
                                        if (number == null || number <= 0) {
                                          return '有効な数値を入力してください';
                                        }
                                        return null;
                                      },
                                      onChanged: (value) {
                                        final smallBlind = int.tryParse(value) ?? 0;
                                        _updateBlindLevel(index, 'smallBlind', smallBlind);
                                        _updateBlindLevel(index, 'bigBlind', smallBlind * 2);
                                        if (widget.basicData['anteType'] == 'BBA') {
                                          _updateBlindLevel(index, 'ante', smallBlind * 2);
                                        }
                                      },
                                    ),
                                    const SizedBox(height: 16),

                                    // ビッグブラインド
                                    TextFormField(
                                      initialValue: level['bigBlind'].toString(),
                                      decoration: const InputDecoration(
                                        labelText: 'ビッグブラインド',
                                        border: OutlineInputBorder(),
                                      ),
                                      keyboardType: TextInputType.number,
                                      validator: (value) {
                                        if (value == null || value.isEmpty) {
                                          return 'ビッグブラインドを入力してください';
                                        }
                                        final number = int.tryParse(value);
                                        if (number == null || number <= 0) {
                                          return '有効な数値を入力してください';
                                        }
                                        return null;
                                      },
                                      onChanged: (value) {
                                        final bigBlind = int.tryParse(value) ?? 0;
                                        _updateBlindLevel(index, 'bigBlind', bigBlind);
                                        if (widget.basicData['anteType'] == 'BBA') {
                                          _updateBlindLevel(index, 'ante', bigBlind);
                                        }
                                      },
                                    ),
                                    const SizedBox(height: 16),

                                    // アンティ
                                    if (widget.basicData['anteType'] == 'BBA')
                                      TextFormField(
                                        initialValue: level['ante'].toString(),
                                        decoration: const InputDecoration(
                                          labelText: 'アンティ',
                                          border: OutlineInputBorder(),
                                        ),
                                        keyboardType: TextInputType.number,
                                        validator: (value) {
                                          if (value == null || value.isEmpty) {
                                            return 'アンティを入力してください';
                                          }
                                          final number = int.tryParse(value);
                                          if (number == null || number < 0) {
                                            return '有効な数値を入力してください';
                                          }
                                          return null;
                                        },
                                        onChanged: (value) {
                                          final ante = int.tryParse(value) ?? 0;
                                          _updateBlindLevel(index, 'ante', ante);
                                        },
                                      ),

                                    const SizedBox(height: 16),

                                                                         // 持続時間
                                     TextFormField(
                                       initialValue: level['duration'].toString(),
                                       decoration: const InputDecoration(
                                         labelText: '持続時間（分）',
                                         border: OutlineInputBorder(),
                                       ),
                                       keyboardType: TextInputType.number,
                                       validator: (value) {
                                         if (value == null || value.isEmpty) {
                                           return '持続時間を入力してください';
                                         }
                                         final number = int.tryParse(value);
                                         if (number == null || number <= 0) {
                                           return '有効な数値を入力してください';
                                         }
                                         return null;
                                       },
                                       onChanged: (value) {
                                         final duration = int.tryParse(value) ?? 0;
                                         _updateBlindLevel(index, 'duration', duration);
                                         // 時間を再計算
                                         _calculateTimes();
                                       },
                                     ),

                                    const SizedBox(height: 16),

                                    // ブレイク設定
                                                                     if (level['hasBreakAfter'] ?? false)
                                   TextFormField(
                                     initialValue: widget.basicData['breakTime'].toString(),
                                     decoration: const InputDecoration(
                                       labelText: 'ブレイク時間（分）',
                                       border: OutlineInputBorder(),
                                     ),
                                     keyboardType: TextInputType.number,
                                     validator: (value) {
                                       if (value == null || value.isEmpty) {
                                         return 'ブレイク時間を入力してください';
                                       }
                                       final number = int.tryParse(value);
                                       if (number == null || number < 0) {
                                         return '有効な数値を入力してください';
                                       }
                                       return null;
                                     },
                                                                            onChanged: (value) {
                                         final breakDuration = int.tryParse(value) ?? 0;
                                         _updateBlindLevel(index, 'breakDuration', breakDuration);
                                         // 時間を再計算
                                         _calculateTimes();
                                       },
                                     ),

                                                                         const SizedBox(height: 16),

                                     // ブレイク挿入設定
                                     SwitchListTile(
                                       title: const Text('ブレイクの挿入'),
                                       subtitle: const Text('このレベル終了後にブレイクを挿入'),
                                       value: level['hasBreakAfter'] ?? false,
                                       onChanged: (value) {
                                         _updateBlindLevel(index, 'hasBreakAfter', value);
                                         // ブレイク時間を設定
                                         if (value) {
                                           _updateBlindLevel(index, 'breakDuration', widget.basicData['breakTime']);
                                         } else {
                                           _updateBlindLevel(index, 'breakDuration', 0);
                                         }
                                         // 時間を再計算
                                         _calculateTimes();
                                       },
                                     ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),

                  // 保存ボタン
                  Container(
                    padding: const EdgeInsets.all(16),
                    child: SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isSaving ? null : _saveBlindTemplate,
                        icon: const Icon(Icons.save),
                        label: const Text('ブラインドテンプレートを保存'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.purple,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
