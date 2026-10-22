# Phase6 Step4: closeAssessment.result / openAssessment.result の値の整理

現状の実装（`closeAssessmentTask.ts` / `openAssessmentTask.ts`）を読み込み、**どの状態のときにどの値が入るか**を整理したドキュメント。  
Step4 で「各 result が入っているときに画面上に何を表示するか（または何も表示しないか）」を決めるための前提資料とする。

---

## 1. 前提：誰がいつ書き込むか

| フィールド | 書き込む処理 | 内容 |
|------------|--------------|------|
| `closeAssessment` | **closeAssessmentTask**（HTTP、Cloud Tasks から呼ばれる） | 閉店時間超過の有無・ブロッカーを判定し、結果を上書きする。 |
| `closeAssessment` | **createInitialStateDocCallable** | 初期作成時のみ。`closeAssessment: null` を set する。 |
| `openAssessment` | **openAssessmentTask**（HTTP、Cloud Tasks から呼ばれる） | 開店条件の有無を判定し、結果を上書きする。 |
| `openAssessment` | **createInitialStateDocCallable** | 初期作成時のみ。`openAssessment: null` を set する。 |

- closeStoreTerminal / openStoreTerminal（Step3）は **closeAssessment / openAssessment を更新しない**。
- したがって、**null になるのは「初期化直後」または「タスクが一度も実行されていないとき」**のみ。

---

## 2. closeAssessment.result の値一覧

実装: `functions/src/tasks/closeAssessmentTask.ts`

### 2.1 正常系（タスクが意図どおり実行された場合）

| result | 発生条件（state の状態） | blockers の内容 | 備考 |
|--------|--------------------------|-----------------|------|
| **already_closed** | `status === 'closed'` かつ `lastClosedBusinessDateKey === intendedBusinessDateKey` | `[]` | 対象営業日は既に閉店済み。 |
| **next_day_started** | `status === 'running'` かつ `currentBusinessDateKey !== intendedBusinessDateKey` | `[]` | 既に次営業日が開始している（対象日は実質閉店済み）。 |
| **needs_manual_close** | `status === 'running'` かつ `currentBusinessDateKey === intendedBusinessDateKey` かつ、有効な manualOverride（close_skip）**がない** | `[]` または `['activeStaysNotEmpty']` | 閉店時間超過・手動閉店が必要。activeStays に isActive==true が 1 件以上あれば `activeStaysNotEmpty` が入る。 |
| **needs_manual_close_suppressed** | 上と同じ「閉店すべき」状態だが、**有効な manualOverride（close_skip）がある**（`overrideUntil >= 現在時刻`） | `[]` または `['activeStaysNotEmpty']` | 営業継続等で抑制された状態。警告UIは出さない。 |
| **skipped** | 下記のいずれか。 | 下記参照。 | 認定対象外またはスキップ。 |

**skipped の内訳**:

| 条件 | blockers |
|------|----------|
| `intendedBusinessDateKey` が JST の「当日」「前日」のどちらでもない（許容範囲外） | `['date_out_of_range']` |
| 上記以外で、`status !== 'running'` または `currentBusinessDateKey !== intendedBusinessDateKey`（かつ already_closed / next_day_started の条件にも当てはまらない） | `[]` |

後者には例えば次のような状態が含まれる:

- `status === 'error'`（閉店認定タスクは「閉店すべきか」のみを見るため、error のときは何もせず skipped）
- `status === 'closed'` だが `lastClosedBusinessDateKey !== intendedBusinessDateKey`（別の営業日で閉店済みなど）
- `status === 'running'` だが `currentBusinessDateKey !== intendedBusinessDateKey` は「next_day_started」で先に return するため、ここには来ない

### 2.2 closeAssessment のその他のフィールド（実装で設定されるもの）

- `idempotencyKey`, `intendedBusinessDateKey`, `decidedAt`, `source`, `scheduledAt` は上記すべての result で設定される。
- `lastSuppressedAt`, `suppressedByOverride` は **needs_manual_close_suppressed** のときのみ設定される。

### 2.3 事前に想定していない／エッジなケース（closeAssessment）

| ケース | 値・挙動 | 補足 |
|--------|----------|------|
| **closeAssessment が null** | タスクが一度も実行されていない、または createInitialStateDoc で初期化された直後。 | UI では「閉店認定結果なし」として扱う。警告は出さない。 |
| **closeAssessment はあるが result がない／型が違う** | 旧バージョンのタスクや不具合で `result` が欠けている・不正な型。 | UI では防御的に「不明」として扱い、強警告は出さない方が安全。 |
| **status === 'error'** | タスクは「閉店すべきか」のみ判定。error のときは `already_closed` / `next_day_started` / `needs_manual_close*` のいずれにも当てはまらず **result: 'skipped'**, **blockers: []** が入る。 | 閉店時間超過の強警告は出ない。エラー状態の表示は status / lastError 側で行う。 |
| **state doc が存在しない** | タスクは `Error` を throw し 500 を返す。**closeAssessment は更新されない**（前回の値が残るか、ドキュメントごと無い）。 | 実運用では state は存在する想定。UI では doc 未存在時は購読が空になるので「認定結果なし」と同様に扱える。 |
| **冪等キー一致** | 同じ idempotencyKey で既に更新済みの場合、タスクは **no-op**。closeAssessment の内容は**直前の更新のまま**。 | どの result でもあり得る。UI は「現在の result の値」にだけ従えばよい。 |

---

## 3. openAssessment.result の値一覧

実装: `functions/src/tasks/openAssessmentTask.ts`

### 3.1 正常系（タスクが意図どおり実行された場合）

| result | 発生条件（state の状態） | blockers の内容 | 備考 |
|--------|--------------------------|----------------|------|
| **already_running** | `status === 'running'` かつ `currentBusinessDateKey === intendedBusinessDateKey` | `[]` | 対象営業日は既に営業中。 |
| **skipped**（別日営業中） | `status === 'running'` かつ `currentBusinessDateKey !== intendedBusinessDateKey` | `['already_running_different_date']` | 別の営業日で営業中のため、今回の開店はスキップ。 |
| **ready_to_open** | `status === 'closed'` または `status === 'error'` のとき、かつ **blockers が 0 件**（下記の条件をすべて満たす） | `[]` | 開店条件を満たしている。前回閉店完了・lastError なし。 |
| **needs_manual_open** | `status === 'closed'` または `status === 'error'` のとき、かつ **blockers が 1 件以上** | 下記のいずれかまたは複数 | 手動開店が必要。 |

**blockers の付与条件（開店認定）**:

- `status !== 'closed'` のとき（例: status が 'error'）→ `'status_not_closed'` を追加
- `lastClosedBusinessDateKey` が null/未設定 → `'lastClosedBusinessDateKey_missing'` を追加
- `lastError !== null` → `'lastError_exists'` を追加

**skipped（日付範囲外）**:

| 条件 | blockers |
|------|----------|
| `intendedBusinessDateKey` が JST の「当日」「翌日」のどちらでもない | `['date_out_of_range']` |

**その他の skipped**:

- `status` が 'closed' でも 'error' でも 'running' でもない（未定義・ typo 等）→ **result: 'skipped'**, **blockers: []**。

### 3.2 openAssessment の manualOverride

- 有効な manualOverride（open_skip, 同一 intended, overrideUntil >= 現在）がある場合、実装は **result を変えず**に `lastSuppressedAt` と `suppressedByOverride: true` だけを付与する。
- つまり **openAssessment には「needs_manual_open_suppressed」のような result は存在しない**。`needs_manual_open` のままか `ready_to_open` のままで、`suppressedByOverride === true` かどうかで「抑制されているか」が分かる。

### 3.3 事前に想定していない／エッジなケース（openAssessment）

| ケース | 値・挙動 | 補足 |
|--------|----------|------|
| **openAssessment が null** | タスクが一度も実行されていない、または createInitialStateDoc で初期化された直後。 | UI では「開店認定結果なし」として扱う。 |
| **openAssessment はあるが result がない／型が違う** | 旧バージョンや不具合。 | UI では防御的に「不明」として扱う。 |
| **status が 'closed' / 'running' / 'error' 以外** | 実装では `status === 'closed' \|\| status === 'error'` でなければ開店条件ブロックに入らず、**result: 'skipped'**, **blockers: []**。 | レア。UI は result に従えばよい。 |
| **state doc が存在しない** | タスクは 500、openAssessment は更新されない。 | UI は購読が空なら「認定結果なし」扱い。 |
| **冪等キー一致** | no-op。openAssessment は直前の更新のまま。 | どの result でもあり得る。 |

---

## 4. 各 result 値ごとの「画面上に出すもの」の検討用メモ

Step4 で正式に決める項目。ここでは implementation_plan と automatic_store_assessment_spec の記載を要約し、**検討のたたき台**とする。

### 4.1 closeAssessment.result

| result | 画面上の扱い（案） | 根拠・メモ |
|--------|--------------------|------------|
| **needs_manual_close** | **警告UI（画面操作の実質ブロック）＋モーダルダイアログ**。「閉店処理へ」「営業継続」を選択させる。 | automatic_store_assessment_spec §6.3。manualOverride が無効または期限切れのときのみ。 |
| **needs_manual_close_suppressed** | **何も表示しない**（通常操作継続）。 | 営業継続等で抑制済みのため警告を出さない。 |
| **already_closed** | 特になし、または必要に応じて**情報表示のみ**。 | 既に閉店済みで問題なし。 |
| **next_day_started** | 特になし、または必要に応じて**情報表示のみ**。 | 次営業日開始済みで問題なし。 |
| **skipped** | **何も表示しない**。 | 対象外・スキップのため。 |
| **null / 未設定・不正な値** | **何も表示しない**。強警告は出さない。 | 認定未実行またはエッジ。 |

### 4.2 openAssessment.result

| result | 画面上の扱い（案） | 根拠・メモ |
|--------|--------------------|------------|
| **ready_to_open** | 必要に応じて**情報表示**（開店準備完了など）。自動開店が有効なら開店処理を実行するオプションあり。 | implementation_plan §2.2。 |
| **needs_manual_open** | 必要に応じて**情報表示**（手動開店が必要である旨）。blockers の内容に応じたメッセージも検討。 | implementation_plan §2.2。 |
| **already_running** | **何も表示しない**（通常操作継続）。 | 既に営業中。 |
| **skipped** | **何も表示しない**。 | 対象外・スキップ。 |
| **null / 未設定・不正な値** | **何も表示しない**。 | 認定未実行またはエッジ。 |

### 4.3 blockers の表示

- **closeAssessment.blockers**: `activeStaysNotEmpty` がある場合は「滞在中有のため閉店できません」などのメッセージをダイアログに含める検討。
- **openAssessment.blockers**: `lastClosedBusinessDateKey_missing` / `lastError_exists` / `status_not_closed` に応じて、手動開店が必要な理由を短く表示する検討。

---

## 5. 参照した実装箇所

- `functions/src/tasks/closeAssessmentTask.ts` 全行（判定順・分岐・blockers 付与）
- `functions/src/tasks/openAssessmentTask.ts` 全行（同上）
- `functions/src/storeManagement/createInitialStateDocCallable.ts`（closeAssessment / openAssessment の初期値 null）
- `docs/business_hours_migration/automatic_store_assessment_spec.md`（仕様・UI トリガー条件）
- `docs/business_hours_migration/phase6/step4/implementation_plan.md`（各 result に応じた挙動の記載）

---

以上。Step4 ではこの一覧を前提に、**各 result（および null/不正値）に対して「何を表示するか／表示しないか」を正式に決定**し、共通実装と各ページへの埋め込みに反映する。
