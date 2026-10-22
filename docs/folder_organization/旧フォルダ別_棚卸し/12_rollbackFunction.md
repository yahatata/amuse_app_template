# 旧フォルダ別棚卸し：rollbackFunction

## 1. 対象フォルダの概要

**functions/src/rollbackFunction** は、トーナメント実行中の操作（参加・席・addon・bust 等）を**ロールバックする処理本体**を集約したフォルダ。入口はなく、**callables/rollbackAction**（onCall）がここから各 undo* を import し、action 種別に応じて呼び出す。index.ts が 7 本の undo* を re-export している。04 の「tournament_activeTournament＝トーナメント実行中の操作」に該当し、ロールバックはその一部として **domains/tournament_activeTournament/services** に配置する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約。7 本の undo* を re-export | ⑦domains/tournament_activeTournament/services（移行先で再構成） | ⑧No | ⑨rollbackFunction の export 集約 |
| ①undoAddon.ts | ②service | ③No | ④不明 | ⑤scheduledTournaments/{id}/views/main（書）, todaysBills（書）, actionLog（書・lib/actionLogger） | ⑥callables/rollbackAction | ⑦domains/tournament_activeTournament/services | ⑧No | ⑨addon 操作の巻き戻し。main の addons 減算、todaysBills の addons 減算、markActionAsRolledBack |
| ①undoBulkAddon.ts | ②service | ③No | ④不明 | ⑤scheduledTournaments/{id}/views/main（書）, todaysBills（書）, actionLog（書） | ⑥callables/rollbackAction | ⑦domains/tournament_activeTournament/services | ⑧No | ⑨bulk_addon 操作の巻き戻し |
| ①undoBustAndExit.ts | ②service | ③No | ④不明 | ⑤scheduledTournaments/{id}/views/main（書）, todaysBills（書）, tablesSeat（書）, actionLog（書） | ⑥callables/rollbackAction | ⑦domains/tournament_activeTournament/services | ⑧No | ⑨bust_and_exit 操作の巻き戻し |
| ①undoBustAndReentry.ts | ②service | ③No | ④不明 | ⑤scheduledTournaments/{id}/views/main（書）, todaysBills（書）, tablesSeat（書）, actionLog（書） | ⑥callables/rollbackAction | ⑦domains/tournament_activeTournament/services | ⑧No | ⑨bust_and_reentry 操作の巻き戻し |
| ①undoRegisterParticipants.ts | ②service | ③No | ④不明 | ⑤scheduledTournaments/{id}/views/main（書）, views/usersList（書）, todaysBills（削除）, actionLog（書） | ⑥callables/rollbackAction | ⑦domains/tournament_activeTournament/services | ⑧No | ⑨register_participants 操作の巻き戻し |
| ①undoAssignSeatToPlayer.ts | ②service | ③No | ④不明 | ⑤scheduledTournaments/{id}/views/main（書）, tablesSeat（書）, actionLog（書） | ⑥callables/rollbackAction | ⑦domains/tournament_activeTournament/services | ⑧No | ⑨assign_seat_to_player 操作の巻き戻し |
| ①undoReseatAllPlayers.ts | ②service | ③No | ④不明 | ⑤scheduledTournaments/{id}/tablesSeat（書）, views/main（書）, actionLog（書） | ⑥callables/rollbackAction | ⑦domains/tournament_activeTournament/services | ⑧No | ⑨reseat_all_players 操作の巻き戻し。previousSeatingData で座席配置を復元 |

## 3. 追加メモ

- **入口**：rollbackFunction 配下に onCall / onRequest はない。**入口は callables/rollbackAction** が担い、ここから各 undo* が呼ばれる。種別は業務処理本体のため **service**。
- **export**：rollbackFunction/index.ts が 7 本の undo* を re-export。ルート index は rollbackFunction を直接 export していない。callables が rollbackFunction/index を import し、callables/rollbackAction が export されているため、④は「ルート index から辿れるか」では No（rollbackFunction 自体は export されていない）。callables 経由で利用されているので **不明** として記載。
- **移行先**：04 の tournament_activeTournament＝「トーナメント実行中の操作（参加・席・addon・bust・終了・ランキング等）」に含まれる。ロールバックは「実行した操作の取り消し」なので **domains/tournament_activeTournament/services**。callables/rollbackAction は入口のため **domains/tournament_activeTournament/callables** に移す（callables の棚卸しで扱う）。rollbackFunction 配下はすべて **services**。
- **共通参照**：各 undo* は **lib/actionLogger** の markActionAsRolledBack を呼び、scheduledTournaments/{id}/actionLog をロールバック済みに更新している。
- **未使用候補**：該当なし。7 本とも rollbackAction の switch から呼ばれている。

## 4. 次アクション

- **設計**：tournament_activeTournament ドメイン設計で、rollbackFunction 配下の undo* を **domains/tournament_activeTournament/services** に移す方針を記載する。callables/rollbackAction は **callables** に移す（05_callables または入口一覧と整合を取る）。
- **changeSpec**：rollbackFunction 移管時に、callables/rollbackAction の **import パス** を `domains/tournament_activeTournament/services`（または移行先の index）に更新する。各 undo* が参照する **lib/actionLogger** の import パスも、actionLogger の移行先に合わせて更新する。
- **05_入口一覧**：rollbackAction は callables の入口として 05 に載っている場合、移行先を tournament_activeTournament/callables に更新する。rollbackFunction 自体は入口ではないため、05 の「配置先」に services を追記する程度でよい。
