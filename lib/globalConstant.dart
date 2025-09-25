// カテゴリー一覧（将来的に顧客ごとに調整）
class GlobalConstants {
  // メニューカテゴリー一覧
  static const List<String> menuCategories = [
    'フード',
    'ノンアルコール',
    'アルコール',
    'その他',
  ];

  // 入店料設定
  static const int entranceFee = 1000; // 入店料（0円も設定可能）
  static const String entranceFeeDescription = "入店料"; // 入店料の説明文

  // トーナメント設定
  static const double defaultPrizeRatio = 0.7; // デフォルトプライズ割合（70%）

  // 給与計算期間設定
  //　変更時はmonthlyPayrollTriggerの値も変更すること
  static const int PAYROLL_START_DAY = 26; // 給与計算期間の開始日（26日から開始）
  static const int PAYROLL_END_DAY = 25;   // 給与計算期間の終了日（翌月25日まで）
  
  // 給与計算期間の説明
  static const String PAYROLL_PERIOD_DESCRIPTION = "給与計算期間は$PAYROLL_START_DAY日〜翌月$PAYROLL_END_DAY日です。変更する場合は、このファイルの数値を変更してアプリを再起動してください。";
  
  // 店舗締め時間設定
  static const int STORE_CLOSE_HOUR = 9; // 9:00まで（日付跨ぎ勤務可能）
  static const String STORE_CLOSE_DESCRIPTION = "$STORE_CLOSE_HOUR:00までの打刻は日付跨ぎ勤務として記録されます";}
