import 'package:amuse_app_template/Home/close_pre_confirmation_page.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/Home/unclocked_attendance_list_page.dart';
import 'package:amuse_app_template/Home/stayingUsersListPage.dart';
import 'package:amuse_app_template/AttendanceManagement/staff_attendance_page_from_terminalHome.dart';
import 'package:amuse_app_template/OrderView/MenuView/categorySelectPage.dart';
import 'package:amuse_app_template/OrderView/MenuView/menuEditorListPage.dart';
import 'package:amuse_app_template/UserRegisterView/createUserAccountPage.dart';
import 'package:amuse_app_template/UserLogin/userCheckInPage.dart';
import 'package:amuse_app_template/tournament/scheduling/pages/scheduled_tournament_list_page.dart';
import 'package:amuse_app_template/Home/systemSettingsPage.dart';
import 'package:amuse_app_template/tournament/scheduling/pages/tournament_creation_menu_page.dart';
import 'package:amuse_app_template/Accounting/accountingPage.dart';
import 'package:amuse_app_template/Accounting/unsettledAccountingPage.dart';
import 'package:amuse_app_template/Accounting/payment_split_test_page.dart';
import 'package:amuse_app_template/Accounting/postAccountingAdjustmentsPage.dart';
import 'package:amuse_app_template/sideGame/pages/side_game_table_list.dart';
import 'package:amuse_app_template/OrderView/OrderManagement/order_management_page.dart';
import 'package:amuse_app_template/dashboard/home/dashboard_home_page.dart';
import 'package:amuse_app_template/Utils/firestore_size_page.dart';
import 'package:amuse_app_template/Home/table_home_page.dart';
import 'package:amuse_app_template/tournament/active/pages/blind_timer_tournament_select_page.dart';
import 'package:flutter/material.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/device_options.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';
import 'package:amuse_app_template/utils/store_strong_warning_ui.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'dart:async';

class terminalHomePage extends StatefulWidget {
  const terminalHomePage({super.key});

  @override
  State<terminalHomePage> createState() => _terminalHomePageState();
}

class _terminalHomePageState extends State<terminalHomePage> {
  final DeviceService _deviceService = DeviceService();
  bool _loadingDevice = true;
  bool _isAdminDevice = false;
  Map<String, bool> _deviceOptions = const {};
  bool _isAdjustingOpenBusinessDate = false;

  @override
  void initState() {
    super.initState();
    _initDevice();
  }

  Future<void> _initDevice() async {
    final device = await _deviceService.getCurrentDevice();
    if (!mounted) return;
    setState(() {
      _loadingDevice = false;
      _isAdminDevice = (device?.role == 'admin');
      _deviceOptions = device?.options ?? const {};
    });
  }

  /// 日付／営業状態を横長楕円の枠で囲み、開閉店可能時はタップでダイアログを開くボタンにする
  /// [allowTapForNonStore] true のときは開閉店権限がなくてもタップ可能（例: 閉店中「開店処理が必要です」のアナウンス用）
  Widget _wrapDateChip(
    BuildContext context,
    Widget child, {
    VoidCallback? onPressed,
    bool allowTapForNonStore = false,
  }) {
    final canManageStore =
        _isAdminDevice ||
        _deviceOptions[DeviceOptionKeys.storeManagement] == true;
    final wrapper = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 1),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey),
        borderRadius: BorderRadius.circular(999),
      ),
      child: child,
    );
    final useInkWell =
        onPressed != null && (canManageStore || allowTapForNonStore);
    if (useInkWell) {
      return Padding(
        padding: const EdgeInsets.only(right: 4),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onPressed,
            borderRadius: BorderRadius.circular(999),
            child: wrapper,
          ),
        ),
      );
    }
    return Padding(padding: const EdgeInsets.only(right: 4), child: wrapper);
  }

  /// AppBar用: storeMeta の営業状態を表示するウィジェット（Phase6 Step1）
  /// 日付は横長楕円の枠で囲み、開閉店管理可能時はタップで開閉店管理ダイアログを開く
  Widget _buildStoreStatusAction(BuildContext context) {
    return StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return _wrapDateChip(
            context,
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        }
        if (snapshot.hasError) {
          return _wrapDateChip(
            context,
            const Icon(Icons.error, color: Colors.red, size: 20),
            onPressed: () => _showStoreManagementDialog(context),
          );
        }
        final data = snapshot.data!;
        if (data.isUnknownStatus) {
          return _wrapDateChip(
            context,
            const Icon(Icons.help_outline, color: Colors.grey, size: 20),
            onPressed: () => _showStoreManagementDialog(context),
          );
        }
        if (data.isRunning && data.currentBusinessDateKey != null) {
          final parts = data.currentBusinessDateKey!.split('-');
          if (parts.length == 3) {
            try {
              final year = int.parse(parts[0]);
              final month = int.parse(parts[1]);
              final day = int.parse(parts[2]);
              final date = DateTime(year, month, day);
              final formatted = DateFormat('M/d(E)', 'ja_JP').format(date);
              final warningLabel = getDateWarningLabel(data);
              return _wrapDateChip(
                context,
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (warningLabel != null) ...[
                      const Icon(
                        Icons.warning_amber_rounded,
                        size: 18,
                        color: Colors.orange,
                      ),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          warningLabel,
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.orange,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 6),
                    ],
                    Center(
                      child: Text(
                        formatted,
                        style: const TextStyle(fontSize: 14),
                      ),
                    ),
                  ],
                ),
                onPressed: () => _showStoreManagementDialog(context),
              );
            } catch (_) {}
          }
        }
        if (data.isClosed) {
          final showOpenNeeded = shouldShowOpenNeeded(data);
          final canManageStore =
              _isAdminDevice ||
              _deviceOptions[DeviceOptionKeys.storeManagement] == true;
          return _wrapDateChip(
            context,
            Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (showOpenNeeded) ...[
                    const Icon(
                      Icons.error_outline,
                      color: Colors.red,
                      size: 18,
                    ),
                    const SizedBox(width: 4),
                    const Text(
                      '開店処理が必要です',
                      style: TextStyle(fontSize: 14, color: Colors.red),
                    ),
                    const SizedBox(width: 6),
                  ],
                  const Text('閉店中', style: TextStyle(fontSize: 14)),
                ],
              ),
            ),
            onPressed: () {
              if (canManageStore) {
                _showStoreManagementDialog(context);
              } else {
                _showOpenNeededAnnouncementDialog(context);
              }
            },
            allowTapForNonStore: showOpenNeeded,
          );
        }
        if (data.isError) {
          return _wrapDateChip(
            context,
            const Icon(Icons.error_outline, color: Colors.orange, size: 20),
            onPressed: () => _showLastErrorDialog(context, data.lastError),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }

  /// status === 'error' 時: lastError の内容をそのまま表示するダイアログ
  void _showLastErrorDialog(BuildContext context, LastErrorDoc? lastError) {
    final lines = <String>[];
    if (lastError == null) {
      lines.add('エラー状態です。詳細は取得できませんでした。');
    } else {
      if (lastError.code != null && lastError.code!.isNotEmpty)
        lines.add('code: ${lastError.code}');
      if (lastError.message != null && lastError.message!.isNotEmpty)
        lines.add('message: ${lastError.message}');
      if (lastError.failedStep != null && lastError.failedStep!.isNotEmpty)
        lines.add('failedStep: ${lastError.failedStep}');
      if (lastError.at != null) lines.add('at: ${lastError.at}');
      if (lastError.context != null && lastError.context!.isNotEmpty) {
        lines.add('context: ${lastError.context}');
      }
      if (lines.isEmpty) lines.add('エラー状態です。詳細は取得できませんでした。');
    }
    showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: const Text('エラー詳細'),
          content: SingleChildScrollView(
            child: SelectableText(lines.join('\n')),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('閉じる'),
            ),
          ],
        );
      },
    );
  }

  /// 開店処理が必要な旨のみ伝えるアナウンスダイアログ（開閉店権限がない端末向け）
  void _showOpenNeededAnnouncementDialog(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          title: const Text('開閉店管理'),
          content: const Text('管理者に確認してください。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('閉じる'),
            ),
          ],
        );
      },
    );
  }

  void _showAuthExpiredSnackBar() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('認証が切れています。アプリを再起動するか、再度ログインしてください。'),
        backgroundColor: Colors.orange,
      ),
    );
  }

  String _buildJstDateKeyNow() {
    final nowJst = DateTime.now().toUtc().add(const Duration(hours: 9));
    return DateFormat('yyyy-MM-dd').format(nowJst);
  }

  bool _isDateKey(String value) {
    return RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value);
  }

  DateTime? _parseDateKey(String value) {
    final parts = value.split('-');
    if (parts.length != 3) return null;
    final year = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final day = int.tryParse(parts[2]);
    if (year == null || month == null || day == null) return null;
    try {
      return DateTime(year, month, day);
    } catch (_) {
      return null;
    }
  }

  String _resolvePlannedOpenBusinessDateKey(StoreMetaData? meta) {
    final fromAssessment = meta?.openAssessment?.intendedBusinessDateKey;
    if (fromAssessment != null && _isDateKey(fromAssessment)) {
      return fromAssessment;
    }
    return _buildJstDateKeyNow();
  }

  Future<String?> _showOpenDateAdjustmentPasswordDialog(
    BuildContext context,
  ) async {
    return showDialog<String>(
      context: context,
      useRootNavigator: false,
      builder: (_) => const _OpenDateAdjustmentPasswordDialog(),
    );
  }

  Future<bool> _verifyOpenBusinessDateAdjustmentPassword(
    String password,
  ) async {
    try {
      if (FirebaseAuth.instance.currentUser == null) {
        await FirebaseAuth.instance.signInAnonymously();
      }
      final callable = FunctionsClient.instance.httpsCallable(
        'verifyOpenBusinessDateAdjustmentPassword',
      );
      await callable.call(<String, dynamic>{'password': password});
      return true;
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return false;
      ScaffoldMessenger.of(this.context).showSnackBar(
        SnackBar(
          content: Text(e.message ?? 'パスワード認証に失敗しました。'),
          backgroundColor: Colors.orange,
        ),
      );
      return false;
    } catch (e) {
      if (!mounted) return false;
      ScaffoldMessenger.of(this.context).showSnackBar(
        SnackBar(
          content: Text('パスワード認証に失敗しました。${e.toString()}'),
          backgroundColor: Colors.orange,
        ),
      );
      return false;
    }
  }

  Future<String?> _adjustOpenBusinessDateWithPassword(
    BuildContext context,
    String currentDateKey,
  ) async {
    final password = await _showOpenDateAdjustmentPasswordDialog(context);
    if (password == null || password.isEmpty) return null;

    final verified = await _verifyOpenBusinessDateAdjustmentPassword(password);
    if (!verified || !context.mounted) return null;

    final initialDate = _parseDateKey(currentDateKey) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      useRootNavigator: false,
      initialDate: initialDate,
      firstDate: DateTime(2020, 1, 1),
      lastDate: DateTime(2100, 12, 31),
      locale: const Locale('ja', 'JP'),
    );
    if (picked == null) return null;
    return DateFormat('yyyy-MM-dd').format(picked);
  }

  Future<void> _callTemporaryUnlockAlreadyRunningDifferentDateTerminal(
    BuildContext context,
  ) async {
    try {
      if (FirebaseAuth.instance.currentUser == null) {
        await FirebaseAuth.instance.signInAnonymously();
      }
      final callable = FunctionsClient.instance.httpsCallable(
        'temporaryUnlockAlreadyRunningDifferentDateTerminal',
      );
      final result = await callable.call<Map<String, dynamic>>({});
      if (!context.mounted) return;
      final data = result.data;
      final minutes = data['recheckMinutes'];
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            minutes is num
                ? '緊急一時解除を実行しました。${minutes.toInt()}分後に再評価されます。'
                : '緊急一時解除を実行しました。',
          ),
          backgroundColor: Colors.green,
        ),
      );
    } on FirebaseFunctionsException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message ?? '緊急一時解除に失敗しました。'),
          backgroundColor: Colors.orange,
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('緊急一時解除に失敗しました。${e.toString()}'),
          backgroundColor: Colors.orange,
        ),
      );
    }
  }

  /// 開閉店管理ダイアログを表示（Phase6 Step3: 開店中は閉店、閉店中は開店）
  /// ダイアログを閉じたあとでもフローを続行するため、ページの context を保持して渡す。
  void _showStoreManagementDialog(BuildContext context) {
    final pageContext = context;
    String plannedOpenBusinessDateKey = _resolvePlannedOpenBusinessDateKey(
      StoreMetaService.instance.latestData,
    );
    bool openDateAdjusted = false;

    showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return StatefulBuilder(
          builder: (_, setDialogState) {
            return AlertDialog(
              title: const Text('開閉店管理'),
              content: StreamBuilder<StoreMetaData>(
                stream: StoreMetaService.instance.stream,
                builder: (context, snapshot) {
                  if (!snapshot.hasData) {
                    return const SizedBox(
                      height: 80,
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final meta = snapshot.data!;
                  if ((meta.isClosed || meta.isError) && !openDateAdjusted) {
                    plannedOpenBusinessDateKey =
                        _resolvePlannedOpenBusinessDateKey(meta);
                  }

                  final children = <Widget>[];
                  if (meta.isError) {
                    final le = meta.lastError;
                    final lines = <String>['エラー状態です。'];
                    if (le != null) {
                      if (le.code != null && le.code!.isNotEmpty) {
                        lines.add('code: ${le.code}');
                      }
                      if (le.message != null && le.message!.isNotEmpty) {
                        lines.add('message: ${le.message}');
                      }
                      if (le.failedStep != null && le.failedStep!.isNotEmpty) {
                        lines.add('failedStep: ${le.failedStep}');
                      }
                    }
                    children.add(SelectableText(lines.join('\n')));
                    children.add(const SizedBox(height: 12));
                  }

                  final strong = getTopStrongWarning(meta);
                  if (strong != null) {
                    children.add(
                      Text(
                        strong.message,
                        style: const TextStyle(fontSize: 13),
                      ),
                    );
                    children.add(const SizedBox(height: 12));
                  }
                  final weak = getNextDayStartedWeakWarning(meta);
                  if (weak != null) {
                    children.add(
                      Text(weak.message, style: const TextStyle(fontSize: 13)),
                    );
                    children.add(const SizedBox(height: 12));
                  }

                  if (meta.isRunning && meta.currentBusinessDateKey != null) {
                    children.add(
                      Text('現在の営業日: ${meta.currentBusinessDateKey}'),
                    );
                    children.add(const SizedBox(height: 8));
                    children.add(
                      Text('閉店対象営業日: ${meta.currentBusinessDateKey}'),
                    );
                    children.add(const SizedBox(height: 16));
                    children.add(
                      const Text(
                        '閉店処理を開始する場合は、未会計一覧を取得して確認後に実行します。',
                        style: TextStyle(fontSize: 12),
                      ),
                    );
                  } else if (meta.isClosed || meta.isError) {
                    final open = meta.openAssessment;
                    if (open != null && !open.suppressedByOverride) {
                      final result = open.result;
                      final intended = open.intendedBusinessDateKey ?? '';
                      if (result == 'ready_to_open') {
                        children.add(
                          Text(
                            '$intended の開店準備が整っています。',
                            style: const TextStyle(fontSize: 13),
                          ),
                        );
                        children.add(const SizedBox(height: 12));
                      } else if (result == 'needs_manual_open') {
                        children.add(
                          const Text(
                            '開店処理を手動で実行してください。',
                            style: TextStyle(fontSize: 13),
                          ),
                        );
                        children.add(const SizedBox(height: 12));
                      }
                    }
                    children.add(
                      Row(
                        children: [
                          Expanded(
                            child: Text('開店対象営業日: $plannedOpenBusinessDateKey'),
                          ),
                          TextButton(
                            onPressed: () async {
                              if (_isAdjustingOpenBusinessDate) {
                                return;
                              }
                              _isAdjustingOpenBusinessDate = true;
                              try {
                                final adjusted =
                                    await _adjustOpenBusinessDateWithPassword(
                                      dialogContext,
                                      plannedOpenBusinessDateKey,
                                    );
                                if (adjusted == null ||
                                    !dialogContext.mounted ||
                                    !mounted) {
                                  return;
                                }
                                setDialogState(() {
                                  plannedOpenBusinessDateKey = adjusted;
                                  openDateAdjusted = true;
                                });
                              } finally {
                                _isAdjustingOpenBusinessDate = false;
                              }
                            },
                            style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 0,
                              ),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                            ),
                            child: Text(
                              _isAdjustingOpenBusinessDate ? '調整中...' : '調整',
                              style: const TextStyle(fontSize: 12),
                            ),
                          ),
                        ],
                      ),
                    );
                  } else {
                    children.add(const Text('営業状態を取得できませんでした。'));
                  }

                  return SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: children,
                    ),
                  );
                },
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('キャンセル'),
                ),
                StreamBuilder<StoreMetaData>(
                  stream: StoreMetaService.instance.stream,
                  builder: (context, snapshot) {
                    if (!snapshot.hasData) return const SizedBox.shrink();
                    final meta = snapshot.data!;
                    if (meta.isRunning && meta.currentBusinessDateKey != null) {
                      return TextButton(
                        onPressed: () {
                          Navigator.of(dialogContext).pop();
                          _startCloseFlow(pageContext);
                        },
                        child: const Text(
                          '閉店処理を開始する',
                          style: TextStyle(color: Colors.red),
                        ),
                      );
                    }
                    if (meta.isClosed || meta.isError) {
                      return TextButton(
                        onPressed: () {
                          Navigator.of(dialogContext).pop();
                          _callOpenStoreTerminal(
                            pageContext,
                            businessDateKey: plannedOpenBusinessDateKey,
                          );
                        },
                        child: const Text(
                          '開店処理を開始する',
                          style: TextStyle(color: Colors.green),
                        ),
                      );
                    }
                    return const SizedBox.shrink();
                  },
                ),
              ],
            );
          },
        );
      },
    );
  }

  /// 閉店フロー: 閉店前確認画面へ遷移（Phase4 03）
  void _startCloseFlow(BuildContext context) {
    final auth = FirebaseAuth.instance;
    if (auth.currentUser == null) {
      if (mounted) _showAuthExpiredSnackBar();
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ClosePreConfirmationPage(
          onConfirmClose: (forceClose) async {
            final success = await _callCloseStoreTerminal(
              context,
              runId: null,
              forceClose: forceClose,
            );
            if (mounted && success) Navigator.of(context).pop();
          },
        ),
      ),
    );
  }

  /// 閉店処理完了後のダイアログ（§4.8: 関数ごとの作業表示）
  Future<void> _showCloseCompletedDialog(
    BuildContext context,
    Map<String, dynamic> data,
  ) async {
    // Cloud Functions のレスポンスはネストされた Map が _Map<Object?, Object?> になることがあるため、
    // 直接 as Map<String, dynamic>? でキャストすると型エラーになる。Map.from で安全に変換する。
    final rawDisplaySummary = data['displaySummary'];
    final displaySummary = rawDisplaySummary != null && rawDisplaySummary is Map
        ? Map<String, dynamic>.from(rawDisplaySummary as Map)
        : null;
    final message = data['message'] as String? ?? '閉店しました。';

    if (displaySummary == null) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('閉店完了'),
          content: Text(message),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    final rawUnsettledMark = displaySummary['unsettledMark'];
    final unsettledMark = rawUnsettledMark != null && rawUnsettledMark is Map
        ? Map<String, dynamic>.from(rawUnsettledMark as Map)
        : null;
    final rawCleanupActiveStays = displaySummary['cleanupActiveStays'];
    final cleanupActiveStays =
        rawCleanupActiveStays != null && rawCleanupActiveStays is Map
        ? Map<String, dynamic>.from(rawCleanupActiveStays as Map)
        : null;
    final rawMigrateMissedSettlements =
        displaySummary['migrateMissedSettlements'];
    final migrateMissedSettlements =
        rawMigrateMissedSettlements != null &&
            rawMigrateMissedSettlements is Map
        ? Map<String, dynamic>.from(rawMigrateMissedSettlements as Map)
        : null;
    final storeMeta = displaySummary['storeMeta'] as String? ?? '';

    String unsettledText;
    if (unsettledMark == null) {
      unsettledText = '未会計付与: —';
    } else {
      final count = (unsettledMark['count'] as num?)?.toInt() ?? 0;
      final pokerNames =
          (unsettledMark['pokerNames'] as List<dynamic>?)?.cast<String>() ?? [];
      if (count == 0) {
        unsettledText = '未会計付与（applyCloseSnapshot 相当）: 対象 0 件';
      } else if (pokerNames.isEmpty) {
        unsettledText = '未会計付与: $count 件を未会計として登録しました。';
      } else {
        final names = pokerNames.take(10).join(', ');
        final more = pokerNames.length > 10
            ? ' 他${pokerNames.length - 10}件'
            : '';
        unsettledText = '未会計付与: $count 件（${names}$more）';
      }
    }

    String cleanupText;
    if (cleanupActiveStays == null) {
      cleanupText = 'cleanupActiveStays: —';
    } else {
      final deleted = (cleanupActiveStays['deleted'] as num?)?.toInt() ?? 0;
      final failed = (cleanupActiveStays['failed'] as num?)?.toInt() ?? 0;
      if (deleted == 0 && failed == 0) {
        cleanupText = 'cleanupActiveStays: 対象なし';
      } else {
        cleanupText =
            'cleanupActiveStays: 削除 $deleted 件${failed > 0 ? '、失敗 $failed 件' : ''}';
      }
    }

    String migrateText;
    if (migrateMissedSettlements == null) {
      migrateText = '移管（migrateMissedSettlements）: —';
    } else {
      final processedCount =
          (migrateMissedSettlements['processedCount'] as num?)?.toInt() ?? 0;
      final pokerNames =
          (migrateMissedSettlements['pokerNames'] as List<dynamic>?)
              ?.cast<String>() ??
          [];
      if (processedCount == 0) {
        migrateText = '移管: 対象なし';
      } else if (pokerNames.isEmpty) {
        migrateText = '移管: $processedCount 件';
      } else {
        final names = pokerNames.take(10).join(', ');
        final more = pokerNames.length > 10
            ? ' 他${pokerNames.length - 10}件'
            : '';
        migrateText = '移管: $processedCount 件（${names}$more）';
      }
    }

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('閉店完了'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                message,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              Text(unsettledText, style: const TextStyle(fontSize: 12)),
              const SizedBox(height: 6),
              Text(cleanupText, style: const TextStyle(fontSize: 12)),
              const SizedBox(height: 6),
              Text(migrateText, style: const TextStyle(fontSize: 12)),
              const SizedBox(height: 6),
              Text(
                'storeMeta: $storeMeta',
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  /// closeStoreTerminal を呼ぶ（runId は resume 時のみ、forceClose は強制閉店時に true）
  /// 成功時 true、失敗時 false を返す（閉店前確認画面からの pop 判定に使用）
  Future<bool> _callCloseStoreTerminal(
    BuildContext context, {
    String? runId,
    bool forceClose = false,
  }) async {
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    OverlayEntry? loadingOverlay;
    bool loadingShown = false;
    void hideLoading() {
      if (loadingShown) {
        try {
          loadingOverlay?.remove();
        } catch (_) {}
        loadingOverlay = null;
        loadingShown = false;
      }
    }

    try {
      if (FirebaseAuth.instance.currentUser == null)
        await FirebaseAuth.instance.signInAnonymously();

      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('閉店処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      if (overlayState != null) {
        overlayState.insert(loadingOverlay!);
        loadingShown = true;
      }

      final callable = FunctionsClient.instance.httpsCallable(
        'closeStoreTerminal',
      );
      final payload = <String, dynamic>{};
      if (runId != null) payload['runId'] = runId;
      if (forceClose) payload['forceClose'] = true;
      final result = await callable
          .call<Map<String, dynamic>>(payload)
          .timeout(
            const Duration(seconds: 150),
            onTimeout: () => throw TimeoutException('閉店処理がタイムアウトしました'),
          );
      hideLoading();
      if (!context.mounted) return false;

      final data = result.data;
      if (data['success'] == true) {
        // 仕様: 閉店処理完了時はダイアログで表示する（§4.8）
        await _showCloseCompletedDialog(context, data);
        return true;
      }
      return false;
    } catch (e) {
      hideLoading();
      if (!context.mounted) return false;
      String? resumeRunId;
      if (e is FirebaseFunctionsException) {
        if (e.code == 'failed-precondition') {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('閉店処理が他の操作で実行中です。完了するまでお待ちください。'),
              backgroundColor: Colors.orange,
            ),
          );
          return false;
        }
        final details = e.details;
        if (details is Map && details['runId'] != null) {
          resumeRunId = details['runId'] as String?;
        }
      }
      final message = e is FirebaseFunctionsException
          ? (e.message ?? e.code)
          : e.toString();
      if (resumeRunId != null) {
        showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('閉店処理が失敗しました'),
            content: Text('$message\n\n再開できます。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('閉じる'),
              ),
              ElevatedButton(
                onPressed: () async {
                  Navigator.of(ctx).pop();
                  await _callCloseStoreTerminal(
                    context,
                    runId: resumeRunId,
                    forceClose: false,
                  );
                },
                child: const Text('再開'),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('エラー: $message'), backgroundColor: Colors.red),
        );
      }
      return false;
    }
  }

  /// openStoreTerminal を呼ぶ（runId は resume 時のみ）
  Future<void> _callOpenStoreTerminal(
    BuildContext context, {
    String? runId,
    String? businessDateKey,
  }) async {
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    OverlayEntry? loadingOverlay;
    bool loadingShown = false;
    void hideLoading() {
      if (loadingShown) {
        try {
          loadingOverlay?.remove();
        } catch (_) {}
        loadingOverlay = null;
        loadingShown = false;
      }
    }

    try {
      if (FirebaseAuth.instance.currentUser == null)
        await FirebaseAuth.instance.signInAnonymously();

      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('開店処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      if (overlayState != null) {
        overlayState.insert(loadingOverlay!);
        loadingShown = true;
      }

      final callable = FunctionsClient.instance.httpsCallable(
        'openStoreTerminal',
      );
      final payload = <String, dynamic>{};
      if (runId != null) payload['runId'] = runId;
      if (businessDateKey != null && _isDateKey(businessDateKey)) {
        payload['businessDateKey'] = businessDateKey;
      }
      final result = await callable
          .call<Map<String, dynamic>>(payload)
          .timeout(
            const Duration(seconds: 60),
            onTimeout: () => throw TimeoutException('開店処理がタイムアウトしました'),
          );
      hideLoading();
      if (!context.mounted) return;

      final data = result.data;
      if (data['success'] == true) {
        final date = data['businessDateKey'] ?? data['closedBusinessDate'];
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(data['message'] ?? '$date の営業を開始しました。'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      hideLoading();
      if (!context.mounted) return;
      String? resumeRunId;
      if (e is FirebaseFunctionsException) {
        if (e.code == 'failed-precondition') {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('開店処理が他の操作で実行中です。完了するまでお待ちください。'),
              backgroundColor: Colors.orange,
            ),
          );
          return;
        }
        final details = e.details;
        if (details is Map && details['runId'] != null) {
          resumeRunId = details['runId'] as String?;
        }
      }
      final message = e is FirebaseFunctionsException
          ? (e.message ?? e.code)
          : e.toString();
      if (resumeRunId != null) {
        showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('開店処理が失敗しました'),
            content: Text('$message\n\n再開できます。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('閉じる'),
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  _callOpenStoreTerminal(
                    context,
                    runId: resumeRunId,
                    businessDateKey: businessDateKey,
                  );
                },
                child: const Text('再開'),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('エラー: $message'), backgroundColor: Colors.red),
        );
      }
    }
  }

  /// createInitialStateDocCallable Cloud Functionを呼び出す
  Future<void> _callCreateInitialStateDoc(BuildContext context) async {
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    OverlayEntry? loadingOverlay;
    bool loadingShown = false;

    void hideLoading() {
      if (loadingShown) {
        try {
          loadingOverlay?.remove();
        } catch (_) {
          // noop
        }
        loadingOverlay = null;
        loadingShown = false;
      }
    }

    try {
      // 認証状態を確認（未認証の場合は匿名認証を実行）
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      // ローディング表示
      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('初期化処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      if (overlayState != null) {
        overlayState.insert(loadingOverlay!);
        loadingShown = true;
      }

      // Cloud Function呼び出し
      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('createInitialStateDocCallable');

      final result = await callable
          .call({})
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
          );

      hideLoading();

      if (!context.mounted) return;

      final data = result.data as Map<String, dynamic>? ?? {};
      final bool success = data['success'] == true;

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(data['message'] ?? '初期化が完了しました'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('初期化に失敗しました'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      hideLoading();
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('エラー: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  /// openStore Cloud Functionを呼び出す
  Future<void> _callOpenStore(BuildContext context) async {
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    OverlayEntry? loadingOverlay;
    bool loadingShown = false;

    void hideLoading() {
      if (loadingShown) {
        try {
          loadingOverlay?.remove();
        } catch (_) {
          // noop
        }
        loadingOverlay = null;
        loadingShown = false;
      }
    }

    try {
      // 認証状態を確認（未認証の場合は匿名認証を実行）
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      // ローディング表示
      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('開店処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      if (overlayState != null) {
        overlayState.insert(loadingOverlay!);
        loadingShown = true;
      }

      // Cloud Function呼び出し
      // 注意: リージョン指定が必要な場合は、Firebase Functionsのデフォルト設定で
      // リージョンが設定されている場合、instanceForを使用する必要がありますが、
      // 認証トークンが正しく送信されない可能性があるため、まずはinstanceを試します
      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('openStore');

      final result = await callable
          .call({})
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
          );

      hideLoading();

      if (!context.mounted) return;

      final data = result.data as Map<String, dynamic>? ?? {};
      final bool success = data['success'] == true;

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('開店しました。営業日: ${data['businessDateKey'] ?? '不明'}'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('開店に失敗しました'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      hideLoading();
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('エラー: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  /// closeStore Cloud Functionを呼び出す
  Future<void> _callCloseStore(BuildContext context) async {
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    OverlayEntry? loadingOverlay;
    bool loadingShown = false;

    void hideLoading() {
      if (loadingShown) {
        try {
          loadingOverlay?.remove();
        } catch (_) {
          // noop
        }
        loadingOverlay = null;
        loadingShown = false;
      }
    }

    try {
      // 認証状態を確認（未認証の場合は匿名認証を実行）
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      // ローディング表示
      loadingOverlay = OverlayEntry(
        builder: (_) => Material(
          color: Colors.black54,
          child: Center(
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 16),
                  Text('閉店処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      if (overlayState != null) {
        overlayState.insert(loadingOverlay!);
        loadingShown = true;
      }

      // Cloud Function呼び出し
      // 注意: リージョン指定が必要な場合は、Firebase Functionsのデフォルト設定で
      // リージョンが設定されている場合、instanceForを使用する必要がありますが、
      // 認証トークンが正しく送信されない可能性があるため、まずはinstanceを試します
      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('closeStore');

      final result = await callable
          .call({})
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
          );

      hideLoading();

      if (!context.mounted) return;

      final data = result.data as Map<String, dynamic>? ?? {};
      final bool success = data['success'] == true;

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '閉店しました。最終営業日: ${data['lastClosedBusinessDateKey'] ?? '不明'}',
            ),
            backgroundColor: Colors.orange,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('閉店に失敗しました'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      hideLoading();
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('エラー: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final buttonHeight = (screenHeight - kToolbarHeight - 80) / 2.3;

    // 通常のボタン（直接遷移）
    // optionKeys: いずれか1つでも付与されていれば表示（null = 常に表示）
    final List<({String label, Widget destination, List<String>? optionKeys})>
    buttons = [
      (
        label: 'ユーザー作成',
        destination: const CreateUserAccount(),
        optionKeys: null,
      ),
      (
        label: 'ユーザーログイン',
        destination: const UserCheckInPage(),
        optionKeys: [DeviceOptionKeys.userEntryExit],
      ),
      (
        label: 'メニュー追加',
        destination: const MenuEditorListPage(),
        optionKeys: null,
      ),
      (
        label: '注文画面',
        destination: const CategorySelectPage(),
        optionKeys: [DeviceOptionKeys.order],
      ),
      (
        label: '入店中user一覧',
        destination: const StayingUsersListPage(),
        optionKeys: null,
      ),
      (
        label: 'Tournament 作成',
        destination: const TournamentCreationMenuPage(),
        optionKeys: [DeviceOptionKeys.tournament],
      ),
      (
        label: 'Tournament Home',
        destination: const ScheduledTournamentListPage(),
        optionKeys: [DeviceOptionKeys.tournament],
      ),
      (
        label: '卓ページ',
        destination: const TableHomePage(),
        optionKeys: [
          DeviceOptionKeys.tournament,
          DeviceOptionKeys.tournamentTable,
        ],
      ),
      (
        label: 'ブラインドタイマー',
        destination: const BlindTimerTournamentSelectPage(),
        optionKeys: [DeviceOptionKeys.tournament],
      ),
      (
        label: 'sideGame',
        destination: const SideGameTableListPage(),
        optionKeys: [DeviceOptionKeys.sideGame],
      ),
      (
        label: '注文管理',
        destination: const OrderManagementPage(),
        optionKeys: [DeviceOptionKeys.kitchen],
      ),
      (
        label: '勤怠管理・スタッフ打刻',
        destination: const StaffAttendancePage(),
        optionKeys: [DeviceOptionKeys.staffEntryExit],
      ),
      (
        label: '未退勤一覧',
        destination: const UnclockedAttendanceListPage(),
        optionKeys: [DeviceOptionKeys.storeManagement],
      ),
      (
        label: '会計管理',
        destination: const AccountingPage(),
        optionKeys: [DeviceOptionKeys.accounting],
      ),
      (
        label: '未会計の会計',
        destination: const UnsettledAccountingPage(),
        optionKeys: [DeviceOptionKeys.accounting],
      ),
      (
        label: '売上ダッシュボード',
        destination: const DashboardHomePage(),
        optionKeys: null,
      ),
      (
        label: '支払い分割テスト',
        destination: const PaymentSplitTestPage(),
        optionKeys: null,
      ),
      (
        label: 'Firestoreサイズ計算',
        destination: const FirestoreSizePage(),
        optionKeys: null,
      ),
      // テスト用: 会計後調整画面への遷移ボタン
      (
        label: '会計後調整（テスト）',
        destination: const PostAccountingAdjustmentsPage(),
        optionKeys: null,
      ),
    ];

    final visibleButtons = buttons.where((btn) {
      // 管理者端末は全表示
      if (_isAdminDevice) return true;
      // オプションがまだ付与されていない（空）場合は従来通り全表示
      if (_deviceOptions.isEmpty) return true;
      // オプションキーが無いボタンは常に表示（一般系）
      if (btn.optionKeys == null) return true;
      // いずれか1つでも付与済みなら表示
      return btn.optionKeys!.any((key) => _deviceOptions[key] == true);
    }).toList();

    final showStoreManagementButton =
        _isAdminDevice ||
        _deviceOptions[DeviceOptionKeys.storeManagement] == true;
    final isStoreManagement =
        _isAdminDevice ||
        _deviceOptions[DeviceOptionKeys.storeManagement] == true;
    final recheckMinutes =
        StoreConfigService
            .instance
            .latestData
            ?.alreadyRunningDifferentDateRecheckMinutes ??
        kDefaultAlreadyRunningDifferentDateRecheckMinutes;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Terminal ホーム'),
        centerTitle: true,
        actions: [
          // 営業状態表示（日付は横長楕円枠で囲み、タップで開閉店管理ダイアログを開く）
          _buildStoreStatusAction(context),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const SystemSettingsPage(),
                ),
              );
            },
            tooltip: 'システム設定',
          ),
        ],
      ),
      body: _loadingDevice
          ? const Center(child: CircularProgressIndicator())
          : StoreStrongWarningOverlay(
              isStoreManagement: isStoreManagement,
              recheckMinutes: recheckMinutes,
              onCloseStore: isStoreManagement
                  ? () => _startCloseFlow(context)
                  : null,
              onBusinessContinue: isStoreManagement
                  ? () => _onBusinessContinue(context)
                  : null,
              child: GridView.custom(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(), // スクロール可能に変更
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 5,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          mainAxisExtent: buttonHeight,
        ),
                childrenDelegate: SliverChildListDelegate.fixed([
                  // 通常ボタン
                  ...visibleButtons.map((btn) {
            return ElevatedButton(
                      onPressed: () async {
                        if (context.mounted) {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => btn.destination),
                );
                        }
              },
              child: Text(btn.label, textAlign: TextAlign.center),
                    );
                  }),
                  // 営業管理ボタン（開閉店管理ダイアログ）
                  if (showStoreManagementButton)
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.brown,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: () => _showStoreManagementDialog(context),
                      child: const Text('営業管理', textAlign: TextAlign.center),
                    ),
                ]),
              ),
            ),
    );
  }

  /// 営業継続: 同一ダイアログ内で閉店時間の目安（1〜8時間）を選択し、Callable で override＋closeAssessment 更新＋enqueue を実行。
  void _onBusinessContinue(BuildContext context) {
    final pageContext = context;
    final meta = StoreMetaService.instance.latestData;
    final info = meta != null ? getTopStrongWarning(meta) : null;
    if (info == null) {
      ScaffoldMessenger.of(
        pageContext,
      ).showSnackBar(const SnackBar(content: Text('強警告が解消されています。')));
      return;
    }

    if (info.type == StrongWarningType.already_running_different_date) {
      final recheckMinutes =
          StoreConfigService
              .instance
              .latestData
              ?.alreadyRunningDifferentDateRecheckMinutes ??
          kDefaultAlreadyRunningDifferentDateRecheckMinutes;
      showDialog<void>(
        context: pageContext,
        builder: (dialogContext) {
          return AlertDialog(
            title: const Text('緊急一時解除'),
            content: Text(
              '${recheckMinutes}分間、開店認定の強警告を一時解除します。期限到達時に再評価され、未解消なら再度ブロックされます。実行しますか？',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('キャンセル'),
              ),
              ElevatedButton(
                onPressed: () async {
                  Navigator.of(dialogContext).pop();
                  await _callTemporaryUnlockAlreadyRunningDifferentDateTerminal(
                    pageContext,
                  );
                },
                child: const Text('実行'),
              ),
            ],
          );
        },
      );
      return;
    }

    final targetBusinessDateKey = info.targetBusinessDateKey;
    if (targetBusinessDateKey.isEmpty) {
      ScaffoldMessenger.of(
        pageContext,
      ).showSnackBar(const SnackBar(content: Text('閉店対象日を取得できません。')));
      return;
    }

    int selectedHours = 1;
    showDialog<void>(
      context: pageContext,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (_, setState) {
            return AlertDialog(
              title: const Text('営業継続'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '閉店時間の目安を選択してください。選択した時間後に閉店確認のリマインドが実行されます。',
                      style: TextStyle(fontSize: 13),
                    ),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<int>(
                      value: selectedHours,
                      decoration: const InputDecoration(
                        labelText: '閉店予定までの時間',
                        border: OutlineInputBorder(),
                      ),
                      items: List.generate(8, (i) => i + 1).map((h) {
                        return DropdownMenuItem<int>(
                          value: h,
                          child: Text('$h 時間'),
            );
          }).toList(),
                      onChanged: (value) {
                        if (value != null)
                          setState(() => selectedHours = value);
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('キャンセル'),
                ),
                ElevatedButton(
                  onPressed: () async {
                    Navigator.of(dialogContext).pop();
                    try {
                      final callable = FunctionsClient.instance.httpsCallable(
                        'continueBusinessTerminal',
                      );
                      await callable.call(<String, dynamic>{
                        'intendedBusinessDateKey': targetBusinessDateKey,
                        'hours': selectedHours,
                      });
                      if (!pageContext.mounted) return;
                      ScaffoldMessenger.of(pageContext).showSnackBar(
                        SnackBar(
                          content: Text(
                            '$selectedHours 時間後に閉店確認のリマインドを予約しました。',
                          ),
                          backgroundColor: Colors.green,
                        ),
                      );
                    } on FirebaseFunctionsException catch (e) {
                      if (!pageContext.mounted) return;
                      ScaffoldMessenger.of(pageContext).showSnackBar(
                        SnackBar(
                          content: Text(
                            e.message ?? '営業継続に失敗しました（リマインド予約を含む）。',
                          ),
                          backgroundColor: Colors.orange,
                        ),
                      );
                    } catch (e) {
                      if (!pageContext.mounted) return;
                      ScaffoldMessenger.of(pageContext).showSnackBar(
                        SnackBar(
                          content: Text('営業継続に失敗しました。${e.toString()}'),
                          backgroundColor: Colors.orange,
                        ),
                      );
                    }
                  },
                  child: const Text('決定'),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class PlaceholderPage extends StatelessWidget {
  final String title;

  const PlaceholderPage({super.key, required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title の遷移先（未実装）')),
    );
  }
}

class _OpenDateAdjustmentPasswordDialog extends StatefulWidget {
  const _OpenDateAdjustmentPasswordDialog();

  @override
  State<_OpenDateAdjustmentPasswordDialog> createState() =>
      _OpenDateAdjustmentPasswordDialogState();
}

class _OpenDateAdjustmentPasswordDialogState
    extends State<_OpenDateAdjustmentPasswordDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    if (!mounted) return;
    Navigator.of(context).pop(_controller.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('開店日付調整の認証'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        obscureText: true,
        decoration: const InputDecoration(
          labelText: 'パスワード',
          border: OutlineInputBorder(),
        ),
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(onPressed: _submit, child: const Text('認証')),
      ],
    );
  }
}
