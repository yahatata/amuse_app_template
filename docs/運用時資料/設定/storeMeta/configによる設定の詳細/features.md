# features（機能フラグ）

features オブジェクトは複数の機能フラグを保持する。以下、フィールド別に記載する。

---

## settlementAggregatorEnabled（D-05）

### 設定の説明

決済アグリゲータ（会計完了時の analytics 集計ジョブ enqueue）を有効にするかどうかを制御するフラグ。

### 何を設定するのか

`storeMeta/config` の `features.settlementAggregatorEnabled`（boolean）。未指定時は `defaults.ts` の `true` が使われる。

### 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`true`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

### 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告（「会計等の蓄積処理ができていないため、管理者にご連絡ください。」）
4. 本設定は boolean のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

### 現状持ちうる値

| 値 | 意味 |
|----|------|
| `true` | 会計完了（status→settled）時に `enqueueSettlement` が呼ばれ、analytics 集計ジョブが投入される |
| `false` | `enqueueSettlement` は呼ばれない。会計完了時の analytics は動かない |

### その設定により何が変わるのか

- `true` の場合: 会計完了ごとに analytics への集計ジョブが投入される。analytics 月次集計や会計詳細データの表示に必要。
- `false` の場合: 会計完了時の analytics 集計は行われない。トラブル時や段階ロールアウト時の一時停止に利用。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/bills/triggers/billsOnSettle.ts` | Functions（会計完了トリガで enqueue 判定） |
| ts | `functions/src/shared/config/configLoader.ts` | Functions（config 取得・フォールバック） |
| ts | `functions/src/shared/config/defaults.ts` | Functions（デフォルト値定義） |
| dart | `lib/services/store_config_service.dart` | App（設定画面での表示等） |

---

## dualWriteEnabled（D-07）

### 設定の説明

当日請求（todaysBills）へのデュアルライト（bills からの複写）を有効にするかどうかを制御するフラグ。

### 何を設定するのか

`storeMeta/config` の `features.dualWriteEnabled`（boolean）。未指定時は `defaults.ts` の `false` が使われる。

### 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`false`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

### 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は boolean のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

### 現状持ちうる値

| 値 | 意味 |
|----|------|
| `true` | bills 更新時に todaysBills へ複写する（appendItem, updatePlace, startAccounting 等） |
| `false` | todaysBills への複写を行わない |

### その設定により何が変わるのか

- `true` の場合: bills の各種更新（会計開始、明細追加、座席変更等）に合わせて todaysBills へベストエフォートで複写。複写失敗時も bills を正とする。
- `false` の場合: todaysBills への複写は行わない。レガシー todaysBills 依存を廃止する際に利用。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/bills/repos/dualWrite.ts` | shouldDualWrite() |
| ts | `functions/src/domains/bills/repos/appendItem.ts` | appendItem の dualWrite 分岐 |
| ts | `functions/src/domains/bills/repos/appendExtra.ts` | appendExtra の dualWrite 分岐 |
| ts | `functions/src/domains/bills/repos/appendSideGameChip.ts` | appendSideGameChip の dualWrite 分岐 |
| ts | `functions/src/domains/bills/repos/updatePlace.ts` | updatePlace の dualWrite 分岐 |
| ts | `functions/src/domains/bills/repos/recordTournamentAction.ts` | recordTournamentAction の dualWrite 分岐 |
| ts | `functions/src/domains/bills/repos/startAccounting.ts` | startAccounting の dualWrite 分岐 |
| ts | `functions/src/domains/bills/repos/updateBill.ts` | updateBill の dualWrite 分岐 |
| ts | `functions/src/domains/bills/repos/createBillWithActiveStay.ts` | createBillWithActiveStay の dualWrite 分岐 |
| ts | `functions/src/domains/bills/callables/updateActiveBill.ts` | updateActiveBill の dualWrite 分岐 |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |

---

## enqueueSchedulerEnabled（D-08）

### 設定の説明

トーナメント enqueue バッチの Scheduler 実行を有効にするかどうかを制御するフラグ。Scheduler および作成経路からの `runEnqueueTournamentTasks` 呼び出し時に、このフラグが `true` でなければ即 return する。

### 何を設定するのか

`storeMeta/config` の `features.enqueueSchedulerEnabled`（boolean）。未指定時は `defaults.ts` の `true` が使われる。

- **`true` の場合**: トーナメントの開始・受付締切に合わせて Cloud Tasks を投入する処理が動く。毎日 5:00 の定期実行と、トーナメント作成時に呼ばれる処理の両方で実行される。
- **`false` の場合**: 上記の Cloud Tasks 投入処理は一切行われない。トーナメントの作成・登録はできるが、開始時刻や受付締切時刻に自動でタスクを出す動きはしない。

### 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`true`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

### 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は boolean のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

### 現状持ちうる値

| 値 | 意味 |
|----|------|
| `true` | enqueue バッチ（Scheduler・作成経路）を実行する。scheduledTournament に基づき Cloud Tasks を投入（デフォルト） |
| `false` | enqueue バッチは即 return。タスク投入を行わない |

### その設定により何が変わるのか

- `true` の場合: 毎日 5:00 JST の Scheduler および作成経路から `runEnqueueTournamentTasks` が実行され、トーナメント開始・受付締切の Cloud Tasks が投入される。
- `false` の場合: enqueue はスキップ。段階導入時やトラブル時の無効化に利用。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/tournament_createTournament/scheduler/EnqueueTournamentTasksByScheduler.ts` | Scheduler の入口ガード |
| ts | `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts` | runEnqueueTournamentTasks の入口ガード |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| dart | `lib/services/store_config_service.dart` | App（設定画面での表示等） |

---

## templateBusinessDateCheck（D-09）

### 設定の説明

同一営業日・同一テンプレートのトーナメント重複チェックを有効にするかどうかを制御するフラグ。`createScheduledTournament`・`createTournamentRecurrence`・`generateRecurringTournamentsCore` で、このフラグが `true` のときのみ重複チェックを行う。

### 何を設定するのか

`storeMeta/config` の `features.templateBusinessDateCheck`（boolean）。未指定時は `defaults.ts` の `true` が使われる。

- **`true` の場合**: 同一営業日・同一テンプレートで既に scheduled のトーナメントがあると、新規作成を拒否（createScheduledTournament）またはスキップ（定期生成）（デフォルト）。
- **`false` の場合**: 重複チェックを行わず、同一営業日に同じテンプレートの複数トーナメントを作成可能。

### 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`true`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

### 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は boolean のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

### 現状持ちうる値

| 値 | 意味 |
|----|------|
| `true` | 同一営業日・同一テンプレートの重複作成を禁止。既存トーナメントがあれば作成を拒否またはスキップ（デフォルト） |
| `false` | 重複チェックを行わない |

### その設定により何が変わるのか

- `true` の場合: 同一営業日に同じテンプレートで複数トーナメントを作成しようとすると、createScheduledTournament はエラー、定期生成はスキップする（デフォルト）。
- `false` の場合: 重複チェックは行われず、同一営業日に同じテンプレートの複数トーナメントが作成可能。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` | スケジュール登録時の重複チェック |
| ts | `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts` | 定期生成時の重複チェック |
| ts | `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` | 定期生成 Core での重複チェック |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| dart | `lib/services/store_config_service.dart` | App（設定画面での表示等） |

---

## tableDeviceRegistrationEnabled（B-06）

### 設定の説明

卓端末（role: table）からのトーナメント・サイドゲーム登録機能を有効にするかどうかを制御するフラグ。**現状はスキーマ定義のみ**で、ビジネスロジックでの参照はなし。卓端末機能の on/off は現行 `dart-define`（`bool.fromEnvironment`）で制御されている。将来 config 連動実装時に本設定で分岐する予定。

### 何を設定するのか

`storeMeta/config` の `features.tableDeviceRegistrationEnabled`（boolean）。未指定時は `defaults.ts` の `true` が使われる。

- **`true` の場合**: 卓端末からの登録機能を有効にする（将来実装時）
- **`false` の場合**: 卓端末からの登録機能を無効にする（将来実装時）

### 取得失敗時・不具合時の対応

スキーマ定義のみのため、configLoader の共通フォールバック（未存在時・読み取り失敗時は defaults を使用）で対応。個別の取得失敗時・不具合時記載は不要。

### 現状持ちうる値

| 値 | 意味 |
|----|------|
| `true` | 卓端末登録機能を有効（デフォルト。将来実装時に効く） |
| `false` | 卓端末登録機能を無効（将来実装時に効く） |

### その設定により何が変わるのか

**現状**: ビジネスロジックでの参照がないため、設定を変更しても動作に影響しない。  
**将来**: 卓端末機能の config 連動実装により、本設定で登録フローの表示・非表示等を制御する予定。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック（スキーマ） |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| dart | `lib/services/store_config_service.dart` | App（config パース・設定画面での表示等） |
