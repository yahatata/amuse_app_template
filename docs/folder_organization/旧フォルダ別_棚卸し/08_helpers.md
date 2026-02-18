# 旧フォルダ別棚卸し：helpers

## 1. 対象フォルダの概要

**functions/src/helpers** は、**stateDoc**（営業日・JST・処理ロック）と **billsApi**（伝票まわりの I/O・イベント・集計スナップショット）の 2 サブフォルダからなる。入口はなく、他モジュールから直接 import されるのみ。ルート index は helpers を export していない。配置の結論は **5. 検証結果** を参照（stateDoc は「すべて shared/time」ではなく、実装・データ所在に基づき一部 **storeMeta** を推奨）。

## 2. 棚卸し表

### 2.1 helpers/stateDoc/（5 ファイル）

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約（getCurrentBusinessDateKeyOrThrow, types） | ⑦移行先で再構成（storeMeta + shared/time に分割） | ⑧No | ⑨stateDoc の export 集約。processingLease, generateJstDateKey は index から export されていない |
| ①getCurrentBusinessDateKeyOrThrow.ts | ②repos/service | ③No | ④No | ⑤storeMeta/currentBusinessDay（読） | ⑥close_process, utils/getOpenBills, itemOrder/getUserOrderHistory | ⑦**domains/storeMeta/repos** 推奨（実装が storeMeta を読む。01 の「同じ意味」は満たすがデータ所在は storeMeta） | ⑧No | ⑨現在営業日キー取得。shared/time 案は 5. 参照 |
| ①generateJstDateKey.ts | ②service | ③No | ④No | ⑤なし（計算のみ） | ⑥storeManagement/openStore, openStoreTerminal | ⑦**shared/time** | ⑧No | ⑨JST 日付キー生成（YYYY-MM-DD）。純粋計算で 01 の shared/time に合致 |
| ①processingLease.ts | ②service/repos | ③No | ④No | ⑤storeMeta/currentBusinessDay（書・読）, storeMeta/closeRuns・openRuns/runs（書） | ⑥storeManagement/openStoreTerminal, closeStoreTerminal | ⑦**domains/storeMeta/services** 推奨（開閉店の排他制御。storeMeta の状態を直接更新。04 の storeMeta＝開閉店・状態に該当） | ⑧No | ⑨acquireProcessing, extendProcessing, releaseProcessing。shared ではなくデータ所在に合わせ storeMeta |
| ①types.ts | ②— | ③No | ④No | ⑤なし（型定義） | ⑥stateDoc 内 | ⑦**domains/storeMeta**（CurrentBusinessDayDoc, ProcessingLeaseDoc, StateDocLogEntry は storeMeta のドキュメント型） | ⑧No | ⑨移行先で types または repos に付随 |

### 2.2 helpers/billsApi/（20 ファイル）

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約。billsApi の主要 API を re-export | ⑦domains/bills/repos（移行先で再構成） | ⑧No | ⑨billsApi の export 集約 |
| ①types.ts | ②repos | ③No | ④No | ⑤なし（型定義） | ⑥billsApi 内各ファイル | ⑦domains/bills/repos | ⑧No | ⑨BusinessDateResult, BaseLogFields 等 |
| ①createBillWithActiveStay.ts | ②repos | ③No | ④No | ⑤bills, activeStays, users（書） | ⑥userLogin/manualCheckIn, processVisitByQR。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨伝票＋activeStay 作成 |
| ①calcBusinessDate.ts | ②repos | ③No | ④No | ⑤**businessHoursMonthlyMap**（読。04 では shift が主に管理） | ⑥createScheduledTournament, billsApi/postEvent*（計上日算出） | ⑦domains/bills/repos | ⑧No | ⑨営業日算出。bills が shift 系データを読む形。依存は bills→shift の読取のみで可 |
| ①calcBusinessDateHelpers.ts | ②repos | ③No | ④No | ⑤businessHoursMonthlyMap（読）, または計算のみ | ⑥calcBusinessDate 等 billsApi 内 | ⑦domains/bills/repos | ⑧No | ⑨JST 変換・月キー・営業日候補等。calcBusinessDate と一体で bills/repos で可 |
| ①dualWrite.ts | ②repos | ③No | ④No | ⑤bills, todaysBills（書） | ⑥callables/updateActiveBill。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨shouldDualWrite, dualWriteTodaysBillsSkeleton, legacy* 系 |
| ①getActiveBillByUser.ts | ②repos | ③No | ④No | ⑤bills, activeStays（読） | ⑥sideGame（withdrawTip, depositTip）, itemOrder/placeOrderByUser。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨ユーザー別アクティブ伝票取得 |
| ①appendItem.ts | ②repos | ③No | ④No | ⑤bills, items（書） | ⑥itemOrder/placeOrder, placeOrderByUser。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨伝票にアイテム追加。appendItemWithOrderProjection も |
| ①resolveMenuItem.ts | ②repos | ③No | ④No | ⑤**menuItems**（読。04 では itemOrder＝注文・メニュー） | ⑥itemOrder/placeOrder, placeOrderByUser, callables/updateActiveBill | ⑦domains/bills/repos | ⑧No | ⑨伝票処理でメニュー解決。bills が itemOrder を参照。配置は bills/repos で可 |
| ①appendSideGameChip.ts | ②repos | ③No | ④No | ⑤bills, sideGameChips（書） | ⑥sideGame（depositTip, withdrawTip）, itemOrder/placeOrder。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨サイドゲームチップ追加 |
| ①updatePlace.ts | ②repos | ③No | ④No | ⑤bills, participants 等（書） | ⑥sideGame（registerForSideGame, leaveSeat）, callables（reseatAllPlayers, bustAndExit, assignSeatToPlayer）。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨席・プレイヤー配置更新 |
| ①recordTournamentAction.ts | ②repos | ③No | ④No | ⑤bills, tournaments 等（書） | ⑥callables（registerParticipants, registerForTournament, bustAndReentry, bustAndExit, bulkAddon, addon）。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨トーナメントアクション記録 |
| ①startAccounting.ts | ②repos | ③No | ④No | ⑤bills（書） | ⑥callables/accounting。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨会計開始処理（ops 更新等） |
| ①updateBill.ts | ②repos | ③No | ④No | ⑤bills（書） | ⑥callables/updateAccounting 等。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨伝票更新。billsApi/index から re-export |
| ①postEventRefund.ts | ②repos | ③No | ④No | ⑤bills, events（書） | ⑥callables/refundProcessing。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨返金イベント |
| ①postEventAdjustment.ts | ②repos | ③No | ④No | ⑤bills, events（書） | ⑥callables/updateAccounting。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨調整イベント |
| ①postEventCancel.ts | ②repos | ③No | ④No | ⑤bills, events（書） | ⑥callables/updateAccounting。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨キャンセルイベント |
| ①postEventReopen.ts | ②repos | ③No | ④No | ⑤bills, events（書） | ⑥callables/updateAccounting。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨再オープンイベント |
| ①snapshots.ts | ②service | ③No | ④No | ⑤なし（**Firestore I/O なし**。引数で受け取った bills サブコレクションから計算） | ⑥triggers/bills.onSettle | ⑦domains/bills/**services** 推奨（01 の repos＝I/O 集約に対し純粋計算。設計で repos に含めても可） | ⑧No | ⑨Settlement スナップショット生成。bills ドメイン内で services が定義に合う |
| ①appendExtra.ts | ②repos | ③No | ④No | ⑤bills, extras（書） | ⑥callables/appendExtra。billsApi/index から re-export | ⑦domains/bills/repos | ⑧No | ⑨追加料金付与。appendExtraCore も |

## 3. 追加メモ

- **入口**：helpers 配下に onCall / onRequest / onSchedule はない。すべて他モジュールから参照される **service / repos** 相当。
- **export**：ルート index は helpers を export していない。参照はすべて **直接 import（../helpers/stateDoc/*, ../helpers/billsApi/*）** のため、④export = No（index から辿れない）。stateDoc/index と billsApi/index は各サブフォルダ内の集約のみ。
- **未使用候補**：該当なし。全ファイルが上記のいずれかから参照されている。

## 4. 次アクション

- **設計**：stateDoc は **storeMeta（getCurrentBusinessDateKeyOrThrow, processingLease, types）** と **shared/time（generateJstDateKey のみ）** に分割する方針を設計に記載する。bills ドメイン設計で billsApi を **domains/bills/repos**（snapshots は **services** 分離を検討）に移す方針を記載する。08_意思決定ログに「stateDoc をすべて shared/time としない理由」「snapshots を repos に含めるか services にするか」を記録する。
- **changeSpec**：stateDoc 移管時に storeManagement, close_process, utils, itemOrder の **import パス** を更新する。billsApi 移管時に triggers, callables, userLogin, sideGame, itemOrder の **import パス** を更新する。
- **05_入口一覧**：helpers に入口はないため、05 の更新対象なし。

---

## 5. 検証結果（配置の妥当性）

ドキュメント（01_前提と共通ルール、04_新フォルダ構造）と実装コードを照合し、**「stateDoc はすべて shared/time」「billsApi はすべて bills/repos」がそのままでよいか** を確認した結果をまとめる。

### 5.1 stateDoc：すべて shared/time は不適切

- **01**：shared は「複数ドメインで同じ意味で使うもの」のみ。shared/time は「**時間・JST・営業日計算の汎用**」。shared/idempotency は「**冪等・重複抑止の共通部品**」。
- **実装**：
  - **generateJstDateKey.ts**：Firestore に触らない純粋な JST 日付キー計算。→ **shared/time で正しい。**
  - **getCurrentBusinessDateKeyOrThrow.ts**：**storeMeta/currentBusinessDay** を読んで現在営業日キーを返す。意味は「現在営業日取得」で複数ドメインで使われるが、**データの所在は storeMeta**。shared に置くと shared が storeMeta に依存する。04 の storeMeta＝「店舗・開閉店・状態」に合致するため、**domains/storeMeta/repos**（または storeMeta が提供する「営業日キー取得」API）に置く方が依存関係が明確。→ **storeMeta 推奨。**
  - **processingLease.ts**：**storeMeta/currentBusinessDay** の `processing` フィールドの書込・読取、および **storeMeta/closeRuns・openRuns** の runs への書込。開閉店の排他制御であり、storeMeta の状態を直接更新している。01 の「時間・JST・営業日計算」には含まれず、idempotency 的ではあるが**データ所在が storeMeta**。→ **domains/storeMeta/services**（または repos）が適切。**shared/time でも idempotency でもなく storeMeta。**
  - **types.ts**：CurrentBusinessDayDoc, ProcessingLeaseDoc, StateDocLogEntry はすべて **storeMeta/currentBusinessDay** 関連の型。→ **domains/storeMeta** に付随。

**結論（stateDoc）**：**shared/time に置くのは generateJstDateKey のみ。** それ以外（getCurrentBusinessDateKeyOrThrow, processingLease, types）は **domains/storeMeta** に配置するのが 01・04 と実装の整合性が取れる。

### 5.2 billsApi：bills/repos でよい（例外は snapshots）

- **01**：repos は「**Firestore 読み書き（I/O）の集約**」。
- **実装**：
  - 大部分（createBillWithActiveStay, dualWrite, getActiveBillByUser, appendItem, updatePlace, recordTournamentAction, startAccounting, updateBill, postEvent* 等）は bills および関連コレクション（events, activeStays 等）の I/O。→ **bills/repos で問題なし。**
  - **calcBusinessDate / calcBusinessDateHelpers**：**businessHoursMonthlyMap** を読む。04 では shift が businessHoursMonthlyMap を主に管理（shift/setBusinessHoursManualForDay, initShiftDaysForMonth 等）。呼び出し元は createScheduledTournament と billsApi 内の postEvent*（イベント計上日算出）。「営業日計算」は伝票・トーナメントの文脈で使われるため、**bills/repos に置き、bills が shift のデータを読む形**で可。依存は読み取りのみ。
  - **resolveMenuItem**：**menuItems**（04 では itemOrder＝注文・メニュー）を読む。伝票にアイテムを追加する際のメニュー解決なので、bills が itemOrder を参照する形。**bills/repos のままで可。**
  - **snapshots.ts**：**Firestore を一切読まない・書かない**。引数で受け取った items/extras/sideGameChips/tournaments から calculateAmounts, buildItemsSnapshot 等の**純粋計算**を行う。01 の repos（I/O 集約）の定義からは外れる。→ **domains/bills/services** に分離する方が 01 の定義に合う。設計で「repos に含めて運用する」と決めても可。

**結論（billsApi）**：**bills/repos に配置してよい。** ただし **snapshots.ts は Firestore I/O がないため bills/services への分離を推奨**し、設計・08 で repos に含めるか services にするかを記録する。

### 5.3 まとめ（修正後の移行先）

| サブフォルダ | ファイル | 修正後の移行先 |
|--------------|----------|----------------|
| stateDoc | generateJstDateKey.ts | **shared/time** |
| stateDoc | getCurrentBusinessDateKeyOrThrow.ts, processingLease.ts, types.ts, index.ts | **domains/storeMeta**（repos/services/types は設計で振り分け） |
| billsApi | snapshots.ts | **domains/bills/services** 推奨（repos に含める場合は 08 に記録） |
| billsApi | 上記以外 19 ファイル | **domains/bills/repos** |
