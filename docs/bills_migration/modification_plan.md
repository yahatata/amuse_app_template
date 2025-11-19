# 改修計画

_最終更新: 2025-11-19 (JST)_

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
| P1-04 | 座席管理 | `reseatAllPlayers.ts`, `assignSeatToPlayer.ts`, `bustAndExit.ts` 等を `activeStays` 起点に再設計。 | `functions/src/callables/**` | Flutter 側連携 | 未着手 |
| P1-05 | トーナメント | 参加・リバイ・アドオン系 callables を `/tournaments/{tplId}` upsert へ変更。 | callables/tournament 系 | ポイント/賞金対応 | 未着手 |
| P1-06 | 会計開始 | `accounting.ts`, `updateAccounting.ts`, `updateActiveBill.ts` をステータス／ops 更新に限定。**追加**: `helpers/billsApi/updateBill.ts` で businessDate 変更拒否（パターンA）。→ 対応テスト: `__tests__/bills/businessDate.immutability.spec.ts`（skip解除予定） | `functions/src/callables/**`, `functions/src/helpers/billsApi/updateBill.ts` | トリガ連携 | 未着手 |
| P1-07 | 事後イベント | `cancelAccounting.ts`, `refundProcessing.ts` を `/events` 追加のみに変更。トリガで差分反映。 | callable refund 系 | idempotency key 必須 | 未着手 |
| P1-08 | 読み取り（Functions） | `getUserOrderHistory.ts`, `verifyPaymentSplit.ts` 等を `bills` クエリへ移行。 | Functions 読み取り 4 ファイル | `businessDate` フィルタ | 未着手 |
| P1-09 | 読み取り（Flutter） | 各画面・サービスを `bills`＋サブコレ対応へ。`activeStays` ストリーム導入。 | Flutter 対象 7 ファイル | 段階的リリース | 未着手 |
| P1-10 | 閉店バッチ | `migrateSettledBillsForBusinessDay.ts` を `bills` スナップショット前提へ差し替え。 | Analytics 関連 | 1 リード/伝票 | 未着手 |
| P1-11 | 監視 | デュアルライト差分チェック、夜間整合確認の仕組みを導入。**追加**: `triggers/bills.businessDateLock.ts` で businessDate 巻き戻し＆監視（パターンB）。→ 対応テスト: `__tests__/triggers/bills.businessDateLock.spec.ts`（新規追加予定） | ロギング設定、監視スクリプト、`functions/src/triggers/bills.businessDateLock.ts` | フラグ終了条件 | 未着手 |
| P1-12 | 親 doc サイズ | 親スナップショットのサイズ監視と救済策（例: `itemsSnapshot` のトップN化）を設計。 | Analytics/監視設定 | P1-10 | 未着手 |
| P1-13 | Flutter リスナー | `activeStays` を単一長寿命リスナーで購読する仕組みを導入。 | Flutter 共通サービス | P1-09 | 未着手 |

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
