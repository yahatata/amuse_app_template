# ChangeSpec（P1-04）

## 目的 / 関連文書
- **目的**: 座席管理系callable（`reseatAllPlayers.ts`, `assignSeatToPlayer.ts`, `bustAndExit.ts`）を `activeStays` 起点に再設計し、`updatePlace` ヘルパAPIを使用して `bills.place` を更新する。座席管理系callableから `todaysBills.currentTable`/`currentSeat` を直接更新するのを廃止し、必要な更新は `updatePlace` ヘルパAPI内のDualWriteに集約する。
- **参照**: 
  - `api_contract.md` §2.3 `updatePlace`
  - `helper_api_plan.md` §10 API定義一覧（`updatePlace`）
  - `schema_plan.md` `/bills/{billId}.place.*` スキーマ
  - `active_stays_plan.md` §2.2 更新（座席移動）
  - `modification_plan.md` P1-04行

## 変更概要（What）

### 新規ファイル
- `functions/src/helpers/billsApi/updatePlace.ts`: 座席情報更新ヘルパAPI
- `functions/__tests__/helpers/billsApi/updatePlace.spec.ts`: 単体・統合テスト

### 更新ファイル
- `functions/src/callables/assignSeatToPlayer.ts`: `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`updatePlace` ヘルパAPIを使用して `bills.place` を更新。`todaysBills.currentTable`/`currentSeat` への直接更新を削除。
- `functions/src/callables/reseatAllPlayers.ts`: 複数ユーザーの座席割り当て時に、各ユーザーの `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`updatePlace` ヘルパAPIを使用して `bills.place` を更新。`todaysBills.currentTable`/`currentSeat` への直接更新を削除。**注意**: `scheduledTournaments` の更新は1つのトランザクションで完了させ、その後トランザクション外で各ユーザーごとに `updatePlace` を逐次呼び出す（ネストトランザクションを避ける）。
- `functions/src/callables/bustAndExit.ts`: 退席時に `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`updatePlace` ヘルパAPIを使用して `bills.place.table`/`bills.place.seat` を `null` に更新。`todaysBills.currentTable`/`currentSeat` への直接更新を削除。

### scheduledTournaments への書き込み前提
- `assignSeatToPlayer` / `reseatAllPlayers` / `bustAndExit` による `scheduledTournaments/{tournamentId}` 配下への書き込み（`tablesSeat/{tableId}`, `tablesSeat/waiting`, `tablesSeat/busted`, `views/main` の各更新内容とフィールド構造）は、従来どおり維持する。本ChangeSpecではこれらの書き込み構造を変更しない。
- `functions/src/helpers/billsApi/dualWrite.ts`: `legacyUpdatePlaceUpdate` 関数を追加（DualWrite用）
- `functions/src/helpers/billsApi/index.ts`: `updatePlace` をエクスポート

### 呼び出し元影響範囲
- **Flutter側**: 変更なし（既存のcallable呼び出しを維持）
- **Functions側**: 
  - `assignSeatToPlayer` → `activeStays/{userId}` から `billId` 取得 → `updatePlace` 呼び出し
  - `reseatAllPlayers` → 各ユーザーの `activeStays/{userId}` から `billId` 取得 → `updatePlace` 呼び出し
  - `bustAndExit` → `activeStays/{userId}` から `billId` 取得 → `updatePlace` 呼び出し（`table: null, seat: null`）

## 実装詳細（How）

### 書込み先
- `/bills/{billId}.place.table`: テーブルID（`string | null`）
- `/bills/{billId}.place.seat`: 席番号（`number | null`）
- `/bills/{billId}.updatedAt`: 親ドキュメントの `updatedAt` を更新（**トランザクション内または単一updateで完結**）
- `/todaysBills/{billId}.currentTable`: DualWrite（フラグON時、billsへの更新完了後にベストエフォートで実行）
- `/todaysBills/{billId}.currentSeat`: DualWrite（フラグON時、billsへの更新完了後にベストエフォートで実行）

### 冪等性
- **idempotencyKey**: 任意（指定しても `/bills/{billId}/idempotency/{key}` には保存しない）
- **動作**: 
  - `updatePlace` は基本的に LWW（Last Write Wins）のみを保証する
  - 同じ `idempotencyKey` で再送されても、特別なハッシュ照合やレスポンス再利用は行わず、通常のLWWとして上書きする
  - `idempotencyKey` が指定されない場合も同様にLWW方式で最終値を採用
- **コスト最適化**: 高頻度で呼ばれるAPIのため、`/idempotency` への書き込みは行わない（入店/会計系API専用の設計方針に従う）

### デュアルライト（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグON時）
- **実行タイミング**: `bills` への更新が完了したあとに、`dualWrite.ts` の `legacyUpdatePlaceUpdate` で `todaysBills` をベストエフォートで更新する
- `/todaysBills/{billId}`: `currentTable`, `currentSeat` を更新
- 失敗時は **throw せず warning ログに留める**（`bills` への書込み結果をロールバックしない、再試行もしない）
- **戻り値・エラー契約**: DualWriteの結果に影響されない。`updatePlace` の戻り値やエラー契約は `bills` への更新結果のみに基づく（`WRITE_TODAYS_BILLS_IN_PARALLEL=false` と同じコントラクト）

### 権限境界（Functions/Client）
- **Client → Functions**: 
  - `assignSeatToPlayer`: `tournamentId`, `userId`, `tableId`, `seatNumber`
  - `reseatAllPlayers`: `tournamentId`, `playerAssignments[]`
  - `bustAndExit`: `tournamentId`, `userId`, `tableId`, `seatNumber`
- **Functions内部（座席管理系callable）**: 
  - `activeStays/{userId}` から `billId` を取得（**存在チェックは座席管理系callable側の責務**）
  - `activeStays/{userId}` が存在しない場合は適切なエラーを返す（`updatePlace` は呼び出さない）
  - **座席表示名（pokerName）の取得**: 座席管理系callableが `scheduledTournaments/{tournamentId}/tablesSeat/{tableId}.seats.*PokerName` を更新する際の表示名（pokerName）は、原則として `activeStays/{userId}.pokerName` を参照し、未設定の場合は `Player_{userId}` をフォールバックとして使用する。`todaysBills` の `pokerName` には依存しない。
- **Functions内部（updatePlaceヘルパAPI）**: 
  - `updatePlace` ヘルパAPIに `billId`, `table`, `seat`, `idempotencyKey`（任意）を渡す
  - `updatePlace` は `bills` レイヤのヘルパAPIであり、`activeStays` を直接は知らない

### 競合解決
- **LWW（Last Write Wins）**: `serverTimestamp()` 到着順で最後に届いた値を採用
- 多端末からの同時更新でも、サーバ受信時刻を基準に最終値が採用される

### ログ/メトリクス
- **構造化ログ**: `op: "updatePlace"`, `billId`, `table`, `seat`, `idempKey`（存在する場合）, `result(ok|fail)`
- **メトリクス**: `bills.updatePlace.duration_ms`, `bills.updatePlace.retry_count`, `dualwrite.updatePlace.error_count`

### 例外（HttpsErrorマッピング）
- `invalid-argument`: `billId` が未指定、`table` または `seat` の型が不正
- `not-found`: `billId` が存在しない（`updatePlace` ヘルパAPI側の責務）
  - **注意**: `activeStays/{userId}` の存在チェックは座席管理系callable側の責務であり、`updatePlace` は `billId` 不存在のみをチェックする
- `failed-precondition`: `status == "settled"` で更新不可

## 仕様差分（Before→After）

### Before（現状）
```
assignSeatToPlayer / reseatAllPlayers / bustAndExit:
1. scheduledTournaments/{tournamentId}/tablesSeat/{tableId} を更新
2. todaysBills をクエリ（userId, status='open'）で取得
   - pokerName を todaysBills.pokerName から取得
3. todaysBills.currentTable / currentSeat を直接更新
```

### After（P1-04）
```
assignSeatToPlayer / reseatAllPlayers / bustAndExit:
1. scheduledTournaments/{tournamentId}/tablesSeat/{tableId} を更新（既存ロジック維持）
   - pokerName を activeStays/{userId}.pokerName から取得（未設定時は Player_{userId} をフォールバック）
   - todaysBills の pokerName には依存しない
2. activeStays/{userId} から billId を取得（存在チェックは本callable側の責務）
3. updatePlace ヘルパAPIを呼び出し:
   - bills/{billId}.place.table を更新（トランザクション内または単一updateで完結）
   - bills/{billId}.place.seat を更新
   - bills/{billId}.updatedAt を更新
   - DualWrite: billsへの更新完了後に、dualWrite.ts の legacyUpdatePlaceUpdate で
     todaysBills/{billId}.currentTable / currentSeat を更新（ベストエフォート）

注意（reseatAllPlayers の場合）:
- scheduledTournaments の更新は1つのトランザクションで完了させる
- そのトランザクション完了後、トランザクション外で各ユーザーごとに
  activeStays/{userId} → billId を取得し、updatePlace を逐次呼び出す
- updatePlace の runTransaction を reseatAllPlayers のトランザクション内から
  呼び出すような「ネストトランザクション」は行わない
```

### Firestoreドキュメント例

#### Before
```json
// todaysBills/{billId}
{
  "userId": "user_001",
  "currentTable": "table_001",
  "currentSeat": 1,
  "status": "open"
}
```

#### After
```json
// bills/{billId}
{
  "party": {
    "userId": "user_001"
  },
  "place": {
    "table": "table_001",
    "seat": 1
  },
  "status": "open",
  "updatedAt": "2025-11-19T10:00:00Z"
}

// activeStays/{userId}
{
  "uid": "user_001",
  "billId": "bill_001",
  "pokerName": "テスト太郎",
  "isActive": true,
  "startedAt": "2025-11-19T09:00:00Z"
}
```

## テスト

### 単体テスト（updatePlace.spec.ts）
- **happy path**: `billId`, `table`, `seat` を指定して正常に更新されること
- **invalid-argument**: `billId` が未指定、`table` または `seat` の型が不正
- **not-found**: `billId` が存在しない
- **failed-precondition**: `status == "settled"` で更新不可
- **LWW動作**: 複数端末から同時に更新した場合、`serverTimestamp()` 到着順で最終値が採用されること
- **idempotencyKey指定時の動作**: `idempotencyKey` を指定しても `/idempotency` には保存されず、通常のLWWとして上書きされること

### 統合テスト（DualWrite ON/OFF）
- **DualWrite ON**: `todaysBills/{billId}.currentTable`/`currentSeat` が更新されること、失敗時も `bills` への書込みは成功すること
- **DualWrite OFF**: `todaysBills` は更新されないこと

### 統合テスト（座席管理系callable）
- **assignSeatToPlayer.spec.ts**:
  - `activeStays/{userId}` から `billId` を取得し、存在チェックを行うこと（本callable側の責務）
  - `activeStays/{userId}` が存在しない場合は適切なエラーを返すこと
  - `updatePlace` を呼び出し、`bills/{billId}.place.table`/`place.seat` が更新されること
  - `todaysBills` への直接更新が削除されていること
- **reseatAllPlayers.spec.ts**:
  - `scheduledTournaments` の更新は1つのトランザクションで完了すること
  - トランザクション完了後、トランザクション外で各ユーザーごとに `activeStays/{userId}` から `billId` を取得し、`updatePlace` を逐次呼び出すこと（ネストトランザクションを避ける）
  - 各ユーザーの `bills/{billId}.place.table`/`place.seat` が更新されること
  - `todaysBills` への直接更新が削除されていること
- **bustAndExit.spec.ts**:
  - `activeStays/{userId}` から `billId` を取得し、存在チェックを行うこと（本callable側の責務）
  - `activeStays/{userId}` が存在しない場合は適切なエラーを返すこと
  - `updatePlace` を呼び出し（`table: null, seat: null`）、`bills/{billId}.place.table`/`place.seat` が `null` に更新されること
  - `todaysBills` への直接更新が削除されていること

### 手動チェック（3手順以内）
1. `assignSeatToPlayer` を呼び出し → `bills/{billId}.place.table`/`place.seat` が更新されることを確認
2. 複数端末から同時に `updatePlace` を呼び出し → LWW方式で最終値が採用されることを確認
3. `bustAndExit` を呼び出し → `bills/{billId}.place.table`/`place.seat` が `null` に更新されることを確認

## ドキュメント更新
- `README.md`: 進捗状況にP1-04完了を追加
- `modification_plan.md`: P1-04の状態を「未着手」→「完了」に変更、仕様差分を追加
- `changelog.md`: P1-04の変更内容を追加
- `test_plan.md`: P1-04のテスト完了を反映

## Out of Scope（P1-04のスコープ外）
- トーナメント関連の処理（`scheduledTournaments` コレクションの操作）は既存ロジックを維持
  - `scheduledTournaments/{tournamentId}/tablesSeat/{tableId}`, `tablesSeat/waiting`, `tablesSeat/busted`, `views/main` への書き込み内容とフィールド構造は変更しない
- `activeStays` のスキーマ変更（最小スキーマを維持、座席情報は保持しない）
- Flutter側のUI変更（既存のcallable呼び出しを維持）

