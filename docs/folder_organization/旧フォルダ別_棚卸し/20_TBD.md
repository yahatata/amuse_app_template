# 旧フォルダ別棚卸し：TBD

## 1. 対象フォルダの概要

**functions/src/TBD** は、**getScheduledTournaments** の 1 ファイルのみ。スケジュール済みトーナメント一覧を取得する **onCall 入口**。scheduledTournaments と tournamentTemplates を読む。**ルート index および callables/index からは export されていない**。callables 内の getTodayTournaments / getUpcomingTournaments は「getScheduledTournaments のロジックを流用」とコメントされているが、TBD の関数を import はしておらず、それぞれ自前のクエリを実装している。04 の「tournament_createTournament＝トーナメントの作成・スケジューリング・テンプレート管理」に該当し、移行先は **domains/tournament_createTournament/callables** とする。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①getScheduledTournaments.ts | ②callable | ③Yes | ④No | ⑤scheduledTournaments（読）, tournamentTemplates（読） | ⑥リポジトリ内に import なし。getTodayTournaments / getUpcomingTournaments は同様ロジックを自前実装しており、本関数は未参照 | ⑦**domains/tournament_createTournament/callables** | ⑧要確認 | ⑨onCall。期間（period）でフィルタして一覧返却。ルート・callables から export されていないためデプロイ対象に含まれていない可能性。設計で callables に統合するか 08 に記録 |

## 3. 追加メモ

- **入口**：**onCall** を含むため ③入口 Yes。種別は **callable**。
- **export**：ルート index は TBD を export していない。callables/index も getScheduledTournaments を TBD から re-export していない。そのため ④export = No（ルート index から辿れない）。**現状デプロイ時に本関数が含まれるか要確認**。
- **移行先**：スケジュール済みトーナメント一覧取得は、04 の tournament_createTournament（作成・スケジューリング・テンプレート管理）に含まれる。**domains/tournament_createTournament/callables** に配置する。TBD フォルダ名は「配置未確定」の意味であり、移行時に本ファイルを callables に統合するか、getTodayTournaments / getUpcomingTournaments と共通化するかを設計・08 で判断する。
- **未使用候補**：リポジトリ内に import がなく、かつ export もされていない。一方で**入口**であるため、02 の「呼び出し元なし＝未使用確定にしない」に該当。⑧は「要確認」とし、運用で呼ばれているか・ルートに export を追加するかを 08 に記録する。

## 4. 次アクション

- **設計**：tournament_createTournament ドメイン設計で、getScheduledTournaments を **domains/tournament_createTournament/callables** に移す方針を記載する。**ルート index または callables 経由で export するか**、getTodayTournaments / getUpcomingTournaments と統合するかを 08_意思決定ログに記録する。
- **changeSpec**：TBD 移管時に、本関数を tournament_createTournament/callables に配置し、必要ならルートまたは callables の index から export を追加する。
- **05_入口一覧**：getScheduledTournaments を「tournament_createTournament/callables」として 05 に追加するか、getTodayTournaments 等と統合する場合はその旨を 05 に記載する。
