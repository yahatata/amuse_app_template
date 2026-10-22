# ChangeSpec（P1-10）

## 目的 / 関連文書
- **目的**: 
  - `migrateSettledBillsForBusinessDay.ts` が参照するデータソースを `todaysBills` から `bills` に変更し、`bills` 親ドキュメント上の確定スナップショット（`amounts`/`categoryBreakdown`/`itemsSnapshot`/`tournamentsSnapshot`/`paymentTotals`/`paymentsSummary`/`postEvents` 等）を前提に、従来と同等の `analyticsMonthly`（`monthly`/`daily`/`byCategory`/`byUser`/`byTemplateTournaments`）を生成できるようにする。
  - 会計確定（Settlement）時に `bills` 親スナップショットを生成するトリガを実装する。
  - `completeAccounting` callable を `bills` スキーマ対応に更新し、Settlement Trigger を起動する。
- **参照**: 
  - `p1-10_data_reference_migration_plan.md`（データ参照変更方針）
  - `schema_plan.md` `/bills/{billId}` スキーマ、親スナップショット仕様
  - `trigger_plan.md` §2 Settlement Trigger 設計
  - `modification_plan.md` P1-10行
  - `api_contract.md` §2.5 会計確定API

## 背景

### 現状（As-Is）

1. **`migrateSettledBillsForBusinessDay.ts`**:
   - `todaysBills` コレクションから `status == 'settled'` かつ `date == businessDate` の伝票を取得
   - `billData.userId`, `billData.pokerName`, `billData.items`, `billData.sideGameChip`, `billData.extraCost`, `billData.tournaments`, `billData.paymentMethodsByCategory` を参照
   - `calculateCategoryAmounts()` と `distributePaymentMethods()` を使用して analytics を生成

2. **`completeAccounting` callable（legacy）**:
   - `todaysBills` コレクションを参照
   - `status` を `'settled'` に更新し、`settledAt` フィールドを設定
   - `accountingHistory` コレクションに履歴を保存

3. **Settlement Trigger**:
   - 未実装（`bills` 親スナップショット生成処理が存在しない）

4. **`/payments` サブコレクション**:
   - 未実装（`recordPayment` ヘルパAPIが存在しない）

### 目標（To-Be）

1. **Settlement Trigger**:
   - Firestore v2 `onDocumentUpdated` で `/bills/{billId}` を監視
   - `before.status == 'settling' && after.status == 'settled'` のとき発火
   - 親スナップショット（`amounts`/`categoryBreakdown`/`itemsSnapshot`/`sideGameChipsSummary`/`tournamentsSnapshot`/`paymentTotals`/`paymentsSummary`/`postEvents`/`closedAt`/`meta.contentHash`）を生成
   - 冪等性: `meta.contentHash` が一致する場合は完全 no-op（`updatedAt`/`closedAt` も不変）

2. **`completeAccounting` callable（新世界版）**:
   - `bills` コレクションを参照
   - `ops.accountingStartedAt` の存在をガード条件として確認
   - `status` を `'settled'` に更新して Settlement Trigger を起動
   - legacy `completeAccounting` との共存方針を決定

3. **`migrateSettledBillsForBusinessDay.ts`**:
   - `bills` コレクションから `status == 'settled'` かつ `businessDate == businessDate` の伝票を取得
   - 親ドキュメントのみを参照（1伝票あたり1リード）
   - `billData.party.userId`, `billData.party.pokerName`, `billData.categoryBreakdown`, `billData.itemsSnapshot`, `billData.tournamentsSnapshot`, `billData.paymentTotals` を参照

4. **`analytics` helper 関数**:
   - `calculateCategoryAmounts()` を `categoryBreakdown` 直接参照に変更
   - `distributePaymentMethods()` を `paymentTotals` 直接使用に変更
   - `addToByCategory()` で `itemsSnapshot` から `itemSales` を作成（圧縮時は Top50 + `_others`）

## 変更ステップ

### Step 1: Settlement ライン整備（bills 親スナップショット生成）

#### 目的
`bills` が `settled` になった時点で、analytics が参照する親スナップショットが揃うことを保証する。

#### 変更対象ファイル一覧
- **新規作成**: `functions/src/triggers/bills.onSettle.ts`（Settlement Trigger）
- **新規作成**: `functions/src/helpers/billsApi/snapshots.ts`（スナップショット計算ロジック）
- **更新**: `functions/src/helpers/billsApi/index.ts`（`snapshots.ts` の barrel export を追加）
- **更新**: `functions/src/callables/accounting.ts`（`startAccounting` callable 内で `meta.paymentMethodsByCategory` を保存する処理を追加）
- **更新**: `functions/src/index.ts`（`bills.onSettle.ts` の export を追加。既存の `export * from "./triggers/bills.events.onCreate"` と同様の形式）

#### 変更内容

1. **Settlement Trigger 実装**:
   - ファイル名: `functions/src/triggers/bills.onSettle.ts`
   - トリガ名: `billsOnSettle`（既存の `billsEventsOnCreate` と命名規約を統一）
   - **Firestore v2 API**: `onDocumentUpdated` を使用（`firebase-functions/v2/firestore` から import）
     - **既存実装の参照**: `functions/src/triggers/bills.events.onCreate.ts` 10行目で `import { onDocumentCreated } from 'firebase-functions/v2/firestore'` を使用しているため、同様に `onDocumentUpdated` を import
   - 発火条件: `onDocumentUpdated('bills/{billId}')` で `before.status !== 'settled' && after.status === 'settled'`
     - **追加ガード**: `ops.accountingStartedAt` または `ops.accountingCompletedAt` が存在することを確認（実コード上の存在に合わせる）
     - **再発火対応**: trigger は親doc更新で再発火する可能性があるため、2回目は `contentHash` 一致で no-op になることを仕様に明記
   - **重要**: trigger 内で親docを更新する際、`status` は絶対に書き換えない（ループ事故防止）
   - 処理内容:
     - 親doc `after` を基準に以下を行う
     - サブコレクション（`items`/`extras`/`sideGameChips`/`tournaments`）を読み取り
     - **`/payments` サブコレクションの扱い**: 
       - **実コード確認結果**: `grep` により `/bills/{billId}/payments` を作成する経路は存在しない（`functions/src` 内で `payments` サブコレクションへの書き込み処理が見つからない）
       - **方針B（存在する場合のみ読む、存在しない場合は `meta.paymentMethodsByCategory` から算出にフォールバック）を採用**
       - **実装方式**: Firestore の仕様上、サブコレクションの存在判定は直接できないため、`/payments` を `limit(1)` で取得して件数を確認。0件なら `meta.paymentMethodsByCategory` から算出、1件以上なら `/payments` から集計
       - **`/payments` 集計時のフィールド仕様**（`schema_plan.md` 98-119行目に定義）:
         - `method`: 支払方法（小文字スネークケース、例: `cash`, `credit_card`, `electronic_money`）
         - `amountIncl`: 受領額（税込）
         - 集計方法: `method` をキーとして `amountIncl` を合計
       - 将来 `recordPayment` が導入された場合に備えて、`/payments` が存在する場合は優先的に使用し、存在しない場合は `meta.paymentMethodsByCategory` + `categoryBreakdown` から計算する（案3）
     - 確定スナップショットを再計算:
       - `amounts.*`（`subTotalIncl`, `discountTotalIncl`, `serviceChargeIncl`, `grandTotalIncl`, `roundingDelta`, `grandTotalRounded`）
       - `categoryBreakdown`（`items`, `extraCost`, `sideGameChips`, `tournaments`）
       - `itemsSnapshot`（Top50 + `_others` 圧縮ポリシー適用、700KB 超の場合）
       - `sideGameChipsSummary`（`purchased`, `deposited`, `withdrawn`, `net`）
       - `tournamentsSnapshot`（テンプレート別スナップショット）
       - `paymentTotals`（**暫定方針: 案3を採用**。後述）
       - `paymentsSummary`（`paidTotalIncl`, `balanceDueIncl`, `byMethod`。**暫定方針: 案3を採用**。後述）
       - `postEvents` 初期化（`totalRefundedIncl: 0`, `totalAdjustmentsIncl: 0`, `netSalesIncl: grandTotalRounded`）
     - `closedAt`（確定時刻。**Step1 では `closedAt` のみを使用**。`settledAt` は併記しない）
       - **実コード確認結果**: `grep -r "settledAt" functions/src` により、`functions/src/callables/accounting.ts` 363行目にのみ `settledAt` の使用あり（legacy `completeAccounting`）。`lib` ディレクトリには `settledAt` の参照なし
       - **判断**: `settledAt` は legacy のみで使用されているため、Step1 では `closedAt` のみを使用（併記しない）。`schema_plan.md` に準拠
     - `meta.contentHash`（スナップショットの正規化ハッシュ）
       - **対象フィールド**: `amounts`, `categoryBreakdown`, `itemsSnapshot`, `tournamentsSnapshot`, `paymentTotals`（固定）
       - **対象外フィールド**: `closedAt`, `updatedAt` 等の時刻系はハッシュ対象外（毎回変わるため）
       - **正規化ルール**: JSON key をソート、`undefined` 除去、Firestore Timestamp は millis（number）に揃える、数値はそのまま
     - 冪等性チェック: `meta.contentHash` が存在し、再計算結果が一致する場合は完全 no-op（`updatedAt`/`closedAt` も不変）
     - 親ドキュメントを更新（冪等でない場合のみ、transaction 推奨）
     - `cleanupIdempotencyOnSettle(billId)` を呼び出し
       - **実在確認**: `functions/src/triggers/onSettleCleanupIdempotency.ts` に実装済み（18行目: `export async function cleanupIdempotencyOnSettle(billId: string): Promise<void>`）
       - **import パス**: `import { cleanupIdempotencyOnSettle } from './onSettleCleanupIdempotency'`（同一ディレクトリ内のため相対パス）
     - `enqueueSettlement(bill)` を呼び出す
       - **実在確認**: `functions/src/analytics/aggregator/index.ts` に実装済み（17行目: `export async function enqueueSettlement(bill: BillDoc): Promise<void>`）
       - **import パス**: `import { enqueueSettlement } from '../analytics/aggregator'`
       - **制御**: 環境変数 `ENABLE_SETTLEMENT_AGGREGATOR === 'true'` の場合のみ呼び出す（既存の `shouldDualWrite()` と同様の方式）
       - **判断**: Step1 で接続することを推奨（marker 互換が確認済みのため、二重反映のリスクは低い）

2. **`paymentTotals` と `paymentsSummary` の暫定方針（案3採用）**:
   - **採用案**: `startAccounting` callable の入力から `paymentMethodsByCategory` を取得し、`bills` 親ドキュメントの `meta.paymentMethodsByCategory` に暫定保存。Settlement Trigger で `meta.paymentMethodsByCategory` + `categoryBreakdown` から `paymentTotals` を計算。
   - **理由**: P1-10 のスコープを最小化しつつ、analytics を動作させる。`recordPayment` は別フェーズで実装。
   - **制約**: 
     - 暫定値のため、確定時点の支払いと不一致の可能性がある
     - `paymentsSummary.paidTotalIncl` は `paymentTotals` の合計から逆算（暫定）
     - `paymentsSummary.balanceDueIncl` は `grandTotalRounded - paidTotalIncl` で計算（暫定）
   - **将来の移行ステップ**: `recordPayment` 導入時に、`/payments` サブコレクションから集計する方式に差し替え

3. **`startAccounting` callable の拡張**:
   - **確認結果**: `startAccounting` callable（`functions/src/callables/accounting.ts`）は既に `paymentMethodsByCategory` を受け取っている（`StartAccountingSchema` で定義、`validatedData` から取得）
   - **実装内容**: `startAccounting` callable 内で、`paymentMethodsByCategory` を受け取った後、`bills` 親ドキュメントの `meta.paymentMethodsByCategory` に保存する処理を追加（暫定）
   - **型定義**: `meta.paymentMethodsByCategory` は実コードの `StartAccountingSchema` に合わせて保存する
     - **実コードの型**: `Record<string, string | Array<{method: string, amount: number}>>`
     - **説明**: カテゴリ名 -> 支払方法（文字列）または配列（method + amount）
     - **制約**: P1-10では暫定保存のため、Settlement Trigger で `paymentTotals` を計算する際に精度が落ちる可能性がある（`normalizePaymentMethods` と同等の処理が必要）
   - **重要**: 冪等リプレイ時の `updatedAt` 取り扱いなど、既存ポリシーを壊さないこと
   - **実装箇所**: `startAccounting` callable 内で、以下の意味的アンカーで位置を特定:
     - **入力検証後**: `validatedData` から `paymentMethodsByCategory` を取得した後（`validatedData` の取得後）
     - **支払い方法の検証処理後**: `normalizePaymentMethods()` の呼び出し後、支払い総額の検証（`totalPaid` と `totalExpected` の比較）が成功した後
     - **ユーザー残高差し引き処理後**: ユーザー残高の差し引き処理（`userRef.update()`）が完了した後
     - **既存コメントの更新**: 261行目のコメント「支払方法情報は bills には保存しない（P1-06のスコープ外、将来の recordPayment ヘルパに移行予定）」を更新し、暫定保存であることを明記する
       - 更新後のコメント案: 「支払方法情報は bills には保存しない（P1-06のスコープ外、将来の recordPayment ヘルパに移行予定）。ただし、P1-10 の暫定方針として `meta.paymentMethodsByCategory` には保存する。」
     - **保存処理の追加**: 上記コメントの直前に、`meta.paymentMethodsByCategory` を保存する処理を追加
   - **注意**: `startAccounting` ヘルパAPI（`functions/src/helpers/billsApi/startAccounting.ts`）は変更しない。callable 側のみで `meta.paymentMethodsByCategory` を更新する。

4. **スナップショット計算ロジックの実装配置**:
   - **新規ヘルパファイル作成**: `functions/src/helpers/billsApi/snapshots.ts`
   - **export 方式**: `helpers/billsApi/index.ts` に barrel export を追加（既存の命名規約に従う。`export { ... } from './snapshots'` の形式）
   - **実装内容**: 
     - `calculateAmounts()`: サブコレクション（`items`/`extras`/`sideGameChips`/`tournaments`）から `amounts.*` を計算
       - **参照元**: `functions/src/accounting/getBillPreviewTotals.ts` のロジックを参照し、同等実装にする（フィールド名の決め打ち禁止）
       - **`extras` の計算**: `amountIncl` を合計（`getBillPreviewTotals.ts` 83-84行目と同等）
       - **`items` の計算**: `totalPriceIncl` があればそれを使い、なければ `unitPriceIncl * quantity` で計算（`getBillPreviewTotals.ts` 92-99行目と同等）
       - **`sideGameChips` の計算**: `action == 'purchase'` のみ、`amountIncl` を合計（`getBillPreviewTotals.ts` 103-120行目と同等）
       - **`tournaments` の計算**: `entryFeeIncl * entryCount + reentryFeeIncl * reentryCount + addonFeeIncl * addonCount`（`getBillPreviewTotals.ts` 127-137行目と同等）
       - `subTotalIncl`: `items` の合計 + `extras` の合計
       - `discountTotalIncl`: 割引合計（現状は 0 または既存ロジックに従う）
       - `serviceChargeIncl`: サービス料（現状は 0 または既存ロジックに従う）
       - `grandTotalIncl`: `subTotalIncl + sideGameChips + tournaments - discountTotalIncl + serviceChargeIncl`
       - `roundingDelta`: 丸め差分（既存ロジックに従う）
       - `grandTotalRounded`: 丸め後の最終税込額
     - `calculateCategoryBreakdown()`: サブコレクションから `categoryBreakdown` を計算（`items`, `extraCost`, `sideGameChips`, `tournaments`）
       - **参照元**: `getBillPreviewTotals.ts` のカテゴリ別計算ロジックを参照し、同等実装にする
     - `buildItemsSnapshot()`: サブコレクション `items` から `itemsSnapshot` を構築
       - **圧縮閾値**: `schema_plan.md` に記載の「700KB 超は Top50 + その他合算に圧縮」に準拠（行番号参照禁止のため、値のみ抽出: 700KB, Top50）
       - **定数化**: 圧縮閾値（700KB）と TopN（50）を定数として定義し、コメントで根拠（`schema_plan.md` の記載）を残す
       - **サイズ計測**: `Buffer.byteLength(JSON.stringify(snapshot), 'utf8')` で計測
       - **圧縮ロジック**: `itemsSnapshot` のサイズが 700KB を超える場合、売上額 Top50 + `_others` に圧縮
       - **Top50 の選定**: 売上額（`totalPriceIncl` があればそれを使い、なければ `unitPriceIncl * quantity`）の降順で Top50 を選定
       - **`_others` の扱い**: 残りの商品は `itemsSnapshot._others` として合算値を記録（`qty`, `salesIncl`）
     - `buildSideGameChipsSummary()`: サブコレクション `sideGameChips` から `sideGameChipsSummary` を構築（`purchased`, `deposited`, `withdrawn`, `net`）
     - `buildTournamentsSnapshot()`: サブコレクション `tournaments` から `tournamentsSnapshot` を構築（テンプレート別スナップショット）
     - `calculatePaymentTotals()`: `/payments` サブコレクションが存在する場合は優先的に使用し、存在しない場合は `meta.paymentMethodsByCategory` + `categoryBreakdown` から計算（方針B）
       - **`/payments` 集計時のフィールド仕様**: `schema_plan.md` 98-119行目に定義
         - `method`: 支払方法（小文字スネークケース）
         - `amountIncl`: 受領額（税込）
         - 集計方法: `method` をキーとして `amountIncl` を合計
       - **存在判定**: `/payments` を `limit(1)` で取得して件数を確認。0件なら `meta.paymentMethodsByCategory` から算出、1件以上なら `/payments` から集計
       - **`meta.paymentMethodsByCategory` からの計算**:
         - **型定義**: `Record<string, string | Array<{method: string, amount: number}>>`（実コードの `StartAccountingSchema` に合わせる）
         - **計算方法**: `functions/src/callables/accounting.ts` の `normalizePaymentMethods` と同等の処理を実装
           - `string` の場合: カテゴリ全体の金額をその method に配賦
           - `Array<{method, amount}>` の場合: 各 split の method と amount を使用
           - 最終的に `method` 別に単純合計して算出する（カテゴリは畳み込む）
         - **制約**: P1-10では暫定保存のため、`paymentTotals` の精度が落ちる可能性がある（`categoryBreakdown` と組み合わせて計算する必要がある）
     - `calculatePaymentsSummary()`: `paymentTotals` から `paymentsSummary` を計算（`paidTotalIncl`, `balanceDueIncl`, `byMethod`）
     - `calculateContentHash()`: スナップショットの正規化ハッシュを計算
       - **対象フィールド**: `amounts`, `categoryBreakdown`, `itemsSnapshot`, `tournamentsSnapshot`, `paymentTotals`（固定）
       - **対象外フィールド**: `closedAt`, `updatedAt` 等の時刻系はハッシュ対象外（毎回変わるため）
       - **正規化ルール**:
         - JSON key をソート（安定化）
         - `undefined` は除去
         - Firestore Timestamp は millis（number）に揃える（対象に含める場合のみ。今回の対象には基本出ない想定だが実装は汎用でOK）
         - 数値はそのまま（incl は整数想定）
       - **ハッシュアルゴリズム**: sha256 等
   - **Settlement Trigger での使用**: `bills.onSettle.ts` から上記ヘルパ関数を呼び出す（trigger 内直書きではなく、ヘルパ関数を使用）

#### 受け入れ条件（AC）
- Settlement Trigger が `settling` → `settled` 遷移時に発火する
- 親スナップショットが正しく生成される（`amounts`/`categoryBreakdown`/`itemsSnapshot`/`tournamentsSnapshot`/`paymentTotals`/`paymentsSummary`/`postEvents`/`closedAt`/`meta.contentHash`）
- 冪等性: `meta.contentHash` が一致する場合は完全 no-op（`updatedAt`/`closedAt` も不変）
- `cleanupIdempotencyOnSettle` が呼び出される
- `enqueueSettlement` が呼び出される（環境変数 `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` の場合のみ）
- `startAccounting` callable で `meta.paymentMethodsByCategory` が保存される

#### テスト観点
- **単体テスト**:
  - Settlement Trigger が `settling` → `settled` 遷移時に発火する
  - 親スナップショットが正しく生成される（`amounts`/`categoryBreakdown`/`itemsSnapshot`/`tournamentsSnapshot`/`paymentTotals`/`paymentsSummary`/`postEvents`/`closedAt`/`meta.contentHash`）
  - 冪等性: `meta.contentHash` が一致する場合は完全 no-op（`updatedAt`/`closedAt` も不変）
  - `cleanupIdempotencyOnSettle` が呼び出される
  - `enqueueSettlement` が呼び出される（環境変数 `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` の場合のみ）
  - `/payments` サブコレクションが存在する場合と存在しない場合の両方で `paymentTotals`/`paymentsSummary` が正しく生成される
  - `itemsSnapshot` の圧縮ロジック（700KB 超で Top50 + `_others`）が正しく動作する
  - `startAccounting` callable で `meta.paymentMethodsByCategory` が保存される
- **統合テスト**:
  - `startAccounting` → Settlement Trigger のフローが正常に動作する（`completeAccounting` は Step2 で実装）
  - `paymentTotals` と `paymentsSummary` が暫定値で正しく生成される
- **テストファイル配置**:
  - **新規作成**: `functions/__tests__/triggers/bills.onSettle.spec.ts`
    - **既存テスト基盤の参照**: `functions/__tests__/triggers/bills.events.onCreate.spec.ts` を参照
    - **テスト環境**: Firestore Emulator を使用（`initializeTestEnvironment` を使用）
    - **テスト観点**: `settling` → `settled` 遷移時にトリガが発火し、親スナップショットが正しく生成されることを確認
  - **新規作成**: `functions/__tests__/helpers/billsApi/snapshots.spec.ts`
    - **テスト観点**: 
      - 各スナップショット計算関数が正しく動作することを確認（`getBillPreviewTotals.ts` と同等の結果になることを検証）
      - `getBillPreviewTotals.ts` と同等計算になること（items/extras/sideGameChips/tournaments）
      - `itemsSnapshot` 圧縮（700KB超でTop50+_others）
  - **更新**: `functions/__tests__/callables/accounting.spec.ts`
    - **テスト観点**: 
      - `startAccounting` で `meta.paymentMethodsByCategory` が保存される
      - `completeAccountingV2` のガードと status 更新

#### ロールバック/リスク
- **リスク**: 
  - `paymentTotals` と `paymentsSummary` が暫定値のため、確定時点の支払いと不一致の可能性がある
  - `itemsSnapshot` が圧縮されている場合、Top50 以外の商品詳細が失われる
- **ロールバック**: 
  - Settlement Trigger を無効化（Firebase Console でトリガを無効化）
  - 環境変数 `ENABLE_SETTLEMENT_AGGREGATOR` を `'false'` に設定して `enqueueSettlement` を無効化

#### 主要差分サマリ

1. **Settlement Trigger（`bills.onSettle.ts`）**:
   - Firestore v2 `onDocumentUpdated` で `bills/{billId}` を監視
   - `settling` → `settled` 遷移時に発火
   - サブコレクション（`items`/`extras`/`sideGameChips`/`tournaments`）を読み取り、親スナップショットを生成
   - `/payments` は存在する場合のみ読み取り、存在しない場合は `meta.paymentMethodsByCategory` から算出（方針B）
   - 冪等性: `meta.contentHash` が一致する場合は完全 no-op

2. **スナップショット計算ヘルパ（`snapshots.ts`）**:
   - **参照元**: `functions/src/accounting/getBillPreviewTotals.ts` のロジックを参照し、同等実装にする（フィールド名の決め打ち禁止）
   - `calculateAmounts()`: サブコレクションから `amounts.*` を計算（`getBillPreviewTotals.ts` の計算ロジックと同等）
   - `calculateCategoryBreakdown()`: カテゴリ別金額を計算（`getBillPreviewTotals.ts` のカテゴリ別計算ロジックと同等）
   - `buildItemsSnapshot()`: `itemsSnapshot` を構築（700KB 超で Top50 + `_others` 圧縮。閾値と TopN は定数化し、コメントで根拠を残す）
   - `buildSideGameChipsSummary()`: サイドゲーム取引サマリを構築
   - `buildTournamentsSnapshot()`: トーナメントスナップショットを構築
   - `calculatePaymentTotals()`: `/payments` が存在する場合は優先（`method` と `amountIncl` を集計）、存在しない場合は `meta.paymentMethodsByCategory` から計算
   - `calculatePaymentsSummary()`: `paymentTotals` から `paymentsSummary` を計算
   - `calculateContentHash()`: スナップショットの正規化ハッシュを計算

3. **`startAccounting` callable 拡張**:
   - `paymentMethodsByCategory` を受け取った後、`bills` 親ドキュメントの `meta.paymentMethodsByCategory` に保存
   - **既存コメントの更新**: `functions/src/callables/accounting.ts` 261行目のコメント「支払方法情報は bills には保存しない（P1-06のスコープ外、将来の recordPayment ヘルパに移行予定）」を更新し、暫定保存であることを明記
     - 更新後のコメント案: 「支払方法情報は bills には保存しない（P1-06のスコープ外、将来の recordPayment ヘルパに移行予定）。ただし、P1-10 の暫定方針として `meta.paymentMethodsByCategory` には保存する。」

4. **export 追加**:
   - `functions/src/index.ts`: `export * from "./triggers/bills.onSettle"` を追加
     - **既存実装の参照**: `functions/src/index.ts` 44行目で `export * from "./triggers/bills.events.onCreate"` を使用しているため、同様の形式で追加
     - **export 名**: `billsOnSettle`（`bills.events.onCreate.ts` の `billsEventsOnCreate` と命名規約を統一）
   - `functions/src/helpers/billsApi/index.ts`: `export { ... } from './snapshots'` を追加
     - **既存実装の参照**: `functions/src/helpers/billsApi/index.ts` では `export { ... } from './...'` の形式を使用しているため、同様の形式で追加
     - **export する関数**: `calculateAmounts`, `calculateCategoryBreakdown`, `buildItemsSnapshot`, `buildSideGameChipsSummary`, `buildTournamentsSnapshot`, `calculatePaymentTotals`, `calculatePaymentsSummary`, `calculateContentHash`（実装する関数名に応じて調整）

---

### Step 2: bills版 completeAccounting（新世界）整備

#### 目的
`startAccounting` → `completeAccountingV2` → (status `settled` 更新) → Settlement Trigger のラインを成立させる。

#### 変更対象ファイル一覧
- **更新**: `functions/src/callables/accounting.ts`（legacy `completeAccounting`（`todaysBills`参照）は残す。新世界版として `completeAccountingV2` を追加（既存クライアント破壊回避）。`startAccounting` 関数は Step1 で変更済みのため、Step2 では触らない）

#### 変更内容

1. **`completeAccountingV2` callable（新世界版）実装**:
   - **legacy との共存方針**: legacy `completeAccounting`（`todaysBills` 参照）は残置し、新世界版は `completeAccountingV2` として別関数名で追加（既存クライアント破壊回避）
   - `bills` コレクションを参照
   - ガード条件: `ops.accountingStartedAt` が存在しない場合は `failed-precondition` を返す
   - `status` を `'settled'` に更新（Settlement Trigger を起動）
   - `ops.accountingCompletedAt` と `ops.accountingCompletedBy` を更新
   - **重要**: 確定時刻は trigger が `closedAt` を書くため、callable 側は `closedAt` を書かない（重複/競合回避）

2. **`settledAt` vs `closedAt` の整合**:
   - 新世界は `closedAt` を正とする
   - legacy は `settledAt` を維持するが、新世界では使用しない（併記もしない）
   - **判断**: Step1 で `closedAt` のみを使用することを確定済み。Step2 でも同様に `closedAt` を正とする

#### 受け入れ条件（AC）
- `completeAccountingV2` が `bills` コレクションを参照する
- `ops.accountingStartedAt` が存在しない場合は `failed-precondition` を返す
- `status` を `'settled'` に更新して Settlement Trigger を起動する
- legacy `completeAccounting` との共存が正常に動作する
- `closedAt` は trigger 側で設定するため、callable 側では設定しない

#### テスト観点
- **単体テスト**:
  - `completeAccountingV2` が `bills` コレクションを参照する
  - `ops.accountingStartedAt` が存在しない場合は `failed-precondition` を返す
  - `status` を `'settled'` に更新する
  - legacy `completeAccounting` との共存が正常に動作する
- **統合テスト**:
  - `startAccounting` → `completeAccountingV2` → Settlement Trigger のフローが正常に動作する

#### ロールバック/リスク
- **リスク**: legacy `completeAccounting` との共存による混乱
- **ロールバック**: 新世界版 `completeAccounting` を無効化し、legacy に戻す

---

### Step 3: migrateSettledBillsForBusinessDay と analytics addTo* を bills親スナップショット前提に差し替え

#### 目的
`migrateSettledBillsForBusinessDay.ts` と analytics helper/addTo* を、`todaysBills` 依存から脱却させる。`bills` 親docのみ（可能な範囲）で集計できるようにする（アイテム詳細は `itemsSnapshot` の Top50 + `_others` 方針に従う）。

#### 変更対象ファイル一覧
- **更新**: `functions/src/analytics/migrateSettledBillsForBusinessDay.ts`
- **更新**: `functions/src/analytics/helpers.ts`（`calculateCategoryAmounts`, `distributePaymentMethods`）
- **更新**: `functions/src/analytics/addToMonthlyIndex.ts`
- **更新**: `functions/src/analytics/addToDailySummary.ts`
- **更新**: `functions/src/analytics/addToByCategory.ts`
- **更新**: `functions/src/analytics/addToByUser.ts`
- **更新**: `functions/src/analytics/addToByTemplateTournaments.ts`

#### 変更内容

1. **`migrateSettledBillsForBusinessDay.ts` のクエリ差し替え**:
   ```typescript
   // Before
   const billsQuery = await db.collection('todaysBills')
     .where('status', '==', 'settled')
     .where('date', '==', businessDate)
     .get();
   
   // After
   const billsQuery = await db.collection('bills')
     .where('status', '==', 'settled')
     .where('businessDate', '==', businessDate)
     .get();
   ```

2. **データ参照の変更（マッピング表）**:

   | 旧参照（todaysBills） | 新参照（bills 親doc） | 備考 |
   |---------------------|---------------------|------|
   | `billData.userId` | `billData.party.userId` | 必須 |
   | `billData.pokerName` | `billData.party.pokerName` | 任意 |
   | `billData.items` | `billData.itemsSnapshot` | `itemSales` 用。圧縮時は Top50 + `_others` |
   | `billData.sideGameChip` | `billData.categoryBreakdown.sideGameChips` | 金額のみ。**注意**: `categoryBreakdown` では `sideGameChips`（複数形）を使用するが、analytics のカテゴリキーでは `sideGameChip`（単数形）を使用する |
   | `billData.extraCost` | `billData.categoryBreakdown.extraCost` | 金額のみ |
   | `billData.tournaments` | `billData.tournamentsSnapshot` | テンプレート別スナップショット |
   | `billData.paymentMethodsByCategory` | `billData.paymentTotals` | 既に配賦済み |

3. **`calculateCategoryAmounts()` の変更**:
   ```typescript
   // Before: billData.items, billData.sideGameChip, billData.extraCost, billData.tournaments から計算
   // After: billData.categoryBreakdown を直接使用
   export function calculateCategoryAmounts(billData: any): Map<string, number> {
     const categoryBreakdown = billData.categoryBreakdown || {};
     const categoryAmounts = new Map<string, number>();
     if (categoryBreakdown.items) categoryAmounts.set('items', categoryBreakdown.items);
     if (categoryBreakdown.extraCost) categoryAmounts.set('extraCost', categoryBreakdown.extraCost);
     // 注意: categoryBreakdown では sideGameChips（複数形）だが、analytics のカテゴリキーでは sideGameChip（単数形）を使用
     if (categoryBreakdown.sideGameChips) categoryAmounts.set('sideGameChip', categoryBreakdown.sideGameChips);
     if (categoryBreakdown.tournaments) categoryAmounts.set('tournaments', categoryBreakdown.tournaments);
     return categoryAmounts;
   }
   ```
   - **キー規約**: 
     - `categoryBreakdown` フィールド名: `sideGameChips`（複数形、`schema_plan.md` に準拠）
     - analytics のカテゴリキー: `sideGameChip`（単数形、既存の `helpers.ts` や `addToByUser.ts` で使用されている形式を維持）
     - マッピング: `categoryBreakdown.sideGameChips` → `categoryAmounts.set('sideGameChip', ...)`

4. **`distributePaymentMethods()` の変更**:
   ```typescript
   // Before: paymentMethodsByCategory + categoryAmounts から配賦
   // After: paymentTotals を直接使用（既に配賦済み）
   export function distributePaymentMethods(
     paymentTotals: Record<string, number>
   ): Map<string, number> {
     const paymentTotalsMap = new Map<string, number>();
     for (const [method, amount] of Object.entries(paymentTotals || {})) {
       paymentTotalsMap.set(method, amount);
     }
     return paymentTotalsMap;
   }
   ```

5. **`addToByCategory()` の変更**:
   - `itemsSnapshot` から `itemSales` を作成
   - 圧縮されていない場合: 全商品を個別に `itemSales.{menuItemId}` として作成
   - 圧縮されている場合: Top50の商品を個別に `itemSales.{menuItemId}` として作成し、残りの商品は `itemSales._others` として合算値を加算していく
   - `_others` の `name` は `"その他"`、`category` は `null` とする

6. **`addToByUser()` の変更**:
   - `billData.party.userId` を参照（`billData.userId` から変更）
   - `billData.party.pokerName` を参照（`billData.pokerName` から変更）

7. **`addToByTemplateTournaments()` の変更**:
   - `billData.tournamentsSnapshot` を参照（`billData.tournaments` から変更）

#### 受け入れ条件（AC）
- `migrateSettledBillsForBusinessDay` が `bills` コレクションを参照する
- 親ドキュメントのみを参照（1伝票あたり1リード）
- `analyticsMonthly` が正しく生成される（`monthly`/`daily`/`byCategory`/`byUser`/`byTemplateTournaments`）
- `itemSales` が `itemsSnapshot` から正しく作成される（圧縮時は Top50 + `_others`）

#### テスト観点
- **単体テスト**:
  - `calculateCategoryAmounts()` が `categoryBreakdown` を直接参照する
  - `distributePaymentMethods()` が `paymentTotals` を直接使用する
  - `addToByCategory()` が `itemsSnapshot` から `itemSales` を作成する（圧縮時は Top50 + `_others`）
- **統合テスト**:
  - `migrateSettledBillsForBusinessDay` が `bills` コレクションから正しく analytics を生成する
  - 既存の `analyticsMonthly` と整合性が保たれる

#### ロールバック/リスク
- **リスク**: `itemsSnapshot` が圧縮されている場合、`itemSales` の精度が低下する（Top50 + `_others`）
- **ロールバック**: `migrateSettledBillsForBusinessDay` を `todaysBills` 参照に戻す（ただし、`todaysBills` は既に非推奨）

---

## 実装順序と依存関係

1. **Step 1**: Settlement Trigger 実装（`bills` 親スナップショット生成）
   - 依存: なし
   - 出力: `bills` 親ドキュメントにスナップショットが生成される

2. **Step 2**: `completeAccounting` 新世界版実装
   - 依存: Step 1（Settlement Trigger が実装されていること）
   - 出力: `startAccounting` → `completeAccounting` → Settlement Trigger のフローが成立

3. **Step 3**: `migrateSettledBillsForBusinessDay` と analytics addTo* の差し替え
   - 依存: Step 1（`bills` 親スナップショットが生成されていること）
   - 出力: `migrateSettledBillsForBusinessDay` が `bills` 親スナップショットを参照して analytics を生成

---

## 未確定事項（判断点）とユーザー質問

### ユーザーが最終決定する判断点（質問リスト）

1. **`enqueueSettlement` の接続タイミングについて**:
   - **質問**: Settlement Trigger（Step 1）で `enqueueSettlement(bill)` を接続しますか？
   - **選択肢**: 
     - A. Step 1 で接続する（推奨: marker 互換が確認済みのため）
     - B. Step 3 で接続する（`migrateSettledBillsForBusinessDay` と同時に統合）
   - **根拠**: `migrateSettledBillsForBusinessDay` と aggregator は同じ marker（`analyticsMonthly/{month}/aggregationMarkers/{billId}`）を使用しているため、二重反映のリスクは低い

2. **legacy `completeAccounting` との共存方針について**:
   - **質問**: legacy `completeAccounting`（`todaysBills` 参照）をどう扱いますか？
   - **選択肢**: 
     - A. 既存関数を置き換える（新世界版のみ残す）
     - B. 別関数名で共存（例: `completeAccountingV2`）
     - C. legacy を残置し、新世界版は別関数名（例: `completeAccountingV2`）
   - **根拠**: `modification_plan.md` P1-06 では「legacy として残置」と記載されているが、P1-10 で新世界版を実装するため、共存方針を決定する必要がある

3. **`settledAt` vs `closedAt` の統一について**:
   - **質問**: 確定時刻のフィールド名をどちらに統一しますか？
   - **選択肢**: 
     - A. `closedAt` で統一（`schema_plan.md` に準拠）
     - B. `settledAt` を維持（既存コードとの整合性を優先）
   - **根拠**: `schema_plan.md` では `closedAt` を定義しているが、既存の `completeAccounting`（legacy）は `settledAt` を使用している

4. **`paymentTotals` と `paymentsSummary` の暫定方針について**:
   - **質問**: 案3（`startAccounting` 入力から暫定値を移設）で進めて問題ありませんか？
   - **選択肢**: 
     - A. 案3を採用する（推奨: P1-10 のスコープを最小化）
     - B. 案1を採用する（`recordPayment` を P1-10 で実装）
     - C. 案2を採用する（暫定値として 0/空 で初期化）
   - **根拠**: `recordPayment` は未実装のため、暫定方針が必要

5. **スナップショット計算ロジックの実装配置について**:
   - **確認結果**: 既存の snapshot 計算ヘルパは存在しない。`getBillPreviewTotals.ts` にはサブコレクションから計算するロジックがあるが、これは確定前のプレビュー用。
   - **判断**: 新規ヘルパファイル（`functions/src/helpers/billsApi/snapshots.ts`）を作成し、Settlement Trigger から呼び出す方式を採用する。
   - **質問**: この判断で問題ありませんか？
   - **根拠**: スナップショット計算ロジックは複雑（`itemsSnapshot` の Top50 + `_others` 圧縮ロジック含む）のため、ヘルパ関数として分離することで保守性が向上する

6. **`cleanupIdempotencyOnSettle` の実装状況について**:
   - **確認結果**: `functions/src/triggers/onSettleCleanupIdempotency.ts` を確認したところ、実装は既に存在している（stub ではなく実装済み）。19行目にコメント「TODO: P1-06 で本実装」があるが、実際には削除処理は実装されている（30-43行目）。
   - **判断**: 移行は不要で、そのまま使用可能。`bills.onSettle.ts` から `import { cleanupIdempotencyOnSettle } from './onSettleCleanupIdempotency'` で呼び出す。
   - **質問**: この判断で問題ありませんか？
   - **根拠**: 実コード確認により、削除処理は既に実装されていることを確認

7. **Step1/Step2 が同一ファイル（`callables/accounting.ts`）を触る場合の衝突防止について**:
   - **確認結果**: `functions/src/callables/accounting.ts` を Step1 と Step2 の両方で変更する必要がある。
   - **判断**: 
     - Step1: `startAccounting` callable 内で、意味的アンカー（支払い方法の検証処理後、ユーザー残高差し引き処理後、コメント「支払方法情報は bills には保存しない」の直前）で `meta.paymentMethodsByCategory` を保存する処理を追加
     - Step2: `completeAccounting` callable のみを更新（`startAccounting` callable は触らない）
   - **質問**: この判断で問題ありませんか？
   - **根拠**: 実コード確認により、`startAccounting` callable と `completeAccounting` callable は別関数として定義されているため、衝突しない

8. **カテゴリキー（`sideGameChip` vs `sideGameChips`）の整合について**:
   - **確認結果**: 
     - `schema_plan.md` では `categoryBreakdown.sideGameChips`（複数形）を使用
     - 既存の `helpers.ts` や `addToByUser.ts` では analytics のカテゴリキーとして `sideGameChip`（単数形）を使用
   - **判断**: `categoryBreakdown` フィールド名は `sideGameChips`（複数形）を維持し、analytics のカテゴリキーは `sideGameChip`（単数形）を維持する。`calculateCategoryAmounts()` で `categoryBreakdown.sideGameChips` → `categoryAmounts.set('sideGameChip', ...)` のマッピングを行う。
   - **質問**: この判断で問題ありませんか？
   - **根拠**: 既存の analytics 実装との整合性を保つため

9. **`/payments` サブコレクションの読み取り方針について**:
   - **確認結果**: 実コード検索により、`/bills/{billId}/payments` を作成する経路は存在しない（`grep` 結果が空）
   - **判断**: **方針B（存在する場合のみ読む、存在しない場合は `meta.paymentMethodsByCategory` から算出にフォールバック）を採用**。将来 `recordPayment` が導入された場合に備えて、`/payments` が存在する場合は優先的に使用し、存在しない場合は `meta.paymentMethodsByCategory` + `categoryBreakdown` から計算する。
   - **質問**: この判断で問題ありませんか？
   - **根拠**: 将来の `recordPayment` 導入に備えて、柔軟性を持たせるため。現状は `/payments` が存在しないため、`meta.paymentMethodsByCategory` から計算する（案3）が実質的な動作となる

10. **`startAccounting` callable の `paymentMethodsByCategory` 受け取り状況について**:
   - **確認結果**: `startAccounting` callable（`functions/src/callables/accounting.ts`）は既に `paymentMethodsByCategory` を受け取っている（`StartAccountingSchema` で定義、`validatedData` から取得）
   - **判断**: `startAccounting` callable 内で、`paymentMethodsByCategory` を受け取った後、`bills` 親ドキュメントの `meta.paymentMethodsByCategory` に保存する処理を追加する。
   - **質問**: この判断で問題ありませんか？
   - **根拠**: 実コード確認により、`paymentMethodsByCategory` は既に受け取られているため、保存処理のみ追加すればよい

11. **`snapshots.ts` の配置と export 方針について**:
   - **確認結果**: `helpers/billsApi/index.ts` は barrel export を使用している（既存の命名規約に従う）
   - **判断**: `functions/src/helpers/billsApi/snapshots.ts` を作成し、`helpers/billsApi/index.ts` に barrel export を追加する。
   - **質問**: この判断で問題ありませんか？
   - **根拠**: 既存の `helpers/billsApi` の export 方式に合わせる

12. **`closedAt` vs `settledAt` の扱い（Step1 時点の実装方針）について**:
   - **確認結果（grep 根拠付き）**: 
     - `grep -r "settledAt" functions/src` → `functions/src/callables/accounting.ts` 363行目にのみ使用あり（legacy `completeAccounting`）
     - `grep -r "settledAt" lib` → 参照なし
     - `schema_plan.md` では `closedAt` を定義している（確定時刻フィールド）
   - **判断**: **Step1 の実装では `closedAt` のみを使用する**（`schema_plan.md` に準拠）。`settledAt` は併記しない。既存参照が legacy のみのため、新世界版では `closedAt` を正とする。
   - **質問**: この判断で問題ありませんか？
   - **根拠**: `settledAt` は legacy のみで使用されており、`lib` 側には参照がないため、新世界版では `closedAt` を正とする。Step2 で統一方針を決定する。

13. **`enqueueSettlement` の接続方針について**:
   - **確認結果**: 
     - `migrateSettledBillsForBusinessDay` と aggregator は同じ marker（`analyticsMonthly/{month}/aggregationMarkers/{billId}`）を使用しているため、二重反映のリスクは低い
     - 既存の環境変数使用例: `shouldDualWrite()` で `process.env.WRITE_TODAYS_BILLS_IN_PARALLEL` を使用している
   - **判断**: **Step1 で接続することを推奨**。環境変数 `ENABLE_SETTLEMENT_AGGREGATOR` で制御可能にする（`process.env.ENABLE_SETTLEMENT_AGGREGATOR === 'true'` の場合のみ `enqueueSettlement` を呼び出す）。既存の `shouldDualWrite()` と同様の方式。
   - **質問**: この判断で問題ありませんか？
   - **根拠**: marker 互換が確認済みのため、Step1 で接続しても問題ない。環境変数で制御することで、問題が発生した場合に無効化できる

---

## 実装時の注意事項（実コード確認結果に基づく）

### `/payments` サブコレクションのフィールド仕様（repo根拠付き）

**確認結果**: `schema_plan.md` 98-119行目に定義あり

- **主要フィールド**:
  - `method`: `string`（必須）。支払方法（小文字スネークケース、例: `cash`, `credit_card`, `electronic_money`）
  - `amountIncl`: `number`（必須）。受領額（税込）
  - `capturedAt`: `timestamp`（必須）。受領時刻
  - `status`: `string`（必須）。`authorized`/`captured`/`refunded` 等

- **集計に必要なフィールド**: `method` と `amountIncl`
- **集計方法**: `method` をキーとして `amountIncl` を合計

### `closedAt` vs `settledAt` の判断結果（grep根拠付き）

**確認結果**:
- `grep -r "settledAt" functions/src` → `functions/src/callables/accounting.ts` 363行目にのみ使用あり（legacy `completeAccounting`）
- `grep -r "settledAt" lib` → 参照なし

**判断**: Step1 では `closedAt` のみを使用（`settledAt` は併記しない）。既存参照が legacy のみのため、新世界版では `closedAt` を正とする。

### 金額計算の参照元と差分がないことの説明

**参照元**: `functions/src/accounting/getBillPreviewTotals.ts`

**計算ロジック**:
- **`extras`**: `amountIncl` を合計（83-84行目）
- **`items`**: `totalPriceIncl` があればそれを使い、なければ `unitPriceIncl * quantity` で計算（92-99行目）
- **`sideGameChips`**: `action == 'purchase'` のみ、`amountIncl` を合計（103-120行目）
- **`tournaments`**: `entryFeeIncl * entryCount + reentryFeeIncl * reentryCount + addonFeeIncl * addonCount`（127-137行目）

**差分がないことの保証**: `snapshots.ts` の `calculateAmounts()` と `calculateCategoryBreakdown()` は、上記 `getBillPreviewTotals.ts` のロジックを参照し、同等実装にする。

### `itemsSnapshot` の圧縮閾値（docから抽出、行番号参照禁止）

**確認結果**: `schema_plan.md` に記載の「700KB 超は Top50 + その他合算に圧縮」

**値**: 700KB（圧縮閾値）、50（TopN）

**実装方針**: 圧縮閾値（700KB）と TopN（50）を定数として定義し、コメントで根拠（`schema_plan.md` の記載）を残す。

### 追加/更新テストの内容

**既存テスト基盤**: `functions/__tests__/triggers/bills.events.onCreate.spec.ts` を参照
- Firestore Emulator を使用（`initializeTestEnvironment`）
- `@firebase/rules-unit-testing` を使用

**新規テストファイル**:
- `functions/__tests__/triggers/bills.onSettle.spec.ts`: `settling` → `settled` 遷移時にトリガが発火し、親スナップショットが正しく生成されることを確認
- `functions/__tests__/helpers/billsApi/snapshots.spec.ts`: 各スナップショット計算関数が正しく動作することを確認（`getBillPreviewTotals.ts` と同等の結果になることを検証）

**更新テストファイル**:
- `functions/__tests__/callables/accounting.spec.ts`: `startAccounting` の `meta.paymentMethodsByCategory` 保存をテスト

---

## 確認したファイル一覧

- `functions/src/helpers/billsApi/startAccounting.ts`
- `functions/src/accounting/getBillPreviewTotals.ts`（金額計算の参照元）
- `functions/src/analytics/migrateSettledBillsForBusinessDay.ts`
- `functions/src/analytics/aggregator/markers.ts`
- `functions/src/analytics/aggregator/index.ts`
- `functions/src/analytics/aggregator/delta.ts`
- `functions/src/analytics/aggregator/types.ts`
- `functions/src/triggers/bills.events.onCreate.ts`
- `functions/src/triggers/onSettleCleanupIdempotency.ts`
- `functions/src/callables/accounting.ts`
- `functions/src/analytics/helpers.ts`
- `functions/src/analytics/addToMonthlyIndex.ts`
- `functions/src/analytics/addToDailySummary.ts`
- `functions/src/analytics/addToByCategory.ts`
- `functions/src/analytics/addToByUser.ts`
- `functions/src/analytics/addToByTemplateTournaments.ts`
- `functions/__tests__/triggers/bills.events.onCreate.spec.ts`（既存テスト基盤の参照）
- `docs/bills_migration/p1-10_data_reference_migration_plan.md`
- `docs/bills_migration/schema_plan.md`
- `docs/bills_migration/trigger_plan.md`
- `docs/bills_migration/modification_plan.md`
- `docs/bills_migration/api_contract.md`（`/payments` サブコレクションのフィールド仕様）

