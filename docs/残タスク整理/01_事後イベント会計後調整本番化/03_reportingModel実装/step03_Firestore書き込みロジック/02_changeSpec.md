# Step 03: Firestore 書き込みロジック — changeSpec

## 概要

`ReportingEntry` を Firestore に冪等に書き込む `entryWriter` と、月次集計ドキュメント `reportingMonthly` に増分更新する `monthlyUpdater` を実装する。

## 新規ファイル

| ファイル | 概要 |
|---|---|
| `functions/src/domains/reporting/services/entryWriter.ts` | `writeReportingEntry`: `reportingEntries/{entryId}` への create（冪等。ALREADY_EXISTS は { written: false }） |
| `functions/src/domains/reporting/services/monthlyUpdater.ts` | `applyEntryToReportingMonthly`: `reportingMonthly/{monthKey}` への増分更新（aggregationMarkers で冪等性担保） |
| `functions/__tests__/reporting/entryWriter.spec.ts` | entryWriter のユニットテスト（3 テストケース） |
| `functions/__tests__/reporting/monthlyUpdater.spec.ts` | monthlyUpdater のユニットテスト（4 テストケース） |

## entryWriter

- `reportingEntries/{entryId}` に `docRef.create()` で書き込み
- gRPC code 6 (ALREADY_EXISTS) → `{ written: false }` を返す（冪等）
- その他のエラー → 再 throw

## monthlyUpdater

- `reportingMonthly/{monthKey}` に `FieldValue.increment` で増分更新
- `aggregationMarkers` サブコレクション（`entries_{entryId}` ドキュメント）で冪等性を担保
  - マーカー存在時は即 return（二重処理防止）
- 月次 doc 未存在時は初期値で `set()` してから `update()`
- 更新対象: `totalAmountIncl`, `categoryBreakdown.{key}.amountIncl`, `paymentMethodBreakdown.{key}`, `categoryPaymentMatrix.{key}`, `lastUpdatedAt`

## パターン参照

- `functions/src/domains/analytics/services/aggregator/markers.ts` の `checkAndSetEventMarker` パターン
- `functions/src/domains/analytics/services/aggregator/writer.ts` の `applyMonthlyDailyDelta` パターン

## テスト結果

7 テスト全件 PASS（entryWriter 3件 + monthlyUpdater 4件）
