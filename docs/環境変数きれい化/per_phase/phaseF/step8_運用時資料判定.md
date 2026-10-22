# phaseF ステップ8: 運用時資料の必要性判定

判定日: 2026-04-02

## 1. 判定結果

- phaseF 実装範囲について、**運用時資料の更新が必要**と判定。
- 導入時資料と運用時資料を分けた判定結果は以下。
  - 導入時資料: 更新必要（新規 Firebase Project ID 追加時の外部操作手順を明文化）
  - 運用時資料: 更新必要（通常リリース時チェックリストへ deploy 権限観点を追加）

## 2. 判定理由

- 実運用で GitHub Actions deploy 時に `actAs` 不足と `task queue/schedule upsert` 権限不足が発生し、初回セットアップ時に必要な IAM 手順が資料上で不足していた。
- 複数店舗向けに Firebase Project ID を追加する運用では、WIF / IAM / Secrets / Queue / リージョン整合を横断して再実行できる手順書が必要。
- phaseF の Exit 条件（導入時資料へ WIF / リージョン / task-endpoints 観点反映）を満たすため、チェックリスト側にも具体チェックを追加する必要があった。

## 3. 追加/更新した資料

導入時資料:

- 追加: `docs/運用時資料/導入時設定/fireBase紐付け/新規Firebaseプロジェクト追加時_デプロイ手順.md`
- 更新: `docs/運用時資料/導入時設定/fireBase紐付け/README.md`

運用時資料:

- 更新: `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`

## 4. 補足

- 本ステップで追加した手順は、既存プロジェクトだけでなく今後の新規 Firebase Project ID 追加時にも再利用可能。
- IAM 権限不足時の代表的な失敗（`actAs` / `upsert task queue function` / `upsert schedule function`）を同手順書に明記した。

## 5. 反映確認結果（2026-04-02）

- `docs/運用時資料/導入時設定/fireBase紐付け/README.md`
  - phaseF 観点（WIF / `asia-northeast1` 統一 / `task-endpoints`）の説明を追記済み。
- `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`
  - deploy 権限（Cloud Functions / Cloud Tasks / Cloud Scheduler / actAs）観点とリージョン整合観点を追記済み。
- `docs/運用時資料/導入時設定/fireBase紐付け/新規Firebaseプロジェクト追加時_デプロイ手順.md`
  - 新規 Firebase Project ID 追加時の外部操作（WIF / IAM / Secrets / Queue / deploy）を再実行可能な手順として整備済み。
