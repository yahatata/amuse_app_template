# Phase2.1 README

**Phase2.1 は完了**（全検討対象の決定・実装済み。TARGET_LIST 参照）

---

## 目的

Phase2 完了時点で `lib/globalConstant.dart` に残るとされた定数について、**Phase3/4 で行うと明確化されているものを除き**、本当に globalConstant に残すべきか再検討する。

寄せ先を変更する場合は、**Phase2 内で** ts/dart の参照・読み取りを漏れなく修正する。

---

## Phase3/4 で明確化されているもの（本フェーズの検討対象外）

以下は Phase3/4 のスコープとして扱い、Phase2.1 では検討しない。

| 定数 | 扱い | 出典 |
|------|------|------|
| `STORE_CLOSE_HOUR` | Phase4 で廃止 | phase4/README.md, DETERMINE_ATTENDANCE_MODE.md |
| `STORE_CLOSE_DESCRIPTION` | Phase4 で廃止（STORE_CLOSE_HOUR に紐づく） | 同上 |
| `normalizeStoreCloseHour()` | Phase4 で廃止（STORE_CLOSE_HOUR に紐づく） | 同上 |

---

## 検討対象一覧

| ID | 定数 | 現状の扱い | 検討観点 |
|----|------|------------|----------|
| B-01 | `schemaVersion` | Build 維持 | 未使用の可能性（config_audit）。storeMeta/config または削除の検討 |
| B-02 | `menuCategories` | Build 維持（UI/ドメイン定数） | storeMeta/config で店舗別に変更可能にするか |
| B-03 | `sideGameTypes` | Build 維持（UI/ドメイン定数） | 同上 |
| B-04 | `defaultPrizeRatio`, `prizeReceiverPercentage`, `prizeRoundingMethod`, `prizeRoundingUnit`, `prizeDistribution` | Build 維持（トーナメント設定） | storeMeta/config に寄せるか |
| B-05 | `pointTypes` | Phase5 へ繰り延べ | 改修 scope が大きく、種類数可変化等の検討が必要。phase5/README.md 参照 |
| B-07 | `ADMIN_CREATED_SHIFT_ID` | 残す（globalConstant） | Flutter/Functions 間で同期必須の識別子。globalConstant に残し、B07/README に変更時修正箇所を記載 |
| D-15 | `WEEKLY_PLANNER_CRON`, `RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON`, `RECURRING_TOURNAMENT_GENERATION_SCHEDULER_RUN_AT_DESCRIPTION`, `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON`, `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_RUN_AT_DESCRIPTION` | 完了（TS 環境変数化） | TS は process.env で上書き可能。Dart はドキュメント用。D15_cron/README.md 参照 |

---

## 実施方針

1. **各定数ごとに検討**  
   残す / storeMeta/config に寄せる / 環境変数に寄せる / 削除 のいずれかを決定する。

2. **寄せ先変更時の実装**  
   - storeMeta/config に寄せる場合:
     - `functions/src/shared/config/defaults.ts` にデフォルト値追加
     - `functions/src/shared/config/types.ts` に型追加（必要に応じて）
     - `configLoader.ts` で取得ロジック追加
     - Dart: `store_config_defaults.dart`, `store_config_service.dart` 対応
     - **全参照箇所**（ts/dart）を漏れなく `getStoreConfig()` または `StoreConfigService` 経由に差し替え
     - `lib/globalConstant.dart` から該当定数を削除
   - 環境変数に寄せる場合:
     - Functions: `process.env` または `defineString` で取得
     - Dart: ビルド時 `--dart-define` または API 経由で取得
     - **全参照箇所**を漏れなく差し替え
     - `lib/globalConstant.dart` から該当定数を削除

3. **残すと決定した場合**  
   理由を明文化し、Phase3 の「運用ルール化」に引き継ぐ。

---

## storeMeta/config 移管手順

storeMeta/config への移管を行う場合は、以下に従う。

- `docs/config_migration/phase2.1/STOREMETA_CONFIG_MIGRATION_PROCEDURE.md` … 移管フロー・方針・手順
- 各項目フォルダ内の `CHANGE_POLICY.md` / `CHANGESPEC.md` … 変更方針・実装仕様

---

## 参照必須

- `docs/config_migration/phase2/README.md`（残存定数一覧）
- `docs/config_migration/phase2/ALL_ID_STATUS.md`（B-01〜B-05, B-07, D-15 の状態）
- `docs/config_migration/phase2/verification/per_id/A3_globalConstantCleanup.md`
- `docs/config_audit/store_config_classification.md`（未使用候補の指摘）
- `lib/globalConstant.dart`（現状の定数一覧）

---

## Done 条件

- 検討対象の全定数について「残す / 寄せる / 削除」の決定がなされている
- 寄せる/削除と決定したものについて、ts/dart の参照が漏れなく修正されている
- `lib/globalConstant.dart` から不要な定数が削除されている
- 運用時資料（`storeMeta/configによる設定の詳細/`）への追記が完了している（寄せ先が config の場合）
- `docs/運用時資料/設定/取得失敗時の挙動設計.md` および `設定の不具合時の対応.md` への追記が完了している（同上）

---

## Phase2.1 完了日

上記 Done 条件を満たし、Phase2.1 は完了。
