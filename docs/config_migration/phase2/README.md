# Phase2 README

## 目的

実改修の本体として、Classification 全 ID を To-Be 配置へ段階移行する。

## 着手前の必須確認

**Phase0B の決定事項を必ず確認してから着手すること。**

- [PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md)
- [phase1/PHASE1_ROLLBACK.md](../phase1/PHASE1_ROLLBACK.md)（旧パターン方針・取得失敗時の扱い）
- [phase0B/PHASE0B_BEFORE_AFTER_DECISION.md](../phase0B/PHASE0B_BEFORE_AFTER_DECISION.md)
- [phase0B/PHASE0B_DEPRECATION_PLAN.md](../phase0B/PHASE0B_DEPRECATION_PLAN.md)
- [phase0B/PHASE0B_REFERENCE_MAP.md](../phase0B/PHASE0B_REFERENCE_MAP.md)

上記の To-Be SSoT・廃止計画・参照箇所に従って、ID 単位で実装・検証を行う。Phase0B では実装を行わず「設計・方針の決定」のみ実施しており、参照差し替えと検証は本フェーズのスコープである。

## 重要前提

- Top10 は「優先バッチ」であり、対象全体ではない。
- 母集団は `docs/config_audit/store_config_classification.md` の全 ID（B/D/R）。
- Phase0A/0B/1 のゲートを満たしたものから着手する。
- Phase0B で決定した To-Be SSoT に従って参照を差し替える（Phase0B で実装は行わない方針）。

## スコープ

- ID単位での保存先・参照先切替
- 互換期間の運用
- 検証とロールバック整備

## 進め方（ID単位の標準手順）

1. 対象IDを宣言する（Change ID と紐付け）
2. Before（現保存先/参照先）を確定
3. After（To-Be 保存先/参照先）を確定
4. **取得失敗時の挙動を設計する**（エラーで取得できなかった場合の扱い。設定ごとに検討。defaults fallback / 処理失敗 等）
5. **問題発生時の切り戻し手順を ID ごとに記録する**
6. 実装する（差し替え完了後は旧参照を即削除。旧 env/定数への fallback は持たない）
7. 検証する
8. `CHANGE_LOG.md` / `DECISION_LOG.md` を更新
9. ID状態を `完了` に更新

※ 旧パターン方針: 未リリースアプリのため、移行と並行して旧参照を削除。fallback 維持は行わない。詳細は [phase1/PHASE1_ROLLBACK.md](../phase1/PHASE1_ROLLBACK.md)。

## 推奨実行順

- Batch A: Top10（営業日境界、自動開閉店、会計、人員）
- Batch B: 残りRun項目
- Batch C: Deploy項目の整理
- Batch D: Build項目の整備/運用ルール化

## 参照必須

- `docs/config_migration/PHASE0B_DECISIONS_FOR_LATER_PHASES.md`（Phase0B 決定事項）

## 検証タスク（Phase2 完了後の確認）

- **検証タスク順序**: [verification/VERIFICATION_TASK_ORDER.md](verification/VERIFICATION_TASK_ORDER.md)
- Task 1〜3: 準備（要件抽出・漏れ確認・確認観点の分割）
- Task 4: 実装の確認・修正・テスト・実機テスト・運用時資料の作成

## Done 条件

- 全IDに状態（未着手/移行中/完了）がある
- 完了IDは To-Be 配置に揃っている
- SSoT が単一で説明可能

## 失敗しやすいポイント

- Top10完了で全体完了と誤認する
- ログ更新を後回しにして追跡不能になる
- 取得失敗時の挙動を設定ごとに検討せず、一律で扱う

## 最小チェックリスト

- [x] 対象IDを明示した
- [x] SSoT Before/After を記録した
- [x] Gate を通過した（tsc --noEmit パス、flutter analyze エラー 0）
- [x] 検証結果を記録した（CHANGE_LOG CM-Phase2-001）
- [x] ロールバック方法を記録した（PHASE1_ROLLBACK に基づく即削除方針）

## Phase2 完了サマリ（2026-03-05）

### 移行済み ID（storeMeta/config → defaults フォールバック）

| バッチ | ID | 変更対象 |
|--------|-----|---------|
| B | D-05 | ENABLE_SETTLEMENT_AGGREGATOR → config.features.settlementAggregatorEnabled |
| B | D-07 | WRITE_TODAYS_BILLS_IN_PARALLEL → config.features.dualWriteEnabled |
| B | D-08 | ENQUEUE_SCHEDULER_ENABLED → config.features.enqueueSchedulerEnabled |
| B | D-09 | TEMPLATE_BUSINESSDATE_CHECK → config.features.templateBusinessDateCheck |
| B | B-06 | TABLE_DEVICE_REGISTRATION_ENABLED（スキーマ定義済み、実コード参照なし） |
| A1 | CALC_BUFFER | calcBusinessDateHelpers → config.businessDay.calcBufferMinutes |
| A1 | D-10 | autoOpenClose 3 env → config.autoOpenClose |
| A1 | R-10 | BUSINESS_HOURS_STYLES → config.businessHoursStyles |
| A1 | D-04 | LINE_PLAN defineString → config.linePlan |
| A1 | R-09 | requiredStaffByTimeSlot ハードコード → storeMeta/requiredStaffByTimeSlot |
| A1 | R-11/R-12 | 会計定数 → defaults.ts import + config 引数渡し |
| A2 | R-06 | entranceFee GlobalConstants → StoreConfigService |
| A2 | R-07 | payroll GlobalConstants → StoreConfigService |
| A2 | R-08 | shiftFlow GlobalConstants → StoreConfigService |
| A2 | R-09 | requiredStaffByTimeSlot Flutter → RequiredStaffByTimeSlotService |
| A2 | R-10 | businessHoursStyles Flutter → StoreConfigService |
| A2 | R-11/R-12 | 会計系 Flutter → StoreConfigService |
| A3 | D-04 Web | public/staff/config.js → Firestore 読み取り |

### スコープ外（現 SSoT = To-Be SSoT）

| 区分 | ID | 状態 |
|------|-----|------|
| Deploy | D-02, D-03 (RICHMENU_ID) | 完了（Deploy 維持） |
| Deploy | D-11 (Cloud Tasks env) | 完了（Deploy 維持） |
| Deploy | D-14 (region) | 完了（Deploy 維持） |
| Deploy | D-15 (CRON) | 完了（Deploy 維持） |
| Build | B-01〜B-05, B-07 | 完了（Build 維持、運用ルール化は Phase3） |
| Run | R-01〜R-05 | 完了（既に正しい SSoT） |
| Phase4 | D-06 (STORE_CLOSE_HOUR) | Phase4 で廃止 |
| Phase0A 済 | D-01, D-12, D-13 | 完了 |

### globalConstant.dart 残存定数

Phase2 で移行対象外（Phase4/非 config 定数）:
- `STORE_CLOSE_HOUR`/`STORE_CLOSE_DESCRIPTION`（Phase4）
- `schemaVersion`, `menuCategories`, `sideGameTypes`（UI/ドメイン定数）
- トーナメント設定（`defaultPrizeRatio`, `prizeDistribution` 等）
- CRON 設定（Deploy 項目）
- `pointTypes`（フィールド名定数）
- `ADMIN_CREATED_SHIFT_ID`（識別子）
- `normalizeStoreCloseHour()`（Phase4 で廃止）
