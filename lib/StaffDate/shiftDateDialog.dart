import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'shiftHomePage.dart';
import 'shift_repository.dart';
import '../Utils/time_converter.dart';
import '../globalConstant.dart';
import '../services/device_service.dart';
import '../services/required_staff_by_time_slot_service.dart';
import 'utils/gap_time_slots.dart';
import 'utils/insufficient_time_slots.dart';
import 'utils/merge_consecutive_insufficient_slots.dart';

/// 日付ダイアログ（カレンダーセルの拡大＆編集）
class ShiftDateDialog extends StatefulWidget {
  final DateTime date;
  final ShiftDayData? dayData;
  /// 未処理申請の表示用（staffName, startMinute, endMinute）
  final List<Map<String, dynamic>> pendingRequestDisplays;
  final Function(ShiftDayData) onUpdate;
  final VoidCallback? onNavigateToDraft;
  final VoidCallback? onFinalize;

  const ShiftDateDialog({
    super.key,
    required this.date,
    this.dayData,
    this.pendingRequestDisplays = const [],
    required this.onUpdate,
    this.onNavigateToDraft,
    this.onFinalize,
  });

  @override
  State<ShiftDateDialog> createState() => _ShiftDateDialogState();
}

class _ShiftDateDialogState extends State<ShiftDateDialog> {
  late List<ShiftAssignment> _assignments;
  bool _isSufficient = false;
  bool _isManuallyChecked = false; // 手動チェックされたかどうか
  
  // Repository
  final ShiftRepository _repository = ShiftRepository();
  final DeviceService _deviceService = DeviceService();
  
  // 時間編集用の一時変数（minutes形式）
  final Map<int, ({int start, int end})> _editingTimes = {};
  
  // スクロール用のコントローラー
  final ScrollController _scrollController = ScrollController();
  
  // 管理者フラグ
  bool _isAdmin = false;

  @override
  void initState() {
    super.initState();
    _assignments = widget.dayData?.assignments != null 
        ? List<ShiftAssignment>.from(widget.dayData!.assignments)
        : [];
    _isSufficient = widget.dayData?.isSufficient ?? false;
    // 初期状態で既にチェックされている場合は、手動チェックとみなす
    _isManuallyChecked = _isSufficient;
    // 管理者判定
    _checkAdminStatus();
  }
  
  Future<void> _checkAdminStatus() async {
    final isAdmin = await _deviceService.isAdmin();
    if (mounted) {
      setState(() {
        _isAdmin = isAdmin;
      });
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _deleteAssignment(int index) {
    setState(() {
      _assignments.removeAt(index);
      _updateDayData(); // 即座に反映（自動判定も含む）
    });
  }

  void _updateAssignmentTime(int index, int startMinute, int endMinute) {
    setState(() {
      _assignments[index] = ShiftAssignment(
        staffId: _assignments[index].staffId,
        staffName: _assignments[index].staffName,
        startMinute: startMinute,
        endMinute: endMinute,
      );
      _updateDayData(); // 即座に反映
    });
  }

  Future<void> _updateDayData() async {
    if (widget.dayData != null) {
      // 警告がない日（空き時間帯もスタッフ不足時間帯もない）に自動でチェック
      final gapSlots = _findGapTimeSlots();
      final insufficientSlots = _findInsufficientTimeSlots();
      final hasWarnings = gapSlots.isNotEmpty || insufficientSlots.isNotEmpty;
      final autoSufficient = !hasWarnings;
      
      // 手動チェックされていない場合のみ自動判定を適用
      if (!_isManuallyChecked) {
        setState(() {
          _isSufficient = autoSufficient;
        });
      }
      
      final updatedData = widget.dayData!.copyWith(
        assignments: _assignments,
        isSufficient: _isSufficient,
      );
      
      // UIを即座に更新
      widget.onUpdate(updatedData);
      
      // Firestoreに保存
      try {
        final dateKey = DateFormat('yyyy-MM-dd').format(widget.date);
        await _repository.updateDayAssignments(
          dateKey: dateKey,
          assignments: _assignments,
        );
      } catch (e) {
        // エラーは呼び出し元に伝える（新規作成時は「作成しました」を出さないため）
        rethrow;
      }
    }
  }

  void _toggleSufficient(bool? value) async {
    final newValue = value ?? !_isSufficient;
    setState(() {
      _isSufficient = newValue;
      _isManuallyChecked = true; // 手動チェックされたことを記録
    });
    
    // Firestoreに保存
    try {
      final dateKey = DateFormat('yyyy-MM-dd').format(widget.date);
      final override = newValue ? 'on' : 'off';
      await _repository.setSufficientOverride(
        dateKey: dateKey,
        override: override,
      );
      _updateDayData(); // 即座に反映
    } catch (e) {
      // エラー時は元に戻す
      setState(() {
        _isSufficient = !newValue;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('エラー: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final dayData = widget.dayData;
    final dateStr = DateFormat('M月d日(E)', 'ja').format(widget.date);

    return Dialog(
      child: Container(
        width: double.maxFinite,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.9,
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ヘッダー（固定）
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  dateStr,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const Divider(),
            // スクロール可能なコンテンツ
            Expanded(
              child: Scrollbar(
                controller: _scrollController,
                thumbVisibility: true,
                child: SingleChildScrollView(
                  controller: _scrollController,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 営業時間・必要十分チェックエリア（右側に最終確定ボタン）
                      if (dayData != null)
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '営業時間: ${formatMinutes(dayData.businessHours.openMinute)} - ${formatMinutes(dayData.businessHours.closeMinute)}',
                                    style: const TextStyle(fontSize: 14),
                                  ),
                                  // 未処理申請の表示（タップでドラフトページへ遷移）
                                  if (widget.pendingRequestDisplays.isNotEmpty) ...[
                                    const SizedBox(height: 8),
                                    Text(
                                      '未処理申請（タップでドラフトへ）',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Colors.orange,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    ...widget.pendingRequestDisplays.map((r) {
                                      final staffName = r['staffName'] as String? ?? '不明';
                                      final startMinute = r['startMinute'] as int? ?? 0;
                                      final endMinute = r['endMinute'] as int? ?? 0;
                                      return InkWell(
                                        onTap: widget.onNavigateToDraft != null
                                            ? () => widget.onNavigateToDraft!()
                                            : null,
                                        child: Padding(
                                          padding: const EdgeInsets.symmetric(vertical: 4),
                                          child: Row(
                                            children: [
                                              Icon(
                                                Icons.person_outline,
                                                size: 16,
                                                color: widget.onNavigateToDraft != null
                                                    ? Colors.blue
                                                    : Colors.grey,
                                              ),
                                              const SizedBox(width: 6),
                                              Expanded(
                                                child: Text(
                                                  '$staffName ${formatMinutes(startMinute)} - ${formatMinutes(endMinute)}',
                                                  style: TextStyle(
                                                    fontSize: 13,
                                                    color: widget.onNavigateToDraft != null
                                                        ? Colors.blue
                                                        : null,
                                                  ),
                                                ),
                                              ),
                                              if (widget.onNavigateToDraft != null)
                                                Icon(Icons.arrow_forward_ios, size: 12, color: Colors.blue),
                                            ],
                                          ),
                                        ),
                                      );
                                    }),
                                  ],
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Checkbox(
                                        value: _isSufficient,
                                        onChanged: _toggleSufficient,
                                      ),
                                      const Text('必要十分'),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            // 最終確定ボタン（右側）
                            if (dayData.isInterimConfirmed && widget.onFinalize != null)
                              SizedBox(
                                width: MediaQuery.of(context).size.width * 0.12,
                                child: ElevatedButton(
                                  onPressed: () {
                                    showDialog(
                                      context: context,
                                      builder: (context) => AlertDialog(
                                        title: Text('${dateStr}を最終確定'),
                                        content: const Text('この日のシフトを最終確定しますか？'),
                                        actions: [
                                          TextButton(
                                            onPressed: () => Navigator.pop(context),
                                            child: const Text('キャンセル'),
                                          ),
                                          TextButton(
                                            onPressed: () {
                                              Navigator.pop(context);
                                              widget.onFinalize!();
                                            },
                                            child: const Text('確定'),
                                          ),
                                        ],
                                      ),
                                    );
                                  },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.deepPurple,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  ),
                                  child: const Text(
                                    '最終確定',
                                    style: TextStyle(fontSize: 12),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      if (dayData != null) const Divider(),

                      // シフト一覧
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'シフト割当',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          // 管理者のみ表示: 新規シフト作成ボタン
                          if (_isAdmin && dayData != null && !dayData.businessHours.isClosed)
                            ElevatedButton.icon(
                              onPressed: () => _showCreateShiftDialog(dayData),
                              icon: const Icon(Icons.add, size: 18),
                              label: const Text('新規作成'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.blue,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      
                      if (_assignments.isEmpty)
                        const Text('シフトがありません')
                      else ...[
                        ..._assignments.asMap().entries.map((entry) {
                          final index = entry.key;
                          final assignment = entry.value;
                          return _buildAssignmentCard(index, assignment, dayData);
                        }).toList(),
                        // スタッフ不足時間帯の警告表示
                        if (dayData != null && !dayData.businessHours.isClosed) ...[
                          const SizedBox(height: 16),
                          const Divider(),
                          const SizedBox(height: 8),
                          const Text(
                            'スタッフ不足時間帯',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Colors.red,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Builder(
                            builder: (context) {
                              final gapSlots = _findGapTimeSlots(); // 誰もいない時間帯
                              final insufficientSlots = _findInsufficientTimeSlots(); // 人数が足りない時間帯
                              
                              if (gapSlots.isEmpty && insufficientSlots.isEmpty) {
                                return const Text(
                                  'スタッフ不足時間帯はありません',
                                  style: TextStyle(fontSize: 14, color: Colors.grey),
                                );
                              }
                              
                              return Column(
                                children: [
                                  // 誰もいない時間帯（空き時間帯）
                                  ...gapSlots.map((gap) {
                                    return Container(
                                      padding: const EdgeInsets.all(12),
                                      margin: const EdgeInsets.only(bottom: 8),
                                      decoration: BoxDecoration(
                                        color: Colors.red[50],
                                        border: Border.all(color: Colors.red, width: 2),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.warning, color: Colors.red, size: 24),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  '${formatMinutes(gap.start)} - ${formatMinutes(gap.end)}',
                                                  style: const TextStyle(
                                                    fontSize: 16,
                                                    color: Colors.red,
                                                    fontWeight: FontWeight.bold,
                                                  ),
                                                ),
                                                const SizedBox(height: 4),
                                                const Text(
                                                  'この時間帯にスタッフが1人もいません',
                                                  style: TextStyle(
                                                    fontSize: 12,
                                                    color: Colors.red,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                  // 人数が足りない時間帯
                                  ...insufficientSlots.map((slot) {
                                    return Container(
                                      padding: const EdgeInsets.all(12),
                                      margin: const EdgeInsets.only(bottom: 8),
                                      decoration: BoxDecoration(
                                        color: Colors.orange[50],
                                        border: Border.all(color: Colors.orange, width: 2),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.warning, color: Colors.orange, size: 24),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  '${formatMinutes(slot.start)} - ${formatMinutes(slot.end)}',
                                                  style: const TextStyle(
                                                    fontSize: 16,
                                                    color: Colors.orange,
                                                    fontWeight: FontWeight.bold,
                                                  ),
                                                ),
                                                const SizedBox(height: 4),
                                                Text(
                                                  slot.required == 1 && slot.current == 0
                                                      ? 'この時間帯にスタッフが1人もいません'
                                                      : '必要人数: ${slot.required}人 / 現在: ${slot.current}人（${slot.required - slot.current}人不足）',
                                                  style: const TextStyle(
                                                    fontSize: 12,
                                                    color: Colors.orange,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                ],
                              );
                            },
                          ),
                        ],
                      ],
                    ],
                  ),
                ),
              ),
             ),
            ],
          ),
        ),
      );
  }

  Widget _buildAssignmentCard(
    int index,
    ShiftAssignment assignment,
    ShiftDayData? dayData,
  ) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(assignment.staffName),
        subtitle: Text('${formatMinutes(assignment.startMinute)} - ${formatMinutes(assignment.endMinute)}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 時間変更ボタン
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () => _showTimeEditDialog(index, assignment, dayData),
            ),
            // 削除ボタン
            IconButton(
              icon: const Icon(Icons.delete),
              color: Colors.red,
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('削除確認'),
                    content: Text('${assignment.staffName}のシフトを削除しますか？'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('キャンセル'),
                      ),
                      TextButton(
                        onPressed: () {
                          Navigator.pop(context);
                          _deleteAssignment(index);
                        },
                        child: const Text('削除'),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showTimeEditDialog(
    int index,
    ShiftAssignment assignment,
    ShiftDayData? dayData,
  ) async {
    if (dayData == null) return;

    int startMinute = assignment.startMinute;
    int endMinute = assignment.endMinute;

    // 営業時間の範囲を取得
    final businessHours = dayData.businessHours;
    final openHour = businessHours.openMinute ~/ 60;
    final closeHour = businessHours.closeMinute ~/ 60;

    // 申請時間の範囲を取得（sourceRequestIdが存在する場合）
    int? minMinute;
    int? maxMinute;
    
    if (assignment.sourceRequestId != null) {
      final requestInfo = await _repository.getShiftRequestById(assignment.sourceRequestId!);
      if (requestInfo != null) {
        minMinute = requestInfo.originalStartMinute;
        maxMinute = requestInfo.originalEndMinute;
      }
    }

    // 申請時間が取得できた場合は申請時間内、そうでない場合は営業時間内で選択可能
    final minHour = minMinute != null ? minMinute ~/ 60 : openHour;
    final maxHour = maxMinute != null ? maxMinute ~/ 60 : closeHour;

    // 1時間刻みの時間オプションを生成（申請時間または営業時間の範囲内）
    final List<int> hourOptions = [];
    for (int hour = minHour; hour <= maxHour; hour++) {
      hourOptions.add(hour);
    }

    // 現在の時間を取得（分は切り捨てて時間のみ）
    int initialStartHour = startMinute ~/ 60;
    int initialEndHour = endMinute ~/ 60;

    // 現在の時間がオプションに含まれていない場合は、最寄りの時間に調整
    if (!hourOptions.contains(initialStartHour)) {
      if (initialStartHour < minHour) {
        initialStartHour = minHour;
      } else if (initialStartHour > maxHour) {
        initialStartHour = maxHour;
      }
    }
    if (!hourOptions.contains(initialEndHour)) {
      if (initialEndHour < minHour) {
        initialEndHour = minHour;
      } else if (initialEndHour > maxHour) {
        initialEndHour = maxHour;
      }
    }

    // ダイアログの状態を保持する変数
    int currentStartHour = initialStartHour;
    int currentEndHour = initialEndHour;

    if (!mounted) return;
    
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          return AlertDialog(
            title: Text('${assignment.staffName}の時間変更'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // 開始時刻
                Row(
                  children: [
                    const Expanded(
                      child: Text('開始時刻'),
                    ),
                    Expanded(
                      child: DropdownButton<int>(
                        value: currentStartHour,
                        items: hourOptions.map((hour) {
                          return DropdownMenuItem<int>(
                            value: hour,
                            child: Text('${hour.toString().padLeft(2, '0')}:00'),
                          );
                        }).toList(),
                        onChanged: (value) {
                          if (value != null) {
                            setDialogState(() {
                              currentStartHour = value;
                            });
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // 終了時刻
                Row(
                  children: [
                    const Expanded(
                      child: Text('終了時刻'),
                    ),
                    Expanded(
                      child: DropdownButton<int>(
                        value: currentEndHour,
                        items: hourOptions.map((hour) {
                          return DropdownMenuItem<int>(
                            value: hour,
                            child: Text('${hour.toString().padLeft(2, '0')}:00'),
                          );
                        }).toList(),
                        onChanged: (value) {
                          if (value != null) {
                            setDialogState(() {
                              currentEndHour = value;
                            });
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('キャンセル'),
              ),
              TextButton(
                onPressed: () {
                  final startMin = currentStartHour * 60;
                  final endMin = currentEndHour * 60;
                  
                  // 申請時間の範囲内に制限
                  final clampedStartMin = minMinute != null && maxMinute != null
                      ? startMin.clamp(minMinute, maxMinute)
                      : startMin;
                  final clampedEndMin = minMinute != null && maxMinute != null
                      ? endMin.clamp(minMinute, maxMinute)
                      : endMin;
                  
                  if (clampedStartMin < clampedEndMin) {
                    Navigator.pop(dialogContext);
                    _updateAssignmentTime(index, clampedStartMin, clampedEndMin);
                    // 親ダイアログは閉じず、「変更する」ボタンでまとめて保存
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('開始時刻は終了時刻より前である必要があります')),
                    );
                  }
                },
                child: const Text('保存'),
              ),
            ],
          );
        },
      ),
    );
  }


  /// 営業時間内でシフトがいない時間帯を検出（60分刻み）
  List<({int start, int end})> _findGapTimeSlots() {
    if (widget.dayData == null ||
        widget.dayData!.businessHours.isClosed ||
        _assignments.isEmpty) {
      return [];
    }

    final businessHours = widget.dayData!.businessHours;
    final assignments = _assignments
        .map((a) => (startMinute: a.startMinute, endMinute: a.endMinute))
        .toList();

    return findGapTimeSlots(
      openMinute: businessHours.openMinute,
      closeMinute: businessHours.closeMinute,
      assignments: assignments,
    );
  }

  /// スタッフ不足時間帯を検出（設定された時間帯での不足のみ、空き時間帯は除外）
  List<({int start, int end, int required, int current})> _findInsufficientTimeSlots() {
    if (widget.dayData == null || widget.dayData!.businessHours.isClosed) {
      return [];
    }

    final businessHours = widget.dayData!.businessHours;
    final resolution = RequiredStaffByTimeSlotService.instance.resolveForStyle(
      styleId: businessHours.styleId,
      isClosed: businessHours.isClosed,
    );

    if (resolution.status != RequiredStaffStyleStatus.active) {
      return [];
    }

    final assignments = _assignments
        .map((a) => (startMinute: a.startMinute, endMinute: a.endMinute))
        .toList();

    final slots = findInsufficientTimeSlots(
      openMinute: businessHours.openMinute,
      closeMinute: businessHours.closeMinute,
      assignments: assignments,
      requiredStaffByTimeSlot: resolution.slots,
    );

    return mergeConsecutiveInsufficientSlots(slots);
  }

  /// 新規シフト作成ダイアログを表示
  Future<void> _showCreateShiftDialog(ShiftDayData dayData) async {
    // スタッフ一覧を取得
    List<Map<String, dynamic>> staffList = [];
    try {
      final snapshot = await FirebaseFirestore.instance.collection('staffs').get();
      staffList = snapshot.docs
          .where((doc) => doc.data()['status'] != 'retired')
          .map((doc) {
        final data = doc.data();
        return {
          'id': doc.id,
          'fullName': data['fullName'] ?? '不明',
          'fullNameKana': data['fullNameKana'] ?? '',
        };
      }).toList();
      // かな順でソート
      staffList.sort((a, b) => (a['fullNameKana'] as String).compareTo(b['fullNameKana'] as String));

      final assignedStaffIds =
          _assignments.map((assignment) => assignment.staffId).toSet();
      final hadAnyStaff = staffList.isNotEmpty;
      staffList = staffList
          .where((staff) => !assignedStaffIds.contains(staff['id']))
          .toList();

      if (staffList.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                hadAnyStaff
                    ? 'この日に追加可能なスタッフがいません'
                    : 'スタッフが見つかりません',
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('スタッフ一覧の取得に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    // 24時間分の時間オプションを生成（0:00〜24:00）
    final List<int> hourOptions = [];
    for (int hour = 0; hour <= 24; hour++) {
      hourOptions.add(hour);
    }

    // 選択状態
    String? selectedStaffId;
    String? selectedStaffName;
    int? selectedStartHour;
    int? selectedEndHour;

    if (!mounted) return;

    // 親のcontextを保存（ダイアログ閉鎖後も使用可能にするため）
    final parentContext = context;

    final isLoadingNotifier = ValueNotifier<bool>(false);
    
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          return ValueListenableBuilder<bool>(
            valueListenable: isLoadingNotifier,
            builder: (context, isLoading, _) {
              return AlertDialog(
                title: const Text('新規シフト作成'),
                content: isLoading
                    ? const SizedBox(
                        height: 100,
                        child: Center(
                          child: CircularProgressIndicator(),
                        ),
                      )
                    : SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                  // スタッフ選択
                  const Text(
                    'スタッフ',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  DropdownButton<String>(
                    value: selectedStaffId,
                    isExpanded: true,
                    hint: const Text('スタッフを選択'),
                    items: staffList.map((staff) {
                      return DropdownMenuItem<String>(
                        value: staff['id'] as String,
                        child: Text(staff['fullName'] as String),
                      );
                    }).toList(),
                    onChanged: (value) {
                      if (value != null) {
                        setDialogState(() {
                          selectedStaffId = value;
                          selectedStaffName = staffList.firstWhere(
                            (s) => s['id'] == value,
                          )['fullName'] as String;
                        });
                      }
                    },
                  ),
                  const SizedBox(height: 16),
                  // 開始時刻
                  const Text(
                    '開始時刻',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  DropdownButton<int>(
                    value: selectedStartHour,
                    isExpanded: true,
                    hint: const Text('開始時刻を選択'),
                    items: hourOptions.map((hour) {
                      final displayText = hour == 24 ? '24:00' : '${hour.toString().padLeft(2, '0')}:00';
                      return DropdownMenuItem<int>(
                        value: hour,
                        child: Text(displayText),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setDialogState(() {
                        selectedStartHour = value;
                        // 終了時刻が開始時刻以下になった場合はリセット
                        if (selectedEndHour != null && value != null && selectedEndHour! <= value) {
                          selectedEndHour = null;
                        }
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                  // 終了時刻
                  const Text(
                    '終了時刻',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  DropdownButton<int>(
                    value: selectedEndHour,
                    isExpanded: true,
                    hint: const Text('終了時刻を選択'),
                    items: hourOptions
                        .where((hour) {
                          // 開始時刻より後の時刻のみ選択可能
                          if (selectedStartHour == null) return true;
                          return hour > selectedStartHour!;
                        })
                        .map((hour) {
                      final displayText = hour == 24 ? '24:00' : '${hour.toString().padLeft(2, '0')}:00';
                      return DropdownMenuItem<int>(
                        value: hour,
                        child: Text(displayText),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setDialogState(() {
                        selectedEndHour = value;
                      });
                    },
                  ),
                ],
              ),
            ),
            actions: isLoading
                ? []
                : [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      child: const Text('キャンセル'),
                    ),
                    TextButton(
                      onPressed: () async {
                        if (selectedStaffId == null || selectedStaffName == null || 
                            selectedStartHour == null || selectedEndHour == null) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('すべての項目を選択してください'),
                              backgroundColor: Colors.red,
                            ),
                          );
                          return;
                        }

                        // ローディング開始
                        isLoadingNotifier.value = true;

                        // 分に変換
                        final startMinute = selectedStartHour! * 60;
                        final endMinute = selectedEndHour == 24 ? 1440 : selectedEndHour! * 60;

                        // 新しいシフト割当を追加
                        final newAssignment = ShiftAssignment(
                          staffId: selectedStaffId!,
                          staffName: selectedStaffName!,
                          startMinute: startMinute,
                          endMinute: endMinute,
                          sourceRequestId: GlobalConstants.ADMIN_CREATED_SHIFT_ID, // 管理者が直接作成
                        );

                        // ローカル状態を更新
                        if (mounted) {
                          setState(() {
                            _assignments.add(newAssignment);
                          });
                        }
                        
                        // Firestoreに保存（成功時のみ「作成しました」を表示するためフラグで制御）
                        bool didSaveSucceed = false;
                        try {
                          if (mounted) {
                            await _updateDayData();
                            didSaveSucceed = true;
                          }
                        } catch (e) {
                          // エラー時はローカル状態から削除
                          if (mounted) {
                            setState(() {
                              if (_assignments.isNotEmpty && _assignments.last == newAssignment) {
                                _assignments.removeLast();
                              }
                            });
                          }
                          
                          // ローディング終了
                          isLoadingNotifier.value = false;
                          
                          if (parentContext.mounted) {
                            ScaffoldMessenger.of(parentContext).showSnackBar(
                              SnackBar(
                                content: Text('シフトの保存に失敗しました: $e'),
                                backgroundColor: Colors.red,
                              ),
                            );
                          }
                        }
                        // 成功した場合のみダイアログを閉じ、成功スナックバーを表示
                        if (didSaveSucceed) {
                          isLoadingNotifier.value = false;
                          if (dialogContext.mounted) {
                            Navigator.pop(dialogContext);
                          }
                          if (mounted && parentContext.mounted) {
                            ScaffoldMessenger.of(parentContext).showSnackBar(
                              const SnackBar(
                                content: Text('シフトを作成しました'),
                                backgroundColor: Colors.green,
                              ),
                            );
                          }
                        }
                      },
                      child: const Text('作成'),
                    ),
                  ],
              );
            },
          );
        },
      ),
    );
  }
}

