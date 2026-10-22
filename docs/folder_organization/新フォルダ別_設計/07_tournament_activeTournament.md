# 新フォルダ別設計：tournament_activeTournament

## 5.1 ドメイン定義（短く）

トーナメント実行中の操作を担当するドメイン。参加・席・addon・bust・終了・ランキング・賞金・アクションログ・ロールバック等を含む。

**主に扱うデータ/コレクション**
- scheduledTournaments（およびサブコレクション views, tablesSeat, actionLog 等）, bills, todaysBills, actionLogs
- helpers/billsApi（recordTournamentAction, updatePlace 等）。rollbackFunction 配下の undo*。lib/actionLogger

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | 本日・今後のトーナメント一覧、参加登録・テーブル追加削除・席割り・一括登録・仮テーブル、bust・addon・一時停止・再開・賞金・ランキング・終了・ロールバック・アクションログ取得の onCall 入口 |
| services/ | rollbackFunction 配下の undo*、actionLogger（markActionAsRolledBack）。serverStage, runtimePath は **unused_function_lib** に格納（デプロイ不要、08 確定） |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| callables/getTodayTournaments.ts | domains/tournament_activeTournament/callables/getTodayTournaments.ts | callable |  |
| callables/getUpcomingTournaments.ts | domains/tournament_activeTournament/callables/getUpcomingTournaments.ts | callable |  |
| callables/registerForTournament.ts | domains/tournament_activeTournament/callables/registerForTournament.ts | callable |  |
| callables/addTableToTournament.ts | domains/tournament_activeTournament/callables/addTableToTournament.ts | callable |  |
| callables/removeTableFromTournament.ts | domains/tournament_activeTournament/callables/removeTableFromTournament.ts | callable |  |
| callables/assignSeatToPlayer.ts | domains/tournament_activeTournament/callables/assignSeatToPlayer.ts | callable |  |
| callables/reseatAllPlayers.ts | domains/tournament_activeTournament/callables/reseatAllPlayers.ts | callable |  |
| callables/getAvailableTables.ts | domains/tournament_activeTournament/callables/getAvailableTables.ts | callable |  |
| callables/registerParticipants.ts | domains/tournament_activeTournament/callables/registerParticipants.ts | callable |  |
| callables/createTemporaryTable.ts | domains/tournament_activeTournament/callables/createTemporaryTable.ts | callable |  |
| callables/bustAndReentry.ts | domains/tournament_activeTournament/callables/bustAndReentry.ts | callable |  |
| callables/bustAndExit.ts | domains/tournament_activeTournament/callables/bustAndExit.ts | callable |  |
| callables/addon.ts | domains/tournament_activeTournament/callables/addon.ts | callable |  |
| callables/bulkAddon.ts | domains/tournament_activeTournament/callables/bulkAddon.ts | callable |  |
| callables/api.pause.ts | domains/tournament_activeTournament/callables/api.pause.ts | callable |  |
| callables/api.resume.ts | domains/tournament_activeTournament/callables/api.resume.ts | callable |  |
| callables/getPrizeData.ts | domains/tournament_activeTournament/callables/getPrizeData.ts | callable |  |
| callables/setPrizeData.ts | domains/tournament_activeTournament/callables/setPrizeData.ts | callable |  |
| callables/getRankingData.ts | domains/tournament_activeTournament/callables/getRankingData.ts | callable |  |
| callables/setRankingData.ts | domains/tournament_activeTournament/callables/setRankingData.ts | callable | utils/logUtils 参照 → domains/user/services に変更 |
| callables/endTournament.ts | domains/tournament_activeTournament/callables/endTournament.ts | callable |  |
| callables/validateEndTournament.ts | domains/tournament_activeTournament/callables/validateEndTournament.ts | callable |  |
| callables/getActionLogs.ts | domains/tournament_activeTournament/callables/getActionLogs.ts | callable |  |
| callables/rollbackAction.ts | domains/tournament_activeTournament/callables/rollbackAction.ts | callable |  |
| rollbackFunction/index.ts | domains/tournament_activeTournament の再構成 | — | 7 本の undo* を services に |
| rollbackFunction/undoAddon.ts | domains/tournament_activeTournament/services/undoAddon.ts | service |  |
| rollbackFunction/undoBulkAddon.ts | domains/tournament_activeTournament/services/undoBulkAddon.ts | service |  |
| rollbackFunction/undoBustAndExit.ts | domains/tournament_activeTournament/services/undoBustAndExit.ts | service |  |
| rollbackFunction/undoBustAndReentry.ts | domains/tournament_activeTournament/services/undoBustAndReentry.ts | service |  |
| rollbackFunction/undoRegisterParticipants.ts | domains/tournament_activeTournament/services/undoRegisterParticipants.ts | service |  |
| rollbackFunction/undoAssignSeatToPlayer.ts | domains/tournament_activeTournament/services/undoAssignSeatToPlayer.ts | service |  |
| rollbackFunction/undoReseatAllPlayers.ts | domains/tournament_activeTournament/services/undoReseatAllPlayers.ts | service |  |
| lib/actionLogger.ts | domains/tournament_activeTournament/services/actionLogger.ts | service | markActionAsRolledBack 使用。logAction は未使用 |
| lib/serverStage.ts | unused_function_lib/serverStage.ts | — | **未使用候補**。**unused_function_lib** に格納。デプロイ不要（08 確定） |
| lib/runtimePath.ts | unused_function_lib/runtimePath.ts | — | **未使用候補**。同上 |

---

## 5.4 index.ts 変更方針

- **ルート index**：callables 経由の export を維持しつつ、移行後は domains/tournament_activeTournament から re-export。関数名は維持。
- **domains/tournament_activeTournament/index.ts**：callables 24 本を re-export。services（undo*, actionLogger）は原則 export しない。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。rollbackAction から services の undo* を参照できること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **serverStage.ts, runtimePath.ts**：**unused_function_lib** フォルダに格納。デプロイ不要（08 確定）。04_新フォルダ構造 の「特殊フォルダ unused_function_lib」参照。
- **logAction**（actionLogger）：export されているが呼び出し元なし。markActionAsRolledBack のみ rollbackFunction から参照されている。
- **changeSpec**：rollbackFunction 移管時、callables/rollbackAction の import を domains/tournament_activeTournament/services に更新する。callables/index の tournament 関連 re-export を新パスに更新する。
- **05_入口一覧**：移行実施後、tournament_activeTournament 配下の各入口の配置を「tournament_activeTournament/callables」に更新する。
