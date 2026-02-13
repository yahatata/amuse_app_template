# Phase6 Step6.1: 未実装項目の実装用 changeSpec

[spec_summary.md](./spec_summary.md) および [phase6/step4/spec.md](../step4/spec.md) に基づく**未実装内容**を実装するための変更仕様書。実コードを確認した上で、ファイル・箇所・具体的な変更内容を記載する。

**参照**: `phase6/step4/spec.md` §4, §6, §7, §9.1, §9.2 / `phase6/step4/changeSpec_implementation.md` / `phase6/step6.1/spec_summary.md` §3, §5

---

## 0. 対象タスク一覧

| # | タスク | 主な変更ファイル |
|---|--------|------------------|
| 1 | 開閉店管理ダイアログの本文を §6・§7 に基づいて出し分け | terminalHomePage.dart, store_assessment_utils.dart（必要ならヘルパー追加） |
| 2 | 閉店中時の「開店処理が必要です」表示（! 赤・タップ時権限別） | terminalHomePage.dart, store_assessment_utils.dart（ヘルパー追加） |
| 3 | status === 'error' 時に lastError をダイアログでそのまま表示 | terminalHomePage.dart |
| 4 | 他画面の StoreStrongWarningWrapper に onCloseStore / onBusinessContinue 渡し | tournament_home_page, table_detail_page, order_management_page, side_game_table_list |
| 5 | 他画面 4 画面の日付表示形式を terminalHome に統一（getDateWarningLabel） | tournament_home_page, table_detail_page, order_management_page, side_game_table_home |
| 6 | failed-precondition 時の開店処理 SnackBar に「他の操作で」を追加 | terminalHomePage.dart |
| 7 | 強警告ゲートのボタン文言を「〇〇（閉店対象日）の閉店処理へ」に変更 | store_strong_warning_ui.dart |
| 8 | next_day_started で currentBusinessDateKey が null のときの専用文言（§10） | store_assessment_utils.dart |

---

## 1. 開閉店管理ダイアログの本文を §6・§7 に基づいて出し分ける

### 1.1 仕様

- spec §9.1: ダイアログを開いた時点で storeMeta/currentBusinessDay を参照し、**表示中も Stream 購読を継続**して snapshot 更新に追従する。
- §6・§7 の決定表に従い、**強警告・弱警告・情報表示（ready_to_open / needs_manual_open 等）・next_day_started の閉店対象日／現在営業日明示**を出し分ける。
- **ready_to_open** は、closeAssessment による強警告・弱警告が成立しているときは**表示しない**。警告解消後に ready_to_open 条件が成立すれば表示する。

### 1.2 現状コード

- **ファイル**: `lib/Home/terminalHomePage.dart`
- **箇所**: `_showStoreManagementDialog` 内の `AlertDialog` の `content`（約 225–286 行）。
- **現状**: `StreamBuilder<StoreMetaData>` で meta を取得しているが、表示は 3 パターンのみ。
  - `meta.isRunning && meta.currentBusinessDateKey != null` → 「現在の営業日: …」＋閉店の説明。
  - `meta.isClosed || meta.isError` → 「閉店中です。開店処理を…」の 1 文。
  - それ以外 → 「営業状態を取得できませんでした。」

### 1.3 変更内容

1. **表示ロジックの優先順位**（spec §4 の 1〜7 に合わせる）
   - **1. status === 'error'**: ダイアログ本文に「エラー状態です。」と lastError の要約（code / message / failedStep 等をそのまま表示してよい）を表示。既存の actions（キャンセル・閉店処理・開店処理・初期化）は meta の状態に応じて出し分け済みのため、content のみ §3 で扱う lastError 表示に差し替える。
   - **2. 強警告が成立**: `getTopStrongWarning(meta) != null` のときは、その 1 件の `message` を本文に表示。文言は既に store_assessment_utils で §6・§7 に沿って組み立て済み。ダイアログ内では「強警告であること」を簡潔に示し、閉店対象日・現在営業日は message に含まれる。
   - **3. 弱警告（next_day_started 弱）**: `getNextDayStartedWeakWarning(meta) != null` のときは、その `message` を本文に表示。§6 の「閉店対象日」「現在営業日」明示を含む。
   - **4. 通常の running**: 現状どおり「現在の営業日: …」＋閉店の説明。必要なら「閉店処理を開始する」ボタンのみ表示（既存の StreamBuilder で制御済み）。
   - **5. 通常の closed / 開店側情報**: openAssessment の **ready_to_open** または **needs_manual_open**（いずれも suppressed でない）のときは §7 の情報表示。**ready_to_open** は `getTopStrongWarning(meta) != null` または `getNextDayStartedWeakWarning(meta) != null` のときは表示しない（警告優先）。表示する場合は「〇〇（intendedBusinessDateKey）の開店準備が整っています。」または needs_manual_open の文言。
   - **6. 上記以外の closed**: 「閉店中です。開店処理を開始するには…」の現状文言でよい。
   - **7. その他**: 「営業状態を取得できませんでした。」または null 安全のフォールバック。

2. **ready_to_open の重複抑制**
   - openAssessment?.result == 'ready_to_open' かつ openAssessment?.suppressedByOverride != true のとき、**さらに** getTopStrongWarning(meta) と getNextDayStartedWeakWarning(meta) の両方が null のときだけ「開店準備が整っています」を表示する。

3. **実装の置き場所**
   - 本文の組み立ては `terminalHomePage.dart` 内の `StreamBuilder` の builder 内で、meta に応じた if-else または switch で分岐してよい。または `lib/utils/store_assessment_utils.dart` に「ダイアログ用の本文と種別を返す関数」を追加し、それを使う形でもよい（例: `StoreManagementDialogContent? getStoreManagementDialogContent(StoreMetaData meta)` で、強警告／弱警告／情報／通常のいずれかと表示文言を返す）。

4. **actions の扱い**
   - 既存の「キャンセル」「閉店処理を開始する」「開店処理を開始する」「初期化」は、meta の isRunning / isClosed / isError に応じて出し分けられている。強警告時は**ダイアログ外**のゲートで「閉店処理へ」「営業継続」が出るため、開閉店管理ダイアログ内の actions は現状のままでよい（ダイアログは「状況の確認・情報表示」として使い、実際の閉店・開店は既存ボタンまたはゲートで実行する）。

### 1.4 コード根拠（参照）

- 強警告メッセージ: `lib/utils/store_assessment_utils.dart` の `getTopStrongWarning`, `getNextDayStartedWeakWarning`（文言は spec §6・§7 準拠済み）。
- 抑制: `_closeSuppressed`, `_openSuppressed` は同ファイル内で未エクスポートのため、ready_to_open / needs_manual_open の「表示してよいか」は openAssessment?.suppressedByOverride != true かつ result の値を参照する。

---

## 2. 閉店中時の「開店処理が必要です」表示（! 赤・タップ時権限別）

### 2.1 仕様

- spec §9.1: status === 'closed' かつ、openAssessment が存在し result が **ready_to_open** または **needs_manual_open** で、**openAssessment.suppressedByOverride が true でない**とき、日付表示部（「閉店中」と表示している部分）に **!（赤色）** と **「開店処理が必要です」** を表示する。
- **非 store management 端末**: タップ時はダイアログで「開店時間を過ぎているため開店処理を行って下さい」とアナウンス。**開店処理は行えず、閉じるのみ**。
- **store management 端末**: タップ時は**通常の開閉店管理ダイアログ**を表示する。

### 2.2 現状コード

- **ファイル**: `lib/Home/terminalHomePage.dart`
- **箇所**: `_buildStoreStatusAction` 内の `data.isClosed` 分岐（約 164–172 行）。
- **現状**: `_wrapDateChip(context, Center(child: Text('閉店中', ...)), onPressed: () => _showStoreManagementDialog(context))` となっている。つまり**常に**タップで開閉店管理ダイアログを開いている（かつ開閉店可能時のみ _wrapDateChip が onPressed を有効にしている）。

### 2.3 変更内容

1. **「開店処理が必要です」の表示条件**
   - `data.isClosed` かつ、`data.openAssessment != null` かつ `data.openAssessment!.suppressedByOverride != true` かつ `data.openAssessment!.result == 'ready_to_open' || data.openAssessment!.result == 'needs_manual_open'` のとき、「閉店中」に加えて **!（赤色アイコン）** と **「開店処理が必要です」** を表示する。
   - ヘルパー: `lib/utils/store_assessment_utils.dart` に `bool shouldShowOpenNeeded(StoreMetaData meta)` を追加する。戻り値は `meta.isClosed && meta.openAssessment != null && !meta.openAssessment!.suppressedByOverride && (meta.openAssessment!.result == 'ready_to_open' || meta.openAssessment!.result == 'needs_manual_open')`。

2. **表示レイアウト（閉店中かつ開店処理が必要な場合）**
   - Row で: `Icon(Icons.error_outline, color: Colors.red, size: 18)`（または ! に近いアイコン）＋ SizedBox(width: 4) ＋ Text('開店処理が必要です', style: TextStyle(fontSize: 11, color: Colors.red)) ＋ 必要なら SizedBox ＋ Text('閉店中', ...)。または「閉店中」の左に ! と「開店処理が必要です」を置く。
   - 既存の `_wrapDateChip` を利用し、child を上記 Row にし、onPressed を権限に応じて変える。

3. **タップ時の挙動**
   - **store management 端末**（`_isAdminDevice || _deviceOptions[DeviceOptionKeys.storeManagement] == true`）: 従来どおり `_showStoreManagementDialog(context)` を呼ぶ。
   - **非 store management 端末**: `showDialog` で「開店時間を過ぎているため開店処理を行って下さい」と表示し、**閉じるボタンのみ**。開店処理のボタンは出さない。

4. **実装上の注意**
   - `_buildStoreStatusAction` は `StreamBuilder` 内にあり、`_isAdminDevice` と `_deviceOptions` は State のメンバなのでそのまま参照できる。非 store management のときのダイアログは、例えば `showDialog(context: context, builder: (ctx) => AlertDialog(title: Text('お知らせ'), content: Text('開店時間を過ぎているため開店処理を行って下さい。'), actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text('閉じる'))])` とする。

---

## 3. status === 'error' 時に lastError をダイアログでそのまま表示

### 3.1 仕様

- spec §4 項目 1（および step6.1 確定方針）: 当面は**ダイアログで lastError の内容（code / message / failedStep 等）をそのまま表示**する。

### 3.2 現状コード

- **ファイル**: `lib/Home/terminalHomePage.dart`
- **箇所**: `_buildStoreStatusAction` 内の `data.isError` 分岐（約 173–179 行）。
- **現状**: `_wrapDateChip(context, Icon(Icons.error_outline, color: Colors.orange, size: 20), onPressed: () => _showStoreManagementDialog(context))`。タップで開閉店管理ダイアログを開いているだけで、lastError の内容は表示していない。

### 3.3 変更内容

1. **isError 時のタップ**
   - タップ時に、**lastError の内容をそのまま表示するダイアログ**を開く。`StoreMetaData.lastError` は `LastErrorDoc?` 型（code, message, failedStep, at, context）。これらを文字列化してダイアログの content に表示する（例: "code: ${lastError?.code}\nmessage: ${lastError?.message}\nfailedStep: ${lastError?.failedStep}\nat: ${lastError?.at}" など。context は Map なので JSON 風にしてもよい）。
   - lastError が null の場合は「エラー状態です。詳細は取得できませんでした。」などとする。

2. **実装箇所**
   - `_buildStoreStatusAction` の `data.isError` の分岐で、`onPressed` を `() => _showLastErrorDialog(context, data.lastError)` のようなメソッドにし、`_showLastErrorDialog(BuildContext context, LastErrorDoc? lastError)` を新規で定義する。その中で `showDialog` により AlertDialog を表示し、content に lastError を文字列化したものを表示する。

3. **開閉店管理ダイアログとの関係**
   - エラー時も「開閉店管理ダイアログを開く」を残すか、タップでは lastError ダイアログのみにするかは仕様上「当面 lastError をそのまま表示」なので、**タップ＝lastError ダイアログ**でよい。開閉店管理ダイアログは別途「営業管理」ボタンから開ける。

---

## 4. 他画面の StoreStrongWarningWrapper に onCloseStore / onBusinessContinue を渡す

### 4.1 仕様

- spec §9.2: 他画面でも「閉店処理へ」「営業継続」を選択可能とする。各画面の StoreStrongWarningWrapper に **onCloseStore** と **onBusinessContinue** を渡し、いずれも **「terminalHome へ遷移する」コールバック**とする。

### 4.2 現状コード

- **StoreStrongWarningWrapper** の定義: `lib/utils/store_strong_warning_ui.dart` の 241–267 行。`onCloseStore` と `onBusinessContinue` はオプション引数で、渡さないとゲートにボタンが表示されない。
- **呼び出し側**:
  - `lib/tournament/active/pages/tournament_home_page.dart`: 約 1236 行 `body: StoreStrongWarningWrapper(child: ...)` のみ。
  - `lib/tournament/active/pages/table_detail_page.dart`: 約 207 行 同様。
  - `lib/OrderView/OrderManagement/order_management_page.dart`: 約 99 行 同様。
  - `lib/sideGame/pages/side_game_table_list.dart`: 約 71 行 同様。

### 4.3 変更内容

1. **共通コールバック**
   - 各画面の `build` で、`context` が使える位置で次のコールバックを定義する。
   - `onCloseStore`: `() { Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const terminalHomePage()), (route) => false); }`
   - `onBusinessContinue`: 上記と同じでよい（ホームに戻し、ホームのゲートで「営業継続」を押してもらう）。

2. **遷移先**
   - spec 上「terminalHome へ遷移」とあるため、遷移先は **terminalHomePage** に固定する。クラス名は `lib/Home/terminalHomePage.dart` の `terminalHomePage`（先頭小文字）。

3. **各ファイルの修正**
   - **tournament_home_page.dart**: `StoreStrongWarningWrapper` に `onCloseStore` と `onBusinessContinue` を渡す。ファイル先頭に `import 'package:amuse_app_template/Home/terminalHomePage.dart';` を追加。
   - **table_detail_page.dart**: 同上。
   - **order_management_page.dart**: 同上。
   - **side_game_table_list.dart**: 同上。

4. **context の扱い**
   - 各ページは StatefulWidget または StatelessWidget の build 内で `context` を参照している。コールバックは `() { ... Navigator.of(context).pushAndRemoveUntil(...); }` でよいが、非同期で context が無効になる可能性はある。pushAndRemoveUntil は同期的に実行するため、コールバック実行時点で context は有効な想定でよい。

---

## 5. 他画面 4 画面の日付表示形式を terminalHome に統一（getDateWarningLabel）

### 5.1 仕様

- spec §9.2: 日付表示の対象は **tournament_home_page**, **table_detail_page**, **order_management_page**, **side_game_table_home** の 4 画面。表示形式は **terminalHomePage の日付表示部に統一**する。getDateWarningLabel 相当を用い、warning 時はアイコン＋短い文言を日付の横に表示。**他画面では push された時の初回ダイアログは不要**（日付＋warning のインライン表示のみ）。

### 5.2 現状コード

- **terminalHomePage** の日付表示（営業中）: `_buildStoreStatusAction` 内で `getDateWarningLabel(data)` を呼び、非 null なら `Icons.warning_amber_rounded`（size 18, orange）＋ SizedBox(4) ＋ Flexible(Text(warningLabel, fontSize: 11, color: Colors.orange)) ＋ SizedBox(6) ＋ 日付 Text。日付は `DateFormat('M/d(E)', 'ja_JP').format(date)`。
- **他画面**:
  - **tournament_home_page.dart**: `_buildStoreStatusAction`（1113–1176 行）。営業中は日付のみ表示し、**getDateWarningLabel を呼んでいない**。白文字（textColor）。
  - **table_detail_page.dart**: `_buildStoreStatusAction`（83–145 行）。同様に日付のみ。
  - **order_management_page.dart**: `_buildStoreStatusAction`（22–85 行）。同様に日付のみ、白文字。
  - **side_game_table_home.dart**: `_buildStoreStatusAction`（35–98 行）。同様に日付のみ、白文字。

### 5.3 変更内容

1. **共通化する表示**
   - 営業中（`data.isRunning && data.currentBusinessDateKey != null`）のとき、**getDateWarningLabel(data)** を呼ぶ。非 null なら terminalHomePage と同様に、**warning アイコン（Icons.warning_amber_rounded, size 18, color: Colors.orange）** ＋ **SizedBox(width: 4)** ＋ **Flexible(child: Text(warningLabel, style: TextStyle(fontSize: 11, color: Colors.orange), overflow: TextOverflow.ellipsis))** ＋ **SizedBox(width: 6)** ＋ **日付 Text** の Row を返す。日付のフォーマットは既存どおり `DateFormat('M/d(E)', 'ja_JP').format(date)`。各画面の AppBar の文字色（白）がある場合は、**日付部分の Text にのみ** color: textColor を適用し、warning 部分は orange のままでよい（spec 上 warning はオレンジ）。

2. **import**
   - 各ファイルに `import 'package:amuse_app_template/utils/store_assessment_utils.dart';` を追加（getDateWarningLabel を使用するため）。

3. **対象 4 ファイル**
   - `lib/tournament/active/pages/tournament_home_page.dart`
   - `lib/tournament/active/pages/table_detail_page.dart`
   - `lib/OrderView/OrderManagement/order_management_page.dart`
   - `lib/sideGame/pages/side_game_table_home.dart`

4. **閉店中・エラー・不明**
   - 他画面では「開店処理が必要です」の表示は**行わない**（terminalHome のみ）。閉店中は従来どおり「閉店中」、エラーはアイコンのみでよい。他画面で push 時ダイアログを出さないとは「強警告の初回ダイアログ」以外の追加ダイアログを出さないという意味で、日付部はインラインの warning 表示のみ追加する。

---

## 6. failed-precondition 時の開店処理 SnackBar に「他の操作で」を追加（仕様 §4 項目6・§6）

### 6.1 仕様

- spec §4 項目6: processing が存在し now <= leaseExpiresAt（ロック中）のとき、**閉店処理へ／開店処理へを押した結果**で closeStoreTerminal / openStoreTerminal が failed-precondition を返したときに「**〇〇処理が他の操作で実行中です。完了するまでお待ちください。**」を表示する。閉店・開店とも同形。

### 6.2 現状コード

- **ファイル**: `lib/Home/terminalHomePage.dart`
- **箇所**: 開店処理の FirebaseFunctionsException 捕捉（約 730–738 行）。
- **現状**: `e.code == 'failed-precondition'` のときに SnackBar で「**開店処理が実行中です。完了するまでお待ちください。**」と表示している。**「他の操作で」が抜けている**。閉店処理側（約 447 行・627 行）は「閉店処理が**他の操作で**実行中です。完了するまでお待ちください。」と正しく実装済み。

### 6.3 変更内容

- 開店処理の failed-precondition 時の SnackBar の `content: Text(...)` を、**「開店処理が他の操作で実行中です。完了するまでお待ちください。」** に変更する。閉店処理と文言を揃える。

---

## 7. 強警告ゲートのボタン文言を「〇〇（閉店対象日）の閉店処理へ」に変更（仕様 §6・§7）

### 7.1 仕様

- spec §6: needs_manual_close / next_day_started（強）の store management 端末のボタンは「**〇〇（閉店対象日）の閉店処理へ**」「営業継続」とする。
- spec §7: already_running_different_date のボタンは「**△△（閉店対象日＝currentBusinessDateKey）の閉店処理へ**」「営業継続」とする。

### 7.2 現状コード

- **ファイル**: `lib/utils/store_strong_warning_ui.dart`
- **箇所**: `StrongWarningGate` の `ElevatedButton`（約 61–67 行）。
- **現状**: `child: const Text('閉店処理へ')` の**固定文言**。`targetBusinessDateKey` はコンストラクタで渡されているが、ボタン表示には未使用。

### 7.3 変更内容

- `StrongWarningGate` の「閉店処理へ」ボタンの `child` を、**`Text('${targetBusinessDateKey} の閉店処理へ')`** のように `targetBusinessDateKey` を含めた文言にする。空文字の場合は「閉店処理へ」のフォールバックでもよい。仕様どおり「〇〇（閉店対象日）の閉店処理へ」の形式とする。

---

## 8. next_day_started で currentBusinessDateKey が null のときの専用文言（仕様 §10）

### 8.1 仕様

- spec §10: next_day_started で currentBusinessDateKey が null の場合は日付差分を計算できないため**弱警告**として扱う。文言では「**現在営業日は取得できません。閉店対象日〇〇の閉店処理をご確認ください。**」のようにする。

### 8.2 現状コード

- **ファイル**: `lib/utils/store_assessment_utils.dart`
- **箇所**: `getNextDayStartedWeakWarning`（約 130–142 行）。
- **現状**: `final current = meta.currentBusinessDateKey ?? '';` で空文字にし、`message: '閉店対象日: $intended。現在営業日: $current。誤タスクの可能性があります。…'` としている。current が null のときも同じメッセージになり、「現在営業日は取得できません」の専用文言になっていない。

### 8.3 変更内容

- `getNextDayStartedWeakWarning` 内で、**meta.currentBusinessDateKey が null のとき**は、`WeakWarningInfo` の message を **「現在営業日は取得できません。閉店対象日〇〇（intendedBusinessDateKey）の閉店処理をご確認ください。」** とする。current が non-null のときは従来どおり「閉店対象日: 〇〇。現在営業日: △△。誤タスクの可能性があります。念のため閉店処理をご確認ください。」を返す。

---

## 9. 作成・更新ファイル一覧

| 種別 | ファイル | 変更内容 |
|------|----------|----------|
| 更新 | `lib/utils/store_assessment_utils.dart` | `shouldShowOpenNeeded(StoreMetaData meta)` を追加（タスク 2）。getNextDayStartedWeakWarning で currentBusinessDateKey が null のとき専用文言を返す（タスク 8）。必要ならダイアログ本文用ヘルパー（タスク 1）を追加。 |
| 更新 | `lib/Home/terminalHomePage.dart` | 開閉店管理ダイアログ content の §6・§7 出し分け（タスク 1）。閉店中時の「開店処理が必要です」表示とタップ時権限別挙動（タスク 2）。isError 時の lastError ダイアログ（タスク 3）。開店処理の failed-precondition 時 SnackBar を「開店処理が他の操作で実行中です。…」に変更（タスク 6）。 |
| 更新 | `lib/utils/store_strong_warning_ui.dart` | StrongWarningGate の「閉店処理へ」ボタン文言を「〇〇（閉店対象日）の閉店処理へ」に変更（タスク 7）。 |
| 更新 | `lib/tournament/active/pages/tournament_home_page.dart` | StoreStrongWarningWrapper に onCloseStore / onBusinessContinue 渡し（タスク 4）。_buildStoreStatusAction に getDateWarningLabel と warning 表示追加（タスク 5）。 |
| 更新 | `lib/tournament/active/pages/table_detail_page.dart` | 同上。 |
| 更新 | `lib/OrderView/OrderManagement/order_management_page.dart` | 同上。 |
| 更新 | `lib/sideGame/pages/side_game_table_list.dart` | StoreStrongWarningWrapper に onCloseStore / onBusinessContinue 渡し（タスク 4）のみ。※日付表示は side_game_table_home にあり、list にはない。 |
| 更新 | `lib/sideGame/pages/side_game_table_home.dart` | _buildStoreStatusAction に getDateWarningLabel と warning 表示追加（タスク 5）。 |

---

## 10. 受入条件（Definition of Done）

- [ ] 開閉店管理ダイアログを開いたとき、meta に応じて §6・§7 の強警告・弱警告・情報（ready_to_open / needs_manual_open）・next_day_started の閉店対象日／現在営業日が本文に正しく出し分けられている。ready_to_open は強・弱警告成立時は表示されず、解消後に表示される。
- [ ] terminalHome で閉店中かつ openAssessment が ready_to_open / needs_manual_open（suppressed でない）のとき、日付表示部に !（赤）と「開店処理が必要です」が表示される。非 store management のタップ時はアナウンスのみのダイアログ、store management のタップ時は開閉店管理ダイアログが開く。
- [ ] terminalHome で status === 'error' のとき、日付部のエラーアイコンをタップすると lastError の内容（code / message / failedStep 等）をそのまま表示するダイアログが出る。
- [ ] tournament_home_page, table_detail_page, order_management_page, side_game_table_list で強警告表示時、store management 端末で「閉店処理へ」「営業継続」ボタンが表示され、タップすると terminalHome に遷移する。
- [ ] tournament_home_page, table_detail_page, order_management_page, side_game_table_home の日付表示部で、needs_manual_close / next_day_started / already_running_different_date のとき terminalHome と同様に warning アイコンと短い文言が表示される。
- [ ] 開店処理で failed-precondition が返ったとき、SnackBar に「開店処理が**他の操作で**実行中です。完了するまでお待ちください。」と表示される（タスク 6）。
- [ ] 強警告ゲートの閉店ボタン文言が「〇〇（閉店対象日）の閉店処理へ」形式で表示される（タスク 7）。
- [ ] next_day_started 弱で currentBusinessDateKey が null のとき、弱警告メッセージが「現在営業日は取得できません。閉店対象日〇〇の閉店処理をご確認ください。」となる（タスク 8）。

---

以上を Phase6 Step6.1 の未実装項目に対する changeSpec とする。
