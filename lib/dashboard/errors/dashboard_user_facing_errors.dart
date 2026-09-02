import 'package:flutter/material.dart';

import 'package:amuse_app_template/core/errors/errors.dart';

/// Phase 8 Dashboard 向けの安全な固定文言・薄い helper。
///
/// raw `$error` / snapshot.error / path は表示しない。
/// 取得失敗を 0 件・0 円グラフとして扱わない。

const String kDashboardLoadFailedMessage =
    '集計情報を取得できませんでした。画面を更新して再度お試しください。';

const String kDashboardPartialLoadFailedMessage =
    '一部の集計情報を取得できませんでした。画面を更新して再度お試しください。';

const String kDashboardStaleUpdateFailedMessage =
    '最新の集計情報を取得できませんでした。表示内容が古い可能性があります。';

const String kDashboardEmptyMessage = '表示できる集計データがありません';

String dashboardStreamErrorMessage({
  required bool hasStaleData,
  bool isPartial = false,
  Object? error,
}) {
  if (hasStaleData) return kDashboardStaleUpdateFailedMessage;
  if (isPartial) return kDashboardPartialLoadFailedMessage;
  return kDashboardLoadFailedMessage;
}

/// Firestore / Riverpod AsyncError 等を利用者文言へ（raw 非表示）。
String mapDashboardLoadError(Object? error, {String? operation}) {
  if (error == null) return kDashboardLoadFailedMessage;
  return mapCallableError(error, operation: operation).message;
}

const String kDashboardRetryLabel = '再読み込み';

/// 画面／カード全体の読込失敗 UI（raw 非表示・任意で再読み込み）。
Widget dashboardLoadErrorWidget({
  required String message,
  VoidCallback? onRetry,
}) {
  return Center(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 12),
            TextButton(
              onPressed: onRetry,
              child: const Text(kDashboardRetryLabel),
            ),
          ],
        ],
      ),
    ),
  );
}
