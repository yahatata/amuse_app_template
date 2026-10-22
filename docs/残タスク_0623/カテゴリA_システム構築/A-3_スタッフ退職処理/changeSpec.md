# A-3 スタッフ退職処理 changeSpec

## 1. 文書情報

| 項目 | 内容 |
|------|------|
| タスクID | A-3 |
| タスク名 | スタッフ退職処理 |
| 作成日 | 2026-07-03 |
| ステータス | **完了**（2026-07-09） |
| 本書の位置づけ | 実装・テスト・デプロイの作業指示書 |

### 正本仕様書（再検討しない）

| 文書 | パス |
|------|------|
| 概要 | [概要.md](./概要.md) |
| 詳細仕様 | [詳細仕様書.md](./詳細仕様書.md) |
| 個人情報保持（後続） | [../../後続検討事項/退職者・利用者情報の保持期間と削除方針.md](../../後続検討事項/退職者・利用者情報の保持期間と削除方針.md) |

---

## 2. 参照する正本仕様書

本 changeSpec は上記2文書の実装落とし込みである。業務仕様の変更提案は行わない。

矛盾時の優先順位:

1. `詳細仕様書.md`
2. `概要.md`
3. 本 changeSpec（実装詳細）
4. 現行コード（現状把握用。仕様と矛盾する場合は仕様を正とする）

---

## 3. 実装目的

店舗管理者がスタッフを `staffs.status = "retired"` にし、退職後のスタッフ本人操作（QR・勤怠・シフト等）を停止する。過去勤怠・給与・支払い履歴は維持し、同一LINEアカウントによる再登録（`reactivateStaffAccount`）のみを例外とする。

---

## 4. 実装対象範囲

| 領域 | 内容 |
|------|------|
| データモデル | `staffs.status` ほか退職フィールド |
| Cloud Functions | `retireStaff` / `reactivateStaffAccount` 新規、本人操作 Callable への active チェック、リッチメニュー |
| スタッフLIFF | `public/staff/index.html` retired 分岐・再登録UI |
| 管理者Flutter | `staffDetailPage` 退職処理、`staffListPage` active/retired 表示 |
| 既存データ | `status: "active"` 補正 |
| テスト | 新規 Callable・active チェック・リッチメニュー |

---

## 5. 初期実装に含めないもの

仕様書どおり、以下は実装しない。

- `retirement_scheduled` / 退職予定日 scheduler / 退職予定者UI
- Firebase Auth `disabled` 化
- `getFirebaseCustomToken` での retired ブロック
- 店舗端末からの退職取消・復旧・再雇用ボタン
- 再登録の店舗承認待ち UI
- 既存QRの即時無効化（Storage 削除・署名失効）
- 給与未払い・支払い未完了による退職ブロック
- `hourlyWage` / `bankInfo` の削除・マスク
- `retiredByDeviceId` 等の監査フィールド
- shifts rules / IDOR / `getShifts` auth の全面改修
- `createStaffByApp` 補助経路の再登録フロー整備（C-01・後続扱い）

---

## 6. 現行コード確認結果

調査日: 2026-07-03

### 6-1. スタッフ登録

| 経路 | ファイル | 現状 |
|------|----------|------|
| LINEミニアプリ（本流） | `functions/src/domains/staff/callables/createStaffAccount.ts` | `staffs/{auth.uid}` に作成。`status` なし。既存 doc あれば `alreadyRegistered: true`（**retired もブロック**） |
| 管理者端末（補助） | `functions/src/domains/staff/callables/createStaffByApp.ts` | ランダム Auth uid で `staffs` 作成。`StaffName` 等あり。`status` なし |

### 6-2. スタッフLIFF

| 項目 | ファイル | 現状 |
|------|----------|------|
| エントリ | `public/staff/index.html` | `checkStaffRegistration()`（L858–919）: `staffs/{uid}` **存在のみ**確認。`status` 未参照 |
| 新規登録 | 同上 L988 | `createStaffAccount` 呼び出し |
| QR | 同上 L1137 | `generateQRCode({ type: 'staff' })` |
| シフト申請 | 同上 L2402–2633 | `updateShiftRequest` / `createMultipleShifts` |
| 募集要請承諾 | 同上 L2743 | `confirmShiftRequest` |
| 勤怠参照 | 同上 L4114 | `getStaffAttendance` |
| 勤怠修正申請 | 同上 L4422 | `createAttendanceCorrectionRequest` |
| プロフィール | 同上 L4629 | `openProfileManagement` — **表示のみ**（更新 Callable / Firestore 直書きなし） |

### 6-3. 管理者UI

| 画面 | ファイル | 現状 |
|------|----------|------|
| スタッフ一覧 | `lib/Home/staffListPage.dart` | `staffs` 全件表示。`status` フィルタなし |
| スタッフ詳細 | `lib/Home/staffDetailPage.dart` | 時給・銀行口座編集あり。退職UIなし |
| スタッフ作成（補助） | `lib/StaffDate/createStaffAccountPage.dart` | `createStaffByApp` |
| 入口 | `lib/Home/adminHomePage.dart` | `StaffListPage` へ遷移 |

### 6-4. 勤怠・QR（店舗端末経由）

| Callable | ファイル | 認証 | 備考 |
|----------|----------|------|------|
| `clockIn` | `attendance/callables/clockIn.ts` | 店舗デバイス | `request.data.staffId` で対象指定 |
| `clockOut` | `attendance/callables/clockOut.ts` | 同上 | 同上 |
| `startBreak` | `attendance/callables/startBreak.ts` | 同上 | 同上 |
| `endBreak` | `attendance/callables/endBreak.ts` | 同上 | 同上 |
| `createManualClockInRecord` | `attendance/callables/createManualClockInRecord.ts` | 同上 | 同上 |
| `generateQRCode` | `user/callables/generateQRCode.ts` | `auth.uid` | `type=staff` 時 `staffs` 参照。status 未確認 |

### 6-5. シフト・募集

| Callable | ファイル | 本人操作 |
|----------|----------|----------|
| `createMultipleShifts` | `staff/callables/createMultipleShifts.ts` | `auth.uid` = staffId |
| `updateShiftRequest` | `staff/callables/updateShiftRequest.ts` | 申請所有者チェックあり |
| `confirmShiftRequest` | `staff/callables/confirmShiftRequest.ts` | 募集要請承諾 |
| `getShifts` | `staff/callables/getShifts.ts` | **認証コメントアウト**。`userId` パラメータ |
| `lineWebhook` postback | `webhook/callables/lineWebhook.ts` L181–251 | 要請辞退。`staffs` status 未確認 |

### 6-6. 勤怠修正

| Callable | ファイル |
|----------|----------|
| `createAttendanceCorrectionRequest` | `attendance/callables/createAttendanceCorrectionRequest.ts` |
| `checkExistingCorrectionRequest` | `attendance/callables/checkExistingCorrectionRequest.ts` |

### 6-7. LINEリッチメニュー

| 処理 | ファイル | 現状 |
|------|----------|------|
| `linkStaffRichMenu` | `webhook/services/lineRichMenu.ts` | 実装済み |
| `linkUserRichMenu` | 同上 | 実装済み |
| `unlinkRichMenu` | — | **未実装** |
| `ensureStaffRichMenu` | `webhook/callables/ensureStaffRichMenu.ts` | `staffs` 存在のみ。status 未確認 |
| `lineWebhook` follow | `webhook/callables/lineWebhook.ts` L279–284 | `staffDoc.exists` のみでスタッフメニュー |

### 6-8. 給与・支払い

| 処理 | ファイル | staffs 参照 |
|------|----------|-------------|
| `processStaffPayroll` | `attendance/tasks/processStaffPayroll.ts` | `staffs/{staffId}` 読取。status フィルタなし |
| `getPayrollCandidates` | `attendance/callables/getPayrollCandidates.ts` | attendance ベース。staffs 直接フィルタなし |
| `executeMonthlyPayroll` 等 | `attendance/callables/` | 管理者デバイス経由 |
| `registerPaymentStatus` | `attendance/callables/registerPaymentStatus.ts` | 支払い状態。retired も対象想定 |

### 6-9. その他 staffs 参照UI（active 化候補）

| ファイル | 用途 |
|----------|------|
| `lib/StaffDate/shiftDateDialog.dart` L771 | シフト割当用スタッフ全件取得 |
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` L145 | 勤怠作成スタッフ選択 |
| `functions/.../getStaffListForAttendance.ts` L55–57 | 出勤モードで全 staffs 取得 |

---

## 7. 変更対象ファイル一覧

### 7-1. 新規

| ファイル | 内容 |
|----------|------|
| `functions/src/domains/staff/types/staffStatus.ts` | `StaffStatus` 型、`active` / `retired` |
| `functions/src/domains/staff/helpers/staffStatus.ts` | `normalizeStaffStatus`, `assertActiveStaff`, `isActiveStaff` |
| `functions/src/domains/staff/helpers/checkFutureStaffSchedule.ts` | 退職ブロック用未来予定検索 |
| `functions/src/domains/staff/helpers/clearRetiredStaffPii.ts` | PII フィールド削除 |
| `functions/src/domains/staff/callables/retireStaff.ts` | 退職処理 |
| `functions/src/domains/staff/callables/reactivateStaffAccount.ts` | 再登録 |
| `functions/scripts/migrateStaffStatusActive.ts` | 既存 doc への `status: active` 一括付与（手動実行） |
| `functions/__tests__/staff/retireStaff.spec.ts` | |
| `functions/__tests__/staff/reactivateStaffAccount.spec.ts` | |
| `functions/__tests__/staff/staffStatus.spec.ts` | |
| `functions/__tests__/staff/checkFutureStaffSchedule.spec.ts` | |
| `functions/__tests__/staff/activeStaffGuard.spec.ts` | 代表 Callable の retired 拒否 |

### 7-2. 修正（Functions）

| ファイル | 変更概要 |
|----------|----------|
| `functions/src/domains/staff/index.ts` | 新 Callable export |
| `functions/src/domains/staff/callables/createStaffAccount.ts` | 新規作成時 `status: 'active'` |
| `functions/src/domains/staff/callables/createStaffByApp.ts` | 新規作成時 `status: 'active'` |
| `functions/src/domains/webhook/services/lineRichMenu.ts` | `unlinkRichMenu` 追加 |
| `functions/src/domains/webhook/callables/ensureStaffRichMenu.ts` | active のみ link |
| `functions/src/domains/webhook/callables/lineWebhook.ts` | active staff のみスタッフメニュー；postback 前に active チェック |
| `functions/src/domains/user/callables/generateQRCode.ts` | `type=staff` で `assertActiveStaff(auth.uid)` |
| `functions/src/domains/attendance/callables/clockIn.ts` | `assertActiveStaff(staffId)` |
| `functions/src/domains/attendance/callables/clockOut.ts` | 同上 |
| `functions/src/domains/attendance/callables/startBreak.ts` | 同上 |
| `functions/src/domains/attendance/callables/endBreak.ts` | 同上 |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 同上 |
| `functions/src/domains/staff/callables/createMultipleShifts.ts` | `assertActiveStaff(auth.uid)`（`assertStaffExists` を置換または併用） |
| `functions/src/domains/staff/callables/updateShiftRequest.ts` | `assertActiveStaff(auth.uid)` |
| `functions/src/domains/staff/callables/confirmShiftRequest.ts` | `assertActiveStaff(auth.uid)` |
| `functions/src/domains/attendance/callables/createAttendanceCorrectionRequest.ts` | 本人申請時のみ `assertActiveStaff`（§9-5） |
| `functions/src/domains/attendance/callables/checkExistingCorrectionRequest.ts` | 同上 |
| `functions/src/domains/attendance/callables/getStaffAttendance.ts` | 本人参照時のみ `assertActiveStaff`（§9-5） |
| `functions/src/domains/staff/callables/getShifts.ts` | **認証設計の全面修正は行わない**（§9-6）。`request.auth` があり `auth.uid === userId` と確認できる場合に限り `assertActiveStaff` |
| `functions/src/domains/shift/services/helpers.ts` | `assertStaffExists` は残す。active 必須箇所は `assertActiveStaff` を使用 |
| `functions/src/domains/attendance/callables/getStaffListForAttendance.ts` | 出勤モードの一覧から `retired` 除外 |
| `functions/src/shared/logging/serviceByFunctionEntry.ts` | `retireStaff`, `reactivateStaffAccount` 登録 |

### 7-3. 修正（Flutter）

| ファイル | 変更概要 |
|----------|----------|
| `lib/Home/staffDetailPage.dart` | 退職手続き導線（確認ダイアログ → 専用ページ遷移）、退職済み表示、退職情報表示 |
| `lib/Home/staffRetirementPage.dart` | 退職手続き専用ページ（退職日・理由入力、`retireStaff` 実行） |
| `lib/Home/staffListPage.dart` | デフォルト active のみ、退職済みフィルタ |
| `lib/StaffDate/shiftDateDialog.dart` | 新規割当候補を active のみ（任意だが推奨） |
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` | 新規勤怠作成のスタッフ選択を active のみ（管理者操作は可だが UI 候補整理） |

### 7-4. 修正（スタッフLIFF）

| ファイル | 変更概要 |
|----------|----------|
| `public/staff/index.html` | retired 分岐、再登録画面、`reactivateStaffAccount` 呼び出し |

### 7-5. 触らない（意図的）

| ファイル | 理由 |
|----------|------|
| `functions/.../getFirebaseCustomToken.ts` | 仕様: retired ブロックしない |
| `functions/.../executeMonthlyPayroll.ts` 等給与系 | retired も対象に含める |
| `functions/.../updateStaffHourlyWage.ts` / `updateStaffBankInfo.ts` | 管理者が退職済みの給与情報を更新し得る |
| `firestore.rules` shifts 全面見直し | スコープ外 |

---

## 8. データモデル変更

### 8-1. `staffs/{staffId}` 追加フィールド

```ts
status: "active" | "retired"   // 正本。未設定は移行期間のみ active 扱い（§19）
retiredAt?: Timestamp          // retired 時のみ
retiredDate?: string           // "YYYY-MM-DD" JST。retired 時のみ
retiredReason?: string | null  // retired 時のみ
```

### 8-2. 新規作成時

`createStaffAccount` / `createStaffByApp` の `set` に必ず `status: "active"` を含める。

### 8-3. Firestore インデックス

`checkFutureStaffSchedule` 用に以下が必要になる可能性がある（実装時にエラーメッセージで確認）:

```
Collection: shiftRequests
Fields: staffId ASC, status ASC, dateKey ASC
```

assignments 検索は `shifts/{ym}/days` の doc 直読みのため複合 index は不要想定。

---

## 9. Callable / Functions 変更

### 9-1. 新規: `retireStaff`

| 項目 | 内容 |
|------|------|
| パス | `functions/src/domains/staff/callables/retireStaff.ts` |
| 認証 | 店舗デバイス `admin`（`createStaffByApp` と同パターン: `getCallerDeviceByUid` + `device.role === 'admin'`） |
| 入力 | `{ staffId: string, retiredDate: string, retiredReason?: string \| null }` |
| 処理順 | ①対象 `staffs` 取得 ②既に `retired` なら `STAFF_ALREADY_RETIRED` ③`checkFutureStaffSchedule(staffId)` ④トランザクションで status 更新 + PII クリア ⑤リッチメニュー切替 |
| `retiredDate` | **正本は Functions 側**。受信値を JST 暦日 `YYYY-MM-DD` として検証する。未送信・空の場合は `generateJstDateKey()` を採用。UI は入力補助として端末側で JST 当日を仮表示してよいが、保存値の正本はサーバー検証後の値とする |
| 成功時の返却 | `{ success: true, staffId, retiredDate, retiredAt }` のみ（正常系は success レスポンスに統一） |
| 業務エラー時の返却 | `{ success: false }` は使わない。原則 `HttpsError` を throw し、`details` に `errorKey`（および必要時 `blockingSummary`）を含める（§9-4） |

**既に retired への再実行**: `HttpsError` + `details.errorKey: STAFF_ALREADY_RETIRED`（冪等成功にしない）。

### 9-2. 新規: `reactivateStaffAccount`

| 項目 | 内容 |
|------|------|
| パス | `functions/src/domains/staff/callables/reactivateStaffAccount.ts` |
| 認証 | `request.auth` 必須（LINE uid = staff doc id） |
| 入力 | `createStaffAccount` と同等: `fullName`, `fullNameKana`, `email`, `phoneNumber`, `birthMonthDay` |
| 前提 | `staffs/{auth.uid}.status === 'retired'` のみ。active / 未存在は拒否 |
| 処理 | バリデーション → `loginId` 再生成 → QR 再生成（`createStaffAccount` と同ロジック共通化推奨）→ doc 更新: `status: active`, 退職フィールド `FieldValue.delete()`, 連絡先再設定 → `linkStaffRichMenu(uid)` |
| 出力 | `{ success: true, uid, qrCode?, qrCodeUrl?, expiresAt? }` |

### 9-3. エラーキー（統一）

| errorKey | 用途 | HttpsError code 目安 |
|----------|------|---------------------|
| `STAFF_RETIRED` | retired による本人操作拒否 | `permission-denied` |
| `STAFF_NOT_ACTIVE` | status が active でない（未登録・不明含む） | `permission-denied` |
| `STAFF_ALREADY_RETIRED` | 退職処理の二重実行 | `failed-precondition` |
| `STAFF_FUTURE_SCHEDULE_EXISTS` | 未来予定により退職ブロック | `failed-precondition` |
| `STAFF_NOT_RETIRED` | 再登録対象が retired でない | `failed-precondition` |

利用者向けメッセージ例: 「退職済みのため、この操作は利用できません。」

### 9-4. `retireStaff` のエラー返却方針

| 種別 | 返却方法 |
|------|----------|
| 正常終了 | `{ success: true, ... }` を return |
| 業務エラー（未来予定ブロック・二重退職・対象不在・バリデーション失敗等） | `HttpsError` を throw。`details` に少なくとも `errorKey` を含める |
| 未来予定ブロック | 上記に加え `details.blockingSummary` を含める（§15） |

**Flutter 管理者UI**: `FirebaseFunctionsException` の `details` から `errorKey` / `blockingSummary` を読み取り表示する。`success: false` の正常レスポンスは想定しない。

**例（未来予定ブロック）**:

```ts
throw new HttpsError(
  'failed-precondition',
  '未来のシフト予定が残っています。シフトを整理してから退職処理を実行してください。',
  {
    errorKey: 'STAFF_FUTURE_SCHEDULE_EXISTS',
    blockingSummary: {
      shiftRequestCount: 2,
      assignmentCount: 1,
      samples: [{ kind: 'shiftRequest', dateKey: '2026-07-15' }],
    },
  }
);
```

### 9-5. `getStaffAttendance` / `checkExistingCorrectionRequest` の guard 範囲

**スタッフ本人LIFF経路**（`request.auth.uid === staffId`）では `assertActiveStaff(staffId)` により retired を拒否する。

**管理者端末・管理者デバイス経由**では retired staff の過去勤怠参照・修正申請確認を許可する。guard は本人操作と判定できる場合にのみ適用する。

```ts
// 実装イメージ（両 Callable 共通）
const isSelfService =
  request.auth &&
  request.data.staffId === request.auth.uid;

if (isSelfService) {
  await assertActiveStaff(request.data.staffId);
}
// それ以外（管理者が他者 staffId を指定する経路、または将来の管理画面からの参照）は assertActiveStaff しない
```

現行の主な呼び出し元:

| Callable | LIFF（本人） | 管理者 |
|----------|-------------|--------|
| `getStaffAttendance` | `public/staff/index.html` | 直接呼び出しは現状なし（履歴は `getAllStaffAttendance` 等を利用） |
| `checkExistingCorrectionRequest` | `public/staff/index.html` | 同上 |

### 9-6. `getShifts` の扱い（A-3 スコープ）

**`getShifts` の認証設計全体（コメントアウトされた auth 復活・`userId` パラメータ設計の整理）は A-3 では修正しない。**

A-3 で行うのは以下のみ:

- `request.auth` が存在し、かつ `request.auth.uid === userId` と確認できる場合に限り `assertActiveStaff(userId)` を実行する。
- 上記以外（auth なし、`userId` 不一致等）は **現行挙動を維持**し、A-3 の範囲で auth 設計を広げない。

---

## 10. helper / service 変更

### 10-1. `staffStatus.ts`

```ts
// functions/src/domains/staff/helpers/staffStatus.ts

export type StaffStatus = 'active' | 'retired';

/** status 未設定 doc は active とみなす（移行期間） */
export function normalizeStaffStatus(data: FirebaseFirestore.DocumentData | undefined): StaffStatus;

export async function getStaffStatus(staffId: string): Promise<StaffStatus | 'not_found'>;

/** retired / not_found 時は HttpsError(STAFF_RETIRED or STAFF_NOT_ACTIVE) */
export async function assertActiveStaff(staffId: string): Promise<FirebaseFirestore.DocumentSnapshot>;
```

### 10-2. `checkFutureStaffSchedule.ts`

```ts
export interface FutureScheduleBlockResult {
  blocked: boolean;
  shiftRequestCount: number;
  assignmentCount: number;
  samples: Array<{ kind: 'shiftRequest' | 'assignment'; dateKey: string }>; // 最大5件
}

export async function checkFutureStaffSchedule(
  staffId: string,
  todayJst: string // generateJstDateKey()
): Promise<FutureScheduleBlockResult>;
```

**判定ロジック（確定）**:

1. **shiftRequests**: `staffId == X` AND `status in ['pending','interim_confirmed','confirmed','final_confirmed']` を取得し、**`dateKey > todayJst` の未来分のみ**をブロック対象とする（過去分は対象外）。
2. **assignments**: `todayJst` の年月から **当月末 + 翌月 + 翌々月**（計3ヶ月分）の `shifts/{yearMonth}/days/{dateKey}` を走査。`dateKey > todayJst` かつ `assignments` 配列内に `staffId`（または `assignment.staffId`）が含まれる doc をブロック。

`declined` および過去日の `shiftRequests` / `assignments` は対象外。

**`shiftRequests.status` 参考（現行コード・調査日: 2026-07-03）**:

| status | 設定箇所 | 意味（現行実装） | 退職ブロック |
|--------|----------|------------------|-------------|
| `pending` | `createMultipleShifts` | シフト申請中 | 対象（未来分） |
| `interim_confirmed` | `interimConfirmRequests` | 管理者による仮確定 | 対象（未来分） |
| `confirmed` | `confirmShiftRequest` | 募集要請の承諾（要請フロー） | 対象（未来分） |
| `final_confirmed` | `finalizeDay` / `finalizeMonth` | 日次・月次の最終確定 | 対象（未来分） |
| `declined` | `lineWebhook` postback | 要請辞退 | 対象外 |

### 10-3. `clearRetiredStaffPii.ts`

退職時に `FieldValue.delete()` で削除するフィールド一覧を定数化し、`retireStaff` から呼ぶ。

```ts
export const RETIRED_STAFF_PII_FIELDS = [
  'email', 'phoneNumber', 'birthMonthDay', 'loginId',
  'qrCodeUrl', 'qrExpiresAt', 'qrExpiresAtMs',
  'StaffName', 'StaffFullName', 'StaffFullNameKana',
] as const;
```

### 10-4. `unlinkRichMenu`（C-02 確定案）

`functions/src/domains/webhook/services/lineRichMenu.ts` に追加:

```http
DELETE https://api.line.me/v2/bot/user/{userId}/richmenu
Authorization: Bearer {channelAccessToken}
```

- 成功: `true`
- 404（未リンク）: `true`（冪等）
- その他失敗: `logOpsError` 後 `false` を返す

**退職処理との関係（方針確定）**:

- リッチメニュー切替（`linkUserRichMenu` / `unlinkRichMenu`）の失敗は、**`retireStaff` 本体の失敗にしない**（Firestore 上の退職処理はコミット済みとする）。
- 失敗時は `logOpsError`（必要に応じて warning ログ）に記録するのみ。
- **管理者UI でも退職失敗として扱わない**。`retireStaff` は `{ success: true }` を返し、UI は退職済み表示へ遷移する。リッチメニュー未切替は運用・ログで後追いする（`createStaffAccount` のリッチメニュー失敗パターンに合わせる）。

---

## 11. LINEリッチメニュー変更

| タイミング | 処理 | 失敗時 |
|------------|------|--------|
| 退職成功後 | `users/{uid}` 存在 → `linkUserRichMenu(uid)` / 不存在 → `unlinkRichMenu(uid)` | 退職処理は成功のまま。`logOpsError` のみ（§10-4） |
| 再登録成功後 | `linkStaffRichMenu(uid)` | 再登録処理は成功のまま（既存 `createStaffAccount` パターン） |
| `ensureStaffRichMenu` | `staffs` 存在 **かつ** `normalizeStaffStatus === 'active'` のみ link | — |
| `lineWebhook` follow/postback 内リッチメニュー設定 | 同上 | — |

`lineWebhook` の要請辞退 postback（L181–251）: 処理前に `assertActiveStaff(lineUserId)`。retired は辞退操作も不可（`STAFF_RETIRED` で握りつぶさずログ + リプライ「退職済みのため操作できません」推奨）。

---

## 12. スタッフLIFF変更（C-03 / C-06 確定案）

**対象ファイル**: `public/staff/index.html`（C-06 確定）

### 12-1. `checkStaffRegistration()` 修正（L858–919）

```
staffs/{uid} 取得
├─ 存在しない → 現状どおり registration-page
├─ status === 'retired'（normalize: 未設定は active）→ reactivation-page（新規）
└─ active → 現状どおり handleHashNavigation / home-page
```

### 12-2. 新規: `reactivation-page`（HTML セクション）

| 要素 | 内容 |
|------|------|
| 見出し | 「退職済みアカウント」 |
| 説明 | 「このLINEアカウントは退職済みです。店舗と復帰の合意がある場合のみ再登録できます。」 |
| 確認 | チェックボックス「店舗側と再登録・復帰について合意済みです」（必須） |
| 入力 | `registration-page` と同フォーム（fullName/fullNameKana は既存値を初期表示） |
| 送信 | `reactivateStaffAccount` |
| 成功後 | 通常 home-page へ（QR 表示は既存フローに合わせる） |

### 12-3. 通常画面のガード

`openProfileManagement` 等の各 `showPage` 入口で、退職済みなら `reactivation-page` にリダイレクト（二重防御）。

### 12-4. `createStaffAccount` 呼び出し

`registration-page` は **doc 未存在時のみ** 表示されるため、retired 時は呼ばれない（変更不要）。

---

## 13. 管理者Flutter UI変更

### 13-1. `staffDetailPage.dart` — 退職手続き導線

| 条件 | UI |
|------|-----|
| `status != 'retired'`（未設定含む active） | AppBar 右上に「退職手続き」ボタン |
| `status == 'retired'` | 退職手続きボタン非表示。「退職済み」バッジ + 退職情報カード |

**画面遷移（誤操作防止のため専用ページ方式）**:

```text
StaffDetailPage
  ↓ AppBar「退職手続き」
確認ダイアログ（この時点では retireStaff を呼ばない）
  ↓「退職手続き画面へ進む」
StaffRetirementPage（退職手続き専用ページ）
  ↓「退職手続きを実行する」
retireStaff Callable
  ↓ 成功
Navigator.pop(context, true) → StaffDetailPage で staffData 再取得
```

**確認ダイアログ**:

1. タイトル「退職手続き画面へ進みます」
2. 本文「この時点では退職手続きはまだ実行されません。次の画面で退職日・退職理由を確認し、最終実行できます。」
3. 対象スタッフ名表示
4. ボタン「キャンセル」「退職手続き画面へ進む」

**退職手続き専用ページ（`staffRetirementPage.dart`）**:

1. 画面タイトル「退職手続き」
2. 対象スタッフ名・staffId・status 表示
3. 退職日 `TextFormField`（必須。**仮表示**: 端末側で JST 当日を初期表示してよい。送信後は Functions が検証・確定した `retiredDate` を正とする）
4. 退職理由 `TextFormField`（任意、複数行）
5. 注意事項（LIFF/QR/勤怠/シフト停止、履歴保持、未来予定ブロック）
6. 確認チェックボックス「上記内容を確認しました」（未チェック時は実行ボタン disabled）
7. 実行 → `retireStaff` Callable
8. 成功 → `Navigator.pop(context, true)`。詳細ページで `staffData` を再取得し退職済み表示に切替
9. `STAFF_FUTURE_SCHEDULE_EXISTS` 等 → `FirebaseFunctionsException.details` から `blockingSummary` を読み取り SnackBar 表示（退職は未実行）

**UI文言**: ユーザー向け表示は「退職処理」ではなく **「退職手続き」** を使用する（Callable 名 `retireStaff` 等の技術用語は変更しない）。

一覧行に退職ボタンは **置かない**（仕様どおり）。

### 13-2. `staffListPage.dart` — 退職済み表示

| 項目 | 実装案 |
|------|--------|
| デフォルト | `status != 'retired'` でフィルタ（クライアント側。`status` 未設定は active 扱い） |
| トグル | AppBar に「退職済みを表示」Switch または FilterChip |
| 退職済み行 | 名前横に `Chip(label: '退職済み')` |
| 詳細遷移 | 現状どおり `StaffDetailPage` |

---

## 14. スタッフ取得条件の変更

| 区分 | 変更対象 | 変更内容 |
|------|----------|----------|
| active のみ | `staffListPage.dart` | §13-2 |
| active のみ | `getStaffListForAttendance.ts` | `normalizeStaffStatus !== 'retired'` でフィルタ |
| active のみ | `shiftDateDialog.dart` | 割当候補を active のみ（推奨） |
| active + retired | 給与・勤怠履歴・`staffDetailPage` 退職済み表示 | 変更なし（retired も表示可） |
| active + retired | `processStaffPayroll` / `getPayrollCandidates` | **status フィルタ追加しない** |
| active + retired | `getStaffAttendance` / `checkExistingCorrectionRequest` | **管理者端末・管理者デバイス経由**では retired も可（§9-5） |
| retired のみ | `staffListPage` 退職済みフィルタ | §13-2 |

### 14-1. スタッフ取得条件に関する重要注意

`status != "retired"` の除外条件は、**新規操作・未来操作・現役スタッフ選択**に限定して適用する。

過去履歴・給与・支払い・管理者による過去勤怠確認では、**retired staff を除外してはいけない**。

#### retired staff も参照可能とする（除外しない）

| 画面・処理 |
|-----------|
| 過去勤怠 |
| 過去シフト |
| 給与計算 |
| 給与計算結果 |
| 支払い状態管理 |
| 管理者による過去勤怠修正 |
| スタッフ詳細からの退職情報確認 |

#### retired staff を候補から除外する

| 画面・処理 |
|-----------|
| 現役スタッフ一覧 |
| 勤務中スタッフ一覧 |
| 未来シフト作成 |
| 新規シフト割当 |
| 新規勤怠作成 |
| QR生成 |
| 出勤 / 退勤 / 休憩開始 / 休憩終了 |
| スタッフ本人LIFF通常操作 |

実装時は、一覧取得・ドロップダウン候補・Callable の guard を上記の用途別に誤って横展開しないこと。特に給与系・履歴系に `status != 'retired'` を入れない（§23 項目7 も参照）。

---

## 15. 未来予定ブロック

実装: `checkFutureStaffSchedule`（§10-2）を `retireStaff` の status 更新前に実行。

**エラー返却（HttpsError）**:

```ts
throw new HttpsError(
  'failed-precondition',
  '未来のシフト予定が残っています。シフトを整理してから退職処理を実行してください。',
  {
    errorKey: 'STAFF_FUTURE_SCHEDULE_EXISTS',
    blockingSummary: {
      shiftRequestCount: 2,
      assignmentCount: 1,
      samples: [
        { kind: 'shiftRequest', dateKey: '2026-07-15' },
        { kind: 'assignment', dateKey: '2026-07-20' },
      ],
    },
  }
);
```

`{ success: false, ... }` の正常レスポンスは返さない（§9-4）。

給与未払い・支払い未完了はチェックしない。

---

## 16. 退職時のフィールド保持・削除

| 操作 | 方法 |
|------|------|
| 保持 | `fullName`, `fullNameKana`, `hourlyWage`, `bankInfo`, `uid`, `createdAt`, 退職3フィールド |
| 削除 | `RETIRED_STAFF_PII_FIELDS` を `FieldValue.delete()` |
| QR Storage | 削除しない（仕様: 即時無効化必須ではない） |

`createStaffAccount` / `reactivateStaffAccount` で設定する QR フィールドは、退職時に delete される。

---

## 17. 再登録・再有効化

フローは §12・§9-2 参照。

| 項目 | 確定 |
|------|------|
| doc 再利用 | `staffs/{auth.uid}` |
| 退職フィールド | `retiredAt`, `retiredDate`, `retiredReason` を delete |
| `loginId` | `fullNameKana + birthMonthDay` で再生成（`createStaffAccount` 同等） |
| QR | 再生成して doc に保存 |
| 店舗承認 | なし（LIFF チェックボックスのみ） |

---

## 18. 給与・支払い状態管理への影響

| 項目 | 対応 |
|------|------|
| 給与計算対象 | retired スタッフ **を除外しない** |
| `hourlyWage` / `bankInfo` | 退職後も保持。管理者が `staffDetailPage` から更新可能 |
| 退職ブロック | 給与未払いは条件に含めない |
| テスト | `processStaffPayroll` が retired staff を処理することを T-22 で確認 |

---

## 19. 既存データへの status 付与方針（C-04 確定案）

**二段構え**とする。

### 19-1. デプロイ前（推奨・必須に近い）

`functions/scripts/migrateStaffStatusActive.ts` を手動実行:

```
対象: staffs 全 doc where status が未設定
更新: { status: 'active', updatedAt: serverTimestamp() }
既に retired がある場合はスキップ（初期導入時は該当なし）
```

実行は本番デプロイ前に1回。`package.json` に `migrate:staff-status` スクリプト追加可。

### 19-2. ランタイム（移行期間の安全網）

`normalizeStaffStatus()`: `status` 未設定 → `'active'` として扱う（**読取のみ。lazy write は行わない**）。

`assertActiveStaff` / UI フィルタはすべて `normalizeStaffStatus` 経由。

### 19-3. 新規作成

`createStaffAccount` / `createStaffByApp` は必ず `status: 'active'` を書き込む。

---

## 20. テスト方針

### 20-1. 単体・結合（Functions）

| ID | 対象 | 観点 |
|----|------|------|
| T-01 | `retireStaff` | active → retired |
| T-02 | `retireStaff` | 未来 shiftRequests でブロック |
| T-03 | `retireStaff` | 未来 assignments でブロック |
| T-04 | `retireStaff` | 過去のみ・給与未払いは通過 |
| T-05 | `retireStaff` | PII delete |
| T-06 | `retireStaff` | 保持フィールド残存 |
| T-07 | `retireStaff` | users あり → linkUserRichMenu mock |
| T-08 | `retireStaff` | users なし → unlinkRichMenu mock |
| T-09 | `retireStaff` | 二重実行 → `STAFF_ALREADY_RETIRED` |
| T-10–12 | `generateQRCode`, `clockIn`, `createMultipleShifts` | retired 拒否 |
| T-13 | 同上 | active は通過 |
| T-14–19 | `reactivateStaffAccount` | 詳細仕様書 §20-3 |
| T-20–21 | `ensureStaffRichMenu` | retired で link しない |
| T-22 | `processStaffPayroll` | retired staff 対象に含まれる |

### 20-2. Flutter / LIFF

| ID | 観点 |
|----|------|
| T-24 | 詳細から退職処理（Widget test または手動チェックリスト） |
| T-25 | 退職済みバッジ |
| T-26 | 一覧に退職ボタンなし |

LIFF は手動テストチェックリストを changeSpec 実施結果に記載。

---

## 21. 実装順序

現行コード構成に対し、以下の Phase 順で実装する。Phase を飛ばさない。

### Phase 0: 基盤・データ補正

- `staffStatus.ts` 型・helper
- `clearRetiredStaffPii.ts`
- `checkFutureStaffSchedule.ts`
- `migrateStaffStatusActive.ts`
- `createStaffAccount` / `createStaffByApp` に `status: 'active'`
- `staffStatus.spec.ts` / `checkFutureStaffSchedule.spec.ts`
- **デプロイ前**: migration スクリプト実行（本番 staffs 件数に応じて）

### Phase 1: 退職・再登録 Callable

- `retireStaff.ts` + `retireStaff.spec.ts`
- `reactivateStaffAccount.ts` + `reactivateStaffAccount.spec.ts`
- `staff/index.ts` export
- `serviceByFunctionEntry.ts` 更新

### Phase 2: 本人操作 active check（C-05 完全リスト）

§22「本人操作 Callable 完全リスト」の全 Callable に `assertActiveStaff` を追加。  
`activeStaffGuard.spec.ts` で代表3件以上をテスト。

### Phase 3: LINEリッチメニュー

- `unlinkRichMenu` 実装
- `ensureStaffRichMenu` / `lineWebhook` 修正
- `retireStaff` / `reactivateStaffAccount` からの呼び出し接続
- リッチメニュー関連テスト

### Phase 4: スタッフLIFF

- `public/staff/index.html` retired 分岐
- `reactivation-page` UI
- `reactivateStaffAccount` 接続
- 手動テストチェックリスト実施

### Phase 5: 管理者 Flutter UI

- `staffDetailPage.dart` 退職処理
- `staffListPage.dart` フィルタ・バッジ

### Phase 6: スタッフ取得条件

- `getStaffListForAttendance.ts`
- `shiftDateDialog.dart`（推奨）
- その他 active のみ候補（§14）

### Phase 7: テスト追加・CI

- 未カバー観点の追加
- `npm test` / `flutter test` 通過確認

### Phase 8: ドキュメント・実施結果

- `進捗管理.md` 更新
- 実施結果メモ（migration 実行日時・デプロイ CF 一覧）

---

## 22. 要確認事項

| ID | 内容 | changeSpec での扱い |
|----|------|---------------------|
| C-01 | `createStaffByApp` スタッフ（uid ≠ LINE）の退職・再登録 | **後続・例外**。本 changeSpec では LINE 本流のみ整備。補助経路は退職処理（`retireStaff` by staffId）と PII クリアは動作するが、再登録 LIFF は利用不可 |
| C-02 | `unlinkRichMenu` | **§10-4 で確定**（新規実装） |
| C-03 | スタッフLIFF retired UI | **§12 で UI 案確定** |
| C-04 | status 付与タイミング | **§19 で確定**（migration + normalize 読取） |
| C-05 | 本人操作 Callable 網羅 | **下表で確定** |
| C-06 | スタッフLIFF パス | **§12: `public/staff/index.html` 確定** |

### 本人操作 Callable 完全リスト（C-05 確定）

仕様書「退職後に不可」との対応。`assertActiveStaff` 対象 staffId の取り方を記。

| # | Callable | staffId | LIFF/経路 | 備考 |
|---|----------|---------|-----------|------|
| 1 | `generateQRCode` | `auth.uid`（type=staff 時） | スタッフLIFF | |
| 2 | `clockIn` | `data.staffId` | 店舗端末 QR | |
| 3 | `clockOut` | `data.staffId` | 同上 | |
| 4 | `startBreak` | `data.staffId` | 同上 | |
| 5 | `endBreak` | `data.staffId` | 同上 | |
| 6 | `createManualClockInRecord` | `data.staffId` | 店舗端末 | |
| 7 | `createMultipleShifts` | `auth.uid` | スタッフLIFF | シフト申請 |
| 8 | `updateShiftRequest` | `auth.uid` | スタッフLIFF | シフト修正 |
| 9 | `confirmShiftRequest` | `auth.uid` | スタッフLIFF | 募集要請承諾 |
| 10 | `createAttendanceCorrectionRequest` | `data.staffId` | スタッフLIFF | 本人時のみ guard（§9-5） |
| 11 | `checkExistingCorrectionRequest` | `data.staffId` | スタッフLIFF | 本人時のみ guard（§9-5） |
| 12 | `getStaffAttendance` | `data.staffId` | スタッフLIFF | 本人時のみ guard（§9-5）。管理者経由は retired 可 |
| 13 | `getShifts` | `data.userId` | スタッフLIFF | `auth.uid === userId` のときのみ guard。auth 設計の全面修正はしない（§9-6） |
| 14 | `lineWebhook` postback 辞退 | `lineUserId` | LINE | active チェック追加 |

**プロフィール編集**: 更新 Callable が存在しない（§6-2）。LIFF では retired 時にプロフィール画面へ遷移不可とする（§12-3）。仕様上の「プロフィール編集」はこれで満たす。

**含めない（管理者操作・スコープ外）**:

- `createAttendance`（管理者勤怠作成）
- `updateAttendance` / `updateManualClockOutRecord`（管理者修正）
- `updateStaffHourlyWage` / `updateStaffBankInfo`（管理者）
- 給与系 Callable 一式

---

## 23. 実装時の注意点

1. **Auth disabled は使わない**（仕様確定）。
2. **`getFirebaseCustomToken` は変更しない**。
3. **`normalizeStaffStatus` を必ず経由**し、`status` 未設定と `active` を同一扱いにする（移行期間）。
4. **退職処理は admin デバイスのみ**。スタッフ本人・一般デバイスから `retireStaff` を呼べないようにする。
5. **リッチメニュー切替失敗は退職失敗にしない**。`retireStaff` は成功を返し、管理者UIも退職失敗表示にしない。`logOpsError` / warning で記録（§10-4, §11）。
6. **`getShifts` の認証設計全体は A-3 で直さない**。`auth.uid === userId` が確認できる場合のみ active guard（§9-6）。
7. **給与計算に retired フィルタを入れない**（§14-1: 過去履歴・給与・支払いでは retired を除外しない）。
8. **QR Storage ファイルは削除しない**。
9. **`retireStaff` の業務エラーは `HttpsError` + `details`**。正常時のみ `{ success: true }`（§9-4）。
10. **`status != 'retired'` は新規・未来・現役選択に限定**（§14-1）。履歴・給与・支払い・管理者の過去勤怠確認では retired を残す。
11. **実装完了後** `docs/残タスク_0623/カテゴリA_システム構築/進捗管理.md` を更新する。

---

## 付録: 作成・更新ファイル一覧（本タスク）

| 操作 | ファイル |
|------|----------|
| 新規 | `docs/残タスク_0623/カテゴリA_システム構築/A-3_スタッフ退職処理/changeSpec.md`（本ファイル） |

コード・テストの作成は **本 changeSpec の実装フェーズ** で行う（本タスクでは未作成）。

---

## 24. 実装完了記録（2026-07-09）

| 項目 | 内容 |
|------|------|
| 実施日 | 2026-07-09 |
| Phase | 0〜8 完了 |
| 実施結果 | [実施結果.md](./実施結果.md) |
| 進捗管理 | `進捗管理.md` A-3 を「完了」に更新（2026-07-09 クローズ） |
| デプロイ前必須 | ~~migration / CF / Hosting / Flutter~~ すべて完了 |
| 本番前確認 | 2026-07-09 実施（自動テスト + 実機確認済み） |
| 本番デプロイ | 2026-07-09 `firebase deploy --only functions,hosting` + Hosting 追加デプロイ |

---

## 25. 管理者UI 退職手続き導線変更（2026-07-09 追記）

| 項目 | 内容 |
|------|------|
| 目的 | 誤操作防止のため、スタッフ詳細から直接 `retireStaff` を呼ばず専用ページ方式へ変更 |
| UI文言 | ユーザー向け表示を「退職処理」から「退職手続き」へ統一 |
| 新規 | `lib/Home/staffRetirementPage.dart` |
| 変更 | `lib/Home/staffDetailPage.dart`（確認ダイアログ → 専用ページ遷移のみ） |
| スコープ外 | `retireStaff` Callable 仕様・Cloud Functions ロジック・status 仕様の変更 |

---

## 26. UI追加修正（2026-07-09 本番確認フィードバック）

| 項目 | 内容 |
|------|------|
| 退職手続き専用ページ | 「退職手続きを実行する」押下 → 最終確認ダイアログ → ダイアログ内実行で `retireStaff` |
| LIFF 再登録 | 合意チェックの説明追加、押下時バリデーションで不備表示、`fullNameKana` スペースなしは再入力促し |
| 履歴・給与 UI | `StaffRetiredUi` で退職済み Chip 表示（給与計算候補/結果、勤怠一覧・詳細 等） |
| スコープ外 | Callable 仕様変更、店舗承認フロー、retired 除外、fullNameKana 一括 migration |

---

## 27. タスククローズ（2026-07-09）

| 項目 | 内容 |
|------|------|
| ステータス | **完了** |
| 本番確認 | Flutter 店舗端末・LIFF 再登録・管理者退職手続き 実機確認済み |
| 追加修正 | LIFF 説明簡潔化、`fullNameKana` スペースなし結合、実行ボタン disabled 復帰 |
| 後続（スコープ外） | `createStaffByApp` 再登録、シフト履歴画面バッジ、退職者 PII 保持期間 |
| 実施結果 | [実施結果.md](./実施結果.md) |
