# Step08: スケジューラー補助化（通知・確認のみ）

## このステップで実装する内容の概要

- 既存スケジューラーから計算実行処理を外し、通知・確認専用に変更。
- 「計算期間入り」「未実行リマインド」「未支払い警告」のトリガーを実装。

## 懸念・確定できていない仕様等（判断が必要）

- 通知頻度（通常/低頻度）の具体値。
- 同一通知の重複抑止ルール。
- 失敗時リトライ方針と監視方法。

## このステップで実装する内容全体の詳細

- 追加/変更候補:
  - `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts`（役割変更）
  - `functions/src/shared/notifications/helpers/createNotification.ts`（利用）
  - `functions/__tests__/.../monthlyPayrollTrigger.spec.ts`（期待値更新）
- 注意:
  - スケジューラーは補助のみ。給与計算ドキュメント作成は禁止。
- 完了条件:
  - スケジューラー経由で計算が走らない。
  - 通知・確認が所定条件で発火する。
