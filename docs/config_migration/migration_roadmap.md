# Config Migration Roadmap

## 1. 全体方針

- 優先順位: 安全性 > 整合性 > 運用容易性 > 整理
- 対象は Top10 に限定せず、`docs/config_audit/store_config_classification.md` の全 ID（Build/Deploy/Run）を母集団として扱う。
- 先に事故要因（Secrets/弱い fallback/SSoT 不整合）を抑え、二重管理を掃除したうえで Run-time 化を段階実施する。
- 変更は小さく分割し、フェーズごとに Done 条件とロールバック手順を持つ。
- Run-time 化の着手条件: 対象 ID の SSoT が単一化されていること。
- パターンA固定（1 Repo -> 店舗別アプリ/店舗別 Firebase/店舗別 Functions）を前提とし、店舗単位更新を標準化する。

## 2. フェーズ構成

### Phase 0A: 先行是正（Secrets/危険fallback）

- 目的
  - 平文 default 機密の排除
  - `default-store/default-tenant` の本番残存ガード方針確立
- 対象
  - `functions/src/domains/webhook/callables/lineWebhook.ts`
  - `functions/src/domains/webhook/services/lineMessaging.ts`
  - `functions/src/domains/user/services/qrCodeUtils.ts`
  - tournament 系 `default-store/default-tenant` 使用箇所
- 完了条件
  - 機密に default が無い
  - store/tenant の未設定時挙動が明文化される
  - 環境変数はコマンド/コンソールで設定し、env ファイルは使用しない方針が Decision Log で確定する（D-0009）
- 補足
  - **Task8（Runbook・具体手順書）は Phase3 で実施**。Phase0A では方針・概要の確定にとどめる（D-0012）。
- ロールバック
  - 環境変数をコンソール/コマンドで旧値へ戻す
  - 詳細 Runbook は Phase3 で作成する

### Phase 0B: 二重管理の掃除（SSoT単一化）

- 目的
  - 同義設定の重複定義を整理し、移行先を1つに決める
  - 無駄な Run-time 化を避ける
- 対象
  - `STORE_CLOSE_HOUR`（Dart const + Functions env）
  - 会計ポリシー（Dart + TS）
  - 営業時間スタイル/必要人数（Dart + TS）
  - `linePlan`（Dart + Functions params + public config）
- 完了条件
  - 各対象 ID に `現SSoT -> To-Be SSoT` が決定される
  - 「重複参照ゼロ」の確認観点が定義される
  - storeMeta/config 仕様（読み取り優先度・デフォルト値）が定義される
- スコープ
  - **実装・検証は Phase2 で実施**。Phase0B は設計・方針の決定に限定する。参照差し替えには Phase1 の storeMeta/config 取得層が必要なため。
- 後続フェーズでの必須確認
  - Phase1/2 着手前に `docs/config_migration/PHASE0B_DECISIONS_FOR_LATER_PHASES.md` を確認すること
- ロールバック
  - deprecate 定義を期限付きで保持

### Phase 1: 基盤整備（Config 基盤） ✅ 完了

- 目的
  - `storeMeta/config` 読み取り/更新基盤を整備
  - ConfigLoader/FeatureGate の責務分離
- 主要作業
  - Functions 側 `storeMeta/config` 取得層
  - Flutter 側は購読/表示用途に限定（確定ロジックは持たない）
  - 更新経路は管理者 callable 経由に統一
  - 詳細設定ページ（AdminHomePage→詳細設定）に初期セットアップボタン設置
- 完了条件
  - `storeMeta/config` スキーマ・権限・欠損時挙動が実装/記録される ✅
- ロールバック
  - 未リリースアプリのため、旧パターンは移行完了と同時に削除。fallback 維持は行わない。詳細は [phase1/PHASE1_ROLLBACK.md](./phase1/PHASE1_ROLLBACK.md)

### Phase 2: 全量移行（ID駆動） ✅ 完了

- 対象
  - `store_config_classification.md` の全 ID（B-*/D-*/R-*）
  - Top10 は優先バッチとして先行実施
- 実施手順（IDごと）
  1. IDの `現SSoT/To-Be SSoT` を確定
  2. 読み取り責務/更新責務を確定
  3. 互換期間（fallback有無）を決定
  4. 実装・検証・ログ更新
- 完了条件
  - 全 ID に状態（未着手/移行中/完了）が付与される
  - 移行対象 ID の実参照元が To-Be 側へ寄る
  - Functions 最終決定の前提が保持される
  - 店舗1店のみ更新 -> 検証 -> 横展開の手順が運用可能
- ロールバック
  - 差し替え完了 ID は旧参照を即削除。fallback 維持しない。切り戻しは ID ごとの手順に従い、必要時はコードデプロイで差し替え前の状態へ戻す。詳細は [phase1/PHASE1_ROLLBACK.md](./phase1/PHASE1_ROLLBACK.md)

### Phase 2.1: globalConstant 残存定数の再検討

- 目的
  - Phase2 完了時点で `lib/globalConstant.dart` に残るとされた定数のうち、Phase3/4 で扱うと明確化されているもの（STORE_CLOSE_HOUR 関連）を除き、本当に残すべきか再検討する
  - storeMeta/config や環境変数に寄せる場合は、Phase2 内で ts/dart の参照・読み取りを漏れなく修正する
- 対象
  - B-01（schemaVersion）、B-02（menuCategories）、B-03（sideGameTypes）、B-04（トーナメント設定）、B-05（pointTypes）、B-07（ADMIN_CREATED_SHIFT_ID）、D-15（CRON 設定）
- 詳細
  - [phase2.1/README.md](./phase2.1/README.md)、[phase2.1/TARGET_LIST.md](./phase2.1/TARGET_LIST.md)
- ロールバック
  - 寄せ先変更後は旧参照を即削除。切り戻しはコードデプロイで差し替え前の状態へ戻す。

### Phase 5: pointTypes 改修（案）

- 目的
  - Phase2.1 で繰り延べた B-05（pointTypes）の仕様決定と実装
- 対象
  - B-05（pointTypes）
- 背景
  - ポイント名称変更を反映すべき URL・TS ファイル等が多数ある
  - 現状 3 種類固定だが、種類数の可変・増加の必要性が検討対象
- 詳細
  - [phase5/README.md](./phase5/README.md)（案ベース。実施時に再検討・確定する）
- ロールバック
  - 未定（実施時に定義する）

### Phase 3: ハードニングと最終整理

- 目的
  - `globalConstant` の「設定」を縮退し、UI定数/表示定数へ役割整理
  - docs-only 設定（`--dart-define` 記載のみ）を実装済み扱いしない
  - 運用手順/監査ログの定着
- 完了条件
  - 同義設定の重複定義が解消または非推奨明記される
  - 全 ID が「運用モード（Build/Deploy/Run）」で説明可能
  - decision/change log が更新される
  - 店舗追加/単店舗更新/全店舗更新の Runbook が完成している
  - **Phase0A Task8**: ロールバック手順・監視観点の Runbook を完成させる
- ロールバック
  - 掃除前定義を deprecate として一時復活可能にする

### Phase 4: 夜間ジョブ・打刻改修（Phase3 完了後に実施）

- 目的
  - 夜間再計算・夜間整合確認をスケジューラから離脱し、閉店処理/Cloud Task 起動へ移行
  - `STORE_CLOSE_HOUR` を廃止（D-06 の完全解消）
  - スタッフ打刻を出勤/退勤に明確に分離し、例外時は管理者認証で解消
- スコープ
  - `runNightlyRecalculateBalanceDue`, `runNightlyIntegrityCheck`: 閉店処理または Cloud Task から起動、STORE_CLOSE_HOUR 不使用
  - `determineAttendanceMode`: STORE_CLOSE_HOUR 廃止、出勤/退勤分離、未退勤ありの出勤・長時間経過後の退勤は管理者認証必須
- 実装タイミング
  - Phase3 終了後。詳細は `docs/config_migration/phase4/` を参照
- ロールバック
  - 閉店処理からの呼び出しを外す。スケジューラ復帰は非推奨

## 3. 各フェーズの Done 定義

- 設計: Decision Log が更新されている
- 実装: 影響範囲が Change Log に記録されている
- 検証: 必須回帰項目を通過している
- 運用: ロールバック手順が1ページで説明可能
- 網羅性: classification の全 ID に状態と担当フェーズが割当済み
- 配布運用: 店舗単位更新と全店舗横展開の双方が手順化されている

## 4. リスクとロールバック（フェーズ別）

| フェーズ | 主リスク | ロールバック要点 |
|---|---|---|
| 0A | 秘密値切替で webhook 失敗 | Secret を直前値に戻す |
| 0B | 重複掃除で参照欠落 | deprecate 参照を期限付き復帰 |
| 1 | config 欠損で判定不能 | 詳細設定で再投入／Firestore 修復。未リリースのため旧 fallback は持たない |
| 2 | 計算ズレ（Flutter/Functions） | Functions 側を正として戻す |
| 2.1 | 寄せ先変更後の参照漏れ | コードデプロイで差し替え前へ戻す |
| 3 | 最終整理で説明不能項目が残る | ID単位でログ/責務表を再補完 |
| 4 | 閉店処理連携の不備 | 閉店処理の呼び出しを一時外す |

## 5. 依存関係

- Phase 0A/0B 完了前に Phase 2 へ入らない。
- Phase 2.1 は Phase 2 完了後に実施する。Phase 3 の前提となる。
- Phase 4 は Phase 3 完了後に実施する。
- Phase 1 の取得層/更新層なしで Run-time 移行を開始しない。
- SSoT 原則（Functions 最終決定）を ADR 合意してから会計・営業日を動かす。

## 6. 検証観点（最低限）

- 営業日境界（closeHour 変更時）
- 会計一致（`verifyPaymentSplit` 不一致率）
- 自動開閉店（offset 変更時）
- 段階フラグの即時反映
- 権限/キャッシュ整合（`devices.role` 更新後）
- 全 ID の状態遷移チェック（未着手 -> 移行中 -> 完了）

## 7. 実行チェックリスト（漏れ防止）

1. 対象IDを選ぶ（classification ID）
2. 現SSoT/To-Be SSoTを決める
3. 読み取り/更新責務を決める
4. 互換期間とfallback方針を決める（秘密値はfallback禁止）
5. 影響範囲（Flutter/Functions/Firebase/Ops）を記録
6. 検証観点を実行
7. Change Log と Decision Log を更新
8. ID状態を完了へ更新

## 8. 作業時差分確認メモ

- 本ドキュメントは新規作成のみ。
- 作業完了時確認:
  - `git diff --name-only`: `docs/table_device/tobe_spec.md`（既存変更）
  - `git status --short`: `M docs/table_device/tobe_spec.md`、`?? docs/config_audit/`、`?? docs/config_migration/`
  - 本タスク由来のコード変更はなし。
