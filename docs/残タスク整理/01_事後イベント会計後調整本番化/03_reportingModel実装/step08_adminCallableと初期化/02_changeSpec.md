# Step 08: changeSpec — admin callable + storeMeta 初期化

## 新規作成ファイル

| # | ファイルパス | 内容 |
|---|---|---|
| 1 | `functions/src/domains/reporting/services/monthlyRebuilder.ts` | 指定月の `reportingMonthly` を `reportingEntries` から全件再集計するロジック |
| 2 | `functions/src/domains/reporting/callables/rebuildReportingMonthly.ts` | admin callable（`monthlyRebuilder` を呼ぶ） |
| 3 | `functions/src/domains/reporting/scripts/initReportingConfig.ts` | `storeMeta/taxReportingBehavior` と `storeMeta/reportingGroupConfig` の初期値を設定するスクリプト |
| 4 | `functions/__tests__/reporting/monthlyRebuilder.spec.ts` | `rebuildReportingMonthly` のユニットテスト |

## 既存変更ファイル

| # | ファイルパス | 変更内容 |
|---|---|---|
| 1 | `functions/src/shared/logging/serviceByFunctionEntry.ts` | `rebuildReportingMonthlyCallable` → `reporting`、`initReportingConfig` → `reporting` を追加 |

## 実装詳細

### 1. `monthlyRebuilder.ts`

- `rebuildReportingMonthly(db, monthKey)` を export
- 処理: reportingEntries を monthKey でフィルタ → 全件集計 → 既存 aggregationMarkers 全削除 → monthly doc を set で上書き → markers を再作成
- Firestore batch を使用（500 ops 上限に関するコメント付き）
- 戻り値: `RebuildResult { monthKey, totalEntriesProcessed, totalAmountIncl }`

### 2. `rebuildReportingMonthly.ts`（callable）

- `onCall` で定義
- 認証チェック: `request.auth` が null なら `unauthenticated`
- 入力バリデーション: `monthKey` が 6 桁数字文字列
- 成功時: `logOpsSuccess` で記録
- 失敗時: `logOpsError` で記録 → `HttpsError` で返却

### 3. `initReportingConfig.ts`（スクリプト）

- `createInitialStateDoc.ts` のパターンに準拠
- `storeMeta/taxReportingBehavior`: `DEFAULT_TAX_REPORTING_BEHAVIOR` + `createdAt` で作成（存在する場合はスキップ）
- `storeMeta/reportingGroupConfig`: `{ groups: [], createdAt }` で作成（存在する場合はスキップ）
- 成功/失敗を `logOpsSuccess` / `logOpsError` で記録

### 4. `serviceByFunctionEntry.ts` への登録

- `rebuildReportingMonthlyCallable` → `reporting`
- `initReportingConfig` → `reporting`
