# Phase4: UI改修（予定・任意日時） - 人間確認用仕様書

## 概要

Phase4では、日付選択UIや予定・任意日時のデータを表示するUIを改修し、`storeMeta/currentBusinessDay`から`currentBusinessDateKey`を取得するか、現在の日時が属する日付を`businessDate`として使用してクエリするように変更します。データが既に`businessDate`フィールドを持っているため、`calcBusinessDate` Cloud Functionは不要です。

## 実装内容

### 0. Phase4の対象範囲

**Phase4の対象**:
- **日付選択画面（billsコレクション）**（ユーザーが日付を選択するUI）
  - `lib/Accounting/accountingHistoryPage.dart` - 日付選択画面（初期化時のみ`storeMeta/currentBusinessDay`をsnapshot購読）
  - `lib/Accounting/postAccountingAdjustmentsPage.dart` - 日付選択画面（初期化時のみ`storeMeta/currentBusinessDay`をsnapshot購読）
- **日付選択画面（scheduledTournamentsコレクション）**（営業時間内のトーナメントを取得）
  - `lib/Accounting/accountingEditDialog.dart` - `scheduledTournaments`の範囲クエリ（`STORE_CLOSE_HOUR`を使用して営業時間を計算）
- **予定・任意日時**（`scheduledTournaments`コレクションの表示）
  - `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` - 営業日ベースの表示に変更する場合は`businessDate`でフィルタリング
  - `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` - 営業日ベースの表示に変更する場合は`businessDate`でフィルタリング
  - `lib/tournament/pages/tournament_select_page.dart` - 営業日ベースの表示に変更する場合は`businessDate`でフィルタリング（ただし、このページは`terminalHomePage.dart`で使用されているため、削除対象外）

**Phase4の対象外**:
- **当日画面**（Phase3で対応済み）
- **attendancesコレクション**（保留中、`deferred_tasks.md`参照）
- **attendanceCorrectionRequestsコレクション**（保留中、`deferred_tasks.md`参照）

---

### 1. `lib/Accounting/accountingHistoryPage.dart`の改修

#### 1.1 現状

- `_getBusinessDate()`メソッド（29-40行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- `_selectedDate`は`DateTime`型で、ユーザーが`showDatePicker`で選択（210-222行目）
- 49行目で`_selectedDate.toIso8601String().split('T')[0]`を使用して`YYYY-MM-DD`形式に変換してクエリ
- 初期化時（24行目）は`_getBusinessDate()`を使用

#### 1.2 改修内容

**修正箇所**:
1. `_getBusinessDate()`メソッドの削除
2. 初期化時に`storeMeta/currentBusinessDay`を取得（一度だけ）
3. `status === 'running'`かつ`currentBusinessDateKey !== null`の場合は、`currentBusinessDateKey`を`DateTime`に変換して`_selectedDate`に設定
4. 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用（`DateFormat('yyyy-MM-dd').format(DateTime.now())`）
5. 日付選択時の処理は変更不要（選択値は`DateTime`だが、`YYYY-MM-DD`形式に変換してクエリしているため、`calcBusinessDate`は不要）

**実装方法**:
- 初期化時に一度だけ`storeMeta/currentBusinessDay`を取得（snapshot購読は不要）
- `currentBusinessDateKey`を`DateTime`に変換して`_selectedDate`に設定
- 日付選択時（`_selectDate()`）は、選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）

**注意事項**:
- 選択値が営業日文字列（`YYYY-MM-DD`）のため、`calcBusinessDate`は不要（そのままクエリ可能）
- 閉店中でも画面は表示可能（現在の日時が属する日付を`businessDate`として使用）

---

### 2. `lib/Accounting/postAccountingAdjustmentsPage.dart`の改修

#### 2.1 現状

- `accountingHistoryPage.dart`と同様の実装

#### 2.2 改修内容

**修正箇所**:
- `accountingHistoryPage.dart`と同様の修正

**実装方法**:
- `accountingHistoryPage.dart`と同様のパターンを使用

---

### 3. `lib/Accounting/accountingEditDialog.dart`の改修

#### 3.1 現状

- `_getBusinessDate()`メソッド（55-67行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- `_loadAvailableOptions()`メソッド（70-142行目）で`STORE_CLOSE_HOUR`を使用して営業時間を計算
- `scheduledTournaments`の範囲クエリ（91-95行目）で`startAt`を使用
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）

#### 3.2 改修内容

**修正箇所**:
1. `_getBusinessDate()`メソッドの削除
2. `_loadAvailableOptions()`メソッドの修正
   - `STORE_CLOSE_HOUR`を使用した営業時間計算を削除
   - `storeMeta/currentBusinessDay`を取得して`currentBusinessDateKey`を取得
   - 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
   - `scheduledTournaments`のクエリを`businessDate`でフィルタリング（`where('businessDate', isEqualTo: businessDateKey)`）

**実装方法**:
- `storeMeta/currentBusinessDay`を取得して`currentBusinessDateKey`を取得
- 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
- `where('businessDate', isEqualTo: businessDateKey)`を使用

**注意事項**:
- `businessDate`フィールドで直接フィルタリング（`calcBusinessDate`不要）
- `startAt`の範囲クエリは削除

---

### 4. `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`の改修

#### 4.1 現状

- `_getTournamentsStream()`メソッド（497-570行目）で`startAt`を使用してフィルタリング
- 期間選択（`yesterday`, `today`, `thisWeek`, `all`）に応じて`startAt`の範囲クエリを使用
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）

#### 4.2 改修内容

**修正箇所**:
1. `_getTournamentsStream()`メソッドの修正
   - `startAt`の範囲クエリを削除
   - `storeMeta/currentBusinessDay`を取得して今日の`businessDate`を取得
   - 閉店中の場合は、現在の日時が属する日付を今日として使用
   - 期間選択に応じて、今日を起点に営業日キー列を生成（`DateTime`加算で前日/翌日を計算）
   - `businessDate`でフィルタリング（`whereIn`を使用、最大10要素まで）

**実装方法**:
- `storeMeta/currentBusinessDay`を取得して今日の`businessDate`を取得
- 閉店中の場合は、現在の日時が属する日付を今日として使用
- 期間選択に応じて、今日を起点に営業日キー列を生成（`DateTime`加算で前日/翌日を計算）
- `whereIn`を使用して`businessDate`でフィルタリング（最大10要素まで）
- 10要素を超える場合は、複数クエリに分割するか、範囲クエリを検討

**注意事項**:
- `whereIn`は最大10要素までなので、10要素を超える場合は複数クエリに分割するか、範囲クエリを検討
- `businessDate`フィールドで直接フィルタリング（`calcBusinessDate`不要）
- 閉店中でも画面は表示可能（現在の日時が属する日付を今日として使用）

---

### 5. `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart`の改修

#### 5.1 現状

- `_loadTournaments()`メソッド（32-106行目）で`startAt`の範囲クエリを使用（46-51行目）
- カレンダー表示用で、前月〜次の次の月の範囲でトーナメントを取得
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）

#### 5.2 改修内容

**修正箇所**:
1. `_loadTournaments()`メソッドの修正
   - `startAt`の範囲クエリを削除
   - 全件取得してからクライアント側で`businessDate`フィールドで分類
   - カレンダーの日付に`businessDate`が一致するトーナメントを表示

**実装方法**:
- 全件取得してからクライアント側で`businessDate`フィールドで分類（カレンダー表示では範囲が広いため）
- `businessDate`が無い場合はスキップ（Phase2で追加されたフィールドのため、古いデータには存在しない可能性がある）
- `storeMeta/currentBusinessDay`から取得する必要はない（現在の日付が属する月のカレンダーをデフォルトで表示すれば良い）

**注意事項**:
- カレンダー表示では範囲が広いため、全件取得してからクライアント側で`businessDate`で分類する方が効率的
- `businessDate`が無い場合はスキップ
- `storeMeta/currentBusinessDay`から取得する必要はない（現在の日付が属する月のカレンダーをデフォルトで表示すれば良い）

---

### 6. `lib/tournament/pages/tournament_select_page.dart`の改修

#### 6.1 現状

- `_buildTournamentList()`メソッド（90-121行目）で`startAt`でソート（93-95行目）
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）
- `terminalHomePage.dart`で使用されている（69行目、104行目）ため、削除対象外

#### 6.2 改修内容

**修正箇所**:
1. `_buildTournamentList()`メソッドの修正
   - 営業日ベースの表示に変更する場合は、`businessDate`でフィルタリング
   - `storeMeta/currentBusinessDay`を取得して`currentBusinessDateKey`を取得
   - 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
   - `where('businessDate', isEqualTo: businessDateKey)`を使用

**実装方法**:
- `storeMeta/currentBusinessDay`を取得して`currentBusinessDateKey`を取得
- 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
- `where('businessDate', isEqualTo: businessDateKey)`を使用
- `startAt`でソートは維持（営業日内でのソート）

**注意事項**:
- `businessDate`フィールドで直接フィルタリング（`calcBusinessDate`不要）
- `startAt`でソートは維持
- このページは`terminalHomePage.dart`で使用されているため、削除対象外

---

## 実装後の動作

### 正常系

1. **日付選択画面の初期化**:
   - `storeMeta/currentBusinessDay`を取得して`currentBusinessDateKey`を取得（一度だけ）
   - `status === 'running'`かつ`currentBusinessDateKey !== null`の場合は、`currentBusinessDateKey`を`DateTime`に変換して`_selectedDate`に設定
   - 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
   - クエリを実行してデータを表示

2. **日付選択時**:
   - ユーザーが`showDatePicker`で日付を選択
   - 選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）

3. **予定・任意日時の表示**:
   - `scheduledTournaments`コレクションの`businessDate`フィールドで直接フィルタリング
   - `calcBusinessDate` Cloud Functionは不要（データが既に`businessDate`を持っているため）

### エラー系

1. **state docが存在しない場合**:
   - 現在の日時が属する日付を`businessDate`として使用
   - エラーとして扱わない（正常な状態）

---

## 実装のポイント

### 1. 日付選択画面の初期化

- 初期化時に一度だけ`storeMeta/currentBusinessDay`を取得（snapshot購読は不要）
- `status === 'running'`かつ`currentBusinessDateKey !== null`の場合は、`currentBusinessDateKey`を`DateTime`に変換して`_selectedDate`に設定
- 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
- 日付選択時は、選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）

### 2. 予定・任意日時の表示

- `scheduledTournaments`コレクションの`businessDate`フィールドで直接フィルタリング
- `calcBusinessDate` Cloud Functionは不要（データが既に`businessDate`を持っているため）

### 3. 期間表示のクエリ戦略

- `whereIn`は最大10要素までなので、10要素を超える場合は複数クエリに分割するか、範囲クエリを検討
- 期間が長い場合は、範囲クエリ（パターンA）を検討

---

## 実装順序

1. `lib/Accounting/accountingHistoryPage.dart`の改修
2. `lib/Accounting/postAccountingAdjustmentsPage.dart`の改修
3. `lib/Accounting/accountingEditDialog.dart`の改修
4. `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`の改修
5. `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart`の改修
6. `lib/tournament/pages/tournament_select_page.dart`の改修
7. 動作確認（日付選択画面の初期化、営業日ベースの表示）

---

## 注意事項

### 1. `businessDate`フィールドの使用

- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）
- `businessDate`フィールドで直接フィルタリング可能（`calcBusinessDate` Cloud Functionは不要）
- 古いデータには`businessDate`が存在しない可能性があるため、`businessDate`が無い場合はスキップする処理が必要

### 2. `whereIn`制約

- `whereIn`は最大10要素までなので、10要素を超える場合は複数クエリに分割するか、範囲クエリを検討
- 期間が長い場合は、範囲クエリ（パターンA）を検討

### 3. 閉店中の扱い

- 閉店中でも画面は表示可能（現在の日時が属する日付を`businessDate`として使用）
- `storeMeta/currentBusinessDay`の`status === 'closed'`または`currentBusinessDateKey === null`の場合は、現在の日時が属する日付を使用

---

## 次のステップ

1. Phase5: 自動開閉店の実装
2. Phase6: テスト・検証
