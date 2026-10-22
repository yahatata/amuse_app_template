# Phase3: UI改修（当日画面） - 人間確認用仕様書

## 概要

Phase3では、当日画面（現在営業日のデータを表示するUI）を改修し、`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得するように変更します。また、`_getBusinessDate()`等の削除・置き換え、タブ/プルダウンの翌日・期間表示の改修（`currentBusinessDateKey`起点）を行います。

## 実装内容

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

### 1. 当日画面の改修

#### 1.1 改修の目的

**現状の問題**:
- 当日画面で`_getBusinessDate()`や`DateTime.now()`を使用して営業日を計算している
- `GlobalConstants.STORE_CLOSE_HOUR`を直接使用しているため、営業時間の変更に対応できない
- 25:00問題の再発防止のため、暦日ベースの計算を禁止する必要がある

**改修後の動作**:
- `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得
- 開店/閉店時に自動的にUIが更新される（リアルタイム性）
- 営業時間の変更に対応できる（`businessHoursMonthlyMap`ベース）

#### 1.2 対象ファイル

**当日画面として改修が必要なファイル**:
1. `lib/Accounting/accountingPage.dart` - 会計ページ（未会計・会計完了のタブ）
2. `lib/user_actions/order_history_popup.dart` - 注文履歴ポップアップ
3. `lib/user_actions/tournament_history_popup.dart` - トーナメント履歴ポップアップ
4. `lib/OrderView/OrderManagement/order_management_page.dart` - 注文管理ページ（当日と前日を複数クエリ）

**修正内容**:
- `_getBusinessDate()`メソッドの削除
- `storeMeta/currentBusinessDay`のsnapshot購読を追加
- `currentBusinessDateKey`をクエリ条件として使用

---

### 2. `lib/Accounting/accountingPage.dart`の改修

#### 2.1 現状

- `_getBusinessDate()`メソッド（60-72行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- 81行目（`_loadActiveBills()`）と134行目（`_loadSettledBills()`）で`businessDate`を使用してクエリ
- タブあり（未会計・会計完了）、当日のみ表示

#### 2.2 改修内容

**修正箇所**:
1. `_getBusinessDate()`メソッドの削除
2. `storeMeta/currentBusinessDay`のsnapshot購読を追加
3. `_loadActiveBills()`と`_loadSettledBills()`で`currentBusinessDateKey`を使用

**実装方法**:
- `StreamBuilder`を使用して`storeMeta/currentBusinessDay`を購読
- `status === 'running'`かつ`currentBusinessDateKey !== null`の場合のみ、クエリを実行
- `status === 'closed'`または`currentBusinessDateKey === null`の場合は、「閉店中」と表示（body部分を薄いグレーアウト）

**注意事項**:
- リアルタイム性を重視する場合は、`currentBusinessDateKey`とbillsの両方を`StreamBuilder`で購読
- `StreamBuilder`のネストを避けるため、適切なパターンを選択

---

### 3. `lib/user_actions/order_history_popup.dart`の改修

#### 3.1 現状

- `_getBusinessDate()`メソッド（39-49行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- 53行目と97行目で`businessDate`を使用してクエリ
- `StreamBuilder`を使用してbillsを購読

#### 3.2 改修内容

**修正箇所**:
1. `_getBusinessDate()`メソッドの削除
2. `storeMeta/currentBusinessDay`のsnapshot購読を追加
3. `StreamBuilder`で`currentBusinessDateKey`を使用

**実装方法**:
- `StreamBuilder`のネストを使用（`storeMeta/currentBusinessDay`とbillsの両方を購読）
- 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
- `currentBusinessDateKey`を使用してbillsをクエリ（閉店中は現在日時から日付を取得）

---

### 4. `lib/user_actions/tournament_history_popup.dart`の改修

#### 4.1 現状

- `order_history_popup.dart`と同様の実装

#### 4.2 改修内容

**修正箇所**:
- `order_history_popup.dart`と同様の修正

**実装方法**:
- `order_history_popup.dart`と同様のパターンを使用

---

### 5. `lib/OrderView/OrderManagement/order_management_page.dart`の改修

#### 5.1 現状

- `DateFormat('yyyyMMdd').format(DateTime.now())`でカレンダー日付を生成（175行目）
- `DateTime.now().subtract(const Duration(days: 1))`で前日を計算（176行目）
- 当日と前日を複数クエリ
- `orders/{YYYYMMDD}/_TodaysOrders`サブコレクションから取得

#### 5.2 改修内容

**修正箇所**:
1. `DateFormat('yyyyMMdd').format(DateTime.now())`の削除
2. `storeMeta/currentBusinessDay`のsnapshot購読を追加
3. `currentBusinessDateKey`を`YYYYMMDD`形式に変換
4. 前日の計算を`currentBusinessDateKey`起点に変更

**実装方法**:
- `StreamBuilder`を使用して`storeMeta/currentBusinessDay`を購読
- `status === 'running'`かつ`currentBusinessDateKey !== null`の場合のみ、クエリを実行
- `status === 'closed'`または`currentBusinessDateKey === null`の場合は、「閉店中」と表示（body部分を薄いグレーアウト）
- `currentBusinessDateKey`を`YYYYMMDD`形式に変換（`replaceAll('-', '')`）
- 前日の計算: `DateTime.parse(currentBusinessDateKey).subtract(const Duration(days: 1))`

**注意事項**:
- 月末/年末の繰り上がりが正しく処理される（`DateTime`加算が自動的に処理）
- 前日の計算は暦日ベース（休業日考慮は今回はしない）

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

3. **営業中**:
   - `currentBusinessDateKey`を使用してクエリ
   - リアルタイムにデータが更新される（`StreamBuilder`を使用している場合）

### エラー系

1. **status === 'error'の場合**:
   - 適切なエラーメッセージを表示
   - 空のリストを表示（または適切なメッセージ）

2. **status === 'closed'またはcurrentBusinessDateKey === nullの場合**:
   - `accountingPage.dart`と`order_management_page.dart`の場合、「閉店中」と表示（body部分を薄いグレーアウト）
   - `order_history_popup.dart`と`tournament_history_popup.dart`の場合、現在の日時が属する日付を`businessDate`として使用
   - エラーとして扱わない（正常な状態）

3. **state docが存在しない場合**:
   - 初期化が必要である旨のメッセージを表示
   - または空のリストを表示

---

## 実装のポイント

### 1. リアルタイム性の確保

- `storeMeta/currentBusinessDay`をsnapshot購読することで、開店/閉店時に自動的にUIが更新される
- `StreamBuilder`を使用してリアルタイムに反映

### 2. エラー状態の扱い

- `status === 'error'`の場合、適切なエラーメッセージを表示
- `currentBusinessDateKey === null`の場合、空のリストを表示（または適切なメッセージ）
- エラーとして扱わない（正常な状態）

### 3. 前日/翌日の計算

- `currentBusinessDateKey`を起点に、`DateTime`加算で前日/翌日を計算
- 月末/年末の繰り上がりが正しく処理される
- 休業日（`isClosed`）のスキップは行わない（前日/翌日は暦日ベース）

### 4. ordersコレクションのドキュメントID変換

- `currentBusinessDateKey`（`YYYY-MM-DD`形式）を`YYYYMMDD`形式に変換
- `businessDateKey.replaceAll('-', '')`を使用

---

## 実装順序

1. 共通ヘルパー関数の作成（オプション、必要に応じて）
2. `lib/Accounting/accountingPage.dart`の改修
3. `lib/user_actions/order_history_popup.dart`の改修
4. `lib/user_actions/tournament_history_popup.dart`の改修
5. `lib/OrderView/OrderManagement/order_management_page.dart`の改修
6. 動作確認（開店/閉店時のUI更新、エラー状態の表示）

---

## 注意事項

### 1. 共通化の判断

- 3つ以上のファイルで同じパターンを使用する場合: 共通化を検討
- 2つ以下のファイルの場合: 各ファイルで直接実装（共通化不要）

### 2. パフォーマンス

- `storeMeta/currentBusinessDay`は単一ドキュメントのため、snapshot購読のコストは低い
- ただし、更新頻度が高い場合は、更新コストに注意する

### 3. テスト観点

- 開店/閉店時のUI更新確認
- `status === 'closed'`時の動作確認
- `status === 'error'`時の動作確認
- 前日/翌日の計算が正しく動作することを確認（月末/年末の繰り上がり）

---

## 次のステップ

1. Phase4: UI改修（予定・任意日時）の実装
2. Phase5: 自動開閉店の実装
3. Phase6: テスト・検証
