# 旧フォルダ別棚卸し：tournamentTemplate

## 1. 対象フォルダの概要

**functions/src/tournamentTemplate** は、トーナメントテンプレートの **onCall 入口 3 本**（createTournamentTemplate, getTournamentTemplates, archiveTournamentTemplate）と、それらを re-export する **index.ts** からなる。**tournamentTemplates** コレクションに対する作成・一覧取得・アーカイブ（更新は別ファイルで callables 直下に存在する可能性あり）。04 の「tournament_createTournament＝トーナメントの作成・スケジューリング・**テンプレート管理**」に該当するため、移行先は **domains/tournament_createTournament/callables** とする。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥3 の callable を re-export。ルート index が `export * from "./tournamentTemplate"` で参照 | ⑦domains/tournament_createTournament（移行先で callables に統合するため index は集約用に再構成） | ⑧No | ⑨tournamentTemplate の export 集約 |
| ①createTournamentTemplate.ts | ②callable | ③Yes | ④Yes | ⑤tournamentTemplates（書） | ⑥アプリ等から onCall | ⑦**domains/tournament_createTournament/callables** | ⑧No | ⑨トーナメントテンプレート作成 |
| ①getTournamentTemplates.ts | ②callable | ③Yes | ④Yes | ⑤tournamentTemplates（読） | ⑥アプリ等から onCall | ⑦**domains/tournament_createTournament/callables** | ⑧No | ⑨トーナメントテンプレート一覧取得 |
| ①archiveTournamentTemplate.ts | ②callable | ③Yes | ④Yes | ⑤tournamentTemplates（書） | ⑥アプリ等から onCall | ⑦**domains/tournament_createTournament/callables** | ⑧No | ⑨トーナメントテンプレートアーカイブ |

## 3. 追加メモ

- **入口**：3 本とも **onCall**。③入口はいずれも Yes。
- **export**：tournamentTemplate/index が 3 本を re-export。ルート index が `export * from "./tournamentTemplate"` のため、④export = Yes。
- **移行先**：04 の tournament_createTournament ドメイン（トーナメントの作成・スケジューリング・テンプレート管理）に含める。トーナメントテンプレートはテンプレート管理の核のため、**domains/tournament_createTournament/callables** に 3 本を移行する。
- **未使用候補**：該当なし。

## 4. 次アクション

- **changeSpec**：tournamentTemplate 配下の 3 callable を **domains/tournament_createTournament/callables** に移行する。ルート index の export を新構造に合わせて更新する。
- **05_入口一覧**：移行後、createTournamentTemplate / getTournamentTemplates / archiveTournamentTemplate を tournament_createTournament/callables として 05 に記載する。
