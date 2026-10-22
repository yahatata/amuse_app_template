# 新フォルダ別設計：tournament_createTournament

## 5.1 ドメイン定義（短く）

トーナメントの作成・スケジューリング・テンプレート管理を担当するドメイン。ブラインドテンプレート・トーナメントテンプレートの CRUD、スケジュール済みトーナメント作成・リカレンス・一覧取得、および TBD の getScheduledTournaments を含む。

**主に扱うデータ/コレクション**
- blindTemplates, tournamentTemplates, scheduledTournaments, tournamentRecurrences
- helpers/billsApi（calcBusinessDate 等）。lib/tasks（Cloud Tasks 投入）

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | ブラインドテンプレート CRUD、トーナメントテンプレート作成・一覧・アーカイブ、スケジュール作成・リカレンス・編集用一覧・リカレンスから生成、テンプレート更新の onCall 入口。getScheduledTournaments は to_be_deleted に退避（export しない） |
| services/ | lib/tasks（enqueueStartTask, enqueueRegistTask）を移行。トーナメント開始・レジ締タスク投入 |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| tournamentBlind/index.ts | domains/tournament_createTournament の再構成 | — | 4 callable を callables に統合 |
| tournamentBlind/createBlindTemplate.ts | domains/tournament_createTournament/callables/createBlindTemplate.ts | callable |  |
| tournamentBlind/getBlindTemplates.ts | domains/tournament_createTournament/callables/getBlindTemplates.ts | callable |  |
| tournamentBlind/updateBlindTemplate.ts | domains/tournament_createTournament/callables/updateBlindTemplate.ts | callable |  |
| tournamentBlind/archiveBlindTemplate.ts | domains/tournament_createTournament/callables/archiveBlindTemplate.ts | callable |  |
| tournamentTemplate/index.ts | 同上 | — | 3 callable を callables に統合 |
| tournamentTemplate/createTournamentTemplate.ts | domains/tournament_createTournament/callables/createTournamentTemplate.ts | callable |  |
| tournamentTemplate/getTournamentTemplates.ts | domains/tournament_createTournament/callables/getTournamentTemplates.ts | callable |  |
| tournamentTemplate/archiveTournamentTemplate.ts | domains/tournament_createTournament/callables/archiveTournamentTemplate.ts | callable |  |
| callables/createScheduledTournament.ts | domains/tournament_createTournament/callables/createScheduledTournament.ts | callable |  |
| callables/createTournamentRecurrence.ts | domains/tournament_createTournament/callables/createTournamentRecurrence.ts | callable |  |
| callables/getTournamentRecurrences.ts | domains/tournament_createTournament/callables/getTournamentRecurrences.ts | callable |  |
| callables/deleteTournamentRecurrence.ts | domains/tournament_createTournament/callables/deleteTournamentRecurrence.ts | callable |  |
| callables/generateRecurringTournaments.ts | domains/tournament_createTournament/callables/generateRecurringTournaments.ts | callable |  |
| callables/updateTournamentRecurrence.ts | domains/tournament_createTournament/callables/updateTournamentRecurrence.ts | callable |  |
| callables/updateTournamentTemplate.ts | domains/tournament_createTournament/callables/updateTournamentTemplate.ts | callable |  |
| callables/getScheduledTournamentsForEdit.ts | domains/tournament_createTournament/callables/getScheduledTournamentsForEdit.ts | callable |  |
| TBD/getScheduledTournaments.ts | domains/tournament_createTournament/to_be_deleted/getScheduledTournaments_to_be_deleted.ts | — | **export しない**。未使用関数として to_be_deleted フォルダにファイル名に to_be_deleted をつけて保存（08 確定）。デプロイ対象外 |
| lib/tasks.ts | domains/tournament_createTournament/services/tasks.ts | service | enqueueStartTask, enqueueRegistTask。lib/env 参照を shared 等に変更 |

---

## 5.4 index.ts 変更方針

- **ルート index**：tournamentBlind, tournamentTemplate の export をやめ、`export * from "./domains/tournament_createTournament"` に集約。関数名は維持。
- **domains/tournament_createTournament/index.ts**：callables を re-export。callables/index から re-export されていた getBlindTemplates 等のパスを更新。
- **getScheduledTournaments（TBD）**：**export しない**。未使用関数として **to_be_deleted** フォルダに **getScheduledTournaments_to_be_deleted.ts** の名前で保存する（08 確定）。04_新フォルダ構造 の「特殊フォルダ to_be_deleted」参照。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **TBD/getScheduledTournaments**：**export しない**。**to_be_deleted** フォルダに **getScheduledTournaments_to_be_deleted.ts** として退避（08 確定）。05_入口一覧にはデプロイ対象外のため追加しない。
- **changeSpec**：tournamentBlind・tournamentTemplate 配下の callable を domains/tournament_createTournament/callables に移行する。ルート index および callables/index の export を新構造に合わせて更新する。
