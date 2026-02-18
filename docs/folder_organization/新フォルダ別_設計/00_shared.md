# 新フォルダ別設計：shared 格納予定一覧

## 1. 目的

**shared** に格納予定のモジュールを、新フォルダ別_設計内で一覧化する。  
各ドメイン設計（01_bills, 02_storeMeta 等）から「shared に移す」と記載されたものをここに集約し、04_新フォルダ構造 の shared カテゴリと整合させる。

---

## 2. shared カテゴリと格納予定

### 2.1 shared/devices（新規・08 記録済み）

| 現在パス | 新パス | 種別 | 備考 |
|----------|--------|------|------|
| close_process/requireAdmin.ts | shared/devices/requireAdmin.ts | service | 営業管理可能の権限チェック。storeMeta および閉店まわりから参照。移行後は devicePermissions を同配下で参照 |
| lib/devicePermissions.ts | shared/devices/devicePermissions.ts | service/repos | getCallerDeviceByUid, hasRequiredOption, hasStoreManagementPermission, isActive。devices コレクションを読む。08 で shared/devices に移すことを確定 |
| callables/registerDevice.ts | shared/devices/callables/registerDevice.ts | callable | デバイス登録。08 で shared/devices に配置を確定 |
| callables/updateDeviceOptions.ts | shared/devices/callables/updateDeviceOptions.ts | callable | 同上 |
| callables/updateDeviceRole.ts | shared/devices/callables/updateDeviceRole.ts | callable | 同上 |

- **08_意思決定ログ**：shared カテゴリに **devices** を追加。requireAdmin・devicePermissions・registerDevice/updateDeviceOptions/updateDeviceRole を shared/devices に格納。

---

### 2.2 shared/time（04 既存・08 記録済み）

| 現在パス | 新パス | 種別 | 備考 |
|----------|--------|------|------|
| helpers/stateDoc の generateJstDateKey | shared/time/generateJstDateKey.ts（または index） | service | storeMeta の openStore 等が参照。02_storeMeta 参照 |
| config/ops（getNightlyCronTriplet 等） | shared/time/configOps.ts（または適宜分割） | service | 夜間 cron 取得・店舗締め時間等。14_scripts, 05_attendance, 11_analytics が参照。**config/ops を shared/time に含める**（08 で確定） |

---

### 2.3 shared/businessHours（新規・08 記録済み）

営業日・営業時間の**作成・編集**に関わる処理。03_shift, 15_shift 棚卸しに基づき配置。04_新フォルダ構造 の shared カテゴリに追加済み。

**フォルダ構成**

| フォルダ | 役割 |
|----------|------|
| callables/ | 月次初期化・スタイルから月次/年次生成・手動編集の onCall 入口（4 本） |
| scheduler/ | 翌年営業時間生成の onSchedule（1 本） |
| services/ | businessHoursCore, styles, holidayHelper。japanese-holidays.d.ts は型定義として付随 |

**移動一覧（from → to）**

| 現在パス | 新パス | 種別 | 備考 |
|----------|--------|------|------|
| shift/initBusinessHoursForMonth.ts | shared/businessHours/callables/initBusinessHoursForMonth.ts | callable |  |
| shift/generateBusinessHoursForMonthFromStyles.ts | shared/businessHours/callables/generateBusinessHoursForMonthFromStyles.ts | callable |  |
| shift/generateBusinessHoursForYearFromStyles.ts | shared/businessHours/callables/generateBusinessHoursForYearFromStyles.ts | callable |  |
| shift/setBusinessHoursManualForDay.ts | shared/businessHours/callables/setBusinessHoursManualForDay.ts | callable |  |
| shift/scheduleGenerateNextYearBusinessHours.ts | shared/businessHours/scheduler/scheduleGenerateNextYearBusinessHours.ts | scheduler | onSchedule |
| shift/businessHoursCore.ts | shared/businessHours/services/businessHoursCore.ts | service/repos | syncBusinessHoursToShifts は shift が参照 |
| shift/styles.ts | shared/businessHours/services/styles.ts | service |  |
| shift/holidayHelper.ts | shared/businessHours/services/holidayHelper.ts | service |  |
| shift/japanese-holidays.d.ts | shared/businessHours/services/japanese-holidays.d.ts（または同階層） | — | 型定義 |

---

### 2.4 shared/firebase（04 既存・08 記録済み）

| 現在パス | 新パス | 種別 | 備考 |
|----------|--------|------|------|
| lib/env.ts | shared/firebase/env.ts | service | getEnv。storeManagement, scheduler, lib/tasks が参照。**他にこのパスへ移動すべきファイルが特になければ env のみ**（08 で確定） |
| callables/calculateFirestoreSize.ts | shared/firebase/callables/calculateFirestoreSize.ts（または callables 相当） | callable | ユーティリティ・Firestore サイズ計算。08 で shared/firebase に配置を確定 |

- admin 初期化等の共通基盤は 04 確定のまま。上記に加え必要に応じて配置する。

---

### 2.5 その他（04 既存）

- **shared/idempotency**：冪等・重複抑止の共通部品
- **shared/logging**：構造化ログ
- **shared/validation**：必要になったら追加
- **禁止**：shared/utils は作らない（04）

---

## 3. 参照関係メモ

- **storeMeta**：openStoreTerminal, continueBusinessTerminal, closeStoreTerminal は **shared/devices（requireAdmin）** を import する。02_storeMeta に記載。
- **bills**：requireAdmin は bills に配置しない。shared/devices に格納。01_bills から閉店まわり・requireAdmin を削除し storeMeta / shared に寄せ済み。

---

## 4. changeSpec・05_入口一覧

- **changeSpec**：requireAdmin・devicePermissions を shared/devices に移す際に、storeMeta、閉店まわり services、itemOrder, userLogin, sideGame, attendance 等の import パスを `shared/devices/*` に更新する。registerDevice/updateDeviceOptions/updateDeviceRole は shared/devices/callables からルート index で re-export する形に変更する。
- **05_入口一覧**：requireAdmin は入口ではないため 05 の対象外。registerDevice, updateDeviceOptions, updateDeviceRole は **shared/devices / callables** に更新。calculateFirestoreSize は **shared/firebase** に更新。閉店まわり 6 入口は storeMeta に移すため 05 の該当行のドメインを storeMeta に変更する。
