import 'dart:async';

import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('async action error message maps timeout correctly', () {
    expect(
      buildAsyncActionErrorMessage(
        TimeoutException('timeout'),
        defaultMessage: '処理に失敗しました',
      ),
      '処理がタイムアウトしました。しばらく待ってから再試行してください。',
    );
  });

  test('async action error message maps permission and network correctly', () {
    expect(
      buildAsyncActionErrorMessage(
        Exception('permission denied'),
        defaultMessage: '処理に失敗しました',
      ),
      '権限が不足しています。管理者に連絡してください。',
    );

    expect(
      buildAsyncActionErrorMessage(
        Exception('network unavailable'),
        defaultMessage: '処理に失敗しました',
      ),
      'ネットワークエラーが発生しました。接続を確認してください。',
    );
  });

  test('async action error message keeps details for unexpected errors', () {
    final fallback = buildAsyncActionErrorMessage(
      Exception('unexpected'),
      defaultMessage: '処理に失敗しました',
    );

    expect(fallback, contains('処理に失敗しました'));
    expect(fallback, contains('unexpected'));
  });
}
