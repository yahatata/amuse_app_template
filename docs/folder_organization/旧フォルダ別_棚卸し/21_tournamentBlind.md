# 旧フォルダ別棚卸し：tournamentBlind

## 1. 対象フォルダの概要

**functions/src/tournamentBlind** は、ブラインドテンプレートの **onCall 入口 4 本**（createBlindTemplate, getBlindTemplates, updateBlindTemplate, archiveBlindTemplate）と、それらを re-export する **index.ts** からなる。**blindTemplates** コレクションに対する CRUD。04 の「tournament_createTournament＝トーナメントの作成・スケジューリング・**テンプレート管理**」に該当するため、移行先は **domains/tournament_createTournament/callables** とする。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥4 の callable を re-export。ルート index が `export * from "./tournamentBlind"` で参照 | ⑦domains/tournament_createTournament（移行先で callables に統合するため index は集約用に再構成） | ⑧No | ⑨tournamentBlind の export 集約 |
| ①createBlindTemplate.ts | ②callable | ③Yes | ④Yes | ⑤blindTemplates（書） | ⑥アプリ等から onCall | ⑦**domains/tournament_createTournament/callables** | ⑧No | ⑨ブラインドテンプレート作成 |
| ①getBlindTemplates.ts | ②callable | ③Yes | ④Yes | ⑤blindTemplates（読） | ⑥アプリ等から onCall。callables/index からも re-export あり | ⑦**domains/tournament_createTournament/callables** | ⑧No | ⑨ブラインドテンプレート一覧取得 |
| ①updateBlindTemplate.ts | ②callable | ③Yes | ④Yes | ⑤blindTemplates（書） | ⑥アプリ等から onCall | ⑦**domains/tournament_createTournament/callables** | ⑧No | ⑨ブラインドテンプレート更新 |
| ①archiveBlindTemplate.ts | ②callable | ③Yes | ④Yes | ⑤blindTemplates（書） | ⑥アプリ等から onCall | ⑦**domains/tournament_createTournament/callables** | ⑧No | ⑨ブラインドテンプレートアーカイブ |

## 3. 追加メモ

- **入口**：4 本とも **onCall**。③入口はいずれも Yes。
- **export**：tournamentBlind/index が 4 本を re-export。ルート index が `export * from "./tournamentBlind"` のため、④export = Yes。getBlindTemplates は callables/index からも `export { getBlindTemplates } from '../tournamentBlind/getBlindTemplates'` で re-export されている。
- **移行先**：04 の tournament_createTournament ドメイン（トーナメントの作成・スケジューリング・テンプレート管理）に含める。ブラインドテンプレートはテンプレート管理の一部のため、**domains/tournament_createTournament/callables** に 4 本を移行する。
- **未使用候補**：該当なし。

## 4. 次アクション

- **changeSpec**：tournamentBlind 配下の 4 callable を **domains/tournament_createTournament/callables** に移行する。ルート index および callables/index の export を新構造に合わせて更新する。
- **05_入口一覧**：移行後、getBlindTemplates 等の入口を tournament_createTournament/callables として 05 に記載する。
