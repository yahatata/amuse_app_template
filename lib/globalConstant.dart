// カテゴリー一覧（将来的に顧客ごとに調整）
class GlobalConstants {
  // スキーマバージョン
  static const String schemaVersion = "1.0";
  
  // メニューカテゴリー一覧
  static const List<String> menuCategories = [
    'フード',
    'ノンアルコール',
    'アルコール',
    'Chip',
    'その他',
  ];

  // 入店料設定
  static const int entranceFee = 1000; // 入店料（0円も設定可能）
  static const String entranceFeeDescription = "入店料"; // 入店料の説明文
  
  // 再入店時の入店料設定
  static const bool chargeEntranceFeeOnReentry = false; // 再入店時に入店料を取るかどうか（true: 取る, false: 取らない）

  // トーナメント設定
  static const double defaultPrizeRatio = 0.7; // デフォルトプライズ割合（70%）
  
  // プライズ設定
  static const int prizeReceiverPercentage = 10; // プライズ受け取り人数の割合（10%）
  static const String prizeRoundingMethod = 'floor'; // プライズ計算の丸め方法（floor: 切り捨て, ceil: 切り上げ, round: 四捨五入）
  
  // プライズ配分比率（人数別）
  static const Map<int, List<double>> prizeDistribution = {
    1: [100.0], // 1人入賞（Winner Take All）
    2: [65.0, 35.0], // 2人入賞
    3: [50.0, 30.0, 20.0], // 3人入賞
    4: [45.0, 25.0, 18.0, 12.0], // 4人入賞
    5: [40.0, 25.0, 15.0, 12.0, 8.0], // 5人入賞
    6: [38.0, 23.0, 15.0, 10.0, 8.0, 6.0], // 6人入賞
    7: [36.0, 22.0, 14.0, 9.0, 7.0, 6.0, 6.0], // 7人入賞
    8: [35.0, 21.0, 13.0, 9.0, 7.0, 6.0, 5.0, 4.0], // 8人入賞
    9: [34.0, 20.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0], // 9人入賞
    10: [32.0, 19.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0, 3.0], // 10人入賞
  };

  // 給与計算期間設定
  //　変更時はmonthlyPayrollTriggerの値も変更すること
  static const int PAYROLL_START_DAY = 26; // 給与計算期間の開始日（26日から開始）
  static const int PAYROLL_END_DAY = 25;   // 給与計算期間の終了日（翌月25日まで）
  
  // 給与計算期間の説明
  static const String PAYROLL_PERIOD_DESCRIPTION = "給与計算期間は$PAYROLL_START_DAY日〜翌月$PAYROLL_END_DAY日です。変更する場合は、このファイルの数値を変更してアプリを再起動してください。";
  
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
  
  // サイドゲーム選択肢
  static const List<String> sideGameTypes = [
    'ブラックジャック',
    'ルーレット',
    'バカラ',
    'アルティメットポーカー',
  ];

  // カテゴリ別支払い方法制限設定（bills スキーマのカテゴリ名をキーとする）
  static const Map<String, List<String>> categoryPaymentMethods = {
    'extraCost': ['cash', 'credit_card', 'electronic_money'], // 入店料
    'sideGameChip': ['cash', 'credit_card', 'electronic_money'], // サイドゲームチップ
    'items': ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip'], // フード・ドリンク
    'tournaments': ['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB'], // トーナメント参加費
  };

  // サイドゲームチップ換算率設定
  static const double SIDE_GAME_CHIP_EXCHANGE_RATE = 10.0; // サイドゲームチップ1 = 10円相当
  static const String SIDE_GAME_CHIP_DESCRIPTION = "サイドゲームチップ1枚 = ¥${SIDE_GAME_CHIP_EXCHANGE_RATE}相当";

  // ポイント使用優先順位（支払い分割計算用）
  // Cloud Functions側（functions/src/utils/paymentSplitCalculator.ts）と同期必須
  static const List<String> POINT_PRIORITY = ['pointA', 'pointB', 'sideGameChip'];

  // ポイント使用単位制限（支払い分割計算用）
  // Cloud Functions側（functions/src/utils/paymentSplitCalculator.ts）と同期必須
  static const int POINT_A_B_ROUNDING_UNIT = 1000; // pointA/pointB の切り捨て単位（円）
  static const int SIDE_GAME_CHIP_ROUNDING_UNIT = 100; // sideGameChip の切り捨て単位（チップ数）
}
