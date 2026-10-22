# 新フォルダ別設計：analytics

## 5.1 ドメイン定義（短く）

伝票（bills）に紐づく集計・分析・レポートを担当するドメイン。月次・日次・カテゴリ別・テンプレート別・ユーザー別の集計、Settlement/Event の集計キュー（aggregator）、および移管・ダミーデータ生成の callable を含む。

**主に扱うデータ/コレクション**
- analyticsMonthly（およびサブコレクション days, byCategory, byTemplateTournaments, byUser, aggregationMarkers）, storeMeta, bills
- config/ops 参照（helpers 内）

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | 営業日単位の settled bills 移管（migrateSettledBillsForBusinessDay）、テスト用ダミーデータ生成（generateDummyData）の onCall 入口 |
| scheduler/ | 夜間バッチ 3 本（nightlyRecalculateBalanceDue, nightlyReconciliationCheck, nightlyIntegrityCheck）。scripts から移管 |
| services/ | helpers, addToMonthlyIndex, addToDailySummary, addToByCategory, addToByTemplateTournaments, addToByUser, updateAnalyticsForBill, aggregator（index, delta, writer, markers, types） |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| analytics/index.ts | domains/analytics の再構成 | — | callables を中心に export。updateAnalyticsForBill, aggregator は内部のため index から export しない |
| analytics/migrateSettledBillsForBusinessDay.ts | domains/analytics/callables/migrateSettledBillsForBusinessDay.ts | callable |  |
| analytics/generateDummyData.ts | domains/analytics/callables/generateDummyData.ts | callable | **未使用候補**。テスト用ダミーデータ。本番までに削除が必要。UI のボタン等も含めて削除の必要あり（02_analytics 棚卸し 検討事項） |
| analytics/helpers.ts | domains/analytics/services/helpers.ts | service | ファイル名変更の可能性あり（02_analytics 棚卸し 検討事項） |
| analytics/addToMonthlyIndex.ts | domains/analytics/services/addToMonthlyIndex.ts | service |  |
| analytics/addToDailySummary.ts | domains/analytics/services/addToDailySummary.ts | service |  |
| analytics/addToByCategory.ts | domains/analytics/services/addToByCategory.ts | service |  |
| analytics/addToByTemplateTournaments.ts | domains/analytics/services/addToByTemplateTournaments.ts | service |  |
| analytics/addToByUser.ts | domains/analytics/services/addToByUser.ts | service |  |
| analytics/updateAnalyticsForBill.ts | domains/analytics/services/updateAnalyticsForBill.ts | service | 内部。migrateSettledBillsForBusinessDay, aggregator から参照 |
| analytics/aggregator/* | domains/analytics/services/aggregator/* | service | triggers/bills.onSettle が enqueueSettlement を直接 import。import パスを domains/analytics/services に更新 |
| scripts/nightlyRecalculateBalanceDue.ts | domains/analytics/scheduler/nightlyRecalculateBalanceDue.ts | scheduler | onSchedule。config/ops → shared/time 参照に変更 |
| scripts/nightlyReconciliationCheck.ts | domains/analytics/scheduler/nightlyReconciliationCheck.ts | scheduler | onSchedule。同上 |
| scripts/nightlyIntegrityCheck.ts | domains/analytics/scheduler/nightlyIntegrityCheck.ts | scheduler | onSchedule。同上 |

---

## 5.4 index.ts 変更方針

- **ルート index**：`export * from "./analytics"` を `export * from "./domains/analytics"` に変更。関数名は維持。
- **domains/analytics/index.ts**：callables 2 本（migrateSettledBillsForBusinessDay, generateDummyData）と scheduler 3 本（nightlyRecalculateBalanceDue, nightlyReconciliationCheck, nightlyIntegrityCheck）を re-export。helpers.*, addTo* は analytics 従来どおり export していた場合のみ移行先で検討。**updateAnalyticsForBill** と **aggregator/** は index から export しない（内部 services）。triggers/bills.onSettle は domains/analytics/services/aggregator を直接 import する形に変更。
- **storeManagement/closeStoreTerminal** が runMigrateSettledBillsForBusinessDay を呼ぶ。移行後は domains/storeMeta から domains/analytics の services を参照する形になる。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。triggers/bills.onSettle（domains/bills/triggers）から domains/analytics/services の enqueueSettlement を参照できること。storeManagement/closeStoreTerminal から runMigrateSettledBillsForBusinessDay を参照できること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **generateDummyData**：テスト用ダミーデータ生成（4 ヶ月分）。**⑧未使用候補**ではなく本番時までに削除が必要。UI のボタン等も含めて削除の必要あり。＜検討事項＞（02_analytics 棚卸し）。
- **helpers.ts**：ファイルの名称変更を行う必要がある可能性あり。＜検討事項＞（02_analytics 棚卸し）。
- **設計**：updateAnalyticsForBill と aggregator/ は analytics/index から export していないため、移行先でも「内部 services」として扱い、index は callables を中心に export する方針（04 の index.ts 方針）に合わせる。
- **changeSpec**：analytics 移管時に、storeManagement/closeStoreTerminal と triggers/bills.onSettle の **import パス** を、domains/analytics 配下の新パスに更新する。scripts から nightly 3 本を domains/analytics/scheduler に移す際は、ルート index の import を domains/analytics に変更する。
- **05_入口一覧**：移行実施後、migrateSettledBillsForBusinessDay と generateDummyData の「現在パス」を新パスに更新する。nightly 3 本は **analytics / scheduler** に更新する。
