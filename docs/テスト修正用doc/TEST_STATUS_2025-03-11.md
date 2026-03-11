# テスト実行サマリ（2025年3月11日時点）

amuse_app_template のテスト状況サマリ。**残っている失敗**にフォーカスした記載とする。

---

## 1. 全体結果

| 項目 | 数値 |
|------|------|
| 実行コマンド | `cd functions && npm test -- --runInBand` |
| 所要時間 | 約34秒 |
| テストスイート | 64 成功 / **7 失敗** / 1 スキップ（計72） |
| テストケース | 608 成功 / **16 失敗** / 3 スキップ（計627） |

---

## 2. 残っている失敗一覧

### 2.1 eventBusinessDate 関連（実装修正が必要）

| ファイル | 失敗数 | 概要 |
|----------|--------|------|
| `__tests__/callables/updateAccounting.spec.ts` | **3** | postEventAdjustment / postEventCancel / postEventReopen が失敗 |
| `__tests__/callables/refundProcessing.spec.ts` | **1** | postEventRefund ヘルパAPI呼び出しが失敗 |

**エラー内容**

```
Value for argument "data" is not a valid Firestore document. 
Cannot use "undefined" as a Firestore value (found in field "eventBusinessDate").
```

**原因**

- callable（`updateAccounting`, `processRefund`）が postEvent* を呼ぶ際に `eventBusinessDate` を渡していない
- postEvent* 内で `calcBusinessDate()` が NONE を返すか、`eventBusinessDate` が undefined のまま Firestore に書き込まれる

**対応方針**

- **実装修正が必要**（テストファイルのみでは対応不可）
- `updateAccounting` / `refundProcessing` で postEvent* 呼び出し時に `eventBusinessDate` を渡す
  - 例: bill の `businessDate` を取得して渡す
  - または optional パラメータとして受け取り転送する

---

### 2.2 cancel_restore_startAt.spec.ts

| ファイル | 失敗数 | 概要 |
|----------|--------|------|
| `__tests__/tournament_createTournament/cancel_restore_startAt.spec.ts` | **2** | C-1（startAt 編集）、C-3（旧 planHash と不一致で no-op） |

**エラー内容**

```
Update() requires ... Cannot use "undefined" as a Firestore value (found in field "businessDate").
```

**発生箇所**: `updateScheduledTournamentStartAt.ts` の `tournamentRef.update({ ... businessDate })`  
**原因**: `businessDate` が undefined のまま Firestore に渡されている

**対応方針**

- `businessHoursMonthlyMap` や store 設定のテストセットアップを追加
- または `updateScheduledTournamentStartAt` の実装で、`businessDate` が undefined の場合のハンドリングを追加

---

### 2.3 getUserOrderHistory.spec.ts

| ファイル | 失敗数 | 概要 |
|----------|--------|------|
| `__tests__/itemOrder/getUserOrderHistory.spec.ts` | **7** | 複数ケースで `orders.length` が 0 |

**エラー内容**

```
expect(result.data.orders.length).toBe(1)
Expected: 1
Received: 0
```

**失敗ケース**

- 正常な注文履歴取得（当日の営業日、確定済み伝票のみ）
- 複数の確定済み伝票がある場合のソート確認
- amounts.grandTotalRounded の返却確認
- /items サブコレクションの itemCount 反映
- businessDate フィルタ（当日の営業日のみ）
- status フィルタ（settled 等 / open 等の除外）

**原因**

- `result.data.orders` が空配列のまま
- クエリ条件（storeId / tenantId / businessDate 等）とテストデータの不一致の可能性

**対応方針**

- getUserOrderHistory のクエリ条件を確認
- テストデータのセットアップ（storeId, tenantId, businessDate 等）を見直す

---

### 2.4 close_process（applyCloseSnapshot 戻り値）

| ファイル | 失敗数 | 概要 |
|----------|--------|------|
| `__tests__/close_process/step3.spec.ts` | **1** | `updatedBillIds` の期待不一致 |
| `__tests__/close_process/phase6_5_store_management_permission.spec.ts` | **1** | 同上 |

**エラー内容**

```
expect(result.updatedBillIds).toContain('bill-1')
Expected value: "bill-1"
Received array: []
```

**原因**

- `applyCloseSnapshot` の戻り値で `updatedBillIds` が空配列 `[]` になっている
- テストは `'bill-1'` が含まれることを期待

**対応方針**

- `applyCloseSnapshot` の戻り値仕様を確認
- 実装が正しければテストの期待値を修正
- 仕様違反であれば実装修正を検討

---

### 2.5 aggregator.spec.ts（analytics スキーマ）

| ファイル | 失敗数 | 概要 |
|----------|--------|------|
| `__tests__/analytics/aggregator.spec.ts` | **1** | 月次 doc の sales 構造が期待と異なる |

**エラー内容**

```
TypeError: Cannot read properties of undefined (reading 'grossIncl')
expect(monthlyDoc.data()?.sales.grossIncl).toBe(5000)
```

**原因**

- `monthlyDoc.data()?.sales` が undefined
- analytics の月次 doc スキーマが変更され、`sales.grossIncl` 等が存在しない

**対応方針**

- 実装の analytics スキーマ仕様を確認
- 実装に合わせてテストの期待値を修正
- スキーマ変更が正しい場合、期待する構造を更新

---

## 3. 残存失敗サマリ表

| カテゴリ | ファイル | 失敗数 | 主な対応 |
|----------|----------|--------|----------|
| eventBusinessDate | updateAccounting.spec, refundProcessing.spec | 4 | **実装修正**（callable で eventBusinessDate を渡す） |
| businessDate | cancel_restore_startAt.spec | 2 | セットアップ追加 or **実装修正** |
| クエリ不一致 | getUserOrderHistory.spec | 7 | データセットアップ・クエリ条件の見直し |
| 戻り値仕様 | step3.spec, phase6_5_store_management_permission.spec | 2 | 仕様確認・期待値見直し |
| スキーマ不一致 | aggregator.spec | 1 | 実装スキーマとテスト期待値の整合 |
| **合計** | **7 スイート** | **16** | - |

---

## 4. 実施済み修正（参考）

### 4.1 postEvent*  direct テスト（テストファイル修正のみ）

- `postEventAdjustment.spec.ts` / `postEventCancel.spec.ts` / `postEventReopen.spec.ts` / `postEventRefund.spec.ts`
- 全呼び出しに `eventBusinessDate: '2025-11-15'` を追加 → 全ケース通過

### 4.2 placeOrder 系（前回セッション）

- `placeOrder.spec.ts`, `placeOrder.boundary-dates.spec.ts`, `placeOrder.businessDate.spec.ts`
- projectId、createAdminDevice、auth、billId、status ガードの修正

---

## 5. 補足

- **テストファイルのみ**では、上記残存失敗の多くは解決しない
- eventBusinessDate、businessDate、戻り値仕様、スキーマ等は実装変更の影響が大きい
- 失敗の解消には、実装修正とテスト修正を併用する形での対応が必要
