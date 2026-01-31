# 営業日判定が不要なファイル一覧

## 概要

営業日判定が不要なファイルを、用途別に分類してまとめます。

## 判定基準

営業日判定が不要なファイルは、以下のいずれかに該当します：

1. **単純なカレンダー日付で十分な場合**
2. **既に営業日が確定しているデータを参照するだけの場合**
3. **タイムスタンプとして記録するだけで、営業日判定が不要な場合**
4. **営業日とは無関係な日時計算の場合**

## ファイル一覧

### 1. カレンダー日付ベースの管理

#### 1.1. 出勤記録

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/attendance/createClockInRecord.ts` | 38-42 | JST日付を計算して`attendances.date`に格納 | カレンダー日付（YYYY-MM-DD） |
| `functions/src/attendance/createManualClockInRecord.ts` | 38-42 | JST日付を計算して`attendances.date`に格納 | カレンダー日付（YYYY-MM-DD） |

**理由**: 出勤記録はカレンダー日付ベースで管理されるため、営業日判定は不要です。

---

#### 1.2. シフト管理

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/staff/createShiftRequest.ts` | 78 | 翌月の日時を計算して`expiresAt`に格納 | タイムスタンプ（相対時刻計算） |
| `functions/src/staff/declineShiftRequest.ts` | 81 | JST日時を計算して`declinedAt`に格納 | タイムスタンプ |
| `functions/src/staff/confirmShiftRequest.ts` | 89 | JST日時を計算して`confirmedAt`に格納 | タイムスタンプ |

**理由**: シフト管理はカレンダー日付ベースで管理されるため、営業日判定は不要です。

---

### 2. タイムスタンプ記録のみ

#### 2.1. メタデータ（createdAt, updatedAt）

以下のファイルは、`createdAt`や`updatedAt`などのメタデータを記録するだけで、営業日判定は不要です：

- `functions/src/helpers/billsApi/createBillWithActiveStay.ts` (160-161行目)
- `functions/src/helpers/billsApi/appendItem.ts` (159行目)
- `functions/src/helpers/billsApi/appendExtra.ts` (127行目)
- `functions/src/helpers/billsApi/postEventReopen.ts` (108行目)
- `functions/src/helpers/billsApi/postEventRefund.ts` (162行目)
- `functions/src/helpers/billsApi/postEventCancel.ts` (120行目)
- `functions/src/helpers/billsApi/postEventAdjustment.ts` (139行目)
- その他、多くのファイルで`serverTimestamp()`を使用

**理由**: 単純なタイムスタンプ記録であり、営業日判定は不要です。

---

#### 2.2. 出退勤時刻

| ファイル | 用途 | 必要な日付データ |
|---------|------|----------------|
| `functions/src/attendance/createClockInRecord.ts` | `clockIn`を記録 | タイムスタンプ |
| `functions/src/attendance/createManualClockInRecord.ts` | `clockIn`を記録 | タイムスタンプ |
| `functions/src/attendance/updateClockOutRecord.ts` | `clockOut`を記録 | タイムスタンプ |

**理由**: 出退勤時刻はタイムスタンプとして記録するだけで、営業日判定は不要です。

---

#### 2.3. 注文時刻

| ファイル | 用途 | 必要な日付データ |
|---------|------|----------------|
| `functions/src/itemOrder/placeOrderByUser.ts` | `orderedAt`を記録 | タイムスタンプ |
| `functions/src/helpers/billsApi/appendItem.ts` | `orderedAt`を記録 | タイムスタンプ |

**理由**: 注文時刻はタイムスタンプとして記録するだけで、営業日判定は不要です。
注：`orders.date`は別途`bill.businessDate`から取得されるため、注文時刻の記録時点では不要です。

---

#### 2.4. イベント適用時刻

| ファイル | 用途 | 必要な日付データ |
|---------|------|----------------|
| `functions/src/triggers/bills.events.onCreate.ts` | `appliedAt`を記録 | タイムスタンプ |

**理由**: イベント適用時刻はタイムスタンプとして記録するだけで、営業日判定は不要です。
注：`eventBusinessDate`は別途`calcBusinessDate`で計算されるため、適用時刻の記録時点では不要です。

---

#### 2.5. 会計完了時刻

| ファイル | 用途 | 必要な日付データ |
|---------|------|----------------|
| `functions/src/callables/accounting.ts` | `accountingCompletedAt`, `settledAt`, `checkOutAt`を記録 | タイムスタンプ |

**理由**: 会計完了時刻はタイムスタンプとして記録するだけで、営業日判定は不要です。
注：会計履歴のクエリでは営業日範囲を使用しますが、これは別途計算されます。

---

#### 2.6. トーナメント関連時刻

| ファイル | 用途 | 必要な日付データ |
|---------|------|----------------|
| `functions/src/helpers/billsApi/recordTournamentAction.ts` | `registeredAt`, `lastReentryAt`, `lastAddonAt`を記録 | タイムスタンプ |
| `functions/src/helpers/billsApi/dualWrite.ts` | `registeredAt`, `lastReentryAt`, `lastAddonAt`, `startAt`を記録 | タイムスタンプ |

**理由**: トーナメント関連時刻はタイムスタンプとして記録するだけで、営業日判定は不要です。

---

### 3. 営業日とは無関係な日時計算

#### 3.1. TTL期限

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/helpers/billsApi/createBillWithActiveStay.ts` | 101 | `expiresAt = now + 48h`を計算 | タイムスタンプ（相対時刻計算） |

**理由**: TTL期限は相対時刻計算であり、営業日判定は不要です。

---

#### 3.2. トーナメントスケジュール

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/TBD/getScheduledTournaments.ts` | 24-112 | JST日時を計算してクエリ範囲に使用 | カレンダー日付範囲（タイムスタンプ） |

**理由**: トーナメントスケジュールはカレンダー日付ベースで管理されるため、営業日判定は不要です。

---

### 4. レスポンス返却用（読み取り専用）

#### 4.1. 日時変換

| ファイル | 行番号 | 用途 | 必要な日付データ |
|---------|--------|------|----------------|
| `functions/src/itemOrder/getUserOrderHistory.ts` | 58-76 | Firestoreから取得した`createdAt`, `updatedAt`をISO文字列に変換 | タイムスタンプ → ISO文字列 |
| `functions/src/callables/getAccountingHistory.ts` | 75-91 | Firestoreから取得したタイムスタンプをJSTに変換 | タイムスタンプ → JST ISO文字列 |

**理由**: 既存データの形式変換のみであり、営業日判定は不要です。

---

### 5. クライアント側（Dart）

#### 5.1. サーバ時刻取得

| ファイル | 用途 | 必要な日付データ |
|---------|------|----------------|
| `lib/tournament/active/services/server_time_helper.dart` | サーバ時刻オフセットを取得・計算 | タイムスタンプ |

**理由**: サーバ時刻の同期のみであり、営業日判定は不要です。

---

#### 5.2. 日時計算ユーティリティ

| ファイル | 用途 | 必要な日付データ |
|---------|------|----------------|
| `lib/utils/date_time_utils.dart` | JST基準の日時計算ユーティリティ | カレンダー日付・タイムスタンプ |

**理由**: 汎用的な日時計算ユーティリティであり、営業日判定は不要です。

---

## まとめ表

| カテゴリ | ファイル数 | 理由 |
|---------|-----------|------|
| カレンダー日付ベースの管理 | 5 | 出勤記録・シフト管理はカレンダー日付ベース |
| タイムスタンプ記録のみ | 多数 | メタデータ、時刻記録のみ |
| 営業日とは無関係な日時計算 | 2 | TTL期限、トーナメントスケジュール |
| レスポンス返却用 | 2 | 既存データの形式変換のみ |
| クライアント側 | 2 | サーバ時刻同期、汎用ユーティリティ |

**重要なポイント**:
- タイムスタンプとして記録するだけの場合は、営業日判定は不要
- カレンダー日付ベースで管理する場合は、営業日判定は不要
- 既存データの形式変換のみの場合は、営業日判定は不要
- 営業日とは無関係な日時計算の場合は、営業日判定は不要
