import 'package:flutter/material.dart';
import 'dart:ui' as ui;
import 'package:intl/intl.dart';
import 'shiftHomePage.dart';
import 'shift_repository.dart';
import '../Utils/time_converter.dart';

/// ドラフト画面（中間確定用）
class ShiftDraftPage extends StatefulWidget {
  const ShiftDraftPage({super.key});

  @override
  State<ShiftDraftPage> createState() => _ShiftDraftPageState();
}

class _ShiftDraftPageState extends State<ShiftDraftPage> {
  late DateTime _currentMonth;
  DateTime? _selectedDate;
  final ScrollController _dateScrollController = ScrollController();
  final ScrollController _requestListScrollController = ScrollController();
  final Map<String, GlobalKey> _sliderKeys = {}; // スライダーのキーを保存
  final Map<String, double?> _sliderTrackWidths = {}; // スライダーのトラック幅を保存
  final Map<String, double?> _sliderLeftPaddings = {}; // スライダーの左パディングを保存
  
  // Repository
  final ShiftRepository _repository = ShiftRepository();
  
  // データ（Firestoreから取得）
  Map<String, List<ShiftRequest>> _requests = {};
  Map<String, BusinessHours> _businessHours = {};
  bool _isLoading = false;
  
  final Set<String> _selectedRequestIds = {};
  final Map<String, bool> _isSufficientManual = {}; // 手動必要十分フラグ

  @override
  void initState() {
    super.initState();
    _currentMonth = DateTime(DateTime.now().year, DateTime.now().month + 1, 1);
    _loadData();
  }

  @override
  void dispose() {
    _dateScrollController.dispose();
    _requestListScrollController.dispose();
    super.dispose();
  }

  /// データを読み込み（Firestoreから）
  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final yearMonth = DateFormat('yyyy-MM').format(_currentMonth);
      
      // 並列で取得
      final futures = [
        _repository.getPendingRequestsForMonth(yearMonth),
        _repository.getBusinessHoursForMonth(yearMonth),
      ];
      
      final results = await Future.wait(futures);
      final requests = results[0] as Map<String, List<ShiftRequest>>;
      final businessHours = results[1] as Map<String, BusinessHours>;
      
      setState(() {
        _requests = requests;
        _businessHours = businessHours;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('データの読み込みに失敗しました: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  String _getDateKey(DateTime date) {
    return DateFormat('yyyy-MM-dd').format(date);
  }

  int _getDaysInMonth(DateTime date) {
    return DateTime(date.year, date.month + 1, 0).day;
  }

  void _selectDate(DateTime date) {
    setState(() {
      _selectedDate = date;
    });
  }

  void _toggleRequestSelection(String requestId) {
    setState(() {
      if (_selectedRequestIds.contains(requestId)) {
        _selectedRequestIds.remove(requestId);
      } else {
        _selectedRequestIds.add(requestId);
      }
    });
  }

  void _updateRequestTime(String requestId, String dateKey, int startMinute, int endMinute) {
    setState(() {
      final requests = _requests[dateKey];
      if (requests != null) {
        final index = requests.indexWhere((r) => r.requestId == requestId);
        if (index != -1) {
          requests[index] = requests[index].copyWith(
            startMinute: startMinute,
            endMinute: endMinute,
          );
        }
      }
    });
  }

  void _confirmInterim() {
    if (_selectedDate == null || _selectedRequestIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('日付と申請を選択してください')),
      );
      return;
    }

    final dateKey = _getDateKey(_selectedDate!);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('${DateFormat('M月d日').format(_selectedDate!)}を中間確定'),
        content: Text('選択した${_selectedRequestIds.length}件の申請を中間確定しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () async {
              // 外側のcontextを保存
              final scaffoldMessenger = ScaffoldMessenger.of(context);
              Navigator.pop(context);
              
              // ローディング開始
              setState(() {
                _isLoading = true;
              });
              
              // 中間確定処理
              try {
                final dateKey = _getDateKey(_selectedDate!);
                final requests = _requests[dateKey] ?? [];
                
                // 選択された申請の情報を準備
                final selections = <Map<String, dynamic>>[];
                for (var requestId in _selectedRequestIds) {
                  final request = requests.firstWhere(
                    (r) => r.requestId == requestId,
                    orElse: () => throw Exception('Request not found: $requestId'),
                  );
                  selections.add({
                    'requestId': request.requestId,
                    'startMinute': request.startMinute,
                    'endMinute': request.endMinute,
                  });
                }
                
                await _repository.interimConfirmRequests(
                  dateKey: dateKey,
                  selections: selections,
                );
                
                // データを再読み込み
                await _loadData();
                _selectedRequestIds.clear();
                
                if (mounted) {
                  scaffoldMessenger.showSnackBar(
                    const SnackBar(content: Text('中間確定しました')),
                  );
                }
              } catch (e) {
                if (mounted) {
                  scaffoldMessenger.showSnackBar(
                    SnackBar(
                      content: Text('エラー: ${e.toString()}'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              } finally {
                // ローディング終了
                if (mounted) {
                  setState(() {
                    _isLoading = false;
                  });
                }
              }
            },
            child: const Text('確定'),
          ),
        ],
      ),
    );
  }

  void _toggleManualSufficient() {
    if (_selectedDate == null) return;
    final dateKey = _getDateKey(_selectedDate!);
    setState(() {
      _isSufficientManual[dateKey] = !(_isSufficientManual[dateKey] ?? false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${DateFormat('yyyy年M月').format(_currentMonth)} ドラフト'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // 日付横スクロール
                _buildDateScrollBar(),
                const Divider(),
                // 申請一覧
                Expanded(
                  child: _selectedDate == null
                      ? const Center(child: Text('日付を選択してください'))
                      : _buildRequestList(),
                ),
              ],
            ),
    );
  }

  Widget _buildDateScrollBar() {
    final daysInMonth = _getDaysInMonth(_currentMonth);
    final businessHours = _businessHours;

    return Container(
      height: 80,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView.builder(
        controller: _dateScrollController,
        scrollDirection: Axis.horizontal,
        itemCount: daysInMonth,
        itemBuilder: (context, index) {
          final day = index + 1;
          final date = DateTime(_currentMonth.year, _currentMonth.month, day);
          final dateKey = _getDateKey(date);
          final isSelected = _selectedDate != null &&
              _selectedDate!.year == date.year &&
              _selectedDate!.month == date.month &&
              _selectedDate!.day == date.day;
          final isClosed = businessHours[dateKey]?.isClosed ?? false;
          final requests = _requests[dateKey] ?? [];
          final pendingCount = requests.where((r) => r.status == 'pending').length;

          return GestureDetector(
            onTap: () => _selectDate(date),
            child: Container(
              width: 60,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: isSelected
                    ? Colors.deepPurple[100]
                    : isClosed
                        ? Colors.grey[300]
                        : Colors.white,
                border: Border.all(
                  color: isSelected ? Colors.deepPurple : Colors.grey,
                  width: isSelected ? 2 : 1,
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$day',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: isClosed ? Colors.grey : Colors.black,
                    ),
                  ),
                  if (pendingCount > 0)
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.orange,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '$pendingCount',
                        style: const TextStyle(
                          fontSize: 10,
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildRequestList() {
    if (_selectedDate == null) return const SizedBox.shrink();
    
    final dateKey = _getDateKey(_selectedDate!);
    final requests = _requests[dateKey] ?? [];
    final pendingRequests = requests.where((r) => r.status == 'pending').toList();
    final businessHours = _businessHours[dateKey];
    final isManualSufficient = _isSufficientManual[dateKey] ?? false;

    if (businessHours == null) {
      return const Center(child: Text('営業時間データが見つかりません'));
    }

    return Column(
      children: [
        // 営業時間表示と説明文
        Container(
          padding: const EdgeInsets.all(16),
          color: Colors.grey[100],
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '営業時間: ${formatMinutes(businessHours.openMinute)} - ${formatMinutes(businessHours.closeMinute)}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 21, // デフォルト14の1.5倍
                    ),
                  ),
                  if (businessHours.isClosed)
                    const Text(
                      '店休日',
                      style: TextStyle(
                        color: Colors.red,
                        fontWeight: FontWeight.bold,
                        fontSize: 21, // デフォルト14の1.5倍
                      ),
                    ),
                ],
              ),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '※中間確定：カード右上のチェックボックスで選択し、ページ下部のボタンで中間確定',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[700],
                      ),
                      textAlign: TextAlign.right,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '※スライダー操作：カード右上のチェックボックスにチェックを入れた場合のみ申請時間内でスライダーの操作が可能（申請時間のスライダーは操作不可）。',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[700],
                      ),
                      textAlign: TextAlign.right,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '※必要十分チェック：不足日の募集などに使う判断材料。警告（スタッフ不足時間帯）がない日には自動でチェックされますが、管理者の裁量で手動チェックも可能',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[700],
                      ),
                      textAlign: TextAlign.right,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        
        // 申請カード一覧と下部操作エリア
        Expanded(
          child: Column(
            children: [
              // 申請カード一覧
              Expanded(
                child: pendingRequests.isEmpty
                    ? Center(
                        child: Text(
                          businessHours.isClosed ? '店休日です' : '申請がありません',
                          style: businessHours.isClosed
                              ? const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.red,
                                )
                              : const TextStyle(fontSize: 16),
                        ),
                      )
                    : ScrollbarTheme(
                        data: ScrollbarThemeData(
                          thumbColor: MaterialStateProperty.all(Colors.grey[700]), // 濃い色
                        ),
                        child: Scrollbar(
                          controller: _requestListScrollController,
                          thumbVisibility: true,
                          child: ListView.builder(
                            controller: _requestListScrollController,
                            itemCount: pendingRequests.length,
                            itemBuilder: (context, index) {
                              final request = pendingRequests[index];
                              return _buildRequestCard(request, businessHours);
                            },
                          ),
                        ),
                      ),
              ),
              // 下部操作エリア（右下に配置）
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // 必要十分（手動）チェックボックス
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Checkbox(
                          value: isManualSufficient,
                          onChanged: businessHours.isClosed ? null : (_) => _toggleManualSufficient(), // 店休日は無効化
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          visualDensity: VisualDensity.compact,
                        ),
                        Text(
                          '必要十分（手動）',
                          style: businessHours.isClosed 
                              ? TextStyle(color: Colors.grey[600]) 
                              : null,
                        ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    // 選択して中間確定ボタン
                    ElevatedButton(
                      onPressed: (businessHours.isClosed || _selectedRequestIds.isEmpty) 
                          ? null 
                          : _confirmInterim, // 店休日は無効化
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.deepPurple,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                      child: Text(
                        _selectedRequestIds.isEmpty
                            ? '申請を選択してください'
                            : '選択した${_selectedRequestIds.length}件を中間確定',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRequestCard(ShiftRequest request, BusinessHours businessHours) {
    final isSelected = _selectedRequestIds.contains(request.requestId);
    final isClosed = businessHours.isClosed; // 店休日フラグ

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: isClosed 
          ? Colors.grey[200] // 店休日はグレー背景
          : (isSelected ? Colors.deepPurple[50] : Colors.white),
      child: Column(
        children: [
          // ヘッダー（スタッフ名＋元の申請時間＋割り当て時間＋選択チェックボックス）
          ListTile(
            title: Row(
              children: [
                Text(
                  request.staffName,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                if (request.originalStartMinute != null && request.originalEndMinute != null)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(
                      '申請時間: ${formatMinutes(request.originalStartMinute!)} - ${formatMinutes(request.originalEndMinute!)}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.green,
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.only(left: 15),
                  child: Text(
                    '割当時間: ${formatMinutes(request.startMinute)} - ${formatMinutes(request.endMinute)}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),
                ),
              ],
            ),
            trailing: Checkbox(
              value: isSelected,
              onChanged: isClosed ? null : (_) => _toggleRequestSelection(request.requestId), // 店休日は無効化
            ),
          ),
          // 申請時間（スライダー表示）
          Padding(
            padding: const EdgeInsets.only(left: 16, right: 16, top: 8, bottom: 12),
            child: _buildTimeSlider(request, businessHours, isSelected && !isClosed), // 店休日は無効化
          ),
          // 店休日の場合は説明文を表示
          if (isClosed)
            Padding(
              padding: const EdgeInsets.only(left: 16, right: 16, bottom: 12),
              child: Text(
                '※店休日のため、この申請は操作できません',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.red[700],
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTimeSlider(ShiftRequest request, BusinessHours businessHours, bool isSelected) {
    final dateKey = request.date;
    // 営業時間全体を表示
    final openMinute = businessHours.openMinute;
    final closeMinute = businessHours.closeMinute;
    final startMinutes = request.startMinute;
    final endMinutes = request.endMinute;
    
    // 店休日の場合はスライダーを表示しない
    if (businessHours.isClosed) {
      return const SizedBox.shrink();
    }
    
    // 申請時間の範囲を取得（申請時間が存在しない場合は現在の割当時間を使用）
    final minMinute = request.originalStartMinute ?? startMinutes;
    final maxMinute = request.originalEndMinute ?? endMinutes;
    
    // スライダー用のキーを取得または作成
    final sliderKey = _sliderKeys.putIfAbsent('${dateKey}_${request.requestId}', () => GlobalKey());

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 範囲スライダー（開始時刻と終了時刻を1つで操作）
        LayoutBuilder(
          builder: (context, constraints) {
            final totalWidth = constraints.maxWidth;
            final totalMinutes = closeMinute - openMinute; // 営業時間全体
            final divisions = ((closeMinute - openMinute) / 60).round(); // 1時間刻み（営業時間全体）
            final sliderKeyId = '${dateKey}_${request.requestId}';
            
            // totalMinutesが0以下の場合はスライダーを表示しない
            if (totalMinutes <= 0 || divisions <= 0) {
              return const SizedBox.shrink();
            }
            
            // レンダリング後にスライダーのサイズを測定
            WidgetsBinding.instance.addPostFrameCallback((_) {
              final sliderContext = sliderKey.currentContext;
              if (sliderContext != null) {
                final renderBox = sliderContext.findRenderObject() as RenderBox?;
                if (renderBox != null && renderBox.hasSize) {
                  final sliderSize = renderBox.size;
                  // RangeSliderのパディングは左右各12px（Material Design仕様）
                  const sliderPadding = 24.0;
                  final newTrackWidth = sliderSize.width - sliderPadding;
                  const newLeftPadding = 12.0;
                  
                  if (_sliderTrackWidths[sliderKeyId] != newTrackWidth || 
                      _sliderLeftPaddings[sliderKeyId] != newLeftPadding) {
                    setState(() {
                      _sliderTrackWidths[sliderKeyId] = newTrackWidth;
                      _sliderLeftPaddings[sliderKeyId] = newLeftPadding;
                    });
                  }
                }
              }
            });
            
            // 保存されているトラック幅とパディングを使用（なければデフォルト値）
            final trackWidth = _sliderTrackWidths[sliderKeyId] ?? (totalWidth - 24.0);
            final leftPadding = _sliderLeftPaddings[sliderKeyId] ?? 12.0;
            
            // startMinutesとendMinutesを営業時間の範囲内にクランプ
            final clampedStartMinutes = startMinutes.clamp(openMinute, closeMinute);
            final clampedEndMinutes = endMinutes.clamp(openMinute, closeMinute);
            
            return RangeSlider(
                  key: sliderKey,
                  values: RangeValues(
                    clampedStartMinutes.toDouble(),
                    clampedEndMinutes.toDouble(),
                  ),
                  min: openMinute.toDouble(), // 営業時間の開始（表示用）
                  max: closeMinute.toDouble(), // 営業時間の終了（表示用）
                  divisions: divisions,
                  labels: RangeLabels(
                    formatMinutes(clampedStartMinutes),
                    formatMinutes(clampedEndMinutes),
                  ),
                  onChanged: isSelected ? (values) {
                    // 1時間刻みに丸める
                    final newStart = (values.start / 60).round() * 60;
                    final newEnd = (values.end / 60).round() * 60;
                    
                    // 申請時間の範囲内に制限（内側にしか動かせない）
                    final clampedStart = newStart.clamp(minMinute, maxMinute);
                    final clampedEnd = newEnd.clamp(minMinute, maxMinute);
                    
                    // 最小間隔を確保（1時間）かつ申請時間内であることを確認
                    if (clampedEnd - clampedStart >= 60 && 
                        clampedStart >= minMinute && clampedEnd <= maxMinute) {
                      _updateRequestTime(
                        request.requestId,
                        dateKey,
                        clampedStart,
                        clampedEnd,
                      );
                    }
                  } : null,
                );
          },
        ),
        // 申請時間表示用ライン（操作不可、黄色でハイライト）
        if (request.originalStartMinute != null && request.originalEndMinute != null) ...[
          const SizedBox(height: 8),
          LayoutBuilder(
            builder: (context, constraints) {
              final totalWidth = constraints.maxWidth;
              final totalMinutes = closeMinute - openMinute; // 営業時間全体
              
              // 申請時間ライン用のトラック幅とパディング（割当時間スライダーと同じ計算）
              const sliderPadding = 24.0;
              final trackWidth = totalWidth - sliderPadding;
              const leftPadding = 12.0;
              
              // 申請時間の位置を計算（営業時間全体を基準に）
              // totalMinutesが0の場合は表示しない
              if (totalMinutes <= 0 || trackWidth.isNaN || trackWidth <= 0) {
                return const SizedBox.shrink();
              }
              
              final startRatio = (request.originalStartMinute! - openMinute) / totalMinutes;
              final endRatio = (request.originalEndMinute! - openMinute) / totalMinutes;
              final startPosition = leftPadding + startRatio * trackWidth;
              final endPosition = leftPadding + endRatio * trackWidth;
              final lineWidth = endPosition - startPosition;
              
              // lineWidthがNaNまたは負の値の場合は表示しない
              if (lineWidth.isNaN || lineWidth <= 0) {
                return const SizedBox.shrink();
              }
              
              return SizedBox(
                    height: 4, // ラインの高さ
                    child: Stack(
                      children: [
                        // 背景のグレーライン（営業時間全体）
                        Positioned(
                          left: leftPadding,
                          right: leftPadding,
                          top: 1.5, // 中央に配置
                          child: Container(
                            height: 1,
                            color: Colors.grey[300],
                          ),
                        ),
                        // 申請時間の黄色ライン
                        Positioned(
                          left: startPosition,
                          top: 0,
                          child: Container(
                            width: lineWidth,
                            height: 4,
                            decoration: BoxDecoration(
                              color: Colors.greenAccent[700],
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
            },
          ),
          // 目盛りと端の時間（ラインの下）
          const SizedBox(height: 8),
          LayoutBuilder(
            builder: (context, constraints) {
              // LayoutBuilderのconstraints.maxWidthは親のPadding（左右16pxずつ）を除いた幅
              // つまり、実際のカードの内部幅
              final totalWidth = constraints.maxWidth;
              final totalMinutes = closeMinute - openMinute;
              final sliderKeyId = '${dateKey}_${request.requestId}';
              
              // 保存されているトラック幅とパディングを使用（なければデフォルト値）
              final trackWidth = _sliderTrackWidths[sliderKeyId] ?? (totalWidth - 24.0);
              final leftPadding = _sliderLeftPaddings[sliderKeyId] ?? 12.0;
              
              // すべての時間表示（端の時間と目盛り）を同じStack内で配置
              // Stackの幅をtotalWidthに明示的に設定し、ラベルがカードの内部幅に収まるようにする
              return SizedBox(
                width: totalWidth,
                height: 20,
                child: Stack(
                  clipBehavior: Clip.none, // テキストがStackの境界を超えても表示されるようにする
                  children: _buildAllTimeLabels(openMinute, closeMinute, trackWidth, totalMinutes, leftPadding, totalWidth),
                ),
              );
            },
          ),
        ],
      ],
    );
  }

  /// すべての時間ラベル（端の時間と目盛り）を生成
  List<Widget> _buildAllTimeLabels(int openMinute, int closeMinute, double trackWidth, int totalMinutes, double leftPadding, double totalWidth) {
    final labels = <Widget>[];
    const intervalMinutes = 120; // 2時間 = 120分
    const textStyle = TextStyle(
      fontSize: 12,
      fontWeight: FontWeight.bold,
    );
    
    // 開始時刻から終了時刻まで、2時間ごとにラベルを生成（開始時刻と終了時刻も含む）
    int currentMinute = openMinute;
    while (currentMinute <= closeMinute) {
      // RangeSliderの内部実装に合わせて、値から直接位置を計算
      // position = leftPadding + ((value - min) / (max - min)) * trackWidth
      final ratio = (currentMinute - openMinute) / totalMinutes;
      final position = leftPadding + ratio * trackWidth;
      
      // テキストの幅を測定して中央揃え
      final timeText = formatMinutes(currentMinute);
      final textPainter = TextPainter(
        text: TextSpan(
          text: timeText,
          style: textStyle,
        ),
        textDirection: ui.TextDirection.ltr,
      );
      textPainter.layout();
      final textWidth = textPainter.size.width;
      
      // カードの端に収まるように位置を制限
      final calculatedLeft = position - textWidth / 2;
      final maxLeft = (totalWidth - textWidth).clamp(0.0, double.infinity);
      final clampedLeft = calculatedLeft.clamp(0.0, maxLeft);
      
      labels.add(
        Positioned(
          left: clampedLeft, // カードの範囲内に収まるように制限
          top: 0,
          child: Text(
            timeText,
            style: textStyle,
            textAlign: TextAlign.center,
          ),
        ),
      );
      currentMinute += intervalMinutes;
    }
    
    // 終了時刻が2時間間隔に含まれていない場合、明示的に追加
    final lastAddedMinute = currentMinute - intervalMinutes;
    if (lastAddedMinute < closeMinute) {
      final ratio = (closeMinute - openMinute) / totalMinutes;
      final position = leftPadding + ratio * trackWidth;
      
      final timeText = formatMinutes(closeMinute);
      final textPainter = TextPainter(
        text: TextSpan(
          text: timeText,
          style: textStyle,
        ),
        textDirection: ui.TextDirection.ltr,
      );
      textPainter.layout();
      final textWidth = textPainter.size.width;
      
      final calculatedLeft = position - textWidth / 2;
      final maxLeft = (totalWidth - textWidth).clamp(0.0, double.infinity);
      final clampedLeft = calculatedLeft.clamp(0.0, maxLeft);
      
      labels.add(
        Positioned(
          left: clampedLeft,
          top: 0,
          child: Text(
            timeText,
            style: textStyle,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    
    return labels;
  }

}

/// シフト申請
class ShiftRequest {
  final String requestId;
  final String staffId;
  final String staffName;
  final String date; // YYYY-MM-DD
  final String yearMonth; // YYYY-MM
  final int startMinute; // 0:00からの分数（例: 540 = 09:00）
  final int endMinute; // 0:00からの分数（例: 1080 = 18:00）
  final String status; // pending, interim_confirmed, final_confirmed
  final int? originalStartMinute; // 元の申請時間（スライダー調整前）
  final int? originalEndMinute; // 元の申請時間（スライダー調整前）

  ShiftRequest({
    required this.requestId,
    required this.staffId,
    required this.staffName,
    required this.date,
    required this.yearMonth,
    required this.startMinute,
    required this.endMinute,
    required this.status,
    this.originalStartMinute,
    this.originalEndMinute,
  });

  ShiftRequest copyWith({
    String? requestId,
    String? staffId,
    String? staffName,
    String? date,
    String? yearMonth,
    int? startMinute,
    int? endMinute,
    String? status,
    int? originalStartMinute,
    int? originalEndMinute,
  }) {
    return ShiftRequest(
      requestId: requestId ?? this.requestId,
      staffId: staffId ?? this.staffId,
      staffName: staffName ?? this.staffName,
      date: date ?? this.date,
      yearMonth: yearMonth ?? this.yearMonth,
      startMinute: startMinute ?? this.startMinute,
      endMinute: endMinute ?? this.endMinute,
      status: status ?? this.status,
      originalStartMinute: originalStartMinute ?? this.originalStartMinute,
      originalEndMinute: originalEndMinute ?? this.originalEndMinute,
    );
  }
}

