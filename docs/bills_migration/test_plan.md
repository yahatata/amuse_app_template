# テスト計画

_最終更新: 2025-12-02 (JST)_

## 目的
- `bills` 移行に伴う機能・データ整合性・分析結果の品質を保証する。
- フェーズごとに必要な検証観点を明確化し、進捗に応じて追記・更新する。

## テスト分類
- **単体テスト**: Cloud Functions 新規モジュール／ヘルパのロジック検証。
- **統合テスト**: Firestore エミュレータを用いた書き込み → トリガ動作 → サマリ反映の確認。
- **エンドツーエンド**: Flutter クライアントと Functions の連携確認、実機テストを含む。
- **リグレッション**: Analytics・ダッシュボードの数値一致を確認する再計算テスト。

## フェーズ0（準備）テスト観点
- スキーマ定義・ルールの静的チェック（`businessDate`, `sideGameChips` など命名整合）。
- 新トリガ・ヘルパの単体テスト雛形作成。
- Analytics 差分計算ロジックのテストデータセット準備。

### 最小テスト追加（スキーマ確定に伴う）
- **updatePlace の LWW 挙動**: 複数端末から同時に `bills.place.*` を更新した場合、`serverTimestamp()`（受信時刻）を優先して LWW で競合解決されること。ユニットテストで検証。
- **payments の冪等性**:
  - 同一 `providerTxnId` で二重送信時に二重登録されないこと（docID 一意制約で検出）。
  - `providerTxnId` がある場合、`idempotencyKey` と不一致だと `invalid-argument` になること。
- **events の冪等性**: 同一 `eventId`（= `idempotencyKey`）で二重送信しても no-op（前回レスポンス相当）であること。副作用なし、`updatedAt` 変更なし。

## 共通テスト環境ポリシー（Firestore/Emulator）

- Admin SDK は **[DEFAULT] アプリ**に統一する（実装コードは `getFirestore()` 引数なしを前提とするため）。
  - 初期化: `admin.initializeApp({ projectId })`
  - 取得:   `const db = getFirestore()`（引数なし）
  - 事故防止: `beforeAll` で `expect(admin.apps[0]?.name).toBe('[DEFAULT]')` を入れて検知してもよい。

- **名前付きアプリを使わない**（`initializeApp(config, 'app-xxx')` を禁止）。実装と食い違うと「The default Firebase app does not exist」や意図しないプロジェクト参照で落ちる。

- Emulator 使用時は必ず `process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'` を設定する。

- 並列実行による競合を避けるため、結合テストは `--runInBand` で単一ワーカー実行とする（npm script で強制）。

- `beforeEach` は `testEnv.clearFirestore()` を必須化し、テスト間のデータ残存を防ぐ。

- `afterAll` は以下を必須化:
  - `await testEnv.cleanup()`（存在する場合）
  - `await Promise.all(admin.apps.map(a => a.delete()))`
  - `delete process.env.FIRESTORE_EMULATOR_HOST`

- テスト中に「存在しない可能性のある doc」に対しては `update()` を使わず、**`set({...}, { merge: true })` を原則**とする（例：`bills.place.*` の設定）。

- 期待値の整合: 単価×数量の合計を厳密に計算し、例示（A=500円×(1+2)、B=300円×1 ⇒ 合計 1800円）のような誤期待値を禁止。

- 将来、マルチアプリ対応が必要になった場合は実装側で `getDb(app?)` ヘルパを導入して一本化し、**テストも同ヘルパに従う**（現時点は [DEFAULT] 方針を維持）。

### Firestore テストセットアップ雛形

```typescript
beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  if (admin.apps.length) {
    await Promise.all(admin.apps.map(a => a.delete()));
  }
  admin.initializeApp({ projectId: 'test-project-bills' }); // [DEFAULT]
  db = getFirestore(); // 引数なし
  // 任意: 早期検知
  // expect(admin.apps[0]?.name).toBe('[DEFAULT]');
});

afterAll(async () => {
  if (typeof testEnv?.cleanup === 'function') {
    await testEnv.cleanup();
  }
  if (admin.apps.length) {
    await Promise.all(admin.apps.map(a => a.delete()));
  }
  delete process.env.FIRESTORE_EMULATOR_HOST;
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});
```

## フェーズ1（並走）テスト観点
- **入店フロー（`createBillWithActiveStay`）**: 冪等性（同一 `idempotencyKey` で再実行時は既存docを返却、`updatedAt` 変更なし）、重複入店チェック（既に `activeStays/{uid}` が存在する場合は `failed-precondition`）、デュアルライト（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグON時は `todaysBills` にスケルトン複写、失敗時も `bills` への書込みは成功）。
  - **実施済みテスト（P1-01完了）**:
    - 単体テスト（`calcBusinessDate.spec.ts`）: 9件全て成功
      - STORE_CLOSE_HOUR=27/9 の境界テスト、デフォルト値テスト、24-48指定の正規化テスト
    - 統合テスト（`createBillWithActiveStay.spec.ts`）: 10件全て成功
      - happy path、invalid-argument（3件）、failed-precondition（重複入店）、idempotent-replay、idempotent-replay（ハッシュ不一致）、businessDate サーバ専任、DualWrite ON/OFF（2件）
    - 詳細は `p1_01_test_summary.md` を参照
- **注文フロー（`appendItem`）**: 強い冪等性（時間窓なし、expiresAt廃止、同一 `clientNonce` で再実行時は並行送信でも作成は1回のみ、片方は `reused: true`、親updatedAtはリプレイで変更されない）、サーバ側メニュー情報正規化（クライアントのname/category/priceは無視、menuItemIdから解決）、デュアルライト（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグON時は `todaysBills.items` 配列に行追加、金額は更新しない、三分岐ログ: success/failed/skipped を厳密一致で検証）、`orders/_TodaysOrders` スキーマ確定（Chips除外、1種類=1doc、`bills.place.table`/`bills.place.seat` を同梱、ordersキーは `bill.businessDate` をSSoTとして生成）。テストは本書の「共通テスト環境ポリシー」に準拠し、[DEFAULT] アプリ + `getFirestore()`（引数なし）を強制する。
  - **実施済みテスト（P1-02完了）**:
    - 単体テスト（`resolveMenuItem.spec.ts`）: 4件全て成功
    - 統合テスト（`getActiveBillByUser.spec.ts`, `appendItem.spec.ts`, `placeOrder.spec.ts`, `placeOrderByUser.spec.ts`）: 41件全て成功
    - 詳細は `p1_02_test_results_summary.md` を参照
  - **実施済みテスト（P1-02.1完了）**:
    - 統合テスト（`appendItem.dualwrite-failure.spec.ts`）: 6件全て成功（DualWrite失敗耐性、三分岐ログ厳密一致検証）
    - 統合テスト（`appendItem.concurrent.spec.ts`）: 2件全て成功（並行競合）
    - 統合テスト（`appendItem.mismatch.spec.ts`）: 2件全て成功（requestHash不一致）
    - 統合テスト（`appendItem.parallel-replay.spec.ts`）: 1件全て成功（並行リプレイ）
    - 統合テスト（`placeOrder.boundary-dates.spec.ts`）: 12件全て成功（境界日付、年跨ぎ・月跨ぎ・うるう年・平年・閉店時刻差分）
    - 統合テスト（`businessDate.immutability.spec.ts`）: 1件スキップ（P1-06/P1-11へ移管）
    - 詳細は `p1_02_test_results_summary.md` を参照
- **サイドゲームフロー（`appendSideGameChip`）**: サイドゲームのすべての出入り（purchase/deposit/withdraw）を `/bills/{billId}/sideGameChips` に集約、deterministic idempotencyKey（`${billId}:${op}:${clientNonce}`）、idempotent replay時のログ重複防止（`appendResult.diagnostics?.reused === true` のときは `sideGameChipLogs` へのログ追加をスキップ）、DualWriteはトランザクション外でベストエフォート実行、`placeOrder.ts` でChipカテゴリのみ `/sideGameChips` へ記録（Chip以外は従来通り `/items` と `orders/_TodaysOrders`）。
  - **実施済みテスト（P1-03完了）**:
    - 統合テスト（`appendSideGameChip.spec.ts`）: 20件全て成功
      - happy path（withdraw/deposit/purchase）、invalid-argument（chipQty/amountIncl/action/billId/idempotencyKey）、not-found（billId）、failed-precondition（status=settling/settled/voided）、idempotent-replay（reused: true、updatedAt不変）、idempotent-replay（requestHash不一致）、DualWrite ON/OFF
    - 統合テスト（`placeOrder.spec.ts`）: 11件全て成功（Chip関連含む）
      - Chipカテゴリの注文で `/sideGameChips` に記録、`/items` には記録されない、`sideGameChipLogs` にpurchaseログ追加、idempotent replay時にログ重複なし、非Chipメニューは従来通り `/items` と `orders/_TodaysOrders` に記録
    - 統合テスト（`withdrawTip.spec.ts`）: 2件全て成功
      - 正常系（初回呼び出し）、idempotent replay（同じclientNonceで2回呼び出し、残高とログが1回分のみ）
    - 統合テスト（`depositTip.spec.ts`）: 2件全て成功
      - 正常系（初回呼び出し）、idempotent replay（同じclientNonceで2回呼び出し、残高とログが1回分のみ）
    - 全テストファイル（20ファイル）をdualWrite ON/OFF両方で実行し、全て正常動作確認（Test Suites: 19 passed, 1 skipped / Tests: 136 passed, 1 skipped）
    - 詳細は `changespecs/P1-03_change_spec.md` を参照
- **座席管理フロー（`updatePlace`）**: LWW方式（serverTimestamp()到着順で最終値を採用）、idempotencyKeyは任意（/idempotencyには保存しない）、座席管理系callableが `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`pokerName` は `activeStays/{userId}.pokerName` から取得（未設定時は `Player_{userId}` をフォールバック、`todaysBills` には依存しない）、DualWriteはトランザクション外でベストエフォート実行、`scheduledTournaments` への書き込み構造は変更しない、`bustAndExit.ts` で `tablesSeat/busted` ドキュメントが存在しない場合でも例外にならず自己修復（`transaction.set(..., { merge: true })` を使用）。
  - **実施済みテスト（P1-04完了）**:
    - 統合テスト（`updatePlace.spec.ts`）: 11件全て成功
      - happy path（正常更新、null更新）、invalid-argument（billId未指定、table/seat型不正）、not-found（billId不存在）、failed-precondition（status=settled）、LWW動作（複数端末から同時更新）、idempotencyKey指定時の動作（/idempotencyには保存されず、通常のLWWとして上書き）、DualWrite ON/OFF（3件）
    - 統合テスト（`assignSeatToPlayer.spec.ts`）: 7件全て成功
      - happy path（正常更新、pokerNameフォールバック）、エラーハンドリング（activeStays不存在、billId未設定、isEnabled=false、seat既使用）、waitingドキュメント不存在時の挙動
    - 統合テスト（`bustAndExit.spec.ts`）: 5件全て成功
      - happy path（正常退席）、エラーハンドリング（activeStays不存在、billId未設定、userId不一致）、bustedドキュメント不存在時の自己修復
    - 詳細は `changespecs/P1-04_change_spec.md` を参照
- **トーナメント管理フロー（`recordTournamentAction`）**: 強い冪等性（requestHash保存、/idempotencyに保存）、トーナメント系callable（`registerForTournament.ts`, `bustAndReentry.ts`, `addon.ts`, `bulkAddon.ts`）が `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`recordTournamentAction` ヘルパAPIを使用して `/bills/{billId}/tournaments/{tplId}` にupsert（entry/reentry/addonアクションごとに適切なフィールドを更新）、`todaysBills.tournaments` への直接更新を削除（DualWriteは `recordTournamentAction` ヘルパAPI内でベストエフォート実行、idempotent replay時はDualWriteをスキップして完全no-op保証）、`scheduledTournaments` への書き込み構造は変更しない、`todaysBills.tournaments` のフィールド名は既存スキーマに合わせて `entryFee`/`reentryFee`/`addonFee` を使用（`/bills/{billId}/tournaments/{tplId}` は `entryFeeIncl`/`reentryFeeIncl`/`addonFeeIncl`）。
  - **実施済みテスト（P1-05完了）**:
    - 統合テスト（`recordTournamentAction.spec.ts`）: 13件全て成功
      - happy path（entry/reentry/addon）、invalid-argument（billId/templateId/action/idempotencyKey未指定）、not-found（billId不存在）、failed-precondition（status=settled、requestHash不一致）、idempotent replay（reused: true、updatedAt不変、DualWrite完全no-op保証）、DualWrite ON/OFF（2件）
    - 統合テスト（`registerForTournament.spec.ts`）: 5件全て成功
      - happy path（正常エントリー、scheduledTournaments更新）、エラーハンドリング（activeStays不存在、billId未設定）、todaysBills直接更新削除確認
    - 統合テスト（`bustAndReentry.spec.ts`）: 4件全て成功
      - happy path（正常リエントリー）、エラーハンドリング（activeStays不存在、billId未設定、maxReentriesPerPlayer制限）
    - 統合テスト（`addon.spec.ts`）: 4件全て成功
      - happy path（正常アドオン）、エラーハンドリング（activeStays不存在、billId未設定、isAddon: false）
    - 統合テスト（`bulkAddon.spec.ts`）: 3件全て成功
      - happy path（複数ユーザー一括アドオン）、エラーハンドリング（activeStays不存在ユーザー含む）、既にAddon済みユーザーのスキップ
    - 詳細は `changespecs/P1-05_change_spec.md` を参照
- **会計開始・会計前編集フロー（`startAccounting`, `updateBill`, `updateActiveBill`）**: `startAccounting` ヘルパAPI実装（強い冪等性、`/idempotency`コレクション使用、requestHash保存、expiresAt=now+48h、idempotent replay時はupdatedAt変更なし、DualWriteはidempotent replay時はスキップ）、`updateBill` ヘルパAPI実装（安全フィールドのみ更新、businessDate変更拒否パターンA、LWW方式、idempotencyKey不使用）、`updateActiveBill` callable再設計（会計前の明細編集API、サブコレクション編集のみ、親フィールドは更新しない、実行条件: status in {'open','in_progress'} かつ ops.accountingStartedAt == null）、`accounting.ts` の `startAccounting` callable更新（新ヘルパAPI使用、支払方法処理とユーザー残高差し引きは現状維持、billsのサブコレクションから金額計算）。
  - **実施済みテスト（P1-06完了）**:
    - 単体テスト（`startAccounting.spec.ts`）: 13件全て成功
      - happy path（正常な会計開始、status=in_progressの場合も会計開始可能）、invalid-argument（billId未指定、idempotencyKey未指定、accountingStartedBy未指定）、not-found（billId不存在）、failed-precondition（status=settled/settling、requestHash不一致）、idempotent-replay（reused: true、updatedAt不変）、DualWrite ON/OFF（3件、idempotent replay時はDualWriteをスキップ）
    - 単体テスト（`updateBill.spec.ts`）: 12件全て成功
      - happy path（status更新、ops.*更新、meta.*更新）、invalid-argument（billId未指定、updatesが空、businessDate変更拒否、amounts.*変更拒否、categoryBreakdown変更拒否）、not-found（billId不存在）、LWW動作（複数端末からの同時更新で最終値が採用）、DualWrite ON/OFF（2件）
    - 統合テスト（`businessDate.immutability.spec.ts`）: 1件全て成功（skip解除、パターンA検証）
      - `updateBill` ヘルパAPI経由でbusinessDate変更拒否を検証（パターンA）、パターンB（トリガによる巻き戻し）はP1-11で別テストに切り出す
    - 統合テスト（`updateActiveBill.spec.ts`）: 9件全て成功
      - happy path（会計前請求書の明細編集、既存のリクエストスキーマからサブコレクションへの変換）、エラーハンドリング（権限不足、billId不存在、accountingStartedAtがnull以外、statusがopen/in_progress以外）、親フィールド更新拒否（businessDate, amounts.*, categoryBreakdown, postEvents.*, paymentsSummary.*が更新されない）、DualWrite ON/OFF（2件、totalPriceは更新されない）
    - 統合テスト（`accounting.spec.ts` startAccounting部分）: 7件全て成功
      - happy path（会計開始、status=settling、ops.accountingStartedAt設定）、エラーハンドリング（権限不足、billId不存在、statusがsettledの場合）、支払方法処理とユーザー残高差し引きが現状維持で動作すること、DualWrite ON/OFF（2件）
    - 詳細は `changespecs/P1-06_change_spec.md` を参照
- **事後イベント & 会計後調整フロー（`postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen`, `bills.events.onCreate` トリガ）**: `/events` ベースの会計後調整API（旧 `updateAccounting.ts` 相当）実装、`cancelAccounting.ts` をpre-settlement専用APIとして再設計、`refundProcessing.ts` の `processRefund` callable更新、`updateAccounting.ts` を新世界版として再設計、`bills.events.onCreate` トリガ実装、Flutter UI実装。
  - **実施済みテスト（P1-07完了）**:
    - 統合テスト（`postEventRefund.spec.ts`）: 20件全て成功
      - happy path（部分返金、全額返金、status遷移）、invalid-argument（amountIncl<=0、billId/idempotencyKey未指定）、not-found（billId不存在）、failed-precondition（pre-settlement status、返金累計超過、balanceDueIncl<0、status=refundedからの追加返金）、idempotent replay（reused: true、updatedAt不変）、DualWrite ON/OFF（2件）
    - 統合テスト（`postEventAdjustment.spec.ts`）: 18件全て成功
      - happy path（追加徴収、減額、status遷移）、invalid-argument（amountIncl<=0、sign不正、billId/idempotencyKey未指定）、not-found（billId不存在）、failed-precondition（pre-settlement status、netSalesIncl<0、balanceDueIncl<0、status=refundedからの調整）、idempotent replay（reused: true、updatedAt不変）、DualWrite ON/OFF（2件）
    - 統合テスト（`postEventCancel.spec.ts`）: 12件全て成功
      - happy path（正常キャンセル、status=voided）、invalid-argument（billId/idempotencyKey未指定）、not-found（billId不存在）、failed-precondition（pre-settlement status、status=partially_refunded/refunded/voidedからのキャンセル、paidTotalIncl!=0、totalRefundedIncl!=0）、idempotent replay（reused: true、updatedAt不変）、DualWrite ON/OFF（2件）
    - 統合テスト（`postEventReopen.spec.ts`）: 10件全て成功
      - happy path（正常再開、status=in_progress）、invalid-argument（billId/idempotencyKey未指定）、not-found（billId不存在）、failed-precondition（pre-settlement status、status=partially_refunded/refunded/voidedからの再開）、idempotent replay（reused: true、updatedAt不変）、DualWrite ON/OFF（2件）
    - 統合テスト（`bills.events.onCreate.spec.ts`）: 15件全て成功
      - refundイベント処理（部分返金、全額返金、status遷移、balanceDueIncl更新）、adjustmentイベント処理（追加徴収、減額、netSalesIncl更新、balanceDueIncl更新）、cancelイベント処理（status=voided）、reopenイベント処理（status=in_progress）、pre-settlement statusやvoidedの場合はno-op、appliedAtフラグで冪等性保証、バリデーション（netSalesIncl<0、balanceDueIncl<0）
    - 統合テスト（`refundProcessing.spec.ts`）: 7件全て成功
      - happy path（正常返金）、エラーハンドリング（認証なし、権限不足、billId不存在、postEventRefundエラー）、レスポンス形式確認
    - 統合テスト（`updateAccounting.spec.ts`）: 9件全て成功
      - happy path（adjustment/cancel/reopen）、エラーハンドリング（認証なし、権限不足、billId不存在、eventType不正、adjustment時のsign/amountIncl未指定）、レスポンス形式確認
    - 統合テスト（`cancelAccounting.spec.ts`）: 8件全て成功
      - happy path（正常キャンセル、status=open/in_progress/settling、ops.accountingStartedAt/Byクリア）、エラーハンドリング（認証なし、権限不足、billId不存在、statusが条件外）、startAccounting再実行可能、`/events` への書込なし
    - UIとFunctionsの紐付け確認完了（`processRefund` callable ↔ `postAccountingRefundDialog.dart`、`updateAccounting` callable ↔ `postAccountingAdjustmentDialog.dart`/`postAccountingCancelDialog.dart`/`postAccountingReopenDialog.dart`）
    - 詳細は `changespecs/P1-07_change_spec.md` および `P1-07_test_report.md` を参照
- **読み取り（Functions）フロー（`getUserOrderHistory`, `verifyPaymentSplit`, `getOpenBills`）**: `getUserOrderHistory.ts` を確定済み履歴専用APIとして再定義（status ∈ {"settled","partially_refunded","refunded","voided"} のみ取得、businessDateフィルタ追加、statusフィルタはFirestoreクエリ側で絞り込み、amounts.grandTotalRoundedをtotalPriceとして返却、itemsは常に空配列[]を返す、itemCountは/itemsサブコレクションの件数から計算）、`verifyPaymentSplit.ts` をbills参照に変更（サブコレクションからextras/items/sideGameChips/tournamentsを取得してカテゴリ別金額を計算）、`getOpenBills.ts` をbillsクエリに移行（businessDateフィルタ追加、todaysBillsId→billIdに変更、party.userId/party.pokerName/place.table/place.seatにマッピング）。
  - **実施済みテスト（P1-08完了）**:
    - 統合テスト（`getUserOrderHistory.spec.ts`）: 10件全て成功
      - happy path（正常な注文履歴取得、複数の確定済み伝票、0件パターン、amounts.grandTotalRoundedがtotalPriceとして返却、itemCount計算）、invalid-argument（認証なし）、businessDateフィルタ（当日の営業日のみ取得、前日の営業日の伝票は取得されない）、statusフィルタ（確定済み伝票のみ取得、進行中の伝票は取得されない）
    - 統合テスト（`verifyPaymentSplit.spec.ts`）: 8件全て成功
      - happy path（正常な支払い分割計算の照合、クライアント側とサーバー側の結果が一致/不一致の場合）、invalid-argument（認証なし、billId未指定）、not-found（指定された請求書が見つからない場合）、サブコレクション取得（extras/tournaments/items/sideGameChipsが正しく取得される、空のサブコレクションの場合の処理確認）
    - 統合テスト（`getOpenBills.spec.ts`）: 8件全て成功
      - happy path（正常な入店中ユーザー一覧取得、status="open"の伝票のみ取得、ソート確認（pokerName順））、empty（入店中ユーザーがいない場合の空配列返却）、レスポンス形式（billIdフィールドが正しく返却、party.userId/party.pokerName/place.table/place.seatが正しくマッピング）、businessDateフィルタ（当日の営業日のstatus="open" billのみ取得、前日のbusinessDateを持つbillは含まれない）
    - 詳細は `changespecs/P1-08_change_spec.md` を参照
- **読み取り（Flutter）フロー（`accountingPage`, `ActiveStaysService`, `getBillPreviewTotals`）**: Flutter側の読み取り処理を `todaysBills` から `bills` コレクション＋サブコレクション対応へ移行、`getOpenBills` のレスポンス形式変更（`todaysBillsId` → `billId`）に対応、`activeStays` をアプリ全体で1本だけの単一長寿命リスナーで購読する仕組みを導入（P1-13の内容を統合）、`getBillPreviewTotals` Cloud Function を前倒しして導入。
  - **実施済みテスト（P1-09完了）**:
    - 統合テスト（`getBillPreviewTotals.spec.ts`）: 8件全て成功
      - happy path（全サブコレクションから正しく金額を計算、itemsでtotalPriceInclがない場合はunitPriceIncl*quantityで計算、sideGameChipでchipCountがない場合はamountIncl/SIDE_GAME_CHIP_EXCHANGE_RATEから算出）、not-found（存在しないbillIdを渡すとHttpsErrorがスローされる）、サブコレクションが空の場合でも0で返る、不正な値が含まれるケース（amountInclにnullが含まれていても0として扱う）、invalid-argument（billIdが空文字列/未指定の場合）
    - 詳細は `changespecs/P1-09_change_spec.md` を参照

### DualWrite ログ契約仕様

| 状態 | logger メソッド | メッセージ | keys(厳密) |
|------|------------------|-------------|-------------|
| success | info  | `dualWrite appendItem ok` | op, billId, itemId, dualWriteResult |
| failed  | warn  | `dualWrite appendItem failed` | op, billId, itemId, dualWriteResult, reason |
| skipped | info  | `dualWrite appendItem skipped` | op, billId, itemId, dualWriteResult |

上記のログフォーマットはすべてのappendItem処理で統一されることを保証する。
各テストは `appendItem.dualwrite-failure.spec.ts` にて厳密一致検証を行う。

- 入店 → 注文 → 会計確定 → 返金イベントまでを新旧コレクションで比較。
- 会計確定トリガが Top50 圧縮を発動するケース (itemsSnapshot >700KB)。
- イベントトリガが netSales/balanceDue ガード条件に違反した場合 `failed-precondition` を返すこと。
- `/payments` の byMethod で許容リスト外キーを送信した際に `invalid-argument` が返ること。
- 冪等リプレイで既存レスポンスを返すケースで親 `updatedAt` が変化しないこと。
- `/events` トリガの冪等性と `originBusinessDate` / `eventBusinessDate` の反映確認。
- `activeStays` の onSnapshot / 即時削除 / 閉店クリーンアップ連携の確認。
- 深夜跨ぎ（`storeCloseHour` 境界）で `businessDate` が正しく割り当てられること。
- 部分返金イベントで `postEvents`・`paymentsSummary`・`analyticsDaily(originBusinessDate)` が正しい差分になること。
- 二重実行（同一 `idempotencyKey`）で副作用が発生しないこと。
- 並行更新（`items` 追加と `status -> settled`）が競合しても確定トリガが再集計し整合すること。
- 親ドキュメントの `itemsSnapshot` が 1MB 未満を維持すること（名称・カテゴリ・数量・税込額のみ）。
- 注文時（`appendItem`）に `orders/{YYYYMMDD}/_TodaysOrders/{orderId}` に `bills.place.table`, `bills.place.seat` が同梱されること。
- 座席移動（`updatePlace`）後に注文した場合、最新の `bills.place.*` が `_TodaysOrders` に反映されること。
- Flutter UI の読み取り専用制御、`activeStays` 長寿命リスナーの再接続回数（≤5/日）。
- Analytics／閉店バッチで旧ロジックとの差分が無いことを nightly ログで記録。

## フェーズ2（撤去）テスト観点
- `todaysBills` write deny 後のクライアント／Functions のエラー検知とリカバリ。
- 監視で `todaysBills` read/write = 0 を 7 日連続確認。
- バックアップデータの検証、削除後に再計算した Analytics が migration 前後で一致すること。
- 直近 30 日分の再計算ジョブ実行と結果検収。

## テストデータ管理
- テストケースごとに入力データを整理し、再現性を高める。
- 返金・追加徴収・Void・深夜跨ぎ・トーナメント・サイドゲーム・座席移動（`bills.place.*` 更新）を網羅する。

## 受け入れ基準（Done 定義）
- Analytics: 新旧操作で `analyticsMonthly` の数値差分が ±0（遡及イベントを含む）。
- 信頼性: 会計確定トリガ成功率 ≥ 99.9%、リトライでも差分が二重反映されない。
- 性能: 閉店バッチは 1 伝票につき親ドキュメント 1 リードのみ。`activeStays` リスナーの張り直し ≤ 5 回/日。
- コスト: `activeStays` ストリームを単一購読に統一し、不要な再購読を抑制。
- 運用: `todaysBills` read/write = 0 を 7 日連続監視で確認後、旧コレ削除へ進む。

## 今後のタスク
- フェーズ0完了後に各観点をテストケース単位で具体化し、本書に追記。
- 実装変更でテスト対象が増えた場合は即時更新する。
