# 会計管理画面 データ表示不具合 原因分析レポート

_作成日: 2025-12-20 (JST)_

## 問題概要

**表示されていないデータ**:
- billId: `"aaf56292-6a84-4d9b-97f9-da0fdfab08ce"`
- businessDate: `"2026-01-19"`
- status: `"open"`
- createdAt: `2026年1月19日 7:34:34 UTC+9`

**ログ**:
```
I/flutter (26240): [_loadSettledBills] 検索営業日: 2026-01-18
I/flutter (26240): [_loadSettledBills] 取得件数: 0
```

---

## 原因分析

### 1. 営業日計算の不一致（根本原因）

#### サーバー側（Functions）の営業日計算

**実装**: `functions/src/helpers/billsApi/calcBusinessDate.ts`
- `getStoreCloseHour()` を使用（環境変数 `STORE_CLOSE_HOUR` または `functions:config().ops.store_close_hour` または**デフォルト27**）
- `normalizeStoreCloseHour(27) = 27 % 24 = 3`（翌日の3:00まで）

**計算ロジック**:
```typescript
// STORE_CLOSE_HOUR = 27 (デフォルト) → 正規化後 = 3
// createdAt: 2026年1月19日 7:34:34 UTC+9 → hour = 7
// 7 >= 3 → 当日の営業日 = 2026-01-19
```

**結果**: `businessDate = "2026-01-19"`（ドキュメントに保存）

---

#### クライアント側（Flutter）の営業日計算

**実装**: `lib/Accounting/accountingPage.dart` → `_getBusinessDate()`
- `GlobalConstants.STORE_CLOSE_HOUR` を使用（**定数9**）
- `normalizeStoreCloseHour(9) = 9 % 24 = 9`（当日の9:00まで）

**計算ロジック**:
```dart
// STORE_CLOSE_HOUR = 9 (定数) → 正規化後 = 9
// 現在時刻: 07:42:57 → hour = 7
// 7 < 9 → 前日の営業日 = 2026-01-18
```

**結果**: `検索営業日 = "2026-01-18"`

---

### 2. クエリ条件の不一致

**検索条件**:
```dart
.where('businessDate', isEqualTo: '2026-01-18')  // クライアント側で計算
```

**ドキュメントのbusinessDate**:
```json
{
  "businessDate": "2026-01-19"  // サーバー側で計算
}
```

**不一致**: `'2026-01-18' !== '2026-01-19'` → クエリ結果が0件

---

### 3. statusによる表示場所の違い

**ドキュメントのstatus**:
```json
{
  "status": "open"  // 未会計
}
```

**タブ別の表示条件**:
- **未会計タブ**（`_loadActiveBills()`）: `status in ['open', 'settling']` ✅ 条件に合致
- **会計完了タブ**（`_loadSettledBills()`）: `status == 'settled'` ❌ 条件に合致しない

**結論**: このドキュメントは「未会計タブ」に表示されるべきだが、営業日の不一致により表示されない

---

## 確認すべきログ

### 最優先（まず確認）

1. **Dart アプリのログ（未会計タブ）**:
   ```
   [_loadActiveBills] 検索営業日: YYYY-MM-DD
   [_loadActiveBills] 取得件数: N
   ```
   - 未会計タブでも同じ問題が発生しているか確認

2. **Firestore Console**:
   - `bills/aaf56292-6a84-4d9b-97f9-da0fdfab08ce` を開く
   - `businessDate` フィールドの値を確認（`"2026-01-19"` であることを確認）

---

### 次に確認（根本原因の特定）

3. **環境変数の確認**:
   - Google Cloud Console → Cloud Functions → `createBillWithActiveStay` などの関数
   - 「Runtime environment variables」で `STORE_CLOSE_HOUR` を確認
   - デフォルト値は `27`（翌日の3:00）

4. **クライアント側の定数**:
   - `lib/globalConstant.dart` の `STORE_CLOSE_HOUR = 9`（59行目）
   - この値がサーバー側と一致しているか確認

---

## 根本原因の詳細

### サーバー側 vs クライアント側の `STORE_CLOSE_HOUR` の不一致

| 側 | 実装 | デフォルト値 | 正規化後の値 | 意味 |
|---|---|---|---|---|
| **サーバー側** | `functions/src/config/ops.ts` → `getStoreCloseHour()` | `27` | `27 % 24 = 3` | 翌日の3:00まで |
| **クライアント側** | `lib/globalConstant.dart` → `STORE_CLOSE_HOUR` | `9` | `9 % 24 = 9` | 当日の9:00まで |

**問題**: サーバー側とクライアント側で `STORE_CLOSE_HOUR` の値が異なるため、営業日の計算結果が異なる

---

## 営業日計算の例

### ケース1: `createdAt = 2026年1月19日 7:34:34 UTC+9`

#### サーバー側（`STORE_CLOSE_HOUR = 27` → 正規化後 = 3）:
```
hour = 7
7 >= 3 → 当日の営業日
businessDate = "2026-01-19"
```

#### クライアント側（`STORE_CLOSE_HOUR = 9` → 正規化後 = 9）:
```
hour = 7
7 < 9 → 前日の営業日
検索営業日 = "2026-01-18"
```

**不一致**: `"2026-01-19" !== "2026-01-18"` → クエリ結果が0件

---

### ケース2: `createdAt = 2026年1月19日 10:00:00 UTC+9`

#### サーバー側（`STORE_CLOSE_HOUR = 27` → 正規化後 = 3）:
```
hour = 10
10 >= 3 → 当日の営業日
businessDate = "2026-01-19"
```

#### クライアント側（`STORE_CLOSE_HOUR = 9` → 正規化後 = 9）:
```
hour = 10
10 >= 9 → 当日の営業日
検索営業日 = "2026-01-19"
```

**一致**: `"2026-01-19" === "2026-01-19"` → クエリ結果に含まれる

---

## 解決方法の提案

### 方法1: クライアント側の `STORE_CLOSE_HOUR` をサーバー側に合わせる

**変更箇所**: `lib/globalConstant.dart`

```dart
// 変更前
static const int STORE_CLOSE_HOUR = 9; // 9:00まで

// 変更後（サーバー側のデフォルトに合わせる）
static const int STORE_CLOSE_HOUR = 27; // 翌日の3:00まで（正規化後 = 3）
```

**注意**: 他のクライアント側コードも `STORE_CLOSE_HOUR = 9` を前提にしている可能性があるため、全体を確認する必要がある

---

### 方法2: サーバー側の `STORE_CLOSE_HOUR` をクライアント側に合わせる

**変更箇所**: Google Cloud Console または環境変数

- `STORE_CLOSE_HOUR = 9` に設定
- または、`functions:config().ops.store_close_hour = 9` に設定

**注意**: 既存の `bills` ドキュメントの `businessDate` は変更されないため、新しいドキュメントのみ影響を受ける

---

### 方法3: 両方を統一（推奨）

**前提**: `STORE_CLOSE_HOUR` の値は一元管理すべき（将来的には Remote Config 経由の一元管理を検討）

**手順**:
1. どちらかに統一する（例: `STORE_CLOSE_HOUR = 9` または `27`）
2. サーバー側の環境変数または `functions:config` で設定
3. クライアント側の `globalConstant.dart` で同じ値に設定
4. 両方で同じ値になることを確認

**注意**: 既存の `bills` ドキュメントの `businessDate` は変更されないため、古い `businessDate` のドキュメントは表示されない可能性がある

---

## 確認すべきログ（再掲）

### まず確認（最優先）

1. **未会計タブのログ**:
   - `[_loadActiveBills] 検索営業日: 2026-01-18`（同じ問題が発生しているか確認）
   - `[_loadActiveBills] 取得件数: 0`（0件になっているか確認）

2. **Firestore Console**:
   - `bills/aaf56292-6a84-4d9b-97f9-da0fdfab08ce` の `businessDate` を確認
   - `"2026-01-19"` であることを確認

---

### 次に確認（根本原因の特定）

3. **環境変数の確認**:
   ```bash
   # Google Cloud Console または
   firebase functions:config:get
   ```
   - `STORE_CLOSE_HOUR` の値を確認

4. **クライアント側の定数**:
   - `lib/globalConstant.dart` の `STORE_CLOSE_HOUR` を確認
   - 現在は `9` に設定されている

---

## まとめ

### 問題点
1. **営業日計算の不一致**: サーバー側（`STORE_CLOSE_HOUR = 27`）とクライアント側（`STORE_CLOSE_HOUR = 9`）で営業日計算結果が異なる
2. **クエリ条件の不一致**: 検索営業日（`2026-01-18`）とドキュメントの `businessDate`（`2026-01-19`）が一致しない
3. **結果**: クエリ結果が0件になり、データが表示されない

### 解決方法
- **方法1**: クライアント側をサーバー側に合わせる（`STORE_CLOSE_HOUR = 27`）
- **方法2**: サーバー側をクライアント側に合わせる（`STORE_CLOSE_HOUR = 9`）
- **方法3（推奨）**: 両方を統一し、一元管理する

### 確認すべきログ
1. 未会計タブのログ（`[_loadActiveBills]`）
2. Firestore Console（`businessDate` フィールド）
3. 環境変数（`STORE_CLOSE_HOUR`）
4. クライアント側の定数（`globalConstant.dart`）

---

## 次のステップ

1. **まず確認**: 未会計タブでも同じ問題が発生しているか確認
2. **環境変数の確認**: `STORE_CLOSE_HOUR` の設定値を確認
3. **統一方針の決定**: サーバー側とクライアント側のどちらに統一するか決定
4. **実装**: `STORE_CLOSE_HOUR` を統一する変更を実装
5. **動作確認**: 両方で同じ営業日計算結果になることを確認
