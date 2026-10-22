# phaseD 完了サマリと phaseE 引き継ぎ

作成日: 2026-04-01

## 1. phaseD 完了サマリ

### 1.1 実装結果

- Secret Manager 共通層を追加し、Secret 取得を `shared/secrets/secretManager.ts` に集約した。
- 対象 3 secret を正式に利用する実装へ移行した。
  - `line-config`
  - `task-endpoints`
  - `business-secrets`
- 置換対象コード（LINE / Task URL / QR・未退勤修正パスワード）を env 直参照から共通取得へ切替した。
- `qrCodeUtils` を非同期化し、呼び出し側 callables まで追従した。
- `.env.amuse-app-template` から phaseD 対象キーを削除した。

### 1.2 テスト・確認結果

- `npm run build` 成功
- `npm run lint` 成功
- `__tests__/shared/secrets/secretManager.spec.ts` 成功
- `__tests__/config_migration/phase0A_config_migration.spec.ts` 成功
- `__tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts` 成功
- `__tests__/scheduler/*.spec.ts` 成功
- ユーザー側で Secret 作成/権限付与/デプロイ後、Secret が実際に参照されることを確認済み。

### 1.3 ステップ8結果

- `step8_運用時資料判定.md` のとおり、導入時資料と運用時資料を分けて作成済み。

## 2. phaseE への引き継ぎ事項

### 2.1 既に整っている前提

- Secret Manager の基本移行は完了している。
- Secret 取得は `getRequiredProjectId()` と連携した共通経路で動作する。
- Functions 実装上の phaseD 対象 env 参照は置換済み。

### 2.2 phaseE で必ず意識すること

- 旧 scheduler / 旧 fallback / 不要環境変数の削除を、phaseE changeSpec の削除対象として明示する。
- Cloud Console 上に残存する旧環境変数は、実コード参照との突合を行って安全に削除する。
- `monthlyPayrollTrigger` の削除方針（先行削除）と整合するよう、旧実装の残骸を整理する。

### 2.3 phaseE changeSpec 作成時の確認観点

- 「コードから参照されない環境変数」と「まだ参照される環境変数」を明確に分離する。
- 削除対象は関数単位で列挙し、ロールバック手順を先に定義してから削除する。
- phaseD で追加した Secret Manager 前提を崩さないこと（env へ戻さない）。

## 3. 未解決事項（phaseD終了時点）

- 関数に残存している旧環境変数の棚卸しと削除運用の最終確定。
  - 詳細: `phaseD_残タスク_関数環境変数整理.md`
