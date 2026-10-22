# phaseB 作業ログ

## 2026-04-01

### 実施

- phaseB開始。
- `phaseB/README.md` と `フェーズ設計_詳細仕様対応表.md` を確認。
- As-Is調査を実施し、以下を確認:
  - `schedulerSupervisor` 基盤が未実装
  - `storeMeta/schedulerConfig` が旧booleanスキーマ
  - 旧 `onSchedule` が各jobで直接稼働中
  - 再計画request基盤が未実装
  - phaseAで追加済み `cloudTasksConfig` / `getRequiredProjectId` は利用可能
- `phaseB/changeSpec.md` を作成（実装未着手）。
- `changeSpec` を修正（schedulerConfig初期値は `schedulerConfigDefaults.ts` を新設して管理）。
- ユーザー承認後、phaseB実装を実施。
  - 追加: `shared/config/schedulerConfigDefaults.ts`
  - 変更: `shared/config/schedulerConfigTypes.ts`
  - 変更: `shared/config/schedulerConfigLoader.ts`（v2+legacy互換）
  - 変更: `storeMeta/callables/initializeStoreConfigCallable.ts`
  - 変更: `shared/config/defaults.ts`（schedulerConfig初期値を削除）
  - 追加: `domains/scheduler/supervisor/*`（supervisor基盤）
  - 追加: `domains/scheduler/replan/*`（replan request基盤）
  - 追加/変更: scheduler関連テスト群
- テスト実行:
  - `npm run build` 成功
  - `npm run lint` 成功
  - `__tests__/config/schedulerConfigLoader.spec.ts` 成功
  - `__tests__/scheduler/schedulerConfigLoader.v2.spec.ts` 成功
  - `__tests__/scheduler/schedulerTargetScope.spec.ts` 成功
  - `__tests__/scheduler/schedulerTaskName.spec.ts` 成功
  - `__tests__/scheduler/schedulerTaskPayload.spec.ts` 成功
  - `__tests__/scheduler/enqueueTournamentTasksReplanRequest.spec.ts` 成功
- ステップ8（運用時資料要否判定）を実施:
  - `phaseB/step8_運用時資料判定.md` を作成
- ステップ9（完了サマリ・引き継ぎ記録）を実施:
  - `phaseB/phaseB_完了サマリとphaseC引き継ぎ.md` を作成

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

### 保留 / 未実施

- なし
