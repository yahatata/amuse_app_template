# Phase6 Step4: storeMeta 監視と assessment に基づく UI 表示・操作 - 実装詳細仕様書

## 変更履歴

- **2026-02-XX**: 実装の一意性確保のため A〜E を追記。非 store management 初回ダイアログ判定（永続キー固定・アプリ横断）、store management 強警告の dismiss 不可・常駐ゲート方針、suppressedByOverride の抑制範囲、diffDays 算出手順、ダイアログ／ゲートの stream 追従、StoreMetaData 拡張の型設計の最低ラインを明文化。
- **2026-02-XX**: Phase6 Step4 仕様書（spec.md）の追修正を反映。open リマインド削除・next_day_started 弱の整合・非 store management 強警告バナー明文化・他画面バナー配置抽象化・error と強警告 1 件制御の関係明確化に基づく実装タスクを整理。

## 概要

`storeMeta/currentBusinessDay` の **closeAssessment / openAssessment / state / processing** に基づき、表示種別・文言・ボタン・権限別挙動を実装する。**唯一の仕様正本は [spec.md](./spec.md)** であり、本ドキュメントは spec から導かれる実装タスク・ファイル・参照箇所を列挙する。

## 参照した仕様・コード

- **仕様**: [Phase6 Step4 仕様書（spec.md）](./spec.md) の §1〜§11 および変更点サマリ
- **Flutter**: `lib/services/store_meta_service.dart`（StoreMetaData.fromDocument の現状）、`lib/services/device_service.dart`（getCurrentDevice）、`lib/services/device_options.dart`（storeManagement）
- **Functions**: `functions/src/helpers/stateDoc/types.ts`、`functions/src/tasks/closeAssessmentTask.ts`、`functions/src/tasks/openAssessmentTask.ts`、`functions/src/scheduler/weeklyPlanner.ts`

---

## 実装タスク

### 0. 対象範囲の確認

**Phase6 Step4 の対象**:
- StoreMetaData の拡張（closeAssessment / openAssessment / manualOverride / lastError / processing 等の読取）
- terminalHomePage の開閉店管理ダイアログ・日付表示部の表示・強／弱警告・ボタン
- 他画面（tournament_home_page, table_detail_page, order_management_page, side_game_table_list）での強警告表示・Inline Banner 配置
- 営業継続に伴う enqueue の**仕様の明文化**（実装は Callable 等で別 Step 想定。payload・タスク名は §8 に従う）

**対象外**:
- closeAssessmentTask / openAssessmentTask の既存実装の変更（コード修正禁止）
- weeklyPlanner の変更
- manualOverride を**書き込む** UI の実装（既存または別 Step。本 Step では「manualOverride が存在するときの表示の扱い」のみ仕様化）

---

### 1. StoreMetaData の拡張（§9.3）

**ファイル**: `lib/services/store_meta_service.dart`

**仕様**: spec §9.3「Step4 で追加する読取対象」

**実装内容**:
- `StoreMetaData.fromDocument`（および必要ならクラスフィールド）で、以下を `doc.data()` から読み、null 安全に扱う。**最低限、型（クラス／モデル）として保持すべきフィールドを以下に固定する。Map でベタ持ちにする方式は採用しない。専用の型（例: ネストしたクラスや typedef）を定義し、fromDocument で詰める前提とする。**
  - **state**: `lastClosedBusinessDateKey`（String?）, `lastError`（Map または専用型。code, message, failedStep, at, context?）, `processing`（Step3 整合。runId, startedAt, leaseExpiresAt, kind）
  - **closeAssessment**（専用型）: `result`（String?）, `blockers`（List<String>）, `intendedBusinessDateKey`（String?）, `suppressedByOverride`（bool）, `decidedAt`（Timestamp?）, `scheduledAt`（String?）、その他 spec §2.2 で必要なフィールド
  - **openAssessment**（専用型）: 上記と同構成（result, blockers, intendedBusinessDateKey, suppressedByOverride, decidedAt, scheduledAt 等）
  - **manualOverride**（専用型）: `type`（String?）, `intendedBusinessDateKey`（String?）, `overrideUntil`（Timestamp? または表示用の DateTime?）
- 既存の status / currentBusinessDateKey は維持する。
- **next_day_started の事故疑いシグナル判定**（§4.1）に currentBusinessDateKey と closeAssessment.intendedBusinessDateKey が必要なため、これらが StoreMetaData から取得できるようにする。

**コード根拠**: spec §2（データモデル）、§3（result 一覧）。`functions/src/helpers/stateDoc/types.ts` の CurrentBusinessDayDoc は closeAssessment / openAssessment / manualOverride を含まないが、Firestore 上ではタスクが書き込む（spec 注記）。

---

### 2. 端末権限の判定（§5.1）

**ファイル**: 表示・ボタン制御を行う各画面、または共通ヘルパー

**仕様**: spec §5.1「store management 端末の判定」

**実装内容**:
- **store management 端末**: `role === 'admin'` または `role === 'terminal' && options['store_management'] == true`
- **非 store management 端末**: 上記以外
- 判定は `lib/services/device_service.dart` の `getCurrentDevice()` で device を取得し、`role` および `lib/services/device_options.dart` の `DeviceOptionKeys.storeManagement`（`'store_management'`）を参照する（spec 根拠: device_service.dart 302–308 行、device_options.dart）。

---

### 3. UI 優先順位と表示種別の実装（§4・§6・§7）

**仕様**: spec §4（優先順位）、§4.0（強警告・弱警告の定義）、§4.1（next_day_started の強／弱）、§6（closeAssessment 決定表）、§7（openAssessment 決定表）

#### 3.1 抑制判定（suppressedByOverride）の適用範囲（必須）

- **主条件**: 表示の抑制の有無は **assessment.suppressedByOverride === true** を**主条件**とする。manualOverride.overrideUntil のクライアント側での比較は**補助用途**（表示用「いつまで抑制か」の表示のみ）とし、抑制判定の主条件にはしない（spec §2.4 と整合）。
- **適用範囲**: **closeAssessment.suppressedByOverride === true** のとき、当該 closeAssessment に由来する**強警告・弱警告・情報表示を一律に表示しない**。needs_manual_close / next_day_started 等のいずれも出さない。§6 の needs_manual_close_suppressed の行に従い表示なしとする。
- **openAssessment.suppressedByOverride === true** のとき、当該 openAssessment に由来する表示（強警告・弱警告・情報表示）を一律に表示しない。**already_running_different_date の強警告も suppressed なら出さない**。§7 の suppressed 時の扱いに従う。

#### 3.2 diffDays の算出手順（必須）

next_day_started の強／弱判定（§4.1）に用いる **diffDays** は、タイムゾーンの影響を受けない形で算出する。**以下の手順を仕様として採用する。**

- **日付キーの解釈**: `dateKey`（YYYY-MM-DD 文字列）を **UTC の日付** に変換する。**端末ローカルタイムゾーンに依存する `DateTime.parse(dateKey)` は使用しない。** 実装例（Dart）: 文字列を分割して `DateTime.utc(int.parse(parts[0]), int.parse(parts[1]), int.parse(parts[2]))` で生成する関数を用意する（名前は例: `parseDateKeyToUtcDate(dateKey)`）。
- **日差の算出**: `currentUtc = parseDateKeyToUtcDate(currentBusinessDateKey)`, `intendedUtc = parseDateKeyToUtcDate(closeAssessment.intendedBusinessDateKey)` とし、**diffDays = currentUtc.difference(intendedUtc).inDays** とする（Dart の `Duration.inDays` は日付境界をまたいだ「日数」の差となる）。
- **判定**: diffDays === 1 → 事故疑いシグナル**強**（強警告）。diffDays >= 2 または <= 0 → **弱**（弱警告）。currentBusinessDateKey または intendedBusinessDateKey が null のときは**弱**とする。
- **パース不能時**: dateKey の文字列フォーマットが不正（例: `2026-2-1` のようにゼロパディングなし、不正文字含む）でパース不能の場合は、**diffDays 判定不能として弱扱い**とする（spec の「判定不能は弱」と整合）。

#### 3.3 実装内容（優先順位・表示種別）

- **優先順位**: §4 の 1〜7 の順で条件を評価し、最初に成立した表示種別を採用する。**表示判定の前に、当該 assessment の suppressedByOverride が true ならその assessment 由来の強警告・弱警告・情報表示は出さない**（上記 3.1 を適用）。
- **status === 'error'**: 強警告とは別枠。error 表示と強警告 1 件の**共存**を許す（§4.0 補足）。
- **強警告は同時に 1 件のみ**: 複数条件が成立しても、優先順位の最上位 1 件のみ強警告 UI を表示する。
- **closeAssessment.result**（suppressed でない場合のみ表示）:
  - needs_manual_close → 強警告。§6 の表示文言・store management 端末の「閉店処理へ」「営業継続」、非 store management 端末は「初回のみ dismiss 可ダイアログ、2 回目以降は Inline Banner 常駐のみ」（詳細は 3.6）。
  - next_day_started → 上記 diffDays（3.2）で強／弱を判定。強なら強警告、弱なら弱警告（store management 端末のみ表示。非 store management 端末は表示しない）。
  - その他は §6 の表に従う。
- **openAssessment.result**（suppressed でない場合のみ表示）:
  - skipped かつ blockers に 'already_running_different_date' → 強警告。閉店対象日は **state.currentBusinessDateKey**。§7 の表示文言・ボタン・非 store management 端末は 3.6 と同型。
  - その他は §7 の表に従う。

#### 3.4 強警告 UI の描画形態は端末種別で排他的（必須）

同一条件で「ゲート」と「Inline Banner」の両方を出さない。**強警告 UI の描画形態は端末種別で排他的（mutually exclusive）**とする。

- **store management 端末**: 強警告時は**ゲートのみ**を表示する。**Inline Banner は出さない**。
- **非 store management 端末**: 強警告時は**Inline Banner のみ**を表示する（初回のみ補助的に dismiss 可ダイアログを出す）。**ゲート（dismiss 不可のブロッキング UI）は出さない**。

上記を守ることで、同一画面でゲートと Banner が重複表示される実装ミスを防ぐ。

#### 3.5 store management 端末の強警告 UI：dismiss 不可・常駐ゲート（必須）

- **仕様**: store management 端末の強警告は **dismiss 不可**（閉じるボタンなし・外タップで閉じない・Back で閉じない）。条件が成立している限り**常駐**する。
- **解除**: 強警告が消えるのは**ユーザー操作で閉じたからではなく、Firestore の状態が変わり表示条件が不成立になったときのみ**である。実装では **StoreMetaService.instance.stream の更新を購読し、条件が不成立になったら即座にゲート UI を除去する**こととする。
- **推奨実装方式**: **画面ルートに Stack / Overlay でゲート UI を常駐させる方式**を推奨する。強警告ウィジェットを pop できないレイヤーとして重ね、条件が不成立になるまで表示し続ける。stream の snapshot で強警告条件が false になった時点でそのウィジェットを外す。
- **代替方式**: `showDialog(barrierDismissible: false)` と `PopScope(canPop: false)`（または WillPopScope）でモーダルを表示する場合、**Firestore 状態変化で条件が不成立になったら、プログラムからそのダイアログを閉じる（Navigator.pop）必要がある**。stream 購読で条件が false になったタイミングで pop を呼ぶ実装とし、「ユーザーが閉じる」のではなく「条件変化で閉じる」ことを忘れないこと。

#### 3.6 非 store management 端末の「初回のみダイアログ」判定（必須）

- **ルール**: 非 store management 端末で強警告を表示する場合、**初回のみ** dismiss 可能なダイアログの表示を許可する。**2 回目以降**は Inline Banner 常駐のみとし、ダイアログは出さない（Banner は閉じられない・画面操作はブロックしない）。
- **「表示済み」の保存タイミング（採用）**: **非 store management 端末の初回ダイアログは、表示した時点で「表示済み」を永続化する（dismiss 完了を待たない）。** これにより、画面遷移やクラッシュがあっても「初回ダイアログの連打」を防げる。
- **初回の定義**: **アプリ横断で 1 回**とする。terminalHomePage だけ・特定画面だけで 1 回とするのではなく、**同一の「強警告の種類＋閉店対象日」の組み合わせについて、アプリ全体で初回のみ**ダイアログを出す。
- **永続化**: 「初回を見たか」の判定は**端末ローカル永続**（例: SharedPreferences）で保持する。メモリのみ・アプリ再起動でリセット、は採用しない。**永続キーを固定する。**
- **永続キー構成（採用）**: 次の 3 要素を連結した文字列をキーとする（区切り文字は実装で固定、例: `_` や `|`）。
  - **storeId**: 対象店舗 ID（storeMeta のドキュメントパスから取得する等、アプリで一意に決まる値）
  - **warningType**: 最上位強警告の種別。次のいずれかで固定する。`needs_manual_close` / `next_day_started_strong` / `already_running_different_date`
  - **targetBusinessDateKey**: 閉店対象日（YYYY-MM-DD）。needs_manual_close および next_day_started の場合は **closeAssessment.intendedBusinessDateKey**。already_running_different_date の場合は **state.currentBusinessDateKey**
- **例**: キーが `store123_needs_manual_close_2025-02-09` のような形になる。このキーで「既に初回ダイアログを表示済み」を永続に書き、2 回目以降は Banner のみ表示する。
- **スコープ**: terminalHomePage の開閉店管理ダイアログ内での強警告も、他画面での強警告も、**同じ永続キー**を参照する。画面単位で別カウントにしない。

---

### 4. terminalHomePage（§9.1）

**ファイル**: `lib/Home/terminalHomePage.dart`

**仕様**: spec §9.1

**実装内容**:
- **開閉店管理ダイアログ**: ダイアログを**開いた瞬間**の参照だけでなく、**表示中も StoreMetaService.instance.stream の購読を継続し、snapshot 更新に追従して表示を更新する**。つまり、ダイアログを開いたまま Firestore が更新されれば、強警告→表示なし／弱警告→情報表示など、その時点の §6・§7 の決定表に従った表示に切り替える。§6・§7 の決定表に従い強警告・弱警告または情報表示。強警告は §4.0 のとおり（store management 端末はブロッキングゲートのみ・§3.4〜3.5、非 store management 端末は §3.6 の初回ダイアログ判定ののち画面上部 Inline Banner のみ・§3.4。§9.2 のバナー位置の抽象化に従う）。next_day_started のときはダイアログ内に「閉店対象日」と「現在営業日」を必ず明示。
- **強警告ゲート／Inline Banner の消えるタイミング**: 強警告表示中に Firestore の状態が変わり表示条件が不成立になったら、**stream の snapshot 更新をトリガーに、ゲート／Banner を自動で除去する**。ユーザーが「閉じる」操作で消すのではなく、条件不成立で消える実装とする。
- **日付表示部**（AppBar の _buildStoreStatusAction 付近）: status に加え、closeAssessment.result === 'needs_manual_close' / 'next_day_started'、または openAssessment.result === 'skipped' かつ blockers に 'already_running_different_date' のとき、日付の横に warning アイコンまたは短い文言。needs_manual_close / next_day_started は「閉店未実施（閉店対象日）」、already_running_different_date は「閉店未実施疑い（currentBusinessDateKey）」。
- 表示タイミング: 初回表示時および StoreMetaService.instance.stream の購読更新時。ダイアログは「開閉店管理」を開いたときにその時点の assessment を参照し、**開いている間は stream に追従して更新する**。

---

### 5. 他画面での強警告表示（§9.2）

**ファイル**:
- `lib/tournament/active/pages/tournament_home_page.dart`
- `lib/tournament/active/pages/table_detail_page.dart`
- `lib/OrderView/OrderManagement/order_management_page.dart`
- `lib/sideGame/pages/side_game_table_list.dart`

**仕様**: spec §9.2

**実装内容**:
- 同じ **StoreMetaService.instance.stream** を購読し、§4 の優先順位に従い**強警告**を出す。表示種別・文言・store management／非 store management の差は §6・§7 と同一とする。**条件が不成立になったら stream 更新で即座にゲート／Banner を除去する**（§4 と同様）。
- **store management 端末**: 条件を満たすときブロッキング強警告（ゲート）を 1 件のみ表示（§4.0）。Inline Banner は出さない（§3.4）。実装方針は **§3.5** に従う（dismiss 不可・常駐・条件変化で除去）。
- **非 store management 端末**: 強警告は**各画面の最上部（アプリヘッダ直下相当）**に Inline Banner のみ常駐表示（ゲートは出さない・§3.4）。**初回のみ** dismiss 可ダイアログを表示するかどうかは **§3.6** の永続キー（storeId + warningType + targetBusinessDateKey）で判定し、表示した時点で「表示済み」を永続化する。**2 回目以降は Inline Banner 常駐のみ**（ダイアログは出さない）。AppBar が存在する画面では AppBar 直下、存在しない画面では画面上部固定表示で同等に扱う。強警告 UI は同時に 1 件のみ（§4.0）。
- 表示場所: 各画面の build のルート付近で、Stack または Overlay により条件を満たすとき強警告を重ねる。日付表示がある場合は terminalHomePage と同様に warning を出してよい。

---

### 6. 営業継続に伴う enqueue 仕様（§8）— 仕様の明文化・Callable 実装時の参照

**本 Step では Callable の実装は行わない**。仕様として以下を満たす実装（別 Step）を行う想定とする。

**仕様**: spec §8.1〜§8.6

**実装時（Callable または同等）の参照**:
- **enqueue するタスク**: **closeAssessmentTask のみ**。openAssessmentTask の enqueue は行わない（§8.2・§8.3）。
- **タスク名**: `close_assessment_reminder_${intendedBusinessDateKey}_${scheduleTimeEpochSeconds}`（§8.3）。open_assessment_reminder_ は使用しない。
- **payload**: `{ action: 'close_assessment', intendedBusinessDateKey: string（閉店対象日）, scheduledAt: string（ISO 8601） }`（§8.2）。
- **閉店対象日**: closeAssessment の needs_manual_close / next_day_started のときは closeAssessment.intendedBusinessDateKey。openAssessment の already_running_different_date のときは **state.currentBusinessDateKey**（§8.1 の表）。
- **同一営業日に複数リマインド**: 許可。別時刻で closeAssessmentTask が再実行される（§8.4）。
- **失敗時**: キュー投入失敗時はクライアントにエラーを返し、SnackBar で「営業継続に失敗しました（リマインド予約を含む）」等を表示（§8.5）。HTTP 失敗（closeAssessmentTask が 5xx 等）は Cloud Tasks のリトライに任せる。

---

### 7. エッジケース・防御設計（§10）

**仕様**: spec §10 の表

**実装内容**:
- closeAssessment / openAssessment が null → 表示なし。強警告は出さない。
- **assessment.suppressedByOverride === true** のとき、当該 assessment 由来の強警告・弱警告・情報表示は**一律に表示しない**（§3.1 の抑制範囲を適用）。抑制の有無の**主条件**は **suppressedByOverride** とする。manualOverride.overrideUntil のクライアント比較は補助用途（表示用）のみ（§2.4）。
- result が欠損または一覧以外の文字列 → 強警告は出さない。必要なら「認定結果を取得できませんでした」等の軽い表示のみ。
- status が 'closed' / 'running' / 'error' 以外 → isUnknownStatus 相当でエラー表示または「状態不明」。
- decidedAt が過去 → 認定結果は「その時点のスナップショット」として扱い、needs_manual_close / next_day_started 等なら表示する。
- processing が残留（lease 期限切れ前）→ Step3 の「閉店処理／開店処理実行中」として扱う。assessment 強警告と同時のときは §4 に従い assessment を優先表示。
- next_day_started で currentBusinessDateKey が null → 弱警告として扱い、store management 端末のみダイアログ（dismiss 可）で表示。

---

## 作成・更新するファイル一覧

| 種別 | ファイル | 内容 |
|------|----------|------|
| 更新 | `lib/services/store_meta_service.dart` | StoreMetaData の拡張（§9.3） |
| 更新 | `lib/Home/terminalHomePage.dart` | 開閉店管理ダイアログ・日付表示部・強／弱警告（§9.1） |
| 更新 | `lib/tournament/active/pages/tournament_home_page.dart` | 強警告表示・Inline Banner（§9.2） |
| 更新 | `lib/tournament/active/pages/table_detail_page.dart` | 同上 |
| 更新 | `lib/OrderView/OrderManagement/order_management_page.dart` | 同上 |
| 更新 | `lib/sideGame/pages/side_game_table_list.dart` | 同上 |
| 新規（別 Step 想定） | 営業継続用 Callable または同等 | §8 の payload・タスク名・権限チェック |

共通ウィジェット・ヘルパー（強警告ダイアログ、Inline Banner、優先順位判定、diffDays 計算等）は、上記のいずれかまたは `lib/utils` 等に配置してよい。spec では「どこに置くか」は規定していない。

---

## 受入条件（Definition of Done）

spec §11 のチェックリストに加え、以下を満たすこと。

- [ ] StoreMetaData が spec §9.3 の読取対象をすべて fromDocument で読み、null 安全に扱っている。
- [ ] store management / 非 store management の判定が §5.1 に従っている。
- [ ] §4 の優先順位・§6・§7 の決定表に従った表示種別・文言・ボタンが実装されている。
- [ ] 強警告は同時に 1 件のみ表示され、status === 'error' は強警告とは別枠で error 表示と強警告 1 件の共存が可能である。
- [ ] 他画面の非 store management 端末の強警告は、画面上部（AppBar がある場合は AppBar 直下、ない場合は画面上部固定）に Inline Banner として常駐表示される。
- [ ] 営業継続を選んだ場合の enqueue は closeAssessmentTask のみであり、タスク名・payload が §8 に従う（Callable 実装時）。単独リマインドボタンは提供しない。
- [ ] キュー投入失敗時の UI 文言が「営業継続に失敗しました（リマインド予約を含む）」等、enqueue を含むことが分かる表現になっている。

---

## 今回追記したポイント一覧

- **A. 非 store management 端末の「初回のみダイアログ」判定**: §3.6 に永続キー（storeId + warningType + targetBusinessDateKey）を固定で明文化。端末ローカル永続で保持、アプリ横断で 1 回のみダイアログ、2 回目以降は Inline Banner 常駐のみ。**表示した時点で「表示済み」を永続化する**（dismiss 完了を待たない）。強警告 UI は端末種別で排他的（§3.4：store はゲートのみ、非 store は Banner のみ）。
- **B. store management 端末の強警告（dismiss 不可・常駐ゲート）**: §3.4（排他）・§3.5 でゲートのみ（Inline Banner は出さない）と推奨方式（Stack/Overlay）／代替方式（showDialog + PopScope）を明文化。条件不成立で自動除去、showDialog の場合は stream で条件変化時に pop することを注記。
- **C. suppressedByOverride の抑制範囲**: §3.1 で closeAssessment / openAssessment それぞれについて、suppressed なら当該 assessment 由来の強警告・弱警告・情報表示を一律抑制することを明文化。主条件は suppressedByOverride、overrideUntil は補助であることを §7 でも再記。
- **D. diffDays の算出手順**: §3.2 で parseDateKeyToUtcDate（DateTime.utc(y,m,d) 相当）と diffDays = currentUtc.difference(intendedUtc).inDays を固定。端末ローカル timezone の DateTime.parse に依存しない旨を注意書き。パース不能（フォーマット不正等）の場合は判定不能として弱扱い（spec と整合）。
- **E-1. ダイアログ・ゲートの参照と更新**: §4 で開閉店管理ダイアログは表示中も stream に追従して更新すること、強警告ゲート／Banner は条件不成立で自動で消えることを明記。
- **E-2. StoreMetaData 拡張の型設計**: §1 で state / closeAssessment / openAssessment / manualOverride の最低限の型（フィールド）を列挙し、Map ベタ持ちは採用せず専用型を定義する前提で明文化。
