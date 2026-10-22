# B-07 ADMIN_CREATED_SHIFT_ID

## 決定: globalConstant に残す

`ADMIN_CREATED_SHIFT_ID` は `lib/globalConstant.dart` に残す。

> **値変更時の考慮**: この値を変更した際には、Flutter と Cloud Functions の両方を同期して修正する必要がある。下記「7. 値変更時に修正が必要な箇所」を参照。

---

## 1. 項目の概要

`ADMIN_CREATED_SHIFT_ID` は、管理者が直接作成したシフト（Weekly Planner 経由でない）を識別するための `sourceRequestId` 値である。
Flutter と Cloud Functions の両方で同じ文字列を使う必要があり、同期必須とされている。

---

## 2. 設定（定数）一覧

| 定数名 | 型 | 現状の値 | 定義場所 |
|--------|------|----------|----------|
| ADMIN_CREATED_SHIFT_ID | String | "admin-created" | lib/globalConstant.dart, functions/src/domains/shift/services/helpers.ts |

※ Flutter と TS で二重定義されている。globalConstant のコメントに「同期必須」とある。

---

## 3. 各設定の説明

| 定数 | 説明 |
|------|------|
| ADMIN_CREATED_SHIFT_ID | シフトアサインの `sourceRequestId` にセットする識別子。この値を持つアサインは「管理者が直接作成したもの」とみなし、Weekly Planner 由来のものと区別する。 |

---

## 4. 各設定の取りうる値

| 定数 | 取りうる値 | 備考 |
|------|------------|------|
| ADMIN_CREATED_SHIFT_ID | 任意の文字列 | 他で使われない一意の識別子である必要あり。変更時は Flutter と TS の両方を同期して修正する必要がある。 |

---

## 5. 各値による動作の変化

| 定数 | 値 | 動作への影響 |
|------|-----|--------------|
| ADMIN_CREATED_SHIFT_ID | 変更 | 管理者作成シフトの判定条件が変わる。Flutter と TS で異なると、作成時は「管理者作成」として記録されるが、TS 側の `updateDayAssignments` で正しく判定されず、意図しない上書きや処理漏れが発生しうる。 |

---

## 6. 参照ファイル一覧

### Dart（lib）

| ファイル | 参照内容 |
|----------|----------|
| lib/globalConstant.dart | 定義: `static const String ADMIN_CREATED_SHIFT_ID = "admin-created";`（コメント: helpers.ts と同期必須） |
| lib/StaffDate/shiftDateDialog.dart | `sourceRequestId: GlobalConstants.ADMIN_CREATED_SHIFT_ID` で管理者が直接作成したシフトを記録 |

### TypeScript（functions）

| ファイル | 参照内容 |
|----------|----------|
| functions/src/domains/shift/services/helpers.ts | 定義: `export const ADMIN_CREATED_SHIFT_ID = "admin-created";` |
| functions/src/domains/shift/callables/updateDayAssignments.ts | `ADMIN_CREATED_SHIFT_ID` を import。`a.sourceRequestId === ADMIN_CREATED_SHIFT_ID` および `assignment.sourceRequestId === ADMIN_CREATED_SHIFT_ID` で管理者作成シフトを判定 |

---

## 7. 値変更時に修正が必要な箇所

`ADMIN_CREATED_SHIFT_ID` の値を変更した際、以下の箇所を同期して修正すること。

| 修正対象 | ファイル | 内容 |
|----------|----------|------|
| 定義（Dart） | lib/globalConstant.dart | `ADMIN_CREATED_SHIFT_ID` の値 |
| 定義（TS） | functions/src/domains/shift/services/helpers.ts | `ADMIN_CREATED_SHIFT_ID` の値 |
| 参照 | lib/StaffDate/shiftDateDialog.dart | `sourceRequestId: GlobalConstants.ADMIN_CREATED_SHIFT_ID` で使用 |
| 参照 | functions/src/domains/shift/callables/updateDayAssignments.ts | `ADMIN_CREATED_SHIFT_ID` で import して使用 |

※ 既存の Firestore データに `sourceRequestId: "admin-created"` が記録されている場合、値変更後は「管理者作成」としての判定条件が変わるため、データ移行が必要になる可能性あり。

---

## Done

**B-07 ADMIN_CREATED_SHIFT_ID は globalConstant に残す方針で決定。Done。**
