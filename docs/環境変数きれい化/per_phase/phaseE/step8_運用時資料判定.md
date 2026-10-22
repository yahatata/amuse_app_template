# phaseE ステップ8: 運用時資料の必要性判定

判定日: 2026-04-01

## 1. 判定結果

- phaseE 実装範囲について、**運用時資料の更新が必要**と判定。
- 導入時資料と運用時資料を分けて判定した結果は以下。
  - 導入時資料: 追加不要（phaseD で作成済み資料で充足）
  - 運用時資料: 追加必要（Cloud Functions 残存環境変数の棚卸し/削除手順を明文化）

## 2. 判定理由

- phaseE で Cloud Functions の残存環境変数を実際に整理し、反復可能な実行手順を `scripts/functions_env_inventory_and_cleanup.sh` に固定化した。
- 既存の Secret 運用資料には「phaseE で固定化する」と記載されていたが、具体手順書が未作成だったため、運用手順の追加が必要。
- 導入時（初回 Secret 作成・権限付与）は phaseD で整備済みで、phaseE では新規導入作業が増えていないため、導入時資料の新規追加は不要。

## 3. 追加/更新した資料

運用時資料:

- 追加: `docs/運用時資料/設定/SecretManager運用/CloudFunctions環境変数棚卸しと削除手順.md`
- 更新: `docs/運用時資料/設定/SecretManager運用/README.md`

## 4. 補足

- 本手順の完了判定は `filtered_candidate_keys=0` かつ `filtered_candidate_rows=0`。
- `raw_candidate_keys` に system/runtime 管理キーが残るのは正常動作。
