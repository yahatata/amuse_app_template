# 旧フォルダ別棚卸し：analytics

## 1. 対象フォルダの概要

**functions/src/analytics** は、伝票（bills）に紐づく **集計・分析・レポート** 用のロジックを置くフォルダ。analyticsMonthly を中心に、月次・日次・カテゴリ別・テンプレート別・ユーザー別の集計、Settlement/Event の集計キュー（aggregator）、および callable 2 件（移管・ダミーデータ生成）を提供する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約のみ | ⑦domains/analytics（移行先で callables/services 等から再 export して再構成） | ⑧No | ⑨export 集約。移行時に domains/analytics 配下の構成に合わせて再編する |
| ①migrateSettledBillsForBusinessDay.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta（読）, bills, analyticsMonthly とサブコレクション | ⑥アプリ onCall。runMigrateSettledBillsForBusinessDay は storeManagement/closeStoreTerminal からも呼ばれる | ⑦domains/analytics/callables | ⑧No | ⑨営業日単位の settled bills を analytics へ移管。入口は onCall |
| ①generateDummyData.ts | ②callable | ③Yes | ④Yes | ⑤analyticsMonthly とサブコレクション（days, byCategory, byTemplateTournaments, byUser） | ⑥アプリ onCall | ⑦domains/analytics/callables | ⑧No | ⑨テスト用ダミーデータ生成（4 ヶ月分） |
| ①helpers.ts | ②service | ③No | ④Yes | ⑤なし（計算のみ） | ⑥addToMonthlyIndex, addToDailySummary, addToByCategory, addToByUser 等 | ⑦domains/analytics/services | ⑧No | ⑨resolveBusinessDate, distributePaymentMethods, calculateCategoryAmounts 等。config/ops 参照 |
| ①addToMonthlyIndex.ts | ②service | ③No | ④Yes | ⑤analyticsMonthly（書） | ⑥updateAnalyticsForBill（processBillAnalyticsAtomically） | ⑦domains/analytics/services | ⑧No | ⑨トランザクション内で月次 doc 更新 |
| ①addToDailySummary.ts | ②service | ③No | ④Yes | ⑤analyticsMonthly/{month}/days（書） | ⑥同上 | ⑦domains/analytics/services | ⑧No | ⑨日次サマリ更新 |
| ①addToByCategory.ts | ②service | ③No | ④Yes | ⑤analyticsMonthly/{month}/byCategory（書） | ⑥同上 | ⑦domains/analytics/services | ⑧No | ⑨カテゴリ別集計 |
| ①addToByTemplateTournaments.ts | ②service | ③No | ④Yes | ⑤analyticsMonthly/{month}/byTemplateTournaments（書） | ⑥同上 | ⑦domains/analytics/services | ⑧No | ⑨テンプレート別トーナメント集計 |
| ①addToByUser.ts | ②service | ③No | ④Yes | ⑤analyticsMonthly/{month}/byUser（書） | ⑥同上 | ⑦domains/analytics/services | ⑧No | ⑨ユーザー別集計 |
| ①updateAnalyticsForBill.ts | ②service | ③No | ④No | ⑤analyticsMonthly とサブ（aggregationMarkers 含む） | ⑥migrateSettledBillsForBusinessDay（runMigrate）, aggregator/index（enqueueSettlement） | ⑦domains/analytics/services | ⑧No | ⑨1 bill 単位の analytics 更新をトランザクションで実行。analytics/index からは export されていない |
| ①aggregator/index.ts | ②service | ③No | ④No | ⑤analyticsMonthly, aggregationMarkers | ⑥triggers/bills.onSettle（enqueueSettlement を直接 import） | ⑦domains/analytics/services | ⑧No | ⑨Settlement 集計の入口。analytics/index からは export されていない |
| ①aggregator/types.ts | ②service | ③No | ④No | ⑤なし（型定義） | ⑥aggregator 内（index, delta, writer 等） | ⑦domains/analytics/services | ⑧No | ⑨BillDoc, EventDoc, MonthlyDailyDelta 等 |
| ①aggregator/delta.ts | ②service | ③No | ④No | ⑤なし（計算のみ） | ⑥aggregator/index | ⑦domains/analytics/services | ⑧No | ⑨buildSettlementDelta, buildEventDelta |
| ①aggregator/writer.ts | ②service | ③No | ④No | ⑤analyticsMonthly, days, eventsLog | ⑥aggregator/index | ⑦domains/analytics/services | ⑧No | ⑨applyMonthlyDailyDelta, appendEventLog |
| ①aggregator/markers.ts | ②service | ③No | ④No | ⑤analyticsMonthly/{month}/aggregationMarkers（書） | ⑥aggregator/index（checkAndSetEventMarker） | ⑦domains/analytics/services | ⑧No | ⑨Event 冪等用マーカー |

## 3. 追加メモ

- **入口（callable）**：migrateSettledBillsForBusinessDay と generateDummyData の 2 件のみ。いずれも index 経由でルートに露出している（05_入口一覧と整合）。
- **export 経路**：analytics/index は migrateSettledBillsForBusinessDay, generateDummyData, helpers.*, addToMonthlyIndex, addToDailySummary, addToByCategory, addToByTemplateTournaments, addToByUser を export。**updateAnalyticsForBill** と **aggregator/** は analytics/index から export されていない。aggregator は **triggers/bills.onSettle** が `../analytics/aggregator` を直接 import。移行後も bills トリガから analytics ドメインの services を呼ぶ形になるため、import パス修正が必要。
- **他ドメインからの参照**：
  - **storeManagement/closeStoreTerminal** が `runMigrateSettledBillsForBusinessDay` を呼び出している（閉店ターミナル処理の一環）。移行後は domains/storeMeta から domains/analytics の services を参照する形になる。
  - **triggers/bills.onSettle** が `enqueueSettlement` を呼び出している。移行後は domains/bills/triggers から domains/analytics/services を参照する形になる。
- **shared 候補**：helpers の resolveBusinessDate / distributePaymentMethods 等は analytics 内で完結しており、他ドメインと「同じ意味で使う」横断カテゴリには該当しないため、shared にはしない。
- **未使用候補**：該当なし。全ファイルが migrate/aggregator/updateAnalytics のいずれかの経路で参照されている。

## 4. 次アクション

- **設計**：analytics ドメイン設計（`新フォルダ別_設計/XX_analytics.md`）作成時に、上記の移行先（callables 2 件・services 12 件・index 再構成）を反映する。とくに **updateAnalyticsForBill** と **aggregator/** は analytics/index から export していないため、移行先でも「内部 services」として扱い、index は callables を中心に export する方針（04 の index.ts 方針）に合わせる。
- **changeSpec**：analytics 移管時に、storeManagement/closeStoreTerminal と triggers/bills.onSettle の **import パス**を、domains/analytics 配下の新パスに更新する。
- **05_入口一覧**：移行実施後、migrateSettledBillsForBusinessDay と generateDummyData の「現在パス」を新パスに更新する。
- **入口一覧との突合**：05 には analytics の callables 2 件が「analytics / callables」として記載済み。変更なし。
