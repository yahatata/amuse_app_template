# Step 07: 支払い管理 — changeSpec

**作成日**: 2026-03-22

---

## 1. カバーする仕様

| 仕様書 | セクション | 内容 |
|--------|----------|------|
| 04_CALLABLE_API_SPEC | §9 | registerPaymentStatus |
| 04_CALLABLE_API_SPEC | §11 | attendanceLogs（payment_registered, payment_hold） |
| 05_PROCESS_FLOW_SPEC | §8 | registerPaymentStatus の処理フロー |
| 05_PROCESS_FLOW_SPEC | §1 | monthlyPayroll.status の hold/paid 自動遷移 |
| 03_DATA_MODEL_SPEC | §2-1 | ルートドキュメント（paidAt、status 自動遷移ルール） |
| 03_DATA_MODEL_SPEC | §2-3 | staffResults（paymentStatus 遷移） |

---

## 2. As-Is

- `confirmPayrollRun`（Step 06）で全 staffResults の `paymentStatus` が `"unpaid"` に初期化済み
- `monthlyPayroll.status` が `"confirmed"` に遷移済み
- `PAYROLL_ERRORS` に `NOT_CONFIRMED`, `ALREADY_PAID`, `STAFF_ALREADY_PAID` が定義済み
- `PaymentStatus` 型（`'unpaid' | 'paid' | 'hold'`）が定義済み
- `MonthlyPayrollStatus` 型（`'draft' | 'confirmed' | 'hold' | 'paid'`）が定義済み
- `writeAttendanceLog` ヘルパーが利用可能
- `registerPaymentStatus` Callable は未実装

---

## 3. To-Be

### 3-1. registerPaymentStatus Callable

**ファイル**: `functions/src/domains/attendance/callables/registerPaymentStatus.ts`

**入力**:
```typescript
{
  paymentPeriodKey: string;
  entries: {
    staffId: string;
    status: "paid" | "hold";
  }[];
}
```

**出力**:
```typescript
{
  updatedCount: number;
  monthlyPayrollStatus: string;
}
```

**処理フロー**:
1. 認証 + admin 権限チェック
2. `paymentPeriodKey` バリデーション（正規表現）
3. `monthlyPayroll` 取得
   - `status == "paid"` → `already-paid` エラー
   - `status == "draft"` → `not-confirmed` エラー
   - `status == "confirmed" || status == "hold"` のみ許可
4. `latestRunId` で confirmed run を特定
5. 各 entry について:
   - `staffResults/{staffId}` を取得
   - 遷移バリデーション:
     - `unpaid → paid`: OK
     - `unpaid → hold`: OK
     - `hold → paid`: OK
     - `paid → *`: `staff-already-paid`（この entry をスキップ、他は処理継続）
     - `hold → hold`: skip（変更なし）
   - paymentStatus を更新（`paid` の場合: `paidAt`, `paidByDeviceId` も設定）
6. 全 staffResults の paymentStatus を集計:
   - `unpaidCount = paymentStatus == "unpaid"` の件数
   - `holdCount = paymentStatus == "hold"` の件数
7. `monthlyPayroll.status` を自動更新:
   - `unpaidCount == 0 && holdCount == 0` → `"paid"`（`paidAt = now`）
   - `unpaidCount == 0 && holdCount > 0` → `"hold"`
   - otherwise → `"confirmed"`（変更なし）
8. `attendanceLogs` 書き込み:
   - `paid` → `payment_registered`
   - `hold` → `payment_hold`

### 3-2. paymentStatusHelpers（テスタブルヘルパー）

**ファイル**: `functions/src/domains/attendance/helpers/paymentStatusHelpers.ts`

Firestore 非依存の純粋関数を抽出:

1. **`validatePaymentStatusTransition(current, target)`**: 遷移バリデーション
   - 返り値: `{ allowed: boolean; skip: boolean; errorCode?: string }`
   - `paid → *` → `{ allowed: false, skip: false, errorCode: 'staff-already-paid' }`
   - `hold → hold` → `{ allowed: false, skip: true }`
   - `unpaid → paid|hold` → `{ allowed: true, skip: false }`
   - `hold → paid` → `{ allowed: true, skip: false }`

2. **`determineMonthlyPayrollStatus(unpaidCount, holdCount)`**: 集計結果から status を決定
   - `unpaidCount == 0 && holdCount == 0` → `"paid"`
   - `unpaidCount == 0 && holdCount > 0` → `"hold"`
   - otherwise → `"confirmed"`

### 3-3. index.ts 更新

`registerPaymentStatus` のエクスポートを追加。

---

## 4. 実装順序

1. `paymentStatusHelpers.ts` 作成（純粋関数ヘルパー）
2. `paymentStatusHelpers.spec.ts` 作成（ユニットテスト）
3. `registerPaymentStatus.ts` 作成（Callable）
4. `index.ts` にエクスポート追加
5. 全テスト実行（リグレッション確認）

---

## 5. テスト計画

### 5-1. paymentStatusHelpers ユニットテスト

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| V-1 | unpaid → paid | allowed: true |
| V-2 | unpaid → hold | allowed: true |
| V-3 | hold → paid | allowed: true |
| V-4 | paid → paid | allowed: false, errorCode: staff-already-paid |
| V-5 | paid → hold | allowed: false, errorCode: staff-already-paid |
| V-6 | hold → hold | allowed: false, skip: true |
| D-1 | unpaidCount=0, holdCount=0 | "paid" |
| D-2 | unpaidCount=0, holdCount=3 | "hold" |
| D-3 | unpaidCount=2, holdCount=0 | "confirmed" |
| D-4 | unpaidCount=1, holdCount=1 | "confirmed" |

### 5-2. 統合テスト（Callable レベル — Emulator で手動確認）

| ID | テスト内容 | 期待結果 |
|----|-----------|---------|
| E-1 | confirmed 状態で全 staff を paid | monthlyPayroll.status → "paid", paidAt 設定 |
| E-2 | 一部 staff を hold | monthlyPayroll.status → "confirmed" (unpaid 残存) |
| E-3 | 全 staff paid/hold (hold あり) | monthlyPayroll.status → "hold" |
| E-4 | hold の staff を paid に変更 → 全員 paid | monthlyPayroll.status → "paid" |
| E-5 | draft 状態で呼び出し | not-confirmed エラー |
| E-6 | paid 状態で呼び出し | already-paid エラー |
| E-7 | 既に paid の staff を再送 | staff-already-paid（スキップ、他は処理） |
| E-8 | attendanceLogs が正しく書き込まれる | payment_registered / payment_hold ログ |

---

## 6. 実機確認事項

| 項目 | 確認手順 |
|------|---------|
| registerPaymentStatus の呼び出し | Emulator で Flutter から呼び出し、staff の paymentStatus が正しく更新されることを確認 |
| monthlyPayroll.status 自動遷移 | 全 staff を paid にして "paid" になること、一部 hold で "hold" になることを確認 |
| attendanceLogs の書き込み | Firestore コンソールで payment_registered / payment_hold ログが正しく書き込まれていることを確認 |
| 冪等性 | 同一 staff に同一 status を再送してもエラーにならない（paid は reject、hold は skip）ことを確認 |
