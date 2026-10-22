# 旧フォルダ別棚卸し：http

## 1. 対象フォルダの概要

**functions/src/http** は、**controlHook** の 1 ファイルのみ。Cloud Tasks からの HTTP リクエストを受け付け、スケジュール済みトーナメントの自動開始（start）とレジ締切（regist）を処理する **https 入口**。index.ts で `onRequest(controlHook)` により `controlHookHttp` として export されている。呼び出し元は Cloud Tasks（lib/tasks.ts の enqueueStartTask / enqueueRegistTask がタスク投入）。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①controlHook.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（読・書）, scheduledTournaments/{id}/views/runtime（読・書） | ⑥index.ts が onRequest でラップして controlHookHttp として export。実体の呼び出しは Cloud Tasks が CONTROLL_HOOK_URL に POST。lib/tasks.ts が enqueueStartTask / enqueueRegistTask でタスク投入 | ⑦**domains/tournament_activeTournament/callables** | ⑧No | ⑨トーナメントの自動開始・レジ締切。onRequest のため https 入口として callable。05 入口一覧では「tournament_activeTournament または shared（要判断）」とあり、責務は実行中ライフサイクル制御のため tournament_activeTournament を推奨 |

## 3. 追加メモ

- **入口**：`onRequest` でラップされているため **https 入口**。02_棚卸しルールの「onCall/onRequest/… を含むなら入口 Yes」に該当。種別は「callable（onCall / https 入口）」の https 入口として **callable**。
- **export**：index.ts で `import { controlHook } from "./http/controlHook"` され、`export const controlHookHttp = onRequest(controlHook)` で export。④Yes。
- **移行先の理由**：04 のドメイン一覧では tournament_createTournament（作成・スケジューリング）と tournament_activeTournament（実行中の操作）に分かれる。controlHook は「スケジュール時刻に自動開始」「レジ締切時刻にレジ締」であり、scheduledTournaments の status を scheduled→running→registered と更新する。スケジューリングの「時間制御」だが、処理内容は**実行中のライフサイクル遷移**であるため **tournament_activeTournament** の callables に配置する。tournament_createTournament に含める判断も可能（スケジューリングの一部）なので、設計で確定する場合は 08_意思決定ログに記録する。
- **未使用候補**：該当なし。index から export され、Cloud Tasks 経由で lib/tasks.ts から利用されている。

## 4. 次アクション

- **設計**：tournament_activeTournament ドメイン設計で **controlHook** を callables に含める方針を記載する。tournament_createTournament に含める場合は 08_意思決定ログに記録する。
- **changeSpec**：http 移管時に index.ts の **import パス** を `domains/tournament_activeTournament/callables`（または確定したドメイン）に更新する。export 名（controlHookHttp）は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行先確定後、controlHookHttp の配置を「tournament_activeTournament/callables」に更新する。
