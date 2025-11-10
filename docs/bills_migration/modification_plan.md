# 改修計画

_最終更新: 2025-11-10 (JST)_

## 全体像
- **主目的**: `todaysBills` / `settledBills` から `bills`＋サブコレクション＋`activeStays` への統合移行。
- **進め方**: 準備 → 並走 → 撤去の 3 フェーズ。デュアルライトと段階的リード切替で安全に移行する。
- **ステータス表記**: `未着手`, `進行中`, `保留`, `完了` を使用（変更時に更新）。

## フェーズ0（準備・追加実装）
| ID | 領域 | 内容 | 対象ファイル / 成果物 | 依存 | 状態 |
| --- | --- | --- | --- | --- | --- |
| P0-01 | データモデル | `bills` 親・サブコレ、`activeStays` のスキーマ案作成。`businessDate` など命名ルールを確定。 | `firestore.rules`, `firestore.indexes.json`, 設計ドキュメント | なし | 未着手 |
| P0-02 | ヘルパ層 | `getActiveBillByUser`, `appendItem` 等の抽象 API と `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグ仕様策定。 | 新規ヘルパモジュール（パス未定） | P0-01 | 未着手 |
| P0-03 | トリガ群 | 会計確定スナップショット、`/events` 差分適用トリガ骨子を作成。 | `functions/src/**` (新規ファイル) | P0-02 | 未着手 |
| P0-04 | Analytics | 新スナップショット構造を受け取れるよう Analytics 更新処理を準備。既存処理との整合を検証。 | `functions/src/analytics/**` | P0-03 | 未着手 |
| P0-05 | Active Stays | 入店時作成・会計時削除の連携を設計。TTL/バッチでのクリーンアップ方針を確定。 | `functions/src/userLogin/**`, 会計トリガ | P0-03 | 未着手 |
| P0-06 | ツール / 運用 | 夜間再計算、TTL 設定、整合監視など補助ツール要件を整理。 | `functions/src/scripts/**` (想定) | P0-03 | 未着手 |
| P0-07 | Active Stays 詳細 | `activeStays` スキーマ確定（TTL=48h）、不要単一インデックス無効化、ルール草案作成。 | `firestore.rules`, `firestore.indexes.json` | P0-01 | 未着手 |
| P0-08 | API 契約 | bills API 抽象レイヤのメソッド一覧・戻り値・例外・idempotency 契約をドキュメント化。 | 設計ドキュメント, ヘルパ仕様書 | P0-02 | 未着手 |
| P0-09 | バックアップ | 移行開始前に `todaysBills` / `settledBills` を自動エクスポートする手順書を整備。 | 運用 Runbook | なし | 未着手 |

## フェーズ1（並走・段階移行）
| ID | 領域 | 内容 | 主な対象ファイル | 備考 / フラグ | 状態 |
| --- | --- | --- | --- | --- | --- |
| P1-01 | 入店フロー | `manualCheckIn.ts`, `processVisitByQR.ts` を新スキーマに対応。デュアルライト制御を導入。 | `functions/src/userLogin/manualCheckIn.ts`, `processVisitByQR.ts` | ヘルパ利用 | 未着手 |
| P1-02 | 注文 | `placeOrder.ts`, `placeOrderByUser.ts` を `/items` 書き込みに変更。合計金額更新は廃止。 | `functions/src/itemOrder/**` | フラグ対応 | 未着手 |
| P1-03 | サイドゲーム | `withdrawTip.ts`, `depositTip.ts` 等を `/sideGameChips` 書き込み＋`place` 更新へ。 | `functions/src/sideGame/**` | idempotency 要検討 | 未着手 |
| P1-04 | 座席管理 | `reseatAllPlayers.ts`, `assignSeatToPlayer.ts`, `bustAndExit.ts` 等を `activeStays` 起点に再設計。 | `functions/src/callables/**` | Flutter 側連携 | 未着手 |
| P1-05 | トーナメント | 参加・リバイ・アドオン系 callables を `/tournaments/{tplId}` upsert へ変更。 | callables/tournament 系 | ポイント/賞金対応 | 未着手 |
| P1-06 | 会計開始 | `accounting.ts`, `updateAccounting.ts`, `updateActiveBill.ts` をステータス／ops 更新に限定。 | `functions/src/callables/**` | トリガ連携 | 未着手 |
| P1-07 | 事後イベント | `cancelAccounting.ts`, `refundProcessing.ts` を `/events` 追加のみに変更。トリガで差分反映。 | callable refund 系 | idempotency key 必須 | 未着手 |
| P1-08 | 読み取り（Functions） | `getUserOrderHistory.ts`, `verifyPaymentSplit.ts` 等を `bills` クエリへ移行。 | Functions 読み取り 4 ファイル | `businessDate` フィルタ | 未着手 |
| P1-09 | 読み取り（Flutter） | 各画面・サービスを `bills`＋サブコレ対応へ。`activeStays` ストリーム導入。 | Flutter 対象 7 ファイル | 段階的リリース | 未着手 |
| P1-10 | 閉店バッチ | `migrateSettledBillsForBusinessDay.ts` を `bills` スナップショット前提へ差し替え。 | Analytics 関連 | 1 リード/伝票 | 未着手 |
| P1-11 | 監視 | デュアルライト差分チェック、夜間整合確認の仕組みを導入。 | ロギング設定、監視スクリプト | フラグ終了条件 | 未着手 |
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
  - `activeStays` ドキュメント数、TTL 削除件数を追跡。
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
