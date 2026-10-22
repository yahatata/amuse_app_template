# 決定記録

_最終更新: 2025-11-10 (JST)_

| 日付 | 事項 | 内容 | 関連ファイル | フォローアップ |
| --- | --- | --- | --- | --- |
| 2025-11-10 | データモデル分割 | `todaysBills` / `settledBills` を廃止し、`bills`＋サブコレクション＋`activeStays` に統合する方針を確定。 | `README.md`, `modification_plan.md` | フェーズ0でスキーマ詳細化 |
| 2025-11-10 | ヘルパ設計 | 共通ヘルパ層を先に整備し、既存コードの差し替え起点とする。 | `modification_plan.md` | P0-02 実装時に詳細策定 |
| 2025-11-10 | Analytics 必須要素 | 遡及イベントは `originBusinessDate` / `eventBusinessDate` を必須フィールドとして実装。 | `test_plan.md` | トリガ実装時にテストケース追加 |
| 2025-11-10 | 記録保持 | `bills` を会計記録の唯一の正とし、`settledBills` / `accountingHistory` は廃止予定。 | `modification_plan.md` | P2-03 以降で撤去 |
| 2025-11-10 | 店舗分離方針 | storeId は利用せず、プロジェクト／DB 分離でマルチ店舗を吸収する。 | `README.md` | フェーズ0でインデックス確認 |
| 2025-11-10 | 税処理方針 | 内税運用を継続し、税額は確定時に逆算して固定化する。 | `modification_plan.md`, `test_plan.md` | トリガ設計で共通サービス化 |
| 2025-11-10 | activeStays 保持期間 | 会計確定トリガで即時削除しつつ、閉店時 callable でクリーンアップする（TTL は使用しない）。 | `modification_plan.md`, `risk_and_mitigation.md`, `active_stays_plan.md` | P0-05 実装完了 |
| 2025-11-10 | businessDate算出 | 全APIで共通ユーティリティ `calcBusinessDate` を使用し、JSTベースで一元管理する。 | helper_api_plan.md | P0-03 でユーティリティ実装 |
| 2025-11-10 | idempotency運用 | 入店系は `/idempotency` にTTL付きで保存し、支払/イベントのキーは履歴として保持する。 | helper_api_plan.md | 実装時に lifecycle を適用 |
| 2025-11-10 | dual write 範囲 | 旧 `todaysBills` へは営業中表示に必要な最小フィールドのみ複写し、金額系は新 `bills` を正とする。 | helper_api_plan.md | Phase1 で監視 |
| 2025-11-10 | statusガード | 会計開始は `open`/`in_progress` → `settling`、確定は `settling` → `settled` のみ許可し、違反時は `failed-precondition` を返す。 | helper_api_plan.md | P1-06 実装 |
| 2025-11-10 | paymentキー正規化 | `paymentTotals` / `paymentsSummary` の byMethod キーは小文字スネークケースに正規化し、許容リスト外は拒否する。 | helper_api_plan.md | P0-04 の共通サービスで適用 |

| 2025-11-10 | updatedAt責務 | 親ドキュメントの `updatedAt` は Functions のみが更新し、冪等リプレイ時は変更しない。 | `schema_plan.md`, `helper_api_plan.md` | firestore.rules でクライアント更新を拒否 |
| 2025-11-10 | businessDate確定 | `businessDate` は Functions が確定し、クライアントは提案値のみ送信。不一致時は矯正または `failed-precondition`。 | `schema_plan.md`, `helper_api_plan.md` | P0-03 でユーティリティ実装 |
| 2025-11-10 | events ID ポリシー | `/events/{eventId}` の ID = idempotencyKey とし、再送時はdoc再利用で副作用なし。 | `helper_api_plan.md` | 実装時に命名規約を適用 |
| 2025-11-10 | itemsSnapshot圧縮 | `itemsSnapshot` が 700KB 超の場合は売上額 Top50 に圧縮するフォールバックを導入。 | `schema_plan.md`, `helper_api_plan.md` | `snapshots.ts` 実装で適用 |
| 2025-11-10 | payments一意性 | `providerTxnId` を支払IDとして優先活用し、無い場合は生成ID＋フィールド組み合わせで一意検証。 | `helper_api_plan.md` | `payments.ts` 実装で適用 |

| 2025-11-10 | settlement trigger | `settling` → `settled` は Functions トリガで再計算し、サマリに Top50 圧縮・contentHash を適用する。 | `trigger_plan.md` | P0-03 実装メモ |
| 2025-11-10 | event trigger | `/events` 作成時は差分をトランザクションで適用し、Analytics へ差分反映する。| `trigger_plan.md` | P0-03 実装メモ |

| 2025-11-10 | Analyticsレイヤ | `analyticsMonthly` で sales/events/cashflow/net の4層構造を維持し、originBusinessDate を基準キーとする。 | `analytics_plan.md` | P0-04 実装 |
| 2025-11-10 | 事後差分の扱い | 返金・追徴は `bills` 親の `postEvents.*` に累計し、analytics は親docのみを読み取る。 | `analytics_plan.md` | トリガ実装で遵守 |
| 2025-11-10 | 返金 attribution | イベントカテゴリ指定はデフォルトで無効とし、`ALLOW_EVENT_ATTRIBUTION` 有効時のみ受理。 | `analytics_plan.md` | 実装時にフラグを導入 |
| 2025-11-10 | aggregationMarkers | settlement は billId、event は eventId をマーカーにして冪等制御する。 | `analytics_plan.md` | Aggregator 実装 |

| 2025-11-10 | activeStays スキーマ | uid=docID, isActive=true のみ有効。TTL は使用せず、Functions のみ書込。 | `active_stays_plan.md` | P0-05 実装完了 |
| 2025-11-10 | activeStays 削除 | 会計確定トリガで即時削除、失敗時は閉店時 callable でクリーンアップ。 | `active_stays_plan.md` | P0-05 実装完了 |
| 2025-11-10 | activeStays 読み取り | Flutter は単一長寿命リスナーで購読し、張り直し ≤ 5回/日を目安。 | `active_stays_plan.md` | P1-13 実装 |

| 2025-11-10 | 夜間再計算 | analyticsMonthly.net.balanceDueIncl は nightly 再計算の結果を"正"とし、毎日 3:00 JST に実行。 | `tools_and_operations_plan.md`, `analytics_plan.md` | P0-06 完了 |
| 2025-11-10 | 整合監視 | デュアルライト差分チェック・親ドキュメントサイズ監視・activeStays 監視・会計確定トリガ監視を定義。 | `tools_and_operations_plan.md` | P0-06 完了 |
| 2025-11-10 | TTL 設定 | idempotency サブコレクションのみ TTL を使用（48h）。activeStays は TTL 不使用。 | `tools_and_operations_plan.md` | P0-06 完了 |

| 2025-11-10 | Nightly ジョブスケジュール | STORE_CLOSE_HOUR 準拠に変更。固定 03:00 JST ではなく、STORE_CLOSE_HOUR:00/30/(+1):00 で動的生成。 | `tools_and_operations_plan.md`, `functions/src/config/ops.ts` | P0-06 修正完了 |

