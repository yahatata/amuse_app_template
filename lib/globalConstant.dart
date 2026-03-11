// カテゴリー一覧（将来的に顧客ごとに調整）
class GlobalConstants {
  // スキーマバージョン
  // ※ Bills のスキーマを変更した際には、この値の更新が必要になる可能性あり。
  // 修正が必要な箇所: docs/config_migration/phase2.1/B01_schemaVersion/README.md の「7. Bills スキーマ変更時に修正が必要な箇所」を参照。
  static const String schemaVersion = "1.0";

  // 店舗締め時間設定
  // STORE_CLOSE_HOUR の意味:
  // - 0-23: 「当日の何時まで」を指定（例: 9 → 当日の9:00まで）
  // - 24-48: 「翌日の何時まで」を指定（例: 25 → 翌日の1:00まで、27 → 翌日の3:00まで）
  //   24以上を指定した場合、normalizeStoreCloseHour() で正規化して使用
  // 例: STORE_CLOSE_HOUR=9 → 当日の9:00まで（9:00以降は当日の営業日）
  // 例: STORE_CLOSE_HOUR=25 → 翌日の1:00まで（当日の1:00以降は当日の営業日）
  // 例: STORE_CLOSE_HOUR=27 → 翌日の3:00まで（当日の3:00以降は当日の営業日）
  static const int STORE_CLOSE_HOUR = 9; // 9:00まで（日付跨ぎ勤務可能）
  static const String STORE_CLOSE_DESCRIPTION = "$STORE_CLOSE_HOUR:00までの打刻は日付跨ぎ勤務として記録されます";
  
  // 週次Plannerのcron式（Cloud Scheduler用）
  // 【ドキュメント用】実際の実行タイミングは TS 側で環境変数 WEEKLY_PLANNER_CRON を参照。
  // 未設定時は '0 11 * * 0'（UTC）= 日曜 20:00 JST。JST表記の参考値: '0 20 * * 0'
  static const String WEEKLY_PLANNER_CRON = '0 20 * * 0';  // 日曜20:00 JST（TS は UTC 形式で '0 11 * * 0'）

  // 定期開催トーナメント自動生成スケジューラの実行タイミング
  // 【ドキュメント用】実際の実行タイミングは TS 側で環境変数 RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON を参照。
  // 未設定時は '0 23 * * 0'（日曜 23:00 JST）
  static const String RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON = '0 23 * * 0';
  /// 定期開催トーナメント自動生成の実行日時（人間が読める形式）
  /// GlobalConstants で実行タイミングを定義していることを明示するための説明
  static const String RECURRING_TOURNAMENT_GENERATION_SCHEDULER_RUN_AT_DESCRIPTION =
      '定期開催トーナメント自動生成: 日曜 23:00 (JST) に実行。実行タイミングは TS 環境変数 RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON で上書き可能。';

  // enqueue バッチ Scheduler の実行タイミング（Step 4）
  // 【ドキュメント用】実際の実行タイミングは TS 側で環境変数 ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON を参照。
  // 未設定時は '0 5 * * *'（毎日 5:00 JST）
  static const String ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON = '0 5 * * *';
  static const String ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_RUN_AT_DESCRIPTION =
      'enqueue バッチ: 毎日 5:00 (JST) に実行。実行タイミングは TS 環境変数 ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON で上書き可能。';
  
  /// STORE_CLOSE_HOUR を正規化（24以上は翌日繰り上がりとして扱う）
  /// @param hour 0-48 の整数
  ///   - 0-23: 当日の時刻としてそのまま使用
  ///   - 24-48: 翌日の時刻として扱い、24で割った余りを使用（例: 25 → 1, 27 → 3, 48 → 0）
  /// @returns 0-23 の整数（営業日判定で使用する時刻）
  /// 
  /// 注意: 24以上を指定した場合、元の値が「翌日の何時まで」を意味することを示す。
  /// 例: hour=25 → 1（翌日の1:00まで）、hour=27 → 3（翌日の3:00まで）
  static int normalizeStoreCloseHour(int hour) {
    // 24以上は翌日繰り上がりとして扱い、24で割った余りを使用
    return hour % 24;
  }
  
  // ポイントタイプ選択肢（フィールド名のみ）
  static const List<String> pointTypes = ['pointA', 'pointB', 'sideGameChip'];//createUserAccount.tsやcreateUserByApp.tsについては直接コード内で修正する必要がある

  /// 管理者が直接作成したシフト（Weekly Planner 経由でない）を識別するための sourceRequestId の値。
  /// 【意義】この値を持つアサインは「管理者が直接作成したもの」とみなし、Weekly Planner 由来と区別する。
  /// updateDayAssignments では、管理者作成シフトを特別扱い（営業時間チェックスキップ、上書き可否判定に使用）。
  /// 【変更が必要なケース】値自体を変更する場合、または識別ロジックを変える場合。
  /// 【同期必須】Flutter と Cloud Functions で同一の値を使う必要あり。異なると、作成時は「管理者作成」として記録されても
  /// TS 側の updateDayAssignments で正しく判定されず、意図しない上書きや処理漏れが発生する。
  /// 修正が必要な箇所: docs/config_migration/phase2.1/B07_adminCreatedShiftId/README.md の「7. 値変更時に修正が必要な箇所」を参照。
  static const String ADMIN_CREATED_SHIFT_ID = "admin-created";
}
