# phaseE changeSpec（削除と整理）

作成日: 2026-04-01  
ステータス: 実装完了（本ファイルは計画時点の記録）

## 1. 対象仕様書と対象章

### 1.1 scheduler To-Be（phaseE担当範囲）

- `docs/環境変数きれい化/仕様書/scheduler_ToBe_詳細仕様.md`
  - 3（No.6 除外の扱い）
  - 9（旧 onSchedule からの切替完了後の削除）

### 1.2 Secret Manager To-Be（phaseE担当範囲）

- `docs/環境変数きれい化/仕様書/Secret_Manager_ToBe_詳細仕様.md`
  - 12.3 今回の明確な廃止対象
  - 13 実装時の注意

### 1.3 コード固定 To-Be（phaseE担当範囲）

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
  - 9 削除対象

### 1.4 前フェーズ引き継ぎ

- `docs/環境変数きれい化/per_phase/phaseD/phaseD_完了サマリとphaseE引き継ぎ.md`
- `docs/環境変数きれい化/per_phase/phaseD/phaseD_残タスク_関数環境変数整理.md`

## 2. As-Is確認結果

### 2.1 `monthlyPayrollTrigger` が実装・exportともに残存

- `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` が残っている。
- `functions/src/domains/attendance/index.ts` で `monthlyPayrollTrigger` を export している。
- `functions/.env.amuse-app-template` に `MONTHLY_PAYROLL_TRIGGER_CRON` が残っている。

### 2.2 旧 scheduler 互換フィールドが残存

- `functions/src/shared/config/schedulerConfigTypes.ts`
  - `monthlyPayrollTriggerEnabled`
  - `scheduledCleanupEnabled`
  - `scheduleGenerateNextYearBusinessHoursEnabled`
- `functions/src/shared/config/schedulerConfigDefaults.ts`
  - 旧互換デフォルト定数 3件
- `functions/src/shared/config/schedulerConfigLoader.ts`
  - 旧互換の read/write 補完処理が残っている

補足:

- scheduler To-Be 最終スキーマ（`jobs.*` 主体）に対して、旧互換の残骸が残っている状態。

### 2.3 関連テストに旧前提が残存

- `functions/__tests__/config_migration/phase4_1F/monthlyPayrollTrigger.spec.ts` が月次トリガー前提で残っている。
- `functions/__tests__/config/schedulerConfigLoader.spec.ts` が legacy 互換フィールド前提の期待値を持つ。
- `functions/__tests__/scheduler/schedulerConfigLoader.v2.spec.ts` が legacy 互換項目出力を期待している。

### 2.4 実コード上の env 参照は最小化済みだが、Cloud 側残骸整理が未完了

- `functions/src`（`unused_function_lib` 除外）での `process.env` 参照は次に限定される。
  - `NODE_ENV`（ローカルdotenv読込）
  - `FUNCTIONS_EMULATOR`（runtime判定）
  - `GCLOUD_PROJECT` / `GCP_PROJECT` / `PROJECT_ID`（projectId取得）
  - `K_SERVICE` / `K_REVISION`（デバッグログ）
  - `MONTHLY_PAYROLL_TRIGGER_CRON`（削除対象関数内）
- phaseD残タスクとして、Cloud Functions 側に残る旧環境変数の棚卸し・削除運用が未完了。
- 現在ユーザー側で棚卸しコマンド実行中（結果待ち）。

## 3. 新規作成するファイル

- `docs/環境変数きれい化/per_phase/phaseE/phaseE_log.md`
  - phaseE 作業ログ

## 4. 修正するファイル

### 4.1 削除対象（コード）

- `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts`（削除）
- `functions/src/domains/attendance/index.ts`（export削除）

### 4.2 削除対象（設定）

- `functions/.env.amuse-app-template`
  - `MONTHLY_PAYROLL_TRIGGER_CRON` 削除

### 4.3 旧 scheduler 互換整理

- `functions/src/shared/config/schedulerConfigTypes.ts`
  - legacy互換フィールド削除
- `functions/src/shared/config/schedulerConfigDefaults.ts`
  - legacy互換デフォルト定数削除
- `functions/src/shared/config/schedulerConfigLoader.ts`
  - legacy互換 read/write 処理削除（v2スキーマ専用化）

### 4.4 テスト整理

- `functions/__tests__/config_migration/phase4_1F/monthlyPayrollTrigger.spec.ts`（削除）
- `functions/__tests__/config/schedulerConfigLoader.spec.ts`（legacy期待の更新）
- `functions/__tests__/scheduler/schedulerConfigLoader.v2.spec.ts`（legacy期待の更新）
- 必要に応じて `functions/__tests__/config_migration/D15_cron.spec.ts` を補強（No.6除外の最終確認）

## 5. 移動するファイル

- なし

## 6. 実装方針

### 6.1 `monthlyPayrollTrigger` の完全撤去

- 関数本体・domain export・関連env参照を同一フェーズで削除する。
- scheduler To-Be（No.6除外）の方針をコードへ確定反映する。

### 6.2 schedulerConfig を v2最終スキーマへ寄せる

- legacy互換フィールド（`*_Enabled`）依存を除去する。
- `jobs.<jobKey>.enabled` を単一の有効/無効ソースにする。
- 旧互換補完を削除した上で、既存 v2データの読み取りを壊さない。

### 6.3 環境変数残骸整理（phaseD残タスクの回収）

- まず棚卸し結果（ユーザー実行中コマンドの出力）を確定する。
- 未参照キーのみを削除候補として、関数単位で削除対象を固定する。
- 削除は段階実施とし、削除前後で動作確認を行う。

補足:

- 本 changeSpec 時点では「削除対象のキー集合」は結果待ちのため仮置き。
- 実装着手前に、棚卸し結果を本ファイルまたはログへ追記して固定化する。

## 7. 必要テストの検討（実施予定）

### 7.1 削除系の静的確認

- `monthlyPayrollTrigger` が src / export から消えていることを確認。
- `MONTHLY_PAYROLL_TRIGGER_CRON` が `.env.amuse-app-template` から消えていることを確認。

### 7.2 schedulerConfig 互換整理の回帰確認

- `npm test -- __tests__/config/schedulerConfigLoader.spec.ts --runInBand`
- `npm test -- __tests__/scheduler/schedulerConfigLoader.v2.spec.ts --runInBand`

### 7.3 scheduler 系回帰

- `npm test -- __tests__/scheduler/*.spec.ts --runInBand`
- `npm test -- __tests__/config_migration/D15_cron.spec.ts --runInBand`

### 7.4 全体ビルド・Lint

- `npm run build`
- `npm run lint`

## 8. 外部操作

phaseE でユーザー操作が必要になり得るもの:

1. Cloud Functions 側の旧環境変数削除（関数設定）
   - 棚卸し結果確定後、関数単位で削除実行
2. `monthlyPayrollTrigger` のリモート削除確認
   - deploy 時に削除確認を行う、または明示 delete コマンドを実施

補足:

- CLI でエージェントが実行できる作業（コード修正・テスト）はエージェント側で実施する。
- GCP コンソール/本番プロジェクトへの削除操作は、影響確認を伴うためユーザー承認を前提に進める。

## 9. リスク

- `monthlyPayrollTrigger` 削除で、旧運用に依存した監視や手順が残っていると混乱する可能性。
- schedulerConfig の legacy互換削除により、旧フィールド参照を前提にしたコード/テストが失敗する可能性。
- 環境変数削除で、未把握の依存があった場合にランタイム障害が出る可能性。

## 10. ロールバック方法

1. コードロールバック:
   - `monthlyPayrollTrigger` 削除コミットを戻す。
   - schedulerConfig loader/type 変更を戻す。
2. 設定ロールバック:
   - 削除した環境変数を対象関数へ再設定する。
3. 影響確認:
   - payroll/attendance/scheduler の代表経路を再実行し、復旧確認する。
