# スキーマ最終確定 - 変更差分サマリ

_最終更新: 2025-11-10 (JST)_

## 概要
フェーズ1実装前に、スキーマ設計を最終確定し、関連ドキュメントを整合させました。

## 変更セット別の修正内容

### 変更セット A: schema_plan.md の更新

#### 1. `/activeStays` の最小スキーマ化
- **残す**: `uid`, `billId`, `pokerName?`, `isActive`, `startedAt`
- **削除**: `table`, `seat`, `updatedAt`, `expiresAt` (TTL)
- **説明追記**: 「会計確定トリガで即時削除＋閉店時 callable でクリーンアップ、TTL 不使用」を明記

#### 2. `/bills` 親の責務修正
- **businessDate**: Functions 確定（`calcBusinessDate`）。クライアントは提案値のみ。
- **updatedAt**: Functions 専任。冪等リプレイ時は更新しない。
- **place.***: LWW（`serverTimestamp` 到着順）で最終値採用。

#### 3. 冪等性規約の明記（強調）
- **payments**: 「docID = 冪等キー」。`providerTxnId` がある場合は `paymentId = providerTxnId` を推奨。さらに `idempotencyKey` フィールドが与えられた場合は `providerTxnId` と同値であることをバリデーション。
- **events**: 「docID(eventId) = idempotencyKey」。`/events` は Functions のみ書込。

#### 4. 支払方法キーの表記統一
- `payments.method`, `paymentsSummary.byMethod`, `paymentTotals` のキーは小文字スネークケース（例: `credit_card`, `electronic_money`）

#### 5. SSoT の明記
- 集計/ダッシュボードは Nightly Recalculation の結果を正とする。リアルタイム `balanceDueIncl` は暫定。

#### 6. `/bills/{billId}/tournaments/{tplId}` から `prizeAmountIncl` 削除
- サブコレクション定義から `prizeAmountIncl` フィールドを削除（親ドキュメントの `tournamentsSnapshot` には `prizeAmountTotalIncl` として残す）

### 変更セット B: api_contract.md の整合修正

#### 修正箇所
1. **updatePlace**: LWW(受信serverTimestamp) を明記。`activeStays` は更新しない。
2. **recordPayment**: `providerTxnId` がある場合、`idempotencyKey` と同一値でなければ `invalid-argument` を返す旨を追加。
3. **postEventRefund/Adjustment/Cancel/Reopen**: `/events` は Functions のみ書込、`eventId = idempotencyKey` の原則を太字で明記。
4. **awardTournamentResult**: `prizeAmountIncl` を Request から削除。

### 変更セット C: firestore.rules の更新

#### 修正内容
- 親 `updatedAt` は Functions のみ許可。クライアントは書込禁止（コメントで明記）。
- `/events` は Functions 書込のみ。クライアント直書き禁止（コメントで明記）。
- `items/extras/sideGameChips/tournaments/payments` は `status != "settled"` の間のみ書込可を維持（コメントで明記）。
- `activeStays` は Client 書込禁止（create/update/delete 全て Functions のみ）。既に実装済み。

### 変更セット D: firestore.indexes.json の確認/追加

#### 追加したインデックス
1. **bills**: `(businessDate ASC, status ASC, createdAt DESC)`
2. **bills**: `(status ASC, updatedAt DESC)`
3. **bills**: `(party.userId ASC, businessDate DESC)`
4. **collectionGroup(events)**: `(originBusinessDate ASC, createdAt DESC)`

#### 既存インデックス
- **activeStays**: `(isActive, startedAt)` - 既に存在（確認済み）

### 変更セット E: README / changelog の更新

#### README.md
- 「目的」セクションに `activeStays` 最小スキーマ化と TTL 不使用を追記
- 「目的」セクションに SSoT（Nightly Recalculation が正）を追記
- 「運用ガイドライン」に SSoT と `activeStays` 最小化の原則を追記

#### changelog.md
- 本変更の概要と日付を追加

### 変更セット F: 最小テスト追加（test_plan.md）

#### 追加したテスト観点
1. **updatePlace の LWW 挙動**: 複数端末から同時に `bills.place.*` を更新した場合、`serverTimestamp()`（受信時刻）を優先して LWW で競合解決されること。
2. **payments の冪等性**:
   - 同一 `providerTxnId` で二重送信時に二重登録されないこと（docID 一意制約で検出）
   - `providerTxnId` がある場合、`idempotencyKey` と不一致だと `invalid-argument` になること
3. **events の冪等性**: 同一 `eventId`（= `idempotencyKey`）で二重送信しても no-op（前回レスポンス相当）であること。副作用なし、`updatedAt` 変更なし。

## ファイル別変更差分

### schema_plan.md
- `/activeStays` の説明を最小スキーマ化に更新
- `/bills` 親ドキュメントの `businessDate`, `updatedAt`, `place.*` の説明を更新
- `paymentTotals`, `paymentsSummary.byMethod` に小文字スネークケースの注記を追加
- `paymentsSummary.balanceDueIncl` に SSoT の注記を追加
- サブコレクション定義を追加（`payments`, `events`, `tournaments`, `activeStays`）
- `/bills/{billId}/tournaments/{tplId}` から `prizeAmountIncl` を削除

### api_contract.md
- `recordPayment` のエラーセクションに `providerTxnId` と `idempotencyKey` の一致チェックを追加
- `recordPayment` の冪等性セクションに docID = 冪等キーを明記
- `postEventRefund/Adjustment/Cancel/Reopen` の冪等性セクションに `/events` は Functions のみ書込を太字で明記
- `awardTournamentResult` の Request から `prizeAmountIncl` を削除

### firestore.rules
- `bills` コレクションのコメントを更新（親ドキュメントの `updatedAt` 等は Functions 専任、サブコレクションの書込条件を明記）

### firestore.indexes.json
- `bills` の複合インデックスを3つ追加
- `collectionGroup(events)` の複合インデックスを1つ追加

### README.md
- 「目的」セクションに `activeStays` 最小スキーマ化と TTL 不使用を追記
- 「目的」セクションに SSoT（Nightly Recalculation が正）を追記
- 「運用ガイドライン」に SSoT と `activeStays` 最小化の原則を追記

### test_plan.md
- フェーズ0テスト観点に「最小テスト追加（スキーマ確定に伴う）」セクションを追加

### changelog.md
- 本変更の概要と日付を追加

## 主要抜粋（追加/変更したテキストブロック）

### schema_plan.md
```markdown
- `activeStays` は滞在中ユーザーの一覧管理専用。**最小スキーマ**（`uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ）。会計確定トリガで即時削除＋閉店時 callable でクリーンアップ（**TTL は使用しない**）。

| 識別 | businessDate | string (YYYY-MM-DD JST) | 必須 | **Functions** | 入店時 | 売上の帰属日。**Functions が `calcBusinessDate` で確定**。クライアントは提案値を送るのみ。
|  | updatedAt | timestamp | 必須 | **Functions 専任** | 各更新 | 最終更新時刻。**冪等リプレイ時は更新しない**。
|  | place.table | string \| null | 任意 | Client | 滞在中 | 着席テーブル。**LWW（serverTimestamp 到着順）で最終値採用**。
|  | place.seat | number \| null | 任意 | Client | 滞在中 | 席番号。**LWW（serverTimestamp 到着順）で最終値採用**。

|  | paymentTotals | map<string,number> | 必須 | Functions | 確定時 + イベント | 支払方法別合計。**キーは小文字スネークケース**（例: `credit_card`, `electronic_money`）。

|  | paymentsSummary.balanceDueIncl | number | 必須 | Functions | 支払い処理時 | 未収額。**集計/ダッシュボードは Nightly Recalculation の結果を正とする。リアルタイム値は暫定**。
|  | paymentsSummary.byMethod | map<string,number> | 任意 | Functions | 支払い処理時 | 方式別受領額。**キーは小文字スネークケース**（例: `credit_card`, `electronic_money`）。

### `/bills/{billId}/payments/{paymentId}`
| `paymentId` | string | 必須 | Functions | **docID = 冪等キー**。`providerTxnId` がある場合は `paymentId = providerTxnId` を推奨。`idempotencyKey` フィールドが与えられた場合は `providerTxnId` と同値であることをバリデーション。

### `/bills/{billId}/events/{eventId}`
| `eventId` | string | 必須 | **Functions のみ** | **docID(eventId) = idempotencyKey**。Functions のみ書込。クライアント直書き禁止。

**注意**: `prizeAmountIncl` は不要（削除済み）。
```

### api_contract.md
```markdown
**エラー**:
- `invalid-argument`: 
  - 必須フィールド不足、`amountIncl <= 0`、許容リスト外の `method`
  - **`providerTxnId` がある場合、`idempotencyKey` と同一値でなければ `invalid-argument` を返す**

**冪等性**: 
- **`paymentId = providerTxnId`（存在しない場合は nonce）。docID = 冪等キー**。

**冪等性**: 
- 保存先: `/bills/{billId}/events/{eventId}`（**`eventId = idempotencyKey`**。履歴として保持、TTLなし）
- **`/events` は Functions のみ書込。クライアント直書き禁止。**
```

### firestore.rules
```firestore
// bills コレクション（新スキーマ）
match /bills/{billId} {
  // 読み取り: 認証済みユーザーは全員可（開発用：全許可）
  allow read: if true;
  // 書き込み: Functions のみ許可
  // 親ドキュメントの updatedAt, amounts, categoryBreakdown, paymentsSummary, postEvents は Functions 専任
  // クライアントは status, place.* のみ更新可能（将来実装）
  allow write: if false;
  
  // サブコレクション
  // items, extras, sideGameChips, tournaments, payments: status != "settled" の間のみ書込可（Functions 経由）
  // events: Functions のみ書込（クライアント直書き禁止）
  match /{subcollection}/{subId} {
    // 読み取り: 認証済みユーザーは全員可（開発用：全許可）
    allow read: if true;
    // 書き込み: Functions のみ許可
    allow write: if false;
  }
}
```

### firestore.indexes.json
```json
{
  "collectionGroup": "bills",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "businessDate", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "bills",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "bills",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "party.userId", "order": "ASCENDING" },
    { "fieldPath": "businessDate", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "events",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "originBusinessDate", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

### README.md
```markdown
- 滞在管理データを `activeStays` で分離し、営業中の読み取りコストを削減する。**`activeStays` は最小スキーマ**（`uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ）。**TTL は使用しない**（会計確定トリガで即時削除＋閉店時 callable でクリーンアップ）。
- **集計/ダッシュボードは Nightly Recalculation の結果を正（SSoT）とする**。リアルタイム `balanceDueIncl` は暫定値。

- **SSoT（Single Source of Truth）**: 集計/ダッシュボードは **Nightly Recalculation** の結果を正とする。リアルタイム値は暫定。
- **`activeStays` 最小化**: 最小スキーマ（`uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ）。**TTL 不使用**（会計確定トリガで即時削除＋閉店時 callable でクリーンアップ）。
```

### test_plan.md
```markdown
### 最小テスト追加（スキーマ確定に伴う）
- **updatePlace の LWW 挙動**: 複数端末から同時に `bills.place.*` を更新した場合、`serverTimestamp()`（受信時刻）を優先して LWW で競合解決されること。ユニットテストで検証。
- **payments の冪等性**:
  - 同一 `providerTxnId` で二重送信時に二重登録されないこと（docID 一意制約で検出）。
  - `providerTxnId` がある場合、`idempotencyKey` と不一致だと `invalid-argument` になること。
- **events の冪等性**: 同一 `eventId`（= `idempotencyKey`）で二重送信しても no-op（前回レスポンス相当）であること。副作用なし、`updatedAt` 変更なし。
```

## 規約と矛盾する既存文の確認

### 確認結果
- **矛盾なし**: すべてのドキュメントで整合性を確認済み
- **用語統一**: "Nightly Recalculation" に統一済み（"Reconciliation" は使用していない）
- **SSoT の明記**: `schema_plan.md`, `api_contract.md`, `README.md`, `analytics_plan.md` で一貫して記載

## コミットメッセージ案

```
feat(schema): finalize bills v1.3 — activeStays minimal, Functions-only updatedAt, idempotent docIDs for payments/events, snake_case methods, SSoT via nightly

- activeStays: 最小スキーマ化（table/seat/updatedAt/expiresAt削除）、TTL不使用
- bills親: businessDate/updatedAtはFunctions専任、place.*はLWW
- 冪等性: payments/eventsのdocID=冪等キーを明記、providerTxnIdとidempotencyKeyの一致チェック追加
- 支払方法キー: 小文字スネークケースに統一
- SSoT: Nightly Recalculationの結果を正とする旨を明記
- tournaments/{tplId}: prizeAmountIncl削除
- インデックス: bills 3件、collectionGroup(events) 1件を追加
- テスト: updatePlace LWW、payments/events冪等性の最小テスト観点を追加
```

## 影響範囲

### 修正したファイル
1. `docs/bills_migration/schema_plan.md`
2. `docs/bills_migration/api_contract.md`
3. `firestore.rules`
4. `firestore.indexes.json`
5. `docs/bills_migration/README.md`
6. `docs/bills_migration/test_plan.md`
7. `docs/bills_migration/changelog.md`

### 確認済み（修正不要）
- `docs/bills_migration/helper_api_plan.md`: 既に適切な記載あり
- `docs/bills_migration/analytics_plan.md`: 既に適切な記載あり
- `docs/bills_migration/active_stays_plan.md`: 既に適切な記載あり
- `docs/bills_migration/tools_and_operations_plan.md`: 既に適切な記載あり

## 次のステップ
- フェーズ1実装時に、本スキーマ定義に基づいて実装を進める
- 実装時は `modification_plan.md` の「フェーズ1 実装ポリシー」を必ず確認すること

