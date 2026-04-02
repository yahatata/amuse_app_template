# phaseD ステップ8: 運用時資料の必要性判定

判定日: 2026-04-01

## 1. 判定結果

- phaseD の実装範囲について、**運用時資料の新規作成が必要**と判定。
- 追加資料は、要件どおり **導入時** と **運用時** に分けて作成する。

## 2. 判定理由

- phaseD で Secret Manager へ移行した値（`line-config` / `task-endpoints` / `business-secrets`）は、
  実装だけでなく GCP 側の設定・更新手順が必要。
- 初回導入時に実施すべき作業（Secret 作成、権限付与、初回デプロイ確認）と、
  通常運用時に実施すべき作業（Secret 更新、障害切り分け、確認手順）は運用観点が異なるため分離が必要。

## 3. 新規作成した資料

導入時資料:

- `docs/運用時資料/導入時設定/SecretManager/README.md`
- `docs/運用時資料/導入時設定/SecretManager/初回導入_SecretManager設定手順.md`

運用時資料:

- `docs/運用時資料/設定/SecretManager運用/README.md`
- `docs/運用時資料/設定/SecretManager運用/Secret更新と確認手順.md`

## 4. 今回は未実施（次フェーズで扱う）

- Cloud Functions に残っている旧環境変数の一括棚卸しと削除運用の固定化。
- 不要化した旧 scheduler / 旧 env fallback の削除（phaseE スコープ）。
