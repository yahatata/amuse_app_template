# Step06: 支払い管理

## このステップで実装する内容の概要

- staff単位と一括の支払い済み登録を実装。
- 保留ステータス、支払日翌日以降の警告連携を実装。

## 懸念・確定できていない仕様等（判断が必要）

- 支払い済み/保留の優先順位（同時操作時の整合ルール）。
- 一括支払い済みの対象範囲（表示中runのみか、全staffか）。
- 再オープン（paid -> hold など）の許可有無。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `functions/src/domains/attendance/callables/registerPayrollPaymentStatus.ts`（新規）
  - `functions/src/domains/attendance/callables/registerPayrollPaymentStatusBulk.ts`（新規）
  - `lib/payroll/widgets/payroll_payment_controls.dart`（新規）
- 設定連動:
  - `bulkPaymentRegistrationEnabled` で一括ボタン制御
- 完了条件:
  - staff単位/一括の両登録が動く。
  - `deviceId` が記録される。
