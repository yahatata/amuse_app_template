class DeviceOptionKeys {
  static const String order = 'order';
  static const String userEntryExit = 'user_entry_exit';
  static const String staffEntryExit = 'staff_entry_exit';
  static const String accounting = 'accounting';
  static const String tournament = 'tournament';
  static const String tournamentTable = 'tournament_table';
  static const String kitchen = 'kitchen';
  static const String sideGame = 'side_game';
  static const String storeManagement = 'store_management';

  static const List<String> all = <String>[
    order,
    userEntryExit,
    staffEntryExit,
    accounting,
    tournament,
    tournamentTable,
    kitchen,
    sideGame,
    storeManagement,
  ];

  /// 排他グループ: 同時に1つしか選択できないオプションのグループ
  static const List<List<String>> exclusiveGroups = [
    [tournament, tournamentTable],
  ];

  /// 卓紐づけが可能なオプション
  static const List<String> tableBindableOptions = [
    tournamentTable,
    sideGame,
  ];

  static const Map<String, String> labels = <String, String>{
    order: '注文操作',
    userEntryExit: 'お客様入退店操作',
    staffEntryExit: 'スタッフ出退勤操作',
    accounting: '会計操作',
    tournament: 'トーナメント運営',
    tournamentTable: 'トーナメント卓専用',
    kitchen: 'キッチン画面操作',
    sideGame: 'サイドゲーム操作',
    storeManagement: '営業管理',
  };

  static String label(String key) {
    return labels[key] ?? key;
  }

  static const Map<String, String> descriptions = <String, String>{
    order: '注文の作成・カート操作・注文確定・注文履歴の閲覧など、売上に関わる一連の注文操作を行えます。',
    userEntryExit: '来店・退店の受付（ユーザー側）に関する操作が可能になります。QRの受付や入店管理等を含みます。',
    staffEntryExit: 'スタッフの出勤・退勤打刻や、その受付に関する操作が可能になります。',
    accounting: '会計画面の表示、金額入力、割引・割勘・支払方法の確定など会計処理全般を行えます。',
    tournament: 'トーナメントの作成・開始/一時停止/再開、全卓の管理、ブラインドタイマー操作など運営全般が可能です。',
    tournamentTable: '指定された卓の詳細ページのみ表示・操作できます。卓番を指定するとその卓専用になります。',
    kitchen: 'キッチン向けの調理・提供状況管理画面にアクセスし、注文ステータスの更新（調理中/提供済み等）ができます。',
    sideGame: 'サイドゲームの参加/離席、チップの入出金、ステータス更新などの操作が可能になります。卓番を指定するとその卓専用になります。',
    storeManagement: '営業時間・開店・閉店など店舗の営業状態の管理操作が可能になります。',
  };

  static String description(String key) {
    return descriptions[key] ?? 'この操作に関する詳細な説明は現在準備中です。';
  }

  /// 指定キーと排他関係にあるキーを取得
  static List<String> getExclusiveKeys(String key) {
    for (final group in exclusiveGroups) {
      if (group.contains(key)) {
        return group.where((k) => k != key).toList();
      }
    }
    return [];
  }

  /// 卓紐づけが可能かどうか
  static bool isTableBindable(String key) {
    return tableBindableOptions.contains(key);
  }
}


