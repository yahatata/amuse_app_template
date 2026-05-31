# 会計・reporting 運用資料

このフォルダは、会計後調整機能、analytics 集計、reporting 集計、整合性チェック、障害時リカバリに関する運用資料をまとめたものです。

| ファイル名 | 内容 | 対象読者 |
|---|---|---|
| `D2_リカバリ手順_analyticsReporting障害時.md` | analytics / reporting の反映異常時に、Cloud Logging、`aggregationMarkers`、整合性チェック、`rebuildReportingMonthly` を使って切り分け・復旧する手順 | システム管理者、エンジニア兼任担当 |
| `整合性チェック機能の概要と運用.md` | `analyticsDailyCheck` / `analyticsMonthlyCheck` / `reportingDailyCheck` / `reportingMonthlyCheck` の役割、`batchJobLogs` の見方、手動運用方法 | 保守担当エンジニア、システム管理者 |
| `会計後調整機能_実装概要.md` | 会計後調整機能の全体像、Firestore コレクション、主要 callable / trigger / repo、データフロー、冪等性、保守上の注意点 | 将来の保守担当エンジニア |

## 併せて参照する資料

- `docs/運用時資料_現場向け/会計関連/会計後調整機能/D1_操作手順書_会計責任者向け.md`
- `docs/運用時資料_現場向け/会計関連/会計後調整機能/D3_是正フロー_誤操作時.md`
- `docs/運用時資料/設定/storeMeta/configによる設定の詳細/features.md`
- `docs/運用時資料/設定/storeMeta/taxReportingBehaviorによる設定の詳細/README.md`
