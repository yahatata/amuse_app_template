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
}
