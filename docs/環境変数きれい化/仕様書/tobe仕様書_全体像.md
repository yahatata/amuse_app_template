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
| `WEEKLYPLANNER_TASKS_LOCATION` | **本番主系で利用中** | 同上 `getEnv` | 上記キューのリージョン | **コード固定**（定数 `OPENCLOSE_TASKS_REGION`） | 最終 To-Be は `asia-northeast1` 固定。現状 `us-central1` にある実リソースは移行対象として扱う | `.env` から削除；最終定数 `OPENCLOSE_TASKS_REGION = 'asia-northeast1'` へ置き換え | — | **いいえ** |
| `LINE_CHANNEL_ACCESS_TOKEN` | **本番主系で利用中** | `lineWebhook.ts`・`lineMessaging.ts`・`lineRichMenu.ts` `process.env` 直接 | LINE Messaging API 認証トークン | **Secret Manager**（`line-config` JSON に統合） | 機密性が高い；漏洩でなりすまし通知 | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `QR_SECRET_KEY` | **本番主系で利用中** | `qrCodeUtils.ts` `process.env` 直接（未設定時 undefined でエラー経路） | QR コード署名・検証用秘密鍵 | **Secret Manager**（`business-secrets` JSON に統合） | 機密性最高；漏洩で偽 QR 生成可能 | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD` | **本番主系で利用中** | `verifyUnclockedAttendanceEditPassword.ts`・`updateUnclockedAttendanceWithAuth.ts` `process.env[定数]` | 未退勤修正 Callable のパスワード照合 | **Secret Manager**（`business-secrets` JSON）| 開発している我々が管理すると確定（**確定**） | `.env` から削除；SM 参照コードへ書き換え | — | **いいえ** |
| `STAFF_RICHMENU_ID` | **本番主系で利用中**（`defineString` 経由） | `lineRichMenu.ts` `defineString` + `.value()` | スタッフ向け LINE リッチメニュー ID | **Secret Manager**（`line-config` JSON）| 店舗ごとに異なることを確定（**確定**）。SM に集約 | `defineString` 廃止；SM 参照コードへ変更 | — | **いいえ** |
| `USER_RICHMENU_ID` | **本番主系で利用中**（`defineString` 経由） | `lineRichMenu.ts` 同上 | ユーザー向け LINE リッチメニュー ID | **Secret Manager**（`line-config` JSON）| 同上（**確定**） | 同上 | — | **いいえ** |
| `WEEKLY_PLANNER_CRON` | **本番主系で利用中**（CRON 定義）| `weeklyPlanner.ts` モジュール先頭 `process.env` | 週次 Planner の起動時刻（cron 式） | **削除**（監視用 scheduler へ統合） | 個別 CRON は廃止し、`schedulerSupervisor` + `storeMeta/schedulerConfig.jobs.weeklyPlanner` で管理する | env 削除；個別 `onSchedule` 前提を廃止し task 実行関数へ移行 | — | **いいえ** |
| `RECURRING_TOURNAMENT_GENERATION_SCHEDULER_CRON` | **本番主系で利用中**（CRON 定義） | `GenerateRecurringTournamentsByScheduler.ts` モジュール先頭 `process.env` | 定期トーナメント生成スケジュール | **削除**（監視用 scheduler へ統合） | 同上。`storeMeta/schedulerConfig.jobs.generateRecurringTournamentsByScheduler` で管理する | 同上 | — | **いいえ** |
| `ENQUEUE_TOURNAMENT_TASKS_SCHEDULER_CRON` | **本番主系で利用中**（CRON 定義） | `EnqueueTournamentTasksByScheduler.ts` モジュール先頭 `process.env` | 日次 enqueue スケジュール | **削除**（監視用 scheduler へ統合） | 同上。`storeMeta/schedulerConfig.jobs.enqueueTournamentTasksByScheduler` で管理する | 同上 | — | **いいえ** |
| `MONTHLY_PAYROLL_TRIGGER_CRON` | **本番主系で利用中**（CRON 定義） | `monthlyPayrollTrigger.ts` モジュール先頭 `process.env` | 月次給与計算トリガー起動日時 | **削除**（関数削除） | `monthlyPayrollTrigger` は削除方針で確定。自動給与計算の定期実行は採用しない | CRON env 削除；関数・export・関連設定・関連テストを削除 | **下記 scheduler To-Be セクション参照** | **いいえ** |
| `SCHEDULED_CLEANUP_CRON` | **本番主系で利用中**（CRON 定義） | `scheduledCleanup.ts` モジュール先頭 `process.env` | 却下シフト自動削除スケジュール | **削除**（監視用 scheduler へ統合） | `storeMeta/schedulerConfig.jobs.scheduledCleanup` で管理する | 同上 | — | **いいえ** |
| `SCHEDULE_GENERATE_NEXT_YEAR_BUSINESS_HOURS_CRON` | **本番主系で利用中**（CRON 定義） | `scheduleGenerateNextYearBusinessHours.ts` モジュール先頭 `process.env` | 翌年営業時間自動生成スケジュール | **削除**（監視用 scheduler へ統合） | `storeMeta/schedulerConfig.jobs.scheduleGenerateNextYearBusinessHours` で管理する | 同上 | — | **いいえ** |
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
    ↓ storeMeta/schedulerConfig を確認
対象 job ごとに実行計画を作成
    ↓
Cloud Tasks に job 別 task を投入（scheduleTime 指定）
    ↓
Cloud Tasks → 実処理 Function
```

### To-Be 方針（要約）

- 監視用 scheduler（`schedulerSupervisor`）を毎日 `03:00 JST` に実行する。
- `schedulerSupervisor` は `storeMeta/schedulerConfig` を参照し、今後 7 日分の実行計画を作成する。
- task 投入は `1関数1queue` とし、queue 命名規約は `scheduled-job-{kebab-case(jobKey)}` とする。
- 実装では、許可された `jobKey` ごとの固定 map で queue 名を管理する。
- job を追加する場合は queue 名 map の更新を必須とする。
- `jobKey` は関数名と同一にし、設定・queue・task 名・ログ識別子を `jobKey` 基準で統一する。
- 再実行は許容し、deterministic task 名 + `idempotencyKey` で重複を抑止する。
- `schedulerSupervisor` が担うのは `schedulerConfig` 検証、実行計画作成、`targetScope` 生成、task 作成、dispatch ログ出力、重複 task skip までとする。
- 各業務ロジック本体、業務データ更新、実行結果に応じた業務補正は各 job の task 実行関数が担う。
- `monthlyPayrollTrigger` は削除対象のため、本 To-Be の対象外とする。

### 対象 job とデフォルト実行設定

| jobKey | デフォルト実行設定 | 備考 |
|--------|------------------|------|
| `weeklyPlanner` | `weekly / 04:40 JST / 木曜` | 木曜早朝に翌週の日曜〜土曜分の開店/閉店認定 task を前倒し計画 |
| `enqueueTournamentTasksByScheduler` | `daily / 05:00 JST` | `now-6h ～ +14日` の検索範囲は現行維持 |
| `generateRecurringTournamentsByScheduler` | `weekly / 04:50 JST / 木曜` | 現行どおり条件付き enqueue を残す |
| `scheduledCleanup` | `daily / 05:00 JST` | 直接 cleanup を実行 |
| `scheduleGenerateNextYearBusinessHours` | `yearly / 01-29 05:10 JST` | 直接生成処理を実行 |
| `payrollNotificationScheduler` | `daily / 05:00 JST` | 当日分のみ task 作成 |

### schedulerConfig Firestore スキーマ（To-Be）

定期実行設定は `storeMeta/schedulerConfig` に一本化する。

```typescript
export interface SchedulerConfig {
  schemaVersion: number;
  updatedAt: Timestamp;
  supervisorEnabled: boolean;
  planningHorizonDays: number;
  jobs: Record<string, {
    enabled: boolean;
    scheduleKind: 'daily' | 'weekly' | 'yearly';
    runAtJst: string;
    dayOfWeek?: number;
    month?: number;
    dayOfMonth?: number;
    timezone: 'Asia/Tokyo';
  }>;
}
```

デフォルトで管理対象とする `jobKey` は以下の 6 件とする。

- `weeklyPlanner`
- `enqueueTournamentTasksByScheduler`
- `generateRecurringTournamentsByScheduler`
- `scheduledCleanup`
- `scheduleGenerateNextYearBusinessHours`
- `payrollNotificationScheduler`

### `enqueueTournamentTasksByScheduler` の再計画

- `scheduledTournaments` の `taskSyncNeeded`、`schedulePlanVersion`、`schedulePlanUpdatedAt`、`regEndAt` を用いた整合管理は維持する。
- スケジュール影響更新時は、更新処理の中で直接重い再計画を行わず、独立コレクション `enqueueTournamentTasksReplanRequests` に再計画要求を集約する。
- `enqueueTournamentTasksReplanRequests` は固定 doc ID `enqueueTournamentTasksByScheduler` を使い、`requestType`、`projectId`、`requestedAt`、`requestedBy`、`reason`、`isProcessing`、`lastTriggeredAt`、`lastCompletedAt`、`targetRangeStartAt`、`targetRangeEndAt`、`aggregateVersion` を保持する。
- 再計画実行用の Cloud Tasks は `60秒` 遅延で投入する。
- 再計画時に task を再作成する範囲は日次処理と同じ `now-6h ～ +14日` とし、30日超の将来 task は作成しない。
- 30日超の将来分や今回の対象範囲外の分は、後続の日次監視で補完する。

#### Cloud Scheduler と Cloud Tasks と Firestore の責務分離（まとめ）

| 責務 | 担当 |
|------|------|
| **「いつ監視を起動するか」の定義** | Cloud Scheduler（`schedulerSupervisor` の固定 CRON） |
| **「各 job をいつ動かすか / 動かすかどうか」の判断** | Firestore（`storeMeta/schedulerConfig`） |
| **「実際のタスクをいつ実行するか」の設定** | Cloud Tasks（scheduleTime）|
| **実処理** | Cloud Functions（scheduler job は Task Queue Function。既存 downstream task は HTTP 残存可） |
| **業務設定（時刻オフセット等）** | Firestore |

**ロジックのみのデプロイ時に店舗差分設定を巻き込まないことの担保**:  
CRON をコード固定にし、業務設定を Firestore に置くことで、「コードのデプロイが店舗設定を上書きする」リスクが構造上排除される。  
`.env` の CRON 値がデプロイ時に意図せず変わる、あるいは `.env.storeA` の値を `.env.storeB` に間違って適用するリスクがなくなる。

#### idempotency / 二重投入防止

- `weeklyPlanner`: 既存実装で `task.name` を固定（`open_assessment_{dateKey}` / `close_assessment_{dateKey}`）。ALREADY_EXISTS（code 6）を catch して skip。**継続**。
- `enqueueTournamentTasksByScheduler`: `enqueueTournamentTask` 内で `${tournamentId}-${taskType}-${planHash}` の deterministic task name。**継続**。
- 監視用 scheduler から投入する job task も deterministic task name + `idempotencyKey` を前提とし、task 名は `{jobKey}_{YYYYMMDDTHHmmssZ}` 形式とする。

---

## コード固定 To-Be

### 対象と定数定義

SM に入れるほどではなく、かつプロジェクト間で共通または計算可能な値をコード固定とする。

#### `shared/config/cloudTasksConfig.ts`（新規作成）

```typescript
// Cloud Tasks / Cloud Scheduler インフラ定数
// 全 Firebase プロジェクトで共通のため、コード固定で管理する。

// ── リージョン ────────────────────────────────────────────────────────────
// 最終 To-Be ではすべて asia-northeast1 に統一する
export const TOURNAMENT_TASKS_REGION = 'asia-northeast1'; // 確定済み（現状維持）
export const OPENCLOSE_TASKS_REGION  = 'asia-northeast1';
export const SCHEDULED_JOB_TASKS_REGION = 'asia-northeast1';

// ── キュー名（GCP コンソールで確認済み） ─────────────────────────────────
export const TOURNAMENT_TASKS_QUEUE = 'tournament-queue';
export const OPENCLOSE_TASKS_QUEUE  = 'business-date-assessment-queue';
export const SCHEDULED_JOB_QUEUE_BY_KEY = {
  weeklyPlanner: 'scheduled-job-weekly-planner',
  enqueueTournamentTasksByScheduler: 'scheduled-job-enqueue-tournament-tasks-by-scheduler',
  generateRecurringTournamentsByScheduler: 'scheduled-job-generate-recurring-tournaments-by-scheduler',
  scheduledCleanup: 'scheduled-job-scheduled-cleanup',
  scheduleGenerateNextYearBusinessHours: 'scheduled-job-schedule-generate-next-year-business-hours',
  payrollNotificationScheduler: 'scheduled-job-payroll-notification-scheduler',
} as const;

// ── SA 名プレフィックス ────────────────────────────────────────────────────
export const TOURNAMENT_INVOKER_SA_PREFIX = 'tasks-invoker';          // 既存 SA（現状維持）
export const OPENCLOSE_INVOKER_SA_PREFIX  = 'openclose-tasks-invoker';

/**
 * SA メールアドレスを組み立てる
 * @param prefix  SA 名プレフィックス（例: 'tasks-invoker'）
 * @param projectId  GCP プロジェクト ID（GCLOUD_PROJECT から取得）
 */
export function buildInvokerSaEmail(prefix: string, projectId: string): string {
  return `${prefix}@${projectId}.iam.gserviceaccount.com`;
}

export function getScheduledJobQueueName(
  jobKey: keyof typeof SCHEDULED_JOB_QUEUE_BY_KEY
): string {
  return SCHEDULED_JOB_QUEUE_BY_KEY[jobKey];
}
```

> **コード固定 To-Be 補足（リージョン混在の背景）**
>
> GCP コンソール確認の結果、2 つのキューのリージョンが現在異なる（事実）:
>
> | キュー | リージョン | 状態 |
> |--------|-----------|------|
> | `tournament-queue` | `asia-northeast1`（東京） | **移行済み** |
> | `business-date-assessment-queue` | `us-central1`（米国） | フェーズ F で移行 |
> | `finalizePayrollRun` | `us-central1` | フェーズ F で移行（または廃止） |
> | `processPayrollNotifications` | `us-central1` | フェーズ F で移行（または廃止） |
> | `processStaffPayroll` | `us-central1` | フェーズ F で移行（または廃止） |
>
> また Cloud Functions のリージョン指定（`region: 'us-central1'`）が **18 ファイル** に直書きされている（事実）。  
> 最終 To-Be ではキュー移行・Cloud Functions リージョン変更・assessment Cloud Run の再デプロイを行い、すべて `asia-northeast1` に統一する。

#### 既存コードの置き換え

| 置き換え前 | 置き換え後 |
|-----------|----------|
| `getEnv('TASKS_QUEUE')` | `TOURNAMENT_TASKS_QUEUE` |
| `getEnv('WEEKLYPLANNER_TASKS_QUEUE')` | `OPENCLOSE_TASKS_QUEUE` |
| `getEnv('TASKS_LOCATION')` | `TOURNAMENT_TASKS_REGION` |
| `getEnv('WEEKLYPLANNER_TASKS_LOCATION')` | `OPENCLOSE_TASKS_REGION` |
| `getEnv('TASKS_INVOKER_SA')` in `tasks.ts` | `buildInvokerSaEmail(TOURNAMENT_INVOKER_SA_PREFIX, getRequiredProjectId())` |
| `getEnv('TASKS_INVOKER_SA')` in `weeklyPlanner.ts` / `continueBusinessTerminal.ts` | `buildInvokerSaEmail(OPENCLOSE_INVOKER_SA_PREFIX, getRequiredProjectId())` |
| scheduler job queue 名 | `getScheduledJobQueueName(jobKey)` |

> **注意**: `SCHEDULED_JOB_QUEUE_BY_KEY` は許可済み `jobKey` の固定 map で管理する。job 追加時は map 更新を必須とする。

> **関連運用資料**
>
> Firebase プロジェクト紐付けの 3 レイヤー整合と、導入時 / リリース時の確認事項は以下を参照する。
>
> - `docs/運用時資料/導入時設定/fireBase紐付け/3レイヤー整合_設計方針.md`
> - `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`

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
| 補足 | scheduler job は native Task Queue Function を起動するため、新規の scheduler job 用 URL や scheduler job 用 Invoker SA はここに追加しない |
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
| 確定情報 | `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD` は開発している我々が管理すると確定（**確定**）。`QR_SECRET_KEY` も含めて `business-secrets` に統合する。 |

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
  getLineConfig(); // lineWebhook / lineMessaging / lineRichMenu 系
}
```

#### 呼び出し側パターンの使い分け

| パス種別 | 対応方針 | コード例 |
|---------|---------|---------|
| **高頻度（webhook / onCall）** | 初期仕様では `line-config` のみを `warmupSecrets()` で先行取得。その他は遅延取得 | `warmupSecrets()` を必要なファイル先頭に追加 |
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

### フェーズ再設計の考え方

詳細仕様が出そろったため、以後は「仕様カテゴリ」ではなく「安全に実装できる依存順」で進める。  
特に以下を重視する。

- 外部依存の少ない基盤変更から先に行う
- 大きい変更は `changeSpec` を分けて局所化する
- コード変更と GCP / GitHub の人手作業を分けて管理する
- 各フェーズで `Entry条件` / `Exit条件` / `ロールバック条件` / `ユーザー依頼事項` を持つ

### フェーズ A: 基盤の安全化

対象仕様:

- `実行環境注入のまま使うもの_ToBe_詳細仕様.md`
- `コード固定_ToBe_詳細仕様.md` の基礎部分

主な作業:

```
[ ] `getRequiredProjectId()` を導入し、危険な固定フォールバックを除去
[ ] 未使用 env / 幽霊キー / 即時削除可能なキーを削除
[ ] `shared/config/cloudTasksConfig.ts` の基礎定数を導入
[ ] `buildInvokerSaEmail()` / `getScheduledJobQueueName()` など共通ヘルパーを導入
[ ] `.env` 依存からコード固定・コード計算への置換を開始
```

主目的:

- 後続フェーズの前提となる `projectId` 取得と定数体系を先に安定させる

### フェーズ B: scheduler 基盤

対象仕様:

- `scheduler_ToBe_詳細仕様.md` の基盤部分

主な作業:

```
[ ] `schedulerSupervisor` を追加
[ ] `storeMeta/schedulerConfig` の最終スキーマを導入
[ ] `jobKey` / payload / `targetScope` / `idempotencyKey` / queue 命名を共通化
[ ] dispatch / execution ログ基盤を追加
[ ] tournament 再計画 request 基盤を追加
```

主目的:

- 各 job を移行する前に、scheduler の土台を先に固める

### フェーズ C: scheduler 各 job 移行

対象仕様:

- `scheduler_ToBe_詳細仕様.md` の job 別詳細

主な作業:

```
[ ] `weeklyPlanner` を task 実行関数へ寄せる
[ ] `generateRecurringTournamentsByScheduler` を移行
[ ] `enqueueTournamentTasksByScheduler` を移行
[ ] `scheduledCleanup` を移行
[ ] `scheduleGenerateNextYearBusinessHours` を移行
[ ] `payrollNotificationScheduler` を移行
```

主目的:

- scheduler 基盤の上に各 job を段階的に載せる

### フェーズ D: Secret Manager 移行

対象仕様:

- `Secret_Manager_ToBe_詳細仕様.md`

主な作業:

```
[ ] `@google-cloud/secret-manager` を導入
[ ] `shared/secrets/secretManager.ts` と隣接型定義を実装
[ ] `line-config` / `task-endpoints` / `business-secrets` を各プロジェクトに作成
[ ] 既存 `.env` / `defineString` 参照を Secret Manager 参照へ移行
[ ] Functions 実行 SA に SM 権限を付与
```

主目的:

- 機密値と URL を Secret Manager に集約し、設定の散在を止める

### フェーズ E: 削除と整理

対象仕様:

- `monthlyPayrollTrigger` 削除方針
- 削除系の整理事項

主な作業:

```
[ ] `monthlyPayrollTrigger` 本体・export・関連設定・関連テストを削除
[ ] 旧 env / 旧参照 / 旧コメントを削除
[ ] 不要になった `defineString` / fallback / 死蔵コードを除去
```

補足:

- `unused_function_lib` は現時点では将来予定のため、本アクティブフェーズから除外する

### フェーズ F: 初回リリース前整備

対象仕様:

- `GitHub_Actions_ToBe_詳細仕様.md`
- `リージョン移行_ToBe_詳細仕様.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/*`

主な作業:

```
[ ] GitHub Actions workflow を作成し、WIF を設定
[ ] `project_id` choice を導入し、誤プロジェクトデプロイ防止を有効化
[ ] `asia-northeast1` へのリージョン一括切替を実施
[ ] `task-endpoints` の URL を新リージョン実体へ更新
[ ] 導入時設定資料に従って GitHub / GCP / Firebase 側の手作業を完了
```

主目的:

- 未リリースである利点を活かし、初回リリース前に CI/CD とリージョン正を一気に揃える

### フェーズ G: 最終確認

対象仕様:

- すべての詳細仕様書
- 運用資料

主な作業:

```
[ ] 仕様書と実装の差分確認
[ ] E2E 的な疎通確認
[ ] `.env.amuse-app-template` の最終形確認
[ ] ドキュメント・運用資料・changeSpec の同期更新
[ ] 次フェーズ / 次タスクへの伝達事項を整理
```

主目的:

- 実装漏れとドキュメント齟齬を残さず、初回リリース準備を完了させる

### 補足: 将来対応

```
[ ] `unused_function_lib` の削除は将来対応とする
[ ] 実施時は別 changeSpec を作成し、現行フェーズとは切り離す
```

---

## 判断保留事項

### 解消済み（ユーザー確認済み）

| # | 項目 | 結論 |
|---|------|------|
| 1 | `TASKS_LOCATION` / `WEEKLYPLANNER_TASKS_LOCATION` の単位 | **全店舗同一リージョン確定 → コード固定**（SM から除外） |
| 2 | `TASKS_INVOKER_SA` を用途別に分けるか | **分割確定**（`tournamentInvokerSa` / `weeklyPlannerInvokerSa`）。他 SA も既に用途別分離済み |
| 3 | `STAFF_RICHMENU_ID` / `USER_RICHMENU_ID` の単位 | **店舗ごとに異なる確定 → SM `line-config` JSON** |
| 4 | `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD` の管理者 | **開発している我々が管理すると確定 → SM `business-secrets` JSON** |
| 5 | `unused_function_lib` を今削除するか | **現時点は削除しない。将来削除予定。** |
| 6 | デプロイ方法 | **GitHub Actions（CI/CD）を整備予定。現時点は手動。** |
| 7 | `generateRecurringTournamentsByScheduler` の ON/OFF ゲート | **全 scheduler の ON/OFF を Firestore 管理に統一**。`schedulerConfig` に 2 フィールド追加 |
| 8 | リージョン移行のタイミング | **フェーズ F（初回リリース前整備）として計画に組み込み確定**。全リソースを `asia-northeast1`（東京）へ移行 |

### 未解消（確認中）

現時点で未解消の項目はありません。

### 追加解消（ユーザー確認済み）

| # | 項目 | 結論 |
|---|------|------|
| 2 | `TASKS_INVOKER_SA` を用途別に分けるか | **分割確定**（`tournamentInvokerSa` / `weeklyPlannerInvokerSa`）。他 SA も既に用途別分離済みであることを確認 |
| 7 | `generateRecurringTournamentsByScheduler` の ON/OFF ゲート | **全 scheduler の ON/OFF を Firestore 管理に統一**。`schedulerConfig` に 2 フィールド追加 |
| 8 | リージョン移行のタイミング | **フェーズ F（初回リリース前整備）として計画に組み込み確定**。全リソースを `asia-northeast1`（東京）へ移行 |

---

## Cursor から見て追加でユーザー確認が必要な点

### 確認事項 A: `warmupSecrets()` の呼び出し方針（確認済み・設計方針決定済み）

SM SDK 直叩き + コールドスタートレイテンシへの懸念は、**Promise レベルキャッシュ + 必要箇所のみ `warmupSecrets()` を使う**方式の採用によって解消する（上記「コード側でのシークレット読み取り方式」参照）。

`defineSecret`（parameterized configuration）や CI/CD での Secret 展開への代替案は不要。

> **補足**: 初期仕様では `warmupSecrets()` は `line-config` のみを対象とする。`task-endpoints` / `business-secrets` は遅延取得を基本とし、実測上必要な場合のみ個別 warmup を追加する。  
> また、高頻度 handler のファイル先頭に `warmupSecrets()` を追加する方式を採用する。

### 確認事項 B: `.env.amuse-app-template` のコミット状態（**確認済み・方針決定**）

`functions/.env.amuse-app-template` はリポジトリに含まれ **`.gitignore` に登録済み**（確認済み）。  
現在は `LINE_CHANNEL_ACCESS_TOKEN`・`QR_SECRET_KEY` 等の機密値が含まれているが、  
gitignore されているため git 追跡外（コミットに入らない）状態。

**To-Be 方針（確定）**: SM 移行完了後は `.env.amuse-app-template` を空ファイルに近い状態（理想はゼロ記述）にする。  
移行完了まではファイル自体は残してよいが、SM 移行済みのキーは随時削除していく。

### 確認事項 C: scheduler CRON コード固定後の値確認（**確認済み・方針決定**）

監視用 scheduler は `03:00 JST` 固定とし、各 job の実行時刻は `storeMeta/schedulerConfig` のデフォルト初期値として管理することを確認済み。

| jobKey | デフォルト値 | 備考 |
|-----------|--------------------------|---------|
| `weeklyPlanner` | `weekly / 04:40 JST / 木曜` | 翌週の日曜〜土曜分を前倒し計画 |
| `generateRecurringTournamentsByScheduler` | `weekly / 04:50 JST / 木曜` | 木曜早朝に recurring 生成 |
| `enqueueTournamentTasksByScheduler` | `daily / 05:00 JST` | `now-6h ～ +14日` は現行維持 |
| `scheduledCleanup` | `daily / 05:00 JST` | 毎朝 cleanup |
| `scheduleGenerateNextYearBusinessHours` | `yearly / 01-29 05:10 JST` | 翌年営業時間生成 |
| `monthlyPayrollTrigger` | 削除 | scheduler 対象外 |
| `payrollNotificationScheduler` | `daily / 05:00 JST` | 当日分のみ task 作成 |

> **注**: 旧 `.env` の CRON 値はそのまま踏襲しない。  
> `schedulerSupervisor` の Cloud Scheduler 設定と `schedulerConfig` の初期投入値を、実装開始前に最終確認すること。

### 確認事項 D: `monthlyPayrollTrigger` の将来方針（**確認済み・方針決定**）

**現状**: 給与計算は現在手動で実施しており、`monthlyPayrollTrigger` の自動実行は使われていない。

**確定方針**: `monthlyPayrollTrigger` は削除する。  
関数本体、export、関連設定、関連テストを除去し、自動給与計算の定期実行は採用しない。

`payrollNotificationScheduler`（給与通知）は独立した用途のため、`monthlyPayrollTrigger` の廃止・変更に関わらず継続する。

### 確認事項 E: デプロイパイプライン（**確認済み・対応方針決定**）

**GitHub Actions による CI/CD デプロイを整備する方針で確定**（現時点は手動）。  
仕様詳細は `docs/環境変数きれい化/仕様書/GitHub_Actions_ToBe_詳細仕様.md` を参照。

### 確認事項 F: Cloud Tasks キュー名・SA プレフィックスの実値（**確認済み・GCP コンソールで確認**）

`gcloud` コマンドで GCP リソースを直接確認し、`cloudTasksConfig.ts` の定数を確定済み。

| 定数名 | 確定値 | 備考 |
|--------|--------|------|
| `TOURNAMENT_TASKS_QUEUE` | `'tournament-queue'` | `asia-northeast1` に存在（確認済み） |
| `OPENCLOSE_TASKS_QUEUE` | `'business-date-assessment-queue'` | `us-central1` に存在。フェーズ F で移行 |
| `TOURNAMENT_INVOKER_SA_PREFIX` | `'tasks-invoker'` | 現行 SA（既存、新 SA 作成不要） |
| `OPENCLOSE_INVOKER_SA_PREFIX` | `'openclose-tasks-invoker'` | **新規作成が必要**（現在未作成） |

> **SA 分割時の追加作業（実装フェーズ）**:  
> 1. GCP で `openclose-tasks-invoker@<projectId>.iam.gserviceaccount.com` を新規作成  
> 2. Cloud Tasks の Enqueuer / Invoker 権限を付与  
> 3. `business-date-assessment-queue` に対してこの SA で OIDC トークンを発行できるよう設定  
>
> SA 分割前は `OPENCLOSE_INVOKER_SA_PREFIX = 'tasks-invoker'`（既存 SA を一時的に兼用）として実装を進めてよい。

**また以下のキューが `us-central1` に存在することも確認（payroll 関連）:**  
`finalizePayrollRun` / `processPayrollNotifications` / `processStaffPayroll` — 環境変数管理外（Firebase 関数名で直接参照）。フェーズ F で移行または廃止。

### 確認事項 G: Cloud Functions / Cloud Tasks のリージョン一括変更（**確認済み・方針決定**）

**`region: 'us-central1'` ハードコードの実態（Cursor が grep で確認済み）**:
- `continueBusinessTerminal.ts` を含む **18 ファイル**に `region: 'us-central1'` が直書きされている（事実）
- これらは **Cloud Functions 自体のリージョン指定**（Cloud Tasks のリージョンとは別）

**確定方針**: Cloud Tasks リージョンと Cloud Functions リージョンの **両方を `asia-northeast1` に変更**（フェーズ F）。

> ⚠️ **フェーズ F は単純なコード変更ではない**。以下の作業が連動する:
> - 18 ファイルの `region: 'us-central1'` を `'asia-northeast1'` に変更
> - Cloud Functions を `asia-northeast1` で再デプロイ
> - `business-date-assessment-queue` など `us-central1` のキューを `asia-northeast1` に作成し、動作確認後に旧資産を削除
> - `CLOSE_ASSESSMENT_URL` / `OPEN_ASSESSMENT_URL`（Cloud Run, `us-central1`）を新リージョンに移行し URL 更新
> - `CONTROL_HOOK_URL`（`us-central1` Functions URL）を新リージョン URL に更新
> - フロントエンドの API エンドポイント URL の更新（Functions の URL が変わる場合）
>
> **このアプリは未リリースのため、一時的な二重起動は採用しない。**  
> 一括切替で `asia-northeast1` へ揃える。

---

## GitHub Actions To-Be

### 目的

- 手動での `firebase deploy --project=<projectId>` を GitHub Actions から実行可能にする
- 誤ったプロジェクトへのデプロイを防ぐ（project ID を明示的に選択する UI）
- Secret Manager の IAM 権限は Functions SA 側に付与するため、GitHub Actions 自体に SM アクセスは不要

詳細は `docs/環境変数きれい化/仕様書/GitHub_Actions_ToBe_詳細仕様.md` を参照。

---

### 設計方針

| 項目 | 内容 |
|------|------|
| トリガー | `workflow_dispatch`（手動実行）+ 将来的にブランチ保護と組み合わせ |
| プロジェクト選択 | `inputs.project_id` で対話的に Firebase Project ID を選択 |
| 認証方式 | **Workload Identity Federation**（正式採用） |
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

      - name: Deploy to Firebase
        run: npx firebase-tools deploy --only functions --project=${{ github.event.inputs.project_id }} --non-interactive
        working-directory: functions
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.auth.outputs.credentials_file_path }}
```

---

### 認証方式

#### 採用: Workload Identity Federation（WIF）

- **メリット**: 長期間有効なサービスアカウントキー JSON が不要。GitHub Actions から短命なトークンを発行。漏洩リスクが低い。
- **デメリット**: 初期設定がやや複雑（GCP 側で WIF Provider の設定が必要）
- **設定概要**:
  1. GCP で Workload Identity Pool + Provider を作成
  2. GitHub Actions の `repo:*/ref:*` に対して SA の impersonation 権限を付与
  3. GitHub Secrets に `WIF_PROVIDER`・`WIF_SERVICE_ACCOUNT` を登録

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
4. 開発時 / 導入時 / 運用時の操作手順と、人手で必要な GitHub / GCP 操作は `docs/環境変数きれい化/仕様書/GitHub_Actions_ToBe_詳細仕様.md` に従う

---

## 参照ドキュメント（事実）

- `docs/config_migration/phase0B/STOREMETA_CONFIG_SPEC.md`
- `docs/config_migration/phase0A/PHASE0A_BEFORE_AFTER_DECISION.md`
- `functions/src/shared/config/defaults.ts`（デフォルト値集約）
- `functions/src/shared/config/schedulerConfigTypes.ts`（schedulerConfig 型）
