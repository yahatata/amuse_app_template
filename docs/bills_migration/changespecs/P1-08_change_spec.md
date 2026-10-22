# ChangeSpec（P1-08）

## 目的 / 関連文書
- **目的**: 
  - Functions側の読み取り系callableを `todaysBills` から `bills` コレクションへのクエリに移行する。
  - `businessDate` フィルタを適用し、営業日ベースのクエリに統一する。
  - 既存のAPI契約を維持しつつ、内部実装のみを新スキーマ対応に変更する。
  - **`getUserOrderHistory` は確定済み会計履歴専用APIとして再定義**: `status ∈ {"settled","partially_refunded","refunded","voided"}` の確定済み伝票のみを対象とし、進行中の伝票（`open`, `in_progress`, `settling`）の「現在の合計金額」を返す用途には使用しない。進行中の会計に対する「現在の合計金額」の取得は、将来追加予定の会計前プレビューAPI（`getBillPreviewTotals`）で扱う。
- **参照**: 
  - `api_contract.md` §2.7 読み取り系API（`getUserOrderHistory`, `verifyPaymentSplit`, `getOpenBills`）
  - `modification_plan.md` P1-08行
  - `schema_plan.md` `/bills/{billId}` スキーマ
  - `helper_api_plan.md` §2 整合ポイントと責務分担

## 変更概要（What）

### 更新ファイル
- `functions/src/itemOrder/getUserOrderHistory.ts`:
  - `todaysBills` クエリを `bills` クエリに変更
  - `userId` フィルタを `party.userId` に変更
  - `createdAt` フィルタを `businessDate` フィルタに変更（当日の営業日を計算）
  - **`status ∈ {"settled","partially_refunded","refunded","voided"}` の確定済み伝票のみを対象とする**（`open`, `in_progress`, `settling` は履歴として返さない）。status フィルタは Firestore クエリ側で絞り込む（post-filter は行わない）
  - 合計金額は `amounts.grandTotalRounded` を使用し、旧 `todaysBills.totalPrice` 相当の「確定値のスナップショット」として扱う
  - レスポンス形式は既存のまま維持（互換性確保）
  - **明細ドキュメントそのものはレスポンスには含めず、履歴ヘッダ情報＋`itemCount` などの集計値のみ返す**
  - **`items` サブコレクションは `itemCount` や合計金額などの集計値を計算するために読み取ることは許可するが、明細の配列としては返さず、レスポンスの `items` フィールドは shape 互換のため常に空配列 `[]` を返す**
  - **`extraCost` / `tournaments` / `sideGameChip` の明細はレスポンスには含めず、必要な画面では別APIを利用する**

- `functions/src/callables/verifyPaymentSplit.ts`:
  - `todaysBills` から `bills` への参照に変更
  - `billId` で直接取得（既存の動作は維持）
  - データ構造のマッピング（`extraCost` → `extras` サブコレクション、`tournaments` → `tournaments` サブコレクション、`sideGameChip` → `sideGameChips` サブコレクション、`items` → `items` サブコレクション）

- `functions/src/utils/getOpenBills.ts`:
  - `todaysBills` クエリを `bills` クエリに変更
  - `status == 'open'` フィルタを維持
  - レスポンス形式は既存のまま維持（`todaysBillsId` → `billId` に変更）

### 新規ファイル
- `functions/__tests__/itemOrder/getUserOrderHistory.spec.ts`: 単体・統合テスト
- `functions/__tests__/callables/verifyPaymentSplit.spec.ts`: 統合テスト（既存テストの更新）
- `functions/__tests__/utils/getOpenBills.spec.ts`: 単体・統合テスト

### 呼び出し元影響範囲
- **Flutter側**: 
  - 既存のAPI呼び出しは変更不要（レスポンス形式は維持）
  - 内部実装のみ変更のため、クライアント側への影響なし
- **Functions側**:
  - 他のcallableからの呼び出しは変更不要（API契約は維持）

## 実装詳細（How）

### クエリ変更詳細

#### 1. `getUserOrderHistory.ts`
**Before (todaysBills)**:
```typescript
const billsQuery = db
  .collection("todaysBills")
  .where("userId", "==", userId)
  .where("createdAt", ">=", todayStartUTC)
  .where("createdAt", "<=", todayEndUTC)
  .orderBy("createdAt", "desc");
```

**After (bills)**:
```typescript
// 当日の営業日を計算（共通ユーティリティ calcBusinessDate を使用）
const now = new Date();
const businessDate = calcBusinessDate(now);

// クエリ条件
const billsQuery = db
  .collection("bills")
  .where("party.userId", "==", userId)
  .where("businessDate", "==", businessDate)
  .where("status", "in", ["settled", "partially_refunded", "refunded", "voided"]) // 確定済み履歴専用
  .orderBy("createdAt", "desc");
```

**businessDate と status の扱い**:
- `businessDate` の算出は共通ユーティリティ `calcBusinessDate(timestamp)` を使用（`calcBusinessDate` は内部で `STORE_CLOSE_HOUR`（または `getStoreCloseHour()`）を参照する共通ユーティリティとして使用する）
- クエリは次の条件を使用（status フィルタは Firestore クエリ側で絞り込む）:
  - `.where("party.userId", "==", userId)`
  - `.where("businessDate", "==", businessDate)`
  - `.where("status", "in", ["settled", "partially_refunded", "refunded", "voided"])`
  - `.orderBy("createdAt", "desc")`
- `totalPrice` は `amounts.grandTotalRounded` を採用する理由: 「確定済み bill のみを履歴とする」ポリシーに基づき、確定済み伝票には必ず `amounts.grandTotalRounded` が存在するため

**レスポンス形式のマッピング**:
- `doc.id` → `id` (既存のまま)
- `data.createdAt` → `createdAt` (`bills.createdAt` を ISO 文字列化)
- `data.updatedAt` → `updatedAt` (任意で ISO 文字列化)
- `data.status` → `status` (`bills.status`)
- `data.totalPrice` → `amounts.grandTotalRounded` を利用して `totalPrice` として返却（確定済みの最終税込額という意味づけで統一）
- `data.currentTable` → `place.table` (`currentTable` 互換)
- `data.currentSeat` → `place.seat` (`currentSeat` 互換)
- `orderDate` → `createdAt` の ISO 文字列をそのまま使用（`orderDate = createdAt.toISOString()`）
- `itemCount` → `/bills/{billId}/items` サブコレクションの件数（従来の `items.length` 相当、`itemCount = number of documents in /bills/{billId}/items`）。`getUserOrderHistory` のレスポンスで、注文アイテム数を表示するために使用する
- **`items` フィールド**:
  - 型（shape）としては従来の `todaysBills.items` と互換とするが、`getUserOrderHistory` のレスポンスでは**常に空配列 `[]` を返す**（明細はこのAPIでは返さない）
  - 明細の中身が必要な場合は、別APIで `/items` サブコレクションを直接取得する前提とする
- **Firestore 上では `/bills/{billId}/items` サブコレクションから `itemCount` や合計値計算のために読み取ることはあるが、API レスポンスでは `itemCount` は数値として返し、`items` は空配列 `[]` を返す（明細の中身は返さない、別APIで取得）**
- **`extraCost` / `tournaments` / `sideGameChip` については、`getUserOrderHistory` のレスポンスには含めず、必要な画面では別APIを利用する**
- **レスポンス形式は従来（`todaysBills`）と互換を維持する**

#### 2. `verifyPaymentSplit.ts`
**Before (todaysBills)**:
```typescript
const billRef = db.collection('todaysBills').doc(billId);
const billDoc = await billRef.get();
const billData = billDoc.data()!;

// カテゴリごとの金額を計算
const extraCosts = billData.extraCost || [];
const tournaments = billData.tournaments || {};
const items = billData.items || [];
const sideGameChips = billData.sideGameChip || [];
```

**After (bills)**:
```typescript
const billRef = db.collection('bills').doc(billId);
const billDoc = await billRef.get();
const billData = billDoc.data()!;

// カテゴリごとの金額を計算（Bills スキーマ準拠）
const categoryAmounts: Record<string, number> = {};

// extraCost → extras サブコレクションから取得
const extrasSnap = await billRef.collection('extras').get();
categoryAmounts['extraCost'] = extrasSnap.docs.reduce(
  (sum, doc) => sum + (doc.data().amountIncl || 0),
  0
);

// items → items サブコレクションから取得
const itemsSnap = await billRef.collection('items').get();
categoryAmounts['items'] = itemsSnap.docs.reduce(
  (sum, doc) => sum + (doc.data().totalPriceIncl || 0),
  0
);

// sideGameChip → sideGameChips サブコレクションから取得（action='purchase'のみ）
const sideGameChipsSnap = await billRef.collection('sideGameChips').get();
categoryAmounts['sideGameChip'] = sideGameChipsSnap.docs
  .filter(doc => doc.data().action === 'purchase')
  .reduce((sum, doc) => sum + (doc.data().amountIncl || 0), 0);

// tournaments → tournaments サブコレクションから取得
const tournamentsSnap = await billRef.collection('tournaments').get();
categoryAmounts['tournaments'] = tournamentsSnap.docs.reduce((sum, doc) => {
  const data = doc.data();
  return sum + 
    (data.entryFeeIncl || 0) * (data.entryCount || 0) +
    (data.reentryFeeIncl || 0) * (data.reentryCount || 0) +
    (data.addonFeeIncl || 0) * (data.addonCount || 0);
}, 0);

// キー名（"extraCost","tournaments","items","sideGameChip"）は従来のまま
```

#### 3. `getOpenBills.ts`
**Before (todaysBills)**:
```typescript
const snap = await db
  .collection("todaysBills")
  .where("status", "==", "open")
  .get();

const data = snap.docs.map((doc) => {
  const d = doc.data() as any;
  return {
    todaysBillsId: doc.id,
    userId: d?.userId ?? "",
    pokerName: d?.pokerName ?? "",
    currentTable: d?.currentTable ?? null,
    currentSeat: d?.currentSeat ?? null,
  };
});
```

**After (bills)**:
```typescript
// 当日の営業日を計算（共通ユーティリティ calcBusinessDate を使用）
const now = new Date();
const businessDate = calcBusinessDate(now);

const snap = await db
  .collection("bills")
  .where("businessDate", "==", businessDate)
  .where("status", "==", "open")
  .get();

const data = snap.docs.map((doc) => {
  const d = doc.data() as any;
  return {
    billId: doc.id, // todaysBillsId → billId に変更
    userId: d?.party?.userId ?? "",
    pokerName: d?.party?.pokerName ?? "",
    currentTable: d?.place?.table ?? null,
    currentSeat: d?.place?.seat ?? null,
  };
});

// ソート（pokerName順）
data.sort((a, b) => (a.pokerName || "").localeCompare(b.pokerName || ""));
```

### 書込み先
- 読み取り専用のため、書込みなし

### 冪等性
- 読み取り専用のため、冪等性の考慮不要

### デュアルライト
- 読み取り専用のため、デュアルライトの考慮不要

### 権限境界
- **Functions側**: 既存の認証チェックを維持
- **Client側**: 既存の権限チェックを維持

### 競合解決
- 読み取り専用のため、競合解決の考慮不要

### ログ/メトリクス
- 既存のログ出力を維持
- エラーハンドリングは既存のまま

### 例外（HttpsErrorマッピング）
- **エラー返却の一貫性**:
  - `verifyPaymentSplit` は `HttpsError` によるエラー返却を行う
  - `getUserOrderHistory` と `getOpenBills` は従来の `{ success: false, error: string }` 形式を維持する
  - ※`getUserOrderHistory` は、該当伝票が 0 件でもエラーにはせず、`success: true` かつ `orders: []` で返却する
- **既存のエラーハンドリングを維持**:
  - `unauthenticated`: 認証が必要
  - `not-found`: 指定された請求書が見つからない
  - `invalid-argument`: 入力データが無効
  - `internal`: 内部エラー

## 仕様差分（Before→After）

### `getUserOrderHistory` の仕様変更

**Before (todaysBills)**:
- `todaysBills` から `userId` + `createdAt` 範囲（当日JST）でフィルタ
- `totalPrice` は `todaysBills.totalPrice` を使用
- `status` によるフィルタなし（未確定の伝票も混在しうる）

**After (bills)**:
- `bills` から `party.userId` + `businessDate`（当日JST）でフィルタ
- **`status ∈ {"settled","partially_refunded","refunded","voided"}` のみ取得（確定済み履歴専用）。status フィルタは Firestore クエリ側で絞り込む**
- `totalPrice` は `amounts.grandTotalRounded` を使用（Nightly 再計算・売上集計の正と一致する最終値）
- **進行中の bill の現在合計は別API（会計前プレビューAPI）で取得する方針**

### クエリパターンの変更

**Before (todaysBills)**:
- `userId` フィールドで直接フィルタ
- `createdAt` で日付範囲フィルタ
- フラットなデータ構造

**After (bills)**:
- `party.userId` でフィルタ（ネストされたフィールド）
- `businessDate` で営業日フィルタ（文字列比較）
- サブコレクション構造（`items`, `extras`, `tournaments`, `sideGameChips`）

### データ構造のマッピング

| todaysBills | bills |
|------------|-------|
| `userId` | `party.userId` |
| `pokerName` | `party.pokerName` |
| `currentTable` | `place.table` |
| `currentSeat` | `place.seat` |
| `totalPrice` | `amounts.grandTotalRounded` |
| `items` (配列) | `/bills/{billId}/items` (サブコレクション) |
| `items[].totalPrice` | `/items/{itemId}.totalPriceIncl` |
| `extraCost` (配列) | `/bills/{billId}/extras` (サブコレクション) |
| `extraCost[].price` | `/extras/{extraId}.amountIncl` |
| `tournaments` (オブジェクト) | `/bills/{billId}/tournaments/{tplId}` (サブコレクション) |
| `tournaments[].entryFee` | `entryFeeIncl` など、Bills 側フィールドへ統一 |
| `sideGameChip` (配列) | `/bills/{billId}/sideGameChips` (サブコレクション) |

### レスポンス形式の互換性

- **`getUserOrderHistory`**: 既存のレスポンス形式を維持（クライアント側への影響なし）
- **`verifyPaymentSplit`**: 既存のレスポンス形式を維持（クライアント側への影響なし）
- **`getOpenBills`**: `todaysBillsId` → `billId` に変更（クライアント側で対応が必要な可能性あり）

## テスト

### 単体テスト（各ファイル）

#### `getUserOrderHistory.spec.ts`
- **happy path**: 
  - 正常な注文履歴取得（当日の営業日、確定済み伝票のみ）
  - 複数の確定済み伝票がある場合のソート確認
  - 該当する確定済み伝票が 0 件の場合でも、`success: true` かつ `orders: []`, `totalCount = 0`, `totalAmount = 0` が返ること
  - `amounts.grandTotalRounded` が正しく `totalPrice` として返却されることを確認
  - `/items` サブコレクションの件数が `itemCount` に正しく反映されること
- **invalid-argument**: 
  - 認証なしの場合
- **businessDate フィルタ**: 
  - 当日の営業日のみ取得されることを確認
  - 前日の営業日の伝票は取得されないことを確認
- **status フィルタ**: 
  - `status ∈ {"settled","partially_refunded","refunded","voided"}` の伝票のみ取得されることを確認
  - `status ∈ {"open","in_progress","settling"}` の伝票は取得されないことを確認

#### `verifyPaymentSplit.spec.ts`
- **happy path**: 
  - 正常な支払い分割計算の照合
  - クライアント側とサーバー側の結果が一致する場合
  - クライアント側とサーバー側の結果が不一致の場合（サーバー側の結果を返す）
- **invalid-argument**: 
  - 認証なしの場合
  - `billId` 未指定
- **not-found**: 
  - 指定された請求書が見つからない場合
- **サブコレクション取得**: 
  - `extras`, `tournaments`, `items`, `sideGameChips` が正しく取得されることを確認
  - 空のサブコレクションの場合の処理確認

#### `getOpenBills.spec.ts`
- **happy path**: 
  - 正常な入店中ユーザー一覧取得
  - `status='open'` の伝票のみ取得されることを確認
  - ソート確認（pokerName順）
- **empty**: 
  - 入店中ユーザーがいない場合の空配列返却
- **レスポンス形式**: 
  - `billId` フィールドが正しく返却されることを確認
  - `party.userId`, `party.pokerName`, `place.table`, `place.seat` が正しくマッピングされることを確認
- **businessDate フィルタ**: 
  - 当日の営業日の `status='open'` bill のみ取得されることを確認
  - 前日の `businessDate` を持つ `status='open'` bill は、レスポンスに含まれないことを確認

### 統合テスト
- **DualWrite ON/OFF**: 読み取り専用のため、DualWriteのテストは不要
- **境界日付**: 
  - 営業日の境界（STORE_CLOSE_HOUR）での動作確認
  - 年跨ぎ・月跨ぎの動作確認

### 手動テスト（3手順以内）
1. LIFF側で注文履歴を確認し、当日の注文が正しく表示されることを確認
2. 会計画面で支払い分割計算を実行し、正しい結果が返されることを確認
3. 入店中ユーザー一覧画面で、`status='open'` のユーザーのみが表示されることを確認

## ドキュメント更新
- **`README.md`**: P1-08完了を追記、実装内容とテスト結果を記載
- **`modification_plan.md`**: P1-08の状態を「完了」に更新、仕様差分を詳細に追記
- **`changelog.md`**: P1-08完了エントリを追加、実装ファイル一覧とテスト結果を記載
- **`test_plan.md`**: P1-08テスト観点を「実施済み」に更新、テストケース詳細を追記
- **`api_contract.md`**: 最終更新日を更新（API契約自体は変更なし）

## 依存関係
- **P1-07 (事後イベント & 会計後調整 API + UI)**: 完了済み ✅
- **P1-10 (閉店バッチ)**: P1-08完了後に実装予定

## 注意事項
- **レスポンス形式の互換性**: 既存のクライアント側コードへの影響を最小限に抑えるため、レスポンス形式は可能な限り維持する
- **`getUserOrderHistory` の仕様変更**: 確定済み履歴専用APIとして再定義したため、進行中の伝票は取得されなくなる。進行中の伝票の合計金額が必要な場合は、将来追加予定の会計前プレビューAPI（`getBillPreviewTotals`）を使用する
- **`getOpenBills` の `billId` 変更**: `todaysBillsId` → `billId` への変更は、クライアント側で対応が必要な可能性がある（既存の使用箇所を確認）。P1-14（レスポンス確認フェーズ）で確認予定。
- **サブコレクション取得のパフォーマンス**: サブコレクションの取得は複数回のクエリになるため、必要に応じてバッチ取得を検討
- **インデックス**: `bills` コレクションに対する以下のインデックスが必要:
  - **`getUserOrderHistory` 用**: `party.userId` + `businessDate` + `status` + `createdAt` (降順)
  - **`getOpenBills` 用**: `status` + `businessDate`（実際には既存の `status` + `businessDate` + `updatedAt` (降順) 複合インデックスを利用する。`status` + `businessDate` のみの新規インデックス追加は、現時点では行わない（必要になれば将来検討））

## 将来追加する会計前プレビューAPI（設計メモ / P1-08スコープ外）

### APIの目的

**API名（仮称）**: `getBillPreviewTotals`  
**場所**: `functions/src/callables/getBillPreviewTotals.ts` を想定

**目的**:
- `status ∈ {"open","in_progress","settling"}` の bill について、「現在の合計金額」をサーバ側で一時的に計算して返すための読み取り専用API
- レジ画面や「会計へ進む」ボタン押下時の確認ダイアログなど、限定されたUIからのみ呼び出す想定

**`amounts.*` との関係**:
- `amounts.*` は引き続き「`settled` 以降の確定スナップショット専用」とし、このAPIでは `amounts.*` には書き込まない
- あくまでサブコレクションからその場で計算する「プレビュー結果」だけを返す

### 入出力のざっくり定義

```typescript
// Request
interface GetBillPreviewTotalsRequest {
  billId: string;   // 対象となる bills/{billId}
}

// Response
interface GetBillPreviewTotalsResponse {
  success: boolean;
  billId: string;
  status: string;   // bills.status（open / in_progress / settling のみ許可）
  totals: {
    subTotalIncl: number;
    serviceChargeIncl: number;
    grandTotalIncl: number;
    grandTotalRounded: number; // プレビュー用に丸めた値（確定値ではない）
  };
  categoryBreakdown: {
    items: number;
    extraCost: number;
    sideGameChips: number;
    tournaments: number;
  };
  // 必要に応じて taxBreakdown 相当の情報も付与可（Phase2以降の検討）
}
```

**ポイント**:
- 読み取り専用（Firestore への書き込みは行わない）
- `completeAccounting` 用に設計済みの再計算ロジック（`helpers/billsApi/snapshots.ts` 想定）の一部を再利用すること
- `status` が `settled` など「既に確定済み」の場合は、`amounts.*` をそのまま返すか、エラーとして弾くか（方針レベルで記載するだけでよい、実装は後続フェーズ）

### UI / 呼び出しポリシー

このAPIは、高頻度で全billに対して叩くのではなく、以下の限定されたタイミングのみ呼び出すポリシーとする:
- 「会計確定に進む直前」
- 「オペレータが"現時点の概算を確認"ボタンを押したとき」

「一覧画面で全 `open` bill の現在合計を常時表示したい」といった要件が出た場合は、そのときのパフォーマンス要件を踏まえて、別途 `preSettlementTotals` のような軽量スナップショットフィールド追加を検討する、という将来方針も検討する。

