# 冪等性（Idempotency）実装状況の監査結果

## 概要

このプロジェクトにおける冪等性の実装状況を確認し、問題点と推奨事項をまとめました。

## 冪等性とは

**冪等性（Idempotency）**：同じ操作を何度実行しても、結果が同じになる性質。
- ネットワークエラーによる再送
- ユーザーの二度押し
- リトライ処理
などの場合に、重複実行による不整合や副作用を防ぐために重要。

## 1. ✅ 冪等性が適切に実装されている箇所（良好）

### 1.1 Bills API関連
すべて `idempotencyKey` + `requestHash` を使用した強い冪等性を実装。

| 関数 | 実装方式 | 状態 |
|------|---------|------|
| `createBillWithActiveStay` | `/bills/{billId}/idempotency/{key}` でチェック、`requestHash`一致検証 | ✅ |
| `appendItem` | `/bills/{billId}/idempotency/{key}` でチェック、`requestHash`一致検証 | ✅ |
| `appendExtra` | `/bills/{billId}/idempotency/{key}` でチェック、`requestHash`一致検証 | ✅ |
| `appendSideGameChip` | `/bills/{billId}/idempotency/{key}` でチェック、`requestHash`一致検証 | ✅ |
| `recordTournamentAction` | `/bills/{billId}/idempotency/{key}` でチェック、`requestHash`一致検証 | ✅ |
| `startAccounting` | `/bills/{billId}/idempotency/{key}` でチェック、`requestHash`一致検証 | ✅ |

**実装パターン：**
- キー形式: `{prefix}:{billId}:{clientNonce}` または `{billId}:{action}:{idempotencyKey}`
- リプレイ時: 既存レスポンスを返却、`updatedAt`は更新しない（副作用なし）
- `requestHash`不一致: `failed-precondition` エラー

### 1.2 Event関連
docId = idempotencyKey を使用した実装。

| 関数 | 実装方式 | 状態 |
|------|---------|------|
| `postEventReopen` | `/bills/{billId}/events/{idempotencyKey}` で存在チェック | ✅ |
| `postEventRefund` | `/bills/{billId}/events/{idempotencyKey}` で存在チェック | ✅ |
| `postEventCancel` | `/bills/{billId}/events/{idempotencyKey}` で存在チェック | ✅ |
| `postEventAdjustment` | `/bills/{billId}/events/{idempotencyKey}` で存在チェック | ✅ |

**実装パターン：**
- eventId = idempotencyKey（docIdとして使用）
- 既存eventがある場合は既存レスポンスを返却

### 1.3 SideGame関連

| 関数 | 実装方式 | 状態 |
|------|---------|------|
| `withdrawTip` | `appendSideGameChip` を呼び出し（冪等性あり） | ✅ |
| `depositTip` | `appendSideGameChip` を呼び出し（冪等性あり） | ✅ |

## 2. ⚠️ 冪等性が不十分または実装されていない箇所（要改善）

### 2.1 シフト関連

#### ❌ `createMultipleShifts.ts` - **冪等性なし**
**問題点：**
- 重複チェックはあるが、同じリクエストの再実行でエラーになる
- ネットワークエラー時の再送で「既にシフトが申請されています」エラーが発生
- ユーザーの二度押しでエラーになる

**現在の実装：**
```typescript
// 重複シフトのチェック（同じ日付に既存のシフトがあるか）
const existingShifts = await admin.firestore()
  .collection("shifts")
  .where("userId", "==", uid)
  .where("date", "in", uniqueDates)
  .get();

if (!existingShifts.empty) {
  const existingDates = existingShifts.docs.map(doc => doc.data().date);
  throw new Error(`以下の日付に既にシフトが申請されています: ${existingDates.join(", ")}`);
}
```

**推奨改善：**
- **推奨A（最も安全）**: `UPSERT`ポリシーを採用
  - docIdを固定: `availabilityRequests/{staffId}_{YYYY-MM-DD}_normal`
  - 既存docがある場合は更新、なければ作成
  - `createdAt`は初回のみ、`updatedAt`は毎回更新
- **推奨B**: `idempotencyKey` + `requestHash` を使用（bills APIと同様）

#### ❌ `createShiftRequest.ts` - **LINE通知の重複送信リスク**
**問題点：**
- 冪等性キーなし
- リトライ時にLINE通知が重複送信される可能性
- 同じリクエストで複数の通知が送られる可能性

**現在の実装：**
```typescript
// 要請ドキュメントを作成
const requestRef = await db.collection("shiftRequests").add(requestData);

// LINE通知を送信（重複送信の可能性）
notificationPromises.push(
  sendLineButtonMessage(staffId, messageText, buttons)
);
```

**推奨改善：**
- docIdを固定または`idempotencyKey`を使用
- LINE通知送信前に、既存docをチェックして通知済みフラグを確認
- または、通知送信済みフラグをdocに保存し、重複送信を防ぐ

#### ⚠️ `approveShift.ts` - **LINE通知の重複送信リスク**
**問題点：**
- statusチェックはある（既に処理済みならエラー）
- ただし、処理完了後にリトライした場合、LINE通知が重複送信される可能性

**現在の実装：**
```typescript
if (shiftData?.confirmed !== null) {
  throw new Error("このシフトは既に処理済みです。");
}

// シフトを承認
await requestRef.update({...});

// LINE通知を送信（リトライ時に重複送信される可能性）
sendLinePushMessage(userId, message).catch(...);
```

**推奨改善：**
- `idempotencyKey`を使用
- 通知送信済みフラグをdocに保存
- または、通知送信前に既に送信済みかチェック

#### ⚠️ `rejectShift.ts`, `processShiftsByStaff.ts` - **LINE通知の重複送信リスク**
**問題点：**
- `approveShift.ts`と同様の問題

**推奨改善：**
- `approveShift.ts`と同様

#### ✅ `confirmShiftRequest.ts` - **部分的に良好**
**良い点：**
- statusチェックで既に確認済みの場合は成功として返す（重複呼び出しを許容）

```typescript
if (requestData.status === "confirmed") {
  return {
    success: true,
    message: "既に確認済みです。",
  };
}
```

**改善余地：**
- `idempotencyKey`を使用することで、より明示的な冪等性を確保可能

### 2.2 LINE通知送信

#### ❌ `sendLinePushMessage`, `sendLineButtonMessage` - **重複送信防止なし**
**問題点：**
- 重複送信を防ぐ仕組みがない
- 同じメッセージが複数回送信される可能性

**推奨改善：**
- 通知送信ログをFirestoreに保存
- 同じ`idempotencyKey`での送信を防ぐ
- または、クライアント側で`idempotencyKey`を生成し、Functions側でチェック

### 2.3 その他（確認必要）

以下の関数は冪等性の実装状況を確認する必要があります：
- `createScheduledTournament.ts` - トーナメント作成
- `createTournamentRecurrence.ts` - リカレンス作成
- `updateActiveBill.ts` - 更新操作（更新なので問題ない可能性が高い）
- `updateBill.ts` - 更新操作（更新なので問題ない可能性が高い）

## 3. ✅ 冪等性が不要または上書きで問題ない箇所

### 3.1 月一括更新系（未実装）
- `createProvisionalShifts`（未実装）- 月一括上書きなので冪等性あり
- `finalizeShiftsForMonth`（未実装）- 月一括上書きなので冪等性あり

### 3.2 更新操作
- `updateBill.ts`, `updatePlace.ts` など
- 同じ内容で再実行しても問題ない（ただし、`updatedAt`が更新されることに注意）

## 4. 推奨事項

### 4.1 優先度：高

1. **`createMultipleShifts.ts` の冪等性実装**
   - **推奨**: UPSERTポリシーを採用（新しい設計書の`createAvailabilityRequests`と整合）
   - docIdを固定: `availabilityRequests/{staffId}_{YYYY-MM-DD}_normal`
   - 既存docがある場合は更新、なければ作成

2. **`createShiftRequest.ts` のLINE通知重複送信防止**
   - docIdを固定または`idempotencyKey`を使用
   - 通知送信済みフラグをdocに保存
   - 通知送信前にチェック

3. **`approveShift.ts`, `rejectShift.ts`, `processShiftsByStaff.ts` のLINE通知重複送信防止**
   - `idempotencyKey`を使用
   - 通知送信済みフラグをdocに保存

### 4.2 優先度：中

4. **LINE通知送信関数の改善**
   - 通知送信ログをFirestoreに保存
   - 同じ`idempotencyKey`での送信を防ぐ

5. **`confirmShiftRequest.ts` の明示的な冪等性実装**
   - `idempotencyKey`を使用（現在の実装でも動作するが、より明示的に）

### 4.3 優先度：低

6. **その他の関数の確認**
   - トーナメント作成系、その他の関数で冪等性が必要かどうかを確認

## 5. 実装パターンの推奨

### パターンA: UPSERT（シフト申請など）
```typescript
// docIdを固定
const docId = `${staffId}_${date}_normal`;
const docRef = db.collection('availabilityRequests').doc(docId);

// UPSERT
await docRef.set({
  ...data,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });
```

### パターンB: idempotencyKey + requestHash（bills APIと同様）
```typescript
const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

// トランザクション内でチェック
const idemSnap = await tx.get(idempotencyRef);
if (idemSnap.exists) {
  const prevHash = idemSnap.data()?.requestHash;
  if (prevHash && prevHash !== requestHash) {
    throw new HttpsError('failed-precondition', 'idempotency requestHash mismatch');
  }
  // 既存レスポンスを返却
  return { ...existingResponse, reused: true };
}

// 新規作成
tx.set(idempotencyRef, {
  requestHash,
  createdAt: now,
  ...resultData,
});
```

### パターンC: statusチェック（簡易版）
```typescript
// 既に処理済みかチェック
if (docData.status !== 'pending') {
  if (docData.status === 'completed') {
    return { success: true, message: '既に処理済みです。' };
  }
  throw new Error('このリクエストは既に処理済みです。');
}
```

## 6. 確認範囲

### ✅ 確認済みのファイル

**主要な確認済みファイル：**
- `functions/src/helpers/billsApi/*` - 全て確認（Bills API関連、冪等性実装良好）
- `functions/src/staff/createMultipleShifts.ts` - 確認（冪等性なし）
- `functions/src/staff/createShiftRequest.ts` - 確認（LINE通知重複送信リスク）
- `functions/src/staff/approveShift.ts` - 確認（LINE通知重複送信リスク）
- `functions/src/staff/rejectShift.ts` - 確認（LINE通知重複送信リスク）
- `functions/src/staff/processShiftsByStaff.ts` - 確認（LINE通知重複送信リスク）
- `functions/src/staff/confirmShiftRequest.ts` - 確認（statusチェックによる簡易冪等性）
- `functions/src/staff/declineShiftRequest.ts` - 確認（要詳細確認）
- `functions/src/utils/lineMessaging.ts` - 確認（重複送信防止なし）
- `functions/src/sideGame/*` - 確認（`appendSideGameChip`経由で冪等性あり）
- `functions/src/webhook/lineWebhook.ts` - 確認（要詳細確認）

### ⚠️ 未確認または部分的確認のファイル

**重要な未確認ファイル（優先度高）：**
- `functions/src/attendance/*` - **勤怠関連**（一部のみ確認、全ファイル未確認）
  - `createClockInRecord.ts` - 未確認（出勤記録作成、冪等性必要）
  - `createManualClockInRecord.ts` - 未確認（手動出勤記録作成、冪等性必要）
  - `updateClockOutRecord.ts` - 未確認（退勤記録更新、冪等性必要）
  - `updateManualClockOutRecord.ts` - 未確認（手動退勤記録更新、冪等性必要）
  - `createAttendanceCorrectionRequest.ts` - 未確認（勤怠修正申請作成）
  - `approveAttendanceCorrectionRequest.ts` - 未確認（勤怠修正申請承認）
  - `rejectAttendanceCorrectionRequest.ts` - 未確認（勤怠修正申請却下）

- `functions/src/user/*` - **ユーザー関連**（全ファイル未確認）
  - `createUserAccount.ts` - 未確認（ユーザーアカウント作成、冪等性必要）
  - `createUserByApp.ts` - 未確認（アプリ経由ユーザー作成、冪等性必要）
  - `generateQRCode.ts` - 未確認（QRコード生成）

- `functions/src/userLogin/*` - **ログイン関連**（全ファイル未確認）
  - `processVisitByQR.ts` - 未確認（QRコード処理、冪等性必要）
  - `manualCheckIn.ts` - 未確認（手動チェックイン、冪等性必要）

- `functions/src/callables/*` - **Callable関数**（多数のファイル未確認）
  - `createScheduledTournament.ts` - 未確認（トーナメント作成、冪等性必要）
  - `createTournamentRecurrence.ts` - 未確認（リカレンス作成、冪等性必要）
  - `registerForTournament.ts` - 未確認（トーナメント登録、冪等性必要）
  - `registerParticipants.ts` - 未確認（参加者登録、冪等性必要）
  - `accounting.ts` - 未確認（会計処理、冪等性必要）
  - `updateActiveBill.ts` - 未確認（アクティブビル更新、冪等性必要）
  - その他多数

- `functions/src/itemOrder/*` - **注文関連**（一部のみ確認）
  - `placeOrder.ts` - 未確認（注文作成、冪等性必要）
  - `placeOrderByUser.ts` - 未確認（ユーザー注文作成、冪等性必要）
  - `createMenuItem.ts` - 未確認（メニューアイテム作成、冪等性必要）
  - `updateMenuItem.ts` - 未確認（メニューアイテム更新）

- `functions/src/tournamentBlind/*` - **トーナメントブラインド関連**（全ファイル未確認）
- `functions/src/tournamentTemplate/*` - **トーナメントテンプレート関連**（全ファイル未確認）
- `functions/src/analytics/*` - **分析関連**（一部のみ確認、FieldValue.increment使用で基本的に冪等だが要確認）
- `functions/src/triggers/*` - **トリガー関数**（全ファイル未確認）
- `functions/src/rollbackFunction/*` - **ロールバック関数**（全ファイル未確認）

**統計：**
- 確認済み: 約20ファイル（主にBills API関連、シフト関連）
- 未確認: 約150ファイル以上（推定）

## 7. 次のステップ

### 優先度：高（即座に確認すべき）
1. **勤怠関連**（`attendance/*`）
   - 出勤・退勤記録の作成・更新は冪等性が必須
   - 同じ時刻の重複記録を防ぐ必要がある

2. **ユーザー関連**（`user/*`, `userLogin/*`）
   - ユーザー作成は冪等性が必須
   - QRコード処理は重複実行を防ぐ必要がある

3. **会計・注文関連**（`callables/accounting.ts`, `itemOrder/*`）
   - 会計処理は冪等性が必須（二重会計を防ぐ）
   - 注文作成は既に`appendItem`経由なら冪等性ありだが要確認

### 優先度：中（早めに確認すべき）
4. **トーナメント関連**（`callables/*tournament*`）
   - トーナメント登録・参加者登録は冪等性が必須

5. **トリガー関数**（`triggers/*`）
   - 重複実行を防ぐ仕組みが必要

### 優先度：低（後で確認）
6. **その他**（テンプレート、分析、ロールバックなど）
   - 運用上問題が発生してから確認でも良い可能性

## 8. まとめ

### 確認状況
- **確認済み**: 約20ファイル（主にBills API関連、シフト関連の一部）
- **未確認**: 約150ファイル以上（推定）
- **確認率**: 約10-15%（推定）

### 良い点（確認済みの範囲内）
- Bills API関連は強い冪等性を実装している
- Event関連も適切に実装されている
- いくつかの関数でstatusチェックによる簡易的な冪等性を実装

### 問題点（確認済みの範囲内）
- シフト申請関連で冪等性が不十分
- LINE通知の重複送信リスク
- 一部の関数でリトライ時の不整合が発生する可能性

### 未確認のリスク
- **勤怠関連**: 出勤・退勤記録の重複記録リスク
- **ユーザー関連**: ユーザーアカウントの重複作成リスク
- **会計関連**: 二重会計のリスク（ただし`accounting.ts`は要確認）
- **トーナメント関連**: 重複登録のリスク

### 推奨
1. **優先度の高い未確認ファイルを確認**
   - 勤怠関連（`attendance/*`）
   - ユーザー関連（`user/*`, `userLogin/*`）
   - 会計関連（`callables/accounting.ts`）

2. **新しいシフト設計**（`createAvailabilityRequests`）でUPSERTポリシーを採用（設計書に記載済み）

3. **既存のシフト関連関数**も、可能な限り冪等性を実装

4. **LINE通知送信時**の重複送信防止を実装

### 注意事項
この監査結果は、確認済みのファイル（約20ファイル）に基づいています。未確認のファイル（約150ファイル以上）については、追加の確認が必要です。

