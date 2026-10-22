# 旧フォルダ別棚卸し：scheduler

## 1. 対象フォルダの概要

**functions/src/scheduler** は、**weeklyPlanner** の 1 ファイルのみ。週 1 回（日曜 20:00 JST）に onSchedule で起動し、翌週（月〜日）分の「閉店認定」「開店認定」タスクを Cloud Tasks に投入する **scheduler 入口**。businessHoursMonthlyMap から営業時間を取得し、lib/env で URL 等を参照。ルート index から export されている。04 の storeMeta＝「店舗・開閉店・状態・店舗評価（**開始/終了タスク含む**）」に該当する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①weeklyPlanner.ts | ②scheduler | ③Yes | ④Yes | ⑤businessHoursMonthlyMap（読）。Cloud Tasks へ開店・閉店認定タスクを投入（Firestore は書かない） | ⑥Cloud Scheduler が定期実行。リポジトリ内の呼び出し元はなし。lib/env（getEnv）を import | ⑦**domains/storeMeta/scheduler** | ⑧No | ⑨onSchedule（日曜 20:00 JST）。CLOSE_ASSESSMENT_URL, OPEN_ASSESSMENT_URL でタスク先を指定。04 の storeMeta＝開始/終了タスク含む |

## 3. 追加メモ

- **入口**：`onSchedule` を含むため **scheduler 入口**。③Yes。種別は **scheduler**。
- **export**：ルート index.ts が `export * from "./scheduler/weeklyPlanner"` で export しているため、④Yes。
- **移行先の理由**：週次で「閉店認定」「開店認定」タスクを投入する責務は、04 の storeMeta「店舗・開閉店・状態・店舗評価（開始/終了タスク含む）」に明示されている。businessHoursMonthlyMap は shift が主に管理するが、weeklyPlanner の**利用目的**は開閉店タスクのスケジューリングなので **domains/storeMeta/scheduler** に配置する。
- **未使用候補**：該当なし。index から export され、Cloud Scheduler により実行される。

## 4. 次アクション

- **設計**：storeMeta ドメイン設計で **weeklyPlanner** を **domains/storeMeta/scheduler** に移す方針を記載する。lib/env の import パスを移行先に合わせて更新する。
- **changeSpec**：scheduler 移管時にルート index.ts の **import パス** を `domains/storeMeta/scheduler`（または storeMeta の index）に更新する。export 名（weeklyPlanner）は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行先確定後、weeklyPlanner の配置を「storeMeta/scheduler」に更新する。
