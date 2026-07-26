import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_prize_participant_count.dart';
import 'package:amuse_app_template/tournament/prize_conversion_preview.dart';
import 'package:amuse_app_template/tournament/ranking_reward_point_candidates.dart';
import 'package:amuse_app_template/user/point_conversion.dart';

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
  final _functions = FunctionsClient.instance;
  
  // データ
  Map<String, dynamic>? _tournamentData;
  Map<String, dynamic>? _mainViewData;
  bool _isLoading = true;
  String? _errorMessage;
  
  // 入力値
  double _prizeRatio = 0.0; // プライズに回す比率
  int _prizeReceiverCount = 0; // プライズ受け取り人数
  List<double> _prizePercentages = []; // 各順位の配分比率
  List<int> _prizeAmounts = []; // 各順位の基準値量（¥表示）
  String _selectedPointType = 'pointA'; // 選択されたポイントタイプ

  BalanceConversion? get _selectedConversion =>
      prizeConversionForPointType(_selectedPointType);

  String get _selectedDisplayName =>
      rewardPointDisplayName(_selectedPointType);

  bool get _allPrizesConvertible {
    final conversion = _selectedConversion;
    if (conversion == null) return false;
    if (previewAwardedBalanceAmount(_totalPrizePool, conversion) == null) {
      return false;
    }
    for (final amount in _prizeAmounts) {
      if (previewAwardedBalanceAmount(amount, conversion) == null) {
        return false;
      }
    }
    return true;
  }
  
  // 計算結果
  int _totalRevenue = 0; // 売上合計
  int _totalPrizePool = 0; // プライズプール合計
  
  // 既存プライズ情報
  Map<String, int>? _existingPrizes; // 既存のXstPrize情報

  /// プライズ確定（setPrizeData）送信中は戻る操作を禁止する
  bool _isSavingPrize = false;

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
          _checkExistingPrizes();
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
    
    // デフォルトのプライズ受け取り人数を計算（entries + reentries。置きバケ含む）
    final totalParticipants = resolveTournamentPrizeParticipantCount(_mainViewData);
    _prizeReceiverCount = ((totalParticipants * (StoreConfigService.instance.latestData?.tournamentPrizeReceiverPercentage ?? kDefaultTournamentPrizeReceiverPercentage)) / 100).round();
    if (_prizeReceiverCount < 1) _prizeReceiverCount = 1;
    if (_prizeReceiverCount > 100) _prizeReceiverCount = 100;
    
    _updatePrizeDistribution();
  }
  
  void _checkExistingPrizes() {
    // XstPrizeフィールドの存在確認
    _existingPrizes = {};
    
    if (_mainViewData != null) {
      for (int i = 1; i <= 100; i++) {
        final prizeKey = '${i}stPrize';
        final prizeValue = _mainViewData![prizeKey];
        if (prizeValue != null && prizeValue is num) {
          _existingPrizes![prizeKey] = prizeValue.toInt();
        }
      }
    }
  }
  
  void _updatePrizeDistribution() {
    print('=== _updatePrizeDistribution デバッグ ===');
    print('_totalRevenue: $_totalRevenue');
    print('_prizeRatio: $_prizeRatio');
    
    _totalPrizePool = (_totalRevenue * _prizeRatio).round();
    print('_totalPrizePool 計算結果: $_totalPrizePool');
    
    // 配分比率を取得
    final dist = StoreConfigService.instance.latestData?.tournamentPrizeDistribution ?? kDefaultTournamentPrizeDistribution;
    _prizePercentages = List.from(dist[_prizeReceiverCount] ?? getDefaultPrizeDistributionForCount(_prizeReceiverCount));
    
    // 各順位の金額を計算
    _prizeAmounts.clear();
    for (int i = 0; i < _prizeReceiverCount; i++) {
      double percentage = _prizePercentages[i];
      double amount = (_totalPrizePool * percentage / 100);
      
      int finalAmount;
      final roundMethod = StoreConfigService.instance.latestData?.tournamentPrizeRoundingMethod ?? kDefaultTournamentPrizeRoundingMethod;
      switch (roundMethod) {
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

      final unit = StoreConfigService.instance.latestData?.tournamentPrizeRoundingUnit ?? kDefaultTournamentPrizeRoundingUnit;
      final safeUnit = [1, 10, 100, 1000].contains(unit) ? unit : kDefaultTournamentPrizeRoundingUnit;
      finalAmount = (finalAmount ~/ safeUnit) * safeUnit;
      _prizeAmounts.add(finalAmount);
    }
  }
  
  Future<void> _savePrizeData() async {
    try {
      setState(() {
        _isSavingPrize = true;
        _isLoading = true;
        _errorMessage = null;
      });
      
      // プライズ受け取り人数と参加人数（entries + reentries。置きバケ含む）をチェック
      final mainViewDoc = await FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(widget.tournamentId)
          .collection('views')
          .doc('main')
          .get();

      final mainViewData = mainViewDoc.exists
          ? Map<String, dynamic>.from(mainViewDoc.data() as Map)
          : null;
      final participantCount = resolveTournamentPrizeParticipantCount(mainViewData);

      if (_prizeReceiverCount > participantCount) {
        if (mounted) {
          await showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('エラー'),
              content: Text(
                'プライズ受け取り人数（$_prizeReceiverCount人）が'
                '参加者数（$participantCount人）を上回っています。\n'
                'プライズ受け取り人数を参加者数以下に設定してください。',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
        }
        return;
      }

      if (!_allPrizesConvertible) {
        if (mounted) {
          final conversion = _selectedConversion;
          String detail = '選択ポイントの換算設定を確認してください。';
          if (conversion != null) {
            for (var i = 0; i < _prizeAmounts.length; i++) {
              final err = conversionErrorMessage(_prizeAmounts[i], conversion);
              if (err != null) {
                detail = '${i + 1}位（¥${_prizeAmounts[i]}）: $err';
                break;
              }
            }
          }
          showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('換算できないプライズ額があります'),
              content: Text(
                'プライズ額は基準値量として、選択ポイントの換算で整数の残高になる必要があります。\n\n$detail',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
        }
        return;
      }
      
      // プライズデータを準備（金額は基準値量。conversion snapshot は Functions が保存）
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
      if (mounted) {
        setState(() {
          _isSavingPrize = false;
          _isLoading = false;
        });
      }
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
    
    return PopScope(
      canPop: !_isSavingPrize,
      child: Scaffold(
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
                      // 既存プライズ警告
                      if (_existingPrizes != null && _existingPrizes!.isNotEmpty)
                        _buildExistingPrizeWarning(),
                      if (_existingPrizes != null && _existingPrizes!.isNotEmpty)
                        const SizedBox(height: 16),
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
                          onPressed: _allPrizesConvertible ? _savePrizeData : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: Colors.grey.shade400,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                          child: const Text(
                            'プライズ確定',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ),
                      if (!_allPrizesConvertible) ...[
                        const SizedBox(height: 8),
                        Text(
                          '換算できない順位額があるため確定できません（基準値量が選択ポイントの換算で整数残高になる必要があります）',
                          style: TextStyle(color: Colors.red.shade700, fontSize: 12),
                        ),
                      ],
                    ],
                  ),
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
            Text('プライズプール（基準値）: ¥${_totalPrizePool.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}'),
            const SizedBox(height: 4),
            Text(
              '付与ポイント: $_selectedDisplayName',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
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
                    max: 100.0,
                    divisions: 99,
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
              'プライズ配分（基準値）',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              '¥表示は基準値量です。付与は $_selectedDisplayName の換算後残高になります。',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 12),
            ...List.generate(_prizeReceiverCount, (index) {
              final referenceAmount = _prizeAmounts[index];
              final awarded = previewAwardedBalanceAmount(
                referenceAmount,
                _selectedConversion,
              );
              final err = awarded == null
                  ? conversionErrorMessage(referenceAmount, _selectedConversion)
                  : null;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
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
                            '¥${referenceAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                            style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green),
                            textAlign: TextAlign.right,
                          ),
                        ),
                      ],
                    ),
                    Padding(
                      padding: const EdgeInsets.only(left: 60, top: 2),
                      child: Text(
                        awarded != null
                            ? '付与予定: $_selectedDisplayName $awardedポイント'
                            : '付与予定: 換算不可${err != null ? '（$err）' : ''}',
                        style: TextStyle(
                          fontSize: 12,
                          color: awarded != null
                              ? Colors.blueGrey.shade700
                              : Colors.red.shade700,
                        ),
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
  
  Widget _buildExistingPrizeWarning() {
    // 既存のプライズ情報を順番に表示
    final sortedPrizes = _existingPrizes!.entries.toList()
      ..sort((a, b) {
        // "1stPrize", "2stPrize" などの順位を抽出してソート
        final aRank = int.tryParse(a.key.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
        final bRank = int.tryParse(b.key.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
        return aRank.compareTo(bRank);
      });
    
    String prizeText = 'すでにプライズが確定しています。\n'
        '※修正する場合にのみ、パラメータ等を修正し確定ボタンを押下してください。\n\n';
    
    for (final entry in sortedPrizes) {
      final rank = entry.key.replaceAll(RegExp(r'[^0-9]'), '');
      prizeText += '${rank}st: ${entry.value}\n';
    }
    
    return Card(
      color: Colors.orange.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning, color: Colors.orange.shade700),
                const SizedBox(width: 8),
                Text(
                  '既存プライズ情報',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.orange.shade700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              prizeText,
              style: TextStyle(color: Colors.orange.shade900),
            ),
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
            Builder(
              builder: (context) {
                final candidates = rankingRewardPointCandidates();
                final items = candidates.isEmpty
                    ? <DropdownMenuItem<String>>[
                        DropdownMenuItem(
                          value: _selectedPointType,
                          child: Text('$_selectedPointType（候補なし）'),
                        ),
                      ]
                    : candidates
                        .map(
                          (c) => DropdownMenuItem<String>(
                            value: c.id,
                            child: Text('${c.displayName} (${c.id})'),
                          ),
                        )
                        .toList();
                final value = candidates.any((c) => c.id == _selectedPointType)
                    ? _selectedPointType
                    : (candidates.isNotEmpty
                        ? candidates.first.id
                        : _selectedPointType);
                if (value != _selectedPointType) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted) {
                      setState(() => _selectedPointType = value);
                    }
                  });
                }
                return DropdownButtonFormField<String>(
                  value: value,
                  decoration: const InputDecoration(
                    labelText: 'ポイントタイプを選択',
                    border: OutlineInputBorder(),
                  ),
                  items: items,
                  onChanged: candidates.isEmpty
                      ? null
                      : (String? newValue) {
                          if (newValue == null) return;
                          setState(() => _selectedPointType = newValue);
                        },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
