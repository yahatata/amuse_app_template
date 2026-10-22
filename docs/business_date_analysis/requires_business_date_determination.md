# 営業日判定が必要なファイル一覧

## 概要

営業日判定が必要なファイルを、用途別に分類してまとめます。

## 判定基準

営業日判定が必要なファイルは、以下のいずれかに該当します：

1. **日時から営業日を計算してドキュメントを参照/格納する場合**
2. **営業日を跨ぐ可能性があるデータを扱う場合**
3. **営業日ベースの集計・分析を行う場合**

## ファイル一覧

### 1. calcBusinessDateを使用しているファイル

#### 1.1. クエリフィルタ用

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/utils/getOpenBills.ts` | 17 | 当日の営業日を計算してクエリフィルタに使用 | 営業日（YYYY-MM-DD） |
| `functions/src/itemOrder/getUserOrderHistory.ts` | 28 | 当日の営業日を計算してクエリフィルタに使用 | 営業日（YYYY-MM-DD） |

#### 1.2. イベント計上日計算用

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/helpers/billsApi/postEventReopen.ts` | 106 | `eventBusinessDate`を計算（未指定時） | 営業日（YYYY-MM-DD） |
| `functions/src/helpers/billsApi/postEventRefund.ts` | 160 | `eventBusinessDate`を計算（未指定時） | 営業日（YYYY-MM-DD） |
| `functions/src/helpers/billsApi/postEventCancel.ts` | 118 | `eventBusinessDate`を計算（未指定時） | 営業日（YYYY-MM-DD） |
| `functions/src/helpers/billsApi/postEventAdjustment.ts` | 137 | `eventBusinessDate`を計算（未指定時） | 営業日（YYYY-MM-DD） |

#### 1.3. 伝票作成時

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/helpers/billsApi/createBillWithActiveStay.ts` | 98 | 伝票作成時の`businessDate`を計算 | 営業日（YYYY-MM-DD） |

---

### 2. 営業日を参照/格納するファイル

#### 2.1. デュアルライト用

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/helpers/billsApi/dualWrite.ts` | 75 | `todaysBills`に`date`フィールドとして格納 | 営業日（YYYY-MM-DD、既に計算済み） |

**注**: このファイルは`createBillWithActiveStay`から`businessDate`を受け取るため、格納時点では営業日判定は不要ですが、元の計算時に必要です。

#### 2.2. 注文関連

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/helpers/billsApi/appendItem.ts` | 471, 514, 543 | `orders`に`date`フィールドとして格納 | 営業日（YYYY-MM-DD、`bill.businessDate`から取得） |
| `functions/src/itemOrder/placeOrder.ts` | 161 | `orders`に`date`フィールドとして格納 | 営業日（YYYY-MM-DD、`bill.businessDate`から取得） |

**注**: これらのファイルは既に計算済みの`bill.businessDate`を使用するため、格納時点では営業日判定は不要ですが、元の計算時に必要です。

---

### 3. 営業日範囲でクエリするファイル

#### 3.1. 会計履歴取得

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/callables/getAccountingHistory.ts` | 37-60 | 営業日範囲を計算してクエリに使用 | 営業日範囲（開始時刻・終了時刻） |

**詳細**:
- 指定された日付（YYYY-MM-DD）から営業日の開始時刻・終了時刻を計算
- `STORE_CLOSE_HOUR`を使用して営業日範囲を決定
- `accountingHistory`コレクションを営業日範囲でフィルタリング

---

### 4. 営業日計算関数

#### 4.1. 営業日計算ヘルパー

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/analytics/helpers.ts` | 16 | `resolveBusinessDate`関数で営業日を計算 | 日時（Date）→ 営業日（YYYY-MM-DD） |

**詳細**:
- `calcBusinessDate`の内部で使用される関数
- 日時と`STORE_CLOSE_HOUR`から営業日を計算

---

### 5. 営業日ベースの集計・分析

#### 5.1. Analytics関連

以下のファイルは、既に計算済みの`businessDate`を使用して集計・分析を行いますが、元の計算時に営業日判定が必要です：

| ファイル | 用途 | 必要な日付データ |
|---------|------|----------------|
| `functions/src/analytics/updateAnalyticsForBill.ts` | 営業日ベースで集計 | 営業日（YYYY-MM-DD、既に計算済み） |
| `functions/src/analytics/addToMonthlyIndex.ts` | 月次集計に営業日をキーとして使用 | 営業日（YYYY-MM-DD、既に計算済み） |
| `functions/src/analytics/addToDailySummary.ts` | 日次集計に営業日をキーとして使用 | 営業日（YYYY-MM-DD、既に計算済み） |
| `functions/src/analytics/addToByUser.ts` | ユーザー別集計に営業日をキーとして使用 | 営業日（YYYY-MM-DD、既に計算済み） |
| `functions/src/analytics/addToByTemplateTournaments.ts` | トーナメント別集計に営業日をキーとして使用 | 営業日（YYYY-MM-DD、既に計算済み） |
| `functions/src/analytics/aggregator/index.ts` | 集計キューに営業日を含める | 営業日（YYYY-MM-DD、既に計算済み） |
| `functions/src/analytics/aggregator/writer.ts` | 集計結果を営業日ベースで格納 | 営業日（YYYY-MM-DD、既に計算済み） |

**注**: これらのファイルは既に計算済みの`businessDate`を使用するため、実行時点では営業日判定は不要ですが、元の計算時に必要です。

---

## まとめ表

| カテゴリ | ファイル数 | 営業日判定のタイミング |
|---------|-----------|---------------------|
| `calcBusinessDate`を使用 | 7 | 実行時 |
| 営業日を参照/格納 | 3 | 元の計算時（格納時は不要） |
| 営業日範囲でクエリ | 1 | 実行時 |
| 営業日計算関数 | 1 | 実行時 |
| 営業日ベースの集計 | 7 | 元の計算時（実行時は不要） |

**合計**: 19ファイル（重複を除く）

**重要なポイント**:
- 営業日判定が必要なのは、**日時から営業日を計算する時点**
- 既に計算済みの`businessDate`を使用する場合は、実行時点では営業日判定は不要
- ただし、データの整合性を保つため、元の計算時に営業日判定が必要
