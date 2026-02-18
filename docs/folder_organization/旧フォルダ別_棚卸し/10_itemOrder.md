# 旧フォルダ別棚卸し：itemOrder

## 1. 対象フォルダの概要

**functions/src/itemOrder** は、注文・メニューまわりの **onCall 入口** を集約したフォルダ。メニュー取得・メニューCRUD（作成・更新・売切切替）、注文確定（スタッフ/ユーザー）、注文履歴取得、注文取り消しの 8 本が index 経由で export され、ルート index からも export されている。04 のドメイン一覧「itemOrder＝注文・メニュー」にそのまま対応する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約。上記 8 関数を re-export | ⑦domains/itemOrder/callables（移行先で再構成） | ⑧No | ⑨itemOrder の export 集約 |
| ①getMenuItems.ts | ②callable | ③Yes | ④Yes | ⑤administrativeMenu/current（読） | ⑥アプリ等から onCall で直接呼び出し | ⑦domains/itemOrder/callables | ⑧No | ⑨メニューアイテム一覧取得。administrativeMenu から items マップを取得し配列化 |
| ①createMenuItem.ts | ②callable | ③Yes | ④Yes | ⑤menuItems（書）, administrativeMenu/current（書）, Storage（menuImages） | ⑥アプリ等から onCall。lib/devicePermissions（kitchen 権限）参照 | ⑦domains/itemOrder/callables | ⑧No | ⑨メニューアイテム新規作成。画像は Storage にアップロード |
| ①updateMenuItem.ts | ②callable | ③Yes | ④Yes | ⑤menuItems（読・書）, administrativeMenu/current（書）, Storage | ⑥アプリ等から onCall。lib/devicePermissions 参照 | ⑦domains/itemOrder/callables | ⑧No | ⑨メニューアイテム更新。既存画像保持または imageBase64 で差替 |
| ①toggleSoldOutForMenuItem.ts | ②callable | ③Yes | ④Yes | ⑤menuItems（書）, administrativeMenu/current（書） | ⑥アプリ等から onCall。lib/devicePermissions 参照 | ⑦domains/itemOrder/callables | ⑧No | ⑨売切フラグの切替。menuItems と administrativeMenu を同期更新 |
| ①placeOrder.ts | ②callable | ③Yes | ④Yes | ⑤bills/items, bills/sideGameChips（書）, menuItems（読・helpers/billsApi/resolveMenuItem）, orders/_TodaysOrders（書）, utils/logUtils | ⑥アプリ等から onCall。helpers/billsApi, lib/devicePermissions（order 権限）参照 | ⑦domains/itemOrder/callables | ⑧No | ⑨スタッフによる注文確定。appendItemWithOrderProjection / appendSideGameChip で伝票に追加 |
| ①placeOrderByUser.ts | ②callable | ③Yes | ④Yes | ⑤bills, bills/items（書）, menuItems（読・resolveMenuItem）, activeStays（getActiveBillByUser 経由） | ⑥アプリ等から onCall。helpers/billsApi（getActiveBillByUser, appendItem, resolveMenuItem）参照 | ⑦domains/itemOrder/callables | ⑧No | ⑨LIFF ユーザーによる注文確定。伝票取得後に appendItem で追加 |
| ①getUserOrderHistory.ts | ②callable | ③Yes | ④Yes | ⑤bills（読）, bills/items（読）, helpers/stateDoc（getCurrentBusinessDateKeyOrThrow） | ⑥アプリ等から onCall。当日営業日で確定済み伝票を取得 | ⑦domains/itemOrder/callables | ⑧No | ⑨ユーザー注文履歴。status 確定済み・businessDate で絞り込み |
| ①cancelOrder.ts | ②callable | ③Yes | ④Yes | ⑤bills（読）, bills/items（書・voided）, orders/_TodaysOrders（書・status cancel）, lib/devicePermissions | ⑥アプリ等から onCall。order 権限で注文取り消し | ⑦domains/itemOrder/callables | ⑧No | ⑨注文取り消し。伝票 items の voided と _TodaysOrders の status を更新 |

## 3. 追加メモ

- **入口**：getMenuItems, createMenuItem, updateMenuItem, toggleSoldOutForMenuItem, placeOrder, placeOrderByUser, getUserOrderHistory, cancelOrder の 8 件はいずれも **onCall** を含むため ③入口 Yes。種別は **callable**。
- **export**：itemOrder/index.ts が上記 8 関数を re-export し、ルート index.ts が `export * from "./itemOrder"` でまとめて export しているため、④export = Yes。
- **移行先**：04 のドメイン一覧「itemOrder＝注文・メニュー」に一致。注文確定・注文履歴・注文取消・メニュー取得・メニューCRUD はいずれも itemOrder ドメインの責務として **domains/itemOrder/callables** に配置する。
- **他ドメイン参照**：placeOrder / placeOrderByUser は helpers/billsApi（伝票・メニュー解決）、getUserOrderHistory は helpers/stateDoc（営業日キー）、cancelOrder は bills/items と orders を触る。これらは「注文」の文脈で bills 等を利用しているだけであり、入口と主たる責務は itemOrder のため移行先は itemOrder のままでよい。
- **未使用候補**：該当なし。全ファイルが index から export され、アプリ等の呼び出し対象となる入口である。

## 4. 次アクション

- **設計**：itemOrder ドメイン設計で上記 8 callable を **domains/itemOrder/callables** に移す方針を記載する。helpers/billsApi・stateDoc・lib/devicePermissions 等の import パスを設計に合わせて更新する。
- **changeSpec**：itemOrder 移管時にルート index.ts の **import パス** を `domains/itemOrder/callables`（または itemOrder の index）に更新する。export 名は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行先確定後、itemOrder 配下の各関数の配置を「itemOrder/callables」に更新する。
