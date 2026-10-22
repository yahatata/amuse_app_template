import 'dart:async';

import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';
import 'package:flutter_test/flutter_test.dart';

/// USER-43: bulk_addon_popup catch の利用者向け文言契約。
const _kBulkAddonCatchDefault = 'まとめてAddon登録に失敗しました';

void main() {
  group('USER-43 bulk_addon catch message', () {
    test('secret Exception と 詳細: を表示しない', () {
      final msg = buildAsyncActionErrorMessage(
        Exception('secret internal error'),
        defaultMessage: _kBulkAddonCatchDefault,
      );
      expect(msg, _kBulkAddonCatchDefault);
      expect(msg, isNot(contains('詳細:')));
      expect(msg, isNot(contains('secret internal error')));
      expect(msg, isNot(contains('Exception')));
    });

    test('timeout / network / permission の既存文言を維持', () {
      expect(
        buildAsyncActionErrorMessage(
          TimeoutException('timeout'),
          defaultMessage: _kBulkAddonCatchDefault,
        ),
        '処理がタイムアウトしました。しばらく待ってから再試行してください。',
      );
      expect(
        buildAsyncActionErrorMessage(
          Exception('network unavailable'),
          defaultMessage: _kBulkAddonCatchDefault,
        ),
        'ネットワークエラーが発生しました。接続を確認してください。',
      );
      expect(
        buildAsyncActionErrorMessage(
          Exception('permission denied'),
          defaultMessage: _kBulkAddonCatchDefault,
        ),
        '権限が不足しています。管理者に連絡してください。',
      );
    });
  });
}
