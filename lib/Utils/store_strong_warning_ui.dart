import 'package:flutter/material.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';
import 'package:amuse_app_template/utils/store_warning_first_dialog_prefs.dart';

/// Phase6 Step4: 強警告は端末種別で排他的。store management = ゲートのみ、非 store = Banner のみ（changeSpec §3.4）

/// store management 端末用: dismiss 不可・常駐ゲート（changeSpec §3.5）
class StrongWarningGate extends StatelessWidget {
  final String message;
  final String targetBusinessDateKey;
  final StrongWarningType type;
  final int recheckMinutes;
  final VoidCallback? onCloseStore;
  final VoidCallback? onBusinessContinue;

  const StrongWarningGate({
    super.key,
    required this.message,
    required this.targetBusinessDateKey,
    required this.type,
    this.recheckMinutes = 15,
    this.onCloseStore,
    this.onBusinessContinue,
  });

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Material(
        color: Colors.black54,
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 24),
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [
                    BoxShadow(
                      color: Colors.black26,
                      blurRadius: 10,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      size: 48,
                      color: Colors.orange,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      message,
                      style: const TextStyle(fontSize: 14, height: 1.4),
                    ),
                    const SizedBox(height: 24),
                    if (onCloseStore != null)
                      ElevatedButton(
                        onPressed: onCloseStore,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.shade700,
                          foregroundColor: Colors.white,
                        ),
                        child: Text(
                          targetBusinessDateKey.isEmpty
                              ? '閉店処理へ'
                              : '$targetBusinessDateKey の閉店処理へ',
                        ),
                      ),
                    if (onCloseStore != null && onBusinessContinue != null)
                      const SizedBox(height: 8),
                    if (onBusinessContinue != null)
                      OutlinedButton(
                        onPressed: onBusinessContinue,
                        child: Text(
                          type ==
                                  StrongWarningType
                                      .already_running_different_date
                              ? '緊急一時解除（$recheckMinutes分）'
                              : '営業継続',
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 非 store management 端末用: Inline Banner 常駐（閉じられない・操作は可能）
class StrongWarningBanner extends StatelessWidget {
  final String message;

  const StrongWarningBanner({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 2,
      color: Colors.orange.shade100,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              const Icon(
                Icons.warning_amber_rounded,
                color: Colors.orange,
                size: 24,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '営業状態の警告があります。管理者に確認してください。',
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 画面ルートに置き、強警告時のみゲート or Banner を重ねる（changeSpec §3.4, §3.5, §3.6）
/// child の上に Stack でゲートまたは Banner を表示。条件不成立で自動で消える。
class StoreStrongWarningOverlay extends StatefulWidget {
  final Widget child;
  final bool isStoreManagement;
  final int recheckMinutes;
  final VoidCallback? onCloseStore;
  final VoidCallback? onBusinessContinue;

  /// 閉店前確認など、一時的に強警告 UI を出さない経路向け。
  final bool suppressStrongWarning;

  const StoreStrongWarningOverlay({
    super.key,
    required this.child,
    required this.isStoreManagement,
    this.recheckMinutes = 15,
    this.onCloseStore,
    this.onBusinessContinue,
    this.suppressStrongWarning = false,
  });

  @override
  State<StoreStrongWarningOverlay> createState() =>
      _StoreStrongWarningOverlayState();
}

class _StoreStrongWarningOverlayState extends State<StoreStrongWarningOverlay> {
  /// どの (type, targetKey) で初回ダイアログ用のチェックを済ませたか
  StrongWarningInfo? _lastCheckedDialogKey;

  @override
  Widget build(BuildContext context) {
    if (widget.suppressStrongWarning) {
      return widget.child;
    }

    return StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, snapshot) {
        final meta = snapshot.data;
        final info = meta != null ? getTopStrongWarning(meta) : null;

        if (info == null) {
          _lastCheckedDialogKey = null;
          return widget.child;
        }

        if (widget.isStoreManagement) {
          return Stack(
            children: [
              widget.child,
              Positioned.fill(
                child: StrongWarningGate(
                  message: info.message,
                  targetBusinessDateKey: info.targetBusinessDateKey,
                  type: info.type,
                  recheckMinutes: widget.recheckMinutes,
                  onCloseStore: widget.onCloseStore,
                  onBusinessContinue: widget.onBusinessContinue,
                ),
              ),
            ],
          );
        }

        // 非 store management: 初回のみ永続キーで未表示ならダイアログ表示（表示した時点で保存）
        final needCheck =
            _lastCheckedDialogKey?.type != info.type ||
            _lastCheckedDialogKey?.targetBusinessDateKey !=
                info.targetBusinessDateKey;
        if (needCheck) {
          _lastCheckedDialogKey = info;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            _checkAndShowFirstDialogIfNeeded(context, info);
          });
        }

        return Stack(
          children: [
            widget.child,
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: StrongWarningBanner(message: info.message),
            ),
          ],
        );
      },
    );
  }

  Future<void> _checkAndShowFirstDialogIfNeeded(
    BuildContext context,
    StrongWarningInfo info,
  ) async {
    final already = await hasStrongWarningFirstDialogBeenShown(
      info.type,
      info.targetBusinessDateKey,
    );
    if (already) return;
    if (!mounted) return;
    // 表示した時点で永続化（dismiss を待たない）
    await markStrongWarningFirstDialogShown(
      info.type,
      info.targetBusinessDateKey,
    );
    if (!mounted) return;
    showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        title: const Text('営業状態の確認'),
        content: const SingleChildScrollView(child: Text('管理者に確認してください。')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }
}

/// 他画面用: isStoreManagement を非同期取得してから StoreStrongWarningOverlay を表示。
class StoreStrongWarningWrapper extends StatelessWidget {
  final Widget child;
  final VoidCallback? onCloseStore;
  final VoidCallback? onBusinessContinue;

  /// 閉店前確認→トーナメント終了など、強警告ゲートを出さない一時経路向け。
  final bool suppressStrongWarning;

  const StoreStrongWarningWrapper({
    super.key,
    required this.child,
    this.onCloseStore,
    this.onBusinessContinue,
    this.suppressStrongWarning = false,
  });

  @override
  Widget build(BuildContext context) {
    if (suppressStrongWarning) {
      return child;
    }

    final recheckMinutes =
        StoreConfigService
            .instance
            .latestData
            ?.alreadyRunningDifferentDateRecheckMinutes ??
        kDefaultAlreadyRunningDifferentDateRecheckMinutes;
    return FutureBuilder<bool>(
      future: DeviceService().isStoreManagement(),
      builder: (context, snap) {
        if (!snap.hasData) return child;
        return StoreStrongWarningOverlay(
          isStoreManagement: snap.data!,
          recheckMinutes: recheckMinutes,
          onCloseStore: onCloseStore,
          onBusinessContinue: onBusinessContinue,
          suppressStrongWarning: suppressStrongWarning,
          child: child,
        );
      },
    );
  }
}
