import 'dart:async';

import 'package:flutter/material.dart';

import '../Utils/time_converter.dart';
import '../services/business_styles_service.dart';
import '../services/required_staff_by_time_slot_service.dart';
import '../services/store_config_defaults.dart';
import 'errors/staff_shift_errors.dart';
import 'shift_repository.dart';
import 'utils/business_hours_style_labels.dart';
import 'utils/required_staff_slot_validation.dart';

/// 営業スタイル・必要人数設定画面
class ShiftStyleRequiredStaffSettingsPage extends StatefulWidget {
  const ShiftStyleRequiredStaffSettingsPage({super.key});

  @override
  State<ShiftStyleRequiredStaffSettingsPage> createState() =>
      _ShiftStyleRequiredStaffSettingsPageState();
}

class _ShiftStyleRequiredStaffSettingsPageState
    extends State<ShiftStyleRequiredStaffSettingsPage> {
  final ShiftRepository _repository = ShiftRepository();

  Map<String, Map<String, dynamic>> _businessHoursStyles =
      Map<String, Map<String, dynamic>>.from(kDefaultBusinessHoursStyles);
  Map<String, List<Map<String, int>>> _requiredStaffByStyle = {};

  bool _isLoading = true;
  bool _isEditingBusinessHours = false;
  bool _isEditingRequiredStaff = false;
  bool _isSavingStyles = false;
  bool _isSavingRequiredStaff = false;

  Map<String, Map<String, dynamic>>? _businessHoursStylesSnapshot;
  Map<String, List<Map<String, int>>>? _requiredStaffByStyleSnapshot;

  StreamSubscription<BusinessStylesDocStatus>? _businessStylesSubscription;

  @override
  void initState() {
    super.initState();
    _businessStylesSubscription =
        BusinessStylesService.instance.statusStream.listen((_) {
      if (mounted) _loadInitialData();
    });
    _loadInitialData();
  }

  @override
  void dispose() {
    _businessStylesSubscription?.cancel();
    super.dispose();
  }

  void _loadInitialData() {
    final businessStyles = BusinessStylesService.instance.latest;

    if (businessStyles != null) {
      _businessHoursStyles = Map<String, Map<String, dynamic>>.from(
        businessStyles.businessHoursStyles.map(
          (key, value) => MapEntry(key, Map<String, dynamic>.from(value)),
        ),
      );
      _requiredStaffByStyle = businessStyles.requiredStaffByStyle.map(
        (key, value) => MapEntry(
          key,
          value.map((e) => Map<String, int>.from(e)).toList(),
        ),
      );
    } else {
      _businessHoursStyles = {};
      _requiredStaffByStyle = {};
    }

    for (final styleId in kBusinessHoursStyleIds) {
      _requiredStaffByStyle.putIfAbsent(styleId, () => []);
    }

    setState(() => _isLoading = false);
  }

  Map<String, Map<String, dynamic>> _cloneBusinessHoursStyles() {
    return _businessHoursStyles.map(
      (key, value) => MapEntry(key, Map<String, dynamic>.from(value)),
    );
  }

  Map<String, List<Map<String, int>>> _cloneRequiredStaffByStyle() {
    return _requiredStaffByStyle.map(
      (key, value) => MapEntry(
        key,
        value.map((e) => Map<String, int>.from(e)).toList(),
      ),
    );
  }

  void _startEditingBusinessHours() {
    setState(() {
      _businessHoursStylesSnapshot = _cloneBusinessHoursStyles();
      _isEditingBusinessHours = true;
    });
  }

  void _cancelEditingBusinessHours() {
    final snapshot = _businessHoursStylesSnapshot;
    if (snapshot == null) return;
    setState(() {
      _businessHoursStyles = snapshot;
      _businessHoursStylesSnapshot = null;
      _isEditingBusinessHours = false;
    });
  }

  void _startEditingRequiredStaff() {
    setState(() {
      _requiredStaffByStyleSnapshot = _cloneRequiredStaffByStyle();
      _isEditingRequiredStaff = true;
    });
  }

  void _cancelEditingRequiredStaff() {
    final snapshot = _requiredStaffByStyleSnapshot;
    if (snapshot == null) return;
    setState(() {
      _requiredStaffByStyle = snapshot;
      _requiredStaffByStyleSnapshot = null;
      _isEditingRequiredStaff = false;
    });
  }

  Widget _sectionActionButtons({
    required bool isEditing,
    required bool isSaving,
    required bool canEdit,
    required VoidCallback onEdit,
    required VoidCallback onSave,
    required VoidCallback onCancel,
  }) {
    return Align(
      alignment: Alignment.centerRight,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isEditing)
            TextButton(
              onPressed: isSaving ? null : onCancel,
              child: const Text('キャンセル'),
            ),
          ElevatedButton(
            onPressed: isSaving || (!isEditing && !canEdit)
                ? null
                : (isEditing ? onSave : onEdit),
            child: Text(isEditing ? '保存' : '編集'),
          ),
        ],
      ),
    );
  }

  Map<String, dynamic> _buildBusinessHoursStylesPayload() {
    final payload = <String, dynamic>{};
    for (final styleId in kBusinessHoursStyleIds) {
      final style = _businessHoursStyles[styleId]!;
      payload[styleId] = {
        'styleId': styleId,
        'openMinute': style['openMinute'],
        'closeMinute': style['closeMinute'],
        'isClosed': style['isClosed'],
      };
    }
    return payload;
  }

  Map<String, dynamic> _buildRequiredStaffPayload() {
    final byStyle = <String, dynamic>{};
    for (final styleId in kBusinessHoursStyleIds) {
      byStyle[styleId] = _requiredStaffByStyle[styleId] ?? [];
    }
    return {
      'version': 2,
      'byStyle': byStyle,
    };
  }

  Future<void> _saveBusinessHoursStyles() async {
    setState(() => _isSavingStyles = true);
    try {
      await _repository.saveBusinessHoursStyles(
        businessHoursStyles: _buildBusinessHoursStylesPayload(),
      );
      if (!mounted) return;
      setState(() {
        _isEditingBusinessHours = false;
        _businessHoursStylesSnapshot = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('営業スタイルを保存しました'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(kRequiredStaffSaveFailedMessage),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSavingStyles = false);
    }
  }

  Future<void> _saveRequiredStaff() async {
    final validationError = validateRequiredStaffByStyle(_requiredStaffByStyle);
    if (validationError != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(validationError), backgroundColor: Colors.orange),
      );
      return;
    }

    setState(() => _isSavingRequiredStaff = true);
    try {
      await _repository.saveRequiredStaffByTimeSlot(
        requiredStaffByTimeSlot: _buildRequiredStaffPayload(),
      );
      if (!mounted) return;
      setState(() {
        _isEditingRequiredStaff = false;
        _requiredStaffByStyleSnapshot = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('必要人数設定を保存しました'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(kRequiredStaffSaveFailedMessage),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSavingRequiredStaff = false);
    }
  }

  void _updateBusinessHoursStyle(
    String styleId, {
    int? openHour,
    int? closeHour,
  }) {
    setState(() {
      final style = _businessHoursStyles[styleId]!;
      if (openHour != null) {
        style['openMinute'] = openHour * 60;
        final closeMinute = style['closeMinute'] as int;
        if (closeMinute <= openHour * 60) {
          final nextCloseHours = endHourOptionsForStart(openHour);
          style['closeMinute'] =
              (nextCloseHours.isNotEmpty ? nextCloseHours.first : openHour + 1) *
                  60;
        }
      }
      if (closeHour != null) {
        style['closeMinute'] = closeHour * 60;
      }
    });
  }

  Widget _buildBusinessHoursStyleEditRow(
    String styleId,
    Map<String, dynamic> style,
  ) {
    final openMinute = style['openMinute'] as int;
    final closeMinute = style['closeMinute'] as int;
    final openHour = openMinute ~/ 60;
    final closeHour = closeMinute ~/ 60;
    final closeHourOptions = endHourOptionsForStart(openHour);

    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: _hourDropdown(
              label: '開始',
              value: openHour,
              options: kRequiredStaffHourOptions,
              onChanged: !_isEditingBusinessHours || _isSavingStyles
                  ? null
                  : (value) {
                      if (value != null) {
                        _updateBusinessHoursStyle(styleId, openHour: value);
                      }
                    },
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 16, left: 4, right: 4),
            child: Text('—'),
          ),
          Expanded(
            flex: 2,
            child: _hourDropdown(
              label: '終了',
              value: closeHour,
              options: closeHourOptions,
              onChanged: !_isEditingBusinessHours || _isSavingStyles
                  ? null
                  : (value) {
                      if (value != null) {
                        _updateBusinessHoursStyle(styleId, closeHour: value);
                      }
                    },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBusinessHoursSection() {
    final docStatus = BusinessStylesService.instance.docStatus;
    final isDocReady = docStatus == BusinessStylesDocStatus.ready;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '営業スタイル設定',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            if (!isDocReady)
              const Text(
                '営業スタイル設定未完了（管理者画面から storeMeta 初期セットアップを実行してください）',
                style: TextStyle(color: Colors.orange),
              )
            else
              const Text(
                '各営業スタイルの営業時間を設定します。営業日編集で選択したスタイルに反映されます。',
                style: TextStyle(fontSize: 13, color: Colors.grey),
              ),
            const SizedBox(height: 16),
            ...kBusinessHoursStyleIds.where((id) => id != 'closed').map((styleId) {
              final style = _businessHoursStyles[styleId];
              if (style == null) {
                return const SizedBox.shrink();
              }
              final openMinute = style['openMinute'] as int;
              final closeMinute = style['closeMinute'] as int;

              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      businessHoursStyleLabel(styleId),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    if (_isEditingBusinessHours)
                      _buildBusinessHoursStyleEditRow(styleId, style)
                    else
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          '${formatMinutes(openMinute)} 〜 ${formatMinutes(closeMinute)}',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[700],
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }),
            _sectionActionButtons(
              isEditing: _isEditingBusinessHours,
              isSaving: _isSavingStyles,
              canEdit: isDocReady,
              onEdit: _startEditingBusinessHours,
              onSave: _saveBusinessHoursStyles,
              onCancel: _cancelEditingBusinessHours,
            ),
          ],
        ),
      ),
    );
  }

  void _addRequiredStaffSlot(String styleId) {
    setState(() {
      _requiredStaffByStyle[styleId] = <Map<String, int>>[
        ...(_requiredStaffByStyle[styleId] ?? <Map<String, int>>[]),
        {'startHour': 18, 'endHour': 22, 'requiredCount': 2},
      ];
    });
  }

  void _updateRequiredStaffSlot(
    String styleId,
    int index,
    String field,
    int value,
  ) {
    setState(() {
      final list = <Map<String, int>>[
        ...(_requiredStaffByStyle[styleId] ?? <Map<String, int>>[]),
      ];
      final updated = Map<String, int>.from(list[index]);
      updated[field] = value;

      if (field == 'startHour' &&
          updated['endHour'] != null &&
          updated['endHour']! <= value) {
        final nextEnd = endHourOptionsForStart(value);
        updated['endHour'] = nextEnd.isNotEmpty ? nextEnd.first : value + 1;
      }

      list[index] = updated;
      _requiredStaffByStyle[styleId] = list;
    });
  }

  Widget _hourDropdown({
    required String label,
    required int value,
    required List<int> options,
    ValueChanged<int?>? onChanged,
  }) {
    final effectiveValue = options.contains(value) ? value : options.first;

    return DropdownButtonFormField<int>(
      value: effectiveValue,
      decoration: InputDecoration(
        labelText: label,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        border: const OutlineInputBorder(),
      ),
      items: options
          .map(
            (hour) => DropdownMenuItem(
              value: hour,
              child: Text('$hour:00'),
            ),
          )
          .toList(),
      onChanged: onChanged,
    );
  }

  Widget _buildRequiredStaffSlotRowView(Map<String, int> slot) {
    final startHour = slot['startHour'] ?? 0;
    final endHour = slot['endHour'] ?? 0;
    final requiredCount = slot['requiredCount'] ?? 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Text(
        '$startHour:00 〜 $endHour:00 / 必要${requiredCount}人',
        style: TextStyle(fontSize: 14, color: Colors.grey[700]),
      ),
    );
  }

  Widget _buildRequiredStaffSlotRow(
    String styleId,
    int index,
    Map<String, int> slot,
  ) {
    final startHour = slot['startHour'] ?? 18;
    final endHour = slot['endHour'] ?? 22;
    final requiredCount = slot['requiredCount'] ?? 2;
    final endOptions = endHourOptionsForStart(startHour);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: _hourDropdown(
              label: '開始',
              value: startHour,
              options: kRequiredStaffHourOptions,
              onChanged: !_isEditingRequiredStaff || _isSavingRequiredStaff
                  ? null
                  : (value) {
                      if (value != null) {
                        _updateRequiredStaffSlot(
                          styleId,
                          index,
                          'startHour',
                          value,
                        );
                      }
                    },
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 16, left: 4, right: 4),
            child: Text('—'),
          ),
          Expanded(
            flex: 2,
            child: _hourDropdown(
              label: '終了',
              value: endHour,
              options: endOptions,
              onChanged: !_isEditingRequiredStaff || _isSavingRequiredStaff
                  ? null
                  : (value) {
                      if (value != null) {
                        _updateRequiredStaffSlot(
                          styleId,
                          index,
                          'endHour',
                          value,
                        );
                      }
                    },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 2,
            child: DropdownButtonFormField<int>(
              value: kRequiredStaffCountOptions.contains(requiredCount)
                  ? requiredCount
                  : kRequiredStaffCountOptions.first,
              decoration: const InputDecoration(
                labelText: '必要人数',
                isDense: true,
                contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                border: OutlineInputBorder(),
              ),
              items: kRequiredStaffCountOptions
                  .map(
                    (count) => DropdownMenuItem(
                      value: count,
                      child: Text('$count人'),
                    ),
                  )
                  .toList(),
              onChanged: !_isEditingRequiredStaff || _isSavingRequiredStaff
                  ? null
                  : (value) {
                      if (value != null) {
                        _updateRequiredStaffSlot(
                          styleId,
                          index,
                          'requiredCount',
                          value,
                        );
                      }
                    },
            ),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: '削除',
            onPressed: !_isEditingRequiredStaff || _isSavingRequiredStaff
                ? null
                : () => _removeRequiredStaffSlot(styleId, index),
          ),
        ],
      ),
    );
  }

  void _removeRequiredStaffSlot(String styleId, int index) {
    setState(() {
      final list = <Map<String, int>>[
        ...(_requiredStaffByStyle[styleId] ?? <Map<String, int>>[]),
      ];
      list.removeAt(index);
      _requiredStaffByStyle[styleId] = list;
    });
  }

  Widget _buildRequiredStaffSection() {
    final docStatus = RequiredStaffByTimeSlotService.instance.docStatus;
    final isDocReady = docStatus == RequiredStaffDocStatus.ready;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '必要人数設定',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            if (docStatus == RequiredStaffDocStatus.docMissing ||
                docStatus == RequiredStaffDocStatus.invalidFormat)
              const Text(
                '必要人数設定未完了（管理者画面から storeMeta 初期セットアップを実行してください）',
                style: TextStyle(color: Colors.orange),
              )
            else if (docStatus == RequiredStaffDocStatus.readError)
              const Text(
                '必要人数設定の取得に失敗しました。\n現在は必要人数による不足判定を行っていません。',
                style: TextStyle(color: Colors.red),
              )
            else
              const Text(
                '営業スタイルごとにスタッフの必要人数を設定します。設定のない場合は、そのスタイルでは必要人数判定を行いません。',
                style: TextStyle(fontSize: 13, color: Colors.grey),
              ),
            const SizedBox(height: 16),
            ...kBusinessHoursStyleIds.where((id) => id != 'closed').map((styleId) {
              final slots = _requiredStaffByStyle[styleId] ?? [];
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      businessHoursStyleLabel(styleId),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    if (slots.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 4),
                        child: Text(
                          '判定しない（空配列）',
                          style: TextStyle(fontSize: 13, color: Colors.grey),
                        ),
                      )
                    else if (_isEditingRequiredStaff)
                      ...slots.asMap().entries.map(
                        (entry) => _buildRequiredStaffSlotRow(
                          styleId,
                          entry.key,
                          entry.value,
                        ),
                      )
                    else
                      ...slots.map(_buildRequiredStaffSlotRowView),
                    if (_isEditingRequiredStaff)
                      TextButton.icon(
                        onPressed: _isSavingRequiredStaff
                            ? null
                            : () => _addRequiredStaffSlot(styleId),
                        icon: const Icon(Icons.add),
                        label: const Text('時間帯を追加'),
                      ),
                  ],
                ),
              );
            }),
            _sectionActionButtons(
              isEditing: _isEditingRequiredStaff,
              isSaving: _isSavingRequiredStaff,
              canEdit: isDocReady,
              onEdit: _startEditingRequiredStaff,
              onSave: _saveRequiredStaff,
              onCancel: _cancelEditingRequiredStaff,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isSaving = _isSavingStyles || _isSavingRequiredStaff;

    return PopScope(
      canPop: !isSaving,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('営業スタイル・必要人数設定'),
          backgroundColor: Colors.blue,
          foregroundColor: Colors.white,
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : Stack(
                children: [
                  ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildBusinessHoursSection(),
                      const SizedBox(height: 16),
                      _buildRequiredStaffSection(),
                    ],
                  ),
                  if (isSaving)
                    Container(
                      color: Colors.black26,
                      child: const Center(child: CircularProgressIndicator()),
                    ),
                ],
              ),
      ),
    );
  }
}
