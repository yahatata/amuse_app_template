import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/device_service.dart';
import '../services/device_callable_errors.dart';
import '../models/device.dart';
import '../services/device_options.dart';
import 'device_management_action_visibility.dart';
/// 卓情報の簡易モデル
class _TableItem {
  final String id;
  final String name;
  const _TableItem({required this.id, required this.name});
}

/// デバイス管理画面（管理者用）
///
/// role 変更 UI は他端末向けに表示する（自分自身は非表示）。
/// 最後の active admin 保護は Functions 側が正本。
class DeviceManagementPage extends StatefulWidget {
  const DeviceManagementPage({super.key});

  @override
  State<DeviceManagementPage> createState() => _DeviceManagementPageState();
}

class _DeviceManagementPageState extends State<DeviceManagementPage> {
  final DeviceService _deviceService = DeviceService();
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  List<Device> _devices = [];
  bool _isLoading = true;
  /// オプション編集の保存〜一覧再取得まで（changeSpec 型の全体ロック）
  bool _isSavingOptions = false;
  /// ブロック / 復帰 / 削除（アーカイブ）の CF 実行〜一覧再取得まで
  bool _isMutatingDevice = false;
  String? _error;
  /// 現在操作しているデバイスID（この画面を開いている端末）
  String? _currentDeviceId;
  late final ScrollController _deviceListScrollController;

  @override
  void initState() {
    super.initState();
    _deviceListScrollController = ScrollController();
    _loadCurrentDeviceId();
    _loadDevices();
  }

  @override
  void dispose() {
    _deviceListScrollController.dispose();
    super.dispose();
  }

  Future<void> _loadCurrentDeviceId() async {
    final device = await _deviceService.getCurrentDevice();
    if (mounted) {
      setState(() => _currentDeviceId = device?.id);
    }
  }

  Future<void> _loadDevices() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final devices = await _deviceService.getDevices();
      if (_currentDeviceId == null) {
        await _loadCurrentDeviceId();
      }
      if (!mounted) return;
      setState(() {
        _devices = devices;
        _isLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = kDeviceListLoadFailedMessage;
        _isLoading = false;
      });
    }
  }

  bool get _isPageLocked => _isSavingOptions || _isMutatingDevice;

  Future<void> _updateDeviceStatus(Device device, String status) async {
    setState(() => _isMutatingDevice = true);
    String? successMessage;
    String? errorMessage;
    try {
      await _deviceService.updateDeviceStatus(device.id, status);
      await _loadDevices();
      successMessage = 'デバイス「${device.name}」のステータスを更新しました';
    } catch (e) {
      errorMessage = mapDeviceCallableError(e, operation: 'updateDeviceStatus');
    } finally {
      if (mounted) {
        setState(() => _isMutatingDevice = false);
      }
    }
    if (!mounted) return;
    if (successMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(successMessage),
          backgroundColor: Colors.green,
        ),
      );
    } else if (errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMessage),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _updateDeviceRole(Device device, String newRole) async {
    if (newRole == device.role) return;

    setState(() => _isMutatingDevice = true);
    String? successMessage;
    String? errorMessage;
    try {
      await _deviceService.updateDeviceRoleByAdmin(
        targetDeviceId: device.id,
        role: newRole,
      );
      await _loadDevices();
      successMessage = 'roleを$newRoleに変更しました';
    } catch (e) {
      errorMessage = mapDeviceCallableError(e, operation: 'updateDeviceRole');
    } finally {
      if (mounted) {
        setState(() => _isMutatingDevice = false);
      }
    }
    if (!mounted) return;
    if (successMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(successMessage),
          backgroundColor: Colors.green,
        ),
      );
    } else if (errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMessage),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _deleteDevice(Device device) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('デバイス削除'),
        content: Text('デバイス「${device.name}」を削除しますか？\nこの操作は取り消せません。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('削除'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      setState(() => _isMutatingDevice = true);
      String? successMessage;
      String? errorMessage;
      try {
        await _deviceService.archiveDevice(device.id);
        await _loadDevices();
        successMessage = 'デバイス「${device.name}」を削除しました';
      } catch (e) {
        errorMessage = mapDeviceCallableError(e, operation: 'archiveDevice');
      } finally {
        if (mounted) {
          setState(() => _isMutatingDevice = false);
        }
      }
      if (!mounted) return;
      if (successMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(successMessage),
            backgroundColor: Colors.green,
          ),
        );
      } else if (errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// 卓一覧を取得（逆用途に指定された卓を除外）
  Future<List<_TableItem>> _getAvailableTablesForOption(
      String optionKey,
      String currentDeviceId,
      ) async {
    try {
      // 1. tables コレクションから有効な卓を取得
      final tablesSnap = await _firestore
          .collection('tables')
          .where('isEnabled', isEqualTo: true)
          .get();

      // 2. 全デバイスの optionParams を取得
      final devicesSnap = await _firestore.collection('devices').get();

      // 3. 逆用途に指定されている卓IDを収集
      final excludedTableIds = <String>{};
      final oppositeKey = optionKey == DeviceOptionKeys.tournamentTable
          ? DeviceOptionKeys.sideGame
          : DeviceOptionKeys.tournamentTable;

      for (final doc in devicesSnap.docs) {
        final status = doc.data()['status'] as String? ?? 'active';
        if (!DeviceStatus.fromString(status).isVisibleInManagementList) {
          continue;
        }
        // 自分自身は除外対象外
        if (doc.id == currentDeviceId) continue;
        final params = doc.data()['optionParams'] as Map<String, dynamic>?;
        final tableId = params?[oppositeKey]?['tableId'] as String?;
        if (tableId != null) {
          excludedTableIds.add(tableId);
        }
      }

      // 4. 除外してリスト返却
      return tablesSnap.docs
          .where((doc) => !excludedTableIds.contains(doc.id))
          .map((doc) {
        final data = doc.data();
        return _TableItem(
          id: doc.id,
          name: data['name'] as String? ?? doc.id,
        );
      })
          .toList();
    } catch (e) {
      print('卓一覧取得エラー');
      rethrow;
    }
  }

  Future<List<_TableItem>> _getEnabledTables() async {
    try {
      final tablesSnap = await _firestore
          .collection('tables')
          .where('isEnabled', isEqualTo: true)
          .get();
      return tablesSnap.docs
          .map((doc) {
            final data = doc.data();
            return _TableItem(
              id: doc.id,
              name: data['name'] as String? ?? doc.id,
            );
          })
          .toList();
    } catch (e) {
      debugPrint('卓一覧取得エラー(table)');
      rethrow;
    }
  }

  Future<void> _editTableDeviceBinding(Device device) async {
    String? selectedTableId =
        device.getTableIdForOption(DeviceOptionKeys.tableDeviceTable);
    late final List<_TableItem> tables;
    try {
      tables = await _getEnabledTables();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(kDeviceListLoadFailedMessage)),
      );
      return;
    }

    final result = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text('卓紐付け: ${device.name}'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'role: table の端末に対して担当卓を設定します。',
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String?>(
                  value: selectedTableId,
                  decoration: const InputDecoration(
                    labelText: '卓',
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    const DropdownMenuItem<String?>(
                      value: null,
                      child: Text('未設定'),
                    ),
                    ...tables.map(
                      (table) => DropdownMenuItem<String?>(
                        value: table.id,
                        child: Text(table.name),
                      ),
                    ),
                  ],
                  onChanged: (value) {
                    setState(() {
                      selectedTableId = value;
                    });
                  },
                ),
                const SizedBox(height: 12),
                const Text(
                  '同一卓に複数の table 端末を紐付けることを許容します。',
                  style: TextStyle(color: Colors.grey),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('キャンセル'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('保存'),
              ),
            ],
          );
        },
      ),
    );

    if (result != true) return;

    setState(() => _isSavingOptions = true);
    try {
      await _deviceService.updateDeviceOptions(
        targetDeviceId: device.id,
        options: const <String, bool>{},
        optionParams: selectedTableId == null
            ? const <String, Map<String, dynamic>>{}
            : <String, Map<String, dynamic>>{
                DeviceOptionKeys.tableDeviceTable: {
                  'tableId': selectedTableId,
                },
              },
      );
      await _loadDevices();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('卓紐付けを更新しました'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapDeviceCallableError(e, operation: 'updateDeviceOptions'),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSavingOptions = false);
      }
    }
  }

  Future<void> _editOptions(Device device) async {
    final presetKeys = DeviceOptionKeys.all;
    // 現在のオプションを編集用にコピー
    final Map<String, bool> working = {...device.options};
    // optionParams も編集用にコピー
    final Map<String, Map<String, dynamic>> workingParams = {
      for (final entry in device.optionParams.entries)
        entry.key: Map<String, dynamic>.from(entry.value),
    };

    // 卓紐づけ可能なオプション用の選択状態
    final Map<String, String?> selectedTableIds = {};
    for (final key in DeviceOptionKeys.tableBindableOptions) {
      selectedTableIds[key] = workingParams[key]?['tableId'] as String?;
    }

    // 卓一覧のキャッシュ
    final Map<String, List<_TableItem>> tableCache = {};
    final optionsScrollController = ScrollController();

    bool? result;
    try {
      result = await showDialog<bool>(
        context: context,
        builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          // 排他制御: 選択時に排他グループの他のオプションをOFFにする
          void handleOptionChange(String key, bool? value) {
            setState(() {
              working[key] = value == true;
              if (value == true) {
                // 排他グループの他のオプションをOFF
                for (final exclusiveKey in DeviceOptionKeys.getExclusiveKeys(key)) {
                  working[exclusiveKey] = false;
                  // 排他されたオプションの卓紐づけもクリア
                  if (DeviceOptionKeys.isTableBindable(exclusiveKey)) {
                    selectedTableIds[exclusiveKey] = null;
                    workingParams.remove(exclusiveKey);
                  }
                }
              }
              // OFFにした場合は卓紐づけもクリア
              if (value != true && DeviceOptionKeys.isTableBindable(key)) {
                selectedTableIds[key] = null;
                workingParams.remove(key);
              }
            });
          }

          return AlertDialog(
            title: Text('オプション編集: ${device.name}'),
            content: SizedBox(
              width: double.maxFinite,
              child: Scrollbar(
                controller: optionsScrollController,
                thumbVisibility: true,
                child: SingleChildScrollView(
                  controller: optionsScrollController,
                  child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'プリセット',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  ...presetKeys.map((key) {
                    final value = working[key] == true;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        CheckboxListTile(
                          value: value,
                          onChanged: (v) => handleOptionChange(key, v),
                          title: Text(DeviceOptionKeys.label(key)),
                          secondary: IconButton(
                            icon: const Icon(Icons.info_outline, color: Colors.blueAccent),
                            tooltip: '説明を表示',
                            onPressed: () {
                              showDialog<void>(
                                context: context,
                                builder: (ctx) => AlertDialog(
                                  title: Text(DeviceOptionKeys.label(key)),
                                  content: Text(DeviceOptionKeys.description(key)),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.of(ctx).pop(),
                                      child: const Text('OK'),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                        ),
                        // 卓紐づけUI（有効かつ卓紐づけ可能な場合のみ表示）
                        if (value && DeviceOptionKeys.isTableBindable(key))
                          Padding(
                            padding: const EdgeInsets.only(left: 48, bottom: 8),
                            child: FutureBuilder<List<_TableItem>>(
                              future: tableCache.containsKey(key)
                                  ? Future.value(tableCache[key])
                                  : _getAvailableTablesForOption(key, device.id).then((tables) {
                                tableCache[key] = tables;
                                return tables;
                              }),
                              builder: (context, snapshot) {
                                if (snapshot.connectionState == ConnectionState.waiting) {
                                  return const SizedBox(
                                    height: 48,
                                    child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                                  );
                                }
                                if (snapshot.hasError) {
                                  return const Padding(
                                    padding: EdgeInsets.symmetric(vertical: 8),
                                    child: Text(
                                      kDeviceListLoadFailedMessage,
                                      style: TextStyle(color: Colors.red, fontSize: 12),
                                    ),
                                  );
                                }
                                final tables = snapshot.data ?? [];
                                return DropdownButtonFormField<String?>(
                                  value: selectedTableIds[key],
                                  decoration: const InputDecoration(
                                    labelText: '卓を指定（任意）',
                                    border: OutlineInputBorder(),
                                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  ),
                                  items: [
                                    const DropdownMenuItem<String?>(
                                      value: null,
                                      child: Text('指定なし（全卓操作可）'),
                                    ),
                                    ...tables.map((t) => DropdownMenuItem<String?>(
                                      value: t.id,
                                      child: Text(t.name),
                                    )),
                                  ],
                                  onChanged: (tableId) {
                                    setState(() {
                                      selectedTableIds[key] = tableId;
                                      if (tableId != null) {
                                        workingParams[key] = {'tableId': tableId};
                                      } else {
                                        workingParams.remove(key);
                                      }
                                    });
                                  },
                                );
                              },
                            ),
                          ),
                      ],
                    );
                  }),
                  const SizedBox(height: 12),
                ],
                  ),
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('キャンセル'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('保存'),
              ),
            ],
          );
        },
      ),
    );
    } finally {
      optionsScrollController.dispose();
    }

    if (result == true) {
      setState(() => _isSavingOptions = true);
      try {
        // プリセットのみを送信（全置換）
        final Map<String, bool> presetOnly = {
          for (final key in presetKeys) key: (working[key] == true)
        };
        // optionParams を構築
        final Map<String, Map<String, dynamic>> finalParams = {};
        for (final key in DeviceOptionKeys.tableBindableOptions) {
          if (presetOnly[key] == true && selectedTableIds[key] != null) {
            finalParams[key] = {'tableId': selectedTableIds[key]};
          }
        }
        await _deviceService.updateDeviceOptions(
          targetDeviceId: device.id,
          options: presetOnly,
          optionParams: finalParams,
        );
        await _loadDevices();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('オプションを更新しました'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                mapDeviceCallableError(e, operation: 'updateDeviceOptions'),
              ),
              backgroundColor: Colors.red,
            ),
          );
        }
      } finally {
        if (mounted) {
          setState(() => _isSavingOptions = false);
        }
      }
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'active':
        return Colors.green;
      case 'blocked':
        return Colors.red;
      case 'archived':
      case 'retired':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'active':
        return 'アクティブ';
      case 'blocked':
        return 'ブロック';
      case 'archived':
        return '削除済み';
      case 'retired':
        return '削除済み';
      default:
        return status;
    }
  }

  Color _getRoleColor(String role) {
    switch (role) {
      case 'admin':
        return Colors.purple;
      case 'terminal':
        return Colors.blue;
      case 'table':
        return Colors.teal;
      default:
        return Colors.grey;
    }
  }

  IconData _getRoleIcon(String role) {
    switch (role) {
      case 'admin':
        return Icons.admin_panel_settings;
      case 'terminal':
        return Icons.terminal;
      case 'table':
        return Icons.table_restaurant;
      default:
        return Icons.devices_other;
    }
  }

  String _getRoleText(String role) {
    switch (role) {
      case 'admin':
        return '管理者';
      case 'terminal':
        return 'ターミナル';
      case 'table':
        return '卓専用端末';
      default:
        return role;
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isPageLocked,
      child: Stack(
        children: [
          Scaffold(
            appBar: AppBar(
              title: const Text('デバイス管理'),
              backgroundColor: Colors.blue[700],
              foregroundColor: Colors.white,
              actions: [
                IconButton(
                  icon: const Icon(Icons.refresh),
                  onPressed: _isPageLocked ? null : _loadDevices,
                  tooltip: '更新',
                ),
              ],
            ),
            body: _buildBody(),
          ),
          if (_isPageLocked)
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
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('デバイス一覧を読み込み中...'),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red[400],
            ),
            const SizedBox(height: 16),
            Text(
              'エラーが発生しました',
              style: TextStyle(
                fontSize: 18,
                color: Colors.red[600],
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(color: Colors.red[600]),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadDevices,
              child: const Text('再試行'),
            ),
          ],
        ),
      );
    }

    if (_devices.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.devices_other,
              size: 64,
              color: Colors.grey,
            ),
            SizedBox(height: 16),
            Text(
              '登録されたデバイスがありません',
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey,
              ),
            ),
          ],
        ),
      );
    }

    return Scrollbar(
      controller: _deviceListScrollController,
      thumbVisibility: true,
      child: ListView.builder(
        controller: _deviceListScrollController,
        padding: const EdgeInsets.all(16),
        itemCount: _devices.length,
        itemBuilder: (context, index) {
        final device = _devices[index];
        final isCurrentDevice = _currentDeviceId != null && device.id == _currentDeviceId;
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          elevation: 2,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 現在操作中のデバイス表示
                if (isCurrentDevice)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Icon(Icons.check_circle, color: Colors.green[700], size: 20),
                        const SizedBox(width: 6),
                        Text(
                          '現在操作中のデバイス',
                          style: TextStyle(
                            color: Colors.green[700],
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                // デバイス名とステータス
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        device.name,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _getStatusColor(device.status).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: _getStatusColor(device.status).withValues(alpha: 0.3),
                        ),
                      ),
                      child: Text(
                        _getStatusText(device.status),
                        style: TextStyle(
                          color: _getStatusColor(device.status),
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // 役割
                Row(
                  children: [
                    Icon(
                      _getRoleIcon(device.role),
                      size: 16,
                      color: _getRoleColor(device.role),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _getRoleText(device.role),
                      style: TextStyle(
                        color: _getRoleColor(device.role),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                // role変更（自分自身は変更不可。最後のadmin判定はFunctions側）
                if (!isCurrentDevice)
                  Row(
                    children: [
                      const Text('role変更: ', style: TextStyle(fontSize: 12)),
                      DropdownButton<String>(
                        value: device.role,
                        items: const [
                          DropdownMenuItem(value: 'admin', child: Text('admin')),
                          DropdownMenuItem(value: 'terminal', child: Text('terminal')),
                          DropdownMenuItem(value: 'table', child: Text('table')),
                        ],
                        onChanged: _isPageLocked
                            ? null
                            : (String? newRole) {
                                if (newRole == null) return;
                                _updateDeviceRole(device, newRole);
                              },
                      ),
                    ],
                  ),
                const SizedBox(height: 4),

                // プラットフォーム
                Text(
                  'プラットフォーム: ${device.platform}',
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 4),

                // 作成日時
                Text(
                  '登録日: ${device.createdAt.toString().split(' ')[0]}',
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 12),

                // アクションボタン
                Row(
                  children: [
                    if (device.status == 'active' && !isCurrentDevice) ...[
                      ElevatedButton(
                        onPressed: () => _updateDeviceStatus(device, 'blocked'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('ブロック'),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (device.status == 'blocked' && !isCurrentDevice) ...[
                      ElevatedButton(
                        onPressed: () => _updateDeviceStatus(device, 'active'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('アクティブに戻す'),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (!isCurrentDevice)
                      IconButton(
                        onPressed: () => _deleteDevice(device),
                        icon: const Icon(Icons.delete),
                        color: Colors.red,
                        tooltip: '削除',
                      ),
                    const Spacer(),
                    if (shouldShowTableBindingEditButton(device.role))
                      OutlinedButton.icon(
                        onPressed: () => _editTableDeviceBinding(device),
                        icon: const Icon(Icons.link),
                        label: const Text('卓紐付け編集'),
                      )
                    else if (shouldShowOptionsEditButton(device.role))
                      OutlinedButton.icon(
                        onPressed: () => _editOptions(device),
                        icon: const Icon(Icons.tune),
                        label: const Text('オプション編集'),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                if (device.options.isNotEmpty) ...[
                  const Text(
                    '付与済みオプション',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: device.options.entries
                        .where((e) => e.value == true && DeviceOptionKeys.all.contains(e.key))
                        .map((e) {
                      // 卓紐づけがある場合は表示
                      final tableId = device.getTableIdForOption(e.key);
                      final label = tableId != null
                          ? '${DeviceOptionKeys.label(e.key)} ($tableId)'
                          : DeviceOptionKeys.label(e.key);
                      return Chip(label: Text(label));
                    })
                        .toList(),
                  ),
                ],
                if (device.role == 'table') ...[
                  const SizedBox(height: 8),
                  const Text(
                    '卓紐付け',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    device.getTableIdForOption(DeviceOptionKeys.tableDeviceTable) ??
                        '未設定',
                    style: TextStyle(
                      color: device.getTableIdForOption(
                                DeviceOptionKeys.tableDeviceTable,
                              ) !=
                              null
                          ? Colors.black87
                          : Colors.orange.shade700,
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
      ),
    );
  }
}
