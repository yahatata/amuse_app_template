import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../globalConstant.dart';

class PrizeSetupPage extends StatefulWidget {
  final String tournamentId;
  
  const PrizeSetupPage({
    super.key,
    required this.tournamentId,
  });

  @override
  State<PrizeSetupPage> createState() => _PrizeSetupPageState();
}

class _PrizeSetupPageState extends State<PrizeSetupPage> {
  final _functions = FirebaseFunctions.instance;
  
  // データ
  Map<String, dynamic>? _tournamentData;
  Map<String, dynamic>? _mainViewData;
  bool _isLoading = true;
  String? _errorMessage;
  
  // 入力値
  double _prizeRatio = 0.0; // プライズに回す比率
  int _prizeReceiverCount = 0; // プライズ受け取り人数
  List<double> _prizePercentages = []; // 各順位の配分比率
  List<int> _prizeAmounts = []; // 各順位の金額
  String _selectedPointType = 'pointA'; // 選択されたポイントタイプ
  
  // 計算結果
  int _totalRevenue = 0; // 売上合計
  int _totalPrizePool = 0; // プライズプール合計
  
  @override
  void initState() {
    super.initState();
    _loadTournamentData();
  }
  
  Future<void> _loadTournamentData() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
      
      final callable = _functions.httpsCallable('getPrizeData');
      final result = await callable.call({
        'tournamentId': widget.tournamentId,
      });
      
      if (result.data['success'] == true) {
        // デバッグログ: 取得されたデータの型を確認
        print('=== PrizeSetup データ型デバッグ ===');
        print('result.data type: ${result.data.runtimeType}');
        print('result.data keys: ${result.data.keys.toList()}');
        
        // tournamentData の型確認
        final tournamentDataRaw = result.data['tournamentData'];
        print('tournamentDataRaw type: ${tournamentDataRaw.runtimeType}');
        print('tournamentDataRaw: $tournamentDataRaw');
        
        // mainViewData の型確認
        final mainViewDataRaw = result.data['mainViewData'];
        print('mainViewDataRaw type: ${mainViewDataRaw.runtimeType}');
        print('mainViewDataRaw: $mainViewDataRaw');
        
        setState(() {
          try {
            _tournamentData = tournamentDataRaw != null 
                ? Map<String, dynamic>.from(tournamentDataRaw as Map)
                : <String, dynamic>{};
            print('tournamentData 変換成功: ${_tournamentData.runtimeType}');
          } catch (e) {
            print('tournamentData 変換エラー: $e');
            _tournamentData = <String, dynamic>{};
          }
          
          try {
            _mainViewData = mainViewDataRaw != null 
                ? Map<String, dynamic>.from(mainViewDataRaw as Map)
                : <String, dynamic>{};
            print('mainViewData 変換成功: ${_mainViewData.runtimeType}');
          } catch (e) {
            print('mainViewData 変換エラー: $e');
            _mainViewData = <String, dynamic>{};
          }
          
          _calculateInitialValues();
        });
        print('=== End PrizeSetup データ型デバッグ ===');
      } else {
        setState(() {
          _errorMessage = result.data['error'] ?? 'データの取得に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'エラーが発生しました: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  // 安全な型変換ヘルパーメソッド
  int _getIntValue(Map<String, dynamic>? data, String key, {int defaultValue = 0}) {
    if (data == null) {
      print('_getIntValue: data is null for key: $key');
      return defaultValue;
    }
    final value = data[key];
    print('_getIntValue: key=$key, value=$value, type=${value.runtimeType}');
    if (value is int) return value;
    if (value is double) return value.toInt();
    if (value is String) return int.tryParse(value) ?? defaultValue;
    print('_getIntValue: 未対応の型 ${value.runtimeType} for key: $key');
    return defaultValue;
  }
  
  void _calculateInitialValues() {
    if (_tournamentData == null || _mainViewData == null) {
      print('=== PrizeSetup データ不足エラー ===');
      print('tournamentData: $_tournamentData');
      print('mainViewData: $_mainViewData');
      print('=== End データ不足エラー ===');
      return;
    }
    
    // デバッグログ: 取得されたデータを確認
    print('=== PrizeSetup Debug ===');
    print('tournamentData: $_tournamentData');
    print('mainViewData: $_mainViewData');
    
    // 売上合計を計算
    final entryFee = _getIntValue(_mainViewData, 'entryFee');
    final reentryFee = _getIntValue(_mainViewData, 'reentryFee');
    final addonFee = _getIntValue(_mainViewData, 'addonFee');
    final entries = _getIntValue(_mainViewData, 'entries');
    final reentries = _getIntValue(_mainViewData, 'reentries');
    final addons = _getIntValue(_mainViewData, 'addons');
    
    // デバッグログ: 計算に使用する値を確認
    print('entryFee: $entryFee, reentryFee: $reentryFee, addonFee: $addonFee');
    print('entries: $entries, reentries: $reentries, addons: $addons');
    
    _totalRevenue = (entryFee * entries) + (reentryFee * reentries) + (addonFee * addons);
    
    // デバッグログ: 計算結果を確認
    print('totalRevenue: $_totalRevenue');
    print('=== End Debug ===');
    
    // デバッグログ: snapshot取得の詳細確認
    print('=== Snapshot デバッグ ===');
    final snapshotRaw = _tournamentData?['snapshot'];
    print('snapshotRaw type: ${snapshotRaw.runtimeType}');
    print('snapshotRaw: $snapshotRaw');
    
    Map<String, dynamic>? snapshot;
    try {
      if (snapshotRaw is Map) {
        snapshot = Map<String, dynamic>.from(snapshotRaw);
        print('snapshot 変換成功: ${snapshot.runtimeType}');
      } else {
        print('snapshotRaw がMapではありません: ${snapshotRaw.runtimeType}');
        snapshot = null;
      }
    } catch (e) {
      print('snapshot 変換エラー: $e');
      snapshot = null;
    }
    
    // デフォルトのプライズ比率を設定（snapshotから取得）
    try {
      final prizeRateBps = _getIntValue(snapshot, 'prizeRateBps', defaultValue: 7000);
      print('prizeRateBps 取得成功: $prizeRateBps');
      _prizeRatio = prizeRateBps / 10000.0;
      print('_prizeRatio 設定成功: $_prizeRatio');
    } catch (e) {
      print('prizeRateBps 取得エラー: $e');
      _prizeRatio = 0.7; // デフォルト値
    }
    
    // デフォルトのポイントタイプを設定（snapshotから取得）
    try {
      _selectedPointType = snapshot?['pointType'] as String? ?? 'pointA';
      print('_selectedPointType 設定成功: $_selectedPointType');
    } catch (e) {
      print('_selectedPointType 設定エラー: $e');
      _selectedPointType = 'pointA';
    }
    
    print('=== End Snapshot デバッグ ===');
    
    // デフォルトのプライズ受け取り人数を計算
    final totalParticipants = entries + reentries;
    _prizeReceiverCount = ((totalParticipants * GlobalConstants.prizeReceiverPercentage) / 100).round();
    if (_prizeReceiverCount < 1) _prizeReceiverCount = 1;
    if (_prizeReceiverCount > 10) _prizeReceiverCount = 10;
    
    _updatePrizeDistribution();
  }
  
  void _updatePrizeDistribution() {
    print('=== _updatePrizeDistribution デバッグ ===');
    print('_totalRevenue: $_totalRevenue');
    print('_prizeRatio: $_prizeRatio');
    
    _totalPrizePool = (_totalRevenue * _prizeRatio).round();
    print('_totalPrizePool 計算結果: $_totalPrizePool');
    
    // 配分比率を取得
    _prizePercentages = List.from(GlobalConstants.prizeDistribution[_prizeReceiverCount] ?? [100.0]);
    
    // 各順位の金額を計算
    _prizeAmounts.clear();
    for (int i = 0; i < _prizeReceiverCount; i++) {
      double percentage = _prizePercentages[i];
      double amount = (_totalPrizePool * percentage / 100);
      
      int finalAmount;
      switch (GlobalConstants.prizeRoundingMethod) {
        case 'ceil':
          finalAmount = amount.ceil();
          break;
        case 'round':
          finalAmount = amount.round();
          break;
        case 'floor':
        default:
          finalAmount = amount.floor();
          break;
      }
      
      // 100の位で丸める
      finalAmount = (finalAmount ~/ 100) * 100;
      _prizeAmounts.add(finalAmount);
    }
  }
  
  Future<void> _savePrizeData() async {
    try {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
      
      // プライズデータを準備
      Map<String, dynamic> prizeData = {
        'prizePool': _totalPrizePool,
        'prizeReceiverCount': _prizeReceiverCount,
        'pointType': _selectedPointType,
      };
      
      // 各順位のプライズを追加
      for (int i = 0; i < _prizeReceiverCount; i++) {
        prizeData['${i + 1}stPrize'] = _prizeAmounts[i];
        // プレイヤー名とUIDをnullで初期化
        prizeData['${i + 1}stPlayerName'] = null;
        prizeData['${i + 1}stPlayerUid'] = null;
      }
      
      final callable = _functions.httpsCallable('setPrizeData');
      final result = await callable.call({
        'tournamentId': widget.tournamentId,
        'prizeData': prizeData,
      });
      
      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('プライズデータを保存しました')),
          );
          Navigator.of(context).pop();
        }
      } else {
        setState(() {
          _errorMessage = result.data['error'] ?? 'データの保存に失敗しました';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'エラーが発生しました: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  @override
  Widget build(BuildContext context) {
    print('=== build メソッド開始 ===');
    print('_isLoading: $_isLoading');
    print('_errorMessage: $_errorMessage');
    print('_tournamentData: $_tournamentData');
    print('_mainViewData: $_mainViewData');
    print('=== build メソッド開始 ===');
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('プライズ確定'),
        backgroundColor: Colors.blue.shade700,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error, color: Colors.red, size: 48),
                      const SizedBox(height: 16),
                      Text(_errorMessage!, style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadTournamentData,
                        child: const Text('再試行'),
                      ),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 売上情報
                      _buildRevenueSection(),
                      const SizedBox(height: 24),
                      
                      // プライズ比率設定
                      _buildPrizeRatioSection(),
                      const SizedBox(height: 24),
                      
                      // プライズ受け取り人数設定
                      _buildPrizeReceiverCountSection(),
                      const SizedBox(height: 24),
                      
                      // ポイントタイプ選択
                      _buildPointTypeSection(),
                      const SizedBox(height: 24),
                      
                      // プライズ配分表示
                      _buildPrizeDistributionSection(),
                      const SizedBox(height: 32),
                      
                      // 確定ボタン
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _savePrizeData,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                          child: const Text(
                            'プライズ確定',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }
  
  Widget _buildRevenueSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '売上情報',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Text('売上合計: ¥${_totalRevenue.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}'),
            const SizedBox(height: 8),
            Text('プライズプール: ¥${_totalPrizePool.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}'),
          ],
        ),
      ),
    );
  }
  
  Widget _buildPrizeRatioSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'プライズ比率設定',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Slider(
                    value: _prizeRatio,
                    min: 0.0,
                    max: 1.0,
                    divisions: 100,
                    label: '${(_prizeRatio * 100).toStringAsFixed(1)}%',
                    onChanged: (value) {
                      setState(() {
                        _prizeRatio = value;
                        _updatePrizeDistribution();
                      });
                    },
                  ),
                ),
                SizedBox(
                  width: 80,
                  child: Text(
                    '${(_prizeRatio * 100).toStringAsFixed(1)}%',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildPrizeReceiverCountSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'プライズ受け取り人数',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Slider(
                    value: _prizeReceiverCount.toDouble(),
                    min: 1.0,
                    max: 10.0,
                    divisions: 9,
                    label: '$_prizeReceiverCount人',
                    onChanged: (value) {
                      setState(() {
                        _prizeReceiverCount = value.round();
                        _updatePrizeDistribution();
                      });
                    },
                  ),
                ),
                SizedBox(
                  width: 80,
                  child: Text(
                    '$_prizeReceiverCount人',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildPrizeDistributionSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'プライズ配分',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            ...List.generate(_prizeReceiverCount, (index) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    SizedBox(
                      width: 60,
                      child: Text(
                        '${index + 1}位:',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                    Expanded(
                      child: Slider(
                        value: _prizePercentages[index],
                        min: 0.0,
                        max: 100.0,
                        divisions: 1000,
                        label: '${_prizePercentages[index].toStringAsFixed(1)}%',
                        onChanged: (value) {
                          setState(() {
                            _prizePercentages[index] = value;
                            _updatePrizeDistribution();
                          });
                        },
                      ),
                    ),
                    SizedBox(
                      width: 80,
                      child: Text(
                        '${_prizePercentages[index].toStringAsFixed(1)}%',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                    ),
                    SizedBox(
                      width: 100,
                      child: Text(
                        '¥${_prizeAmounts[index].toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green),
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
  
  Widget _buildPointTypeSection() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'ポイントタイプ',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _selectedPointType,
              decoration: const InputDecoration(
                labelText: 'ポイントタイプを選択',
                border: OutlineInputBorder(),
              ),
              items: GlobalConstants.pointTypes.map((String pointType) {
                return DropdownMenuItem<String>(
                  value: pointType,
                  child: Text(pointType),
                );
              }).toList(),
              onChanged: (String? newValue) {
                if (newValue != null) {
                  setState(() {
                    _selectedPointType = newValue;
                  });
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}
