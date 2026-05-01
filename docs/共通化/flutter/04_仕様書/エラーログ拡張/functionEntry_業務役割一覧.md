# functionEntry 業務役割一覧

- **情報源**: `functions/src` の実コードを読み取り、各 `functionEntry` および `operation` の業務上の役割を要約。
- **機械抽出（参照用）**: 判定単位とソース行の対応は `functions/scripts/generated/重要度判定_Step2-1_269件_一次情報（ソース）.md`（コミット済みスナップショット）。※本表から除外した unused 相当分を除くと **269 件**（101+168）が実質スコープの目安。
- **対象**: `functions/src` の `logOpsError` における判定単位（Part 1: operation なし 101 件、Part 2: 76 種の `functionEntry`・168 行の `operation`）。主要業務・高頻度業務の 1/3/5 は運用上の目安。
- **生成日**: 2026-04-12
- **Part2 最終反映**: `Part2_推奨値_UI操作経路_分析.md` の推奨 主要／推奨 高頻度・補足（2026-04-13）
- **構成**:
  - Part 1 = operation を持たない functionEntry（101 件）— `functionEntry` のみで判定単位が決まるもの
  - Part 2 = operation を持つ functionEntry（76 種 → operation 168 行）— `functionEntry + operation` で判定単位が決まるもの
- **主処理/補助列**: 業務上の役割の説明に基づき、当該判定単位が **主処理**（その操作の主目的の成否に直結）か **補助処理**（主成功後の付随・記録・通知・同期・二次ログ・ベストエフォート・補償等）かを二分。優先ルール・迷う場合は「主目的未達か」で判断。迷う場合は備考に `要確認`。
- **FC静列**: 当該判定単位の `logOpsError` 呼び出しが、ソース上 **静的に** `errorSource === function_custom` と確定する場合に **✓**（同一判定単位に複数呼び出しがある場合も、269 件スコープでは **すべて** が静的確定のときのみ ✓。件数は **52 / 269**）。判定規則は `docs/共通化/flutter/04_仕様書/エラーログ拡張/実装ベース精査_function_custom_20260408.md` §1 および `functions/scripts/countStaticFunctionCustomLogOps.cjs`（`LIST=1` でソース行一覧）と同じ。実装側の解決は `functions/src/shared/logging/logOpsError.ts` の `resolveErrorSource`（`errorKey` 文字列リテラル / `errorSource: 'function_custom'` リテラル / `FunctionCustomError` の `instanceof` 分岐内呼び出し 等）。

---

# Part 1: operation なし functionEntry（101 件）

## attendance（18 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 1 | `checkExistingCorrectionRequest` | 指定日の勤怠修正申請の有無と可否を確認する | 1 | 1 | 主処理 |  |
| 2 | `clockIn` | 端末からスタッフの出勤を打刻する | 3 | 5 | 主処理 |  |
| 3 | `clockOut` | 端末からスタッフの退勤を打刻する | 3 | 5 | 主処理 |  |
| 4 | `createAttendance` | 管理者が指定日の勤怠（出退勤・休憩）を新規に登録する | 1 | 1 | 主処理 |  |
| 5 | `createAttendanceCorrectionRequest` | 出退勤の修正内容を申請として登録する | 1 | 1 | 主処理 |  |
| 6 | `createManualClockInRecord` | 手動打刻で出勤記録を作成する | 3 | 3 | 主処理 |  |
| 7 | `createPayrollNotification` | 給与計算に関する通知文面を端末通知として登録する | 3 | 1 | 主処理 |  |
| 8 | `endBreak` | 勤怠に紐づく休憩を終了する | 3 | 5 | 主処理 |  |
| 9 | `finalizePayrollRun` | 全スタッフ分の計算完了後に給与ランを集計し月次給与を更新する | 3 | 1 | 主処理 |  |
| 10 | `getAllStaffAttendance` | 給与計算期間に該当する全スタッフの勤怠を取得する | 3 | 1 | 主処理 |  |
| 11 | `getAttendanceCorrectionRequests` | 勤怠修正申請をステータス別に一覧取得する | 1 | 1 | 主処理 |  |
| 12 | `getPayrollData` | 指定した給与期間の月次給与データを取得する | 3 | 1 | 主処理 |  |
| 13 | `getStaffAttendance` | 指定スタッフの月単位の勤怠記録を取得する | 3 | 3 | 主処理 |  |
| 14 | `getStaffListForAttendance` | 打刻画面用に営業日・シフトに応じたスタッフ一覧を返す | 3 | 5 | 主処理 |  |
| 15 | `rejectAttendanceCorrectionRequest` | 勤怠修正申請を却下し理由を記録する | 1 | 1 | 主処理 |  |
| 16 | `startBreak` | 勤怠に紐づく休憩を開始する | 3 | 5 | 主処理 |  |
| 17 | `updateAttendance` | 管理者が勤怠の出退勤・休憩を編集する | 1 | 1 | 主処理 |  |
| 18 | `updateManualClockOutRecord` | 手動打刻で退勤時刻を登録する | 3 | 3 | 主処理 |  |

## bills（18 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 19 | `appendExtra` | 伝票に追加料金（extras）を登録する | 3 | 1 | 主処理 |  |
| 20 | `appendExtraCallable` | 権限のある端末から伝票へ追加料金を登録する | 3 | 1 | 主処理 |  |
| 21 | `appendSideGameChip` | 伝票にサイドゲームチップの購入・預入・引出を記録する | 3 | 3 | 主処理 |  |
| 22 | `billsEventsOnCreate` | 伝票イベント作成時に集計（postEvents・paymentsSummary等）へ反映する | 5 | 5 | 主処理 |  |
| 23 | `billsOnSettle` | 会計確定時にスナップショット作成・冪等掃除・売上連携を行う | 5 | 5 | 主処理 |  |
| 24 | `calcBusinessDate` | 店舗営業時間に基づき、基準時刻が属する営業日を判定する | 5 | 5 | 主処理 |  |
| 25 | `getOpenBills` | 当日営業日の未精算伝票から入店中ユーザー一覧を返す | 3 | 3 | 主処理 |  |
| 26 | `getRefundHistory` | 返金履歴を照会する（管理者向け）。実装は空配列スタブで、lib からの呼び出しなし | 1 | 1 | 主処理 |  |
| 27 | `migrateTodaysBillsAccountingFields` | 当日のtodaysBillsに会計履歴用フィールドを一括付与する（データ移管用。本番での常用は想定されない） | 1 | 1 | 主処理 |  |
| 28 | `postEventAdjustment` | 精算後の追加徴収・減額をイベントとして記録する（会計後調整（テスト）からの呼び出しのみ） | 1 | 1 | 主処理 |  |
| 29 | `postEventCancel` | 精算後の伝票取消をイベントとして記録する（会計後調整（テスト）からの呼び出しのみ） | 1 | 1 | 主処理 |  |
| 30 | `postEventRefund` | 返金をイベントとして記録し、返金状況の集計に反映する | 3 | 1 | 主処理 |  |
| 31 | `postEventReopen` | 精算済み伝票の再開をイベントとして記録する（会計後調整（テスト）からの呼び出しのみ） | 1 | 1 | 主処理 |  |
| 32 | `processRefund` | 返金を実行し、返金イベントを記録する | 5 | 1 | 主処理 |  |
| 33 | `recordTournamentAction` | 伝票にトーナメントの参加・リバイ・アドオンを記録する | 5 | 5 | 主処理 |  |
| 34 | `updateAccounting` | 精算後の金額調整・取消・再開をイベント経由で行う（会計後調整（テスト）からの呼び出しのみ） | 1 | 1 | 主処理 |  |
| 35 | `updateBill` | 伝票親ドキュメントの許容フィールドのみを更新する（テスト用。本番クライアントからは未使用の可能性） | 1 | 1 | 主処理 |  |
| 36 | `updatePlace` | 伝票の卓・席の所在を更新する ※会計後調整は本番運用する可能性あり | 3 | 5 | 主処理 |  |

## itemOrder（3 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 37 | `cancelOrder` | 注文を論理取消し、伝票明細のvoidと当日注文ログを更新する | 1 | 1 | 主処理 |  |
| 38 | `getUserOrderHistory` | LIFFユーザー向けに当日営業日の精算済み伝票単位の注文履歴を返す | 1 | 3 | 主処理 |  |
| 39 | `toggleSoldOutForMenuItem` | メニュー項目の売り切れフラグを切り替える | 1 | 1 | 主処理 |  |

## logs（10 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 40 | `getActionLogs` | トーナメント単位の操作履歴（operationLogs）を検索・返却する | 3 | 5 | 主処理 |  |
| 41 | `rollbackAction` | 操作ログに基づき、指定したトーナメント操作を種別ごとに巻き戻す | 3 | 3 | 主処理 |  |
| 42 | `undoAddon` | アドオン操作を取り消し、メインビューと伝票側の集計を戻す | 3 | 1 | 主処理 |  |
| 43 | `undoAssignSeatToPlayer` | 着席割当を取り消し、席と待機列・人数を戻す | 3 | 1 | 主処理 |  |
| 44 | `undoBulkAddon` | 一括アドオンの取り消しを行い、会計・ビューを整合させる | 3 | 1 | 主処理 |  |
| 45 | `undoBustAndExit` | バスト退席操作を取り消し、席と伝票の状態を戻す | 3 | 1 | 主処理 |  |
| 46 | `undoBustAndReentry` | リエントリー操作を取り消し、バスト前の参加状態に戻す | 3 | 1 | 主処理 |  |
| 47 | `undoRegisterForTournament` | LIFF参加登録を取り消し、待機・ユーザー一覧・伝票を戻す | 3 | 1 | 主処理 |  |
| 48 | `undoRegisterParticipants` | 参加者一括登録を取り消し、複数人分の状態を戻す | 3 | 1 | 主処理 |  |
| 49 | `undoReseatAllPlayers` | 全員リシート前の座席配置スナップショットに戻す | 3 | 1 | 主処理 |  |

## scheduler（1 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 50 | `schedulerSupervisor` | 日次cronでスケジューラ監督処理を走らせ各種ジョブの投入を制御する | 5 | 3 | 主処理 |  |

## sideGame（4 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 51 | `depositTip` | 顧客のサイドゲームチップを会計へ預け入れる | 3 | 5 | 主処理 |  |
| 52 | `leaveSeat` | サイドゲームの席から退席し座席情報を解放する（トーナメント退席エラー時のユーザー操作可否にも影響しうる） | 3 | 5 | 主処理 |  |
| 53 | `registerForSideGame` | サイドゲームの席に着席して参加登録する | 3 | 5 | 主処理 |  |
| 54 | `withdrawTip` | 顧客のサイドゲームチップを会計から引き出す | 3 | 5 | 主処理 |  |

## staff（7 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 55 | `confirmShiftRequest` | 管理者からの希望シフト要請をスタッフが確認済みにする | 3 | 1 | 主処理 |  |
| 56 | `createMultipleShifts` | スタッフが複数日分のシフトを一括で申請する | 3 | 1 | 主処理 |  |
| 57 | `createStaffAccount` | スタッフ本人がプロフィールを登録しログイン用QRを発行する | 3 | 1 | 主処理 |  |
| 58 | `scheduledCleanup` | 却下済みで古いシフト申請ドキュメントを削除する | 1 | 1 | 主処理 |  |
| 59 | `updateShiftRequest` | 提出期間内のシフト申請の勤務時間を修正する | 1 | 1 | 主処理 |  |
| 60 | `updateStaffBankInfo` | 管理者がスタッフの振込口座情報を更新する | 1 | 1 | 主処理 |  |
| 61 | `updateStaffHourlyWage` | 管理者がスタッフの時給を更新する | 1 | 1 | 主処理 |  |

## storeMeta（6 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 62 | `closeAssessmentTask` | スケジュールされた閉店認定を実行し閉店時間超過やブロッカーを記録する | 5 | 3 | 主処理 |  |
| 63 | `finalizeUnsettledBillAfterAccounting` | 未会計ラベル付き請求の会計後にcloseSnapshot解消とユーザー未会計件数を減らす | 3 | 1 | 補助 | ✓ |
| 64 | `openAssessmentTask` | スケジュールされた開店認定を実行し開店可否をstateに記録する | 5 | 3 | 主処理 |  |
| 65 | `resetAllSideGames` | 全サイドゲームを非アクティブ化し席・ゲーム名をクリアする（システム設定の手動メンテ失敗時のみこの functionEntry の logOpsError に載る想定） | 1 | 1 | 主処理 |  |
| 66 | `resetAllTables` | 全テーブルをopen状態に戻す（システム設定の手動メンテ失敗時のみこの functionEntry の logOpsError に載る想定） | 1 | 1 | 主処理 |  |
| 67 | `weeklyPlanner` | 週の起点日から7日分の開店・閉店認定用Cloud Tasksを投入する | 5 | 1 | 主処理 |  |

## tournament_activeTournament（7 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 68 | `endTournament` | トーナメントを終了し、卓の解放や操作ログ記録など終了処理を行う | 3 | 5 | 主処理 |  |
| 69 | `getAvailableTables` | 利用可能な卓（statusがopen）の一覧を返す | 3 | 5 | 主処理 |  |
| 70 | `getPrizeData` | トーナメント本体とmainビューから賞金・料金表示用データを取得する | 5 | 5 | 主処理 |  |
| 71 | `getTodayTournaments` | LIFF向けに本日開催のスケジュール済みトーナメント一覧を取得する | 3 | 5 | 主処理 |  |
| 72 | `getUpcomingTournaments` | LIFF向けに当日以降のスケジュール済みトーナメント一覧を取得する | 3 | 5 | 主処理 |  |
| 73 | `setPrizeData` | mainビューにプライズプール等を書き込み、賞金確定フラグを立てる | 5 | 5 | 主処理 |  |
| 74 | `validateEndTournament` | 終了前にステータス・プライズ・ランキングの前提を検証し可否を返す | 5 | 5 | 主処理 |  |

## tournament_createTournament（15 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 75 | `archiveBlindTemplate` | ブラインドテンプレートをアーカイブ（非表示）にする | 1 | 1 | 主処理 |  |
| 76 | `archiveTournamentTemplate` | トーナメントテンプレートをアーカイブする | 1 | 1 | 主処理 |  |
| 77 | `createBlindTemplate` | ブラインド構成（レベル・アンティ等）のテンプレートを新規作成する | 1 | 1 | 主処理 |  |
| 78 | `createScheduledTournamentFromRecurrence` | 1件の定期開催定義からスケジュール済みトーナメント文書を生成する | 5 | 3 | 主処理 |  |
| 79 | `createTournamentTemplate` | エントリー料・スタック・ブラインド紐付け等の大会テンプレートを作成する | 1 | 1 | 主処理 |  |
| 80 | `deleteTournamentRecurrence` | 定期開催を削除し、関連する未開催分をアーカイブする | 3 | 1 | 主処理 |  |
| 81 | `generateRecurringTournamentsByScheduler` | スケジューラが指定日付範囲で定期トーナメント自動生成コアを実行する | 5 | 1 | 主処理 |  |
| 82 | `getBlindTemplates` | アーカイブでないブラインドテンプレート一覧を取得する | 3 | 1 | 主処理 |  |
| 83 | `getScheduledTournaments` | 期間別にスケジュール済みトーナメント一覧を取得する（管理画面用） | 5 | 5 | 主処理 |  |
| 84 | `getScheduledTournamentsForEdit` | テンプレートまたは定期開催IDに紐づく編集対象トーナメント一覧を取得する | 3 | 1 | 主処理 |  |
| 85 | `getTournamentRecurrences` | 定期開催トーナメント設定の一覧を取得する | 3 | 1 | 主処理 |  |
| 86 | `getTournamentTemplates` | アーカイブでないトーナメントテンプレート一覧を取得する | 3 | 3 | 主処理 |  |
| 87 | `updateBlindTemplate` | 既存ブラインドテンプレートの内容を更新する | 1 | 1 | 主処理 |  |
| 88 | `updateTournamentRecurrence` | 定期開催ルールと、選択した将来枠のスケジュールをまとめて更新する | 3 | 1 | 主処理 |  |
| 89 | `updateTournamentTemplate` | テンプレート本体と、選択した将来トーナメントのスナップショットを更新する | 3 | 1 | 主処理 |  |

## user（9 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 90 | `createUserAccount` | プロフィールとPINを登録し、入店用QR等を発行する | 5 | 3 | 主処理 |  |
| 91 | `deleteOldQRCodeFiles` | 新しいQR保存前に同一ユーザーの古いQR画像をStorageから削除する | 3 | 5 | 補助 |  |
| 92 | `getFirebaseCustomToken` | LIFFのLINE IDトークンを検証しFirebaseカスタムトークンを返す | 5 | 5 | 主処理 | ✓ |
| 93 | `getUserStatus` | ユーザー基本情報とactiveStays由来の入店中かどうかを返す | 3 | 5 | 主処理 | ✓ |
| 94 | `manualCheckIn` | 店舗端末でログインIDとPINから本人確認し入店・伝票作成を行う | 5 | 3 | 主処理 | ✓ |
| 95 | `processVisitByQR` | スキャンしたQRを検証し、入店処理と伝票・滞在状態を更新する | 5 | 5 | 主処理 | ✓ |
| 96 | `saveQRCodeToStorage` | 生成したQR画像をFirebase Storageに保存しURLを返す | 3 | 5 | 主処理 |  |
| 97 | `verifyLineIdToken` | LINE LoginのJWTを解釈し、LINEユーザー情報を取り出す | 5 | 5 | 主処理 |  |
| 98 | `verifyQRCode` | 店舗端末がQRの有効性とユーザー情報を確認する | 5 | 5 | 主処理 | ✓ |

## webhook（2 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 99 | `ensureStaffRichMenu` | スタッフ兼ユーザー向けにLIFF起動時スタッフ用リッチメニューを紐づける | 3 | 5 | 主処理 |  |
| 100 | `formatDateToJapanese` | YYYY-MM-DDを「○月○日」形式の表示用文字列に変換する | 1 | 1 | 主処理 | 要確認 |

## shared（1 件）

| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |
|---|---------------|-------------|----------|-----------|-------------|-----------|
| 101 | `registerDevice` | 認証済み端末をdevicesに登録または冪等更新する | 3 | 1 | 主処理 |  |

---
# Part 2: operation あり functionEntry（76 種 → operation 168 行）

`functionEntry` 内で `operation` が設定されている `logOpsError` 呼び出しの業務要約。`functionEntry + operation` で判定単位が決まるもの。

## analytics — `migrateSettledBillsForBusinessDay`（営業日の精算済み伝票をアナリティクス用に移行）

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 1 | `migrateSettledBillsForBusinessDay` | `callable` | Callable全体が失敗した際のログ記録 | 1 | 1 | 主処理 |  | Callable 全体の外側 catch。保守目的のため優先度低 |
| 2 | `migrateSettledBillsForBusinessDay` | `runMigratePerBill` | 請求1件ごとの分析移管が失敗した際のログ記録 | 3 | 3 | 主処理 |  | 1 件ごとの移管失敗。ループ内でスキップして継続 |

## attendance

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 3 | `approveAttendanceCorrectionRequest` | `attendanceRecordUpdate` | 承認後の勤怠記録更新・ログ書き込みが失敗した際のログ（承認自体は成功扱い） | 1 | 1 | 補助 |  | Part 1 の勤怠修正系（申請・一覧・却下等）と同様に主要 1。承認後の勤怠レコード更新失敗（承認ステータスは成功済みの経路あり） |
| 4 | `approveAttendanceCorrectionRequest` | `approveRequestOuterCatch` | 勤怠修正申請の承認処理全体が失敗した際のログ記録 | 1 | 1 | 主処理 |  | 同上。承認処理全体の外側 catch |
| 5 | `executeMonthlyPayroll` | `loadPayrollConfig` | 月次給与実行で給与設定の取得に失敗した際のログ | 3 | 1 | 主処理 |  | 給与設定の Firestore 読み取り失敗。実行不可 |
| 6 | `executeMonthlyPayroll` | `taskDispatch` | スタッフ別Cloud Tasks投入やrun状態更新などタスク配備に失敗した際のログ | 3 | 1 | 主処理 |  | スタッフ別 Cloud Tasks 投入の失敗。給与計算が開始されない |
| 7 | `getPayrollCandidates` | `loadPayrollConfig` | 給与候補者一覧取得時に給与設定の取得に失敗した際のログ | 3 | 1 | 主処理 |  | 給与設定の読み取り失敗。候補者一覧を表示できない |
| 8 | `payrollNotificationScheduler` | `enqueue` | 給与通知用Cloud Tasksの投入・スケジュール設定に失敗した際のログ | 3 | 1 | 主処理 |  | 通知タスクのエンキュー失敗。給与通知が届かない |
| 9 | `processStaffPayroll` | `runNotFound` | 指定の給与実行（payrollRuns）ドキュメントが存在しない場合のログ | 3 | 1 | 主処理 |  | payrollRuns ドキュメントが欠損。計算不可（データ不整合） |
| 10 | `processStaffPayroll` | `staffResultNotFound` | スタッフ別処理結果（staffResults）ドキュメントが存在しない場合のログ | 3 | 1 | 主処理 |  | staffResults ドキュメントが欠損。同上 |
| 11 | `processStaffPayroll` | `processStaffPayrollCatch` | スタッフ単位の給与計算・更新処理が例外で失敗した際のログ | 3 | 1 | 主処理 |  | 給与計算本体の失敗。対象スタッフの給与が未計算になる |
| 12 | `processStaffPayroll` | `failureStatusUpdate` | 給与処理失敗後のスタッフ結果・集計更新トランザクションが失敗した際のログ | 1 | 1 | 補助 |  | 計算失敗後の状態更新も失敗（二重障害）。集計が不正確になりうる |

## bills

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 13 | `appendItem` | `appendItemCatch` | 請求への明細追加が失敗した際のログ | 3 | 5 | 主処理 |  | LIFF 経由の明細追加の外側 catch |
| 14 | `appendItem` | `appendItemWithOrderProjection` | 注文投影付き明細追加が失敗した際のログ | 3 | 5 | 主処理 |  | 端末経由の注文投影付き明細追加の外側 catch |
| 15 | `cancelAccounting` | `cancelAccountingCatch` | 会計開始取り消しで業務例外（FunctionCustomError）が発生した際のログ | 3 | 3 | 主処理 | ✓ | FunctionCustomError（業務ルール違反・状態不一致）。会計状態が中途半端になりうる |
| 16 | `cancelAccounting` | `cancelAccountingGenericCatch` | 会計開始取り消しで想定外エラーが発生した際のログ | 3 | 3 | 主処理 |  | 想定外エラー |
| 17 | `completeAccounting` | `completeAccountingCatch` | 会計完了（レガシー）で業務例外が発生した際のログ | 1 | 1 | ✓ | 会計完了の FunctionCustomError。精算が止まるためコア業務影響大 （現在使用されていない）|
| 18 | `completeAccounting` | `completeAccountingGenericCatch` | 会計完了（レガシー）で想定外エラーが発生した際のログ | 1 | 1 | 主処理 |  | 想定外エラー（現在使用されていない） |
| 19 | `completeAccountingV2` | `completeAccountingV2Catch` | 会計完了（V2）で業務例外が発生した際のログ | 5 | 5 | 主処理 | ✓ | 同上。V2 ルートの FunctionCustomError |
| 20 | `completeAccountingV2` | `completeAccountingV2GenericCatch` | 会計完了（V2）で想定外エラーが発生した際のログ | 5 | 5 | 主処理 |  | V2 ルートの想定外エラー |
| 21 | `createBillWithActiveStay` | `operationForCreateBillKey(error.errorKey)` | 滞在連動付き請求作成で業務キー付きエラーが発生した際の種別付きログ | 5 | 5 | 主処理 | ✓ | 業務キー別の FunctionCustomError（重複入店・冪等性違反等）。入店が止まる |
| 22 | `createBillWithActiveStay` | `runCreateBillTransaction` | 請求作成トランザクションが業務例外以外で失敗した際のログ | 5 | 5 | 主処理 |  | Firestore トランザクション失敗 |
| 23 | `getBillPreviewTotals` | `previewTotalsCatch` | 請求のプレビュー合計・内訳取得が失敗した際のログ | 3 | 5 | 主処理 |  | プレビュー表示失敗。会計自体は別操作なので直接影響は低いがスタッフの業務が止まる |
| 24 | `startAccounting` | `operationForStartAccountingKey(error.errorKey)` | 会計開始リポジトリで業務キー付きエラーが発生した際の種別付きログ | 5 | 5 | 主処理 | ✓ | リポジトリ内の業務キー別 FunctionCustomError（既に会計中・冪等性違反等） |
| 25 | `startAccounting` | `startAccountingCallableCatch` | 会計開始Callableで検証・HttpsError以外の想定外失敗が発生した際のログ | 5 | 5 | 主処理 |  | Callable 側の想定外エラー |
| 26 | `startAccounting` | `startAccountingRepoCatch` | 会計開始リポジトリ処理が業務例外以外で失敗した際のログ | 5 | 5 | 主処理 |  | リポジトリ側の非 FunctionCustomError |
| 27 | `updateActiveBill` | `updateActiveBillCatch` | 請求書内容修正で業務例外が発生した際のログ | 3 | 1 | 主処理 | ✓ | FunctionCustomError |
| 28 | `updateActiveBill` | `updateActiveBillGenericCatch` | 請求書内容修正で想定外エラーが発生した際のログ | 3 | 1 | 主処理 |  | 想定外エラー |
| 29 | `verifyPaymentSplit` | `verifyPaymentSplitCatch` | 支払い分割照合で業務例外が発生した際のログ | 5 | 5 | 主処理 | ✓ | 分割照合の業務例外。会計確定に影響 |
| 30 | `verifyPaymentSplit` | `verifyPaymentSplitGenericCatch` | 支払い分割照合で想定外エラーが発生した際のログ | 5 | 5 | 主処理 |  | 想定外エラー |

## itemOrder

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 31 | `createMenuItem` | `imageUpload` | メニュー画像のStorage保存・公開設定に失敗した際のログ | 1 | 1 | 主処理 |  | 画像の Storage 保存失敗。メニュー作成は止まるが日常業務ではない |
| 32 | `createMenuItem` | `menuCreateCatch` | メニュー新規作成処理全体が失敗した際のログ | 1 | 1 | 主処理 |  | メニュー作成全体の失敗 |
| 33 | `getMenuItems` | `adminMenuDocMissing` | 集約メニュー（administrativeMenu/current）が存在せず一覧を返せない場合のログ | 3 | 1 | 主処理 |  | 集約メニュードキュメント未作成。初期設定の問題。一度発生すると全注文に影響 |
| 34 | `getMenuItems` | `menuFetchCatch` | メニュー一覧取得処理で例外が発生した際のログ | 3 | 5 | 主処理 |  | メニュー取得の例外。注文画面が開けない |
| 35 | `placeOrder` | `chipPurchaseLog` | チップ購入のsideGameChipLogsへの記録に失敗した際のログ（注文処理は継続） | 1 | 3 | 補助 |  | チップ購入ログ書き込み失敗（注文自体は成功して継続）。ベストエフォート |
| 36 | `placeOrder` | `placeOrderCatch` | 注文登録で業務例外が発生した際のログ | 3 | 5 | 主処理 | ✓ | FunctionCustomError。注文が通らない |
| 37 | `placeOrder` | `placeOrderGenericCatch` | 注文登録で想定外エラーが発生した際のログ | 3 | 5 | 主処理 |  | 想定外エラー |
| 38 | `placeOrderByUser` | `placeOrderCatch` | ユーザー経由注文で業務例外が発生した際のログ | 3 | 5 | 主処理 | ✓ | FunctionCustomError |
| 39 | `placeOrderByUser` | `placeOrderGenericCatch` | ユーザー経由注文で想定外エラーが発生した際のログ | 3 | 5 | 主処理 |  | 想定外エラー |
| 40 | `updateMenuItem` | `imageUpload` | メニュー更新時の画像アップロード・公開に失敗した際のログ | 1 | 1 | 主処理 |  | 画像更新の Storage 保存失敗 |
| 41 | `updateMenuItem` | `menuUpdateCatch` | メニュー更新処理全体が失敗した際のログ | 1 | 1 | 主処理 |  | メニュー更新全体の失敗 |

## scheduler

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考（Part2） |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 42 | `enqueueTournamentTasksByScheduler` | `runEnqueueSchedulerTask` | スケジューラ起動のトーナメントタスク投入処理が失敗した際のログ | 5 | 3 | 主処理 |  | トーナメントタスク投入の失敗。スケジュール済みトーナメントの開催・登録締切が機能しなくなる |
| 43 | `enqueueTournamentTasksByScheduler` | `cloudTasksCreateTask` | トーナメント再計画の遅延実行用Cloud Taskエンキューに失敗した際のログ | 5 | 1 | 主処理 | ✓ | 再計画用 Cloud Task のエンキュー失敗。通常は日次だが再計画は随時 |
| 44 | `executeScheduledJobTask` | `runScheduledJob` | Cloud Task経由の定期実行ジョブ本体が失敗した際のログ | 5 | 5 | 主処理 |  | ジョブ本体の失敗。トーナメント自動制御が止まる |
| 45 | `executeScheduledJobTask` | `markReplanCompletedBestEffort` | 再計画ジョブ成功後の完了状態更新がベストエフォートで失敗した際のログ | 1 | 1 | 補助 | ✓ | 成功後の完了マーク更新失敗（ベストエフォート） |
| 46 | `executeScheduledJobTask` | `releaseReplanProcessingBestEffort` | 再計画ジョブ失敗後の処理中フラグ解除がベストエフォートで失敗した際のログ | 1 | 1 | 補助 | ✓ | 失敗後の処理中フラグ解除失敗（ベストエフォート） |
| 47 | `writeSchedulerDispatchLogBestEffort` | `dispatchLogWrite` | スケジューラのディスパッチログをFirestoreに書き込めなかった際のログ | 1 | 3 | 補助 |  | 監査ログの書き込み失敗。業務に直接影響なし |
| 48 | `writeSchedulerExecutionLogByCloudTaskBestEffort` | `executionLogWrite` | Cloud Task実行結果のスケジューラ実行ログをFirestoreに書き込めなかった際のログ | 1 | 3 | 補助 |  | 実行結果ログの書き込み失敗。業務に直接影響なし |

## shift

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 49 | `finalizeMonth` | `finalizeDayLoop` | 月次シフト確定の日次ループで特定日の確定処理が失敗した際のログ | 5 | 1 | 主処理 |  | 日次ループ内の特定日が失敗。他の日は継続。ただし確定漏れが発生 |
| 50 | `getRequiredStaffByTimeSlot` | `config_read` | 時間帯別必要人数設定の読み取りがリトライ後も失敗しデフォルトへフォールバックする際のログ | 3 | 1 | 主処理 |  | リトライ後も読み取れないときのみ `logOpsError`。フォールバック後は業務は継続するが必要人数はデフォルトになりうる。 |

## staff

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 51 | `getShifts` | `initCatch` | リクエスト検証・Firestore接続テスト等の初期段階で失敗した際のログ | 3 | 1 | 主処理 |  | リクエスト検証・接続テスト等の初期段階失敗。設定やインフラの問題 （ミニアプリの一部で使用されているが、今後使用されなくなる可能性が大いにあり。oneNoteのメモ参照） |
| 52 | `getShifts` | `shiftFetchCatch` | シフト一覧取得の本体処理で例外が発生した際のログ | 3 | 3 | 主処理 |  | シフト取得本体の失敗。シフト画面が表示できない （ミニアプリの一部で使用されているが、今後使用されなくなる可能性が大いにあり。oneNoteのメモ参照） |
| 53 | `getShifts` | `detailErrorLog` | シフト取得失敗時にError型として詳細メッセージを付けて再ログする処理 | 1 | 3 | 補助 |  | #52 と同じエラーの詳細ログ再出力（Error 型の場合）。補助ログ （ミニアプリの一部で使用されているが、今後使用されなくなる可能性が大いにあり。oneNoteのメモ参照） |
| 54 | `getShifts` | `unknownErrorLog` | シフト取得失敗時にError以外の値が投げられた場合のログ | 1 | 1 | 補助 |  | #52 と同じエラーの再出力（非 Error 型の場合）。極めて稀 （ミニアプリの一部で使用されているが、今後使用されなくなる可能性が大いにあり。oneNoteのメモ参照） |

## storeMeta

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 55 | `applyCloseSnapshot` | `applyBillCloseSnapshotTxn` | 閉店スナップショット適用時に会計ドキュメントへのトランザクション更新が失敗した際のログ | 5 | 3 | 主処理 | ✓ | 会計ドキュメントのトランザクション更新失敗。未会計マークが一部適用されない |
| 56 | `applyCloseSnapshot` | `incrementUserUnsettledBillsCount` | 未会計マーク後にユーザーの未会計件数カウンタを増やす更新が失敗した際のログ | 3 | 3 | 補助 | ✓ | ユーザー未会計件数カウンタの増加失敗。カウントが不正確になるがメイン処理は成功 |
| 57 | `applyCloseSnapshot` | `getClosedBusinessDate` | 閉店スナップショット実行前の営業日取得で業務エラーが発生した際のログ | 5 | 3 | 主処理 | ✓ | 営業日取得の業務エラー。スナップショット処理自体が開始できない |
| 58 | `cleanupActiveStaysOnClose` | `deleteActiveStayDocument` | 閉店クリーンアップで個別のactiveStayドキュメント削除に失敗した際のログ | 3 | 3 | 主処理 | ✓ | 個別の activeStay 削除失敗。他は継続。翌日に残留データが残る |
| 59 | `cleanupActiveStaysOnClose` | `cleanupOuterCatch` | 閉店時のactiveStays一括クリーンアップ処理全体が例外で失敗した際のログ | 3 | 3 | 主処理 |  | クリーンアップ全体の例外 |
| 60 | `closeStoreTerminal` | `closeTerminalPreflight` | 閉店前チェック（営業中・営業日キー設定など）で業務エラーが発生した際のログ | 5 | 3 | 主処理 | ✓ | 事前チェック失敗（営業中でない・営業日キー未設定等）。閉店処理開始できず |
| 61 | `closeStoreTerminal` | `acquireProcessingLease` | 端末閉店フローで排他制御用のprocessingリース取得に失敗した際のログ | 5 | 3 | 主処理 | ✓ | 排他制御リース取得失敗。別の閉店処理と競合、またはリース未解放 |
| 62 | `closeStoreTerminal` | `finalizeCloseStateDoc.enqueueOpenAssessmentRecheck` | 閉店確定後に開店評価の再チェック用Cloud Task投入に失敗した際のログ | 3 | 3 | 補助 | ✓ | 閉店成功後の開店評価再チェック Cloud Task 投入失敗。閉店自体は成功済み |
| 63 | `closeStoreTerminal` | `runCloseStep.${stepName}` | 端末閉店パイプラインのいずれかのステップ処理が失敗した際のログ | 5 | 3 | 主処理 | ✓ | パイプライン各ステップ（UNSETTLED_MARK / resetSideGames / resetTables / cleanupActiveStays / migrateMissedSettlements / finalizeCloseStateDoc）の失敗。閉店処理が中断 |
| 64 | `closeStoreTerminal` | `rollbackUnsettledMark` | 閉店ステップ失敗時に未会計マーク取り消し（巻き戻し）が失敗した際のログ | 3 | 1 | 補助 | ✓ | UNSETTLED_MARK ステップ失敗後のロールバックも失敗。データ不整合が残る。二重障害のため稀 |
| 65 | `continueBusinessTerminal` | `cloudTasksCreateTask` | 営業継続に伴う閉店確認リマインドをCloud Tasksで予約する処理が失敗した際のログ | 3 | 1 | 補助 |  | 閉店リマインド Cloud Task 予約失敗。営業継続自体は成功するがリマインドが届かない |
| 66 | `continueBusinessTerminal` | `continueBusinessTerminalFunctionCustom` | 営業継続処理で業務ロジック上のFunctionCustomErrorが発生した際のログ | 3 | 1 | 主処理 | ✓ | FunctionCustomError（状態不正等） |
| 67 | `createInitialStateDoc` | `createDocMainCatch` | 初期化スクリプトでstoreMeta/currentBusinessDayの初回作成に失敗した際のログ | 1 | 1 | 主処理 |  | 初回作成の失敗。再実行で対処可能 |
| 68 | `createInitialStateDoc` | `scriptTopLevelCatch` | 初期化スクリプトの最外周で未処理例外が発生した際のログ | 1 | 1 | 主処理 |  | スクリプト最外周の未処理例外 |
| 69 | `createInitialStateDocCallable` | `createInitialStateDoc` | Callable経由で店舗状態の初期ドキュメント作成に失敗した際のログ | 1 | 1 | 主処理 |  | 初回作成の失敗 |
| 70 | `getCloseIntegrityData` | `closeIntegrityAggregate` | 閉店前確認用に未会計・未退勤・未終了トーナメントをまとめて取得する処理が失敗した際のログ | 5 | 3 | 主処理 |  | 未会計・未退勤・未終了トーナメントの集約取得失敗。閉店前確認ができず閉店判断に影響 |
| 71 | `getCurrentBusinessDateKeyOrThrow` | `loadFirestoreStateDoc` | Firestoreから店舗状態を読み現行営業日キーを解決する読み取りが失敗した際のログ | 5 | 5 | 主処理 |  | Firestore 状態ドキュメントの読み取り失敗。これが壊れるとほぼ全ての操作が止まる（custom対象？） |
| 72 | `getUnclockedStaffForClose` | `unclockedStaffQuery` | 閉店前の未退勤スタッフ一覧を取得するクエリが失敗した際のログ | 3 | 3 | 主処理 |  | 未退勤スタッフの一覧取得失敗。閉店前確認が不完全になる |
| 73 | `getUnclosedTournamentsForClose` | `unclosedTournamentsQuery` | 閉店前の未クローズトーナメント一覧を取得するクエリが失敗した際のログ | 3 | 3 | 主処理 |  | 未終了トーナメント一覧取得失敗 |
| 74 | `getUnsettledBillsForClose` | `unsettledBillsQuery` | 閉店前の未会計伝票一覧を取得するクエリが失敗した際のログ（システム設定の手動メンテ時の失敗時のみこの functionEntry の logOpsError に載る想定。閉店フロー本体は別経路） | 1 | 1 | 主処理 |  | ※既に Part 2 に値あり。手動メンテ経路のみ |
| 75 | `initializeStoreConfigCallable` | `initStoreMetaConfig` | storeMeta設定の初期作成・不足フィールド補完に失敗した際のログ | 1 | 1 | 主処理 |  | storeMeta 設定の初期作成失敗。再実行で対処可能 |
| 76 | `openStoreTerminal` | `openTerminalPreflight` | 開店前チェック（状態ドキュメント存在・closed/error等）で業務エラーが発生した際のログ | 5 | 3 | 主処理 | ✓ | 事前チェック失敗（状態ドキュメント欠損・ステータス不正等） |
| 77 | `openStoreTerminal` | `acquireProcessingLease` | 端末開店フローで排他制御用のprocessingリース取得に失敗した際のログ | 5 | 3 | 主処理 | ✓ | 排他制御リース取得失敗 |
| 78 | `openStoreTerminal` | `runOpenStep.${stepName}` | 端末開店パイプラインのいずれかのステップ処理が失敗した際のログ | 5 | 3 | 主処理 | ✓ | パイプラインステップ（verifyPreconditions / forceCleanup / finalizeOpenStateDoc）の失敗 |
| 79 | `temporaryUnlockAlreadyRunningDifferentDateTerminal` | `cloudTasksCreateTask` | 緊急一時解除後の開店評価再評価をCloud Tasksで予約する処理が失敗した際のログ | 3 | 1 | 補助 |  | 再評価 Cloud Task 予約失敗。一時解除自体は成功するが再評価が行われない |
| 80 | `updateUnclockedAttendanceWithAuth` | `passwordClockOutUpdate` | パスワード認証に基づく退勤記録のFirestore更新が失敗した際のログ | 3 | 1 | 主処理 |  | Firestore 更新失敗。退勤記録が残らず閉店ブロッカーになりうる |

## tournament_activeTournament

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 81 | `addTableToTournament` | `addTableToTournamentCatch` | 卓追加で業務例外（FunctionCustomError）が発生した際のログ | 3 | 5 | 主処理 | ✓ | FunctionCustomError（卓が存在しない、open でない等） |
| 82 | `addTableToTournament` | `addTableToTournamentGenericCatch` | 卓追加で想定外エラーが発生した際のログ | 3 | 5 | 主処理 |  | 想定外エラー |
| 83 | `addon` | `recordTournamentActionBestEffort` | アドオン成功後のトーナメントアクション記録が失敗した際のベストエフォートログ | 1 | 5 | 補助 |  | アドオン成功後のアクション記録失敗。メイン処理は成功済み |
| 84 | `addon` | `addonMainCatch` | アドオン購入処理で例外が発生した際のログ | 5 | 5 | 主処理 |  | アドオン処理全体の失敗。プレイヤーがアドオンできない |
| 85 | `addon` | `addonOperationLogWrite` | アドオン失敗時に失敗操作ログ書き込みが失敗した際の二次ログ | 1 | 1 | 補助 |  | メイン失敗後の操作ログ書き込みも失敗（二重障害） |
| 86 | `assignSeatToPlayer` | `updatePlaceBestEffort` | 着席成功後の会計プレイス更新が失敗した際のベストエフォートログ | 1 | 5 | 補助 |  | 着席成功後の伝票プレイス更新失敗。メイン処理は成功済み |
| 87 | `assignSeatToPlayer` | `assignSeatToPlayerCatch` | 待機者着席で業務例外が発生した際のログ | 5 | 5 | 主処理 | ✓ | FunctionCustomError（席が埋まっている等） |
| 88 | `assignSeatToPlayer` | `assignSeatGenericCatch` | 待機者着席で想定外エラーが発生した際のログ | 5 | 5 | 主処理 |  | 想定外エラー |
| 89 | `assignSeatToPlayer` | `assignSeatOperationLogWrite` | 着席失敗時に失敗操作ログ書き込みが失敗した際の二次ログ | 1 | 1 | 補助 |  | 二重障害 |
| 90 | `bulkAddon` | `recordActionPerUserBestEffort` | 一括アドオン後のユーザー単位アクション記録が失敗した際のベストエフォートログ | 1 | 3 | 補助 |  | 一括成功後のユーザー単位アクション記録失敗 |
| 91 | `bulkAddon` | `bulkAddonMainCatch` | 一括アドオン処理で例外が発生した際のログ | 5 | 3 | 主処理 |  | 一括アドオン全体の失敗 |
| 92 | `bulkAddon` | `bulkAddonOperationLogWrite` | 一括アドオン失敗時に失敗操作ログ書き込みが失敗した際の二次ログ | 1 | 1 | 補助 |  | 二重障害 |
| 93 | `bustAndExit` | `updatePlaceBestEffort` | バスト後の会計プレイス更新が失敗した際のベストエフォートログ | 1 | 5 | 補助 |  | バスト成功後の伝票プレイス更新失敗 |
| 94 | `bustAndExit` | `bustAndExitMainCatch` | バスト＆退席処理で例外が発生した際のログ | 5 | 5 | 主処理 |  | バスト退席全体の失敗 |
| 95 | `bustAndExit` | `bustAndExitOperationLogWrite` | バスト＆退席失敗時に失敗操作ログ書き込みが失敗した際の二次ログ | 1 | 1 | 補助 |  | 二重障害 |
| 96 | `bustAndReentry` | `recordTournamentActionBestEffort` | リエントリー後のトーナメントアクション記録が失敗した際のベストエフォートログ | 1 | 5 | 補助 |  | リエントリー成功後のアクション記録失敗 |
| 97 | `bustAndReentry` | `bustAndReentryMainCatch` | バスト＆リエントリー処理で例外が発生した際のログ | 5 | 5 | 主処理 |  | リエントリー全体の失敗 |
| 98 | `bustAndReentry` | `bustAndReentryOperationLogWrite` | バスト＆リエントリー失敗時に失敗操作ログ書き込みが失敗した際の二次ログ | 1 | 1 | 補助 |  | 二重障害 |
| 99 | `createTemporaryTable` | `createTemporaryTableCatch` | 一時テーブル作成で業務例外が発生した際のログ | 1 | 1 | 主処理 | ✓ | FunctionCustomError（テーブル名重複等） |
| 100 | `createTemporaryTable` | `createTemporaryTableGenericCatch` | 一時テーブル作成で想定外エラーが発生した際のログ | 1 | 1 | 主処理 |  | 想定外エラー |
| 101 | `getRankingData` | `getRankingDataCatch` | ランキングデータ取得で業務例外が発生した際のログ | 5 | 5 | 主処理 | ✓ | FunctionCustomError（プライズ未確定等）。ランキング画面が開けない |
| 102 | `getRankingData` | `getRankingDataGenericCatch` | ランキングデータ取得で想定外エラーが発生した際のログ | 5 | 5 | 主処理 |  | 想定外エラー |
| 103 | `pauseTournament` | `pauseTournamentCatch` | トーナメント一時停止で業務例外が発生した際のログ | 5 | 3 | 主処理 | ✓ | FunctionCustomError（既に停止中等） （AdminControlsから呼ばれているがAdminControlsは現在使用していない。主要は3にする可能性あり） |
| 104 | `pauseTournament` | `pauseTournamentGenericCatch` | トーナメント一時停止で想定外エラーが発生した際のログ | 5 | 3 | 主処理 |  | 想定外エラー （AdminControlsから呼ばれているがAdminControlsは現在使用していない。主要は3にする可能性あり） |
| 105 | `registerForTournament` | `recordTournamentAction` | 参加登録成功後のトーナメントアクション記録が失敗した際のベストエフォートログ | 1 | 5 | 補助 |  | 参加成功後のアクション記録失敗（ベストエフォート） |
| 106 | `registerForTournament` | `registerTournamentFlow` | LIFF参加登録フロー全体で例外が発生した際のログ | 5 | 5 | 主処理 |  | 参加フロー全体の失敗。顧客がトーナメントに参加できない |
| 107 | `registerForTournament` | `recordFailureOperationLog` | 参加登録失敗時に失敗操作ログ書き込みが失敗した際の二次ログ | 1 | 1 | 補助 |  | 二重障害 |
| 108 | `registerParticipants` | `recordActionPerUserBestEffort` | 一括登録でユーザー単位のアクション記録が失敗した際のベストエフォートログ | 1 | 5 | 補助 |  | 登録成功後のユーザー単位アクション記録失敗 |
| 109 | `registerParticipants` | `registerUserFailed` | 一括登録ループ内で特定ユーザーの登録処理が失敗した際のログ | 5 | 5 | 主処理 |  | ループ内で特定ユーザーの登録失敗。他のユーザーは継続 |
| 110 | `registerParticipants` | `registerParticipantsMainCatch` | 参加者一括登録の外側処理で例外が発生した際のログ | 5 | 5 | 主処理 |  | 一括登録全体の失敗 |
| 111 | `registerParticipants` | `registerParticipantsOperationLogWrite` | 一括登録失敗時に失敗操作ログ書き込みが失敗した際の二次ログ | 1 | 1 | 補助 |  | 二重障害 |
| 112 | `removeTableFromTournament` | `removeTableFromTournamentCatch` | 卓削除で業務例外が発生した際のログ | 3 | 3 | 主処理 | ✓ | FunctionCustomError |
| 113 | `removeTableFromTournament` | `removeTableFromTournamentGenericCatch` | 卓削除で想定外エラーが発生した際のログ | 3 | 3 | 主処理 |  | 想定外エラー |
| 114 | `reseatAllPlayers` | `updatePlacePerAssignmentBestEffort` | 全員リシート後の席割当ごとの会計プレイス更新が失敗した際のベストエフォートログ | 1 | 3 | 補助 |  | リシート成功後の伝票プレイス更新失敗 |
| 115 | `reseatAllPlayers` | `reseatAllPlayersCatch` | 全員着席替えで業務例外が発生した際のログ | 5 | 3 | 主処理 | ✓ | FunctionCustomError |
| 116 | `reseatAllPlayers` | `reseatAllPlayersGenericCatch` | 全員着席替えで想定外エラーが発生した際のログ | 5 | 3 | 主処理 |  | 想定外エラー |
| 117 | `reseatAllPlayers` | `reseatAllPlayersOperationLogWrite` | 全員着席替え失敗時に失敗操作ログ書き込みが失敗した際の二次ログ | 1 | 1 | 補助 |  | 二重障害 |
| 118 | `resumeTournament` | `resumeTournamentCatch` | トーナメント再開で業務例外が発生した際のログ | 5 | 3 | 主処理 | ✓ | FunctionCustomError（停止中でない等） （AdminControlsから呼ばれているがAdminControlsは現在使用していない。主要は3にする可能性あり） |
| 119 | `resumeTournament` | `resumeTournamentGenericCatch` | トーナメント再開で想定外エラーが発生した際のログ | 5 | 3 | 主処理 |  | 想定外エラー （AdminControlsから呼ばれているがAdminControlsは現在使用していない。主要は3にする可能性あり） |
| 120 | `setRankingData` | `setRankingDataRankings` | ランキング保存・付与・操作ログ作成を含むsetRankingData全体で例外が発生した際のログ | 5 | 5 | 主処理 |  | ランキング保存・操作ログ含む全体の失敗。順位が確定できない |
| 121 | `setRankingData` | `setRankingDataPrizeGrant` | ランキングに基づくプライズ付与（ポイントログ付与トランザクション）が失敗した際のログ | 5 | 5 | 主処理 |  | プライズ付与トランザクション失敗。賞金が配布されない |

## tournament_createTournament

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 122 | `createScheduledTournament` | `enqueueAfterCreate` | 作成直後のCloud Tasks同期（runEnqueueTournamentTasks）呼び出しが失敗した際のログ | 3 | 1 | 補助 |  | 作成成功後の Cloud Tasks 同期失敗（ベストエフォート的）。トーナメント自体は作成済み |
| 123 | `createScheduledTournament` | `createScheduledTournamentCatch` | スケジュール済みトーナメント作成で業務例外が発生した際のログ | 3 | 1 | 主処理 | ✓ | FunctionCustomError |
| 124 | `createScheduledTournament` | `createScheduledTournamentGenericCatch` | スケジュール済みトーナメント作成で想定外エラーが発生した際のログ | 3 | 1 | 主処理 |  | 想定外エラー |
| 125 | `createTournamentRecurrence` | `enqueueAfterCreate` | 定期開催保存・先行生成完了後のrunEnqueueTournamentTasks呼び出しが失敗した際のログ | 3 | 1 | 補助 |  | 先行生成後の Cloud Tasks 同期失敗 |
| 126 | `createTournamentRecurrence` | `createTournamentRecurrenceCatch` | 定期開催作成で業務例外が発生した際のログ | 3 | 1 | 主処理 | ✓ | FunctionCustomError |
| 127 | `createTournamentRecurrence` | `createTournamentRecurrenceGenericCatch` | 定期開催作成でその他の例外が発生した際のログ | 3 | 1 | 主処理 |  | 想定外エラー |
| 128 | `createTournamentRecurrence` | `createTournamentRecurrenceInnerHelper` | 定期開催から1件のスケジュール済みトーナメントをトランザクションで作成するヘルパーが失敗した際のログ | 3 | 1 | 主処理 |  | 定期開催から 1 件のトーナメント文書を生成するヘルパーの失敗。部分的に生成されない |
| 129 | `enqueueTournamentTasks` | `enqueueBatchPartialErrors` | 手動enqueueでバッチの一部トーナメントが失敗した際のログ | 3 | 1 | 主処理 |  | バッチの一部失敗 |
| 130 | `enqueueTournamentTasks` | `enqueueTournamentTasksCatch` | 手動enqueue実行中にFunctionCustomErrorが発生した際のログ | 3 | 1 | 主処理 | ✓ | FunctionCustomError |
| 131 | `enqueueTournamentTasks` | `enqueueTournamentTasksGenericCatch` | 手動enqueue実行中にその他の例外が発生した際のログ | 3 | 1 | 主処理 |  | 想定外エラー |
| 132 | `runEnqueueTournamentTasks` | `enqueueTournamentTask` | トーナメントごとの単一タスク種別のCloud Tasks登録が失敗した際のログ | 5 | 3 | 主処理 |  | 個別タスク種別の Cloud Tasks 登録失敗。開催・登録締切が機能しない |
| 133 | `runEnqueueTournamentTasks` | `processTournamentBatchItem` | バッチ内の1トーナメント分のenqueue処理全体が例外で失敗した際のログ | 5 | 3 | 主処理 | ✓ | バッチ内 1 トーナメントの enqueue 全体失敗 |
| 134 | `runGenerateRecurringTournaments` | `validateRecurringStoreTenant` | 定期開催ドキュメントのstoreId/tenantIdが欠損・不正な場合のログ（スキップ） | 3 | 1 | 主処理 | ✓ | 定期開催ドキュメントの storeId/tenantId 不正（スキップ）。データ不備 |
| 135 | `runGenerateRecurringTournaments` | `parseRecurrenceInterval` | 定期開催の間隔文字列がパース不能な場合のログ（スキップ） | 3 | 1 | 主処理 | ✓ | 間隔文字列パース不能（スキップ）。データ不備 |
| 136 | `runGenerateRecurringTournaments` | `parseRecurrenceIntervalWrongType` | 定期開催の間隔フィールドの型が想定外な場合のログ（スキップ） | 3 | 1 | 主処理 | ✓ | 間隔フィールド型不正（スキップ）。データ不備 |
| 137 | `runGenerateRecurringTournaments` | `enqueueAfterGenerate` | 定期生成直後のrunEnqueueTournamentTasks呼び出しが失敗した際のログ | 3 | 1 | 補助 |  | 生成後の Cloud Tasks 同期失敗 |
| 138 | `runGenerateRecurringTournaments` | `runGenerateRecurringTournamentsOuterCatch` | 定期トーナメント自動生成ジョブ全体で未捕捉例外が出た際のログ | 5 | 1 | 主処理 |  | 自動生成ジョブ全体の失敗。翌週のトーナメントが生成されない |
| 139 | `updateScheduledTournamentStartAt` | `validateStartAtUpdatePreconditions` | 開始時刻変更の業務前提（scheduledのみ・非アーカイブ・営業日等）を満たさない場合のログ | 3 | 1 | 主処理 | ✓ | 業務前提チェック失敗（非 scheduled・アーカイブ済み等） |
| 140 | `updateScheduledTournamentStatus` | `validateStatusTransition` | キャンセル／復旧の状態遷移やregEndAt妥当性の業務検証に失敗した場合のログ | 3 | 1 | 主処理 | ✓ | 状態遷移検証失敗（不正な遷移・regEndAt 不正等） |

## user

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 141 | `generateQRCode` | `transaction` | QRコードURL・有効期限のFirestoreトランザクション読み書きが失敗した際のログ | 5 | 5 | 主処理 | ✓ | QR URL・有効期限のトランザクション失敗。入店用 QR が生成できない |
| 142 | `generateQRCode` | `generateQRCodeOuterCatch` | QRコード生成フロー全体で失敗した際のログ | 5 | 5 | 主処理 | ✓ | QR 生成フロー全体の失敗 |

## webhook

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 143 | `lineWebhook` | `token` | LINEチャネルアクセストークンが未設定の際のログ | 5 | 1 | 主処理 |  | チャネルアクセストークン未設定。設定ミスで全 Webhook が機能しない。一度発生すると永続 |
| 144 | `lineWebhook` | `replyPostbackPlanDisabledNotOk` | 通信プラン時の機能無効リプライAPIが非200系で返った際のログ | 1 | 1 | 補助 |  | 通信プラン時の機能無効リプライの非 200 応答。限定的シナリオ |
| 145 | `lineWebhook` | `replyPostbackPlanDisabledCatch` | 通信プラン時の機能無効リプライ送信で例外が出た際のログ | 1 | 1 | 補助 |  | 同上の例外 |
| 146 | `lineWebhook` | `replyPostbackDeclineConfirmNotOk` | 辞退完了後の確認リプライAPIが非200系で返った際のログ | 1 | 1 | 補助 |  | シフト辞退確認リプライの非 200 応答。辞退処理自体は成功済み |
| 147 | `lineWebhook` | `replyPostbackDeclineConfirmCatch` | 辞退完了後の確認リプライ送信で例外が出た際のログ | 1 | 1 | 補助 |  | 同上の例外 |
| 148 | `lineWebhook` | `postback` | postbackイベント処理（シフト辞退ボタン等）内で例外が出た際のログ | 3 | 1 | 主処理 |  | postback 処理全般の失敗（シフト辞退ボタン等）。ユーザー操作が反映されない |
| 149 | `lineWebhook` | `followOrUnblock` | 友だち追加またはブロック解除後のリッチメニュー紐付けで例外が出た際のログ | 3 | 3 | 主処理 |  | 友だち追加 / ブロック解除時のリッチメニュー紐付け失敗。メニューが正しく表示されない |
| 150 | `lineWebhook` | `handler` | LINE Webhook HTTPハンドラの最外周で未処理例外が出た際のログ | 5 | 5 | 主処理 |  | 最外周の未処理例外。全 Webhook イベントが処理されない |
| 151 | `linkStaffRichMenu` | `linkStaffRichMenuHttpFail` | スタッフ用リッチメニュー紐付けAPIが非200系で返った際のログ | 3 | 3 | 主処理 |  | LINE API の非 200 応答。スタッフメニューが紐付かない |
| 152 | `linkStaffRichMenu` | `linkStaffRichMenuCatch` | スタッフ用リッチメニュー紐付けAPI呼び出しで例外が出た際のログ | 3 | 3 | 主処理 |  | 紐付け処理の例外 |
| 153 | `linkUserRichMenu` | `linkUserRichMenuHttpFail` | ユーザー用リッチメニュー紐付けAPIが非200系で返った際のログ | 3 | 3 | 主処理 |  | LINE API の非 200 応答 |
| 154 | `linkUserRichMenu` | `linkUserRichMenuCatch` | ユーザー用リッチメニュー紐付けAPI呼び出しで例外が出た際のログ | 3 | 3 | 主処理 |  | 紐付け処理の例外 |
| 155 | `sendLinePushMessage` | `token` | テキストPush送信時にチャネルアクセストークンが未設定の際のログ | 3 | 1 | 主処理 |  | トークン未設定。設定ミス |
| 156 | `sendLinePushMessage` | `validate` | テキストPushの送信先または本文が空など不正の際のログ | 1 | 1 | 主処理 |  | 送信先 / 本文パラメータ不正 |
| 157 | `sendLinePushMessage` | `pushResponseNotOk` | テキストPushのLINE APIが非200系で返った際のログ | 3 | 1 | 主処理 |  | LINE API 非 200。通知が届かない |
| 158 | `sendLinePushMessage` | `pushCatch` | テキストPush送信で例外が出た際のログ | 3 | 1 | 主処理 |  | Push 送信の例外 |

## shared

| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | 備考 |
|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|
| 159 | `scheduleGenerateNextYearBusinessHours` | `generateMonthFailed` | 翌年営業時間の自動生成で特定月の生成・シフト同期が失敗した際のログ | 3 | 1 | 主処理 |  | 特定月の生成失敗。他の月は継続 |
| 160 | `scheduleGenerateNextYearBusinessHours` | `taskOuterCatch` | 翌年営業時間生成タスク全体が例外で失敗した際のログ | 3 | 1 | 主処理 |  | タスク全体の失敗。翌年の営業時間が生成されない |
| 161 | `getPayrollConfig` | `config_read` | 給与設定のFirestore読み取りがリトライ後も失敗しデフォルトへフォールバックする際のログ | 3 | 1 | 主処理 |  | Firestore リトライ後にデフォルトへフォールバック。給与計算が不正確になりうる |
| 162 | `getSchedulerConfig` | `config_read` | スケジューラ設定のFirestore読み取りがリトライ後も失敗しデフォルトへフォールバックする際のログ | 3 | 3 | 主処理 |  | フォールバック適用。スケジュール判断が不正確になりうる |
| 163 | `getStoreConfig` | `config_read` | 店舗設定のFirestore読み取りがリトライ後も失敗しデフォルトへフォールバックする際のログ | 5 | 5 | 主処理 |  | Firestore リトライ後にデフォルトへフォールバック。多数の業務処理が誤った設定で動く可能性 |
| 164 | `controlHookHttp` | `validateControlHookRequest` | 制御フックHTTPハンドラのリクエスト処理中に想定外エラーが発生した際のログ | 5 | 5 | 主処理 |  | リクエスト処理中の想定外エラー。タスクが処理されない |
| 165 | `controlHookHttp` | `executeNewPayloadTask` | 新形式ペイロードのトーナメント制御フックで受けたタスク処理が失敗した際のログ | 5 | 5 | 主処理 |  | 新形式ペイロードのタスク実行失敗。トーナメント自動制御が機能しない |
| 166 | `controlHookHttp` | `executeLegacyPayloadTask` | 旧形式ペイロードのトーナメント制御フックで受けたアクション処理が失敗した際のログ | 3 | 1 | 主処理 |  | 旧形式ペイロードのアクション実行失敗 |
| 167 | `updateDeviceOptions` | `updateDeviceOptionsCatch` | 端末のオプション設定をFirestoreに反映する更新が失敗した際のログ | 1 | 1 | 主処理 |  | Firestore 更新失敗。端末設定が反映されない |
| 168 | `updateDeviceRole` | `updateDeviceRoleCatch` | 端末のロール（権限）をFirestoreに反映する更新が失敗した際のログ | 1 | 1 | 主処理 |  | Firestore 更新失敗。端末ロールが反映されない |
