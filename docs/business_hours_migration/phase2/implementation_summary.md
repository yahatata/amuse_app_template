# Phase2: businessHoursMonthlyMap導入 - 実装完了サマリー

## 実装日時
2025年1月27日

## 実装内容

### 1. 型定義の追加

#### 1.1 `functions/src/helpers/billsApi/types.ts`（修正）
- `BusinessDateResult`型を追加
  - `status: 'OK'`の場合: `businessDateKey: string`フィールドに営業日（`YYYY-MM-DD`形式）が含まれる
  - `status: 'NONE'`の場合: どの営業日にも属さない
  - `status: 'AMBIGUOUS'`の場合: `candidates: string[]`フィールドに候補の営業日リストが含まれる

---

### 2. `calcBusinessDate.ts`の改修

#### 2.1 `functions/src/helpers/billsApi/calcBusinessDate.ts`（修正）
- **関数シグネチャの変更**:
  - 戻り値を`string`から`Promise<BusinessDateResult>`に変更
  - `async`関数に変更（Firestoreから`businessHoursMonthlyMap`を取得するため）
- **businessHoursMonthlyMapの参照**:
  - Firestoreの`businessHoursMonthlyMap`コレクションから営業時間を取得
  - ドキュメントIDは`YYYY-MM`形式（例: `2024-01`）
  - 月跨ぎ対応: 1日の場合は前月、28-31日の場合は次月のドキュメントも取得
- **営業日判定ロジック**:
  - `findBusinessDateCandidates`関数を使用して候補を列挙
  - 候補数0 → `NONE`、1 → `OK`、2以上 → `AMBIGUOUS`を返す

---

### 3. ヘルパー関数の実装

#### 3.1 `functions/src/helpers/billsApi/calcBusinessDateHelpers.ts`（新規作成）
- **JST変換関数**:
  - `convertToJst(date: Date): Date` - UTCをJST（UTC+9）に変換
- **月キー生成関数**:
  - `formatMonthKey(date: Date): string` - `YYYY-MM`形式の月キーを生成
  - `getPrevMonthKey(monthKey: string): string` - 前月の月キーを生成
  - `getNextMonthKey(monthKey: string): string` - 次月の月キーを生成
- **日付キー正規化関数**:
  - `normalizeDayKey(dayKey: string): string` - `"1"`/`"01"`の揺れに対応
- **時刻変換関数**:
  - `minutesToTime(minutes: number, baseDate: Date): Date` - 分単位から時刻に変換（`closeMinute > 1440`の場合は翌日に伸びる）
  - `subtractMinutes(date: Date, minutes: number): Date` - 時刻から分を減算
  - `addMinutes(date: Date, minutes: number): Date` - 時刻に分を加算
- **営業日キー生成関数**:
  - `formatBusinessDateKey(date: Date): string` - `YYYY-MM-DD`形式の営業日キーを生成
- **営業日候補列挙関数**:
  - `findBusinessDateCandidates(...): Promise<string[]>` - バッファ適用済みウィンドウで全営業日をチェックして候補を列挙
- **バッファ時間取得関数**:
  - `getCalcBusinessDateBufferMinutes(): number` - バッファ時間（分）を取得（現在は70分を返す）
  - **注意**: `globalConstant.dart`の`CALC_BUSINESS_DATE_BUFFER_MINUTES`と同期が必要

---

### 4. `globalConstant.dart`の修正

#### 4.1 `lib/globalConstant.dart`（修正）
- `CALC_BUSINESS_DATE_BUFFER_MINUTES`定数を追加（デフォルト: 70分）
- **重要**: この値を変更する場合は、`functions/src/helpers/billsApi/calcBusinessDateHelpers.ts`の`getCalcBusinessDateBufferMinutes()`関数内の`return 70;`の部分も同時に修正が必要
- 両方の値を同期させてください（デプロイ時も両方をデプロイが必要）

---

### 5. Functions側の修正

#### 5.1 `functions/src/helpers/billsApi/postEventAdjustment.ts`（修正）
- `calcBusinessDate()`の呼び出しを`await calcBusinessDate()`に変更
- `BusinessDateResult`の処理を追加:
  - `NONE`: `failed-precondition`エラーをthrow
  - `AMBIGUOUS`: `request.selectedBusinessDateKey`をチェックし、無効な場合はエラーをthrow（候補リストを含む）
  - `OK`: `businessDateResult.businessDateKey`を使用

#### 5.2 `functions/src/helpers/billsApi/postEventReopen.ts`（修正）
- `postEventAdjustment.ts`と同様の修正

#### 5.3 `functions/src/helpers/billsApi/postEventRefund.ts`（修正）
- `postEventAdjustment.ts`と同様の修正

#### 5.4 `functions/src/helpers/billsApi/postEventCancel.ts`（修正）
- `postEventAdjustment.ts`と同様の修正

#### 5.5 `functions/src/callables/createScheduledTournament.ts`（修正）
- `createScheduledTournamentSchema`に`selectedBusinessDateKey: z.string().optional()`を追加
- `calcBusinessDate(startAtDate)`を使用して営業日を計算
- `BusinessDateResult`の処理を追加（`postEventAdjustment.ts`と同様）
- `scheduledTournamentData`に`businessDate`フィールドを追加

#### 5.6 `functions/src/itemOrder/placeOrderByUser.ts`（修正）
- `calcBusinessDate()`の呼び出しを`await calcBusinessDate()`に変更
- `BusinessDateResult`の処理を追加（`postEventAdjustment.ts`と同様）

#### 5.7 `functions/src/utils/getOpenBills.ts`（修正）
- `calcBusinessDate(now)`を`await getCurrentBusinessDateKeyOrThrow()`に変更
- **理由**: 当日の営業日取得はstate docを使用する方針に統一

#### 5.8 `functions/src/itemOrder/getUserOrderHistory.ts`（修正）
- `calcBusinessDate(now)`を`await getCurrentBusinessDateKeyOrThrow()`に変更
- **理由**: 当日の営業日取得はstate docを使用する方針に統一

---

### 6. Dart側の実装

#### 6.1 `lib/utils/business_date_ambiguous_dialog.dart`（新規作成）
- **`extractAmbiguousCandidates(error)`関数**:
  - `FirebaseFunctionsException`から`AMBIGUOUS`情報を抽出
  - エラーの`details`から`candidates`を取得、またはメッセージから抽出
- **`showBusinessDateAmbiguousDialog(...)`関数**:
  - 営業日が曖昧（`AMBIGUOUS`）な場合に表示するダイアログ
  - 各候補の営業時間を`businessHoursMonthlyMap`から取得して表示
  - ユーザーが選択した営業日キーを返す
- **`_getBusinessHoursForDate(businessDateKey)`関数**:
  - 指定された営業日の営業時間をFirestoreから取得
  - `days`キーの`"1"`/`"01"`の揺れに対応
- **`_formatBusinessHours(businessHours)`関数**:
  - 営業時間を整形して表示（例: `19:00 - 28:00 (翌日)`）

#### 6.2 `lib/Accounting/postAccountingAdjustmentDialog.dart`（修正）
- `business_date_ambiguous_dialog.dart`をインポート
- `FirebaseFunctionsException`をキャッチし、`AMBIGUOUS`の場合は`showBusinessDateAmbiguousDialog`を表示
- ユーザーが選択した営業日キーで再試行（`selectedBusinessDateKey`をリクエストに含める）

#### 6.3 `lib/Accounting/postAccountingReopenDialog.dart`（修正）
- `postAccountingAdjustmentDialog.dart`と同様の修正

#### 6.4 `lib/Accounting/postAccountingCancelDialog.dart`（修正）
- `postAccountingAdjustmentDialog.dart`と同様の修正

#### 6.5 `lib/Accounting/postAccountingRefundDialog.dart`（修正）
- `postAccountingAdjustmentDialog.dart`と同様の修正

#### 6.6 `lib/tournament/active/tournament_service.dart`（修正）
- `createScheduledTournament`メソッドに`BuildContext? context`パラメータを追加
- `business_date_ambiguous_dialog.dart`をインポート
- `FirebaseFunctionsException`をキャッチし、`AMBIGUOUS`の場合は`showBusinessDateAmbiguousDialog`を表示
- ユーザーが選択した営業日キーで再試行（`selectedBusinessDateKey`をリクエストに含める）

#### 6.7 `lib/tournament/scheduling/pages/create_single_tournament_page.dart`（修正）
- `_service.createScheduledTournament()`の呼び出しに`context: context`を追加
- `tournament_service.dart`が`context`を受け取ると、`AMBIGUOUS`時に自動でダイアログを表示

#### 6.8 `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart`（修正）
- `business_date_ambiguous_dialog.dart`をインポート
- `_createTournament`メソッドに`selectedBusinessDateKey`パラメータを追加（再試行用）
- `FirebaseFunctionsException`をキャッチし、`AMBIGUOUS`の場合は`showBusinessDateAmbiguousDialog`を表示
- ユーザーが選択した営業日キーで再試行

---

## 作成・修正ファイル一覧

### 新規作成ファイル
1. `functions/src/helpers/billsApi/calcBusinessDateHelpers.ts` - ヘルパー関数群
2. `lib/utils/business_date_ambiguous_dialog.dart` - AMBIGUOUSダイアログ実装

### 修正ファイル（Functions側）
1. `functions/src/helpers/billsApi/types.ts` - `BusinessDateResult`型を追加
2. `functions/src/helpers/billsApi/calcBusinessDate.ts` - `businessHoursMonthlyMap`参照、`OK`/`NONE`/`AMBIGUOUS`対応
3. `functions/src/helpers/billsApi/postEventAdjustment.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
4. `functions/src/helpers/billsApi/postEventReopen.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
5. `functions/src/helpers/billsApi/postEventRefund.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
6. `functions/src/helpers/billsApi/postEventCancel.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
7. `functions/src/callables/createScheduledTournament.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理、`businessDate`フィールド追加
8. `functions/src/itemOrder/placeOrderByUser.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
9. `functions/src/utils/getOpenBills.ts` - `getCurrentBusinessDateKeyOrThrow`を使用（state doc方針に統一）
10. `functions/src/itemOrder/getUserOrderHistory.ts` - `getCurrentBusinessDateKeyOrThrow`を使用（state doc方針に統一）

### 修正ファイル（Dart側）
1. `lib/globalConstant.dart` - `CALC_BUSINESS_DATE_BUFFER_MINUTES`定数を追加
2. `lib/Accounting/postAccountingAdjustmentDialog.dart` - `AMBIGUOUS`処理統合
3. `lib/Accounting/postAccountingReopenDialog.dart` - `AMBIGUOUS`処理統合
4. `lib/Accounting/postAccountingCancelDialog.dart` - `AMBIGUOUS`処理統合
5. `lib/Accounting/postAccountingRefundDialog.dart` - `AMBIGUOUS`処理統合
6. `lib/tournament/active/tournament_service.dart` - `AMBIGUOUS`処理統合
7. `lib/tournament/scheduling/pages/create_single_tournament_page.dart` - `context`を渡すように修正
8. `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` - `AMBIGUOUS`処理統合

---

## 実装のポイント

1. **バッファ時間の設定**: `globalConstant.dart`と`calcBusinessDateHelpers.ts`の両方を同期させる必要がある
2. **営業日判定の用途分離**:
   - 現在時刻（いま）のデータ格納・表示: `getCurrentBusinessDateKeyOrThrow()`を使用（state doc参照）
   - 予定・任意日時（いま以外）の営業日算出: `calcBusinessDate()`を使用（`businessHoursMonthlyMap`参照）
3. **AMBIGUOUS処理**: UIでユーザーに営業日を選択させるダイアログを表示
4. **月跨ぎ対応**: 1日の場合は前月、28-31日の場合は次月の`businessHoursMonthlyMap`ドキュメントも取得
5. **daysキーの正規化**: `"1"`/`"01"`の揺れに対応

---

## 実装の現状とchangeSpecとの差分

### バッファ時間の取得方法
- **changeSpec**: Firestoreの`globalConstant`ドキュメントから取得する機能を実装（TODO）
- **実装**: `getCalcBusinessDateBufferMinutes()`は固定値70分を返す
- **理由**: 実装の簡素化のため、まずは固定値で実装
- **TODO**: 将来的にFirestoreの`globalConstant`ドキュメントから取得する機能を実装

### 営業日判定の用途分離
- **changeSpec**: 現在時刻はstate doc、予定・任意日時は`calcBusinessDate`を使用
- **実装**: `getOpenBills.ts`と`getUserOrderHistory.ts`で`getCurrentBusinessDateKeyOrThrow()`を使用（changeSpec通り）

---

## 次のステップ

1. バッファ時間をFirestoreの`globalConstant`ドキュメントから取得する機能を実装（オプション）
2. 31日の7:00（JST）が30日の営業日範囲に含まれない問題の修正（ロジックの見直しが必要）
3. 動作確認（各種ダイアログでの`AMBIGUOUS`処理のテスト）
