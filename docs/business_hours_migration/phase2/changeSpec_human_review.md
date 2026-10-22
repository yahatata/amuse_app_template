# Phase2: businessHoursMonthlyMap導入 - 人間確認用仕様書

## 概要

Phase2では、`calcBusinessDate.ts`を改修し、`businessHoursMonthlyMap`を参照して営業時間を取得するように変更します。また、±30分バッファと`OK`/`NONE`/`AMBIGUOUS`の戻り値を実装します。

## 実装内容

### 1. `calcBusinessDate.ts`の改修

#### 1.1 関数の戻り値の変更

**修正ファイル**: `functions/src/helpers/billsApi/calcBusinessDate.ts`

**変更内容**:
- 現在は`string`（営業日）を返していますが、`OK`/`NONE`/`AMBIGUOUS`の3つの状態を返すように変更します
- `OK`: 単一の営業日に属する場合（営業日を返す）
- `NONE`: どの営業日にも属さない場合
- `AMBIGUOUS`: 複数営業日に跨る場合（候補のリストを返す）

**理由**: 営業時間の前後±30分をバッファとして含めるため、同一時刻が複数の営業日に属する可能性があるため

#### 1.2 businessHoursMonthlyMapの参照

**実装内容**:
- Firestoreの`businessHoursMonthlyMap`コレクションから営業時間を取得します
- ドキュメントIDは`YYYY-MM`形式（例: `2024-01`）です
- 各ドキュメントには`days`マップが含まれ、1-31日の営業時間が格納されています

**月跨ぎ対応**:
- 入力日時が1日の場合は前月分のドキュメントも確認します（前月の最終営業日に属する可能性があるため）
- 入力日時が28-31日の場合は次月のドキュメントも確認します（次月の最初の営業日に属する可能性があるため）

**daysキーの正規化**:
- `days`マップのキーは日付の文字列（例: `"10"`, `"11"`）ですが、`"1"`/`"01"`の揺れがあり得るため、実装ではnormalizeして両対応します

#### 1.3 営業日判定ロジック

**実装内容**:
1. **休業日チェック**: `isClosed: true`の場合は`NONE`を返します
2. **営業時間の取得**: `openMinute`（開店時刻）と`closeMinute`（閉店時刻）を分単位で取得します
   - `openMinute`: 0-1440（1440=24:00）
   - `closeMinute`: 0-2880（1440=24:00、2880=48:00）
   - `closeMinute > 1440`の場合は「翌日に伸びる」ことを意味します（例: `1680` = 28:00 = 翌日04:00）
3. **±バッファの適用**: 営業時間の前後にバッファを拡張したウィンドウとして扱います
   - バッファ時間は`globalConstant.dart`の`CALC_BUSINESS_DATE_BUFFER_MINUTES`で設定可能（デフォルト: 30分）
   - 例: 営業時間が20:00-28:00、バッファが30分の場合、19:30-28:30の範囲を拡張ウィンドウとして扱います
4. **候補の列挙**: ±バッファ拡張ウィンドウに時刻が含まれる営業日候補を列挙します
   - 候補数0 → `NONE`を返す
   - 候補数1 → `OK`を返す（営業日を返す）
   - 候補数2以上 → `AMBIGUOUS`を返す（候補のリストを返す）

---

### 2. `calcBusinessDate`を使用しているファイルの修正

#### 2.1 `postEventAdjustment.ts`の修正

**修正ファイル**: `functions/src/helpers/billsApi/postEventAdjustment.ts`

**修正内容**:
- `calcBusinessDate()`の呼び出しを`await calcBusinessDate()`に変更します
- 戻り値を`BusinessDateResult`として処理します
- `NONE`を返す場合はエラーをthrowします
- `AMBIGUOUS`を返す場合は、UIでどちらの営業日に属するデータなのかを選択させる必要があります
  - Functions側では`AMBIGUOUS`を返し、呼び出し元（UIまたは別のFunction）で候補選択ダイアログを表示します
  - 選択された営業日を使用して処理を続行します

#### 2.2 その他の使用箇所

**対象ファイル**:
- `functions/src/helpers/billsApi/postEventReopen.ts`（該当する場合）
- `functions/src/helpers/billsApi/postEventRefund.ts`（該当する場合）
- その他の`calcBusinessDate`を使用しているファイル

**修正内容**: `postEventAdjustment.ts`と同様
- `AMBIGUOUS`の場合は、UIでどちらの営業日に属するデータなのかを選択させる必要があります

---

### 3. `scheduledTournaments`コレクションへの`businessDate`追加

#### 3.1 `createScheduledTournament.ts`の修正

**修正ファイル**: `functions/src/callables/createScheduledTournament.ts`

**修正内容**:
- `startAt`から`calcBusinessDate`を使用して`businessDate`を計算します
- `businessDate`フィールドを`scheduledTournamentData`に追加します
- `AMBIGUOUS`/`NONE`時のエラーハンドリングを実装します

**注意事項**:
- `AMBIGUOUS`の場合は、UIでどちらの営業日に属するデータなのかを選択させる必要があります
  - リクエストに`selectedBusinessDateKey`が含まれている場合はそれを使用します
  - 含まれていない場合はエラーをthrowし、UIで選択ダイアログを表示する必要があります
- `NONE`の場合はエラーをthrowします

---

### 4. `attendances`コレクションへの`businessDate`追加（保留）

**保留理由**: attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため。

**対象ファイル**:
- `functions/src/attendance/createClockInRecord.ts` - **修正不要（保留）**
- `functions/src/attendance/createManualClockInRecord.ts` - **修正不要（保留）**
- `functions/src/attendance/updateClockOutRecord.ts` - **修正不要（保留）**

**注意事項**:
- Phase2では`attendances`の修正は行いません
- 将来的に検討が完了した時点で対応を決定します

---

### 5. `attendanceCorrectionRequests`コレクション（保留）

**保留理由**: attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため。

**対象ファイル**:
- `functions/src/attendance/createAttendanceCorrectionRequest.ts` - **修正不要（保留）**

**注意事項**:
- Phase2では`attendanceCorrectionRequests`の修正は行いません
- 将来的に検討が完了した時点で対応を決定します

---

## 実装後の動作

### 正常系

1. **営業時間内の時刻**:
   - `calcBusinessDate`が`OK`を返し、営業日が取得できます
   - `scheduledTournaments`や`attendances`に`businessDate`が正しく格納されます

2. **バッファ内の時刻（単一営業日）**:
   - `calcBusinessDate`が`OK`を返し、営業日が取得できます

3. **バッファ内の時刻（複数営業日）**:
   - `calcBusinessDate`が`AMBIGUOUS`を返し、候補のリストが取得できます
   - UIでどちらの営業日に属するデータなのかを選択するダイアログが表示されます
   - 選択された営業日が使用されます

### エラー系

1. **営業時間外（バッファ外）の時刻**:
   - `calcBusinessDate`が`NONE`を返します
   - エラーをthrowし、処理を中断します

2. **休業日（`isClosed: true`）**:
   - `calcBusinessDate`が`NONE`を返します
   - エラーをthrowし、処理を中断します

3. **businessHoursMonthlyMapが存在しない**:
   - エラーをthrowし、処理を中断します

---

## 実装順序

1. 型定義の追加（`BusinessDateResult`）
2. ヘルパー関数の実装（`calcBusinessDateHelpers.ts`）
3. `calcBusinessDate.ts`の改修
   - `globalConstant.dart`に`CALC_BUSINESS_DATE_BUFFER_MINUTES`を追加（デフォルト: 30分）
   - Functions側で`globalConstant`からバッファ時間を取得する機能を実装
4. `calcBusinessDate`を使用しているファイルの修正
   - **重要**: `AMBIGUOUS`の場合は、UIでどちらの営業日に属するデータなのかを選択させる
5. `scheduledTournaments`への`businessDate`追加
   - **重要**: `AMBIGUOUS`の場合は、リクエストに`selectedBusinessDateKey`を含めるか、エラーをthrowしてUIで選択ダイアログを表示
6. テスト実装

---

## 注意事項

- **`attendances`は保留**: Phase2では修正を行いません
- **`attendanceCorrectionRequests`は保留**: Phase2では修正を行いません
- **`AMBIGUOUS`時のUI選択**: Phase2で実装します。UIでどちらの営業日に属するデータなのかを選択するダイアログを表示します
- **バッファ時間の設定**: `globalConstant.dart`の`CALC_BUSINESS_DATE_BUFFER_MINUTES`で設定可能（デフォルト: 30分）
- **月跨ぎ対応**: 1日の場合は前月分のドキュメントも確認、28-31日の場合は次月のドキュメントも確認が必要
- **daysキーの揺れ**: `"1"`/`"01"`の揺れに対応する必要がある
- **`closeMinute > 1440`の扱い**: 翌日に伸びることを考慮する必要がある

---

## 参照資料

- [Step0: 最終仕様](../step0_final_spec.md) - 全体の仕様と方針
- [Step1: コレクション分析](../step1_collection_analysis.md) - コレクションの分析結果
- [Step2: 取得・表示ファイルの洗い出し](../step2_query_display_files.md) - 取得・表示ファイルの洗い出し結果
- [Step4: 改修実装チェックリスト](../step4_migration_plan_checklist.md) - 実装時のチェック項目
