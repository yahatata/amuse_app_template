# Phase6 Step3 実装変更内容の詳細

本ドキュメントは Step3 で **新規作成・更新したファイル** と **実コードの修正内容** を一覧化したものです。

---

## Step3 実装完了サマリ

| 項目 | 内容 |
|------|------|
| **状態** | 実装完了（テスト・ドキュメント反映済み） |
| **閉店フロー** | 開閉店管理 → 閉店処理を開始 → getUnsettledBillsForClose → 未会計一覧ダイアログ → 確認して閉店 → closeStoreTerminal → **閉店完了ダイアログ**（§4.8 関数ごと表示） |
| **開店フロー** | 開閉店管理 → 開店処理を開始 → openStoreTerminal → 完了メッセージ |
| **閉店完了時の表示** | 成功時は **ダイアログ** で表示（仕様）。`closeStoreTerminal` が返す `displaySummary`（未会計付与・cleanupActiveStays・移管・storeMeta）を `_showCloseCompletedDialog` で関数ごとに表示。 |
| **UI の context 対応** | 開閉店管理ダイアログ内のボタンから閉店／開店／初期化を呼ぶ際、ダイアログを閉じたあとも有効な **ページの context**（`pageContext`）を渡すように修正。未会計一覧ダイアログが表示されない不具合を解消。 |
| **テスト** | `closeOpenRunsPath.spec.ts`, `step3.spec.ts`（storeManagement）, `step3.spec.ts`（close_process）, `cleanupActiveStaysOnClose.spec.ts`, `processingLease.spec.ts` で Step3 関連を検証。エミュレータ起動下で一括実行可能。 |

---

## 1. 変更ファイル一覧

| 種別 | パス |
|------|------|
| 新規 | `functions/src/helpers/stateDoc/processingLease.ts` |
| 新規 | `functions/src/close_process/computeDisplayAmount.ts` |
| 新規 | `functions/src/storeManagement/closeStoreTerminal.ts` |
| 新規 | `functions/src/storeManagement/openStoreTerminal.ts` |
| 変更 | `functions/src/helpers/stateDoc/types.ts` |
| 変更 | `functions/src/close_process/getUnsettledBillsForClose.ts` |
| 変更 | `functions/src/close_process/applyCloseSnapshot.ts` |
| 変更 | `functions/src/close_process/resetAllSideGames.ts` |
| 変更 | `functions/src/close_process/resetAllTables.ts` |
| 変更 | `functions/src/close_process/cleanupActiveStaysOnClose.ts` |
| 変更 | `functions/src/analytics/migrateSettledBillsForBusinessDay.ts` |
| 変更 | `functions/src/storeManagement/index.ts` |
| 変更 | `lib/Home/terminalHomePage.dart` |

---

## 2. 新規ファイルの内容

### 2.1 `functions/src/helpers/stateDoc/processingLease.ts`

**役割**: processing(lease) の獲得・延長・解放を transaction で実施。仕様 §6.5 の分岐に従う。

**主な内容**:
- 定数: `LEASE_SECONDS = 120`, `STATE_DOC_PATH = 'storeMeta/currentBusinessDay'`
- `acquireProcessing(db, { runId, kind, requestRunId? })`: transaction で state を読んで分岐
  - processing なし → 新規獲得
  - 有効かつ requestRunId なし → `HttpsError('failed-precondition', …)`
  - 有効かつ runId 一致 → resume として継続
  - 有効かつ runId 不一致 → `failed-precondition`
  - 期限切れ (now > leaseExpiresAt) → 旧 run を `storeMeta/closeRuns/runs/{oldRunId}` または `storeMeta/openRuns/runs/{oldRunId}` に `status: 'stale', staleAt` で merge。新 processing を設定
- `extendProcessing(db, { runId, kind })`: runId 一致かつ有効な場合のみ `leaseExpiresAt` を now+120s に更新
- `releaseProcessing(db, { runId })`: runId 一致時のみ `processing` を `FieldValue.delete()`

**export**: `acquireProcessing`, `extendProcessing`, `releaseProcessing`, `AcquireResult`

---

### 2.2 `functions/src/close_process/computeDisplayAmount.ts`

**役割**: 1 bill の表示用金額をサブコレクション（extras, items, sideGameChips, tournaments）から算出。getUnsettledBillsForClose と closeStoreTerminal で共有。

**主な内容**:
- `computeDisplayAmount(db, billId): Promise<number>`
- extras の amountIncl 合計、items の totalPriceIncl/unitPriceIncl×quantity（voided 除外）、sideGameChips（action==purchase）の amountIncl、tournaments の entry/reentry/addon 金額を合算して返す

**export**: `computeDisplayAmount`

---

### 2.3 `functions/src/storeManagement/closeStoreTerminal.ts`

**役割**: 閉店ターミナル Callable。未会計付与・closeRuns 記録・reset/cleanup/migrate・finalize を順次実行。

**主な内容**:
- `onCall`（region: us-central1）
- 認証・`requireAdmin(db, adminId)`
- 入口: `storeMeta/currentBusinessDay` を取得。`status !== 'running'` または `currentBusinessDateKey` が空なら `HttpsError('invalid-argument', …)`
- `runId`: `request.data?.runId`（resume）または `close_${closedBusinessDate}_${Date.now()}`
- `acquireProcessing(db, { runId, kind: 'close', requestRunId })`（失敗時は failed-precondition 等をそのまま throw）
- closeRuns: `storeMeta/closeRuns/runs/{runId}`（仕様 storeMeta/closeRuns/{runId}。Firestore は col/doc/col/doc のため runs サブコレで run を格納）を status=running で upsert（初回は startedAt, closedBusinessDate 等を set）
- ステップ順: `UNSETTLED_MARK` → `resetSideGames` → `resetTables` → `cleanupActiveStays` → `migrateMissedSettlements` → `finalizeCloseStateDoc`
- 各ステップ: `steps/{stepName}/attempts/attempt_${Date.now()}` に startedAt で attempt 作成 → 本処理 → 成功時は attempt に result=success、親の lastCompletedStep 更新、`extendProcessing`
- UNSETTLED_MARK: 未会計 bills を再取得、`computeDisplayAmount` で amountsByBillId 作成、`applyCloseSnapshotCore` に closeRunId 渡す。`writtenBillIds` と `usersIncremented` を保持。closeRuns の unsettledCount と unsettledBills サブコレをターミナル側で記録
- 失敗時: attempt に result=failed、親に status=failed, failedStep, lastErrorSummary。UNSETTLED_MARK 失敗時のみ writtenBillIds で巻き戻し（bills の closeSnapshot 削除、users の decrement、unsettledBills 削除）、attempt に rollback 結果、`releaseProcessing`、`HttpsError(..., { runId })` で throw
- finalizeCloseStateDoc 成功時: state を status=closed, currentBusinessDateKey=null, lastClosedBusinessDateKey 設定、processing 削除。closeRuns を status=completed, completedAt。`releaseProcessing`。**return** に **displaySummary**（§4.8 用）を含める: unsettledMark（count, pokerNames）、cleanupActiveStays（deleted, failed）、migrateMissedSettlements（processedCount, pokerNames）、storeMeta（要約文）。UI はこれを受け取り閉店完了ダイアログで表示する。
- UNSETTLED_MARK 後に writtenBillIds に対応する bills から pokerName を取得して displaySummary.unsettledMark を設定。cleanupActiveStays / migrateMissedSettlements の返却値を displaySummary に格納。

**export**: `closeStoreTerminal`

---

### 2.4 `functions/src/storeManagement/openStoreTerminal.ts`

**役割**: 開店ターミナル Callable。verifyPreconditions → forceCleanup → finalizeOpenStateDoc。

**主な内容**:
- `onCall`（region: us-central1）
- 認証・`requireAdmin`
- 入口: state が存在し、`status === 'closed' || status === 'error'` であること。それ以外は `invalid-argument`
- `businessDateKey`: `request.data?.businessDateKey` または `generateJstDateKey()`。YYYY-MM-DD 形式チェック
- `runId`: `request.data?.runId` または `open_${businessDateKey}_${Date.now()}`
- `acquireProcessing(db, { runId, kind: 'open', requestRunId })`
- openRuns: `storeMeta/openRuns/runs/{runId}`（仕様 storeMeta/openRuns/{runId}）を status=running で upsert
- ステップ: `verifyPreconditions`（state の status 再確認）→ `forceCleanup`（activeStays の isActive==true を削除、forceCleanupApplied.counts/summaries に記録）→ `finalizeOpenStateDoc`（state を status=running, currentBusinessDateKey 設定、processing 削除。openRuns を completed。`releaseProcessing`）
- 失敗時: attempt と親を更新、`releaseProcessing`、`HttpsError(..., { runId })` で throw

**export**: `openStoreTerminal`

---

## 3. 変更ファイルの修正内容

### 3.1 `functions/src/helpers/stateDoc/types.ts`

**追加**:
- `ProcessingLeaseDoc` インターフェース（runId, startedAt, leaseExpiresAt, kind: 'close'|'open'）
- `CurrentBusinessDayDoc` に `processing?: ProcessingLeaseDoc | null` を追加

**既存フィールド・他型**: 変更なし。

---

### 3.2 `functions/src/close_process/getUnsettledBillsForClose.ts`

**変更**:
- ファイル内にあった `computeDisplayAmount` 関数（約50行）を削除
- `import { computeDisplayAmount } from './computeDisplayAmount';` を追加
- Callable の挙動・返却形式（success, data, returnedCount, truncated）は変更なし

---

### 3.3 `functions/src/close_process/applyCloseSnapshot.ts`

**追加**:
- `ApplyCloseSnapshotCoreParams`（billIds, amountsByBillId, closedBusinessDate, closeRunId）
- `ApplyCloseSnapshotCoreResult`（updatedBillIds, writtenBillIds, skipped, usersIncremented, usersUpdateFailed）
- `applyCloseSnapshotCore(db, params)`: 既存の per-bill トランザクション＋users の increment を closeRunId を受け取る形で実装。戻り値に `writtenBillIds`（= updatedBillIds）を含める

**変更**:
- 既存の onCall `applyCloseSnapshot` は、`getCurrentBusinessDateKeyOrThrow()` で closedBusinessDate を取得したうえで `applyCloseSnapshotCore(db, { billIds, amountsByBillId, closedBusinessDate, closeRunId: LAST_CLOSE_RUN_ID_STEP2 })` を呼ぶだけに変更
- 返却フィールドは従来どおり（success, updatedBillIds, skipped, updatedCount, usersIncremented, usersUpdateFailed）。writtenBillIds は Callable のレスポンスには含めない（Step2 互換のため）

**定数**: `LAST_CLOSE_RUN_ID_STEP2 = 'step2-manual'` はそのまま使用。

---

### 3.4 `functions/src/close_process/resetAllSideGames.ts`

**追加**:
- `runResetAllSideGames(db): Promise<{ count: number }>`: sideGame 一覧取得 → batch で active=false, seats の PokerName/UserId を null, gameName=null に更新 → commit。空の場合は count=0 で return

**変更**:
- `resetAllSideGames` onCall は `runResetAllSideGames(getFirestore())` を呼び、その count で success/message/count を返す形に変更。挙動は従来どおり。

---

### 3.5 `functions/src/close_process/resetAllTables.ts`

**追加**:
- `runResetAllTables(db): Promise<{ count: number }>`: tables 一覧取得 → batch で status='open', updatedAt 更新 → commit

**変更**:
- `resetAllTables` onCall は `runResetAllTables(getFirestore())` を呼び、その count で success/message/count を返す形に変更。

---

### 3.6 `functions/src/close_process/cleanupActiveStaysOnClose.ts`

**追加**:
- `runCleanupActiveStays(db): Promise<{ deleted, failed, unsettledBillIds }>`: activeStays 全件取得 → 各 doc で bill の status 監査（unsettled なら unsettledBillIds に追加）、リトライ付き delete。deleted/failed を返す

**変更**:
- onCall は devices で admin チェックしたうえで `runCleanupActiveStays(db)` を呼び、返り値で success/deleted/failed/elapsedMs/unsettledBillIds を返す形に変更。

---

### 3.7 `functions/src/analytics/migrateSettledBillsForBusinessDay.ts`

**追加**:
- `runMigrateSettledBillsForBusinessDay(db, businessDate): Promise<{ processedCount, skippedCount, month, processedPokerNames }>`: 対象営業日の settled bills を取得、aggregationMarkers でスキップ判定しつつ `processBillAnalyticsAtomically` で処理。processedCount/skippedCount/month に加え、閉店完了ダイアログ表示用に **processedPokerNames: string[]**（移管した bill の pokerName 一覧）を返す。

**変更**:
- onCall は `getBusinessDateFromStoreMeta(db)` で営業日を取得してから `runMigrateSettledBillsForBusinessDay(db, businessDate)` を呼び、返り値で success/processedCount/skippedCount/month/businessDate/message を返す形に変更。既存の戻り値形式は維持（onCall のクライアント向け返却に processedPokerNames は含めない）。

---

### 3.8 `functions/src/storeManagement/index.ts`

**追加**:
- `export { openStoreTerminal } from './openStoreTerminal';`
- `export { closeStoreTerminal } from './closeStoreTerminal';`

**既存**: openStore, closeStore, createInitialStateDocCallable は変更なし。

---

### 3.9 `lib/Home/terminalHomePage.dart`

**変更**:
- `_showStoreManagementDialog`: 内容を「開店または閉店を実行しますか？」＋3ボタンから、**StreamBuilder&lt;StoreMetaData&gt;** で開店中/閉店中を分岐する形に変更。
  - **開店中**（isRunning && currentBusinessDateKey あり）: 「現在の営業日: …」と「閉店処理を開始する」「初期化」ボタン
  - **閉店中**（isClosed or isError）: 「閉店中です。…」と「開店処理を開始する」「初期化」ボタン
- **閉店フロー**: `_startCloseFlow` を新規追加。getUnsettledBillsForClose 呼び出し → 一覧表示 → 「確認して閉店する」で `_callCloseStoreTerminal(context, runId: null)` を実行。**開閉店管理ダイアログから呼ぶ際は、ダイアログを閉じたあとも有効な context が必要なため、`_showStoreManagementDialog` の引数 `context` を `pageContext` として保持し、閉店・開店・初期化の各ボタンからは `pageContext` を渡す。**
- **閉店処理完了時はダイアログを表示する**（仕様）。成功時は SnackBar ではなく **閉店完了ダイアログ** を表示する。`_showCloseCompletedDialog` で §4.8 に従い「未会計付与・cleanupActiveStays・移管・storeMeta」を関数ごとにまとめた内容を表示。Callable が `displaySummary` を返さない場合はメッセージのみの簡易ダイアログを表示。
- **closeStoreTerminal**: `_callCloseStoreTerminal(context, { String? runId })` を新規追加。`closeStoreTerminal` Callable を runId あり（resume）・なしで呼び分け。**成功時は `_showCloseCompletedDialog` によりダイアログを表示**。`failed-precondition` のときは「閉店処理が他の操作で実行中です。…」と SnackBar。失敗時に `e.details` の runId があれば「再開」ダイアログを表示し、同一 runId で再呼び出し
- **openStoreTerminal**: `_callOpenStoreTerminal(context, { String? runId })` を新規追加。`openStoreTerminal` Callable を同様に runId で resume 対応。`failed-precondition` 時は「開店処理が実行中です。…」と SnackBar
- 既存の `_callOpenStore` / `_callCloseStore`（openStore / closeStore 呼び出し）は**削除していない**（Callable は残置のため）。ダイアログからは呼ばれず、closeStoreTerminal / openStoreTerminal のみ使用。

---

## 4. デプロイ対象の Cloud Functions 名

以下の **Callable 名** が追加または実装変更の影響を受けています。これらのみをデプロイするコマンドを次節に記載します。

- `closeStoreTerminal`
- `openStoreTerminal`
- `getUnsettledBillsForClose`
- `applyCloseSnapshot`
- `resetAllSideGames`
- `resetAllTables`
- `cleanupActiveStaysOnClose`
- `migrateSettledBillsForBusinessDay`

※ 上記をデプロイする際も、ビルド時には `processingLease` や `applyCloseSnapshotCore` 等の共通モジュールがバンドルに含まれるため、実質的には変更のあったコード一式がデプロイされます。

---

## 5. デプロイコマンド（更新・作成した TS に紐づく Functions のみ）

次で、上記 8 本の Cloud Functions のみを更新します（他関数は触れません）。

```bash
cd functions && npm run build && cd .. && firebase deploy --only functions:closeStoreTerminal,functions:openStoreTerminal,functions:getUnsettledBillsForClose,functions:applyCloseSnapshot,functions:resetAllSideGames,functions:resetAllTables,functions:cleanupActiveStaysOnClose,functions:migrateSettledBillsForBusinessDay
```

※ 全 Functions をデプロイする場合は `firebase deploy --only functions` を使用してください。

---

## 6. 実装の確認観点

### 6.1 実機・環境不要で確認済み（実施者: AI）

| 観点 | 結果 |
|------|------|
| TypeScript ビルドが通る | ✅ `npm run build` 成功 |
| 新規・変更 ts の Lint エラーなし | ✅ 対象ファイルで Lint エラーなし |
| processing.runId と closeRuns/openRuns の docId が一致して参照されている | ✅ closeStoreTerminal / openStoreTerminal で runId を docId に使用 |
| UNSETTLED_MARK 巻き戻しが writtenBillIds のみを対象にしている | ✅ 巻き戻しは `markResult.writtenBillIds` と `usersIncremented` のみ |
| Step2 applyCloseSnapshot Callable の入出力を維持（billIds + amountsByBillId、lastCloseRunId は step2-manual） | ✅ Callable は core を closeRunId=LAST_CLOSE_RUN_ID_STEP2 で呼び、返却に writtenBillIds を含めない |
| closeStore / openStore を削除していない | ✅ 両方残存、index からも export 維持 |
| getUnsettledBillsForClose の返却形式（success, data, returnedCount, truncated）変更なし | ✅ 変更なし |
| エラーで failed-precondition を「ロック取得失敗時のみ」使用し、入口の前提不成立は invalid-argument | ✅ processingLease と close/openStoreTerminal で分離 |
| 失敗時に HttpsError の details に runId を付与して resume 可能にしている | ✅ closeStoreTerminal / openStoreTerminal の catch で `throw new HttpsError(..., { runId })` |

### 6.2 実機・Firebase 環境でユーザーが確認する項目

以下は **実機または本番/検証環境** での確認が必要です。

| # | 確認内容 | 手順メモ |
|---|----------|----------|
| 1 | **閉店ターミナル 1 run で完了** | 開店中にターミナルホームの開閉店管理 → 閉店処理を開始 → getUnsettledBillsForClose で一覧 → 確認して閉店 → closeStoreTerminal が完了する。Firestore で `storeMeta/closeRuns/runs/{runId}` が status=completed、unsettledCount・unsettledBills が期待どおりであること。 |
| 2 | **開店ターミナル 1 run で完了** | 閉店中に開閉店管理 → 開店処理を開始 → openStoreTerminal が完了し、「〇〇の営業を開始しました」と表示される。storeMeta/currentBusinessDay が status=running、currentBusinessDateKey が設定されていること。 |
| 3 | **ロック中（failed-precondition）の表示** | 閉店処理実行中に別端末または別タブで閉店を試みる。または開店処理実行中に開店を試みる。「〇〇処理が他の操作で実行中です。完了するまでお待ちください。」と表示され、code が failed-precondition であること（UI は code のみで判定していることを確認）。 |
| 4 | **resume（再開）** | 閉店または開店の途中で意図的に失敗させる（またはネット切断等で失敗）。エラー後に「再開」ダイアログが表示され、再開で **同一 runId** が渡され、lastCompletedStep の次から再実行されること。Firestore で closeRuns/openRuns の同一 runId に attempts が追加されていること。 |
| 5 | **UNSETTLED_MARK 失敗時の巻き戻し** | （任意・再現が難しい場合あり）UNSETTLED_MARK ステップで失敗した場合、writtenBillIds に含まれた bill の closeSnapshot が削除され、users の unsettledBillsCount が decrement され、当該 run の unsettledBills サブコレが削除されていること。attempt に rollbackResult が記録されていること。 |
| 6 | **Step2 手動移管が従来どおり動く** | システム設定画面の「未会計billsの移管」で getUnsettledBillsForClose → applyCloseSnapshot（Step2）が問題なく動作し、lastCloseRunId が step2-manual のままであること。 |
| 7 | **既存 openStore / closeStore** | 他画面やスクリプトから openStore / closeStore を呼んでいる場合は、従来どおり動作すること（本 Step3 の UI は closeStoreTerminal / openStoreTerminal のみ使用）。 |
| 8 | **stale takeover（任意）** | processing の lease が 120 秒経過したあと、別クライアントが閉店/開店を開始した場合、旧 run が status=stale、staleAt が付与され、新 runId で開始されること。 |

### 6.3 デプロイ結果の確認

- 上記 8 関数のデプロイコマンドを実行済み。Firebase Console の **Functions** 一覧で `closeStoreTerminal` / `openStoreTerminal` が存在し、他 6 本が更新日時で更新されていることを確認してください。
- 認証エラー（`Your credentials are no longer valid`）が出た場合は `firebase login --reauth` のうえ、必要に応じてデプロイコマンドを再実行してください。
- `migrateSettledBillsForBusinessDay` がタイムアウトで未完了の場合は、次で再デプロイできます。  
  `firebase deploy --only functions:migrateSettledBillsForBusinessDay`

---

## 7. `functions/__tests__` で確認できる項目（テスト作成・実行による検証）

### 7.1 結論

| 質問 | 回答 |
|------|------|
| **確認観点のうち、__tests__ 内にテストを作成・実行して確認できる項目は何個か** | **15 項目**（6.1 から 7 項目 ＋ 6.2 から 8 項目）。 |
| **全て確認できるか** | **いいえ**。6.3 の「デプロイ結果の Console 確認」と、6.2#3 の「**UI に**ロック中メッセージが表示されるか」は `functions/__tests__` では確認できない。 |

※ 6.1 の「TypeScript ビルドが通る」「Lint エラーなし」は、テストファイルの実行ではなく `npm run build` / `npm run lint` で確認するため、ここでは「テストファイルを作成・実行して確認できる項目」に含めていない（含めると 17 項目になるが、テスト作成・実行に限定すると 15 項目）。

### 7.2 内訳

**6.1 のうちテストで再検証できる項目（7 個）**

| 観点 | __tests__ での検証方法 |
|------|------------------------|
| processing.runId と closeRuns/openRuns の docId 一致 | ユニット or 統合: closeStoreTerminal / openStoreTerminal が runId を closeRunsRef / openRunsRef の docId に使っていることを assert。 |
| UNSETTLED_MARK 巻き戻しが writtenBillIds のみ | ユニット: 巻き戻し処理をモックし、update/delete が writtenBillIds と usersIncremented 分だけ呼ばれることを検証。 |
| Step2 applyCloseSnapshot の入出力維持 | ユニット: applyCloseSnapshot.run() をモック環境で実行し、core が closeRunId=step2-manual で呼ばれ、返却に writtenBillIds が含まれないことを検証。 |
| closeStore / openStore が残存 | ユニット: storeManagement から openStore / closeStore が import でき、.run が存在することを検証。 |
| getUnsettledBillsForClose の返却形式 | 統合（エミュレータ）: run して success, data, returnedCount, truncated のキーがあることを検証。 |
| エラーコード（failed-precondition はロック時のみ） | ユニット: acquireProcessing の分岐テスト。統合: 入口で status 不備なら invalid-argument、processing 有効で runId なしなら failed-precondition を検証。 |
| 失敗時に details に runId | ユニット: ステップをモックで失敗させ、catch で throw される HttpsError の details.runId を検証。 |

**6.2 のうち __tests__ で検証できる項目（8 個）**

| # | 確認内容 | __tests__ での検証方法 |
|---|----------|------------------------|
| 1 | 閉店ターミナル 1 run で完了 | 統合（エミュレータ）: state=running, currentBusinessDateKey, admin device を用意 → closeStoreTerminal.run() → state=closed, closeRuns が status=completed を検証。 |
| 2 | 開店ターミナル 1 run で完了 | 統合（エミュレータ）: state=closed を用意 → openStoreTerminal.run() → state=running, currentBusinessDateKey 設定を検証。 |
| 3 | ロック中（failed-precondition） | **Backend のみ**: 統合で processing を有効に設定 → closeStoreTerminal.run({ runId なし }) → HttpsError code failed-precondition を検証可能。**「UI に表示されるか」は Flutter のため __tests__ では不可。** |
| 4 | resume（再開） | 統合（エミュレータ）: 失敗した run を用意し、runId を渡して再実行 → lastCompletedStep の次から実行され、attempts が追加されることを検証。 |
| 5 | UNSETTLED_MARK 失敗時の巻き戻し | 統合（エミュレータ）: UNSETTLED_MARK で writtenBillIds が付いた直後に失敗する条件を作り、rollback 後の bills/users/unsettledBills と attempt の rollbackResult を検証。 |
| 6 | Step2 手動移管が従来どおり動く | 統合（エミュレータ）: getUnsettledBillsForClose → applyCloseSnapshot(billIds, amountsByBillId) を実行し、lastCloseRunId=step2-manual を検証。 |
| 7 | 既存 openStore / closeStore | 統合（エミュレータ）: state=closed で openStore.run()、state=running で closeStore.run() を実行し、state が期待どおり更新されることを検証。 |
| 8 | stale takeover | 統合（エミュレータ）: processing を leaseExpiresAt 過去で設定 → closeStoreTerminal.run() → 新 runId で獲得、旧 run が status=stale, staleAt 付与を検証。 |

**6.3 のうち __tests__ で検証できる項目（0 個）**

| 確認内容 | 理由 |
|----------|------|
| デプロイ結果の Console 確認 | Firebase Console の目視確認のため、テストでは不可。 |

### 7.3 テスト実行時の前提

- **統合テスト（エミュレータ）**: `FIRESTORE_EMULATOR_HOST=localhost:8080` を設定し、**Firestore Emulator を別途起動した状態**で `npm run test` を実行する必要がある（既存の `cleanupActiveStaysOnClose.spec.ts` や `bills.onSettle.spec.ts` と同様）。
- **ユニットテスト（モック）**: エミュレータ不要。Firestore や requireAdmin 等を jest.mock で差し替えて実行可能。

### 7.4 Step3 関連テストファイル一覧

| ファイル | 内容 |
|----------|------|
| `__tests__/storeManagement/closeOpenRunsPath.spec.ts` | closeRuns/openRuns のパス（storeMeta/closeRuns/runs/{runId} 等）と閉店・開店 1 run 完了 |
| `__tests__/storeManagement/step3.spec.ts` | 入口 invalid-argument、ロック failed-precondition、既存 openStore/closeStore の state 更新 |
| `__tests__/close_process/step3.spec.ts` | Step2 applyCloseSnapshot 入出力維持、getUnsettledBillsForClose 返却形式、openStore/closeStore export |
| `__tests__/close_process/cleanupActiveStaysOnClose.spec.ts` | runCleanupActiveStays の挙動 |
| `__tests__/helpers/stateDoc/processingLease.spec.ts` | §6.5 分岐（新規獲得、failed-precondition、resume、stale takeover） |

一括実行例:  
`npx jest __tests__/storeManagement/closeOpenRunsPath.spec.ts __tests__/storeManagement/step3.spec.ts __tests__/close_process/step3.spec.ts __tests__/close_process/cleanupActiveStaysOnClose.spec.ts __tests__/helpers/stateDoc/processingLease.spec.ts --runInBand`
