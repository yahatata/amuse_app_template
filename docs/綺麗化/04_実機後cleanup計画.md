# 実機後 cleanup 計画（第一巡棚卸し）

> **文書の位置づけ**
>
> - 営業向け綺麗化 **第一巡の発見事項を起点に、cleanup 方針・依存・状態を継続管理する正本**
> - 実機の操作記録・PASS/FAIL の正は `03_統合実機確認チェックリスト.md`
> - 進捗管理の正本は `00_営業向け綺麗化_全体管理.md`
> - 本ファイルは「何を・なぜ・どこまで今回やるか」の判断用。実装手順書ではない
> - 各 CLN の状態は実装バッチ完了・仕様判断・再実機のたびに更新する
>
> | 項目 | 内容 |
> |------|------|
> | 作成日 | 2026-08-18 |
> | 対象 | 統合実機確認第一巡の発見事項 + `03` §19 既存候補 + 既知 A〜L + 再走査追加 |
> | 更新区分 | 変更時（実装バッチ完了・仕様判断のたびに状態列を更新） |
> | 最終更新 | 2026-09-04（Final Cleanup Phase 10: **CLOSED**。production undeploy 12 件完了） |
> | 参照元 | `00` / `03`（第一巡記録） |
> | 参照先 | `docs/綺麗化/E1-E3_勤怠再設計_仕様判断前調査.md`（調査履歴 + §32.11 確定仕様。実装は案件化後） |

---

## 1. 今回の範囲

第一巡の実機確認は、期間・データ・destructive 制約の範囲で完了している（FAIL 0）。  
第一巡実機確認後、cleanup 実装は順次進行済み。本資料は初回棚卸しを起点に、各 CLN 項目の方針・依存・状態を継続更新する判断正本とする。

混同しないこと:

- **cleanup 実装**と **deploy 後の再実機**は別
- **仕様判断待ち**を局所修正しない
- **再実機のみ**（期間待ち等）を未対応実装としない
- working tree で直済みのものを「未対応」としない
- **仕様確定・実装保留**は実装済み・不具合解消ではない。営業向け cleanup 残件から外しただけ

### 1.1 deploy 基準（2026-08-18 調査）

資料上の Functions + Hosting **正式 deploy 基準 commit** は `057f33b`。

現在 HEAD は `700835e`。`057f33b` → HEAD の **committed** 差分に `functions/src` 変更はない。

working tree の `functions/src` 差分は **2 件のみ**:

| ファイル | CLN-C2 |
|----------|--------|
| `resolveOkibakePendingReviewWithRemotePayment.ts` | **はい** |
| `getTodayTournaments.ts`（応答に `targetBusinessDate` / `todayDateSource`） | **いいえ** |

GCP 上の現行 Functions version は **未確認**。「GCP も必ず `057f33b`」とは書かない。

**禁止:** `firebase deploy --only functions`（全 Functions）。`getTodayTournaments` の未 deploy 契約変更まで巻き込む。

**Batch 0 の deploy:** `resolveOkibakePendingReviewWithRemotePayment` の **関数単位**のみ。

---

## 2. 件数サマリ（残作業）

全件（解消済み・延期・営業前残件・現状維持・今回対象外・吸収を含む）: **54**（§4 インベントリ。CLN-C3 は C1-C へ吸収済み行として残置）

| 区分 | 件数 | 意味 |
|------|------|------|
| 解消済み / 現状維持 / 今回対象外 / 吸収 | **49** | 残作業に含めない（CLN-L1 解消含む。旧 CLN-C3 吸収・CLN-C1・K6 解消含む） |
| 営業後延期（勤怠再設計延期群） | **4** | CLN-E1〜E4。**実装済みではない** |
| 営業前残件 | **1** | CLN-F6（SHF-02 再実機待ち。SHF-01 PASS 済） |

**整合式: 49（解消等） + 4（延期） + 1（営業前残） = 54**

### 2.1 優先度別（P0〜P4）

| 優先度 | 残件数 | 意味 |
|--------|--------|------|
| P0 | 0 | 営業前必須の未解消なし |
| P1 | 0 | なし（CLN-K6 解消済み） |
| P2 | 0 | CLN-C1（A/B/C）解消済み |
| P3 | **1** | コード修正なし。条件待ち再実機（**F6 のみ**） |
| P4 | 0 | 残作業なし（将来改善・今回対象外は解消バケット側） |

P3 の残 **1**（F6）が営業前 cleanup の唯一の判断対象。E1〜E4 は営業後延期として残件から除外（不具合解消ではない）。

### 2.2 営業前残件（1 件）

| ID | 対象 | 状態 | 次アクション |
|----|------|------|-------------|
| CLN-F6 | SHF-02 再実機 | OPEN | SHF-01 **PASS**。SHF-02 **REOPEN / 修正反映済 / 再実機待ち**（§11.3・`03` §23.6）。blocking bug #3 cross-day selection **Flutter 修正済** |

### 2.3 営業後延期 — 勤怠再設計延期群（4 件）

| ID | 対象 | 状態 | 備考 |
|----|------|------|------|
| CLN-E1 | 1 businessDate = 1 attendance | 延期 | 仕様確定・実装は営業後 |
| CLN-E2 | 再入店データモデル | 延期 | 同上 |
| CLN-E3 | downstream 1 日 1 件前提 | 延期 | 同上 |
| CLN-E4 | ATT-03 等の勤怠実機確認 | 延期 | **E1〜E3 実装後に ATT-03 等を実機確認。** 独立 HOLD ではない |

---

## 3. 分類凡例

**分類**

| 値 | 意味 |
|----|------|
| cleanup実装 | 仕様は概ね確定。直す |
| 仕様判断 | 実装前にユーザー判断が必要 |
| QA隔離 | 本番営業 UI から隔離 / 権限 / 非表示 |
| 再確認 | source は現状維持。live 再観測が先。コード修正しない |
| dead削除 | live 非到達。静的削除候補（今回は削除しない） |
| 再実機のみ | コードを触らず条件待ち |
| 現状維持 | 退行させない / 削除しない |
| 将来改善 | 営業向け綺麗化ではやらない |

**状態**

未対応 / 調査必要 / 仕様判断必要 / 実装済み未再確認 / 実装済み未deploy / 再実機待ち / 延期 / 仕様確定・実装保留 / 解消済み / 今回対象外

---

## 4. 全件インベントリ

| ID | 分類 | 優先度 | 対象 | 現象 | 根拠 | 方針 | 依存 | 再実機 | 状態 |
|----|------|--------|------|------|------|------|------|--------|------|
| CLN-A1 | 将来改善 | P4 | Tournament カード UI | 参加費・初期スタックがカード上で見づらい | `03` TRN-01 発見。不具合ではない | 店舗ヒアリング後。今回必須にしない | なし | 仕様変更時のみ | 今回対象外 |
| CLN-A2 | 将来改善 | P4 | Blind 進行 | 倍増中心・開始 100/100 or 100/200。運用改善余地 | `03` TRN-07。致命不具合なし | 今回作り込まない | なし | 不要 | 今回対象外 |
| CLN-B1 | cleanup実装 | P1 | SG dialog サイズ | 一部操作 dialog が内容に対して overflow | `03` SG-01。第1段: 預入/引出/購入の子 dialog。**再実機で追加判明:** 子の預入は収まるが、keyboard 表示時に背後の `showUserActionHome` 下部が overflow。親 route は mount のまま。退席確認は短文のため未変更 | 第1段: 子 dialog の viewport/scroll。第2段: 親メニューを `KeyboardSafeDialogBody`（LayoutBuilder maxHeight + scroll）。子を開いても親は閉じない。B3 leave close / deposit keep-open は維持 | なし | 預入+keyboard: 前面/背面 overflow なし。withdraw+keyboard: overflow なし。deposit+leave は automated PASS | 解消済み |
| CLN-B2 | cleanup実装 | P1 | withdraw 文言 | 「引き出し確定」「引き出しするchip額」等が不自然 | `lib/user_actions/side_game_chip_withdraw_popup.dart`。カードラベル「chipの引き出し」は許容で残置。失敗「引き出し処理に失敗しました」も残置。chip 表記は既存どおり `chip` | 入力ラベル/hint「引き出すchip額」。実行・確認ボタン「引き出す」。確認文「○○chipを引き出しますか？」。Callable / loading / 計算は未変更 | なし | 実機で文言確認 **PASS** | 解消済み |
| CLN-B3 | cleanup実装 | P0 | 退席後操作カード残留 | 退席 / 預入+退席の成功後もユーザー操作カードが残る | `03` SG-01。残っていたのは座席 widget ではなく親の `showUserActionHome` Dialog。USER-13 コメントで success 時もメニューを閉じない実装だった（トーナメント Bust は `closeUserActionMenuOnSuccess` で閉じる）。Firestore leave は済む。Functions 変更なし | 退席成功 / 預入+退席の両方成功時だけメニューを pop。失敗・預入のみは残す。loading overlay 解除後に pop | なし | 実機: 通常退席 / 預入+退席 / 退席状態整合 **PASS** | 解消済み |
| CLN-B4 | QA隔離 | P0 | SG debug / `debugSideGame` | 異常時に Terminal で debug UI 到達。callable は production export あり・`request.auth` なし・role なし・App Check なし・sideGame doc 作成可 | `03` SG-03。live 業務 caller は当該 UI のみ。正式卓作成は `registerTableToSideGame` | **判定 A。** Callable source 削除、営業 UI から debug actions 削除。**live Function は `asia-northeast1` から削除済み。** 異常状態の実機再現は困難のため automated/static 確認で代替 | なし | 不要（削除済み。異常時 UI は source 確認済み） | 解消済み |
| CLN-C1 | cleanup実装 + 仕様判断 | P2 | 要対応系 reopen 復元（C1-A/B/C） | **共通契約:** 「会計前に戻す」= 会計直前の未会計状態へ戻す。**C1-A** 通常未会計↔open（同一 businessDate）。**C1-B** 閉店持ち越しは current businessDate と独立して要対応から精算／reopen（元 `bill.businessDate` 保持・merge なし・activeStay 復帰なし）。事故閉店の同一日再開店は未処理 carryover を通常未会計へ自動復旧。**C1-C** okibake pending_review→remote settle→entry 復元 + bill `voided`。**C1-D なし** | `reopenAccountedBill` + `completeAccountingV2` visit 保護 + `resolveOkibake…` + `applyCloseSnapshotCore` INITIAL/MARKED/INVALID + same-day restore + 会計日基準 UI | **C1-A** Emulator regression + 同一日 reopen 契約維持。**C1-B 実機 PASS（2026-08-25）。** **C1-C 実機 PASS（2026-08-23）。** 関数単位 deploy 済 | なし | C1-B: close→carryover / 理由表示 / 来店なし入金 / 会計日表示 / reopen / same-day restore / next-day 維持。C1-C 実機 PASS | **解消済み** |
| CLN-C2 | cleanup実装 | P0 | okibake 来店なし入金 | 要対応「来店なし入金」後、会計後操作で金額 0。ByCategory 欠落 | callable ByCategory 付与 + `billsOnSettle` + UI claim helper。**claim===received exact-match 統一**（C1-B と同契約。legacy underpay は migration しない） | **解消済み。** ByCategory 実機 PASS（2026-08-23）。exact-match 実装 + `resolveOkibakePendingReviewWithRemotePayment` 関数単位 deploy 済（2026-08-25）。会計後調整が差額の正式ルート | 関数単位 deploy 済 | 不要（ByCategory 実機済。exact-match は C1-B と同契約で記録） | **解消済み** |
| CLN-C3 | 吸収 | — | （旧）okibake reopen | C1-C へ吸収 | — | **CLN-C1-C に吸収（2026-08-23）。** 独立残件ではない | — | — | **C1 へ吸収** |
| CLN-D1 | cleanup実装 | P1 | staff 電話 placeholder | 登録 `090-1234-5678` / 再登録 `09012345678`。ハイフン付き入力は backend が拒否 | `public/staff/index.html`。`staffClientNonce.ts` / `createStaffByApp.ts` はハイフンなし 10〜11 桁。保存もハイフンなし。表示は生値 | **確定仕様:** placeholder はハイフンなし `09012345678`。入力時ハイフン許容（送信前に除去）。送信/保存はハイフンなし 10〜11 桁。表示 formatter は新設しない。frontend `public/js/staff_phone.js` で trim + hyphen strip 後に backend と同じ regex。Functions 未変更 | なし | Hosting deploy 済み。placeholder 実機 PASS。normalize は automated test PASS | 解消済み |
| CLN-D2 | 現状維持 | P2 | LINE vs Flutter staff schema | D3で新規差の発生経路は消滅。正式作成は LINE のみ | LINE `createStaffAccount`（`fullName`/`fullNameKana` 等）。旧 `StaffName`/`StaffFullName`/`staffRole` は production read 必須ではない | **解消済み。** LINE本流だけで勤怠/シフト/管理/給与/通知が完結。残存は退職PII削除リストの旧field名・demo seed のみ（実害なし。任意のlegacy cleanup候補） | CLN-D3 | 不要 | 解消済み |
| CLN-D3 | cleanup実装 | P1 | `createStaffByApp` 廃止 | 旧Flutterスタッフ作成。LINE非連携・固定password。正式モデルとして不完全 | 削除済み: UI / page / source / export / production Callable | **解消済み。** 旧Flutter経路廃止。正式作成は LINE `createStaffAccount` に一本化。Flutter/Admin導線・source/export・production Callable削除済み。production staff/Auth既存データは変更なし | なし | 不要 | 解消済み |
| CLN-D4 | cleanup実装 | P1 | LINE staff mutation feedback | dialog / 下部 `#error-message` `#success-message` が混在。下部は気づきにくい | `03` Block 7。登録・再登録は `showError`/`showSuccess`（ページ末尾）。シフト一部は `AppDialogs` | **実装:** A=登録/`createStaffAccount`・再登録/`reactivateStaffAccount`・live `submitShiftRequests`・勤怠修正/`createAttendanceCorrectionRequest` を `showMutationFeedback`→AppDialogs。B=空シフト等すでに AppDialogs、legacy `submitAllShifts` も AppDialogs 済み。C=送信前 validation・画面読込・日付選択・QR。Dなし。lower-message helper は validation/legacy 用に残置。callable / D1 phone / loading 未変更。automated PASS。本番 mutation 追加作成なし（automated 代替） | なし | 不要（automated 代替） | 解消済み |
| CLN-D5 | cleanup実装 | P1 | staff→user 遷移文言 | 第一巡で「ポーカー1ミニアプリ（ユーザー開発用）へ移動しました。」／「（スタッフ開発用）へ移動しました。」を観測 | repo 正式文言は「ユーザーに切り替え」。`switchToUserApp()` に「開発用」なし。user 側に staff へ戻る独自 handler なし。live HTML にも「開発用」なし。**実機表示の原因は LINE Developers Console のチャネル名**（ユーザー側／スタッフ側がいずれも「開発用」付き） | **repo 側文言変更不要。** navigation / 認証 / LIFF / source 未変更。user/staff 両チャネル名を正式名称へ変更 | なし | D5-1 staff→user **PASS**。D5-2 user→staff **PASS**。「開発用」表示なし | 解消済み |
| CLN-E1 | 仕様判断 | — | 1 businessDate = 1 attendance | 同日 clockIn→Out→In→Out で複数 attendance doc | `clockIn.ts` は常に `attendances.doc()` 新規。guard は **未退勤 open のみ**（同日 closed は見ない）。**仕様確定。** 詳細: `docs/綺麗化/E1-E3_勤怠再設計_仕様判断前調査.md` §32.11 | **1 staff + 1 date = 1 doc。ID は `{staffId}_{businessDate}`。** 同日再出勤は許可し workSessions で表現。中抜けは gap（勤務に含めない）。**営業向けcleanupでは実装しない**（案件化後）。実装済みではない | なし | 案件化後の実装バッチ | **延期** |
| CLN-E2 | 仕様判断 | — | 再入店データモデル | 既存 reopen / workSessions / break 流用 / gap 構造 | break は勤務内休憩。中抜けを break にすると給与・夜勤分が壊れるリスク。**仕様確定。** 詳細: §32.11 | **workSessions[] + sessionId。** break は現行サブコレ + sessionId。親に clockIn/Out / first/last を時刻正本として持たない。履歴は全 session 表示。**営業向けcleanupでは実装しない** | CLN-E1 | 案件化後 | **延期** |
| CLN-E3 | cleanup実装 | — | downstream 1 日 1 件前提 | LINE 履歴が `attendanceData[date]` で上書き。修正対象と Admin 対象が不一致 | `03` ATT-03。correction は 1 申請=1 session、対象は attendanceId+sessionId。payroll は親 1 件を 1 日。詳細: §32.11 | E-1/E-2 と同一変更。**仕様は確定したが営業向けでは実装保留。** ATT-03 再確認は CLN-E4（E1〜E3 実装後） | CLN-E1, CLN-E2 | E1〜E3 実装後（CLN-E4） | **延期** |
| CLN-E4 | 延期（検証フェーズ） | — | ATT-03 等 | 同日複数のため現行 schema では対象不一致 | `03` §20 | **E1〜E3 実装後**に ATT-03 等を再実機。営業前の独立 HOLD ではない | CLN-E1〜E3, CLN-E5 | E1〜E3 実装後（ATT-03 対象一致） | **延期**（E1〜E3 実装後確認） |
| CLN-E5 | cleanup実装 | P1 | 修正 approve/reject loading | Admin 承認/却下に overlay なし | `attendanceCorrectionRequestsPage.dart` は callable 中ロックなし | **実装:** approve/reject 共通 operation lock。fullscreen overlay + AbsorbPointer。success/failure とも `finally` で解除。callable / payload / 勤怠ロジック未変更。却下理由 dialog は lock 前。automated PASS。実機 loading/lock PASS | なし（E-1 と独立して可） | 不要（実機 PASS。対象 attendance 正しさは見ない） | 解消済み |
| CLN-E6 | cleanup実装 | P3 | ATT-04 / ATT-05 | Admin 勤怠 create/edit。+9h timezone・可視 loading・論理削除行の通常一覧残存 | `03` ATT-04/05 | **解消済み。** ATT-04 / ATT-05 simple / timezone / loading 実機 PASS。一覧は `isDeleted!=true` で通常非表示（DB 論理削除は維持。payroll 等は従来どおり除外）。`showTimePicker` 現状維持。ATT-05 full（却下後）は E1〜E4 延期群（E6 スコープ外） | なし | 不要（単純 create/edit PASS） | 解消済み |
| CLN-F1 | 現状維持 | P4 | 16〜22 提出済み一覧 | 対象月 `dateKey` のみ表示する修正済み | `03` Block 8 補足。Hosting 反映済み | **退行させない。** cleanup で触らない | なし | SHF 提出期間の回帰 | 解消済み |
| CLN-F2 | cleanup実装 | P2 | `confirmShiftRequest` | Case C dead。旧要請 ack / deep-link / decline を完全削除 | `03` SHF-04 + F2 実機 | **解消済み。** ローカル削除 + production Function 削除 + Staff Hosting + `lineWebhook` 単体 deploy。正式フロー（`submitShiftRequests`→interim→finalize）と通常 `#shift` は維持。実機: LINE staff 通常シフト画面 **PASS**（申請期間外のためカレンダー操作は非実施・既存仕様） | なし | 不要（実機 PASS） | 解消済み |
| CLN-F3 | 現状維持 | P4 | 募集 vs 深リンク | 正式募集は Admin `createRecruitments` + `sendRecruitmentNotification`（admin へ LINE text）。深リンク confirm とは別 | `03` SHF-04 | 資料/UI で混同しない。コード変更なし | CLN-F2 | 不要 | 解消済み |
| CLN-F4 | 現状維持 | P2 | 募集通知宛先 | `users.role == admin` 全員 Push。個別指定なし | `sendRecruitmentNotification.ts` | **現状維持判断で解消。** 管理者向け運用通知であり staff 配布ではない。宛先変更・staff 向け化・新規実装なし | なし | 不要 | 解消済み |
| CLN-F5 | 将来改善 | P4 | admin→staff 募集配布 | URL 共有・staff 選択・broadcast の正式導線なし | `03` | **営業向け cleanup では新設しない。** 機能不要確定ではない。営業ヒアリング後の将来拡張候補。残件から除外 | なし | 将来実装時のみ | 今回対象外 |
| CLN-F6 | 再実機のみ | P3 | SHF-02 | **OPEN。** SHF-01 **PASS**。SHF-02 **REOPEN / 修正反映済 / 再実機待ち**（#1 申請/割当 deploy 済、#2 LINE selection Hosting deploy 済、#3 **cross-day selection Flutter 修正済**）。SHF-05 PASS | `03` §23.6 | SHF-02 通し再実機 PASS → F6 解消 | Flutter working tree（#3 含む） | `03` §23.6 A〜E | 再実機待ち |
| CLN-G1 | cleanup実装 | P1 | Admin 自身の「オプション編集」 | 自端末でもオプション編集は出る。role/status/archive は非表示 | `hasOption(..., adminBypass: true)` および Terminal `_isAdminDevice` で **admin role は options 不問で全許可**。Admin ホームは options 非参照。options は Terminal 業務ボタン用 | **判定 A。** Admin role 端末では「オプション編集」を出さない（self だけでなく他 Admin も）。self 判定は既存 `isCurrentDevice`（role/status/archive は従来どおり self のみ非表示）。他 Terminal のオプション編集は残す。保存 callable / schema 未変更 | なし | 実機: self Admin にオプション編集なし。他 Terminal には残る | 解消済み |
| CLN-G2 | 現状維持 | P4 | device archive | 他端末向け正式導線。destructive HIGH で未実行 | `03` DEV-03 | 削除候補にしない。正式導線として残す | なし | 不要 | 解消済み |
| CLN-G3 | cleanup実装 | P1 | last-admin テスト整合 | 最後の 1 台降格は実機しない。test 根拠 | 有効 Admin = `role==admin` かつ status 正規化後 `active`。blocked / archived / retired は含めない。保護対象は role 降格・block・archive。backend（`assertNotRemovingLastActiveAdmin`）が正本。UI は self 危険操作のみ非表示（last-admin 件数は持たない）。archive の sole admin は自己禁止が先。複数 Admin の正当変更は許可 | **ケース A。** 本番コード変更なし。helper 単体 + Emulator callable + Flutter wiring が一致。危険実機は未実施・不要 | なし | 不要（automated 代替） | 解消済み |
| CLN-H1 | QA隔離 | P0 | SystemSettings（Terminal 歯車） | reset / demo / 移管 / 開発用タイルが営業 Terminal から到達 | `03` QA-01。実機: Terminal ホームに入口なし | **当時:** Terminal AppBar の歯車／遷移削除、page 残置。**現行:** Final Cleanup Phase 1 で `SystemSettingsPage` **DELETE完了**。正式閉店 `closeStoreTerminal` は残す | なし | 不要（実機 PASS） | 解消済み |
| CLN-H2 | QA隔離 | P1 | logOps 代表サンプル | Admin ホームに `logOpsError 代表サンプル` | `adminHomePage.dart`。emit 未実施 | **当時 Batch 8 判定 B:** 入口削除・page 残置。**現行:** Final Cleanup Phase 1 で `LogOpsErrorSamplePage` **DELETE完了** | なし | 実機: Admin ホームにサンプルなし。他 Admin 項目維持 | 解消済み |
| CLN-H3 | QA隔離 | P1 | Firestore サイズ計算 | **Terminal ホーム通常ボタン**として常時表示（`optionKeys: null`） | `terminalHomePage.dart`。QA-03 は入口確認のみ。page は開いただけでは scan せず「サイズを計算」押下で `calculateFirestoreSize`（read） | **当時:** 営業入口削除・page 残置（Batch 8 判定 B）。**現行方針変更: KEEP** `FirestoreSizePage` + `calculateFirestoreSize`。Admin へは移設しない。Phase 9 undeploy 対象外 | なし | 実機: Terminal ホームにサイズ計算なし。SystemSettings 歯車も非表示維持。正式営業項目維持 **PASS** | 解消済み |
| CLN-H4 | cleanup実装 | P2 | 一時テーブル作成 | SystemSettings 内。保存未実施 | `03` QA-06。実機: 詳細設定 → 卓管理 → 一時テーブル作成 PASS（保存なし） | **仕様確定:** 詳細設定 → 卓管理 → 一時テーブル作成。既存 `CreateTemporaryTablePage` を再利用。SystemSettings 側 tile は削除。保存ロジックは未変更 | CLN-H1 | 不要（入口実機 PASS。保存は必須ではない） | 解消済み |
| CLN-H5 | 現状維持 | P4 | 冪等再送 QA | Terminal 正式入口は隔離済み。再実機 PASS | `03` QA-04。ページ本体 `postSettlementIdempotencyReplayPage.dart` | **当時:** 入口を戻さない・本体削除は任意。**現行:** Final Cleanup Phase 1 で page **DELETE完了** | なし | 不要 | 解消済み |
| CLN-I1 | QA隔離 | P1 | Settings 単体 reset | 全卓/全SG reset・閉店 cleanup・未会計移管は正式閉店の代替にしない | `03` CLS-06。H1 後の静的確認: Flutter UI 入口は当時 `systemSettingsPage.dart` のみ | **当時:** 営業 UI 非到達・callable 残置。**現行:** Phase 5 で public wrappers **DELETE**。internal `run*` KEEP。Phase 9 production undeploy **完了** | CLN-H1 | 不要 | 解消済み |
| CLN-I2 | 現状維持 | P2 | 強制閉店 | 通常閉店 PASS のため未実施。未終了トーナメントがあると「強制閉店する」が出る | `close_pre_confirmation_page.dart` | **現状維持判断で解消。** emergency / escape hatch として残し、通常閉店を正規フローとする。条件成立時のみ表示を維持し、追加実装は行わない | なし | 不要（通常閉店で cover） | 解消済み |
| CLN-I3 | 現状維持 | P4 | 閉店後 LINE | 未入店・注文不可が反映。PASS | `03` CLS-04 | 退行させない | なし | 閉店フロー回帰時 | 解消済み |
| CLN-I4 | cleanup実装 | P1 | 閉店前確認の復旧導線 | 閉店前確認で未会計・未退勤は表示のみで、解消しに行く導線がない | `close_pre_confirmation_page.dart` / `accountingPage.dart` / `staff_attendance_page_from_terminalHome.dart` | **解消済み。** 未終了TN/未会計/未退勤を同一パターン（カード→詳細dialog→正式画面）。未会計は `AccountingPage(forUnsettledBillId)`、未退勤は `StaffAttendancePage`。未会計 dialog から内部 status 表示削除。復帰後 `_fetch`/`getCloseIntegrityData`。mutation 新規なし。smoke PASS。I4-1〜I4-3 実機 **PASS** | なし | 不要（実機 PASS） | 解消済み |
| CLN-J1 | cleanup実装 | P2 | 「本日 / 今後1週間」UI分類 | Flutter/LINE とも最終UIは **本日** / **今後1週間** | `getUpcomingTournaments.ts` / `scheduled_tournament_list_page.dart` / `03` | **解消済み。** 本日=現在営業日。今後1週間=本日除外+先1週間。LINE `getUpcomingTournaments` 関数単位 deploy 済み。automated 8/8 PASS。J1-1〜J1-4 実機 **PASS** | なし | 不要（実機 PASS） | 解消済み |
| CLN-J2 | 現状維持 | P4 | LINE native dialog | 第一巡で Hosting domain 露出。現行 live 経路は `AppDialogs` | `public/user/index.html` の dead `alert`/`confirm`（`joinTournament` / `orderItem`）は CLN-K1/K2 で削除済み。正式注文・トーナメント登録は AppDialogs | live は解消済み。dead native も K1/K2 で削除 | CLN-K1, CLN-K2 | 不要 | 解消済み |
| CLN-K1 | dead削除 | P1 | `joinTournament` | native `alert` の死関数 | `public/user/index.html` コメント DEAD | live caller 0。正式参加は `registerForTournament` + AppDialogs。compatibility 不要。定義削除。追加実機不要 | CLN-J2 | 不要 | 解消済み |
| CLN-K2 | dead削除 | P1 | `orderItem` / `processOrder` | HTML 未配線。`processOrder` は即 return | 同上。正式は `orderAllItems` | live caller 0。`processOrder` は即 return。正式は `orderAllItems` + AppDialogs。定義削除。追加実機不要 | なし | 不要 | 解消済み |
| CLN-K3 | dead削除 | P1 | `executeWithButtonLoading` | user/staff とも定義のみ。呼び出し 0 | grep | live caller 0。正式 loading は `executeWithGlobalLoading`。user/staff 定義削除。D4 helper は維持 | なし | 不要 | 解消済み |
| CLN-K4 | dead削除 | P1 | `_callCreateInitialStateDoc` | Terminal に定義。呼び出し 0。正式は Admin 詳細設定 | `03` LEG-02 / `00` §9.1 | Terminal wrapper のみ削除。正式は `admin_detail_settings_page` の `createInitialStateDocCallable`。callable は残す | なし | 不要（正式経路残置） | 解消済み |
| CLN-K5 | dead削除 | P1 | `attendanceService.getStaffList` | Dart 呼び出し 0。catch に raw wrap 残 | `00` §9.1 | Dart method + 専用 `GetStaffListResult`/`StaffData` 削除。callable `getStaffListForAttendance` は残す。正式打刻は QR `clockIn`/`clockOut` | なし | 不要 | 解消済み |
| CLN-K6 | dead削除 | P1 | `submitAllShifts` DOM | live 非到達（提出 UI が別）。listener 残 | `03` SHF-05 PASS（一括提出非表示）。正式は `submitShiftRequests` | **実装（2026-08-25）:** LINE `#pending-shifts-container` / `#submit-all-shifts-btn` / `#shift-input-container`、`submitAllShifts` / `addShiftToList` / legacy helpers・listeners 削除。正式 `submitShifts`→`submitShiftRequests` は未変更。`createMultipleShifts` は live caller 0 だが Functions/export/logOps は今回残置（frontend のみ）。**F6 未解消**（SHF-01/02 ①提出期間待ち + 不足日募集延期）とは切り離し。23〜月末 LINE UI 不整合は別論点 | なし（F6 未解消のまま） | Hosting deploy 済み | 解消済み |
| CLN-L1 | cleanup実装 | — | PAY-01 | calc target / carry-over / hourlyWage guard / result summary | `03` | **解消済み（2026-08-30 実機 PASS）。** calc target: 直前終了 period へ修正・deploy 済。carry-over: 4件/18h01m backend 正常。hourlyWage missing: execute 前 server guard + candidate warning + execute disabled。result summary: 全 staffResults ベース合算 | なし | 不要 | **解消済み** |
| CLN-ATT08 | 将来改善 | P4 | attendance logical delete | 実機では実行しない D/E | `02` ATT-08 / `03` §19 | 今回触らない | なし | 不要 | 今回対象外 |
| CLN-R1 | 再実機のみ | P3 | USR-01 | 未登録 LINE 本登録。実機 PASS（登録後入店表示は未入店の UI 両ラベルで誤読。実状態問題なし。新規 CLN 不要） | `03` USR-01 | 不要 | なし | 不要 | 解消済み |
| CLN-R2 | 再実機のみ | P3 | USR-07 | 捨丸→まんじゅうや移行 PASS。途中 historical ended `unlinked` 過剰 block を guard 修正し `migrateStoreManagedUserToLine` 関数単位 deploy 後に再実機成功 | `03` USR-07 / `assertUserFreeForMigration` | 不要 | なし | 不要 | 解消済み |
| CLN-R3 | 再実機のみ | P3 | ORD-03 | 実機通信断 unknown は timing 依存で未再現。通常注文は実機済み。classify / orderAllItems 静的 / placeOrderByUser idempotency の automated で代替 | `03` ORD-03 | 追加 production 通信断不要 | なし | 不要 | 解消済み |
| CLN-ACC04 | 現状維持 | P4 | 会計後 overlay | ボタン内 spinner → 全面 overlay。再実機 PASS | `03` ACC-04 | 完了。退行させない | なし | 不要 | 解消済み |
| CLN-TRN03 | 現状維持 | P4 | Addon / 二重 loading | 一次 FAIL → 修正後 PASS | `03` TRN-03 | 完了 | なし | 不要 | 解消済み |
| CLN-P4X | 将来改善 | P4 | `00` §9.4 / §10 束 | QR token consume、Rules 既知課題、console 整理、errorKey 粒度、chip 部分成功の契約、LINE TZ 局所依存、analyze warning 既存 | `00` | 営業向け綺麗化のブロッカーにしない | なし | 不要 | 今回対象外 |

---

## 5. 再走査で新たに確定したこと

既知 A〜L に加え、`03` 全件と現行コードから次を補強・追加した。

| 内容 | 帰属 |
|------|------|
| staff→user 遷移の「開発用」 | CLN-D5。repo 側に当該文言なし。実機表示は LINE Developers のチャネル名由来と判明。user/staff 両チャネル名を正式名称へ修正し、実機 PASS。**解消済み** |
| `debugSideGame` は UI OFF だけでは不十分 | CLN-B4。判定 A。Callable/UI 削除 + live Function 削除済み。**解消済み**（異常時実機は困難のため automated/static 代替） |
| 退席成功後も card を閉じないのがコード上の明示仕様 | CLN-B3 |
| 電話ハイフンは placeholder 不止。validation がハイフン付きを拒否 | CLN-D1 |
| Firestore サイズは Settings ではなく **Terminal ホーム常時ボタン** | CLN-H3 |
| Admin は `adminBypass` で options 無意味 | CLN-G1 |
| live native dialog は AppDialogs 置換済み。残 native は dead のみ | CLN-J2 / K1 / K2 |
| `createStaffByApp` は LINE 非連携 + 固定パスワード | CLN-D3（**解消済み**。production Callable 削除済み） |
| Flutter/LINE とも **本日 / 今後1週間**（本日除外） | CLN-J1（**解消済み**。実機 PASS。Terminal「今後開催」は status 軸の別UI） |
| 第一巡で既に直したもの（誤って未対応にしない） | CLN-C2（**解消済み**。①実機 + ③ read-only + ②④⑤ automated。backfill なし）、CLN-H5、CLN-ACC04、CLN-TRN03、CLN-F1、CLN-J2 |
| `confirmShiftRequest` は Case C dead | CLN-F2（**解消済み**。production 削除 + Hosting + lineWebhook + 実機 PASS） |
| 閉店前確認の復旧導線 | CLN-I4（**解消済み**。I4-1〜I4-3 PASS） |
| USR-07 移行時の historical ended `unlinked` 過剰 block | CLN-R2。guard 修正 + deploy + 捨丸→まんじゅうや実移行 **PASS。解消済み** |

---

## 6. 仕様判断が必要なもの（実装前）

### 6.1 CLN-E1 / E2 / E3 / E4（勤怠再設計延期群）— 仕様確定・実装保留

- **2026-08-19 確定。** 詳細正本: `docs/綺麗化/E1-E3_勤怠再設計_仕様判断前調査.md` §32.11
- **E1〜E3:** 実装は営業後へ延期。営業向け cleanup では実装しない
- **E4（CLN-E4）:** E1〜E3 実装**後**の勤怠実機確認フェーズ（ATT-03 等）。現行 schema のまま E4 単独確認しても将来仕様の検証にならないため、**E1〜E3 と同じ延期群に内包**する。独立 HOLD 残件ではない
- **canonical:** 1 staff + 1 businessDate = 1 attendance。ID `{staffId}_{businessDate}`。複数勤務は `workSessions[]` + `sessionId`
- **break:** 現行サブコレ + sessionId。中抜けは gap。実働 = 全 session 合計 − 全 break
- **親時刻:** clockIn/Out / first/last は正本にしない。履歴は全 session 表示
- **correction:** 1 申請 = 1 session。対象は attendanceId + sessionId
- **Admin:** 同日に別 doc を作らない
- **overnight HH:mm:** end < start なら翌暦日（startedAt の JST 暦日基準）
- **営業向けcleanup:** **実装しない。** 案件化後に再開。実装済み・不具合解消ではない
- **root cause（現行のまま）:** `clockIn` は open のみ guard し、同日 closed を見ず auto-ID 新規

### 6.2 CLN-D3（`createStaffByApp` 廃止）— 解消済み

- **確定方針:** 旧Flutterスタッフ作成経路を廃止。正式スタッフ作成は LINE `createStaffAccount` に一本化
- **理由:** email+固定password・`staffs/{randomUid}`・LINE未連携のため、LINEスタッフUI・本人シフト申請・通知・再登録が成立しない半端staffを新規作成できてしまう
- **実施内容:**
  - Flutter/Admin「Staff作成」導線削除
  - `createStaffAccountPage.dart` / `createStaffByApp.ts` / export / logging mapping 削除
  - production Callable `createStaffByApp`（`asia-northeast1`）明示削除
- **変更なし:** production の既存 `staffs/*` / Auth users / attendance / shifts / payroll。LINE `createStaffAccount` 本流
- **CLN-D2:** D3 後調査で Case A。**解消済み**（任意 legacy cleanup は P4 候補・今回不要）

### 6.2b CLN-D2（LINE vs 旧Flutter schema）— 解消済み

- **調査（D3完全削除後）:** 正式作成は LINE `createStaffAccount` のみ。保存 schema は `fullName` / `fullNameKana` / `email` / `phoneNumber` / `birthMonthDay` / `loginId` / `status` / QR 系
- **旧Flutter専用:** `StaffName` / `StaffFullName` / `staffRole` は production の必須 read なし（`staffRole` 参照 0）。`Staff*` は退職時 PII delete リストと demo seed に残るのみ
- **機能:** 一覧・詳細・QR勤怠・LIFF本人操作・シフト・時給/口座・給与・退職/再有効化は LINE staff（`fullName` + docId=LINE uid）で完結
- **判断:** Case A。D2 解消済み。任意 cleanup は `RETIRED_STAFF_PII_FIELDS` の旧名整理・demo seed 程度（低優先・今回実施不要）

### 6.3 CLN-F2 / F4 / F5（シフト要請・募集）

- **F2:** **解消済み。** Case C dead。ローカル削除 + production `confirmShiftRequest` 削除 + Staff Hosting + `lineWebhook` decline 除去。正式シフトフローと通常 `#shift` は維持。実機: LINE staff 通常シフト画面 **PASS**（申請期間外カレンダーは既存仕様・F6 と混同しない）
- **F4:** **現状維持判断で解消済み。** `sendRecruitmentNotification` は管理者向け運用通知（`users.role == admin`）。staff 配布ではない。宛先変更なし
- **F5:** **今回対象外。** staff 向け push / broadcast / Admin→Staff 配布は営業向け cleanup では新設しない。機能不要確定ではない。営業ヒアリング後の将来拡張候補。残件から除外
- **影響:** 募集作成 UI・正式シフトは残す。F6（SHF-01/02 提出期間再実機 + 不足日募集延期）は**未解消**。**K6 は 2026-08-25 に frontend legacy 削除で解消**（F6 と切り離し）

### 6.3b CLN-F6（不足日募集フロー現状整理）— **未解消・営業後延期**

**判断（2026-08-30）:** 営業前の綺麗化では不足日募集フローを完成させない。現状把握完了。営業後の仕様判断・実装へ延期。

**F6 の内訳（混同しない）:**

| 区分 | 内容 | 状態 |
|------|------|------|
| SHF-01 / SHF-02 | 正式シフト提出・pending/confirmed | SHF-01 **PASS**。SHF-02 **REOPEN / 修正反映済 / 再実機待ち**（#3 cross-day selection Flutter 修正済） |
| 不足日募集 | Admin 不足日算出〜Staff 完結フロー | **現状把握完了。営業後延期** |
| SHF-05 | legacy 一括提出非表示 | **PASS（CLN-K6 解消。F6 とは別）** |

**実装済み:**

- Admin 不足日算出（`calculateInsufficientDays`）
- Admin recruitment 作成（`createRecruitments` → `shiftRecruitments`）
- Backend 不足日再提出 guard（`submitShiftRequestsAtomic` + `insufficientDaysNotificationSent`）
- Admin pending 受取 / interim 確定

**部分実装:**

- `sendRecruitmentNotification` — 通知先は **admin のみ**（Staff へは未送信）
- Staff 不足日再提出 — Backend は対応。LINE UI は期間判定（16〜22 hardcode）と不整合
- 不足状態再計算 — 他操作時には存在。Staff 追加申請直後の自動連鎖なし

**未実装:**

- Staff 向け不足日 Push / 通知
- Staff 募集表示 UI
- recruitment を Staff が参照する導線
- recruitment 終了 / close
- flag lifecycle（`insufficientDaysNotificationSent` 等）
- 不足解消までの完結フロー

**`insufficientDaysNotificationSent` の意味（重要）:**

- Staff 通知完了を意味**しない**
- 実態: Admin 向け notification 成功後に、period② の Staff 不足日再提出を Backend 上解禁する **gate**

**期間 UI 不整合（今回単独修正しない）:**

| レイヤ | 挙動 |
|--------|------|
| LINE 16〜22 | scheduling period 扱い。カレンダー非表示 |
| LINE 23〜月末 | 22 日 hardcode の副作用でカレンダー再表示 |
| Backend | `schedulingStartDay` 以降〜月末まで period②。notification + insufficient のみ Staff 提出可 |

23 日以降の calendar 再表示は Backend と一致していない。不足日募集機能全体が未完成のため、今回 UI だけ単独修正しない。

**営業後にまとめて仕様判断する論点:**

- Staff 不足日通知
- Staff 募集 UI
- period② 再提出 UX
- recruitment と submit guard の連動
- 不足再計算
- recruitment close
- `insufficientDaysNotificationSent` lifecycle
- `getShifts` pending 非表示
- Config 期間 SSoT
- `sendRecruitmentNotification` recipient 設計

### 6.4 CLN-C1（要対応系 reopen 復元 = C1-A / C1-B / C1-C）— **解消済み**

- **共通契約:** 「会計前に戻す」= 会計直前の未会計状態へ戻す
- **C1-A:** 通常未会計 → settle → reopen → 通常未会計（`status=open` + activeStay）。**同一 businessDate 制約を維持**。`reopenDestination=unsettled_list`。Emulator regression PASS。資料上ブロッカーなし
- **C1-B（確定仕様・実機 PASS 2026-08-25）:** 閉店持ち越しは閉店後の要対応案件。元 `bill.businessDate` を履歴として保持し、**current businessDate と独立して処理可能**
  - **閉店時 carryover 化:** production 新規 bill は `buildInitialCloseSummary()` を持つ。旧 bug（initial shape を invalid 扱い）を `applyCloseSnapshotCore` の INITIAL / MARKED / INVALID 分類で修正。INITIAL→UNSETTLED_MARK、MARKED→idempotent skip、INVALID→安全側 skip。閉店後: `status=open` 維持・`closeSummary/closeSnapshot.unresolved=true`・証跡付与・`unsettledBillsCount +1`・要対応表示
  - **理由表示:** carryover 通常 bill = **入店者の未会計**（入店済みが閉店まで未精算）/ okibake = **未入店参加の未会計**（未入店等の参加が通常 bill 未紐付けのまま終了）
  - **来店なし入金（activeStay なし）:** `CarryoverRemoteCashPaymentDialog`（AccountingPage 非遷移）。cash 固定。元 carryover bill を精算（新 bill なし）。**claim === received 必須**（請求額初期・編集可・不一致は UI/backend 拒否。一部入金・過入金なし）
  - **activeStay あり:** current bill へ merge しない。「過去伝票を精算」→ AccountingPage で元 carryover を処理。current activeStay / bill / visitLog 保護
  - **cross-day settle:** 元 `businessDate` 維持・analytics/netSales 変更なし・current visit を閉じない
  - **reopen:** cross-day 可（`BILLS_REOPEN_NOT_TODAY` 対象外）・`unresolved` 復元・`unsettledBillsCount +1`・activeStay 復帰なし・`reopenDestination=special_attention`・成功文言「要対応の会計に戻しました」
  - **same-day reopen 自動復旧（事故閉店）:** 同一 `businessDate` 再開店時、未処理の UNSETTLED_MARK 通常 bill を確認 UI なしで通常未会計へ戻す（closeSummary/Snapshot→initial、count 減算、activeStay 必要分復旧、visitLog 不変、closeRun 履歴残置、idempotent。最新 closeRun 限定ではない）
  - **next-day open:** 別 businessDate 開店では自動復旧しない。carryover は要対応に維持
  - **会計完了タブ / 会計後操作:** `ops.accountingCompletedAt` の **JST calendar date** 基準（旧 `bill.businessDate` 基準を廃止）。cross-day settle 後も settle 日から到達可。reopen で一覧から消え、再 settle は最新完了日。post-settlement は元会計日維持。legacy は `accountingCompletedAt` 欠損時のみ businessDate fallback（二重表示防止）
  - **会計後調整との責務:** settle 時は claim===received。settle 後の請求変更は会計後操作（増額徴収 / 減額返金）。未収の暗黙繰越は採用しない
  - **B2 フル bill→bill merge は future enhancement**（今回禁止）
- **C1-C:** okibake `pending_review` → remote payment settle → reopen → entry を `pending_review` 復元 + 生成 bill は **`voided`**。**C1-C 実機 PASS（2026-08-23）**。来店なし入金も **claim===received** に統一（canonical claim 再計算・mismatch 拒否・pending_review 維持・remote bill 未作成。legacy claim≠received は migration しない）
- **対象外（C1-D なし）:** post-settlement 追加徴収 / 要返金を C1 スコープに含めない
- **履歴（修正済み）:** 2026-08-24 に close→carryover FAIL（initial closeSummary を invalid skip）を検出・修正。会計日 UI 未達も同日〜25 に修正。いずれも **実機 PASS で解消**
- **検証:** Emulator（same-day restore 8/8・eligibility 7/7・okibake remote 9/9・C1-B/reopen regression・関連 49/49）+ `settlement_date_test` 12/12 + Functions build 0。関数単位 deploy: `openStoreTerminal` / `closeStoreTerminal` / `completeAccountingV2` / `reopenAccountedBill` / `resolveOkibakePendingReviewWithRemotePayment`
- **実機 PASS（2026-08-25・ユーザー報告）:** close→carryover / 理由表示 / C1-B 来店なし入金 / 会計日基準表示 / reopen→要対応復帰 / same-day reopen→通常未会計復旧 / next-day carryover 維持
- **成功文言:** `reopenDestination` に従い出し分け。`unsettled_list` →「未会計一覧に戻しました」/ `special_attention` →「要対応の会計に戻しました」
- **C1 に含めない将来論点:** ACC-02「後で」残否・settling 再開 UX・名称整理。`AccountingHistoryPage` は当面 `businessDate` 基準のまま（C1-B 必須ではない）。**businessDate と会計・税務上の収益認識日**は取引区分ごとの将来整理（今回は UI の会計日検索のみ。売上計上日変更ではない）

### 6.4c （旧 CLN-C3）— C1-C へ吸収

- 2026-08-23: 独立 CLN-C3 を廃止し **CLN-C1-C** に吸収。残件カウントから除外

### 6.4b CLN-E6（ATT-04 / ATT-05）— 解消済み

- 入口: Terminal 勤怠 →「管理者用編集」→ password → 一覧 → add/edit
- **実機 PASS（2026-08-23）:** ATT-04 create / ATT-05 simple edit / timezone（12:00–18:00 がそのまま）/ loading overlay
- **追加 UI:** 論理削除（`isDeleted`）は DB に残すが、通常 Admin 一覧からは非表示（Terminal 当日一覧・allStaff と同型の client filter）。削除済み専用トグルは今回新設しない
- ATT-05 full（ATT-03 却下後）: **延期**（E1〜E4 延期群。E6 スコープ外）
- overnight 同日 validation / 過去ズレデータの backfill: 今回対象外

### 6.5 CLN-H4（一時卓）

- **確定:** 詳細設定 → 卓管理 → 一時テーブル作成
- **実装:** 既存 `CreateTemporaryTablePage` / `createTemporaryTable` callable を再利用。SystemSettings の tile は削除
- **影響:** 一時卓 lifecycle は変更しない。通常卓と混同しない。保存の実機は必須ではない（入口確認）

### 6.6 CLN-J1（「本日 / 今後1週間」UI分類）— 解消済み

- **確定仕様（最終UI）:** Flutter / LINE とも **本日** / **今後1週間**（「近日」は使わない）
- **本日:** 現在の営業日に属するトーナメント
- **今後1週間:** 本日分を除外した先1週間の予定トーナメント
- **実装:** LINE `getUpcomingTournaments`（`includeAll=false`）で current `businessDate` 一致を除外。Flutter 管理一覧は `businessDate` anchor+1〜+7（元々本日除外）。Terminal「今後開催」は status 軸の別UIのため変更なし
- **automated / deploy:** Emulator 8/8 PASS。`getUpcomingTournaments` 関数単位 deploy 済み（`asia-northeast1`）
- **実機:** J1-1〜J1-4 **PASS**

### 6.7 CLN-I2（強制閉店）— 解消済み

- **現状維持判断で解消。** emergency / escape hatch として残す。通常閉店を正規フローとする。条件成立時のみ表示。追加実装なし

### 6.8 CLN-I4（閉店前確認の復旧導線）— 解消済み

- **最終UI:** 未終了トーナメント / 未会計 / 未退勤とも **カード → 詳細 dialog → 正式画面**
- **未会計:** 「会計画面へ」→ `AccountingPage(forUnsettledBillId…)`。dialog から内部 status（`open` 等）表示は削除
- **未退勤:** 「勤怠管理へ」→ `StaffAttendancePage`
- **復帰:** `_fetch` / `getCloseIntegrityData` で一覧再取得。business logic / mutation 新規なし
- **検証:** smoke PASS。I4-1 / I4-2 / I4-3 実機 **PASS**

---

## 7. 依存関係

```text
okibake CLN-C2 — 解消済み
  関数単位 deploy（全 Functions 禁止）— 実施済み
    → ① claim==received 実機 PASS
    → ③ 既存① bill read-only PASS（`hwlRXiI4Ly3hTwEBPCiV`）
    → ②④⑤ automated PASS（差分 settle / claim 表示 / legacy fallback）
  追加実装・backfill なし

QA / debug（完了）
  B4 / H1 / H2 / H3 / H4 / I1 — 解消済み
  K1〜K6 — 解消済み（K6 は frontend legacy 一括提出削除。Functions `createMultipleShifts` は残置）

Staff
  D3 完了 → D2 完了
  D1 / D4 / D5 — 解消済み

Attendance
  E1〜E4 延期群（営業向けcleanup対象外。E4=E1〜E3 実装後の ATT-03 等検証）
  E5 完了 / E6 解消済み

Shift
  F2 完了 / F3 完了 / F4 完了 / F5 今回対象外（将来拡張候補）
  K6 解消済み（frontend）。**F6 OPEN** — SHF-01 PASS 済。SHF-02 再実機待ち。不足日募集: 営業後延期（§6.3b）
  別論点: LINE は 16〜22 のみ scheduling 扱いだが Functions は 16日以降②扱い → 23〜月末カレンダー再表示の UI 不整合（営業後一括判断。K6/F6 外）

SideGame
  B1 / B2 / B3 — 解消済み

閉店
  I2 / I3 / I4 — 解消済み

トーナメントUI
  J1 — 解消済み
```

---

## 8. 実装バッチ案

依存と破壊半径で切る。  
**実施順:** Batch 0（C2 関数単位 deploy）→ **直後に Batch 2 の CLN-B4**（セキュリティ。長期間後回しにしない）→ Batch 1（文言）以降。勤怠モデルは後ろ。

### Batch 0 — CLN-C2（**解消済み 2026-08-23**）

- **対象:** CLN-C2（`resolveOkibakePendingReviewWithRemotePayment` + UI claim helper）
- **実施済み:** 関数単位 deploy。①実機 PASS
- **③ read-only（追加 mutation なし）:** production bill `hwlRXiI4Ly3hTwEBPCiV`（businessDate `2026-08-19`, settled, uid `KzopDbenAVbhevEtBKKYFL9j3y32`, tournament `7W0LFPugIMRYk9J8d7J8`, entry `s6zMfnL8q1ICv8RQTopz`）。claim=received=2000。`meta`/`draftAccountingInput` の `paymentMethodsByCategory.tournaments=cash`。`amounts`/`settlementSnapshot`/`paymentTotals`/`currentSummary` 揃い
- **②④⑤ automated:**
  - Functions: claim==received exact / under・over 拒否（`OKIBAKE_REMOTE_PAYMENT_AMOUNT_MISMATCH`）/ ByCategory（`resolveOkibakePendingReviewWithRemotePayment.spec.ts`）。旧 claim≠received 許容テストは廃止
  - Flutter: claim 優先（5000 vs remote 4000）/ legacy remote fallback（`okibake_remote_payment_display_amount_test.dart`）
- **⑤ production legacy（任意確認用・新規作成禁止）:** 例 `srE8VaHqyaq9JN2j65Oq`（2026-08-16）。ByCategory 欠落・`amounts` null・`remotePayment.amountIncl=1000`・claim/received summary 0
- **やらない:** 過去 broken bill の backfill、差分ケースの新規実機必須化（automated で契約保証済み）、全 Functions deploy

### Batch 1 — 文言 / 表示のみ

- **対象:** CLN-D1, CLN-B2, CLN-G1, CLN-D5
- **CLN-B2:** **解消済み。** 実機で文言確認 PASS
- **CLN-D1:** **解消済み。** Hosting deploy 済み。placeholder 実機 PASS。normalize は automated test PASS
- **CLN-G1:** **解消済み。** 実機: self Admin にオプション編集なし。他 Terminal には残る
- **CLN-D5:** **解消済み。** repo 変更不要。実機「開発用」は LINE Developers のチャネル名由来。user/staff 両チャネル名を正式名称へ変更し、D5-1/D5-2 実機 PASS
- **残り:** なし（Batch 1 完了）
- **リスク:** 低。D1 は strip を入れれば登録失敗を減らす
- **test:** staff 登録 validation、device 管理の Admin 非表示
- **deploy:** D1 は Hosting（実施済み）。G1/B2 は Flutter
- **再実機:** B2 は withdraw 画面の文言確認。D1 は完了。G1 は self Admin / 他 Terminal

### Batch 2 — QA / debug 隔離（P0 含む。Batch 0 の直後）

- **対象:** **CLN-B4（先に）**, CLN-H1, CLN-H2, CLN-H3, CLN-I1
- **CLN-B4:** **解消済み。**（二重計上しない）
- **CLN-H1 / H4 / I1:** **解消済み。** H1 実機 PASS。一時卓は詳細設定へ移設済み。単体 reset 群は営業 UI 非到達。追加 destructive 実機は不要
- **CLN-H2:** **解消済み。** 実機: Admin ホームから logOps サンプル消失。他 Admin 項目維持
- **CLN-H3:** **解消済み。** Terminal 営業ホームから Firestoreサイズ計算を削除。**現行: page + `calculateFirestoreSize` は KEEP**（当時 Batch 8 は caller 0 残置。方針変更）。実機: 非表示 / 歯車なし / 正式項目維持 PASS
- **残り:** なし
- **deploy:** H2/H3 は Flutter。Hosting なし。全 Functions deploy 禁止
- **再実機:** H3 完了

### Batch 3 — SideGame 状態 / layout

- **対象:** CLN-B3（P0）, CLN-B1
- **CLN-B3:** **解消済み。** 実機で通常退席 / 預入+退席 / 退席状態整合 PASS
- **CLN-B1:** **解消済み。** 第1段: 預入/引出/購入の可変 height。第2段: 背後の `showUserActionHome` を keyboard-safe に。子を開いても親は閉じない。実機: deposit+keyboard 前面/背面 overflow なし、withdraw+keyboard overflow なし。deposit+leave は automated PASS
- **リスク:** 中。誤って座席 stream を壊さない
- **test:** 小 viewport / keyboard inset で overflow しない。B2 文言・B3 close 維持
- **deploy:** Flutter のみ
- **再実機:** B1-1 withdraw / B1-2 deposit / B1-3 deposit+leave。keyboard 時も操作可能

### Batch 4 — Staff feedback / Admin loading（独立）

- **対象:** CLN-D4, CLN-E5
- **CLN-E5:** **解消済み。** approve/reject 共通 operation lock + fullscreen loading。実機 loading/lock PASS
- **CLN-D4:** **解消済み。** 登録 / 再登録 / live シフト申請 / 勤怠修正を AppDialogs。validation と lower-message helper は残置。D1 phone / loading 未変更。automated PASS（本番 mutation 追加作成なし）
- **残り:** なし
- **リスク:** 低〜中。AppDialogs 再利用。二重 dialog 注意
- **test:** staff LIFF mutation（D4 automated PASS）、勤怠修正 overlay（E5 PASS）
- **deploy:** Hosting + Flutter
- **再実機:** D4 は代表 1 mutation。E5 完了

### Batch 5 — Staff 作成（D3/D2 解消済み）

- **対象:** CLN-D3（**解消済み**）、CLN-D2（**解消済み**）
- **D3:** 旧Flutter `createStaffByApp` をローカル＋production から削除。正式作成は LINE `createStaffAccount`
- **D2:** D3後調査で LINE本流のみで現行機能完結を確認。旧field差は実害なし
- **deploy（D3）:** Function 単体削除のみ実施済み
- **再実機:** 任意（Adminに「Staff作成」なし / LINE登録可）

### Batch 6 — Attendance 再設計（**営業向けcleanupでは実施しない**）

- **対象:** CLN-E1, CLN-E2, CLN-E3, **CLN-E4**（検証フェーズ）
- **状態:** **延期（4 件）。** 正本 `E1-E3_勤怠再設計_仕様判断前調査.md` §32.11
- **営業向け:** 対象外。実装済みではない。現行の同日複数 doc は残る
- **E4:** E1〜E3 実装後に ATT-03 等を再実機。独立 HOLD ではない
- **再開:** 案件化・本開発時。Functions + Flutter + Hosting。E4 再実機は E1〜E3 実装後
- **リスク:** 最高。給与・夜勤・修正・履歴（だから営業前にやらない）

### Batch 7 — Shift legacy（F2/F4/F5/K6 完了。残り F6）

- **CLN-F2:** **解消済み。** production Function 削除 + Staff Hosting + `lineWebhook` deploy + 実機 PASS
- **CLN-F4:** **解消済み**（管理者向け運用通知として現状維持）
- **CLN-F5:** **今回対象外**（staff 配布新設しない。将来拡張候補）
- **CLN-K6:** **解消済み（2026-08-25）。** LINE legacy 一括提出 DOM/JS 削除。SHF-05 非表示 PASS を根拠。正式 `submitShiftRequests` 未変更。`createMultipleShifts` Functions は残置（live caller 0）。Hosting deploy 済み
- **残り:** **CLN-F6 OPEN。** SHF-01 PASS 済。SHF-02 修正反映済 / deploy 済 / 再実機待ち（`03` §23.6）。不足日募集は §6.3b のとおり営業後延期。**K6/SHF-05 解消で F6 を解消扱いにしない**
- **別論点（営業後一括判断）:** 23〜月末の LINE UI 不整合（LINE 16〜22 vs Functions day≥16）。期間ロジックは K6 で変更していない
- **再実機:** F6 の SHF-02 のみ（`03` §23.6）。F2/K6/SHF-05/SHF-01 は完了のため再掲しない

### Batch 8 — dead 削除

- **対象:** CLN-K1〜K6。H2 の `LogOpsErrorSamplePage` は Phase 1 で DELETE。H3 の `FirestoreSizePage` は **KEEP**
- **CLN-K1〜K6:** **解消済み。** K6 は frontend のみ（Functions `createMultipleShifts` 残置）
- **LogOpsErrorSamplePage:** **DELETE完了**（Final Cleanup Phase 1）。当時 Batch 8 判定 B は入口隔離時点の判断
- **FirestoreSizePage / calculateFirestoreSize:** **KEEP**（方針変更。Phase 9 undeploy 対象外）
- **test:** grep ゼロ + 既存 public/Flutter tests PASS
- **deploy:** Hosting / Flutter 該当分（未実施）
- **再実機:** 不要（静的）

ACC-02「後で」UX/名称は C1 解消後も将来判断として残す（C1 スコープ外）。J1 / I2 / F2 / F4 / F5 / C1 / K6 は判断・実装まで完了（K6 Hosting deploy 済み）。**F6 は未解消**（§6.3b）。

---

## 9. 再実機のみ（コードを待たない）

| ID | 待ち条件 |
|----|----------|
| CLN-C1 | **解消済み。** 実機待ちではない（C1-A/B/C 完了） |
| CLN-C3 | **C1-C へ吸収**（独立残件ではない） |
| CLN-E1〜E4 | **延期。** E1〜E3 実装後。E4=ATT-03 等の勤怠実機確認 |
| CLN-E6 | 解消済み（ATT-04 / ATT-05 simple）。フル ATT-05 は E1〜E4 延期群（E1〜E3 実装後） |
| CLN-F6 | **OPEN（再実機待ち）。** SHF-01 **PASS**。SHF-02 **REOPEN / 追加 UI 修正反映済** — #4 LINE calendar 緑/青✓ 含む。**`03` §23.6 通し再実機が最終クローズ条件** |
| CLN-L1 | **解消済み。** PAY-01 実機 PASS（2026-08-30） |
| CLN-K6 | **解消済み。** 再実機待ちではない（SHF-05 非表示 PASS + static 削除確認） |

### 9.1 CLN-L1 — calc target bug 修正（2026-08-30）

**原因:** `buildPayrollDisplayContext` が `getPaymentPeriodKey(today)` で **active period**（今日が属する期間）を返していた。一方 calc tab は `today > periodEnd`（締め済み period）を計算可能条件としており、period 終了翌日に active が次 period へ切り替わるため **calc window=true になる日が 0 日**だった。

**修正:** `getCalcTargetPeriodRange` を追加し、displayContext の `paymentPeriodKey` / `periodStart` / `periodEnd` を **直前に終了した給与期間**（`processPayrollNotifications` の recentPeriod と同一導出）へ変更。

**結果:** Functions deploy 済。**実機 PASS。**

### 9.2 CLN-L1 — hourlyWage guard + result summary（2026-08-30）

**事象:** production PAY-01 実機で、時給未設定 staff 2名が 18h01m / grossPay=0 のまま run completed。result tab は grossPay filter 後に時間合算して 0h 表示。

**修正:**
- `executeMonthlyPayroll`: run 作成前に missing/null/非 finite 時給を reject（`PAYROLL_HOURLY_WAGE_MISSING`）。explicit 0 は許可。
- `getPayrollCandidates`: `wageMissingStaff[]` を追加。calc tab で警告表示 + 実行 disabled。
- `result_tab`: summary は全 staffResults、card は grossPay!=0 のみ（§4-1 / §4-2 分離）。

**結果:** carry-over 4件/18h01m backend 正常。**hourlyWage guard・result summary 含め実機 PASS。** CLN-L1 **解消済み**。

---

## 10. `03` との役割分担

- `03`: 実機手順・判定・発見事項の記録。§19 は本ファイルへの索引。§23 は F6 クローズ条件
- `04`: cleanup の優先度・状態・バッチ・判断（本ファイル）
- `00`: 全体進捗。最終監査は §14

---

## 11. 最終監査とクローズ方針（2026-08-31）

正本の詳細は `00` §14。本節は cleanup 観点の要約。

### 11.1 監査完了（3 種類 + 回帰）

| 監査 | 結論 |
|------|------|
| A. cleanup 目的達成 | **PASS WITH KNOWN LIMITATIONS**。blocker / reopen **なし** |
| B. repository 全体横断 | **PASS WITH KNOWN LIMITATIONS**。P0/P1 **なし**。sales-visible risk **なし** |
| C. `.cursor/rules` | **MOSTLY COMPLIANT**。cleanup 差分の新規違反 **なし** |

**inventory（現時点・変更なし）:** resolved **49** / deferred **4**（E1〜E4）/ remaining **1**（F6）/ total **54**

### 11.2 回帰・`functions/lib`（要点）

- Flutter: analyze error 0 / **871/871 PASS**
- Functions: lint・tsc PASS / emulator 付き cleanup 重要 suite **ALL PASS**
- Functions 全件 16 runtime fail + 11 suite compile failure → test 側・fixture 陳腐化。**production bug なし。commit blocker ではない**
- `functions/lib` clean build 後、deleted source 由来 stale JS **0** → deploy artifact stale **RESOLVED**

### 11.3 2026-09-01 F6 クローズ条件

| 項目 | 内容 |
|------|------|
| **SHF-01** | **PASS**（2026-09-01 ①提出期間・カレンダー → `submitShiftRequests` → pending・feedback・loading/lock・raw error なし） |
| **SHF-02** | **REOPEN / 追加 UI 修正反映済 / 再実機待ち。** (1)(2) deploy 済 (3) Admin cross-day Flutter 修正済 (4) **LINE calendar 緑✓/青✓** → Staff Hosting `public/staff/index.html` **修正済（working tree）**。再実機: `03` §23.6 |
| **SHF-05** | 済（PASS） |
| **F6 現状** | **OPEN / 再実機待ち**（SHF-02 PASS で resolved 50） |
| **除外** | 不足日募集（営業後延期） |

**PASS 後の inventory（予定）:** resolved **50** / deferred **4** / remaining **0** / total **54**（50+4+0=54）→ **営業向け綺麗化 完了**

**注意:** E1〜E4・P2 技術負債・不足日募集は **cleanup 完了後も別タスク**。cleanup 完了 ≠ repo 全体 debt ゼロ。

### 11.4 commit 方針

- **現時点: commit しない**
- **2026-09-01 SHF-02 PASS 後:** `00`/`03`/`04` 最終更新 → commit（除外: `.firebase/hosting.cHVibGlj.cache`・`flutter_open_error_paths_inventory.tsv`）

---

## 12. F6 外・最終 UI cleanup 記録（混同しない）

**本節は F6 / SHF-02 残件ではない。** inventory・F6 クローズ条件には含めない。

### 12.1 Admin gap 表示の連続区間マージ（2026-09-03）

| 項目 | 内容 |
|------|------|
| 対象 | Admin シフト日付ダイアログ / 不足日一覧の **gap**（スタッフ0人帯）表示 |
| 修正 | 60 分刻み検出は維持。表示前に `mergeConsecutiveGapSlots` で連続区間を結合 |
| 維持 | `mergeConsecutiveInsufficientSlots` / requiredStaff / `isSufficient` / backend / schema |
| 状態 | **コード修正済（working tree）・実機再確認待ち** |
| 参照 | `lib/StaffDate/utils/merge_consecutive_gap_slots.dart` |

---

## 13. Batch 9（dead code / obsolete tests cleanup）— 54 件 inventory 外

**本節は §2 / §4 の 54 件 inventory とは別枠。** resolved 数は変更しない。

### 13.1 execution batch 1（2026-09-03）— 実施済（deploy / commit / push なし）

| 項目 | 内容 |
|------|------|
| old accounting island | `unused_function_lib` 配下の postEvent* / updateAccounting / refundProcessing / billsEventsOnCreate を削除 |
| unused_tests | `functions/__tests__/unused_tests/**` 全 7 suites 削除（directory も削除） |
| attendance legacy | `determineAttendanceMode.ts` / `configOps.ts` / `ops.spec.ts` 削除 |
| stale tests 修正 | `snapshots.spec.ts`（byMethod 除去）; reporting 3 suites（`totalAmountIncl` 追加） |
| orphan | `getScheduledTournaments_to_be_deleted.ts` 削除（空 `to_be_deleted/` も削除） |
| HOLD 維持 | `openStore` / `closeStore`（source・root export・deploy 対象維持） |
| 維持 | `unused_function_lib/` directory 自体・`tsconfig` exclude |
| 付帯 | `serviceByFunctionEntry` の `determineAttendanceMode` マップ行を削除（obsolete entry 完全除去） |
| 状態 | **コード削除・test 修正済（working tree）。deploy / commit 未実施** |
| batch 1 後の残 | HOLD 2 件（`openStore` / `closeStore`）。`createMultipleShifts` は batch 2 で削除 |

### 13.2 execution batch 2（2026-09-03）— 実施済（commit / push なし）

| 項目 | 内容 |
|------|------|
| createMultipleShifts | source / export / serviceByFunctionEntry 削除 |
| production undeploy | `firebase functions:delete createMultipleShifts --region asia-northeast1`（project: amuse-app-template） |
| 正式経路 | LINE `submitShifts` → `submitShiftRequests`（変更なし） |
| HOLD 維持 | `openStore` / `closeStore`（batch 3 へ） |
| 状態 | **削除・undeploy 済（working tree）。commit / push 未実施** |

### 13.3 execution batch 3（2026-09-03）— 実施済（commit / push なし）

| 項目 | 内容 |
|------|------|
| openStore / closeStore | source / export / serviceByFunctionEntry 削除 |
| unused_function_lib | directory 完全削除（最後の 2 ファイル削除後） |
| tsconfig / eslint / package.json | `unused_function_lib` exclude / ignore 削除 |
| legacy tests | `storeManagement/step3.spec.ts` / `close_process/step3.spec.ts` から legacy describe 削除 |
| production undeploy | `firebase functions:delete openStore closeStore --region asia-northeast1`（project: amuse-app-template） |
| 正式経路 | Terminal `openStoreTerminal` / `closeStoreTerminal`（変更なし） |
| HOLD 3 | **すべて解消**（batch 1〜3 完了） |
| automated regression（2026-09-03） | Firestore Emulator（127.0.0.1:8081）起動後、前回 skip/fail 3 suite **19/19 PASS**（`close_open_terminal_auth` / `close_store_flow` / `same_day_reopen_restore`）。前回 fail 原因は Emulator 未起動のみ。実行中 `enqueueOpenAssessmentRecheck` の Cloud Tasks ログは emulator 既知（assert 非対象・close 自体は success） |
| 実機 smoke（2026-09-03） | Terminal **openStoreTerminal 開店 / closeStoreTerminal 閉店 / same-day reopen: PASS** |
| Batch 4 hygiene（2026-09-03） | operation_log / `00` / `_staticFcUnits.json` / serviceByFunctionEntry コメント / legacy CSS 整理 |
| 状態 | **Batch 9 CLOSED（batch 1〜4 完了）。commit / push 未実施** |

### 13.4 execution batch 4（2026-09-03）— post-batch hygiene（commit / push なし）

| 項目 | 内容 |
|------|------|
| operation_log | 削除済み callable（`updateAccounting` / `processRefund` / `determineAttendanceMode` 等）を current registry から除去。正式経路へ差替 |
| `00_営業向け綺麗化_全体管理` | Batch 9 完了状態へ同期 |
| `_staticFcUnits.json` | `node scripts/regenerateStaticFcUnits.cjs` で現行 source から再生成（354 units。削除済み FE 0） |
| `serviceByFunctionEntry` | 削除済み FE 履歴コメント除去 |
| `public/css/common.css` | legacy `.pending-shifts-*` ルール削除 |
| logOps scripts | `unused_function_lib` exclude 除去（directory 削除済み） |
| Batch 9 | **CLOSED** |

---

## 14. Final Cleanup Batch（2026-09-04）— **CLOSED**

**本節は §2 / §4 の 54 件 inventory とは別枠。** resolved 数は変更しない。E1〜E4 は別途 deferred。リポジトリ全体の課題ゼロではない。

### 14.1 Phase 1〜6 実施結果

| Phase | 内容 | 状態 |
|-------|------|------|
| 1 | QA page 3 件 DELETE（`SystemSettingsPage` / `LogOpsErrorSamplePage` / `PostSettlementIdempotencyReplayPage`） | 完了 |
| 1/4 | `FirestoreSizePage` + `calculateFirestoreSize` **KEEP**（当時 Batch 8 判定 B「page 残置」から方針変更。KEEP は残置 QA ではなく保守ツール維持） | 完了 |
| 2 | demo Functions + `demo_data/` source DELETE | 完了（production undeploy 済） |
| 3 | errorShapeProbes 4 callable source DELETE。logOpsErrorShape unit test ADD | 完了（production undeploy 済） |
| 4 | SKIP | — |
| 5 | close public wrappers 4 件 source DELETE。internal `run*` KEEP。emulator close regression **44/44 PASS** | 完了（production undeploy 済） |
| 6 | unclocked list `_QueryTestMode` / testA/B/C residue DELETE。旧 testA query を正式実装。where / limit 200 / no orderBy / memory sort **unchanged** | 完了 |

`lib/to_be_deleted`: 既に 0。

### 14.2 Phase 7（本更新）

docs / `serviceByFunctionEntry` / logOps scripts / `_staticFcUnits.json` を Phase 1〜6 に同期。production Function 挙動は変更しない。`_staticFcUnits.json` は 354 → **350** units（`resetAllTables` / `resetAllSideGames` の stale 4 units 除去）。`migrateSettledBillsForBusinessDay` / `cleanupActiveStaysOnClose` は internal logOps 由来で残る（live）。

`migrateSettledBillsForBusinessDay` / `cleanupActiveStaysOnClose` は public export ではないが、internal が同一文字列で logOps するため mapping **KEEP**（論理処理識別子。export 名リネームはしない）。

### 14.3 Phase 8〜10

| Phase | 結果 |
|-------|------|
| 8 | final regression **PASS** |
| 9 | production undeploy **12 件完了**（197 → 185。unexpected deletion 0。`calculateFirestoreSize` KEEP） |
| 10 | narrow final audit **CLOSED** |

`calculateFirestoreSize` は undeploy **していない（KEEP）**。

Phase 9 削除 12 件:

1. `generateDummyData`
2. `seedAttendancesDemo`
3. `seedPayrollDemoData`
4. `deletePayrollDemoData`
5. `resetAllTables`
6. `resetAllSideGames`
7. `migrateSettledBillsForBusinessDay`
8. `cleanupActiveStaysOnClose`
9. `emitLogOpsErrorSamples`
10. `emitLogOpsErrorRealSdkSamples`
11. `emitThrowOnlyTc01NotFound`
12. `enqueueThrowOnlyTc06WeeklyPlannerTask`

KEEP（例）: `calculateFirestoreSize` / `openStoreTerminal` / `closeStoreTerminal` / `createInitialStateDocCallable` / `initializeStoreConfigCallable` / `generateRecurringTournaments` / `scheduled-job-generate-recurring-tournaments-by-scheduler` / `getUnsettledBillsForClose` / `applyCloseSnapshot` / `createPostSettlementAdjustment`

commit / push: **未実施**。undeploy: **完了**
