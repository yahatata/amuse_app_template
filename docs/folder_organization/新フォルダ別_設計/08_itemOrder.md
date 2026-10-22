# 新フォルダ別設計：itemOrder

## 5.1 ドメイン定義（短く）

注文・メニューを担当するドメイン。メニュー取得・CRUD（作成・更新・売切切替）、注文確定（スタッフ/ユーザー）、注文履歴取得、注文取り消しを含む。

**主に扱うデータ/コレクション**
- menuItems, administrativeMenu/current, bills/items, orders/_TodaysOrders
- helpers/billsApi（getActiveBillByUser, appendItem, resolveMenuItem）。helpers/stateDoc（getCurrentBusinessDateKeyOrThrow）。utils/logUtils。lib/devicePermissions

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | メニュー取得・メニューCRUD・注文確定・注文履歴・注文取消の onCall 入口（8 本） |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| itemOrder/index.ts | domains/itemOrder の再構成 | — |  |
| itemOrder/getMenuItems.ts | domains/itemOrder/callables/getMenuItems.ts | callable |  |
| itemOrder/createMenuItem.ts | domains/itemOrder/callables/createMenuItem.ts | callable |  |
| itemOrder/updateMenuItem.ts | domains/itemOrder/callables/updateMenuItem.ts | callable |  |
| itemOrder/toggleSoldOutForMenuItem.ts | domains/itemOrder/callables/toggleSoldOutForMenuItem.ts | callable |  |
| itemOrder/placeOrder.ts | domains/itemOrder/callables/placeOrder.ts | callable | helpers/billsApi, utils/logUtils → domains/bills/repos, domains/user/services に変更 |
| itemOrder/placeOrderByUser.ts | domains/itemOrder/callables/placeOrderByUser.ts | callable | 同上 |
| itemOrder/getUserOrderHistory.ts | domains/itemOrder/callables/getUserOrderHistory.ts | callable | helpers/stateDoc → domains/storeMeta/repos 参照に変更 |
| itemOrder/cancelOrder.ts | domains/itemOrder/callables/cancelOrder.ts | callable |  |

---

## 5.4 index.ts 変更方針

- **ルート index**：`export * from "./itemOrder"` を `export * from "./domains/itemOrder"` に変更。関数名は維持。
- **domains/itemOrder/index.ts**：callables 8 本を re-export。
- **helpers/billsApi** を domains/bills/repos、**stateDoc** を domains/storeMeta/repos、**lib/devicePermissions** を shared/devices から参照するよう import パスを更新する（08 確定）。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。bills/repos、storeMeta/repos、user/services の参照ができること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **設計**：itemOrder ドメイン設計で、helpers/billsApi → domains/bills/repos、stateDoc → domains/storeMeta/repos、lib/devicePermissions → shared/devices の import パスに更新する（08 確定）。
- **changeSpec**：itemOrder 移管時にルート index.ts の **import パス** を `domains/itemOrder` に更新する。export 名は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行先確定後、itemOrder 配下の各関数の配置を「itemOrder/callables」に更新する。
