# Phase6 Step3 実装仕様書：閉店・開店ターミナル処理と UI

検討事項の解消および Step2 までの実装に合わせて整理した仕様書です。実装は本仕様書に従って行う。

---

## 1. スコープと前提

- **目的**: 日付ボタンタップで開店中なら閉店操作、閉店中なら開店操作を実行できるようにする。閉店処理は「未会計一覧の確認」を UI で挟み、その後ターミナル側で一連の具体処理を順次実行する。
- **Step2 との関係**: 未会計 bills の取得（`getUnsettledBillsForClose`）・closeSnapshot 付与（`applyCloseSnapshot`）は Step2 で実装済み。Step3 では閉店本線から **closeRunId を渡して** applyCloseSnapshot 相当の処理を行い、`storeMeta/closeRuns` および `unsettledBills` にログを残す。Step2 の手動移管（lastCloseRunId === 'step2-manual'）はそのまま残し、Step3 閉店本線では実 closeRunId を付与する。
- **既存 Callable**: `getUnsettledBillsForClose`（取得のみ）、`applyCloseSnapshot`（billIds + amountsByBillId + 任意で closeRunId）、`resetAllSideGames`、`resetAllTables`、`cleanupActiveStaysOnClose`、`migrateSettledBillsForBusinessDay`（営業日は storeMeta 参照）、`closeStore` / `openStore`（state 更新のみ）は既存のまま利用または拡張する。

---

## 2. UI フロー（共通）

### 2.1 日付ボタンタップ時の振る舞い

1. ユーザーが日付ボタン（またはそれに相当する UI）をタップする。
2. ダイアログを表示する。
   - **開店中（status === 'running'）の場合**
     - 現在の営業日（`storeMeta/currentBusinessDay.currentBusinessDateKey`）を表示する。
     - 「閉店処理を開始する」ボタンを設置する。
   - **閉店中（status === 'closed' 等）の場合**
     - 「閉店中」と表示する。
     - 「開店処理を開始する」ボタンを設置する。
3. 閉店／開店のいずれも、処理完了後は結果をダイアログで表示する（後述）。

**実装場所**: ステップ1で作成した日付ボタンがあるウィジェット、または `lib/Home/terminalHomePage.dart` 等。既存の「開閉店管理」ボタンは本ステップで日付ボタンに統合し、削除する。

---

## 3. 閉店処理フロー

### 3.1 全体の流れ（UI とターミナルの役割分担）

- **UI で確認を挟むため、閉店処理は 2 段階に分かれる。**
  - **第 1 段階（取得と確認）**: 未会計一覧の取得と表示。必要なら **getUnsettledBillsForClose のみ** を UI から呼び出す形に切り出す（下記「3.2 分離方針」参照）。
  - **第 2 段階（本実行）**: ユーザーが「確認」を押したあと、**closeStoreTerminal** Callable を呼び出す。ターミナル側でロック取得～未会計付与～reset～cleanup～migrate～state 更新までを一括実行する。

※ ターミナル関数内だけで「取得 → 確認待ち」は実現できない（Callable は同期的に返るため）。そのため、**未会計の取得・表示だけ UI 経由で行い、確認後にターミナルを呼ぶ**形とする。getUnsettledBillsForClose を切り出して UI から呼ぶ場合は、ターミナル側に「未会計取得は UI 経由のため、本ターミナル内では再取得して closeSnapshot 付与のみ行う」旨をコメントで明記する。

### 3.2 未会計取得の切り出し方針

- **望ましい形**: ターミナル関数に閉店処理をできるだけ寄せる。ただし UI で確認ボタンを挟む都合上、**未会計一覧の取得だけは UI から行う**。
- **実装方針**:
  - UI: 「閉店処理を開始する」押下 → 既存の **getUnsettledBillsForClose** Callable を呼ぶ（ロックは取らない）。返却結果をダイアログに表示し、「確認」ボタンを表示する。
  - ユーザーが「確認」を押下 → **closeStoreTerminal** Callable を呼ぶ。
  - **closeStoreTerminal 内**:
    1. ロック獲得（processing フィールドで lease 管理）。
    2. **未会計 bills の再取得**（getUnsettledBillsForClose と同条件で bills を取得）。※ UI で表示したものと同一営業日なので、同一セットが取得される想定。**必須**: ターミナル関数の先頭または該当ブロックに、次の旨をコメントで明記すること。「未会計一覧の取得は UI で getUnsettledBillsForClose を呼んで表示している。本ターミナル内では closeSnapshot 付与・closeRuns 記録用に同じ条件で再取得している（UI 確認を挟むためターミナル内で取得～確認待ちは行わない）。」
    3. closeRunId を生成し、`storeMeta/closeRuns/{closeRunId}` を作成（後述スキーマ）。
    4. 以下を **この順番** で実行する（データ整合性のため順序厳守）:
       - **applyCloseSnapshot**（相当処理。closeRunId を渡し、実際に bills に closeSnapshot を付与した分だけ closeRuns にカウント・unsettledBills にドキュメント作成）。
       - **resetSideGames**（既存 `resetAllSideGames` のロジックを実行）。
       - **resetTables**（既存 `resetAllTables` のロジックを実行）。
       - **cleanupActiveStays**（既存 `cleanupActiveStaysOnClose` のロジックを実行）。
       - **migrateMissedSettlements**（`migrateSettledBillsForBusinessDay` のロジックを実行）。営業日は **storeMeta に格納されている currentBusinessDateKey を「当日」として参照**し、その日付の settled bills を analytics に移管する。閉店ターミナルでは finalize 前に実行するため、この時点の currentBusinessDateKey は閉店対象日であり、その日付の bills がこのタイミングで migrate されることが保証される（実コードと一致）。
       - **finalizeCloseStateDoc**（state を closed に更新。currentBusinessDateKey を null、lastClosedBusinessDateKey を今回の営業日に設定）。
    5. state doc の更新（finalizeCloseStateDoc に含める）。
    6. エラーハンドリング・ログ記録（closeRuns への completedAt 等）。
    7. ロック解放。

### 3.3 各具体処理の実行順序（データ整合性のための順序）

閉店ターミナル内で、以下の順序を厳守する。

| 順番 | 処理 | 説明 |
|------|------|------|
| 1 | applyCloseSnapshot（相当） | 未会計 bills に closeSnapshot を付与（lastCloseRunId = 今回の closeRunId）。closeRuns の unsettledCount と unsettledBills は **実際に付与した bill のみ** 加算・作成する。 |
| 2 | resetSideGames | 既存 resetAllSideGames。 |
| 3 | resetTables | 既存 resetAllTables。 |
| 4 | cleanupActiveStays | 既存 cleanupActiveStaysOnClose。 |
| 5 | migrateMissedSettlements | 既存 migrateSettledBillsForBusinessDay。storeMeta の営業日を「当日」とし、その日付の settled bills を移管。 |
| 6 | finalizeCloseStateDoc | status='closed', currentBusinessDateKey=null, lastClosedBusinessDateKey=閉店した営業日 に更新。 |

### 3.4 closeRuns と unsettledBills の重複防止

- **同一営業日に複数回閉店処理が走っても、未会計 1 件につき 1 回だけ** closeRuns にカウントし、unsettledBills に 1 ドキュメントだけ作成する。
- **仕様**: 「bills に closeSnapshot を**実際に付与した**」場合にのみ、その closeRun の unsettledCount を 1 増やし、`closeRuns/{closeRunId}/unsettledBills/{billId}` に 1 件作成する。既に closeSnapshot が付与済み（already_marked）の bill は、付与処理をスキップするため、unsettledCount には加算せず、unsettledBills にもドキュメントを作成しない。
- これにより、同一 bill が複数 closeRun で二重にカウント／二重ドキュメントになることはない。

### 3.5 閉店処理完了後のダイアログ表示

閉店処理完了後、ダイアログで以下を **視認しやすい形** で表示する。

- **applyCloseSnapshot 相当**
  - 対象が 0 件だった場合: 「対象がいなかった」など。
  - 既に closeSnapshot が付与済みだったもののみだった場合: 「未会計として登録済みだった（既に snapshot 格納済み）」など。
  - 新規に付与したものがいる場合: 「誰を未会計として登録したか」（例: pokerName の一覧または件数）。
- **cleanupActiveStays**
  - `activeStays` のうち isActive が true だったのに削除したドキュメントがあれば、そのユーザー（または billId 等）を表示。いなければ「対象なし」でよい。
- **migrateMissedSettlements**
  - このタイミングで analytics 移管の対象になった bill があれば、その bill に格納されていた **pokerName** を表示。なければ「対象なし」でよい。
- **storeMeta の更新内容**
  - 更新した storeMeta（currentBusinessDay）の内容の要約（例: 閉店した営業日、status を closed にした旨）を表示する。

---

## 4. 開店処理フロー

### 4.1 全体の流れ

1. ユーザーが日付ボタンをタップし、ダイアログで「閉店中」であることを確認。
2. 「開店処理を開始する」ボタンを押下。
3. **openStoreTerminal** Callable を呼び出す。
4. ターミナル内で以下を実行:
   - ロック獲得（processing フィールドで lease 管理）。
   - 前処理の確認（前回の閉店処理が正常に完了しているか。storeMeta のみで判定）。
   - 各具体処理（openProgress で進捗管理）:
     - **verifyPreconditions**
     - **forceCleanup**（必要に応じて）
     - **finalizeOpenStateDoc**
   - state doc の更新。
   - エラーハンドリング・ログ記録（openRuns への記録）。
   - ロック解放。
5. 処理完了後、ダイアログで「何日（businessDate 基準）の営業を開始しました」と表示する。

### 4.2 開店処理完了後のダイアログ表示

- 開店日（`openedBusinessDate` = storeMeta に設定した currentBusinessDateKey）を明示し、「YYYY-MM-DD の営業を開始しました」のように表示する。

---

## 5. ログ記録スキーマ

### 5.1 閉店時: storeMeta/closeRuns

**パス**: `storeMeta/closeRuns/{closeRunId}`

| フィールド | 型 | 説明 |
|------------|------|------|
| closeRunId | （ドキュメントIDと一致させる想定） | 閉店処理 1 回の実行を一意に識別。生成方法は実装時に決定（例: UUID や `closedBusinessDate_${timestamp}` 等）。 |
| closedBusinessDate | string (YYYY-MM-DD) | 閉店認定した営業日キー。 |
| startedAt | Timestamp | 閉店処理開始時刻。 |
| completedAt | Timestamp | 閉店処理完了時刻（正常終了時のみ設定）。 |
| unsettledCount | number | 未会計のまま残した伝票の件数。**実際に closeSnapshot を付与した件数のみ**加算する（同一 bill の二重加算はしない）。 |

**サブコレクション**: `storeMeta/closeRuns/{closeRunId}/unsettledBills/{billId}`

| フィールド | 型 | 説明 |
|------------|------|------|
| billId | string（ドキュメントIDと一致） | 伝票 ID。 |
| statusAtClose | string | 閉店時点の bills.status（'open' \| 'in_progress' \| 'settling'）。 |
| userId | string | 表示用（party.userId）。 |
| pokerName | string | 表示用（party.pokerName）。 |
| businessDate | string (YYYY-MM-DD) | その bill の本来の businessDate。 |

- **作成タイミング**: bills に closeSnapshot を**実際に付与した**ときだけ、その bill に対して unsettledBills に 1 ドキュメント作成する。already_marked 等でスキップした bill には unsettledBills ドキュメントは作らない。

### 5.2 開店時: storeMeta/openRuns

**パス**: `storeMeta/openRuns/{openRunId}`

| フィールド | 型 | 説明 |
|------------|------|------|
| openRunId | （ドキュメントID） | 開店処理 1 回の実行を一意に識別。 |
| openedBusinessDate | string (YYYY-MM-DD) | 開店した営業日キー。 |
| startedAt | Timestamp | 開店処理開始時刻。 |
| completedAt | Timestamp | 開店処理完了時刻（正常終了時）。 |
| forceCleanupApplied | map または array（実装で選択） | 強制クリーンアップで書き換えたコレクション等の情報を保存する。必要に応じてフィールド名・構造を決める。 |

---

## 6. Step2 との整合（closeSnapshot への closeRunId 反映）

- **5.4 Step2 の手動フラグ付与との整合**: ここで作成する **closeRunId** を、bills の **closeSnapshot.lastCloseRunId** に反映する。
- **実装**: 閉店ターミナルから applyCloseSnapshot 相当の処理を行う際、**lastCloseRunId に今回の closeRunId を渡して付与する**。既存の `applyCloseSnapshot` Callable は、呼び出し元が closeRunId を渡さない場合は従来どおり `'step2-manual'` を使用するよう拡張する（オプション引数で closeRunId を受け取り、未指定時は 'step2-manual'）。
- Step2 で手動付与済み（lastCloseRunId === 'step2-manual'）の bill は、そのまま「手動移管」として残す。closeRuns には索引がない手動分として運用で区別する。

---

## 7. ロック（processing フィールド）と lease 管理

- **storeMeta/currentBusinessDay** に、閉店／開店の実行中を示す **processing** フィールドを設け、lease 管理する。
- **構造・有効期限**: 実装時に決定する。例: `processing: { startedAt: Timestamp, leaseExpiresAt: Timestamp, runId: string }`。lease 切れ時は自動解放または次回実行時にクリアする方針を仕様で決める。
- 閉店ターミナル・開店ターミナルはいずれも、処理開始時にロック獲得、正常終了またはエラー時にはロック解放を行う。

---

## 8. エラーハンドリングとログ

- 閉店・開店の各ステップでエラーが発生した場合、どこまで処理を戻すかは実装時に方針を決める（トランザクションで可能な範囲はロールバック、物理的処理は手動復旧の可能性を許容する）。
- 閉店時: closeRuns に startedAt は必ず書き、異常終了時は completedAt を書かず lastError 等で記録するかは実装時に決める。
- 開店時: openRuns に同様に startedAt / completedAt および必要に応じてエラー情報を記録する。

---

## 9. 作成・更新するファイル（予定）

### 新規

- `functions/src/storeManagement/closeStoreTerminal.ts`（閉店ターミナル Callable）
- `functions/src/storeManagement/openStoreTerminal.ts`（開店ターミナル Callable）
- storeMeta の **processing** 用ヘルパ（lease 獲得・解放）は既存または新規で用意

### 更新

- `functions/src/close_process/applyCloseSnapshot.ts`: **closeRunId** をオプションで受け取り、指定時は lastCloseRunId にその値を使用。未指定時は `'step2-manual'`。
- 日付ボタンを配置している UI: タップで開閉店ダイアログを表示し、閉店時は getUnsettledBillsForClose → 確認 → closeStoreTerminal、開店時は openStoreTerminal を呼び出す。
- `lib/Home/terminalHomePage.dart`: 既存の「開閉店管理」ボタンを削除し、日付ボタンに統合。
- storeMeta の型定義（CurrentBusinessDayDoc）: **processing** フィールドを追加する場合は型に反映する。

### 参照（呼び出しまたはロジック流用）

- getUnsettledBillsForClose（UI から呼ぶ／ターミナル内で再取得時に同じクエリ条件を使用）
- resetAllSideGames / resetAllTables / cleanupActiveStaysOnClose（ターミナルから呼ぶか、内部関数として共通化）
- migrateSettledBillsForBusinessDay（営業日は storeMeta 参照のまま。ターミナルから呼ぶかロジックを共通化）

---

## 10. 矛盾点・懸念事項・残検討事項（仕様書上の注記）

以下は実装時に判断・確認が必要な項目である。仕様書上もここに明記し、チャット上でも一覧を出力する。

### 10.1 矛盾・懸念

- **migrateMissedSettlements の営業日**: 実コード（`migrateSettledBillsForBusinessDay`）は営業日を **storeMeta/currentBusinessDay** の currentBusinessDateKey（未設定時は lastClosedBusinessDateKey）から取得している。閉店ターミナルでは finalizeCloseStateDoc の**前**に migrate を実行するため、その時点の currentBusinessDateKey は閉店対象日であり、**storeMeta に格納されている日付を当日として、その日付の settled bills がこのタイミングで migrate される**ことが確認できる。現行仕様で矛盾はなく、追加の懸念は不要とする。

- **getUnsettledBillsForClose とターミナル内の再取得**: UI で getUnsettledBillsForClose を呼んでからユーザーが「確認」を押すまでに、別端末で新規未会計が増える可能性がある。ターミナル内では「閉店時点の未会計」を再取得するため、UI 表示と 1 件程度ずれる可能性はある。運用で許容するか、同一であることを保証する別手段（例: UI で取得した billIds をターミナルに渡す等）を検討するかは実装時に決める。※ セキュリティ・整合性の観点から、**ターミナル内でサーバ側再取得する方式を推奨**（クライアント渡しは改ざんリスク）。

- **resetAllSideGames / resetAllTables の呼び出し形態**: 現状はそれぞれ onCall の Callable。ターミナルからは「同一プロジェクト内でロジックを直接呼ぶ」形にするか、HTTP 経由で呼ぶかは実装時に決める。通常は **内部で共通関数を切り出し、Callable とターミナルの両方からその共通関数を呼ぶ**形が望ましい。

### 10.2 残検討事項

- **processing フィールドの詳細**: lease の有効期限（秒数）、runId の形式、lease 切れ時の自動解放の有無。実装時に決定する。
- **進捗管理（closeProgress / openProgress）**: 各ステップの状態を storeMeta に持つか、持たないか。再実行時の resume は Step3 では行わない前提でよいか。実装時に決定する。
- **エラー時のロールバック範囲**: applyCloseSnapshot で一部だけ成功した場合、resetTables 等は実行するか、全体を中止するか。仕様では「部分成功を許容し、closeRuns には実際に付与した分だけ記録する」とするが、後続の reset/cleanup を実行するかは実装時に方針を決める。
- **openStoreTerminal の forceCleanup**: forceCleanup で「強制的に書き換えたコレクション」を openRuns に記録する際のフィールド名（例: `forceCleanupApplied`）と、中身を map にするか array にするか。実装時に決定する。
- **日付ボタンの配置**: ステップ1で作成した日付ボタンが `store_status_widget` 等に存在するか。存在しない場合は、本ステップで「日付ボタン＋開閉店ダイアログ」を新規に配置する。

---

以上を Phase6 Step3 の実装仕様書とする。実装時は本ドキュメントを優先し、不明点は implementation_plan.md および Step2 の change_spec / implementation_summary を参照する。

**Step3 実装完了**: 本仕様に基づく実装は完了している。変更ファイル一覧・閉店完了ダイアログ（§4.8）・displaySummary・テスト一覧等の最終内容は **implementation_changes.md** を参照すること。
