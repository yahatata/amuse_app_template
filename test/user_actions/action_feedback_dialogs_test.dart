import 'dart:async';

import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';
import 'package:cloud_functions/cloud_functions.dart';
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

  test('unexpected errors は defaultMessage のみ（詳細/raw 非表示）', () {
    final fallback = buildAsyncActionErrorMessage(
      Exception('secret unexpected'),
      defaultMessage: '処理に失敗しました',
    );

    expect(fallback, '処理に失敗しました');
    expect(fallback, isNot(contains('詳細')));
    expect(fallback, isNot(contains('secret unexpected')));
  });

  test('FFE permission-denied は D-1 code 文言（UID 非表示）', () {
    const secret = 'secret-user-id';
    final msg = buildAsyncActionErrorMessage(
      FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'uid=$secret path=/internal/doc',
        details: {'errorKey': 'UNKNOWN_KEY'},
      ),
      defaultMessage: '処理に失敗しました',
    );
    expect(msg, 'この操作の権限がありません。');
    expect(msg, isNot(contains(secret)));
  });

  test('FFE unavailable は通信文言', () {
    final msg = buildAsyncActionErrorMessage(
      FirebaseFunctionsException(
        code: 'unavailable',
        message: 'backend raw',
      ),
      defaultMessage: '処理に失敗しました',
    );
    expect(msg, '通信できません。接続を確認して再度お試しください。');
    expect(msg, isNot(contains('backend raw')));
  });

  test('未知 FFE は最終共通', () {
    final msg = buildAsyncActionErrorMessage(
      FirebaseFunctionsException(
        code: 'weird-code',
        message: 'SHOULD_NOT',
      ),
      defaultMessage: '処理に失敗しました',
    );
    expect(msg, kFinalFallbackErrorMessage);
    expect(msg, isNot(contains('SHOULD_NOT')));
  });
}
