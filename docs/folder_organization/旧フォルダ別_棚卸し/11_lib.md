# 旧フォルダ別棚卸し：lib

## 1. 対象フォルダの概要

**functions/src/lib** は、複数ドメインから参照される共通ライブラリ群。入口（onCall/onRequest 等）はなく、すべて他モジュールから import されるのみ。ルート index は lib を export していない。devicePermissions（デバイス権限・端末判定）、env（環境変数取得）、tasks（Cloud Tasks 投入）、actionLogger（トーナメント操作ログ）、serverStage（ブラインドステージ計算）、runtimePath（Firestore パス文字列）の 6 ファイル。移行先は shared 候補とドメイン別に分かれる。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①devicePermissions.ts | ②repos/service | ③No | ④No | ⑤devices（読） | ⑥storeManagement, close_process, callables, itemOrder, userLogin, sideGame, attendance | ⑦**shared/devices**（08 で確定。00_shared に移動一覧記載） | ⑧No | ⑨getCallerDeviceByUid, hasRequiredOption, hasStoreManagementPermission, isActive |
| ①env.ts | ②service | ③No | ④No | ⑤なし（process.env のみ） | ⑥storeManagement/continueBusinessTerminal, scheduler/weeklyPlanner, lib/tasks | ⑦**shared/firebase**（08 で確定。他にこのパスへ移すファイルが特になければ env のみ。00_shared 参照） | ⑧No | ⑨getEnv。Firestore に触らない |
| ①tasks.ts | ②service | ③No | ④No | ⑤なし（Cloud Tasks API 呼出。Firestore は直接触らない） | ⑥callables/createScheduledTournament, createTournamentRecurrence, generateRecurringTournaments。lib/env を import | ⑦**domains/tournament_createTournament/services** | ⑧No | ⑨enqueueStartTask, enqueueRegistTask。トーナメントの開始・レジ締タスク投入。CONTROL_HOOK_URL 等は getEnv で取得 |
| ①actionLogger.ts | ②repos/service | ③No | ④No | ⑤scheduledTournaments/{id}/actionLog（書・読） | ⑥rollbackFunction 配下 7 本（markActionAsRolledBack のみ使用）。logAction はリポジトリ内に参照なし | ⑦**domains/tournament_activeTournament/services**（トーナメント操作ログ・ロールバックと一体） | ⑧No | ⑨logAction（未使用）, markActionAsRolledBack（使用中）。actionLog サブコレクションへ書込・更新 |
| ①serverStage.ts | ②service | ③No | ④No | ⑤なし（計算のみ） | ⑥リポジトリ内に参照なし | ⑦**unused_function_lib**（08 で確定。デプロイ不要。04_新フォルダ構造 の特殊フォルダ参照） | ⑧**Yes** | ⑨未使用候補。unused_function_lib に格納 |
| ①runtimePath.ts | ②service | ③No | ④No | ⑤なし（パス文字列生成のみ） | ⑥リポジトリ内に参照なし | ⑦**unused_function_lib**（同上） | ⑧**Yes** | ⑨未使用候補。unused_function_lib に格納 |

## 3. 追加メモ

- **入口**：lib 配下に onCall / onRequest / onSchedule はない。すべて **service / repos** 相当の内部利用モジュール。
- **export**：ルート index は lib を export していない。参照はすべて **直接 import（../lib/xxx）** のため、④export = No（index から辿れない）。
- **devicePermissions**：**shared/devices** に移す（08 確定）。00_shared に移動一覧記載。
- **env**：**shared/firebase** に移す（08 確定）。他にこのパスへ移すファイルが特になければ env のみ。
- **tasks**：トーナメントの「開始タスク・レジ締タスク」投入のみを担当。呼び出し元がすべて tournament 系 callables のため **tournament_createTournament/services** に配置（スケジューリングの一部）。
- **actionLogger**：scheduledTournaments の actionLog に書く。rollbackFunction が markActionAsRolledBack を利用。トーナメント実行中の操作ログなので **tournament_activeTournament/services**。
- **serverStage / runtimePath**：**unused_function_lib** に格納。デプロイ不要（08 確定）。04_新フォルダ構造 の「特殊フォルダ unused_function_lib」参照。
- **logAction**：actionLogger で export されているが、リポジトリ内に呼び出し元はない。markActionAsRolledBack のみ rollbackFunction から参照されている。

## 4. 次アクション

- **設計**：devicePermissions は **shared/devices**、env は **shared/firebase** に移す（08 確定）。tasks は **tournament_createTournament/services**、actionLogger は **tournament_activeTournament/services** に移す。serverStage・runtimePath は **unused_function_lib** に格納（デプロイ不要、08 確定）。
- **changeSpec**：lib 移管時に、devicePermissions 参照元（storeManagement, close_process, callables, itemOrder, userLogin, sideGame, attendance）の **import パス** を更新する。env 参照元（storeManagement, scheduler, lib/tasks）、tasks 参照元（callables 3 本）、actionLogger 参照元（rollbackFunction 7 本）の import パスを更新する。
- **05_入口一覧**：lib に入口はないため、05 の更新対象なし。
- **未使用候補**：serverStage.ts, runtimePath.ts は参照ゼロ。安定化フェーズで削除判断するまで削除しない。
