# 支給日（paymentDayOfMonth / paymentMonthOffset）

`periodEnd`（給与期間末日）と組み合わせて **実支給日** を決め、**計算可能期間**（いつまでに計算・確定すべきか）の導出に使う。`storeMeta/config` の `payroll.startDay` / `endDay` で決まる期間とは別ドキュメントで管理する。

---

## paymentDayOfMonth

### 設定の説明

毎月の支給「日」を表す。`paymentMonthOffset` と組み合わせて、ある `periodEnd` に対するカレンダー上の支給日を一意に決める。

### 何を設定するのか

`storeMeta/payrollConfig` の `paymentDayOfMonth`（**文字列**の日付番号、`"1"`〜`"31"`、または **`"0"`**）。`"0"` は **その月の末日** を意味する（実装は Flutter `computeActualPaymentDate` および Functions 側の支給日導出で共通）。

- **`null`**: 支給日をアプリ上で確定できない。計算可能期間の表示などが制限される場合がある（実装依存）。

### 取得失敗・不正時

ローダー（`payrollConfigLoader.ts` / `PayrollConfigData.fromMap`）で不正な場合はデフォルトへ。`paymentDayOfMonth` のデフォルトは **`null`**。

### 現状持ちうる値

| 値 | 意味 |
|----|------|
| `"1"`〜`"31"` | 支給日（その月に日が存在しない場合はその月の末日に丸められる） |
| `"0"` | 支給日は対象月の末日 |
| `null` | 未設定（既定） |

**レガシー互換**: 過去の `paymentDate`（`YYYY-MM-DD` 形式の文字列）が残っている場合、**日部分のみ**読み替えて `paymentDayOfMonth` として扱う。

### その設定により何が変わるのか

- 給与管理・計算タブまわりの **実支給日表示**、**計算可能ウィンドウ**（`periodEnd` 翌日〜支給日前日）の説明
- `getPayrollCalcDisplayContext` Callable（内部で `buildPayrollDisplayContext`）が返す表示用コンテキスト
- `processPayrollNotifications` における期間・リマインド条件の材料

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/shared/config/payrollConfigLoader.ts` | 取得・正規化・レガシー読替 |
| ts | `functions/src/shared/config/payrollConfigDefaults.ts` | デフォルト `null` |
| ts | `functions/src/domains/attendance/helpers/payrollDisplayContext.ts` | 表示コンテキスト組み立て |
| ts | `functions/src/domains/attendance/callables/getPayrollCalcDisplayContext.ts` | Callable |
| ts | `functions/src/domains/attendance/callables/getPayrollCandidates.ts` | 候補取得応答にコンテキスト同梱 |
| ts | `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` | 通知ロジック |
| dart | `lib/services/payroll_config_service.dart` | 購読・パース |
| dart | `lib/payroll/utils/payment_date_utils.dart` | 実支給日算出 |
| dart | `lib/payroll/widgets/payment_management.dart` ほか | UI 表示 |

---

## paymentMonthOffset

### 設定の説明

`periodEnd` の属する月を基準に、支給日がある **何ヶ月先の月** かを表す。

### 何を設定するのか

`0`（同月） / `1`（翌月） / `2`（翌々月）のいずれか。デフォルトは **`1`（翌月払い）**。

### 取得失敗・不正時

不正値・欠落時はデフォルト `1` にフォールバック。

### 現状持ちうる値

| 値 | 意味 |
|----|------|
| `0` | `periodEnd` と同じ月の `paymentDayOfMonth`（または末日）に支給 |
| `1` | 翌月 |
| `2` | 翌々月 |

### その設定により何が変わるのか

`paymentDayOfMonth` と同様、**実支給日** と **計算可能期間** の導出。同月払い・翌月払い・翌々月払いの切り替えはこのフィールドが主軸。

### 影響を受けるファイル一覧

`paymentDayOfMonth` と同じ（支給日導出は両方必須）。
