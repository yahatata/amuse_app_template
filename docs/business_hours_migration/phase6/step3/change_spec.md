# Phase6 Step3: 閉店・開店ターミナル処理と UI — ChangeSpec

本ドキュメントは **Phase6 Step3 完成版仕様書**（`spec.md`）と **実コードの確認** に基づく **変更仕様書（ChangeSpec）** である。実装時に「何をどこに追加・変更するか」を一意に特定できるようにする。

---

## 1. 目的・背景

### 1.1 目的

- 日付ボタン（または開閉店入口）タップで、**開店中なら閉店操作**、**閉店中なら開店操作**を実行できるようにする。
- 閉店時は「未会計一覧の取得 → UI 表示 → 確認ボタン → **閉店ターミナル一括実行**」の流れとし、データ整合性を保つ実行順序と失敗時の扱いを定める。
- **closeRuns / openRuns** によるログと、**processing(lease)** による runId 一致・resume 時の同一 runId 継続を仕様として実装する。

### 1.2 背景（現状・実コード確認に基づく）

- **Step2 で実装済み**（仕様書 §1.2・実コードで確認）:
  - **getUnsettledBillsForClose**（`functions/src/close_process/getUnsettledBillsForClose.ts`）: 当日営業日・`status in ['open','in_progress','settling']` の bills を取得。表示用金額は **computeDisplayAmount** で server-side 算出。返却は `{ success, data, returnedCount, truncated }`。権限は requireAdmin。
  - **applyCloseSnapshot**（`functions/src/close_process/applyCloseSnapshot.ts`）: billIds + amountsByBillId で closeSnapshot 付与。lastCloseRunId は **`'step2-manual'`** 固定（LAST_CLOSE_RUN_ID_STEP2）。already_marked / invalid_closeSnapshot_shape は **skip**（上書きしない）。users の unsettledBillsCount を increment。closeRuns / unsettledBills には一切書かない。
  - **requireAdmin**（`functions/src/close_process/requireAdmin.ts`）: devices で uid 一致かつ role admin。失敗時は **permission-denied**。
  - システム設定画面の「未会計billsの移管」UI（Step2 手動用）はそのまま残す。
- **storeMeta/currentBusinessDay**（`functions/src/helpers/stateDoc/types.ts`）: 現状 **processing フィールドは存在しない**。status, currentBusinessDateKey, lastClosedBusinessDateKey, updatedAt, source, lastError のみ。
- **terminalHomePage**（`lib/Home/terminalHomePage.dart`）: 「開閉店管理」ボタンでダイアログを表示。現状は「開店または閉店を実行しますか？」＋ **初期化 / 開店 / 閉店** の 3 ボタン。開店は **openStore**、閉店は **closeStore** を直接呼んでいる。**getUnsettledBillsForClose は呼んでいない**。営業状態は **StoreMetaService.instance.stream** で購読（`_buildStoreStatusAction` 等）。
- **reset/cleanup/migrate**: `resetAllSideGames`、`resetAllTables`、`cleanupActiveStaysOnClose`（close_process）、`migrateSettledBillsForBusinessDay`（analytics）は **onCall のみ**で、閉店本線には組み込まれていない。

### 1.3 Step3 で実現すること（仕様書との対応）

- 閉店本線を **closeStoreTerminal** に集約。未会計付与（closeRunId 付き）・closeRuns/unsettledBills 記録・reset/cleanup/migrate・finalize を順次実行。
- 開店本線を **openStoreTerminal** に集約。
- UI は **terminalHome のみ**で完結。閉店時は getUnsettledBillsForClose → 確認 → closeStoreTerminal。開店時は openStoreTerminal。**resume 時は runId を渡して** 再実行できる導線を用意する。
- processing(lease) で **通常実行 / resume / stale takeover** を分岐。**failed-precondition はロック取得失敗専用**とし、前提不成立は **invalid-argument** 等で返す。
- UNSETTLED_MARK 失敗時は **writtenBillIds のみ**を巻き戻し。attempt を最優先で記録した上で巻き戻し・processing 解放。

---

## 2. スコープ（Step3 でやる／やらない）

### 2.1 Step3 でやること

- **新規 Callable**: closeStoreTerminal、openStoreTerminal（配置は仕様書 §10 のとおり案: `functions/src/storeManagement/`。実装時に確定）。
- **processing(lease)** の追加: storeMeta/currentBusinessDay に processing フィールド。獲得・延長・解放は **すべて transaction**。lease = **120 秒**固定。§6.5 の分岐（通常実行 / resume / stale takeover）を実装。
- **closeRuns / openRuns** の作成と steps/attempts ログ。親 doc は最小サマリのみ。attempt は step 開始時に必ず作成し startedAt を書く。失敗時は attempt 更新 → 親更新 → 巻き戻し（UNSETTLED_MARK のみ）→ attempt に rollback 結果 → processing 解放の順序を守る。
- **applyCloseSnapshot の core 化**: closeRunId をオプションで受け取り、lastCloseRunId に反映。Core は bills と users の更新のみ。戻り値で「実際に付与した billId のリスト」（writtenBillIds）を返す。closeRuns の unsettledCount と unsettledBills サブコレクションは **ターミナル側**が書く。
- **reset/cleanup/migrate**: 仕様書 §10・§11 のとおり、Step3 実装タスクで共通化（core 化してターミナルからも呼ぶ形）に含める。ファイル名・配置は実装時に決定する。
- **UI**: terminalHome の開閉店ダイアログを仕様どおり変更。開店中は「現在の営業日」表示＋「閉店処理を開始する」→ getUnsettledBillsForClose → 確認 → closeStoreTerminal。閉店中は「開店処理を開始する」→ openStoreTerminal。**code === 'failed-precondition'** のみで「ロック中」と判別。resume は別導線で runId を渡して Callable を呼ぶ。

### 2.2 Step3 でやらないこと

- Step2 手動移管の変更。既存 applyCloseSnapshot Callable は billIds + amountsByBillId のまま維持。lastCloseRunId === `'step2-manual'` の既存 closeSnapshot はそのまま残し、Step3 で埋め直さない。
- システム設定画面の「未会計billsの移管」UI の削除や統合（Step2 のまま残す）。
- getUnsettledBillsForClose / requireAdmin のシグネチャ破壊変更。参照のみまたは共通化のための内部利用に留める。
- closeStore / openStore（state 更新のみの既存 Callable）の削除。残置可。ターミナルは closeStoreTerminal / openStoreTerminal を呼ぶ。

---

## 3. UI 仕様（terminalHome のみ・実コードとの差分）

### 3.1 配置・責務

- **画面**: `lib/Home/terminalHomePage.dart`。Step3 で閉店・開店を可能にする UI は **このファイル内で完結**する。
- **入口**: 現状の「開閉店管理」ボタン（または営業日／閉店中表示部分のタップ）でダイアログを開く。**StoreMetaService.instance.stream** で storeMeta を購読している想定はそのまま利用する。

### 3.2 開店中の場合（変更）

1. ダイアログで **現在の営業日**（storeMeta/currentBusinessDay.currentBusinessDateKey）を表示する。
2. 「**閉店処理を開始する**」ボタンを設置する。
3. ユーザーが押下 → **getUnsettledBillsForClose** を呼ぶ（ロックは取らない）。結果をダイアログ内に一覧表示し、「**確認**」ボタンを出す。
4. 「確認」押下 → **closeStoreTerminal** Callable を呼ぶ（runId は渡さない＝通常実行）。完了後、仕様書 §4.8 の結果表示ルールに従いダイアログで表示する。

**現状との差分**: 現状は「閉店」ボタンで **closeStore** を直接呼んでいる。Step3 では **getUnsettledBillsForClose → 確認 → closeStoreTerminal** の 3 段階に変更する。

### 3.3 閉店中の場合（変更）

1. ダイアログで「**閉店中**」と表示する。
2. 「**開店処理を開始する**」ボタンを設置する。
3. ユーザーが押下 → **openStoreTerminal** Callable を呼ぶ。完了後、「何日（businessDate 基準）の営業を開始しました」と表示する。

**現状との差分**: 現状は「開店」ボタンで **openStore** を呼んでいる。Step3 では **openStoreTerminal** に切り替える。

### 3.4 エラー表示・ロック判定（仕様書 §4.2・§5.1 準拠）

- **code === 'failed-precondition'** の場合のみ「**ロック中**」（閉店処理／開店処理が他の操作で実行中）と判定し、仕様で定めた message または「しばらく待ってから再度お試しください」等を表示する。**message の文字列 contains には依存しない**。
- それ以外の code（invalid-argument, permission-denied 等）は「ロック以外の理由」として表示する。例: 前提条件不成立、権限不足、パラメータ不正など。

### 3.5 resume 導線

- 閉店処理が失敗した場合、UI で「再開」を促す。再開時は **同一 closeRunId を渡して** closeStoreTerminal を呼ぶ。**resume 時に runId を受け取れることは仕様として固定**する（仕様書 §4.2）。runId の取得元・Callable の受け取り形式（キー名等）は実装時に確定する。
- 開店処理の resume も同様に、**同一 openRunId を渡して** openStoreTerminal を呼ぶ。

### 3.6 その他

- UI 表示〜確認の間に未会計が増減するズレは **許容**する。ターミナル実行時点で再取得して処理し、結果表示もターミナル実行時点で統一する（仕様書 §3.4）。
- 現状の「初期化」ボタンは Step3 スコープ外で残置するか、実装方針に従う。

---

## 4. Functions 仕様（変更・新規の要点）

### 4.1 closeStoreTerminal（新規）

- **責務**: 閉店本線の一括実行。入口条件チェック → processing 獲得（§6.5 の分岐）→ closeRuns 親 doc を status=running で upsert → 各 step を順次実行（UNSETTLED_MARK, resetSideGames, resetTables, cleanupActiveStays, migrateMissedSettlements, finalizeCloseStateDoc）→ 各 step 成功時に attempt 記録・親更新・lease 延長（仕様書 §7.4 2-D-3）。run 完了時は親を status=completed・completedAt とし、processing を解放する（§7.4 2-D-5）。失敗時は §7.4 2-D-4 の順序で attempt → 親 → 巻き戻し（UNSETTLED_MARK のみ）→ attempt に rollback 結果 → processing 解放。
- **入力**: なし（通常実行）、または **runId**（resume 時）。resume 時に runId を受け取れることは仕様として固定。受け取り形式は実装時に確定する。
- **入口条件**: 認証済み。requireAdmin（権限不足は **permission-denied**）。storeMeta/currentBusinessDay が存在し、status が **running** かつ currentBusinessDateKey が null でないこと。不成立は **invalid-argument**（**failed-precondition は使わない**）。
- **processing 獲得**: transaction で §6.5 の分岐。2-1・2-3 の「開始不可」の場合のみ **failed-precondition**。1 は新規獲得、2-2 は resume 継続、3 は **now > leaseExpiresAt**（厳密に >）のとき **stale takeover**（旧 run を stale 記録し新 runId で開始）。
- **UNSETTLED_MARK**: 未会計を再取得（getUnsettledBillsForClose と同条件）。ターミナル側で **computeDisplayAmount** を実行し **displayAmountAtMark** を確定。applyCloseSnapshotCore 相当に closeRunId と金額を渡す。**writtenBillIds** を保持。closeRuns の unsettledCount 更新と unsettledBills 作成はターミナル側で実施。
- **出力**: 成功時は §4.8 の表示用サマリ。失敗時は HttpsError（code は上記分類に従う）。

### 4.2 openStoreTerminal（新規）

- **責務**: 開店本線。入口条件チェック → processing 獲得（§6.5）→ openRuns 親 doc を status=running で upsert → verifyPreconditions → forceCleanup（必要に応じて）→ finalizeOpenStateDoc。step 成功時に attempt 記録・親更新・lease 延長。
- **入力**: なし（通常実行）、または **runId**（resume 時）。
- **入口条件**: 認証済み。requireAdmin。前回閉店が完了していること（status が closed 等）。不成立は **invalid-argument**。ロック取得失敗時のみ **failed-precondition**。

### 4.3 processing(lease) ヘルパ（新規または既存モジュールに追加）

- **獲得・延長・解放はすべて transaction**（仕様書 §6.2）。read → 判定 → update を原子で実行。
- **leaseExpiresAt = now + 120 秒**（120 秒固定）。延長は **step 成功時のみ**（成功しない限り延長しない）。stale takeover の条件は **now > processing.leaseExpiresAt**（厳密に >）のみ（仕様書 §6.3・§7.6）。
- 配置は実装時に決定する。

### 4.4 applyCloseSnapshot の変更（core 化・仕様書 §8）

- **既存 Callable** は Step2 のまま維持。billIds + amountsByBillId、lastCloseRunId = `'step2-manual'`。closeRuns / unsettledBills には書かない。
- **Core 関数**（applyCloseSnapshotCore または同等）を切り出し:
  - 引数: billIds、**closeRunId**（省略時は `'step2-manual'`）、**金額**（ターミナルでは displayAmountAtMark を渡す。クライアントの amountsByBillId は Step3 では使わない）。
  - 責務: bills への closeSnapshot 付与、users の unsettledBillsCount increment のみ。戻り値で「実際に付与した billId のリスト」（writtenBillIds）を返す。
  - closeRuns の unsettledCount と unsettledBills サブコレクションの作成は **呼び出し元（ターミナル）** が行う。
- **実コード準拠**: `functions/src/close_process/applyCloseSnapshot.ts` の isCloseSnapshotValidShape・already_marked・invalid_closeSnapshot_shape は **skip** のまま。Core でも同じ判定を使い、writtenBillIds は txn.update を実行した billId のみとする。

### 4.5 reset/cleanup/migrate（仕様書 §10・§11）

- 仕様書 §10・§11 のとおり、resetAllSideGames・resetAllTables・cleanupActiveStaysOnClose・migrateSettledBillsForBusinessDay の共通化は Step3 実装タスクに含める（各 Callable から呼ぶ core を切り出し、ターミナルからも呼ぶ）。ファイル名・配置は実装時に決定する。

---

## 5. データ仕様（追加・変更）

### 5.1 storeMeta/currentBusinessDay に追加する processing（現状なし）

- **構造**（仕様書 §6.1）:
  - processing.runId: string（closeRunId または openRunId と同一）
  - processing.startedAt: Timestamp
  - processing.leaseExpiresAt: Timestamp（now + 120 秒）
  - processing.kind: 'close' | 'open'
- **型**: `functions/src/helpers/stateDoc/types.ts` の CurrentBusinessDayDoc に **processing** フィールドの型を追加する。

### 5.2 closeRuns / openRuns（新規コレクション・パス）

- **closeRuns**: `storeMeta/closeRuns/{closeRunId}`。closeRunId 形式は `close_${businessDate}_${unixMs}`（仕様書 §2.2・§2.5）。
- **openRuns**: `storeMeta/openRuns/{openRunId}`。openRunId 形式は `open_${businessDate}_${unixMs}`（仕様書 §2.3・§2.5）。
- 親 doc のフィールドは仕様書 §7.2 の最小サマリのみ。**status** は 'running' | 'completed' | 'failed' | 'stale'。attempt の詳細（stacktrace・billId 配列）は入れない。
- **steps/attempts**: `storeMeta/closeRuns/{runId}/steps/{stepName}/attempts/{attemptId}`（runId は closeRunId の値）。openRuns も同様（runId は openRunId の値）。**attemptId** = `attempt_${unixMs}`。**stepName** は仕様書 §7.1 の一覧と完全一致させる。各 step 開始時に、必ず最初の書き込みとして attempt を作成し startedAt を記録する（§7.4 2-D-2）。

### 5.3 unsettledBills（close のみ）

- `storeMeta/closeRuns/{closeRunId}/unsettledBills/{billId}`。bills に closeSnapshot を **実際に付与した** bill のみ作成する。already_marked でスキップした bill は作成しない。

### 5.4 UNSETTLED_MARK 巻き戻し・writtenBillIds

- **writtenBillIds** = 当該 run の UNSETTLED_MARK 内で **txn.update を実行した billId の集合**（仕様書 §4.5 3-A・3-C・3-D）。巻き戻しは writtenBillIds に対してのみ closeSnapshot 削除・users decrement・unsettledBills 削除を行う。実コードの applyCloseSnapshot では invalid_closeSnapshot_shape は **skip** のため、上書きは発生しない。

---

## 6. エラーコードの分類（仕様書 §4.1・§4.2・§5.1・§6.5 と一致）

- **failed-precondition**: **processing ロック（有効 lease）で取得できない場合専用**。processing が存在し now <= leaseExpiresAt で、runId なし（2-1）または runId 不一致（2-3）により開始できないときのみ。UI は **code === 'failed-precondition'** のみで「ロック中」と判別する。message の文字列（contains）には依存しない。
- **invalid-argument**: 呼び出し条件が満たされない場合（status != running/closed、currentBusinessDateKey が null/不正、必要なフィールド欠損、runId 形式不正など）。ロック以外の前提不成立には failed-precondition を使わない。
- **permission-denied**: 権限不足（requireAdmin 失敗）。
- **aborted**: トランザクション競合など「再試行で解決し得る」系（必要に応じて）。

---

## 7. テスト観点（最低限）

- **静的**: TypeScript のビルドが通ること。Lint エラーがないこと。
- **grep 確認**: processing.runId と closeRuns/openRuns の docId が一致して参照されていること。UNSETTLED_MARK 巻き戻し対象が writtenBillIds のみであること。failed-precondition がロック取得失敗時のみ使われていること。
- **結合**: 閉店ターミナルを 1 run で完了した場合に closeRuns / unsettledBills / steps/attempts が期待どおり作成されること。resume で同一 runId が再利用されること。stale takeover 時のみ新 runId が発行されること。UNSETTLED_MARK 失敗時に巻き戻し順序（attempt → 親 → 巻き戻し → attempt に rollback 結果 → processing 解放）が守られていること。
- **UI**: terminalHome から開閉店ダイアログが開き、開店中は getUnsettledBillsForClose → 確認 → closeStoreTerminal の順で呼ばれること。閉店中は openStoreTerminal が呼ばれること。code === 'failed-precondition' のときのみ「ロック中」と表示されること。resume 時に runId を渡して Callable が呼ばれること。

---

## 8. 作成・更新するファイル（実コード確認に基づく）

### 8.1 新規作成

- `functions/src/storeManagement/closeStoreTerminal.ts`（案。実装時に配置を確定）
- `functions/src/storeManagement/openStoreTerminal.ts`（案）
- processing(lease) の獲得・延長・解放ヘルパ（既存モジュールに追加するか新規ファイルかは実装時に決定）
- applyCloseSnapshot の core 関数（`applyCloseSnapshot.ts` 内に切り出すか別ファイルかは実装時に決定）
- reset/cleanup/migrate の共通化（仕様書 §10・§11。各 Callable から呼ぶ core を切り出し、ターミナルからも呼ぶ。ファイル名・配置は実装時に決定）

### 8.2 更新

- `functions/src/close_process/applyCloseSnapshot.ts`: closeRunId をオプションで受け取り、lastCloseRunId に反映。core 化し、Callable は従来どおり Step2 用の入口として維持。
- `functions/src/helpers/stateDoc/types.ts`: CurrentBusinessDayDoc に **processing** フィールドの型を追加。
- `lib/Home/terminalHomePage.dart`: 開閉店ダイアログの内容を仕様どおりに変更（現在営業日／閉店中表示、閉店時は getUnsettledBillsForClose → 確認 → closeStoreTerminal、開店時は openStoreTerminal）。エラーは code === 'failed-precondition' のみでロック中と判別。resume 導線で runId を渡す。

### 8.3 参照のみ（変更しない）

- getUnsettledBillsForClose、requireAdmin、migrateSettledBillsForBusinessDay（ロジックは共通化の対象）。closeStore / openStore は残置可。

---

## 9. 実コード確認サマリ（ChangeSpec 作成時の根拠）

| 対象 | 確認内容 | 結果 |
|------|----------|------|
| getUnsettledBillsForClose.ts | 取得条件・返却形・computeDisplayAmount・requireAdmin | 仕様書と一致。Step3 ではそのまま呼ぶ。 |
| applyCloseSnapshot.ts | lastCloseRunId 固定・already_marked/invalid_closeSnapshot_shape は skip・closeRuns を書かない | 仕様書 §4.5 3-D と一致。Core 化時に closeRunId オプション追加。 |
| requireAdmin.ts | permission-denied を投げる | 仕様書のエラーコード分類と一致。 |
| stateDoc/types.ts | CurrentBusinessDayDoc に processing なし | Step3 で型追加が必要。 |
| terminalHomePage.dart | 開閉店ダイアログ・openStore/closeStore 直接呼び・getUnsettledBillsForClose 未使用 | Step3 で closeStoreTerminal/openStoreTerminal への導線と getUnsettledBillsForClose 組み込みが必要。 |
| resetAllSideGames.ts 等 | onCall のみ・ロジックは関数内に直書き | Step3 で core 切り出しし、ターミナルからも呼ぶ。 |
| migrateSettledBillsForBusinessDay.ts | storeMeta/currentBusinessDay から営業日取得 | 共通化してターミナルから呼ぶ。 |

---

## 10. 完了条件（Definition of Done）

- [ ] closeStoreTerminal / openStoreTerminal が実装され、§6.5 の processing 獲得分岐（通常実行 / resume / stale takeover）が transaction で実装されている。
- [ ] storeMeta/currentBusinessDay に processing が追加され、lease 120 秒・延長は step 成功時のみが実装されている。
- [ ] closeRuns / openRuns と steps/attempts が仕様書 §7 の構造で作成され、step 開始時に必ず attempt を作成し、失敗時は attempt → 親 → 巻き戻し → attempt に rollback 結果 → processing 解放の順序が守られている。
- [ ] applyCloseSnapshot が core 化され、closeRunId オプションと「実際に付与した billId のリスト」の返却が実装されている。closeRuns の unsettledCount と unsettledBills はターミナル側で書いている。
- [ ] UNSETTLED_MARK 失敗時の巻き戻しが writtenBillIds のみを対象に実装されている。
- [ ] エラーコードが仕様どおり（failed-precondition はロック専用、前提不成立は invalid-argument 等）実装されている。
- [ ] terminalHome の開閉店ダイアログが、開店中は getUnsettledBillsForClose → 確認 → closeStoreTerminal、閉店中は openStoreTerminal となり、code === 'failed-precondition' のみでロック中と判別し、resume 時に runId（closeRunId/openRunId）を渡して呼べる（受け取り形式は実装時に確定）。
- [ ] 上記テスト観点を満たしている。

---

以上を Phase6 Step3 の ChangeSpec とする。詳細は **Phase6 Step3 完成版仕様書**（`spec.md`）を参照すること。

---

## 修正サマリ（spec.md との整合で実施した変更）

- **過剰の削り**: reset/cleanup/migrate を「core 化を必須」のように書いていた箇所を、仕様書 §10・§11 の温度感（実装タスクに含める・ファイル名・配置は実装時に決定）に合わせて修正。2.1 と 4.5 で「共通化は実装タスクに含める」とし、受け取り形式は「実装時に確定」に統一。
- **resume 導線（3.5）**: 「受け取り形式は仕様で固定」を削除。**resume 時に runId を受け取れることは仕様として固定**し、runId の取得元・Callable の受け取り形式（キー名等）は実装時に確定する、と spec.md §4.2 に合わせた。closeRunId / openRunId の表記を spec に合わせて明示。
- **closeStoreTerminal（4.1）**: run 完了時の挙動（親を status=completed・completedAt、processing 解放）を仕様書 §7.4 2-D-5 に合わせて追記。stale takeover の条件を **now > leaseExpiresAt（厳密に >）** と明記。
- **processing ヘルパ（4.3）**: stale takeover 条件を **now > processing.leaseExpiresAt（厳密に >）** で統一（仕様書 §6.3・§7.6）。配置は「実装時に決定」に揃えた。
- **closeRuns/openRuns（5.2）**: status の候補を 'running' | 'completed' | 'failed' | 'stale' と明記（§7.2）。steps/attempts の runId が closeRunId / openRunId の値である旨と、step 開始時の最初の副作用（attempt 作成・startedAt）を §7.4 2-D-2 に合わせて追記。
- **エラーコード（6）**: 仕様書 §4.1・§4.2・§5.1・§6.5 と完全一致するよう文言を整理。failed-precondition は「ロック（有効 lease）で取得できない場合専用」、UI は message に依存しない、を明記。
- **作成ファイル（8.1）**: reset/cleanup/migrate を「共通化（…ファイル名・配置は実装時に決定）」とし、仕様書 §10 を超えない表現に変更。
- **完了条件（10）**: resume 時の「runId を渡して呼べる」に「受け取り形式は実装時に確定」を補足。

---

## 実装完了メモ（Step3 終了時）

- 上記完了条件（§10）は実装により満たした。
- **閉店完了時の表示**: 仕様 §4.8 に従い、閉店処理成功時は **ダイアログ** で「未会計付与（applyCloseSnapshot 相当）・cleanupActiveStays・移管（migrateMissedSettlements）・storeMeta」を関数ごとに表示する。`closeStoreTerminal` は成功時に **displaySummary**（unsettledMark, cleanupActiveStays, migrateMissedSettlements, storeMeta）を返し、Flutter の `_showCloseCompletedDialog` で表示する。
- **UI**: 開閉店管理ダイアログから閉店・開店・初期化を呼ぶ際は、ダイアログを閉じたあとも有効な **pageContext** を渡す実装にしてあり、未会計一覧ダイアログが確実に表示される。
- 詳細な変更一覧・テスト観点・テストファイルは **implementation_changes.md** を参照。
