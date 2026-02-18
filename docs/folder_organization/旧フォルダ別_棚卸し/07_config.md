# 旧フォルダ別棚卸し：config

## 1. 対象フォルダの概要

**functions/src/config** は、**運用設定**（店舗締め時間・夜間 cron 等）を提供するフォルダ。ファイルは **ops.ts の 1 件のみ**。index.ts は存在せず、ルート index からも export されていない。getStoreCloseHour / normalizeStoreCloseHour / getNightlyCronTriplet / cronFromHourAndMinuteJst を export し、bills・attendance・analytics・scripts の複数ドメインから参照されている。04 のドメイン一覧に「config」はないため、横断利用として **shared 候補** とする。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①ops.ts | ②shared候補 | ③No | ④No | ⑤なし（環境変数・functions.config() を読むのみ。Firestore は触らない） | ⑥scripts/nightlyReconciliationCheck, nightlyRecalculateBalanceDue, nightlyIntegrityCheck（bills 系 scheduler）, callables/getAccountingHistory（bills）, attendance/determineAttendanceMode, analytics/helpers | ⑦shared/time（推奨。店舗締め時間・cron は時間系。01 の shared/time に含める。別案で shared に config カテゴリ追加の場合は 08_意思決定ログに記録） | ⑧No | ⑨getStoreCloseHour, normalizeStoreCloseHour, cronFromHourAndMinuteJst, getNightlyCronTriplet。複数ドメインで「同じ設定」として利用されるため shared 候補 |

## 3. 追加メモ

- **入口**：なし。onCall / onRequest / onSchedule 等は含まない。設定取得用の純粋な関数群。
- **export**：ルート index は config を export していない。参照はすべて **直接 import（../config/ops）** のため、④export = No（index から辿れない）。
- **参照元**：bills 系（scripts 3 本・getAccountingHistory）、attendance（determineAttendanceMode）、analytics（helpers）の **3 ドメイン以上** から参照。「どのドメインでも意味が同じ」（店舗締め時間・営業日境界・夜間 cron）のため、02 の shared 判定に該当し、**②shared候補** とした。
- **移行先**：01_前提の shared カテゴリのうち **shared/time/** が「時間・JST・営業日計算の汎用」とあるため、店舗締め時間（STORE_CLOSE_HOUR）と cron 生成は時間系として **shared/time** に置くのを推奨。運用設定を独立させたい場合は shared に **config** カテゴリを新設し、08_意思決定ログに記録する。
- **未使用候補**：該当なし。6 ファイルから参照されている。

## 4. 次アクション

- **設計**：shared 設計または 08_意思決定ログで、config/ops を **shared/time** に置くか **shared/config** を新設するか確定する。確定後、移行先パス（例：shared/time/ops.ts または shared/config/ops.ts）を決める。
- **changeSpec**：config 移管時に、参照元 6 ファイル（scripts 3, callables/getAccountingHistory, attendance/determineAttendanceMode, analytics/helpers）の **import パス** を新パスに更新する。
- **05_入口一覧**：config に入口はないため、05 の更新対象なし。
