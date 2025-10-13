/// 座席決定ロジック
/// 
/// リシート時の座席割り当ての優先順位を決定する
class SeatDecisionLogic {
  /// 座席を優先順位付けして返す
  /// 
  /// [currentSeats]: 現在の座席状態 (Map<int, bool> - seatNumber -> isOccupied)
  /// [maxSeats]: テーブルの最大座席数
  /// 
  /// 戻り値: 優先順位順の座席番号リスト
  static List<int> getPrioritizedSeats({
    required Map<int, bool> currentSeats,
    required int maxSeats,
  }) {
    print('=== getPrioritizedSeats 開始 ===');
    print('maxSeats: $maxSeats');
    print('currentSeats: $currentSeats');
    
    // 空席のみを対象
    final emptySeats = <int>[];
    for (int seat = 1; seat <= maxSeats; seat++) {
      if (!(currentSeats[seat] ?? false)) {
        emptySeats.add(seat);
      }
    }
    
    print('空席リスト: $emptySeats');
    
    if (emptySeats.isEmpty) {
      return [];
    }
    
    // 優先度1: 両隣が空席（端以外）
    final priority1BothNeighborsEmpty = <int>[];
    for (final seat in emptySeats) {
      final hasBothEmpty = _hasBothNeighborsEmpty(seat, currentSeats, maxSeats);
      print('座席$seat: 両隣が空席 = $hasBothEmpty');
      if (hasBothEmpty) {
        priority1BothNeighborsEmpty.add(seat);
      }
    }
    print('優先度1（両隣が空席・端以外）: $priority1BothNeighborsEmpty');
    
    // 優先度1.5: 端の座席で隣が空席（座席1または座席maxSeats）
    final priority1_5EdgeWithEmptyNeighbor = <int>[];
    for (final seat in emptySeats) {
      if (seat == 1 || seat == maxSeats) {
        if (_hasAtLeastOneNeighborEmpty(seat, currentSeats, maxSeats)) {
          priority1_5EdgeWithEmptyNeighbor.add(seat);
        }
      }
    }
    print('優先度1.5（端の座席・隣が空席）: $priority1_5EdgeWithEmptyNeighbor');
    
    // 優先度2: 片隣のみ空席（端以外）
    final priority2OneNeighborEmpty = <int>[];
    for (final seat in emptySeats) {
      if (!priority1BothNeighborsEmpty.contains(seat) &&
          !priority1_5EdgeWithEmptyNeighbor.contains(seat)) {
        if (_hasAtLeastOneNeighborEmpty(seat, currentSeats, maxSeats)) {
          priority2OneNeighborEmpty.add(seat);
        }
      }
    }
    print('優先度2（片隣が空席・端以外）: $priority2OneNeighborEmpty');
    
    // 優先度3: 両隣に人がいる座席
    final priority3BothNeighborsOccupied = <int>[];
    for (final seat in emptySeats) {
      if (!priority1BothNeighborsEmpty.contains(seat) &&
          !priority1_5EdgeWithEmptyNeighbor.contains(seat) &&
          !priority2OneNeighborEmpty.contains(seat)) {
        priority3BothNeighborsOccupied.add(seat);
      }
    }
    print('優先度3（両隣に人）: $priority3BothNeighborsOccupied');
    
    // 各優先度グループ内で中央に近い順にソート
    final center = maxSeats / 2.0;
    
    priority1BothNeighborsEmpty.sort((a, b) {
      final distA = (a - center).abs();
      final distB = (b - center).abs();
      final comparison = distA.compareTo(distB);
      // 距離が同じ場合は小さい番号を優先（実装の簡易化）
      return comparison != 0 ? comparison : a.compareTo(b);
      
      // 他の選択肢（コメントアウト）:
      // - ランダム: return comparison != 0 ? comparison : Random().nextBool() ? -1 : 1;
      // - 大きい番号優先: return comparison != 0 ? comparison : b.compareTo(a);
    });
    
    priority1_5EdgeWithEmptyNeighbor.sort((a, b) {
      final distA = (a - center).abs();
      final distB = (b - center).abs();
      final comparison = distA.compareTo(distB);
      return comparison != 0 ? comparison : a.compareTo(b);
    });
    
    priority2OneNeighborEmpty.sort((a, b) {
      final distA = (a - center).abs();
      final distB = (b - center).abs();
      final comparison = distA.compareTo(distB);
      return comparison != 0 ? comparison : a.compareTo(b);
    });
    
    priority3BothNeighborsOccupied.sort((a, b) {
      final distA = (a - center).abs();
      final distB = (b - center).abs();
      final comparison = distA.compareTo(distB);
      return comparison != 0 ? comparison : a.compareTo(b);
    });
    
    // 優先順位順に結合
    final result = [
      ...priority1BothNeighborsEmpty,
      ...priority1_5EdgeWithEmptyNeighbor,
      ...priority2OneNeighborEmpty,
      ...priority3BothNeighborsOccupied,
    ];
    
    print('最終的な座席順序: $result');
    print('=== getPrioritizedSeats 終了 ===\n');
    
    return result;
  }
  
  /// 両隣が空席かチェック
  /// 
  /// 条件: 左右両方に座席が存在し、かつ両方とも空席
  static bool _hasBothNeighborsEmpty(
    int seatNumber,
    Map<int, bool> currentSeats,
    int maxSeats,
  ) {
    // 左隣の座席番号
    final leftSeat = seatNumber - 1;
    // 右隣の座席番号
    final rightSeat = seatNumber + 1;
    
    // 左隣が存在するか
    final hasLeftSeat = leftSeat >= 1;
    // 右隣が存在するか
    final hasRightSeat = rightSeat <= maxSeats;
    
    // 両方に座席が存在しない場合はfalse
    if (!hasLeftSeat || !hasRightSeat) {
      return false;
    }
    
    // 左隣が空席か
    final leftEmpty = !(currentSeats[leftSeat] ?? false);
    // 右隣が空席か
    final rightEmpty = !(currentSeats[rightSeat] ?? false);
    
    // 両方空席の場合のみtrue
    return leftEmpty && rightEmpty;
  }
  
  /// 少なくとも片隣が空席かチェック
  /// 
  /// 条件: 左隣または右隣が空席
  static bool _hasAtLeastOneNeighborEmpty(
    int seatNumber,
    Map<int, bool> currentSeats,
    int maxSeats,
  ) {
    // 左隣の座席番号
    final leftSeat = seatNumber - 1;
    // 右隣の座席番号
    final rightSeat = seatNumber + 1;
    
    // 左隣が存在し、かつ空席か
    final leftEmpty = leftSeat >= 1 && !(currentSeats[leftSeat] ?? false);
    // 右隣が存在し、かつ空席か
    final rightEmpty = rightSeat <= maxSeats && !(currentSeats[rightSeat] ?? false);
    
    // どちらか一方でも空席ならtrue
    return leftEmpty || rightEmpty;
  }
  
  /// テーブルごとの人数を振り分ける
  /// 
  /// [totalPlayers]: リシート対象の総人数
  /// [tables]: テーブルリスト（maxSeatsを持つ）
  /// 
  /// 戻り値: テーブルごとの割り当て人数 (Map<String, int> - tableId -> playerCount)
  static Map<String, int> distributePlayersAcrossTables({
    required int totalPlayers,
    required List<TableInfo> tables,
  }) {
    print('\n=== distributePlayersAcrossTables 開始 ===');
    print('総プレイヤー数: $totalPlayers');
    print('テーブル数: ${tables.length}');
    
    final distribution = <String, int>{};
    
    if (tables.isEmpty) {
      print('テーブルが0個のため、空のMapを返す');
      return distribution;
    }
    
    // 総座席数を計算
    final totalSeats = tables.fold<int>(0, (sum, table) => sum + table.maxSeats);
    print('総座席数: $totalSeats');
    
    // 総座席数が不足している場合はエラー
    if (totalPlayers > totalSeats) {
      print('エラー: プレイヤー数($totalPlayers) > 総座席数($totalSeats)');
      throw Exception('利用可能座席数に対して、リシートの対象とする人数が多すぎます');
    }
    
    // テーブルをmaxSeatsでソート（小さい順）
    final sortedTables = List<TableInfo>.from(tables)
      ..sort((a, b) => a.maxSeats.compareTo(b.maxSeats));
    
    print('ソート後のテーブル順:');
    for (var table in sortedTables) {
      print('  ${table.tableId}: maxSeats = ${table.maxSeats}');
    }
    
    int remainingPlayers = totalPlayers;
    int remainingTables = sortedTables.length;
    
    for (final table in sortedTables) {
      // 残りのテーブルで均等に割り振る
      final averagePerTable = (remainingPlayers / remainingTables).ceil();
      
      print('\nテーブル ${table.tableId}:');
      print('  残りプレイヤー: $remainingPlayers');
      print('  残りテーブル数: $remainingTables');
      print('  平均割り当て: $averagePerTable');
      print('  maxSeats: ${table.maxSeats}');
      
      // maxSeatsを超えないように割り当て
      final assignedPlayers = averagePerTable > table.maxSeats 
          ? table.maxSeats 
          : averagePerTable;
      
      print('  → 割り当て人数: $assignedPlayers');
      
      distribution[table.tableId] = assignedPlayers;
      
      remainingPlayers -= assignedPlayers;
      remainingTables--;
    }
    
    print('\n最終的な振り分け: $distribution');
    print('=== distributePlayersAcrossTables 終了 ===\n');
    
    return distribution;
  }
}

/// テーブル情報
class TableInfo {
  final String tableId;
  final int maxSeats;
  
  const TableInfo({
    required this.tableId,
    required this.maxSeats,
  });
}

// ========================================
// 座席優先順位ロジック（案1: 端の座席を優先度1.5に設定）
// ========================================
//
// 【現在の実装ロジック】
//
// ★重要: プレイヤーは1人ずつ順番に配置され、各配置の前に現在の座席状態を
//        考慮して優先座席リストを再計算する。
//        既に配置された座席は「人がいる」として扱われるため、隣接する座席の
//        優先度が動的に変化する。
//
// ■ 優先度1: 両隣が空席（端以外）
//   対象座席: 座席2〜(maxSeats-1)
//   条件: 左隣（座席番号-1）が空席 AND 右隣（座席番号+1）が空席
//   ソート: 中央に近い順
//   
//   ★動的な変化の例（10人卓）:
//     
//     初期状態（全席空席）:
//       優先度1: [2,3,4,5,6,7,8,9]
//       ソート: [5, 4, 6, 3, 7, 2, 8, 9]
//       → 座席5を配置
//     
//     座席5配置後:
//       状態: [_, _, _, _, 人, _, _, _, _, _]
//       座席4: 左隣(03)=空、右隣(05)=人 → 片隣のみ（優先度1から除外）
//       座席6: 左隣(05)=人、右隣(07)=空 → 片隣のみ（優先度1から除外）
//       優先度1: [2,3,7,8,9]
//       ソート: [3, 7, 2, 8, 9]
//       → 座席3を配置
//     
//     座席3配置後:
//       状態: [_, _, 人, _, 人, _, _, _, _, _]
//       座席2: 左隣なし、右隣(03)=人 → 除外
//       座席4: 左隣(03)=人、右隣(05)=人 → 両隣に人（除外）
//       優先度1: [7,8,9]
//       → 座席7を配置
//     
//     座席7配置後:
//       状態: [_, _, 人, _, 人, _, 人, _, _, _]
//       座席6: 左隣(05)=人、右隣(07)=人 → 両隣に人（除外）
//       座席8: 左隣(07)=人、右隣(09)=空 → 片隣のみ（除外）
//       優先度1: [9]
//       → 座席9を配置
//     
//     座席9配置後:
//       状態: [_, _, 人, _, 人, _, 人, _, 人, _]
//       優先度1: なし（すべて片隣に人がいる）
//       → 優先度1.5へ
//
// ■ 優先度1.5: 端の座席で隣が空席
//   対象座席: 座席1 または 座席maxSeats
//   条件: 隣の座席が空席
//   ソート: 中央に近い順
//   
//   例（上記の続き）:
//     状態: [_, _, 人, _, 人, _, 人, _, 人, _]
//     座席1: 右隣(02)=空 → 優先度1.5 ✅
//     座席10: 左隣(09)=人 → 隣に人がいるため除外
//     → 座席1を配置
//
// ■ 優先度2: 片隣のみ空席（端以外）
//   対象座席: 座席2〜(maxSeats-1)で、優先度1に該当しない座席
//   条件: 左隣または右隣のどちらか一方が空席
//   ソート: 中央に近い順
//
// ■ 優先度3: 両隣に人がいる座席
//   対象座席: 上記のどの優先度にも該当しない空席
//   条件: 左右の隣に人がいる
//   ソート: 中央に近い順
//
// ========================================
// 配置例（10人卓に5人配置）- 詳細
// ========================================
//
// 1人目: 座席5（優先度1、中央）
//   [_, _, _, _, 人, _, _, _, _, _]
//   優先度1の次候補: 座席3, 7（座席4, 6は除外）
//
// 2人目: 座席3（優先度1、距離2.0）
//   [_, _, 人, _, 人, _, _, _, _, _]
//   優先度1の次候補: 座席7, 9（座席2, 4は除外）
//
// 3人目: 座席7（優先度1、距離2.0）
//   [_, _, 人, _, 人, _, 人, _, _, _]
//   優先度1の次候補: 座席9のみ
//
// 4人目: 座席9（優先度1、距離4.0）
//   [_, _, 人, _, 人, _, 人, _, 人, _]
//   優先度1: なし → 優先度1.5へ
//
// 5人目: 座席1（優先度1.5、端・右隣が空席）
//   [人, _, 人, _, 人, _, 人, _, 人, _]
//
// 最終配置: [人, 空, 人, 空, 人, 空, 人, 空, 人, 空]
//           01  02  03  04  05  06  07  08  09  10
//
// ========================================
// 配置例（10人卓に8人配置）
// ========================================
//
// 配置順序: 5 → 3 → 7 → 9 → 1 → 2 → 4 → 6
//
// 1人目: 座席5（優先度1）
//   [_, _, _, _, 人, _, _, _, _, _]
//
// 2人目: 座席3（優先度1、座席4,6除外）
//   [_, _, 人, _, 人, _, _, _, _, _]
//
// 3人目: 座席7（優先度1）
//   [_, _, 人, _, 人, _, 人, _, _, _]
//
// 4人目: 座席9（優先度1）
//   [_, _, 人, _, 人, _, 人, _, 人, _]
//
// 5人目: 座席1（優先度1.5）
//   [人, _, 人, _, 人, _, 人, _, 人, _]
//
// 6人目: 座席2（優先度2、片隣空席）
//   [人, 人, 人, _, 人, _, 人, _, 人, _]
//
// 7人目: 座席4（優先度2、片隣空席）
//   [人, 人, 人, 人, 人, _, 人, _, 人, _]
//
// 8人目: 座席6（優先度2、片隣空席）
//   [人, 人, 人, 人, 人, 人, 人, _, 人, _]
//
// 最終配置: [人, 人, 人, 人, 人, 人, 人, 空, 人, 空]
//           01  02  03  04  05  06  07  08  09  10
//
// ========================================
// 配置例（10人卓に10人配置）- 満席
// ========================================
//
// 配置順序: 5 → 3 → 7 → 9 → 1 → 2 → 4 → 6 → 8 → 10
//
// 最終配置: [人, 人, 人, 人, 人, 人, 人, 人, 人, 人]
//           01  02  03  04  05  06  07  08  09  10
//
// ========================================
// テーブル間の振り分けロジック
// ========================================
//
// 基本方針: 各テーブルに均等に振り分け（1人差まで許容）
// 
// アルゴリズム:
//   1. テーブルをmaxSeatsの小さい順にソート
//   2. 残りプレイヤー数 ÷ 残りテーブル数（切り上げ）= 割り当て人数
//   3. maxSeatsを超えない範囲で割り当て
//   4. 次のテーブルへ
//
// 例1: 3テーブル（全て10人卓）、22人
//   Table1: ceil(22/3) = 8人 → 8人割り当て（残り14人）
//   Table2: ceil(14/2) = 7人 → 7人割り当て（残り7人）
//   Table3: ceil(7/1) = 7人 → 7人割り当て（残り0人）
//   結果: [8, 7, 7] ← 1人差OK
//   
//   各テーブルの配置:
//     Table1 (8人): 5→3→7→9→1→2→4→6
//       最終: [人, 人, 人, 人, 人, 人, 人, _, 人, _]
//             01  02  03  04  05  06  07  08  09  10
//       空席: 座席08, 10
//     
//     Table2 (7人): 5→3→7→9→1→2→4
//       最終: [人, 人, 人, 人, 人, _, 人, _, 人, _]
//             01  02  03  04  05  06  07  08  09  10
//       空席: 座席06, 08, 10
//     
//     Table3 (7人): 5→3→7→9→1→2→4
//       最終: [人, 人, 人, 人, 人, _, 人, _, 人, _]
//             01  02  03  04  05  06  07  08  09  10
//       空席: 座席06, 08, 10
//
// 例2: 3テーブル（A=8人卓, B・C=10人卓）、27人
//   TableA: ceil(27/3) = 9人 → maxSeats(8)超えるので8人（残り19人）
//   TableB: ceil(19/2) = 10人 → 10人割り当て（残り9人）
//   TableC: ceil(9/1) = 9人 → 9人割り当て（残り0人）
//   結果: [8, 10, 9] ← 2人差OK（小さいテーブルは満席）
//   
//   各テーブルの配置:
//     TableA (8人): 4→3→5→2→6→1→7→8
//       最終: [人, 人, 人, 人, 人, 人, 人, 人]
//             01  02  03  04  05  06  07  08
//       ← 満席（中央=4.0）
//     
//     TableB (10人): 5→3→7→9→1→2→4→6→8→10
//       最終: [人, 人, 人, 人, 人, 人, 人, 人, 人, 人]
//             01  02  03  04  05  06  07  08  09  10
//       ← 満席
//     
//     TableC (9人): 5→3→7→9→1→2→4→6→8
//       最終: [人, 人, 人, 人, 人, 人, 人, 人, 人, _]
//             01  02  03  04  05  06  07  08  09  10
//       空席: 座席10のみ
//
// ========================================
//
// 【案1の特徴】
//
// ✅ メリット:
//   - 両隣が空席の座席を優先し、プレイヤーの快適性を最大化
//   - 1人ずつ動的に座席を決定するため、最適な配置が実現される
//   - 端の座席は優先度1の座席が埋まった後に使用される
//   - 座席が等間隔に配置される（1席おきの配置）
//
// ❌ デメリット:
//   - 8人以下の配置では端の座席（1, maxSeats）が使われない傾向
//   - 空席が端と中間に散在する（人数によっては集中しない）
//
// 💡 配置パターンの特徴:
//   - 5人配置: [人, _, 人, _, 人, _, 人, _, 人, _] ← 1席おき
//   - 8人配置: [人, 人, 人, 人, 人, 人, 人, _, 人, _] ← 座席08, 10が空席
//   - 9人配置: [人, 人, 人, 人, 人, 人, 人, 人, 人, _] ← 座席10のみ空席
//
// ========================================

