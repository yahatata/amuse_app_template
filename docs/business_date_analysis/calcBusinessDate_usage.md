# calcBusinessDateを使用している箇所の分析

## 概要

`calcBusinessDate`を使用している全7箇所について、営業日判定が必要かどうかを分析します。

## 1. クエリフィルタ用（Firestoreへの書き込みなし）

### 1.1. `functions/src/utils/getOpenBills.ts` (17行目)

**使用箇所**: 当日の営業日を計算してクエリフィルタに使用

**日付データの用途**:
- `calcBusinessDate(now)`で当日の営業日を計算
- `bills`コレクションの`businessDate`フィールドでフィルタリング
- 読み取り専用（Firestoreへの書き込みなし）

**営業日判定の必要性**: ✅ **必要**
- 理由：日時から営業日を判定して、どの伝票を取得すべきかを決定する必要がある
- 営業日を跨ぐ可能性があるため、単純なカレンダー日付では不正確

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

### 1.2. `functions/src/itemOrder/getUserOrderHistory.ts` (28行目)

**使用箇所**: 当日の営業日を計算してクエリフィルタに使用

**日付データの用途**:
- `calcBusinessDate(now)`で当日の営業日を計算
- `bills`コレクションの`businessDate`フィールドでフィルタリング
- 読み取り専用（Firestoreへの書き込みなし）

**営業日判定の必要性**: ✅ **必要**
- 理由：日時から営業日を判定して、どの伝票を取得すべきかを決定する必要がある
- 営業日を跨ぐ可能性があるため、単純なカレンダー日付では不正確

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

## 2. イベント計上日計算用（Firestoreへの書き込みあり）

### 2.1. `functions/src/helpers/billsApi/postEventReopen.ts` (106行目)

**使用箇所**: `eventBusinessDate`を計算（未指定時）

**日付データの用途**:
- `calcBusinessDate()`でイベント計上日を計算
- `/bills/{billId}/events/{eventId}`に`eventBusinessDate`として格納
- イベントが発生した時点の営業日を記録

**営業日判定の必要性**: ✅ **必要**
- 理由：イベント発生時点の日時から営業日を判定して、どの営業日に計上すべきかを決定する必要がある
- 営業日を跨ぐ可能性があるため、単純なカレンダー日付では不正確

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

### 2.2. `functions/src/helpers/billsApi/postEventRefund.ts` (160行目)

**使用箇所**: `eventBusinessDate`を計算（未指定時）

**日付データの用途**:
- `calcBusinessDate()`でイベント計上日を計算
- `/bills/{billId}/events/{eventId}`に`eventBusinessDate`として格納
- イベントが発生した時点の営業日を記録

**営業日判定の必要性**: ✅ **必要**
- 理由：イベント発生時点の日時から営業日を判定して、どの営業日に計上すべきかを決定する必要がある
- 営業日を跨ぐ可能性があるため、単純なカレンダー日付では不正確

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

### 2.3. `functions/src/helpers/billsApi/postEventCancel.ts` (118行目)

**使用箇所**: `eventBusinessDate`を計算（未指定時）

**日付データの用途**:
- `calcBusinessDate()`でイベント計上日を計算
- `/bills/{billId}/events/{eventId}`に`eventBusinessDate`として格納
- イベントが発生した時点の営業日を記録

**営業日判定の必要性**: ✅ **必要**
- 理由：イベント発生時点の日時から営業日を判定して、どの営業日に計上すべきかを決定する必要がある
- 営業日を跨ぐ可能性があるため、単純なカレンダー日付では不正確

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

### 2.4. `functions/src/helpers/billsApi/postEventAdjustment.ts` (137行目)

**使用箇所**: `eventBusinessDate`を計算（未指定時）

**日付データの用途**:
- `calcBusinessDate()`でイベント計上日を計算
- `/bills/{billId}/events/{eventId}`に`eventBusinessDate`として格納
- イベントが発生した時点の営業日を記録

**営業日判定の必要性**: ✅ **必要**
- 理由：イベント発生時点の日時から営業日を判定して、どの営業日に計上すべきかを決定する必要がある
- 営業日を跨ぐ可能性があるため、単純なカレンダー日付では不正確

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

## 3. 伝票作成時（Firestoreへの書き込みあり）

### 3.1. `functions/src/helpers/billsApi/createBillWithActiveStay.ts` (98行目)

**使用箇所**: 伝票作成時の`businessDate`を計算

**日付データの用途**:
- `calcBusinessDate(now)`で伝票作成時の営業日を計算
- `/bills/{billId}`に`businessDate`として格納（158行目）
- 伝票がどの営業日に属するかを決定

**営業日判定の必要性**: ✅ **必要**
- 理由：伝票作成時点の日時から営業日を判定して、どの営業日に伝票を格納すべきかを決定する必要がある
- 営業日を跨ぐ可能性があるため、単純なカレンダー日付では不正確

**必要な日付データ**: 営業日（YYYY-MM-DD形式）

---

## まとめ

| ファイル | 用途 | 営業日判定 | 必要な日付データ |
|---------|------|-----------|----------------|
| `getOpenBills.ts` | クエリフィルタ | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `getUserOrderHistory.ts` | クエリフィルタ | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `postEventReopen.ts` | イベント計上日 | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `postEventRefund.ts` | イベント計上日 | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `postEventCancel.ts` | イベント計上日 | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `postEventAdjustment.ts` | イベント計上日 | ✅ 必要 | 営業日（YYYY-MM-DD） |
| `createBillWithActiveStay.ts` | 伝票作成時 | ✅ 必要 | 営業日（YYYY-MM-DD） |

**結論**: `calcBusinessDate`を使用している全7箇所で、営業日判定が必要です。
