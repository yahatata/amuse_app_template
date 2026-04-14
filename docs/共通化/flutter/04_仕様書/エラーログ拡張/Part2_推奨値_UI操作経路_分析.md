# Part 2: operation あり 177 行 — 推奨値 + UI 操作経路分析

> **目的**: `functionEntry_業務役割一覧.md` Part 2 の「主要業務」「高頻度業務」欄を埋めるための推奨値と、各 operation がどの UI 操作・タイミングで発火するかの分析。
>
> **判定基準**:
> - 高頻度 5 … 1 営業日のうちに複数回起こりうる
> - 高頻度 3 … だいたい 1 日 1 回程度
> - 高頻度 1 … それより少ない（月次・例外・ほぼ使わない等）
>
> **高頻度の意味（重要）**: 上記は **業務としての発生頻度**（ユーザ操作・Callable・バッチ等が、どれだけ日常的に走るか）を指す。**失敗ログやエラーの発生頻度ではない**。失敗自体は稀でも、当該業務の発火頻度が高ければ監視・重要度の観点で気にする必要性が高い。Part 2 の「推奨 高頻度」はこの業務頻度に揃える。
>
> **主要業務の判断軸**:
> - 5 = コア業務（トーナメント進行・会計・入店・開閉店）に直接影響
> - 3 = 支援・周辺業務（注文・チップ・シフト管理等）、またはコア業務の二次的な処理
> - 1 = 管理・設定・ベストエフォート・二重障害時のメタログ等
>
> **operation カテゴリと判定パターン**:
> - **`*BestEffort`**: メイン処理は成功済み。データ整合性に軽微な影響 → 主要業務 = 1
> - **`*OperationLogWrite`**: メイン処理失敗 + 失敗ログ書き込みも失敗（二重障害） → 主要業務 = 1, 高頻度 = 1
> - **`*Catch` (FunctionCustomError)**: 業務ルール違反（入力不正・状態不整合）→ 主要業務 = 親の値
> - **`*GenericCatch`**: 想定外エラー → 主要業務 = 親の値
> - **`config_read`**: リトライ後フォールバック → 主要業務 = 3（高頻度は呼び出し元の業務頻度に従い、失敗ログの出方では決めない）

> **UI 表記のルール**: 「UI 操作経路」は Flutter `lib/` の **AppBar `title`**、ホームグリッドの **ボタンラベル**、タブ・主要ボタン・ダイアログタイトルに合わせる。`Admin` は `AdminHomePage` の AppBar タイトル、`Terminal ホーム` は `terminalHomePage` の AppBar タイトル（いずれも実装どおり）。

---

## analytics — `migrateSettledBillsForBusinessDay`

**UI 操作経路**: `Terminal ホーム` → AppBar の「システム設定」（歯車アイコン、`tooltip: システム設定`）→ 画面タイトル「システム設定」→ ListTile「settledBillsへの移管処理（開発用）」→ ダイアログ「最終確認」→「実行」（※閉店パイプライン `migrateMissedSettlements` からも同コアが動くが UI 経路は別）
**呼び出しタイミング**: データ分析用に精算済み伝票を移管する際に手動実行。日常業務では使わない保守系 Callable。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 1 | `migrateSettledBillsForBusinessDay` | `callable` | 1 | 1 | Callable 全体の外側 catch。保守目的のため優先度低 |
| 2 | `migrateSettledBillsForBusinessDay` | `runMigratePerBill` | 3 | 3 | 1 件ごとの移管失敗。ループ内でスキップして継続 |

---

## attendance

### `approveAttendanceCorrectionRequest`（勤怠修正申請の承認）

**UI 操作経路**: `Admin` → グリッド「勤怠修正申請」→ AppBar「勤怠修正申請管理」→ 一覧から申請を選び「承認」
**呼び出しタイミング**: スタッフが出退勤の誤りを申請し、管理者がそれを承認する。頻度は低い（修正申請自体が稀）。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 3 | `approveAttendanceCorrectionRequest` | `attendanceRecordUpdate` | 1 | 1 | Part 1 の勤怠修正系（申請・一覧・却下等）と同様に主要 1。承認後の勤怠レコード更新失敗（承認ステータスは成功済みの経路あり） |
| 4 | `approveAttendanceCorrectionRequest` | `approveRequestOuterCatch` | 1 | 1 | 同上。承認処理全体の外側 catch |

### `executeMonthlyPayroll`（月次給与実行）

**UI 操作経路**: `Admin` → グリッド「給与計算」→ AppBar「給与計算」→ タブ「計算」→「給与計算を実行」
**呼び出しタイミング**: 月 1 回。管理者が給与計算を開始し、スタッフ別 Cloud Tasks を投入する。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 5 | `executeMonthlyPayroll` | `loadPayrollConfig` | 3 | 1 | 給与設定の Firestore 読み取り失敗。実行不可 |
| 6 | `executeMonthlyPayroll` | `taskDispatch` | 3 | 1 | スタッフ別 Cloud Tasks 投入の失敗。給与計算が開始されない |

### `getPayrollCandidates`（給与候補者一覧取得）

**UI 操作経路**: `Admin` →「給与計算」→ タブ「計算」で候補者・設定読込が走る画面（`getPayrollCandidates` 呼び出しタイミングは実装に依存）
**呼び出しタイミング**: 月次給与画面表示時。月 1〜数回程度。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 7 | `getPayrollCandidates` | `loadPayrollConfig` | 3 | 1 | 給与設定の読み取り失敗。候補者一覧を表示できない |

### `payrollNotificationScheduler`（給与通知スケジューラ）

**UI 操作経路**: なし（システム自動実行）
**呼び出しタイミング**: `scheduledJobTaskExecutors` 経由で Cloud Tasks として実行。月次給与に関連する通知の準備。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 8 | `payrollNotificationScheduler` | `enqueue` | 3 | 1 | 通知タスクのエンキュー失敗。給与通知が届かない |

### `processStaffPayroll`（スタッフ別給与計算タスク）

**UI 操作経路**: なし（`executeMonthlyPayroll` から投入された Cloud Task）
**呼び出しタイミング**: `executeMonthlyPayroll` 実行後にスタッフ 1 人ずつ Cloud Task として処理。月 1 回、スタッフ数分。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 9 | `processStaffPayroll` | `runNotFound` | 3 | 1 | payrollRuns ドキュメントが欠損。計算不可（データ不整合） |
| 10 | `processStaffPayroll` | `staffResultNotFound` | 3 | 1 | staffResults ドキュメントが欠損。同上 |
| 11 | `processStaffPayroll` | `processStaffPayrollCatch` | 3 | 1 | 給与計算本体の失敗。対象スタッフの給与が未計算になる |
| 12 | `processStaffPayroll` | `failureStatusUpdate` | 1 | 1 | 計算失敗後の状態更新も失敗（二重障害）。集計が不正確になりうる |

---

## bills

### `appendItem`（伝票明細追加）

**UI 操作経路**:
- `appendItemWithOrderProjection`: `Terminal ホーム` →「注文管理」→ AppBar「注文管理」→ 注文フローで確定（スタッフ端末）
- `appendItem`: LIFF 側のユーザー注文フロー（アプリ内のメニュー・注文確定。実装は LIFF クライアント）

**呼び出しタイミング**: 注文のたびに伝票へ明細行を追加。営業中は頻繁に発生。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 13 | `appendItem` | `appendItemCatch` | 3 | 5 | LIFF 経由の明細追加の外側 catch |
| 14 | `appendItem` | `appendItemWithOrderProjection` | 3 | 5 | 端末経由の注文投影付き明細追加の外側 catch |

### `cancelAccounting`（会計取消）

**UI 操作経路**（`lib/Accounting/accountingPage.dart` に準拠）:
- **pre-settlement（会計開始〜精算前）で本番から呼ばれる主経路**: `Terminal ホーム` →「会計管理」→ AppBar「会計管理」→ タブ「未会計」→ ステータス「会計中」の請求カード → **「会計開始前に戻る」**（`_revertAccountingStart` → `cancelAccounting` に `billId` のみ。確認ダイアログは出さず SnackBar）
- 同カードの **「支払い方法変更」** は一度 `cancelAccounting` で会計開始を取り消したあと `startAccounting` を再実行する流れ（同 Callable が先に走る）
- **会計完了タブ**の請求カードには **「キャンセル」** があり、`AccountingCancelDialog`（見出し「会計キャンセル」→ 確認後「会計をキャンセル」）からも `cancelAccounting` を呼ぶ実装があるが、**バックエンドは `open` / `in_progress` / `settling` のみ許可**（`cancelAccounting.ts`）のため、**`status: settled` の伝票では業務ルールエラーになりうる**。会計完了後の取り消しは別 Callable（例: `updateAccounting` ＋ `postEventCancel`）の想定がコードコメント上ある
**呼び出しタイミング**: 会計開始後に取り消す操作。1 日に数回あるかないか。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 15 | `cancelAccounting` | `cancelAccountingCatch` | 3 | 3 | FunctionCustomError（業務ルール違反・状態不一致）。会計状態が中途半端になりうる |
| 16 | `cancelAccounting` | `cancelAccountingGenericCatch` | 3 | 3 | 想定外エラー |

### `completeAccounting`（会計完了 — レガシー）

**UI 操作経路**: **本リポジトリの Flutter（`lib/`）からは呼ばれない**（`httpsCallable('completeAccounting')` の参照なし）。`functions` 側では旧 **`todaysBills`** を更新する Callable として **デプロイ済みのまま残置**（`accounting.ts` コメントの「legacy」）。
**呼び出しタイミング**: 旧クライアント・手動・外部ツール等があれば理論上はありうるが、本テンプレの端末会計は V2 のみ。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 17 | `completeAccounting` | `completeAccountingCatch` | 1 | 1 | 会計完了の FunctionCustomError。精算が止まるためコア業務影響大 |
| 18 | `completeAccounting` | `completeAccountingGenericCatch` | 1 | 1 | 想定外エラー（現在使用されていない） |

### `completeAccountingV2`（会計完了 V2）

**UI 操作経路**: `Terminal ホーム` →「会計管理」→ AppBar「会計管理」→ タブ「未会計」→ 会計中カードから会計完了フロー（例: ダイアログ「会計開始完了」→「会計完了」／0 円会計の確認ダイアログ経由など）。`accountingPage.dart` の `_completeAccounting` が **`completeAccountingV2`** を呼ぶ（関数名は `_completeAccounting` だが Callable 名は V2）。
**呼び出しタイミング**: 精算のたび。1 営業日に来客数と同じ程度。`/bills` ベースで settlement trigger 連携。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 19 | `completeAccountingV2` | `completeAccountingV2Catch` | 5 | 5 | 同上。V2 ルートの FunctionCustomError |
| 20 | `completeAccountingV2` | `completeAccountingV2GenericCatch` | 5 | 5 | V2 ルートの想定外エラー |

### `createBillWithActiveStay`（入店時の伝票自動作成）

**UI 操作経路**:
- `Terminal ホーム` →「ユーザーログイン」等の入店フローで QR／手動チェックイン（`processVisitByQR` / `manualCheckIn` 経由。画面は各ページの AppBar に依存）

**呼び出しタイミング**: 来客のたびに呼ばれる。1 営業日に来客数分。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 21 | `createBillWithActiveStay` | `operationForCreateBillKey(error.errorKey)` | 5 | 5 | 業務キー別の FunctionCustomError（重複入店・冪等性違反等）。入店が止まる |
| 22 | `createBillWithActiveStay` | `runCreateBillTransaction` | 5 | 5 | Firestore トランザクション失敗 |

### `getBillPreviewTotals`（会計プレビュー取得）

**UI 操作経路**: `Terminal ホーム` →「会計管理」→ タブ「未会計」→ 会計開始〜完了の途中でプレビュー取得（会計カード内のフロー。ダイアログ「会計明細確認」等）
**呼び出しタイミング**: 会計画面を開くたびに呼ばれる。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 23 | `getBillPreviewTotals` | `previewTotalsCatch` | 3 | 5 | プレビュー表示失敗。会計自体は別操作なので直接影響は低いがスタッフの業務が止まる |

### `startAccounting`（会計開始）

**UI 操作経路**: `Terminal ホーム` →「会計管理」→ タブ「未会計」→ 請求カードから「会計を開始」（ダイアログ「会計明細確認」→「会計を開始」）
**呼び出しタイミング**: 精算開始のたびに呼ばれる。1 営業日に来客数程度。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 24 | `startAccounting` | `operationForStartAccountingKey(error.errorKey)` | 5 | 5 | リポジトリ内の業務キー別 FunctionCustomError（既に会計中・冪等性違反等） |
| 25 | `startAccounting` | `startAccountingCallableCatch` | 5 | 5 | Callable 側の想定外エラー |
| 26 | `startAccounting` | `startAccountingRepoCatch` | 5 | 5 | リポジトリ側の非 FunctionCustomError |

### `updateActiveBill`（伝票内容修正）

**UI 操作経路**: `Terminal ホーム` →「会計管理」→ タブ「未会計」→ 会計中カードの「修正」（`AccountingEditDialog`）
**呼び出しタイミング**: 伝票情報を修正するとき。来客ごとに 0〜1 回程度。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 27 | `updateActiveBill` | `updateActiveBillCatch` | 3 | 1 | FunctionCustomError |
| 28 | `updateActiveBill` | `updateActiveBillGenericCatch` | 3 | 1 | 想定外エラー |

### `verifyPaymentSplit`（支払い分割照合）

**UI 操作経路**: **カスタム支払い専用ではない。** `Terminal ホーム` →「会計管理」→ AppBar「会計管理」→ タブ「未会計」→「会計を開始」→ ダイアログ「決済方法を選択してください」で **「ポイント + 選択した決済方法で支払う」** でも **「カスタム支払い」**（→ `CategoryPaymentMethodDialog`）でも、その後の確認を経て **`_executeStartAccounting` 内**で `verifyPaymentSplit` が呼ばれる（ローディング「会計開始処理中...」表示中。クライアントの `calculatePaymentSplit` 結果をサーバーで照合してから `startAccounting`）。
**呼び出しタイミング**: 上記フローで会計を開始するとき（ポイント・チップ・現金相当の按分を含むケースでサーバー検証が走る）。来店者が会計するたびに発生しうる。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 29 | `verifyPaymentSplit` | `verifyPaymentSplitCatch` | 5 | 5 | 分割照合の業務例外。会計確定に影響 |
| 30 | `verifyPaymentSplit` | `verifyPaymentSplitGenericCatch` | 5 | 5 | 想定外エラー |

---

## itemOrder

### `createMenuItem`（メニュー新規作成）

**UI 操作経路**: `Terminal ホーム` →「メニュー追加」→ AppBar「メニュー管理用リスト」→ FAB 等で「メニュー登録」→ AppBar「メニュー登録」→ 保存（`CreateMenuPage`）
**呼び出しタイミング**: メニュー追加時。開業初期やメニュー改訂時に数回。日常では稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 31 | `createMenuItem` | `imageUpload` | 1 | 1 | 画像の Storage 保存失敗。メニュー作成は止まるが日常業務ではない |
| 32 | `createMenuItem` | `menuCreateCatch` | 1 | 1 | メニュー作成全体の失敗 |

### `getMenuItems`（メニュー一覧取得）

**UI 操作経路**:
- `Terminal ホーム` →「注文画面」→ AppBar「メニューカテゴリー」→ カテゴリ選択 → AppBar「{カテゴリ} メニュー」（`MenuListPage`）
- LIFF 側のメニュー表示（`lib/` 外のクライアント）

**呼び出しタイミング**: 注文画面を開くたび。営業中は頻繁。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 33 | `getMenuItems` | `adminMenuDocMissing` | 3 | 1 | 集約メニュードキュメント未作成。初期設定の問題。一度発生すると全注文に影響 |
| 34 | `getMenuItems` | `menuFetchCatch` | 3 | 5 | メニュー取得の例外。注文画面が開けない |

### `placeOrder`（端末から注文）

**UI 操作経路**: `Terminal ホーム` →「注文画面」→「メニューカテゴリー」→「{カテゴリ} メニュー」→ ダイアログ「注文確認」→ 確定（`placeOrder`）
**呼び出しタイミング**: スタッフが端末から注文を入れるたび。営業中は頻繁。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 35 | `placeOrder` | `chipPurchaseLog` | 1 | 3 | チップ購入ログ書き込み失敗（注文自体は成功して継続）。ベストエフォート |
| 36 | `placeOrder` | `placeOrderCatch` | 3 | 5 | FunctionCustomError。注文が通らない |
| 37 | `placeOrder` | `placeOrderGenericCatch` | 3 | 5 | 想定外エラー |

### `placeOrderByUser`（LIFF から顧客注文）

**UI 操作経路**: LIFF → メニュー → カートに追加 → 注文確定
**呼び出しタイミング**: 顧客が LINE 上で注文するたび。営業中は頻繁。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 38 | `placeOrderByUser` | `placeOrderCatch` | 3 | 5 | FunctionCustomError |
| 39 | `placeOrderByUser` | `placeOrderGenericCatch` | 3 | 5 | 想定外エラー |

### `updateMenuItem`（メニュー更新）

**UI 操作経路**: `Terminal ホーム` →「メニュー追加」→「メニュー管理用リスト」→ 一覧の「編集」アイコン → AppBar「メニュー編集」→ 保存
**呼び出しタイミング**: メニュー改訂時。日常では稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 40 | `updateMenuItem` | `imageUpload` | 1 | 1 | 画像更新の Storage 保存失敗 |
| 41 | `updateMenuItem` | `menuUpdateCatch` | 1 | 1 | メニュー更新全体の失敗 |

---

## scheduler

### `enqueueTournamentTasksByScheduler`（スケジューラによるトーナメントタスク投入）

**UI 操作経路**: なし（システム自動実行）
**呼び出しタイミング**: `schedulerSupervisor`（日次 cron）→ `scheduledJobTaskExecutors` 経由で Cloud Task として実行。日次。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 42 | `enqueueTournamentTasksByScheduler` | `runEnqueueSchedulerTask` | 5 | 3 | トーナメントタスク投入の失敗。スケジュール済みトーナメントの開催・登録締切が機能しなくなる |
| 43 | `enqueueTournamentTasksByScheduler` | `cloudTasksCreateTask` | 5 | 1 | 再計画用 Cloud Task のエンキュー失敗。通常は日次だが再計画は随時 |

### `executeScheduledJobTask`（Cloud Task によるスケジュールジョブ実行）

**UI 操作経路**: なし（Cloud Task ディスパッチ）
**呼び出しタイミング**: `controlHookHttp` や `weeklyPlanner` から投入された Cloud Task が実行されるたび。トーナメント開始・登録締切など。1 日に複数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 44 | `executeScheduledJobTask` | `runScheduledJob` | 5 | 5 | ジョブ本体の失敗。トーナメント自動制御が止まる |
| 45 | `executeScheduledJobTask` | `markReplanCompletedBestEffort` | 1 | 1 | 成功後の完了マーク更新失敗（ベストエフォート） |
| 46 | `executeScheduledJobTask` | `releaseReplanProcessingBestEffort` | 1 | 1 | 失敗後の処理中フラグ解除失敗（ベストエフォート） |

### `writeSchedulerDispatchLogBestEffort`（スケジューラディスパッチログ）

**UI 操作経路**: なし（スケジューラ内部）
**呼び出しタイミング**: スケジューラがタスク投入するたびにベストエフォートでログ書き込み。日次。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 47 | `writeSchedulerDispatchLogBestEffort` | `dispatchLogWrite` | 1 | 3 | 監査ログの書き込み失敗。業務に直接影響なし |

### `writeSchedulerExecutionLogByCloudTaskBestEffort`（Cloud Task 実行ログ）

**UI 操作経路**: なし（Cloud Task 内部）
**呼び出しタイミング**: Cloud Task 実行完了のたびにベストエフォートでログ書き込み。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 48 | `writeSchedulerExecutionLogByCloudTaskBestEffort` | `executionLogWrite` | 1 | 3 | 実行結果ログの書き込み失敗。業務に直接影響なし |

---

## shift

### `finalizeMonth`（月次シフト確定）

**UI 操作経路**: `Admin` → グリッド「シフト」→ AppBar「シフト」→「シフトカレンダー」→ AppBar「シフトカレンダー」→ AppBar アクション「一括最終確定」→ ダイアログ「{yyyy年M月}の全シフトを最終確定」→「確定」
**呼び出しタイミング**: 月 1 回。管理者がシフトを確定するとき。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 49 | `finalizeMonth` | `finalizeDayLoop` | 5 | 1 | 日次ループ内の特定日が失敗。他の日は継続。ただし確定漏れが発生 |

### `getRequiredStaffByTimeSlot`（時間帯別必要人数取得）

**UI 操作経路**: なし（サーバー内部ヘルパー。`finalizeMonth`, `interimConfirmRequests` 等から呼ばれる）
**呼び出しタイミング**: シフト関連の Callable が設定を読み取るたび。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 50 | `getRequiredStaffByTimeSlot` | `config_read` | 3 | 1 | リトライ後も読み取れないときのみ `logOpsError`。フォールバック後は業務は継続するが必要人数はデフォルトになりうる。 |
---

## staff

### `getShifts`（シフト一覧取得）

**UI 操作経路**: `lib/` 内に `httpsCallable('getShifts')` の呼び出しは見つからない（スタッフ／別クライアント想定・未実装の可能性）。
**呼び出しタイミング**: シフト画面を開くたび。出退勤時にも参照される可能性あり。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 51 | `getShifts` | `initCatch` | 3 | 1 | リクエスト検証・接続テスト等の初期段階失敗。設定やインフラの問題 |
| 52 | `getShifts` | `shiftFetchCatch` | 3 | 3 | シフト取得本体の失敗。シフト画面が表示できない |
| 53 | `getShifts` | `detailErrorLog` | 1 | 3 | #52 と同じエラーの詳細ログ再出力（Error 型の場合）。補助ログ |
| 54 | `getShifts` | `unknownErrorLog` | 1 | 1 | #52 と同じエラーの再出力（非 Error 型の場合）。極めて稀 |
（ミニアプリの一部で使用されているが、今後使用されなくなる可能性が大いにあり。oneNoteのメモ参照）
---

## storeMeta

### `applyCloseSnapshot`（閉店スナップショット適用）

**UI 操作経路**:
- `Terminal ホーム` → AppBar「システム設定」→ ListTile「未会計billsの移管」→ ダイアログ「未会計billsの移管」→「全件確定」（`applyCloseSnapshot` Callable）
- `Terminal ホーム` → 日付／営業状態 Chip タップ → ダイアログ「開閉店管理」→「閉店処理を開始する」→ AppBar「閉店前確認」→ … → `closeStoreTerminal` パイプラインの `UNSETTLED_MARK` ステップ内部（`applyCloseSnapshotCore`）

**呼び出しタイミング**: 閉店時（1 日 1 回）、または手動メンテ時。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 55 | `applyCloseSnapshot` | `applyBillCloseSnapshotTxn` | 5 | 3 | 会計ドキュメントのトランザクション更新失敗。未会計マークが一部適用されない |
| 56 | `applyCloseSnapshot` | `incrementUserUnsettledBillsCount` | 3 | 3 | ユーザー未会計件数カウンタの増加失敗。カウントが不正確になるがメイン処理は成功 |
| 57 | `applyCloseSnapshot` | `getClosedBusinessDate` | 5 | 3 | 営業日取得の業務エラー。スナップショット処理自体が開始できない |

### `cleanupActiveStaysOnClose`（閉店時 activeStays クリーンアップ）

**UI 操作経路**:
- `Terminal ホーム` → AppBar「システム設定」→ ListTile「閉店クリーンアップ」
- `Terminal ホーム` → `closeStoreTerminal` 閉店実行（`cleanupActiveStays` ステップ内部から同コアロジック）

**呼び出しタイミング**: 閉店時（1 日 1 回）、または手動メンテ時。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 58 | `cleanupActiveStaysOnClose` | `deleteActiveStayDocument` | 3 | 3 | 個別の activeStay 削除失敗。他は継続。翌日に残留データが残る |
| 59 | `cleanupActiveStaysOnClose` | `cleanupOuterCatch` | 3 | 3 | クリーンアップ全体の例外 |

### `closeStore`（手動閉店）

**UI 操作経路**: `lib/` 内に `httpsCallable('closeStore')` を呼ぶ UI は見つからない（`terminalHomePage.dart` の `_callCloseStore` は定義のみ・未配線）。実運用の閉店は `closeStoreTerminal`（`開閉店管理` → `閉店処理を開始する` → `閉店前確認`）。
**呼び出しタイミング**: 1 日 1 回（閉店時）。通常は `closeStoreTerminal` を使うため、こちらは稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 60 | `closeStore` | `closeStoreCatch` | 5 | 3 | FunctionCustomError（状態不正・既に閉店済み等） |
| 61 | `closeStore` | `closeStoreGenericCatch` | 5 | 3 | 想定外エラー |
（多分、closeStoreTerminal前に作成してデプロイした関数かな）

### `closeStoreTerminal`（端末閉店パイプライン）

**UI 操作経路**: `Terminal ホーム` → 日付／営業状態 Chip タップ →「開閉店管理」→「閉店処理を開始する」→ AppBar「閉店前確認」（`getCloseIntegrityData`）→「確認して閉店する」または「強制閉店する」
**呼び出しタイミング**: 1 日 1 回（閉店時）。admin 権限の端末から実行。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 62 | `closeStoreTerminal` | `closeTerminalPreflight` | 5 | 3 | 事前チェック失敗（営業中でない・営業日キー未設定等）。閉店処理開始できず |
| 63 | `closeStoreTerminal` | `acquireProcessingLease` | 5 | 3 | 排他制御リース取得失敗。別の閉店処理と競合、またはリース未解放 |
| 64 | `closeStoreTerminal` | `finalizeCloseStateDoc.enqueueOpenAssessmentRecheck` | 3 | 3 | 閉店成功後の開店評価再チェック Cloud Task 投入失敗。閉店自体は成功済み |
| 65 | `closeStoreTerminal` | `runCloseStep.${stepName}` | 5 | 3 | パイプライン各ステップ（UNSETTLED_MARK / resetSideGames / resetTables / cleanupActiveStays / migrateMissedSettlements / finalizeCloseStateDoc）の失敗。閉店処理が中断 |
| 66 | `closeStoreTerminal` | `rollbackUnsettledMark` | 5 | 1 | UNSETTLED_MARK ステップ失敗後のロールバックも失敗。データ不整合が残る。二重障害のため稀 |

### `continueBusinessTerminal`（営業継続）

**UI 操作経路**: `Terminal ホーム` → `StoreStrongWarningOverlay`（強警告ゲート）→「営業継続」→ ダイアログ「営業継続」→「決定」（※ `already_running_different_date` の強警告では `緊急一時解除` → `temporaryUnlockAlreadyRunningDifferentDateTerminal` の別経路）
**呼び出しタイミング**: 閉店予定時刻を過ぎても営業を続けるとき。稀（週に 0〜数回）。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 67 | `continueBusinessTerminal` | `cloudTasksCreateTask` | 3 | 1 | 閉店リマインド Cloud Task 予約失敗。営業継続自体は成功するがリマインドが届かない |
| 68 | `continueBusinessTerminal` | `continueBusinessTerminalFunctionCustom` | 3 | 1 | FunctionCustomError（状態不正等） |

### `createInitialStateDoc`（初期状態ドキュメント作成 — スクリプト）

**UI 操作経路**: なし（CLI スクリプト。`ts-node` / `tsx` で手動実行）
**呼び出しタイミング**: 新規店舗のセットアップ時に 1 回のみ。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 69 | `createInitialStateDoc` | `createDocMainCatch` | 1 | 1 | 初回作成の失敗。再実行で対処可能 |
| 70 | `createInitialStateDoc` | `scriptTopLevelCatch` | 1 | 1 | スクリプト最外周の未処理例外 |

### `createInitialStateDocCallable`（初期状態ドキュメント作成 — Callable）

**UI 操作経路**: `Admin` → グリッド「詳細設定」→ AppBar「詳細設定」→ ListTile「currentBusinessDay 初期化」（`terminalHomePage.dart` に同名 Callable を呼ぶ `_callCreateInitialStateDoc` があるが、`lib/` 内から未呼び出し）
**呼び出しタイミング**: 新規店舗セットアップ時。1 回のみ。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 71 | `createInitialStateDocCallable` | `createInitialStateDoc` | 1 | 1 | 初回作成の失敗 |

### `getCloseIntegrityData`（閉店前確認データ取得）

**UI 操作経路**: `Terminal ホーム` →「開閉店管理」→「閉店処理を開始する」→ AppBar「閉店前確認」（表示時に自動ロード）
**呼び出しタイミング**: 閉店前に確認画面を表示するたび。1 日 1〜数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 72 | `getCloseIntegrityData` | `closeIntegrityAggregate` | 5 | 3 | 未会計・未退勤・未終了トーナメントの集約取得失敗。閉店前確認ができず閉店判断に影響 |

### `getCurrentBusinessDateKeyOrThrow`（現行営業日キー取得）

**UI 操作経路**: なし（サーバー内部ヘルパー。多数の Callable・サービスから呼ばれる共通関数）
**呼び出しタイミング**: 営業日キーを必要とするほぼ全てのリクエストで呼ばれる。非常に高頻度。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 73 | `getCurrentBusinessDateKeyOrThrow` | `loadFirestoreStateDoc` | 5 | 5 | Firestore 状態ドキュメントの読み取り失敗。これが壊れるとほぼ全ての操作が止まる（custom対象？） |

### `getUnclockedStaffForClose`（閉店前の未退勤スタッフ一覧）

**UI 操作経路**: `Terminal ホーム` →「開閉店管理」→「閉店処理を開始する」→ AppBar「閉店前確認」（`getCloseIntegrityData` の結果として未退勤一覧に表示）
**呼び出しタイミング**: 閉店前確認のたび。1 日 1〜数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 74 | `getUnclockedStaffForClose` | `unclockedStaffQuery` | 3 | 3 | 未退勤スタッフの一覧取得失敗。閉店前確認が不完全になる |

### `getUnclosedTournamentsForClose`（閉店前の未終了トーナメント一覧）

**UI 操作経路**: 同上（`getCloseIntegrityData` 経由）
**呼び出しタイミング**: 同上。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 75 | `getUnclosedTournamentsForClose` | `unclosedTournamentsQuery` | 3 | 3 | 未終了トーナメント一覧取得失敗 |

### `getUnsettledBillsForClose`（閉店前の未会計伝票一覧 — Callable）

**UI 操作経路**:
- `Terminal ホーム` → AppBar「システム設定」→ ListTile「未会計billsの移管」（一覧取得〜ダイアログ。確定は `applyCloseSnapshot`）
- 閉店フローでは `getCloseIntegrityData`（`閉店前確認`）経由で集約表示
**呼び出しタイミング**: 閉店フロー本体（`closeStoreTerminal`）は別経路で未会計を処理するため、この Callable 単体の呼び出しは手動メンテ時のみ。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 76 | `getUnsettledBillsForClose` | `unsettledBillsQuery` | 1 | 1 | ※既に Part 2 に値あり。手動メンテ経路のみ |

### `initializeStoreConfigCallable`（店舗設定初期化）

**UI 操作経路**: `Admin` → グリッド「詳細設定」→ AppBar「詳細設定」→ ListTile「storeMeta/config 初期セットアップ」
**呼び出しタイミング**: 新規店舗セットアップ時。1 回のみ。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 77 | `initializeStoreConfigCallable` | `initStoreMetaConfig` | 1 | 1 | storeMeta 設定の初期作成失敗。再実行で対処可能 |

### `openStore`（手動開店）

**UI 操作経路**: `lib/` 内に `httpsCallable('openStore')` を呼ぶ UI は見つからない（`terminalHomePage.dart` の `_callOpenStore` は定義のみ・未配線）。主経路は `openStoreTerminal`。
**呼び出しタイミング**: 1 日 1 回（開店時）。通常は `openStoreTerminal` を使うため、こちらは稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 78 | `openStore` | `openStoreCatch` | 5 | 3 | FunctionCustomError（既に開店済み等） |
| 79 | `openStore` | `openStoreGenericCatch` | 5 | 3 | 想定外エラー |
（closeStoreTerminal同様にopenStoreTerminal前に作成してデプロイした関数かな）

### `openStoreTerminal`（端末開店パイプライン）

**UI 操作経路**: `Terminal ホーム` → 日付／営業状態 Chip タップ → ダイアログ「開閉店管理」→「開店処理を開始する」（`openStoreTerminal` Callable）
**呼び出しタイミング**: 1 日 1 回（開店時）。admin 権限端末から実行。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 80 | `openStoreTerminal` | `openTerminalPreflight` | 5 | 3 | 事前チェック失敗（状態ドキュメント欠損・ステータス不正等） |
| 81 | `openStoreTerminal` | `acquireProcessingLease` | 5 | 3 | 排他制御リース取得失敗 |
| 82 | `openStoreTerminal` | `runOpenStep.${stepName}` | 5 | 3 | パイプラインステップ（verifyPreconditions / forceCleanup / finalizeOpenStateDoc）の失敗 |

### `temporaryUnlockAlreadyRunningDifferentDateTerminal`（緊急一時解除）

**UI 操作経路**: `Terminal ホーム` → 強警告ゲート（`StrongWarningGate`）→「緊急一時解除（◯分）」→ ダイアログ「緊急一時解除」→「実行」
**呼び出しタイミング**: 端末の営業日が実際の営業日と異なる場合の緊急対応。非常に稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 83 | `temporaryUnlockAlreadyRunningDifferentDateTerminal` | `cloudTasksCreateTask` | 3 | 1 | 再評価 Cloud Task 予約失敗。一時解除自体は成功するが再評価が行われない |

### `updateUnclockedAttendanceWithAuth`（パスワード認証退勤更新）

**UI 操作経路**: AppBar「閉店前確認」→ 未退勤スタッフの扱い（パスワード認証による退勤更新。画面内の導線に従う）
**呼び出しタイミング**: 閉店前に未退勤スタッフがいる場合。1 日 0〜数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 84 | `updateUnclockedAttendanceWithAuth` | `passwordClockOutUpdate` | 3 | 1 | Firestore 更新失敗。退勤記録が残らず閉店ブロッカーになりうる |

---

## tournament_activeTournament

### `addTableToTournament`（卓追加）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ 卓管理 → 卓追加ダイアログ → 追加
**呼び出しタイミング**: トーナメント中に卓を追加するとき。1 トーナメントに 0〜数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 85 | `addTableToTournament` | `addTableToTournamentCatch` | 3 | 5 | FunctionCustomError（卓が存在しない、open でない等） |
| 86 | `addTableToTournament` | `addTableToTournamentGenericCatch` | 3 | 5 | 想定外エラー |

### `addon`（アドオン購入）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ プレイヤー一覧 → 対象プレイヤー → アドオンポップアップ → 実行
**呼び出しタイミング**: トーナメント中にプレイヤーがアドオンを購入するたび。頻繁。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 87 | `addon` | `recordTournamentActionBestEffort` | 1 | 5 | アドオン成功後のアクション記録失敗。メイン処理は成功済み |
| 88 | `addon` | `addonMainCatch` | 5 | 5 | アドオン処理全体の失敗。プレイヤーがアドオンできない |
| 89 | `addon` | `addonOperationLogWrite` | 1 | 1 | メイン失敗後の操作ログ書き込みも失敗（二重障害） |

### `assignSeatToPlayer`（プレイヤー着席）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ 待機者リスト → 対象プレイヤー → 着席ダイアログ → 席選択 → 確定
**呼び出しタイミング**: プレイヤーを卓に着席させるたび。参加者数分。頻繁。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 90 | `assignSeatToPlayer` | `updatePlaceBestEffort` | 1 | 5 | 着席成功後の伝票プレイス更新失敗。メイン処理は成功済み |
| 91 | `assignSeatToPlayer` | `assignSeatToPlayerCatch` | 5 | 5 | FunctionCustomError（席が埋まっている等） |
| 92 | `assignSeatToPlayer` | `assignSeatGenericCatch` | 5 | 5 | 想定外エラー |
| 93 | `assignSeatToPlayer` | `assignSeatOperationLogWrite` | 1 | 1 | 二重障害 |

### `bulkAddon`（一括アドオン）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ 一括アドオンポップアップ → 対象者選択 → 実行
**呼び出しタイミング**: レベルアップ時に残りプレイヤー全員へ一括適用。1 トーナメントに数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 94 | `bulkAddon` | `recordActionPerUserBestEffort` | 1 | 3 | 一括成功後のユーザー単位アクション記録失敗 |
| 95 | `bulkAddon` | `bulkAddonMainCatch` | 5 | 3 | 一括アドオン全体の失敗 |
| 96 | `bulkAddon` | `bulkAddonOperationLogWrite` | 1 | 1 | 二重障害 |

### `bustAndExit`（バスト＆退席）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ 卓詳細 → 対象プレイヤー → バスト退席ポップアップ → 実行
**呼び出しタイミング**: トーナメント中にプレイヤーがバストして退席するたび。頻繁。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 97 | `bustAndExit` | `updatePlaceBestEffort` | 1 | 5 | バスト成功後の伝票プレイス更新失敗 |
| 98 | `bustAndExit` | `bustAndExitMainCatch` | 5 | 5 | バスト退席全体の失敗 |
| 99 | `bustAndExit` | `bustAndExitOperationLogWrite` | 1 | 1 | 二重障害 |

### `bustAndReentry`（バスト＆リエントリー）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ 卓詳細 → 対象プレイヤー → リエントリーポップアップ → 実行
**呼び出しタイミング**: プレイヤーがバスト後にリエントリーするたび。頻繁。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 100 | `bustAndReentry` | `recordTournamentActionBestEffort` | 1 | 5 | リエントリー成功後のアクション記録失敗 |
| 101 | `bustAndReentry` | `bustAndReentryMainCatch` | 5 | 5 | リエントリー全体の失敗 |
| 102 | `bustAndReentry` | `bustAndReentryOperationLogWrite` | 1 | 1 | 二重障害 |

### `createTemporaryTable`（一時テーブル作成）

**UI 操作経路**: `Terminal ホーム` → AppBar「システム設定」→ ListTile「一時テーブル作成」→ AppBar「一時テーブル作成」→ 入力 → 作成
**呼び出しタイミング**: トーナメント用に臨時の卓を追加する場合。非常に稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 103 | `createTemporaryTable` | `createTemporaryTableCatch` | 1 | 1 | FunctionCustomError（テーブル名重複等） |
| 104 | `createTemporaryTable` | `createTemporaryTableGenericCatch` | 1 | 1 | 想定外エラー |

### `getRankingData`（ランキングデータ取得）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ AppBar「順位確定」（表示・編集時に `getRankingData`）
**呼び出しタイミング**: トーナメント終了前後にランキングを確認・設定するたび。1 トーナメントに数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 105 | `getRankingData` | `getRankingDataCatch` | 5 | 5 | FunctionCustomError（プライズ未確定等）。ランキング画面が開けない |
| 106 | `getRankingData` | `getRankingDataGenericCatch` | 5 | 5 | 想定外エラー |

### `pauseTournament`（トーナメント一時停止）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→「一時停止」
**呼び出しタイミング**: トーナメント中にブレイクや問題対応で一時停止するとき。1 トーナメントに 0〜数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 107 | `pauseTournament` | `pauseTournamentCatch` | 5 | 3 | FunctionCustomError（既に停止中等） |
| 108 | `pauseTournament` | `pauseTournamentGenericCatch` | 5 | 3 | 想定外エラー |
（AdminControlsから呼ばれているがAdminControlsは現在使用していない。主要は3にする可能性あり）

### `registerForTournament`（LIFF 参加登録）

**UI 操作経路**: LIFF（LINE アプリ内）→ トーナメント一覧 → 対象トーナメント → 参加登録ボタン
**呼び出しタイミング**: 顧客が LINE からトーナメントに参加するたび。参加者数分。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 109 | `registerForTournament` | `recordTournamentAction` | 1 | 5 | 参加成功後のアクション記録失敗（ベストエフォート） |
| 110 | `registerForTournament` | `registerTournamentFlow` | 5 | 5 | 参加フロー全体の失敗。顧客がトーナメントに参加できない |
| 111 | `registerForTournament` | `recordFailureOperationLog` | 1 | 1 | 二重障害 |

### `registerParticipants`（端末から参加者一括登録）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ 参加者登録ダイアログ → 複数名選択 → 登録
**呼び出しタイミング**: スタッフがトーナメントに参加者を一括で登録するたび。1 トーナメントの開始時。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 112 | `registerParticipants` | `recordActionPerUserBestEffort` | 1 | 5 | 登録成功後のユーザー単位アクション記録失敗 |
| 113 | `registerParticipants` | `registerUserFailed` | 5 | 5 | ループ内で特定ユーザーの登録失敗。他のユーザーは継続 |
| 114 | `registerParticipants` | `registerParticipantsMainCatch` | 5 | 5 | 一括登録全体の失敗 |
| 115 | `registerParticipants` | `registerParticipantsOperationLogWrite` | 1 | 1 | 二重障害 |

### `removeTableFromTournament`（卓削除）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ 卓管理 → 卓削除
**呼び出しタイミング**: トーナメント中に不要になった卓を外すとき。稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 116 | `removeTableFromTournament` | `removeTableFromTournamentCatch` | 3 | 3 | FunctionCustomError |
| 117 | `removeTableFromTournament` | `removeTableFromTournamentGenericCatch` | 3 | 3 | 想定外エラー |

### `reseatAllPlayers`（全員リシート）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ リシートダイアログ → 実行
**呼び出しタイミング**: テーブルブレイク等で全員を再配置するとき。1 トーナメントに数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 118 | `reseatAllPlayers` | `updatePlacePerAssignmentBestEffort` | 1 | 3 | リシート成功後の伝票プレイス更新失敗 |
| 119 | `reseatAllPlayers` | `reseatAllPlayersCatch` | 5 | 3 | FunctionCustomError |
| 120 | `reseatAllPlayers` | `reseatAllPlayersGenericCatch` | 5 | 3 | 想定外エラー |
| 121 | `reseatAllPlayers` | `reseatAllPlayersOperationLogWrite` | 1 | 1 | 二重障害 |

### `resumeTournament`（トーナメント再開）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→「再開」
**呼び出しタイミング**: 一時停止後に再開するとき。1 トーナメントに 0〜数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 122 | `resumeTournament` | `resumeTournamentCatch` | 5 | 3 | FunctionCustomError（停止中でない等） |
| 123 | `resumeTournament` | `resumeTournamentGenericCatch` | 5 | 3 | 想定外エラー |
（AdminControlsから呼ばれているがAdminControlsは現在使用していない。主要は3にする可能性あり）

### `setRankingData`（ランキング確定・プライズ付与）

**UI 操作経路**: `Terminal ホーム` →「Tournament Home」→ AppBar「スケジュール済みトーナメント一覧」→ 一覧からトーナメント選択 → 進行中トーナメント（AppBar はトーナメント名）→ AppBar「順位確定」→ ダイアログ「順位確定」→「確定」（`setRankingData`）
**呼び出しタイミング**: トーナメント終了時に 1 回。順位付与とプライズ配布を行う。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 124 | `setRankingData` | `setRankingDataRankings` | 5 | 5 | ランキング保存・操作ログ含む全体の失敗。順位が確定できない |
| 125 | `setRankingData` | `setRankingDataPrizeGrant` | 5 | 5 | プライズ付与トランザクション失敗。賞金が配布されない |

---

## tournament_createTournament

### `createScheduledTournament`（スケジュール済みトーナメント作成）

**UI 操作経路**: `Terminal ホーム` →「Tournament 作成」→ AppBar「トーナメント作成」→「単発でのトーナメントの登録（直接入力）」または「カレンダーからトーナメント作成・編集」→ 各作成フローで保存（Callable は画面実装に依存）
**呼び出しタイミング**: 新しいトーナメントをスケジュールするとき。週に数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 126 | `createScheduledTournament` | `enqueueAfterCreate` | 3 | 1 | 作成成功後の Cloud Tasks 同期失敗（ベストエフォート的）。トーナメント自体は作成済み |
| 127 | `createScheduledTournament` | `createScheduledTournamentCatch` | 3 | 1 | FunctionCustomError |
| 128 | `createScheduledTournament` | `createScheduledTournamentGenericCatch` | 3 | 1 | 想定外エラー |

### `createTournamentRecurrence`（定期開催作成）

**UI 操作経路**: `Terminal ホーム` →「Tournament 作成」→ AppBar「トーナメント作成」→「定期開催トーナメントの設定」→ 定期開催一覧・作成フロー（画面ラベルは `RecurringTournamentListPage` 系）
**呼び出しタイミング**: 定期開催ルールを新規に設定するとき。月に 0〜数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 129 | `createTournamentRecurrence` | `enqueueAfterCreate` | 3 | 1 | 先行生成後の Cloud Tasks 同期失敗 |
| 130 | `createTournamentRecurrence` | `createTournamentRecurrenceCatch` | 3 | 1 | FunctionCustomError |
| 131 | `createTournamentRecurrence` | `createTournamentRecurrenceGenericCatch` | 3 | 1 | 想定外エラー |
| 132 | `createTournamentRecurrence` | `createTournamentRecurrenceInnerHelper` | 3 | 1 | 定期開催から 1 件のトーナメント文書を生成するヘルパーの失敗。部分的に生成されない |

### `enqueueTournamentTasks`（手動タスクエンキュー）

**UI 操作経路**: 現時点で Flutter に `httpsCallable('enqueueTournamentTasks')` の呼び出しなし。管理・運用ツール向け
**呼び出しタイミング**: 手動実行のみ。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 133 | `enqueueTournamentTasks` | `enqueueBatchPartialErrors` | 3 | 1 | バッチの一部失敗 |
| 134 | `enqueueTournamentTasks` | `enqueueTournamentTasksCatch` | 3 | 1 | FunctionCustomError |
| 135 | `enqueueTournamentTasks` | `enqueueTournamentTasksGenericCatch` | 3 | 1 | 想定外エラー |

### `runEnqueueTournamentTasks`（トーナメントタスクエンキュー共通コア）

**UI 操作経路**: なし（サーバー内部共通コア。`createScheduledTournament`・`createTournamentRecurrence`・`generateRecurringTournaments`・スケジューラから呼ばれる）
**呼び出しタイミング**: トーナメント作成時・定期生成時・スケジューラ日次実行時に呼ばれる。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 136 | `runEnqueueTournamentTasks` | `enqueueTournamentTask` | 5 | 3 | 個別タスク種別の Cloud Tasks 登録失敗。開催・登録締切が機能しない |
| 137 | `runEnqueueTournamentTasks` | `processTournamentBatchItem` | 5 | 3 | バッチ内 1 トーナメントの enqueue 全体失敗 |

### `runGenerateRecurringTournaments`（定期トーナメント自動生成コア）

**UI 操作経路**: なし（`schedulerSupervisor` → `scheduledJobTaskExecutors` → Cloud Task 経由で自動実行）
**呼び出しタイミング**: 毎週 1 回（木曜 04:50 JST デフォルト）。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 138 | `runGenerateRecurringTournaments` | `validateRecurringStoreTenant` | 3 | 1 | 定期開催ドキュメントの storeId/tenantId 不正（スキップ）。データ不備 |
| 139 | `runGenerateRecurringTournaments` | `parseRecurrenceInterval` | 3 | 1 | 間隔文字列パース不能（スキップ）。データ不備 |
| 140 | `runGenerateRecurringTournaments` | `parseRecurrenceIntervalWrongType` | 3 | 1 | 間隔フィールド型不正（スキップ）。データ不備 |
| 141 | `runGenerateRecurringTournaments` | `enqueueAfterGenerate` | 3 | 1 | 生成後の Cloud Tasks 同期失敗 |
| 142 | `runGenerateRecurringTournaments` | `runGenerateRecurringTournamentsOuterCatch` | 5 | 1 | 自動生成ジョブ全体の失敗。翌週のトーナメントが生成されない |

### `updateScheduledTournamentStartAt`（開始時刻変更）

**UI 操作経路**: `Terminal ホーム` →「Tournament 作成」→「カレンダーからトーナメント作成・編集」→ AppBar「カレンダーからトーナメント作成・編集」→ 対象トーナメント → ダイアログ「開始時刻編集」
**呼び出しタイミング**: 開始時刻を変更するとき。稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 143 | `updateScheduledTournamentStartAt` | `validateStartAtUpdatePreconditions` | 3 | 1 | 業務前提チェック失敗（非 scheduled・アーカイブ済み等） |

### `updateScheduledTournamentStatus`（ステータス変更）

**UI 操作経路**: `Terminal ホーム` →「Tournament 作成」→「カレンダーからトーナメント作成・編集」→ カレンダー／一覧から対象トーナメント → ステータス変更（キャンセル・復旧。ラベルは画面実装に依存）
**呼び出しタイミング**: トーナメントのキャンセルや復旧操作時。稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 144 | `updateScheduledTournamentStatus` | `validateStatusTransition` | 3 | 1 | 状態遷移検証失敗（不正な遷移・regEndAt 不正等） |

---

## user

### `generateQRCode`（QR コード生成）

**UI 操作経路**:
- LIFF → ユーザー登録完了後に自動生成
- LIFF → マイページ → QR コード表示（期限切れ時に再生成）
- `Terminal ホーム` 経由の登録フロー完了時の自動生成（`lib/` 内に `httpsCallable('generateQRCode')` の直接呼び出しは見つからず、バックエンド／別経路で発火する想定）

**呼び出しタイミング**: ユーザー / スタッフ登録時、および QR 期限切れ時の再生成。来店のたびに QR が必要なため高頻度。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 145 | `generateQRCode` | `transaction` | 5 | 5 | QR URL・有効期限のトランザクション失敗。入店用 QR が生成できない |
| 146 | `generateQRCode` | `generateQRCodeOuterCatch` | 5 | 5 | QR 生成フロー全体の失敗 |

---

## webhook

### `lineWebhook`（LINE Webhook ハンドラ）

**UI 操作経路**: なし（LINE プラットフォームからの HTTP POST。ユーザーの LINE 操作がトリガー）
**呼び出しタイミング**:
- `follow / unblock`: ユーザーが LINE 公式アカウントを友だち追加またはブロック解除したとき
- `postback`: ユーザーが LINE メッセージ内のボタン（シフト辞退等）をタップしたとき

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 147 | `lineWebhook` | `token` | 5 | 1 | チャネルアクセストークン未設定。設定ミスで全 Webhook が機能しない。一度発生すると永続 |
| 148 | `lineWebhook` | `replyPostbackPlanDisabledNotOk` | 1 | 1 | 通信プラン時の機能無効リプライの非 200 応答。限定的シナリオ |
| 149 | `lineWebhook` | `replyPostbackPlanDisabledCatch` | 1 | 1 | 同上の例外 |
| 150 | `lineWebhook` | `replyPostbackDeclineConfirmNotOk` | 1 | 1 | シフト辞退確認リプライの非 200 応答。辞退処理自体は成功済み |
| 151 | `lineWebhook` | `replyPostbackDeclineConfirmCatch` | 1 | 1 | 同上の例外 |
| 152 | `lineWebhook` | `postback` | 3 | 1 | postback 処理全般の失敗（シフト辞退ボタン等）。ユーザー操作が反映されない |
| 153 | `lineWebhook` | `followOrUnblock` | 3 | 3 | 友だち追加 / ブロック解除時のリッチメニュー紐付け失敗。メニューが正しく表示されない |
| 154 | `lineWebhook` | `handler` | 5 | 5 | 最外周の未処理例外。全 Webhook イベントが処理されない |

### `linkStaffRichMenu`（スタッフ用リッチメニュー紐付け）

**UI 操作経路**: `lineWebhook` の `follow/unblock` イベントから呼ばれる / LIFF 起動時に `ensureStaffRichMenu` から呼ばれる
**呼び出しタイミング**: スタッフが LINE アカウントを追加した時、または LIFF を起動した時。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 155 | `linkStaffRichMenu` | `linkStaffRichMenuHttpFail` | 3 | 3 | LINE API の非 200 応答。スタッフメニューが紐付かない |
| 156 | `linkStaffRichMenu` | `linkStaffRichMenuCatch` | 3 | 3 | 紐付け処理の例外 |

### `linkUserRichMenu`（ユーザー用リッチメニュー紐付け）

**UI 操作経路**: `lineWebhook` の `follow/unblock` イベントから呼ばれる（スタッフでないユーザー）
**呼び出しタイミング**: ユーザーが LINE 公式アカウントを友だち追加した時。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 157 | `linkUserRichMenu` | `linkUserRichMenuHttpFail` | 3 | 3 | LINE API の非 200 応答 |
| 158 | `linkUserRichMenu` | `linkUserRichMenuCatch` | 3 | 3 | 紐付け処理の例外 |

### `sendLineButtonMessage`（LINE ボタンメッセージ送信）

**UI 操作経路**: 現時点で `functions/src` 内に呼び出し元なし（定義のみ。将来利用を想定した共通ユーティリティ）
**呼び出しタイミング**: 現在は使用されていない。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 159 | `sendLineButtonMessage` | `token` | 1 | 1 | 現在未使用。トークン未設定 |
| 160 | `sendLineButtonMessage` | `validate` | 1 | 1 | 現在未使用。パラメータ不正 |
| 161 | `sendLineButtonMessage` | `buttonPushResponseNotOk` | 1 | 1 | 現在未使用。LINE API 非 200 |
| 162 | `sendLineButtonMessage` | `buttonPushCatch` | 1 | 1 | 現在未使用。送信例外 |
（使用予定なし）

### `sendLinePushMessage`（LINE テキスト Push 送信）

**UI 操作経路**: `Admin` → グリッド「シフト」→ AppBar「シフト」→「シフトカレンダー」→ AppBar「シフトカレンダー」→ タブ「募集作成」→「募集内容を管理者に送信」（Callable は `sendRecruitmentNotification`。ログ上の送信処理は `sendLinePushMessage` に紐づく）
**呼び出しタイミング**: シフト募集通知を LINE で送信するとき。月に数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 163 | `sendLinePushMessage` | `token` | 3 | 1 | トークン未設定。設定ミス |
| 164 | `sendLinePushMessage` | `validate` | 1 | 1 | 送信先 / 本文パラメータ不正 |
| 165 | `sendLinePushMessage` | `pushResponseNotOk` | 3 | 1 | LINE API 非 200。通知が届かない |
| 166 | `sendLinePushMessage` | `pushCatch` | 3 | 1 | Push 送信の例外 |

---

## shared

### `scheduleGenerateNextYearBusinessHours`（翌年営業時間自動生成）

**UI 操作経路**: なし（`scheduledJobTaskExecutors` 経由で Cloud Task として年次自動実行）
**呼び出しタイミング**: 年 1 回。翌年 12 ヶ月分の営業時間を自動生成。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 167 | `scheduleGenerateNextYearBusinessHours` | `generateMonthFailed` | 3 | 1 | 特定月の生成失敗。他の月は継続 |
| 168 | `scheduleGenerateNextYearBusinessHours` | `taskOuterCatch` | 3 | 1 | タスク全体の失敗。翌年の営業時間が生成されない |

### `getPayrollConfig`（給与設定取得）

**UI 操作経路**: なし（サーバー内部ヘルパー。`executeMonthlyPayroll`, `getPayrollCandidates`, `processStaffPayroll`, `payrollNotificationScheduler` から呼ばれる）
**呼び出しタイミング**: 給与関連処理の実行時。月次。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 169 | `getPayrollConfig` | `config_read` | 3 | 1 | Firestore リトライ後にデフォルトへフォールバック。給与計算が不正確になりうる |

### `getSchedulerConfig`（スケジューラ設定取得）

**UI 操作経路**: なし（`schedulerSupervisor` やスケジューラ関連のタスクから呼ばれる）
**呼び出しタイミング**: スケジューラ実行時。日次。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 170 | `getSchedulerConfig` | `config_read` | 3 | 3 | フォールバック適用。スケジュール判断が不正確になりうる |

### `getStoreConfig`（店舗設定取得）

**UI 操作経路**: なし（サーバー内部ヘルパー。多数の Callable・トリガー・サービスから広く参照される共通関数）
**呼び出しタイミング**: 営業日キーの解決、会計処理、開閉店等あらゆる場面で呼ばれる。非常に高頻度。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 171 | `getStoreConfig` | `config_read` | 5 | 5 | Firestore リトライ後にデフォルトへフォールバック。多数の業務処理が誤った設定で動く可能性 |

### `controlHookHttp`（トーナメント制御フック HTTP ハンドラ）

**UI 操作経路**: なし（Cloud Tasks から HTTP POST で呼ばれる。`weeklyPlanner` や `runEnqueueTournamentTasks` が投入したタスクの実行先）
**呼び出しタイミング**: トーナメントの登録締切・開始時刻・レベルアップ等のスケジュールイベントごとに実行。1 日に複数回。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 172 | `controlHookHttp` | `validateControlHookRequest` | 5 | 5 | リクエスト処理中の想定外エラー。タスクが処理されない |
| 173 | `controlHookHttp` | `executeNewPayloadTask` | 5 | 5 | 新形式ペイロードのタスク実行失敗。トーナメント自動制御が機能しない |
| 174 | `controlHookHttp` | `executeLegacyPayloadTask` | 3 | 1 | 旧形式ペイロードのアクション実行失敗 |

### `getLineConfig`（LINE 連携設定取得）

**UI 操作経路**: なし（`warmupSecrets()` 内部で呼ばれる。コールドスタート時のシークレットプリロード）
**呼び出しタイミング**: Functions インスタンスのコールドスタート時。現時点では `warmupSecrets` に外部呼び出し元なし（定義のみ）。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 175 | `getLineConfig` | `warmupSecrets` | 3 | 1 | LINE シークレット読み込み失敗。LINE 連携が初期化されず後続の Webhook 等に影響 |
（`warmupSecrets()`を使用している箇所がないため現在は発火することがないのが実情）

### `updateDeviceOptions`（端末オプション設定更新）

**UI 操作経路**: `Admin` → グリッド「デバイス管理」→ AppBar「デバイス管理」→ 対象デバイスの「オプション編集」→ ダイアログ「オプション編集: {デバイス名}」→ オプションのチェックボックス（表示ラベルは種別ごと）→「保存」
**呼び出しタイミング**: 端末の機能フラグを変更するとき。初期設定や運用変更時。稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 176 | `updateDeviceOptions` | `updateDeviceOptionsCatch` | 1 | 1 | Firestore 更新失敗。端末設定が反映されない |

### `updateDeviceRole`（端末ロール変更）

**UI 操作経路**: `Admin` → グリッド「デバイス管理」→ AppBar「デバイス管理」→ 対象デバイスの「role変更:」ドロップダウン（`admin` / `terminal`）
**呼び出しタイミング**: 端末の権限を変更するとき。初期設定や運用変更時。稀。

| # | functionEntry | operation | 推奨 主要 | 推奨 高頻度 | 補足 |
|---|---------------|-----------|----------|-----------|------|
| 177 | `updateDeviceRole` | `updateDeviceRoleCatch` | 1 | 1 | Firestore 更新失敗。端末ロールが反映されない |


観点２以降では主要でなくても例外は逃さないようにしたい