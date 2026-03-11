# Phase0A タスク一覧

## サマリ版

| # | タスク | 成果物 |
|---|--------|--------|
| 1 | 対象キー列挙・Classification ID 紐付け | 対象一覧（D-01, D-12, D-13 等） |
| 2 | 既存参照箇所の検索・使用経路の確定 | 参照マップ |
| 3 | Before/After（現SSoT・To-Be SSoT）の決定 | 移行方針メモ（[PHASE0A_BEFORE_AFTER_DECISION.md](./PHASE0A_BEFORE_AFTER_DECISION.md)） |
| 4 | 互換期間・ロールバック方針の決定 | [PHASE0A_COMPATIBILITY_ROLLBACK_POLICY.md](./PHASE0A_COMPATIBILITY_ROLLBACK_POLICY.md) |
| 5 | 環境変数設定・デプロイ手順の整備 | [PHASE0A_PARAMS_DEPLOY_GUIDE.md](./PHASE0A_PARAMS_DEPLOY_GUIDE.md) |
| 6 | 実装（TS 修正） | コード変更 |
| 7 | テスト・検証 | 検証結果 |
| 8 | ロールバック手順・監視観点の文書化 | Runbook（1 ページ）※Phase3 で実施 |
| 9 | CHANGE_LOG / DECISION_LOG 更新 | 更新済みログ |

---

## 詳細版

### タスク 1: 対象キー列挙・Classification ID 紐付け

| 項目 | 内容 |
|------|------|
| 目的 | Phase 0A で扱う機密・危険 fallback を一覧化する |
| 対象 ID | D-01（LINE_CHANNEL_ACCESS_TOKEN）, D-12（QR_SECRET_KEY）, D-13（default-store/default-tenant） |
| 作業内容 | store_config_classification を参照し、各 ID の「現状の場所」「リスク」を一覧にまとめる |
| 成果物 | Phase 0A 対象一覧（ID・キー名・ファイルパス・リスク・To-Be 方針）→ [PHASE0A_TARGET_LIST.md](./PHASE0A_TARGET_LIST.md) |
| 所要目安 | 約 2 時間 |

---

### タスク 2: 既存参照箇所の検索・使用経路の確定

| 項目 | 内容 |
|------|------|
| 目的 | 各キーがどこで参照・使用されているかを漏れなく把握する |
| 検索対象 | LINE_CHANNEL_ACCESS_TOKEN, QR_SECRET_KEY, default-store, default-tenant, defineString, process.env 等 |
| 重点ファイル | lineWebhook.ts, lineMessaging.ts, qrCodeUtils.ts, createScheduledTournament.ts, createTournamentRecurrence.ts, enqueueTournamentTasksCore.ts, generateRecurringTournamentsCore.ts |
| 成果物 | 参照箇所・使用経路のマップ（ファイル:行番号、利用シーン）→ [PHASE0A_REFERENCE_MAP.md](./PHASE0A_REFERENCE_MAP.md) |
| 注意 | webhook と service の両方に平文があるため、片方だけの修正で済まないよう参照元を漏れなく列挙 |
| 所要目安 | 約 4 時間 |

---

### タスク 3: Before/After（現SSoT・To-Be SSoT）の決定

| 項目 | 内容 |
|------|------|
| 目的 | 各キーの移行先を明確にする |
| D-01 | Before: defineString（平文 default）→ After: default なし、環境変数はコマンド/コンソールで設定（env ファイルは使用しない） |
| D-12 | Before: process.env + fallback "default-secret-key" → After: 環境変数はコマンド/コンソールで設定（default/fallback 禁止、env ファイルは使用しない） |
| D-13 | Before: ハードコード 'default-store'/'default-tenant' → After: 本番は店舗固有値を Build/Deploy で注入し、未設定時はガード（feature flag） |
| 成果物 | 各 ID の Before/After 一覧 → [PHASE0A_BEFORE_AFTER_DECISION.md](./PHASE0A_BEFORE_AFTER_DECISION.md) |
| 所要目安 | 約 2 時間 |

---

### タスク 4: 互換期間・ロールバック方針の決定

| 項目 | 内容 |
|------|------|
| 目的 | 本番障害時の戻し方を事前に決める |
| 方針 | Secrets は fallback 禁止のため、原則互換期間なし。環境変数はコマンドまたはコンソールで設定し、env ファイルは使用しない。デプロイ前に設定済みを必須とする |
| ロールバック | 環境変数をコンソール/コマンドで旧値へ戻す／ feature flag でガード無効化の手順を定義 |
| 成果物 | [PHASE0A_COMPATIBILITY_ROLLBACK_POLICY.md](./PHASE0A_COMPATIBILITY_ROLLBACK_POLICY.md)（互換期間の有無、ロールバック手順の概要） |
| 所要目安 | 約 1 時間 |

---

### タスク 5: 環境変数設定・デプロイ手順の整備

| 項目 | 内容 |
|------|------|
| 目的 | 環境変数はコマンドまたはコンソールで設定し、env ファイルは使用しない方針で、デプロイ/開発手順を整える |
| 作業内容 | ① コマンド・コンソールによる設定手順 ② 開発段階でのローカル用設定の扱い ③ 本番未設定時エラー確認 |
| 対象 Secret | LINE_CHANNEL_ACCESS_TOKEN, QR_SECRET_KEY |
| 成果物 | [PHASE0A_PARAMS_DEPLOY_GUIDE.md](./PHASE0A_PARAMS_DEPLOY_GUIDE.md)（環境変数設定手順・env 使用禁止方針・本番未設定時方針） |
| 所要目安 | 約 6 時間 |

---

### タスク 6: 実装（TS 修正）

実装前に [TASK6_CHANGESPEC.md](./TASK6_CHANGESPEC.md) を参照し、Functions + Dart + テスト + 既存データ確認のセットで実施する。

| 対象 | 作業内容 | 分類 ID |
|------|----------|---------|
| lineWebhook.ts | 平文 default 削除。環境変数はコマンド/コンソールで設定し、default なし | D-01 |
| lineMessaging.ts | 同上（LINE_CHANNEL_ACCESS_TOKEN） | D-01 |
| qrCodeUtils.ts | `"default-secret-key"` fallback 削除。環境変数はコマンド/コンソールで設定 | D-12 |
| tournament 系 4 ファイル | 本番で `default-store/default-tenant` を使わないガード追加（店舗固有値前提） | D-13 |

**注意**: webhook 側と service 側の両方を漏れなく修正すること。

| 所要目安 | 約 14 時間 |

---

### タスク 7: テスト・検証

| 項目 | 内容 |
|------|------|
| 単体 | Secret 未設定時・設定済み時の挙動 |
| 結合 | LINE webhook 受信・送信、QR トークン生成、tournament 作成フロー |
| 回帰 | 既存機能が壊れていないこと |
| 成果物 | 検証結果メモ（またはチェックリスト） |
| 所要目安 | 約 8 時間 |

---

### タスク 8: ロールバック手順・監視観点の文書化

※ **Phase3 で実施**。本フェーズでは方針・概要のみ確定し、具体手順書の作成は Phase3 に繰り延べる。

| 項目 | 内容 |
|------|------|
| 目的 | 1 ページで説明できるロールバック手順を作る |
| 記載内容 | ① 環境変数をコンソール/コマンドで旧値へ戻す手順 ② feature flag でガード無効化の手順（該当する場合） ③ 監視・アラート観点（例: webhook 失敗率、QR 検証エラー） |
| 成果物 | Runbook（1 ページ程度） |
| 実施時期 | Phase3 |

---

### タスク 9: CHANGE_LOG / DECISION_LOG 更新

| 項目 | 内容 |
|------|------|
| CHANGE_LOG | Phase 0A 完了のエントリ追加（Date, Change ID, Classification IDs, SSoT Before/After, Summary, Rollback, Verification） |
| DECISION_LOG | 既存の D-0001 を参照。必要なら補足エントリ追加 |
| 所要目安 | 約 2 時間 |

---

## 最小チェックリスト（Done 条件）

- [x] 変更対象に Classification ID（D-01, D-12, D-13）を付与した
- [x] 環境変数の設定手順（コマンド/コンソール）を文書化した
- [ ] 監視・アラート観点を記載した（Phase3 で Runbook 作成時に実施）
- [x] `CHANGE_LOG.md` を更新した（Task9 完了）
- [x] 機密の平文 default がコード上に残っていない（Phase0A 完了、lineWebhook/lineMessaging/qrCodeUtils 確認済み）
- [x] 機密 fallback が残っていない（Phase0A 完了）
- [ ] ロールバック手順が 1 ページで説明可能である（Phase3 で Runbook 作成時に実施）
