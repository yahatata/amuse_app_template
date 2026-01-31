# Phase3: UI改修（当日画面） - 実装完了サマリー

## 実装日時
2025年1月27日

## 実装内容

### 1. 概要

Phase3では、当日画面（現在営業日のデータを表示するUI）を改修し、`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得するように変更した。これにより、25:00問題の再発防止と、営業時間の変更への対応が可能になった。

### 2. 対象ファイル

以下の4つのファイルを修正：

1. `lib/Accounting/accountingPage.dart` - 会計管理画面
2. `lib/user_actions/order_history_popup.dart` - 注文履歴ポップアップ
3. `lib/user_actions/tournament_history_popup.dart` - トーナメント履歴ポップアップ
4. `lib/OrderView/OrderManagement/order_management_page.dart` - 注文管理画面

---

### 3. 実装詳細

#### 3.1 `lib/Accounting/accountingPage.dart`（修正）

**変更内容**:
- `_getBusinessDate()`メソッドを削除（`GlobalConstants.STORE_CLOSE_HOUR`を直接使用していた部分）
- `storeMeta/currentBusinessDay`をsnapshot購読する`StreamBuilder`を追加（2027-2031行目）
- `currentBusinessDateKey`と`status`を取得（2038-2039行目）
- 閉店中の表示処理を追加（2041-2051行目）
  - `status !== 'running'`または`currentBusinessDateKey === null`の場合、「閉店中」と表示（body部分を薄いグレーアウト）
- `_currentBusinessDateKey`を状態変数として保持（51行目）
- `_loadActiveBills()`と`_loadSettledBills()`を`currentBusinessDateKey`を受け取るように修正（59行目、115行目）
- `_currentBusinessDateKey`が変更された場合にのみ再読み込み（2055-2060行目）

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
    
    // 営業中の場合のみデータを読み込む
    if (_currentBusinessDateKey != currentBusinessDateKey) {
      _currentBusinessDateKey = currentBusinessDateKey;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _loadActiveBills(currentBusinessDateKey);
        _loadSettledBills(currentBusinessDateKey);
      });
    }
    
    // 通常のUIを表示
    return DefaultTabController(...);
  },
)
```

**注意事項**:
- `GlobalConstants`のインポートは残している（`SIDE_GAME_CHIP_EXCHANGE_RATE`などの他の定数で使用しているため）
- `_getBusinessDate()`メソッドは完全に削除

---

#### 3.2 `lib/user_actions/order_history_popup.dart`（修正）

**変更内容**:
- `_getBusinessDate()`メソッドを削除（`GlobalConstants.STORE_CLOSE_HOUR`を直接使用していた部分）
- `storeMeta/currentBusinessDay`をsnapshot購読する`StreamBuilder`を追加（79-83行目）
- `currentBusinessDateKey`と`status`を取得（90-91行目）
- 閉店時のフォールバック処理を追加（94-96行目）
  - `status === 'running'`かつ`currentBusinessDateKey !== null`の場合: `currentBusinessDateKey`を使用
  - それ以外（閉店中）の場合: 現在の日時が属する日付（`DateFormat('yyyy-MM-dd').format(DateTime.now())`）を使用
- `bills`コレクションのクエリで`businessDateKey`を使用（102行目）
- `businessDateKey`を`YYYYMMDD`形式に変換して`orderDocId`として使用（182行目）

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
        // 注文履歴を表示
      },
    );
  },
)
```

**注意事項**:
- 閉店中でもデータを表示可能（現在の日時が属する日付を使用）
- `intl`パッケージの`DateFormat`を使用

---

#### 3.3 `lib/user_actions/tournament_history_popup.dart`（修正）

**変更内容**:
- `_getBusinessDate()`メソッドを削除（`GlobalConstants.STORE_CLOSE_HOUR`を直接使用していた部分）
- `storeMeta/currentBusinessDay`をsnapshot購読する`StreamBuilder`を追加（79-83行目）
- `currentBusinessDateKey`と`status`を取得（90-91行目）
- 閉店時のフォールバック処理を追加（94-96行目）
  - `order_history_popup.dart`と同様の処理
- `bills`コレクションのクエリで`businessDateKey`を使用（102行目）
- インデント不整合を修正（145行目以降）

**実装パターン**:
- `order_history_popup.dart`と同様

**注意事項**:
- 閉店中でもデータを表示可能（現在の日時が属する日付を使用）
- インデント不整合を修正（145行目以降の`builder`内のコードを適切にインデント）

---

#### 3.4 `lib/OrderView/OrderManagement/order_management_page.dart`（修正）

**変更内容**:
- `DateFormat('yyyyMMdd').format(DateTime.now())`を削除（暦日ベースの計算を削除）
- `Stream.periodic`を削除（定期的な更新を削除）
- `storeMeta/currentBusinessDay`をsnapshot購読する`StreamBuilder`を追加（114-118行目）
- `currentBusinessDateKey`と`status`を取得（125-126行目）
- 閉店中の表示処理を追加（128-138行目）
  - `status !== 'running'`または`currentBusinessDateKey === null`の場合、「閉店中」と表示（body部分を薄いグレーアウト）
- 前日の計算処理を追加（225-227行目）
  - `DateTime.parse(currentBusinessDateKey).subtract(const Duration(days: 1))`を使用
  - 月末/年末の繰り上がりが自動的に処理される
  - `DateFormat('yyyyMMdd').format(yesterdayDate)`で`YYYYMMDD`形式に変換
- `_getOrdersStream()`内で`currentBusinessDateKey`を使用（208-227行目）

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
    
    // 前日の計算（DateTime加算で暦日の繰り上がりを正しく処理）
    final currentDate = DateTime.parse(currentBusinessDateKey);
    final yesterdayDate = currentDate.subtract(const Duration(days: 1));
    final yesterday = DateFormat('yyyyMMdd').format(yesterdayDate);
    
    // 当日と前日の注文を取得
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: _getOrdersStream(),
      builder: (context, snapshot) {
        // 注文一覧を表示
      },
    );
  },
)
```

**注意事項**:
- 前日の計算は`DateTime.subtract`を使用することで、月末/年末の繰り上がりが自動的に処理される
- `intl`パッケージの`DateFormat`を使用

---

### 4. 作成・修正ファイル一覧

### 修正ファイル（Dart側）
1. `lib/Accounting/accountingPage.dart` - `storeMeta/currentBusinessDay`の購読、閉店中の表示、`_getBusinessDate()`の削除
2. `lib/user_actions/order_history_popup.dart` - `storeMeta/currentBusinessDay`の購読、閉店時のフォールバック処理、`_getBusinessDate()`の削除
3. `lib/user_actions/tournament_history_popup.dart` - `storeMeta/currentBusinessDay`の購読、閉店時のフォールバック処理、`_getBusinessDate()`の削除、インデント修正
4. `lib/OrderView/OrderManagement/order_management_page.dart` - `storeMeta/currentBusinessDay`の購読、閉店中の表示、前日の計算、`DateFormat`と`Stream.periodic`の削除

---

### 5. 実装のポイント

1. **`storeMeta/currentBusinessDay`の購読**:
   - すべての当日画面で`StreamBuilder`を使用して`storeMeta/currentBusinessDay`をsnapshot購読
   - `currentBusinessDateKey`と`status`を取得して使用

2. **閉店時の処理**:
   - `accountingPage.dart`と`order_management_page.dart`: 「閉店中」と表示（body部分を薄いグレーアウト）
   - `order_history_popup.dart`と`tournament_history_popup.dart`: 現在の日時が属する日付を使用（閉店中でもデータを表示可能）

3. **前日の計算**:
   - `order_management_page.dart`で`DateTime.subtract`を使用することで、月末/年末の繰り上がりが自動的に処理される

4. **不要なコードの削除**:
   - `_getBusinessDate()`メソッドをすべて削除
   - `GlobalConstants.STORE_CLOSE_HOUR`の直接使用を削除
   - `DateFormat('yyyyMMdd').format(DateTime.now())`を削除（`order_management_page.dart`）
   - `Stream.periodic`を削除（`order_management_page.dart`）

5. **リアルタイム性**:
   - `StreamBuilder`を使用することで、`storeMeta/currentBusinessDay`の変更がリアルタイムに反映される
   - 開店/閉店の切り替え時にUIが自動更新される

---

### 6. 実装の現状とchangeSpecとの差分

### 共通ヘルパー関数の作成
- **changeSpec**: 共通ヘルパー関数の作成をオプションとして提案
- **実装**: 各ファイルで直接`StreamBuilder`を使用（共通化なし）
- **理由**: 各ファイルの実装パターンが異なり、共通化のメリットが少ないと判断

### 閉店時の処理
- **changeSpec**: `accountingPage.dart`と`order_management_page.dart`は「閉店中」と表示、`order_history_popup.dart`と`tournament_history_popup.dart`は現在の日時が属する日付を使用
- **実装**: changeSpec通りに実装

### 前日の計算
- **changeSpec**: `DateTime.subtract`を使用して月末/年末の繰り上がりを正しく処理
- **実装**: changeSpec通りに実装

---

### 7. 発見した問題と修正

#### 7.1 `lib/user_actions/tournament_history_popup.dart`のインデント不整合

**問題**:
- 145行目以降の`builder`内のコードが正しくインデントされていない

**修正内容**:
- 145-161行目のインデントを修正
- `builder: (context, tournamentsSnapshot) {`の中のコードを適切にインデント

**修正前**:
```dart
builder: (context, tournamentsSnapshot) {
if (tournamentsSnapshot.connectionState == ConnectionState.waiting) {
  return const Center(child: CircularProgressIndicator());
}
```

**修正後**:
```dart
builder: (context, tournamentsSnapshot) {
  if (tournamentsSnapshot.connectionState == ConnectionState.waiting) {
    return const Center(child: CircularProgressIndicator());
  }
```

---

### 8. 次のステップ

1. 動作確認（開店/閉店の切り替え時のUI更新、データの表示内容の正確性、リアルタイム更新の動作）
2. エラーハンドリングの確認（`storeMeta/currentBusinessDay`が存在しない場合、`status === 'error'`の場合）
3. パフォーマンスの確認（メモリリーク、不要な再取得）
4. エッジケースの確認（月末/年末の繰り上がり、タイムゾーン、ネットワークエラー）
5. 既存機能の動作確認（会計開始/完了、注文ステータス更新）

---

## 確認観点

### コード確認で完了した項目
1. `storeMeta/currentBusinessDay`の購読実装
2. `currentBusinessDateKey`と`status`の取得
3. 閉店時の処理（表示/フォールバック）
4. 不要なメソッド/コードの削除
5. `StreamBuilder`のネスト構造
6. 型安全性とnull安全性
7. インデントの修正

### 動作確認が必要な項目
1. 開店/閉店の切り替え時の動作
2. データの表示内容の正確性
3. リアルタイム更新の動作
4. エラーハンドリングの動作
5. パフォーマンス（メモリリークなど）
6. エッジケース（月末/年末、タイムゾーンなど）
7. 既存機能の動作確認（会計開始/完了、注文ステータス更新など）

詳細な確認観点については、実装完了時の確認観点まとめを参照してください。
