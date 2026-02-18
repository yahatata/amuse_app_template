# 旧フォルダ別棚卸し：triggers

## 1. 対象フォルダの概要

**functions/src/triggers** は、伝票（bills）まわりの **Firestore トリガ 2 本**（billsOnSettle, billsEventsOnCreate）と、確定時に冪等データを削除する **内部関数 1 本**（onSettleCleanupIdempotency）の計 3 ファイル。**index.ts は存在せず**、ルート index が `export * from "./triggers/bills.events.onCreate"` と `export * from "./triggers/bills.onSettle"` で 2 トリガのみ直接 export している。04 の「bills＝伝票・精算・会計確定」に該当し、移行先は **domains/bills/triggers**（2 本）および **domains/bills/services**（1 本）とする。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①bills.onSettle.ts | ②trigger | ③Yes | ④Yes | ⑤bills（読・書）, bills/{}/items・extras・sideGameChips・tournaments・payments（読）. helpers/billsApi/snapshots, analytics/aggregator 参照。処理後に onSettleCleanupIdempotency 呼び出し | ⑥Firestore: bills 更新で status が settled に遷移したとき onDocumentUpdated 発火 | ⑦**domains/bills/triggers** | ⑧No | ⑨会計確定時に親スナップショット生成・aggregator キュー・冪等クリーンアップ |
| ①onSettleCleanupIdempotency.ts | ②service | ③No | ④No | ⑤bills/{billId}/idempotency（書・削除） | ⑥bills.onSettle から呼び出し。ルート index からは export されていない | ⑦**domains/bills/services** | ⑧No | ⑨会計確定時の冪等サブコレクション一括削除。P1-06 で本実装予定の stub 含む |
| ①bills.events.onCreate.ts | ②trigger | ③Yes | ④Yes | ⑤bills（読・書）, bills/{billId}/events/{eventId}（書） | ⑥Firestore: bills/{}/events 作成で onDocumentCreated 発火 | ⑦**domains/bills/triggers** | ⑧No | ⑨refund/adjustment/cancel/reopen イベント適用。postEvents・paymentsSummary・status 更新 |

## 3. 追加メモ

- **入口**：billsOnSettle は **onDocumentUpdated**（bills/{billId}）、billsEventsOnCreate は **onDocumentCreated**（bills/{billId}/events/{eventId}）。いずれも ③入口 Yes。onSettleCleanupIdempotency は入口ではなく ②service。
- **export**：ルート index は triggers フォルダ全体ではなく、bills.events.onCreate と bills.onSettle の 2 ファイルを個別に export。onSettleCleanupIdempotency は export されず、bills.onSettle 内で静的 import されているため ④No。
- **移行先**：04 のドメイン一覧「bills＝伝票・精算・会計確定」に一致。**domains/bills/triggers** に 2 トリガを配置。冪等クリーンアップは「会計確定に伴う業務ロジック」として **domains/bills/services** に配置する（shared/idempotency は「どのドメインでも意味が同じ」汎用のみ。本処理は bills 確定時専用のため bills 内に置く）。
- **他モジュール参照**：bills.onSettle は helpers/billsApi/snapshots、analytics/aggregator、onSettleCleanupIdempotency を参照。移行後は domains/bills/services および domains/analytics 等のパスに合わせる。
- **未使用候補**：該当なし。

## 4. 次アクション

- **設計**：bills ドメイン設計で、2 トリガを **domains/bills/triggers**、onSettleCleanupIdempotency を **domains/bills/services** に移す方針を記載する。helpers/billsApi、analytics/aggregator の移行先と import パスを整合させる。
- **changeSpec**：triggers 移管時に、ルート index の import を `domains/bills/triggers` からの re-export に変更する。onSettleCleanupIdempotency は domains/bills/services に配置し、bills トリガから相対またはドメイン内 import に更新する。
- **05_入口一覧**：移行後、billsOnSettle・billsEventsOnCreate を bills/triggers として 05 に記載する。
