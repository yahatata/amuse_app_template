# ChangeSpec: シフト設定「営業スタイル・必要人数設定」

## 文書情報

| 項目 | 内容 |
|------|------|
| **文書名** | ChangeSpec: シフト設定「営業スタイル・必要人数設定」 |
| **作成先** | [`02_changeSpec.md`](./02_changeSpec.md)（本ファイル） |
| **正本仕様** | [`01_仕様整理.md`](./01_仕様整理.md) |
| **調査根拠** | 実装前調査（shift / businessHours / requiredStaffByTimeSlot 周辺） |
| **コード整合チェック** | 2026-06-24 時点の `functions/src` / `lib/` を照合済み |

### 確定方針（本 ChangeSpec の前提）

1. `source: manual` の日も、`styleId` が一致すれば営業スタイル変更を反映する
2. 再計算対象は **JST 今日以降**（`dateKey >= todayJst`）のうち、**既存 doc に存在する日**のみ
3. `requiredStaffByTimeSlot` は v2 `byStyle` 形式のみ正式対応（旧 `data` 互換なし）
4. runtime fallback は行わない
5. 設定未完了 UI では、doc 未存在・不正形式・読取失敗 / style 未設定 / 空配列 `[]` を区別する
6. 中央管理アプリは対象外
7. Callable は営業スタイル保存と必要人数保存で **2 つ**に分ける
8. gap 判定は Functions / Flutter ともに **60 分刻み**に統一する
9. `isSufficient` は boolean のみ DB 保存。不足詳細は画面表示時に都度計算
10. 不足警告は連続時間帯をマージして表示する
11. **`businessHoursStyles.label` は保存しない**。表示名は `styleId` に対応する **UI 固定ラベル**を使用する
12. 再計算のため未来月 doc を **新規生成しない**（既存 `businessHoursMonthlyMap` / `shifts` の月次データのみ）
13. `businessHoursMonthlyMap` 未作成月に `shifts` が存在する場合は **データ不整合として Callable を失敗**させる
14. 設定保存と `isSufficient` 再計算は **同一 Callable 内で一体**とし、再計算失敗時は成功扱いにしない
15. 読取失敗時のキャッシュは **不足判定に使わない**（判定は設定未完了扱い）

### 実装時の Cursor rules 確認（必須）

| 変更レイヤ | 確認ルール |
|-----------|-----------|
| `functions/src/**` | [`.cursor/rules/cloud-functions-error-logging.mdc`](../../../.cursor/rules/cloud-functions-error-logging.mdc) |
| `lib/**` | [`.cursor/rules/flutter-loading-display.mdc`](../../../.cursor/rules/flutter-loading-display.mdc) |

**Functions 実装時の要点**

- 新規 Callable は `logOpsError` / 必要に応じて `logOpsSuccess`
- `functionEntry` は export 名と一致
- `serviceByFunctionEntry.ts` に登録
- 同一 `functionEntry` に複数 `logOpsError` がある場合は `operation` を付与
- `console.warn` は使用しない

**Flutter 実装時の要点**

- 設定画面の初回読込: **画面表示時の読込**（主領域 CPI）
- 設定保存: **更新系**（全面半透明ロック + CPI、`finally` で解除 → SnackBar）

---

## 1. 目的

シフト作成時の不足判定・警告表示を、店舗の営業実態に即して正しく行えるようにする。

* 営業スタイルごとの営業時間を店舗側で編集可能にする
* 営業スタイルごとの必要人数を店舗側で編集可能にする
* `requiredStaffByTimeSlot` を v2 `byStyle` 形式に変更する
* `businessHours.styleId` に応じた必要人数判定を行う
* 設定保存後、JST 今日以降の対象日の `isSufficient` を再計算する
* gap 判定を Functions / Flutter ともに 60 分刻みに統一する
* 不足警告表示は連続時間帯をマージして表示する

必要人数設定は、不足判定・警告表示のための**判定条件**であり、それ自体が目的ではない。

---

## 2. 背景

### 2.1 営業スタイルの営業時間を店舗側で編集できない

営業日編集（`BusinessDayEditPage`）では日ごとに `styleId` を選択できるが、スタイルマスタ（`storeMeta/config.businessHoursStyles`）を編集する UI がない。

### 2.2 必要人数が全営業日共通

現状の `storeMeta/requiredStaffByTimeSlot` は `data[]` の単一配列。営業スタイル別の必要人数を設定できない。

### 2.3 fallback により店舗実態と異なる判定が起きうる

Functions `getRequiredStaffByTimeSlot` / Flutter `RequiredStaffByTimeSlotService` は、doc 未存在・不正時に default へ fallback する。本変更では廃止する。

### 2.4 不足警告表示が分かりにくい

`findInsufficientTimeSlots` の 1 時間単位スロットをそのまま羅列している（`shiftDateDialog` / `shiftHomePage`）。

### 2.5 gap 判定粒度の不一致（現コード）

| 層 | gap 粒度 | insufficient 粒度 |
|----|---------|------------------|
| Functions `findGapTimeSlots` | **60 分** | 60 分（1 時間スロット） |
| Flutter `_findGapTimeSlots` | **30 分** | 60 分（1 時間スロット） |

`isSufficient` の DB 保存は Functions 側ロジックに依存するため、Flutter の gap 表示とズレうる。本変更で 60 分に統一する。

---

## 3. 対象範囲

### 3.1 データ

* `storeMeta/config.businessHoursStyles`
* `storeMeta/requiredStaffByTimeSlot`
* `businessHoursMonthlyMap/{yearMonth}`
* `businessHoursMonthly/{yearMonth}/days/{DD}`
* `shifts/{yearMonth}/days/{dateKey}`（`businessHours`, `isSufficient`, `sufficientOverride`, `isFinalized`）

### 3.2 Functions

* v2 読取・styleId 別判定 helper
* 営業スタイル保存 Callable（新規）
* 必要人数保存 Callable（新規）
* 再計算 / スタイル反映 helper（新規）
* 既存 shift Callable・`isInsufficientDayOrTimeSlot` の更新
* `initializeStoreConfigCallable` の v2 対応

### 3.3 Flutter

* シフトメニュー・新規設定画面
* `RequiredStaffByTimeSlotService` v2 対応
* `shift_repository` Callable 呼び出し
* 不足警告表示改善（gap 60 分統一・連続マージ）
* `BusinessDayEditPage` スタイルラベルを UI 固定ラベルに統一（営業時間は `StoreConfigService` から取得）

### 3.4 Tests

* Functions helper / Callable emulator test
* Flutter service / helper test
* 既存 `requiredStaffByTimeSlot` 関連 test の全面更新

---

## 4. 非対象範囲

* 旧 `data` 形式との互換処理
* 不足詳細の DB 保存
* 必要人数設定の履歴管理
* **JST 今日より前**の日の自動再計算
* `isFinalized === true` の日の自動更新
* `sufficientOverride !== null` の日の自動上書き
* 募集通知ロジックの変更
* scheduler / monitoring 系
* 中央管理アプリ
* 未来月 doc の新規生成（設定保存を契機とした月次 doc 作成）
* `businessHoursStyles.label` の config 保存

---

## 5. 対象ファイル一覧

### Functions — 既存（変更）

| ファイル | 役割 | 変更内容 |
|---------|------|---------|
| `functions/src/domains/shift/services/helpers.ts` | `getRequiredStaffByTimeSlot`, `findGapTimeSlots`, `findInsufficientTimeSlots`, `calculateIsSufficient`, `isInsufficientDayOrTimeSlot`, `getYearMonthFromDateKey`, `assertAdminDevice` | v2 読取、styleId 別判定、fallback 削除、再計算 helper 追加 |
| `functions/src/shared/config/types.ts` | 型定義 | v2 型追加（`BusinessHoursStyle` に `label` は追加しない） |
| `functions/src/shared/config/defaults.ts` | デフォルト SSoT | `DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT` を v2 オブジェクト化 |
| `functions/src/domains/shift/callables/updateDayAssignments.ts` | assignments 更新 + `isSufficient` | styleId 別 required 参照 |
| `functions/src/domains/shift/callables/interimConfirmRequests.ts` | 中間確定 | 同上 |
| `functions/src/domains/shift/callables/finalizeDay.ts` | 最終確定 | 同上 |
| `functions/src/domains/shift/callables/finalizeMonth.ts` | 月次最終確定 | 同上 |
| `functions/src/domains/shift/callables/setSufficientOverride.ts` | override | 同上 |
| `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts` | 初期セットアップ | v2 形式で `requiredStaffByTimeSlot` 作成 |
| `functions/src/domains/shift/index.ts` | export | `saveBusinessHoursStyles` を追加 |
| `functions/src/domains/storeMeta/index.ts` | export | `saveRequiredStaffByTimeSlotCallable` を追加 |
| `functions/src/shared/logging/serviceByFunctionEntry.ts` | logOps | 新規 functionEntry 登録 |
| `functions/src/shared/businessHours/services/businessHoursCore.ts` | `upsertBusinessHoursForMonth`, `syncBusinessHoursToShifts` | スタイル反映 helper から呼び出し（本体変更は最小） |
| `functions/src/shared/businessHours/index.ts` | export | `saveBusinessHoursStyles` を追加 |
| `functions/src/domains/staff/callables/createMultipleShifts.ts` | スタッフ申請 | `isInsufficientDayOrTimeSlot` 経由で v2 影響を受ける |
| `functions/src/domains/staff/callables/updateShiftRequest.ts` | スタッフ申請更新 | 同上 |

### Functions — 新規

| ファイル | 役割 |
|---------|------|
| `functions/src/shared/businessHours/callables/saveBusinessHoursStyles.ts` | 営業スタイル保存 + 既存日反映 + 再計算 |
| `functions/src/domains/storeMeta/callables/saveRequiredStaffByTimeSlotCallable.ts` | 必要人数 v2 保存 + 再計算 |
| `functions/src/domains/shift/services/recalculateIsSufficient.ts`（仮） | 一括再計算 helper（`helpers.ts` 内でも可） |
| `functions/src/shared/businessHours/services/propagateBusinessHoursStyleChange.ts`（仮） | スタイル変更の既存日反映（`businessHoursCore` 近傍でも可） |

### Flutter — 既存（変更）

| ファイル | 変更内容 |
|---------|---------|
| `lib/StaffDate/shiftMenuPage.dart` | メニュー 4 項目目追加 |
| `lib/StaffDate/shiftHomePage.dart` | v2 参照、gap 60 分、マージ表示、設定未完了表示 |
| `lib/StaffDate/shiftDateDialog.dart` | 同上 |
| `lib/StaffDate/shift_repository.dart` | 新 Callable 2 本 |
| `lib/services/required_staff_by_time_slot_service.dart` | v2 パース、fallback 削除、状態モデル |
| `lib/services/store_config_defaults.dart` | v2 初期化用 default |
| `lib/services/store_config_service.dart` | 設定画面での `businessHoursStyles` 購読（読取のみ） |
| `lib/StaffDate/businessDayEditPage.dart` | スタイルラベルを UI 固定ラベルに統一（営業時間は `StoreConfigService` から取得） |

### Flutter — 新規

| ファイル | 役割 |
|---------|------|
| `lib/StaffDate/shift_style_required_staff_settings_page.dart` | 営業スタイル・必要人数設定画面 |
| `lib/StaffDate/utils/required_staff_resolution.dart`（仮） | 設定未完了 / style 別解決の型・helper |
| `lib/StaffDate/utils/merge_consecutive_insufficient_slots.dart`（仮） | 連続不足時間帯マージ |
| `lib/StaffDate/utils/gap_time_slots.dart`（仮） | gap 60 分判定（Functions と同等ロジック） |
| `lib/StaffDate/utils/business_hours_style_labels.dart`（仮） | `styleId` → UI 固定表示名のマッピング |

### Tests

| ファイル | 変更 |
|---------|------|
| `functions/__tests__/config_migration/requiredStaffByTimeSlot.spec.ts` | v2・fallback 削除前提で全面更新 |
| `test/services/required_staff_by_time_slot_service_test.dart` | v2 パース・状態区別 |
| `test/services/store_config_phase2_test.dart` | 軽微（businessHoursStyles 維持） |
| `functions/__tests__/domains/shift/calculateIsSufficient.spec.ts`（新規） | helper 単体 |
| `functions/__tests__/shared/businessHours/saveBusinessHoursStyles.spec.ts`（新規） | Callable emulator |
| `functions/__tests__/storeMeta/saveRequiredStaffByTimeSlotCallable.spec.ts`（新規） | Callable emulator |

### 変更しない（参考）

| ファイル | 理由 |
|---------|------|
| `functions/src/domains/shift/callables/calculateInsufficientDays.ts` | DB 上の `isSufficient` を参照するのみ。再計算で値が更新される |
| `firestore.rules` | 対象 doc は既に `write: false`。Callable 経由で十分 |

---

## 6. データスキーマ

### 6.1 `storeMeta/config.businessHoursStyles`

既存フィールド（現コード `types.ts`）。**`label` は保存しない**（schema 変更なし）。

```ts
{
  styleId: string;
  openMinute: number;
  closeMinute: number;
  isClosed: boolean;
}
```

営業スタイルの**表示名**は config ではなく、Flutter 側の UI 固定ラベルを使用する。

| styleId | UI 固定ラベル |
|---------|-------------|
| `weekday` | 平日 |
| `weekendHoliday` | 週末・祝日 |
| `event` | イベント |
| `allDay` | 終日 |
| `closed` | 休業日 |

店舗ごとに編集するのは営業時間・必要人数であり、表示名は固定 ID 運用とする。

5 スタイル: `weekday`, `weekendHoliday`, `event`, `allDay`, `closed`

`closed` は `{ openMinute: 0, closeMinute: 0, isClosed: true }` 固定。

時刻は minute 保存（例: 900=15:00, 1500=25:00, 1440=24:00）。

### 6.2 `storeMeta/requiredStaffByTimeSlot`（v2 のみ）

```ts
{
  version: 2,
  byStyle: {
    weekday: Array<{ startHour: number; endHour: number; requiredCount: number }>,
    weekendHoliday: [...],
    event: [...],
    allDay: [...],
    closed: []  // 常に空配列
  },
  updatedAt: Timestamp
}
```

旧 `data[]` は読まない・書かない。

### 6.3 `businessHoursMonthlyMap/{yearMonth}`

```ts
{
  days: {
    "01": {
      openMinute: number;
      closeMinute: number;
      isClosed: boolean;
      styleId?: string | null;
      source?: "auto" | "manual";
    }
  },
  createdAt?: Timestamp,
  updatedAt?: Timestamp
}
```

### 6.4 `businessHoursMonthly/{yearMonth}/days/{DD}`

SSoT。`businessHoursMonthlyMap` はキャッシュ。`upsertBusinessHoursForMonth` が両方更新する。

### 6.5 `shifts/{yearMonth}/days/{dateKey}`

| フィールド | 型 | 備考 |
|-----------|-----|------|
| `businessHours` | object | `openMinute`, `closeMinute`, `isClosed`, `styleId`, `source` |
| `isSufficient` | boolean | 不足詳細は保存しない |
| `sufficientOverride` | `"on" \| "off" \| null` | `null` のときのみ自動計算 |
| `isFinalized` | boolean | `true` の日は再計算対象外 |

---

## 7. メニュー・画面

```text
シフト
  - シフトカレンダー
  - シフトドラフト
  - 営業日編集
  - 営業スタイル・必要人数設定   ← 新規
```

新規画面: `shift_style_required_staff_settings_page.dart`

* 営業スタイル設定セクション（5 style、closed は編集不可。**表示名は UI 固定ラベル、編集不可**）
* 必要人数設定セクション（style 別、行の **startHour / endHour / requiredCount をインライン編集**、行追加・削除）
* 保存は Callable 経由（Firestore 直書き不可）
* 更新系 loading（全面ロック + CPI）

---

## 8. 設定未完了の扱い

### 8.1 doc レベル未完了

以下は **必要人数設定未完了**（requiredStaff 判定しない。gap は継続）:

* doc 未存在
* `version !== 2`
* `byStyle` が object でない
* 読取失敗 → **設定未完了扱い**（キャッシュは判定に使わない。参考表示は初期実装では省略可）

読取失敗時の UI 表示例:

```text
必要人数設定の取得に失敗しました。
現在は必要人数による不足判定を行っていません。
```

### 8.2 style キー未設定

v2 doc は有効だが `byStyle[styleId]` が **存在しない**（`undefined`）場合:

* その style の必要人数は**未設定**
* requiredStaff 判定しない。gap は継続

### 8.3 空配列 `[]`

`byStyle[styleId]: []` は**正常設定**（その style では requiredStaff 判定しない）。gap は継続。

### 8.4 Flutter 状態モデル（推奨）

`RequiredStaffByTimeSlotService` が返す解決結果の例:

```dart
enum RequiredStaffDocStatus {
  loading,
  ready,           // v2 有効
  docMissing,
  invalidFormat,
  readError,
}

enum RequiredStaffStyleStatus {
  notApplicable,      // isClosed || styleId == 'closed'
  docNotReady,        // doc レベル未完了
  styleNotConfigured, // byStyle にキーなし
  disabledByEmptyList,// byStyle[styleId] == []
  active,             // スロットあり
}

class RequiredStaffStyleResolution {
  final RequiredStaffStyleStatus status;
  final List<Map<String, int>> slots; // active のときのみ
}
```

日別 UI は `day.businessHours.styleId` + 上記解決結果でメッセージを出し分ける。

---

## 9. 判定ロジック

### 9.1 requiredStaff の参照

```text
shifts.days.businessHours.styleId
  → storeMeta/requiredStaffByTimeSlot.byStyle[styleId]
```

`isClosed === true` または `styleId === 'closed'` の日は requiredStaff 判定をスキップする。

休業日の `isSufficient` は既存 `finalizeDay` と同様、**`true` にする**（計算スキップ）。再計算 helper でも同じ扱いとする。

### 9.2 gap 判定（60 分統一）

Functions `findGapTimeSlots`（既存・60 分）を正とする。

Flutter は 30 分走査の `_findGapTimeSlots` を廃止し、同等の **60 分刻み**ロジックに置換する。

対象:

* `lib/StaffDate/shiftHomePage.dart` — `_findGapTimeSlots`
* `lib/StaffDate/shiftDateDialog.dart` — `_findGapTimeSlots`

### 9.3 requiredStaff 判定（1 時間単位）

現状維持。Functions `findInsufficientTimeSlots` / Flutter `_findInsufficientTimeSlots` は 1 時間スロット。

### 9.4 `isSufficient`

```text
isSufficient = gapSlots が空 && insufficientSlots が空
```

requiredStaff がスキップされた場合は gap のみで判定。

### 9.5 不足表示マージ

隣接スロットで `required` と `current` が同一のとき結合。Flutter helper `mergeConsecutiveInsufficientSlots` を `shiftDateDialog` / `shiftHomePage` に適用。

---

## 10. 設定保存・反映

### 10.1 Callable 配置と命名（現コード規約に合わせた確定案）

| Callable | 配置 | export 名 | 命名根拠 |
|----------|------|-----------|---------|
| 営業スタイル保存 | `functions/src/shared/businessHours/callables/saveBusinessHoursStyles.ts` | `saveBusinessHoursStyles` | `setBusinessHoursManualForDay` 等と同系（**Callable サフィックスなし**） |
| 必要人数保存 | `functions/src/domains/storeMeta/callables/saveRequiredStaffByTimeSlotCallable.ts` | `saveRequiredStaffByTimeSlotCallable` | `updateTableDeviceConfigCallable` と同系（**Callable サフィックスあり**） |

雛形の `saveBusinessHoursStylesCallable` は、businessHours 系の既存命名に合わせ **`saveBusinessHoursStyles`** に変更する。

### 10.2 権限判定（確定）

**両 Callable とも `assertAdminDevice(installationId, request.auth.uid)` を使用する。**

根拠:

* shift / businessHours 系 Callable（`setBusinessHoursManualForDay`, `updateDayAssignments` 等）はすべて `assertAdminDevice` + `installationId`
* Flutter `ShiftRepository` は既に `_getInstallationId()` を Callable に渡す
* `requireAdmin` は `updateTableDeviceConfigCallable` / 開閉店 terminal 系で使用。本画面はシフトメニュー経由のため **shift パターンに統一**

`initializeStoreConfigCallable` は従来どおり `getCallerDeviceByUid` + `role === 'admin'`（変更なし）。

### 10.3 `saveBusinessHoursStyles` 処理順

設定保存と `isSufficient` 再計算は **同一 Callable 内で完結**する。途中で再計算が失敗した場合、**設定保存も成功扱いにしない**（§10.6 参照）。

```text
1. assertAdminDevice
2. 入力バリデーション（60 分刻み、closed 固定値）
3. 対象月のデータ整合性チェック（§11.3）
4. storeMeta/config.businessHoursStyles を merge 保存
5. propagateBusinessHoursStyleChange（変更された styleId のみ）
   - 既存の businessHoursMonthlyMap doc のみ走査（未来月 doc は新規生成しない）
   - dateKey >= todayJst && days[DD].styleId ∈ changedStyleIds
   - source: manual も上書き（open/close/isClosed のみ。source フィールドは manual のまま維持）
   - upsertBusinessHoursForMonth（該当日のみバッチ）で map + businessHoursMonthly を更新
6. 影響した yearMonth ごとに syncBusinessHoursToShifts
7. recalculateIsSufficientForEligibleDays
8. すべて成功時のみ logOpsSuccess。いずれか失敗時は Callable 全体を失敗
```

### 10.4 `saveRequiredStaffByTimeSlotCallable` 処理順

設定保存と再計算は同一 Callable 内で完結する（§10.6 参照）。

```text
1. assertAdminDevice
2. v2 バリデーション（5 style キー、closed は []、スロット形式）
3. 対象月のデータ整合性チェック（§11.3）
4. storeMeta/requiredStaffByTimeSlot を上書き保存
5. recalculateIsSufficientForEligibleDays（businessHours は変更しない）
6. すべて成功時のみ logOpsSuccess
```

### 10.5 流用する既存 helper

| 処理 | 流用元 |
|------|--------|
| `businessHoursMonthlyMap` + `businessHoursMonthly` 更新 | `upsertBusinessHoursForMonth`（`businessHoursCore.ts`） |
| `shifts.days.businessHours` 同期 | `syncBusinessHoursToShifts`（`businessHoursCore.ts`） |
| `yearMonth` 抽出 | `getYearMonthFromDateKey`（`helpers.ts`） |
| JST 今日 | `generateJstDateKey()`（`functions/src/shared/time/generateJstDateKey.ts`） |
| 単日 `isSufficient` 計算 | `calculateIsSufficient` + `resolveRequiredStaffSlotsForDay`（新規、helpers 内） |
| batch 書き込み | Firestore `WriteBatch`（500 件制限に注意） |

> `todayJst()`（`shared/batchJobLogs/writeBatchJobLog.ts`）も同等だが、shift ドメインから batchJobLogs 依存は避け **`generateJstDateKey` を優先**する。

### 10.6 設定保存と再計算の一体扱い

設定保存 Callable は、**設定の書き込みと `isSufficient` 再計算を一体の操作**として扱う。

```text
設定保存 OK + 再計算 OK  → Callable 成功
設定保存 OK + 再計算 NG  → Callable 失敗（成功扱いにしない）
```

理由: 設定だけ保存され `isSufficient` が古いままだと、不足日集計・警告表示が実態とズレ、「保存したのに警告が変わらない」状態になる。

実装上は、再計算失敗時に config / requiredStaff の変更をロールバックするか、書き込み順序とエラー返却を設計して **クライアントに失敗を返す**こと。いずれにせよ UI では成功扱いにしない。

Flutter 失敗時の表示例:

```text
設定の保存または不足判定の再計算に失敗しました。
時間をおいて再度保存してください。
```

---

## 11. 再計算仕様

### 11.1 対象条件

```text
dateKey >= todayJst
かつ isFinalized !== true
かつ sufficientOverride === null
```

現在の `isSufficient` 値は条件に使わない。

### 11.2 読取範囲（既存 doc のみ）

再計算のために **未来月 doc を新規生成しない**。固定 N ヶ月先まで強制走査も行わない。

対象は、**既に存在する**月次 doc のうち、条件を満たす日のみ。

```text
列挙対象の yearMonth:
  businessHoursMonthlyMap と shifts の両コレクションに存在する doc id の和集合
  かつ doc id >= getYearMonthFromDateKey(todayJst)

各 shifts/{yearMonth}/days を走査し、以下でフィルタ:
  dateKey >= todayJst
  かつ isFinalized !== true
  かつ sufficientOverride === null
```

`businessHoursMonthlyMap` に存在しない未来月は、設定保存を契機に作成しない。

### 11.3 データ整合性チェック（map 未作成 × shifts 存在）

`businessHoursMonthlyMap/{yearMonth}` が存在しないにもかかわらず `shifts/{yearMonth}` が存在する状態は、**データ不整合**として扱う。

営業スタイル変更時・必要人数変更時の再計算時、いずれも同様。

```text
businessHoursMonthlyMap が存在する月:
  通常処理対象

businessHoursMonthlyMap が存在しない月:
  shifts も存在しない
    → 対象外（スキップ）

businessHoursMonthlyMap が存在しない月:
  shifts が存在する
    → データ不整合として Callable を失敗（HttpsError）
```

理由: 正常なデータフローは以下であり、`map` なしに `shifts` だけ存在する状態は救済しない。

```text
営業日・営業時間が設定される
  → businessHoursMonthlyMap / businessHoursMonthly が作成される
  → shifts.days.businessHours に同期される
  → スタッフがその営業日・営業時間を前提にシフト提出する
```

`shifts.days.businessHours` だけを救済的に更新すると SSoT が曖昧になるため、**エラーとして検出**する。

エラー時は `logOpsError` を記録し、クライアントには再試行を促すメッセージを返す。

### 11.4 更新フィールド

```ts
{
  isSufficient: boolean,
  updatedAt: FieldValue.serverTimestamp()
}
```

### 11.5 更新しないフィールド

* `assignments`
* `pendingRequestCount`
* `businessHours`（必要人数のみ変更時）
* `sufficientOverride`
* `isFinalized`
* 不足詳細（そもそも保存しない）

### 11.6 休業日

`businessHours.isClosed === true` の日は `isSufficient = true`（`finalizeDay` と同様）。

### 11.7 同期順（営業スタイル変更時）

```text
upsertBusinessHoursForMonth
  → syncBusinessHoursToShifts（月単位）
  → recalculateIsSufficientForEligibleDays
```

`syncBusinessHoursToShifts` は既存 doc の `businessHours` のみ update し、`isSufficient` には触れない（現コードどおり）。

---

## 12. Functions helper 変更詳細

### 12.1 `getRequiredStaffByTimeSlot` → v2 読取

戻り値を v2 全体または解決用型に変更する。

```text
version === 2 && byStyle が object
  → 使用

それ以外
  → null（未設定。fallback しない）
```

旧 `data[]` は読まない。

fallback 時の `logOpsSuccess` 乱立（現コードの不自然な成功ログ）は、本変更時に整理する。

### 12.2 新規 `resolveRequiredStaffSlotsForDay`

```ts
resolveRequiredStaffSlotsForDay({
  businessHours: { styleId, isClosed, openMinute, closeMinute },
  requiredStaffConfig: RequiredStaffByTimeSlotV2 | null,
}): RequiredStaffSlot[] | null
```

| 結果 | 意味 |
|------|------|
| `null` + 休業 | required 判定スキップ |
| `null` + doc 未設定 | required 判定スキップ |
| `[]` | style が `[]` — 判定スキップ |
| `[...]` | 判定実行 |

### 12.3 `calculateIsSufficient` シグネチャ変更

styleId 別スロットを受け取る形に変更:

```ts
calculateIsSufficient(
  openMinute,
  closeMinute,
  assignments,
  requiredSlots: RequiredStaffSlot[] | null, // null = required 判定スキップ
): boolean
```

呼び出し元で `resolveRequiredStaffSlotsForDay` を通す。

### 12.4 `isInsufficientDayOrTimeSlot`

`createMultipleShifts` / `updateShiftRequest` が使用。v2 + styleId 対応に更新する（募集可能日判定に影響）。

---

## 13. Flutter 変更詳細

### 13.1 `RequiredStaffByTimeSlotService`

* v2 パース
* `latestDocStatus` / `getResolutionForStyle(styleId)` を提供
* default fallback 削除
* **読取失敗時: キャッシュは不足判定に使わない**（`readError` → 設定未完了扱い）
* キャッシュの参考表示は初期実装では省略可

判定と表示の分離:

| 状況 | 判定（requiredStaff） | 表示 |
|------|----------------------|------|
| 読取成功・v2 有効 | 最新 doc を使用 | 通常表示 |
| 読取失敗 | **行わない**（未完了扱い） | エラーメッセージ（§8.1 参照） |

### 13.2 `shift_repository.dart`

```dart
Future<void> saveBusinessHoursStyles({ required Map<String, dynamic> businessHoursStyles })
Future<void> saveRequiredStaffByTimeSlot({ required Map<String, dynamic> v2Payload })
```

いずれも `installationId` を付与して Callable 呼び出し。

### 13.3 gap 60 分

共通 helper（`gap_time_slots.dart`）を新設し、`shiftHomePage` / `shiftDateDialog` から利用。Functions `findGapTimeSlots` と同じアルゴリズムにする。

### 13.4 不足表示

* gap（赤）と insufficient（橙）を分離表示（現状維持）
* insufficient はマージ後に表示
* 営業スタイル名・営業時間・必要人数設定のサマリを追加（スタイル名は UI 固定ラベル）

---

## 14. Firestore rules / 権限

| パス | write（現 rules） | 本変更 |
|------|------------------|--------|
| `storeMeta/config` | false | Callable |
| `storeMeta/requiredStaffByTimeSlot` | false | Callable |
| `businessHoursMonthlyMap` | false | Callable |
| `businessHoursMonthly` | 明示ルールなし（CF admin 書込） | Callable |
| `shifts` | true（開発用） | アプリは Callable 経由を維持 |

---

## 15. テスト方針

### 15.1 Functions

| テスト | 内容 |
|--------|------|
| `requiredStaffByTimeSlot.spec.ts` | v2 読取、未存在→null、style 別解決、`[]` 扱い |
| `calculateIsSufficient.spec.ts`（新規） | gap only / required only / 両方 / 休業日 |
| `saveBusinessHoursStyles.spec.ts`（新規） | manual 日反映、sync、再計算対象フィルタ、map/shifts 不整合時エラー |
| `saveRequiredStaffByTimeSlotCallable.spec.ts`（新規） | v2 保存、再計算、不整合時エラー、再計算失敗時 Callable 失敗 |
| `initializeStoreConfigCallable` 関連 | v2 初期 doc |

**削除・反転する既存期待値**

* `doc 未存在 → DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT`（新仕様では未設定）

### 15.2 Flutter

| テスト | 内容 |
|--------|------|
| `required_staff_by_time_slot_service_test.dart` | v2 パース、状態 enum、fallback なし、読取失敗時キャッシュ非使用 |
| `merge_consecutive_insufficient_slots_test.dart`（新規） | マージ境界 |
| `gap_time_slots_test.dart`（新規） | 60 分 gap |

---

## 16. 移行方針

* 旧 `data` 互換なし
* 既存 doc は v2 上書き（初回保存 / `initializeStoreConfigCallable` / 手動投入）
* 開発環境では新設定画面からの初回保存を想定

---

## 17. リスクと対策

| リスク | 対策 |
|--------|------|
| businessHours 同期漏れ | `upsertBusinessHoursForMonth` → `syncBusinessHoursToShifts` を Callable 内で必ず実行 |
| `isSufficient` 古い値 | 設定保存と再計算を一体操作。再計算失敗時は Callable 失敗（§10.6） |
| 過去日が変わる | `dateKey >= todayJst` でフィルタ |
| Callable 負荷 | 既存 doc のみ走査、月 chunk、batch 500 上限、対象日フィルタ |
| 設定未完了の誤解 | UI で doc / style / `[]` を明示 |
| gap 粒度不一致 | Flutter を 60 分に統一 |
| map 未作成 × shifts 存在 | データ不整合として Callable 失敗（§11.3）。救済更新しない |
| 設定のみ保存成功 | 再計算失敗時は成功扱いにしない（§10.6） |
| 古いキャッシュで誤判定 | 読取失敗時はキャッシュを判定に使わない（§8.1, §13.1） |

---

## 18. 実装フェーズ

### Phase 1: スキーマ・helper

* Functions / Flutter 型・default v2 化
* `resolveRequiredStaffSlotsForDay`, `calculateIsSufficient` 更新
* fallback 削除
* Flutter gap 60 分 helper、マージ helper、状態モデル

### Phase 2: Functions Callable・再計算

* `saveBusinessHoursStyles`, `saveRequiredStaffByTimeSlotCallable`
* `propagateBusinessHoursStyleChange`, `recalculateIsSufficientForEligibleDays`
* 既存 shift Callable 6 本 + `isInsufficientDayOrTimeSlot` 更新
* `initializeStoreConfigCallable` v2 化
* export / logOps 登録

### Phase 3: Flutter service / repository

* `RequiredStaffByTimeSlotService` v2
* `shift_repository` Callable 2 本

### Phase 4: 新規 UI

* `shiftMenuPage`, `shift_style_required_staff_settings_page`
* 保存 loading（更新系ロック）

### Phase 5: 不足警告表示

* `shiftDateDialog`, `shiftHomePage`
* マージ表示、設定未完了メッセージ

### Phase 6: テスト

* 上記 §15 を実施

---

## 19. 完了条件

* シフトメニューに「営業スタイル・必要人数設定」がある
* 営業スタイル・必要人数を UI から保存できる（Callable 経由）
* `requiredStaffByTimeSlot` が v2 のみ。fallback なし
* doc / style 未設定 / `[]` が UI で区別される
* 営業スタイル変更が JST 今日以降の該当 `styleId` 日（manual 含む）に反映される
* 設定保存後、対象日の `isSufficient` が再計算される
* 過去日・finalized・override 済みは再計算されない
* gap が Functions / Flutter とも 60 分
* 不足警告が連続マージ表示される
* 設定保存と再計算が一体操作であり、再計算失敗時は Callable が失敗する
* 未来月 doc を新規生成しない
* `businessHoursMonthlyMap` 未作成月に `shifts` がある場合は Callable が失敗する
* 読取失敗時にキャッシュを判定に使わない
* `businessHoursStyles.label` を config に保存しない（UI 固定ラベル）
* 関連テストが更新・追加されている
* 必要人数設定画面で、既存行の `startHour` / `endHour` / `requiredCount` を直接編集できること

---

## 20. 実装時の補足（確定済み）

§20 の追加修正事項（2026-06-24 確定）を反映済み。以下は実装時の参照用サマリ。

| # | 方針 |
|---|------|
| 1 | `businessHoursStyles.label` は保存しない。UI 固定ラベル（§6.1） |
| 2 | 再計算は既存 doc のみ。未来月 doc は新規生成しない（§11.2） |
| 3 | map 未作成 × shifts 存在は不整合エラー（§11.3） |
| 4 | 設定保存と再計算は一体。再計算失敗時は成功扱いにしない（§10.6） |
| 5 | 読取失敗時のキャッシュは判定に使わない（§8.1, §13.1） |
