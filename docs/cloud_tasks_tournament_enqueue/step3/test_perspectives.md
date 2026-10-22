# Step 3 テスト観点

changeSpec 11.2 に準拠したテスト観点。

## 観点一覧

| # | 対象 | 観点 | 期待結果 |
|---|------|------|----------|
| 1 | updateTournamentTemplate | blindStructure 変更時 | taskSyncNeeded=true が設定される |
| 2 | updateTournamentTemplate | blindStructure 変更なし（名前等のみ） | taskSyncNeeded は更新されない |
| 3 | updateTournamentRecurrence | startAt 変更時 | schedulePlanVersion++、taskSyncNeeded=true、taskSyncReason に `startAtChanged` が含まれる |
| 4 | updateTournamentRecurrence | cancelled のみ（isActive=false、他変更なし） | taskSyncNeeded=false が明示的に設定される |
| 5 | updateTournamentRecurrence | template 変更時 | taskSyncNeeded=true が設定される（version++、schedulePlanUpdatedAt は更新しない） |

## 補足

- **観点2**: batch.update に taskSyncNeeded を含めないため、既存値が維持される
- **観点4**: taskSyncNeeded=false のみを書き込み、taskSyncReason / schedulePlanVersion は消さない（過去値が残存）
- **観点5**: hasTemplateChange のみのときは version++ を行わない（changeSpec 案B）
