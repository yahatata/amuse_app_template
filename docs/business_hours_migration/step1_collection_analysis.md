# Step1: コレクション分析

## 概要

`businessDate`を格納する必要があるコレクションを洗い出し、各コレクションの日時フィールドの現状を分析します。

## 重要：Firestoreフィールド名について

- **用語として「営業日キー（businessDateKey）」を使用**：本ドキュメントでは概念として`businessDateKey`（`YYYY-MM-DD`形式）という用語を使用します。
- **Firestoreの実フィールド名は原則現状維持**：
  - `bills`: `businessDate`（フィールド名）
  - `orders`: 親docId（`YYYYMMDD`形式）+ `date`（フィールド名、現状維持）
  - `scheduledTournaments`: 追加する場合は`businessDate`（フィールド名、Keyにはしない）
  - `attendances` / `attendanceCorrectionRequests`: `date` → `businessDate`（フィールド名）へ変更（既存方針の通り）
  - `storeMeta/currentBusinessDay`: `currentBusinessDateKey`（state doc内のフィールド名として採用、それ以外へ波及させない）
- **実装時の再確認項目**：Firestoreフィールド名を全面置換しない方針を遵守すること。

## 分析基準

### businessDateを格納する必要があるコレクション

以下のいずれかに該当するコレクションは、`businessDate`を格納する必要があります：

1. **営業日を跨ぐ可能性があるデータを扱うコレクション**
   - 伝票（bills）、注文（orders）、イベント（events）など

2. **営業日ベースで集計・分析を行うコレクション**
   - analyticsMonthly の日次集計など

3. **営業日をキーとして使用するコレクション**
   - orders, todaysBills など

### 営業日判定の用途分離

本改修では、営業日判定の用途を明確に分離します：

- **【現在時刻（いま）】のデータ格納・表示（当日画面など）**:
  - `getCurrentBusinessDate`（= `storeMeta/currentBusinessDay`参照）を使用
  - UIはFirestoreの`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得（リアルタイム性重視）

- **【予定・任意日時（いま以外）】の営業日算出**:
  - `calcBusinessDate`を使用
  - `calcBusinessDate`は`businessHoursMonthlyMap`を参照して計算する
  - 営業時間の前後±30分をバッファとして含める
  - 判定結果は`OK`/`NONE`/`AMBIGUOUS`を返せること
    - `NONE`: どの営業日にも属さない
    - `AMBIGUOUS`: 複数営業日に跨る
  - UIは`NONE`時にエラーダイアログ、`AMBIGUOUS`時に候補選択ダイアログを表示

### 対象外のコレクション

以下のコレクションは、日時フィールドを持っていても`businessDate`は不要です：

1. **タイムスタンプ記録のみのコレクション**
   - activeStays, idempotency, items, extras など

2. **営業日とは無関係な日時計算のコレクション**
   - shiftRequests（シフト管理）

3. **イベントが稀で営業日ごとの表示思想がないコレクション**
   - bills/{billId}/events（イベント）
     - **注意**: イベント格納時（例：`eventBusinessDate` / `originBusinessDate`等）には、例外的に`calcBusinessDate(ts)`を使う可能性がある
       - 実コード確認：`postEventAdjustment.ts`（137行目）、`postEventReopen.ts`（106行目）などで、`eventBusinessDate`が指定されない場合は`calcBusinessDate()`を使用している
       - ただしイベントは稀な例外であり、通常フローはstate docから現在営業日を得る運用（当日）
   - analyticsMonthly/{monthKey}/eventsLog（イベントログ）

4. **削除予定のレガシーコレクション**
   - todaysBills（デュアルライト用）

---

## businessDateを格納する必要があるコレクション

### 1. `bills`コレクション

**コレクション名**: `bills`

**ドキュメントID**: `{billId}`

**現在の日時フィールド**:
- `businessDate`: string (YYYY-MM-DD形式) - ✅ 既に格納済み
- `createdAt`: Timestamp - 伝票作成時刻
- `updatedAt`: Timestamp - 最終更新時刻
- `closedAt`: Timestamp | null - 会計確定時刻（settled遷移時）
- `accountingCompletedAt`: Timestamp | null - 会計完了時刻
- `settledAt`: Timestamp | null - 決済時刻
- `checkOutAt`: Timestamp | null - チェックアウト時刻

**営業日判定の必要性**: ✅ **必要**（現在時刻の格納）
- 理由：伝票作成時点の日時から営業日を判定して格納する必要がある
- **判定方法**: `getCurrentBusinessDateKeyOrThrow()`を使用（`storeMeta/currentBusinessDay`参照）
- **注意**: `bills`コレクションの`businessDate`（フィールド名）は、state docの`currentBusinessDateKey`から取得する

**格納ファイル**: `functions/src/helpers/billsApi/createBillWithActiveStay.ts` (158行目)

**追加が必要なフィールド**:
- なし（`createdAt`で十分）

---


### 2. `orders`コレクション

**コレクション名**: `orders`

**ドキュメントID**: `{orderDocId}` (businessDateからYYYYMMDD形式に変換)

**現在の日時フィールド**:
- `date`: string (YYYY-MM-DD形式) - ✅ 既に格納済み（`bill.businessDate`から取得）
- `createdAt`: Timestamp - 注文日時（親ドキュメント作成時）
- `updatedAt`: Timestamp - 最終更新時刻

**サブコレクション**: `orders/{orderDocId}/_TodaysOrders`

**サブコレクションの日時フィールド**:
- `orderedAt`: Timestamp - 注文時刻

**営業日判定の必要性**: ✅ **必要**（SSoTは`bill.businessDate`）
- 理由：`orders`は全て`bills`に結びつく（SSoTは`bill.businessDate`）
- **判定方法**: 
  - 格納時：`bill.businessDate`から取得（`bill.businessDate`が正（SSoT））
  - 取得・表示時：当日画面の場合は`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得し、その営業日から`YYYYMMDD`形式のドキュメントIDを生成
  - 前日/翌日の取得：単純に前日/翌日の営業日キー列を生成（`isClosed`考慮は今回はしない）

**格納ファイル**:
- `functions/src/helpers/billsApi/appendItem.ts` (471, 514, 543行目)
  - `appendItemWithOrderProjection`関数内で`orders`コレクションに`date`フィールドを格納
- `functions/src/itemOrder/placeOrder.ts` (148行目)
  - `appendItemWithOrderProjection`を呼び出し、間接的に`orders`コレクションに`date`フィールドを格納（アプリ側/スタッフからの注文時）
- `functions/src/itemOrder/placeOrderByUser.ts` (121, 151行目)
  - 直接`orders`コレクションに`date`フィールドを格納（LINE側からの注文時）

**追加が必要なフィールド**:
- なし（`createdAt`で十分）

**注**: 
- `orders`コレクションのドキュメントIDは`bill.businessDate`から`YYYYMMDD`形式に変換したものです（`bill.businessDate`が正（SSoT））。
- `businessDate`をドキュメント内に持たせる必要はありませんが、**どのYYYYMMDDドキュメントに格納するか**、**どのYYYYMMDDドキュメントを参照・取得・表示するか**を判定する際に`bill.businessDate`を使用します。
- 格納時: `bill.businessDate`から取得（`bill.businessDate`が正（SSoT））
- 取得・表示時: 当日画面の場合は`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得し、その営業日から`YYYYMMDD`形式のドキュメントIDを生成
- **例外経路（TODO）**: 実コード確認の結果、orders作成経路に「billが無い例外経路」は見当たりませんでした。将来的に例外経路が追加される場合は、その例外をTODOとして記載してください。

---


### 3. `analyticsMonthly/{monthKey}/days/{businessDate}`サブコレクション

**コレクション名**: `analyticsMonthly/{monthKey}/days`

**ドキュメントID**: `{businessDate}` (YYYY-MM-DD形式)

**現在の日時フィールド**:
- `createdAt`: Timestamp - ドキュメント作成時刻
- `updatedAt`: Timestamp - 最終更新時刻

**営業日判定の必要性**: ✅ **必要**（SSoTは対象`bills`の`businessDate`）
- 理由：`businessDate`をキーとして使用するため、対象`bills`の`businessDate`を正（SSoT）として決定する必要がある
- **判定方法**: 
  - 集計時：対象`bills`の`businessDate`を正（SSoT）として集計・保存
  - バッチで今日分集計する場合でも、対象`bills`を`businessDate`で抽出して集計する（`currentBusinessDateKey`生成不要）

**格納ファイル**:
- `functions/src/analytics/addToDailySummary.ts` (84-95行目)
- `functions/src/analytics/aggregator/writer.ts` (22行目)

**追加が必要なフィールド**:
- なし（集計結果を格納するコレクションのため、発生時刻は不要）

**注**: このコレクションは集計結果を格納するため、発生時刻の記録は不要です。

---

### 4. `scheduledTournaments`コレクション

**コレクション名**: `scheduledTournaments`

**現在の日時フィールド**:
- `startAt`: Timestamp - 開始時刻
- `regEndAt`: Timestamp - レジスト終了時刻
- `createdAt`: Timestamp - 作成時刻
- `updatedAt`: Timestamp - 更新時刻

**営業日判定の必要性**: ✅ **必要**（予定・任意日時の格納）
- 理由：当日の営業日に開催するトーナメントを表示するため、`startAt`から営業日を計算して格納する必要がある
- **判定方法**: `calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応）
- **注意**: `startAt`から`businessDate`を計算する際に`AMBIGUOUS`/`NONE`が返される可能性があるため、UIで適切に処理する必要がある

**格納ファイル**:
- `functions/src/callables/createScheduledTournament.ts` (107-140行目)
- `functions/src/callables/generateRecurringTournaments.ts` (255行目付近、`createScheduledTournamentFromRecurrence`関数内)

**追加が必要なフィールド**:
- `businessDate`: string (YYYY-MM-DD形式) - `startAt`から計算した営業日

**注意事項**:
- `bills`コレクションに格納される`tournamentsSnapshot`（Map形式）は、`bills/{billId}/tournaments`サブコレクションから生成されるため、`scheduledTournaments`に`businessDate`を追加しても`tournamentsSnapshot`の形式は変更されません。既存の形式を維持してください。

---

### 5. `attendances`コレクション

**コレクション名**: `attendances`

**現在の日時フィールド**:
- `date`: string (YYYY-MM-DD形式) - カレンダー日付（現在）
- `clockIn`: Timestamp - 出勤時刻
- `clockOut`: Timestamp | null - 退勤時刻
- `createdAt`: Timestamp - 作成時刻
- `updatedAt`: Timestamp - 更新時刻

**営業日判定の必要性**: ✅ **必要**（予定・任意日時の格納）
- 理由：出勤記録を営業日ベースで管理し、表示時に適切に出勤時間を出勤営業日に寄せられるようにするため、`clockIn`から営業日を計算して格納する必要がある
- **判定方法**: `calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応）
- **注意**: `clockIn`から`businessDate`を計算する際に`AMBIGUOUS`/`NONE`が返される可能性があるため、UIで適切に処理する必要がある

**格納ファイル**:
- `functions/src/attendance/createClockInRecord.ts` (59-70行目)
- `functions/src/attendance/createManualClockInRecord.ts` (59-70行目)
- `functions/src/attendance/updateClockOutRecord.ts` (更新時)

**修正が必要なフィールド**:
- `date`: string (YYYY-MM-DD形式) → `businessDate`: string (YYYY-MM-DD形式) に変更
  - `clockIn`の時刻から`calcBusinessDate`を使用して営業日を計算

---

### 6. `attendanceCorrectionRequests`コレクション

**コレクション名**: `attendanceCorrectionRequests`

**現在の日時フィールド**:
- `date`: string (YYYY-MM-DD形式) - カレンダー日付（現在）
- `createdAt`: Timestamp - 申請日時
- `updatedAt`: Timestamp - 更新時刻
- `approvedAt`: Timestamp | null - 承認日時
- `rejectedAt`: Timestamp | null - 却下日時

**営業日判定の必要性**: ⚠️ **保留**（検討中）
- **保留理由**: attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため
- **現状**: `date`フィールドはカレンダー日付として維持
- **将来の対応**: 検討が完了した時点で対応を決定

**格納ファイル**:
- `functions/src/attendance/createAttendanceCorrectionRequest.ts` (61-79行目)

**修正が必要なフィールド**:
- 現時点では修正不要（保留）

---

## 日時フィールドを持つが、businessDateは不要なコレクション（対象外）

### 1. `activeStays`コレクション

**コレクション名**: `activeStays`

**現在の日時フィールド**:
- `startedAt`: Timestamp - 入店開始時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：タイムスタンプ記録のみであり、営業日判定は不要
- 注：`bills.businessDate`は別途`calcBusinessDate`で計算される

**格納ファイル**: `functions/src/helpers/billsApi/createBillWithActiveStay.ts` (179-185行目)

---

### 2. `accountingHistory`コレクション

**コレクション名**: `accountingHistory`

**現在の日時フィールド**:
- `accountingStartedAt`: Timestamp - 会計開始時刻
- `accountingCompletedAt`: Timestamp - 会計完了時刻
- `createdAt`: Timestamp - 作成時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：タイムスタンプ記録のみであり、営業日判定は不要
- 注：会計履歴のクエリでは営業日範囲を使用するが、これは別途計算される

**格納ファイル**: `functions/src/callables/accounting.ts` (412-428行目)

---

### 3. `analyticsMonthly`コレクション

**コレクション名**: `analyticsMonthly`

**現在の日時フィールド**:
- `processedAt`: Timestamp - 集計処理時刻
- `createdAt`: Timestamp - 作成時刻
- `updatedAt`: Timestamp - 更新時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：タイムスタンプ記録のみであり、営業日判定は不要

**格納ファイル**:
- `functions/src/analytics/addToMonthlyIndex.ts` (73-85行目)
- `functions/src/analytics/aggregator/markers.ts` (43行目)

---

### 4. `shiftRequests`コレクション

**コレクション名**: `shiftRequests`

**現在の日時フィールド**:
- `requestedAt`: Timestamp - 要請時刻
- `confirmedAt`: Timestamp | null - 確認時刻
- `declinedAt`: Timestamp | null - 辞退時刻
- `rejectedAt`: Timestamp | null - 拒否時刻
- `approvedAt`: Timestamp | null - 承認時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：シフト管理はカレンダー日付ベースで管理されるため、営業日判定は不要

**格納ファイル**:
- `functions/src/staff/createShiftRequest.ts` (107-113行目)
- `functions/src/staff/confirmShiftRequest.ts` (89-95行目)
- `functions/src/staff/declineShiftRequest.ts` (81-88行目)
- `functions/src/staff/approveShift.ts` (66行目)
- `functions/src/staff/rejectShift.ts` (66行目)

---

### 5. `bills/{billId}/tournaments/{tplId}`サブコレクション

**コレクション名**: `bills/{billId}/tournaments`

**現在の日時フィールド**:
- `registeredAt`: Timestamp | null - 登録時刻
- `lastReentryAt`: Timestamp | null - 最後の再エントリー時刻
- `lastAddonAt`: Timestamp | null - 最後のアドオン時刻
- `startAt`: Timestamp | null - 開始時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：タイムスタンプ記録のみであり、営業日判定は不要

**格納ファイル**: `functions/src/helpers/billsApi/recordTournamentAction.ts` (182-198行目)

---

### 6. `bills/{billId}/idempotency/{key}`サブコレクション

**コレクション名**: `bills/{billId}/idempotency`

**現在の日時フィールド**:
- `expiresAt`: Timestamp - 有効期限（TTL用、now + 48h）
- `createdAt`: Timestamp - 作成時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：相対時刻計算であり、営業日判定は不要

**格納ファイル**: `functions/src/helpers/billsApi/createBillWithActiveStay.ts` (188-192行目)

---

### 7. `bills/{billId}/items/{itemId}`サブコレクション

**コレクション名**: `bills/{billId}/items`

**現在の日時フィールド**:
- `orderedAt`: Timestamp - 注文時刻
- `createdAt`: Timestamp - 作成時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：タイムスタンプ記録のみであり、営業日判定は不要
- 注：`orders.date`は別途`bill.businessDate`から取得される

**格納ファイル**: `functions/src/helpers/billsApi/appendItem.ts`

---

### 8. `bills/{billId}/extras/{extraId}`サブコレクション

**コレクション名**: `bills/{billId}/extras`

**現在の日時フィールド**:
- `createdAt`: Timestamp - 作成時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：タイムスタンプ記録のみであり、営業日判定は不要

**格納ファイル**: `functions/src/helpers/billsApi/createBillWithActiveStay.ts` (198-210行目)

---

### 9. `bills/{billId}/sideGameChips/{chipId}`サブコレクション

**コレクション名**: `bills/{billId}/sideGameChips`

**現在の日時フィールド**:
- `orderedAt`: Timestamp - 注文時刻
- `createdAt`: Timestamp - 作成時刻

**営業日判定の必要性**: ❌ **不要**
- 理由：タイムスタンプ記録のみであり、営業日判定は不要

**格納ファイル**: `functions/src/helpers/billsApi/appendSideGameChip.ts` (164-172行目)

---

### 10. その他のコレクション

以下のコレクションも日時フィールドを持っていますが、`businessDate`は不要です：

- `users` - ユーザー情報（visitLogsサブコレクションに日時フィールド）
- `devices` - デバイス情報
- `staffs` - スタッフ情報
- `tournamentTemplates` - トーナメントテンプレート
- `blindTemplates` - ブラインドテンプレート
- `tables` - テーブル情報

---

## まとめ表

### businessDateを格納する必要があるコレクション（6コレクション）

| コレクション | 現在のbusinessDate関連フィールド | 追加/修正が必要なフィールド | 格納ファイル |
|------------|--------------------------------|-------------------------|------------|
| `bills` | `businessDate` | なし（`createdAt`で十分） | `createBillWithActiveStay.ts` |
| `orders` | `date` | なし（`createdAt`で十分。SSoTは`bill.businessDate`） | `appendItem.ts`, `placeOrder.ts`, `placeOrderByUser.ts` |
| `analyticsMonthly/{monthKey}/days` | なし（キーとして使用） | なし | `addToDailySummary.ts`, `aggregator/writer.ts` |
| `scheduledTournaments` | なし | `businessDate` (追加) | `createScheduledTournament.ts` |
| `attendances` | `date` (カレンダー日付) | `businessDate` (修正: `date`→`businessDate`) | `createClockInRecord.ts`, `createManualClockInRecord.ts`, `updateClockOutRecord.ts` |
| `attendanceCorrectionRequests` | `date` (カレンダー日付) | `businessDate` (修正: `date`→`businessDate`) | `createAttendanceCorrectionRequest.ts` |

### 日時フィールドを持つが、businessDateは不要なコレクション（対象外）

| コレクション | 日時フィールド | 理由 |
|------------|--------------|------|
| `bills/{billId}/events` | `originBusinessDate`, `eventBusinessDate`, `createdAt`, `appliedAt` | イベントが稀で、営業日ごとの表示思想がない |
| `todaysBills` | `date` | 削除予定のレガシーコレクション |
| `analyticsMonthly/{monthKey}/eventsLog` | `originBusinessDate`, `eventBusinessDate`, `createdAt` | イベントが稀で、重要情報はoriginBusinessDate |
| `activeStays` | `startedAt` | タイムスタンプ記録のみ |
| `accountingHistory` | `accountingStartedAt`, `accountingCompletedAt` | タイムスタンプ記録のみ |
| `analyticsMonthly` | `processedAt` | タイムスタンプ記録のみ |
| `shiftRequests` | `requestedAt`, `confirmedAt`, etc. | カレンダー日付ベース |
| `bills/{billId}/tournaments` | `registeredAt`, `lastReentryAt`, etc. | タイムスタンプ記録のみ |
| `bills/{billId}/idempotency` | `expiresAt` | 相対時刻計算 |
| `bills/{billId}/items` | `orderedAt` | タイムスタンプ記録のみ |
| `bills/{billId}/extras` | `createdAt` | タイムスタンプ記録のみ |
| `bills/{billId}/sideGameChips` | `orderedAt` | タイムスタンプ記録のみ |

---

## 次のステップ

Step2では、追加格納する日時フィールドの詳細設計を行います。
