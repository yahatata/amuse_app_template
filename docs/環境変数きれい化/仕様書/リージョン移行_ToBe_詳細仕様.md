# リージョン移行 To-Be 詳細仕様書

作成日: 2026-03-31  
元仕様: `docs/環境変数きれい化/仕様書/tobe仕様書_全体像.md`  
関連仕様:

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
- `docs/環境変数きれい化/仕様書/Secret_Manager_ToBe_詳細仕様.md`
- `docs/環境変数きれい化/仕様書/scheduler_ToBe_詳細仕様.md`

## 1. スコープ

本仕様書は、Cloud Tasks / Cloud Functions / Cloud Run に残っている `us-central1` 系資産を、最終 To-Be の `asia-northeast1` に統一するための仕様を確定する。  
対象は以下とする。

- Cloud Tasks キュー
- Cloud Functions の `region` 指定
- Cloud Run 実行先 URL
- Secret Manager `task-endpoints` に格納する URL
- 移行時の手順と確認項目

以下は本仕様の対象外とする。

- scheduler 業務ロジックそのもの
- GitHub Actions 設計
- Hosting やクライアントアプリの配信

## 2. 基本方針

1. 最終 To-Be のリージョン正は `asia-northeast1` とする。
2. 現状の `us-central1` / `asia-northeast1` 混在は As-Is であり、最終状態ではない。
3. このアプリは未リリースのため、段階移行ではなく一括切替とする。
4. 一時二重稼働は行わない。
5. URL が変わる既存 HTTP downstream task は、Secret Manager `task-endpoints` を更新して追従する。
6. payroll 系は通知キューを移行対象、自動給与計算系は削除対象とする。

## 3. 現状整理

### 3.1 現在確認できているリージョン

| リソース | 現在 | To-Be |
|---|---|---|
| `tournament-queue` | `asia-northeast1` | そのまま |
| `business-date-assessment-queue` | `us-central1` | `asia-northeast1` |
| `finalizePayrollRun` など payroll キュー | `us-central1` | 通知系は移行 / 自動給与計算系は削除 |
| Cloud Functions の `region: 'us-central1'` 直書き 18 ファイル | `us-central1` | `asia-northeast1` |
| `closeAssessmentTask` / `openAssessmentTask` の実行先 | `us-central1` | `asia-northeast1` |
| `controlHookHttp` | `us-central1` | `asia-northeast1` |

### 3.2 影響のある仕様との接続

- `コード固定_ToBe_詳細仕様.md` では最終定数をすべて `asia-northeast1` としている
- `Secret_Manager_ToBe_詳細仕様.md` では `task-endpoints` に URL 3件を保持する
- `scheduler_ToBe_詳細仕様.md` では scheduler job は native Task Queue Function 前提で、scheduler job 用 URL は増えない

## 4. 最終 To-Be

### 4.1 リージョン統一方針

最終状態では以下をすべて `asia-northeast1` に統一する。

- Cloud Tasks
- Cloud Functions
- Cloud Run
- Secret Manager `task-endpoints` が指す URL の実体

### 4.2 `cloudTasksConfig.ts` との整合

本仕様書は、以下のコード固定定数を正とする。

```typescript
export const TOURNAMENT_TASKS_REGION = 'asia-northeast1';
export const OPENCLOSE_TASKS_REGION = 'asia-northeast1';
export const SCHEDULED_JOB_TASKS_REGION = 'asia-northeast1';
```

### 4.3 payroll 系の扱い

- `payrollNotificationScheduler` が利用する通知系 task は、最終的に `asia-northeast1` 側へ寄せる
- `monthlyPayrollTrigger` に紐づく自動給与計算系キューは、`monthlyPayrollTrigger` 削除方針に従って削除する

## 5. 移行対象

### 5.1 Cloud Tasks

- `business-date-assessment-queue`
- 通知用途の payroll キュー

### 5.2 Cloud Functions

`region: 'us-central1'` を直書きしている Functions 群

補足:

- 18 ファイル存在する事実を前提とする
- 実装時は changeSpec で対象ファイル一覧を確定する

### 5.3 Cloud Run / HTTP 実行先

- `closeAssessmentTask`
- `openAssessmentTask`
- `controlHookHttp`

### 5.4 Secret Manager 更新対象

`task-endpoints`

- `controlHookUrl`
- `closeAssessmentUrl`
- `openAssessmentUrl`

## 6. 切替方式

### 6.1 採用方式

本仕様書では、一括切替を採用する。

理由:

- このアプリは未リリースであり、本番運用中の利用者がいない
- 並走期間を作る意味が薄い
- 二重通知・二重実行の複雑性を持ち込む必要がない

### 6.2 非採用方式

以下は採用しない。

- 旧キューと新キューの長期並走
- `us-central1` と `asia-northeast1` の二重稼働
- リージョン切替のための利用者向け段階移行

## 7. 作業手順

### 7.1 コード側の変更

1. `region: 'us-central1'` を `region: 'asia-northeast1'` に変更する
2. `cloudTasksConfig.ts` と実リソースの整合を確認する
3. `us-central1` 前提の URL やコメントが残っていないことを確認する
4. payroll 自動給与計算系の不要コード / キュー参照を削除する

### 7.2 GCP 側の操作

以下はコード変更だけでは完結しないため、人手で実施が必要である。

1. `business-date-assessment-queue` を `asia-northeast1` に作成する
2. 必要な通知系 payroll キューを `asia-northeast1` に作成する
3. `closeAssessmentTask` / `openAssessmentTask` を `asia-northeast1` に再デプロイする
4. `controlHookHttp` を `asia-northeast1` に再デプロイする
5. 動作確認後、不要な `us-central1` キューを削除する

### 7.3 Secret Manager 更新

以下は Secret Manager 上で人手更新が必要である。

1. `task-endpoints.closeAssessmentUrl` を新 URL に更新する
2. `task-endpoints.openAssessmentUrl` を新 URL に更新する
3. `task-endpoints.controlHookUrl` を新 URL に更新する

### 7.4 一括切替の推奨順序

1. コード上のリージョン指定を `asia-northeast1` に統一する
2. 新リージョンに Functions / Cloud Run をデプロイする
3. Cloud Tasks キューを新リージョンに作成する
4. Secret Manager `task-endpoints` を新 URL に更新する
5. 動作確認する
6. `us-central1` の旧リソースを削除する

## 8. 開発時 / 導入時 / 運用時の扱い

### 8.1 開発時

目的:

- 仕様上の最終リージョンを `asia-northeast1` に揃える
- 実リソース作成前でもコードの正を `asia-northeast1` に固定する

開発者の操作:

1. コード内のリージョン定数と `region` 指定を `asia-northeast1` 前提で整理する
2. `us-central1` を前提とした新規実装を書かない
3. changeSpec で対象ファイルと GCP 操作を明記する

### 8.2 導入時

目的:

- 新規 Firebase / GCP プロジェクトに対し、最終リージョン正でリソースを用意する

開発者の操作:

1. `asia-northeast1` に必要キューを作成する
2. Functions / Cloud Run を `asia-northeast1` でデプロイする
3. `task-endpoints` を新 URL に合わせて登録する
4. `us-central1` 側の不要資産を作らない

### 8.3 運用時

目的:

- `asia-northeast1` に統一された状態を維持する

開発者の操作:

1. 新規キュー追加時は `asia-northeast1` を使う
2. 新規 Function / Cloud Run 追加時も `asia-northeast1` を使う
3. `task-endpoints` 更新時にリージョンを確認する
4. `us-central1` 前提の設定が混入していないかレビューする

## 9. あなたの操作が必須な項目

この仕様はコード変更だけでは完結しない。以下は必ず人手で実施が必要である。

### 9.1 GCP / Firebase Console で必要な操作

- `asia-northeast1` の Cloud Tasks キュー作成
- `asia-northeast1` の Functions / Cloud Run デプロイ確認
- 旧 `us-central1` リソース削除

### 9.2 Secret Manager で必要な操作

- `task-endpoints` の URL 更新

### 9.3 確認作業

- キュー投入から実行まで疎通確認
- リージョン不一致が残っていないことの確認

## 10. 実装上の注意

1. `tournament-queue` は既に `asia-northeast1` なので、新規作成不要
2. `business-date-assessment-queue` は現状 `us-central1` のため、To-Be 正へ寄せる
3. scheduler job 用 URL はこの移行の対象外
4. `task-endpoints` は既存 HTTP downstream task の URL だけを持つ
5. payroll 系は「通知は残す / 自動給与計算は削除」を混同しない

## 11. テスト・確認観点

1. `region: 'us-central1'` の直書きが残っていないこと
2. `OPENCLOSE_TASKS_REGION` が `asia-northeast1` と実リソースで一致すること
3. `task-endpoints` が新 URL を指していること
4. `controlHookHttp` / `openAssessmentTask` / `closeAssessmentTask` が新リージョンで動作すること
5. 通知系 payroll task が新リージョンで動作すること
6. 自動給与計算系の不要資産が削除対象として整理されていること

## 12. 本仕様書での最終結論

1. 最終 To-Be の正は `asia-northeast1` 統一である。
2. このアプリは未リリースのため、一括切替を採用する。
3. 一時二重稼働や長期並走は行わない。
4. `task-endpoints` の URL 更新を含めて、コードと GCP 実リソースを一緒に切り替える。
5. payroll 系は通知のみ移行し、自動給与計算系は削除する。

## 13. フェーズ対応メモ

- 本仕様書の主実装フェーズは `フェーズ F: 初回リリース前整備` である。
- `3. 現状整理`、`4. 最終 To-Be`、`5. 移行対象`、`6. 切替方式`、`7. 作業手順` はフェーズ F で反映する。
- `8. 開発時 / 導入時 / 運用時の扱い` と `9. あなたの操作が必須な項目` はフェーズ F の人手作業計画に直接対応する。
- `11. テスト・確認観点` はフェーズ F とフェーズ G の確認項目として扱う。
- 本仕様書の内容は `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md` で全体フェーズに割り当て済みであり、未対応章はない。
