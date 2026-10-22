# P1-10 データ参照変更計画書

_最終更新: 2025-12-04 (JST)_

## 概要

P1-10では、`migrateSettledBillsForBusinessDay.ts` が参照するデータソースを `todaysBills` から `bills` コレクションに変更する。本ドキュメントでは、`analyticsMonthly` の各フィールドを生成するために必要なデータを、`todaysBills`、`bills` 親ドキュメントのみ、`bills` 親ドキュメント＋サブコレクションの3パターンで比較し、実装方針を明確にする。

## P1-10で参照するファイル

### 主要ファイル
- **`functions/src/analytics/migrateSettledBillsForBusinessDay.ts`**
  - 閉店バッチのエントリポイント。確定済み伝票を `todaysBills` から読み取り、`analyticsMonthly` に集計する。
  - **変更対象**: `todaysBills` クエリを `bills` クエリに変更、データ取得ロジックを変更。

### 依存ヘルパー関数
- **`functions/src/analytics/addToMonthlyIndex.ts`**
  - `analyticsMonthly/{YYYY-MM}` 親ドキュメントを更新。
- **`functions/src/analytics/addToDailySummary.ts`**
  - `analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}` を更新。
- **`functions/src/analytics/addToByCategory.ts`**
  - `analyticsMonthly/{YYYY-MM}/byCategory/summary` を更新。
- **`functions/src/analytics/addToByTemplateTournaments.ts`**
  - `analyticsMonthly/{YYYY-MM}/byTemplateTournaments/{templateKey}` を更新。
- **`functions/src/analytics/addToByUser.ts`**
  - `analyticsMonthly/{YYYY-MM}/byUser/{userId}` を更新。
- **`functions/src/analytics/helpers.ts`**
  - `calculateCategoryAmounts()`: カテゴリ別金額を計算。
  - `distributePaymentMethods()`: 支払い方法を配賦。

### 関連ファイル（確認用）
- **`functions/src/close_process/index.ts`**
  - 閉店バッチのエントリポイント。`migrateSettledBillsForBusinessDay` の呼び出し順序を確認。
- **`functions/src/triggers/bills.events.onCreate.ts`**
  - 事後イベント（返金・調整）の処理。`postEvents` の更新が閉店バッチの参照値に影響する可能性がある。

---

## スキーマ定義

### 1. `todaysBills` コレクション（現行・廃止予定）

**パス**: `todaysBills/{billId}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `userId` | `string` | 顧客UID |
| `pokerName` | `string \| null` | ポーカー名（表示用） |
| `date` | `string` (YYYY-MM-DD) | 営業日 |
| `status` | `enum` | 伝票状態（`settled` が対象） |
| `items` | `array<{menuItemId?:string, name:string, category?:string, quantity:number, totalPrice:number}>` | 商品明細配列 |
| `sideGameChip` | `array<{action:'purchase'\|'deposit'\|'withdraw', totalPrice?:number, chipCount?:number}>` | サイドゲームチップ取引配列 |
| `extraCost` | `array<{name:string, price:number \| totalPrice:number}>` | 追加料金配列 |
| `tournaments` | `object<{templateId?:string, templateName:string, entryFee?:number, entryCount?:number, reentryFee?:number, reentryCount?:number, addonFee?:number, addonCount?:number}>` | トーナメント参加記録（テンプレートIDをキーとするオブジェクト） |
| `paymentMethodsByCategory` | `Record<string, string \| Array<{method: string, amount: number}>>` | カテゴリ別支払い方法（キー: カテゴリ名、値: 支払い方法（文字列）または配列（method + amount））。実コードの `StartAccountingSchema` に合わせる |

**注意**: `todaysBills` はフラットな構造で、すべてのデータが親ドキュメントに含まれている。

---

### 2. `bills` コレクション（新スキーマ）

#### 2.1. 親ドキュメント `/bills/{billId}`

**パス**: `bills/{billId}`

| セクション | フィールド名 | 型 | 更新タイミング | 説明 |
|-----------|------------|-----|--------------|------|
| 識別 | `businessDate` | `string` (YYYY-MM-DD) | 入店時 | 営業日 |
|  | `status` | `enum` | ライフサイクル | 伝票状態（`settled` が対象） |
| 来店情報 | `party.userId` | `string` | 入店時 | 顧客UID（Immutable） |
|  | `party.pokerName` | `string \| null` | 入店時 | ポーカー名（表示用） |
| 金額スナップショット | `amounts.grandTotalRounded` | `number` | 確定時 | 最終税込額（閉店バッチ基準） |
| 閉店バッチ用スナップショット | `categoryBreakdown` | `{items:number, extraCost:number, sideGameChips:number, tournaments:number}` | 確定時 | 税込・カテゴリ別小計 |
|  | `paymentTotals` | `map<string,number>` | 確定時 + イベント | 支払方法別合計（キー: 小文字スネークケース） |
|  | `itemsSnapshot` | `map<string,{qty:number,salesIncl:number,name:string,category:string}>` | 確定時 | 品目別最小スナップショット（キー: `menuItemId`、700KB超は圧縮） |
|  | `sideGameChipsSummary` | `{purchased:number,deposited:number,withdrawn:number,net:number}` | 確定時 | サイドゲーム取引サマリ |
|  | `tournamentsSnapshot` | `map<string,{templateName:string,entryCount:number,entrySalesIncl:number,reentryCount:number,reentrySalesIncl:number,addonCount:number,addonSalesIncl:number,totalTournamentSalesIncl:number,pointsAwardedTotal:number,prizeAmountTotalIncl:number}>` | 確定時 | テンプレート別スナップショット（キー: `templateId` または `templateName` をキー化したもの） |

**重要**: 親ドキュメントのスナップショットは会計確定時（`status='settled'` 遷移時）に Cloud Functions が書き込む。閉店バッチは確定済み伝票のみを処理するため、これらのスナップショットが存在する前提で実装できる。

#### 2.2. サブコレクション `/bills/{billId}/items/{itemId}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `menuItemId` | `string \| null` | マスターID |
| `name` | `string` | 商品名 |
| `category` | `string \| null` | 販売カテゴリ |
| `quantity` | `number` | 数量 |
| `totalPriceIncl` | `number` | 行合計（税込） |
| `voided` | `boolean` | 行取消フラグ |

#### 2.3. サブコレクション `/bills/{billId}/extras/{extraId}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `name` | `string` | 料金名 |
| `amountIncl` | `number` | 税込額 |

#### 2.4. サブコレクション `/bills/{billId}/sideGameChips/{chipId}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `action` | `enum('purchase','deposit','withdraw')` | アクション種別 |
| `chipQty` | `number` | チップ数量 |
| `amountIncl` | `number \| null` | 税込額（`action='purchase'` の場合のみ） |

#### 2.5. サブコレクション `/bills/{billId}/tournaments/{tplId}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `templateId` | `string` | テンプレID |
| `templateName` | `string` | テンプレ名 |
| `entryFeeIncl` | `number \| null` | エントリー費 |
| `entryCount` | `number \| null` | エントリー回数 |
| `reentryFeeIncl` | `number \| null` | リエントリー費 |
| `reentryCount` | `number \| null` | リエントリー回数 |
| `addonFeeIncl` | `number \| null` | アドオン費 |
| `addonCount` | `number \| null` | アドオン回数 |

---

### 3. `analyticsMonthly` コレクション（出力先・変更なし）

#### 3.1. 親ドキュメント `analyticsMonthly/{YYYY-MM}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `itemsSales` | `number` | 商品カテゴリの月間売上合計（税込） |
| `sideGameChipSales` | `number` | サイドゲームチップカテゴリの月間売上合計（税込） |
| `extraCostSales` | `number` | 追加料金カテゴリの月間売上合計（税込） |
| `tournamentsSales` | `number` | トーナメントカテゴリの月間売上合計（税込） |
| `grossSales` | `number` | 月間総売上（全カテゴリ合計、税込） |
| `orderCount` | `number` | 月間来店数（確定済み伝票数） |
| `avgOrderValue` | `number` | 平均客単価（`grossSales / orderCount`） |
| `dailySales` | `Map<String, number>` | 日別総売上のマップ（キー: `YYYY-MM-DD`） |
| `paymentTotals` | `Map<String, number>` | 支払い方法別の月間売上合計（キー: `cash`, `credit_card`, `electronic_money`, `pointA`, `pointB`, `sideGameChip`） |

#### 3.2. サブコレクション `analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `itemsSales` | `number` | その日の商品カテゴリ売上（税込） |
| `sideGameChipSales` | `number` | その日のサイドゲームチップカテゴリ売上（税込） |
| `extraCostSales` | `number` | その日の追加料金カテゴリ売上（税込） |
| `tournamentsSales` | `number` | その日のトーナメントカテゴリ売上（税込） |
| `grossSales` | `number` | その日の総売上（全カテゴリ合計、税込） |
| `orderCount` | `number` | その日の来店数（確定済み伝票数） |
| `byCategory` | `Map<String, number>` | カテゴリ別の日次売上（キー: `items`, `sideGameChip`, `extraCost`, `tournaments`） |
| `byPaymentMethod` | `Map<String, number>` | 支払い方法別の日次売上 |

#### 3.3. サブコレクション `analyticsMonthly/{YYYY-MM}/byCategory/summary`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `totals` | `Map<String, number>` | カテゴリ別の月間売上合計（キー: `items`, `sideGameChip`, `extraCost`, `tournaments`） |
| `orderCounts` | `Map<String, number>` | カテゴリ別の月間注文数 |
| `itemSales` | `Map<String, ItemSalesData>` | 商品別の月間売上データ（キー: `menuItemId`） |
| `itemSales.{menuItemId}.qty` | `number` | その商品の月間販売数量 |
| `itemSales.{menuItemId}.sales` | `number` | その商品の月間売上（税込） |
| `itemSales.{menuItemId}.name` | `string` | 商品名 |
| `itemSales.{menuItemId}.category` | `string` | 商品カテゴリ |

#### 3.4. サブコレクション `analyticsMonthly/{YYYY-MM}/byTemplateTournaments/{templateKey}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `templateName` | `string` | トーナメントテンプレート名 |
| `daily.{YYYY-MM-DD}.entryCount` | `number` | その日のエントリー数 |
| `daily.{YYYY-MM-DD}.entrySales` | `number` | その日のエントリー料売上（税込） |
| `daily.{YYYY-MM-DD}.reentryCount` | `number` | その日のリエントリー数 |
| `daily.{YYYY-MM-DD}.reentrySales` | `number` | その日のリエントリー料売上（税込） |
| `daily.{YYYY-MM-DD}.addonCount` | `number` | その日のアドオン数 |
| `daily.{YYYY-MM-DD}.addonSales` | `number` | その日のアドオン料売上（税込） |
| `daily.{YYYY-MM-DD}.totalTournamentSales` | `number` | その日のトーナメント総売上（税込） |
| `totals.entryCount` | `number` | 月間エントリー数合計 |
| `totals.entrySales` | `number` | 月間エントリー料売上合計（税込） |
| `totals.reentryCount` | `number` | 月間リエントリー数合計 |
| `totals.reentrySales` | `number` | 月間リエントリー料売上合計（税込） |
| `totals.addonCount` | `number` | 月間アドオン数合計 |
| `totals.addonSales` | `number` | 月間アドオン料売上合計（税込） |
| `totals.totalTournamentSales` | `number` | 月間トーナメント総売上合計（税込） |

#### 3.5. サブコレクション `analyticsMonthly/{YYYY-MM}/byUser/{userId}`

| フィールド名 | 型 | 説明 |
|------------|-----|------|
| `grossSales` | `number` | そのユーザーの月間総売上（税込） |
| `itemsSales` | `number` | そのユーザーの月間商品カテゴリ売上（税込） |
| `extraCostSales` | `number` | そのユーザーの月間追加料金カテゴリ売上（税込） |
| `sideGameChipSales` | `number` | そのユーザーの月間サイドゲームチップカテゴリ売上（税込） |
| `tournamentsSales` | `number` | そのユーザーの月間トーナメントカテゴリ売上（税込） |
| `orderCount` | `number` | そのユーザーの月間来店数 |
| `dailySales` | `Map<String, number>` | そのユーザーの日別総売上（キー: `YYYY-MM-DD`） |
| `paymentTotals` | `Map<String, number>` | そのユーザーの支払い方法別月間売上 |
| `pokerName` | `string` | そのユーザーのポーカー名（表示用） |

---

## データ参照マッピング表

### 表の見方
- **todaysBills（現行）**: 現在 `migrateSettledBillsForBusinessDay.ts` が参照している `todaysBills` のフィールド
- **bills 親DOCのみ**: `bills/{billId}` 親ドキュメントのスナップショットのみを参照する場合
- **bills 親DOC + サブコレクション**: `bills/{billId}` 親ドキュメントとサブコレクションの両方を参照する場合
- **作成可否**: 親DOCのみで作成できるか、サブコレクションも必要かを示す
  - ✅: 作成可能
  - ⚠️: 部分的に作成可能（一部データが欠落する可能性）
  - ❌: 作成不可（必要なデータが存在しない）

---

### 1. `analyticsMonthly/{YYYY-MM}` 親ドキュメント

| analyticsMonthly フィールド | todaysBills（現行） | bills 親DOCのみ | bills 親DOC + サブコレクション | 作成可否（親DOCのみ） | 作成可否（親DOC+サブ） |
|---------------------------|-------------------|----------------|---------------------------|-------------------|---------------------|
| `itemsSales` | `items[].totalPrice` の合計 | `categoryBreakdown.items` | `categoryBreakdown.items` または `/items` から計算 | ✅ | ✅ |
| `sideGameChipSales` | `sideGameChip[].totalPrice` の合計（`action='purchase'` のみ） | `categoryBreakdown.sideGameChips` | `categoryBreakdown.sideGameChips` または `/sideGameChips` から計算（`action='purchase'` のみ） | ✅ | ✅ |
| `extraCostSales` | `extraCost[].price` の合計 | `categoryBreakdown.extraCost` | `categoryBreakdown.extraCost` または `/extras` から計算 | ✅ | ✅ |
| `tournamentsSales` | `tournaments[].entryFee + reentryFee * reentryCount + addonFee * addonCount` の合計 | `categoryBreakdown.tournaments` | `categoryBreakdown.tournaments` または `/tournaments` から計算 | ✅ | ✅ |
| `grossSales` | 上記4カテゴリの合計 | `categoryBreakdown` の合計 | `categoryBreakdown` の合計 | ✅ | ✅ |
| `orderCount` | 伝票数（1伝票 = 1） | 伝票数（1伝票 = 1） | 伝票数（1伝票 = 1） | ✅ | ✅ |
| `avgOrderValue` | `grossSales / orderCount` | `grossSales / orderCount` | `grossSales / orderCount` | ✅ | ✅ |
| `dailySales.{businessDate}` | `grossSales` | `categoryBreakdown` の合計 | `categoryBreakdown` の合計 | ✅ | ✅ |
| `paymentTotals.{method}` | `paymentMethodsByCategory` と `categoryAmounts` から `distributePaymentMethods()` で計算 | `paymentTotals.{method}` | `paymentTotals.{method}` | ✅ | ✅ |

**結論**: 親DOCのみで全てのフィールドを作成可能。`categoryBreakdown` と `paymentTotals` が確定時にスナップショットとして保存されているため。

---

### 2. `analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}`

| analyticsMonthly フィールド | todaysBills（現行） | bills 親DOCのみ | bills 親DOC + サブコレクション | 作成可否（親DOCのみ） | 作成可否（親DOC+サブ） |
|---------------------------|-------------------|----------------|---------------------------|-------------------|---------------------|
| `itemsSales` | `items[].totalPrice` の合計 | `categoryBreakdown.items` | `categoryBreakdown.items` | ✅ | ✅ |
| `sideGameChipSales` | `sideGameChip[].totalPrice` の合計（`action='purchase'` のみ） | `categoryBreakdown.sideGameChips` | `categoryBreakdown.sideGameChips` | ✅ | ✅ |
| `extraCostSales` | `extraCost[].price` の合計 | `categoryBreakdown.extraCost` | `categoryBreakdown.extraCost` | ✅ | ✅ |
| `tournamentsSales` | `tournaments[].entryFee + ...` の合計 | `categoryBreakdown.tournaments` | `categoryBreakdown.tournaments` | ✅ | ✅ |
| `grossSales` | 上記4カテゴリの合計 | `categoryBreakdown` の合計 | `categoryBreakdown` の合計 | ✅ | ✅ |
| `orderCount` | 伝票数（1伝票 = 1） | 伝票数（1伝票 = 1） | 伝票数（1伝票 = 1） | ✅ | ✅ |
| `byCategory.{category}` | `categoryAmounts` から取得 | `categoryBreakdown.{category}` | `categoryBreakdown.{category}` | ✅ | ✅ |
| `byPaymentMethod.{method}` | `paymentMethodsByCategory` と `categoryAmounts` から `distributePaymentMethods()` で計算 | `paymentTotals.{method}` | `paymentTotals.{method}` | ✅ | ✅ |

**結論**: 親DOCのみで全てのフィールドを作成可能。

---

### 3. `analyticsMonthly/{YYYY-MM}/byCategory/summary`

| analyticsMonthly フィールド | todaysBills（現行） | bills 親DOCのみ | bills 親DOC + サブコレクション | 作成可否（親DOCのみ） | 作成可否（親DOC+サブ） |
|---------------------------|-------------------|----------------|---------------------------|-------------------|---------------------|
| `totals.{category}` | `categoryAmounts` から取得 | `categoryBreakdown.{category}` | `categoryBreakdown.{category}` | ✅ | ✅ |
| `orderCounts.{category}` | カテゴリごとに1（伝票単位） | カテゴリごとに1（伝票単位） | カテゴリごとに1（伝票単位） | ✅ | ✅ |
| `itemSales.{menuItemId}.qty` | `items[].quantity` の合計（`menuItemId` でグループ化） | `itemsSnapshot.{menuItemId}.qty` | `itemsSnapshot.{menuItemId}.qty` または `/items` から計算 | ✅（`itemsSnapshot` が存在する場合。圧縮時は Top50 + `_others`） | ✅ |
| `itemSales.{menuItemId}.sales` | `items[].totalPrice` の合計（`menuItemId` でグループ化） | `itemsSnapshot.{menuItemId}.salesIncl` | `itemsSnapshot.{menuItemId}.salesIncl` または `/items` から計算 | ✅（`itemsSnapshot` が存在する場合。圧縮時は Top50 + `_others`） | ✅ |
| `itemSales.{menuItemId}.name` | `items[].name` | `itemsSnapshot.{menuItemId}.name` | `itemsSnapshot.{menuItemId}.name` または `/items` から取得 | ✅（`itemsSnapshot` が存在する場合。圧縮時は Top50 + `_others`） | ✅ |
| `itemSales.{menuItemId}.category` | `items[].category` | `itemsSnapshot.{menuItemId}.category` | `itemsSnapshot.{menuItemId}.category` または `/items` から取得 | ✅（`itemsSnapshot` が存在する場合。圧縮時は Top50 + `_others`） | ✅ |
| `itemSales._others.qty` | - | `itemsSnapshot._others.qty`（圧縮時のみ存在） | - | ✅（`itemsSnapshot` が圧縮されている場合のみ） | - |
| `itemSales._others.sales` | - | `itemsSnapshot._others.salesIncl`（圧縮時のみ存在） | - | ✅（`itemsSnapshot` が圧縮されている場合のみ） | - |
| `itemSales._others.name` | - | `"その他"` または空文字列（固定値） | - | ✅（`itemsSnapshot` が圧縮されている場合のみ） | - |
| `itemSales._others.category` | - | `null` または空文字列（固定値） | - | ✅（`itemsSnapshot` が圧縮されている場合のみ） | - |

**結論**: 
- `totals` と `orderCounts`: 親DOCのみで作成可能。
- `itemSales`: 
  - 親DOCのみ: `itemsSnapshot` が存在する場合、常に作成可能。
    - 圧縮されていない場合（700KB以下）: 全商品を個別に作成可能。
    - 圧縮されている場合（Top50 + その他合算）: Top50の商品を個別に作成し、残りの商品は `itemSales._others` として合算値を加算していく。`_others` の `name` は `"その他"` または空文字列、`category` は `null` または空文字列とする。
  - 親DOC + サブコレクション: 常に作成可能（`/items` サブコレクションから全商品を取得して計算）。

---

### 4. `analyticsMonthly/{YYYY-MM}/byTemplateTournaments/{templateKey}`

| analyticsMonthly フィールド | todaysBills（現行） | bills 親DOCのみ | bills 親DOC + サブコレクション | 作成可否（親DOCのみ） | 作成可否（親DOC+サブ） |
|---------------------------|-------------------|----------------|---------------------------|-------------------|---------------------|
| `templateName` | `tournaments[].templateName` | `tournamentsSnapshot.{templateKey}.templateName` | `tournamentsSnapshot.{templateKey}.templateName` または `/tournaments` から取得 | ✅ | ✅ |
| `daily.{businessDate}.entryCount` | `tournaments[].entryCount` | `tournamentsSnapshot.{templateKey}.entryCount` | `tournamentsSnapshot.{templateKey}.entryCount` または `/tournaments` から取得 | ✅ | ✅ |
| `daily.{businessDate}.entrySales` | `tournaments[].entryFee` | `tournamentsSnapshot.{templateKey}.entrySalesIncl` | `tournamentsSnapshot.{templateKey}.entrySalesIncl` または `/tournaments` から計算 | ✅ | ✅ |
| `daily.{businessDate}.reentryCount` | `tournaments[].reentryCount` | `tournamentsSnapshot.{templateKey}.reentryCount` | `tournamentsSnapshot.{templateKey}.reentryCount` または `/tournaments` から取得 | ✅ | ✅ |
| `daily.{businessDate}.reentrySales` | `tournaments[].reentryFee * reentryCount` | `tournamentsSnapshot.{templateKey}.reentrySalesIncl` | `tournamentsSnapshot.{templateKey}.reentrySalesIncl` または `/tournaments` から計算 | ✅ | ✅ |
| `daily.{businessDate}.addonCount` | `tournaments[].addonCount` | `tournamentsSnapshot.{templateKey}.addonCount` | `tournamentsSnapshot.{templateKey}.addonCount` または `/tournaments` から取得 | ✅ | ✅ |
| `daily.{businessDate}.addonSales` | `tournaments[].addonFee * addonCount` | `tournamentsSnapshot.{templateKey}.addonSalesIncl` | `tournamentsSnapshot.{templateKey}.addonSalesIncl` または `/tournaments` から計算 | ✅ | ✅ |
| `daily.{businessDate}.totalTournamentSales` | 上記3つの合計 | `tournamentsSnapshot.{templateKey}.totalTournamentSalesIncl` | `tournamentsSnapshot.{templateKey}.totalTournamentSalesIncl` または `/tournaments` から計算 | ✅ | ✅ |
| `totals.entryCount` | 月間合計 | `tournamentsSnapshot.{templateKey}.entryCount` の月間合計 | `tournamentsSnapshot.{templateKey}.entryCount` の月間合計 | ✅ | ✅ |
| `totals.entrySales` | 月間合計 | `tournamentsSnapshot.{templateKey}.entrySalesIncl` の月間合計 | `tournamentsSnapshot.{templateKey}.entrySalesIncl` の月間合計 | ✅ | ✅ |
| `totals.reentryCount` | 月間合計 | `tournamentsSnapshot.{templateKey}.reentryCount` の月間合計 | `tournamentsSnapshot.{templateKey}.reentryCount` の月間合計 | ✅ | ✅ |
| `totals.reentrySales` | 月間合計 | `tournamentsSnapshot.{templateKey}.reentrySalesIncl` の月間合計 | `tournamentsSnapshot.{templateKey}.reentrySalesIncl` の月間合計 | ✅ | ✅ |
| `totals.addonCount` | 月間合計 | `tournamentsSnapshot.{templateKey}.addonCount` の月間合計 | `tournamentsSnapshot.{templateKey}.addonCount` の月間合計 | ✅ | ✅ |
| `totals.addonSales` | 月間合計 | `tournamentsSnapshot.{templateKey}.addonSalesIncl` の月間合計 | `tournamentsSnapshot.{templateKey}.addonSalesIncl` の月間合計 | ✅ | ✅ |
| `totals.totalTournamentSales` | 月間合計 | `tournamentsSnapshot.{templateKey}.totalTournamentSalesIncl` の月間合計 | `tournamentsSnapshot.{templateKey}.totalTournamentSalesIncl` の月間合計 | ✅ | ✅ |

**結論**: 親DOCのみで全てのフィールドを作成可能。`tournamentsSnapshot` に必要な情報が全て含まれている。

**注意**: `tournamentsSnapshot` のキーは `templateId` を優先し、なければ `templateName` をキー化したもの。`todaysBills` では `tournaments` がオブジェクトで、キーが `templateId` または `templateName` だったが、`bills` では `tournamentsSnapshot` のキーが統一されている。

---

### 5. `analyticsMonthly/{YYYY-MM}/byUser/{userId}`

| analyticsMonthly フィールド | todaysBills（現行） | bills 親DOCのみ | bills 親DOC + サブコレクション | 作成可否（親DOCのみ） | 作成可否（親DOC+サブ） |
|---------------------------|-------------------|----------------|---------------------------|-------------------|---------------------|
| `grossSales` | `categoryAmounts` の合計 | `categoryBreakdown` の合計 | `categoryBreakdown` の合計 | ✅ | ✅ |
| `itemsSales` | `items[].totalPrice` の合計 | `categoryBreakdown.items` | `categoryBreakdown.items` | ✅ | ✅ |
| `extraCostSales` | `extraCost[].price` の合計 | `categoryBreakdown.extraCost` | `categoryBreakdown.extraCost` | ✅ | ✅ |
| `sideGameChipSales` | `sideGameChip[].totalPrice` の合計（`action='purchase'` のみ） | `categoryBreakdown.sideGameChips` | `categoryBreakdown.sideGameChips` | ✅ | ✅ |
| `tournamentsSales` | `tournaments[].entryFee + ...` の合計 | `categoryBreakdown.tournaments` | `categoryBreakdown.tournaments` | ✅ | ✅ |
| `orderCount` | 伝票数（1伝票 = 1） | 伝票数（1伝票 = 1） | 伝票数（1伝票 = 1） | ✅ | ✅ |
| `dailySales.{businessDate}` | `grossSales` | `categoryBreakdown` の合計 | `categoryBreakdown` の合計 | ✅ | ✅ |
| `paymentTotals.{method}` | `paymentMethodsByCategory` と `categoryAmounts` から `distributePaymentMethods()` で計算 | `paymentTotals.{method}` | `paymentTotals.{method}` | ✅ | ✅ |
| `pokerName` | `pokerName` | `party.pokerName` | `party.pokerName` | ✅ | ✅ |

**結論**: 親DOCのみで全てのフィールドを作成可能。

---

## 実装方針の比較

### パターンA: 親DOCのみで実装

**メリット**:
- ✅ **1伝票あたり1リード**: パフォーマンスが最適。閉店バッチの原則に合致。
- ✅ **実装がシンプル**: サブコレクションの読み取りロジックが不要。
- ✅ **トランザクション効率**: 事前読み取りが少なく、トランザクション時間が短い。

**デメリット**:
- ⚠️ **`itemSales` の精度**: `itemsSnapshot` が圧縮されている場合（700KB超）、Top50のみが正確で、その他は合算値になる。商品別詳細が完全ではない可能性がある。

**制約**:
- `itemsSnapshot` が存在し、かつ圧縮されていない場合（700KB以下）は、`itemSales` も完全に作成可能。
- `itemsSnapshot` が圧縮されている場合、`itemSales` は Top50 + その他合算になるため、商品別詳細が完全ではない。

**推奨**: **パターンA（親DOCのみ）を推奨**。閉店バッチの原則（1伝票あたり1リード）に合致し、パフォーマンスが最適。`itemSales` の精度については、圧縮されていない場合は完全、圧縮されている場合は Top50 + その他合算で許容範囲内と判断。

---

### パターンB: 親DOC + サブコレクションで実装

**メリット**:
- ✅ **`itemSales` の完全性**: `/items` サブコレクションから全商品を取得するため、圧縮の影響を受けず、商品別詳細が完全。

**デメリット**:
- ❌ **1伝票あたり複数リード**: サブコレクション（`items`, `extras`, `sideGameChips`, `tournaments`）を読み取るため、1伝票あたり5リード以上になる可能性がある。閉店バッチの原則に反する。
- ❌ **パフォーマンス低下**: 大量の伝票を処理する場合、読み取りコストが大幅に増加。
- ❌ **トランザクション時間増加**: 事前読み取りが増え、トランザクション時間が長くなる。

**推奨**: **パターンBは非推奨**。閉店バッチの原則（1伝票あたり1リード）に反し、パフォーマンスが大幅に低下する。

---

## 実装時の注意点

### 1. `itemsSnapshot` の圧縮について

`bills` スキーマでは、`itemsSnapshot` が700KBを超える場合、Top50 + その他合算に圧縮される。この場合、`analyticsMonthly/{YYYY-MM}/byCategory/summary` の `itemSales` は以下のようになる：

- Top50の商品: 個別に正確な `qty`, `sales`, `name`, `category` が記録される。
- その他の商品: `itemsSnapshot._others` として合算値が記録される（`qty`, `salesIncl` が存在）。

**対応方針**: 
- パターンA（親DOCのみ）を採用する場合、圧縮されている場合でも `itemSales` を作成する。
  - Top50の商品: `itemsSnapshot` から個別に `itemSales.{menuItemId}` を作成する。
  - その他の商品: `itemsSnapshot._others` が存在する場合、`itemSales._others` を作成し、以下の値を設定する：
    - `itemSales._others.qty`: `itemsSnapshot._others.qty` の値を加算していく。
    - `itemSales._others.sales`: `itemsSnapshot._others.salesIncl` の値を加算していく。
    - `itemSales._others.name`: `"その他"` または空文字列（固定値）。
    - `itemSales._others.category`: `null` または空文字列（固定値）。
- パフォーマンスを優先し、商品別詳細の完全性よりも、閉店バッチの原則（1伝票あたり1リード）を優先する。

### 2. `paymentTotals` の取得

`bills` 親ドキュメントの `paymentTotals` は、確定時 + イベント（返金・調整）で更新される。閉店バッチは確定済み伝票のみを処理するため、確定時点の `paymentTotals` が存在する前提で実装できる。

**注意**: 事後イベント（返金・調整）が発生した場合、`paymentTotals` は更新されるが、閉店バッチは既に処理済みの伝票を再処理しない（`aggregationMarkers` で重複チェック）。事後イベントの影響は、別途イベントトリガで `analyticsMonthly` を差分更新する必要がある（P1-10の範囲外）。

### 3. `tournamentsSnapshot` のキー

`bills` の `tournamentsSnapshot` のキーは `templateId` を優先し、なければ `templateName` をキー化したもの（`/[^a-zA-Z0-9]/g` を `_` に置換）。`todaysBills` では `tournaments` がオブジェクトで、キーが `templateId` または `templateName` だったが、`bills` では統一されている。

**実装時**: `tournamentsSnapshot` のキーをそのまま使用すればよい。

### 4. `businessDate` の取得

`bills` では `businessDate` フィールドが親ドキュメントに存在する。`todaysBills` では `date` フィールドだったが、`bills` では `businessDate` に統一されている。

**実装時**: クエリ条件を `where('date', '==', businessDate)` から `where('businessDate', '==', businessDate)` に変更する。

### 5. `userId` と `pokerName` の取得

`bills` では `party.userId` と `party.pokerName` に変更されている。

**実装時**: `billData.userId` → `billData.party.userId`、`billData.pokerName` → `billData.party.pokerName` に変更する。

---

## 推奨実装方針

**パターンA（親DOCのみ）を推奨**

### 理由
1. **閉店バッチの原則に合致**: 1伝票あたり1リードで、パフォーマンスが最適。
2. **実装がシンプル**: サブコレクションの読み取りロジックが不要。
3. **`itemSales` の精度**: 圧縮されていない場合は完全、圧縮されている場合は Top50 + `_others`（その他合算）で作成可能。`_others` には合算値が加算されていく。

### 実装時の変更点

1. **クエリ変更**:
   ```typescript
   // Before
   const billsQuery = await db.collection('todaysBills')
     .where('status', '==', 'settled')
     .where('date', '==', businessDate)
     .get();
   
   // After
   const billsQuery = await db.collection('bills')
     .where('status', '==', 'settled')
     .where('businessDate', '==', businessDate)
     .get();
   ```

2. **データ取得の変更**:
   - `billData.userId` → `billData.party.userId`
   - `billData.pokerName` → `billData.party.pokerName`
   - `billData.items` → `billData.itemsSnapshot`（`itemSales` 用）
   - `billData.sideGameChip` → `billData.categoryBreakdown.sideGameChips`（金額のみ）
   - `billData.extraCost` → `billData.categoryBreakdown.extraCost`（金額のみ）
   - `billData.tournaments` → `billData.tournamentsSnapshot`（テンプレート別スナップショット）
   - `billData.paymentMethodsByCategory` → `billData.paymentTotals`（支払い方法別合計）

3. **`calculateCategoryAmounts()` の変更**:
   - `bills` 親ドキュメントの `categoryBreakdown` を直接使用するように変更。

4. **`distributePaymentMethods()` の変更**:
   - `paymentMethodsByCategory` の代わりに、`paymentTotals` を直接使用するように変更（既に配賦済み）。

5. **`itemSales` の作成**:
   - `itemsSnapshot` から `itemSales` を作成する。
   - 圧縮されていない場合: 全商品を個別に `itemSales.{menuItemId}` として作成する。
   - 圧縮されている場合: Top50の商品を個別に `itemSales.{menuItemId}` として作成し、残りの商品は `itemSales._others` として合算値を加算していく。`_others` の `name` は `"その他"` または空文字列、`category` は `null` または空文字列とする。

---

## まとめ

| 項目 | パターンA（親DOCのみ） | パターンB（親DOC+サブ） |
|-----|---------------------|---------------------|
| **1伝票あたりのリード数** | 1リード | 5リード以上 |
| **パフォーマンス** | ✅ 最適 | ❌ 低下 |
| **実装の複雑さ** | ✅ シンプル | ❌ 複雑 |
| **`itemSales` の精度** | ✅ 圧縮時は Top50 + `_others`（その他合算） | ✅ 完全 |
| **推奨** | ✅ **推奨** | ❌ 非推奨 |

**結論**: パターンA（親DOCのみ）を採用し、閉店バッチの原則（1伝票あたり1リード）を優先する。`itemSales` の精度については、圧縮されていない場合は完全、圧縮されている場合は Top50 + `_others`（その他合算）で作成可能。`_others` には合算値が加算されていく。

