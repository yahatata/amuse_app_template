# 新フォルダ別設計：storeMeta

## 5.1 ドメイン定義（短く）

店舗・開閉店・状態・店舗評価（開始/終了タスク含む）を担当するドメイン。営業日（currentBusinessDay）の取得・開閉店ターミナル・手動開閉店・処理リース（排他制御）、および閉店まわりの未精算伝票取得・closeSnapshot・activeStays クリーンアップ・テーブル/サイドゲームリセットを含む。

**主に扱うデータ/コレクション**
- storeMeta/currentBusinessDay（および logs）
- storeMeta/closeRuns, openRuns/runs（processingLease で書込）
- 閉店ターミナル時は bills, users, activeStays, tables, sideGame も参照（close_process 由来の services/repos を storeMeta に配置）

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | 開店・閉店・ターミナル・営業継続・初期状態ドキュメント作成の onCall 入口。閉店・開店認定タスク（onRequest）2 本含む |
| scheduler/ | 週次プランナー（weeklyPlanner）。閉店・開店認定タスクの投入 |
| scripts/ | CLI 専用の初期化スクリプト（createInitialStateDoc）。npx 手動実行用。入口なし |
| services/ | 処理リース（排他制御）。processingLease。閉店まわり（computeDisplayAmount, runResetAllTables, runResetAllSideGames, runCleanupActiveStays, applyCloseSnapshotCore）。close_process 由来の resetAllTables / resetAllSideGames / getUnsettledBillsForClose / finalizeUnsettledBillAfterAccounting / cleanupActiveStaysOnClose / applyCloseSnapshot は**基本的に services**。純粋に repos（書き込み等のみ）とする処理のみ repos に振り分け（08 確定） |
| repos/ | 現在営業日キー取得。getCurrentBusinessDateKeyOrThrow。閉店まわりで純粋 I/O のみの処理があれば repos に配置 |
| （types） | CurrentBusinessDayDoc, ProcessingLeaseDoc, StateDocLogEntry 等。repos またはルートに付随 |

- helpers/stateDoc のうち、getCurrentBusinessDateKeyOrThrow, processingLease, types は **storeMeta** に配置。generateJstDateKey のみ **shared/time** に配置（08 参照）。

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| storeManagement/index.ts | domains/storeMeta の再構成 | — | 集約のみ。callables から re-export |
| storeManagement/openStore.ts | domains/storeMeta/callables/openStore.ts | callable | helpers/stateDoc（generateJstDateKey）→ shared/time 参照に変更 |
| storeManagement/closeStore.ts | domains/storeMeta/callables/closeStore.ts | callable |  |
| storeManagement/openStoreTerminal.ts | domains/storeMeta/callables/openStoreTerminal.ts | callable | processingLease, generateJstDateKey は storeMeta/services, shared/time から参照 |
| storeManagement/closeStoreTerminal.ts | domains/storeMeta/callables/closeStoreTerminal.ts | callable | 閉店処理は自ドメイン services（applyCloseSnapshotCore, run*, computeDisplayAmount）と shared/devices（requireAdmin）を参照 |
| storeManagement/continueBusinessTerminal.ts | domains/storeMeta/callables/continueBusinessTerminal.ts | callable | lib/env → shared/firebase 等に変更 |
| storeManagement/createInitialStateDocCallable.ts | domains/storeMeta/callables/createInitialStateDocCallable.ts | callable |  |
| helpers/stateDoc/getCurrentBusinessDateKeyOrThrow.ts | domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts | repos |  |
| helpers/stateDoc/processingLease.ts | domains/storeMeta/services/processingLease.ts | service |  |
| helpers/stateDoc/types.ts | domains/storeMeta 配下（types または repos） | — | 型定義 |
| helpers/stateDoc/index.ts | 廃止。storeMeta の index で必要分を re-export | — | getCurrentBusinessDateKeyOrThrow, types。processingLease, generateJstDateKey は index から export されていなかった |
| tasks/closeAssessmentTask.ts | domains/storeMeta/callables/closeAssessmentTask.ts | callable | onRequest。Cloud Tasks から POST。関数名維持 |
| tasks/openAssessmentTask.ts | domains/storeMeta/callables/openAssessmentTask.ts | callable | onRequest。同上 |
| scheduler/weeklyPlanner.ts | domains/storeMeta/scheduler/weeklyPlanner.ts | scheduler | onSchedule。lib/env → shared/firebase 等に変更。CLOSE_ASSESSMENT_URL, OPEN_ASSESSMENT_URL の指し先を維持 |
| close_process/requireAdmin.ts | shared/devices/requireAdmin.ts | service | 権限チェック。00_shared 参照。storeMeta は shared/devices から import |
| close_process/computeDisplayAmount.ts | domains/storeMeta/services/computeDisplayAmount.ts | service | 1 bill の表示用金額算出。closeStoreTerminal 等で利用 |
| close_process/resetAllTables.ts | domains/storeMeta/services/resetAllTables.ts | service | runResetAllTables を同ファイルまたは services に。基本的に services（08 確定） |
| close_process/resetAllSideGames.ts | domains/storeMeta/services/resetAllSideGames.ts | service | 同上。runResetAllSideGames |
| close_process/getUnsettledBillsForClose.ts | domains/storeMeta/services/getUnsettledBillsForClose.ts | service | 未会計 bills 取得。同上 |
| close_process/finalizeUnsettledBillAfterAccounting.ts | domains/storeMeta/services/finalizeUnsettledBillAfterAccounting.ts | service | 会計後確定。同上 |
| close_process/cleanupActiveStaysOnClose.ts | domains/storeMeta/services/cleanupActiveStaysOnClose.ts | service | runCleanupActiveStays。同上 |
| close_process/applyCloseSnapshot.ts | domains/storeMeta/services/applyCloseSnapshot.ts | service | applyCloseSnapshotCore を同ファイルまたは services に。同上 |
| scripts/createInitialStateDoc.ts | domains/storeMeta/scripts/createInitialStateDoc.ts | — | CLI 専用（npx ts-node/tsx 手動実行）。入口なし。currentBusinessDay 初期ドキュメント作成。ルート index からは export しない |

---

## 5.4 index.ts 変更方針

- **ルート index**：`export * from "./storeManagement"` を `export * from "./domains/storeMeta"` に変更。関数名は維持。
- **domains/storeMeta/index.ts**：callables 6 本を re-export。services/repos は原則として内部利用（closeStoreTerminal は自ドメイン services と shared/devices を参照）。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。storeManagement 参照を domains/storeMeta に変更したうえで、close_process 由来は storeMeta 内に取り込み、utils/getOpenBills・itemOrder 等が getCurrentBusinessDateKeyOrThrow を storeMeta/repos から参照できること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **stateDoc**：getCurrentBusinessDateKeyOrThrow, processingLease, types は **storeMeta** に配置。generateJstDateKey のみ **shared/time** に配置する（helpers 棚卸し 5.1 結論）。08_意思決定ログに「stateDoc をすべて shared/time としない理由」を記録する。
- **closeStoreTerminal** が参照するのは **shared/devices（requireAdmin）** と **storeMeta 自ドメインの services**（computeDisplayAmount, runResetAllTables, runResetAllSideGames, runCleanupActiveStays, applyCloseSnapshotCore）。close_process 由来の 6 callable は storeMeta の services/repos に振り分け、今後はターミナル内でのみ呼ぶ想定。
- **changeSpec**：stateDoc 移管時に storeManagement, close_process, utils, itemOrder の **import パス** を更新する。close_process 移管時は storeMeta および shared/devices への移動と、closeStoreTerminal の import 更新を記載する。
- **05_入口一覧**：移行実施後、storeManagement 配下 6 入口の配置を「storeMeta/callables」に更新する。閉店まわり 6 入口（resetAllTables 等）は storeMeta に移すため、05 の該当行のドメインを storeMeta に変更する。
