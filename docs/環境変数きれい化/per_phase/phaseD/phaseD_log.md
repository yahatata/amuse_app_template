# phaseD 作業ログ

## 2026-04-01

### 実施

- phaseD開始。
- `phaseD/README.md` と `進め方_仕様詳細化とフェーズ設計フロー.md` を確認。
- phaseD担当範囲（Secret Manager To-Be 1〜10, 12〜15 / コード固定 To-Be 5.2, 7）を再確認。
- As-Is調査を実施し、以下を確認:
  - `shared/secrets/` と Secret Manager SDK 依存が未実装。
  - line-config対象が `process.env` / `defineString` 依存のまま。
  - task-endpoints対象が `getEnv()` 依存のまま。
  - business-secrets対象が `process.env` 依存のまま。
  - `qrCodeUtils` が同期APIのため、Secret Manager導入時に非同期化が必要。
  - 既存テスト（`phase0A_config_migration` / `step7_deprecatedRemoval`）は旧前提のため更新が必要。
- `phaseD/changeSpec.md` を作成（実装未着手）。

### 追記（実装・テスト）

- ユーザーレビューで実装着手の承認を受領（標準ステップ4完了）。
- Secret Manager 共通層を追加:
  - `functions/src/shared/secrets/types.ts`
  - `functions/src/shared/secrets/secretManager.ts`
- line-config 参照へ置換:
  - `lineRichMenu.ts`
  - `lineMessaging.ts`
  - `lineWebhook.ts`
- task-endpoints 参照へ置換:
  - `tournament_createTournament/services/tasks.ts`
  - `storeMeta/scheduler/weeklyPlanner.ts`
  - `storeMeta/callables/continueBusinessTerminal.ts`
- business-secrets 参照へ置換:
  - `user/services/qrCodeUtils.ts`
  - `storeMeta/callables/updateUnclockedAttendanceWithAuth.ts`
  - `storeMeta/callables/verifyUnclockedAttendanceEditPassword.ts`
- `qrCodeUtils` を非同期化し、呼び出し側を追従:
  - `createUserAccount.ts`
  - `createStaffAccount.ts`
  - `createStaffByApp.ts`
  - `generateQRCode.ts`
  - `verifyQRCode.ts`
  - `processVisitByQR.ts`
- テスト更新/追加:
  - 新規: `functions/__tests__/shared/secrets/secretManager.spec.ts`
  - 更新: `phase0A_config_migration.spec.ts`
  - 更新: `step7_deprecatedRemoval.spec.ts`
- 依存・テンプレ更新:
  - `functions/package.json`
  - `functions/package-lock.json`
  - `functions/.env.amuse-app-template`
- 実行結果:
  - `npm run build`: 成功
  - `npm run lint`: 成功
  - `npm test -- __tests__/shared/secrets/secretManager.spec.ts --runInBand`: 成功
  - `npm test -- __tests__/config_migration/phase0A_config_migration.spec.ts --runInBand`: 成功
  - `npm test -- __tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts --runInBand`: 成功
  - `npm test -- __tests__/scheduler/*.spec.ts --runInBand`: 成功
- ユーザー側で Secret 作成/権限付与/デプロイを実施し、Secret 利用の動作確認まで完了。
- scheduler job task 関数（`scheduled-job-*`）の初回デプロイ失敗（Cloud Run startup probe）に対して修正を反映し、再デプロイで解消。

### 追記（ステップ8・9）

- ステップ8（運用時資料の必要性判定）を実施し、導入時/運用時に分けた Secret Manager 資料の追加が必要と判定。
  - 追加: `docs/運用時資料/導入時設定/SecretManager/README.md`
  - 追加: `docs/運用時資料/導入時設定/SecretManager/初回導入_SecretManager設定手順.md`
  - 追加: `docs/運用時資料/設定/SecretManager運用/README.md`
  - 追加: `docs/運用時資料/設定/SecretManager運用/Secret更新と確認手順.md`
  - 記録: `phaseD/step8_運用時資料判定.md`
- ステップ9を実施し、完了サマリと次フェーズ引き継ぎを作成。
  - 追加: `phaseD/phaseD_完了サマリとphaseE引き継ぎ.md`
- phaseD残タスクとして「関数に残存している旧環境変数の整理」を明文化。
  - 追加: `phaseD/phaseD_残タスク_関数環境変数整理.md`

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

補足:

- phaseDの実装完了判定は維持しつつ、環境変数の残存整理は phaseE 連携タスクとして継続管理する。
