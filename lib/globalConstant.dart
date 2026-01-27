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

  // LINEプラン設定
  // 'communication' | 'light' | 'standard'
  // 変更時はCloud Functions側（functions/src/staff/*.ts）の環境変数も同期すること
  static const String linePlan = 'communication';

  // シフト要請機能の有効/無効
  // コミュニケーションプラン: false（UI表示なし、機能実行不可）
  // ライトプランまたはスタンダードプラン: true（UI表示あり、機能実行可能）
  static bool get isShiftRequestEnabled {
    return linePlan != 'communication';
  }

  // プラン名の表示用
  static String get linePlanName {
    switch (linePlan) {
      case 'communication':
        return 'コミュニケーションプラン';
      case 'light':
        return 'ライトプラン';
      case 'standard':
        return 'スタンダードプラン';
      default:
        return '不明';
    }
  }

  // 時間帯別の必要人数設定（1時間単位）
  // 例: {startHour: 19, endHour: 22, requiredCount: 3} → 19:00~22:00に3人必要
  // 管理者がカスタム可能、または契約時に設定
  static const List<Map<String, int>> requiredStaffByTimeSlot = [
    {'startHour': 19, 'endHour': 22, 'requiredCount': 2}, // 19:00~22:00に3人必要
    // 追加の時間帯設定例:
    {'startHour': 10, 'endHour': 12, 'requiredCount': 3}, // 10:00~12:00に2人必要
  ];

  // 営業時間スタイル定義
  // ⚠️ 重要: この定義を変更する場合は、Cloud Functions側（functions/src/shift/styles.ts）にも必ず同期すること
  // Cloud Functions側: functions/src/shift/styles.ts の BUSINESS_HOURS_STYLES と値が一致している必要があります
  
  /// 営業スタイルID（平日）
  static const String businessHoursStyleWeekday = 'weekday';
  
  /// 営業スタイルID（週末・祝日）
  static const String businessHoursStyleWeekendHoliday = 'weekendHoliday';
  
  /// 営業スタイルID（休業日）
  static const String businessHoursStyleClosed = 'closed';

  /// 営業スタイル定義
  /// - weekday: 平日（月〜金、祝日を除く）
  /// - weekendHoliday: 週末・祝日（土・日・祝日）
  /// - closed: 休業日（現在は手動設定でのみ使用中。自動で特定曜日を休業日にしたい場合にも使用可能）
  static const Map<String, Map<String, dynamic>> businessHoursStyles = {
    'weekday': {
      'styleId': 'weekday',
      'openMinute': 900,   // 15:00
      'closeMinute': 1440, // 24:00
      'isClosed': false,
    },
    'weekendHoliday': {
      'styleId': 'weekendHoliday',
      'openMinute': 720,   // 12:00
      'closeMinute': 1440, // 24:00
      'isClosed': false,
    },
    'closed': {
      'styleId': 'closed',
      'openMinute': 0,     // 任意だが検証簡略のため0
      'closeMinute': 0,    // 任意だが検証簡略のため0
      'isClosed': true,
    },
  };

  /// 営業スタイルから営業時間を取得
  /// [styleId] スタイルID
  /// 戻り値: { 'openMinute': int, 'closeMinute': int, 'isClosed': bool }
  static Map<String, dynamic>? getBusinessHoursByStyleId(String styleId) {
    return businessHoursStyles[styleId];
  }

  // ========================================
  // シフト管理フロー期間設定
  // ========================================
  // 対象月の前月の何日から何日まで、という形で設定します
  // 例: 2月シフトの場合、前月（1月）の日付で設定
  // 
  // フロー:
  // ①提出期間: スタッフは無制限でシフトの提出および修正が可能
  // ②組む期間（不足日再提出期間を含む）: 管理者が提出されたものからシフトを組む。スタッフは提出したシフトのみ確認可能で提出や修正は行えない
  //   管理者が不足日・不足時間を送信したタイミングで、不足日・不足時間のみ提出および修正が可能になる
  // ④最終確定送付: 全シフトが決まり次第全スタッフに送付

  /// ①シフト提出期間の開始日（前月の何日から）
  /// 例: 1 → 前月1日から
  static const int SHIFT_SUBMISSION_START_DAY = 1;

  /// ①シフト提出期間の終了日（前月の何日まで）
  /// 例: 15 → 前月15日まで
  static const int SHIFT_SUBMISSION_END_DAY = 15;

  /// ②シフトを組む期間の開始日（前月の何日から）
  /// 例: 16 → 前月16日から（以降は管理者の裁量で最終確定可能）
  /// この期間中は基本的に提出・修正不可。管理者が不足日・不足時間を送信したタイミングで、不足日・不足時間のみ提出可能になる
  /// 16日以降は管理者の裁量で最終確定可能（isFinalized=true）
  static const int SHIFT_SCHEDULING_START_DAY = 16;

  /// 管理者が直接作成したシフトのsourceRequestIdに使用する識別子
  /// Cloud Functions側（functions/src/shift/helpers.ts）のADMIN_CREATED_SHIFT_IDと同期必須
  static const String ADMIN_CREATED_SHIFT_ID = "admin-created";
}
