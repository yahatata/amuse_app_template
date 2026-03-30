# To-Be 仕様書：環境変数運用の再設計

作成日: 2026-03-30  
最終更新: 2026-03-30（ユーザー確認結果を反映・SDK 設計刷新・コード固定範囲拡大・全 scheduler ON/OFF 統一）  
対象: `functions/` 配下の全 Cloud Functions v2  
前提確認済み: `functions/.env.amuse-app-template`・全 `functions/src/**/*.ts` grep

---

## 目的

1リポジトリから複数店舗向けアプリ（各店舗 = 別 Firebase プロジェクト）をリリースする運用において、
- **誤反映・誤上書きが起きにくい構成**へ移行する
- 設定値の性質（機密 / インフラ / 業務ルール / 実行環境）に応じて置き場を分ける
- `.env` ファイルに "既に Firestore で管理されている値" や "コード未参照の幽霊キー" が残存している状態を解消する

> **注意**: 本書は To-Be 仕様の定義であり、実装指示ではない。移行タスクの分解は後半セクションを参照。

---

## 前提

| 項目 | 内容 |
|------|------|
| リポジトリ構成 | 1リポジトリ・複数 Firebase プロジェクト（`amuse-app-template` 等） |
| 設定移行先の基本候補 | ① Secret Manager、② Firestore、③ コード固定、④ 実行環境注入のまま |
| parameterized configuration の方針 | **原則使わない**。既存の `defineString` 2件（`STAFF_RICHMENU_ID` / `USER_RICHMENU_ID`）は廃止し SM へ移行（**確定**） |
| Secret Manager の束ね方針 | 関連する複数値を **JSON ひとかたまり**で保持する |
| scheduler の方針 | 各店舗差分を CRON 自体に持たない。共通の監視用 scheduler ＋ Firestore 設定 ＋ Cloud Tasks で対応 |
| 値そのものは本書に出力しない | 機密値はマスク対象 |

---

## 現状整理（実コード確認済みの事実）

### 現在 `functions/.env.amuse-app-template` に定義されているキー一覧

```
CONTROL_HOOK_URL
TASKS_QUEUE
TASKS_LOCATION
TASKS_INVOKER_SA
TEMPLATE_BUSINESSDATE_CHECK          ← .env にあるが本番 src は FS 参照
RECURRING_TOURNAMENT_TASKS_QUEUE     ← .env にあるがコード未参照（幽霊）
RECURRING_TOURNAMENT_TASKS_INVOKER_SA ← 同上
LINE_CHANNEL_ACCESS_TOKEN
STAFF_RICHMENU_ID
USER_RICHMENU_ID
ENABLE_SETTLEMENT_AGGREGATOR         ← .env にあるが本番 src は FS 参照
LINE_PLAN                            ← 同上
ENABLE_AUTO_OPEN_CLOSE               ← 同上
TASK_CLOSE_OFFSET_MINUTES            ← 同上
TASK_OPEN_OFFSET_MINUTES             ← 同上
CLOSE_ASSESSMENT_URL
OPEN_ASSESSMENT_URL
WEEKLYPLANNER_TASKS_QUEUE
WEEKLYPLANNER_TASKS_LOCATION
ENQUEUE_SCHEDULER_ENABLED            ← .env にあるが本番 src は FS 参照
QR_SECRET_KEY
WEEKLY_PLANNER_CRON
RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON
ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON
UNCLOCKED_ATTENDANCE_EDIT_PASSWORD
MONTHLY_PAYROLL_TRIGGER_CRON
SCHEDULED_CLEANUP_CRON
SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_CRON
```

### 現在 `.env` には存在しないが実コードで参照しているキー

- `GCLOUD_PROJECT` / `GCP_PROJECT` / `PROJECT_ID` — 実行環境注入（プラットフォーム）
- `NODE_ENV` — Node.js 慣習
- `FUNCTIONS_EMULATOR` — Firebase エミュレータが注入
- `K_SERVICE` / `K_REVISION` — Cloud Run が注入（ログ用途）

### 現在 `unused_function_lib` のみが参照しているキー

- `STORE_CLOSE_HOUR` — Phase4 で廃止済み（Firestore/Cloud Tasks 移行）
- `WRITE_TODAYS_BILLS_IN_PARALLEL` — Phase0B で廃止済み（Firestore `features.dualWriteEnabled` が真実源）

---

## To-Be 方針

| 分類 | 振り分け先 | 判断基準 |
|------|-----------|---------|
| 機密値（トークン・秘密鍵・パスワード） | **Secret Manager（JSON まとめ）** | 漏洩時の影響が大きく、アプリからは読み取るだけ |
| インフラ URL（Cloud Tasks エンドポイント等） | **Secret Manager（JSON まとめ）** | プロジェクト単位で異なり、誤設定で別プロジェクトへリクエストが飛ぶ |
| インフラ定数（queue 名・region・SA 名プレフィックス） | **コード固定** | 機密でなく全プロジェクト共通。SA メールは project ID から計算。デプロイ時に混入しない |
| 業務ルール・フラグ（既に Firestore 化済み） | **Firestore（現状維持）** | `storeMeta/config` や `schedulerConfig` が真実源として稼働中 |
| 業務ルール・フラグ（未移行・運用中に変えたい） | **Firestore（移行）** | デプロイなしで変更可能にすべきもの |
| CRON スケジュール文字列 | **コード固定（削除）** | 店舗差分は CRON 自体に持たない。実行有無は Firestore ゲートで制御 |
| プラットフォーム注入値 | **実行環境注入のまま** | Firebase/Cloud Run/Node が自動注入。管理対象に含めない |
| テスト専用・開発専用 | **ローカル/CI のみ（本番 Functions 管理外）** | 本番 Functions には不要 |
| コード未参照・移行済み残骸 | **削除** | `.env` から削除し、将来の混乱を防ぐ |

---

## 環境変数の最終振り分け表

### 凡例

| 記号 | 意味 |
|------|------|
| **事実** | 実コードを grep して確認した内容 |
| **解釈** | 運用・セキュリティ観点からの推奨（確定ではない） |
| **判断保留** | Cursor 側で確定できず、ユーザー確認が必要 |

---

| 変数名 | 現状の利用状況 | 現状の参照箇所（事実） | 用途 | 最終振り分け先 | その理由 | 必要な変更内容 | 追加で確認が必要なこと | 判断保留 |
|--------|------------|---------------------|------|-------------|---------|-------------|-----------------|--------|
| `CONTROL_HOOK_URL` | **本番主系で利用中** | `tasks.ts` `getEnv` | トーナメント Cloud Task の HTTP ターゲット URL | **Secret Manager**（`task-endpoints` JSON に統合） | URL は機密性あり・プロジェクト単位・誤設定で別系統への POST | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `TASKS_QUEUE` | **本番主系で利用中** | `tasks.ts` `getEnv` | トーナメント Cloud Tasks のキュー名 | **コード固定**（定数 `TOURNAMENT_TASKS_QUEUE`） | キュー名は機密でなくインフラ定義。全プロジェクト共通のため固定で十分 | `.env` から削除；定数 `TOURNAMENT_TASKS_QUEUE` へ置き換え | **実際のキュー名を GCP コンソールで確認** | **いいえ** |
| `TASKS_LOCATION` | **本番主系で利用中** | `tasks.ts` `getEnv` | Cloud Tasks のリージョン | **コード固定**（定数 `TOURNAMENT_TASKS_REGION`） | tournament キューは既に `asia-northeast1`（確認済み）。SM 不要 | `.env` から削除；定数 `TOURNAMENT_TASKS_REGION = 'asia-northeast1'` へ置き換え | — | **いいえ** |
| `TASKS_INVOKER_SA` | **本番主系で利用中**（tournament + weeklyPlanner + continueBusinessTerminal で共用） | `tasks.ts`・`weeklyPlanner.ts`・`continueBusinessTerminal.ts` `getEnv` | Cloud Tasks 呼び出し時 OIDC 発行 SA メール | **コード固定**（SA プレフィックス定数 + `GCLOUD_PROJECT` から計算） | SA 名プレフィックスは全プロジェクト共通。メールアドレスは `${prefix}@${projectId}.iam.gserviceaccount.com` で計算可能。機密でもない | `.env` から削除；`buildInvokerSaEmail(prefix)` ヘルパーへ置き換え；用途別に定数を 2 つ定義 | **実際の SA 名プレフィックスを GCP コンソールで確認** | **いいえ** |
| `CLOSE_ASSESSMENT_URL` | **本番主系で利用中** | `weeklyPlanner.ts`・`continueBusinessTerminal.ts` `getEnv` | 閉店認定 HTTP エンドポイント URL | **Secret Manager**（`task-endpoints` JSON に統合） | 同上 | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `OPEN_ASSESSMENT_URL` | **本番主系で利用中** | `weeklyPlanner.ts` のみ `getEnv`（`continueBusinessTerminal` では未使用・**事実**） | 開店認定 HTTP エンドポイント URL | **Secret Manager**（`task-endpoints` JSON に統合） | 同上 | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `WEEKLYPLANNER_TASKS_QUEUE` | **本番主系で利用中** | `weeklyPlanner.ts`・`continueBusinessTerminal.ts` `getEnv` | 開閉店 assessment 用 Cloud Tasks キュー名 | **コード固定**（定数 `OPENCLOSE_TASKS_QUEUE`） | 同上（キュー名は機密でなく全プロジェクト共通） | `.env` から削除；定数 `OPENCLOSE_TASKS_QUEUE` へ置き換え | **実際のキュー名を GCP コンソールで確認** | **いいえ** |
| `WEEKLYPLANNER_TASKS_LOCATION` | **本番主系で利用中** | 同上 `getEnv` | 上記キューのリージョン | **コード固定**（定数 `OPENCLOSE_TASKS_REGION`） | openclose キューは現在 `us-central1`。フェーズ 7 で `asia-northeast1` へ変更予定 | `.env` から削除；定数 `OPENCLOSE_TASKS_REGION = 'us-central1'` へ置き換え | — | **いいえ** |
| `LINE_CHANNEL_ACCESS_TOKEN` | **本番主系で利用中** | `lineWebhook.ts`・`lineMessaging.ts`・`lineRichMenu.ts` `process.env` 直接 | LINE Messaging API 認証トークン | **Secret Manager**（`line-config` JSON に統合） | 機密性が高い；漏洩でなりすまし通知 | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `QR_SECRET_KEY` | **本番主系で利用中** | `qrCodeUtils.ts` `process.env` 直接（未設定時 undefined でエラー経路） | QR コード署名・検証用秘密鍵 | **Secret Manager**（`business-secrets` JSON に統合または単体） | 機密性最高；漏洩で偽 QR 生成可能 | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD` | **本番主系で利用中** | `verifyUnclockedAttendanceEditPassword.ts`・`updateUnclockedAttendanceWithAuth.ts` `process.env[定数]` | 未退勤修正 Callable のパスワード照合 | **Secret Manager**（`business-secrets` JSON）| devops のみ管理と確定（**確定**） | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `STAFF_RICHMENU_ID` | **本番主系で利用中**（`defineString` 経由） | `lineRichMenu.ts` `defineString` + `.value()` | スタッフ向け LINE リッチメニュー ID | **Secret Manager**（`line-config` JSON）| 店舗ごとに異なることを確定（**確定**）。SM に集約 | `defineString` 廃止；SM 参照コードへ変更 | — | **いいえ** |
| `USER_RICHMENU_ID` | **本番主系で利用中**（`defineString` 経由） | `lineRichMenu.ts` 同上 | ユーザー向け LINE リッチメニュー ID | **Secret Manager**（`line-config` JSON）| 同上（**確定**） | 同上 | — | **いいえ** |
| `WEEKLY_PLANNER_CRON` | **本番主系で利用中**（CRON 定義）| `weeklyPlanner.ts` モジュール先頭 `process.env` | 週次 Planner の起動時刻（cron 式） | **削除**（コード固定） | scheduler To-Be により CRON を env 管理から撤退。店舗差分は Firestore `autoOpenClose` で制御済み | env 削除；`onSchedule` の schedule をハードコードへ変更；フォールバックコード削除 | — | **いいえ** |
| `RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON` | **本番主系で利用中**（CRON 定義） | `GenerateRecurringTournamentsByScheduler.ts` モジュール先頭 `process.env` | 定期トーナメント生成スケジュール | **削除**（コード固定） | 同上。ON/OFF は `schedulerConfig.generateRecurringTournamentsEnabled`（**新規追加、確定**）で制御 | 同上；`schedulerConfig` に新フィールド追加 | — | **いいえ** |
| `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON` | **本番主系で利用中**（CRON 定義） | `EnqueueTournamentTasksByScheduler.ts` モジュール先頭 `process.env` | 日次 enqueue スケジュール | **削除**（コード固定） | 同上。ON/OFF は Firestore `features.enqueueSchedulerEnabled` 済み | 同上 | — | **いいえ** |
| `MONTHLY_PAYROLL_TRIGGER_CRON` | **本番主系で利用中**（CRON 定義） | `monthlyPayrollTrigger.ts` モジュール先頭 `process.env` | 月次給与計算トリガー起動日時 | **削除**（scheduler 再設計） | scheduler To-Be により、日次監視 + Firestore `payrollConfig.payrollEndDay` で発火判定する設計へ変更 | CRON env 削除；毎日定時起動 + Firestore 判定パターンへ改修 | **下記 scheduler To-Be セクション参照** | **いいえ** |
| `SCHEDULED_CLEANUP_CRON` | **本番主系で利用中**（CRON 定義） | `scheduledCleanup.ts` モジュール先頭 `process.env` | 却下シフト自動削除スケジュール | **削除**（コード固定） | 全店舗共通で同一時刻でよい。ON/OFF は Firestore `schedulerConfig.scheduledCleanupEnabled` 済み | 同上 | — | **いいえ** |
| `SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_CRON` | **本番主系で利用中**（CRON 定義） | `scheduleGenerateNextYearBusinessHours.ts` モジュール先頭 `process.env` | 翌年営業時間自動生成スケジュール | **削除**（コード固定） | 年1回・全店舗同一時刻でよい。ON/OFF は Firestore `schedulerConfig.*` 済み | 同上 | — | **いいえ** |
| `PROJECT_ID` | **本番主系で利用中**（フォールバックあり） | `tasks.ts`・`weeklyPlanner.ts`・`continueBusinessTerminal.ts` `process.env` + フォールバック文字列 `'amuse-app-template'` | Cloud Tasks `queuePath` に使用するプロジェクト ID | **実行環境注入のまま**（フォールバック文字列を削除） | GCP/Firebase が注入する。フォールバックにテンプレ名が残ると本番で誤プロジェクト参照になる | **フォールバック文字列を削除**し、未設定時は `throw new Error(...)` に変更 | — | **いいえ** |
| `GCLOUD_PROJECT` | **本番主系で利用中** | `weeklyPlanner.ts`・`continueBusinessTerminal.ts`・`logOpsError.ts`・`scripts/check-default-store-tenant.ts` | プロジェクト ID 取得（フォールバック連鎖の一部） | **実行環境注入のまま** | プラットフォームが注入。管理対象にしない | フォールバック文字列削除（`PROJECT_ID` 同様）| — | **いいえ** |
| `GCP_PROJECT` | **本番主系で利用中** | 同上 | 同上（`GCLOUD_PROJECT` の別名） | **実行環境注入のまま** | 同上 | 同上 | — | **いいえ** |
| `NODE_ENV` | **本番主系で利用中** | `index.ts` | 開発時のみ `dotenv.config()` を呼び出す分岐 | **実行環境注入のまま** | Node.js / ビルドチェーンが注入 | 変更不要 | — | **いいえ** |
| `FUNCTIONS_EMULATOR` | **本番主系で参照**（エミュレータ判定） | `shared/runtime.ts` | `isProductionRuntime()` の判定 | **実行環境注入のまま** | Firebase エミュレータが注入。本番 Functions では未設定が正常 | 変更不要 | — | **いいえ** |
| `K_SERVICE` | **本番主系で参照**（ログのみ） | `generateQRCode.ts` | Cloud Run リビジョン識別ログ | **実行環境注入のまま** | Cloud Run が注入 | 変更不要 | — | **いいえ** |
| `K_REVISION` | **本番主系で参照**（ログのみ） | `generateQRCode.ts` | 同上 | **実行環境注入のまま** | 同上 | 変更不要 | — | **いいえ** |
| `FIRESTORE_EMULATOR_HOST` | テストのみ（本番主系不要） | `__tests__/` 各ファイル | エミュレータ Firestore への接続先 | **実行環境注入のまま**（ローカル / CI 管理） | 本番 Functions の管理対象外 | 変更不要（`.env` にも書かない） | — | **いいえ** |
| `RUN_EMULATOR_TESTS` | テストのみ | `step1_emulator_verification.spec.ts` | emulator テストのスキップスイッチ | **実行環境注入のまま**（テスト実行者が制御） | 同上 | 変更不要 | — | **いいえ** |
| `TEMPLATE_BUSINESSDATE_CHECK` | **本番では既に無効**（Firestore 移行済み） | 本番 src 未参照；`getStoreConfig().features.templateBusinessDateCheck` が真実源（**事実**） | テンプレ重複チェック | **削除**（`.env` から除去） | Firestore `storeMeta/config` 移行済みで `.env` の値は読まれない | `.env` から削除 | — | **いいえ** |
| `ENABLE_AUTO_OPEN_CLOSE` | **本番では既に無効**（Firestore 移行済み） | 本番 src 未参照；`getStoreConfig().autoOpenClose.enabled` が真実源（**事実**） | 自動開閉店フラグ | **削除** | 同上 | `.env` から削除 | — | **いいえ** |
| `TASK_CLOSE_OFFSET_MINUTES` | **本番では既に無効**（Firestore 移行済み） | 本番 src 未参照；`getStoreConfig().autoOpenClose.taskCloseOffsetMinutes`（**事実**） | 閉店タスクオフセット（分） | **削除** | 同上 | `.env` から削除 | — | **いいえ** |
| `TASK_OPEN_OFFSET_MINUTES` | **本番では既に無効**（Firestore 移行済み） | 本番 src 未参照；`getStoreConfig().autoOpenClose.taskOpenOffsetMinutes`（**事実**） | 開店タスクオフセット（分） | **削除** | 同上 | `.env` から削除 | — | **いいえ** |
| `ENQUEUE_SCHEDULER_ENABLED` | **本番では既に無効**（Firestore 移行済み） | 本番 src 未参照；`getStoreConfig().features.enqueueSchedulerEnabled`（**事実**） | enqueue スケジューラ有効化 | **削除** | 同上 | `.env` から削除 | — | **いいえ** |
| `LINE_PLAN` | **本番では既に無効**（Firestore 移行済み） | 本番 src 未参照；`getStoreConfig().linePlan`（**事実**）| LINE プラン種別 | **削除** | 同上 | `.env` から削除 | — | **いいえ** |
| `ENABLE_SETTLEMENT_AGGREGATOR` | **本番では既に無効**（Firestore 移行済み） | 本番 src 未参照；`billsOnSettle.ts` は `getStoreConfig().features.settlementAggregatorEnabled`（**事実**） | 精算集約フラグ | **削除** | 同上 | `.env` から削除；テストのモック参照も整理 | — | **いいえ** |
| `RECURRING_TOURNAMENT_TASKS_QUEUE` | **幽霊キー**（コード未参照） | TS 参照なし（**事実**）。`TASKS_QUEUE` が実体 | 不明（重複候補） | **削除** | コード内に参照が存在しない | `.env` から削除 | — | **いいえ** |
| `RECURRING_TOURNAMENT_TASKS_INVOKER_SA` | **幽霊キー**（コード未参照） | TS 参照なし（**事実**）。`TASKS_INVOKER_SA` が実体 | 不明 | **削除** | 同上 | `.env` から削除 | — | **いいえ** |
| `STORE_CLOSE_HOUR` | **unused_function_lib のみ** | `unused_function_lib/configOps.ts` のみ | 旧締め時刻（Phase4 廃止済み） | **削除**（将来）| `unused_function_lib` は現時点削除しない方針（index.ts 未 export のため本番影響なし）。将来削除時に同時解消 | 現時点は変更不要；将来 `unused_function_lib` 削除時に同時削除 | — | **いいえ** |
| `WRITE_TODAYS_BILLS_IN_PARALLEL` | **unused_function_lib のみ**（コメントアウト済み） | `unused_function_lib/nightlyReconciliationCheck.ts`（コメントアウト内） | 旧デュアルライト（Phase0B 廃止済み） | **削除**（将来）| 同上 | 同上 | — | **いいえ** |

---

## scheduler To-Be

### なぜ各店舗差分を CRON 自体に持たない方がよいか

1. **誤反映リスク**: 1 リポジトリから複数 Firebase プロジェクトへデプロイする際、`.env` の CRON 値を書き間違えると、全く異なる時刻でジョブが起動する。
2. **デプロイと設定の結合**: CRON を変えるにはデプロイが必要。店舗の営業時間が変わるたびにリリースオペレーションが発生する。
3. **監査の困難さ**: `.env` に散在した CRON 値は、どれが現在 Cloud Scheduler に反映されているか確認しにくい。
4. **真実源の二重化**: `onSchedule.schedule` が実態だが、`process.env.*_CRON` が "上書き可能" という構造は設計意図が不明瞭。

### To-Be: scheduler の責務分離

```
Cloud Scheduler（固定 CRON・プラットフォーム定義）
    ↓ 定刻に起動
Cloud Functions: 監視用 scheduler
    ↓ Firestore を確認（ON/OFF・実行条件・時刻設定）
条件を満たす → Cloud Tasks にタスクを投入（scheduleTime 指定）
条件を満たさない → 何もしない（skip ログ）
    ↓
Cloud Tasks → 実処理 Function
```

### 各 scheduler の To-Be 詳細

#### 【グループ A】毎日監視で十分なもの（Firestore 判定あり）

| scheduler | 現在の CRON env | To-Be CRON（コード固定） | Firestore 判定 | 変更内容 |
|-----------|---------------|----------------------|--------------|---------|
| `enqueueTournamentTasksByScheduler` | `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON` | `'0 5 * * *'`（UTC 05:00 = JST 14:00） | `features.enqueueSchedulerEnabled`（Firestore、実装済み） | CRON env 削除。`process.env... \|\| '...'` パターンを撤去し `onSchedule` に直書き |
| `scheduledCleanup` | `SCHEDULED_CLEANUP_CRON` | `'0 2 * * *'`（UTC 02:00 = JST 11:00） | `schedulerConfig.scheduledCleanupEnabled`（Firestore、実装済み） | 同上 |
| `monthlyPayrollTrigger` | `MONTHLY_PAYROLL_TRIGGER_CRON` | `'0 14 * * *'`（UTC 14:00 = JST 23:00） | **新規: Firestore `payrollConfig.payrollEndDay` で発火日を判定**；`schedulerConfig.monthlyPayrollTriggerEnabled` で ON/OFF（実装済み） | 下記「毎日監視型への再設計」参照 |
|| `payrollNotificationScheduler` | なし（CRON コード固定 `'0 21 * * *'`） | `'0 21 * * *'`（UTC 21:00 = JST 06:00、変更なし） | `schedulerConfig.payrollNotificationEnabled`（**新規追加、確定**）；現在 Firestore ゲートなし | `schedulerConfig` に `payrollNotificationEnabled` を追加；起動直後に Firestore を確認してスキップ |

#### 【グループ B】週次・年次で固定してよいもの

| scheduler | 現在の CRON env | To-Be CRON（コード固定） | Firestore 判定 | 変更内容 |
|-----------|---------------|----------------------|--------------|---------|
| `weeklyPlanner` | `WEEKLY_PLANNER_CRON` | `'0 11 * * 0'`（既存デフォルト、UTC Sunday 11:00 = JST 20:00） | `autoOpenClose.enabled`（Firestore、実装済み） | CRON env 削除；コード固定 |
| `generateRecurringTournamentsByScheduler` | `RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON` | `'0 23 * * 0'`（UTC Sun 23:00 = JST Mon 08:00）| `schedulerConfig.generateRecurringTournamentsEnabled`（**新規追加、確定**） | CRON env 削除；`schedulerConfig` に新フィールド追加；起動直後に Firestore を確認してスキップ |
| `scheduleGenerateNextYearBusinessHours` | `SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_CRON` | `'25 23 28 1 *'`（UTC Jan 28 23:25 = JST Jan 29 08:25）| `schedulerConfig.scheduleGenerateNextYearBusinessHoursEnabled`（実装済み） | CRON env 削除；コード固定 |

> **方針確定**: 全 scheduler の ON/OFF を Firestore で制御する。`generateRecurringTournamentsByScheduler` は `schedulerConfig.generateRecurringTournamentsEnabled` を新規追加し、`payrollNotificationScheduler` は `schedulerConfig.payrollNotificationEnabled` を新規追加する。


---

### schedulerConfig Firestore スキーマ（To-Be）

全 scheduler の ON/OFF を `storeMeta/schedulerConfig` で管理する方針に統一する。

```typescript
// shared/config/schedulerConfigTypes.ts（更新版）
export interface SchedulerConfig {
  // ─── 既存（実装済み） ──────────────────────────────────────────────
  monthlyPayrollTriggerEnabled?: boolean;
  scheduledCleanupEnabled?: boolean;
  scheduleGenerateNextYearBusinessHoursEnabled?: boolean;

  // ─── 新規追加 ──────────────────────────────────────────────────────
  /** 定期開催トーナメント自動生成（generateRecurringTournamentsByScheduler） */
  generateRecurringTournamentsEnabled?: boolean;
  /** 給与通知スケジューラー（payrollNotificationScheduler） */
  payrollNotificationEnabled?: boolean;
}
```

`weeklyPlanner` と `enqueueTournamentTasksByScheduler` の ON/OFF は引き続き `storeMeta/config`（`autoOpenClose.enabled`・`features.enqueueSchedulerEnabled`）で管理する。  
（業務設定として `storeConfig` に置く方が適切なため、`schedulerConfig` への移動は不要）

#### `schedulerConfigLoader.ts` の更新内容

- `buildSchedulerConfigFromDefaults()` に 2 フィールドを追加
- `mergeSchedulerConfigWithDefaults()` に 2 フィールドの型チェックを追加
- `defaults.ts` に以下を追加:
  ```typescript
  export const DEFAULT_GENERATE_RECURRING_TOURNAMENTS_ENABLED = true;
  export const DEFAULT_PAYROLL_NOTIFICATION_ENABLED = true;
  ```

#### 【毎日監視型への再設計】`monthlyPayrollTrigger`

**現状の問題点**:
- CRON `MONTHLY_PAYROLL_TRIGGER_CRON` で毎月 25 日固定。店舗ごとに給与締め日が異なる場合、この CRON 自体を変える必要がある。
- `payrollConfig.payrollEndDay` が Firestore に存在するにもかかわらず、CRON はそれを参照していない。

**To-Be 設計**（`payrollNotificationScheduler` と対称）:

```
毎日定時に起動（例: '0 14 * * *' = JST 23:00）
    ↓
Firestore `payrollConfig.payrollEndDay` を取得
    ↓
今日が payrollEndDay と一致する → 給与計算処理を実行
一致しない → skip ログのみ
```

**変更内容**:
1. `MONTHLY_PAYROLL_TRIGGER_CRON` env を削除
2. `onSchedule` の schedule を `'0 14 * * *'`（毎日 JST 23:00）に変更
3. 関数冒頭で `payrollConfig.payrollEndDay` を読み取り
4. `new Date()` の JST 日付が `payrollEndDay` と一致する日だけ処理実行

**Firestore の責務**:

```
Firestore: payrollConfig
├── payrollEndDay: number  // 給与締め日（例: 25）
├── payrollStartDay: number
└── schedulerNotificationHour: number  // 通知時刻（既存）
```

`storeMeta/config` の `payroll.endDay` / `payroll.startDay` として既に設計されているため（`defaults.ts` 確認済み）、ここへの参照を使う。

#### Cloud Scheduler と Cloud Tasks と Firestore の責務分離（まとめ）

| 責務 | 担当 |
|------|------|
| **「いつ起動するか」の定義** | Cloud Scheduler（コード固定 CRON） |
| **「動かすか・動かさないか」の判断** | Firestore（schedulerConfig・storeConfig.features） |
| **「実際のタスクをいつ実行するか」の設定** | Cloud Tasks（scheduleTime）|
| **実処理** | Cloud Functions（HTTP / Task Queue Function） |
| **業務設定（締め日・時刻オフセット等）** | Firestore（storeMeta/config・payrollConfig） |

**ロジックのみのデプロイ時に店舗差分設定を巻き込まないことの担保**:  
CRON をコード固定にし、業務設定を Firestore に置くことで、「コードのデプロイが店舗設定を上書きする」リスクが構造上排除される。  
`.env` の CRON 値がデプロイ時に意図せず変わる、あるいは `.env.storeA` の値を `.env.storeB` に間違って適用するリスクがなくなる。

#### idempotency / 二重投入防止

- `weeklyPlanner`: 既存実装で `task.name` を固定（`open_assessment_{dateKey}` / `close_assessment_{dateKey}`）。ALREADY_EXISTS（code 6）を catch して skip。**継続**。
- `enqueueTournamentTasksByScheduler`: `enqueueTournamentTask` 内で `${tournamentId}-${taskType}-${planHash}` の deterministic task name。**継続**。
- `monthlyPayrollTrigger` 再設計後: 同一月の二重起動防止のため、Firestore に `lastExecutedYearMonth` を記録し、同月実行済みならスキップする仕組みを追加する。

---

## コード固定 To-Be

### 対象と定数定義

SM に入れるほどではなく、かつプロジェクト間で共通または計算可能な値をコード固定とする。

#### `shared/config/cloudTasksConfig.ts`（新規作成）

```typescript
// Cloud Tasks / Cloud Scheduler インフラ定数
// 全 Firebase プロジェクトで共通のため、コード固定で管理する。

// ── リージョン ────────────────────────────────────────────────────────────
// ⚠️ 現在 tournament と openclose でリージョンが異なる（詳細は下記「コード固定 To-Be 補足」参照）
// フェーズ 7 でどちらも asia-northeast1 に統一する
export const TOURNAMENT_TASKS_REGION = 'asia-northeast1'; // 確定済み（現状維持）
export const OPENCLOSE_TASKS_REGION  = 'us-central1';     // フェーズ 7 で asia-northeast1 へ変更

// ── キュー名（GCP コンソールで確認済み） ─────────────────────────────────
export const TOURNAMENT_TASKS_QUEUE = 'tournament-queue';
export const OPENCLOSE_TASKS_QUEUE  = 'business-date-assessment-queue';

// ── SA 名プレフィックス ────────────────────────────────────────────────────
// 現在は tasks-invoker SA 1 つで両用途を兼用している。
// SA 分割（tournament / openclose 用を別々に作成）は GCP 側作業が必要。
// 分割前の移行期は TOURNAMENT_INVOKER_SA_PREFIX = OPENCLOSE_INVOKER_SA_PREFIX = 'tasks-invoker' でよい。
export const TOURNAMENT_INVOKER_SA_PREFIX = 'tasks-invoker';          // 既存 SA（現状維持）
export const OPENCLOSE_INVOKER_SA_PREFIX  = 'openclose-tasks-invoker'; // 新規 SA を作成（SA 分割時）

/**
 * SA メールアドレスを組み立てる
 * @param prefix  SA 名プレフィックス（例: 'tasks-invoker'）
 * @param projectId  GCP プロジェクト ID（GCLOUD_PROJECT から取得）
 */
export function buildInvokerSaEmail(prefix: string, projectId: string): string {
  return `${prefix}@${projectId}.iam.gserviceaccount.com`;
}
```

> **コード固定 To-Be 補足（リージョン混在の背景）**
>
> GCP コンソール確認の結果、2 つのキューのリージョンが現在異なる（事実）:
>
> | キュー | リージョン | 状態 |
> |--------|-----------|------|
> | `tournament-queue` | `asia-northeast1`（東京） | **移行済み** |
> | `business-date-assessment-queue` | `us-central1`（米国） | フェーズ 7 で移行 |
> | `finalizePayrollRun` | `us-central1` | フェーズ 7 で移行（または廃止） |
> | `processPayrollNotifications` | `us-central1` | フェーズ 7 で移行（または廃止） |
> | `processStaffPayroll` | `us-central1` | フェーズ 7 で移行（または廃止） |
>
> また Cloud Functions のリージョン指定（`region: 'us-central1'`）が **18 ファイル** に直書きされている（事実）。  
> フェーズ 7 ではキュー移行・Cloud Functions リージョン変更・assessment Cloud Run の再デプロイを一括で行う。

#### 既存コードの置き換え

| 置き換え前 | 置き換え後 |
|-----------|----------|
| `getEnv('TASKS_QUEUE')` | `TOURNAMENT_TASKS_QUEUE` |
| `getEnv('WEEKLYPLANNER_TASKS_QUEUE')` | `OPENCLOSE_TASKS_QUEUE` |
| `getEnv('TASKS_LOCATION')` | `CLOUD_TASKS_REGION` |
| `getEnv('WEEKLYPLANNER_TASKS_LOCATION')` | `CLOUD_TASKS_REGION` |
| `getEnv('TASKS_INVOKER_SA')` in `tasks.ts` | `buildInvokerSaEmail(TOURNAMENT_INVOKER_SA_PREFIX, projectId)` |
| `getEnv('TASKS_INVOKER_SA')` in `weeklyPlanner.ts` / `continueBusinessTerminal.ts` | `buildInvokerSaEmail(OPENCLOSE_INVOKER_SA_PREFIX, projectId)` |

> **注意**: `<要確認>` の値は GCP コンソールで実際の Cloud Tasks キュー名・SA 名を確認した上で埋めること。

---

## Secret Manager To-Be

### Secret の束ね方針

**原則**: 同一スコープ（同じ機能ドメイン・同じプロジェクトリソース）に属する複数値を 1 つの JSON シークレットとして保持する。

> `defineJsonSecret`（parameterized configuration）は使わない。代わりに `@google-cloud/secret-manager` SDK を直接使用する。

---

### シークレットのグループ定義

#### グループ 1: `line-config`

```json
{
  "channelAccessToken": "<LINE_CHANNEL_ACCESS_TOKEN>",
  "staffRichMenuId": "<STAFF_RICHMENU_ID>",
  "userRichMenuId": "<USER_RICHMENU_ID>"
}
```

| 項目 | 内容 |
|------|------|
| 対象変数 | `LINE_CHANNEL_ACCESS_TOKEN`・`STAFF_RICHMENU_ID`・`USER_RICHMENU_ID` |
| まとめる理由 | 同一 LINE チャネルに紐づく設定。プロジェクト単位で一式変わる |
| 確定情報 | `STAFF_RICHMENU_ID` / `USER_RICHMENU_ID` は店舗ごとに異なることが確定（**確定**）。SM に集約する。`defineString` は廃止。 |
| ローテーション | `LINE_CHANNEL_ACCESS_TOKEN` を再発行した場合、シークレットの新バージョンを追加し、コードは `versions/latest` 参照のため自動反映 |

#### グループ 2: `task-endpoints`（旧 `task-infra`、URL 3 件のみ）

```json
{
  "controlHookUrl": "<CONTROL_HOOK_URL>",
  "closeAssessmentUrl": "<CLOSE_ASSESSMENT_URL>",
  "openAssessmentUrl": "<OPEN_ASSESSMENT_URL>"
}
```

| 項目 | 内容 |
|------|------|
| 対象変数 | URL 3 件のみ。queue 名・SA・location はコード固定に変更 |
| まとめる理由 | Cloud Run / Cloud Functions エンドポイント URL はプロジェクト単位で異なり、誤設定で別プロジェクトへリクエストが飛ぶ。SM が適切 |
| SM から除外したもの | `tasksQueue`・`weeklyPlannerTasksQueue`（コード定数）、`tournamentInvokerSa`・`weeklyPlannerInvokerSa`（コード計算）、`location`（コード定数） |
| 注意 | URL がプロジェクト間で共通のパターンに乗っている場合は将来的にコード計算化も検討できる。現時点は SM に置き、安全側に倒す |

#### グループ 3: `business-secrets`

```json
{
  "qrSecretKey": "<QR_SECRET_KEY>",
  "unclockedAttendanceEditPassword": "<UNCLOCKED_ATTENDANCE_EDIT_PASSWORD>"
}
```

| 項目 | 内容 |
|------|------|
| 対象変数 | `QR_SECRET_KEY`・`UNCLOCKED_ATTENDANCE_EDIT_PASSWORD` |
| まとめる理由 | いずれも「アプリ内部でのみ参照する秘密情報」。外部サービスとの連携なし |
| 確定情報 | `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD` は devops 管理のみ（**確定**）。SM に統合する。 |

---

### コード側でのシークレット読み取り方式（UX・信頼性重視）

`defineSecret`（parameterized configuration）を使わず、**`@google-cloud/secret-manager` SDK を直接使用**する。

#### 設計原則

| 優先度 | 原則 | 実装上の判断 |
|--------|------|------------|
| 1 | UX を悪化させない | 高頻度パスではコールドスタート並走フェッチ + キャッシュヒットで応答 |
| 2 | 失敗しにくい（fail-fast） | 取得失敗時はキャッシュを null リセットしてリトライ可能にする。サイレント握りつぶし禁止 |
| 3 | 処理を重くしない | **Promise レベルのキャッシュ**で同一インスタンス内は最大 1 回/シークレットの SM 呼び出し |
| 4 | セキュリティ確保 | SM に格納・コード上に機密値を書かない |

#### Promise レベルキャッシュ（全シークレット共通パターン）

```typescript
// shared/secrets/secretManager.ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

async function fetchSecretJson<T>(secretName: string): Promise<T> {
  const projectId =
    process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? process.env.PROJECT_ID;
  if (!projectId) throw new Error('PROJECT_ID 未設定: Secret Manager アクセス不可');

  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
  });
  const payload = version.payload?.data?.toString('utf8');
  if (!payload) throw new Error(`Secret [${secretName}] のペイロードが空`);
  return JSON.parse(payload) as T;
}

// ── Promise をキャッシュ（オブジェクトではなく Promise）──────────────────────
// メリット: 並列リクエストが同時にきても SM 呼び出しは 1 回のみ
// メリット: インスタンス内で共有・重複取得なし
// 失敗時: Promise を null リセット → 次回呼び出しで再試行可能
// ─────────────────────────────────────────────────────────────────────────────
let _lineConfigP: Promise<LineConfig> | null = null;
let _taskEndpointsP: Promise<TaskEndpoints> | null = null;
let _businessSecretsP: Promise<BusinessSecrets> | null = null;

export function getLineConfig(): Promise<LineConfig> {
  if (!_lineConfigP) {
    _lineConfigP = fetchSecretJson<LineConfig>('line-config')
      .catch(err => { _lineConfigP = null; throw err; });
  }
  return _lineConfigP;
}

export function getTaskEndpoints(): Promise<TaskEndpoints> {
  if (!_taskEndpointsP) {
    _taskEndpointsP = fetchSecretJson<TaskEndpoints>('task-endpoints')
      .catch(err => { _taskEndpointsP = null; throw err; });
  }
  return _taskEndpointsP;
}

export function getBusinessSecrets(): Promise<BusinessSecrets> {
  if (!_businessSecretsP) {
    _businessSecretsP = fetchSecretJson<BusinessSecrets>('business-secrets')
      .catch(err => { _businessSecretsP = null; throw err; });
  }
  return _businessSecretsP;
}

// ── 高頻度パス向けウォームアップ ───────────────────────────────────────────
// モジュール先頭（onCall/onRequest の定義ファイル）で呼び出す
// コールドスタートと並走して SM フェッチを開始 → 最初のリクエスト処理時には取得済み
// ─────────────────────────────────────────────────────────────────────────────
export function warmupSecrets(): void {
  getLineConfig();       // lineWebhook / lineMessaging / lineRichMenu 系
  getTaskEndpoints();    // weeklyPlanner / continueBusinessTerminal 系
  getBusinessSecrets();  // qrCode / unclockedAttendance 系
}
```

#### 呼び出し側パターンの使い分け

| パス種別 | 対応方針 | コード例 |
|---------|---------|---------|
| **高頻度（webhook / onCall）** | モジュール先頭で `warmupSecrets()` 呼び出し → handler 内で `await getXxx()` | `warmupSecrets()` をファイル先頭に 1 行追加 |
| **低頻度（scheduler / admin callable）** | 遅延取得（handler 内で直接 `await getXxx()`）。コールドスタートレイテンシ許容 | 変更不要 |
| **テスト** | `jest.mock('../shared/secrets/secretManager')` でモジュールごとモック | モック関数を返すだけの実装に差し替え |
| **ローカル開発** | `GOOGLE_APPLICATION_CREDENTIALS` を設定して実 SM を参照、または jest モックで代替 | |

#### 既存の `.env` 参照からの置き換え

| 置き換え前 | 置き換え後 |
|-----------|----------|
| `getEnv('CONTROL_HOOK_URL')` | `(await getTaskEndpoints()).controlHookUrl` |
| `getEnv('CLOSE_ASSESSMENT_URL')` | `(await getTaskEndpoints()).closeAssessmentUrl` |
| `getEnv('OPEN_ASSESSMENT_URL')` | `(await getTaskEndpoints()).openAssessmentUrl` |
| `process.env.LINE_CHANNEL_ACCESS_TOKEN` | `(await getLineConfig()).channelAccessToken` |
| `process.env.QR_SECRET_KEY` | `(await getBusinessSecrets()).qrSecretKey` |
| `process.env[ENV_PASSWORD_KEY]` | `(await getBusinessSecrets()).unclockedAttendanceEditPassword` |

---

### 開発・テスト時の扱い

| 環境 | 方針 |
|------|------|
| ローカル開発（エミュレータ） | `.env` または `GOOGLE_APPLICATION_CREDENTIALS` + ローカル SM 相当のモックで対応 |
| テスト（Jest） | シークレット取得関数を `jest.mock()` でモック化 |
| CI/CD | デプロイ時は SA の IAM 権限（`secretmanager.versions.access`）で自動取得 |

---

### ローテーション時の考え方

1. Secret Manager に新バージョンを追加（古いバージョンは残す）
2. コードが `versions/latest` を参照しているため、新しいバージョンが即時反映
3. 古いバージョンを無効化・破棄
4. 問題発生時は旧バージョンを `latest` に再設定することでロールバック可能

---

### 店舗単位 / Firebase プロジェクト単位との対応関係

- **Secret Manager のシークレットはプロジェクトに紐づく**（GCP プロジェクト = Firebase プロジェクト = 1 店舗）
- 同一 SM シークレット名でも、プロジェクトが違えば内容が異なる → **誤反映が構造上起きない**
- 1 リポジトリから複数プロジェクトへデプロイする際、`.env` を手で書き換える運用が不要になる

---

## 実行環境注入のまま使うものの To-Be

### 対象と分類

| 変数名 | 実態 | To-Be |
|--------|------|-------|
| `GCLOUD_PROJECT` | Cloud Functions 実行時に Firebase が注入 | 実行環境注入のまま。コードは読み取るだけ |
| `GCP_PROJECT` | 同上（別名） | 同上 |
| `PROJECT_ID` | GCP 環境では注入されるが、Firebase Functions では **`GCLOUD_PROJECT` が主**（**事実**：フォールバック連鎖） | 実行環境注入のまま。ただし**フォールバック文字列を削除** |
| `NODE_ENV` | Node.js / ビルドチェーンが注入 | 変更不要 |
| `FUNCTIONS_EMULATOR` | Firebase エミュレータが注入（`"true"`） | 変更不要 |
| `K_SERVICE` | Cloud Run が注入 | 変更不要（ログ用途のみ） |
| `K_REVISION` | Cloud Run が注入 | 変更不要（ログ用途のみ） |

### 「コード固定」と「実行環境注入」の違い

- **コード固定**: リポジトリに値を直書きする。全デプロイで同一値になる。
- **実行環境注入**: デプロイ先（GCP プロジェクト）に応じてプラットフォームが自動で異なる値を注入する。

`PROJECT_ID` / `GCLOUD_PROJECT` / `GCP_PROJECT` は**実行環境注入**が正しい置き場。コード固定（= 文字列リテラルでフォールバック）にすると、別プロジェクトにデプロイした際に誤ったプロジェクト ID を使い続ける危険がある。

### `PROJECT_ID` フォールバック問題（重要）

**現状の危険なコード**（事実）:
```typescript
// tasks.ts・weeklyPlanner.ts・continueBusinessTerminal.ts
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID || 'amuse-app-template';
```

`'amuse-app-template'` というフォールバックが残っていると、注入が失敗した際に**テンプレートプロジェクトのリソースへ誤って操作が行われる**可能性がある。

**To-Be**:
```typescript
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? process.env.PROJECT_ID;
if (!PROJECT_ID) throw new Error('プロジェクト ID が未設定です。実行環境を確認してください。');
```

### 1 リポジトリ複数 Firebase プロジェクトでの project 判別

- `GCLOUD_PROJECT` は Firebase Functions 実行環境が自動注入するため、同一コードを複数プロジェクトにデプロイしても自然にプロジェクトが分離される
- SM のシークレット名も同一でよく、GCP プロジェクト境界でデータが分離される（誤反映リスクが構造上排除）

### 開発時の利便性

- ローカル開発時に `GCLOUD_PROJECT` が未設定になる場合は、`functions/.env`（`.gitignore` 済み）に `GCLOUD_PROJECT=amuse-app-template-dev` のように明示することで対応
- `functions/.env` は本番 Secret Manager のキーは含まないため、コミット漏れリスクが低い

---

## 実装 / 移行タスク

### フェーズ 0: 即時削除（リスクゼロ）

```
[ ] .env から以下のキーを削除:
    TEMPLATE_BUSINESSDATE_CHECK
    ENABLE_AUTO_OPEN_CLOSE
    TASK_CLOSE_OFFSET_MINUTES
    TASK_OPEN_OFFSET_MINUTES
    ENQUEUE_SCHEDULER_ENABLED
    LINE_PLAN
    ENABLE_SETTLEMENT_AGGREGATOR
    RECURRING_TOURNAMENT_TASKS_QUEUE
    RECURRING_TOURNAMENT_TASKS_INVOKER_SA
```

理由: Firestore 移行済みまたはコード未参照であるため、削除しても本番動作に影響なし。

---

### フェーズ 1: CRON env 削除 + コード固定（デプロイ 1 回で完了）

```
[ ] 各 scheduler ファイルの CRON env 参照パターンを削除:
    weeklyPlanner.ts
    GenerateRecurringTournamentsByScheduler.ts
    EnqueueTournamentTasksByScheduler.ts
    scheduledCleanup.ts
    scheduleGenerateNextYearBusinessHours.ts

[ ] onSchedule({ schedule: '<ハードコード文字列>' }) に変更

[ ] .env から *_CRON キーを全削除

[ ] monthlyPayrollTrigger.ts は別途フェーズ 2 で再設計
```

---

### フェーズ 2: PROJECT_ID フォールバック除去（安全性向上）

```
[ ] tasks.ts・weeklyPlanner.ts・continueBusinessTerminal.ts・logOpsError.ts の
    フォールバック文字列 'amuse-app-template' を削除
[ ] 未設定時は throw new Error() に変更
[ ] ローカル開発用 .env に GCLOUD_PROJECT を明示
```

---

### フェーズ 3: Cloud Tasks インフラ定数の導入（SM 移行前に必須）

リージョン・キュー名・SA プレフィックスをコード定数に置き換える。  
**GCP コンソール確認済みの実値を使用する（確認事項 F で解消済み）**。

```
[ ] shared/config/cloudTasksConfig.ts を作成（内容は「コード固定 To-Be」セクション参照）
    ・TOURNAMENT_TASKS_REGION = 'asia-northeast1'  （tournament キューのリージョン・確認済み）
    ・OPENCLOSE_TASKS_REGION  = 'us-central1'       （openclose キューのリージョン・フェーズ 7 で変更）
    ・TOURNAMENT_TASKS_QUEUE  = 'tournament-queue'  （確認済み）
    ・OPENCLOSE_TASKS_QUEUE   = 'business-date-assessment-queue'  （確認済み）
    ・TOURNAMENT_INVOKER_SA_PREFIX = 'tasks-invoker'          （既存 SA）
    ・OPENCLOSE_INVOKER_SA_PREFIX  = 'openclose-tasks-invoker' （SA 分割完了後）

[ ] tasks.ts の getEnv('TASKS_LOCATION') → TOURNAMENT_TASKS_REGION に置き換え
[ ] weeklyPlanner.ts / continueBusinessTerminal.ts の getEnv('WEEKLYPLANNER_TASKS_LOCATION') → OPENCLOSE_TASKS_REGION に置き換え

[ ] getEnv('TASKS_QUEUE') → TOURNAMENT_TASKS_QUEUE 定数へ置き換え
[ ] getEnv('WEEKLYPLANNER_TASKS_QUEUE') → OPENCLOSE_TASKS_QUEUE 定数へ置き換え
[ ] getEnv('TASKS_INVOKER_SA') in tasks.ts → buildInvokerSaEmail(TOURNAMENT_INVOKER_SA_PREFIX, projectId) へ置き換え
[ ] getEnv('TASKS_INVOKER_SA') in weeklyPlanner.ts / continueBusinessTerminal.ts → buildInvokerSaEmail(OPENCLOSE_INVOKER_SA_PREFIX, projectId) へ置き換え

[ ] .env から TASKS_LOCATION・WEEKLYPLANNER_TASKS_LOCATION・
    TASKS_QUEUE・WEEKLYPLANNER_TASKS_QUEUE・TASKS_INVOKER_SA を削除
```

---

### フェーズ 4: Secret Manager 移行（メイン作業）

Q2（SA 分割可否）が確定してから実施。

```
[ ] GCP 側で各プロジェクトに SM シークレットを作成:
    - line-config (JSON)
      {"channelAccessToken":…, "staffRichMenuId":…, "userRichMenuId":…}
    - task-endpoints (JSON)  ← 旧 task-infra。URL 3 件のみ
      {"controlHookUrl":…, "closeAssessmentUrl":…, "openAssessmentUrl":…}
      ※ queue 名・SA・location はコード固定に変更済みのため SM には含めない
    - business-secrets (JSON)
      {"qrSecretKey":…, "unclockedAttendanceEditPassword":…}

[ ] functions/ に @google-cloud/secret-manager をインストール

[ ] shared/secrets/secretManager.ts を実装（SM 読み取り + メモリキャッシュ）

[ ] 各参照箇所を SM 読み取りに書き換え:
    - lineRichMenu.ts（defineString 廃止）・lineMessaging.ts・lineWebhook.ts → line-config
    - tasks.ts・weeklyPlanner.ts・continueBusinessTerminal.ts → task-endpoints（URL のみ。queue/SA はコード定数に置き換え済み）
    - qrCodeUtils.ts → business-secrets
    - verifyUnclockedAttendanceEditPassword.ts・updateUnclockedAttendanceWithAuth.ts → business-secrets

[ ] .env から削除するキー:
    SM移行済み: CONTROL_HOOK_URL, CLOSE_ASSESSMENT_URL, OPEN_ASSESSMENT_URL,
                LINE_CHANNEL_ACCESS_TOKEN, STAFF_RICHMENU_ID, USER_RICHMENU_ID,
                QR_SECRET_KEY, UNCLOCKED_ATTENDANCE_EDIT_PASSWORD
    コード固定: TASKS_QUEUE, TASKS_INVOKER_SA, WEEKLYPLANNER_TASKS_QUEUE

[ ] テストのモック更新（SM 読み取り関数を jest.mock で差し替え）

[ ] IAM 設定: 各 Firebase プロジェクトの Functions SA に
    secretmanager.versions.access を付与
```

---

### フェーズ 4.5: schedulerConfig スキーマ拡張

全 scheduler の ON/OFF を Firestore で管理するための事前作業。

```
[ ] schedulerConfigTypes.ts に 2 フィールドを追加:
    generateRecurringTournamentsEnabled?: boolean
    payrollNotificationEnabled?: boolean

[ ] defaults.ts に対応するデフォルト値を追加:
    DEFAULT_GENERATE_RECURRING_TOURNAMENTS_ENABLED = true
    DEFAULT_PAYROLL_NOTIFICATION_ENABLED = true

[ ] schedulerConfigLoader.ts の buildSchedulerConfigFromDefaults() / mergeSchedulerConfigWithDefaults() を更新

[ ] generateRecurringTournamentsByScheduler.ts に Firestore ゲートを追加:
    const schedulerConfig = await getSchedulerConfig();
    if (!schedulerConfig.generateRecurringTournamentsEnabled) { return; }

[ ] payrollNotificationScheduler.ts に Firestore ゲートを追加:
    const schedulerConfig = await getSchedulerConfig();
    if (!schedulerConfig.payrollNotificationEnabled) { return; }
```

---

### フェーズ 5: monthlyPayrollTrigger 再設計

```
[ ] 毎日監視 + Firestore 判定パターンへ改修
[ ] MONTHLY_PAYROLL_TRIGGER_CRON を削除
[ ] Firestore payrollConfig.payrollEndDay 参照追加
[ ] 二重起動防止: lastExecutedYearMonth フィールドの追加
[ ] テスト修正
```

---

### フェーズ 6: unused_function_lib の削除（将来予定）

```
現時点は削除しない方針（**確認済み**）。将来削除時に以下を実施:

[ ] unused_function_lib ディレクトリを削除
    （STORE_CLOSE_HOUR・WRITE_TODAYS_BILLS_IN_PARALLEL の参照が自動消滅）
[ ] index.ts で export がないことを確認（現時点では未 export が事実）

補足:
- unused_function_lib は index.ts からエクスポートされていない（事実）
- デプロイ対象関数としては非稼働
- TypeScript コンパイルは通る（functions.config() の型は v2 でも残存）
- 現時点でコメントアウト等の対応は不要
```

---

### フェーズ 7: リージョン移行（`us-central1` → `asia-northeast1`）【確定計画】

日本専用運用のため `asia-northeast1`（東京）への移行を確定。適切なタイミングで実施する。

**GCP コンソール確認済みの現状（事実）**:

| リソース | 現在のリージョン | フェーズ 7 後 |
|---------|----------------|-------------|
| `tournament-queue`（Cloud Tasks） | `asia-northeast1` ✓ | そのまま |
| `business-date-assessment-queue`（Cloud Tasks） | `us-central1` | `asia-northeast1` へ移行 |
| `finalizePayrollRun` 他 payroll キュー（Cloud Tasks） | `us-central1` | 移行 or `monthlyPayrollTrigger` 廃止に伴い削除 |
| Cloud Functions（18 ファイルに `region: 'us-central1'` 直書き） | `us-central1` | `asia-northeast1` へ変更 |
| `closeAssessmentTask` / `openAssessmentTask`（Cloud Run） | `us-central1`（URL に `uc` 含む） | 新リージョンに再デプロイ・URL 更新 |
| `controlHookHttp`（Cloud Functions HTTP） | `us-central1`（URL に `us-central1` 含む） | 新リージョンに再デプロイ・URL 更新 |

**作業チェックリスト**:

```
[ ] business-date-assessment-queue を asia-northeast1 に新規作成
    （旧キューを並走させ、移行・確認後に旧キューを削除）
[ ] payroll キューは monthlyPayrollTrigger 廃止方針に合わせて削除または移行
[ ] Cloud Functions 18 ファイルの region: 'us-central1' を 'asia-northeast1' に一括変更
    ファイル例: continueBusinessTerminal.ts / openStore.ts / closeStore.ts /
              attendanceCallables 6件 / initializeStoreConfigCallable.ts 等
[ ] cloudTasksConfig.ts の OPENCLOSE_TASKS_REGION を 'asia-northeast1' に変更
[ ] closeAssessmentTask / openAssessmentTask を asia-northeast1 Cloud Run に再デプロイ
[ ] SM `task-endpoints` の closeAssessmentUrl / openAssessmentUrl を新 URL に更新
[ ] controlHookHttp を asia-northeast1 で再デプロイ
[ ] SM `task-endpoints` の controlHookUrl を新 URL に更新
[ ] Cloud Scheduler のリージョン確認（Cloud Scheduler はリージョン指定ではなく time zone 指定のため影響範囲を確認）
[ ] 動作確認（タスク投入 → 実行の疎通確認）
[ ] us-central1 の旧 Cloud Tasks キューを削除
```

> **注意**: Cloud Tasks キューとそのキューに投入するクライアント（Cloud Functions）は同一リージョンに揃えること。  
> `tournament-queue` は既に `asia-northeast1` だが、それを呼ぶ Functions は `us-central1` のため、  
> 現状は**クロスリージョン呼び出しが発生している（要確認）**。フェーズ 7 で解消する。

---

### フェーズ 8: GitHub Actions CI/CD 整備（後述）

下記「GitHub Actions To-Be」セクション参照。

---

### フェーズ 9: ドキュメント更新

```
[ ] 本 To-Be 仕様書の「判断保留」事項が解消されたら確定版に更新
[ ] 本 To-Be 仕様書の実装済みフェーズを随時「完了」マークに更新
[ ] .env.amuse-app-template の最終形（SM 移行後は空または最小限）を注記
```

---

## 判断保留事項

### 解消済み（ユーザー確認済み）

| # | 項目 | 結論 |
|---|------|------|
| 1 | `TASKS_LOCATION` / `WEEKLYPLANNER_TASKS_LOCATION` の単位 | **全店舗同一リージョン確定 → コード固定**（SM から除外） |
| 2 | `TASKS_INVOKER_SA` を用途別に分けるか | **分割確定**（`tournamentInvokerSa` / `weeklyPlannerInvokerSa`）。他 SA も既に用途別分離済み |
| 3 | `STAFF_RICHMENU_ID` / `USER_RICHMENU_ID` の単位 | **店舗ごとに異なる確定 → SM `line-config` JSON** |
| 4 | `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD` の管理者 | **devops 管理確定 → SM `business-secrets` JSON** |
| 5 | `unused_function_lib` を今削除するか | **現時点は削除しない。将来削除予定。** |
| 6 | デプロイ方法 | **GitHub Actions（CI/CD）を整備予定。現時点は手動。** |
| 7 | `generateRecurringTournamentsByScheduler` の ON/OFF ゲート | **全 scheduler の ON/OFF を Firestore 管理に統一**。`schedulerConfig` に 2 フィールド追加 |
| 8 | リージョン移行のタイミング | **フェーズ 7 として計画に組み込み確定**。全リソースを `asia-northeast1`（東京）へ移行 |

### 未解消（確認中）

現時点で未解消の項目はありません。

### 追加解消（ユーザー確認済み）

| # | 項目 | 結論 |
|---|------|------|
| 2 | `TASKS_INVOKER_SA` を用途別に分けるか | **分割確定**（`tournamentInvokerSa` / `weeklyPlannerInvokerSa`）。他 SA も既に用途別分離済みであることを確認 |
| 7 | `generateRecurringTournamentsByScheduler` の ON/OFF ゲート | **全 scheduler の ON/OFF を Firestore 管理に統一**。`schedulerConfig` に 2 フィールド追加 |
| 8 | リージョン移行のタイミング | **フェーズ 7 として計画に組み込み確定**。全リソースを `asia-northeast1`（東京）へ移行 |

---

## Cursor から見て追加でユーザー確認が必要な点

### 確認事項 A: `warmupSecrets()` の呼び出し方針（確認済み・設計方針決定済み）

SM SDK 直叩き + コールドスタートレイテンシへの懸念は、**Promise レベルキャッシュ + `warmupSecrets()` 事前フェッチ**方式の採用によって解消済み（上記「コード側でのシークレット読み取り方式」参照）。

`defineSecret`（parameterized configuration）や CI/CD での Secret 展開への代替案は不要。

> **残課題**: 高頻度 handler のファイル先頭に `warmupSecrets()` を追加するのはコードレビュー時に気付きにくい。実装時に以下のどちらを選ぶか決める:  
> - **方式 A**: 各 handler ファイルの先頭で `warmupSecrets()` を明示的に呼ぶ（現行仕様）  
> - **方式 B**: `index.ts` のモジュール読み込み時に一括 warmup（呼び忘れがない反面、不要なシークレットも初期化される）  
> 優先度は低く、実装開始時に判断すれば十分。

### 確認事項 B: `.env.amuse-app-template` のコミット状態（**確認済み・方針決定**）

`functions/.env.amuse-app-template` はリポジトリに含まれ **`.gitignore` に登録済み**（確認済み）。  
現在は `LINE_CHANNEL_ACCESS_TOKEN`・`QR_SECRET_KEY` 等の機密値が含まれているが、  
gitignore されているため git 追跡外（コミットに入らない）状態。

**To-Be 方針（確定）**: SM 移行完了後は `.env.amuse-app-template` を空ファイルに近い状態（理想はゼロ記述）にする。  
移行完了まではファイル自体は残してよいが、SM 移行済みのキーは随時削除していく。

### 確認事項 C: scheduler CRON コード固定後の値確認（**確認済み・方針決定**）

`.env.amuse-app-template` の実値をそのままコード固定のデフォルト初期値として採用することを確認済み。

| scheduler | コード固定値（.env 実値より） | JST 換算 | Firestore ゲート |
|-----------|--------------------------|---------|----------------|
| `weeklyPlanner` | `'0 11 * * 0'` | 日曜 JST 20:00 | `autoOpenClose.enabled`（実装済み） |
| `generateRecurringTournamentsByScheduler` | `'0 23 * * 0'` | 日曜 JST Mon 08:00 | `schedulerConfig.generateRecurringTournamentsEnabled`（新規追加） |
| `enqueueTournamentTasksByScheduler` | `'0 5 * * *'` | 毎日 JST 14:00 | `features.enqueueSchedulerEnabled`（実装済み） |
| `scheduledCleanup` | `'0 2 * * *'` | 毎日 JST 11:00 | `schedulerConfig.scheduledCleanupEnabled`（実装済み） |
| `scheduleGenerateNextYearBusinessHours` | `'25 23 28 1 *'` | 1/29 JST 08:25 | `schedulerConfig.scheduleGenerateNextYearBusinessHoursEnabled`（実装済み） |
| `monthlyPayrollTrigger` | 廃止・または手動化（**確認事項 D 参照**） | — | — |
| `payrollNotificationScheduler` | `'0 21 * * *'`（コード固定済み） | 毎日 JST 06:00 | `schedulerConfig.payrollNotificationEnabled`（新規追加） |

> **注**: `.env` の CRON 値はコードのデフォルト値とは別の「上書き設定」として機能していた。  
> コード固定後は Cloud Scheduler 上の設定がこの値と一致しているか、**実装開始前に GCP コンソールで最終確認すること**（Cloud Scheduler → ジョブ一覧）。

### 確認事項 D: `monthlyPayrollTrigger` の将来方針（**確認済み・方針決定**）

**現状**: 給与計算は現在手動で実施しており、`monthlyPayrollTrigger` の自動実行は使われていない。

**確定方針**: `monthlyPayrollTrigger` は以下のいずれかの対応を取る（実装フェーズで最終決定）:
- **削除**: 自動実行は不要と判断した場合、関数ごと削除
- **確認用トリガーへ変更**: 自動実行ではなく、手動確認用の HTTP Callable に変更

> ⚠️ **仕様書上の注意**: `monthlyPayrollTrigger` の再設計セクション（「毎日監視型への再設計」）は  
> **大幅変更または削除の可能性が高い**。現時点ではフェーズとして残すが、  
> 実装着手前に最終方針を確認してから進めること。

`payrollNotificationScheduler`（給与通知）は独立した用途のため、`monthlyPayrollTrigger` の廃止・変更に関わらず継続する。

### 確認事項 E: デプロイパイプライン（**確認済み・対応方針決定**）

**GitHub Actions による CI/CD デプロイを整備する方針で確定**（現時点は手動）。  
仕様詳細は下記「GitHub Actions To-Be」セクションを参照。

### 確認事項 F: Cloud Tasks キュー名・SA プレフィックスの実値（**確認済み・GCP コンソールで確認**）

`gcloud` コマンドで GCP リソースを直接確認し、`cloudTasksConfig.ts` の定数を確定済み。

| 定数名 | 確定値 | 備考 |
|--------|--------|------|
| `TOURNAMENT_TASKS_QUEUE` | `'tournament-queue'` | `asia-northeast1` に存在（確認済み） |
| `OPENCLOSE_TASKS_QUEUE` | `'business-date-assessment-queue'` | `us-central1` に存在。フェーズ 7 で移行 |
| `TOURNAMENT_INVOKER_SA_PREFIX` | `'tasks-invoker'` | 現行 SA（既存、新 SA 作成不要） |
| `OPENCLOSE_INVOKER_SA_PREFIX` | `'openclose-tasks-invoker'` | **新規作成が必要**（現在未作成） |

> **SA 分割時の追加作業（実装フェーズ）**:  
> 1. GCP で `openclose-tasks-invoker@<projectId>.iam.gserviceaccount.com` を新規作成  
> 2. Cloud Tasks の Enqueuer / Invoker 権限を付与  
> 3. `business-date-assessment-queue` に対してこの SA で OIDC トークンを発行できるよう設定  
>
> SA 分割前は `OPENCLOSE_INVOKER_SA_PREFIX = 'tasks-invoker'`（既存 SA を一時的に兼用）として実装を進めてよい。

**また以下のキューが `us-central1` に存在することも確認（payroll 関連）:**  
`finalizePayrollRun` / `processPayrollNotifications` / `processStaffPayroll` — 環境変数管理外（Firebase 関数名で直接参照）。フェーズ 7 で移行または廃止。

### 確認事項 G: Cloud Functions / Cloud Tasks のリージョン一括変更（**確認済み・方針決定**）

**`region: 'us-central1'` ハードコードの実態（Cursor が grep で確認済み）**:
- `continueBusinessTerminal.ts` を含む **18 ファイル**に `region: 'us-central1'` が直書きされている（事実）
- これらは **Cloud Functions 自体のリージョン指定**（Cloud Tasks のリージョンとは別）

**確定方針**: Cloud Tasks リージョンと Cloud Functions リージョンの **両方を `asia-northeast1` に変更**（フェーズ 7）。

> ⚠️ **フェーズ 7 は単純なコード変更ではない**。以下の作業が連動する:
> - 18 ファイルの `region: 'us-central1'` を `'asia-northeast1'` に変更
> - Cloud Functions を再デプロイ（新リージョンに新インスタンスが立つ）
> - `business-date-assessment-queue` など `us-central1` のキューを `asia-northeast1` に新規作成・旧削除
> - `CLOSE_ASSESSMENT_URL` / `OPEN_ASSESSMENT_URL`（Cloud Run, `us-central1`）を新リージョンに移行し URL 更新
> - `CONTROL_HOOK_URL`（`us-central1` Functions URL）を新リージョン URL に更新
> - フロントエンドの API エンドポイント URL の更新（Functions の URL が変わる場合）
>
> **Cloud Functions のリージョン変更は一時的な二重起動を許容するか、ダウンタイムを設けるかを事前に決める必要がある。**

---

## GitHub Actions To-Be

### 目的

- 手動での `firebase deploy --project=<projectId>` を GitHub Actions から実行可能にする
- 誤ったプロジェクトへのデプロイを防ぐ（project ID を明示的に選択する UI）
- Secret Manager の IAM 権限は Functions SA 側に付与するため、GitHub Actions 自体に SM アクセスは不要

---

### 設計方針

| 項目 | 内容 |
|------|------|
| トリガー | `workflow_dispatch`（手動実行）+ 将来的にブランチ保護と組み合わせ |
| プロジェクト選択 | `inputs.project_id` で対話的に Firebase Project ID を選択 |
| 認証方式 | **Workload Identity Federation**（推奨）または サービスアカウントキー JSON（暫定） |
| 必要な権限 | `firebase deploy` に必要な Cloud Build / Firebase 権限（`roles/firebase.admin` 相当） |
| SM アクセス | 不要（Functions の SA が実行時に SM を読む。デプロイ時は不要） |

---

### ワークフロー設計（`.github/workflows/deploy-functions.yml`）

```yaml
name: Deploy Firebase Functions

on:
  workflow_dispatch:
    inputs:
      project_id:
        description: 'デプロイ先 Firebase Project ID'
        required: true
        type: choice
        options:
          - amuse-app-template
          # 追加店舗プロジェクトはここに列挙

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # Workload Identity Federation に必要

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: functions/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: functions

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}
          # または暫定的に:
          # credentials_json: ${{ secrets[format('GCP_SA_KEY_{0}', github.event.inputs.project_id)] }}

      - name: Deploy to Firebase
        run: npx firebase-tools deploy --only functions --project=${{ github.event.inputs.project_id }} --non-interactive
        working-directory: functions
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.auth.outputs.credentials_file_path }}
```

---

### 認証方式の選択肢

#### 推奨: Workload Identity Federation（WIF）

- **メリット**: 長期間有効なサービスアカウントキー JSON が不要。GitHub Actions から短命なトークンを発行。漏洩リスクが低い。
- **デメリット**: 初期設定がやや複雑（GCP 側で WIF Provider の設定が必要）
- **設定概要**:
  1. GCP で Workload Identity Pool + Provider を作成
  2. GitHub Actions の `repo:*/ref:*` に対して SA の impersonation 権限を付与
  3. GitHub Secrets に `WIF_PROVIDER`・`WIF_SERVICE_ACCOUNT` を登録

#### 暫定: サービスアカウントキー JSON

- **メリット**: 設定が簡単
- **デメリット**: 長期間有効なキーを GitHub Secrets に保管する必要がある。漏洩リスクあり
- **注意**: 1 プロジェクトにつき 1 キー。複数プロジェクトなら複数のシークレットを登録:
  - `GCP_SA_KEY_amuse-app-template`
  - `GCP_SA_KEY_<store-b-project>` 等

---

### デプロイ SA に必要な IAM 権限

| ロール | 用途 |
|--------|------|
| `roles/firebase.admin` または `roles/cloudfunctions.admin` | Functions のデプロイ |
| `roles/iam.serviceAccountUser` | Functions が使う SA への権限借用 |
| `roles/storage.admin`（または限定スコープ） | デプロイ用 Cloud Storage への書き込み |

> **重要**: このデプロイ用 SA は Secret Manager へのアクセス権を持たない。SM アクセスは Functions が実行時に使う SA 側に付与する。

---

### Functions 実行 SA に必要な IAM 権限（SM アクセス用）

各 Firebase プロジェクトの Cloud Functions デフォルト SA（`<projectId>@appspot.gserviceaccount.com` または Compute SA）に付与:

```
roles/secretmanager.secretAccessor
```

または個別シークレットごとに:

```
secretmanager.versions.access  on  projects/<projectId>/secrets/line-config
secretmanager.versions.access  on  projects/<projectId>/secrets/task-endpoints
secretmanager.versions.access  on  projects/<projectId>/secrets/business-secrets
```

---

### 誤プロジェクトデプロイの防止策

1. `workflow_dispatch` の `inputs.project_id` を `choice` 型にすることで、存在しないプロジェクト ID を入力できない
2. ワークフロー内で `echo "Deploying to: ${{ github.event.inputs.project_id }}"` でログを出力し、実行前に確認できる
3. 将来的には `environment` 保護ルール（Required reviewers）を設定し、本番プロジェクトへのデプロイには承認を必須にする

---

## 参照ドキュメント（事実）

- `docs/config_migration/phase0B/STOREMETA_CONFIG_SPEC.md`
- `docs/config_migration/phase0A/PHASE0A_BEFORE_AFTER_DECISION.md`
- `functions/src/shared/config/defaults.ts`（デフォルト値集約）
- `functions/src/shared/config/schedulerConfigTypes.ts`（schedulerConfig 型）
