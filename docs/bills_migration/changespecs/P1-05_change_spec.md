# ChangeSpec（P1-05）

## 目的 / 関連文書
- **目的**: トーナメント参加・リバイ・アドオン系callable（`registerForTournament.ts`, `bustAndReentry.ts`, `addon.ts`）を `/bills/{billId}/tournaments/{tplId}` upsert へ変更し、`todaysBills.tournaments` への直接更新を廃止する。必要な更新は `recordTournamentAction` ヘルパAPI内のDualWriteに集約する。
- **参照**: 
  - `api_contract.md` §2.5 `recordTournamentAction`（予定）
  - `helper_api_plan.md` §2 整合ポイントと責務分担（`recordTournamentAction`）
  - `schema_plan.md` `/bills/{billId}/tournaments/{tplId}` スキーマ
  - `modification_plan.md` P1-05行

## 変更概要（What）

### 新規ファイル
- `functions/src/helpers/billsApi/recordTournamentAction.ts`: トーナメントアクション記録ヘルパAPI
- `functions/__tests__/helpers/billsApi/recordTournamentAction.spec.ts`: 単体・統合テスト

### 更新ファイル
- `functions/src/callables/registerForTournament.ts`: `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`recordTournamentAction` ヘルパAPIを使用して `/bills/{billId}/tournaments/{tplId}` にエントリー情報をupsert。`todaysBills.tournaments` への直接更新を削除。
- `functions/src/callables/bustAndReentry.ts`: `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`recordTournamentAction` ヘルパAPIを使用して `/bills/{billId}/tournaments/{tplId}` の `reentryCount` をインクリメント。`todaysBills.tournaments` への直接更新を削除。
- `functions/src/callables/addon.ts`: `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`recordTournamentAction` ヘルパAPIを使用して `/bills/{billId}/tournaments/{tplId}` の `addonCount` をインクリメント。`todaysBills.tournaments` への直接更新を削除。
- `functions/src/callables/bulkAddon.ts`: 一括アドオン処理でも同様に `recordTournamentAction` を使用（各ユーザーごとに呼び出し）。
- `functions/src/helpers/billsApi/dualWrite.ts`: `legacyRecordTournamentActionUpdate` 関数を追加（DualWrite用）
- `functions/src/helpers/billsApi/index.ts`: `recordTournamentAction` をエクスポート

### scheduledTournaments への書き込み前提
- `registerForTournament` / `bustAndReentry` / `addon` による `scheduledTournaments/{tournamentId}` 配下への書き込み（`views/main`, `tablesSeat/waiting`, `views/usersList` の各更新内容とフィールド構造）は、従来どおり維持する。本ChangeSpecではこれらの書き込み構造を変更しない。

### 呼び出し元影響範囲
- **Flutter側**: 変更なし（既存のcallable呼び出しを維持）
- **Functions側**: 
  - `registerForTournament` → `activeStays/{userId}` から `billId` 取得 → `recordTournamentAction(action: 'entry')` 呼び出し
  - `bustAndReentry` → `activeStays/{userId}` から `billId` 取得 → `recordTournamentAction(action: 'reentry')` 呼び出し
  - `addon` → `activeStays/{userId}` から `billId` 取得 → `recordTournamentAction(action: 'addon')` 呼び出し
  - `bulkAddon` → 各ユーザーの `activeStays/{userId}` から `billId` 取得 → `recordTournamentAction(action: 'addon')` 呼び出し

## 実装詳細（How）

### 書込み先
- `/bills/{billId}/tournaments/{tplId}`: トーナメント情報をupsert（`templateId` をdocIDとして使用）
  - `action: 'entry'` の場合: `entryCount: 1`, `entryFeeIncl`, `registeredAt`, `templateName`, `templateId`, `startAt` を設定
  - `action: 'reentry'` の場合: `reentryCount` をインクリメント、`reentryFeeIncl`, `lastReentryAt` を更新
  - `action: 'addon'` の場合: `addonCount` をインクリメント、`addonFeeIncl`, `lastAddonAt` を更新
- `/bills/{billId}.updatedAt`: 親ドキュメントの `updatedAt` を更新（**トランザクション内または単一updateで完結**）
- `/todaysBills/{billId}.tournaments`: DualWrite（フラグON時、billsへの更新完了後にベストエフォートで実行）

### 冪等性
- **idempotencyKey**: 必須（形式: `${billId}:recordTournamentAction:${action}:${clientNonce}`）
- **保存先**: `/bills/{billId}/idempotency/{key}` (TTL: 48h)
- **動作**: 
  - 同一 `idempotencyKey` で再送された場合、既存の `/bills/{billId}/tournaments/{tplId}` を返却（`reused: true`）
  - `requestHash` を保存し、payload不一致時は `failed-precondition` を返却
  - リプレイ時は副作用なし（`updatedAt` を変更しない）

### デュアルライト（最小複写内容）
- **フラグ**: `WRITE_TODAYS_BILLS_IN_PARALLEL`
- **実行タイミング**: billsへの更新が完了したあとに、dualWrite.tsのlegacyRecordTournamentActionUpdateでtodaysBillsをベストエフォートで更新する。失敗しても recordTournamentAction の結果は成功のままとする。
- **複写対象**: `/todaysBills/{billId}.tournaments` マップ（オブジェクト）に該当要素を追加/更新
  - 旧スキーマに合わせた形式で追加（`templateId`, `templateName`, `entryFee`, `reentryFee`, `addonFee`, `entryCount`, `reentryCount`, `addonCount`, `registeredAt`, `lastReentryAt`, `lastAddonAt`, `startAt` など）
  - `tournaments` は `{ "<tplId>": { ... } }` というマップ形式で、該当 `tplId` のエントリをupsertする
  - 金額再計算（`totalPrice` 更新）は旧で実施しない（SSoTは `bills`）
- **失敗時**: throw せず warning ログに留める（`bills` への書込み結果をロールバックしない、再試行もしない）

### 権限境界（Functions/Client）
- **Client → Functions**: 
  - `registerForTournament`: `tournamentId`（`userId` は `request.auth.uid` から取得）
  - `bustAndReentry`: `tournamentId`, `userId`, `tableId`, `seatNumber`
  - `addon`: `tournamentId`, `userId`, `pokerName`
- **Functions内部 → recordTournamentAction**: 
  - **callable側の責務**:
    - `activeStays/{userId}` が存在することを検証する（存在しない場合はエラー）
    - `activeStays/{userId}.billId` から `billId` を取得する（未設定ならエラー）
  - `scheduledTournaments/{tournamentId}` からトーナメント情報（`templateId`, `templateName`, `entryFee`, `reentryFee`, `addonFee`, `startAt` など）を取得
  - アクションごとに次を組み立てて `recordTournamentAction` に渡す:
    - `billId`（`activeStays/{userId}.billId` から取得）、`templateId`, `action` (`'entry'` | `'reentry'` | `'addon'`), `templateName`, `entryFeeIncl`, `reentryFeeIncl`, `addonFeeIncl`, `startAt`, `idempotencyKey`, `requestHash` など

### 競合解決
- **LWW**: `/bills/{billId}/tournaments/{tplId}` はupsert（存在しない場合は作成、存在する場合はマージ）で、最終値を採用
- **カウンター更新**: `entryCount`, `reentryCount`, `addonCount` はトランザクション内で現在値を読み取り、インクリメントして書き込む（競合時はトランザクション再試行）

### ログ/メトリクス
- **構造化ログ**: `op: 'recordTournamentAction'`, `billId`, `templateId`, `action`, `idempKey`, `attempt`, `result(ok|reused|fail)`, `code`, `reason`, `requestHash8`
- **メトリクス**: `bills.recordTournamentAction.duration_ms`, `bills.recordTournamentAction.retry_count`, `dualwrite.recordTournamentAction.error_count`

### 例外（HttpsErrorマッピング）
- `invalid-argument`: `billId`, `templateId`, `action`, `idempotencyKey` が未指定、または `action` が `'entry'` | `'reentry'` | `'addon'` 以外
- `not-found`: 
  - `bills/{billId}` が存在しない
  - `activeStays/{userId}` が存在しない（トナメ系callable側の責務として検知し、成功レスポンスにはしない）
- `failed-precondition`: 
  - `bills/{billId}.status` が `'settling'` | `'settled'` | `'voided'` の場合
  - `activeStays/{userId}` は存在するが `billId` が未設定の場合（データ不整合）
  - 同一 `idempotencyKey` で `requestHash` が不一致の場合
  - `action: 'reentry'` で `maxReentriesPerPlayer` 制限に達している場合
  - `action: 'addon'` で `isAddon: false` の場合
- `internal`: 予期せぬエラー

**重要**: `activeStays/{userId}` がない、または `billId` が空の状態で `recordTournamentAction` を進めることは絶対にない。トナメ系callable側で必ず検証し、エラーとして返す。

## 仕様差分（Before→After）

### Before（現状）
```
1. todaysBills から userId でクエリして billId を取得
2. todaysBills.tournaments[tournamentId] に情報を追加/更新
3. todaysBills.totalPrice に料金を加算
4. scheduledTournaments の views/main, tablesSeat/waiting などを更新
```

### After（新仕様）
```
1. activeStays/{userId} から billId を取得（存在チェックは本callable側の責務）
2. scheduledTournaments/{tournamentId} からトーナメント情報を取得
3. recordTournamentAction ヘルパAPIを呼び出し:
   - /bills/{billId}/tournaments/{tplId} にupsert
   - idempotencyKey で冪等性管理
   - DualWrite: todaysBills.tournaments をベストエフォートで更新（totalPrice は更新しない）
4. scheduledTournaments の views/main, tablesSeat/waiting などを更新（従来どおり）
```

### Firestoreドキュメント例

#### Before（todaysBills）
```json
{
  "userId": "user_001",
  "status": "open",
  "tournaments": {
    "tournament_001": {
      "templateId": "template_001",
      "templateName": "トーナメントA",
      "entryFee": 1000,
      "reentryFee": 500,
      "addonFee": 300,
      "entryCount": 1,
      "reentryCount": 0,
      "addonCount": 0,
      "registeredAt": "2025-11-25T10:00:00Z",
      "lastReentryAt": null,
      "lastAddonAt": null,
      "startAt": "2025-11-25T12:00:00Z"
    }
  },
  "totalPrice": 1000
}
```

#### After（bills + tournaments サブコレ）
```json
// /bills/bill_001
{
  "businessDate": "2025-11-25",
  "status": "open",
  "party": {
    "userId": "user_001",
    "pokerName": "テスト太郎"
  },
  "updatedAt": "2025-11-25T10:00:00Z"
}

// /bills/bill_001/tournaments/template_001
{
  "templateId": "template_001",
  "templateName": "トーナメントA",
  "entryFeeIncl": 1000,
  "entryCount": 1,
  "reentryCount": 0,
  "reentryFeeIncl": 500,
  "addonCount": 0,
  "addonFeeIncl": 300,
  "registeredAt": "2025-11-25T10:00:00Z",
  "startAt": "2025-11-25T12:00:00Z",
  "lastReentryAt": null,
  "lastAddonAt": null,
  "pointsAwarded": null
}
```

## テスト

### 単体テスト（recordTournamentAction.spec.ts）
- **happy path**: 
  - `action: 'entry'` で `/bills/{billId}/tournaments/{tplId}` が作成されること
  - `action: 'reentry'` で `reentryCount` がインクリメントされること
  - `action: 'addon'` で `addonCount` がインクリメントされること
- **invalid-argument**: `billId`, `templateId`, `action`, `idempotencyKey` が未指定、または `action` が不正
- **not-found**: `bills/{billId}` が存在しない
- **failed-precondition**: 
  - `bills/{billId}.status` が `'settling'` | `'settled'` | `'voided'` の場合
  - 同一 `idempotencyKey` で `requestHash` が不一致の場合
- **idempotent-replay**: 同一 `idempotencyKey` で再送時、既存docを返却（`reused: true`）、`updatedAt` が変更されないこと

**注意**: `activeStays/{userId}` の存在チェックと `billId` の取得は、トナメ系callable側の責務として実装される。`recordTournamentAction` ヘルパAPIは `billId` が既に確定している前提で動作する。

### 統合テスト（DualWrite ON/OFF）
- **DualWrite ON**: `todaysBills.tournaments` が更新されること（`totalPrice` は更新されない）
- **DualWrite OFF**: `todaysBills.tournaments` が更新されないこと
- **DualWrite失敗**: `bills` への書込みは成功し、`todaysBills` への書込み失敗はwarningログのみ

### 統合テスト（callable側）
- **registerForTournament.spec.ts**: 
  - `activeStays/{userId}` から `billId` を取得し、`recordTournamentAction(action: 'entry')` を呼び出すこと
  - `activeStays/{userId}` が存在しない場合、エラーが返ること
  - `activeStays/{userId}.billId` が未設定の場合、エラーが返ること
  - `scheduledTournaments` の更新が正しく行われること
  - `todaysBills.tournaments` への直接更新が削除されていること
- **bustAndReentry.spec.ts**: 
  - `activeStays/{userId}` から `billId` を取得し、`recordTournamentAction(action: 'reentry')` を呼び出すこと
  - `activeStays/{userId}` が存在しない場合、エラーが返ること
  - `activeStays/{userId}.billId` が未設定の場合、エラーが返ること
  - `reentryCount` がインクリメントされること
  - `maxReentriesPerPlayer` 制限チェックが機能すること
- **addon.spec.ts**: 
  - `activeStays/{userId}` から `billId` を取得し、`recordTournamentAction(action: 'addon')` を呼び出すこと
  - `activeStays/{userId}` が存在しない場合、エラーが返ること
  - `activeStays/{userId}.billId` が未設定の場合、エラーが返ること
  - `addonCount` がインクリメントされること
  - `isAddon: false` の場合にエラーが返ること

### 手動チェック（3手順以内）
1. `registerForTournament` → `/bills/{billId}/tournaments/{tplId}` にエントリー情報が作成される
2. `bustAndReentry` → `/bills/{billId}/tournaments/{tplId}` の `reentryCount` がインクリメントされる
3. 同一 `idempotencyKey` 再送は副作用なし（`reused: true`）

## ドキュメント更新
- `README.md`: P1-05完了を追記（概要1〜3行）
- `modification_plan.md`: P1-05状態を「完了」に更新、仕様差分1行を追記
- `changelog.md`: YYYY-MM-DD: P1-05要約を追記
- `test_plan.md`: テストケース追加（`recordTournamentAction.spec.ts`, `registerForTournament.spec.ts`, `bustAndReentry.spec.ts`, `addon.spec.ts`）
- `api_contract.md`: §2.5 `recordTournamentAction` を追加（Request/Response型定義、エラーコード、冪等性契約）

## P1-05 で必ずやること（スコープ内）
- `recordTournamentAction` ヘルパの仕様確定（上記 1〜3 を反映）
- `/bills/{billId}/tournaments/{tplId}` のフィールド構成（`entryFeeIncl`, `reentryFeeIncl`, `addonFeeIncl` 等）の確定
- `todaysBills.tournaments` への DualWrite 仕様（最小複写・金額再計算なし）の確定
- トナメ系callableが `activeStays` 起点になるという前提の明文化

## Out of Scope（P1-05のスコープ外）
- ポイント付与や賞金計上は別API（`awardTournamentResult`）で扱う
- Flutter側の表示・操作要件はP1-09（読み取り（Flutter））で対応
- 既存データのバッチ移行（必要であれば別Phaseで扱う）
- `scheduledTournaments` への書き込み構造の変更は行わない（従来どおり維持）

