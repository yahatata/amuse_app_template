# ChangeSpec（P1-06）

## 目的 / 関連文書
- **目的**: 
  - `startAccounting` callable を `bills` 正本の `status` / `ops.accountingStarted*` を安全に更新する入口にする。
  - `updateBill` ヘルパAPIを導入し、`businessDate` 変更を拒否（パターンA）しつつ、`status` / 一部 `ops.*` / `meta.*` のような「親ドキュメントの安全なフィールド」だけを更新できるレイヤを用意する。
  - `updateActiveBill` callable を、会計前（`status in {'open','in_progress'}` かつ `ops.accountingStartedAt == null`）のときだけ `/bills/{billId}/items|extras|sideGameChips|tournaments` を編集できる API として再設計する。
  - `updateAccounting.ts` の新スキーマ対応・事後調整API化は P1-06 のスコープ外であり、必ず P1-07 にて実施する。
- **参照**: 
  - `api_contract.md` §2.5 `startAccounting`
  - `helper_api_plan.md` §2 整合ポイントと責務分担（`startAccounting`, `updateBill`）
  - `schema_plan.md` `/bills/{billId}` 親ドキュメントスキーマ
  - `modification_plan.md` P1-06行
  - `functions/__tests__/bills/businessDate.immutability.spec.ts` (P1-02.1でスキップされたテスト)

## 変更概要（What）

### 新規ファイル
- `functions/src/helpers/billsApi/startAccounting.ts`: 会計開始ヘルパAPI（ステータスとops更新のみ）
- `functions/src/helpers/billsApi/updateBill.ts`: 伝票更新ヘルパAPI（`businessDate` 変更拒否を含む、親ドキュメントの安全なフィールドのみ更新）
- `functions/__tests__/helpers/billsApi/startAccounting.spec.ts`: 単体・統合テスト
- `functions/__tests__/helpers/billsApi/updateBill.spec.ts`: 単体・統合テスト

### 更新ファイル
- `functions/src/callables/accounting.ts`:
  - `startAccounting` callable が `startAccounting` ヘルパAPIを呼ぶようにする。
  - status を `'settling'` に遷移し、`ops.accountingStartedAt/By` を設定、親 `updatedAt` を Functions 専任で更新。
  - 支払方法やユーザー残高処理は現状維持（P1-06 のスコープ外）。
  - `todaysBills` への直接更新を廃止し、必要な最小限の dualwrite はヘルパ内でベストエフォート実行。
- `functions/src/callables/updateActiveBill.ts`:
  - 役割を「会計前の明細編集」に限定。
  - `/bills/{billId}` の `items` / `extras` / `sideGameChips` / `tournaments` サブコレクションの編集のみを行うように仕様を書き直す。
  - 既存のリクエストスキーマ（`extraCost`, `tournaments`, `items`, `sideGameChip` の配列/オブジェクト）は維持し、これらをサブコレクションに変換して書き込む。
  - 親フィールド（`businessDate`, `amounts.*`, `categoryBreakdown`, `postEvents.*`, `paymentsSummary.*` など金額サマリ）は一切触らないことを明示。
  - 実行条件は `status in {'open','in_progress'}` かつ `ops.accountingStartedAt == null` のときのみ。その他の状態では `failed-precondition`。
  - `todaysBills` への直接更新を削除（DualWriteは必要に応じてベストエフォート実行）。
- `functions/src/helpers/billsApi/dualWrite.ts`: `legacyStartAccountingUpdate`, `legacyUpdateBillUpdate` 関数を追加（DualWrite用）
- `functions/src/helpers/billsApi/index.ts`: `startAccounting`, `updateBill` をエクスポート
- `functions/__tests__/bills/businessDate.immutability.spec.ts`: skipを解除し、`updateBill` ヘルパAPIの `businessDate` 変更拒否を検証するように修正。
- `functions/src/callables/updateAccounting.ts`:
  - **P1-06 時点では仕様変更しない方針のため、このフェーズではコードを触らない（もしくはコメントで legacy/deprecated と明記する程度）**。
  - 既存 todayBills ベースの挙動を壊さないこと。

### 呼び出し元影響範囲
- **Flutter側**: 変更なし（既存のcallable呼び出しを維持）
- **Functions側**:
  - `accounting.ts` の `startAccounting` callable → `startAccounting` ヘルパAPI呼び出し
  - `updateActiveBill.ts` → `/bills/{billId}` サブコレクション編集（会計前のみ）
  - `updateAccounting.ts` → P1-06 では変更なし（legacy のまま）

## 実装詳細（How）

### 書込み先
- `/bills/{billId}`: 親ドキュメントの `status`, `ops.accountingStartedAt`, `ops.accountingStartedBy`, `updatedAt` を更新（`startAccounting` ヘルパAPI）
- `/bills/{billId}`: 親ドキュメントの安全なフィールドのみ更新（`updateBill` ヘルパAPI）。`status`, `ops.*`（一部）, `meta.*` のみ許可。`businessDate` の変更は拒否。
- `/bills/{billId}/items`, `/bills/{billId}/extras`, `/bills/{billId}/sideGameChips`, `/bills/{billId}/tournaments`: サブコレクションの create/update/delete（`updateActiveBill` callable）
- `/bills/{billId}/idempotency/{key}`: `startAccounting` の冪等性キーを保存 (TTL: 48h, `requestHash` 保持)
- `/todaysBills/{billId}`: DualWrite（フラグON時、billsへの更新完了後にベストエフォートで実行）

### 冪等性
- **`startAccounting`**:
  - `idempotencyKey`: 必須（形式: `${billId}:startAccounting:${clientNonce}`）
  - **保存先**: `/bills/{billId}/idempotency/{key}` (TTL: 48h, `requestHash` 保持)
  - **動作**: 同一 `idempotencyKey` で再送された場合、既存の `startAccounting` 情報を返却（`reused: true`）。`requestHash` 不一致時は `failed-precondition`。
- **`updateBill`**:
  - `idempotencyKey`: 使用しない（LWW方式のため、キーなしで安全）。
  - **保存先**: なし（`/idempotency` コレクションは使用しない）
  - **動作**: LWW（Last Write Wins）方式。最終値を採用。

### デュアルライト
- `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグON時、`bills` への更新完了後に `todaysBills` をベストエフォートで更新。
- `startAccounting` のDualWrite: 旧 `todaysBills.status` のみ更新（`accountingStartedAt` 等は更新しない）。
  - idempotent replay 時は DualWrite をスキップし、完全 no-op を保証（`/idempotency` コレクションを使用するため）。
- `updateBill` のDualWrite: 旧 `todaysBills` の該当フィールド（`status` など）を更新（金額フィールドは更新しない）。
- `updateActiveBill` のDualWrite: 旧 `todaysBills` の `items`, `extraCost`, `tournaments`, `sideGameChip` 配列/オブジェクトを更新（`totalPrice` は更新しない。金額のSSoTは `/bills` 側とする）。
- 失敗時は `bills` への書込み結果を正とし、warningログに記録（再試行しない）。

### 権限境界（Functions/Client）
- Client → Functions: 
  - `startAccounting` callable: `billId`, `idempotencyKey`, `paymentDraft`（支払方法の下書き情報、任意）
  - `updateActiveBill` callable: `billId`, `extraCost`（配列、任意）, `tournaments`（オブジェクト、任意）, `items`（配列、任意）, `sideGameChip`（配列、任意）
- Functions内部 → `startAccounting` ヘルパAPI: `billId`, `idempotencyKey`, `accountingStartedBy`（オペレータUID）, `requestHash`（任意）を渡す
- Functions内部 → `updateBill` ヘルパAPI: `billId`, `updates` (更新フィールドのマップ) を渡す（`idempotencyKey`, `requestHash` は使用しない）

### 競合解決
- `startAccounting`: 冪等性キーによる排他制御。
- `updateBill`: LWW（Last Write Wins）方式。`serverTimestamp()` 到着順で最終値を採用。

### ログ/メトリクス
- 構造化ログ（`op`, `billId`, `idempKey`, `result(ok|reused|fail)`, `code`, `reason`, `requestHash8`, `dualWriteResult`）を出力。
- `dualwrite.error_count` メトリクスでDualWrite失敗を監視。

### 例外（HttpsErrorマッピング）
- `invalid-argument`: 必須フィールド不足、`businessDate` 変更試行（`updateBill` の場合）
- `permission-denied`: 管理者権限不足
- `not-found`: `billId` が存在しない
- `failed-precondition`: 
  - `startAccounting`: `status` が `open`/`in_progress` 以外、`requestHash` 不一致
  - `updateActiveBill`: `status` が `open`/`in_progress` 以外、`ops.accountingStartedAt != null`

### `updateBill` ヘルパAPIの更新許可フィールド
- **許可するフィールド例**:
  - `status`
  - `ops.*`（ただし `ops.accountingStartedAt` は基本的に `startAccounting` の責務に寄せるなど、必要に応じて細かく線引き）
  - `meta.*`
- **更新を拒否するフィールド**:
  - `businessDate`
  - `amounts.*`
  - `categoryBreakdown`
  - `paymentTotals`
  - `itemsSnapshot`
  - `postEvents.*`
  - `paymentsSummary.*`
- `updates.businessDate` が含まれていたら `invalid-argument` を返す（パターンA: update レイヤで拒否）。

## 仕様差分（Before→After）

### Before（現状 - `todaysBills` ベース）
- `functions/src/callables/accounting.ts` の `startAccounting` は `todaysBills` を直接更新し、`paymentMethodsByAmount` の計算やユーザー残高の差し引きも行う。`status` は `open` のまま。
- `functions/src/callables/updateAccounting.ts` は `todaysBills` を直接更新し、`totalPrice` を再計算。`accountingHistory` に修正記録を追加。
- `functions/src/callables/updateActiveBill.ts` は `todaysBills` を直接更新し、`totalPrice` を再計算。
- `businessDate` の不変性は保証されていない。

### After（P1-06 - `bills` ベース）
- `startAccounting` callableは `startAccounting` ヘルパAPIを呼び出す。
  - `startAccounting` ヘルパAPIは `/bills/{billId}` の `status` を `settling` に更新し、`ops.accountingStartedAt` を設定。
  - `todaysBills.status` はDualWriteで更新。
  - 支払方法処理・ユーザー残高差し引きは現状維持（将来のフェーズで `recordPayment` ヘルパに移行予定）。
- `updateActiveBill` callableは会計前の明細編集APIとして再設計される。
  - 既存のリクエストスキーマ（`extraCost`, `tournaments`, `items`, `sideGameChip` の配列/オブジェクト）は維持。
  - リクエストで受け取った配列/オブジェクトを `/bills/{billId}/items`, `/bills/{billId}/extras`, `/bills/{billId}/sideGameChips`, `/bills/{billId}/tournaments` サブコレクションに変換して書き込む（既存のサブコレクションドキュメントは削除してから新規作成、または upsert 方式を採用）。
  - 親フィールド（`businessDate`, `amounts.*`, `categoryBreakdown`, `postEvents.*`, `paymentsSummary.*`）は一切触らない。
  - 実行条件は `status in {'open','in_progress'}` かつ `ops.accountingStartedAt == null` のときのみ。
  - `todaysBills` への直接更新を削除（DualWriteは必要に応じてベストエフォート実行。`items`, `extraCost`, `tournaments`, `sideGameChip` 配列/オブジェクトを更新するが、`totalPrice` は更新しない）。
- `updateAccounting.ts` は **P1-06 時点では todayBills ベースの legacy 挙動を維持し、P1-07 にて新世界版に置き換える**。
- `businessDate` の不変性が `updateBill` ヘルパAPIによって担保される（パターンA）。

## テスト

### 単体テスト（ヘルパAPI側）
- `startAccounting.spec.ts`:
  - happy path（正常な会計開始、status='settling'、ops.accountingStartedAt設定）
  - invalid-argument（billId未指定、idempotencyKey未指定）
  - not-found（billId不存在）
  - failed-precondition（statusがopen/in_progress以外、requestHash不一致）
  - idempotent-replay（reused: true、updatedAt不変）
  - DualWrite ON/OFF（todaysBills.statusの更新確認、idempotent replay時のDualWriteスキップ）
- `updateBill.spec.ts`:
  - happy path（正常な安全フィールド更新）
  - invalid-argument（billId未指定、updatesが空、businessDate変更試行）
  - not-found（billId不存在）
  - LWW動作（複数端末からの同時更新）
  - DualWrite ON/OFF（todaysBillsの該当フィールド更新確認）

### 統合テスト（callable側）
- `accounting.spec.ts` (startAccounting部分):
  - happy path（会計開始、status='settling'、ops.accountingStartedAt設定）
  - エラーハンドリング（権限不足、billId不存在、statusがopen/in_progress以外）
  - 支払方法処理とユーザー残高差し引きが現状維持で動作すること
  - DualWrite ON/OFFで `todaysBills.status` が正しく更新されること
- `updateActiveBill.spec.ts`:
  - happy path（会計前請求書の明細編集、サブコレクションのcreate/update/delete、既存のリクエストスキーマからサブコレクションへの変換）
  - エラーハンドリング（権限不足、billId不存在、accountingStartedAtがnull以外、statusがopen/in_progress以外）
  - 親フィールド（`businessDate`, `amounts.*`, `categoryBreakdown`, `postEvents.*`, `paymentsSummary.*`）が更新されないこと
  - サブコレクション（`/items`, `/extras`, `/sideGameChips`, `/tournaments`）が正しく更新されること
  - DualWrite ON/OFFで `todaysBills` の `items`, `extraCost`, `tournaments`, `sideGameChip` が正しく更新されること（`totalPrice` は更新されない）
- `businessDate.immutability.spec.ts`:
  - skipを解除し、`updateBill` ヘルパAPI経由で `businessDate` の変更が拒否されることを検証。
  - コメントで「P1-06 では `updateBill` によるパターンA を検証し、パターンB（トリガによる巻き戻し）は P1-11 で別テストに切り出す」ことを記載。

### リグレッションテスト
- 非会計系callable（`placeOrder`, `appendSideGameChip`, `recordTournamentAction` 等）が影響を受けないことを確認

## ドキュメント更新
- `README.md`: P1-06の進捗状況を更新。
- `modification_plan.md`: P1-06のステータスを更新し、仕様差分を追記。
- `changelog.md`: P1-06完了エントリを追加。
- `test_plan.md`: P1-06のテスト観点を追加。
- `api_contract.md`: `startAccounting` と `updateBill` のAPI契約を追加/更新。

## Out of Scope（P1-06のスコープ外）
- `completeAccounting` ヘルパAPIの実装（P1-10で実装予定）
- `startAccounting` callableにおける支払方法処理・ユーザー残高差し引きの `recordPayment` ヘルパAPIへの統合（P1-07で実装予定）
- `updateAccounting.ts` の新スキーマ対応・事後調整API化（/events + postEvents + paymentsSummary 連動）は **P1-06 のスコープ外**。**必ず P1-07 のタスクとして実施する**。
- 会計後に `amounts.*` や `categoryBreakdown` を動かす処理（postEventAdjustment 的なもの）は P1-07 で実装予定。
- `businessDate` の巻き戻し＆監視（パターンB、P1-11で実装予定）
