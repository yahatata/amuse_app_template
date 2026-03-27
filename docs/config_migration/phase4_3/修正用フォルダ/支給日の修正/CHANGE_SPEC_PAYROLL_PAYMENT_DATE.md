# 支給日設定の修正 — AS-IS 確認 & changeSpec

**目的**: `TOBE_SPEC_PAYROLL_PAYMENT_DATE.md` を実コードへ反映するため、AS-IS の確認結果、修正対象、必要テスト、実行手順を固定する。  
**関連**: `TOBE_SPEC_PAYROLL_PAYMENT_DATE.md`、`functions/src/shared/config/payrollConfig*`、`functions/src/domains/attendance/helpers/payrollPeriodUtils.ts`、`lib/services/payroll_config_service.dart`

---

## 1. AS-IS（現状確認）

## 1-1. 設定モデル

### Functions

現状の `PayrollConfig` は旧フィールド `paymentDate` のみを持つ。

```typescript
// functions/src/shared/config/payrollConfigTypes.ts
export interface PayrollConfig {
  paymentDate: string | null;
  // ...
}
```

デフォルト値も旧フィールドのみ。

```typescript
// functions/src/shared/config/payrollConfigDefaults.ts
export const DEFAULT_PAYROLL_CONFIG_PAYMENT_DATE: string | null = null;
```

ローダーも `paymentDate` だけを読み込む。値形式は `string | null` で、`'25'` でも `'2026-04-25'` でも通る。

```typescript
// functions/src/shared/config/payrollConfigLoader.ts
if (typeof raw.paymentDate === 'string') {
  result.paymentDate = raw.paymentDate;
}
```

### Flutter

Flutter 側 `PayrollConfigData` も旧フィールド `paymentDate` のみ。

```dart
// lib/services/payroll_config_service.dart
class PayrollConfigData {
  final String? paymentDate;
  // ...
}
```

---

## 1-2. 実支給日の算出ロジック

### Functions

`processPayrollNotifications.ts` にローカル関数 `computeActualPaymentDate()` があるが、仕様は以下に固定されている。

- 支払月は **必ず periodEnd の翌月**
- `paymentDayStr` は **1..31 のみ有効**
- `'0' = 月末` は未対応
- `paymentMonthOffset` は未対応

```typescript
// functions/src/domains/attendance/tasks/processPayrollNotifications.ts
export function computeActualPaymentDate(
  paymentDayStr: string | null,
  periodEnd: string
): string | null {
  if (!paymentDayStr) return null;
  const paymentDay = parseInt(paymentDayStr, 10);
  if (isNaN(paymentDay) || paymentDay < 1 || paymentDay > 31) return null;
  // 支払月は periodEnd の翌月で固定
}
```

### Flutter

`payment_management.dart` にも独自ロジックがあり、Functions と一致していない。

- `paymentDay == 0` を **月末** として扱う
- 支払月は **翌月固定**
- `paymentMonthOffset` 未対応

```dart
// lib/payroll/widgets/payment_management.dart
if (paymentDay == 0) {
  final nextM = DateTime(endYear, endMonth + 2, 1);
  payDate = nextM.subtract(const Duration(days: 1));
} else {
  payDate = DateTime(endYear, endMonth + 1, paymentDay);
}
```

**確認結果**: Functions と Flutter で `0=月末` の扱いが不一致。どちらも `paymentMonthOffset` を持たないため、同月払い/翌々月払いを表現できない。

---

## 1-3. 表示コンテキスト

`payrollDisplayContext.ts` は `paymentDate` をそのまま画面表示用に返している。

```typescript
// functions/src/domains/attendance/helpers/payrollDisplayContext.ts
const paymentDate = payrollConfig.paymentDate;
const paymentDateDisplay = paymentDate ?? '未設定';
```

現状の問題:

- 設定生値 `'25'` がそのまま画面に表示される
- `actualPaymentDate` が返却されない
- コメント上は `YYYY-MM-DD` 想定だが、実装はそうなっていない

---

## 1-4. 計算可能期間

`getCalculablePeriod()` は第2引数に **実支給日（YYYY-MM-DD）** を受ける前提。

```typescript
// functions/src/domains/attendance/helpers/payrollPeriodUtils.ts
export function getCalculablePeriod(
  periodEnd: string,
  paymentDate: string | null
): { calcStart: string; calcEnd: string } | null {
  if (paymentDate === null) return null;
  const calcEnd = addDays(paymentDate, -1);
  return { calcStart, calcEnd };
}
```

現状の問題:

- 関数自体は `actualPaymentDate` 前提で妥当
- ただし `paymentDate` という引数名が旧仕様を想起させる
- `computeActualPaymentDate` が共有化されていないため、呼び出し側で前提が揃っていない

---

## 1-5. テストの現状

### Functions テスト

- `functions/__tests__/attendance/processPayrollNotifications.spec.ts`
  - `computeActualPaymentDate('25', '2026-03-25') -> '2026-04-25'`
  - 翌月固定前提
- `functions/__tests__/attendance/payrollPeriodUtils.spec.ts`
  - `getCalculablePeriod('2026-03-25', '2026-04-25')`
  - 実支給日入力前提
- `functions/__tests__/config/payrollConfigLoader.spec.ts`
  - `paymentDate: '2026-04-25'` のような旧前提のケースが混在
- `functions/__tests__/attendance/payrollRunHelpers.spec.ts`
  - `PayrollConfig` テストデータが `paymentDate: '25'` 前提

### Flutter テスト

- 支給日算出に関する専用テストは **存在しない**
- `PayrollConfigData.fromMap()` の新旧互換テストも **存在しない**

---

## 1-6. 仕様書のズレ

以下の docs は旧 `paymentDate` 前提が残っている。

- `docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md`
- `docs/config_migration/phase4_3/specs/03_DATA_MODEL_SPEC.md`
- `docs/config_migration/phase4_3/specs/06_UI_SPEC.md`
- `docs/config_migration/phase4_3/specs/07_NOTIFICATION_SCHEDULER_SPEC.md`
- `docs/config_migration/phase4_3/SPEC_IMPLEMENTATION_DIFF.md`
- `docs/config_migration/phase4_3/OPERATIONS_GUIDE.md`

---

## 2. To-Be（今回反映する修正方針）

`TOBE_SPEC_PAYROLL_PAYMENT_DATE.md` に従い、設定値と算出値を分離する。

- 設定値
  - `paymentDayOfMonth: string | null`
  - `paymentMonthOffset: 0 | 1 | 2`
- 算出値
  - `actualPaymentDate: YYYY-MM-DD | null`
- 表示値
  - `paymentDateDisplay: string`

旧 `paymentDate` は **移行期間中のみ loader/service で読み替え** し、実ロジックでは新フィールドに統一する。

---

## 3. changeSpec（修正箇所一覧）

### 3-1. Functions — 型・デフォルト・loader

| # | ファイル | 修正内容 |
|---|---|---|
| A | `functions/src/shared/config/payrollConfigTypes.ts` | `paymentDate` を廃止し、`paymentDayOfMonth` / `paymentMonthOffset` を追加 |
| B | `functions/src/shared/config/payrollConfigDefaults.ts` | `DEFAULT_PAYROLL_CONFIG_PAYMENT_DAY_OF_MONTH` / `DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET` を追加 |
| C | `functions/src/shared/config/payrollConfigLoader.ts` | 新フィールド読込、旧 `paymentDate` 読み替え、バリデーション追加 |
| D | `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts` | 新 defaults/upsert を反映 |
| D-2 | `functions/src/domains/attendance/helpers/payrollNotificationTemplates.ts` | 通知テンプレートのプレースホルダ命名整理要否を確認 |

#### A. `payrollConfigTypes.ts`

変更後の型:

```typescript
export interface PayrollConfig {
  paymentDayOfMonth: string | null;
  paymentMonthOffset: 0 | 1 | 2;
  bulkPaymentRegistrationEnabled: boolean;
  expectedRange: ExpectedRange | null;
  maxCandidatesCount: number;
  // ...
}
```

方針:

- `paymentDate` は型から除去し、実装側で使わせない
- 型から除去することで、旧参照箇所をコンパイルで洗い出す

#### B. `payrollConfigDefaults.ts`

追加:

```typescript
export const DEFAULT_PAYROLL_CONFIG_PAYMENT_DAY_OF_MONTH: string | null = null;
export const DEFAULT_PAYROLL_CONFIG_PAYMENT_MONTH_OFFSET: 0 | 1 | 2 = 1;
```

#### C. `payrollConfigLoader.ts`

変更内容:

1. `buildPayrollConfigFromDefaults()` を新フィールドへ更新
2. `mergePayrollConfigWithDefaults()` で以下を実装
   - `paymentDayOfMonth` があれば最優先
   - なければ旧 `paymentDate` を暫定読み替え
   - `paymentMonthOffset` は `0|1|2` のみ許容、なければ `1`
3. `mergePayrollConfigForUpsert()` で既存 doc に新フィールドを補完

旧 `paymentDate` 読み替え仕様:

- `'25'` -> `'25'`
- `'0'` -> `'0'`
- `'2026-04-25'` -> `'25'`
- 不正値 -> `null`

ローダー内に純粋関数を追加する。

```typescript
function normalizePaymentDayOfMonth(raw: unknown): string | null
function parseLegacyPaymentDate(raw: unknown): string | null
function normalizePaymentMonthOffset(raw: unknown): 0 | 1 | 2
```

#### D. `initializeStoreConfigCallable.ts`

方針:

- 新 defaults を使って `storeMeta/payrollConfig` を作成/補完
- 既存 doc に対しては `paymentDayOfMonth` / `paymentMonthOffset` を `merge: true` で補完
- 旧 `paymentDate` フィールドは削除しない（移行期間の互換維持）

#### D-2. `payrollNotificationTemplates.ts`

現状のテンプレート本文は `{paymentDate}` プレースホルダを使用している。

```typescript
body: '{periodStart}〜{periodEnd} の給与計算がまだ実行されていません。支払日は {paymentDate} です。'
```

この箇所は **設定値そのものを読んでいるわけではなく、表示用の文字列キー** であるため、ロジック修正は必須ではない。  
ただし、命名の曖昧さを減らすなら、以下のどちらかで統一する。

1. **最小変更**: プレースホルダ名 `{paymentDate}` は維持し、中身には `actualPaymentDate` を渡す
2. **名称統一優先**: プレースホルダ名を `{actualPaymentDate}` に変更し、差し込み側も合わせて変更

今回は change scope を抑えるなら **1 を採用してもよい**。ただし、最終実装時に「コード上の `paymentDate` 名称を残さない」方針なら 2 を採用する。

---

### 3-2. Functions — 支給日算出ユーティリティの共有化

| # | ファイル | 修正内容 |
|---|---|---|
| E | `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts` | `computeActualPaymentDate()` を新仕様で追加/移設、`getCalculablePeriod` コメント・引数名を整理 |
| F | `functions/src/domains/attendance/helpers/payrollDisplayContext.ts` | `actualPaymentDate` / `paymentDateDisplay` を新仕様で返却 |
| G | `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` | ローカル `computeActualPaymentDate` を削除し、共有 util を利用 |
| G-2 | `functions/src/domains/attendance/callables/getPayrollCalcDisplayContext.ts` | displayContext 型変更に追従 |
| G-3 | `functions/src/domains/attendance/callables/getPayrollCandidates.ts` | displayContext 型変更に追従 |

#### E. `payrollPeriodUtils.ts`

追加する関数:

```typescript
export function computeActualPaymentDate(
  periodEnd: string,
  paymentDayOfMonth: string | null,
  paymentMonthOffset: 0 | 1 | 2
): string | null
```

ロジック:

1. `paymentDayOfMonth` が `null` または不正値なら `null`
2. `periodEnd` の年月を基準に `paymentMonthOffset` か月加算
3. `paymentDayOfMonth == '0'` なら月末
4. それ以外は `min(day, lastDayOfMonth)`
5. `YYYY-MM-DD` 返却

既存 `getCalculablePeriod()` はロジック自体は使えるため、以下の整理のみ行う。

- 第2引数名を `actualPaymentDate` に変更
- doc comment を新仕様ベースに更新

#### F. `payrollDisplayContext.ts`

現状:

```typescript
paymentDate: string | null;
paymentDateDisplay: string;
```

変更後:

```typescript
paymentDayOfMonth: string | null;
paymentMonthOffset: 0 | 1 | 2;
actualPaymentDate: string | null;
paymentDateDisplay: string;
```

方針:

- 画面表示は `actualPaymentDate ?? '未設定'`
- 旧 `paymentDate` フィールドは displayContext から除去
- コメントも `YYYY-MM-DD` 前提から新仕様へ修正

#### G. `processPayrollNotifications.ts`

修正内容:

- ファイル内ローカルの `computeActualPaymentDate()` を削除
- `payrollPeriodUtils.ts` の共有関数を import
- `evaluateScheduledNotifications()` の引数を変更

変更前:

```typescript
evaluateScheduledNotifications(todayStr, recentPeriod, paymentDate, reminderStartDays)
```

変更後:

```typescript
evaluateScheduledNotifications(
  todayStr,
  recentPeriod,
  paymentDayOfMonth,
  paymentMonthOffset,
  reminderStartDays
)
```

通知本文や overdue 判定はすべて `actualPaymentDate` ベースに統一する。

#### G-2. `getPayrollCalcDisplayContext.ts`

本体ロジックは `buildPayrollDisplayContext()` に委譲されているため、直接の算出修正は不要。  
ただし返却 shape が以下へ変わることを前提に、型エラー/レスポンス整合性を確認する。

- `paymentDate` 削除
- `paymentDayOfMonth` 追加
- `paymentMonthOffset` 追加
- `actualPaymentDate` 追加

#### G-3. `getPayrollCandidates.ts`

`displayContext` をそのまま返却しているため、算出ロジック変更は不要。  
ただし `GetPayrollCandidatesResponse.displayContext` の型は新 shape に更新する。

---

### 3-3. Flutter — 設定読込と表示・判定

| # | ファイル | 修正内容 |
|---|---|---|
| H | `lib/services/payroll_config_defaults.dart` | 新 defaults を追加 |
| I | `lib/services/payroll_config_service.dart` | 新フィールド読込、旧 `paymentDate` 読み替え、バリデーション追加 |
| J | `lib/payroll/models/payroll_display_context.dart` | displayContext の新レスポンス形に対応 |
| K | `lib/payroll/widgets/payment_management.dart` | overdue 判定を新ユーティリティ利用へ変更 |
| L | `lib/payroll/widgets/calc_tab.dart` | `paymentDateDisplay` を継続利用。型更新のみ確認 |
| M | `lib/payroll/utils/payment_date_utils.dart` | Functions と同一仕様の Dart ユーティリティを新規作成 |
| M-2 | `lib/payroll/payroll_calc_page.dart` ほか displayContext 利用箇所 | コンパイル追従確認 |

#### H. `payroll_config_defaults.dart`

追加:

```dart
const String? kDefaultPayrollConfigPaymentDayOfMonth = null;
const int kDefaultPayrollConfigPaymentMonthOffset = 1;
```

#### I. `payroll_config_service.dart`

`PayrollConfigData` を以下へ変更:

```dart
final String? paymentDayOfMonth;
final int paymentMonthOffset;
```

`fromMap()` で以下を実装:

- `paymentDayOfMonth` を優先読込
- 未設定なら旧 `paymentDate` を暫定読み替え
- `paymentMonthOffset` は `0|1|2` のみ有効
- 無効値は defaults へフォールバック

#### J. `payroll_display_context.dart`

変更後モデル:

```dart
final String? paymentDayOfMonth;
final int paymentMonthOffset;
final String? actualPaymentDate;
final String paymentDateDisplay;
```

`paymentDate` は model から除去する。

#### M. `payment_date_utils.dart`（新規）

Functions と同一仕様の純粋関数を追加する。

```dart
String? computeActualPaymentDate({
  required String periodEnd,
  required String? paymentDayOfMonth,
  required int paymentMonthOffset,
})
```

#### K. `payment_management.dart`

現状の翌月固定ロジックを削除し、`payment_date_utils.dart` を使用する。

変更前:

```dart
final paymentDateStr = config.paymentDate;
final paymentDay = int.tryParse(paymentDateStr);
payDate = DateTime(endYear, endMonth + 1, paymentDay);
```

変更後:

```dart
final actualPaymentDate = computeActualPaymentDate(
  periodEnd: parts[1],
  paymentDayOfMonth: config.paymentDayOfMonth,
  paymentMonthOffset: config.paymentMonthOffset,
);
```

比較対象は `actualPaymentDate` に統一する。

#### L. `calc_tab.dart`

`paymentDateDisplay` の表示文言は継続利用できるため、大きなロジック変更は不要。  
ただし `PayrollDisplayContext` の型変更に伴うコンパイル確認は必須。

#### M-2. `displayContext` 利用箇所全体

現時点で明示的に `paymentDate` を読んでいる Dart 側モデル利用箇所は `calc_tab.dart` が中心だが、  
`PayrollDisplayContext` の shape 変更により、import 先や補完コードでコンパイルエラーが出ないかを横断確認する。

対象:

- `lib/payroll/widgets/calc_tab.dart`
- `lib/payroll/payroll_calc_page.dart`（間接利用確認）
- `lib/payroll/models/payroll_display_context.dart` を参照する他ファイル

---

### 3-4. ドキュメント更新

| # | ファイル | 修正内容 |
|---|---|---|
| N | `docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md` | `paymentDate` を新フィールド2つへ置換、計算可能期間説明を更新 |
| O | `docs/config_migration/phase4_3/specs/03_DATA_MODEL_SPEC.md` | data model 記述を更新 |
| P | `docs/config_migration/phase4_3/specs/06_UI_SPEC.md` | UI 表示は `actualPaymentDate` ベースと明記 |
| Q | `docs/config_migration/phase4_3/specs/07_NOTIFICATION_SCHEDULER_SPEC.md` | 通知条件の `paymentDate` 表現を新仕様へ更新 |
| R | `docs/config_migration/phase4_3/SPEC_IMPLEMENTATION_DIFF.md` | 差分記録を更新 |
| S | `docs/config_migration/phase4_3/OPERATIONS_GUIDE.md` | Console 編集時の設定項目を新仕様へ更新 |

---

## 4. 不要変更の確認

### 4-1. `getPayrollCalcDisplayContext.ts`

ロジックの本体は `buildPayrollDisplayContext()` に集約されているため、**直接の修正はレスポンス型追従のみ**でよい。

### 4-2. `getPayrollCandidates.ts`

`displayContext` をそのまま返却しているだけのため、**直接のロジック変更は不要**。  
ただし型追従と compile 確認は必要。

### 4-3. `calc_tab.dart`

`paymentDateDisplay` を表示しているだけなので、**表示値がサーバーで正しく作られれば追加修正は最小限**でよい。

### 4-4. `payrollNotificationTemplates.ts`

テンプレート本文のプレースホルダ名 `{paymentDate}` は、**表示キー名の問題であり設定値参照ではない**。  
そのためロジック上は修正不要だが、命名統一を優先する場合のみ変更対象とする。

---

## 5. テスト作成項目

## 5-1. Functions テスト

### A. `functions/__tests__/attendance/payrollPeriodUtils.spec.ts`

追加/更新するケース:

1. `offset=0` 同月払い
2. `offset=1` 翌月払い
3. `offset=2` 翌々月払い
4. `paymentDayOfMonth='0'` 月末
5. 31日が存在しない月でクランプ
6. 年跨ぎ
7. `paymentDayOfMonth=null` -> `null`
8. `getCalculablePeriod(periodEnd, actualPaymentDate)` の整合性

### B. `functions/__tests__/attendance/processPayrollNotifications.spec.ts`

更新するケース:

1. `evaluateScheduledNotifications()` の引数を新仕様へ変更
2. same-month (`offset=0`) の強警告判定
3. next-month (`offset=1`) の overdue 判定
4. next-next-month (`offset=2`) の overdue 非発火/発火境界
5. `paymentDayOfMonth='0'` で月末扱い

### C. `functions/__tests__/config/payrollConfigLoader.spec.ts`

追加/更新するケース:

1. defaults が `paymentDayOfMonth=null`, `paymentMonthOffset=1`
2. 新フィールドがそのまま採用される
3. 旧 `paymentDate='25'` -> `paymentDayOfMonth='25'`
4. 旧 `paymentDate='2026-04-25'` -> `paymentDayOfMonth='25'`
5. `paymentMonthOffset` 無効値 -> `1`
6. `paymentDayOfMonth` 無効値 -> `null`

### D. `functions/__tests__/attendance/payrollRunHelpers.spec.ts`

`PayrollConfig` 型変更に追従する。  
ロジック追加は不要だが、fixture を新フィールドへ更新する。

### E. `functions/src/domains/attendance/callables/*` に対する型追従確認

明示的な個別 spec は不要だが、少なくとも build/test で以下を担保する。

1. `getPayrollCalcDisplayContext.ts` が新 `displayContext` shape を返せる
2. `getPayrollCandidates.ts` の `GetPayrollCandidatesResponse` が新 shape と一致する

---

## 5-2. Flutter テスト

### F. `test/payroll/utils/payment_date_utils_test.dart`（新規）

Functions と同じケースを Dart でも検証する。

1. `offset=0`
2. `offset=1`
3. `offset=2`
4. `paymentDayOfMonth='0'`
5. クランプ
6. 年跨ぎ
7. `null`
8. 無効値

### G. `test/services/payroll_config_service_test.dart` または `test/services/payroll_config_data_test.dart`（新規）

`PayrollConfigData.fromMap()` の純粋パースをテストする。

1. 新フィールドの読込
2. 旧 `paymentDate` からの読み替え
3. `paymentMonthOffset` のフォールバック
4. 不正値フォールバック

**補足**: widget test よりも、まず純粋パース/純粋ユーティリティのテストを優先する。

---

## 6. テスト実行項目

実装完了後は、最低限以下を実行する。

### Functions

```bash
cd functions && npm test -- --runInBand __tests__/config/payrollConfigLoader.spec.ts __tests__/attendance/payrollPeriodUtils.spec.ts __tests__/attendance/processPayrollNotifications.spec.ts __tests__/attendance/payrollRunHelpers.spec.ts
```

```bash
cd functions && npm run build
```

### Flutter

```bash
flutter test test/payroll/utils/payment_date_utils_test.dart test/services/payroll_config_data_test.dart
```

必要に応じて追加で実行:

```bash
flutter analyze
```

---

## 7. 実装順序（推奨）

1. `payrollConfigTypes.ts` / defaults / loader / Flutter service を新仕様へ更新
2. `payrollPeriodUtils.ts` に `computeActualPaymentDate()` を共通化
3. `processPayrollNotifications.ts` を共通 util 利用へ移行
4. `payrollDisplayContext.ts` / Dart model を新レスポンス形へ移行
5. `payment_management.dart` を Dart util 利用へ移行
6. Functions テスト作成・更新
7. Flutter テスト作成
8. `npm test` / `npm run build` / `flutter test` / `flutter analyze`
9. docs 更新

---

## 8. 実装後に期待される状態

- `storeMeta/payrollConfig` で
  - `paymentDayOfMonth='31', paymentMonthOffset=0`
  - `paymentDayOfMonth='25', paymentMonthOffset=0`
  - `paymentDayOfMonth='10', paymentMonthOffset=1`
  - `paymentDayOfMonth='25', paymentMonthOffset=2`
  をすべて一意に表現できる
- Functions / Flutter / docs のルールが一致する
- 通知・表示・期限判定がすべて `actualPaymentDate` 基準で揃う
- 旧 `paymentDate` は移行期間中のみ読めるが、新ロジックの判定には直接使われない

---

## 9. 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-03-27 | 初版（AS-IS 確認、修正対象、テスト項目、実行手順を追加） |
