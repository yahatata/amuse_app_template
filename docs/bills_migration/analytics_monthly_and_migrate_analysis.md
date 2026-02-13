# 会計完了時の analyticsMonthly 蓄積と migrateSettledBillsForBusinessDay の分析

実コードに基づく事実と原因検討をまとめました。

---

## 1. 会計完了時に analyticsMonthly にデータが蓄積しない原因

### 1.1 結論（最も有力な原因）

**会計完了時に analytics が動くかどうかは、環境変数 `ENABLE_SETTLEMENT_AGGREGATOR` に依存しています。デフォルトは `'false'` のため、未設定だと analytics は一切実行されません。**

| 項目 | 実装上の事実 |
|------|----------------|
| 制御箇所 | `functions/src/triggers/bills.onSettle.ts` |
| 環境変数 | `ENABLE_SETTLEMENT_AGGREGATOR`（Firebase Functions v2 の `defineString` で定義） |
| デフォルト値 | **`'false'`**（29–31行目） |
| 判定 | `if (enableSettlementAggregator.value() === 'true')` のときだけ `enqueueSettlement` を実行（178–199行目） |

```typescript
// bills.onSettle.ts 抜粋
const enableSettlementAggregator = defineString('ENABLE_SETTLEMENT_AGGREGATOR', {
  default: 'false',  // ← 未設定時は false
});
// ...
if (enableSettlementAggregator.value() === 'true') {
  await enqueueSettlement(billDoc);  // → processBillAnalyticsAtomically → analyticsMonthly 更新
}
```

- **`ENABLE_SETTLEMENT_AGGREGATOR` が未設定 or `'true'` 以外**  
  → 会計完了（status → `settled`）で `billsOnSettle` は動くが、**`enqueueSettlement` は呼ばれない**  
  → **analyticsMonthly は一切更新されない**  
- このため **「2026-02 が analyticsMonthly にできない」** のは、**「ドキュメントが無いから加算できない」** のではなく、**「会計完了時に analytics 処理そのものがオフになっている」** 可能性が高いです。

### 1.2 「ドキュメントが無いと加算できない」かどうか（実装上の事実）

**いいえ。実装は「ドキュメントが無ければ作成してから加算」です。**

- **月次ドキュメント**（`analyticsMonthly/{month}`）  
  `functions/src/analytics/addToMonthlyIndex.ts` 69–86行目:
  - `monthlyDoc` が無い、または `!monthlyDoc.exists` のとき **`transaction.set(monthlyRef, { ... 初期値 0 ... })` で新規作成**
  - 続けて **`transaction.update(monthlyRef, updateData)`** で increment
- **日次ドキュメント**（`analyticsMonthly/{month}/days/{businessDate}`）  
  `functions/src/analytics/addToDailySummary.ts` 82–98行目:
  - 同様に **`!dailyDoc || !dailyDoc.exists` なら `transaction.set(dailyRef, { ... })` で新規作成**
  - 続けて `transaction.update(dailyRef, updateData)`

したがって **「もともと analyticsMonthly に 2026-02 が無いから加算できない」という仕様にはなっていません。** 初回は set で作成してから update で加算します。  
「2026-02 ができない」のは、**その月の会計完了時に `enqueueSettlement` が一度も実行されていない**（＝上記環境変数が `'true'` になっていない）可能性が高いです。

### 1.3 会計完了から analyticsMonthly までの呼び出し経路

1. 会計完了  
   → `completeAccountingV2` 等で `bills/{billId}` の `status` が `'settled'` に更新
2. Firestore トリガ  
   → `bills.onSettle`（`onDocumentUpdated('bills/{billId}')`）発火  
   → 条件: `before.status !== 'settled' && after.status === 'settled'`
3. スナップショット更新  
   → サブコレクション読み取り → スナップショット計算 → 親 doc 更新（contentHash 等）
4. **環境変数が `'true'` のときのみ**  
   → `enqueueSettlement(billDoc)`  
   → `processBillAnalyticsAtomically`  
   → `addToMonthlyIndex` / `addToDailySummary` / `addToByCategory` / `addToByUser` / `addToByTemplateTournaments`  
   → `analyticsMonthly/{month}` および配下の作成・加算

未会計の会計（`finalizeUnsettledBillAfterAccounting`）でも、会計そのものは `completeAccountingV2` 経由で `status='settled'` になるため、**同じトリガ・同じ環境変数**の影響を受けます。

### 1.4 推奨確認事項

1. **Firebase Console**  
   - Functions → 該当リージョンの関数 → 「設定」または「環境変数」  
   - `ENABLE_SETTLEMENT_AGGREGATOR` が **`true`**（文字列）になっているか
2. **デプロイ時**  
   - `firebase deploy --only functions` 時に、本番用に `ENABLE_SETTLEMENT_AGGREGATOR=true` が渡されているか（.env や CI の環境変数）
3. **ログ**  
   - 会計完了タイミングで `billsOnSettle triggered` のログは出ているか  
   - その直後に `enqueueSettlement: starting analytics update` / `processBillAnalyticsAtomically: starting analytics update` が出ているか  
   - 出ていなければ、環境変数が `'true'` になっていないか、別要因で `enqueueSettlement` が実行されていない

関連ドキュメント: `docs/bills_migration/ENABLE_SETTLEMENT_AGGREGATOR_setup_guide.md`, `docs/bills_migration/accounting_page_data_display_troubleshooting.md`

---

## 2. migrateSettledBillsForBusinessDay の対象 bills の決まり方

### 2.1 対象の決まり方（実コード）

`functions/src/analytics/migrateSettledBillsForBusinessDay.ts` より:

- **営業日の決定**  
  - **storeMeta/currentBusinessDay** ドキュメントを参照する。  
  - **`currentBusinessDateKey`**（文字列・YYYY-MM-DD）が設定されていればそれを営業日として使用（営業中＝その日を移管対象）。  
  - **`currentBusinessDateKey`** が null/未設定の場合は **`lastClosedBusinessDateKey`** を使用（閉店後＝直近に閉店した営業日を移管対象）。  
  - 両方とも null の場合はエラーで終了。  
  - 実行時刻や `storeCloseHour` は使用しない。

- **クエリ条件**  
  - `bills` コレクション  
  - `status == 'settled'`  
  - `businessDate == businessDate`（上記で決めた営業日）

- **引数**  
  - Callable の `request.data` で営業日を渡す必要はない（storeMeta から取得するため）。従来の `storeCloseHour` は使用しない。

したがって:

- **対象になる bills**  
  - **「storeMeta で決めた営業日（currentBusinessDateKey または lastClosedBusinessDateKey）に属する、status が settled の bill のうち、まだ analytics 未反映のもの」**
- **対象の決め方**  
  - 営業日: `storeMeta/currentBusinessDay` の `currentBusinessDateKey`（優先）または `lastClosedBusinessDateKey`。  
  - その営業日 + `status === 'settled'` でフィルタ。

**closeSnapshot や「未会計として登録したか」はクエリ条件に含まれていません。**  
未会計ラベル（`closeSnapshot.unresolved: true`）付きで登録され、後から会計完了して `status='settled'` になった bill も、**その bill の `businessDate` が「storeMeta で決めた営業日」と一致すれば対象**になります。

### 2.2 未会計として登録した bill の扱い

- **会計前**  
  - `closeSnapshot.unresolved: true`、`status` は `'open'` / `'settling'` など  
  → `migrateSettledBillsForBusinessDay` のクエリ（`status == 'settled'`）には引っかからないので **対象外**。
- **会計完了後**  
  - `status` が `'settled'` に更新される  
  - `businessDate` はそのままで、`closeSnapshot` は後から `finalizeUnsettledBillAfterAccounting` で `unresolved: false` になる  
  → **status が settled になった時点で、その bill の `businessDate` が「storeMeta で決めた営業日」と一致すれば、migrate の対象になる**。
- **重複防止**  
  - 各 bill について `analyticsMonthly/{month}/aggregationMarkers/{billId}` の有無を見る（56–60行目）。  
  - **marker が既にあればスキップ**（既に `processBillAnalyticsAtomically` で反映済みとみなす）。  
  - 会計完了時に `ENABLE_SETTLEMENT_AGGREGATOR === 'true'` で `enqueueSettlement` が動いていれば、通常は会計完了時に marker が付くので、migrate ではスキップされる。  
  - **環境変数が off で会計完了時に analytics が動いていなかった bill は、marker が無いため migrate で初回だけ `processBillAnalyticsAtomically` が実行される（取りこぼしの救済）。**

まとめると:

- **対象の決め方**:  
  - **営業日** = `storeMeta/currentBusinessDay` の `currentBusinessDateKey`（優先）または `lastClosedBusinessDateKey`。引数や実行時刻は使わない。  
  - **bills** = その営業日かつ `status === 'settled'` のもの。未会計フラグの有無は見ていない。
- **未会計として登録した bill**  
  - 会計完了後は「通常の settled bill」と同じ扱い。  
  - その営業日で migrate を実行すれば対象になり、marker が無ければ analytics が反映される。

---

## 3. まとめ

| 疑問 | 実コードから分かること |
|------|------------------------|
| analyticsMonthly に 2026-02 ができない原因 | **環境変数 `ENABLE_SETTLEMENT_AGGREGATOR` のデフォルトが `'false'`** のため、会計完了時に `enqueueSettlement` が呼ばれておらず、analytics が動いていない可能性が最も高い。 |
| ドキュメントが無いと加算できない仕様か | **違う。** `addToMonthlyIndex` / `addToDailySummary` は「存在しなければ set で作成してから update」している。 |
| migrateSettledBillsForBusinessDay の対象 | **storeMeta/currentBusinessDay** の **currentBusinessDateKey**（優先）または **lastClosedBusinessDateKey** で決まる営業日と **`status === 'settled'`** で決まる。closeSnapshot / 未会計フラグは見ていない。 |
| 未会計として登録した bill の扱い | 会計完了後は通常の settled と同じ。その営業日で migrate を実行すれば対象になり、marker が無ければ analytics が反映される（取りこぼし救済）。 |

まずは **本番・検証環境で `ENABLE_SETTLEMENT_AGGREGATOR=true` が設定されているか** と、会計完了時の **Cloud Functions ログで `enqueueSettlement` / `processBillAnalyticsAtomically` が実行されているか** を確認することを推奨します。
