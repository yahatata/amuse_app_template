# phaseG.1 追加調査: custom env ドリフト整理結果（probe* 除外）

作成日: 2026-04-03

## 1. 目的

- `probe*` を除く本線関数で、過去設定の custom env が残っている状態を解消する。
- 「いまのコードで使っていない env」は本線関数から取り除き、設定のドリフトを止める。

## 2. どの状態から、どの状態にしたか

- 変更前:
  - `asia-northeast1` の本線関数 21 件に、過去由来の custom env が残存。
  - 代表例: `CONTROL_HOOK_URL`, `WEEKLYPLANNER_TASKS_LOCATION` など。
- 変更後:
  - 上記 21 関数は、platform 管理キーのみ（`FIREBASE_CONFIG` など）に統一。
  - `probe*` 5 関数のみ custom env を保持（ユーザー指示どおり保留）。

## 3. 実施内容

- `functions/.gcloudignore.envcleanup` を利用し、`lib` を含む正しいソースで再デプロイ。
- 対象 21 関数に対し、`--remove-env-vars` で legacy key 群を一括除去。
- 各関数デプロイ後に `gcloud functions describe` で `legacy_left=0` を検証。

## 4. 対象関数（21）

- approveAttendanceCorrectionRequest
- checkExistingCorrectionRequest
- closeAssessmentTask
- closeStore
- closeStoreTerminal
- continueBusinessTerminal
- controlHookHttp
- createAttendanceCorrectionRequest
- createInitialStateDocCallable
- getAllStaffAttendance
- getAttendanceCorrectionRequests
- getStaffAttendance
- initializeStoreConfigCallable
- openAssessmentTask
- openStore
- openStoreTerminal
- rejectAttendanceCorrectionRequest
- scheduled-job-generate-recurring-tournaments-by-scheduler
- scheduled-job-schedule-generate-next-year-business-hours
- scheduled-job-scheduled-cleanup
- scheduled-job-weekly-planner

## 5. 検証結果

- 実行結果ファイル: `/tmp/legacy_env_cleanup_result.tsv`
- 集計:
  - `OK: 21`
  - `NG: 0`
  - `legacy_left != 0: 0`

## 6. 最終確認（全関数の env 再走査）

- 対象: Cloud Functions v2 全 174 関数
- 走査結果:
  - custom env 行数: 115
  - `probe*` を除く custom env 行数: 0
- 結論:
  - custom env は `probe*` 5 関数にのみ残存。

## 7. custom env を残した関数（保留対象）

- probeAuthErrorShape
- probeCloudTasksErrorShape
- probeFirestoreErrorShape
- probeFirestoreErrorShapeInvalidArgument
- probeStorageErrorShape

