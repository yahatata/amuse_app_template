# Bill Analytics 蓄積確認結果

_作成日: 2025-12-20 (JST)_

## 対象 Bill データ

- **billId**: `7553e1da-5bc9-47d5-80b6-1857b44f8a1b`
- **businessDate**: `2026-01-20`
- **処理時刻**: `2026-01-20T01:34:09Z` 以降

---

## ログ確認結果

### ✅ 処理フローの確認

提供されたログから、以下の処理が正常に実行されていることが確認できました：

1. **`billsOnSettle: snapshot updated`** (01:34:09.881872Z)
   - ✅ スナップショット更新完了

2. **`enqueueSettlement: starting analytics update`** (01:34:11.308533Z)
   - ✅ `enqueueSettlement` が実行開始

3. **`processBillAnalyticsAtomically: starting analytics update`** (01:34:11.547688Z)
   - ✅ 共通関数が実行開始

4. **`addToMonthlyIndex: updating analyticsMonthly`** (01:34:12.362132Z)
   - ✅ 月次インデックス更新実行

5. **`addToDailySummary: updating analyticsMonthly days`** (01:34:12.364404Z)
   - ✅ 日次サマリー更新実行

6. **`addToByCategory: updating analyticsMonthly byCategory`** (01:34:12.365986Z)
   - ✅ カテゴリ別更新実行

7. **`addToByUser: updating analyticsMonthly byUser`** (01:34:12.368355Z)
   - ✅ ユーザー別更新実行

8. **`processBillAnalyticsAtomically: marker created`** (01:34:12.369282Z)
   - ✅ マーカー作成完了

9. **`processBillAnalyticsAtomically: analytics update completed`** (01:34:12.555322Z)
   - ✅ 共通関数の処理完了

10. **`enqueueSettlement: analytics update completed`** (01:34:12.555551Z)
    - ✅ `enqueueSettlement` の処理完了

---

## ⚠️ 確認できていない項目

### 1. `addToByTemplateTournaments` のログ

提供されたログには `addToByTemplateTournaments` のログが含まれていません。

**考えられる理由**:
- トーナメントデータが存在しない場合、この関数は呼び出されない
- または、ログが出力されていない

**確認方法**:
- Firestore Console で `analyticsMonthly/2026-01/byTemplateTournaments/elSrtZZ7JTrshytJuMv2` が更新されているか確認

---

### 2. 詳細な更新内容（`updatedFields`）

提供されたログは簡略化された形式のため、以下の詳細情報が含まれていません：
- 更新されるフィールド名
- increment される値
- 新規ドキュメント作成かどうか

**確認方法**:
- Google Cloud Console のログエクスプローラーで JSON 形式のログを確認
- または、Firestore Console で実際の値を確認

---

## 期待される更新内容（再掲）

### 1. `analyticsMonthly/2026-01` の更新

- `itemsSales`: `increment(1000)`
- `sideGameChipSales`: `increment(5000)`
- `extraCostSales`: `increment(1000)`
- `tournamentsSales`: `increment(6000)`
- `grossSales`: `increment(13000)`
- `orderCount`: `increment(1)`
- `dailySales.2026-01-20`: `increment(13000)`
- `paymentTotals.cash`: `increment(8000)`
- `paymentTotals.pointA`: `increment(4000)`
- `paymentTotals.sideGameChip`: `increment(1000)`

### 2. `analyticsMonthly/2026-01/days/2026-01-20` の更新

- 上記と同様のフィールド + `byCategory` と `byPaymentMethod` も更新

### 3. `analyticsMonthly/2026-01/byCategory/summary` の更新

- `totals.*`: 各カテゴリ別の金額
- `orderCounts.*`: 各カテゴリ別の注文数
- `itemSales.s5zd9X7t5jePPBeDeUH4`: ピザのデータ

### 4. `analyticsMonthly/2026-01/byUser/jxxltCr1PoShWJQeSB0F8TYGjlw1` の更新

- `grossSales`: `increment(13000)`
- `dailySales.2026-01-20`: `increment(13000)`
- `paymentTotals.*`: 各支払い方法別の金額
- `pokerName`: "やはた"

### 5. `analyticsMonthly/2026-01/byTemplateTournaments/elSrtZZ7JTrshytJuMv2` の更新

- `daily.2026-01-20.*`: 日別のトーナメントデータ
- `totals.*`: トーナメント合計データ

### 6. `analyticsMonthly/2026-01/aggregationMarkers/7553e1da-5bc9-47d5-80b6-1857b44f8a1b` の作成

- `billId`: "7553e1da-5bc9-47d5-80b6-1857b44f8a1b"
- `businessDate`: "2026-01-20"
- `processedAt`: タイムスタンプ

---

## 次のステップ

### 1. 詳細ログの確認（推奨）

Google Cloud Console のログエクスプローラーで、以下の検索クエリを使用：

```
resource.type="cloud_function"
resource.labels.function_name="billsOnSettle"
jsonPayload.message=~"addTo.*"
timestamp>="2026-01-20T01:34:00Z"
timestamp<="2026-01-20T01:35:00Z"
```

**確認すべき項目**:
- `jsonPayload.updatedFields` の内容
- 各関数の更新内容が期待値と一致しているか

---

### 2. Firestore Console での直接確認

以下のドキュメントを確認し、期待される値が更新されているか検証：

1. `analyticsMonthly/2026-01`
   - `grossSales`, `itemsSales`, `sideGameChipSales`, `extraCostSales`, `tournamentsSales`
   - `orderCount`
   - `dailySales.2026-01-20`
   - `paymentTotals.*`

2. `analyticsMonthly/2026-01/days/2026-01-20`
   - 上記と同様のフィールド
   - `byCategory.*`
   - `byPaymentMethod.*`

3. `analyticsMonthly/2026-01/byCategory/summary`
   - `totals.*`
   - `orderCounts.*`
   - `itemSales.s5zd9X7t5jePPBeDeUH4`

4. `analyticsMonthly/2026-01/byUser/jxxltCr1PoShWJQeSB0F8TYGjlw1`
   - `grossSales`
   - `dailySales.2026-01-20`
   - `paymentTotals.*`
   - `pokerName`

5. `analyticsMonthly/2026-01/byTemplateTournaments/elSrtZZ7JTrshytJuMv2`
   - `daily.2026-01-20.*`
   - `totals.*`

6. `analyticsMonthly/2026-01/aggregationMarkers/7553e1da-5bc9-47d5-80b6-1857b44f8a1b`
   - マーカーが存在するか
   - `billId`, `businessDate`, `processedAt` が正しく設定されているか

---

## 結論

### ✅ 確認できたこと

1. **処理フロー**: すべての関数が正常に実行されている
2. **実行順序**: 期待される順序で実行されている
3. **マーカー作成**: 重複処理防止のマーカーが作成されている

### ⚠️ 確認が必要なこと

1. **詳細な更新内容**: ログの詳細（`updatedFields`）を確認する必要がある
2. **`addToByTemplateTournaments`**: トーナメントデータの更新が実行されているか確認
3. **実際の値**: Firestore Console で実際の値が期待値と一致しているか確認

---

## 推奨アクション

1. **Google Cloud Console のログエクスプローラー**で詳細ログを確認
2. **Firestore Console**で実際の値を確認
3. 期待値と実際の値を比較して検証

もし詳細ログを取得できた場合は、期待値と比較して検証できます。
