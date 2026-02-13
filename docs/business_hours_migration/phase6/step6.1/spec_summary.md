# Phase6 Step6.1: 実装照合に基づく仕様まとめ

実コードと Phase6 Step4 仕様（spec.md）・changeSpec_implementation.md を照らし合わせ、**実装状況**と**仕様として正確に決めきれていない項目**をまとめたドキュメントである。

**参照仕様**: `phase6/step4/spec.md`, `phase6/step4/changeSpec_implementation.md`  
**参照実装**: `lib/services/store_meta_service.dart`, `lib/Home/terminalHomePage.dart`, `lib/utils/store_strong_warning_ui.dart`, `lib/utils/store_assessment_utils.dart`, `lib/tournament/active/pages/tournament_home_page.dart`, `lib/tournament/active/pages/table_detail_page.dart`, `lib/OrderView/OrderManagement/order_management_page.dart`, `lib/sideGame/pages/side_game_table_list.dart`

---

## 1. 実装済み項目（仕様・実装の対応）

### 1.1 StoreMetaData の拡張（§9.3 / changeSpec §1）

| 項目 | 仕様 | 実装 | 備考 |
|------|------|------|------|
| 読取対象 | lastClosedBusinessDateKey, lastError, processing, closeAssessment, openAssessment, manualOverride | `StoreMetaData` に上記フィールドを保持。`fromDocument` で `LastErrorDoc`, `ProcessingLeaseDoc`, `CloseAssessmentDoc`, `OpenAssessmentDoc`, `ManualOverrideDoc` を fromMap で設定。 | 型は専用クラスで保持（Map ベタ持ちなし）。 |
| status / currentBusinessDateKey | 維持 | 従来どおり読取。 | — |

**コード根拠**: `lib/services/store_meta_service.dart` の `StoreMetaData`, `fromDocument`, 各 `*Doc.fromMap`。

---

### 1.2 日付ユーティリティ・強警告判定（§4.1 / changeSpec §3.2, §3.3）

| 項目 | 仕様 | 実装 | 備考 |
|------|------|------|------|
| parseDateKeyToUtcDate | YYYY-MM-DD を UTC 日付に変換。ローカル parse は使わない。 | `store_assessment_utils.dart` の `parseDateKeyToUtcDate`。`DateTime.utc(y,m,d)` で生成。 | パース不能時は null。 |
| diffDays | current - intended の日差。判定不能は弱扱い。 | `diffDays(currentBusinessDateKey, intendedBusinessDateKey)`。null のときは弱。 | — |
| next_day_started 強/弱 | diffDays === 1 → 強、それ以外 → 弱。 | `isNextDayStartedStrong(meta)` で diffDays == 1 を判定。 | — |
| 最上位強警告 1 件 | §4 の優先順位で 1 件のみ。 | `getTopStrongWarning(meta)` が needs_manual_close → next_day_started_strong → already_running_different_date の順で最初の 1 件を返す。 | error は強警告に含めない（別枠）。 |
| 表示文言 | §6・§7 の固定案。§10: next_day_started で currentBusinessDateKey が null のときは「現在営業日は取得できません。閉店対象日〇〇の閉店処理をご確認ください。」とする。 | getNextDayStartedWeakWarning は current を `?? ''` で空文字にしており、null 時の専用文言なし。 | **実装漏れ**（今回修正に含める）。 |

**コード根拠**: `lib/utils/store_assessment_utils.dart` の `parseDateKeyToUtcDate`, `diffDays`, `isNextDayStartedStrong`, `getTopStrongWarning`, `getNextDayStartedWeakWarning`。

---

### 1.3 強警告 UI（ゲート・Banner・Overlay）（§4.0 / changeSpec §3.4〜3.6）

| 項目 | 仕様 | 実装 | 備考 |
|------|------|------|------|
| store management: ゲートのみ | dismiss 不可・常駐。Inline Banner は出さない。§6・§7 では「〇〇（閉店対象日）の閉店処理へ」「営業継続」とし、閉店対象日をボタン文言に含める。 | `StrongWarningGate` は「閉店処理へ」「営業継続」の**固定文言**のみ。targetBusinessDateKey をボタンに反映していない。 | **実装漏れ**（今回修正に含める）。 |
| 非 store management: Banner のみ | 初回のみ dismiss 可ダイアログ可、2 回目以降は Inline Banner 常駐。 | `StoreStrongWarningOverlay` が isStoreManagement で分岐。非 store は `StrongWarningBanner`＋初回ダイアログは `_checkAndShowFirstDialogIfNeeded` で永続キー判定。 | — |
| 永続キー | storeId + warningType + targetBusinessDateKey。表示した時点で永続化。 | `store_warning_first_dialog_prefs.dart` で type と targetBusinessDateKey をキーに保存。表示時点で mark する。 | storeId の取り方・キー形式は実装依存の可能性あり。 |
| 条件不成立で除去 | stream 更新でゲート/Banner を消す。 | `StreamBuilder<StoreMetaData>` で `getTopStrongWarning(meta)` が null なら child のみ表示。 | — |

**コード根拠**: `lib/utils/store_strong_warning_ui.dart` の `StrongWarningGate`, `StrongWarningBanner`, `StoreStrongWarningOverlay`。

---

### 1.4 terminalHomePage

| 項目 | 仕様 | 実装 | 備考 |
|------|------|------|------|
| 強警告ゲート/Overlay | body ルートで StoreStrongWarningOverlay。store management 時は onCloseStore / onBusinessContinue を渡す。 | `StoreStrongWarningOverlay(isStoreManagement: ..., onCloseStore: _startCloseFlow, onBusinessContinue: _onBusinessContinue)`。 | 営業継続は暫定 SnackBar（後述）。 |
| 日付表示部の warning | needs_manual_close / next_day_started / already_running_different_date のとき短い文言。 | `_buildStoreStatusAction` 内で `getDateWarningLabel(data)` を呼び、非 null ならアイコン＋文言を日付の横に表示。 | **他画面の日付表示部には未実装**（後述）。 |
| 開閉店管理ダイアログ | §6・§7 に基づく強/弱/情報の出し分け。 | **現状は assessment に依らない簡易表示のみ**（running 時は「現在の営業日」と閉店の説明、closed/error 時は「閉店中です。開店処理を…」）。**§6・§7 の決定表に基づく本文・強/弱/next_day_started の日付明示は未実装**。 | **実装漏れ**。 |
| 閉店中時の「開店処理が必要です」表示 | spec §9.1: status === 'closed' かつ openAssessment が ready_to_open / needs_manual_open（suppressed でない）のとき、日付表示部に !（赤）と「開店処理が必要です」を表示。非 store management はタップでアナウンスのみ（開店処理は行えない）。store management はタップで通常の開閉店管理ダイアログ。 | 未実装。 | 仕様確定済み。 |

**コード根拠**: `lib/Home/terminalHomePage.dart` の `_buildStoreStatusAction`（98–99 行の getDateWarningLabel）, `_showStoreManagementDialog`（225–255 行の content）, body の StoreStrongWarningOverlay（1131–1134 行）。

---

### 1.5 他画面での強警告表示（§9.2）

| 項目 | 仕様 | 実装 | 備考 |
|------|------|------|------|
| 同一 stream・優先順位 | StoreMetaService.instance.stream を購読し §4 の優先順位で強警告 1 件。 | 各画面の body を `StoreStrongWarningWrapper(child: ...)` で包む。Wrapper 内で FutureBuilder(isStoreManagement) → StoreStrongWarningOverlay。Overlay が stream を購読して getTopStrongWarning で表示。 | — |
| 表示場所 | ルート付近で Stack/Overlay。AppBar 直下相当。 | StoreStrongWarningWrapper が child の上に Stack でゲートまたは Banner を重ねる。 | — |
| onCloseStore / onBusinessContinue | **§9.2 確定**: 他画面でも「閉店処理へ」「営業継続」を選択可能とする。**低コストで実装可能**（大幅なコード修正不要）。各画面の StoreStrongWarningWrapper に onCloseStore / onBusinessContinue を渡し、いずれも「terminalHome へ遷移する」コールバックとする。遷移後はホームのゲートで同じボタンが表示され、そこで閉店処理・営業継続を実行する。 | **他画面では Wrapper に onCloseStore / onBusinessContinue を渡していない。** | **実装漏れ**。コールバック渡しのみで対応可能。 |

**コード根拠**: `tournament_home_page.dart`（1236 行）, `table_detail_page.dart`（207 行）, `order_management_page.dart`（99 行）, `side_game_table_list.dart`（71 行）はいずれも `StoreStrongWarningWrapper(child: ...)` のみでコールバックなし。

---

## 2. 意図的に未実装（本 Step 対象外・別 Step 想定）

以下は spec §1.3 非スコープまたは §8.6 に従い、**本 Step では実装しない**とされている項目。実装状況は仕様どおり。

| 項目 | 仕様 | 実装 | 備考 |
|------|------|------|------|
| 営業継続の「閉店時間の目安」選択 UI | 1〜8 時間のプルダウンを選び、override＋enqueue を 1 操作で実行（§8.1）。 | 未実装。terminalHomePage の「営業継続」は `_onBusinessContinue` で SnackBar「営業継続（リマインド予約）は準備中です。」のみ。 | 別 Step で Callable 実装後に UI を接続する想定。 |
| 営業継続用 Callable | manualOverride（close_skip）の設定＋指定時間後の closeAssessmentTask の enqueue（§8）。 | 未実装。 | 同上。 |
| manualOverride の書き込み | 本 Step では「manualOverride が存在するときの表示の扱い」のみ定義（§1.3）。 | 書き込み UI なし。 | 仕様どおり。 |
| リマインド（closeAssessmentTask）の enqueue | 営業継続選択時に必ず enqueue（§8）。 | アプリ側から enqueue する処理なし。 | Callable 実装後に実施。 |

---

## 3. 実装漏れ・仕様との差分

| 項目 | 仕様 | 現状実装 | 必要な対応 |
|------|------|----------|------------|
| 開閉店管理ダイアログの本文 | §6・§7 の決定表に従い、強警告・弱警告・情報（ready_to_open / needs_manual_open 等）・next_day_started の「閉店対象日」「現在営業日」明示を出し分ける。 | ダイアログ content は「running 時は現在の営業日＋閉店の説明」「closed/error 時は閉店中＋開店ボタン」の 2 パターンのみ。assessment の result に応じた文言・強/弱の出し分けなし。 | ダイアログを開いた時点の meta に対し、getTopStrongWarning / getNextDayStartedWeakWarning / closeAssessment.result / openAssessment.result に基づき §6・§7 の表どおり本文を組み立てて表示する。 |
| failed-precondition 時の開店処理の文言 | §4 項目6・§6: 「〇〇処理が**他の操作で**実行中です。完了するまでお待ちください。」閉店・開店とも同形。 | 閉店処理は「閉店処理が**他の操作で**実行中です。」と実装済み。開店処理は「開店処理が実行中です。」のみで**「他の操作で」が抜けている**。 | 開店処理の failed-precondition 時の SnackBar を「開店処理が**他の操作で**実行中です。完了するまでお待ちください。」に変更する（terminalHomePage.dart）。 |
| 強警告ゲートの「閉店処理へ」ボタン文言 | §6・§7: store management 端末は「**〇〇（閉店対象日）の**閉店処理へ」「営業継続」とする。 | StrongWarningGate は「閉店処理へ」の固定文言のみ。targetBusinessDateKey は渡されているがボタンに未使用。 | StrongWarningGate で targetBusinessDateKey を使い、ボタン文言を「〇〇（閉店対象日）の閉店処理へ」形式にする（store_strong_warning_ui.dart）。 |
| next_day_started で currentBusinessDateKey が null のとき | §10: 弱警告として扱い、文言は「現在営業日は取得できません。閉店対象日〇〇の閉店処理をご確認ください。」とする。 | getNextDayStartedWeakWarning は current = meta.currentBusinessDateKey ?? '' で共通メッセージを返しており、null 時の専用文言なし。 | getNextDayStartedWeakWarning で currentBusinessDateKey が null のとき、上記専用メッセージを返す（store_assessment_utils.dart）。 |

---

## 4. 仕様確定済み・未確定項目

### 4.1 他画面での「閉店処理へ」「営業継続」（仕様確定済み）

- **決定**: 他画面からでも「閉店処理へ」「営業継続」を選択可能とする。**低コストで実装可能**（大幅なコード修正は不要）。
- **実装方針**: 各画面の `StoreStrongWarningWrapper` に **onCloseStore** および **onBusinessContinue** を渡し、いずれも **「terminalHome へ遷移する」コールバック**とする。ユーザーが他画面でボタンをタップするとホームに遷移し、ホームの強警告ゲートで同じボタンが表示されるため、そこで閉店処理・営業継続を実行する。既存の StrongWarningGate は onCloseStore / onBusinessContinue が非 null のときボタンを表示するため、コールバックを渡すだけでよい。

### 4.2 ready_to_open の表示（仕様確定済み）

- **決定**: ready_to_open は **§7 の軽い情報表示と同じ表示**でよい。**closeAssessment による強警告・弱警告と重複している場合は警告を優先し、ready_to_open は表示しない**。警告が解消され、改めて ready_to_open 条件が成立した場合には表示する。

### 4.3 needs_manual_open の表示

- **仕様の記述**: spec §7 では「情報表示（強警告は出さない）」で「手動で開店処理が必要です。」等。store management は「開店処理へ」を出してよい。
- **現状**: 表示場所・blockers に応じた追記の具体的文言は changeSpec で細かくタスク化されていない。開閉店管理ダイアログの §6・§7 出し分け実装に含めて扱う想定。

### 4.4 status === 'error' のときの lastError 表示（当面方針確定・将来は Step7）

- **決定（当面）**: **ダイアログでエラー内容（lastError）をそのまま表示**する。
- **将来**: Phase6 **Step7** フォルダを作成し、今後の実装として「**エラー内容と出力の一覧**を整備し、**UI でエラーが分かるようにする**必要がある可能性がある」と記載済み（`phase6/step7/error_ui_future_work.md`）。エラーコード・failedStep とユーザー向け文言の対応表や、復旧操作の具体的 UI は将来検討とする。

### 4.5 他画面の日付表示部での warning（仕様確定済み）

- **決定**: 「日付表示」の対象は **Phase6 Step1 implementation_summary に記載の 4 画面**（`tournament_home_page`, `table_detail_page`, `order_management_page`, `side_game_table_home`）。表示形式は **terminalHomePage の日付表示部に統一**する（getDateWarningLabel 相当を用い、warning 時はアイコン＋短い文言を日付の横に表示）。**他画面では push された時の初回ダイアログは不要**（terminalHome と異なり、日付＋warning のインライン表示のみとする）。

---

## 5. 一覧サマリ

| 分類 | 内容 |
|------|------|
| 実装済み | StoreMetaData 拡張、日付ユーティリティ・強警告判定、ゲート/Banner/Overlay、terminalHomePage の Overlay・日付 warning、他画面の Wrapper（強警告表示）。 |
| 意図的に未実装 | 営業継続の閉店時間の目安選択 UI、営業継続用 Callable、manualOverride 書き込み、リマインド enqueue。 |
| 実装漏れ | 開閉店管理ダイアログの本文を §6・§7 に基づいて出し分ける（強・弱・情報・next_day_started の日付明示）。閉店中時の「開店処理が必要です」表示（! 赤・タップ時権限別ダイアログ）。他画面の Wrapper への onCloseStore / onBusinessContinue 渡し（ホームへ遷移）。他画面 4 画面の日付表示形式の統一（getDateWarningLabel 相当・push 時ダイアログ不要）。**仕様とのズレ（今回修正に含める）**: failed-precondition 時の開店処理 SnackBar に「他の操作で」を追加。強警告ゲートのボタン文言を「〇〇（閉店対象日）の閉店処理へ」に変更。next_day_started で currentBusinessDateKey が null のときの専用文言（§10）を getNextDayStartedWeakWarning で返す。 |
| 仕様確定済み | 他画面でも「閉店処理へ」「営業継続」を低コストで実装（ホームへ遷移コールバック）。ready_to_open は警告と重複時は非表示、解消後に表示。error は当面ダイアログで lastError をそのまま表示、Step7 で将来のエラー一覧・UI 整備を記載。他画面の日付表示対象は implementation_summary の 4 画面、形式は terminalHome に統一。 |

---

以上を Phase6 Step6.1 の実装照合に基づく仕様まとめとする。
