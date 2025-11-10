**注意: このドキュメントは旧仕様の参照専用です（更新禁止）。移行後の新仕様には適用されません。**

# todaysBillsコレクション操作ファイル一覧

## 概要

このドキュメントは、`todaysBills`コレクションに対してデータを**書き込んでいる**ファイルと**読み込んでいる**ファイルを網羅的に抽出したものです。

## 書き込み操作（Write）を行うファイル

### Cloud Functions (TypeScript)

1. **functions/src/userLogin/manualCheckIn.ts**
   - 操作: `.add()` - todaysBillsドキュメントを作成（入店時）
   - 行番号: 131

2. **functions/src/userLogin/processVisitByQR.ts**
   - 操作: `tx.set()` - todaysBillsドキュメントを作成（QRコード入店時）
   - 行番号: 160

3. **functions/src/itemOrder/placeOrder.ts**
   - 読み込み: `.where().get()` - userIdとstatusでtodaysBillsを取得（行番号: 70-75）
   - 書き込み: `tx.update()` - items/sideGameChip配列に追加、totalPriceを更新（行番号: 126-130, 138-142）

4. **functions/src/itemOrder/placeOrderByUser.ts**
   - 読み込み: `.where().get()` - userIdとstatusでtodaysBillsを取得（行番号: 68-73）
   - 書き込み: `tx.update()` - items配列に追加、totalPriceを更新（行番号: 121-125）

5. **functions/src/sideGame/withdrawTip.ts**
   - 読み込み: `.where().get()` - userIdとstatusでtodaysBillsを取得（行番号: 48-52）
   - 書き込み: `.update()` - sideGameChip配列にwithdrawエントリーを追加（行番号: 73-76）

6. **functions/src/sideGame/depositTip.ts**
   - 読み込み: `.where().get()` - userIdとstatusでtodaysBillsを取得（行番号: 43-47）
   - 書き込み: `.update()` - sideGameChip配列にdepositエントリーを追加（行番号: 68-71）

7. **functions/src/sideGame/registerForSideGame.ts**
   - 読み込み: `.where().get()` - userIdでtodaysBillsを取得（行番号: 24-27）
   - 書き込み: `.update()` - currentSeat, currentTableを更新（行番号: 67）

8. **functions/src/sideGame/leaveSeat.ts**
   - 読み込み: `.where().get()` - userIdでtodaysBillsを取得（行番号: 26-29）
   - 書き込み: `.update()` - currentSeat, currentTableをnullに設定（行番号: 39）

9. **functions/src/callables/registerParticipants.ts**
   - 読み込み: `transaction.get()` - userIdとstatusでtodaysBillsを取得（行番号: 59-64）
   - 書き込み: `transaction.update()` - tournamentsフィールドを更新（行番号: 211付近）

10. **functions/src/callables/registerForTournament.ts**
    - 読み込み: `transaction.get()` - userIdとstatusでtodaysBillsを取得（行番号: 50-55）
    - 書き込み: `transaction.update()` - tournamentsフィールドを更新（行番号: 160付近）

11. **functions/src/callables/bustAndExit.ts**
    - 読み込み: `.get()` - userIdとstatusでtodaysBillsを取得（行番号: 48-59）
    - 書き込み: `transaction.update()` - currentTable, currentSeatをnullに設定（行番号: 126-129）

12. **functions/src/callables/bustAndReentry.ts**
    - 読み込み: `transaction.get()` - userIdとstatusでtodaysBillsを取得（行番号: 53-58）
    - 書き込み: `transaction.update()` - tournamentsフィールドを更新（2箇所、行番号: 190, 281）

13. **functions/src/callables/addon.ts**
    - 読み込み: `.where().get()` - userIdとstatusでtodaysBillsを取得（行番号: 65-70）
    - 書き込み: `transaction.update()` - tournamentsフィールドを更新（行番号: 112付近）

14. **functions/src/callables/bulkAddon.ts**
    - 読み込み: `.where().get()` - 複数ユーザーのtodaysBillsを取得（行番号: 81-86）
    - 書き込み: `transaction.update()` - tournamentsフィールドを更新（複数ユーザー、行番号: 138付近）

15. **functions/src/callables/reseatAllPlayers.ts**
    - 読み込み: `transaction.get()` - 複数ユーザーのtodaysBillsを取得（行番号: 47-52）
    - 書き込み: `transaction.update()` - currentTable, currentSeatを更新（行番号: 140-144）

16. **functions/src/callables/assignSeatToPlayer.ts**
    - 読み込み: `transaction.get()` - userIdとstatusでtodaysBillsを取得（行番号: 65-70）
    - 書き込み: `transaction.update()` - currentTable, currentSeatを更新（行番号: 114-118）

17. **functions/src/callables/accounting.ts**
    - 読み込み: `.get()` - billIdでtodaysBillsを取得（2箇所、行番号: 131, 292）
    - 書き込み: `.update()` - accountingStartedAt, paymentMethodsByAmountを更新（startAccounting、行番号: 239-244）
    - 書き込み: `.update()` - status, accountingCompletedAt等を更新（completeAccounting、行番号: 333-340）

18. **functions/src/callables/updateActiveBill.ts**
    - 読み込み: `.get()` - billIdでtodaysBillsを取得（行番号: 73）
    - 書き込み: `.update()` - extraCost, tournaments, items, sideGameChip, totalPriceを更新（行番号: 143）

19. **functions/src/callables/updateAccounting.ts**
    - 読み込み: `.get()` - billIdでtodaysBillsを取得（行番号: 73）
    - 書き込み: `transaction.update()` - extraCost, tournaments, items, sideGameChip, totalPriceを更新（行番号: 152）

20. **functions/src/callables/cancelAccounting.ts**
    - 読み込み: `.get()` - billIdでtodaysBillsを取得（行番号: 48）
    - 書き込み: `transaction.update()` - statusを'open'に戻す、返金情報を追加（行番号: 64-73, 193-197）

21. **functions/src/callables/refundProcessing.ts**
    - 読み込み: `.get()` - billIdでtodaysBillsを取得（行番号: 50）
    - 書き込み: `transaction.update()` - refundAmount, refundReason等を更新（行番号: 73-80）

22. **functions/src/callables/migrateTodaysBills.ts**
   - 読み込み: `.where().get()` - dateでtodaysBillsを取得（行番号: 32-34）
   - 書き込み: `batch.update()` - 会計履歴用フィールドを追加（マイグレーション、行番号: 57-64）

23. **functions/src/rollbackFunction/undoRegisterParticipants.ts**
    - 操作: `transaction.delete()` - scheduledTournaments/{tournamentId}/todaysBills から該当プレイヤーを削除
    - ⚠️ 注意: これは`todaysBills`ルートコレクションではなく、`scheduledTournaments`のサブコレクションを参照しています
    - 行番号: 49-52

24. **functions/src/rollbackFunction/undoBustAndReentry.ts**
    - 操作: `transaction.update()` - scheduledTournaments/{tournamentId}/todaysBills のreentries, isBustedを更新
    - ⚠️ 注意: これは`todaysBills`ルートコレクションではなく、`scheduledTournaments`のサブコレクションを参照しています
    - 行番号: 57-61

25. **functions/src/rollbackFunction/undoBustAndExit.ts**
    - 操作: `transaction.update()` - scheduledTournaments/{tournamentId}/todaysBills のisBusted, bustedAtを更新
    - ⚠️ 注意: これは`todaysBills`ルートコレクションではなく、`scheduledTournaments`のサブコレクションを参照しています
    - 行番号: 54-58

26. **functions/src/rollbackFunction/undoBulkAddon.ts**
    - 操作: `transaction.update()` - scheduledTournaments/{tournamentId}/todaysBills のaddonsを減算
    - ⚠️ 注意: これは`todaysBills`ルートコレクションではなく、`scheduledTournaments`のサブコレクションを参照しています
    - 行番号: 56-59

27. **functions/src/rollbackFunction/undoAddon.ts**
    - 操作: `transaction.update()` - scheduledTournaments/{tournamentId}/todaysBills のaddonsを減算
    - ⚠️ 注意: これは`todaysBills`ルートコレクションではなく、`scheduledTournaments`のサブコレクションを参照しています
    - 行番号: 56-59

## 読み込みのみ（Read Only）を行うファイル

### Cloud Functions (TypeScript)

1. **functions/src/itemOrder/getUserOrderHistory.ts**
   - 操作: `.where().orderBy().get()` - userIdとcreatedAtでtodaysBillsを取得
   - 行番号: 45-50

2. **functions/src/callables/verifyPaymentSplit.ts**
   - 操作: `.get()` - billIdでtodaysBillsを取得
   - 行番号: 42

3. **functions/src/analytics/migrateSettledBillsForBusinessDay.ts**
   - 操作: `.where().get()` - status='settled'とdateでtodaysBillsを取得
   - 行番号: 27-30

4. **functions/src/utils/getOpenBills.ts**
   - 操作: `.where().get()` - status='open'でtodaysBillsを取得
   - 行番号: 13-16

### Flutter (Dart)

1. **lib/Accounting/accountingPage.dart**
   - 操作: `.where().get()` - dateとstatusでtodaysBillsを取得（2箇所）
   - 行番号: 81-85, 112-117

2. **lib/sideGame/pages/side_game_table_home.dart**
   - 操作: `.get()` - 全todaysBillsを取得
   - 行番号: 628

3. **lib/user_actions/bust_and_reentry_popup.dart**
   - 操作: `.where().get()` - userIdとstatusでtodaysBillsを取得
   - 行番号: 47-52

4. **lib/user_actions/bulk_addon_popup.dart**
   - 操作: `.where().get()` - userIdとstatusでtodaysBillsを取得
   - 行番号: 92-97

5. **lib/user_actions/addon_popup.dart**
   - 操作: `.where().get()` - userIdとstatusでtodaysBillsを取得
   - 行番号: 87-92

6. **lib/tournament/active/widgets/dialogs/register_participants_dialog.dart**
   - 操作: `.where().snapshots()` - status='open'でtodaysBillsをストリーム取得
   - 行番号: 76-78

7. **lib/tournament/active/services/tournament_data_service.dart**
   - 操作: `.where().get()` - userIdとstatusでtodaysBillsを取得
   - 行番号: 102-106

## 注意事項

- **rollbackFunction内のファイル**（undoRegisterParticipants.ts, undoBustAndReentry.ts, undoBustAndExit.ts, undoBulkAddon.ts, undoAddon.ts）は`scheduledTournaments/{tournamentId}/todaysBills`というサブコレクションを参照しています。これは`todaysBills`ルートコレクションとは別のコレクションです。

- **functions/src/analytics/helpers.ts**は`calculateCategoryAmounts`関数で`todaysBills`のデータをパラメータとして受け取るだけで、実際のFirestore操作は行っていません。

- **firestore.rules**と**firestore.indexes.json**は設定ファイルのため、実際の読み書き操作は含まれていません。

- **lib/globalConstant.dart**は定数定義のみで、実際の操作は含まれていません。

## 集計結果

### 書き込み操作ファイル数: 22ファイル
- **読み書き両方**: 20ファイル
  - placeOrder.ts, placeOrderByUser.ts, withdrawTip.ts, depositTip.ts, registerForSideGame.ts, leaveSeat.ts
  - registerParticipants.ts, registerForTournament.ts, bustAndExit.ts, bustAndReentry.ts
  - addon.ts, bulkAddon.ts, reseatAllPlayers.ts, assignSeatToPlayer.ts
  - accounting.ts, updateActiveBill.ts, updateAccounting.ts, cancelAccounting.ts, refundProcessing.ts, migrateTodaysBills.ts
- **書き込みのみ**: 2ファイル
  - manualCheckIn.ts, processVisitByQR.ts
- **除外**: rollbackFunction内の5ファイル（別コレクションのため）

### 読み込み操作ファイル数: 31ファイル
- **読み書き両方**: 20ファイル（上記と同じ）
- **読み込みのみ**: 11ファイル
  - Cloud Functions: getUserOrderHistory.ts, verifyPaymentSplit.ts, migrateSettledBillsForBusinessDay.ts, getOpenBills.ts
  - Flutter: accountingPage.dart, side_game_table_home.dart, bust_and_reentry_popup.dart, bulk_addon_popup.dart, addon_popup.dart, register_participants_dialog.dart, tournament_data_service.dart

### 合計: 33ファイル（rollbackFunction内の5ファイルは別コレクションのため除外）

### 内訳
- **Cloud Functions (TypeScript)**: 22ファイル
- **Flutter (Dart)**: 11ファイル

