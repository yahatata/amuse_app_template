# phaseE 作業ログ

## 2026-04-01

### 実施

- phaseE開始。
- `phaseE/README.md` と `進め方_仕様詳細化とフェーズ設計フロー.md` を確認。
- phaseE担当範囲（scheduler No.6除外、旧経路削除、Secret/コード固定の削除対象）を再確認。
- phaseD引き継ぎ（`phaseD_完了サマリとphaseE引き継ぎ.md`）と残タスク（`phaseD_残タスク_関数環境変数整理.md`）を確認。
- As-Is調査を実施し、以下を確認:
  - `monthlyPayrollTrigger` 本体と export が残存。
  - `.env.amuse-app-template` に `MONTHLY_PAYROLL_TRIGGER_CRON` が残存。
  - schedulerConfig loader/types/defaults に legacy互換フィールドが残存。
  - 関連テストに monthly/legacy 前提が残存。
  - Cloud Functions 側の旧環境変数残骸整理は未完了（ユーザー側で棚卸しコマンド実行中）。
- `phaseE/changeSpec.md` を作成（実装未着手）。

### 追記（実装・テスト）

- ユーザーレビューで実装着手の承認を受領（標準ステップ4完了）。
- `monthlyPayrollTrigger` を削除:
  - 削除: `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts`
  - 修正: `functions/src/domains/attendance/index.ts`（export削除）
  - 修正: `functions/.env.amuse-app-template`（`MONTHLY_PAYROLL_TRIGGER_CRON` 削除）
- schedulerConfig の legacy互換を削除:
  - 修正: `functions/src/shared/config/schedulerConfigTypes.ts`
  - 修正: `functions/src/shared/config/schedulerConfigDefaults.ts`
  - 修正: `functions/src/shared/config/schedulerConfigLoader.ts`
- テスト整理:
  - 削除: `functions/__tests__/config_migration/phase4_1F/monthlyPayrollTrigger.spec.ts`
  - 修正: `functions/__tests__/config/schedulerConfigLoader.spec.ts`
  - 修正: `functions/__tests__/scheduler/schedulerConfigLoader.v2.spec.ts`
  - 修正: `functions/__tests__/config_migration/D15_cron.spec.ts`（phaseE削除確認を追加）
- 実行結果:
  - `npm run build`: 成功
  - `npm run lint`: 成功
  - `npm test -- __tests__/config/schedulerConfigLoader.spec.ts --runInBand`: 成功
  - `npm test -- __tests__/scheduler/schedulerConfigLoader.v2.spec.ts --runInBand`: 成功
  - `npm test -- __tests__/config_migration/D15_cron.spec.ts --runInBand`: 成功
  - `npm test -- __tests__/scheduler/*.spec.ts --runInBand`: 成功

### 追記（Cloud環境変数整理の進捗）

- `unused_function_lib` にある旧関数 7件を Cloud から削除済み（`us-central1`）:
  - `createClockInRecord`
  - `determineAttendanceMode`
  - `getAccountingHistory`
  - `nightlyIntegrityCheck`
  - `nightlyRecalculateBalanceDue`
  - `nightlyReconciliationCheck`
  - `updateClockOutRecord`
- 削除後に `gcloud functions list` で上記7件が存在しないことを確認。
- 再棚卸しを実施し、未参照候補を再集計:
  - raw: `36 keys / 1600 rows`
  - system/runtime除外後: `31 keys / 692 rows`
- 集計結果にもとづき、一括実行可能な運用スクリプトを追加:
  - `scripts/functions_env_inventory_and_cleanup.sh`
  - dry-runで棚卸し・候補抽出、`--apply`で Cloud Run service に対する `--remove-env-vars` を実行可能。
- スクリプト適用を `asia-northeast1` に先行実施:
  - 実行: `scripts/functions_env_inventory_and_cleanup.sh --project amuse-app-template --regions asia-northeast1 --apply`
  - 結果: `filtered_candidate_rows=0`（不要envの残存なし）
- `us-central1` の最新残件（同スクリプト dry-run）:
  - `filtered_candidate_keys=29`
  - `filtered_candidate_rows=497`
- `us-central1` へ本適用を実施:
  - 実行: `scripts/functions_env_inventory_and_cleanup.sh --project amuse-app-template --regions us-central1 --apply`
  - 結果: `Apply completed: total=176 ok=176 failed=0`
- 全リージョン最終検証:
  - 実行: `scripts/functions_env_inventory_and_cleanup.sh --project amuse-app-template --regions us-central1,asia-northeast1`
  - 結果: `filtered_candidate_keys=0`, `filtered_candidate_rows=0`
  - 補足: raw側に残る7キーは system/runtime 管理キーで削除対象外。

### 追記（ステップ8・9）

- ステップ8（運用時資料の必要性判定）を実施。
  - 記録: `phaseE/step8_運用時資料判定.md`
  - 追加: `docs/運用時資料/設定/SecretManager運用/CloudFunctions環境変数棚卸しと削除手順.md`
  - 更新: `docs/運用時資料/設定/SecretManager運用/README.md`
- ステップ9を実施し、完了サマリと次フェーズ引き継ぎを作成。
  - 追加: `phaseE/phaseE_完了サマリとphaseF引き継ぎ.md`

### 現在ステータス

- 標準ステップ:
  - 1. As-Is確認: 完了
  - 2. changeSpec作成: 完了
  - 3. 必要テスト検討: 完了（changeSpecへ反映済み）
  - 4. ユーザーレビュー依頼: 完了
  - 5. 実装: 完了
  - 6. テスト実行: 完了
  - 7. テスト結果の出力 / 実機確認依頼: 完了
  - 8. 運用時資料の必要性検討 / 必要時作成: 完了
  - 9. サマリ作成と引き継ぎ事項の記録: 完了
