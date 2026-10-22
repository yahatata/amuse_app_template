# phaseE 完了サマリと phaseF 引き継ぎ

作成日: 2026-04-01

## 1. phaseE 完了サマリ

### 1.1 実装結果

- `monthlyPayrollTrigger` をコード/公開エントリ/設定から撤去した。
  - 削除: `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts`
  - 更新: `functions/src/domains/attendance/index.ts`
  - 更新: `functions/.env.amuse-app-template`（`MONTHLY_PAYROLL_TRIGGER_CRON` 削除）
- schedulerConfig の legacy 互換項目（`*_Enabled`）を削除し、v2 最終スキーマへ統一した。
  - `functions/src/shared/config/schedulerConfigTypes.ts`
  - `functions/src/shared/config/schedulerConfigDefaults.ts`
  - `functions/src/shared/config/schedulerConfigLoader.ts`
- phaseD 残タスクだった Cloud Functions 環境変数整理を実施した。
  - `unused_function_lib` 由来の旧関数 7件を削除
  - `asia-northeast1` と `us-central1` に対して不要 env 削除を適用
  - 最終検証で `filtered_candidate_keys=0` / `filtered_candidate_rows=0` を確認
- 棚卸し/削除の再実行可能手順をスクリプト化した。
  - 追加: `scripts/functions_env_inventory_and_cleanup.sh`

### 1.2 テスト・確認結果

- `npm run build` 成功
- `npm run lint` 成功
- `npm test -- __tests__/config/schedulerConfigLoader.spec.ts --runInBand` 成功
- `npm test -- __tests__/scheduler/schedulerConfigLoader.v2.spec.ts --runInBand` 成功
- `npm test -- __tests__/config_migration/D15_cron.spec.ts --runInBand` 成功
- `npm test -- __tests__/scheduler/*.spec.ts --runInBand` 成功

### 1.3 ステップ8結果

- `step8_運用時資料判定.md` のとおり、運用時資料の更新を実施。
  - 追加: `docs/運用時資料/設定/SecretManager運用/CloudFunctions環境変数棚卸しと削除手順.md`
  - 更新: `docs/運用時資料/設定/SecretManager運用/README.md`

## 2. phaseF への引き継ぎ事項

### 2.1 既に整っている前提

- scheduler No.6（`monthlyPayrollTrigger`）はコード・Cloud 設定ともに撤去済み。
- schedulerConfig は `jobs.*` 主体の v2 形式で運用可能。
- Cloud Functions 残存 env の削除対象は解消済み（system/runtime 管理キーのみ残存）。
- 反復実行手順は `scripts/functions_env_inventory_and_cleanup.sh` に固定化済み。

### 2.2 phaseF で必ず意識すること

- GitHub Actions/WIF/リージョン移行（`asia-northeast1` 一括切替）を進める際に、phaseE で固定化した scheduler/job 構成を前提にする。
- CI/CD で Secret/IAM を扱う際は、phaseD/phaseE で作成済み運用資料と矛盾しないように更新する。
- phaseF の導入時設定資料は `docs/運用時資料/導入時設定/fireBase紐付け/*` を起点に更新する。

### 2.3 phaseF changeSpec 作成時の確認観点

- deploy 対象リージョンの統一方針と `task-endpoints` の実値整合。
- GitHub Actions の `project_id` 選択と WIF 権限境界の整合。
- phaseE で削除済みの旧 scheduler/旧 env を前提にしないこと。

## 3. phaseE 終了時点の未解決事項

- なし（phaseE スコープ内）。
