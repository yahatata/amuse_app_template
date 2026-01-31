# Phase2: businessHoursMonthlyMap導入 - デプロイ完了サマリー

## デプロイ日時
2025年1月27日

## デプロイ内容

### 1. Functions
- **ステータス**: ✅ デプロイ成功
- **デプロイされた関数**:
  - `createScheduledTournament` - トーナメント作成時に`calcBusinessDate`を使用
  - `updateAccounting` - 会計更新時に`calcBusinessDate`を使用（`postEventAdjustment`, `postEventReopen`, `postEventRefund`, `postEventCancel`を含む）

### 2. バッファ時間の設定
- **ステータス**: ✅ 設定完了
- **設定値**: 70分
- **設定箇所**:
  - `lib/globalConstant.dart`: `CALC_BUSINESS_DATE_BUFFER_MINUTES = 70`
  - `functions/src/helpers/billsApi/calcBusinessDateHelpers.ts`: `getCalcBusinessDateBufferMinutes()`が70を返す
- **注意**: 両方の値を同期させる必要がある

---

## 修正・追加ファイル一覧

### Functions側
1. `functions/src/helpers/billsApi/types.ts` - `BusinessDateResult`型を追加
2. `functions/src/helpers/billsApi/calcBusinessDate.ts` - `businessHoursMonthlyMap`参照、`OK`/`NONE`/`AMBIGUOUS`対応
3. `functions/src/helpers/billsApi/calcBusinessDateHelpers.ts` - ヘルパー関数群（新規作成）
4. `functions/src/helpers/billsApi/postEventAdjustment.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
5. `functions/src/helpers/billsApi/postEventReopen.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
6. `functions/src/helpers/billsApi/postEventRefund.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
7. `functions/src/helpers/billsApi/postEventCancel.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
8. `functions/src/callables/createScheduledTournament.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理、`businessDate`フィールド追加
9. `functions/src/itemOrder/placeOrderByUser.ts` - `calcBusinessDate`使用と`AMBIGUOUS`処理
10. `functions/src/utils/getOpenBills.ts` - `getCurrentBusinessDateKeyOrThrow`を使用
11. `functions/src/itemOrder/getUserOrderHistory.ts` - `getCurrentBusinessDateKeyOrThrow`を使用

### UI側（Dart）
1. `lib/globalConstant.dart` - `CALC_BUSINESS_DATE_BUFFER_MINUTES`定数を追加
2. `lib/utils/business_date_ambiguous_dialog.dart` - AMBIGUOUSダイアログ実装（新規作成）
3. `lib/Accounting/postAccountingAdjustmentDialog.dart` - `AMBIGUOUS`処理統合
4. `lib/Accounting/postAccountingReopenDialog.dart` - `AMBIGUOUS`処理統合
5. `lib/Accounting/postAccountingCancelDialog.dart` - `AMBIGUOUS`処理統合
6. `lib/Accounting/postAccountingRefundDialog.dart` - `AMBIGUOUS`処理統合
7. `lib/tournament/active/tournament_service.dart` - `AMBIGUOUS`処理統合
8. `lib/tournament/scheduling/pages/create_single_tournament_page.dart` - `context`を渡すように修正
9. `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` - `AMBIGUOUS`処理統合

---

## デプロイ時の対応

### バッファ時間の同期
- `lib/globalConstant.dart`と`functions/src/helpers/billsApi/calcBusinessDateHelpers.ts`の両方で70分に設定
- **重要**: この値を変更する場合は、両方のファイルを同時に修正し、それぞれデプロイが必要

### デプロイコマンド
```bash
# 特定の関数のみデプロイ
firebase deploy --only functions:createScheduledTournament,functions:updateAccounting
```

---

## 確認方法

### 1. 正常系の確認
1. **営業時間内の時刻でトーナメント作成**:
   - `calcBusinessDate`が`OK`を返し、営業日が取得できることを確認
   - `scheduledTournaments`に`businessDate`が正しく格納されることを確認

2. **バッファ内の時刻（単一営業日）でトーナメント作成**:
   - `calcBusinessDate`が`OK`を返し、営業日が取得できることを確認

3. **バッファ内の時刻（複数営業日）でトーナメント作成**:
   - `calcBusinessDate`が`AMBIGUOUS`を返し、候補のリストが取得できることを確認
   - UIでどちらの営業日に属するデータなのかを選択するダイアログが表示されることを確認
   - 選択された営業日が使用されることを確認

### 2. エラー系の確認
1. **営業時間外（バッファ外）の時刻でトーナメント作成**:
   - `calcBusinessDate`が`NONE`を返すことを確認
   - エラーがthrowされ、処理が中断されることを確認

2. **休業日（`isClosed: true`）でトーナメント作成**:
   - `calcBusinessDate`が`NONE`を返すことを確認
   - エラーがthrowされ、処理が中断されることを確認

3. **businessHoursMonthlyMapが存在しない**:
   - エラーがthrowされ、処理が中断されることを確認

### 3. UIでの確認
1. **会計調整ダイアログ**:
   - `AMBIGUOUS`の場合、営業日選択ダイアログが表示されることを確認
   - 各候補の営業時間が表示されることを確認
   - 選択された営業日で再試行されることを確認

2. **トーナメント作成画面**:
   - `AMBIGUOUS`の場合、営業日選択ダイアログが表示されることを確認
   - 選択された営業日で再試行されることを確認

---

## 注意事項

- **バッファ時間の同期**: `globalConstant.dart`と`calcBusinessDateHelpers.ts`の両方を同期させる必要がある
- **営業日判定の用途分離**: 現在時刻はstate doc、予定・任意日時は`calcBusinessDate`を使用
- **AMBIGUOUS処理**: UIでユーザーに営業日を選択させる必要がある
- **月跨ぎ対応**: 1日の場合は前月、28-31日の場合は次月の`businessHoursMonthlyMap`ドキュメントも取得

---

## 既知の問題

### 31日の7:00（JST）が30日の営業日範囲に含まれない問題
- **状況**: 31日の7:00（JST）でトーナメントを作成しようとすると、`NONE`エラーが発生
- **原因**: `findBusinessDateCandidates`で30日のデータをチェックする条件が満たされていない
- **対応**: ロジックの見直しが必要（31日の7:00が30日の営業日範囲に含まれるように修正）

---

## 次のステップ

1. 31日の7:00（JST）が30日の営業日範囲に含まれない問題の修正
2. バッファ時間をFirestoreの`globalConstant`ドキュメントから取得する機能を実装（オプション）
3. 動作確認（各種ダイアログでの`AMBIGUOUS`処理のテスト）
