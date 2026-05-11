# タスク実行復旧 changeSpec（2026-04-07）

作成日: 2026-04-07  
ステータス: 実装・検証完了（残課題: 依存更新警告のみ）

## 1. 目的

リリース前の現時点で、以下を満たす状態へ復旧する。

1. 新規作成される Cloud Tasks が正しい形式（body / header / auth）で投入される
2. Cloud Tasks から対象 Functions が正常実行される
3. Scheduler 起点の自動投入が意図通りに動作する
4. 既存の壊れタスクは必要最小限で整理（削除）できる

## 2. 対象範囲

### 2.1 主対象

- `openAssessmentTask` / `closeAssessmentTask` 系（business-date-assessment-queue）
- schedulerSupervisor 配下の scheduler / task queue 実行系
- payroll task queue 実行系（`processPayrollNotifications` / `processStaffPayroll` / `finalizePayrollRun`）
- tournament enqueue 系（`default-store` 影響箇所）

### 2.2 関連コード（修正候補）

- `functions/src/domains/storeMeta/callables/openAssessmentTask.ts`
- `functions/src/domains/storeMeta/callables/closeAssessmentTask.ts`
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
- `functions/src/domains/scheduler/tasks/scheduledJobTaskExecutors.ts`
- `functions/src/domains/scheduler/supervisor/schedulerLogs.ts`
- `functions/src/shared/config/cloudTasksConfig.ts`
- `functions/src/shared/runtime.ts`
- `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`

注記:

- `default-store` の扱いは影響範囲が広いため、即時に全廃せず段階化するかはユーザー判断事項とする（`要判断事項.md` 参照）。

## 3. As-Is（着手時）

### 3.1 確定している不具合

- assessment queue に body 空タスクが残り、`openAssessmentTask` / `closeAssessmentTask` が 400 を返す
- weekly planner からの task 作成で、invoker SA 不在により `NOT_FOUND` が発生する環境がある
- scheduler 実行ログ書き込みで `reason: undefined` が原因の Firestore write error が起こる
- tournament enqueue 系で `default-store` が本番禁止ルールに抵触するケースがある

### 3.2 健全性が確認できている点

- schedulerSupervisor 本体の実行は継続している
- 一部 queue は正しい body / header 付きで投入されている

## 4. 実施フェーズ

## 4.1 Phase 0: 事前スナップショット取得

実施内容:

- queue / scheduler / functions の現状一覧取得
- 失敗ログの代表サンプル保存

担当:

- エージェントで実施可能

## 4.2 Phase 1: 既存の壊れタスク整理（削除）

実施内容:

- `business-date-assessment-queue` の 400 再試行タスクを削除
- 必要に応じて同型の「明らかに不正 payload」タスクを限定削除

担当:

- エージェントで実施可能

補足:

- 「全 queue 一括削除」は実施しない
- 削除対象の範囲はユーザー判断事項（`要判断事項.md` の D-03）

## 4.3 Phase 2: SA / IAM / Queue 実行前提の整備（D-02 決定事項）

実施内容:

- task invoke 用 SA 名を `tasks-invoker@...` へ統一する
- 必要ロール（Cloud Tasks enqueue 実行、Functions invoke、`iam.serviceAccountUser` 等）を確認・補正

担当:

- エージェントで実施可能（CLI操作）
- ただし権限不足時はユーザー権限で再実行が必要

## 4.4 Phase 3: コード修正（最小で再発防止）

実施内容:

- scheduler 実行ログ書き込みで `undefined` を保存しないようガード追加
- task producer 側の payload / header 付与を再点検し、欠落しないよう補強
- 必要であれば SA 指定解決（config 側統一）
- `default-store` は「復旧を優先し、後続フェーズで排除」を前提に互換維持範囲を最小化

担当:

- エージェントで実施可能

## 4.5 Phase 4: デプロイと疎通確認

実施内容:

- 影響範囲の Functions を再デプロイ
- 各 queue の手動投入 / scheduler 自動投入 / 実行成功を確認

担当:

- エージェントで実施可能
- ただし最終受け入れとして、業務導線の目視確認はユーザー側に依頼する可能性あり

## 4.6 Phase 5: 運用資料化（step8 用）

実施内容:

- 新規 Firebase プロジェクト向けに、必要 IAM / SA / queue / scheduler / secret 手順を運用資料に反映
- 再発防止チェックリストを更新

担当:

- エージェントで実施可能

## 4.7 Phase 6: `us-central1` 残存フローの段階移行（D-04 決定事項）

実施内容:

- 今回の障害復旧を完了させた後、`us-central1` 残存フローを棚卸しする
- `asia-northeast1` へ順次移行する対象を決め、移行順を固定する
- 移行後は Queue / Scheduler / Secret endpoint の整合を再確認する

担当:

- エージェントで実施可能

補足:

- D-04 は `1（段階移行）` を採用済み
- 本フェーズは「今回の作業の中に必ず含める」前提で進行する

## 4.8 Phase 7: `default-store` 依存排除（D-01 決定事項）

実施内容:

- 復旧後の安定状態を確認したうえで、`default-store` 依存箇所を棚卸しする
- 単一店舗運用に合わせ、店舗識別の補完方式を固定して `default-store` 文字列依存を段階削除する
- 影響範囲（task producer / scheduler / validation / downstream）を横断して修正する

担当:

- エージェントで実施可能

補足:

- D-01 は `1（段階移行）` を採用済み
- ただし「後ろフェーズでの排除実施」を必須条件とする

## 5. テスト方針（概要）

詳細は `検証計画.md` を参照。

- タスク投入（手動）できること
- スケジューラ起点で自動投入されること
- タスク実行が 2xx で完了すること
- 副作用（Firestore 更新など）が期待どおりであること

## 6. 外部操作（想定）

- `gcloud tasks` で task 削除/投入/確認
- `gcloud scheduler` でジョブ実行/確認
- `gcloud iam` で SA / バインディング確認
- `firebase deploy --only functions`（または GitHub Actions）

## 7. リスク

- 本番相当データを使うため、検証投入時に副作用が発生しうる
- `default-store` 方針を急いで決めると、広範囲影響の見落としリスクがある
- SA 統一方針が曖昧なまま進むと、将来再び `NOT_FOUND`/権限不整合を生む

## 8. ロールバック方針

- コード修正は機能単位でコミットし、問題時に `git revert` 可能な粒度で管理
- SA / IAM 変更は実施ログを残し、元に戻せるコマンドを併記
- queue 削除は復元できないため、削除前に対象ID一覧を必ず保存

## 9. 決定事項の反映状況

- D-01: `1（段階移行）`（後続フェーズで `default-store` 排除を必須化）
- D-02: `1（既存 SA へ統一）`（`tasks-invoker@...` へ統一）
- D-03: `1（ピンポイント削除）`
- D-04: `1（段階移行）`（今回作業内に移行フェーズを含める）
- D-05: `2（本番相当フル検証）`

## 10. 実施結果（2026-04-07）

- Phase0: 現状スナップショット取得を実施
  - Queue/Scheduler は `asia-northeast1` 側で稼働
  - `business-date-assessment-queue` に malformed task（HTTP 400）を確認
- Phase1: malformed task をピンポイント削除
  - `open_assessment_2026-04-04/05`, `close_assessment_2026-04-03/04/05` を削除
  - 削除後キュー空を確認
- Phase2: SA 統一をコード反映
  - `OPENCLOSE_INVOKER_SA_PREFIX` を `tasks-invoker` に統一
  - 既存 `openclose-tasks-invoker` 非存在を確認し、参照を解消
- Phase3: scheduler 実行ログ書き込みの `undefined` 混入を修正
  - `schedulerDispatchLogs` / `schedulerExecutionLogsByCloudTask` で undefined field を除外
- Phase4: 影響関数を限定デプロイし、手動投入で実行確認
  - weeklyPlanner → business-date-assessment-queue への task 生成を確認
  - 生成 task の body / `Content-Type` / OIDC SA が正しいことを確認
  - open/close assessment 実行が `HTTP 200` であることを確認
  - scheduler enqueue 系・payroll task 系の手動投入が `HTTP 204` であることを確認
- Phase6: `us-central1` 残存関数を整理
  - `probe*` 系 5 関数を削除
  - Functions のリージョンが `asia-northeast1` のみに統一されたことを確認
- Phase7: `default-store` 段階移行を実施（第一段）
  - 単一店舗モード（既定 ON）では strict reject しないよう runtime を調整
  - recurring generate 側の strict skip 条件を単一店舗モードで緩和
  - 備考: 文字列としての `default-store` を完全排除するにはデータ移行と query 戦略の追加対応が別途必要

### 10.1 追補実施（2026-04-07 後半）

- `default-store` 後段対応（データ移行なし前提）を実装
  - `createScheduledTournament` / `createTournamentRecurrence` / recurring generate / enqueue で
    欠損・legacy default 値を `projectId` ベースに正規化
  - 既存データ互換のため、重複判定に legacy default 値を含めるガードを追加
- `probe*` を本番 export から除外し、クラウド上の `probe*` 関数を削除
- 運用資料（`運用時資料/導入時設定/fireBase紐付け`）を `tasks-invoker` 単一運用に統一
- テスト整備
  - `cloudTasksConfig.spec.ts` の期待値更新
  - `storeTenantIdentity.spec.ts` を追加
