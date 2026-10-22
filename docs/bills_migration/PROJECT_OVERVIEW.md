# Bills Migration プロジェクト 詳細説明

_最終更新: 2025-11-15 (JST)_

## プロジェクト概要

Bills Migration プロジェクトは、ポーカールームの会計システムにおける**データモデルの大規模リファクタリングプロジェクト**です。従来の `todaysBills` / `settledBills` という2つのコレクションを廃止し、単一の `bills` 親ドキュメント＋サブコレクション構成へ統合することで、**データ整合性の向上、読み取りコストの削減、運用の簡素化**を実現します。

---

## 背景と課題

### 旧システム（移行前）の問題点

1. **データ分散**
   - `todaysBills`: 営業中の伝票データ
   - `settledBills`: 会計確定済みの伝票データ
   - 2つのコレクションにデータが分散し、整合性の維持が困難

2. **読み取りコスト**
   - 営業中の伝票一覧取得時に `todaysBills` 全体をスキャン
   - 会計確定時に `todaysBills` → `settledBills` への移行処理が必要
   - 滞在ユーザー管理が `todaysBills` に混在し、不要なデータも読み込む

3. **データ整合性**
   - 2つのコレクション間でデータの同期が必要
   - 会計確定時の移行処理で不整合が発生するリスク
   - 事後処理（返金・追加徴収）の追跡が困難

4. **運用の複雑さ**
   - 2つのコレクションを管理する必要がある
   - インデックス・セキュリティルールの重複管理
   - デバッグ・監視の複雑化

---

## 新システム（移行後）の設計

### データモデル

```
/bills/{billId}                    # 親ドキュメント（会計データの正本）
  ├─ items/{itemId}               # 注文明細
  ├─ extras/{extraId}             # 追加料金
  ├─ payments/{paymentId}         # 支払い記録
  ├─ sideGameChips/{chipId}       # サイドゲームチップ取引
  ├─ tournaments/{tplId}           # トーナメント参加記録
  └─ events/{eventId}              # 事後イベント（返金・調整・キャンセル・再開）

/activeStays/{uid}                 # 滞在ユーザー管理（最小スキーマ）
```

### 基本原則

1. **SSoT（Single Source of Truth）**
   - `bills` コレクションが唯一の正本
   - 集計/ダッシュボードは **Nightly Recalculation** の結果を正とする
   - リアルタイム `balanceDueIncl` は暫定値

2. **営業中の変更はサブコレクションのみ**
   - 営業中の変更（注文追加、座席変更など）はサブコレクションのみを更新
   - 親ドキュメントは軽微な状態更新（`status`, `place` など）に限定

3. **会計確定時のスナップショット**
   - `amounts.*`, `categoryBreakdown`, `itemsSnapshot` などは **Cloud Functions のみが書き込む**
   - クライアントは金額サマリを直接更新できない

4. **事後処理は `/events` に追記**
   - 返金・追加徴収などの事後処理は `/events` サブコレクションに記録
   - トリガで親ドキュメントの `postEvents.*` と `paymentsSummary` を差分更新
   - Analytics も差分更新で整合性を維持

5. **閉店バッチは親ドキュメントのみ参照**
   - 1伝票あたり1リードに抑える
   - サブコレクションをスキャンしない

6. **`activeStays` は最小スキーマ**
   - `uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ
   - **TTL は使用しない**（会計確定トリガで即時削除＋閉店時 callable でクリーンアップ）
   - 営業中の読み取りコストを削減

---

## プロジェクト構造

### フェーズ0（準備・追加実装）

**目的**: 新システムの基盤を整備

| ID | 領域 | 内容 | 状態 |
| --- | --- | --- | --- |
| P0-01 | データモデル | `bills` 親・サブコレ、`activeStays` のスキーマ案作成 | ✅ 完了 |
| P0-02 | ヘルパ層 | `getActiveBillByUser`, `appendItem` 等の抽象 API 仕様策定 | ✅ 完了 |
| P0-03 | トリガ群 | 会計確定スナップショット、`/events` 差分適用トリガ骨子作成 | ✅ 完了 |
| P0-04 | Analytics | 新スナップショット構造を受け取れるよう Analytics 更新処理を準備 | ✅ 完了 |
| P0-05 | Active Stays | 入店時作成・会計時削除の連携を設計 | ✅ 完了 |
| P0-06 | ツール / 運用 | 夜間再計算、TTL 設定、整合監視など補助ツール要件を整理 | ✅ 完了 |
| P0-07 | Active Stays 詳細 | `activeStays` スキーマ確定（TTL撤廃、最小スキーマ化） | ✅ 完了 |
| P0-08 | API 契約 | bills API 抽象レイヤのメソッド一覧・戻り値・例外・idempotency 契約をドキュメント化 | ✅ 完了 |
| P0-09 | バックアップ | 移行開始前に `todaysBills` / `settledBills` を自動エクスポートする手順書を整備 | ✅ 完了 |

### フェーズ1（並走・段階移行）

**目的**: 新システムと旧システムを並行運用しながら段階的に移行

| ID | 領域 | 内容 | 状態 |
| --- | --- | --- | --- |
| P1-01 | 入店フロー | `manualCheckIn.ts`, `processVisitByQR.ts` を新スキーマに対応 | ✅ 完了 |
| P1-02 | 注文フロー | `placeOrder.ts`, `placeOrderByUser.ts` を `/items` 書き込みに変更 | ✅ 完了 |
| P1-02.1 | 注文（仕上げ） | ordersキー=businessDate統一、DualWrite失敗耐性テスト追加 | ✅ 完了 |
| P1-03 | サイドゲーム | `withdrawTip.ts`, `depositTip.ts` 等を `/sideGameChips` 書き込みへ | ✅ 完了 |
| P1-04 | 座席管理 | `reseatAllPlayers.ts`, `assignSeatToPlayer.ts` 等を `activeStays` 起点に再設計 | ✅ 完了 |
| P1-05 | トーナメント | 参加・リバイ・アドオン系 callables を `/tournaments/{tplId}` upsert へ変更 | ✅ 完了 |
| P1-06 | 会計開始・会計前編集 | `startAccounting` callableを`bills`正本＋ヘルパAPI化 | ✅ 完了 |
| P1-07 | 事後イベント & 会計後調整 | `/events` 追加のみに変更し、トリガで差分反映 | ✅ 実装完了 |
| P1-08 | 読み取り（Functions） | `getUserOrderHistory.ts`, `verifyPaymentSplit.ts` 等を `bills` クエリへ移行 | ⏳ 未着手 |
| P1-09 | 読み取り（Flutter） | 各画面・サービスを `bills`＋サブコレ対応へ | ⏳ 未着手 |
| P1-10 | 閉店バッチ | `migrateSettledBillsForBusinessDay.ts` を `bills` スナップショット前提へ差し替え | ⏳ 未着手 |
| P1-11 | 監視 | デュアルライト差分チェック、夜間整合確認の仕組みを導入 | ⏳ 未着手 |
| P1-12 | 親 doc サイズ | 親スナップショットのサイズ監視と救済策を設計 | ⏳ 未着手 |
| P1-13 | Flutter リスナー | `activeStays` を単一長寿命リスナーで購読する仕組みを導入 | ⏳ 未着手 |

**進捗率**: 約 62%（8/13 フェーズが実装完了）

### フェーズ2（撤去・クリーンアップ）

**目的**: 旧システムを完全に撤去

| ID | 領域 | 内容 | 状態 |
| --- | --- | --- | --- |
| P2-01 | 書き込み停止 | `todaysBills` への write をルールで拒否 | ⏳ 未着手 |
| P2-02 | 読み取り停止 | 7 日連続でアクセスゼロを確認後、読取も完全停止 | ⏳ 未着手 |
| P2-03 | 退避 | 旧コレクションをエクスポート／バックアップ | ⏳ 未着手 |
| P2-04 | 削除 | `todaysBills`, `settledBills`, `accountingHistory` を削除 | ⏳ 未着手 |
| P2-05 | 終了報告 | Analytics 確認・最終報告書・ドキュメント整理 | ⏳ 未着手 |
| P2-06 | Analytics 再計算 | 直近 30 日分の再計算ジョブを実行し、数値整合を検収 | ⏳ 未着手 |
| P2-07 | ルール最終化 | 旧コレクションへの read/write を完全 deny | ⏳ 未着手 |

---

## 主要な技術的決定

### 1. デュアルライト（DualWrite）

**目的**: 移行期間中、新システムと旧システムを並行運用

- **フラグ**: `WRITE_TODAYS_BILLS_IN_PARALLEL`
- **対象**: 入店・注文・座席・トーナメント・会計開始など、営業中の書き込み
- **方式**: ベストエフォート（失敗しても `bills` への書き込みは成功）
- **停止条件**:
  1. 新読み取りが全て `bills` ベースに切替
  2. 閉店バッチが新スナップショットのみで整合
  3. 監視で `todaysBills` read/write = 0 を 7 日連続確認

### 2. 冪等性（Idempotency）

**目的**: ネットワークエラーやリトライ時の重複実行を防止

- **キー形式**: `<billId>:<operationType>:<clientNonce>`
- **保存先**:
  - イベント系: `/bills/{billId}/events/{eventId}` の `eventId` 自体に idempotency key を埋め込む
  - 決済/会計系: `/bills/{billId}/payments/{paymentId}` の `paymentId` にキーを使用
  - 入店系: `/bills/{billId}/idempotency/{key}` に `requestHash` と `expiresAt` (48h) を保存
- **リプレイ時**: 副作用なし、`updatedAt` を変更しない

### 3. 営業日（businessDate）

**目的**: 売上の帰属日を正確に管理

- **算出**: `calcBusinessDate(ts, STORE_CLOSE_HOUR)` で JST ベースで一元管理
- **形式**: `YYYY-MM-DD`（時刻・TZオフセットを含めない純粋な営業日文字列）
- **確定**: Functions が確定し、クライアントは提案値のみ送信
- **不変性**: 作成後は変更不可（パターンA: 変更試行時に `invalid-argument` を返す）

### 4. ステータス遷移

**目的**: 会計の進行状態を明確に管理

```
open → in_progress → settling → settled
                              ↓
                    partially_refunded / refunded / voided
```

- **会計開始**: `open`/`in_progress` → `settling` のみ許可
- **会計確定**: `settling` → `settled` のみ許可
- **事後処理**: `settled` 以降の変更は `/events` 経由で処理

### 5. 金額整合の不変条件（Invariants）

- `grandTotalIncl = subTotalIncl - discountTotalIncl + serviceChargeIncl`
- `grandTotalRounded = roundToCurrency(grandTotalIncl + roundingDelta)`
- `paymentsSummary.balanceDueIncl = grandTotalRounded - postEvents.totalRefundedIncl + postEvents.totalAdjustmentsIncl - paymentsSummary.paidTotalIncl`

---

## 実装済み機能

### ヘルパAPI

1. **`createBillWithActiveStay`**: 入店処理（伝票作成＋滞在記録）
2. **`getActiveBillByUser`**: アクティブな伝票取得
3. **`appendItem`**: 注文明細追加（強い冪等性）
4. **`appendSideGameChip`**: サイドゲームチップ取引記録
5. **`updatePlace`**: 座席情報更新（LWW方式）
6. **`recordTournamentAction`**: トーナメント参加記録（強い冪等性）
7. **`startAccounting`**: 会計開始（強い冪等性、金額再計算）
8. **`updateBill`**: 安全フィールドのみ更新（`businessDate` 変更拒否）
9. **`postEventRefund`**: 返金イベント記録
10. **`postEventAdjustment`**: 追加徴収/減額イベント記録
11. **`postEventCancel`**: 伝票キャンセルイベント記録（post-settlement 専用）
12. **`postEventReopen`**: 伝票再開イベント記録

### Callable

1. **`manualCheckIn`**: 手動チェックイン（新スキーマ対応）
2. **`processVisitByQR`**: QRコードチェックイン（新スキーマ対応）
3. **`placeOrder`**: 注文処理（新スキーマ対応）
4. **`placeOrderByUser`**: ユーザー注文処理（新スキーマ対応）
5. **`withdrawTip`**: チップ引き出し（新スキーマ対応）
6. **`depositTip`**: チップ預け入れ（新スキーマ対応）
7. **`assignSeatToPlayer`**: 座席割り当て（新スキーマ対応）
8. **`reseatAllPlayers`**: 全員座席変更（新スキーマ対応）
9. **`bustAndExit`**: バスト・退場処理（新スキーマ対応）
10. **`registerForTournament`**: トーナメント登録（新スキーマ対応）
11. **`bustAndReentry`**: バスト・再エントリー（新スキーマ対応）
12. **`addon`**: アドオン処理（新スキーマ対応）
13. **`bulkAddon`**: 一括アドオン処理（新スキーマ対応）
14. **`startAccounting`**: 会計開始（新スキーマ対応）
15. **`updateActiveBill`**: 会計前の明細編集（新スキーマ対応）
16. **`cancelAccounting`**: 会計キャンセル（pre-settlement 専用、新スキーマ対応）
17. **`refundProcessing`**: 返金処理（新スキーマ対応）
18. **`updateAccounting`**: 会計後調整（新世界版、新スキーマ対応）

### トリガ

1. **`bills.events.onCreate`**: イベント差分トリガ（`/events` 作成時に `postEvents.*` と `paymentsSummary` を更新）

---

## テスト結果

### 実装済みフェーズのテスト結果

| フェーズ | テスト数 | 結果 |
|---------|---------|------|
| P1-01 | 19 | ✅ 全て成功 |
| P1-02 | 45 | ✅ 全て成功 |
| P1-02.1 | 追加テスト | ✅ 全て成功 |
| P1-03 | 35 | ✅ 全て成功 |
| P1-04 | 23 | ✅ 全て成功 |
| P1-05 | 29 | ✅ 全て成功 |
| P1-06 | 42 | ✅ 全て成功 |
| P1-07 | 65 | ✅ 全て成功 |

**合計**: 258件以上のテストが全て成功

---

## ドキュメント構成

### 計画・設計ドキュメント

- `README.md`: プロジェクト概要・進捗状況
- `modification_plan.md`: フェーズ別の改修タスクと進捗管理
- `schema_plan.md`: データモデル設計
- `helper_api_plan.md`: ヘルパAPI仕様
- `api_contract.md`: Bills API 契約書（メソッド一覧・型定義・エラーコード・冪等性）
- `trigger_plan.md`: トリガ設計
- `analytics_plan.md`: Analytics集計設計
- `ui_compatibility_plan.md`: UI互換アダプタ層設計
- `active_stays_plan.md`: Active Stays 詳細設計
- `tools_and_operations_plan.md`: ツール/運用要件整理

### 実装仕様ドキュメント

- `changespecs/P1-xx_change_spec.md`: 各フェーズの実装仕様

### テスト・運用ドキュメント

- `test_plan.md`: フェーズ／領域ごとの検証計画
- `backup_runbook.md`: バックアップ手順書
- `risk_and_mitigation.md`: リスクと対策の一覧

### 記録ドキュメント

- `decision_log.md`: 意思決定の記録
- `changelog.md`: ドキュメント更新履歴
- `todaysBills_operations_summary.md`: 現行実装の参照用サマリ（旧仕様の参照専用）

---

## 運用ガイドライン

### 基本原則

1. **SSoT（Single Source of Truth）**: 集計/ダッシュボードは **Nightly Recalculation** の結果を正とする
2. **`activeStays` 最小化**: 最小スキーマ（`uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ）、**TTL 不使用**
3. **時刻統一**: すべて JST(UTC+9) で統一
4. **命名整合**: `businessDate`, `sideGameChips`, サブコレ更新原則を全体で統一

### 実装規約

1. **生成前ルール**: ChangeSpecを必須化し、ユーザーの承認を得てから実装を開始
2. **技術原則**: SSoT/冪等/時刻/命名を厳守
3. **実装境界**: クライアント禁止項目（`amounts`, `categoryBreakdown`, `paymentsSummary`, `postEvents` の書込みはFunctionsのみ）
4. **ロギング**: 構造化ログ（`op`, `billId`, `idempKey`, `attempt`, `result`, `code`, `reason`, `requestHash8`）
5. **テスト規約**: 単体・統合・手動テストを必須化

### "Done" の定義

- コード＆テストが通過
- ドキュメント4点更新（`README.md` / `modification_plan.md` / `changelog.md` / `test_plan.md`）
- メトリクス/ログでエラーなし
- デュアルライトONで差分0（軽微差分はRunbook記載の上で許容）

---

## 期待される効果

### 1. データ整合性の向上

- 単一の `bills` コレクションが唯一の正本（SSoT）
- サブコレクションによる構造化されたデータ管理
- 事後イベントの追跡が容易

### 2. 読み取りコストの削減

- 営業中の伝票一覧取得時に `activeStays` のみを参照
- 会計確定時に移行処理が不要
- 閉店バッチは親ドキュメントのみ参照（1伝票あたり1リード）

### 3. 運用の簡素化

- 単一コレクションの管理
- インデックス・セキュリティルールの一元化
- デバッグ・監視の簡素化

### 4. 拡張性の向上

- サブコレクションによる柔軟なデータ構造
- 事後イベントの追跡が容易
- Analytics への差分反映が容易

---

## リスクと対策

詳細は `risk_and_mitigation.md` を参照。主なリスク：

1. **デュアルライト差分**: 夜間バッチで差分を補正
2. **親ドキュメントサイズ**: 700KB 超の場合は Top50 に圧縮
3. **移行期間中の不整合**: 監視とアラートで早期検出
4. **旧システムへの依存**: 段階的な移行でリスクを最小化

---

## 次のステップ

1. **P1-07 のドキュメント更新**: `modification_plan.md` の状態を「完了」に更新
2. **P1-08 の着手**: Functions 側の読み取り処理を `bills` クエリへ移行
3. **P1-09 の着手**: Flutter 側の読み取り処理を `bills`＋サブコレ対応へ
4. **P1-10 の着手**: 閉店バッチを `bills` スナップショット前提へ差し替え

---

## 関連リソース

- **プロジェクトルート**: `docs/bills_migration/`
- **ChangeSpec**: `docs/bills_migration/changespecs/`
- **実装コード**: `functions/src/helpers/billsApi/`, `functions/src/callables/`, `functions/src/triggers/`
- **テストコード**: `functions/__tests__/helpers/billsApi/`, `functions/__tests__/callables/`, `functions/__tests__/triggers/`

