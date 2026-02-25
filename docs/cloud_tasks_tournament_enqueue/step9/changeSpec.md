# Step 9 changeSpec：Firestore ルール・インデックス

## 1. 概要

### 1.1 目的

enqueue バッチ・controlHook が利用する **taskIndex** サブコレクションの Firestore ルールを確認し、enqueue 用クエリに必要なインデックスが揃っていることを検証する。

- modification_list 9.1, 9.2 に基づく
- Step 2 で taskIndex ルールは追加済み。Step 4/5 でインデックスも追加済みの見込み。本ステップで**現状確認と不足の有無**を整理する

### 1.2 スコープ

| 種別 | 対象 |
|------|------|
| 確認・必要に応じて修正 | `firestore.rules`（taskIndex サブコレクション） |
| 確認・必要に応じて追加 | `firestore.indexes.json`（enqueue クエリ用） |

**一次情報**：本 changeSpec が Step 9 の正式仕様。modification_list 9 との齟齬がある場合は本 changeSpec を優先する。

---

## 2. 現状

### 2.1 taskIndex ルール（Step 2 で追加済み）

**パス**：`scheduledTournaments/{tournamentId}/taskIndex/{taskType}`

**重要**：ルート直下の `/taskIndex/*` ではなく、`scheduledTournaments` の**内側**にネストされている必要がある。誤った書き方の例：
```javascript
// NG: ルート直下の /taskIndex になる
match /taskIndex/{taskType} { ... }
```

**正しい構造**（推奨。親 match の内側にネスト）：
```javascript
match /scheduledTournaments/{tournamentId} {
  // ... 他のサブコレクション ...
  match /taskIndex/{taskType} {
    allow read, write: if false;
  }
}
```

Step 2 で既に正しく入れているなら、Step 9 では**この構造になっていることを確認**する。

| 項目 | 内容 |
|------|------|
| read | クライアントからの read を禁止（server-only） |
| write | クライアントからの write を禁止 |
| Cloud Functions | Admin SDK 使用のためルールの影響を受けない。enqueueTournamentTasksCore・controlHook は問題なく読み書き可能 |
| docID | taskType（startTournament, closeRegistration）と一致 |

**方針**：taskIndex は内部台帳であり、クライアント非公開とする。read: false, write: false を維持する。将来的に管理画面で failed タスク一覧を表示する必要が生じた場合、条件付き read（例：admin のみ）を追加するステップを検討する。

### 2.2 enqueue クエリ（enqueueTournamentTasksCore）

```javascript
db.collection('scheduledTournaments')
  .where('status', '==', 'scheduled')
  .where('startAt', '>=', rangeStartTs)
  .where('startAt', '<', rangeEndTs)
  .orderBy('startAt')
  .limit(BATCH_LIMIT)
```

**オプション**（Callable から storeId / tenantId を渡した場合）：
- `where('storeId', '==', options.storeId)`
- `where('tenantId', '==', options.tenantId)`

### 2.3 必要な複合インデックス

| クエリパターン | fields の並び（等価→範囲/orderBy） | 既存インデックス |
|----------------|-------------------------------------|------------------|
| status + startAt 範囲 + orderBy startAt | status ASC, startAt ASC | 要確認 |
| status + storeId + startAt 範囲 + orderBy startAt | status ASC, storeId ASC, startAt ASC | 要確認 |
| status + storeId + tenantId + startAt 範囲 + orderBy startAt | status ASC, storeId ASC, tenantId ASC, startAt ASC | 要確認 |

Firestore の複合インデックスでは、等価フィルタを先に、範囲フィルタ・orderBy を後に配置する必要がある。

---

## 3. 変更内容

### 3.1 firestore.rules

| 種別 | 内容 |
|------|------|
| 確認 | taskIndex のルールが `match /scheduledTournaments/{tournamentId}` の**内側**にネストされ、read: false, write: false であること |
| 修正 | コメントを補足し、意図（内部台帳・クライアント非公開）を明記する。ルール本体の変更は不要の見込み |
| オプション | 将来的に管理画面で taskIndex を読む必要が生じた場合、`read: if request.auth != null && isAdmin(request.auth.uid)` 等の条件付き read を検討 |

### 3.2 firestore.indexes.json

| 種別 | 内容 |
|------|------|
| 確認 | enqueue クエリの各パターンに対応するインデックスが存在するか確認 |
| 追加 | 不足しているインデックスがあれば追加。既存で賄える場合は変更不要 |

**方針の明記**（誤解防止のため）：
- **クエリ対象**はトップコレクション `scheduledTournaments`（`db.collection('scheduledTournaments')`）
- indexes.json の `collectionGroup` は名前が同じなだけで、**`queryScope: "COLLECTION"`** を使うことが重要
- **`COLLECTION_GROUP` は使わない**（サブコレクション横断クエリ用であり、今回のクエリとズレる）

**インデックス確認手順**：
1. `firestore.indexes.json` 内の scheduledTournaments 関連インデックスを一覧化
2. 上記 3 パターンと照合
3. 不足があれば `collectionGroup: "scheduledTournaments"`, `queryScope: "COLLECTION"` で追加

**fields の並び**（Firestore は等価フィルタ → 範囲/orderBy の順が必要。事故防止のため固定）：
| パターン | fields |
|----------|--------|
| status + startAt | status ASC, startAt ASC |
| status + storeId + startAt | status ASC, storeId ASC, startAt ASC |
| status + storeId + tenantId + startAt | status ASC, storeId ASC, tenantId ASC, startAt ASC |

### 3.3 既存インデックスとの照合結果（事前確認）

| クエリパターン | 必要 | 既存インデックス |
|----------------|------|------------------|
| status + startAt | status ASC, startAt ASC | ✓（Step4/5 で追加済みの前提。実ファイルで再確認する） |
| status + storeId + startAt | status ASC, storeId ASC, startAt ASC | ✓（同上） |
| status + storeId + tenantId + startAt | status ASC, storeId ASC, tenantId ASC, startAt ASC | ✓（同上） |

→ 不足なしの見込み。実装時に実ファイルを確認する。

---

## 4. 確認観点

| # | 観点 | 期待結果 |
|---|------|----------|
| 1 | taskIndex ルール | `match /scheduledTournaments/{tournamentId}` の内側に taskIndex がネストされ、read: false, write: false |
| 2 | コメント | taskIndex の意図（内部台帳・Cloud Functions 専用）がルール内に明記されている |
| 3 | インデックス | status + startAt のクエリが実行可能（既存インデックスで賄える、または追加済み） |
| 4 | インデックス | status + storeId + startAt のクエリが実行可能 |
| 5 | インデックス | status + storeId + tenantId + startAt のクエリが実行可能 |
| 6 | デプロイ | `firebase deploy --only firestore:rules` および `firebase deploy --only firestore:indexes` がエラーなく完了する（任意） |

---

## 5. チェックリスト

- [ ] firestore.rules の taskIndex ルールを確認（scheduledTournaments 内側にネスト・read: false, write: false）
- [ ] taskIndex のコメントを補足（必要に応じて）
- [ ] firestore.indexes.json の scheduledTournaments インデックスを確認
- [ ] 不足インデックスがあれば追加
- [ ] 重複インデックスがないことを確認
- [ ] （任意）firestore rules / indexes をデプロイし、エラーがないことを確認
