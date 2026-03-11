# B-01 schemaVersion

## 決定: globalConstant に残す

`schemaVersion` は `lib/globalConstant.dart` に残す。

> **Bills スキーマ変更時の考慮**: Bills のスキーマを変更した際には、この値（および Bills 用の schemaVersion）の更新が必要になる可能性がある。その場合は下記「7. Bills スキーマ変更時に修正が必要な箇所」を参照して修正すること。

---

## 2. 設定（定数）一覧

| 定数名 | 型 | 現状の値 | 定義場所 |
|--------|------|----------|----------|
| schemaVersion | String | "1.0" | lib/globalConstant.dart |

---

## 3. 各設定の説明

| 定数 | 説明 |
|------|------|
| schemaVersion | スキーマのバージョン番号。データ構造やマイグレーションの識別に用いる想定。 |

---

## 4. 各設定の取りうる値

| 定数 | 取りうる値 | 備考 |
|------|------------|------|
| schemaVersion | 任意の文字列（例: "1.0", "1.1", "1.3"） | セマンティックバージョニングや "major.minor" 形式が一般的 |

---

## 5. 各値による動作の変化

| 定数 | 値 | 動作への影響 |
|------|-----|--------------|
| schemaVersion | 現状 Dart から参照されていない | 値の変更によるアプリケーション動作への影響は不明。参照元が無いため、変更しても既存機能には影響しない。Bill の `meta.schemaVersion` は別実装（TS 内で `'1.3'` 固定）。 |

---

## 6. 参照ファイル一覧

### Dart（lib）

| ファイル | 参照内容 | 備考 |
|----------|----------|------|
| lib/globalConstant.dart | 定義のみ | `static const String schemaVersion = "1.0";` を定義。**他に参照している Dart ファイルなし** |

### TypeScript（functions）

| ファイル | 参照内容 | 備考 |
|----------|----------|------|
| functions/src/domains/bills/repos/createBillWithActiveStay.ts | `schemaVersion: '1.3'` | `meta.schemaVersion` を Bill に埋め込み。`GlobalConstants` とは無関係のハードコード。 |
| functions/__tests__/ 各種 spec ファイル | `schemaVersion: '1.3'` | テスト用モック。同上。 |

### 結論

- **GlobalConstants.schemaVersion を参照しているコード**: なし
- **Bill の meta.schemaVersion**: `createBillWithActiveStay.ts` 内で `'1.3'` 固定。`globalConstant.dart` の `schemaVersion` とは別体系。

---

## 7. Bills スキーマ変更時に修正が必要な箇所

Bills のスキーマを変更した際、以下の箇所の修正が必要になる可能性がある。

| 修正対象 | ファイル | 内容 |
|----------|----------|------|
| 定義 | lib/globalConstant.dart | `schemaVersion` の値（必要に応じて） |
| Bill 作成時の meta | functions/src/domains/bills/repos/createBillWithActiveStay.ts | `meta.schemaVersion` のハードコード値 |
| テストモック | functions/__tests__/itemOrder/getUserOrderHistory.spec.ts | `schemaVersion` / `meta.schemaVersion` |
| テストモック | functions/__tests__/helpers/billsApi/appendSideGameChip.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/updatePlace.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/getActiveBillByUser.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/postEventRefund.spec.ts | 同上 |
| テストモック | functions/__tests__/triggers/bills.events.onCreate.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/appendItem.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/updateBill.spec.ts | 同上 |
| テストモック | functions/__tests__/callables/cancelAccounting.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/postEventCancel.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/appendItem.concurrent.spec.ts | 同上 |
| テストモック | functions/__tests__/utils/getOpenBills.spec.ts | 同上 |
| テストモック | functions/__tests__/callables/verifyPaymentSplit.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/appendItem.mismatch.spec.ts | 同上 |
| テストモック | functions/__tests__/callables/refundProcessing.spec.ts | 同上 |
| テストモック | functions/__tests__/callables/updateAccounting.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/postEventAdjustment.spec.ts | 同上 |
| テストモック | functions/__tests__/itemOrder/placeOrder.boundary-dates.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/postEventReopen.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/recordTournamentAction.spec.ts | 同上 |
| テストモック | functions/__tests__/helpers/billsApi/startAccounting.spec.ts | 同上 |
| アサーション | functions/__tests__/helpers/billsApi/createBillWithActiveStay.spec.ts | `expect(billData.meta.schemaVersion).toBe('1.3')` の期待値 |

※ schemaVersion を参照している全ファイルは `grep -r "schemaVersion"` で再確認すること。
