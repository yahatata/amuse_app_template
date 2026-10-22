# Phase2 要件一覧（Task 1 成果物）

作成日: 2026-03-06  
参照元: `docs/config_migration` 内の phase2 以外の全ファイルを網羅的に確認し抽出

---

## 本ドキュメントの目的

Phase0A/0B/1 および config_migration ルートのドキュメント群から、Phase2 で行うべきことを **MECE に** 抽出・分類する。Task 2 でこの一覧を plan / ALL_ID_STATUS / README と照合し、漏れを確認する。

---

## A. storeMeta/config への参照差し替え（ID 単位）

Phase0B の Before/After 決定（PHASE0B_BEFORE_AFTER_DECISION.md）と廃止計画（PHASE0B_DEPRECATION_PLAN.md）に基づき、Phase2 で以下の ID の参照を storeMeta/config に差し替え、旧参照を削除する。

### A-1. 機能フラグ（Functions のみ）

| ID | 設定 | Before | After（storeMeta/config のキー） |
|----|------|--------|----------------------------------|
| D-05 | ENABLE_SETTLEMENT_AGGREGATOR | defineString / process.env | features.settlementAggregatorEnabled |
| D-07 | WRITE_TODAYS_BILLS_IN_PARALLEL | process.env | features.dualWriteEnabled |
| D-08 | ENQUEUE_SCHEDULER_ENABLED | process.env | features.enqueueSchedulerEnabled |
| D-09 | TEMPLATE_BUSINESSDATE_CHECK | process.env | features.templateBusinessDateCheck |
| B-06 | TABLE_DEVICE_REGISTRATION_ENABLED | dart-define（docs のみ） | features.tableDeviceRegistrationEnabled（スキーマ定義済み、実コード参照なし）|

出典: PHASE0B_BEFORE_AFTER_DECISION §共通方針、STOREMETA_CONFIG_SPEC §4、plan Batch B

### A-2. Functions コア参照差し替え

| ID | 設定 | Before | After（storeMeta/config のキー） | 特記事項 |
|----|------|--------|----------------------------------|----------|
| CALC_BUFFER | calcBusinessDateBufferMinutes | TS 内 `return 70` ハードコード | businessDay.calcBufferMinutes | 関数が async 化される |
| D-10 | ENABLE_AUTO_OPEN_CLOSE / TASK_CLOSE_OFFSET / TASK_OPEN_OFFSET | process.env（weeklyPlanner.ts） | autoOpenClose.enabled / taskCloseOffsetMinutes / taskOpenOffsetMinutes | 3 env を 1 config に統合 |
| R-10 | BUSINESS_HOURS_STYLES | TS styles.ts 内定数 + Dart globalConstant | businessHoursStyles | getBusinessHoursByStyleId async 化、「Flutter と同期必須」コメント撤去 |
| D-04 | LINE_PLAN | defineString（lineWebhook, confirmShiftRequest）| linePlan | defineString 2 箇所削除 |
| R-09 | requiredStaffByTimeSlot | TS 各 callable 内ローカル定義（6 箇所）+ Dart | shift.requiredStaffByTimeSlot | ハードコード配列を共通化 |
| R-11/R-12 | 会計ポリシー（SIDE_GAME_CHIP_EXCHANGE_RATE, CATEGORY_PAYMENT_METHODS, POINT_PRIORITY, roundingUnits）| TS 各所ハードコード + Dart globalConstant | billing.sideGameChipRate / billing.paymentPolicy.* | pure function 維持（config を引数渡し or defaults.ts import）|

**重要な関数シグネチャ変更**:
- `calcBusinessDate()`: 同期 → async。戻り値が `string` → `Promise<BusinessDateResult>`
- `shouldDualWrite()`: 同期 `boolean` → async `Promise<boolean>`
- `getBusinessHoursByStyleId()` 等: config 取得が async 化されるため、呼び出し元も await 対応が必要

出典: PHASE0B_BEFORE_AFTER_DECISION §2〜7、PHASE0B_REFERENCE_MAP §2〜6、PHASE0B_DEPRECATION_PLAN §2、plan Batch A1

### A-3. Flutter 参照差し替え（GlobalConstants → StoreConfigService）

| ID | 設定（Flutter 側） | Before | After |
|----|---------------------|--------|-------|
| R-06 | entranceFee / entranceFeeDescription / chargeEntranceFeeOnReentry | GlobalConstants | StoreConfigService.instance.latestData |
| R-07 | PAYROLL_START_DAY / PAYROLL_END_DAY | GlobalConstants | StoreConfigService |
| R-08 | SHIFT_SUBMISSION_START_DAY / SHIFT_SUBMISSION_END_DAY / SHIFT_SCHEDULING_START_DAY | GlobalConstants | StoreConfigService |
| R-09 | requiredStaffByTimeSlot | GlobalConstants | StoreConfigService |
| R-10 | businessHoursStyles / businessHoursStyle* | GlobalConstants | StoreConfigService |
| R-11/R-12 | SIDE_GAME_CHIP_EXCHANGE_RATE / categoryPaymentMethods / POINT_PRIORITY / 丸め単位 | GlobalConstants | StoreConfigService |
| D-04 | linePlan / isShiftRequestEnabled / linePlanName | GlobalConstants | StoreConfigService |

出典: PHASE0B_REFERENCE_MAP §2〜6（Dart 列）、plan Batch A2

### A-4. Web（public/staff）参照差し替え

| 対象 | Before | After |
|------|--------|-------|
| public/staff/config.js の linePlan / isShiftRequestEnabled | ハードコード | Firestore `storeMeta/config` を JS SDK で読み取り |

出典: PHASE0B_REFERENCE_MAP §6、plan Batch A3

### A-5. globalConstant.dart クリーンアップ

| 作業 | 内容 |
|------|------|
| 移行済み定数の削除 | A-3 で StoreConfigService に移行した全定数を globalConstant.dart から削除 |
| 残す定数 | STORE_CLOSE_HOUR（Phase4）、schemaVersion、menuCategories、sideGameTypes、トーナメント設定、CRON 設定、ADMIN_CREATED_SHIFT_ID 等 |

出典: plan Batch A3

---

## B. スコープ外 ID の状態記録

Phase2 では参照差し替えは不要だが、全 ID の状態を確定させる必要がある（migration_roadmap §2 Phase2 完了条件「全 ID に状態が付与される」）。

### B-1. Deploy 維持（現 SSoT = To-Be SSoT）

| ID | 設定 | 記録すべき状態 |
|----|------|----------------|
| D-02 | LINE_CHANNEL_ACCESS_TOKEN 等 | 完了（Deploy 維持） |
| D-03 | RICHMENU_ID 各種 | 完了（Deploy 維持） |
| D-11 | Cloud Tasks queue / location | 完了（Deploy 維持） |
| D-14 | region | 完了（Deploy 維持） |
| D-15 | CRON 設定 | 完了（Deploy 維持） |

### B-2. Build 維持（現 SSoT = To-Be SSoT）

| ID | 設定 | 記録すべき状態 |
|----|------|----------------|
| B-01〜B-05 | schemaVersion, menuCategories, sideGameTypes 等 | 完了（Build 維持、運用ルール化は Phase3） |
| B-07 | ADMIN_CREATED_SHIFT_ID | 完了（Build 維持） |

### B-3. 既存 Run 項目（既に正しい SSoT）

| ID | 記録すべき状態 |
|----|----------------|
| R-01〜R-05 | 完了（既に正しい SSoT） |

### B-4. Phase0A 完了済み

| ID | 設定 | 記録すべき状態 |
|----|------|----------------|
| D-01 | （Phase0A 完了） | 完了（Secret Manager） |
| D-12 | （Phase0A 完了） | 完了（Secret Manager） |
| D-13 | （Phase0A 完了） | 完了（Secret Manager） |

### B-5. Phase4 送り

| ID | 設定 | 記録すべき状態 |
|----|------|----------------|
| D-06 | STORE_CLOSE_HOUR | Phase4 で廃止。Phase2 では触らない |

出典: plan §2 スコープ外、migration_roadmap §2 Phase2 完了条件

---

## C. ID ごとの必須作業（各 ID 共通の標準手順）

Phase2 README の「進め方（ID 単位の標準手順）」および PHASE1_ROLLBACK の「Phase2 での必須作業」に基づき、各 ID について以下を実施する必要がある。

| ステップ | 内容 | 出典 |
|----------|------|------|
| 1 | 対象 ID を宣言する | Phase2 README §進め方 |
| 2 | Before（現保存先/参照先）を確定 | Phase2 README §進め方 |
| 3 | After（To-Be 保存先/参照先）を確定 | Phase2 README §進め方 |
| 4 | **取得失敗時の挙動を設計する**（設定ごとに検討。defaults fallback / 処理失敗 等） | Phase2 README §進め方、PHASE1_ROLLBACK §2.2 |
| 5 | **問題発生時の切り戻し手順を ID ごとに記録する** | Phase2 README §進め方、PHASE1_ROLLBACK §2.2 |
| 6 | 実装する（差し替え完了後は旧参照を即削除。旧 env/定数への fallback は持たない） | Phase2 README §進め方、D-0015 |
| 7 | 検証する | Phase2 README §進め方 |
| 8 | CHANGE_LOG / DECISION_LOG を更新 | Phase2 README §進め方 |
| 9 | ID 状態を「完了」に更新 | Phase2 README §進め方 |

---

## D. 横断的な要件（全 ID に共通で適用されるルール・ゲート・検証観点）

### D-1. ゲート条件・ルール

| ゲート/ルール | 内容 | 出典 |
|---------------|------|------|
| Gate-1 | Secrets 是正完了（Phase0A 完了前提） | changeSpec_overview §5 |
| Gate-2 | 対象 ID の重複 SSoT 解消（Phase0B 完了前提） | changeSpec_overview §5 |
| Gate-3 | storeMeta/config 読み取り/更新基盤が利用可能（Phase1 完了前提） | changeSpec_overview §5 |
| Gate-4 | 回帰観点を満たした ID のみ完了へ遷移（tsc --noEmit, flutter analyze）| changeSpec_overview §5 |
| Duplicate-first ルール | 同義設定が複数層にある場合、先に重複を整理してから移行する | CHANGE_RULES §3 |
| Runtime-gate ルール | Run-time 化の変更は「対象IDの重複参照解消証跡」を必須とする | CHANGE_RULES §3 |
| Inventory-coverage ルール | classification 全IDを管理対象にし、進捗状態を必ず付与する | CHANGE_RULES §3 |

### D-2. SSoT 原則

| 原則 | 内容 | 出典 |
|------|------|------|
| Functions 最終決定 | 会計・営業日・締め処理の最終決定者は Functions | D-0003、tobe_config_architecture §4 |
| Flutter は表示/入力補助 | 確定ロジックを持たない | tobe_config_architecture §4、PHASE1_UPDATE_PATH_DESIGN §9 |
| 二重 SSoT 禁止 | 同義設定の二重 SSoT を追加しない | CHANGE_RULES §4 |

### D-3. 読み取り優先度の整理

| 要件 | 内容 | 出典 |
|------|------|------|
| ③ の削除 | Phase2 で「各 TS ファイル内の直書き」を削除し、①→② のみにする | tobe_config_architecture §8（※ ③ は Phase2 で削除済みと記載）|
| defaults.ts 唯一ソース | デフォルト値の定義は defaults.ts のみ。重複定義禁止 | D-0015、PHASE0B_DECISIONS_FOR_LATER_PHASES §6 |

### D-4. フォールバック / ロールバック方針

| 要件 | 内容 | 出典 |
|------|------|------|
| 旧参照の即削除 | 差し替え完了後は旧 env/定数への fallback を維持しない。即削除 | D-0015、PHASE1_ROLLBACK §1 |
| 未存在時のフォールバック | storeMeta/config に値がなければ defaults.ts にフォールバック + warn ログ | PHASE1_FALLBACK_BEHAVIOR §3 |
| 読み取り失敗時 | Functions: リトライ後も defaults を返す（D-0020）。Flutter: 最後の成功値を維持 | PHASE1_FALLBACK_BEHAVIOR §3、DECISION_LOG D-0020 |
| 切り戻し | 設定（ID）ごとに検討。コードデプロイで差し替え前状態へ戻す | PHASE1_ROLLBACK §2 |

### D-5. ログ仕様の遵守

| 要件 | 内容 | 出典 |
|------|------|------|
| フォールバック時ログ | storeMeta/config 未存在で defaults にフォールバックした場合、`config_fallback` イベントを warn レベルで出力 | PHASE1_FALLBACK_BEHAVIOR §5 |
| 読み取り失敗時ログ | storeMeta/config 読み取りエラー時、`config_read_error`（error）+ `config_fallback`（warn）を出力し、defaults を返す | PHASE1_FALLBACK_BEHAVIOR §5、D-0020 |
| 構造化ログ | 将来の Log Sink / BigQuery 集約を見据え、構造化ログ形式で出力 | PHASE1_FALLBACK_BEHAVIOR §5 |

### D-6. 検証観点

| 観点 | 内容 | 出典 |
|------|------|------|
| 営業日境界 | closeHour 変更時の一致 | migration_roadmap §6 |
| 会計一致 | verifyPaymentSplit 不一致率 | migration_roadmap §6 |
| 自動開閉店 | offset 変更時の反映 | migration_roadmap §6 |
| 段階フラグ即時反映 | on/off の即時性 | migration_roadmap §6 |
| 権限/キャッシュ整合 | devices.role 更新後 | migration_roadmap §6 |
| 全 ID 状態遷移 | 未着手 → 移行中 → 完了 | migration_roadmap §6 |

### D-7. ドキュメント更新

| 対象 | 内容 | 出典 |
|------|------|------|
| CHANGE_LOG | Phase2 のバッチ単位 or ID 単位でエントリ追加 | Phase2 README §進め方 |
| DECISION_LOG | 計画外の追加仕様・方針変更時に記録 | Phase2 README §進め方 |
| ALL_ID_STATUS | 全 ID の状態を確定 | migration_roadmap §2 Phase2 完了条件 |
| tobe_config_architecture | 読み取り優先度を ①→② のみに更新 | tobe_config_architecture §8 |

---

## E. Phase0B から Phase2 へ移管されたタスク

Phase0B のタスク 5（実装）とタスク 6（テスト・検証）は、当初 Phase0B スコープだったが Phase2 に移管された（CM-Phase0B-002）。

| 移管元タスク | 内容 | 出典 |
|-------------|------|------|
| Phase0B タスク 5 | storeMeta/config 参照差し替えの**実装** | PHASE0B_COMPLETED_AND_DECISIONS §1、CHANGE_LOG CM-Phase0B-002 |
| Phase0B タスク 6 | 差し替え後の**テスト・検証** | 同上 |

---

## F. 当初予定されていたが廃止・変更となった項目

以下の項目は、当初 Phase2 で実施される可能性があったが、フェーズを進めるうちに廃止・変更された。

| 項目 | 当初の予定 | 変更後 | 理由・出典 |
|------|------------|--------|------------|
| D-06 (STORE_CLOSE_HOUR) の storeMeta/config 移行 | Phase2 で storeMeta/config に入れる可能性もあった | Phase2 スコープ外。Phase4 で完全廃止 | D-0013、PHASE0B_BEFORE_AFTER_DECISION §1 |
| identity (storeId / tenantId) の storeMeta/config 移行 | 当初、共通 config に含める案があった | 不要と決定。Firebase プロジェクト単位で識別されるため | STOREMETA_CONFIG_SPEC §5、tobe_config_architecture §6 |
| 旧 env/定数への fallback の維持 | 移行期間中は旧参照を残す方式もあり得た | fallback 維持しない（未リリースアプリのため即削除） | D-0015、PHASE1_ROLLBACK §1 |
| Phase0A Task8（Runbook）を Phase2 で実施 | Phase0A の一部として手順書を作成する案 | Phase3 へ移管 | D-0012 |
| R-09 を別ドキュメントに分離 | 曜日ごとの設定差分がある場合に storeMeta/config から分離する案 | Phase1 スキーマで flat array として含めた。曜日ごと分離は必要時に Phase3+ で検討 | STOREMETA_CONFIG_SPEC §1、PHASE1_CONFIG_SCHEMA §3.7 |
| UI からの config 更新（店舗ユーザー向け） | Phase2 で UI 更新も含む案 | Phase5 で検討 | PHASE1_UPDATE_PATH_DESIGN §4 |

---

## G. Phase2 完了条件（ドキュメント横断で抽出）

Phase2 の完了を判定するために、複数のドキュメントから抽出した条件を以下にまとめる。

| 条件 | 出典 |
|------|------|
| 全 ID に状態（未着手/移行中/完了）がある | migration_roadmap §2 |
| 完了 ID は To-Be 配置に揃っている | migration_roadmap §2、Phase2 README §Done 条件 |
| SSoT が単一で説明可能 | Phase2 README §Done 条件 |
| 移行対象 ID の実参照元が To-Be 側へ寄っている | migration_roadmap §2 |
| Functions 最終決定の前提が保持されている | migration_roadmap §2 |
| Gate-4 を通過している（tsc --noEmit パス、flutter analyze エラー 0） | changeSpec_overview §5 |
| CHANGE_LOG にエントリが追加されている | Phase2 README §進め方 |
| 取得失敗時の挙動が設定ごとに設計されている | PHASE1_ROLLBACK §2.2 |
| 問題発生時の切り戻し手順が ID ごとに記録されている | PHASE1_ROLLBACK §2.2 |

---

## H. MECE 確認（抽出漏れ防止）

### H-1. 分類軸の網羅性

| 軸 | 対応セクション | 網羅しているか |
|----|----------------|----------------|
| 何を変えるか（ID 単位の差し替え対象） | A（A-1〜A-5） | ✅ PHASE0B_TARGET_LIST、PHASE0B_REFERENCE_MAP、PHASE1_CONFIG_SCHEMA の全 ID を網羅 |
| 何を変えないが状態を記録するか | B（B-1〜B-5） | ✅ classification 全 ID のうち A に含まれないものを網羅 |
| どうやるか（ID ごとの標準手順） | C | ✅ Phase2 README §進め方、PHASE1_ROLLBACK §2.2 を統合 |
| 守るべきルール（ゲート・SSoT・ログ等） | D（D-1〜D-7） | ✅ CHANGE_RULES、changeSpec_overview、tobe_config_architecture、PHASE1_FALLBACK_BEHAVIOR、PHASE1_ROLLBACK を統合 |
| どこから来た作業か（移管） | E | ✅ Phase0B タスク 5/6 の移管を記録 |
| 何をやらないか（廃止・変更） | F | ✅ 当初予定から外れた項目を明記 |
| 何が完了条件か | G | ✅ migration_roadmap、Phase2 README、changeSpec_overview、PHASE1_ROLLBACK から抽出 |

### H-2. ID の網羅性チェック

| 分類 | ID | 本ドキュメントでの記載場所 |
|------|----|---------------------------|
| Run | R-01〜R-05 | B-3 |
| Run | R-06 | A-2（スキーマ）, A-3（Flutter） |
| Run | R-07 | A-3（Flutter） |
| Run | R-08 | A-3（Flutter） |
| Run | R-09 | A-2（Functions）, A-3（Flutter） |
| Run | R-10 | A-2（Functions）, A-3（Flutter） |
| Run | R-11 | A-2（Functions）, A-3（Flutter） |
| Run | R-12 | A-2（Functions）, A-3（Flutter） |
| Deploy | D-01 | B-4 |
| Deploy | D-02 | B-1 |
| Deploy | D-03 | B-1 |
| Deploy | D-04 | A-2（Functions）, A-3（Flutter）, A-4（Web） |
| Deploy | D-05 | A-1 |
| Deploy | D-06 | B-5, F |
| Deploy | D-07 | A-1 |
| Deploy | D-08 | A-1 |
| Deploy | D-09 | A-1 |
| Deploy | D-10 | A-2 |
| Deploy | D-11 | B-1 |
| Deploy | D-12 | B-4 |
| Deploy | D-13 | B-4 |
| Deploy | D-14 | B-1 |
| Deploy | D-15 | B-1 |
| Build | B-01〜B-05 | B-2 |
| Build | B-06 | A-1 |
| Build | B-07 | B-2 |
| 特殊 | CALC_BUFFER | A-2 |

**全 ID が A または B に存在し、漏れなし。**

---

## I. 参照元ドキュメント一覧

本ドキュメントの作成にあたり、以下のファイルを網羅的に確認した。

### config_migration ルート直下

| ファイル | 主な抽出内容 |
|----------|-------------|
| migration_roadmap.md | Phase2 スコープ・完了条件・リスク・検証観点 |
| tobe_config_architecture.md | SSoT 原則・読み取り優先度・スキーマ概要・禁止事項 |
| changeSpec_overview.md | ゲート条件・テスト方針・ID 駆動移行手順 |
| CHANGE_RULES.md | Duplicate-first / Runtime-gate / Inventory-coverage ルール |
| patternA_operational_model.md | パターン A の運用モデル（Build/Deploy/Run 分離） |
| store_onboarding_and_release_checklist.md | 店舗追加/リリースチェックリスト |
| DECISION_LOG.md | D-0001〜D-0015 の決定事項 |
| CHANGE_LOG.md | Phase0A/0B/1/2 の変更履歴 |
| PHASE0B_DECISIONS_FOR_LATER_PHASES.md | Phase1/2 着手前の必須確認事項 |

### phase0A/

| ファイル | 主な抽出内容 |
|----------|-------------|
| README.md | Phase0A スコープ・完了状態 |
| TASK_LIST.md | Task8 の Phase3 移管 |

### phase0B/

| ファイル | 主な抽出内容 |
|----------|-------------|
| README.md | Phase0B スコープ・タスク 5/6 の Phase2 移管 |
| TASK_LIST.md | Phase0B → Phase2 移管タスクの詳細 |
| PHASE0B_TARGET_LIST.md | Phase0B 対象 ID 一覧（二重管理あり） |
| PHASE0B_REFERENCE_MAP.md | 各 ID の参照箇所マップ（ファイル:行番号） |
| PHASE0B_BEFORE_AFTER_DECISION.md | 各 ID の Before/After SSoT 決定 |
| PHASE0B_DEPRECATION_PLAN.md | 各 ID の廃止計画・実施タイミング |
| STOREMETA_CONFIG_SPEC.md | 単一ドキュメント方針・読み取り優先度・デフォルト値方針 |
| PHASE0B_COMPLETED_AND_DECISIONS.md | Phase0B 完了サマリ・後続フェーズの状態 |

### phase1/

| ファイル | 主な抽出内容 |
|----------|-------------|
| README.md | Phase1 完了確認 |
| TASK_LIST.md | Phase1 全タスク完了の確認 |
| PHASE1_CONFIG_SCHEMA.md | スキーマ定義（8 ドメイン・全キー・型・許容値・デフォルト） |
| PHASE1_FALLBACK_BEHAVIOR.md | 未存在/失敗の挙動区別・ログ仕様 |
| PHASE1_UPDATE_PATH_DESIGN.md | defaults.ts 唯一ソース方針・Flutter 参照責務 |
| PHASE1_ROLLBACK.md | 旧参照の即削除方針・Phase2 での必須作業 |
