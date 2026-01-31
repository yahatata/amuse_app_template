# Phase3: UI改修（当日画面） - 実装詳細仕様書

## 概要

Phase3では、当日画面（現在営業日のデータを表示するUI）を改修し、`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得するように変更する。また、`_getBusinessDate()`等の削除・置き換え、タブ/プルダウンの翌日・期間表示の改修（`currentBusinessDateKey`起点）を行う。

## 実装タスク

### 0. Phase3の対象範囲

**Phase3の対象**:
- **当日画面**（現在営業日のデータを表示するUI）
  - `lib/Accounting/accountingPage.dart`
  - `lib/user_actions/order_history_popup.dart`
  - `lib/user_actions/tournament_history_popup.dart`
  - `lib/OrderView/OrderManagement/order_management_page.dart`

**Phase3の対象外**（Phase4で対応）:
- **日付選択画面**（ユーザーが日付を選択するUI）
  - `lib/Accounting/accountingHistoryPage.dart` - 日付選択画面（初期化時のみ`storeMeta/currentBusinessDay`をsnapshot購読）
  - `lib/Accounting/postAccountingAdjustmentsPage.dart` - 日付選択画面（初期化時のみ`storeMeta/currentBusinessDay`をsnapshot購読）
  - `lib/Accounting/accountingEditDialog.dart` - 日付選択画面（`scheduledTournaments`の範囲クエリ）

**注意事項**:
- `lib/Home/systemSettingsPage.dart`は`STORE_CLOSE_HOUR`を使用していますが、これは移管処理（マイグレーション）のためのもので、Phase3の対象外です。

---

### 1. 共通ヘルパー関数の作成（オプション）

#### 1.1 `lib/utils/current_business_date_helper.dart`（新規作成、オプション）

**実装内容**:
- `storeMeta/currentBusinessDay`をsnapshot購読する共通ヘルパー関数を提供
- 複数のファイルで同じパターンを使用する場合、共通化を検討
- **注意**: 各ファイルで直接`StreamBuilder`を使用する方がシンプルな場合は、共通化は不要

**実装例（参考）**:
```dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// storeMeta/currentBusinessDayをsnapshot購読してcurrentBusinessDateKeyを取得するStream
Stream<String?> getCurrentBusinessDateKeyStream() {
  return FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .snapshots()
      .map((snapshot) {
    if (!snapshot.exists) return null;
    final data = snapshot.data();
    return data?['currentBusinessDateKey'] as String?;
  });
}
```

**判断基準**:
- 3つ以上のファイルで同じパターンを使用する場合: 共通化を検討
- 2つ以下のファイルの場合: 各ファイルで直接実装（共通化不要）

---

### 2. `lib/Accounting/accountingPage.dart`の改修

#### 2.1 現状確認

**ファイル**: `lib/Accounting/accountingPage.dart`

**現状**:
- `_getBusinessDate()`メソッド（60-72行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用して営業日を計算
- 81行目（`_loadActiveBills()`）と134行目（`_loadSettledBills()`）で`businessDate`を使用してクエリ
- タブあり（未会計・会計完了）、当日のみ表示（翌日・期間表示機能は現状なし）

**課題**:
- `GlobalConstants.STORE_CLOSE_HOUR`を直接使用しているため、営業時間の変更に対応できない
- 25:00問題の再発防止のため、暦日ベースの計算を禁止する必要がある

#### 2.2 実装内容

**修正箇所**:
1. **`_getBusinessDate()`メソッドの削除**（60-72行目）
2. **`storeMeta/currentBusinessDay`のsnapshot購読を追加**
   - `StreamBuilder`を使用して`currentBusinessDateKey`を取得
   - `status === 'running'`かつ`currentBusinessDateKey !== null`の場合のみ、クエリを実行
   - `status === 'closed'`または`currentBusinessDateKey === null`の場合は、「閉店中」と表示（body部分を薄いグレーアウト）
3. **`_loadActiveBills()`の修正**（81行目）
   - `_getBusinessDate()`の呼び出しを削除
   - `currentBusinessDateKey`を使用してクエリ
4. **`_loadSettledBills()`の修正**（134行目）
   - `_getBusinessDate()`の呼び出しを削除
   - `currentBusinessDateKey`を使用してクエリ

**実装パターン**:
```dart
StreamBuilder<DocumentSnapshot>(
  stream: FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .snapshots(),
  builder: (context, snapshot) {
    if (!snapshot.hasData) {
      return const Center(child: CircularProgressIndicator());
    }
    
    final data = snapshot.data?.data() as Map<String, dynamic>?;
    final status = data?['status'] as String?;
    final currentBusinessDateKey = data?['currentBusinessDateKey'] as String?;
    
    if (status != 'running' || currentBusinessDateKey == null) {
      // 閉店中は「閉店中」と表示（body部分を薄いグレーアウト）
      return Container(
        color: Colors.grey.withOpacity(0.3),
        child: const Center(
          child: Text(
            '閉店中',
            style: TextStyle(fontSize: 18, color: Colors.grey),
          ),
        ),
      );
    }
    
    // currentBusinessDateKeyを使用してクエリ
    return FutureBuilder<QuerySnapshot>(
      future: _firestore
          .collection('bills')
          .where('businessDate', isEqualTo: currentBusinessDateKey)
          .where('status', whereIn: ['open', 'settling'])
          .get(),
      builder: (context, billsSnapshot) {
        // ... 既存の表示ロジック
      },
    );
  },
)
```

**注意事項**:
- `StreamBuilder`のネストを避けるため、`StreamBuilder`と`FutureBuilder`の組み合わせを検討
- または、`StreamBuilder`で`currentBusinessDateKey`を取得し、`StreamBuilder`内で`StreamBuilder`を使用してbillsを購読する方法も検討可能
- リアルタイム性を重視する場合は、`currentBusinessDateKey`とbillsの両方を`StreamBuilder`で購読

**将来的な拡張（Phase3では実装しない）**:
- タブ/プルダウンで翌日・期間表示を追加する場合は、`currentBusinessDateKey`を起点に営業日キー列を生成
- 単純な「日付+1」は禁止（`DateTime.add(Duration(days: 1))`は暦日の繰り上がり処理のため使用可）
- 月末/年末の繰り上がりが正しく処理されることを確認

---

### 3. `lib/user_actions/order_history_popup.dart`の改修

#### 3.1 現状確認

**ファイル**: `lib/user_actions/order_history_popup.dart`

**現状**:
- `_getBusinessDate()`メソッド（39-49行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- 53行目と97行目で`businessDate`を使用してクエリ
- `StreamBuilder`を使用してbillsを購読（93-98行目）

**課題**:
- `GlobalConstants.STORE_CLOSE_HOUR`を直接使用しているため、営業時間の変更に対応できない
- 25:00問題の再発防止のため、暦日ベースの計算を禁止する必要がある

#### 3.2 実装内容

**修正箇所**:
1. **`_getBusinessDate()`メソッドの削除**（39-49行目）
2. **`storeMeta/currentBusinessDay`のsnapshot購読を追加**
   - `StreamBuilder`を使用して`currentBusinessDateKey`を取得
   - 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
   - `currentBusinessDateKey`を使用してbillsをクエリ
3. **`StreamBuilder`の修正**（93-98行目）
   - `businessDate`の取得方法を変更（`_getBusinessDate()`から`currentBusinessDateKey`または現在日時から日付を取得）

**実装パターン**:
```dart
StreamBuilder<DocumentSnapshot>(
  stream: FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .snapshots(),
  builder: (context, stateSnapshot) {
    if (!stateSnapshot.hasData) {
      return const Center(child: CircularProgressIndicator());
    }
    
    final stateData = stateSnapshot.data?.data() as Map<String, dynamic>?;
    final status = stateData?['status'] as String?;
    final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
    
    // 閉店中の場合は、現在の日時が属する日付をbusinessDateとして使用
    final businessDateKey = (status == 'running' && currentBusinessDateKey != null)
        ? currentBusinessDateKey
        : DateFormat('yyyy-MM-dd').format(DateTime.now());
    
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('bills')
          .where('party.userId', isEqualTo: userId)
          .where('businessDate', isEqualTo: businessDateKey)
          .snapshots(),
      builder: (context, billsSnapshot) {
        // ... 既存の表示ロジック
      },
    );
  },
)
```

---

### 4. `lib/user_actions/tournament_history_popup.dart`の改修

#### 4.1 現状確認

**ファイル**: `lib/user_actions/tournament_history_popup.dart`

**現状**:
- `_getBusinessDate()`メソッド（39-49行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- 53行目と97行目で`businessDate`を使用してクエリ
- `StreamBuilder`を使用してbillsを購読（93-98行目）

**課題**:
- `order_history_popup.dart`と同様の課題

#### 4.2 実装内容

**修正箇所**:
- `order_history_popup.dart`と同様の修正

**実装パターン**:
- `order_history_popup.dart`と同様のパターンを使用

---

### 5. `lib/OrderView/OrderManagement/order_management_page.dart`の改修

#### 5.1 現状確認

**ファイル**: `lib/OrderView/OrderManagement/order_management_page.dart`

**現状**:
- `_getOrdersStream()`メソッド（174-203行目）で`DateFormat('yyyyMMdd').format(DateTime.now())`を使用してカレンダー日付を生成（175行目）
- `DateTime.now().subtract(const Duration(days: 1))`で前日を計算（176行目）
- 当日と前日を複数クエリ（182行目）
- `orders/{YYYYMMDD}/_TodaysOrders`サブコレクションから取得

**課題**:
- カレンダー日付を使用しているため、営業日ベースではない
- 25:00問題の再発防止のため、暦日ベースの計算を禁止する必要がある

#### 5.2 実装内容

**修正箇所**:
1. **`_getOrdersStream()`メソッドの修正**（174-203行目）
   - `DateFormat('yyyyMMdd').format(DateTime.now())`の削除
   - `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得
   - `status === 'running'`かつ`currentBusinessDateKey !== null`の場合のみ、クエリを実行
   - `status === 'closed'`または`currentBusinessDateKey === null`の場合は、「閉店中」と表示（body部分を薄いグレーアウト）
   - `currentBusinessDateKey`を`YYYYMMDD`形式に変換（`YYYY-MM-DD` → `YYYYMMDD`）
   - 前日の計算: `currentBusinessDateKey`を起点に、`DateTime`加算で前日を計算（`DateTime.parse(currentBusinessDateKey).subtract(const Duration(days: 1))`）
   - 月末/年末の繰り上がりが正しく処理されることを確認

**実装パターン**:
```dart
StreamBuilder<DocumentSnapshot>(
  stream: FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .snapshots(),
  builder: (context, stateSnapshot) {
    if (!stateSnapshot.hasData) {
      return const Center(child: CircularProgressIndicator());
    }
    
    final stateData = stateSnapshot.data?.data() as Map<String, dynamic>?;
    final status = stateData?['status'] as String?;
    final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
    
    if (status != 'running' || currentBusinessDateKey == null) {
      // 閉店中は「閉店中」と表示（body部分を薄いグレーアウト）
      return Container(
        color: Colors.grey.withOpacity(0.3),
        child: const Center(
          child: Text(
            '閉店中',
            style: TextStyle(fontSize: 18, color: Colors.grey),
          ),
        ),
      );
    }
    
    // YYYY-MM-DD形式をYYYYMMDD形式に変換
    final today = currentBusinessDateKey.replaceAll('-', '');
    
    // 前日を計算（DateTime加算で暦日の繰り上がりを正しく処理）
    final currentDate = DateTime.parse(currentBusinessDateKey);
    final yesterdayDate = currentDate.subtract(const Duration(days: 1));
    final yesterday = DateFormat('yyyyMMdd').format(yesterdayDate);
    
    // 当日と前日の注文を取得
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: () async {
        List<Map<String, dynamic>> allOrders = [];
        
        for (final dateString in [today, yesterday]) {
          try {
            final subCollectionSnapshot = await FirebaseFirestore.instance
                .collection('orders')
                .doc(dateString)
                .collection('_TodaysOrders')
                .get();
            
            for (final doc in subCollectionSnapshot.docs) {
              final data = doc.data();
              data['id'] = doc.id;
              data['date'] = dateString;
              allOrders.add(data);
            }
          } catch (e) {
            debugPrint('注文データ取得エラー ($dateString): $e');
          }
        }
        
        return _processOrders(allOrders);
      }(),
      builder: (context, ordersSnapshot) {
        // ... 既存の表示ロジック
      },
    );
  },
)
```

**注意事項**:
- `Stream.periodic`を削除し、`storeMeta/currentBusinessDay`のsnapshot購読に変更
- `currentBusinessDateKey`が変更された場合（開店/閉店時）に自動的に再取得される（`StreamBuilder`で`storeMeta/currentBusinessDay`を購読しているため）
- 注文データは`FutureBuilder`で一度だけ取得（リアルタイム更新は不要）
- 前日の計算は暦日ベース（休業日考慮は今回はしない）

---

### 6. 営業日キー列生成ヘルパー関数の作成（オプション）

#### 6.1 `lib/utils/business_date_key_helper.dart`（新規作成、オプション）

**実装内容**:
- `currentBusinessDateKey`を起点に、前日/翌日/期間の営業日キー列を生成するヘルパー関数
- 複数のファイルで同じパターンを使用する場合、共通化を検討

**実装例（参考）**:
```dart
import 'package:intl/intl.dart';

/// currentBusinessDateKeyを起点に、前日を計算
/// 
/// [currentBusinessDateKey] YYYY-MM-DD形式の営業日キー
/// 戻り値: 前日の営業日キー（YYYY-MM-DD形式）
String getPreviousBusinessDateKey(String currentBusinessDateKey) {
  final currentDate = DateTime.parse(currentBusinessDateKey);
  final previousDate = currentDate.subtract(const Duration(days: 1));
  return DateFormat('yyyy-MM-dd').format(previousDate);
}

/// currentBusinessDateKeyを起点に、翌日を計算
/// 
/// [currentBusinessDateKey] YYYY-MM-DD形式の営業日キー
/// 戻り値: 翌日の営業日キー（YYYY-MM-DD形式）
String getNextBusinessDateKey(String currentBusinessDateKey) {
  final currentDate = DateTime.parse(currentBusinessDateKey);
  final nextDate = currentDate.add(const Duration(days: 1));
  return DateFormat('yyyy-MM-dd').format(nextDate);
}

/// currentBusinessDateKeyを起点に、期間の営業日キー列を生成
/// 
/// [currentBusinessDateKey] YYYY-MM-DD形式の営業日キー
/// [daysBefore] 前日数（デフォルト: 0）
/// [daysAfter] 翌日数（デフォルト: 0）
/// 戻り値: 営業日キー列（YYYY-MM-DD形式の文字列配列）
List<String> generateBusinessDateKeyRange(
  String currentBusinessDateKey, {
  int daysBefore = 0,
  int daysAfter = 0,
}) {
  final currentDate = DateTime.parse(currentBusinessDateKey);
  final List<String> keys = [];
  
  // 前日
  for (int i = daysBefore; i > 0; i--) {
    final date = currentDate.subtract(Duration(days: i));
    keys.add(DateFormat('yyyy-MM-dd').format(date));
  }
  
  // 当日
  keys.add(currentBusinessDateKey);
  
  // 翌日
  for (int i = 1; i <= daysAfter; i++) {
    final date = currentDate.add(Duration(days: i));
    keys.add(DateFormat('yyyy-MM-dd').format(date));
  }
  
  return keys;
}

/// YYYY-MM-DD形式の営業日キーをYYYYMMDD形式に変換
/// 
/// [businessDateKey] YYYY-MM-DD形式の営業日キー
/// 戻り値: YYYYMMDD形式の文字列（ordersコレクションのドキュメントID用）
String formatBusinessDateKeyForOrders(String businessDateKey) {
  return businessDateKey.replaceAll('-', '');
}
```

**判断基準**:
- 3つ以上のファイルで同じパターンを使用する場合: 共通化を検討
- 2つ以下のファイルの場合: 各ファイルで直接実装（共通化不要）

---

## 実装のポイント

### 1. snapshot購読のパターン

**パターンA: StreamBuilderのネスト**
```dart
StreamBuilder<DocumentSnapshot>(
  stream: FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .snapshots(),
  builder: (context, stateSnapshot) {
    // ... stateSnapshotからcurrentBusinessDateKeyを取得
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('bills')
          .where('businessDate', isEqualTo: currentBusinessDateKey)
          .snapshots(),
      builder: (context, billsSnapshot) {
        // ... 表示ロジック
      },
    );
  },
)
```

**パターンB: StreamBuilderとFutureBuilderの組み合わせ**
```dart
StreamBuilder<DocumentSnapshot>(
  stream: FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .snapshots(),
  builder: (context, stateSnapshot) {
    // ... stateSnapshotからcurrentBusinessDateKeyを取得
    return FutureBuilder<QuerySnapshot>(
      future: FirebaseFirestore.instance
          .collection('bills')
          .where('businessDate', isEqualTo: currentBusinessDateKey)
          .get(),
      builder: (context, billsSnapshot) {
        // ... 表示ロジック
      },
    );
  },
)
```

**選択基準**:
- リアルタイム性が重要（billsの変更もリアルタイムに反映したい）: パターンA
- リアルタイム性が不要（state docの変更のみ反映すれば良い）: パターンB

### 2. エラーハンドリング

**`accountingPage.dart`と`order_management_page.dart`の場合**:
- `status === 'closed'`または`currentBusinessDateKey === null`の場合、「閉店中」と表示（body部分を薄いグレーアウト）
- エラーとして扱わない（正常な状態）

**`order_history_popup.dart`と`tournament_history_popup.dart`の場合**:
- `status === 'closed'`または`currentBusinessDateKey === null`の場合、現在の日時が属する日付を`businessDate`として使用
- エラーとして扱わない（正常な状態）

**state docが存在しない場合**:
- 初期化が必要である旨のメッセージを表示
- または空のリストを表示

### 3. 前日/翌日の計算

**実装方法**:
- `DateTime.parse(currentBusinessDateKey)`で`DateTime`に変換
- `DateTime.add(Duration(days: 1))`または`DateTime.subtract(Duration(days: 1))`で加減算
- `DateFormat('yyyy-MM-dd').format(date)`で`YYYY-MM-DD`形式に変換

**注意事項**:
- 月末/年末の繰り上がりが正しく処理される（`DateTime`加算が自動的に処理）
- 休業日（`isClosed`）のスキップは行わない（前日/翌日は暦日ベース）
- 単純な「日付+1」は禁止（`DateTime.add(Duration(days: 1))`は暦日の繰り上がり処理のため使用可）

### 4. ordersコレクションのドキュメントID変換

**実装方法**:
- `currentBusinessDateKey`（`YYYY-MM-DD`形式）を`YYYYMMDD`形式に変換
- `businessDateKey.replaceAll('-', '')`を使用

**注意事項**:
- `orders/{YYYYMMDD}/_TodaysOrders`サブコレクションから取得するため、ドキュメントIDは`YYYYMMDD`形式である必要がある

---

## 作成・修正ファイル一覧

### 新規作成ファイル（オプション）
1. `lib/utils/current_business_date_helper.dart` - `storeMeta/currentBusinessDay`をsnapshot購読する共通ヘルパー関数（オプション）
2. `lib/utils/business_date_key_helper.dart` - 営業日キー列生成ヘルパー関数（オプション）

### 修正ファイル
1. `lib/Accounting/accountingPage.dart` - `_getBusinessDate()`の削除、`storeMeta/currentBusinessDay`のsnapshot購読
2. `lib/user_actions/order_history_popup.dart` - `_getBusinessDate()`の削除、`storeMeta/currentBusinessDay`のsnapshot購読
3. `lib/user_actions/tournament_history_popup.dart` - `_getBusinessDate()`の削除、`storeMeta/currentBusinessDay`のsnapshot購読
4. `lib/OrderView/OrderManagement/order_management_page.dart` - `DateFormat('yyyyMMdd').format(DateTime.now())`の削除、`storeMeta/currentBusinessDay`のsnapshot購読、前日の計算を`currentBusinessDateKey`起点に変更

---

## 実装の注意事項

### 1. リアルタイム性の確保
- `storeMeta/currentBusinessDay`をsnapshot購読することで、開店/閉店時に自動的にUIが更新される
- `StreamBuilder`を使用してリアルタイムに反映

### 2. エラー状態の扱い
- `status === 'error'`の場合、適切なエラーメッセージを表示
- `currentBusinessDateKey === null`の場合、空のリストを表示（または適切なメッセージ）

### 3. パフォーマンス
- `storeMeta/currentBusinessDay`は単一ドキュメントのため、snapshot購読のコストは低い
- ただし、更新頻度が高い場合は、更新コストに注意する

### 4. テスト観点
- 開店/閉店時のUI更新確認
- `status === 'closed'`時の動作確認
- `status === 'error'`時の動作確認
- 前日/翌日の計算が正しく動作することを確認（月末/年末の繰り上がり）

---

## 実装順序

1. 共通ヘルパー関数の作成（オプション、必要に応じて）
2. `lib/Accounting/accountingPage.dart`の改修
3. `lib/user_actions/order_history_popup.dart`の改修
4. `lib/user_actions/tournament_history_popup.dart`の改修
5. `lib/OrderView/OrderManagement/order_management_page.dart`の改修
6. 動作確認（開店/閉店時のUI更新、エラー状態の表示）

---

## 実装後の動作

### 正常系
1. **開店時**:
   - `storeMeta/currentBusinessDay`の`status`が`'running'`に変更
   - `currentBusinessDateKey`が設定される
   - UIが自動的に更新され、新しい営業日のデータが表示される

2. **閉店時**:
   - `storeMeta/currentBusinessDay`の`status`が`'closed'`に変更
   - `currentBusinessDateKey`が`null`になる
   - UIが自動的に更新される
   - `accountingPage.dart`と`order_management_page.dart`の場合、「閉店中」と表示（body部分を薄いグレーアウト）
   - `order_history_popup.dart`と`tournament_history_popup.dart`の場合、現在の日時が属する日付を`businessDate`として使用してクエリ

### エラー系
1. **status === 'error'の場合**:
   - 適切なエラーメッセージを表示
   - 空のリストを表示（または適切なメッセージ）

2. **state docが存在しない場合**:
   - 初期化が必要である旨のメッセージを表示
   - または空のリストを表示

---

## 次のステップ

1. Phase4: UI改修（予定・任意日時）の実装
2. Phase5: 自動開閉店の実装
3. Phase6: テスト・検証
