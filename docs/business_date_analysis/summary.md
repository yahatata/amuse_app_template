# 営業日判定要件 総合分析

## 概要

プロジェクト内の全ファイルについて、営業日判定が必要かどうかを分析した総合ドキュメントです。

## 判定結果サマリー

### 営業日判定が必要なファイル: 19ファイル

詳細は [営業日判定が必要なファイル一覧](./requires_business_date_determination.md) を参照してください。

**主なカテゴリ**:
1. `calcBusinessDate`を使用しているファイル（7ファイル）
2. 営業日を参照/格納するファイル（3ファイル）
3. 営業日範囲でクエリするファイル（1ファイル）
4. 営業日計算関数（1ファイル）
5. 営業日ベースの集計・分析（7ファイル）

### 営業日判定が不要なファイル: 多数

詳細は [営業日判定が不要なファイル一覧](./no_business_date_determination.md) を参照してください。

**主なカテゴリ**:
1. カレンダー日付ベースの管理（5ファイル）
2. タイムスタンプ記録のみ（多数）
3. 営業日とは無関係な日時計算（2ファイル）
4. レスポンス返却用（2ファイル）
5. クライアント側（2ファイル）

---

## 各ファイルの詳細分析

### 1. calcBusinessDateを使用しているファイル

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `functions/src/utils/getOpenBills.ts` | クエリフィルタ | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `functions/src/itemOrder/getUserOrderHistory.ts` | クエリフィルタ | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `functions/src/helpers/billsApi/postEventReopen.ts` | イベント計上日 | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `functions/src/helpers/billsApi/postEventRefund.ts` | イベント計上日 | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `functions/src/helpers/billsApi/postEventCancel.ts` | イベント計上日 | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `functions/src/helpers/billsApi/postEventAdjustment.ts` | イベント計上日 | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `functions/src/helpers/billsApi/createBillWithActiveStay.ts` | 伝票作成時 | ✅ 必要 | 営業日（YYYY-MM-DD） |

**共通点**: すべて日時から営業日を計算する必要がある

---

### 2. 営業日を参照/格納するファイル

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `functions/src/helpers/billsApi/dualWrite.ts` | デュアルライト | ⚠️ 元の計算時に必要 | 営業日（既に計算済み） |
| `functions/src/helpers/billsApi/appendItem.ts` | 注文作成 | ⚠️ 元の計算時に必要 | 営業日（`bill.businessDate`から取得） |
| `functions/src/itemOrder/placeOrder.ts` | 注文作成 | ⚠️ 元の計算時に必要 | 営業日（`bill.businessDate`から取得） |

**注**: これらのファイルは既に計算済みの`businessDate`を使用するため、実行時点では営業日判定は不要ですが、元の計算時に必要です。

---

### 3. 営業日範囲でクエリするファイル

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `functions/src/callables/getAccountingHistory.ts` | 会計履歴取得 | ✅ 必要 | 営業日範囲（開始時刻・終了時刻） |

**詳細**: 指定された日付（YYYY-MM-DD）から営業日の開始時刻・終了時刻を計算してクエリに使用

---

### 4. 営業日計算関数

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `functions/src/analytics/helpers.ts` | 営業日計算 | ✅ 必要 | 日時（Date）→ 営業日（YYYY-MM-DD） |

**詳細**: `calcBusinessDate`の内部で使用される関数

---

### 5. 営業日ベースの集計・分析

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `functions/src/analytics/updateAnalyticsForBill.ts` | 営業日ベースで集計 | ⚠️ 元の計算時に必要 | 営業日（既に計算済み） |
| `functions/src/analytics/addToMonthlyIndex.ts` | 月次集計 | ⚠️ 元の計算時に必要 | 営業日（既に計算済み） |
| `functions/src/analytics/addToDailySummary.ts` | 日次集計 | ⚠️ 元の計算時に必要 | 営業日（既に計算済み） |
| `functions/src/analytics/addToByUser.ts` | ユーザー別集計 | ⚠️ 元の計算時に必要 | 営業日（既に計算済み） |
| `functions/src/analytics/addToByTemplateTournaments.ts` | トーナメント別集計 | ⚠️ 元の計算時に必要 | 営業日（既に計算済み） |
| `functions/src/analytics/aggregator/index.ts` | 集計キュー | ⚠️ 元の計算時に必要 | 営業日（既に計算済み） |
| `functions/src/analytics/aggregator/writer.ts` | 集計結果格納 | ⚠️ 元の計算時に必要 | 営業日（既に計算済み） |

**注**: これらのファイルは既に計算済みの`businessDate`を使用するため、実行時点では営業日判定は不要ですが、元の計算時に必要です。

---

### 6. カレンダー日付ベースの管理

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `functions/src/attendance/createClockInRecord.ts` | 出勤記録作成 | ❌ 不要 | カレンダー日付（YYYY-MM-DD） |
| `functions/src/attendance/createManualClockInRecord.ts` | 手動出勤記録作成 | ❌ 不要 | カレンダー日付（YYYY-MM-DD） |
| `functions/src/staff/createShiftRequest.ts` | シフト要請作成 | ❌ 不要 | タイムスタンプ（相対時刻計算） |
| `functions/src/staff/declineShiftRequest.ts` | シフト要請辞退 | ❌ 不要 | タイムスタンプ |
| `functions/src/staff/confirmShiftRequest.ts` | シフト要請確認 | ❌ 不要 | タイムスタンプ |

**理由**: 出勤記録・シフト管理はカレンダー日付ベースで管理されるため、営業日判定は不要です。

---

### 7. タイムスタンプ記録のみ

以下のファイルは、タイムスタンプとして記録するだけで、営業日判定は不要です：

- `createdAt`, `updatedAt`を記録するファイル（多数）
- `clockIn`, `clockOut`を記録するファイル
- `orderedAt`を記録するファイル
- `appliedAt`を記録するファイル
- `accountingCompletedAt`, `settledAt`, `checkOutAt`を記録するファイル
- トーナメント関連時刻を記録するファイル

**理由**: 単純なタイムスタンプ記録であり、営業日判定は不要です。

---

### 8. 営業日とは無関係な日時計算

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `functions/src/helpers/billsApi/createBillWithActiveStay.ts` | TTL期限計算 | ❌ 不要 | タイムスタンプ（相対時刻計算） |
| `functions/src/TBD/getScheduledTournaments.ts` | トーナメントスケジュール | ❌ 不要 | カレンダー日付範囲（タイムスタンプ） |

**理由**: 営業日とは無関係な日時計算のため、営業日判定は不要です。

---

### 9. レスポンス返却用（読み取り専用）

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `functions/src/itemOrder/getUserOrderHistory.ts` | 日時変換 | ❌ 不要 | タイムスタンプ → ISO文字列 |
| `functions/src/callables/getAccountingHistory.ts` | 日時変換 | ❌ 不要 | タイムスタンプ → JST ISO文字列 |

**理由**: 既存データの形式変換のみであり、営業日判定は不要です。

---

### 10. クライアント側（Dart）

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `lib/tournament/active/services/server_time_helper.dart` | サーバ時刻同期 | ❌ 不要 | タイムスタンプ |
| `lib/utils/date_time_utils.dart` | 日時計算ユーティリティ | ❌ 不要 | カレンダー日付・タイムスタンプ |

**理由**: サーバ時刻同期・汎用ユーティリティであり、営業日判定は不要です。

---

## 判定方法の統一について

### 営業日判定が必要なファイル

以下のファイルでは、**一律に`calcBusinessDate`を使用**して営業日を判定する必要があります：

1. `functions/src/utils/getOpenBills.ts`
2. `functions/src/itemOrder/getUserOrderHistory.ts`
3. `functions/src/helpers/billsApi/postEventReopen.ts`
4. `functions/src/helpers/billsApi/postEventRefund.ts`
5. `functions/src/helpers/billsApi/postEventCancel.ts`
6. `functions/src/helpers/billsApi/postEventAdjustment.ts`
7. `functions/src/helpers/billsApi/createBillWithActiveStay.ts`
8. `functions/src/callables/getAccountingHistory.ts`

**統一方法**: すべて`calcBusinessDate(now)`または`calcBusinessDate(date)`を使用

### 営業日判定が不要なファイル

以下のファイルでは、営業日判定は不要です：

1. カレンダー日付ベースの管理（出勤記録、シフト管理）
2. タイムスタンプ記録のみ（メタデータ、時刻記録）
3. 営業日とは無関係な日時計算（TTL期限、トーナメントスケジュール）
4. レスポンス返却用（既存データの形式変換）
5. クライアント側（サーバ時刻同期、汎用ユーティリティ）

**統一方法**: 既存の実装を維持（営業日判定を追加しない）

---

## 重要なポイント

1. **営業日判定が必要なのは、日時から営業日を計算する時点**
   - 既に計算済みの`businessDate`を使用する場合は、実行時点では不要

2. **データの整合性を保つため、元の計算時に営業日判定が必要**
   - 例：`orders.date`は`bill.businessDate`から取得されるが、元の`bill.businessDate`計算時に必要

3. **判定方法は一律に`calcBusinessDate`を使用**
   - 他の方法で営業日を計算しないこと

4. **カレンダー日付ベースの管理は営業日判定不要**
   - 出勤記録、シフト管理などはカレンダー日付で十分

5. **タイムスタンプ記録のみの場合は営業日判定不要**
   - `createdAt`, `updatedAt`などのメタデータは営業日判定不要
