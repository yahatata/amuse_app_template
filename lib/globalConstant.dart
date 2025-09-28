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
  static const int PAYROLL_START_DAY = 25; // 給与計算期間の開始日（25日から開始）
  static const int PAYROLL_END_DAY = 24;   // 給与計算期間の終了日（翌月24日まで）
  
  // 給与計算期間の説明
  static const String PAYROLL_PERIOD_DESCRIPTION = "給与計算期間は25日〜翌月24日です。変更する場合は、このファイルの数値を変更してアプリを再起動してください。";
  
  // ポイントタイプ選択肢（フィールド名のみ）
  static const List<String> pointTypes = ['pointA', 'pointB', 'sideGameTip'];//createUserAccount.tsやcreateUserByApp.tsについては直接コード内で修正する必要がある
}
