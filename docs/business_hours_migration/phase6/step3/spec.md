# Phase6 Step3 完成版仕様書：閉店・開店ターミナル処理と UI

本ドキュメントは、会話で確定した方針と実コード照合に基づく **完成版仕様書** である。実装は本仕様に従う。コードの変更は行わず、docs への記載のみで確定する。

- **ユーザー決定事項**: 本文中で「**（ユーザー決定）**」と明示する。runId 形式・金額確定案A・巻き戻し方針・lease の transaction・closeRuns の更新責務・forceCleanupApplied 形式・stepName 列挙など。
- **Cursor が実コードを確認して確定した事項**: 本文中で「**（実コード準拠）**」または該当節で根拠ファイルを明示する。巻き戻し対象の列挙・既存 applyCloseSnapshot の「上書きしない」との整合など。

---

## 1. 目的・背景・前提

### 1.1 目的

- 日付ボタン（または開閉店入口）タップで、開店中なら閉店操作、閉店中なら開店操作を実行できるようにする。
- 閉店時は「未会計一覧の取得 → UI 表示 → 確認ボタン → ターミナル一括実行」の流れとし、データ整合性を保つ実行順序と失敗時の扱いを定める。
- closeRuns / openRuns によるログと、processing(lease) による runId 一致・resume 時の同一 runId 継続を仕様として固定する。

### 1.2 Step2 との関係

- **Step2 で実装済み**: `getUnsettledBillsForClose`（未会計 bills 取得・表示用）、`applyCloseSnapshot`（bills への closeSnapshot 付与・users の unsettledBillsCount 更新）、`requireAdmin`、システム設定画面の「未会計billsの移管」UI。
- **Step3 で行うこと**: 閉店本線を **closeStoreTerminal** に集約し、未会計付与（closeRunId 付き）・closeRuns/unsettledBills 記録・reset/cleanup/migrate・finalize を順次実行。開店本線を **openStoreTerminal** に集約。UI は **terminalHome（terminalHomePage）のみ** で完結させる。
- **Step2 手動移管**: lastCloseRunId === `'step2-manual'` の既存 closeSnapshot はそのまま残す。Step3 で埋め直さない。

### 1.3 参照する既存実装（Step3 で変更しないが仕様の根拠とする）

| 種別 | パス | 役割 |
|------|------|------|
| Callable | `functions/src/close_process/getUnsettledBillsForClose.ts` | 当日営業日・status in ['open','in_progress','settling'] の bills を取得。表示用金額は server-side 算出。 |
| Callable | `functions/src/close_process/applyCloseSnapshot.ts` | billIds + amountsByBillId で closeSnapshot 付与。users の unsettledBillsCount を increment。現状 lastCloseRunId は固定 `'step2-manual'`。Step3 で closeRunId を渡せるよう拡張する。 |
| Callable | `functions/src/close_process/requireAdmin.ts` | devices で uid 一致かつ role admin を要求。 |
| Callable | `functions/src/close_process/resetAllSideGames.ts` | onCall のみ。内部ロジックの共通化は Step3 実装タスクに含める。 |
| Callable | `functions/src/close_process/resetAllTables.ts` | onCall のみ。同上。 |
| Callable | `functions/src/close_process/cleanupActiveStaysOnClose.ts` | onCall、管理者チェックあり。同上。 |
| Callable | `functions/src/analytics/migrateSettledBillsForBusinessDay.ts` | 営業日を storeMeta/currentBusinessDay から取得。同上。 |
| State | `functions/src/helpers/stateDoc/types.ts` | CurrentBusinessDayDoc に **processing フィールドは現状ない**。Step3 で追加する。 |
| UI | `lib/Home/terminalHomePage.dart` | AppBar に営業状態表示（StoreMetaService 購読）と「開閉店管理」ボタン。Step3 でダイアログ内容を「現在営業日／閉店中」＋閉店／開店ボタンに変更し、閉店時は getUnsettledBillsForClose → 確認 → closeStoreTerminal に繋ぐ。 |
| 購読 | `lib/services/store_meta_service.dart` | storeMeta/currentBusinessDay を単一ストリームで購読。日付ボタンや他ページへの配信は StoreMetaService.instance.stream を参照。 |

---

## 2. 用語・データモデル

### 2.1 storeMeta/currentBusinessDay

- **パス**: `storeMeta/currentBusinessDay`
- **既存フィールド**: status, currentBusinessDateKey, lastClosedBusinessDateKey, updatedAt, source, lastError（型は `functions/src/helpers/stateDoc/types.ts` 参照）。
- **Step3 で追加するフィールド**: **processing**（lease 管理・runId 一致用）。構造は §6 で定義。

### 2.2 closeRuns / unsettledBills

- **closeRuns**: `storeMeta/closeRuns/{closeRunId}`  
  **closeRunId 形式（ユーザー決定）**: **`close_${businessDate}_${timestamp}`**。表記を統一し、timestamp の実体は **unixMs**（`Date.now()` の値）とする。例: `close_2026-02-09_1739123456789`。businessDate は YYYY-MM-DD。
- **unsettledBills**: `storeMeta/closeRuns/{closeRunId}/unsettledBills/{billId}`  
  bills に closeSnapshot を **実際に付与した** bill のみ作成する。同一 run 内でも already_marked の bill は作成しない。

### 2.3 openRuns

- **パス**: `storeMeta/openRuns/{openRunId}`  
  **openRunId 形式（ユーザー決定）**: **`open_${businessDate}_${timestamp}`**。timestamp の実体は **unixMs**（`Date.now()`）。開店した営業日と unixMs で一意化する。

### 2.4 bills.closeSnapshot

- Step2: lastCloseRunId は `'step2-manual'`。
- Step3 閉店本線: lastCloseRunId に **今回の closeRunId** を付与する（applyCloseSnapshot の拡張で closeRunId を渡す）。

### 2.5 runId / timestamp 形式（ユーザー決定 + 表記統一）

- **runId フォーマット**: `close_${businessDate}_${timestamp}` / `open_${businessDate}_${timestamp}`。**timestamp の実体は unixMs（Date.now()）**。仕様書全体で表記ぶれがないよう統一する。
- **closeRunId**: `close_${businessDate}_${unixMs}`（unixMs は数値を文字列化）
- **openRunId**: `open_${businessDate}_${unixMs}`
- **attemptId**（steps/attempts 用）: **`attempt_${unixMs}`**。同一 step の複数試行を区別する。

### 2.6 processing 関連の用語定義（ユーザー決定）

- **通常実行**: UI の「閉店開始／開店開始」押下で、新規 run を開始する操作。runId を渡さない。
- **resume**: 失敗後に同一 runId を継続して再実行する操作。開始ステップは lastCompletedStep の次。Callable に **runId を渡して** 呼ぶ。
- **stale takeover**: leaseExpiresAt を過ぎた processing を回収し、**新 runId** で開始する操作。旧 run は status='stale' で記録する。

---

## 3. UI 仕様（terminalHome のみ）

### 3.1 責務と実装箇所

- Step3 で閉店・開店処理を可能にする UI は **terminalHome（`lib/Home/terminalHomePage.dart`）だけでよい**。
- 日付ボタン Widget は storeMeta を **StoreMetaService.instance.stream** で購読している想定（現状は AppBar の `_buildStoreStatusAction` が同ストリームを参照）。Step3 では「開閉店管理」ボタン、または営業日／閉店中表示部分のタップでダイアログを開く形にし、**同一ファイル内で完結**させる。

### 3.2 開店中の場合

1. 入口（例: 開閉店管理アイコンボタン、または日付表示タップ）でダイアログを表示する。
2. **現在の営業日**（storeMeta/currentBusinessDay.currentBusinessDateKey）を表示する。
3. 「閉店処理を開始する」ボタンを設置する。
4. ユーザーが押下 → まず **getUnsettledBillsForClose** を呼ぶ（ロックは取らない）。結果をダイアログ内に表示し、「確認」ボタンを出す。
5. 「確認」押下 → **closeStoreTerminal** Callable を呼ぶ。完了後、§4 の結果表示ルールに従いダイアログで表示する。

### 3.3 閉店中の場合

1. 同一入口でダイアログを表示する。
2. 「閉店中」と表示する。
3. 「開店処理を開始する」ボタンを設置する。
4. ユーザーが押下 → **openStoreTerminal** Callable を呼ぶ。完了後、「何日（businessDate 基準）の営業を開始しました」と表示する。

### 3.4 UI とターミナルのズレ

- UI 表示〜確認の間に未会計が増減するズレは **許容** する。ターミナル実行時点で再取得して処理し、結果表示もターミナル実行時点で統一する。

---

## 4. 閉店ターミナル（closeStoreTerminal）仕様

### 4.1 入口条件・権限

- 認証済みであること。**requireAdmin** と同様に devices で uid 一致かつ role admin を要求する。権限不足の場合は **permission-denied** を返す（実装は `functions/src/close_process/requireAdmin.ts` 準拠）。
- storeMeta/currentBusinessDay が存在し、status が **running** かつ currentBusinessDateKey が null でないこと（閉店可能状態）。これらは **processing 獲得の前**にチェックし、不成立の場合は **invalid-argument** を返す。**failed-precondition は使わない**（UI のロック判定が壊れるため）。

### 4.2 processing(lease) ロックと runId（ユーザー決定）

- **processing.runId と closeRuns の docId（closeRunId）を一致させる**。closeRunId を先に生成し（通常実行または stale takeover）、その値を processing.runId に書き、closeRuns の docId にその closeRunId を使う。resume の場合は **Callable が受け取った runId** をそのまま使用する。
- **失敗→再開(resume) は同一 closeRunId を継続利用する**。再実行で新 run を切らない。**例外: stale takeover 時のみ新 runId を発行**する（§7.6）。
- **UI は手動実行のみ**。ロック中は「実行できない」を明確に返す。再開は別導線（別ボタン／別操作）で実行し、その際 **closeStoreTerminal に runId を渡す**。受け取り形式（例: request.data.runId）は実装時に確定するが、**resume 時に runId を受け取れることは仕様として固定**する。
- **processing の獲得**は transaction で storeMeta/currentBusinessDay を読んで分岐する。判定ルールは §6.5 に記載（close/open 共通）。**failed-precondition は「processing ロック（有効 lease）で取得できない場合」専用**とする。ロック以外の前提不成立には failed-precondition を使ってはいけない（ユーザー決定）。
- **エラーコードの分類（ユーザー決定）**:
  - **failed-precondition**: processing が有効（now <= leaseExpiresAt）で、かつ runId なし／runId 不一致により開始できない場合のみ。UI はこの code のみで「ロック中」と判別する。
  - **invalid-argument**: 呼び出し条件が満たされない場合（status != running／closed、currentBusinessDateKey が null／不正、必要なフィールド欠損、runId 形式不正など）。ロック以外はこちらを使う。
  - **permission-denied**: 権限不足（requireAdmin 失敗）。
  - **aborted**: トランザクション競合など「再試行で解決し得る」系（必要に応じて）。
- **UI の判別ルール**: **code === 'failed-precondition' → ロック中**。それ以外 → ロック以外の理由として表示する。message の文字列（contains）には依存しない。
- 推奨 message 例（failed-precondition 時）: 「閉店処理が他の操作で実行中です。完了するまでお待ちください。」（閉店時）/「開店処理が実行中です。完了するまでお待ちください。」（開店時）。実装時に文言を確定する。

### 4.3 ステップ定義（順序厳守）

| 順番 | ステップ名 | 内容 |
|------|------------|------|
| 1 | UNSETTLED_MARK | 未会計 bills の再取得（getUnsettledBillsForClose と同条件）→ ターミナル側で **computeDisplayAmount** を行い **displayAmountAtMark** をターミナル実行時点の確定値として保存。closeRunId を渡して applyCloseSnapshotCore 相当を実行。**実際に付与した** bill のみ closeRuns の unsettledCount を加算し、unsettledBills にドキュメント作成。Step2 の amountsByBillId（クライアント供給）は **Step3 では使用しない**（ユーザー決定: 案A）。 |
| 2 | resetSideGames | resetAllSideGames のロジックを実行（共通関数化して呼ぶ）。 |
| 3 | resetTables | resetAllTables のロジックを実行（同上）。 |
| 4 | cleanupActiveStays | cleanupActiveStaysOnClose のロジックを実行（同上）。 |
| 5 | migrateMissedSettlements | migrateSettledBillsForBusinessDay のロジックを実行（同上）。営業日は storeMeta の currentBusinessDateKey を参照。 |
| 6 | finalizeCloseStateDoc | status='closed', currentBusinessDateKey=null, lastClosedBusinessDateKey=閉店した営業日に更新。 |

※ 上記ステップ名は §7.1 の stepName 一覧と完全一致させる（文字列固定）。

- ターミナル内での「未会計再取得」は、UI で getUnsettledBillsForClose を呼んでいることをコメントで明記する。再取得は closeSnapshot 付与・closeRuns 記録用である。
- **UNSETTLED_MARK の金額確定（ユーザー決定: 案A）**: ターミナル側で **computeDisplayAmount** を実行し、**displayAmountAtMark** をターミナル実行時点の確定値として bills に保存する。Step2 手動では amountsByBillId（クライアント供給）をそのまま利用するが、Step3 では使用しない。理由を仕様として明記する: **改ざん回避**（クライアント渡しを信頼しない）、**ターミナル実行時点で金額を統一**、**UI 表示〜確認のズレは許容**する方針との整合。

### 4.4 失敗時挙動

- **UNSETTLED_MARK が失敗した場合**: このステップで行った更新を **厳密に巻き戻す**。巻き戻し対象は §4.5 のとおり。
- **UNSETTLED_MARK 成功後のステップで失敗した場合**: 厳密な全巻き戻しは行わない。**中断し、UI で操作を促した上で再実行（resume）** する。再実行では「失敗したステップ以降」を実行する（UNSETTLED_MARK のみ例外で、失敗時は巻き戻しのうえ再実行）。
- storeMeta / closeRuns から「どのステップで失敗したか」を判別可能にする（lastCompletedStep / failedStep / lastErrorSummary 等）。

### 4.5 UNSETTLED_MARK 巻き戻し対象と失敗時手順（3-A〜3-D）

#### 3-A. 巻き戻し対象の確定（ユーザー決定 + 実コード準拠）

- **巻き戻し対象** = 「当該 run の UNSETTLED_MARK で **txn.update を実行した**更新の集合」。
- **writtenBillIds** = 当該 run の UNSETTLED_MARK 内で **txn.update を実行した billId の集合**。巻き戻しは **writtenBillIds のみ**を対象とする。
- 当該 run で closeSnapshot を write した bill（＝ writtenBillIds に含まれる bill）は、**closeSnapshot を必ず削除**する。ユーザー要件「上書きした snapshot も必ず消す」は、もし invalid shape を update で正常化する実装にした場合はその billId も writtenBillIds に入るため削除され満たされる。現行実装では invalid shape は **skip** のため上書きは発生しない（§4.5 3-D）。

#### 3-C. 「当該 run で write した billId 集合」の取り方（確定・実コード準拠）

- UNSETTLED_MARK 内で **txn.update を実行した billId の集合（writtenBillIds）を必ず保持**する。applyCloseSnapshot（Core）の戻り値「実際に付与した billId のリスト」がこれに相当する。
- 巻き戻しは **writtenBillIds に対してのみ** closeSnapshot delete を行う。既存 closeSnapshot を持つ他 bill（already_marked / invalid_closeSnapshot_shape でスキップした bill）には触らない。
- 巻き戻し開始前に、attempt.summaryCounts へ **writtenCount**（writtenBillIds の件数）を書けるなら書く（推奨。必須ではない）。

#### 3-B. UNSETTLED_MARK 失敗時の巻き戻し手順（順序固定・§7.4 2-D-4 と整合）

**「巻き戻しよりも先に attempt.failed を確実に残す」ことを守る。** 順序は以下で固定する。

1. **attempt を最優先で更新**: **result=failed**, **completedAt**, **error**（短文）。必要なら summaryCounts に **writtenCount** を書く（推奨）。
2. **親 run doc** を **status=failed**, **failedStep**, **lastErrorSummary**, **lastCompletedStep** で更新する。
3. **巻き戻し**を実行する: bills の closeSnapshot を FieldValue.delete（updatedAt は serverTimestamp）、users を同数 decrement、unsettledBills 当該 run 作成分を削除。
4. **巻き戻し結果を attempt に記録**する。summaryCounts に **rollbackResult**: 'success' | 'failed'、巻き戻し失敗時は **rollbackErrorSummary**（短文）。二段失敗でも attempt に rollback 失敗要約が残ることを仕様で要求する。
5. **processing を解放**する（transaction）。
6. UI に **再開（resume）を促す**。次回は同一 runId で再開する。

#### 3-D. 根拠（実コード準拠）

- **ファイル**: `functions/src/close_process/applyCloseSnapshot.ts`（行番号は現行版に基づく）

**closeSnapshot の有無・形による扱い（実コードと完全一致で仕様固定）**:

1. **closeSnapshot が無い**（null または typeof !== 'object'）  
   → 上記以外の条件を満たせば **txn.update を実行**する（116–125 行）。writtenBillIds に含まれる。

2. **closeSnapshot が妥当形（valid shape）**  
   → **isCloseSnapshotValidShape**(existingCloseSnapshot) が true の場合（21–26 行: `unresolved === true` または `lastCloseRunId` が非空文字列）。**skip**。reason = **already_marked**（107–108 行）。上書き write は行わない。writtenBillIds に含まれない。

3. **closeSnapshot が壊れた形（invalid shape）**  
   → existingCloseSnapshot が object だが **isCloseSnapshotValidShape** が false の場合。**skip**。reason = **invalid_closeSnapshot_shape**（109–110 行）。**update は実行せず、上書きしない**。writtenBillIds に含まれない。  
   （コメント 20 行目: 「壊れた値は上書きせず invalid_closeSnapshot_shape でスキップする」）

4. **その他の skip 理由**: not_found（90–91）, businessDate_mismatch（100–101）, status_mismatch（103–104）, missing_user_id（112–113）。いずれも txn.update は実行されない。

**結論**: **writtenBillIds** = 当該 run で txn.update を実行した billId の集合。巻き戻し対象は writtenBillIds のみ。invalid_closeSnapshot_shape は **skip** のため、現行実装では「上書きした snapshot」は発生せず、writtenBillIds と巻き戻し対象は一致する。

### 4.6 再実行(resume) の条件と開始位置（§7.5 と整合）

- **同一 closeRunId を継続利用する**。processing.runId と closeRuns の docId を一致させたまま、resume 時は新 run を切らない。
- **開始位置**: **lastCompletedStep の次** から実行する。UNSETTLED_MARK が失敗した場合は、巻き戻し完了後に **UNSETTLED_MARK から再実行**する。
- **stale takeover 時のみ** 新 runId を発行する。古い run は status=stale と staleAt で記録する（§7.6）。

### 4.7 closeRuns の記録・unsettledBills 作成ルール（§7.4 と整合）

- **run 開始時**: closeRuns 親 doc を **status=running** で upsert する。startedAt は初回のみ設定。unsettledCount は 0 または未設定でよい。
- **UNSETTLED_MARK 完了時**: **unsettledCount** を実際に付与した件数で **update** する。lastCompletedStep を更新し、processing を延長する（§7.4 2-D-3）。
- **失敗時**: closeRuns 親 doc は**削除せず残す**。**status=failed**, **failedStep**, **lastErrorSummary**, **lastCompletedStep** を設定する（§7.4 2-D-4）。
- unsettledCount と unsettledBills サブコレクションは、**bills に closeSnapshot を実際に付与できたものだけ** 加算・作成する。already_marked 等でスキップした bill は含めない。同一営業日に複数回閉店が走っても、1 bill につき 1 closeRun で 1 回だけカウント・1 ドキュメントとする。

### 4.8 閉店処理完了後のダイアログ表示

- applyCloseSnapshot 相当: 対象 0 件／未会計として登録済みのみ／誰を未会計として登録したか（pokerName 等）。
- cleanupActiveStays: isActive が true だったのに削除したドキュメントがあれば表示、なければ「対象なし」。
- migrateMissedSettlements: 移管対象になった bill の pokerName があれば表示、なければ「対象なし」。
- storeMeta の更新内容の要約を表示する。

---

## 5. 開店ターミナル（openStoreTerminal）仕様

### 5.1 ロック・前提チェック（§4.2・§6 と整合）

- 認証・requireAdmin と同様の権限チェック。権限不足は **permission-denied**。前提不成立（status が closed でない、前回閉店未完了等）は **invalid-argument** とし、**failed-precondition は使わない**（§4.2 のエラーコード分類に同じ）。
- **前回の閉店処理が正常に完了しているか** を storeMeta のみで判定する（status が closed 等）。必要に応じて lastClosedBusinessDateKey と整合を確認する。これらは processing 獲得の前にチェックする。
- **processing(lease) の獲得**は §6.5 の判定ルールに従う（transaction で read → 分岐）。**openRunId** は通常実行で新規生成、resume では **Callable が受け取った runId** をそのまま使用。**processing.runId と openRuns の docId を一致させる**。**resume 時に runId を受け取れることは仕様として固定**（受け取り形式は実装時に確定）。
- ロック取得失敗時（§6.5 の 2-1／2-3 に該当）は openStoreTerminal が **必ず** `HttpsError(code='failed-precondition', <message>)` を返す。UI は **code === 'failed-precondition'** のみで「ロック中」と判別し、それ以外はロック以外の理由として表示する。

### 5.2 ステップ

- verifyPreconditions → forceCleanup（必要に応じて）→ finalizeOpenStateDoc。進捗は openProgress で管理する。
- 処理完了後、ダイアログで「何日（businessDate 基準）の営業を開始しました」と表示する。

### 5.3 openRuns ログ・forceCleanupApplied（ユーザー決定: 形式確定）

- 最小コストとする。**action + count 形式** を採用する。
- **forceCleanupApplied** のフィールド形を仕様で確定する（過剰にネストしない）:
  - **forceCleanupApplied.counts**: `{ [collectionName: string]: number }`。コレクション名 → 件数（強制書き換えしたドキュメント数）。
  - **forceCleanupApplied.summaries**: `{ [collectionName: string]: string }`。コレクション名 → 1 行程度の短いサマリ文字列。
- 例: `counts: { "activeStays": 3 }`, `summaries: { "activeStays": "isActive=true のまま残っていた 3 件を削除" }`。names は読みやすくする。

---

## 6. processing(lease) の仕様

### 6.1 保存先・フィールド形

- **保存先**: `storeMeta/currentBusinessDay` に **processing** フィールドを追加する（現状は存在しない）。
- **構造（確定）**:
  - `processing.runId`: string。close 時は closeRunId、open 時は openRunId と同一値。
  - `processing.startedAt`: Timestamp。
  - `processing.leaseExpiresAt`: Timestamp。lease の有効期限。
  - `processing.kind`: 'close' | 'open'。閉店処理中か開店処理中か。

### 6.2 獲得・延長・解放はすべて transaction（ユーザー決定）

- **processing の獲得・延長・解放はすべて transaction で行う**。read → 判定 → update を原子で実行する。獲得時・延長時・解放時いずれも、storeMeta/currentBusinessDay を read し、条件を満たす場合のみ update する。
- ロック取得失敗時は closeStoreTerminal / openStoreTerminal が **必ず** `HttpsError(code='failed-precondition', <message>)` を返す。UI は **code === 'failed-precondition'** のみで「ロック中」を判別する（§4.2）。
- **lease 有効期限（ユーザー決定）**: **120 秒**に固定する。**leaseExpiresAt = now + 120 秒**（Timestamp）。獲得時・延長時とも同じ。
- **延長は step 成功時のみ**行う。成功しない限り延長しない。各ステップで attempt に result=success を書いた後、親 doc 更新と同じタイミング帯で lease を延長する（leaseExpiresAt を現在時刻 + 120 秒に更新）。延長も transaction 内で read → 判定（runId 一致・lease 有効）→ update とする。

### 6.3 stale takeover（§7.6 と整合）

- **条件**: **now > processing.leaseExpiresAt**（厳密に >）の場合のみ、stale とみなして **新 runId を発行** し処理を開始する。lease は 120 秒固定のため、開始から 120 秒経過後に期限切れとなる。
- 古い run の親 doc（closeRuns/{runId} または openRuns/{runId}）に **status='stale'** と **staleAt: Timestamp** を必ず残す。attempt は追加しない。
- UI には「前回処理がタイムアウトしたため新しい run で開始しました」旨を表示できるよう、エラーメッセージ方針を実装時に 1 行で確定する。

### 6.4 runId 一致（ユーザー決定）

- **processing.runId と closeRuns/openRuns の docId を常に一致させる**。resume 時は同一 runId を継続利用し、新 run を切らない（stale takeover 時のみ新 runId）。

### 6.5 processing 獲得トランザクションの判定ルール（close / open 共通・ユーザー決定）

**前提**: 入口条件（status、currentBusinessDateKey、権限等）は **transaction の前**にチェックし、不成立なら **invalid-argument** または **permission-denied** を返す。**failed-precondition は本分岐内の「開始不可」の場合のみ**使う（UI のロック判定のため）。

transaction で storeMeta/currentBusinessDay を読み、以下で分岐することを仕様で固定する。

1. **processing が存在しない（null / 未設定）**  
   → 新規獲得OK（通常実行）。processing を設定して開始。

2. **processing が存在し、now <= leaseExpiresAt（有効）**  
   - **2-1** 受け取った runId が無い（通常実行）  
     → 開始不可。返す error code は **failed-precondition** 固定（ロック中）。
   - **2-2** 受け取った runId があり、processing.runId と一致（resume）  
     → 継続OK。**processing.kind** も一致していることを確認し、処理を続行する。不一致なら **invalid-argument** 等で返す（failed-precondition ではない）。
   - **2-3** 受け取った runId があり、processing.runId と不一致  
     → 開始不可。返す error code は **failed-precondition** 固定（別 run が実行中）。

3. **processing が存在し、now > leaseExpiresAt（期限切れ）**  
   → **stale takeover** を許可。旧 run を stale 記録（親 doc に status='stale', staleAt）。**新 runId** で processing を上書きして開始。

---

## 7. ログ仕様（closeRuns / openRuns + steps / attempts）

### 7.1 ログ階層の固定（2-A）

- **closeRuns**: `storeMeta/closeRuns/{runId}/steps/{stepName}/attempts/{attemptId}`（runId は closeRunId の値）
- **openRuns**: `storeMeta/openRuns/{runId}/steps/{stepName}/attempts/{attemptId}`（runId は openRunId の値）
- **attemptId**: **`attempt_${unixMs}`**。unixMs は `Date.now()` の値。
- **stepName**: 仕様で列挙し表記揺れを防ぐ。以下以外は使用しない。
  - **閉店**: `UNSETTLED_MARK`, `resetSideGames`, `resetTables`, `cleanupActiveStays`, `migrateMissedSettlements`, `finalizeCloseStateDoc`
  - **開店**: `verifyPreconditions`, `forceCleanup`, `finalizeOpenStateDoc`

### 7.2 親ドキュメント（closeRuns / openRuns）は最小サマリのみ（2-B）

**親 doc には attempt の詳細（長文 stacktrace・大量配列・個別 billId 列）は入れない**。以下に限定する。

**closeRuns/{runId} のフィールド（最小）**:
- **status**: 'running' | 'completed' | 'failed' | 'stale'
- **closedBusinessDate**: string (YYYY-MM-DD)
- **startedAt**, **completedAt**（completedAt は正常完了時のみ）
- **lastCompletedStep**: stepName または null
- **failedStep**: stepName または null
- **lastErrorSummary**: 短文（詳細は attempt に）
- **unsettledCount**: number（UNSETTLED_MARK で実際に付与した件数のみ）
- **staleAt**: Timestamp（stale takeover 時のみ）

**openRuns/{runId} のフィールド（最小）**:
- **status**, **openedBusinessDate**, **startedAt**, **completedAt**
- **lastCompletedStep**, **failedStep**, **lastErrorSummary**
- **forceCleanupApplied**: counts + summaries のみ（§5.3）。巨大化禁止。
- **staleAt**: stale takeover 時のみ

### 7.3 attempts ドキュメントの最小スキーマ（2-C）

**attempts/{attemptId} のフィールド（固定）**:
- **attemptId**, **startedAt**, **completedAt**
- **result**: 'success' | 'failed'
- **error**: { code: string, message: string }（短い）
- **summaryCounts**: { updated?: number, skipped?: number, deleted?: number, incrementedUsers?: number, **writtenCount?**: number, **rollbackResult?**: 'success' | 'failed', **rollbackErrorSummary?**: string, ... }（数値・短文のみ・小さく）
- **note?**: string（最大 1 行、任意）

**ルール**: billId 配列や巨大 payload は入れない。必要なら別サブコレに逃がす（Step3 ではそのサブコレは作らない）。親 doc に stacktrace や大量配列を入れない。attempt.note は 1 行、error.message も短い。巻き戻し結果は短文＋フラグ程度に留める。

### 7.4 いつ何を書くか（2-D：漏れ・二重を防ぐ）

#### 2-D-1. run 開始時（close / open 共通）

- 入口条件（status、currentBusinessDateKey、権限等）を **先に**チェックする。不成立の場合は **invalid-argument** または **permission-denied** を返し、**failed-precondition は使わない**（§4.2 エラーコード分類）。
- runId を生成する（resume の場合は既存 runId を継続利用）。
- **processing.runId を transaction で獲得**する（§6.5 の判定ルール）。獲得できない場合（ロック中＝2-1、別 run 実行中＝2-3）**のみ** **HttpsError(code='failed-precondition')** で終了。前提不成立による失敗は別 code で既に返している。
- 親 run doc（closeRuns / openRuns）を **status=running** で upsert する。**startedAt は初回のみ設定**（既存があれば維持）。resume の場合は status を running に戻す（または running のまま）。

#### 2-D-2. step 開始時（各 step 共通・最初の副作用）

- **各 step 開始時に、必ず最初の書き込みとして** `steps/{stepName}/attempts/{attemptId}` を作成し、**startedAt** を記録する。これがその step の最初の副作用とする。
- これにより、後続で本処理や catch 内で例外が起きても「attempt が存在しない」状態を避け、attempt が必ず残るようにする。

#### 2-D-3. step 成功時

- attempt に **completedAt** と **result=success** を書く。
- 親 run doc の **lastCompletedStep** を stepName に更新する。
- **processing.leaseExpiresAt** を延長する（transaction）。
- 該当 step のみ、親の集計値を update する（例: UNSETTLED_MARK 後の unsettledCount）。

#### 2-D-4. step 失敗時の記録順序（漏れ・二段失敗対策）

catch 発生時は **次の順序で必ず実行**する。どれが失敗しても可能な範囲でログが残るようにする。

1. **attempt を最優先で更新**: **result=failed**, **completedAt**, **error**（code, message は短文）を書く。**巻き戻しよりも先に attempt.failed を確実に残す**ことを仕様として固定する。
2. **親 run doc** を **status=failed**, **failedStep=stepName**, **lastErrorSummary**, **lastCompletedStep** で更新する。
3. 必要なら **巻き戻し** を実行する（UNSETTLED_MARK のみ。§4.5 の手順）。
4. 巻き戻しを実行した場合、その結果を attempt に短く記録する。**summaryCounts** に **rollbackResult**: 'success' | 'failed'、失敗時は **rollbackErrorSummary**（短文）を書く。**二段失敗（巻き戻し自体が失敗）でも、attempt に rollback 失敗の要約が残る**ことを仕様で要求する。
5. **processing を解放**する（transaction）。resume 導線がある前提で「再開可能」状態にする。
6. 以降のステップは実行しない（中断）。

#### 2-D-5. run 完了時

- 親 run doc を **status=completed**、**completedAt** を設定する。
- **processing を解放**する（transaction）。

### 7.5 resume の開始位置（2-E）

- resume は **同一 runId** を継続利用する。
- 開始ステップは **lastCompletedStep の次** から実行する。
- **UNSETTLED_MARK が failed の場合は**、巻き戻し完了後に **UNSETTLED_MARK から再実行**する（§4.5・§4.6 と整合）。

### 7.6 stale takeover 時のログ（2-F）

- **条件**: **now > processing.leaseExpiresAt**（厳密に >）のみ。lease は 120 秒固定（§6.2）。
- **新 runId** を発行して処理を開始する。
- **旧 run の親 doc** に **status='stale'** と **staleAt** を必ず残す。attempt は追加しない。
- UI には「前回処理がタイムアウトしたため新しい run で開始しました」旨を表示できるよう、error message 方針を実装時に 1 行で確定する。

### 7.7 重複せず漏れもしないこと

- 親は最小サマリ、詳細は attempt に集約する。
- 同一 runId 継続により、resume でログが断片化しない。
- stale takeover のみ新 run とし、旧 run は status=stale と staleAt で記録する。

---

## 8. applyCloseSnapshot の責務分離（Step2 手動 vs Step3 ターミナル）

- **Step2 手動（既存通り）**: 既存 **applyCloseSnapshot** Callable は、**billIds + amountsByBillId**（クライアント供給）を受け取り、lastCloseRunId は **`'step2-manual'`** 固定。bills と users の更新のみ行い、**closeRuns / unsettledBills には一切書き込まない**。既存のまま維持する。
- **Step3 ターミナル**: **applyCloseSnapshotCore**（または同等の内部関数）を切り出し、以下を満たす。
  - 引数で **closeRunId**（任意）と **金額** を渡す。Step3 ではクライアントの amountsByBillId は使わず、**ターミナル側で computeDisplayAmount を実行した結果を displayAmountAtMark として渡す**（案A）。
  - 未指定時は closeRunId に `'step2-manual'` を使用（Callable から呼ぶ場合）。
  - Core の責務: **bills への closeSnapshot 付与** と **users の unsettledBillsCount increment** のみ。戻り値で「実際に付与した billId のリスト」を返す。
  - **closeRuns の unsettledCount 更新** と **unsettledBills サブコレクションの作成** は **ターミナル側** が行う（core は書かない）。これにより「Step2 手動は既存通り」「Step3 は core を呼び、closeRuns/unsettledBills はターミナルが書く」という責務分離を明確にする。

---

## 9. テスト観点

- **静的**: TypeScript のビルドが通ること。Lint エラーがないこと。
- **grep 確認**: processing.runId と closeRuns/openRuns の docId が一致して参照されていること。UNSETTLED_MARK 巻き戻し対象が仕様どおり列挙されていること。
- **結合**: 閉店ターミナルを 1 run で完了した場合に closeRuns/unsettledBills が期待どおり作成されること。resume で同一 runId が再利用されること。stale takeover 時のみ新 runId が発行されること。
- **UI**: terminalHome から閉店・開店ダイアログが開き、閉店時は getUnsettledBillsForClose → 確認 → closeStoreTerminal の順で呼ばれること。完了ダイアログの表示内容が仕様どおりであること。

---

## 10. 作成・更新するファイル（Step3 実装タスクでの対象）

### 新規作成

- `functions/src/storeManagement/closeStoreTerminal.ts`（閉店ターミナル Callable）
- `functions/src/storeManagement/openStoreTerminal.ts`（開店ターミナル Callable）
- processing(lease) の獲得・解放ヘルパ（既存モジュールに追加するか新規ファイルかは実装時に決定）
- applyCloseSnapshot の core 関数（`applyCloseSnapshot.ts` 内に切り出すか別ファイルかは実装時に決定）
- reset/cleanup/migrate の共通化（各 Callable から呼ぶ core を切り出し、ターミナルからも呼ぶ）

### 更新

- `functions/src/close_process/applyCloseSnapshot.ts`: closeRunId をオプションで受け取り、lastCloseRunId に反映。core 化。
- `functions/src/helpers/stateDoc/types.ts`: CurrentBusinessDayDoc に **processing** フィールドの型を追加。
- `lib/Home/terminalHomePage.dart`: 開閉店ダイアログの内容を仕様どおりに変更（現在営業日／閉店中表示、閉店時は getUnsettledBillsForClose → 確認 → closeStoreTerminal、完了ダイアログ）。

### 参照のみ（変更しない）

- getUnsettledBillsForClose、requireAdmin、migrateSettledBillsForBusinessDay（ロジックは共通化の対象）、closeStore/openStore（state 更新のみの既存 Callable は残置可）。

---

## 11. 未確定事項（要ユーザー判断）

- **lease 有効期限**: **120 秒**に確定済み（§6.2）。未確定ではない。
- **reset/cleanup/migrate の共通関数化**: 既存は onCall のみのため、Step3 実装タスクで「core 化してターミナルから直接呼ぶ」形に含める。ファイル名・配置は実装時に決定する。

---

以上を Phase6 Step3 の完成版仕様書とする。**ユーザー決定事項**は「（ユーザー決定）」で明示、**Cursor が実コードを確認して確定した事項**は「（実コード準拠）」または根拠ファイルを明示、未確定は §11 に限る。

---

## 差分サマリ（何をどう明文化したか）

- **(1) processing ロックの取得条件**: §2.6 に用語定義（通常実行 / resume / stale takeover）を追加。§4.2・§5.1 で「resume 時に runId を受け取れること」を仕様で固定。§6.5 を新設し、獲得トランザクションの分岐ルール（processing なし→新規OK、有効かつ runId なし→失敗、有効かつ runId 一致→resume OK、有効かつ runId 不一致→失敗、期限切れ→stale takeover）を明文化。UI のロック判定は **code === 'failed-precondition'** のみで行うことを全節で統一。
- **(1) エラーコードの分類**: **failed-precondition は「processing ロック（有効 lease）で取得できない場合」専用**とし、ロック以外の前提不成立（status 不一致、currentBusinessDateKey null 等）には **failed-precondition を使わない**ことを §4.1・§4.2・§5.1・§6.5・§7.4 2-D-1 に明文化。ロック以外は **invalid-argument**（呼び出し条件不備）／**permission-denied**（権限）／**aborted**（再試行可）を使う。UI は code === 'failed-precondition' → ロック中、それ以外 → ロック以外の理由で表示。
- **(2) attempts ログが必ず残るための順序**: §7.4 2-D-2 で「step 開始時の最初の副作用として attempt を作成し startedAt を書く」ことを固定。2-D-4 で step 失敗時の記録順序を固定（1. attempt を最優先で failed 記録、2. 親 doc 更新、3. 巻き戻し、4. 巻き戻し結果を attempt に rollbackResult/rollbackErrorSummary で記録、5. processing 解放）。二段失敗時も attempt に rollback 失敗要約が残ることを要求。§7.3 に summaryCounts の rollbackResult/rollbackErrorSummary/writtenCount を追加。§4.5 3-B を上記順序に合わせて並べ替え、3-C に writtenCount 推奨を追記。
- **(2) applyCloseSnapshot の skip/update 条件（実コード準拠）**: §4.5 3-D を `functions/src/close_process/applyCloseSnapshot.ts` に完全一致させて修正。closeSnapshot が無い→update、妥当形（isCloseSnapshotValidShape true）→skip（already_marked）、**壊れた形（invalid shape）→skip（invalid_closeSnapshot_shape）。上書きしない**。writtenBillIds＝当該 run で txn.update を実行した billId の集合、巻き戻し対象は writtenBillIds のみ。3-A/3-C で writtenBillIds 定義を実コードと一致させ、「上書きした snapshot も消す」は現行は skip のため上書きなし、将来 update で正常化するなら writtenBillIds に入るので削除されると補足。
- **(3) lease 秒数の確定**: lease 有効期限を **120 秒**に固定（§6.2）。**leaseExpiresAt = now + 120 秒**、**延長は step 成功時のみ**（成功しない限り延長しない）を明記。stale takeover 条件は **now > leaseExpiresAt**（厳密に >）で統一（§6.3・§7.6）。§11 で 120 秒確定済みを維持。
