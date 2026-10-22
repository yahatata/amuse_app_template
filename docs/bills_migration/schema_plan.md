# Bills スキーマ（確定版 v1.3）

_最終更新: 2025-11-10 (JST)_

## コレクション構成
```
/bills/{billId}
  ├─ items/{itemId}
  ├─ extras/{extraId}
  ├─ payments/{paymentId}
  ├─ events/{eventId}
  ├─ sideGameChips/{chipId}
  └─ tournaments/{tplId}

/activeStays/{uid}
```
- `bills` … 会計データの正本（SSoT）。営業中の明細はサブコレに記録し、確定時に親へスナップショットを書き込み。
- `activeStays` … 滞在ユーザー管理専用の最小スキーマ。会計確定で削除、取りこぼしは閉店 callableで掃除（TTLは不使用）。

## 親ドキュメント `/bills/{billId}`
| セクション | フィールド | 型 | 必須 | 書込主体 | 更新タイミング | 説明 |
| --- | --- | --- | --- | --- | --- | --- |
| 識別 | businessDate | string (YYYY-MM-DD) | 必須 | **Functions** | 入店時 | 売上の帰属日（JST解釈）。**Functions が `calcBusinessDate` で確定**。クライアントは提案値を送るのみ。時刻・TZオフセットを含めない純粋な営業日文字列。
|  | status | enum(`open`,`in_progress`,`settling`,`settled`,`partially_refunded`,`refunded`,`voided`) | 必須 | Client→Functions | ライフサイクル | 会計進行状態。settled 以降の変更は Functions のみ。
|  | createdAt | timestamp | 必須 | Functions(serverTimestamp) | 入店時 | 伝票作成時刻。
|  | updatedAt | timestamp | 必須 | **Functions 専任** | 各更新 | 最終更新時刻。**冪等リプレイ時は更新しない**。
|  | closedAt | timestamp \| null | 任意 | Functions | `settled` 遷移時 | 会計確定時刻。
|  | billId | string | 必須 | Client | 入店時 | ドキュメントIDのミラー。
|  | receiptNumber | string \| null | 任意 | Functions | 確定時 | レシート番号/外部連携ID。
| 来店情報 | party.userId | string | 必須 | Client | 入店時 | 顧客 UID（作成後は変更不可・Immutable）。
|  | party.pokerName | string | 任意 | Client | 入店時 | 表示名。
|  | place.table | string \| null | 任意 | Client | 滞在中 | 着席テーブル（LWW）。
|  | place.seat | number \| null | 任意 | Client | 滞在中 | 席番号（LWW）。
| 金額スナップショット（内税・確定時固定） | amounts.subTotalIncl | number | 必須 | Functions | 確定時 | 明細合計（税込）。
|  | amounts.discountTotalIncl | number | 必須 | Functions | 確定時 | 割引合計（値引きはプラス集計）。
|  | amounts.serviceChargeIncl | number | 必須 | Functions | 確定時 | サービス料（税込）。
|  | amounts.grandTotalIncl | number | 必須 | Functions | 確定時 | 丸め前の税込合計。
|  | amounts.roundingDelta | number | 必須 | Functions | 確定時 | 丸め差分。
|  | amounts.grandTotalRounded | number | 必須 | Functions | 確定時 | 最終税込額（閉店バッチ基準）。
|  | amounts.taxBreakdown[] | array<{rate:number,taxable:number,tax:number}> | 任意 | Functions | 確定時 | 逆算した税率別内訳。
|  | amounts.taxTotal | number | 任意 | Functions | 確定時 | 税額合計（逆算結果）。
| 閉店バッチ用スナップショット | categoryBreakdown | { items:number, extraCost:number, sideGameChips:number, tournaments:number } | 必須 | Functions | 確定時 | 税込・カテゴリ別小計。
|  | paymentTotals | map<string,number> | 必須 | Functions | 確定時 + イベント | 支払方法キーは小文字スネークケース（例: cash,credit_card,electronic_money）。
|  | itemsSnapshot | map<string,{qty:number,salesIncl:number,name:string,category:string}> | 任意 | Functions | 確定時 | 品目別最小スナップショット。700KB 超は Top50 + その他合算に圧縮。
|  | sideGameChipsSummary | {purchased:number,deposited:number,withdrawn:number,net:number} | 任意 | Functions | 確定時 | サイドゲーム取引サマリ。
|  | tournamentsSnapshot | map<string,{templateName:string,entryCount:number,entrySalesIncl:number,reentryCount:number,reentrySalesIncl:number,addonCount:number,addonSalesIncl:number,totalTournamentSalesIncl:number,pointsAwardedTotal:number,prizeAmountTotalIncl:number}> | 任意 | Functions | 確定時 | テンプレート別スナップショット。
| 事後イベント累計 | postEvents.totalRefundedIncl | number | 必須 | Functions | `/events` 作成時 | 返金総額（税込）。
|  | postEvents.totalAdjustmentsIncl | number | 必須 | Functions | `/events` 作成時 | 追徴/減額のネット（税込）。
|  | postEvents.netSalesIncl | number | 必須 | Functions | `/events` 作成時 | `grandTotalRounded - totalRefundedIncl + totalAdjustmentsIncl`。
| 決済サマリ | paymentsSummary.paidTotalIncl | number | 必須 | Functions | 支払い処理時 | 受領済み総額（税込）。
|  | paymentsSummary.balanceDueIncl | number | 必須 | Functions | 支払い処理時 | 未収額（税込）。集計表示は Nightly Recalculation を正とする。
|  | paymentsSummary.byMethod | map<string,number> | 任意 | Functions | 支払い処理時 | 方式別受領額。キーは小文字スネークケース。
| 運用・監査 | ops.accountingStartedAt | timestamp \| null | 任意 | Functions | 会計開始 | 会計開始時刻。
|  | ops.accountingCompletedAt | timestamp \| null | 任意 | Functions | 確定時 | 会計完了時刻。
|  | ops.accountingStartedBy | string \| null | 任意 | Functions | 会計開始 | オペレータ UID。
|  | ops.accountingCompletedBy | string \| null | 任意 | Functions | 確定時 | 会計完了オペレータ UID。
|  | ops.accountingHistoryId | string \| null | 任意 | Functions | 確定時 | 監査ログ参照ID。
|  | lineage.originalBillId | string \| null | 任意 | Functions | 移行時 | 旧ID。
|  | lineage.migratedAt | timestamp \| null | 任意 | Functions | 移行時 | 旧→新移行時刻。
| メタ | meta.schemaVersion | string | 必須 | Functions | 作成/確定 | 例: "1.3"。
|  | meta.contentHash | string \| null | 推奨 | Functions | 確定時 | 確定サマリの正規化ハッシュ。

**LWW（座席）**: `place.*` は serverTimestamp 到着順で最後に届いた値を採用（多端末でも安定）。

**SSoT**: ダッシュボード/レポートの最終値は Nightly Recalculation を正とする。

**金額整合の不変条件（Invariants）**:
- `grandTotalIncl = subTotalIncl - discountTotalIncl + serviceChargeIncl`
- `grandTotalRounded = roundToCurrency(grandTotalIncl + roundingDelta)`（丸め規則：JPY 1円未満切り捨て）
- `taxTotal = sum(taxBreakdown[].tax)`（`taxBreakdown` がある場合）
- `paymentsSummary.balanceDueIncl = grandTotalRounded - postEvents.totalRefundedIncl + postEvents.totalAdjustmentsIncl - paymentsSummary.paidTotalIncl`（表示はNightlyを正だが、算式はドキュメント化）

## サブコレクション

### `/bills/{billId}/items/{itemId}`
| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `name` | string | 必須 | 商品名。 |
| `category` | string \| null | 任意 | 販売カテゴリ。 |
| `menuItemId` | string \| null | 任意 | マスターID。 |
| `quantity` | number | 必須 | 数量。 |
| `unitPriceIncl` | number | 必須 | 単価（税込）。 |
| `totalPriceIncl` | number | 必須 | 行合計（税込）。 |
| `orderedAt` | timestamp | 必須 | 注文時刻。 |
| `taxRate` | number \| null | 任意 | 個別税率（必要時）。 |
| `voided` | boolean | 任意 | 行取消フラグ。 |
| `voidReason` | string \| null | 任意 | 取消理由。 |
| `voidedBy` | string \| null | 任意 | 実行者 UID。 |
| `createdAt` | timestamp | 必須 | 作成時刻。 |

### `/bills/{billId}/extras/{extraId}`
| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `name` | string | 必須 | 料金名。 |
| `amountIncl` | number | 必須 | 税込額。 |
| `createdAt` | timestamp | 必須 | 作成時刻。 |

### `/bills/{billId}/payments/{paymentId}`
**書込主体**: 支払いは **Functionsのみ** が作成（クライアント直書き禁止）。

**冪等性規約**: `paymentId`（docID）自体が冪等キー。`providerTxnId` がある場合は `paymentId = providerTxnId` を推奨。`providerTxnId` を指定したとき、`idempotencyKey` が同一値でない場合は `invalid-argument` とする（バリデーション）。

**支払方法キー**: `method` は小文字スネークケース。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `method` | string | 必須 | 支払方法（例: cash,credit_card,electronic_money）。 |
| `amountIncl` | number | 必須 | 受領額（税込）。 |
| `capturedAt` | timestamp | 必須 | 受領時刻。 |
| `status` | string | 必須 | authorized/captured/refunded 等。 |
| `provider` | string \| null | 任意 | 決済ゲートウェイ名。 |
| `providerTxnId` | string \| null | 任意 | 決済ID（ある場合は paymentId と一致推奨）。 |
| `providerReceiptNo` | string \| null | 任意 | ゲートウェイ側レシート番号。 |
| `providerUrls` | {dashboard?:string, receipt?:string} \| null | 任意 | 管理URL等。 |
| `receiptNumber` | string \| null | 任意 | 店舗レシート番号。 |
| `feeIncl` | number \| null | 任意 | 手数料（税込）。 |
| `netAmountIncl` | number \| null | 任意 | 手取り（税込）。 |
| `idempotencyKey` | string \| null | 任意 | 監査用。冪等判定自体は docID 一意で実施。 |
| `createdAt` | timestamp | 必須 | 作成時刻。 |

### `/bills/{billId}/events/{eventId}`
**冪等性規約**: `eventId`（docID） = `idempotencyKey`。

**書込主体**: `/events` は Functionsのみ（クライアント直書き禁止）。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `type` | enum(`refund`, `adjustment`, `cancel`, `reopen`) | 必須 | イベント種別。 |
| `createdAt` | timestamp | 必須 | 作成時刻。 |
| `createdBy` | string | 必須 | 実行者 UID。 |
| `reason` | string \| null | 任意 | 事由。 |
| `idempotencyKey` | string | 必須 | docID と同一値（監査/検索用にも保持）。 |
| `originBusinessDate` | string (YYYY-MM-DD) | 必須 | 売上帰属日（もとの日、JST解釈）。時刻・TZオフセットを含めない純粋な営業日文字列。 |
| `eventBusinessDate` | string (YYYY-MM-DD) | 必須 | イベント計上日（JST解釈）。時刻・TZオフセットを含めない純粋な営業日文字列。 |
| `refund` | { amountIncl:number, method?:string, providerTxnId?:string, lines?:any } \| null | 条件付 | type=refund の詳細。 |
| `adjustment` | { sign:1\|-1, amountIncl:number, method?:string, providerTxnId?:string } \| null | 条件付 | type=adjustment の詳細。 |

### `/bills/{billId}/sideGameChips/{chipId}`
**取引の本質**: 数量ベース。課金イベント（`action: 'purchase'`）のみ金額を併記。

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `action` | enum(`purchase`, `deposit`, `withdraw`) | 必須 | アクション種別。 |
| `chipQty` | number | 必須 | チップ数量（取引の本質）。 |
| `amountIncl` | number \| null | 条件付 | 税込額（`action: 'purchase'` の場合のみ併記。ない=非課金）。 |
| `menuItemId` | string \| null | 任意 | 商品ID。 |
| `name` | string \| null | 任意 | 表示名。 |
| `orderedAt` | timestamp \| null | 任意 | 実施時刻。 |
| `createdAt` | timestamp | 必須 | 作成時刻。 |

**用途別参照**: `deposit`/`withdraw` は数量のみ、`purchase` は数量＋金額。集計側は `chipQty` と `amountIncl` を用途別に参照。

### `/bills/{billId}/tournaments/{tplId}`
（従来どおり。省略なしで掲載）

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `templateId` | string | 必須 | テンプレID。 |
| `templateName` | string | 必須 | テンプレ名。 |
| `entryFeeIncl` | number \| null | 任意 | エントリー費。 |
| `entryCount` | number \| null | 任意 | エントリー回数。 |
| `reentryCount` | number \| null | 任意 | リエントリー回数。 |
| `reentryFeeIncl` | number \| null | 任意 | リエントリー費。 |
| `addonCount` | number \| null | 任意 | アドオン回数。 |
| `addonFeeIncl` | number \| null | 任意 | アドオン費。 |
| `registeredAt` | timestamp \| null | 任意 | 登録時刻。 |
| `startAt` | timestamp \| null | 任意 | 開始時刻。 |
| `lastReentryAt` | timestamp \| null | 任意 | 最終リエントリー。 |
| `lastAddonAt` | timestamp \| null | 任意 | 最終アドオン。 |
| `pointsAwarded` | number \| null | 任意 | 獲得ポイント合計。 |

### `/activeStays/{uid}`（最小スキーマ）
| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `uid` | string | 必須 | ユーザー UID（docId と一致）。 |
| `billId` | string | 必須 | 対応する請求書 ID。 |
| `pokerName` | string \| null | 任意 | 表示名。 |
| `isActive` | boolean | 必須 | 滞在中フラグ。 |
| `startedAt` | timestamp | 必須 | 入店時刻。 |

**削除**: `table`, `seat`, `updatedAt`, `expiresAt`(TTL) は保持しない。

**運用**: Settlement トリガで即時 delete、漏れは閉店 callable で掃除。
