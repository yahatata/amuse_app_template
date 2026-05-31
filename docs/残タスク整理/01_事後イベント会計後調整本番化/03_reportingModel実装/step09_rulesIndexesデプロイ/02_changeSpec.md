# Step 09: changeSpec — Firestore rules / indexes

## 既存変更ファイル

| # | ファイルパス | 変更内容 |
|---|---|---|
| 1 | `firestore.rules` | `reportingEntries` / `reportingMonthly` / `storeMeta/taxReportingBehavior` / `storeMeta/reportingGroupConfig` のルールを追加 |
| 2 | `firestore.indexes.json` | `reportingEntries` のインデックス 2 件を追加 |

## 変更詳細

### 1. `firestore.rules`

catch-all `match /{document=**}` ブロックの直前に以下のルールを追加:

| コレクション / ドキュメント | read | write |
|---|---|---|
| `reportingEntries/{entryId}` | `true`（開発用） | `false`（Functions 経由のみ） |
| `reportingMonthly/{monthKey}` | `true`（開発用） | `false`（Functions 経由のみ） |
| `reportingMonthly/{monthKey}/aggregationMarkers/{markerId}` | `false` | `false` |
| `storeMeta/taxReportingBehavior` | `true`（開発用） | `false`（Functions 経由のみ） |
| `storeMeta/reportingGroupConfig` | `true`（開発用） | `false`（Functions 経由のみ） |

### 2. `firestore.indexes.json`

`indexes` 配列に以下を追加:

| # | collectionGroup | fields | 用途 |
|---|---|---|---|
| 1 | `reportingEntries` | `billId ASC, eventAt DESC` | 伝票ごとのエントリ検索 |
| 2 | `reportingEntries` | `reportingMonth ASC, eventAt ASC` | 月次集計用（`rebuildReportingMonthly` で使用） |
