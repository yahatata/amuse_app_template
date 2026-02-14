# Phase6 Step4: storeMeta 監視と assessment に基づく UI 表示・操作 - 人間向け概要

## 概要

Phase6 Step4 では、`storeMeta/currentBusinessDay` の **closeAssessment / openAssessment / state / processing** を監視し、**表示種別・文言・ボタン・権限別挙動** を仕様どおり実装します。閉店時間超過や「次営業日開始済みなのに前日閉店未実施」といった状態を検知し、**強警告** または **弱警告** でユーザーに伝え、store management 端末では閉店処理・営業継続の導線を提供します。

**前提**: 本 Step の**仕様は** [spec.md](./spec.md) で確定済みです。本 changeSpec はその仕様を実装に落とすための人間向けサマリです。

## 目的

- **閉店未実施の事故防止**: 「閉店時間を過ぎているのに閉店処理が未実行」「次営業日で営業中なのに前日閉店未実施」のとき、強警告でブロックまたは常駐バナー表示し、閉店処理なしに次営業日が開始される事態を防ぐ。
- **権限に応じた表示**: **store management 端末**（admin または terminal＋営業管理）には「閉店処理へ」「営業継続」を出し、**非 store management 端末**には解除操作を出さず「管理者へ依頼してください」のみ表示する。
- **営業継続＝リマインド必須**: 「営業継続」を選んだ場合、その 1 操作に **manualOverride の設定** と **指定時間後に closeAssessmentTask を再実行する Cloud Tasks の enqueue** を必ず含める。単独の「〇時間後にリマインド」ボタンは提供しない。

## 主要な概念

### 1. 強警告と弱警告

- **強警告**: 条件成立中は消えない。store management 端末は **ブロッキングダイアログ**（dismiss 不可）。非 store management 端末は初回ダイアログ（dismiss 可）ののち **画面上部 Inline Banner 常駐**（閉じられないが操作は可能）。
- **弱警告**: **store management 端末のみ** ダイアログ（dismiss 可）で表示。非 store management 端末には表示しない（誤タスク・古いタスクのノイズ抑制のため）。
- **強警告は同時に 1 件のみ表示**。複数条件が成立していても、優先順位の最上位 1 件だけを強警告 UI で表示する。**status === 'error' の表示は強警告とは別枠**であり、error 表示と強警告 1 件の共存が許される。

### 2. 表示の優先順位（§4）

1. **status === 'error'** → 最優先でエラー表示（lastError 要約・復旧促し）。
2. **closeAssessment.result === 'needs_manual_close'**（suppressed でない）→ 強警告。閉店対象日は intendedBusinessDateKey。
3. **closeAssessment.result === 'next_day_started'** → §4.1 の事故疑いシグナルで **強** または **弱** に分岐。強なら強警告、弱なら弱警告（store management 端末のみ）。
4. **openAssessment.result === 'skipped' かつ blockers に 'already_running_different_date'** → 強警告。閉店を促す対象日は **currentBusinessDateKey**（開店認定対象日 intended は補助表示のみ）。
5. needs_manual_open は強警告は出さない（情報表示）。
6. processing（ロック中）は Step3 のメッセージ。
7. その他は §6・§7 の決定表に従う。

### 3. next_day_started の強／弱（§4.1）

- **diffDays(currentBusinessDateKey, closeAssessment.intendedBusinessDateKey) === 1** → **強**（典型的な「前日閉店忘れ・当日営業中」）。強警告。
- **diffDays >= 2 または <= 0** → **弱**（誤タスク・古いタスクの可能性）。弱警告。store management 端末のみ表示。
- 弱のときは **非 store management 端末には表示しない**。

### 4. 営業継続に伴う enqueue（§8）

- 呼び出すのは **closeAssessmentTask のみ**。タスク名は `close_assessment_reminder_${intendedBusinessDateKey}_${scheduleTimeEpochSeconds}`。
- openAssessment の already_running_different_date のときも、閉店漏れ疑いのため **closeAssessmentTask** を enqueue し、intendedBusinessDateKey には **currentBusinessDateKey** を渡す。
- キュー投入失敗時は「営業継続に失敗しました（リマインド予約を含む）」等の文言で表示する。

### 5. バナー位置（他画面）

- 非 store management 端末の強警告は、**各画面の最上部（アプリヘッダ直下相当）** にインライン通知として常駐。**AppBar がある画面では AppBar 直下、ない画面では画面上部固定表示**で同等に扱う。

## 実装の対象範囲

- **StoreMetaData の拡張**: closeAssessment / openAssessment / manualOverride / lastError / processing 等を fromDocument で読む（spec §9.3）。
- **terminalHomePage**: 開閉店管理ダイアログでの強／弱警告、日付表示部の warning、§6・§7 の決定表に基づく表示・ボタン。
- **他画面**（tournament_home_page, table_detail_page, order_management_page, side_game_table_list）: StoreMetaService.instance.stream を購読し、§4 の優先順位で強警告を 1 件のみ表示。非 store management 端末は Inline Banner を画面上部に常駐表示。
- **営業継続用 Callable**（別 Step で実装想定）: manualOverride 設定＋closeAssessmentTask の enqueue。payload・タスク名は spec §8 に従う。

## 参照

- **仕様の唯一の正本**: [Phase6 Step4 仕様書（spec.md）](./spec.md)
- **実装タスクの詳細**: [changeSpec_implementation.md](./changeSpec_implementation.md)
- **result 値の一覧とコード根拠**: [assessment_result_values.md](./assessment_result_values.md)
