# Step 9 確認観点

## 1. firestore.rules

| # | 観点 | 期待結果 | 検証方法 |
|---|------|----------|----------|
| 1 | taskIndex のネスト | `match /taskIndex/{taskType}` が `match /scheduledTournaments/{tournamentId}` の**内側**にある | コード確認 |
| 2 | read/write | `allow read, write: if false` であること | コード確認 |
| 3 | コメント | 内部台帳・Cloud Functions 専用・クライアント非公開の意図が明記されている | コード確認 |

## 2. firestore.indexes.json

| # | 観点 | 期待結果 | 検証方法 |
|---|------|----------|----------|
| 4 | status + startAt | status ASC, startAt ASC のインデックスが存在 | step9 テスト |
| 5 | status + storeId + startAt | status ASC, storeId ASC, startAt ASC のインデックスが存在 | step9 テスト |
| 6 | status + storeId + tenantId + startAt | status ASC, storeId ASC, tenantId ASC, startAt ASC のインデックスが存在 | step9 テスト |
| 7 | collectionGroup | 上記はいずれも `collectionGroup: "scheduledTournaments"`（typo・別コレクションの誤検知防止） | step9 テスト |
| 8 | queryScope | 上記はいずれも `queryScope: "COLLECTION"` | step9 テスト |

## 3. デプロイ（任意）

| # | 観点 | 期待結果 |
|---|------|----------|
| 9 | firestore:rules | `firebase deploy --only firestore:rules` がエラーなく完了 |
| 10 | firestore:indexes | `firebase deploy --only firestore:indexes` がエラーなく完了 |
