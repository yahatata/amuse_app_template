# 改修計画

_最終更新: 2025-12-02 (JST)_

## 全体像
- **主目的**: `todaysBills` / `settledBills` から `bills`＋サブコレクション＋`activeStays` への統合移行。
- **進め方**: 準備 → 並走 → 撤去の 3 フェーズ。デュアルライトと段階的リード切替で安全に移行する。
- **ステータス表記**: `未着手`, `進行中`, `保留`, `完了` を使用（変更時に更新）。

## フェーズ0（準備・追加実装）
| ID | 領域 | 内容 | 対象ファイル / 成果物 | 依存 | 状態 |
| --- | --- | --- | --- | --- | --- |
| P0-01 | データモデル | `bills` 親・サブコレ、`activeStays` のスキーマ案作成。`businessDate` など命名ルールを確定。 | `firestore.rules`, `firestore.indexes.json`, 設計ドキュメント, `schema_plan.md` | なし | 完了 |
| P0-02 | ヘルパ層 | `getActiveBillByUser`, `appendItem` 等の抽象 API と `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグ仕様策定。 | 新規ヘルパモジュール（パス未定）, `helper_api_plan.md` | P0-01 | 完了 |
| P0-03 | トリガ群 | 会計確定スナップショット、`/events` 差分適用トリガ骨子を作成。 | `functions/src/**` (新規ファイル), `trigger_plan.md` | P0-02 | 完了 |
| P0-04 | Analytics | 新スナップショット構造を受け取れるよう Analytics 更新処理を準備。既存処理との整合を検証。 | `functions/src/analytics/**`, `analytics_plan.md` | P0-03 | 完了 |
| P0-05 | Active Stays | 入店時作成・会計時削除の連携を設計。閉店時 callable でクリーンアップ（TTL撤廃）。 | `functions/src/close_process/cleanupActiveStaysOnClose.ts`, `lib/Home/systemSettingsPage.dart`, `active_stays_plan.md` | P0-03 | 完了 |
| P0-06 | ツール / 運用 | 夜間再計算、TTL 設定、整合監視など補助ツール要件を整理。 | `tools_and_operations_plan.md` | P0-03 | 完了 |
| P0-07 | Active Stays 詳細 | `activeStays` スキーマ確定（TTL撤廃、最小スキーマ化：table/seat/updatedAt削除）、インデックス追加、ルール草案作成。 | `firestore.rules`, `firestore.indexes.json` | P0-01, P0-05 | 完了 |
| P0-08 | API 契約 | bills API 抽象レイヤのメソッド一覧・戻り値・例外・idempotency 契約をドキュメント化。 | `api_contract.md` | P0-02 | 完了 |
| P0-09 | バックアップ | 移行開始前に `todaysBills` / `settledBills` を自動エクスポートする手順書を整備。 | `backup_runbook.md` | なし | 完了 |

## フェーズ1（並走・段階移行）

### フェーズ1 実装ポリシー（Cursor遵守／運用チェックリスト）

**目的**: フェーズ1の"並走移行"期間に、仕様逸脱・データ不整合・ドキュメント未更新を防ぐ。  
**適用範囲**: フェーズ1の全タスク（P1-01〜P1-13）の実装・レビュー・運用。  
**重要**: フェーズ1のステップに進む際は**必ず**本ポリシーを確認すること。

#### 1. 生成前ルール（ChangeSpecを必須化）
Cursorは実装コードを提案する前に必ず「ChangeSpec」を出力し、**ユーザーの承認を得てから実装を開始する**。承認なしにコード生成を開始してはならない。

**ChangeSpec テンプレ（短縮版）**:
```markdown
# ChangeSpec（P1-xx）

## 目的 / 関連文書
- 目的（一行）
- 参照: api_contract.md §.. / helper_api_plan.md §.. / trigger_plan.md §..

## 変更概要（What）
- 新規/更新ファイル（絶対パス）
- 呼び出し元影響範囲（簡易コールグラフ）

## 実装詳細（How）
- 書込み先（billsサブコレ）
- 冪等性（方式・キー・保存先）
- デュアルライト（最小複写内容）
- 権限境界（Functions/Client）
- 競合解決（LWW or なし）
- ログ/メトリクス（出力フィールド）
- 例外（HttpsErrorマッピング）

## 仕様差分（Before→After）
- フロー図（ASCII可）
- Firestoreドキュメント例

## テスト
- 単体（happy/edge/idempotent/permission）
- 統合（DualWrite ON/OFF）
- 手動（3手順以内）

## ドキュメント更新
- Readme / modification_plan / changelog / test_plan に何を追記するか
```

#### 2. 技術原則（SSoT/冪等/時刻/命名）
- **SSoT**: 正は `bills`。`todaysBills` は最小複写・ベストエフォート・再試行なし。失敗はログのみ。
- **冪等性**:
  - `create/start/complete` → `/bills/{billId}/idempotency/{key}`（TTL48h, `requestHash` 付与）
  - `recordPayment` → `/payments/{paymentId}` で `paymentId = providerTxnId` or nonce（docIDが冪等キー）
  - `postEvent*` → `/events/{eventId}` で `eventId = idempotencyKey`（docIDが冪等キー）
  - リプレイ時は副作用なし／`updatedAt` を変更しない
- **時刻・営業日**: すべて JST(UTC+9)。`businessDate = calcBusinessDate(ts, STORE_CLOSE_HOUR)` 厳守。
- **命名**: `paymentPayload.method` のワイヤー値は小文字スネークケースのみ（例: `credit_card`）。UI表示名は別マップ。

#### 3. 実装境界（どこで何を書くか）
- **クライアント禁止**: `amounts`, `categoryBreakdown`, `paymentsSummary`, `postEvents` の書込みはFunctionsのみ。
- **updatePlace**: LWW（`serverTimestamp`到着順）。冪等キーは任意だが推奨。`activeStays` には座席を書かない。
- **会計確定**: 単一トランザクションで再読込→集計→スナップショット書込み。`itemsSnapshot > 700KB` はTop-N圧縮。

#### 4. ロギング／メトリクス（標準形）
- **構造化ログ（全書込み系で必須）**: `op`, `billId`, `idempKey`, `attempt`, `result(ok|reused|fail)`, `code`, `reason`, `requestHash8`
- **メトリクス名**: `bills.op.duration_ms`, `bills.op.retry_count`, `dualwrite.error_count`, `nightly.recalc.delta_count`
- **違反検出**: `dualwrite.error_count > 0` はPRで要調査フラグ。

#### 5. インデックス／ルールの先行適用
- 先行PRで `firestore.indexes.json` と `firestore.rules` をデプロイ → 本体PRは依存を明記。
- 本体PRは "先行デプロイのビルドID" をPR本文に記録。

#### 6. ドキュメント更新（同一PR内で完結）
実装PRには**必ず**以下の差分を含める：
- `README.md`（概要1〜3行）
- `modification_plan.md`（P1-xx 状態更新＋仕様差分1行）
- `changelog.md`（YYYY-MM-DD: P1-xx 要約）
- `test_plan.md`（ケース追加）
- 仕様に影響があれば `api_contract.md` の該当節も更新。

#### 7. テスト規約（最小ライン）
- **単体**: happy / `invalid-argument` / `failed-precondition` / idempotent-replay / permission
- **統合**: `WRITE_TODAYS_BILLS_IN_PARALLEL` ON/OFF の双方で成功。
- **支払系の必須検証**: `providerTxnId` 提供時は `idempotencyKey` と同一でないと `invalid-argument`。
- **手動チェック（3手順以内）**:
  1. `create`→`appendItem`→`startAccounting`→`recordPayment`→`completeAccounting`
  2. 同一 `idempotencyKey` 再送は副作用なし
  3. `postEventRefund`→`paymentsSummary.balanceDueIncl` 減少→nightlyで集計へ反映

#### 8. フィーチャーフラグ／ロールバック
- **フラグ**: `WRITE_TODAYS_BILLS_IN_PARALLEL`。障害時は OFF で旧読み取りを維持（書込みは戻さない）。
- **クリティカル時**: PR Revert + Flag OFF + 最小Hotfix。
- **旧コレクションへの書込み復帰はしない**（読み取りのみ一時許容）。

#### 9. 親ドキュメントサイズと救済
- 親サイズを継続監視。閾値接近で警告ログを出し、`itemsSnapshot` は Top-N＋その他合算へ自動圧縮。
- 閾値・発火条件は `helpers/billsApi/snapshots.ts` に一元化。

#### 10. PR/コミット規約（Conventional Commits）
- **例**: `feat(p1-02): write orders to bills/items with idempotency`
- **PRタイトル**: `[P1-02] items 書込みへ移行（idempotency対応）`
- **本文**: 変更概要 / 仕様差分 / 書込み先 / 冪等方式 / ログ / テスト結果 / 先行インデックスPRリンク

#### 11. "Done" の定義（P1-xx）
- コード＆テストが通過
- ドキュメント4点更新（`README.md` / `modification_plan.md` / `changelog.md` / `test_plan.md`）
- メトリクス/ログでエラーなし
- デュアルライトONで差分0（軽微差分はRunbook記載の上で許容）

#### P1-03 着手前のGo/No-Go（P1-02.1で担保）
- [ ] ordersキーが JST の `businessDate` に統一（境界27/9テスト含む）
- [ ] DualWrite失敗時も `bills` 成功維持（強制失敗の結合テストを追加）
- [ ] 並行実行（同時append／途中でsettling化）の成功・失敗パターンが期待どおり
- [ ] append の idempotency: 同一 `idempotencyKey` で payload 差替→ `failed-precondition`

---

| ID | 領域 | 内容 | 主な対象ファイル | 備考 / フラグ | 状態 |
| --- | --- | --- | --- | --- | --- |
| P1-01 | 入店フロー | `manualCheckIn.ts`, `processVisitByQR.ts` を新スキーマに対応。デュアルライト制御を導入。 | `functions/src/userLogin/manualCheckIn.ts`, `processVisitByQR.ts` | ヘルパ利用 | 完了 |
| | | **仕様差分**: `createBillWithActiveStay` ヘルパAPIで単一トランザクション処理、`businessDate` はサーバ専任、`idempotency` に `requestHash` 保存、`todaysBills` はスケルトン最小複写。**テスト完了**: 単体テスト9件、統合テスト10件、合計19件全て成功。 | | | |
| P1-02 | 注文 | `placeOrder.ts`, `placeOrderByUser.ts` を `/items` 書き込みに変更。合計金額更新は廃止。 | `functions/src/itemOrder/**` | フラグ対応 | 完了 |
| | | **仕様差分**: `appendItem` ヘルパAPIで強い冪等（時間窓なし、expiresAt廃止）、サーバ側でメニュー情報正規化、`orders/_TodaysOrders` スキーマ確定（Chips除外、1種類=1doc）。**テスト完了**: 単体テスト4件、統合テスト41件、合計45件全て成功。詳細は `p1_02_test_results_summary.md` を参照。 | | | |
| P1-02.1 | 注文（仕上げ） | ordersキー=businessDate統一／DualWrite失敗耐性テスト／並行競合テスト／appendのrequestHash不一致テストを追加（仕様は不変・小差分）。**注意**: businessDate不変化テストは一時スキップ（P1-06/P1-11へ移管）。 | tests + 小改修（itemOrder/appendItem） | フラグ対応 | 完了 |
| P1-03 | サイドゲーム | `withdrawTip.ts`, `depositTip.ts` 等を `/sideGameChips` 書き込み＋`place` 更新へ。 | `functions/src/sideGame/**` | idempotency 要検討 | 完了 |
| | | **仕様差分**: `appendSideGameChip` ヘルパAPI実装、サイドゲームのすべての出入り（purchase/deposit/withdraw）を `/bills/{billId}/sideGameChips` に集約、`placeOrder.ts` でChipカテゴリのみ `/sideGameChips` へ記録（Chip以外は従来通り `/items` と `orders/_TodaysOrders`）、deterministic idempotencyKey（`${billId}:${op}:${clientNonce}`）、idempotent replay時のログ重複防止（`appendResult.diagnostics?.reused === true` のときは `sideGameChipLogs` へのログ追加をスキップ）、DualWriteはトランザクション外でベストエフォート実行。**テスト完了**: `appendSideGameChip.spec.ts` 20テスト、`placeOrder.spec.ts` 11テスト（Chip関連含む）、`withdrawTip.spec.ts` 2テスト、`depositTip.spec.ts` 2テスト、合計35テスト全て成功、dualWrite ON/OFF両方で正常動作確認。詳細は `changespecs/P1-03_change_spec.md` を参照。 | | | |
| P1-04 | 座席管理 | `reseatAllPlayers.ts`, `assignSeatToPlayer.ts`, `bustAndExit.ts` 等を `activeStays` 起点に再設計。 | `functions/src/callables/**` | Flutter 側連携 | 完了 |
| | | **仕様差分**: `updatePlace` ヘルパAPI実装（LWW方式、idempotencyKeyは任意、/idempotencyには保存しない）、座席管理系callableが `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`updatePlace` ヘルパAPIを使用して `bills.place` を更新、`pokerName` は `activeStays/{userId}.pokerName` から取得（未設定時は `Player_{userId}` をフォールバック、`todaysBills` には依存しない）、`todaysBills.currentTable`/`currentSeat` への直接更新を削除（DualWriteは `updatePlace` ヘルパAPI内でベストエフォート実行）、`scheduledTournaments` への書き込み構造は変更しない、`bustAndExit.ts` で `tablesSeat/busted` ドキュメントが存在しない場合でも例外にならず自己修復（`transaction.set(..., { merge: true })` を使用）。**テスト完了**: `updatePlace.spec.ts` 11テスト、`assignSeatToPlayer.spec.ts` 7テスト、`bustAndExit.spec.ts` 5テスト、合計23テスト全て成功、dualWrite ON/OFF両方で正常動作確認。詳細は `changespecs/P1-04_change_spec.md` を参照。 | | | |
| P1-05 | トーナメント | 参加・リバイ・アドオン系 callables を `/tournaments/{tplId}` upsert へ変更。 | callables/tournament 系 | ポイント/賞金対応 | 完了 |
| | | **仕様差分**: `recordTournamentAction` ヘルパAPI実装（強い冪等性、requestHash保存、/idempotencyに保存）、トーナメント系callable（`registerForTournament.ts`, `bustAndReentry.ts`, `addon.ts`, `bulkAddon.ts`）が `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`recordTournamentAction` ヘルパAPIを使用して `/bills/{billId}/tournaments/{tplId}` にupsert（entry/reentry/addonアクションごとに適切なフィールドを更新）、`todaysBills.tournaments` への直接更新を削除（DualWriteは `recordTournamentAction` ヘルパAPI内でベストエフォート実行、idempotent replay時はDualWriteをスキップして完全no-op保証）、`scheduledTournaments` への書き込み構造は変更しない、`todaysBills.tournaments` のフィールド名は既存スキーマに合わせて `entryFee`/`reentryFee`/`addonFee` を使用（`/bills/{billId}/tournaments/{tplId}` は `entryFeeIncl`/`reentryFeeIncl`/`addonFeeIncl`）。**テスト完了**: `recordTournamentAction.spec.ts` 13テスト、`registerForTournament.spec.ts` 5テスト、`bustAndReentry.spec.ts` 4テスト、`addon.spec.ts` 4テスト、`bulkAddon.spec.ts` 3テスト、合計29テスト全て成功、dualWrite ON/OFF両方で正常動作確認、idempotent replay時のupdatedAt不変とDualWrite完全no-op保証を検証。詳細は `changespecs/P1-05_change_spec.md` を参照。 | | | |
| P1-06 | 会計開始・会計前編集 | `startAccounting` callableを`bills`正本＋ヘルパAPI化（status, `ops.accountingStartedAt/By`, idempotency, dualwrite）。`updateBill`ヘルパAPI導入と`businessDate`変更拒否（パターンA）。`updateActiveBill` callableを「会計前の明細編集API」として`/bills/{billId}`のitems/extras/sideGameChips/tournamentsを編集するようにする（`businessDate`や`amounts.*`などの金額サマリは触らない）。`updateAccounting.ts`はP1-06では仕様変更しない（todayBillsベースのlegacyとして残し、P1-07で置き換える）。**仕様差分**: `startAccounting` ヘルパAPI実装（強い冪等性、`/idempotency`コレクション使用、requestHash保存、expiresAt=now+48h、idempotent replay時はupdatedAt変更なし、DualWriteはidempotent replay時はスキップ）、`updateBill` ヘルパAPI実装（安全フィールドのみ更新、businessDate変更拒否パターンA、LWW方式、idempotencyKey不使用）、`updateActiveBill` callable再設計（会計前の明細編集API、サブコレクション編集のみ、親フィールドは更新しない、実行条件: status in {'open','in_progress'} かつ ops.accountingStartedAt == null）、`accounting.ts` の `startAccounting` callable更新（新ヘルパAPI使用、支払方法処理とユーザー残高差し引きは現状維持、billsのサブコレクションから金額計算）、`completeAccounting` callableはlegacyとして残置（todaysBillsベース、P1-07でbillsベースに移行予定）。**テスト完了**: `startAccounting.spec.ts` 13テスト、`updateBill.spec.ts` 12テスト、`businessDate.immutability.spec.ts` 1テスト（skip解除、パターンA検証）、`updateActiveBill.spec.ts` 9テスト、`accounting.spec.ts` 7テスト、合計42テスト全て成功、dualWrite ON/OFF両方で正常動作確認。詳細は `changespecs/P1-06_change_spec.md` を参照。 | `functions/src/callables/accounting.ts`, `functions/src/callables/updateActiveBill.ts`, `functions/src/helpers/billsApi/startAccounting.ts`, `functions/src/helpers/billsApi/updateBill.ts`, `functions/src/helpers/billsApi/dualWrite.ts` | トリガ連携 | 完了 |
| P1-07 | 事後イベント & 会計後調整 | `cancelAccounting.ts`, `refundProcessing.ts` を `/events` 追加のみに変更し、トリガで差分反映。旧 `updateAccounting.ts` の役割を置き換える「会計後調整API」を新規追加（/events + `postEvents.totalAdjustmentsIncl` などを更新）。会計後調整APIを操作する UI を Flutter 側に追加（どの画面から・どのように呼ぶかを `api_contract.md` および `README.md` に記載）。**仕様差分**: `postEventRefund`/`postEventAdjustment`/`postEventCancel`/`postEventReopen` ヘルパAPI実装（`/events` 作成のみ、トリガで差分反映、eventId=idempotencyKeyで冪等性保証、pre-settlement statusやvoidedの場合はhelper側でfailed-preconditionを返し`/events`を作成しない）、`cancelAccounting.ts` をpre-settlement専用APIとして再設計（`/bills/{billId}` 直接更新、`/events` には書込まない、status in {'open','in_progress','settling'} のみ許可）、`refundProcessing.ts` の `processRefund` callable更新（`postEventRefund` ヘルパAPI使用）、`updateAccounting.ts` を新世界版として再設計（`postEventAdjustment`/`postEventCancel`/`postEventReopen` ヘルパAPI使用、eventType: 'adjustment'/'cancel'/'reopen'）、`bills.events.onCreate` トリガ実装（`/events` 作成時に `postEvents.*` と `paymentsSummary.*` を更新、`appliedAt` フラグで冪等性保証、pre-settlement statusやvoidedの場合はno-op）、Flutter UI実装（`postAccountingAdjustmentsPage.dart` で伝票一覧表示、`postAccountingRefundDialog.dart`/`postAccountingAdjustmentDialog.dart`/`postAccountingCancelDialog.dart`/`postAccountingReopenDialog.dart` で各操作ダイアログ、`terminalHomePage.dart` にテスト用ナビゲーションボタン追加、Firestoreインデックス追加（businessDate+status+updatedAt））。**テスト完了**: `postEventRefund.spec.ts` 20テスト、`postEventAdjustment.spec.ts` 18テスト、`postEventCancel.spec.ts` 12テスト、`postEventReopen.spec.ts` 10テスト、`bills.events.onCreate.spec.ts` 15テスト、`refundProcessing.spec.ts` 7テスト、`updateAccounting.spec.ts` 9テスト、`cancelAccounting.spec.ts` 8テスト、合計99テスト全て成功。UIとFunctionsの紐付け確認完了（`processRefund` callable ↔ `postAccountingRefundDialog.dart`、`updateAccounting` callable ↔ `postAccountingAdjustmentDialog.dart`/`postAccountingCancelDialog.dart`/`postAccountingReopenDialog.dart`）。詳細は `changespecs/P1-07_change_spec.md` および `P1-07_test_report.md` を参照。 | callable refund 系, `functions/src/callables/updateAccounting.ts`（新世界版）, `functions/src/callables/cancelAccounting.ts`, `functions/src/helpers/billsApi/postEvent*.ts`, `functions/src/triggers/bills.events.onCreate.ts`, Flutter UI (`lib/Accounting/postAccounting*.dart`) | idempotency key 必須, P1-08/P1-10依存 | 完了 |
| P1-08 | 読み取り（Functions） | `getUserOrderHistory.ts`, `verifyPaymentSplit.ts`, `getOpenBills.ts` を `bills` クエリへ移行。**仕様差分**: `getUserOrderHistory.ts` を確定済み履歴専用APIとして再定義（status ∈ {"settled","partially_refunded","refunded","voided"} のみ取得、businessDateフィルタ追加、statusフィルタはFirestoreクエリ側で絞り込み、amounts.grandTotalRoundedをtotalPriceとして返却、itemsは常に空配列[]を返す、itemCountは/itemsサブコレクションの件数から計算）、`verifyPaymentSplit.ts` をbills参照に変更（サブコレクションからextras/items/sideGameChips/tournamentsを取得してカテゴリ別金額を計算、getFirestore()を関数内で呼び出すように修正）、`getOpenBills.ts` をbillsクエリに移行（businessDateフィルタ追加、todaysBillsId→billIdに変更、party.userId/party.pokerName/place.table/place.seatにマッピング）。Firestoreインデックス追加（`getUserOrderHistory` 用: `party.userId` + `businessDate` + `status` + `createdAt` (降順)）。ChangeSpec修正（calcBusinessDateのコード例を実装に合わせて修正、インデックス記述を実装に合わせて修正、getOpenBillsのインデックス利用方針を明文化）。**テスト完了**: `getUserOrderHistory.spec.ts` 10テスト、`verifyPaymentSplit.spec.ts` 8テスト、`getOpenBills.spec.ts` 8テスト、合計26テスト全て成功、businessDate計算の一貫性を確保するためテストで現在時刻を使用。詳細は `changespecs/P1-08_change_spec.md` を参照。 | `functions/src/itemOrder/getUserOrderHistory.ts`, `functions/src/callables/verifyPaymentSplit.ts`, `functions/src/utils/getOpenBills.ts`, `firestore.indexes.json` | `businessDate` フィルタ, **依存: P1-07 (事後イベント & 会計後調整 API + UI)** | 完了 |
| P1-09 | 読み取り（Flutter） | 各画面・サービスを `bills`＋サブコレ対応へ。`activeStays` ストリーム導入。**仕様差分**: Flutter側の読み取り処理を `todaysBills` から `bills` コレクション＋サブコレクション対応へ移行、`getOpenBills` のレスポンス形式変更（`todaysBillsId` → `billId`）に対応、`activeStays` をアプリ全体で1本だけの単一長寿命リスナーで購読する仕組みを導入（P1-13の内容を統合）、`ActiveStaysService` シングルトン実装、`accountingPage.dart` の `_loadActiveBills`/`_loadSettledBills` を `bills` クエリに変更、カテゴリ別金額計算は `getBillPreviewTotals` Cloud Function を使用（実装時に前倒しして導入、テスト完了）、トーナメント関連ファイル（`bust_and_reentry_popup.dart`, `addon_popup.dart`, `bulk_addon_popup.dart`）を `activeStays` → `billId` → `tournaments` サブコレクション経由に変更、参加者リスト取得ファイル（`register_participants_dialog.dart`, `tournament_data_service.dart`, `side_game_table_home.dart`）を `ActiveStaysService.instance.stream` 使用に変更、`stayingUsersListPage.dart`/`menuListPage.dart` の `billId` 対応確認。**テスト完了**: `getBillPreviewTotals.spec.ts` 8テスト全て成功、全件テスト352テスト全て成功。詳細は `changespecs/P1-09_change_spec.md` を参照。 | Flutter 対象 10 ファイル、`functions/src/accounting/getBillPreviewTotals.ts` | 段階的リリース | 完了 |
| P1-10 | 閉店バッチ | `migrateSettledBillsForBusinessDay.ts` を `bills` スナップショット前提へ差し替え。**仕様差分**: Settlement Trigger (`bills.onSettle.ts`) 実装（`before.status !== 'settled' && after.status === 'settled'` で発火、サブコレクション読み取り→スナップショット生成→親doc更新、冪等性: `meta.contentHash` で完全no-op、`cleanupIdempotencyOnSettle` 呼び出し、`ENABLE_SETTLEMENT_AGGREGATOR` フラグで `enqueueSettlement` 呼び出し制御）、snapshots ヘルパ (`snapshots.ts`) 実装（`calculateAmounts`, `calculateCategoryBreakdown`, `buildItemsSnapshot`（700KB超でTop50+_others圧縮）、`buildSideGameChipsSummary`, `buildTournamentsSnapshot`, `calculatePaymentTotals`（/payments優先、meta.paymentMethodsByCategoryフォールバック）、`calculatePaymentsSummary`, `calculateContentHash`）、`startAccounting` callable拡張（`meta.paymentMethodsByCategory` 保存）、`completeAccountingV2` callable追加（bills版、`ops.accountingStartedAt` ガード、status='settled'更新）、`migrateSettledBillsForBusinessDay.ts` 更新（billsクエリ、親docのみ参照、`party.userId`/`party.pokerName`/`categoryBreakdown`/`itemsSnapshot`/`tournamentsSnapshot`/`paymentTotals`参照）、analytics helpers更新（`calculateCategoryAmounts` は `categoryBreakdown` 直接参照、`distributePaymentMethods` は `paymentTotals` をMap化＋fallbackCashAmount/validMethods対応、`addToByCategory` は `itemsSnapshot` 使用＋`_others`対応、`addToByUser` は `party.userId`/`party.pokerName`使用、`addToByTemplateTournaments` は `tournamentsSnapshot`使用）。**テスト完了**: `snapshots.spec.ts` 28テスト、`helpers.spec.ts` 12テスト、`bills.onSettle.spec.ts` 18テスト（追加テスト含む）、合計58テスト全て成功。詳細は `changespecs/P1-10_change_spec.md` を参照。 | Analytics 関連 | 1 リード/伝票, **依存: P1-07 (事後イベント & 会計後調整 API + UI)** | 完了 |
| P1-11 | 監視 | デュアルライト差分チェック、夜間整合確認の仕組みを導入。**追加**: `triggers/bills.businessDateLock.ts` で businessDate 巻き戻し＆監視（パターンB）。→ 対応テスト: `__tests__/triggers/bills.businessDateLock.spec.ts`（新規追加予定） | ロギング設定、監視スクリプト、`functions/src/triggers/bills.businessDateLock.ts` | フラグ終了条件 | 未着手 |
| P1-12 | 親 doc サイズ | 親スナップショットのサイズ監視と救済策（例: `itemsSnapshot` のトップN化）を設計。 | Analytics/監視設定 | P1-10 | 未着手 |
| P1-13 | Flutter リスナー | `activeStays` を単一長寿命リスナーで購読する仕組みを導入。**実装は P1-09（Flutter 読み取り対応）に統合済み。`activeStays` の単一長寿命リスナーは P1-09 で導入。** | Flutter 共通サービス | P1-09 | P1-09に統合 |
| P1-14 | レスポンス確認 | 各Phase1で作成・更新したFunctionsのレスポンス形式とクライアント側（Flutter/LIFF）での使用状況を確認し、適切性を検証する。特に `getUserOrderHistory.ts`, `verifyPaymentSplit.ts`, `getOpenBills.ts`（P1-08）のレスポンス形式と、`getOpenBills` の `billId` 変更（`todaysBillsId` → `billId`）に対するクライアント側の対応状況を確認する。また、P1-01〜P1-08で実装したすべてのFunctionsについて、実際の使用箇所とレスポンス形式の整合性を確認する。 | 確認ドキュメント、必要に応じてクライアント側修正 | P1-08完了後 | 未着手 |

## フェーズ2（撤去・クリーンアップ）
| ID | 領域 | 内容 | 成果物 | 前提条件 | 状態 |
| --- | --- | --- | --- | --- | --- |
| P2-01 | 書き込み停止 | `todaysBills` への write をルールで拒否。監視用途で read は暫定許可。 | `firestore.rules` | デュアルライト停止 | 未着手 |
| P2-02 | 読み取り停止 | 7 日連続でアクセスゼロを確認後、読取も完全停止。 | Flutter/Functions 更新 | 監視レポート | 未着手 |
| P2-03 | 退避 | 旧コレクションをエクスポート／バックアップ。 | GCS / BigQuery エクスポート | P2-02 | 未着手 |
| P2-04 | 削除 | `todaysBills`, `settledBills`, `accountingHistory` を削除。 | 管理者オペレーション記録 | バックアップ完了 | 未着手 |
| P2-05 | 終了報告 | Analytics 確認・最終報告書・ドキュメント整理。 | レポート、フォルダ整理 | P2-04 | 未着手 |
| P2-06 | Analytics 再計算 | 直近 30 日分の再計算ジョブを実行し、数値整合を検収。 | 再計算スクリプト、レポート | P2-05 | 未着手 |
| P2-07 | ルール最終化 | 旧コレクションへの read/write を完全 deny。最終ルールをデプロイ。 | `firestore.rules` | P2-02 | 未着手 |

## インデックス・ルール・監視の留意点
- **推奨インデックス**:
  - `bills`: `(businessDate ASC, status ASC, createdAt DESC)`, `(party.userId ASC, businessDate DESC)`, `(status ASC, updatedAt DESC)`
  - `collectionGroup(events)`: `(originBusinessDate ASC, createdAt DESC)`
  - `activeStays`: 必要最小限（`isActive`, `startedAt`, `uid`）のみ有効化
- **セキュリティルール**:
  - クライアントが更新できるのは `status`, `place.*`, 一部 `ops.*`。金額・スナップショット・`paymentsSummary`・`postEvents` は Functions 限定。
  - サブコレ（`items`/`extras`/`sideGameChips`/`tournaments`/`payments`）は `status != "settled"` の間のみ書込可。
  - `/events` は Functions 経由作成を原則とし、クライアント直書きを禁止することを検討。
- **監視**:
  - 確定トリガ成功率・処理時間・リトライ発生をメトリクス化。
  - `activeStays` ドキュメント数、閉店クリーンアップ実行回数・削除件数を追跡。
  - 親ドキュメントサイズを継続監視し、閾値超過時は警告。

## デュアルライト運用メモ
- フラグ: `WRITE_TODAYS_BILLS_IN_PARALLEL`
- 対象: 入店・注文・座席・トーナメント・会計開始など、営業中の書き込み。
- 停止条件:
  1. 新読み取りが全て `bills` ベースに切替。
  2. 閉店バッチが新スナップショットのみで整合。
  3. 監視で `todaysBills` read/write = 0 を 7 日連続確認。
- 差分突合（nightly）:
  - キー: `billId`（必要に応じて `userId + businessDate`）
  - 比較対象: `grandTotalRounded`, `categoryBreakdown`, `paymentTotals`
  - 差分はログ化→手動補正→再同期を判断。

## 横断項目
- **ドキュメント管理**: 改修・テスト・決定の更新は都度反映し、`changelog.md` に記録。
- **既存機能再利用**: 新規実装前に既存関数の転用可否を検証。転用時はユーザー承認を得る。
- **Idempotency**: `/events` 作成、会計確定トリガ、デュアルライト処理にリトライ耐性を持たせる。
- **スキーマバージョン**: `meta.schemaVersion` を段階的に更新し、Phase1 期間中は後方互換を維持。
- **命名整合**: `businessDate`, `sideGameChips`, サブコレ更新原則を全体で統一。

## 今後の初動
1. スキーマ案とヘルパ設計を固める（P0-01, P0-02, P0-07, P0-08）。
2. 会計確定トリガと差分適用のアーキテクチャ整理（P0-03, P0-04）。
3. バックアップ手順と監視要件の草案を作成（P0-06, P0-09, P1-11）。
4. テスト計画（`test_plan.md`）へ詳細ケースを追記する。
