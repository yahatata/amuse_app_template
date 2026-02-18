# 旧フォルダ別棚卸し：tasks

## 1. 対象フォルダの概要

**functions/src/tasks** は、開閉店**認定**処理の **onRequest（HTTP）入口 2 本** のみ。closeAssessmentTask（閉店認定）と openAssessmentTask（開店認定）。Cloud Tasks から HTTP で呼ばれ、scheduler/weeklyPlanner が CLOSE_ASSESSMENT_URL / OPEN_ASSESSMENT_URL にタスクを投入する。storeMeta/currentBusinessDay の openAssessment・closeAssessment を更新し、認定結果を記録する。ルート index が各ファイルを直接 export。04 の「storeMeta＝店舗・開閉店・状態・店舗評価（**開始/終了タスク含む**）」に該当する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①closeAssessmentTask.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta/currentBusinessDay（読・書）, storeMeta/currentBusinessDay/assessmentLogs（書）, activeStays（読・ブロッカー検出） | ⑥Cloud Tasks が CLOSE_ASSESSMENT_URL に POST。scheduler/weeklyPlanner がタスク投入 | ⑦**domains/storeMeta/callables** | ⑧No | ⑨onRequest。閉店時間超過の認定。needs_manual_close / already_closed / skipped 等を state doc に記録 |
| ①openAssessmentTask.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta/currentBusinessDay（読・書）, storeMeta/currentBusinessDay/assessmentLogs（書） | ⑥Cloud Tasks が OPEN_ASSESSMENT_URL に POST。scheduler/weeklyPlanner がタスク投入 | ⑦**domains/storeMeta/callables** | ⑧No | ⑨onRequest。開店条件の認定。ready_to_open / already_running / skipped 等を state doc に記録 |

## 3. 追加メモ

- **入口**：2 本とも **onRequest** を含むため **https 入口**。③入口 Yes。種別は「callable（onCall / https 入口）」の https 入口として **callable**。
- **export**：ルート index が `export * from "./tasks/closeAssessmentTask"` と `export * from "./tasks/openAssessmentTask"` で直接 export しているため、④export = Yes。
- **移行先**：04 の storeMeta＝「店舗・開閉店・状態・店舗評価（開始/終了タスク含む）」に明示されている。開店・閉店**認定**タスクは「開始/終了タスク」の一部であり、storeMeta/currentBusinessDay を更新する責務なので **domains/storeMeta/callables** に配置する。scheduler/weeklyPlanner が同じ storeMeta の scheduler としてタスクを投入し、tasks がその HTTP ハンドラとなる。
- **未使用候補**：該当なし。ルート index から export され、Cloud Tasks 経由で scheduler から呼ばれる。

## 4. 次アクション

- **設計**：storeMeta ドメイン設計で、closeAssessmentTask と openAssessmentTask を **domains/storeMeta/callables** に移す方針を記載する。scheduler/weeklyPlanner が参照する URL 環境変数（CLOSE_ASSESSMENT_URL, OPEN_ASSESSMENT_URL）の指し先が移行後も正しくデプロイされるようにする。
- **changeSpec**：tasks 移管時に、ルート index の **import パス** を `domains/storeMeta/callables`（または storeMeta の index）に更新する。export 名（closeAssessmentTask, openAssessmentTask）は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行先確定後、closeAssessmentTask と openAssessmentTask の配置を「storeMeta/callables」に更新する。
