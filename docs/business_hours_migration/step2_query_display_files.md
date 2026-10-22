# Step2: 取得・表示ファイルの洗い出し

## 概要

Step1で更新対象としたコレクションを取得・表示しているファイルを洗い出し、今回の修正に伴って併せて修正が必要かどうかを記載します。

## 重要：営業日判定の用途分離

本改修では、営業日判定の用途を明確に分離します：

- **【現在時刻（いま）】のデータ格納・表示（当日画面など）**:
  - `getCurrentBusinessDate`（= `storeMeta/currentBusinessDay`参照）を使用
  - UIはFirestoreの`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得（リアルタイム性重視）

- **【予定・任意日時（いま以外）】の営業日算出**:
  - `calcBusinessDate`を使用
  - `calcBusinessDate`は`businessHoursMonthlyMap`を参照して計算する
  - 営業時間の前後±30分をバッファとして含める
  - 判定結果は`OK`/`NONE`/`AMBIGUOUS`を返せること
  - UIは`NONE`時にエラーダイアログ、`AMBIGUOUS`時に候補選択ダイアログを表示

## 更新対象コレクションの取得・表示ファイル

### 1. `bills`コレクション

**更新内容**: なし（`businessDate`は既に格納済み、`createdAt`で十分）

#### Dartファイル（取得・表示）

| ファイル | 行番号 | 取得方法 | 修正の必要性 | 備考 |
|---------|--------|---------|-------------|------|
| `lib/Accounting/accountingPage.dart` | 60-72, 81, 134 | `_getBusinessDate()`で営業日を計算後、`where('businessDate', isEqualTo: businessDate)` | ✅ **必要** | **当日画面**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得。`GlobalConstants.STORE_CLOSE_HOUR`を直接使用しているため修正が必要 |
| `lib/Accounting/accountingHistoryPage.dart` | 29-40, 49 | `_getBusinessDate()`で営業日を計算後、`where('businessDate', isEqualTo: businessDate)` | ✅ **必要** | **日付選択画面**: 現状確認：ユーザーが選択するのは`DateTime`だが、クエリには`YYYY-MM-DD`形式の文字列として使用（49行目：`_selectedDate.toIso8601String().split('T')[0]`）。選択値が営業日文字列（`YYYY-MM-DD`）のため、`calcBusinessDate`は不要（そのままクエリ可能）。初期化時は`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得 |
| `lib/Accounting/postAccountingAdjustmentsPage.dart` | 37-52, 60 | `_getBusinessDate()`と`_formatBusinessDate()`で営業日を計算後、`where('businessDate', isEqualTo: businessDate)` | ✅ **必要** | **日付選択画面**: 現状確認：ユーザーが選択するのは`DateTime`だが、クエリには`YYYY-MM-DD`形式の文字列として使用（60行目：`_formatBusinessDate(_selectedDate)`）。選択値が営業日文字列（`YYYY-MM-DD`）のため、`calcBusinessDate`は不要（そのままクエリ可能）。初期化時は`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得 |
| `lib/user_actions/order_history_popup.dart` | 39-49, 53, 97 | `_getBusinessDate()`で営業日を計算後、`where('businessDate', isEqualTo: businessDate)` | ✅ **必要** | **当日画面**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得。`GlobalConstants.STORE_CLOSE_HOUR`を直接使用しているため修正が必要 |
| `lib/user_actions/tournament_history_popup.dart` | 39-49, 53, 97 | `_getBusinessDate()`で営業日を計算後、`where('businessDate', isEqualTo: businessDate)` | ✅ **必要** | **当日画面**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得。`GlobalConstants.STORE_CLOSE_HOUR`を直接使用しているため修正が必要 |
| `lib/user_actions/current_accounting_popup.dart` | 149, 243, 293, 348, 399 | `collection('bills')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`フィルタなし |
| `lib/user_actions/add_extra_popup.dart` | 110, 302 | `collection('bills')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`フィルタなし |
| `lib/OrderView/OrderManagement/order_edit_dialog.dart` | 197, 313 | `collection('bills')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`フィルタなし |
| `lib/Accounting/categoryPaymentMethodDialog.dart` | 49 | `collection('bills')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`フィルタなし |

**修正が必要な理由**:
- 上記のファイルは`businessDate`（フィールド名）でクエリしていますが、その`businessDate`を計算する際に`GlobalConstants.STORE_CLOSE_HOUR`を直接使用しており、適切な方法を使用していません。
- **当日画面**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得する必要があります。
- **日付選択画面**: 選択値が営業日文字列（`YYYY-MM-DD`）の場合は`calcBusinessDate`は不要（そのままクエリ可能）。選択値が日時（`Timestamp`）の場合は`calcBusinessDate`が必要（OK/NONE/AMBIGUOUS対応）。
- 営業時間の取得先を`lib/globalConstant.dart`からFirestore上の`businessHoursMonthlyMap`に変更するため、これらのファイルでも適切な方法を使用するように変更する必要があります。

**修正内容（現状確認→方針→TODO）**:
- `accountingPage.dart`: 
  - **現状確認**: `_getBusinessDate()`メソッド（60-72行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用して営業日を計算。81行目と134行目で`businessDate`を使用してクエリ
  - **方針**: 当日画面のため、`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得
  - **TODO**: `_getBusinessDate()`の削除/置換は実装時に最終決定（共通化or局所置換を判断）。タブ/プルダウンで翌日・期間表示がある場合は、`currentBusinessDateKey`を起点に営業日キー列を生成（単純+1禁止、month-end考慮）
- `accountingHistoryPage.dart`: 
  - **現状確認**: ユーザーが選択するのは`DateTime`だが、クエリには`YYYY-MM-DD`形式の文字列として使用（49行目）。選択値が営業日文字列（`YYYY-MM-DD`）のため、`calcBusinessDate`は不要
  - **方針**: 初期化時（24行目）は`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得。日付選択時（49行目）は選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）
  - **TODO**: `_getBusinessDate()`の削除/置換は実装時に最終決定
- `postAccountingAdjustmentsPage.dart`: 
  - **現状確認**: ユーザーが選択するのは`DateTime`だが、クエリには`YYYY-MM-DD`形式の文字列として使用（60行目）。選択値が営業日文字列（`YYYY-MM-DD`）のため、`calcBusinessDate`は不要
  - **方針**: 初期化時（32行目）は`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得。日付選択時（60行目）は選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）
  - **TODO**: `_getBusinessDate()`と`_formatBusinessDate()`の削除/置換は実装時に最終決定
- `order_history_popup.dart`: 
  - **現状確認**: `_getBusinessDate()`メソッド（39-49行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用。53行目と97行目で`businessDate`を使用してクエリ
  - **方針**: 当日画面のため、`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得
  - **TODO**: `_getBusinessDate()`の削除/置換は実装時に最終決定
- `tournament_history_popup.dart`: 
  - **現状確認**: `_getBusinessDate()`メソッド（39-49行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用。53行目と97行目で`businessDate`を使用してクエリ
  - **方針**: 当日画面のため、`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得
  - **TODO**: `_getBusinessDate()`の削除/置換は実装時に最終決定

---

### 2. `orders`コレクション

**更新内容**: なし（`createdAt`で十分）。SSoTは`bill.businessDate`（フィールド名）です。

#### Dartファイル（取得・表示）

| ファイル | 行番号 | 取得方法 | 修正の必要性 | 備考 |
|---------|--------|---------|-------------|------|
| `lib/OrderView/OrderManagement/order_management_page.dart` | 184-188 | `collection('orders').doc(dateString).collection('_TodaysOrders')` | ✅ **必要** | **当日画面**: `dateString`は`DateFormat('yyyyMMdd').format(DateTime.now())`で生成。`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得し、`YYYYMMDD`形式に変換。当日と前日を複数クエリする場合は、`currentBusinessDateKey`を起点に前日を計算（営業日キー列を生成） |
| `lib/user_actions/order_history_popup.dart` | 202-206 | `collection('orders').doc(orderDocId).collection('_TodaysOrders')` | ❌ **不要** | `orderDocId`は`bill.businessDate`から取得。営業日ベースで問題なし |
| `lib/OrderView/OrderManagement/order_card.dart` | 402 | `collection('orders')` | ❌ **不要** | 個別ドキュメント取得、`occurredAt`は表示に使用しない想定 |
| `lib/OrderView/OrderManagement/order_edit_dialog.dart` | 232, 327 | `collection('orders')` | ❌ **不要** | 個別ドキュメント取得、`occurredAt`は表示に使用しない想定 |

**修正が必要な理由**:
- `orders`コレクションのドキュメントIDは`businessDate`から`YYYYMMDD`形式に変換したものです。
- `businessDate`をドキュメント内に持たせる必要はありませんが、**どのYYYYMMDDドキュメントに格納するか**、**どのYYYYMMDDドキュメントを参照・取得・表示するか**を判定する際に適切な方法を使用する必要があります。
- `order_management_page.dart`の`dateString`生成方法（175-176行目）: `DateFormat('yyyyMMdd').format(DateTime.now())`でカレンダー日付を使用しているため、営業日ベースに変更する必要があります。

**修正内容（現状確認→方針→TODO）**:
- **格納時**（`appendItem.ts`, `placeOrder.ts`, `placeOrderByUser.ts`）: 
  - **現状確認**: 実コード確認の結果、すべてのorders作成経路で`bill.businessDate`から取得している（`bill.businessDate`が正（SSoT））
  - **方針**: `bill.businessDate`から取得する方針を維持（`bill.businessDate`が正（SSoT））
  - **TODO**: 例外経路（billが無い例外経路）は見当たりませんでしたが、将来的に例外経路が追加される場合は、その例外をTODOとして記載してください
- **取得・表示時**（`order_management_page.dart`）: 
  - **現状確認**: `DateFormat('yyyyMMdd').format(DateTime.now())`でカレンダー日付を使用（175-176行目）。当日と前日を複数クエリしている
  - **方針**: 当日画面のため、`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得し、その営業日から`YYYYMMDD`形式のドキュメントIDを生成
  - **TODO**: 当日と前日を複数クエリする場合は、`currentBusinessDateKey`を起点に前日を計算（営業日キー列を生成、単純+1禁止、month-end考慮）。`isClosed`考慮は今回はしない

---

### 3. `analyticsMonthly/{monthKey}/days/{businessDate}`サブコレクション

**更新内容**: なし（`businessDate`はキーとして使用、追加フィールド不要）

#### Dartファイル（取得・表示）

| ファイル | 行番号 | 取得方法 | 修正の必要性 | 備考 |
|---------|--------|---------|-------------|------|
| `lib/data/repo/analytics_repository.dart` | 84-89 | `collection('analyticsMonthly').doc(yyyymm).collection('days').orderBy('__name__')` | ❌ **不要** | `__name__`でソートしているため、`businessDate`をキーとして使用している想定 |
| `lib/dashboard/daily/daily_trend_page.dart` | 35-38 | `fetchMonthlyDays(yyyymm)`を呼び出し | ❌ **不要** | `analytics_repository.dart`経由で取得 |
| `lib/dashboard/home/dashboard_home_page.dart` | 24 | `collection('analyticsMonthly')` | ❌ **不要** | 親コレクションのみ取得 |

**まとめ**: 
- **現状確認**: `analyticsMonthly/{monthKey}/days`サブコレクションは`businessDate`をキーとして使用している
- **方針**: 対象`bills`の`businessDate`を正（SSoT）として集計・保存する方針を維持（`currentBusinessDateKey`生成不要）
- **修正不要**: 集計ロジックは対象`bills`の`businessDate`を使用しているため、修正不要です

---

### 4. `scheduledTournaments`コレクション

**更新内容**: `businessDate`: string (YYYY-MM-DD形式) を追加（`startAt`から計算）

#### Dartファイル（取得・表示）

| ファイル | 行番号 | 取得方法 | 修正の必要性 | 備考 |
|---------|--------|---------|-------------|------|
| `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` | 504-570 | `collection('scheduledTournaments').where('startAt', ...)` | ✅ **必要** | **予定・任意日時**: `startAt`でフィルタリングしているが、営業日ベースの表示に変更する場合は`businessDate`でフィルタリングする必要がある。`calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応） |
| `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` | 46-51 | `collection('scheduledTournaments').where('startAt', ...)` | ✅ **必要** | **予定・任意日時**: カレンダー表示用。営業日ベースの表示に変更する場合は`businessDate`でフィルタリングする必要がある。`calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応） |
| `lib/tournament/pages/tournament_select_page.dart` | 93-95 | `collection('scheduledTournaments').orderBy('startAt')` | ✅ **必要** | **予定・任意日時**: トーナメント選択用。営業日ベースの表示に変更するため、`businessDate`でフィルタリングする必要がある。`calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応） |
| `lib/tournament/active/pages/tournament_home_page.dart` | 247, 324, 799, 819, 1116, 1168, 1302, 1451, 1512 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/active/services/tournament_data_service.dart` | 14, 55, 171 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/active/pages/table_detail_page.dart` | 37, 55, 64, 73, 764 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/active/widgets/dialogs/register_participants_dialog.dart` | 30 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/active/widgets/dialogs/remove_table_dialog.dart` | 107 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/active/pages/blind_timer_page.dart` | 48, 58, 142, 163, 744 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/active/pages/prize_setup_page.dart` | 275 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/active/widgets/dialogs/assign_seat_dialog.dart` | 147, 208 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` | 47 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/pages/table_select_page.dart` | 61 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/tournament/dialogs/table_select_dialog.dart` | 74 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/user_actions/bust_and_reentry_popup.dart` | 36 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/user_actions/bulk_addon_popup.dart` | 21, 301 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/user_actions/addon_popup.dart` | 34 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |
| `lib/Accounting/accountingEditDialog.dart` | 92 | `collection('scheduledTournaments')` | ❌ **不要** | 個別ドキュメント取得、`businessDate`は表示に使用しない想定 |

**修正が必要な理由**:
- `scheduled_tournament_list_page.dart`: 営業日ベースでトーナメントを表示する場合、`startAt`ではなく`businessDate`でフィルタリングする必要があります。
- `scheduled_tournament_in_calendar_page.dart`: カレンダー表示で営業日ベースの表示に変更する場合、`startAt`ではなく`businessDate`でフィルタリングする必要があります。
- `tournament_select_page.dart`: 営業日ベースの表示に変更するため、`businessDate`でフィルタリングする必要があります。

**修正内容**:
- `scheduled_tournament_list_page.dart`: **予定・任意日時**。営業日ベースの表示に変更する場合は、`calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応）して`businessDate`を計算し、`where('businessDate', isEqualTo: businessDate)`を使用。`AMBIGUOUS`/`NONE`時のダイアログ実装が必要
- `scheduled_tournament_in_calendar_page.dart`: **予定・任意日時**。営業日ベースの表示に変更する場合は、`calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応）して`businessDate`を計算し、`where('businessDate', isEqualTo: businessDate)`を使用。`AMBIGUOUS`/`NONE`時のダイアログ実装が必要
- `tournament_select_page.dart`: **予定・任意日時**。営業日ベースの表示に変更するため、`calcBusinessDate`を使用（`businessHoursMonthlyMap`参照、±30分バッファ、OK/NONE/AMBIGUOUS対応）して`businessDate`を計算し、`where('businessDate', isEqualTo: businessDate)`を使用。`AMBIGUOUS`/`NONE`時のダイアログ実装が必要

---

### 5. `attendances`コレクション

**更新内容**: `date`: string → `businessDate`: string に変更（`clockIn`から計算）

#### Dartファイル（取得・表示）

| ファイル | 行番号 | 取得方法 | 修正の必要性 | 備考 |
|---------|--------|---------|-------------|------|
| `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | 59-64 | `AttendanceService.getAllStaffAttendance()`経由 | ✅ **必要** | Cloud Functions経由で取得。Functions側の修正が必要 |
| `lib/AttendanceManagement/staff_attendance_detail_page_from_allStaffAttendance.dart` | - | `AttendanceService.getAllStaffAttendance()`経由 | ✅ **必要** | Cloud Functions経由で取得。Functions側の修正が必要 |
| `lib/AttendanceManagement/daily_attendance_detail_page_from_staffAttendanceDetail.dart` | - | データを直接表示 | ❌ **不要** | `date`はコンストラクタのパラメータとしてのみ使用、表示には使用していない |

#### TypeScriptファイル（取得）

| ファイル | 行番号 | 取得方法 | 修正の必要性 | 備考 |
|---------|--------|---------|-------------|------|
| `functions/src/attendance/getStaffAttendance.ts` | 49-54 | `where('date', '>=', startDateStr).where('date', '<=', endDateStr)` | ✅ **必要** | **現状確認**: range queryを使用している（51-52行目）。`date`フィールドを`businessDate`に変更。期間クエリは原則パターンA（range query）を推奨 |
| `functions/src/attendance/getAllStaffAttendance.ts` | 59-63 | `where('date', '>=', startDateStr).where('date', '<=', endDateStr)` | ✅ **必要** | **現状確認**: range queryを使用している（61-62行目）。`date`フィールドを`businessDate`に変更。期間クエリは原則パターンA（range query）を推奨 |

**修正が必要な理由**:
- `getStaffAttendance.ts`: `date`フィールドでクエリしているため、`businessDate`に変更する必要があります。
- `getAllStaffAttendance.ts`: `date`フィールドでクエリしているため、`businessDate`に変更する必要があります。

**修正内容（現状確認→方針→TODO）**:
- `getStaffAttendance.ts`: 
  - **現状確認**: range queryを使用している（51-52行目）。`date`フィールドでクエリ
  - **方針**: `where('date', ...)`を`where('businessDate', ...)`に変更（51-52行目）。期間クエリは原則パターンA（range query）を推奨
  - **TODO**: インデックス/制約等が理由でrange queryが使えない場合は、パターンB（whereIn分割/複数クエリ）を例外として検討
- `getAllStaffAttendance.ts`: 
  - **現状確認**: range queryを使用している（61-62行目）。`date`フィールドでクエリ
  - **方針**: `where('date', ...)`を`where('businessDate', ...)`に変更（61-62行目）。期間クエリは原則パターンA（range query）を推奨
  - **TODO**: インデックス/制約等が理由でrange queryが使えない場合は、パターンB（whereIn分割/複数クエリ）を例外として検討

---

### 6. `attendanceCorrectionRequests`コレクション

**更新内容**: ⚠️ **保留**（検討中）

**保留理由**: attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため

#### Dartファイル（取得・表示）

| ファイル | 行番号 | 取得方法 | 修正の必要性 | 備考 |
|---------|--------|---------|-------------|------|
| `lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart` | 34-38 | `getAttendanceCorrectionRequests` Cloud Function経由 | ⚠️ **保留** | 現時点では修正不要（検討中） |
| `lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart` | 341 | `request['date']`を表示 | ⚠️ **保留** | 現時点では修正不要（検討中） |

#### TypeScriptファイル（取得）

| ファイル | 行番号 | 取得方法 | 修正の必要性 | 備考 |
|---------|--------|---------|-------------|------|
| `functions/src/attendance/getAttendanceCorrectionRequests.ts` | 16 | `collection('attendanceCorrectionRequests')` | ❌ **不要** | `date`フィールドでクエリしていない（`status`のみ） |

**修正内容**:
- 現時点では修正不要（保留）
- 将来的に検討が完了した時点で対応を決定

---

## まとめ表

### 修正が必要なファイル

| コレクション | ファイル | 修正内容 | 優先度 |
|------------|---------|---------|--------|
| `bills` | `lib/Accounting/accountingPage.dart` | **当日画面**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得。タブ/プルダウンで翌日・期間表示がある場合は、`currentBusinessDateKey`を起点に営業日キー列を生成 | 高 |
| `bills` | `lib/Accounting/accountingHistoryPage.dart` | **日付選択画面**: 現状確認：選択値が営業日文字列（`YYYY-MM-DD`）のため、`calcBusinessDate`は不要（そのままクエリ可能）。初期化時は`storeMeta/currentBusinessDay`をsnapshot購読 | 高 |
| `bills` | `lib/Accounting/postAccountingAdjustmentsPage.dart` | **日付選択画面**: 現状確認：選択値が営業日文字列（`YYYY-MM-DD`）のため、`calcBusinessDate`は不要（そのままクエリ可能）。初期化時は`storeMeta/currentBusinessDay`をsnapshot購読 | 高 |
| `bills` | `lib/user_actions/order_history_popup.dart` | **当日画面**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得 | 高 |
| `bills` | `lib/user_actions/tournament_history_popup.dart` | **当日画面**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得 | 高 |
| `orders` | `lib/OrderView/OrderManagement/order_management_page.dart` | **当日画面**: 現状確認：`DateFormat('yyyyMMdd').format(DateTime.now())`でカレンダー日付を使用。方針：`storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得し、`YYYYMMDD`形式に変換。前日は単純に前日を計算（`isClosed`考慮は今回はしない） | 高 |
| `scheduledTournaments` | `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` | **予定・任意日時**: `calcBusinessDate`を使用（±30分バッファ、OK/NONE/AMBIGUOUS対応）。`AMBIGUOUS`/`NONE`時のダイアログ実装が必要 | 中 |
| `scheduledTournaments` | `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` | **予定・任意日時**: `calcBusinessDate`を使用（±30分バッファ、OK/NONE/AMBIGUOUS対応）。`AMBIGUOUS`/`NONE`時のダイアログ実装が必要 | 中 |
| `scheduledTournaments` | `lib/tournament/pages/tournament_select_page.dart` | **予定・任意日時**: `calcBusinessDate`を使用（±30分バッファ、OK/NONE/AMBIGUOUS対応）。`AMBIGUOUS`/`NONE`時のダイアログ実装が必要 | 中 |
| `attendances` | `functions/src/attendance/getStaffAttendance.ts` | 現状確認：range queryを使用。方針：`where('date', ...)`を`where('businessDate', ...)`に変更。期間クエリは原則パターンA（range query）を推奨、パターンB（whereIn分割/複数クエリ）は例外扱い | 高 |
| `attendances` | `functions/src/attendance/getAllStaffAttendance.ts` | 現状確認：range queryを使用。方針：`where('date', ...)`を`where('businessDate', ...)`に変更。期間クエリは原則パターンA（range query）を推奨、パターンB（whereIn分割/複数クエリ）は例外扱い | 高 |
| `attendanceCorrectionRequests` | `lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart` | ⚠️ **保留**（検討中） | - |

### 修正が不要なファイル

- `bills`コレクション関連（個別ドキュメント取得のみ）: `businessDate`フィルタなしで個別ドキュメントを取得しているため修正不要
  - `lib/user_actions/current_accounting_popup.dart`
  - `lib/user_actions/add_extra_popup.dart`
  - `lib/OrderView/OrderManagement/order_edit_dialog.dart`
  - `lib/Accounting/categoryPaymentMethodDialog.dart`
- `analyticsMonthly/{monthKey}/days`サブコレクション関連: `businessDate`をキーとして使用しているため修正不要
- 個別ドキュメント取得のみのファイル: `businessDate`は表示に使用しない想定のため修正不要
- `lib/tournament/dialogs/tournament_select_dialog.dart`: 現在未使用のため修正不要（類似の`TournamentSelectPage`が使用されている）

---

## 次のステップ

Step3では、実際の修正作業を行います。修正が必要なファイルについて、詳細な修正内容を設計します。
