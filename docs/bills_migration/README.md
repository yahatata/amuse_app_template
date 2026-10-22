# Bills Migration プロジェクト

## サマリー
- 目的: `todaysBills` / `settledBills` を廃止し、単一の `bills` 親ドキュメント＋サブコレクション、滞在管理用 `activeStays` へ統合する。
- 基本原則:
  - 営業中の変更はサブコレクションのみを更新し、親ドキュメントは軽微な状態更新に限定する。
  - 会計確定時のスナップショット（`amounts` や `categoryBreakdown` 等）は **Cloud Functions のみが書き込む**。
  - 返金・追加徴収などの事後処理は `/events` に追記し、親サマリと Analytics を差分更新する。
  - 閉店バッチは親ドキュメントのスナップショットのみを参照し、1 伝票あたり 1 リードに抑える。

```
/bills/{billId}
  ├─ items/{itemId}
  ├─ extras/{extraId}
  ├─ payments/{paymentId}
  ├─ sideGameChips/{chipId}
  ├─ tournaments/{tplId}
  └─ events/{eventId}
/activeStays/{uid}
```

## 目的
- `todaysBills` と `settledBills` を統合し、`bills` コレクション＋サブコレクション構成へ移行する。
- 滞在管理データを `activeStays` で分離し、営業中の読み取りコストを削減する。**`activeStays` は最小スキーマ**（`uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ）。**TTL は使用しない**（会計確定トリガで即時削除＋閉店時 callable でクリーンアップ）。
- 会計スナップショット・事後イベント・分析処理を Cloud Functions に集約し、責務を明確化する。
- **集計/ダッシュボードは Nightly Recalculation の結果を正（SSoT）とする**。リアルタイム `balanceDueIncl` は暫定値。

## 対象範囲
- Firestore データモデル（`bills` 親ドキュメント、各サブコレクション、`activeStays`）の設計とルール・インデックス整備。
- Cloud Functions（書き込みアダプタ、会計確定トリガ、イベント差分、Analytics 更新）の改修。
- Flutter クライアントの読み取り／書き込みロジック刷新。
- デュアルライト期間の制御、閉店バッチ・再計算バッチの移行。

## 進捗状況
- **P1-01（入店フロー）**: 完了。`createBillWithActiveStay` ヘルパAPI実装、`manualCheckIn.ts`/`processVisitByQR.ts` を新スキーマ対応、デュアルライト制御導入。テスト完了（単体テスト9件、統合テスト10件、合計19件全て成功）。
- **P1-02（注文フロー）**: 完了。`getActiveBillByUser`, `appendItem`, `resolveMenuItem` ヘルパAPI実装、`placeOrder.ts`/`placeOrderByUser.ts` を新スキーマ対応、強い冪等（時間窓なし、expiresAt廃止）、サーバ側メニュー情報正規化、`orders/_TodaysOrders` スキーマ確定（Chips除外、1種類=1doc）。テスト完了（単体テスト4件、統合テスト41件、合計45件全て成功）。詳細は `p1_02_test_results_summary.md` を参照。
- **P1-02.1（注文フロー仕上げ）**: 完了。ordersキー=businessDate統一（SSoT原則）、DualWrite失敗耐性テスト、並行競合テスト、appendのrequestHash不一致テスト、並行リプレイテスト、境界日付テスト、DualWrite三分岐ログの厳密一致検証テストを追加。businessDate不変化テストは一時スキップ（P1-06/P1-11へ移管）。詳細は `p1_02_test_results_summary.md` を参照。
- **P1-03（サイドゲームフロー）**: 完了。`appendSideGameChip` ヘルパAPI実装、`withdrawTip.ts`/`depositTip.ts`/`placeOrder.ts`（Chip購入）を新スキーマ対応、サイドゲームのすべての出入り（purchase/deposit/withdraw）を `/bills/{billId}/sideGameChips` に集約、deterministic idempotencyKey、idempotent replay時のログ重複防止。テスト完了（`appendSideGameChip.spec.ts`: 20テスト、`placeOrder.spec.ts`: 11テスト、`withdrawTip.spec.ts`: 2テスト、`depositTip.spec.ts`: 2テスト、合計35テスト全て成功、dualWrite ON/OFF両方で正常動作確認）。詳細は `changespecs/P1-03_change_spec.md` を参照。
- **P1-04（座席管理）**: 完了。`updatePlace` ヘルパAPI実装（LWW方式、idempotencyKeyは任意）、座席管理系callable（`assignSeatToPlayer.ts`, `reseatAllPlayers.ts`, `bustAndExit.ts`）が `activeStays/{userId}` から `billId` を取得、`updatePlace` ヘルパAPIを使用して `bills.place` を更新、`pokerName` は `activeStays/{userId}.pokerName` から取得（`todaysBills` には依存しない）、`todaysBills.currentTable`/`currentSeat` への直接更新を削除（DualWriteは `updatePlace` ヘルパAPI内でベストエフォート実行）、`scheduledTournaments` への書き込み構造は変更しない、`bustAndExit.ts` で `tablesSeat/busted` ドキュメントが存在しない場合でも例外にならず自己修復（`transaction.set(..., { merge: true })` を使用）。テスト完了（`updatePlace.spec.ts`: 11テスト、`assignSeatToPlayer.spec.ts`: 7テスト、`bustAndExit.spec.ts`: 5テスト、合計23テスト全て成功、dualWrite ON/OFF両方で正常動作確認）。詳細は `changespecs/P1-04_change_spec.md` を参照。
- **P1-05（トーナメント管理）**: 完了。`recordTournamentAction` ヘルパAPI実装（強い冪等性、requestHash保存）、トーナメント系callable（`registerForTournament.ts`, `bustAndReentry.ts`, `addon.ts`, `bulkAddon.ts`）が `activeStays/{userId}` から `billId` を取得（存在チェックは本callable側の責務）、`recordTournamentAction` ヘルパAPIを使用して `/bills/{billId}/tournaments/{tplId}` にupsert、`todaysBills.tournaments` への直接更新を削除（DualWriteは `recordTournamentAction` ヘルパAPI内でベストエフォート実行、idempotent replay時はDualWriteをスキップして完全no-op保証）、`scheduledTournaments` への書き込み構造は変更しない。テスト完了（`recordTournamentAction.spec.ts`: 13テスト、`registerForTournament.spec.ts`: 5テスト、`bustAndReentry.spec.ts`: 4テスト、`addon.spec.ts`: 4テスト、`bulkAddon.spec.ts`: 3テスト、合計29テスト全て成功、dualWrite ON/OFF両方で正常動作確認、idempotent replay時のupdatedAt不変とDualWrite完全no-op保証を検証）。詳細は `changespecs/P1-05_change_spec.md` を参照。
- **P1-06（会計開始・会計前編集）**: 完了。`startAccounting` callableを`bills`正本＋ヘルパAPI化（status, `ops.accountingStartedAt/By`, idempotency, dualwrite）。`updateBill`ヘルパAPI導入と`businessDate`変更拒否（パターンA）。`updateActiveBill` callableを「会計前の明細編集API」として`/bills/{billId}`のitems/extras/sideGameChips/tournamentsを編集するようにする（`businessDate`や`amounts.*`などの金額サマリは触らない）。`updateAccounting.ts`はP1-06では仕様変更しない（todayBillsベースのlegacyとして残し、P1-07で置き換える）。テスト完了（`startAccounting.spec.ts` 13テスト、`updateBill.spec.ts` 12テスト、`businessDate.immutability.spec.ts` 1テスト、`updateActiveBill.spec.ts` 9テスト、`accounting.spec.ts` 7テスト、合計42テスト全て成功、dualWrite ON/OFF両方で正常動作確認）。詳細は `changespecs/P1-06_change_spec.md` を参照。
- **P1-07（事後イベント & 会計後調整）**: 完了。`postEventRefund`/`postEventAdjustment`/`postEventCancel`/`postEventReopen` ヘルパAPI実装（`/events` 作成のみ、トリガで差分反映）、`cancelAccounting.ts` をpre-settlement専用APIとして再設計（`/bills/{billId}` 直接更新、`/events` には書込まない）、`refundProcessing.ts` の `processRefund` callable更新（`postEventRefund` ヘルパAPI使用）、`updateAccounting.ts` を新世界版として再設計（`postEventAdjustment`/`postEventCancel`/`postEventReopen` ヘルパAPI使用）、`bills.events.onCreate` トリガ実装（`/events` 作成時に `postEvents.*` と `paymentsSummary.*` を更新）、Flutter UI実装（会計後調整画面と各操作ダイアログ）。テスト完了（`postEventRefund.spec.ts` 20テスト、`postEventAdjustment.spec.ts` 18テスト、`postEventCancel.spec.ts` 12テスト、`postEventReopen.spec.ts` 10テスト、`bills.events.onCreate.spec.ts` 15テスト、`refundProcessing.spec.ts` 7テスト、`updateAccounting.spec.ts` 9テスト、`cancelAccounting.spec.ts` 8テスト、合計99テスト全て成功）。詳細は `changespecs/P1-07_change_spec.md` および `P1-07_test_report.md` を参照。
- **P1-08（読み取り Functions）**: 完了。`getUserOrderHistory.ts` を確定済み履歴専用APIとして再定義（status ∈ {"settled","partially_refunded","refunded","voided"} のみ取得、businessDateフィルタ追加、statusフィルタはFirestoreクエリ側で絞り込み、amounts.grandTotalRoundedをtotalPriceとして返却、itemsは常に空配列[]を返す、itemCountは/itemsサブコレクションの件数から計算）、`verifyPaymentSplit.ts` をbills参照に変更（サブコレクションからextras/items/sideGameChips/tournamentsを取得してカテゴリ別金額を計算、getFirestore()を関数内で呼び出すように修正）、`getOpenBills.ts` をbillsクエリに移行（businessDateフィルタ追加、todaysBillsId→billIdに変更、party.userId/party.pokerName/place.table/place.seatにマッピング）。Firestoreインデックス追加（`getUserOrderHistory` 用: `party.userId` + `businessDate` + `status` + `createdAt` (降順)）。テスト完了（`getUserOrderHistory.spec.ts` 10テスト、`verifyPaymentSplit.spec.ts` 8テスト、`getOpenBills.spec.ts` 8テスト、合計26テスト全て成功、businessDate計算の一貫性を確保するためテストで現在時刻を使用）。詳細は `changespecs/P1-08_change_spec.md` を参照。
- **P1-09（読み取り Flutter）**: 完了。Flutter側の読み取り処理を `todaysBills` から `bills` コレクション＋サブコレクション対応へ移行、`getOpenBills` のレスポンス形式変更（`todaysBillsId` → `billId`）に対応、`activeStays` をアプリ全体で1本だけの単一長寿命リスナーで購読する仕組みを導入（P1-13の内容を統合）、`getBillPreviewTotals` Cloud Function を前倒しして導入（テスト完了）。テスト完了（`getBillPreviewTotals.spec.ts` 8テスト、全件テスト352テスト全て成功）。詳細は `changespecs/P1-09_change_spec.md` を参照。
- **P1-10（閉店バッチ）**: 完了。Settlement Trigger (`bills.onSettle.ts`) 実装、snapshots ヘルパ (`snapshots.ts`) 実装、`startAccounting` callable拡張、`completeAccountingV2` callable追加、`migrateSettledBillsForBusinessDay.ts` を `bills` スナップショット前提へ差し替え、analytics helpers更新。テスト完了（`snapshots.spec.ts` 28テスト、`helpers.spec.ts` 12テスト、`bills.onSettle.spec.ts` 18テスト、合計58テスト全て成功）。詳細は `changespecs/P1-10_change_spec.md` を参照。

## 実行再現方法（P1-02.1）

以下の環境変数を切り替えることで、DualWriteのON/OFFを再現できます。

```bash
# DualWrite ON
WRITE_TODAYS_BILLS_IN_PARALLEL=true npm test -- --runInBand

# DualWrite OFF
WRITE_TODAYS_BILLS_IN_PARALLEL=false npm test -- --runInBand
```

Firestore Emulatorを使用する場合は以下を追加してください。

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080
```

代表テスト:
- `__tests__/helpers/billsApi/appendItem.dualwrite-failure.spec.ts`
- `__tests__/helpers/billsApi/appendItem.concurrent.spec.ts`
- `__tests__/itemOrder/placeOrder.boundary-dates.spec.ts`

## 運用ガイドライン
- 計画・テスト・決定事項は本ディレクトリ内で管理し、更新のたびに内容を追記する。
- 履歴を残すため、既存記述は極力保持し、追記／更新した旨を `changelog.md` に記録する。
- 新しい要件が判明したら `modification_plan.md` に反映し、テストが増えた場合は `test_plan.md` を更新する。
- 重要な判断や仕様確定は `decision_log.md` に日付付きで残す。
- リスクと対応策は `risk_and_mitigation.md` に整理し、状況が変わったら更新する。
- **SSoT（Single Source of Truth）**: 集計/ダッシュボードは **Nightly Recalculation** の結果を正とする。リアルタイム値は暫定。
- **`activeStays` 最小化**: 最小スキーマ（`uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ）。**TTL 不使用**（会計確定トリガで即時削除＋閉店時 callable でクリーンアップ）。

## フォルダ構成
- `todaysBills_operations_summary.md`: 現行実装の参照用サマリ（**旧仕様の参照専用**）
- `modification_plan.md`: フェーズ別の改修タスクと進捗管理
- `test_plan.md`: フェーズ／領域ごとの検証計画
- `decision_log.md`: 意思決定の記録
- `risk_and_mitigation.md`: リスクと対策の一覧
- `changelog.md`: ドキュメント更新履歴
- `schema_plan.md`: データモデル設計
- `helper_api_plan.md`: ヘルパAPI仕様
- `api_contract.md`: Bills API 契約書（メソッド一覧・型定義・エラーコード・冪等性）
- `trigger_plan.md`: トリガ設計
- `analytics_plan.md`: Analytics集計設計
- `ui_compatibility_plan.md`: UI互換アダプタ層設計
- `active_stays_plan.md`: Active Stays 詳細設計
- `tools_and_operations_plan.md`: ツール/運用要件整理
- `backup_runbook.md`: バックアップ手順書（移行前エクスポート手順）

## 記載ルール
- 時刻は基本的に日本時間（JST, UTC+9）で統一。
- ファイルやモジュールを参照する際はプロジェクト内の絶対パスを用いる。
- 箇条書きで簡潔に整理しつつ、必要十分な背景を明記する。

## 既知の懸念事項 / パフォーマンス注意点

### Known limitations / performance notes (P1-09)

**トーナメント関連画面のN×アクセス懸念**:

対象ファイル:
- `lib/user_actions/bulk_addon_popup.dart`
- `lib/user_actions/bust_and_reentry_popup.dart`
- `lib/user_actions/addon_popup.dart`

現仕様では、これらの画面でユーザー数が多い場合、各ユーザーについて `activeStays/{userId}` → `billId` → `/bills/{billId}/tournaments/{tournamentId}` の順に読み取るため、ユーザー数に比例したクエリ数になる。

現時点では仕様として許容するが、今後参加者数が増加した場合には、以下の最適化を検討する：
- `activeStays` のキャッシュ
- batched reads / 集約クエリによる負荷軽減

## 危険点（要判断・要修正候補）

### bills.onSettle の発火条件について（P1-10）

**現状の実装**:
- `bills.onSettle` トリガは `before.status !== 'settled' && after.status === 'settled'` で発火
- つまり、`open` / `in_progress` / `settling` のどれからでも `settled` に遷移すれば発火する

**問題点**:
- 当初の観点（骨組み）では「`settling -> settled` 遷移で発火」を想定していた
- 現在の実装では `open -> settled` でも発火するため、会計開始フロー（`startAccounting`）をすっ飛ばしてスナップショット確定できてしまう可能性がある

**判断が必要な点**:
- 正しい仕様が「`settling` 経由のみ」なら、現在の実装は誤り（`open -> settled` を許すべきではない）
- 正しい仕様が「何からでも `settled` に行ったら確定すべき」なら、現在の実装は正しいが、設計上の重要な決定なので ChangeSpec/trigger_plan.md 等に明文化が必要

**対応**:
- 仕様を確定し、必要に応じて実装を修正するか、ドキュメントに明文化する
- この判断は明確な指示があった場合にのみ実施する（現時点では未確定）
