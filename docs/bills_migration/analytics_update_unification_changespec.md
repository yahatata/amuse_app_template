# Analytics Monthly 更新の同一化 ChangeSpec

_作成日: 2025-12-20 (JST)_

## 1. 結論（採用方針）

### 採用方針: **旧スキーマのみで統一（方針1）**

**理由**:
- 既存UIが旧スキーマ（`grossSales`, `itemsSales`, `orderCount`, `byCategory`, `byUser`, `byTemplateTournaments` 等）を参照している
- UI変更の工数を削減したい
- 新スキーマ（`sales.*`, `events.*`, `cashflow.*`, `net.*`）への移行は将来の検討事項とする

**対象更新フィールド**（旧スキーマ）:
- `analyticsMonthly/{month}`: `grossSales`, `itemsSales`, `sideGameChipSales`, `extraCostSales`, `tournamentsSales`, `orderCount`, `dailySales.{businessDate}`, `paymentTotals.{method}`
- `analyticsMonthly/{month}/days/{businessDate}`: 同上 + `byCategory.{category}`, `byPaymentMethod.{method}`
- `analyticsMonthly/{month}/byCategory/summary`: `totals.{category}`, `orderCounts.{category}`, `itemSales.{menuItemId}`
- `analyticsMonthly/{month}/byTemplateTournaments/{templateKey}`: `daily.{businessDate}.{field}`, `totals.{field}`
- `analyticsMonthly/{month}/byUser/{userId}`: `grossSales`, `itemsSales`, etc.

**除外**（新スキーマ）:
- **新スキーマ（`sales.*`, `events.*`, `cashflow.*`, `net.*`）は今回の更新対象外**
  - `applyMonthlyDailyDelta`（新スキーマ更新関数）は使用しない
  - `enqueueSettlement` から `buildSettlementDelta` と `applyMonthlyDailyDelta` の呼び出しを削除
  - `migrateSettledBillsForBusinessDay` でも新スキーマは更新しない
- 新スキーマへの移行は将来の検討事項とする（UI変更の工数を削減するため）

---

## 2. 変更対象ファイル一覧

### 新設ファイル
- `functions/src/analytics/updateAnalyticsForBill.ts`（新規）
  - `processBillAnalyticsAtomically` 関数を定義
  - トランザクション内で marker チェック・作成、事前読み取り、更新を実施

### 更新ファイル
- `functions/src/analytics/aggregator/index.ts`
  - `enqueueSettlement` を修正して `processBillAnalyticsAtomically` を使用
  - `checkAndSetBillMarker` の呼び出しを削除

- `functions/src/analytics/migrateSettledBillsForBusinessDay.ts`
  - 既存のトランザクション処理を `processBillAnalyticsAtomically` に置き換え
  - `settledBills` への転記ロジックを削除（両者で転記しない仕様に統一）
  - 削除対象: line 113-124 の `settledBills` への転記処理（確認済み、`functions/src/analytics/migrateSettledBillsForBusinessDay.ts`）

- `functions/src/analytics/aggregator/markers.ts`
  - `checkAndSetBillMarker` を廃止（`enqueueSettlement` から参照削除）
  - 他の参照（`enqueueEvent` 等）があれば確認・対応

### 変更不要ファイル
- `functions/src/analytics/addToMonthlyIndex.ts`（シグネチャ維持）
- `functions/src/analytics/addToDailySummary.ts`（シグネチャ維持）
- `functions/src/analytics/addToByCategory.ts`（シグネチャ維持）
- `functions/src/analytics/addToByTemplateTournaments.ts`（シグネチャ維持）
- `functions/src/analytics/addToByUser.ts`（シグネチャ維持）

---

## 3. 新設/改修する関数のシグネチャ案

### 3.1 新設: `processBillAnalyticsAtomically`

**ファイル**: `functions/src/analytics/updateAnalyticsForBill.ts`（新規）

**シグネチャ**:
```typescript
/**
 * 1つの bill に対する analyticsMonthly 更新を原子的に実行
 * 
 * 処理内容:
 * 1. トランザクション内で marker をチェック（存在するなら no-op return）
 * 2. analyticsMonthly の必要参照を tx.get で事前読み取り
 * 3. 旧スキーマ更新: addToMonthlyIndex/addToDailySummary/addToByCategory/addToByTemplateTournaments/addToByUser を呼ぶ
 * 4. marker を作成（トランザクション内で必ず実施）
 * 
 * @param db Firestore インスタンス
 * @param params 更新パラメータ
 * @returns Promise<void>
 */
export async function processBillAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: {
    month: string;
    businessDate: string;
    billId: string;
    billData: any;
  }
): Promise<void>
```

**引数**:
- `db`: Firestore インスタンス（`getFirestore()` で取得）
- `params.month`: 月次キー（`YYYY-MM` 形式）
- `params.businessDate`: 営業日（`YYYY-MM-DD` 形式）
- `params.billId`: 伝票ID
- `params.billData`: bills 親ドキュメントのデータ（`categoryBreakdown`, `paymentTotals`, `itemsSnapshot`, `tournamentsSnapshot`, `party` 等を含む）

**戻り値**: `Promise<void>`

**処理フロー**:
1. **トランザクション開始**: `db.runTransaction()` を呼び出す（共通関数内で実施）
2. **READ phase**: `tx.get` で以下を読み取り
   - `aggregationMarkers/{billId}`（存在チェック、存在するなら早期 return）
   - `analyticsMonthly/{month}`（月次Doc）
   - `analyticsMonthly/{month}/days/{businessDate}`（日次Doc）
   - `analyticsMonthly/{month}/byCategory/summary`（カテゴリサマリ）
   - `analyticsMonthly/{month}/byUser/{userId}`（ユーザーDoc、`party.userId` がある場合のみ）
   - `analyticsMonthly/{month}/byTemplateTournaments/{templateKey}`（各トーナメントテンプレート）
3. **WRITE phase**: 既存の `addTo*` 関数を呼び出し
   - `addToMonthlyIndex(transaction, month, billData, businessDate, monthlyDoc)`
   - `addToDailySummary(transaction, month, businessDate, billData, dailyDoc)`
   - `addToByCategory(transaction, month, billData, byCategoryDoc)`
   - `addToByTemplateTournaments(transaction, month, businessDate, billData, templateDocs)`
   - `addToByUser(transaction, month, businessDate, billData, byUserDoc)`（`userId` がある場合のみ）
4. **marker 作成**: `tx.create(markerRef, { billId, businessDate, processedAt: ... })` を使用（初回のみ作成を保証）
   - `tx.get(markerRef)` で存在確認済みのため、`tx.create` は必ず成功する（既に存在する場合は上記チェックで早期 return）
   - `tx.create` は既存ドキュメントが存在する場合にエラーになるため、「初回のみ作成」という意図を明確に表現できる

**重要**: 呼び出し側（`enqueueSettlement`, `migrateSettledBillsForBusinessDay`）は `runTransaction` を持たず、共通関数を呼ぶだけにすることでネストトランザクションが起きないことを保証する

---

### 3.2 修正: `enqueueSettlement`

**ファイル**: `functions/src/analytics/aggregator/index.ts`

**変更前**:
```typescript
export async function enqueueSettlement(bill: BillDoc): Promise<void> {
  const businessDate = bill.businessDate;
  const monthKey = businessDate.substring(0, 7);

  // ⚠️ トランザクション外で marker を作成（欠損リスク）
  const alreadyProcessed = await checkAndSetBillMarker(monthKey, bill.billId);
  if (alreadyProcessed) {
    return;
  }

  // 新スキーマ更新（旧スキーマを更新していない）
  const delta = buildSettlementDelta(bill);
  await applyMonthlyDailyDelta(monthKey, businessDate, delta, {...});
}
```

**変更後**:
```typescript
// 静的 import を使用（動的 import を避ける）
import { processBillAnalyticsAtomically } from '../updateAnalyticsForBill';

export async function enqueueSettlement(bill: BillDoc): Promise<void> {
  const businessDate = bill.businessDate;
  const monthKey = businessDate.substring(0, 7);
  const db = getFirestore();

  // 共通関数で旧スキーマ更新（トランザクション内で marker チェック・作成）
  // 【仕様】bill.billId は必ず bills コレクションのドキュメントID（docId）でなければならない
  // - docId でない billId を渡すことは仕様違反
  // - docId が取れない形で呼び出されている場合は、呼び出し元（トリガ等）で docId を渡す責務がある
  // - docId 統一が崩れると marker が効かず二重計上になる可能性がある
  await processBillAnalyticsAtomically(db, {
    month: monthKey,
    businessDate,
    billId: bill.billId,  // 【必須】bill.billId は docId（後述の「billId の統一」参照）
    billData: bill,  // BillDoc から必要なフィールドを抽出（categoryBreakdown, paymentTotals, etc.）
  });
}
```

**変更理由**:
- 動的 import（`await import`）を避けて静的 import を使用することで、バンドル・パスミス・ランタイム差異のリスクを回避

**変更点**:
- `checkAndSetBillMarker` の呼び出しを削除（トランザクション外で marker を作成する設計を廃止）
- `buildSettlementDelta` と `applyMonthlyDailyDelta` の呼び出しを削除（新スキーマ更新を削除、旧スキーマのみに統一）
- 動的 import（`await import`）を静的 import に変更（バンドル・パスミス・ランタイム差異の回避）
- `processBillAnalyticsAtomically` を呼び出すだけの薄い実装に変更（`runTransaction` を持たない）

---

### 3.3 修正: `migrateSettledBillsForBusinessDay`

**ファイル**: `functions/src/analytics/migrateSettledBillsForBusinessDay.ts`

**変更前**:
```typescript
for (const billDoc of billsQuery.docs) {
  // トランザクション外で marker チェック（早期スキップ用）
  const markerDoc = await markerRef.get();
  if (markerDoc.exists) {
    skippedCount++;
    continue;
  }

  // トランザクション外で事前読み取り
  const [monthlyDoc, dailyDoc, ...] = await Promise.all([...]);

  // トランザクション内で処理
  await db.runTransaction(async (transaction) => {
    // 再度 marker チェック
    // addTo* 関数を呼び出し
    // settledBills への転記
    // marker 作成
  });
}
```

**変更後**:
```typescript
import { processBillAnalyticsAtomically } from './updateAnalyticsForBill';

for (const billDoc of billsQuery.docs) {
  const billId = billDoc.id;  // ✅ billDoc.id は docId（bills コレクションのドキュメントID）
  const billData = billDoc.data();

  try {
    // ⚠️ オプション: トランザクション外で marker チェック（早期スキップ用、パフォーマンス向上）
    const markerRef = db.collection('analyticsMonthly').doc(month).collection('aggregationMarkers').doc(billId);
    const markerDoc = await markerRef.get();
    if (markerDoc.exists) {
      skippedCount++;
      continue;  // 早期スキップ（最終的な正しさは processBillAnalyticsAtomically 内で担保）
    }

    // 共通関数で analytics 更新（トランザクション内で marker チェック・作成）
    await processBillAnalyticsAtomically(db, {
      month,
      businessDate,
      billId,  // ✅ billId = docId として統一
      billData,
    });

    // ⚠️ settledBills への転記は廃止（両者で転記しない仕様に統一）
    // 転記が不要な理由:
    // - settledBills コレクションは既に利用されていない／必要がない
    // - enqueueSettlement は転記を行わないため、両者の動作を揃える

    processedCount++;
  } catch (error) {
    // エラーハンドリング
  }
}
```

**変更点**:
- 既存のトランザクション処理を `processBillAnalyticsAtomically` に置き換え
- トランザクション外の marker チェックは残す（早期スキップ用、パフォーマンス向上）
- **`settledBills` への転記ロジックを削除**（両者で転記しない仕様に統一）
  - 削除対象: `functions/src/analytics/migrateSettledBillsForBusinessDay.ts` line 113-124（確認済み）

---

### 3.4 修正: `markers.ts`

**ファイル**: `functions/src/analytics/aggregator/markers.ts`

**方針**: **`checkAndSetBillMarker` を廃止**（理由: トランザクション外で marker を作成する設計が欠損リスクがあるため）

**変更前**:
```typescript
export async function checkAndSetBillMarker(
  monthKey: string,
  billId: string
): Promise<boolean> {
  // ...
  await markerRef.set({...});  // ⚠️ トランザクション外で marker を作成
  return false;
}
```

**変更後**:
```typescript
// checkAndSetBillMarker を削除
// enqueueSettlement から参照を削除（processBillAnalyticsAtomically を使用）

// checkAndSetEventMarker はそのまま残す（enqueueEvent で使用）
export async function checkAndSetEventMarker(
  monthKey: string,
  eventId: string
): Promise<boolean> {
  // 既存の実装を維持（Event 用は別途検討）
}
```

**変更点**:
- `checkAndSetBillMarker` 関数を削除
- `enqueueSettlement` から参照を削除
- 他の参照（`enqueueEvent` 以外）があれば確認・対応

**注意**: `enqueueEvent` は今回の変更対象外（Event 用 marker は別途検討）

### 3.6 Event marker の欠損固定リスク（別チケット化）

**問題**: `checkAndSetEventMarker` がトランザクション外で marker を作成する設計になっており、欠損固定のリスクがある

**実装確認**（`functions/src/analytics/aggregator/markers.ts`, line 56）:
```typescript
export async function checkAndSetEventMarker(
  monthKey: string,
  eventId: string
): Promise<boolean> {
  // ...
  await markerRef.set({...});  // ⚠️ トランザクション外で marker を作成（確認済み）
  return false;
}
```
**確認箇所**: `functions/src/analytics/aggregator/markers.ts` / `checkAndSetEventMarker` / line 56: `await markerRef.set({...})`

**問題点**:
- `checkAndSetEventMarker` はトランザクション外で `markerRef.set()` を呼び出している
- `enqueueEvent` が失敗した場合、marker は作成済みだが analytics が未更新のまま固定される可能性がある
- bill marker と同様の欠損固定リスクがある

**対応方針**:
- 今回のスコープでは **bill marker のみ対応**する
- Event marker の欠損固定リスクは **別チケットで対応**する

**次のステップ（別チケット）**:
- `enqueueEvent` でも `processBillAnalyticsAtomically` 相当の共通関数を使用
- または、Event 用にもトランザクション内で marker を作成する設計に変更

---

## 4. 処理フロー（疑似コード）

### 4.1 `processBillAnalyticsAtomically` の処理フロー

```typescript
export async function processBillAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: { month, businessDate, billId, billData }
): Promise<void> {
  // 参照を準備
  const monthlyRef = db.collection('analyticsMonthly').doc(params.month);
  const dailyRef = monthlyRef.collection('days').doc(params.businessDate);
  const byCategoryRef = monthlyRef.collection('byCategory').doc('summary');
  const markerRef = monthlyRef.collection('aggregationMarkers').doc(params.billId);

  const userId = params.billData.party?.userId;
  const byUserRef = userId ? monthlyRef.collection('byUser').doc(userId) : undefined;

  const tournamentsSnapshot = params.billData.tournamentsSnapshot || {};
  const templateKeys = Object.keys(tournamentsSnapshot);
  const templateRefs = templateKeys.map(k => 
    monthlyRef.collection('byTemplateTournaments').doc(k)
  );

  // トランザクション開始
  await db.runTransaction(async (tx) => {
    // --- READ phase ---
    
    // 1. marker チェック（存在するなら早期 return）
    const markerDoc = await tx.get(markerRef);
    if (markerDoc.exists) {
      return;  // 既に処理済み → no-op
    }

    // 2. analytics 関連ドキュメントを事前読み取り（read→write順を守る）
    const reads = [
      tx.get(monthlyRef),
      tx.get(dailyRef),
      tx.get(byCategoryRef),
      ...(byUserRef ? [tx.get(byUserRef)] : []),
      ...templateRefs.map(ref => tx.get(ref)),
    ];
    const results = await Promise.all(reads);

    const monthlyDoc = results[0];
    const dailyDoc = results[1];
    const byCategoryDoc = results[2];
    let idx = 3;
    const byUserDoc = byUserRef ? results[idx++] : undefined;
    const templateDocs = results.slice(idx);

    // --- WRITE phase ---
    
    // 3. 旧スキーマ更新（既存の addTo* 関数を使用）
    await addToMonthlyIndex(tx, params.month, params.billData, params.businessDate, monthlyDoc);
    await addToDailySummary(tx, params.month, params.businessDate, params.billData, dailyDoc);
    await addToByCategory(tx, params.month, params.billData, byCategoryDoc);
    await addToByTemplateTournaments(tx, params.month, params.businessDate, params.billData, templateDocs);
    if (byUserDoc) {
      await addToByUser(tx, params.month, params.businessDate, params.billData, byUserDoc);
    }

    // 4. marker 作成（トランザクション内で必ず実施、初回のみ作成を保証）
    // 【方針】tx.create を使用する（既存ドキュメントが存在する場合にエラーになるため、「初回のみ作成」という意図を明確に表現）
    // - 上記の tx.get(markerRef) で存在確認済みで、存在する場合は早期 return している
    // - したがって、この時点では marker が存在しないことが保証されているため、tx.create は必ず成功する
    // - tx.set は既存ドキュメントを上書きしてしまうため、意図を明確にするため tx.create を採用する
    tx.create(markerRef, {
      billId: params.billId,
      businessDate: params.businessDate,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
```

---

### 4.2 `enqueueSettlement` の処理フロー

```typescript
// 静的 import を使用（動的 import を避ける）
import { processBillAnalyticsAtomically } from '../updateAnalyticsForBill';

export async function enqueueSettlement(bill: BillDoc): Promise<void> {
  const businessDate = bill.businessDate;
  const monthKey = businessDate.substring(0, 7);
  const db = getFirestore();

  // 共通関数を呼び出すだけ（runTransaction は共通関数内で実施されるため、ネストトランザクションにならない）
  // 【仕様】bill.billId は必ず bills コレクションのドキュメントID（docId）でなければならない
  await processBillAnalyticsAtomically(db, {
    month: monthKey,
    businessDate,
    billId: bill.billId,  // 【必須】bill.billId は docId（後述の「billId の統一」参照）
    billData: bill,  // BillDoc をそのまま渡す（必要なフィールドは processBillAnalyticsAtomically 内で使用）
  });
}
```

---

### 4.3 `migrateSettledBillsForBusinessDay` の処理フロー

```typescript
import { processBillAnalyticsAtomically } from './updateAnalyticsForBill';

for (const billDoc of billsQuery.docs) {
  const billId = billDoc.id;  // ✅ billDoc.id が docId（bills コレクションのドキュメントID）
  const billData = billDoc.data();

  try {
    // オプション: 早期スキップ（パフォーマンス向上）
    const markerRef = db.collection('analyticsMonthly').doc(month)
      .collection('aggregationMarkers').doc(billId);
    const markerDoc = await markerRef.get();
    if (markerDoc.exists) {
      skippedCount++;
      continue;  // 早期スキップ（最終的な正しさは processBillAnalyticsAtomically 内で担保）
    }

    // 共通関数で analytics 更新（runTransaction は共通関数内で実施されるため、ネストトランザクションにならない）
    await processBillAnalyticsAtomically(db, {
      month,
      businessDate,
      billId,  // ✅ billId = docId として統一
      billData,
    });

    // ⚠️ settledBills への転記は廃止（両者で転記しない仕様に統一）
    // 削除対象: 既存の転記ロジック（確認済み、functions/src/analytics/migrateSettledBillsForBusinessDay.ts line 113-124）
    // 転記が不要な理由:
    // - settledBills コレクションは既に利用されていない／必要がない
    // - enqueueSettlement は転記を行わないため、両者の動作を揃える

    processedCount++;
  } catch (error) {
    logger.error(`処理失敗: ${billId}`, error);
    throw error;
  }
}
```

---

### 3.5 billId の定義を docId に統一（必須・仕様として確定）

**問題**: `billId` の定義が統一されていないと、marker が効かず二重計上になる可能性がある
- 異なる `billId` 値を渡すと、marker が別々に作成され、同一 bill が複数回処理される
- `enqueueSettlement` と `migrateSettledBillsForBusinessDay` で異なる `billId` を使うと、marker が機能しない

**方針（確定仕様）**: **bills コレクションのドキュメントID（docId）を `billId` として採用する**
- `enqueueSettlement` が受け取る `BillDoc.billId` は必ず docId でなければならない
- docId でない `billId` を渡すことは仕様違反
- docId が取れない形で呼び出されている場合は、呼び出し元（トリガ等）で docId を渡す責務がある

**実装確認（確認済み）**:

**`bills.onSettle` トリガ**（`functions/src/triggers/bills.onSettle.ts`）:
- 確認箇所: `functions/src/triggers/bills.onSettle.ts` / `billsOnSettle` / line 32, 42, 179
```typescript
export const billsOnSettle = onDocumentUpdated('bills/{billId}', async (event) => {
  const billId = event.params.billId;  // ✅ event.params.billId は docId（Firestore トリガのパスパラメータから取得）

  const billDoc: any = {
    billId,  // ✅ docId を billId として設定
    businessDate: updatedBillData.businessDate,
    // ...
  };
  await enqueueSettlement(billDoc);
});
```

**`migrateSettledBillsForBusinessDay`**（`functions/src/analytics/migrateSettledBillsForBusinessDay.ts`）:
- 確認箇所: `functions/src/analytics/migrateSettledBillsForBusinessDay.ts` / `migrateSettledBillsForBusinessDay` / line 51
```typescript
for (const billDoc of billsQuery.docs) {
  const billId = billDoc.id;  // ✅ billDoc.id は docId（Firestore クエリ結果のドキュメントID）
  // ...
}
```

**結論（確認済み）**:
- ✅ `bills.onSettle` トリガ: `event.params.billId` は docId（Firestore トリガから取得、確認済み）
- ✅ `migrateSettledBillsForBusinessDay`: `billDoc.id` は docId（クエリ結果から取得、確認済み）
- ✅ 両方とも docId を `billId` として使用しているため、統一されている（確認済み）

**仕様としての保証**:
- `enqueueSettlement` に渡される `BillDoc.billId` は必ず docId でなければならない（仕様として確定）
- `bills.onSettle` トリガでは `event.params.billId`（docId）を `billId` として渡す責務がある（確認済み）
- `migrateSettledBillsForBusinessDay` では `billDoc.id`（docId）を `billId` として使用する（確認済み）

**二重計上リスクの説明**:
- docId 統一が崩れると、`enqueueSettlement` と `migrateSettledBillsForBusinessDay` で異なる `billId` 値が使用される
- 異なる `billId` 値で marker が作成されるため、marker が効かず同一 bill が複数回処理される（二重計上）
- したがって、`billId` は必ず docId に統一する必要がある（仕様として確定）

---

## 5. 重要な注意点

### 5.1 欠損固定の回避

**問題**: `checkAndSetBillMarker` がトランザクション外で marker を作成すると、analytics 更新が失敗した場合に欠損が固定される

**対策**:
- ✅ **marker の作成は必ずトランザクション内で実施**
- ✅ `processBillAnalyticsAtomically` 内で `tx.create(markerRef, ...)` を使用（初回のみ作成を保証）
- ✅ analytics 更新と marker 作成を同一トランザクションでコミット

**確認ポイント**:
- `enqueueSettlement` から `checkAndSetBillMarker` の呼び出しを完全に削除
- `processBillAnalyticsAtomically` 内で marker チェック・作成を実施

---

### 5.2 トランザクション内の読み取り順序（read→write）

**問題**: Firestore のトランザクションでは「全ての読み取りを完了してから書き込みに移る」必要がある

**対策**:
- ✅ **全ての `tx.get` を `Promise.all` で並列実行し、完了後に書き込みに移る**
- ✅ `preReadAnalyticsDocsInTx` のような関数で全読み取りをまとめて実施

**実装例**:
```typescript
// READ phase: 全ての読み取りを並列実行
const reads = [
  tx.get(markerRef),
  tx.get(monthlyRef),
  tx.get(dailyRef),
  // ...
];
const results = await Promise.all(reads);

// WRITE phase: 読み取り完了後に書き込み
await addToMonthlyIndex(tx, ...);
// ...
```

**確認ポイント**:
- 読み取りと書き込みが明確に分離されているか
- `tx.get` の後に `tx.update/tx.set` が実行されているか

---

### 5.3 Marker の扱い（初回のみ作成を保証）

**問題**: トランザクション外で marker をチェック・作成すると、競合時に欠損や二重計上が発生する

**対策（確定方針）**:
- ✅ **marker のチェック・作成は必ずトランザクション内で実施**
- ✅ `tx.get(markerRef)` で存在確認 → 存在するなら早期 return
- ✅ `tx.create(markerRef, ...)` で marker を作成（analytics 更新と同一トランザクション、初回のみ作成を保証）
  - `tx.create` は既存ドキュメントが存在する場合にエラーになるため、「初回のみ作成」という意図を明確に表現できる
  - 上記の `tx.get(markerRef)` で存在確認済みで、存在する場合は早期 return しているため、この時点では marker が存在しないことが保証されている
  - したがって、`tx.create` は必ず成功する

**オプション（パフォーマンス向上）**:
- `migrateSettledBillsForBusinessDay` で、トランザクション外の marker チェックを残す（早期スキップ用）
- ただし、最終的な正しさは `processBillAnalyticsAtomically` 内のトランザクション内チェックで担保

**確認ポイント**:
- `processBillAnalyticsAtomically` 内で marker チェック・作成を実施
- marker 作成は `tx.create` を使用（確定方針、既に存在する場合は上記チェックで早期 return しているため）
- `enqueueSettlement` から `checkAndSetBillMarker` を削除

---

### 5.4 既存関数（addTo*）のシグネチャ維持

**問題**: 既存の `addTo*` 関数は事前読み取り済み Snapshot を前提としている

**対策**:
- ✅ **既存関数のシグネチャは変更しない**
- ✅ `processBillAnalyticsAtomically` 内で `tx.get` で読み取った Snapshot を既存関数に渡す
- ✅ 既存関数は `transaction.update/tx.set` のみを実行（読み取りは呼び出し側で実施）

**確認ポイント**:
- `addToMonthlyIndex` などの既存関数のシグネチャが変更されていないか
- `tx.get` で読み取った Snapshot が既存関数に正しく渡されているか

---

### 5.5 トランザクション責務の統一（ネストトランザクション防止）

**設計方針**: 共通関数（`processBillAnalyticsAtomically`）が `runTransaction` を内包する方式を採用する

**理由**:
- 呼び出し側（`enqueueSettlement`, `migrateSettledBillsForBusinessDay`）は `runTransaction` を持たず、共通関数を呼ぶだけにすることでネストトランザクションが起きない
- トランザクション管理を共通関数に集約することで、責務が明確になる

**実装**:
- ✅ `processBillAnalyticsAtomically` 内で `db.runTransaction()` を呼び出す
- ✅ 呼び出し側（`enqueueSettlement`, `migrateSettledBillsForBusinessDay`）は `processBillAnalyticsAtomically` を呼ぶだけ（`runTransaction` を持たない）

**確認ポイント**:
- `enqueueSettlement` 内に `runTransaction` がないこと
- `migrateSettledBillsForBusinessDay` 内に `runTransaction` がないこと（`processBillAnalyticsAtomically` 呼び出しのみ）
- `processBillAnalyticsAtomically` 内で `db.runTransaction()` を呼び出していること

---

## 6. テスト/検証項目

### 6.1 冪等性テスト

**目的**: 同一 `billId` に対し `enqueueSettlement` と `migrateSettledBillsForBusinessDay` が競合しても二重計上しないこと

**テストケース**:
1. `enqueueSettlement` を実行 → marker が作成されることを確認
2. `migrateSettledBillsForBusinessDay` を実行 → marker が存在するためスキップされることを確認
3. 逆順（`migrateSettledBillsForBusinessDay` → `enqueueSettlement`）も同様に確認
4. 両方が同時に実行されても二重計上されないことを確認（トランザクション競合で片方が失敗することを確認）

**検証ポイント**:
- `aggregationMarkers/{billId}` が作成されること
- `analyticsMonthly` の各フィールドが1回だけ更新されること
- トランザクション競合時にリトライが正常に動作すること

---

### 6.2 失敗時再試行テスト

**目的**: `processBillAnalyticsAtomically` が途中で失敗しても欠損固定しないこと

**テストケース**:
1. `processBillAnalyticsAtomically` の途中でエラーを発生させる（例: `addToMonthlyIndex` でエラー）
2. 再実行時に marker が存在しないことを確認（marker が作成されていない）
3. 再実行時に analytics が正しく更新されることを確認

**検証ポイント**:
- marker がトランザクション内で作成されるため、失敗時は marker が作成されない
- 再実行時に marker が存在しないため、正常に更新される
- 欠損固定が発生しない

---

### 6.3 トランザクション順序テスト

**目的**: 全ての参照 doc を `tx.get` で読んだ後に書き込みに移ること

**テストケース**:
1. `processBillAnalyticsAtomically` の処理をトレース
2. 全ての `tx.get` が `Promise.all` で並列実行されることを確認
3. 全ての読み取り完了後に `addTo*` 関数が呼ばれることを確認

**検証ポイント**:
- `tx.get` の後に `tx.update/tx.set` が実行されること
- 読み取りと書き込みが明確に分離されていること

---

### 6.4 更新内容の同一性テスト

**目的**: `enqueueSettlement` と `migrateSettledBillsForBusinessDay` が同一のフィールドを更新すること

**テストケース**:
1. 同一の `billData` に対して `enqueueSettlement` と `migrateSettledBillsForBusinessDay` を実行
2. `analyticsMonthly` の各フィールドが同一の値で更新されることを確認
3. `byCategory`, `byUser`, `byTemplateTournaments` サブコレクションも更新されることを確認

**検証ポイント**:
- `analyticsMonthly/{month}` のフィールドが同一の値で更新される
- `analyticsMonthly/{month}/days/{businessDate}` のフィールドが同一の値で更新される
- `byCategory`, `byUser`, `byTemplateTournaments` サブコレクションが更新される

---

### 6.5 既存関数の互換性テスト

**目的**: 既存の `addTo*` 関数のシグネチャが維持されていること

**テストケース**:
1. `addToMonthlyIndex` などの既存関数のシグネチャが変更されていないことを確認
2. `processBillAnalyticsAtomically` から既存関数を呼び出して正常に動作することを確認

**検証ポイント**:
- 既存関数のシグネチャが変更されていないこと
- `tx.get` で読み取った Snapshot が既存関数に正しく渡されること

---

### 6.6 手動確認項目

**目的**: 本番環境での動作確認

**確認項目**:
1. `enqueueSettlement` が `bills.onSettle` トリガから正常に呼び出されること
2. `migrateSettledBillsForBusinessDay` が夜間バッチで正常に実行されること
3. `analyticsMonthly` の各フィールドが正しく更新されること（UIで確認）
4. `aggregationMarkers` が正しく作成されること（Firestore Consoleで確認）
5. トランザクション競合が発生してもリトライが正常に動作すること（ログで確認）

---

## 7. 実装チェックリスト

### 7.1 新設ファイル
- [ ] `functions/src/analytics/updateAnalyticsForBill.ts` を作成
- [ ] `processBillAnalyticsAtomically` 関数を実装
- [ ] 必要な import を追加（`getFirestore`, `Transaction`, `addTo*` 関数等）

### 7.2 更新ファイル
- [ ] `functions/src/analytics/aggregator/index.ts` の `enqueueSettlement` を修正
  - [ ] `checkAndSetBillMarker` の呼び出しを削除
  - [ ] `buildSettlementDelta` と `applyMonthlyDailyDelta` の呼び出しを削除
  - [ ] `processBillAnalyticsAtomically` を呼び出すように変更
- [ ] `functions/src/analytics/migrateSettledBillsForBusinessDay.ts` を修正
  - [ ] 既存のトランザクション処理を `processBillAnalyticsAtomically` に置き換え
  - [ ] `settledBills` への転記ロジックを削除（両者で転記しない仕様に統一）
  - [ ] 静的 import を使用（動的 import を避ける）
- [ ] `functions/src/analytics/aggregator/markers.ts` を修正
  - [ ] `checkAndSetBillMarker` を削除（またはコメントアウト）
  - [ ] 他の参照を確認・対応

### 7.3 テスト
- [ ] 冪等性テストを実施
- [ ] 失敗時再試行テストを実施
- [ ] トランザクション順序テストを実施
- [ ] 更新内容の同一性テストを実施
- [ ] 既存関数の互換性テストを実施

### 7.4 ドキュメント
- [ ] ChangeSpec を更新（実装完了後）
- [ ] README/CHANGELOG を更新（必要に応じて）

---

## 8. ファイル名の提案

### 新設ファイル
- **推奨**: `functions/src/analytics/updateAnalyticsForBill.ts`
- **理由**: 
  - `updateAnalyticsForBill` は「1つの bill に対する analytics 更新」を明確に表現
  - `analytics` ディレクトリに配置することで、関連機能を集約
  - 既存の `addTo*` 関数と同じディレクトリに配置し、依存関係が明確

### 代替案（採用しない）
- `functions/src/analytics/analyticsUpdater.ts`（汎用的すぎる）
- `functions/src/analytics/aggregator/updateBill.ts`（`aggregator` ディレクトリは新スキーマ用のため）

---

## 9. まとめ

### 採用方針
- **旧スキーマのみで統一**（方針1）
- 新スキーマ（`sales.*`, `events.*`, `cashflow.*`, `net.*`）は将来の検討事項

### 重要な変更点
1. `processBillAnalyticsAtomically` を新設（トランザクション内で marker チェック・作成、事前読み取り、更新）
2. `enqueueSettlement` を修正（`checkAndSetBillMarker` を削除、新スキーマ更新を削除、`processBillAnalyticsAtomically` を使用、静的 import に変更）
3. `migrateSettledBillsForBusinessDay` を修正（既存のトランザクション処理を `processBillAnalyticsAtomically` に置き換え、`settledBills` への転記を廃止）
4. `checkAndSetBillMarker` を廃止（欠損リスクがあるため）
5. `billId` を docId に統一（marker が正しく機能するため）

### 重要な注意点
- marker の作成は必ずトランザクション内で実施（欠損固定を防止、`tx.create` を使用）
- トランザクション内の読み取り順序を守る（read→write）
- 既存の `addTo*` 関数のシグネチャは維持
- `billId` は docId に統一（marker が正しく機能するため）
- トランザクション責務は共通関数に集約（ネストトランザクション防止）
- `settledBills` への転記は廃止（両者で転記しない仕様に統一）
- 新スキーマ（`sales.*`, `events.*`, `cashflow.*`, `net.*`）は更新対象外
- Event marker の欠損固定リスクは別チケットで対応

### 次のステップ
1. `processBillAnalyticsAtomically` を実装
2. `enqueueSettlement` と `migrateSettledBillsForBusinessDay` を修正
3. テストを実施
4. 手動確認を実施

---

## 10. 修正履歴（2025-12-20 観点1〜4対応）

### 修正点の要約

#### 観点1: 事実と推測が混在している箇所の是正
- ✅ `bills.onSettle` トリガの実装確認を根拠付きで明記（確認箇所: `functions/src/triggers/bills.onSettle.ts` / `billsOnSettle` / line 32, 42, 179）
- ✅ `checkAndSetEventMarker` のトランザクション外 marker 作成を根拠付きで明記（確認箇所: `functions/src/analytics/aggregator/markers.ts` / `checkAndSetEventMarker` / line 56）
- ✅ `settledBills` への転記ロジックの削除対象を根拠付きで明記（確認箇所: `functions/src/analytics/migrateSettledBillsForBusinessDay.ts` / `migrateSettledBillsForBusinessDay` / line 113-124）
- ✅ 推測による断定を削除し、確認済みとして根拠を明記

#### 観点2: enqueueSettlement の billId（docId）要件を仕様として強制
- ✅ `billId` は必ず docId でなければならない旨を仕様として確定
- ✅ docId でない `billId` を渡すことは仕様違反として明記
- ✅ 呼び出し元（トリガ等）で docId を渡す責務があることを明記
- ✅ 二重計上リスクの説明を強化（docId 統一が崩れると marker が効かず二重計上になる理由を明記）

#### 観点3: marker 作成方式を tx.create に確定
- ✅ marker 作成手順を `tx.create` 前提で統一（`tx.set` の記述を削除）
- ✅ 「初回のみ作成」の意図が明確に表現されることを確認
- ✅ `tx.get` チェックで存在確認済みのため `tx.create` は必ず成功することを明記

#### 観点4: settledBills 転記廃止により実パス断定が不要になるので整理
- ✅ `settledBills` の実パス断定を削除（廃止対象の転記ロジックの場所のみ記載）
- ✅ 削除対象の転記ロジックを実コード確認済みとして明記（`functions/src/analytics/migrateSettledBillsForBusinessDay.ts` line 113-124）
- ✅ 転記が不要な理由を明記（利用していない／必要がない、両者の動作を揃える）

### 実装に必要な修正箇所（次の実装フェーズ用メモ）

**`functions/src/triggers/bills.onSettle.ts`**:
- line 189: 動的 import `await import('../analytics/aggregator')` を静的 import に変更
- `enqueueSettlement` 呼び出し時に `bill.billId` が docId であることを保証（実装確認済み、`event.params.billId` が docId）

**`functions/src/analytics/migrateSettledBillsForBusinessDay.ts`**:
- line 113-124: `settledBills` への転記ロジックを削除（実装確認済み）
- 既存のトランザクション処理を `processBillAnalyticsAtomically` に置き換え
