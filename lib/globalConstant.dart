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
