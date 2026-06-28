# Phase1 storeMeta/config スキーマ（最終版）

作成日: 2026-03-04  
参照: [phase0B/STOREMETA_CONFIG_SPEC.md](../phase0B/STOREMETA_CONFIG_SPEC.md), [PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md), [store_config_classification.md](../../config_audit/store_config_classification.md)  
欠損時挙動: [PHASE1_FALLBACK_BEHAVIOR.md](./PHASE1_FALLBACK_BEHAVIOR.md)

---

## 1. スキーマの方針

- **ドキュメント**: 単一ドキュメント `storeMeta/config`（店舗 1 プロジェクト = 1 ドキュメント）
- **読み取り優先度**: ① storeMeta/config → ② defaults.ts → ③ 各 TS 内直書き
- **未設定時**: エラーにせずフォールバック
- **分類**: MECE（相互排他・網羅的）に 8 ドメインで整理

---

## 2. ドメイン一覧（MECE）

| ドメイン | 用途 | Phase0B ID | Phase1 スコープ |
|----------|------|------------|-----------------|
| features | 機能フラグ・トグル | D-05, D-07, D-08, D-09, B-06 | ✅ 含める |
| autoOpenClose | 自動開閉店 | D-10 | ✅ 含める |
| businessDay | 営業日計算 | 補足（calcBufferMinutes） | ✅ 含める |
| businessHoursStyles | 営業時間スタイル | R-10 | ✅ 含める |
| billing | 会計・料金 | R-06, R-11, R-12 | ✅ 含める |
| linePlan | LINE プラン | D-04 | ✅ 含める |
| shift | シフト運用 | R-08, R-09 | ✅ 含める（R-09 は実装時検討） |
| payroll | 給与締め | R-07 | ✅ 含める |
| ~~businessDay.closeHour~~ | 閉店時刻 | D-06 | ❌ **Phase4 で廃止のため含めない** |

---

## 3. スキーマ定義（ドメイン別）

### 3.1 features（機能フラグ）

| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `features.dualWriteEnabled` | boolean | 任意 | 当日請求 dual-write の有効化 | `false` |
| `features.enqueueSchedulerEnabled` | boolean | 任意 | enqueue スケジューラの有効化 | `false` |
| `features.templateBusinessDateCheck` | boolean | 任意 | テンプレート営業日重複チェックの有効化 | `false` |
| `features.settlementAggregatorEnabled` | boolean | 任意 | 決済アグリゲータの有効化 | `true` |
| `features.tableDeviceRegistrationEnabled` | boolean | 任意 | 卓端末登録機能の有効化 | `true` |

**許容値**: すべて boolean（true / false）

---

### 3.2 autoOpenClose（自動開閉店）

| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `autoOpenClose.enabled` | boolean | 任意 | 自動開閉店の有効/無効 | `true` |
| `autoOpenClose.taskCloseOffsetMinutes` | int | 任意 | 閉店認定タスクのオフセット（閉店時刻からの分） | `120` |
| `autoOpenClose.taskOpenOffsetMinutes` | int | 任意 | 開店認定タスクのオフセット（開店時刻からの分、負数で「前」） | `-30` |

**許容値**: taskCloseOffsetMinutes は 0 以上の整数、taskOpenOffsetMinutes は負数可（開店前の分を表す）

---

### 3.3 businessDay（営業日計算）

| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `businessDay.calcBufferMinutes` | int | 任意 | 営業日境界計算時のバッファ（分） | `70` |

**許容値**: `calcBufferMinutes` は 0 以上の整数（推奨: 30〜120）

**※ D-06 (closeHour) は Phase4 で廃止のため、本スキーマには含めない。**

---

### 3.4 businessHoursStyles（営業時間スタイル）— Deprecated

> **Phase 3 以降**: 正本は `storeMeta/businessStyles`（version 2）。  
> `storeMeta/config.businessHoursStyles` は schema / defaults / merge 対象外。  
> 詳細: `docs/運用時資料/設定/storeMeta/configによる設定の詳細/businessHoursStyles.md`

以下は Phase 1 時点の旧定義（参照用）:
| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `businessHoursStyles.weekday` | object | 任意 | 平日スタイル | 下記 |
| `businessHoursStyles.weekendHoliday` | object | 任意 | 週末・祝日スタイル | 下記 |
| `businessHoursStyles.event` | object | 任意 | イベントスタイル | 下記 |
| `businessHoursStyles.allDay` | object | 任意 | 終日スタイル | 下記 |
| `businessHoursStyles.closed` | object | 任意 | 休業日スタイル | 下記 |

**各スタイルオブジェクトの型**:

```ts
{ styleId: string; openMinute: number; closeMinute: number; isClosed: boolean }
```

| スタイル | styleId | openMinute | closeMinute | isClosed |
|----------|---------|------------|-------------|----------|
| weekday | weekday | 900 | 1500 | false |
| weekendHoliday | weekendHoliday | 720 | 1500 | false |
| event | event | 600 | 1500 | false |
| allDay | allDay | 360 | 1500 | false |
| closed | closed | 0 | 0 | true |

**許容値**: openMinute / closeMinute は 0〜1440（分）、isClosed が true の場合は 0 でも可

---

### 3.5 billing（会計・料金）

#### 3.5.1 入店料

| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `billing.entranceFee` | int | 任意 | 入店料（円） | `1000` |
| `billing.entranceFeeDescription` | string | 任意 | 入店料の説明文 | `"入店料"` |
| `billing.chargeEntranceFeeOnReentry` | boolean | 任意 | 再入店時に入店料を取るか | `false` |

#### 3.5.2 チップ・支払ポリシー

| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `billing.sideGameChipRate` | number | 任意 | チップ 1 枚あたりの円換算レート | `10.0` |
| `billing.paymentPolicy.categoryPaymentMethods` | Record&lt;string, string[]&gt; | 任意 | カテゴリ別の利用可能な支払い方法 | 下記 |
| `billing.paymentPolicy.pointPriority` | string[] | 任意 | ポイント使用の優先順位 | `["pointA","pointB","sideGameChip"]` |
| `billing.paymentPolicy.roundingUnits.pointAB` | int | 任意 | pointA/pointB の丸め単位（円） | `1000` |
| `billing.paymentPolicy.roundingUnits.sideGameChip` | int | 任意 | sideGameChip の丸め単位（チップ数） | `100` |

**categoryPaymentMethods のデフォルト**:

| カテゴリ | 利用可能な支払い方法 |
|----------|----------------------|
| extraCost | cash, credit_card, electronic_money |
| sideGameChip | cash, credit_card, electronic_money |
| items | cash, credit_card, electronic_money, pointA, pointB, sideGameChip |
| tournaments | cash, credit_card, electronic_money, pointA, pointB |

**許容値**:
- `entranceFee`: 0 以上の整数（円）
- `pointPriority`: pointA, pointB, sideGameChip の順序を指定。各要素は `'pointA'` \| `'pointB'` \| `'sideGameChip'` のいずれか
- `roundingUnits.pointAB`: 1 以上の整数（円）
- `roundingUnits.sideGameChip`: 1 以上の整数（チップ数）
- `categoryPaymentMethods` の値: `'cash'` \| `'credit_card'` \| `'electronic_money'` \| `'pointA'` \| `'pointB'` \| `'sideGameChip'` の組み合わせ

---

### 3.6 linePlan（LINE プラン）

| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `linePlan` | string | 任意 | LINE プラン種別 | `"communication"` |

**許容値**: `'communication'` \| `'light'` \| `'standard'`（それ以外の場合はフォールバック時にデフォルトを使用）

---

### 3.7 shift（シフト運用）

| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `shift.submissionStartDay` | int | 任意 | シフト提出期間の開始日（前月の何日から） | `1` |
| `shift.submissionEndDay` | int | 任意 | シフト提出期間の終了日（前月の何日まで） | `15` |
| `shift.schedulingStartDay` | int | 任意 | シフト組む期間の開始日（前月の何日から） | `16` |
| `shift.requiredStaffByTimeSlot` | - | - | **分離済み**。`storeMeta/requiredStaffByTimeSlot` を参照 | - |

**requiredStaffByTimeSlot**（storeMeta/requiredStaffByTimeSlot）の要素型:

```ts
{ startHour: number; endHour: number; requiredCount: number }
```

**requiredStaffByTimeSlot のデフォルト値**:

| startHour | endHour | requiredCount |
|-----------|---------|---------------|
| 19 | 22 | 2 |
| 10 | 12 | 3 |

**許容値**:
- `submissionStartDay`, `submissionEndDay`, `schedulingStartDay`: 1〜28 の整数（前月の日付）
- `requiredStaffByTimeSlot`: startHour, endHour は 0〜23、requiredCount は 0 以上の整数。startHour < endHour を推奨

**備考**: R-09。storeMeta/requiredStaffByTimeSlot に分離済み。docs/運用時資料/設定/storeMeta/requiredStaffByTimeSlot.md 参照。

---

### 3.8 payroll（給与締め）

| キー | 型 | 必須 | 説明 | デフォルト |
|------|-----|------|------|------------|
| `payroll.startDay` | int | 任意 | 給与期間の開始日（例: 26 → 26日開始） | `26` |
| `payroll.endDay` | int | 任意 | 給与期間の終了日（例: 25 → 翌月25日まで） | `25` |

**許容値**: 1〜28 の整数。startDay と endDay は連続する期間を表す（例: 26→25 で 26日〜翌月25日）

---

## 4. YAML 形式サマリ（実装参照用）

```yaml
# storeMeta/config

features:
  dualWriteEnabled: bool
  enqueueSchedulerEnabled: bool
  templateBusinessDateCheck: bool
  settlementAggregatorEnabled: bool
  tableDeviceRegistrationEnabled: bool

autoOpenClose:
  enabled: bool
  taskCloseOffsetMinutes: int
  taskOpenOffsetMinutes: int

businessDay:
  calcBufferMinutes: int

businessHoursStyles:
  weekday: { styleId, openMinute, closeMinute, isClosed }
  weekendHoliday: { ... }
  event: { ... }
  allDay: { ... }
  closed: { ... }

billing:
  entranceFee: int
  entranceFeeDescription: string
  chargeEntranceFeeOnReentry: bool
  sideGameChipRate: number
  paymentPolicy:
    categoryPaymentMethods: Record<string, string[]>
    pointPriority: string[]
    roundingUnits:
      pointAB: int
      sideGameChip: int

linePlan: "communication" | "light" | "standard"

shift:
  submissionStartDay: int
  submissionEndDay: int
  schedulingStartDay: int
  requiredStaffByTimeSlot: Array<{ startHour, endHour, requiredCount }>  # 曜日ごとの可能性あり

payroll:
  startDay: int
  endDay: int
```

---

## 5. 含めない項目（Phase0B 決定）

| ID | キー | 理由 |
|----|------|------|
| D-06 | businessDay.closeHour (STORE_CLOSE_HOUR) | Phase4 で廃止。determineAttendanceMode 出勤/退勤分離、夜間ジョブは閉店処理/Cloud Task 起動 |
| - | identity (storeId / tenantId) | **不要**。店舗ごとに Firebase プロジェクトを作成するため、storeMeta/config には含めない |

---

## 6. ドメイン・キー一覧（一覧表）

| ドメイン | キー | 型 | 分類 ID |
|----------|------|-----|---------|
| features | dualWriteEnabled | bool | D-07 |
| features | enqueueSchedulerEnabled | bool | D-08 |
| features | templateBusinessDateCheck | bool | D-09 |
| features | settlementAggregatorEnabled | bool | D-05 |
| features | tableDeviceRegistrationEnabled | bool | B-06 |
| autoOpenClose | enabled | bool | D-10 |
| autoOpenClose | taskCloseOffsetMinutes | int | D-10 |
| autoOpenClose | taskOpenOffsetMinutes | int | D-10 |
| businessDay | calcBufferMinutes | int | 補足 |
| businessHoursStyles | weekday, weekendHoliday, event, allDay, closed | object | R-10 |
| billing | entranceFee | int | R-06 |
| billing | entranceFeeDescription | string | R-06 |
| billing | chargeEntranceFeeOnReentry | bool | R-06 |
| billing | sideGameChipRate | number | R-12 |
| billing | paymentPolicy.categoryPaymentMethods | map | R-11 |
| billing | paymentPolicy.pointPriority | string[] | R-11 |
| billing | paymentPolicy.roundingUnits | object | R-11 |
| linePlan | (root) | string | D-04 |
| shift | submissionStartDay | int | R-08 |
| shift | submissionEndDay | int | R-08 |
| shift | schedulingStartDay | int | R-08 |
| storeMeta/requiredStaffByTimeSlot（別 doc） | data | array | R-09 |
| payroll | startDay | int | R-07 |
| payroll | endDay | int | R-07 |

---

## 7. defaults.ts との対応

すべてのデフォルト値は `functions/src/shared/config/defaults.ts` に定義済み。  
Task 2 完了。Phase2 最後に値の妥当性を確認する。
