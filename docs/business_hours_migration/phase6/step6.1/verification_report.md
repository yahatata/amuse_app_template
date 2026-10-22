# Phase6 Step6.1: changeSpec・実コード照合レポート

changeSpec.md / spec_summary.md と実コードを照合した結果。

---

## 1. changeSpec に漏れなく修正点が記載されているか

**結論: 漏れなし。**

- spec_summary.md §3「実装漏れ・仕様との差分」および §5「一覧サマリ」の実装漏れは、すべて changeSpec のタスク 1〜8 に含まれている。
- 開閉店管理ダイアログ本文（§6・§7）→ **Task 1**
- 閉店中「開店処理が必要です」→ **Task 2**
- status === 'error' 時の lastError 表示→ **Task 3**
- 他画面 Wrapper の onCloseStore / onBusinessContinue → **Task 4**
- 他画面 4 画面の日付表示（getDateWarningLabel）→ **Task 5**
- failed-precondition 開店 SnackBar「他の操作で」→ **Task 6**
- 強警告ゲートのボタン文言「〇〇の閉店処理へ」→ **Task 7**
- next_day_started で currentBusinessDateKey が null のときの専用文言（§10）→ **Task 8**

意図的に未実装（営業継続の閉店時間選択 UI・営業継続用 Callable）は spec_summary §2 のとおり本 Step 対象外であり、changeSpec に記載しない方針で問題ない。

---

## 2. changeSpec の内容が漏れなく実コードに反映されているか

**結論: 漏れなく反映されている。**

| タスク | changeSpec の内容 | 実コードでの確認 |
|-------|-------------------|------------------|
| 1 | 開閉店管理ダイアログの本文を §6・§7 で出し分け | terminalHomePage.dart: StreamBuilder 内で (1) isError→lastError (2) getTopStrongWarning (3) getNextDayStartedWeakWarning (4) running (5) closed + ready_to_open / needs_manual_open (6) その他 closed (7) フォールバック の優先順位で表示。 |
| 2 | 閉店中「開店処理が必要です」＋ shouldShowOpenNeeded、タップ時権限別 | store_assessment_utils.dart: `shouldShowOpenNeeded` あり。terminalHomePage: data.isClosed で showOpenNeeded に応じ Row（赤アイコン＋文言＋閉店中）、allowTapForNonStore、_showOpenNeededAnnouncementDialog あり。 |
| 3 | isError 時に lastError ダイアログ | terminalHomePage: `_showLastErrorDialog(context, data.lastError)`、data.isError の onPressed で呼び出し。 |
| 4 | 他画面 4 つの StoreStrongWarningWrapper に onCloseStore / onBusinessContinue | tournament_home_page, table_detail_page, order_management_page, side_game_table_list の 4 ファイルで Navigator.pushAndRemoveUntil(terminalHomePage) を渡している。 |
| 5 | 他画面 4 画面の日付表示に getDateWarningLabel | tournament_home_page, table_detail_page, order_management_page, side_game_table_home の _buildStoreStatusAction で getDateWarningLabel(data) を参照し、warning 時は Icons.warning_amber_rounded ＋ 文言 ＋ 日付の Row。store_assessment_utils の import あり。 |
| 6 | 開店処理の failed-precondition SnackBar に「他の操作で」 | terminalHomePage.dart 871–874 行: `Text('開店処理が他の操作で実行中です。完了するまでお待ちください。')`。 |
| 7 | 強警告ゲートのボタン文言を「〇〇の閉店処理へ」に | store_strong_warning_ui.dart: `targetBusinessDateKey.isEmpty ? '閉店処理へ' : '$targetBusinessDateKey の閉店処理へ'`。 |
| 8 | getNextDayStartedWeakWarning で currentBusinessDateKey が null のとき専用文言 | store_assessment_utils.dart: `current == null \|\| current.isEmpty` のとき「現在営業日は取得できません。閉店対象日$intended の閉店処理をご確認ください。」を返す。 |

---

## 3. 営業継続時の処理の実装と動線

### 3.1 仕様（spec §8）

- 強警告表示時、「営業継続」を選ぶと「閉店時間の目安」1〜8 時間を選択し、**1 操作で** manualOverride（close_skip）の設定と、指定時間後の closeAssessmentTask の enqueue を行う。
- 単独の「リマインド」ボタンは提供しない。

### 3.2 バックエンド

**未実装（意図的）。**

- **営業継続用 Callable**（manualOverride 書き込み ＋ closeAssessmentTask の enqueue）は存在しない。
- closeAssessmentTask / openAssessmentTask は manualOverride を**参照**して suppressed 判定しているが、**アプリから「営業継続」で manualOverride を書き込む API はない**。
- closeAssessmentTask を**即時 or 指定時間後に enqueue する**処理も、Callable・HTTP 等からは呼ばれていない（定期スケジュール由来のみ）。

### 3.3 UI

**動線はあるが、実処理は未実装。**

- **terminalHomePage**: 強警告時に `StoreStrongWarningOverlay` へ `onBusinessContinue: () => _onBusinessContinue(context)` を渡している。`_onBusinessContinue` は SnackBar「営業継続（リマインド予約）は準備中です。」のみ表示（実装コメントで「別 Step で Callable 実装予定」と記載）。
- **他画面**（tournament_home_page, table_detail_page, order_management_page, side_game_table_list）: `StoreStrongWarningWrapper` に `onBusinessContinue` を渡しており、**タップで terminalHome へ遷移**する。ホームに戻ったあと、同じ強警告ゲートが表示され、そこで「営業継続」を押すと上記 SnackBar が表示される。

### 3.4 動線の整理

| 画面 | 強警告時の「営業継続」動線 | タップ後の挙動 |
|------|----------------------------|----------------|
| terminalHomePage | ゲートに「営業継続」ボタン表示 → タップ可能 | _onBusinessContinue → SnackBar「準備中です。」のみ |
| 他画面 4 画面 | ゲートに「営業継続」ボタン表示 → タップ可能 | pushAndRemoveUntil で terminalHome へ遷移 → ホームで同じゲート＋「営業継続」→ 同上 |

**まとめ**

- **営業継続に「行き着く動線」はある**: ホーム・他画面とも強警告時に「営業継続」ボタンが表示され、タップできる。
- **営業継続の実処理（manualOverride 設定＋closeAssessmentTask enqueue）は未実装**: バックエンドに Callable がなく、UI も「準備中です。」の SnackBar のみ。spec_summary §2「意図的に未実装」のとおり、別 Step で実装予定。

---

## 4. 参照

- changeSpec: `docs/business_hours_migration/phase6/step6.1/changeSpec.md`
- spec_summary: `docs/business_hours_migration/phase6/step6.1/spec_summary.md`
- spec §8 営業継続: `docs/business_hours_migration/phase6/step4/spec.md` §8.1, §8.2
