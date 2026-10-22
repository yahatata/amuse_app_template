# Phase6 Step4 仕様書: storeMeta 監視と assessment に基づく UI 表示・操作

storeMeta/currentBusinessDay の **closeAssessment / openAssessment / state / processing** を UI がどう解釈し、どの表示・導線・操作を提供するかを仕様化する。  
**コード修正は行わない。本ドキュメントは仕様の確定のみを行う。**

---

## 1. Scope / 目的 / 非スコープ

### 1.1 目的

- **closeAssessment / openAssessment** の result・blockers・suppressedByOverride および **state**（status / currentBusinessDateKey / lastClosedBusinessDateKey / lastError）・**processing**（Step3 の lease）に基づき、画面上で「何をいつどこに表示し、どの操作を許すか」を一意に決める。
- 特に **「閉店時間を過ぎているのに閉店処理が未実行」** のとき:
  - **store management 端末**（admin または terminal＋営業管理）: 閉店処理の実行、または営業継続（その操作に**必ず** Cloud Tasks への enqueue を伴う）を提示する。
  - **非 store management 端末**: 強警告は表示するが、解除操作は出さず「管理者へ依頼」のみ表示し、閉店処理なしに次営業日が開始される事故を防ぐ。
- **営業継続**を選択した場合、その操作に**必ず**指定時間後に **closeAssessmentTask** を再実行する Cloud Tasks の enqueue を伴う仕様とする（単独の「リマインド」ボタンは提供しない）。

### 1.2 スコープ

- storeMeta/currentBusinessDay の購読と、その内容に基づく **表示種別・文言・ボタン・権限別挙動** の決定。
- **リマインド**の「いつ・どの payload で・どのキューに enqueue するか」の仕様（実装は本 Step では行わないが、仕様として明文化する）。
- 対象画面: terminalHomePage を中心とし、日付表示部・開閉店管理ダイアログへの組み込み。他画面（tournament_home_page, table_detail_page, order_management_page, side_game_table_list）への表示方針。

### 1.3 非スコープ

- closeAssessmentTask / openAssessmentTask の**既存実装の変更**（コード修正禁止のため）。
- weeklyPlanner の変更。
- manualOverride を**書き込む** UI（「営業継続」で manualOverride を設定する処理は、既存または別 Step で実装される想定。本仕様では「manualOverride が存在するときの表示の扱い」のみ定義する）。

---

## 2. データモデル

### 2.1 storeMeta/currentBusinessDay（state 部分）

**根拠**: `functions/src/helpers/stateDoc/types.ts` の `CurrentBusinessDayDoc`、および `createInitialStateDocCallable.ts` の初期値。

| フィールド | 型 | 説明 |
|------------|-----|------|
| status | `'closed' \| 'running' \| 'error'` | 営業状態。 |
| currentBusinessDateKey | `string \| null` | 現在の営業日（YYYY-MM-DD）。閉店後は null。 |
| lastClosedBusinessDateKey | `string \| null` | 直近で閉店した営業日。 |
| updatedAt | Timestamp | 更新時刻。 |
| source | string | 更新元（例: 'initial', 'terminal', 'manual'）。 |
| lastError | `{ code, message, failedStep, at, context? } \| null` | 直近のエラー。 |
| processing | `ProcessingLeaseDoc \| null \| undefined` | Step3 の lease（runId, startedAt, leaseExpiresAt, kind: 'close' \| 'open'）。 |

**ProcessingLeaseDoc**（根拠: types.ts）: `runId`, `startedAt`, `leaseExpiresAt`, `kind: 'close' | 'open'`。

**注**: TypeScript の CurrentBusinessDayDoc には closeAssessment / openAssessment / manualOverride は**含まれていない**。Firestore 上では createInitialStateDocCallable および closeAssessmentTask / openAssessmentTask がこれらを書き込む（後述）。

### 2.2 closeAssessment のスキーマ（コード確定）

**根拠**: `functions/src/tasks/closeAssessmentTask.ts` の `transaction.update(stateDocRef, { closeAssessment: { ... } })` で設定されるフィールドのみ。

| フィールド | 型 | 説明 |
|------------|-----|------|
| idempotencyKey | string | `close_assessment_${intendedBusinessDateKey}_${scheduledAt}`。 |
| intendedBusinessDateKey | string | 対象営業日（YYYY-MM-DD）。 |
| decidedAt | Timestamp | 認定実行時刻。 |
| result | string | 下記 §3 の一覧。 |
| blockers | string[] | 下記 §3 の付与条件。 |
| source | string | `'task'`。 |
| scheduledAt | string | payload の scheduledAt（ISO 8601 等）。 |
| lastSuppressedAt | Timestamp | **result が needs_manual_close_suppressed のときのみ**設定。 |
| suppressedByOverride | boolean | **同上**。`true`。 |

### 2.3 openAssessment のスキーマ（コード確定）

**根拠**: `functions/src/tasks/openAssessmentTask.ts` の `transaction.update(stateDocRef, { openAssessment: { ... } })`。

| フィールド | 型 | 説明 |
|------------|-----|------|
| idempotencyKey | string | `open_assessment_${intendedBusinessDateKey}_${scheduledAt}`。 |
| intendedBusinessDateKey | string | 対象営業日。 |
| decidedAt | Timestamp | 認定実行時刻。 |
| result | string | 下記 §3 の一覧。 |
| blockers | string[] | 下記 §3 の付与条件。 |
| source | string | `'task'`。 |
| scheduledAt | string | payload の scheduledAt。 |
| lastSuppressedAt | Timestamp | manualOverride（open_skip）が有効なときのみ設定。 |
| suppressedByOverride | boolean | 同上。`true`。 |

**重要**: 開店側では **result は「needs_manual_open_suppressed」等には変更されない**。result は `ready_to_open` または `needs_manual_open` のまま、`suppressedByOverride === true` で抑制状態を表す（根拠: openAssessmentTask.ts 159–166 行目「resultは維持」）。

### 2.4 manualOverride の扱い

**根拠**: closeAssessmentTask 129–137 行、openAssessmentTask 158–166 行。createInitialStateDocCallable で `manualOverride: null` を set。

- **close_skip**: type === 'close_skip', intendedBusinessDateKey 一致、overrideUntil >= 現在時刻のとき、閉店認定は result を **needs_manual_close_suppressed** にし、警告を出さない。
- **open_skip**: type === 'open_skip', intendedBusinessDateKey 一致、overrideUntil >= 現在時刻のとき、開店認定は result を変更せず lastSuppressedAt / suppressedByOverride のみ付与。UI では「開店の手動スキップが有効」として扱うか、通常の needs_manual_open 表示のままとする（本仕様では「開店側は強警告モーダルを出さない」ため、open の suppressed は情報表示の抑制のみでよいとする）。

**UI での扱い**: 警告／情報の**抑制するかどうか**は、**assessment.suppressedByOverride === true** を**主条件**とする。サーバ（タスク）が決定した suppressedByOverride を信頼することで、端末時刻ズレによる overrideUntil 比較のブレを避ける。**manualOverride.overrideUntil** は「いつまで抑制かを表示する用途」に用い、抑制の有無の比較は補助扱いとする（overrideUntil を主にした二段判定は行わない）。

---

## 3. assessment の result 一覧（コード確定版）

### 3.1 closeAssessment.result

**根拠**: `functions/src/tasks/closeAssessmentTask.ts` の分岐順序（70–171 行）。

| result | 発生条件（要約） | blockers | コード根拠（行番号） |
|--------|------------------|----------|----------------------|
| **skipped** | intendedBusinessDateKey が JST 当日・前日のどちらでもない | `['date_out_of_range']` | 70–84 |
| **already_closed** | status === 'closed' かつ lastClosedBusinessDateKey === intendedBusinessDateKey | `[]` | 93–105 |
| **next_day_started** | status === 'running' かつ currentBusinessDateKey !== intendedBusinessDateKey | `[]` | 108–122（closeAssessmentTask.ts） |
| **needs_manual_close_suppressed** | 有効な manualOverride（close_skip, 同一 intended, overrideUntil >= now）がある | `[]` または `['activeStaysNotEmpty']` | 129–137, 145–156 |
| **needs_manual_close** | 上記でなく、status === 'running' かつ currentBusinessDateKey === intendedBusinessDateKey | `[]` または `['activeStaysNotEmpty']` | 138–139, 145–156 |
| **skipped** | 上記のいずれにも当てはまらない（例: status === 'error'、または status === 'closed' だが lastClosed !== intended） | `[]` | 140–142 |

**blockers の付与**: result が needs_manual_close または needs_manual_close_suppressed のときのみ、activeStays で `isActive === true` が 1 件以上あれば `'activeStaysNotEmpty'` を追加（149–156 行）。

### 3.2 openAssessment.result

**根拠**: `functions/src/tasks/openAssessmentTask.ts` の分岐順序（70–181 行）。

| result | 発生条件（要約） | blockers | コード根拠 |
|--------|------------------|----------|------------|
| **skipped** | intendedBusinessDateKey が JST 当日・翌日のどちらでもない | `['date_out_of_range']` | 70–84 |
| **already_running** | status === 'running' かつ currentBusinessDateKey === intendedBusinessDateKey | `[]` | 94–106 |
| **skipped** | status === 'running' かつ currentBusinessDateKey !== intendedBusinessDateKey | `['already_running_different_date']` | 110–123（openAssessmentTask.ts） |
| **ready_to_open** | status === 'closed' かつ lastClosedBusinessDateKey が存在し lastError === null（blockers が 0 件） | `[]` | 134–154（status !== 'closed' のとき status_not_closed を push するため、ready_to_open は **status === 'closed' のときのみ**） |
| **needs_manual_open** | status === 'closed' または status === 'error' のとき、blockers が 1 件以上 | 下記 | 134–154 |

**openAssessment の blockers 付与条件**（131–146 行）:

- `status !== 'closed'` のとき → `'status_not_closed'` を追加（したがって **status === 'error' のときは常に blockers に status_not_closed が入り、result は needs_manual_open**）。
- `!lastClosedBusinessDateKey` → `'lastClosedBusinessDateKey_missing'` を追加。
- `lastError !== null` → `'lastError_exists'` を追加。

**結論**: **ready_to_open は status === 'closed' かつ lastClosedBusinessDateKey が存在し lastError === null のときのみ**。status === 'error' のときは常に needs_manual_open（blockers に少なくとも 'status_not_closed'）。

### 3.3 null / 不正値

- **null**: createInitialStateDocCallable で set される（35–37 行）。またはタスクが一度も実行されていない。
- **不正値**: result が上記のいずれでもない、または result フィールド欠損・型が string でない。旧バージョンや不具合で発生し得る。

### 3.4 閉店ターミナル（closeStoreTerminal）による openAssessment の更新

**根拠**: `functions/src/storeManagement/closeStoreTerminal.ts` の finalizeCloseStateDoc ステップ。

- **閉店時に null にする assessment は closeAssessment のみ**という仕様は変更しない（openAssessment は通常クリアしない）。
- **例外**: openAssessment の blockers に **already_running_different_date** が含まれる場合のみ、閉店完了時に openAssessment を**上書き更新**する。
  - **result** を `'ready_to_open'` に設定する。
  - **blockers** から `'already_running_different_date'` を削除する（他フィールドは維持）。
- これにより、閉店済み（status === 'closed', currentBusinessDateKey === null）なのに「閉店処理／営業継続を選べ」の強警告ゲートが残る事態を防ぐ。

---

## 4. UI 全体の優先順位ルール（競合解決）

### 4.0 強警告・弱警告の定義と解除条件（必読）

**強警告（Strong Warning）** の表示仕様は端末種別で異なる。

- **store management 端末**:
  - **ブロッキング強警告ダイアログ**（dismiss 不可・常駐ゲート）。
  - 閉じるボタンなし、モーダル外タップで閉じない、Back 操作でも閉じない。
  - 条件が成立している限り画面操作をブロックし、常に表示され続ける。
- **非 store management 端末**:
  - 初回は**ダイアログを表示してよい**（dismiss 可能。初回提示用途）。
  - その後、**AppBar 直下の Inline Banner（ページ内インライン通知）** を表示する。Banner は**条件が成立している限り閉じられない（常駐）**が、**画面操作はブロックしない**（操作は可能）。
  - 解除操作（閉店処理・営業継続等）は出さず、「管理者へ依頼」文言のみ表示する。

「定期的に再表示」「低頻度で再表示」などの仕様は**不要かつ不採用**とする。

**弱警告（Light Warning）** の表示仕様:
- **store management 端末のみ**: 状況共有のためのダイアログ表示（dismiss 可）をしてよい。
- **非 store management 端末**: 弱警告は**表示しない**（ダイアログもバナーも不要）。

**強警告が消える条件（解除条件）**  
強警告が消えるのは、**「ユーザーが閉じたから」でも「一度見たから」でもなく、Firestore の状態が変わり当該強警告の表示条件が不成立になったときのみ**である。enqueue 自体は状態を変えないため、「リマインド設定」単体で解除されるわけではない。

- **store management 端末**: 状態を変える操作（閉店処理の実行、**営業継続**等）を提供する。**営業継続**を選んだ場合は、その操作に**必ず** manualOverride の設定と、指定時間後の closeAssessmentTask 実行用 Cloud Tasks の enqueue が含まれる。override により suppressed になれば表示条件が不成立となり強警告は消える。
- **非 store management 端末**: 解除操作を一切持たない。条件が成立している限り強警告（Banner）は表示され続ける。管理者が store management 端末で閉店処理等を行い Firestore が更新され、購読により条件が不成立になったときに初めて消える。

**強警告の重複表示の制御**  
同時に複数の強警告条件が成立していても、**画面上に表示する強警告 UI は 1 つだけ**とする。優先順位は下記 §4 の番号順を維持し、**最上位の 1 件のみ**を表示する。下位の強警告条件は、強警告本文内に「他にも未解決の警告がある可能性があります」程度を補助記載してよい（詳細の併記は任意）。  
**補足**: **status === 'error' の表示は強警告とは別枠**であり、強警告 UI の「1 件制御」には含めない。したがって、エラー表示と強警告 1 件の**共存**が許される（必要なら error 表示＋強警告 1 件を同時に表示してよい）。

---

表示は次の**優先順位**で決定する。**強警告は同時に 1 件のみ表示**（§4.0）。複数が同時に成立する場合は番号の小さい方を最上位とし、その 1 件のみ強警告 UI を出す。下位は強警告としては重ねず、必要なら本文で「他にも未解決の警告がある可能性」を補足する。

1. **status === 'error'**  
   → 最優先で「エラー状態」を表示する。**当面はダイアログで lastError の内容（code / message / failedStep 等）をそのまま表示する**。復旧操作の具体的 UI は将来拡張の対象とする。なお、今後の実装として「エラー内容と出力の一覧を整備し、UI でエラーが分かるようにする」必要がある可能性がある（Phase6 Step7 に記載）。

2. **closeAssessment.result === 'needs_manual_close'** かつ、**closeAssessment.suppressedByOverride が true でない**  
   → **強警告**（§4.0）。対象営業日は **closeAssessment.intendedBusinessDateKey**。store management 端末は「閉店処理へ」「営業継続」（営業継続時は閉店時間の目安を選択し、override＋enqueue を 1 操作で実行）。非 store management 端末は解除操作なし。初回ダイアログ（dismiss 可）ののち画面上部インライン通知（Inline Banner）常駐（閉じられない／操作可能）。管理者へ依頼文言のみ。

3. **closeAssessment.result === 'next_day_started'**  
   → **store management 端末では必ず警告を表示する**（強警告または弱警告。§4.1 の分岐に従う）。**非 store management 端末では、弱のときは表示しない**（強のときのみ強警告を表示）。ダイアログ内に**閉店対象日（intendedBusinessDateKey）**と**現在営業日（currentBusinessDateKey）**の両方を明示する。  
   **強警告と弱警告の分岐**は、§4.1「事故疑いシグナル」に従う。  
   - 事故疑いシグナルが**強**のとき → 強警告（§4.0）。store management 端末は「〇〇（閉店対象日）の閉店処理へ」「営業継続」（同上）。非 store management 端末は解除操作なし。初回ダイアログ（dismiss 可）→ 画面上部インライン通知（Inline Banner）常駐（閉じられない／操作可能）。管理者へ依頼文言のみ。  
   - 事故疑いシグナルが**弱**のとき → **弱警告**（§4.0）。store management 端末のみダイアログ（dismiss 可）で表示。**非 store management 端末は表示しない**。

4. **openAssessment.result === 'skipped'** かつ **blockers に 'already_running_different_date' を含む**  
   → **強警告**（§4.0。次営業日開始側のガード：未閉店疑いの最重要シグナル）。開店処理が「別の営業日」で走っているため、**現在 running の営業日の閉店未実施の可能性**がある。  
   **閉店を促す対象日**は **state.currentBusinessDateKey（現在営業日）** とする。**openAssessment.intendedBusinessDateKey** は「開店認定の対象日」として**補助情報**で表示する。  
   store management 端末は「currentBusinessDateKey の閉店処理へ」「営業継続」（同上）。非 store management 端末は解除操作なし。初回ダイアログ（dismiss 可）→ 画面上部インライン通知（Inline Banner）常駐（閉じられない／操作可能）。管理者へ依頼文言のみ。

5. **openAssessment.result === 'needs_manual_open'**（強警告は出さない）  
   → 情報表示または軽い注意表示。「前営業日継続疑い」の強警告（上記 4）とは文言で区別する。store management 端末は開店処理の導線を出してよい。

6. **processing が存在し now <= leaseExpiresAt（ロック中）**  
   → Step3 と整合し、**閉店処理へ／開店処理へを押した結果**で closeStoreTerminal / openStoreTerminal が failed-precondition を返したときに「〇〇処理が他の操作で実行中です。完了するまでお待ちください。」を表示する。assessment による強警告とは別レイヤー（強警告表示中に「閉店処理へ」を押し、ロックで弾かれた場合は SnackBar 等で failed-precondition を表示する）。

7. その他（already_closed, next_day_started 以外の skipped, ready_to_open, needs_manual_close_suppressed 等）  
   → 仕様 §6・§7 の決定表に従い、表示なし／軽い情報／日付部 warning のいずれか。**ready_to_open の表示**は、closeAssessment による強警告・弱警告と重複している場合は**警告を優先し ready_to_open は表示しない**。警告が解消され、改めて ready_to_open 条件が成立した場合には表示する。

### 4.1 事故疑いシグナル（next_day_started の強／弱の分岐）

**目的**: next_day_started を一律強警告にせず、典型的な「前日閉店忘れ・当日営業中」は強警告とし、誤タスク・古いタスクの可能性が高い場合は弱警告（**store management 端末のみ**表示）にしてノイズを抑える。**store management 端末では必ず警告（強または弱）を表示する**。弱のときは**非 store management 端末には表示しない**（§4 の 3 と整合）。

**根拠**: closeAssessment で next_day_started が付く条件は **status === 'running' かつ currentBusinessDateKey !== intendedBusinessDateKey**（`functions/src/tasks/closeAssessmentTask.ts` 108–122 行）。

**日付差分の定義（機械的）**:

- `currentBusinessDateKey`, `intendedBusinessDateKey` はともに `YYYY-MM-DD` 形式の文字列とする。
- **diffDays(current, intended)** = current を日付として解釈した「日」から、intended を日付として解釈した「日」を引いた日数（整数）。  
  - 実装例（JavaScript の日付のみで計算）: 両方を `new Date(yyyy, mm-1, dd)` のようにパースし、UTC ミリ秒差を 86400000 で割って切り捨てた整数。  
  - 例: current=2025-02-10, intended=2025-02-09 → diffDays = 1。current=2025-02-12, intended=2025-02-09 → diffDays = 3。

**採用する分岐条件**:

| 条件 | 事故疑いシグナル | UI 表示種別 |
|------|------------------|-------------|
| diffDays(currentBusinessDateKey, closeAssessment.intendedBusinessDateKey) **=== 1** | **強** | 強警告（§4.0）。典型的な「前日閉店忘れ・当日営業中」。 |
| diffDays **>= 2** | **弱** | 弱警告。store management 端末のみダイアログ（dismiss 可）。非 store management 端末は表示しない。古いタスク・誤タスクの可能性が高い。 |
| diffDays **<= 0** | **弱** | 弱警告。同上。日付の前後関係が異常なケース。 |

**補足**: next_day_started のタスクは、closeAssessmentTask 内で intended が「JST 当日または前日」のときのみ実行される（同 72–86 行）。そのうえで status が running かつ current !== intended のとき next_day_started になる。通常は current が intended の「翌日」である diffDays === 1 が典型。diffDays >= 2 は「ずっと古い intended に対するタスクが残っている」などの誤タスクの可能性を想定する。

**分岐の意図と発生頻度**: 上記 diffDays 分岐は**誤タスク／残存タスク等のノイズ抑制**が目的である。通常運用では diffDays は 0 または 1 が多い想定で、**diffDays >= 2 は稀**（レビューで「>=2 が実際起きるの？」と問われた場合の答え: 稀だが、残存タスク・手動日付変更等で発生し得るため弱警告で扱う）。**判定不能**（currentBusinessDateKey が null 等）のときは**弱（弱警告）**とする。分岐条件そのもの（diffDays === 1 → 強、その他 → 弱）は変更しない。

---

## 5. 端末権限ルール

### 5.1 store management 端末の判定（Flutter）

**採用**: 本仕様では端末を次の 2 区分に統一する。

- **store management 端末**: 次のいずれかを満たす端末。  
  - **role === 'admin'**  
  - または **role === 'terminal'** かつ **options.store_management === true**（営業管理オプション有効）
- **非 store management 端末**: 上記以外のすべて（role が terminal で store_management が false の端末、その他）。

**根拠**: `lib/services/device_service.dart` の `getCurrentDevice()` で device を取得し、`role` および `options`（`DeviceOptionKeys.storeManagement` ＝ `'store_management'`）を参照する。`hasOption(DeviceOptionKeys.storeManagement)` は `device.options[optionKey] == true` で判定する（302–308 行）。`lib/services/device_options.dart` で `storeManagement = 'store_management'` が定義されている。

実装時は、**store management 端末かどうか**を `role == 'admin' || (role == 'terminal' && options['store_management'] == true)` で判定する（Callable 側の requireAdmin と同等の「営業管理が可能な端末」として、admin に加え terminal＋store_management を含める）。

### 5.2 権限別の提供内容（強警告・弱警告の文脈）

強警告の表示仕様は §4.0 のとおり。**store management 端末のみ**が解除操作（閉店処理へ、**営業継続**）を持つ。**営業継続**を選んだ場合は、その 1 操作で manualOverride の設定と、指定時間後の closeAssessmentTask 実行用 Cloud Tasks の enqueue を必ず行う（単独の「〇時間後にリマインド」ボタンは提供しない）。非 store management 端末は解除操作を出さず、「管理者へ依頼してください」のみ表示する。

| 種別 | store management 端末 | 非 store management 端末 |
|------|------------------------|----------------------------|
| 強警告 | ブロッキングダイアログ（dismiss 不可）。「閉店処理へ」「営業継続」（営業継続時は閉店時間の目安 1〜8 時間を選択し、override＋enqueue を 1 操作で実行）。 | 解除操作なし。初回ダイアログ（dismiss 可）→ 画面上部インライン通知（Inline Banner）常駐（閉じられない／操作可能）。管理者へ依頼文言のみ。 |
| 弱警告 | ダイアログ（dismiss 可）で状況共有してよい。 | **表示しない**（ダイアログもバナーも不要）。 |
| 開店の needs_manual_open | 情報表示＋「開店処理へ」等を出してよい。 | 情報表示のみ。依頼文言を出してよい。 |

---

## 6. closeAssessment.result × UI 表示仕様（決定表）

以下、**closeAssessment.suppressedByOverride が true でない**ときの挙動とする。**closeAssessment.suppressedByOverride === true のときは、needs_manual_close_suppressed の行に従い表示なし。**

**next_day_started の表示種別**: §4.1 の事故疑いシグナルで判定する。diffDays === 1 → 強警告（§4.0）。diffDays >= 2 または <= 0 → 弱警告（store management 端末のみダイアログ dismiss 可。非 store management 端末は表示しない）。強警告・弱警告いずれもダイアログ内に「閉店対象日」と「現在営業日」を必ず明示する。

| result | 表示種別 | 表示文言（固定案） | store management 端末のボタン | 非 store management 端末 |
|--------|----------|---------------------|--------------------------------|----------------------------|
| **needs_manual_close** | 強警告（§4.0） | 「閉店時間を過ぎています。〇〇（intendedBusinessDateKey）の閉店処理を実行するか、営業継続を選択してください。」blockers に activeStaysNotEmpty があれば「滞在中有のため、閉店処理の前にご確認ください。」を追記。 | 「閉店処理へ」「営業継続」（営業継続選択時は閉店時間の目安を 1〜8 時間から選び、決定後に override＋closeAssessmentTask の enqueue を 1 操作で実行） | 解除操作なし。初回ダイアログ（dismiss 可）→ 画面上部インライン通知（Inline Banner）常駐（閉じられない／操作可能）。管理者へ依頼文言のみ。 |
| **needs_manual_close_suppressed** | 表示なし | — | — | — |
| **next_day_started**（事故疑いシグナル**強**） | 強警告（§4.0） | 「**閉店対象日**: 〇〇（intendedBusinessDateKey）。**現在営業日**: △△（currentBusinessDateKey）。〇〇の閉店が未実施のまま、現在は△△で営業中です。管理者は〇〇の閉店処理を実行してください。」 | 「〇〇（閉店対象日）の閉店処理へ」「営業継続」（同上。閉店時間の目安選択→override＋enqueue） | 解除操作なし。初回ダイアログ（dismiss 可）→ 画面上部インライン通知（Inline Banner）常駐（閉じられない／操作可能）。管理者へ依頼文言のみ。 |
| **next_day_started**（事故疑いシグナル**弱**） | 弱警告（§4.0） | 「**閉店対象日**: 〇〇（intendedBusinessDateKey）。**現在営業日**: △△（currentBusinessDateKey）。誤タスクの可能性があります。念のため〇〇の閉店処理をご確認ください。」 | store management 端末のみダイアログ（dismiss 可）で表示。「〇〇の閉店処理へ」等を出してよい。 | **表示しない** |
| **already_closed** | 表示なし | — | — | — |
| **skipped**（date_out_of_range またはその他） | 表示なし | — | — | — |
| **null** | 表示なし | — | — | — |
| **不正値**（上記以外の文字列・欠損） | 表示なし（強警告は出さない） | — | — | — |

**next_day_started の日付表示部（warning）**: needs_manual_close と同様、**closeAssessment.result === 'next_day_started'** のときも日付表示部に warning を出す。文言は短く「閉店未実施（〇〇）」など閉店対象日を併記する。強／弱のどちらでも同じ条件で日付部 warning を表示してよい。

**例外**: 同じ画面で status === 'error' のときは、§4 に従いエラー表示を最優先とする。**status === 'error' は強警告とは別枠**（§4.0）のため、エラー表示と強警告 1 件の共存が許される。closeAssessment が needs_manual_close / next_day_started 等なら、エラー表示の直下または別レイヤーで強警告を 1 件出してよい。強警告は同時に 1 件のみ表示（§4.0）。

---

## 7. openAssessment.result × UI 表示仕様（決定表）

**位置づけ**: 事故防止の本命は「次営業日開始（開店）側のガード」である。**openAssessment の skipped（blockers に 'already_running_different_date'）** は、未閉店疑いの**最重要シグナル**として強警告で扱う（§4 の 4 と整合）。

**根拠**: `functions/src/tasks/openAssessmentTask.ts` 110–123 行。status === 'running' かつ currentBusinessDateKey !== payload.intendedBusinessDateKey のとき、result = 'skipped', blockers = ['already_running_different_date'] で書き込まれる。

| result | 表示種別 | 表示文言（固定案） | store management 端末のボタン | 非 store management 端末 |
|--------|----------|---------------------|--------------------------------|----------------------------|
| **ready_to_open** | 軽い情報表示（任意） | 「〇〇（intendedBusinessDateKey）の開店準備が整っています。」 | 「開店処理へ」等を出してよい。 | 情報のみ。 |
| **needs_manual_open** | 情報表示（強警告は出さない） | 「手動で開店処理が必要です。」blockers に応じ「前回閉店未完了やエラーがあります。管理者が開店処理を実行してください。」等を追記。※「前営業日継続疑い」の強警告（下記 skipped）とは文言で区別する。 | 「開店処理へ」を出してよい。 | 情報＋「管理者に依頼してください。」 |
| **already_running** | 表示なし | — | — | — |
| **skipped**（date_out_of_range） | 表示なし | — | — | — |
| **skipped**（already_running_different_date） | **強警告**（§4.0。次営業日開始側ガード） | 「**閉店対象日（現在営業日）**: △△（currentBusinessDateKey）。**開店認定対象日**: 〇〇（intendedBusinessDateKey・補助）。現在営業日と開店認定の対象日が異なります。△△の閉店が未実施の可能性があります。管理者は△△（閉店対象日）の閉店処理を実行してください。」 | 「△△（閉店対象日＝currentBusinessDateKey）の閉店処理へ」「営業継続」（営業継続時は閉店時間の目安 1〜8 時間を選択し、override＋**closeAssessmentTask** の enqueue を 1 操作で実行。payload.intendedBusinessDateKey は **currentBusinessDateKey**） | 解除操作なし。初回ダイアログ（dismiss 可）→ 画面上部インライン通知（Inline Banner）常駐（閉じられない／操作可能）。管理者へ依頼文言のみ。 |
| **null** | 表示なし | — | — | — |
| **不正値** | 表示なし | — | — | — |

**already_running_different_date のダイアログ**: **閉店対象日 = state.currentBusinessDateKey（現在営業日）** を主に表示し、**開店認定対象日 = openAssessment.intendedBusinessDateKey** は補助情報として表示する。日付表示部に warning を出す場合は「閉店未実施疑い（△△）」と **currentBusinessDateKey** を表示する（intended は補助表示にのみ使う）。

**suppressedByOverride === true** のとき: 開店側は強警告を出さない。needs_manual_open の情報表示も抑制してよい。抑制の有無は **openAssessment.suppressedByOverride** を主条件とする（§2.4）。

---

## 8. 営業継続に伴う Cloud Tasks enqueue 仕様（リマインド）

本仕様では**単独の「〇時間後にリマインド」ボタンは提供しない**。リマインドに相当する Cloud Tasks の enqueue は、**営業継続を選択した場合に、その 1 操作の一部として必ず行う**。

### 8.1 営業継続時の手順と enqueue

**store management 端末**で強警告（needs_manual_close / next_day_started / already_running_different_date）が表示されているとき、「営業継続」を選ぶと次の UI/手順とする。

1. ダイアログ内に**「閉店時間の目安」プルダウン**を表示する。選択肢は **1 時間、2 時間、3 時間、…、8 時間**とする。
2. ユーザーが時間を選択し決定すると、**1 操作の結果として**次を実行する。
   - **manualOverride（close_skip）の設定**（Callable 等で Firestore に書き込む。既存または別 Step で実装）。
   - **指定時間後（now + X 時間）に closeAssessmentTask を実行する Cloud Tasks の enqueue**。payload の **intendedBusinessDateKey** は、当該強警告の**閉店対象日**を渡す（下表のとおり）。

enqueue 自体は Firestore の状態を変えないため、**解除条件**はあくまで「Firestore の状態が変わり表示条件が不成立になったとき」である。営業継続の結果として override が書き込まれ suppressed になれば、表示条件が不成立となり強警告は消える。

**閉店対象日と enqueue 先**: 強警告の出所に応じ、enqueue するタスクと intendedBusinessDateKey は次のとおり。いずれも **closeAssessmentTask** を enqueue する（開店側の already_running_different_date も閉店漏れ疑いのため closeAssessmentTask）。

| 強警告の出所 | enqueue するタスク | payload.intendedBusinessDateKey |
|--------------|--------------------|----------------------------------|
| closeAssessment needs_manual_close / next_day_started | closeAssessmentTask | closeAssessment.intendedBusinessDateKey（閉店対象日） |
| openAssessment skipped(already_running_different_date) | closeAssessmentTask | **state.currentBusinessDateKey**（閉店対象日＝現在営業日） |

### 8.2 タスクの種別と payload

**根拠**: `functions/src/scheduler/weeklyPlanner.ts` 109–114 行（open）、174–177 行（close）。payload は `action`, `intendedBusinessDateKey`, `scheduledAt`（ISO 8601 形式）。

営業継続に伴う enqueue では、**closeAssessmentTask** を呼び出す。payload は次のとおり。

| 種別 | 呼び出す URL | payload |
|------|--------------|---------|
| 営業継続に伴う enqueue（閉店リマインド） | CLOSE_ASSESSMENT_URL（closeAssessmentTask） | `{ action: 'close_assessment', intendedBusinessDateKey: string（閉店対象日）, scheduledAt: string（ISO 8601） }` |

**scheduledAt**: 実行予定時刻（now + X 時間）を **ISO 8601** で渡す。タスク側の idempotencyKey は `close_assessment_${intendedBusinessDateKey}_${scheduledAt}` となるため、**同じ intendedBusinessDateKey と scheduledAt の組み合わせでは冪等**。

### 8.3 タスク名の命名規則（重複回避・冪等性）

**根拠**: weeklyPlanner では `close_assessment_${dateKey}` / `open_assessment_${dateKey}` で 1 日 1 タスク。リマインドは「同一営業日に複数回 enqueue し得る」ため、タスク名は **一意** にする。

**採用**: 営業継続に伴う enqueue では **closeAssessmentTask のみ**を呼び出すため、タスク名は次の形式のみとする。

- `close_assessment_reminder_${intendedBusinessDateKey}_${scheduleTimeEpochSeconds}`

これにより、同一営業日でも「X 時間後」「Y 時間後」で別タスクとして複数リマインドを許可する。**上書き／抑止は行わない**（毎回 enqueue するのみ）。

### 8.4 同一営業日に複数リマインド

**採用**: **許可する**。タスク名を上記のとおり一意にし、それぞれ別時刻で **closeAssessmentTask** が再実行される。既存の「同じ idempotencyKey なら no-op」により、同じ intended + scheduledAt が再度渡ればタスク側でスキップされる。

### 8.5 失敗時の扱い

- **キュー投入失敗**（Callable 内で createTask が失敗）: クライアントにエラーを返し、SnackBar で「営業継続に失敗しました（リマインド予約を含む）」等を表示する。
- **HTTP 失敗**（タスク実行時に closeAssessmentTask が 5xx 等）: Cloud Tasks のリトライに任せる。UI では特段の扱いをしない。
- **期限切れ**（overrideUntil を過ぎても手動閉店されない等）: リマインドタスク（closeAssessmentTask）が再実行され、その時点の state に応じて再度 result が更新される。UI はその更新を購読して表示する。

### 8.6 既存実装と新規に必要なもの（本 Step では実装しない）

**根拠**: `functions/src/tasks/` には closeAssessmentTask / openAssessmentTask のみ存在。Cloud Tasks への createTask は `functions/src/scheduler/weeklyPlanner.ts` で行われている（CloudTasksClient, queuePath, createTask）。アプリから営業継続に伴う enqueue を行うには、**営業継続用 Callable（manualOverride 設定＋Cloud Tasks createTask）** が必要である。

**仕様として明記**: 本 Step では実装しないが、以下を仕様とする。

- **営業継続**の 1 操作で、(1) manualOverride（close_skip）の設定と (2) 指定時間後に closeAssessmentTask を実行する Cloud Tasks の enqueue の両方を行う Callable（または同等の処理）を用意する想定とする。
- 引数には **intendedBusinessDateKey（閉店対象日）** と **閉店時間の目安（1〜8 時間のいずれか）** を含める。scheduledAt は now + X 時間を ISO 8601 で渡す。
- 処理: store management 端末であることの権限チェック後、override を Firestore に書き込み、**WEEKLYPLANNER_TASKS_QUEUE と同じキュー**（または仕様で定めたキュー）に、§8.2 の payload と scheduleTime で createTask する。タスク名は §8.3 の命名規則に従う。
- 使用する GCP 権限: Cloud Tasks の createTask に必要なサービスアカウント権限を付与する。既存 weeklyPlanner が動いているなら、同一プロジェクト・同一キューへの enqueue は同じ権限で足りる想定。

---

## 9. UI 実装方針（どの画面・どこに出すか）

### 9.1 terminalHomePage

- **開閉店管理ダイアログ**: ダイアログを開いた時点で、storeMeta/currentBusinessDay の最新を参照する。closeAssessment / openAssessment に応じ、§6・§7 の決定表に従い **強警告** または **弱警告** を出すか、またはダイアログ内に「閉店未実施の警告」「開店準備完了」等の情報を表示する。強警告は §4.0 のとおり（store management 端末はブロッキングダイアログ、非 store management 端末は初回ダイアログ可ののち **画面上部インライン通知（Inline Banner）常駐**・閉じられないが操作は可能。§9.2 のバナー位置の抽象化に従う）。**next_day_started** のときはダイアログ内に必ず「閉店対象日」と「現在営業日」を明示する（§6）。
- **日付表示部**（AppBar の _buildStoreStatusAction 付近）:
  - **営業中（running）時**: status に加え、**closeAssessment.result === 'needs_manual_close'**、**closeAssessment.result === 'next_day_started'**、または **openAssessment.result === 'skipped' かつ blockers に 'already_running_different_date'** のとき、日付の横に **warning アイコンまたは短い文言**を表示する。文言は次のとおり。needs_manual_close / next_day_started は「閉店未実施（閉店対象日）」、already_running_different_date は「閉店未実施疑い（**currentBusinessDateKey**）」とする（閉店を促す対象は常に currentBusinessDateKey。intended は補助表示のみ）。
  - **閉店中（closed）時で開店処理が必要な場合**: status === 'closed' かつ、openAssessment が存在し result が **ready_to_open** または **needs_manual_open** で、かつ **openAssessment.suppressedByOverride が true でない**とき、日付表示部分（このときは「閉店中」と表示されている）に **!（赤色）** と **「開店処理が必要です」** を表示する。
    - **開閉店ができない権限のデバイス**（非 store management 端末）: 上記表示をタップした場合、ダイアログで「開店時間を過ぎているため開店処理を行って下さい」とアナウンスする。**ダイアログからは開店処理は行えず、閉じるのみ**とする。
    - **開閉店が可能なデバイス**（store management 端末）: タップ時は**通常の開閉店管理ダイアログ**を表示する（開店処理へボタン等を含む）。
  - 表示タイミングは **購読更新時**（StreamBuilder の snapshot 更新時）。
- **表示タイミング**: 初回表示時および storeMeta/currentBusinessDay の購読更新時。ダイアログは「開閉店管理」を開いたときに、その時点の assessment を参照して表示する。

### 9.2 他画面（tournament_home_page, table_detail_page, order_management_page, side_game_table_list）

- 同じ **StoreMetaService.instance.stream** を購読し、§4 の優先順位に従い **強警告** を出す。表示種別・文言・store management／非 store management の差は §6・§7 と同一とする。
- **他画面でも「閉店処理へ」「営業継続」を選択可能とする**。実装は**低コスト**で行う：各画面の StoreStrongWarningWrapper に **onCloseStore** および **onBusinessContinue** を渡し、いずれも **「terminalHome へ遷移する」コールバック**とする。ユーザーが他画面で「閉店処理へ」または「営業継続」をタップするとホームに遷移し、ホームの強警告ゲートで同じボタンが表示されるため、そこで閉店処理・営業継続を実行する。大幅なコード重複や新規フローは不要である。
- **store management 端末**: 条件を満たすときブロッキング強警告ダイアログを 1 件のみ表示（§4.0）。**非 store management 端末**: 強警告は、各画面の**最上部（アプリヘッダ直下相当）**にインライン通知として常駐表示する。**AppBar が存在する画面では AppBar 直下**に、**存在しない画面では画面上部固定表示**で同等に扱う。初回はダイアログ（dismiss 可）を表示してよい。その後は上記位置に Inline Banner を常駐表示する（Banner は閉じられないが、画面操作はブロックしない）。強警告 UI は同時に 1 件のみ（§4.0）。
- 表示場所: 各画面の **build のルート付近**で、Stack または Overlay により、条件を満たすとき強警告を重ねる。
- **日付表示部**（Phase6 Step1 implementation_summary に記載の 4 画面: **tournament_home_page**, **table_detail_page**, **order_management_page**, **side_game_table_home**）: 上記 4 画面の AppBar actions における営業状態表示を、**terminalHomePage の日付表示部と表示形式で統一**する。すなわち、terminalHomePage と同様に **getDateWarningLabel 相当**を用い、needs_manual_close / next_day_started / already_running_different_date のときは日付の横に warning アイコンおよび短い文言を表示する。**他画面では、push された時などの初回ダイアログ（強警告の初回 dismiss 可ダイアログ以外）は出さない**。日付＋warning のインライン表示のみとする。

### 9.3 StoreMetaData の拡張（仕様）

**現状（コード根拠）**: `lib/services/store_meta_service.dart` の `StoreMetaData` は **status** と **currentBusinessDateKey** の 2 フィールドのみ。`StoreMetaData.fromDocument`（20–28 行）では `doc.data()` から `data['status']` と `data['currentBusinessDateKey']` だけを読み、他フィールドは読んでいない。

**Step4 で追加する読取対象**（実装は本 Step では行わないが、仕様として fromDocument で読む対象を確定する）:

- lastClosedBusinessDateKey, lastError, processing（Step3 整合）
- closeAssessment（result, blockers, intendedBusinessDateKey, decidedAt, scheduledAt, suppressedByOverride 等）
- openAssessment（同上）
- manualOverride（type, intendedBusinessDateKey, overrideUntil 等、表示判定に必要な範囲）

fromDocument で上記を doc.data() から読み、null 安全に扱う。既存の status / currentBusinessDateKey は維持する。**next_day_started の事故疑いシグナル判定**には currentBusinessDateKey と closeAssessment.intendedBusinessDateKey が必要なため、StoreMetaData に closeAssessment および state の currentBusinessDateKey が含まれている必要がある（現状でも currentBusinessDateKey は読んでいる）。

---

## 10. エッジケース・防御設計

| ケース | 扱い |
|--------|------|
| closeAssessment / openAssessment が **null** | 表示なし。強警告は出さない。 |
| result が **欠損** または **上記一覧以外の文字列** | 強警告は出さない。必要なら「認定結果を取得できませんでした」等の軽い表示のみ。 |
| status が **'closed' / 'running' / 'error' 以外** | types 上は 3 値のみ。想定外の値は `isUnknownStatus` 相当で扱い、エラー表示または「状態不明」として表示する。 |
| decidedAt が **過去**（例: 数日前） | 認定結果は「その時点のスナップショット」として扱う。古くても result が needs_manual_close / next_day_started 等なら、**表示する**（未対応の可能性があるため）。必要なら「〇〇の認定結果です」と日付を補足してよい。 |
| **processing が残留**（lease 期限切れ前） | Step3 の「閉店処理／開店処理実行中」として扱う。assessment の強警告（dismiss 不可・常駐ゲート）と同時のときは、§4 に従い assessment を優先表示し、ユーザーが「閉店処理へ」を押したあと failed-precondition なら Step3 のロックメッセージを表示する。 |
| **manualOverride.overrideUntil** | overrideUntil は**表示用途**（いつまで抑制かを表示する）に用いる。**抑制の有無の判定は suppressedByOverride を主とする**（§2.4）。クライアント時刻で overrideUntil を主にした「有効期限内か」の二段判定は行わない。 |
| **next_day_started で currentBusinessDateKey が null** | status === 'running' のときは通常 non-null。null の場合は日付差分を計算できないため、**弱警告**として扱う（強警告は出さない）。store management 端末のみダイアログ（dismiss 可）で表示。文言では「現在営業日は取得できません。閉店対象日〇〇の閉店処理をご確認ください。」のようにする。 |

---

## 11. Definition of Done（受入条件）

- [ ] **表示条件の網羅**: closeAssessment.result / openAssessment.result の全値（null・不正値含む）について、§6・§7 の決定表に従った表示種別・文言・store management／非 store management の差が定義されている。
- [ ] **store management / 非 store management の差**: store management 端末では「閉店処理へ」「営業継続」（営業継続は閉店時間の目安選択→override＋enqueue）を表示し、非 store management 端末では解除操作を出さず「管理者へ依頼してください」のみ表示することが仕様に明記されている。
- [ ] **営業継続に伴う enqueue 仕様**: 単独リマインドボタンは提供せず、営業継続の 1 操作に override＋closeAssessmentTask の enqueue が含まれることが §8 で明文化されている。payload・タスク名・閉店時間の目安（1〜8 時間）が仕様に含まれている。
- [ ] **コード根拠の矛盾なし**: closeAssessmentTask / openAssessmentTask の分岐順序・result 値・blockers 付与条件がコードと一致している。openAssessment の「status === 'error' のときは ready_to_open にならない（needs_manual_open）」等、実装と矛盾する記述がない。
- [ ] **一意に実装できる状態**: 表示文言・優先順位・権限制御・エッジケースまで決まっており、spec のみから実装に落とし込める。
- [ ] **強警告の定義・解除条件**: 強警告の表示は store management 端末はブロッキングダイアログ、非 store management 端末は Banner 常駐（閉じられない・操作は可能）であること、解除は「状態が変わって条件不成立」のみであること、営業継続に必ず enqueue が含まれることが §4.0・§8 で明文化されている。
- [ ] **強警告の重複制御**: 同時に表示する強警告 UI は 1 件のみであることが §4.0 で明文化されている。

---

以上を Phase6 Step4 の仕様書とする。

---

## 変更点サマリ（最新方針反映）

- **next_day_started の扱い変更**
  - 「誤タスク扱いで無視」ではなく、**store management 端末では必ず警告を表示する**（強または弱。弱のときは非 store management 端末は表示しない）。
  - ダイアログ内に**閉店対象日（intendedBusinessDateKey）**と**現在営業日（currentBusinessDateKey）**を必ず明示する。
  - 文言は両日付を含め、store management／非 store management のボタン差は従来どおり（store management 端末は閉店処理・営業継続、非 store management 端末は依頼文のみ）。
  - **強警告と弱警告の分岐**を導入。diffDays === 1 のときのみ強警告、diffDays >= 2 または <= 0 のときは弱警告（store management 端末のみ表示）にしてノイズを抑える。

- **事故疑いシグナル定義の新設（§4.1）**
  - diffDays(currentBusinessDateKey, intendedBusinessDateKey) を日付差の整数として機械的に定義。
  - diffDays === 1 → 事故疑いシグナル**強**（強警告）。diffDays >= 2 または <= 0 → **弱**（弱警告・store management 端末のみ表示）。
  - 実装者が迷わないよう条件を表で明文化。

- **open 側ガードの位置づけ整理**
  - 事故防止の本命を「次営業日開始（開店）側のガード」として明記。
  - openAssessment の skipped（blockers に 'already_running_different_date'）を**未閉店疑いの最重要シグナル**として強警告で固定。ダイアログに currentBusinessDateKey と intendedBusinessDateKey の両方を表示するよう決定表で明記。
  - needs_manual_open は強警告モーダルを出さず、「前営業日継続疑い」の強警告とは文言で区別する。

- **コード根拠の明記**
  - closeAssessmentTask.ts 108–122 行（next_day_started 条件）、openAssessmentTask.ts 110–123 行（already_running_different_date）、store_meta_service.dart 20–28 行（StoreMetaData.fromDocument の現状読取フィールド）を仕様書中に記載。StoreMetaData 拡張は現状との差分として読取対象を明記。

---

### 修正反映（指摘 1〜4）

1. **クリティカル: already_running_different_date の「閉店対象日」の修正**
   - 閉店を促す対象日を **openAssessment.intendedBusinessDateKey** から **state.currentBusinessDateKey（現在営業日）** に統一。
   - openAssessment.intendedBusinessDateKey は「開店認定の対象日（本来開店したかった日）」として**補助情報**のみに使用。
   - §4 の 4 番・§7 決定表・§9.1 の日付表示部 warning をすべて **閉店対象日 = currentBusinessDateKey** に修正。ボタン文言・非 store management 依頼文も「閉店対象日＝current」に統一。

2. **重要: open 側強警告のリマインドは closeAssessmentTask を enqueue**
   - openAssessment skipped(already_running_different_date) の「X時間後にリマインド」は **openAssessmentTask ではなく closeAssessmentTask** を enqueue する仕様に変更。
   - payload の intendedBusinessDateKey には**閉店対象日（currentBusinessDateKey）**を渡す。
   - §7 当該行のボタン仕様と **§8.1** に「どのケースで close / open どちらの reminder を enqueue するか」の表を追加し、読んだだけで一意に実装できるようにした。

3. **補強: next_day_started 強/弱分岐の意図と発生頻度（§4.1）**
   - diffDays 分岐は「誤タスク／残存タスク等のノイズ抑制」目的であることを追記。
   - 通常運用では diffDays は 0 or 1 が多く、**>=2 は稀**であること、**判定不能（current が null 等）は弱（弱警告）**であることを明記。分岐条件そのものは変更なし。

4. **改善: suppressed 判定は assessment.suppressedByOverride を主とする（§2.4・§7）**
   - UI の「警告/情報の抑制」は **assessment.suppressedByOverride === true** を**主条件**とする旨に変更。
   - manualOverride.overrideUntil は「いつまで抑制かを表示する用途」に寄せ、比較は補助扱い。端末時刻ズレを避けるためサーバが決定した suppressedByOverride を信頼する。

---

### 修正反映（強警告＝dismiss 不可・常駐ゲート）

5. **強警告モーダルの定義の明文化（§4.0 新設）**
   - 強警告モーダル＝**dismiss 不可のブロッキング（常駐ゲート）** を定義。閉じるボタンなし・外側タップで閉じない・Back でも閉じない。条件成立中は常に表示され続ける。
   - 「定期的に再表示」「低頻度で再表示」は**不要かつ不採用**と明記（強警告は常駐のため再表示の概念は存在しない）。

6. **強警告が消える条件（解除条件）の明文化（§4.0）**
   - 強警告が消えるのは**「閉じたから」「一度見たから」ではなく、Firestore の状態が変わり表示条件が不成立になったときのみ**。
   - store management 端末は状態を変える操作（閉店処理・営業継続）の結果で条件不成立になり得る。非 store management 端末は解除操作を持たず、条件成立中は表示され続ける。

7. **決定表の文言統一（§6・§7・§4.1）**
   - 強警告：「dismiss 不可・常駐ゲート（条件が成立している限り表示され続ける）」に統一。
   - 弱警告：「store management 端末のみダイアログ（dismiss 可）。非 store management 端末は表示しない」に統一。強警告との差が一読で分かるようにした。

8. **store management / 非 store management の差を強警告の文脈で明文化（§5.2）**
   - 強警告時、store management 端末のみが**解除操作**（閉店処理へ・営業継続）を持つ。非 store management 端末は解除操作を持たず、条件成立中は強警告（Banner）が表示され続けることを表と本文で明記。

9. **整合チェック**
   - 強警告を「閉じられる」と読める文言、「一定間隔で再表示」「閉じたら消える」のニュアンスを削除し、§4〜§7・§9・§10 で用語を統一した。

---

### 修正反映（store_management 端末対応＋警告表示変更＋営業継続＝enqueue 必須＋強警告重複制御）

10. **権限の修正（①）: store management 端末の採用**
    - 「admin 端末」「非 admin 端末」を廃止し、**store management 端末**（role === 'admin' または role === 'terminal' かつ options.store_management === true）と**非 store management 端末**の 2 区分に統一。§5.1 で判定方法を明記（device_service / device_options を根拠に記載）。

11. **強警告・弱警告の表示仕様変更（②）**
    - **強警告**: store management 端末はブロッキング強警告ダイアログ（dismiss 不可）。非 store management 端末は初回ダイアログ（dismiss 可）ののち **AppBar 直下 Inline Banner 常駐**（閉じられないが画面操作はブロックしない）。解除操作は出さず「管理者へ依頼」のみ。
    - **弱警告**: store management 端末のみダイアログ（dismiss 可）で表示。非 store management 端末は**表示しない**（ダイアログもバナーも不要）。§4.0・§6・§7・§9 を上記に合わせて更新。

12. **営業継続＝リマインド必須・単独リマインド削除（③）**
    - 「〇時間後にリマインド」単独ボタンを削除。**営業継続**を選んだ場合、ダイアログ内で「閉店時間の目安」プルダウン（1〜8 時間）を表示し、決定後に **1 操作で** manualOverride の設定と closeAssessmentTask 実行用 Cloud Tasks の enqueue を必ず行う仕様に変更。
    - 解除条件は「Firestore の状態が変わり条件不成立」のみ。営業継続の結果として override が書き込まれ suppressed になれば強警告は消える。enqueue 単体では解除されないことを §4.0・§8 で明記。
    - §8 を「営業継続に伴う enqueue」を中心に再構成。payload・タスク名・idempotencyKey の説明は維持。

13. **強警告の重複表示を 1 件に制限（④）**
    - 同時に複数の強警告条件が成立しても**画面上に表示する強警告 UI は 1 件だけ**とするルールを §4.0 に追加。優先順位は既存 §4 の番号順を維持し、最上位の 1 件のみ表示。下位は強警告本文内に「他にも未解決の警告がある可能性があります」を補足してよい。

---

### 変更点サマリ（追修正）

1. **§8.3〜§8.5 から open リマインド痕跡を全削除（close のみに統一）**
   - §8.3: タスク名は `close_assessment_reminder_${intendedBusinessDateKey}_${scheduleTimeEpochSeconds}` のみ。open_assessment_reminder_... を削除。
   - §8.4: 「closeAssessmentTask が再実行される」に統一（openAssessmentTask の再実行に触れない）。
   - §8.5: closeAssessmentTask の失敗に統一（openAssessmentTask 5xx 等を削除）。エラー文言を「営業継続に失敗しました（リマインド予約を含む）」に変更。
   - §8.2: enqueue は closeAssessmentTask のみであることを確認（open 側 enqueue の記述なし）。

2. **§4 と §6 の next_day_started（弱）の矛盾解消**
   - §4 の 3: 「必ず警告を表示する」を「store management 端末では必ず警告（強/弱）表示」「非 store management 端末は弱のとき表示しない」に明確化。
   - §4.1: 「store management 端末では必ず警告表示。弱のときは非 store management 端末には表示しない」と整合する文言に修正。

3. **§6/§7 決定表で非 store management の強警告＝バナー常駐を明文化**
   - 強警告行（needs_manual_close、next_day_started 強、already_running_different_date）の「非 store management 端末」列を「解除操作なし。初回ダイアログ（dismiss 可）→ 画面上部インライン通知（Inline Banner）常駐（閉じられない／操作可能）。管理者へ依頼文言のみ。」に統一。
   - 弱警告行（next_day_started 弱）は「表示しない」を維持。§5.2 表も同型に統一。

4. **§9.2 他画面バナー配置の抽象化**
   - 「AppBar 直下」に依存しない表現に変更。「各画面の最上部（アプリヘッダ直下相当）」にインライン通知として常駐。AppBar が存在する画面では AppBar 直下、存在しない画面では画面上部固定表示で同等に扱う旨を明記。

5. **status === 'error' と強警告 1 件制御の関係の明確化**
   - §4.0 に「status === 'error' の表示は強警告とは別枠であり、強警告 UI の 1 件制御には含めない」を追記。error 表示と強警告 1 件の共存が許されることを明文化。§6 例外段落も同趣旨で補強。

6. **§8.5 のエラーメッセージ文言を営業継続に寄せた**
   - 「リマインドの設定に失敗しました」→「営業継続に失敗しました（リマインド予約を含む）」に変更（enqueue 含むことが伝わる言い回し）。

7. **変更点サマリの語彙統一**
   - 「軽警告」「非ブロック」等の旧語彙を「弱警告」に統一。強警告・弱警告・Inline Banner・ブロッキングで本文と一致させた。
