# タスク実行復旧_20260407 README

## 1. このフォルダの目的

このフォルダは、2026-04-07 時点で確認された Cloud Tasks / Cloud Scheduler / Functions の実行不整合を、  
「リリース前提で安全に復旧するための実施計画と確認計画」をまとめるための作業フォルダです。

本対応の前提:

- 既存の壊れたタスクを時間をかけて救済しない（必要なら削除）
- 今後新規に作成されるタスクが正しい形式で投入されることを重視
- タスクが実際に実行され、業務処理まで到達することを重視

## 2. 現時点の整理（調査結果ベース）

### 2.1 正常系

- `schedulerSupervisor` 自体は実行ログ上で完走が確認できる
- 一部キュー（例: tournament 系）は `Content-Type` と body を持つ正常形式のタスク投入が確認できる

### 2.2 障害系（原因が確定しているもの）

- `openAssessmentTask` / `closeAssessmentTask` が `HTTP 400` を繰り返す  
  - `business-date-assessment-queue` に body 空タスクが残っている
  - 関数側は `payload.action` 必須のため 400 になる
- `scheduled-job-weekly-planner` が downstream タスク作成で `NOT_FOUND`  
  - `openclose-tasks-invoker@...` が存在しない環境がある
- 一部 scheduler 系で実行ログ書き込み失敗  
  - Firestore へ `reason: undefined` を書こうとして例外化
- tournament enqueue 系の一部で `default-store` 前提バリデーションに抵触

### 2.3 未確定（追加実行で確認が必要）

- `processStaffPayroll` / `finalizePayrollRun` は、直近で十分な成功サンプルが不足
- 実行機会が発生する scheduler 経路は、再実行で再確認が必要

## 3. 今回のドキュメント構成

- `changeSpec.md`  
  - 修正対象、実施順序、担当分担（エージェント/ユーザー）を整理
- `要判断事項.md`  
  - エージェント側で勝手に決めず、ユーザー判断が必要な論点を列挙
- `検証計画.md`  
  - 修正後に「投入できるか/自動投入されるか/実行されるか」を網羅確認する計画
- `実施手順_外部操作.md`  
  - CLI 中心の外部操作手順
- `実行ログ_20260407.md`  
  - 実施した操作と確認結果の記録

## 4. 補足

このフォルダは「修正の実装前レビュー用」として作成しているため、  
判断が必要な論点については結論を固定せず、選択肢と影響を明記する方針とする。
