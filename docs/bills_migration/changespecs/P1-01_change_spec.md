# ChangeSpec（P1-01）

## 目的 / 関連文書
- **目的**: 入店フロー（`manualCheckIn.ts`, `processVisitByQR.ts`）を新スキーマ（`bills` + `activeStays`）に対応させ、デュアルライト制御を導入する。
- **参照**: 
  - `api_contract.md` §2.1 `createBillWithActiveStay`
  - `helper_api_plan.md` §1.2, §3
  - `schema_plan.md` §親ドキュメント, §`/activeStays/{uid}`
  - `active_stays_plan.md` §2.1

## 変更概要（What）

### 新規ファイル
- `functions/src/helpers/billsApi/createBillWithActiveStay.ts`: 入店処理ヘルパAPI
- `functions/src/helpers/billsApi/calcBusinessDate.ts`: 営業日計算ユーティリティ（`resolveBusinessDate` のラッパー）
- `functions/src/helpers/billsApi/dualWrite.ts`: デュアルライト処理ユーティリティ
- `functions/src/helpers/billsApi/index.ts`: エクスポート集約
- `functions/src/helpers/billsApi/types.ts`: 型定義

### 更新ファイル
- `functions/src/userLogin/manualCheckIn.ts`: ヘルパAPI利用に変更
- `functions/src/userLogin/processVisitByQR.ts`: ヘルパAPI利用に変更

### 呼び出し元影響範囲
- **Flutter側**: 変更なし（既存のcallable呼び出しを維持）
- **Functions側**: 
  - `manualCheckIn` → `createBillWithActiveStay` ヘルパ呼び出し
  - `processVisitByQR` → `createBillWithActiveStay` ヘルパ呼び出し

## 実装詳細（How）

### 書込み先
- `/bills/{billId}`: 親ドキュメント作成（**単一トランザクション内で原子的に処理**）
  - `businessDate`: **Functions が `calcBusinessDate(サーバ時刻, STORE_CLOSE_HOUR)` で確定**（クライアント値は完全無視・受理しない）
  - `status`: `'open'`
  - `createdAt`: `serverTimestamp()`
  - `updatedAt`: `serverTimestamp()`（初回作成時のみ、リプレイ時は変更しない）
  - `billId`: クライアント生成UUID（docIDと一致）
  - `party.userId`: 顧客UID（Immutable）
  - `party.pokerName`: 表示名
  - `place.table`: `null`（初期値）
  - `place.seat`: `null`（初期値）
  - `meta.schemaVersion`: `"1.3"`
  - 入店料がある場合: `/bills/{billId}/extras/{extraId}` に追加（トランザクション内）
- `/activeStays/{uid}`: 滞在管理ドキュメント作成（**同一トランザクション内**）
  - `uid`: ドキュメントIDと一致
  - `billId`: 対応する `bills/{billId}`
  - `pokerName`: 表示名
  - `isActive`: `true`
  - `startedAt`: `serverTimestamp()`
- `/bills/{billId}/idempotency/{key}`: 冪等性記録（**同一トランザクション内、TTL: 48h**）
  - `requestHash`: payload の正規化ハッシュ（リプレイ時に一致検証）
  - `expiresAt`: `Timestamp.fromDate(now + 48h)`（TTL対象）
  - `createdAt`: `serverTimestamp()`
- デュアルライト（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグON時、**同一トランザクション内**）:
  - `/todaysBills/{billId}`: **docIDは必ず `billId`**、スケルトン最小複写のみ
    - `status`, `pokerName`, `items(empty)`, `sideGameChip(empty)`, `place`, `date`, `userId`
    - **金額フィールドは書かない**（`totalPrice` 等は含めない）
    - 失敗時は **throw せず warning ログに留める**（`bills` を正とする）

### 冪等性
- **方式**: `/bills/{billId}/idempotency/{key}` で存在チェック（**単一トランザクション内**）
- **キー形式**: `<billId>:createBill:<nonce>`
- **保存先**: `/bills/{billId}/idempotency/{key}`（TTL: 48h, `requestHash` 保持、`expiresAt = now + 48h`）
- **リプレイ時**: 
  - 既存docを返却（`reused: true`）、`updatedAt` は変更しない（副作用なし）
  - **`requestHash` 不一致の場合は `failed-precondition`**（ハッシュ一致検証）

### デュアルライト（最小複写内容）
- **フラグ**: `WRITE_TODAYS_BILLS_IN_PARALLEL`（環境変数または `functions:config`）
- **docID**: `/todaysBills/{billId}`（**必ず `billId` を使用**、ランダムIDは使わない）
- **複写対象**: `status`, `pokerName`, `items(empty)`, `sideGameChip(empty)`, `place`, `date`, `userId`（**スケルトン最小限のみ**）
- **金額フィールド**: **書かない**（`totalPrice` 等は含めない、新 `bills` がSSoT）
- **失敗時**: **throw せず warning ログに留める**（`bills` への書込み結果を正とし、再試行なし）

### 権限境界（Functions/Client）
- **Functions**: `bills` 親ドキュメント、`activeStays`、`idempotency`、`extras`（入店料）の作成、**`businessDate` の確定**（サーバ専任）
- **Client**: `billId`, `userId`, `pokerName`, `idempotencyKey` をリクエストで送信（**`businessDate` は送信しない・受理しない**）

### 競合解決（LWW or なし）
- **重複入店チェック**: `activeStays/{uid}` が既に存在する場合は `failed-precondition`
- **冪等性**: 同一 `idempotencyKey` で再実行時は既存docを返却（副作用なし）

### ログ/メトリクス（出力フィールド）
- **構造化ログ**: 
  - `op: "createBillWithActiveStay"`
  - `billId`, `userId`, `idempKey`, `attempt: 1`, `result: "ok" | "reused" | "fail"`
  - `code`, `reason`, `requestHash8`（ハッシュの先頭8文字）
  - `dualWriteEnabled: boolean`, `dualWriteResult: "success" | "failed" | "skipped"`
- **メトリクス名**: 
  - `bills.op.duration_ms`（処理時間）
  - `bills.op.retry_count`（リトライ回数、今回は0）
  - `dualwrite.error_count`（デュアルライト失敗件数）

### 例外（HttpsErrorマッピング）
- `invalid-argument`: `billId`, `userId`, `idempotencyKey` が未指定
- `failed-precondition`: 
  - 既に `activeStays/{uid}` が存在し `isActive == true` の場合（重複入店）
  - **idempotency の `requestHash` 不一致の場合**（ハッシュ一致検証）
- `internal`: 予期せぬエラー

## 仕様差分（Before→After）

### Before（現状）
```
manualCheckIn / processVisitByQR
  → todaysBills に直接書き込み
  → users/{uid}.isStaying = true に更新
  → visitLogs に記録（processVisitByQR のみ）
```

### After（新仕様）
```
manualCheckIn / processVisitByQR
  → createBillWithActiveStay ヘルパ呼び出し
    → 単一トランザクション内で原子的に処理:
      1. idempotency/{key} 読み → 既存なら replay（requestHash一致検証、不一致なら failed-precondition）
      2. activeStays/{uid} 読み → isActive==true なら failed-precondition
      3. bills/{billId} 作成（businessDate は calcBusinessDate(サーバ時刻, STORE_CLOSE_HOUR) で確定）
      4. activeStays/{uid} 作成
      5. idempotency/{key} 作成（requestHash, expiresAt=now+48h）
      6. extras/{extraId} 作成（入店料がある場合）
      7. todaysBills/{billId} にスケルトン複写（docID=billId、失敗はwarningログ）
  → users/{uid}.isStaying = true に更新（既存ロジック維持、ヘルパ成功後）
  → visitLogs に記録（processVisitByQR のみ、既存ロジック維持、ヘルパ成功後）
```

### Firestoreドキュメント例

#### `/bills/{billId}`（新規作成）
```json
{
  "businessDate": "2025-11-10",
  "status": "open",
  "createdAt": "2025-11-10T12:00:00Z",
  "updatedAt": "2025-11-10T12:00:00Z",
  "billId": "bill_abc123",
  "party": {
    "userId": "user_xyz789",
    "pokerName": "山田太郎"
  },
  "place": {
    "table": null,
    "seat": null
  },
  "meta": {
    "schemaVersion": "1.3"
  }
}
```

#### `/activeStays/{uid}`（新規作成）
```json
{
  "uid": "user_xyz789",
  "billId": "bill_abc123",
  "pokerName": "山田太郎",
  "isActive": true,
  "startedAt": "2025-11-10T12:00:00Z"
}
```

#### `/bills/{billId}/extras/{extraId}`（入店料がある場合）
```json
{
  "name": "入店料",
  "amountIncl": 1000,
  "createdAt": "2025-11-10T12:00:00Z"
}
```

#### `/todaysBills/{billId}`（デュアルライト、フラグON時、**docIDは必ず `billId`**）
```json
{
  "status": "open",
  "pokerName": "山田太郎",
  "items": [],
  "sideGameChip": [],
  "place": {
    "table": null,
    "seat": null
  },
  "date": "2025-11-10",
  "userId": "user_xyz789"
}
```
注意: `totalPrice` 等の金額フィールドは書かない（新 `bills` がSSoT）

## テスト

### 単体（happy/edge/idempotent/permission）
1. **happy path**: 
   - `billId`, `userId`, `pokerName`, `idempotencyKey` を指定して呼び出し
   - `bills/{billId}` と `activeStays/{uid}` が作成されること
   - レスポンスに `success: true`, `billId`, `status: 'open'`, `businessDate` が含まれること
2. **invalid-argument**: 
   - `billId` 未指定 → `invalid-argument`
   - `userId` 未指定 → `invalid-argument`
   - `idempotencyKey` 未指定 → `invalid-argument`
3. **failed-precondition（重複入店）**: 
   - 既に `activeStays/{uid}` が存在する場合 → `failed-precondition`
4. **idempotent-replay**: 
   - 同一 `idempotencyKey` で再実行 → 既存docを返却（`reused: true`）、`updatedAt` は変更されない
5. **idempotent-replay（ハッシュ不一致）**: 
   - 同一 `idempotencyKey` だが payload 差し替え → `failed-precondition`（`requestHash` 不一致）
6. **permission**: 
   - 認証なしでも動作（既存ロジック維持）
7. **businessDate サーバ専任**: 
   - クライアントが `businessDate` を送っても結果に影響しないこと（サーバが `calcBusinessDate(サーバ時刻, STORE_CLOSE_HOUR)` で確定）

### 統合（DualWrite ON/OFF）
1. **DualWrite ON**: 
   - `WRITE_TODAYS_BILLS_IN_PARALLEL=true` で実行
   - `todaysBills/{billId}` にスケルトン複写が作成されること（**docIDは必ず `billId`**）
   - 複写失敗時も `bills` への書込みは成功すること（失敗はwarningログのみ）
2. **DualWrite OFF**: 
   - `WRITE_TODAYS_BILLS_IN_PARALLEL=false` で実行
   - `todaysBills` への複写がスキップされること

### 手動（3手順以内）
1. Flutter アプリから `manualCheckIn` を呼び出し（`loginId`, `pin` を指定）
2. Firestore Console で以下を確認:
   - `/bills/{billId}` が作成されている
   - `/activeStays/{uid}` が作成されている
   - `/bills/{billId}/idempotency/{key}` が作成されている（TTL: 48h）
   - `/todaysBills/{todaysBillsId}` が作成されている（デュアルライトON時）
3. 同一 `idempotencyKey` で再実行 → 既存docを返却（`reused: true`）

## ドキュメント更新
- `README.md`: P1-01 完了を追記（概要1〜3行）
- `modification_plan.md`: P1-01 状態を「完了」に更新、仕様差分1行を追記
- `changelog.md`: `YYYY-MM-DD: P1-01 入店フローを新スキーマ対応、デュアルライト導入` を追記
- `test_plan.md`: フェーズ1テスト観点に「入店フロー（`createBillWithActiveStay`）の冪等性・重複入店チェック・デュアルライト」を追記

