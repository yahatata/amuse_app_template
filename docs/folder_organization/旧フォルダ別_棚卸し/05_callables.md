# 旧フォルダ別棚卸し：callables

## 1. 対象フォルダの概要

**functions/src/callables** は、アプリ等から直接呼ばれる **onCall 入口** を集約するフォルダ。会計（bills）・トーナメント作成/実行中（tournament_createTournament / tournament_activeTournament）・スタッフ・勤怠・デバイス・サイドゲーム等、複数ドメインにまたがる callable が一括配置されている。ルート index は callables を `export * from "./callables"` で取り込む。本棚卸しは **callables フォルダ内のファイルのみ** を対象とし、callables/index から re-export されている **../accounting, ../tournamentBlind, ../sideGame** の各ファイルは各フォルダ棚卸しで扱う。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約のみ。../accounting, ../tournamentBlind, ../sideGame も re-export | ⑦移行後は各ドメインの index に分散 | ⑧No | ⑨export 集約。他フォルダの re-export 含む |
| ①accounting.ts | ②callable | ③Yes | ④Yes | ⑤bills, accountingHistory（書）, devices | ⑥アプリ onCall（startAccounting, completeAccounting, completeAccountingV2） | ⑦domains/bills/callables | ⑧No | ⑨会計開始・完了。1 ファイルで 3 export |
| ①verifyPaymentSplit.ts | ②callable | ③Yes | ④Yes | ⑤bills（読） | ⑥アプリ onCall | ⑦domains/bills/callables | ⑧No | ⑨支払い按分検証 |
| ①updateActiveBill.ts | ②callable | ③Yes | ④Yes | ⑤bills（読・書） | ⑥アプリ onCall | ⑦domains/bills/callables | ⑧No | ⑨伝票更新（会計開始前のみ） |
| ①migrateTodaysBills.ts | ②callable | ③Yes | ④Yes | ⑤bills, todaysBills（書） | ⑥アプリ onCall（migrateTodaysBillsAccountingFields） | ⑦domains/bills/callables | ⑧No | ⑨本日伝票の会計フィールド移行 |
| ①getAccountingHistory.ts | ②callable | ③Yes | ④Yes | ⑤accountingHistory（読） | ⑥アプリ onCall | ⑦domains/bills/callables | ⑧No | ⑨会計履歴取得 |
| ①updateAccounting.ts | ②callable | ③Yes | ④Yes | ⑤bills（書） | ⑥アプリ onCall | ⑦domains/bills/callables | ⑧No | ⑨会計情報更新 |
| ①cancelAccounting.ts | ②callable | ③Yes | ④Yes | ⑤bills（書） | ⑥アプリ onCall | ⑦domains/bills/callables | ⑧No | ⑨会計キャンセル |
| ①refundProcessing.ts | ②callable | ③Yes | ④Yes | ⑤bills, events, accountingHistory 等 | ⑥アプリ onCall（processRefund, getRefundHistory） | ⑦domains/bills/callables | ⑧No | ⑨返金処理・履歴。1 ファイルで 2 export |
| ①appendExtra.ts | ②callable | ③Yes | ④Yes | ⑤bills, extras（書） | ⑥アプリ onCall（appendExtraCallable as appendExtra） | ⑦domains/bills/callables | ⑧No | ⑨伝票に追加料金を付与 |
| ①createScheduledTournament.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（書）, tournamentTemplates 等 | ⑥アプリ onCall | ⑦domains/tournament_createTournament/callables | ⑧No | ⑨スケジュール済みトーナメント作成 |
| ①createTournamentRecurrence.ts | ②callable | ③Yes | ④Yes | ⑤tournamentRecurrences（書）等 | ⑥アプリ onCall | ⑦domains/tournament_createTournament/callables | ⑧No | ⑨トーナメントリカレンス作成 |
| ①getTournamentRecurrences.ts | ②callable | ③Yes | ④Yes | ⑤tournamentRecurrences（読） | ⑥アプリ onCall | ⑦domains/tournament_createTournament/callables | ⑧No | ⑨リカレンス一覧取得 |
| ①deleteTournamentRecurrence.ts | ②callable | ③Yes | ④Yes | ⑤tournamentRecurrences（書） | ⑥アプリ onCall | ⑦domains/tournament_createTournament/callables | ⑧No | ⑨リカレンス削除 |
| ①generateRecurringTournaments.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（書）等 | ⑥アプリ onCall | ⑦domains/tournament_createTournament/callables | ⑧No | ⑨リカレンスからスケジュール生成 |
| ①updateTournamentRecurrence.ts | ②callable | ③Yes | ④Yes | ⑤tournamentRecurrences（書） | ⑥アプリ onCall | ⑦domains/tournament_createTournament/callables | ⑧No | ⑨リカレンス更新 |
| ①updateTournamentTemplate.ts | ②callable | ③Yes | ④Yes | ⑤tournamentTemplates（書）等 | ⑥アプリ onCall | ⑦domains/tournament_createTournament/callables | ⑧No | ⑨トーナメントテンプレート更新 |
| ①getScheduledTournamentsForEdit.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（読）等 | ⑥アプリ onCall | ⑦domains/tournament_createTournament/callables | ⑧No | ⑨編集用スケジュール一覧取得 |
| ①getTodayTournaments.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（読）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨本日のトーナメント一覧 |
| ①getUpcomingTournaments.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（読）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨今後のトーナメント一覧 |
| ①registerForTournament.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, bills 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨トーナメント参加登録 |
| ①addTableToTournament.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, tables 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨テーブル追加 |
| ①removeTableFromTournament.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, tables 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨テーブル削除 |
| ①assignSeatToPlayer.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, participants 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨席割り |
| ①reseatAllPlayers.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, participants 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨全員席替え |
| ①getAvailableTables.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, tables（読）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨利用可能テーブル一覧 |
| ①registerParticipants.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, participants（書）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨参加者一括登録 |
| ①createTemporaryTable.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, tables（書）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨仮テーブル作成 |
| ①bustAndReentry.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, bills 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨バスト＆再エントリー |
| ①bustAndExit.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, bills 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨バスト＆退場 |
| ①addon.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, bills 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨アドオン |
| ①bulkAddon.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, bills 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨一括アドオン |
| ①api.pause.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments 等（pauseTournament） | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨トーナメント一時停止 |
| ①api.resume.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments 等（resumeTournament） | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨トーナメント再開 |
| ①getPrizeData.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（読）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨賞金データ取得 |
| ①setPrizeData.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（書）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨賞金データ設定 |
| ①getRankingData.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（読）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨ランキングデータ取得 |
| ①setRankingData.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（書）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨ランキングデータ設定 |
| ①endTournament.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, bills 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨トーナメント終了 |
| ①validateEndTournament.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments（読）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨終了可否検証 |
| ①getActionLogs.ts | ②callable | ③Yes | ④Yes | ⑤actionLogs（読）等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨アクションログ取得 |
| ①rollbackAction.ts | ②callable | ③Yes | ④Yes | ⑤scheduledTournaments, bills, actionLogs 等 | ⑥アプリ onCall | ⑦domains/tournament_activeTournament/callables | ⑧No | ⑨アクションロールバック |
| ①updateStaffHourlyWage.ts | ②callable | ③Yes | ④Yes | ⑤staffs（書） | ⑥アプリ onCall | ⑦domains/staff/callables | ⑧No | ⑨時給更新 |
| ①updateStaffBankInfo.ts | ②callable | ③Yes | ④Yes | ⑤staffs（書） | ⑥アプリ onCall | ⑦domains/staff/callables | ⑧No | ⑨銀行情報更新 |
| ①getPayrollData.ts | ②callable | ③Yes | ④Yes | ⑤attendances, staffs, monthlyPayroll（読）等 | ⑥アプリ onCall | ⑦domains/attendance/callables | ⑧No | ⑨給与データ取得 |
| ①registerDevice.ts | ②callable | ③Yes | ④Yes | ⑤devices（書） | ⑥アプリ onCall | ⑦domains/user/callables（要判断） | ⑧No | ⑨デバイス登録。05 では user/要判断 |
| ①updateDeviceOptions.ts | ②callable | ③Yes | ④Yes | ⑤devices（書） | ⑥アプリ onCall | ⑦domains/user/callables（要判断） | ⑧No | ⑨デバイスオプション更新 |
| ①updateDeviceRole.ts | ②callable | ③Yes | ④Yes | ⑤devices（書） | ⑥アプリ onCall | ⑦domains/user/callables（要判断） | ⑧No | ⑨デバイスロール更新 |
| ①debugSideGame.ts | ②callable | ③Yes | ④Yes | ⑤sideGames, bills 等 | ⑥アプリ onCall | ⑦domains/sideGame/callables | ⑧No | ⑨サイドゲームデバッグ |
| ①calculateFirestoreSize.ts | ②callable | ③Yes | ④Yes | ⑤各種コレクション（読・サイズ計測） | ⑥アプリ onCall | ⑦要判断（ユーティリティ） | ⑧No | ⑨Firestore サイズ計測。05 では要判断 |

## 3. 追加メモ

- **対象範囲**：callables **フォルダ内の .ts ファイルのみ**（50 件）。callables/index が re-export している **../accounting/getBillPreviewTotals**、**../tournamentBlind/getBlindTemplates**、**../sideGame/registerForSideGame, leaveSeat, withdrawTip, depositTip** は、それぞれ accounting / tournamentBlind / sideGame の棚卸しで扱う。
- **入口・export**：全ファイルが onCall 入口であり、callables/index 経由でルート index に export されているため、③Yes・④Yes で統一。
- **移行先**：05_入口一覧・04_新フォルダ構造に合わせ、**bills / tournament_createTournament / tournament_activeTournament / staff / attendance / user / sideGame** に分散。registerDevice, updateDeviceOptions, updateDeviceRole は 05 で「user（要判断）」、calculateFirestoreSize は「要判断」のため、設計時にドメインを確定する。
- **shared 候補**：なし。各ファイルはいずれかのドメインに属する入口として扱う。
- **未使用候補**：該当なし。全ファイルが callables/index から export され、05_入口一覧に記載されている。

## 4. 次アクション

- **設計**：各ドメイン（bills, tournament_createTournament, tournament_activeTournament, staff, attendance, user, sideGame）の設計で、上記 ⑦ に従い callables 配下の該当ファイルの移動先を反映する。calculateFirestoreSize と registerDevice / updateDeviceOptions / updateDeviceRole の最終的なドメインは設計・08_意思決定ログで確定する。
- **changeSpec**：ドメイン単位の changeSpec で、callables 内ファイルの移動と、ルート index および callables/index の export パス付け替え（または callables/index の廃止と各ドメインからの直接 export）を記載する。
- **05_入口一覧**：移行実施後、各入口の「現在パス」を新パスに更新する。callables/index の re-export 廃止に伴い、入口の定義元パスが変わる点を反映する。
