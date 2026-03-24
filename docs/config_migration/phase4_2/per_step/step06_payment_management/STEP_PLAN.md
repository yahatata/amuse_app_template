# Step06: 支払い管理

## このステップで実装する内容の概要

- staff単位と一括の支払い済み登録を実装。
- 保留ステータス、支払日翌日以降の警告連携を実装。

## 懸念・確定できていない仕様等（判断が必要）

- 支払い済み/保留の優先順位（同時操作時の整合ルール）。
- 一括支払い済みの対象範囲（表示中runのみか、全staffか）。
- 再オープン（paid -> hold など）の許可有無。
- **[GAP-5]** 支払日翌日以降・未登録時の UI 警告の表示場所: 選択肢A: adminHome にバナー表示（Step07 の通知基盤と統合）/ 選択肢B: 給与計算画面内に警告 / 選択肢C: 両方。仕様確定時に決定する。
- **[GAP-5]** 警告表示のトリガー方式: UI 側が毎回日付比較してバナー表示するか（クライアント判定）、Step08 スケジューラーが作成した通知ドキュメントを読んで表示するか（通知基盤に依存）。それぞれの選択によって Step07/08 との実装順序・依存関係が変わる。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `functions/src/domains/attendance/callables/registerPayrollPaymentStatus.ts`（新規）
  - `functions/src/domains/attendance/callables/registerPayrollPaymentStatusBulk.ts`（新規）
  - `lib/payroll/widgets/payroll_payment_controls.dart`（新規）
- 設定連動:
  - `bulkPaymentRegistrationEnabled` で一括ボタン制御
- **[GAP-5]** 支払日翌日以降の警告表示:
  - UI側（クライアント判定）: `payrollConfig.paymentDate` と現在日付を比較し、支払い済み未登録の場合に警告バナーを表示する。
  - または Step07/08 の通知ドキュメントに依存する場合は、通知基盤が完成してから連携する（実装順序に影響）。
  - 表示場所の選択は仕様確定時に決定する。
- 完了条件:
  - staff単位/一括の両登録が動く。
  - `deviceId` が記録される。
  - **[GAP-5]** 支払日翌日以降・未登録時の警告が所定の場所に表示される（表示場所・トリガー方式は仕様確定時に決定）。
