# P0 changeSpec 前準備 — 事実整理（Flutter・ローディング表示）

_参照: [改修方針メモ](./改修方針メモ.md) の P0（§1.5.2・**更新系**かつ**スピナー系ウィジェットなし**）、[現状の使用パターンの確認 §1.5.2](../../03_現状の使用パターンの確認/現状の使用パターンの確認.md)、[対象ファイル・対象箇所の確認 §1.5.2](../../02_対象ファイル・対象箇所の確認/対象ファイル・対象箇所の確認.md)_  
_作成日: 2026-03-22_  
_本書は実装提案・共通化方式を含まない。コード確認はリポジトリ現状（2026-03-22 時点）に基づく。_

---

## 0. P0 の定義（改修方針メモより）

- **Step2 §1.5.2** に掲載のうち、**画面内ユーザー操作による更新系処理**（またはそれに準ずる副作用のある非同期）で、**`CircularProgressIndicator` / `LinearProgressIndicator` / `RefreshIndicator` が無い**箇所。
- Step3 §1.1 の表では、当該パターンを **「スピナーなし・await 更新系（CF／Firestore 書込）型」** とし、件数は **12**（§1.5.2 の 14 件から Skeleton 2 件を除く、と同表に記載）。
- **本整理での「P0 対象」**＝上記に合致し、かつ **更新系の操作**が主題となる **対象箇所**（同一ファイルに読込系が混在する場合は操作単位で分ける）。

---

## 1. P0 対象一覧

| 対象箇所ID | ファイル | 操作名（コード上の起点） | Step2 §1.5.2「現在の状態」列・補足列の記載 | コード上の確認（2026-03-22 時点） |
|------------|----------|-------------------------|------------------------------------------|-------------------------------------|
| **P0-01** | `lib/Accounting/accountingCancelDialog.dart` | 会計キャンセル確定 `_cancelAccounting`（`httpsCallable('cancelAccounting')`） | **なし**。補足（Step2 原文）:「連打で複数回呼び出しうる。**追加精査**」 | 当ファイルに `CircularProgressIndicator` / `LinearProgressIndicator` / `RefreshIndicator` はない。`_cancelAccounting` に処理中フラグなし。`ElevatedButton` の `onPressed` は `_cancelAccounting` のまま。 |
| **P0-02** | `lib/Accounting/refundProcessingDialog.dart` | 返金確定 `_processRefund`（`httpsCallable('processRefund')`） | **なし**。補足（Step2 原文）:「**追加精査**」 | 当ファイルにスピナー系ウィジェットはない。`_processRefund` に処理中フラグなし。 |
| **P0-03** | `lib/Accounting/accountingEditDialog.dart` | 会計内容修正送信 `_updateAccounting`（`updateActiveBill` / `updateAccounting`） | **なし**（スピナー・Refresh なし）。補足（Step2 原文）:「Firestore read・CF。選択肢読み込み中の視覚的待機は **要確認**」 | 当ファイルにスピナー系ウィジェットはない。`_updateAccounting` の `try` 内に処理中フラグなし。`_isLoading` / `_isSaving` / `_isProcessing` という名前のフィールドはない。 |
| **P0-03-L** | `lib/Accounting/accountingEditDialog.dart` | 選択肢読込 `_loadAvailableOptions`（`initState` から呼び出し） | 上記と同一行（会計修正ダイアログ全体の Step2 行）。読取系 | `initState` で `_loadAvailableOptions()` を呼ぶ。Step2 は同一ファイルを1行で列挙しているため、読取系操作を別 ID で記載。 |
| **P0-04** | `lib/OrderView/MenuView/createMenuPage.dart` | メニュー保存 `_saveMenuItem`（`createMenuItem` / `updateMenuItem`） | **なし**。補足（Step2 原文）:「保存ボタン連打は **要確認**。`menuListPage` 等は既存(CPI)」 | 当ファイルにスピナー系ウィジェットはない。`_saveMenuItem` に処理中フラグなし。成功時は `MenuItemsManager.fetchMenuItems()` を `await` したあと `SnackBar`・`Navigator.pop`。 |
| **P0-05** | `lib/OrderView/OrderManagement/order_card.dart` | 提供済みマーク `_markAsServed`（Firestore `update`） | **なし**。補足（Step2 原文）:「カード単位。**追加精査**」 | 当ファイルにスピナー系ウィジェットはない。`_markAsServed` に `await` 前の二重実行防止用フラグはない。 |
| **P0-06** | `lib/UserRegisterView/userQRCheckInPage.dart` | QR 検出 `_handleDetect`（`httpsCallable('processVisitByQR')`） | **再操作防止のみ**。補足（Step2 原文）:「`_isProcessing` で再スキャン抑止。視覚的ローディングは **要確認**」 | 当ファイルにスピナー系ウィジェットはない。`_isProcessing` あり。`finally` で `_isProcessing = false`。 |
| **P0-07** | `lib/tournament/active/widgets/display/admin_controls.dart` | 一時停止 `_pauseTournament` / 再開 `_resumeTournament` | **再操作防止のみ**。補足（Step2 原文）:「`_isLoading` でガード。スピナーなし。**追加精査で特定**」 | 当ファイルにスピナー系ウィジェットはない。`onPressed: canPause && !_isLoading ? _pauseTournament : null` 形式。`_pauseTournament` / `_resumeTournament` 先頭で `_isLoading` を参照。 |

---

## 2. Step2 §1.5.2 に掲載だが、§1 の P0 一覧に含めないファイル

§1 の表は §0 の定義（**更新系**かつ **スピナー系ウィジェットなし**）に合致する操作を列挙する。次のファイルは Step2 §1.5.2 に掲載があるが、§1 には含めない。

| ファイル | Step2 §1.5.2 表の記載（列名付き） | §1 に含めない理由（定義との対応） |
|----------|----------------------------------|----------------------------------|
| `lib/Utils/business_date_ambiguous_dialog.dart` | 対象箇所: 候補日付の解決・`showDialog` 連鎖。現在の状態: **要確認**。補足: 短時間完了の可能性あり（Step2 原文）。 | §0 の「画面内ユーザー操作による**更新系**」の主題として §1 を切ったため、Step2 の対象箇所記述（上記）と合わせて §1 外とした。 |
| `lib/Utils/store_strong_warning_ui.dart` | 対象箇所: 警告表示・操作まわりの `await`。ローディング必要理由: モーダル操作に伴う非同期。現在の状態: **要確認**。補足（Step2 原文）:「優先度は `00_対象の選定` 上は確認ダイアログ側と隣接しうる」 | 同上（§1 は更新系の P0 を列挙）。 |
| `lib/Utils/menuItemsManager.dart` | 現在の状態: **なし**（UI ウィジェットではない）。補足（Step2 原文）:「**基盤ユーティリティ**。呼び出し元（例: `createMenuPage`）で UX を担保」 | UI ウィジェットではない（Step2 表の「現在の状態」列）。 |
| `lib/Utils/store_warning_first_dialog_prefs.dart` | ローディング必要理由: ローカル永続化のみ。現在の状態: **なし**。補足（Step2 原文）:「待機は極短のため本タスクの「ローディング必要」からは **除外** に近い」 | SharedPreferences の `await`（Step2 対象箇所列）。 |
| `lib/user_actions/user_action_home.dart` | ローディング必要理由: モーダル表示の完了待ち（ネットワーク待ちではない）。現在の状態: **なし**。補足（Step2 原文）:「実質同期 UI。**追加精査のノイズ**に近い」 | `await showDialog`（Step2 対象箇所列）。 |
| `lib/dashboard/category/category_item_breakdown_page.dart` | Step2 §1.5.2: 現在の状態 **ローディングあり**。補足:「**`AsyncValue` + `Skeleton`**。CPI は無いが待機表示あり。**既存表と統合**（表現がスピナー以外）」 | Step3 §1.1 表では **「AsyncValue + Skeleton 待機型（CPI なし）」** の代表として列挙。§1 は **「スピナーなし・await 更新系（CF／Firestore 書込）型」** に対応する P0 を列挙する（§0）。 |
| `lib/dashboard/daily/daily_trend_page.dart` | Step2 §1.5.2: `category_item_breakdown_page` と同型。 | 上記と同じ（Step3 §1.1 表の同じ主要パターン行に代表ファイルとして列挙）。 |

---

## 3. 各 P0 対象の現状（類型・ロック・結果の順序）

### 3.1 一覧

| ID | 類型（改修方針の 3 分類） | Step2「現在の状態」 | 処理中フラグ（コード） | 成功時の UI 順序（コード） |
|----|---------------------------|---------------------|-------------------------|---------------------------|
| P0-01 | 画面内・更新系 | **なし** | なし | `SnackBar` → `onUpdated()` → `Navigator.pop` |
| P0-02 | 画面内・更新系 | **なし** | なし | `SnackBar` → `onUpdated()` → `Navigator.pop` |
| P0-03 | 画面内・更新系 | **なし** | なし | `SnackBar` → `onUpdated()` → `Navigator.pop` |
| P0-03-L | 画面内・読取に近い（初期読込） | **なし**（同一 Step2 行） | なし | フォームは `setState` で更新（成功 SnackBar は更新フローに含めない） |
| P0-04 | 画面内・更新系 | **なし** | なし | `SnackBar` → `Navigator.pop`（事前に `MenuItemsManager.fetchMenuItems()`） |
| P0-05 | 画面内・更新系 | **なし** | なし | `SnackBar` のみ |
| P0-06 | 画面内・更新系 | **再操作防止のみ** | `_isProcessing` | `Navigator.pushReplacement`（別画面でメッセージ表示） |
| P0-07 | 画面内・更新系 | **再操作防止のみ** | `_isLoading`・ボタン `onPressed` 無効化 | 成功: `SnackBar` → `onStatusChanged?.call()`。失敗: `SnackBar` |

### 3.2 Step3 の記載（出典）

[現状の使用パターンの確認](../../03_現状の使用パターンの確認/現状の使用パターンの確認.md) の §1「整理メモ（ローディング）」に、§1.5.2 のスピナーなし対象について、Step2 に「連打で複数回 CF しうる」旨の記述がある、と書かれている。

---

## 4. 現状の使用パターン §1.3 における Callable の表記（P0 で呼ぶ名前が表に出る行の抜粋）

出典: [現状の使用パターンの確認 §1.3](../../03_現状の使用パターンの確認/現状の使用パターンの確認.md) の表（更新操作の callable）。次表は同表からの転記であり、語句は出典と同一（略称・ワイルドカード表記を含む）。

| Callable | 主な呼び出し元（`lib/`） | 冪等性・再実行時の挙動（`functions/src`） |
|----------|--------------------------|------------------------------------------|
| `cancelAccounting` | `accountingCancelDialog.dart`、`accountingPage.dart` | **状態遷移で抑止** — TX 内で `status` が pre-settlement のみ許可。既に `open` 等へ戻した後の再実行は **`failed-precondition`** になりやすい（厳密な「同一キーで同じ結果」ではなく **二重キャンセル抑止**）。 |
| `processRefund` | `postAccountingRefundDialog.dart`、`refundProcessingDialog.dart` | **あり** — リクエストに **`idempotencyKey` 必須**（`refundProcessing.ts`）。 |
| `updateAccounting` | `postAccounting*.dart`、`accountingPage.dart` 等 | **あり（キー生成）** — `updateAccounting` / `accounting.ts` で **`idempotencyKey` / `clientNonce`** によりキー化。 |
| `createMenuItem` / `updateMenuItem` | `createMenuPage.dart`、`menuEditorListPage.dart` | **要確認** — 状態・存在チェックはあるが、**汎用 idempotency キー**は限定的。 |
| `processVisitByQR` | `userQRCheckInPage.dart` | **一部あり** — サーバ側で **idempotencyKey 生成・bill 連携**の記述あり（過去ドキュメント・コードコメント整合）。 |
| `pauseTournament` / `resumeTournament` | `admin_controls.dart` | **二度目は拒否** — 例: 既に pause なら **`failed-precondition`**（`api.pause.ts`）。冪等キーではなく **状態によるガード**。 |

**補足（コードと §1.3 の対応）**

- `_updateAccounting` は会計前に `httpsCallable('updateActiveBill')`、会計後に `httpsCallable('updateAccounting')` を使う。**§1.3 の表に `updateActiveBill` という行はない**（`updateAccounting` の行のみ）。
- P0-05 の Firestore `update` は Callable ではないため、上表の対象外。

---

## 5. changeSpec 化する際の照合先（仕様書の章）

P0 を changeSpec に落とすとき、表示・ロック・解除順・例外・冪等性の扱いは **[ローディング表示.md](./ローディング表示.md)** の次の章を参照する。

| 論点 | 参照章 |
|------|--------|
| 表示単位・ロック単位の語の定義 | §4 |
| 表示単位・ロック単位の決定ルール | §5・§6 |
| 適用ルール（読込／読取／更新） | §7 |
| 処理終了後の扱い | §7.4 |
| 採用しない扱い | §8 |
| 冪等性との関係 | §9 |
| 例外 | §10 |

---

## 6. 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-03-22 | 初版。To-be 案・「問題点」列・検証の期待記述は含めず、Step2／Step3／§1.3 の引用とコード確認に限定。コード確認基準日は作成日と同一 |
