# リモートにのみ存在する Cloud Functions 一覧

**作成日**: 2026年2月13日

Firebase デプロイ時に「The following functions are found in your project but do not exist in your local source code」と表示される25関数について、対応する .ts ファイルの所在と、アプリ・LiFF・LINEミニアプリからの呼び出し状況を整理したものです。

---

## 背景

- **リモート**: 過去のデプロイで Firebase に存在している関数
- **ローカル**: 現行の `functions/src/index.ts` からエクスポートされデプロイ対象になっているか、または該当する .ts ソースが存在するか

今回の25関数は次のいずれかに該当します。
1. ローカルに .ts ソースが存在しない（過去に削除された等）
2. .ts ソースは存在するが `index.ts` からエクスポートされておらず、デプロイ対象外

---

## 一覧

### 1. approveShift (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | `functions/src/staff/approveShift.ts` |
| **ローカル状況** | ソースファイルなし（スタッフモジュールから削除済みと推測） |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 2. autoCleanupRejectedShifts (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | `functions/src/staff/autoCleanupRejectedShifts.ts` |
| **ローカル状況** | ソースファイルなし |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 3. calculateInsufficientDays (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/calculateInsufficientDays.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/shiftHomePage.dart`（人員不足日の算出） |

---

### 4. createRecruitments (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/createRecruitments.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/shiftHomePage.dart`（募集の作成） |

---

### 5. createShift (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | `functions/src/staff/createShift.ts` |
| **ローカル状況** | ソースファイルなし |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 6. createShiftRequest (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | `functions/src/staff/createShiftRequest.ts` または `functions/src/shift/createShiftRequest.ts` |
| **ローカル状況** | staff/shift いずれにも該当する .ts なし（lib に古い .js が残存する可能性あり） |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 7. createStaffShiftRequest (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | 不明（該当するソースなし） |
| **ローカル状況** | ソースファイルなし |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 8. declineShiftRequest (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | `functions/src/staff/declineShiftRequest.ts` |
| **ローカル状況** | ソースファイルなし |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 9. finalizeDay (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/finalizeDay.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/shiftHomePage.dart`（日の確定） |

---

### 10. finalizeMonth (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/finalizeMonth.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/shiftHomePage.dart`（月の確定） |

---

### 11. generateBusinessHoursForMonthFromStyles (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/generateBusinessHoursForMonthFromStyles.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart`（スタイルから月の営業時間を生成） |

---

### 12. generateBusinessHoursForYearFromStyles (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/generateBusinessHoursForYearFromStyles.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 13. getAllShifts (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | `functions/src/staff/getAllShifts.ts` |
| **ローカル状況** | ソースファイルなし |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 14. getScheduledTournaments (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/TBD/getScheduledTournaments.ts` |
| **ローカル状況** | ソースあり。TBD モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | なし |
| **呼び出し元** | —（`getScheduledTournamentsForEdit`・`getTodayTournaments`・`getUpcomingTournaments` は別実装で利用中） |

---

### 15. getShiftRequests (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | `functions/src/staff/getShiftRequests.ts` |
| **ローカル状況** | ソースファイルなし |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 16. initBusinessHoursForMonth (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/initBusinessHoursForMonth.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/businessDayEditPage.dart`（月の営業時間初期化） |

---

### 17. initShiftDaysForMonth (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/initShiftDaysForMonth.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/businessDayEditPage.dart`（月のシフト日初期化） |

---

### 18. interimConfirmRequests (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/interimConfirmRequests.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/shiftDraftPage.dart`（仮確定） |

---

### 19. rejectShift (us-central1)

| 項目 | 内容 |
|------|------|
| **想定 .ts パス** | `functions/src/staff/rejectShift.ts` |
| **ローカル状況** | ソースファイルなし |
| **呼び出し** | なし |
| **呼び出し元** | — |

---

### 20. scheduleGenerateNextYearBusinessHours (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/scheduleGenerateNextYearBusinessHours.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | なし（Cloud Scheduler などのトリガー専用の想定） |
| **呼び出し元** | — |

---

### 21. sendRecruitmentNotification (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/sendRecruitmentNotification.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/shiftHomePage.dart`（募集通知送信） |

---

### 22. setBusinessHoursManualForDay (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/setBusinessHoursManualForDay.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart`（特定日の営業時間を手動設定） |

---

### 23. setSufficientOverride (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/setSufficientOverride.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/shiftDateDialog.dart`（人員十分のオーバーライド） |

---

### 24. updateDayAssignments (us-central1)

| 項目 | 内容 |
|------|------|
| **.ts パス** | `functions/src/shift/updateDayAssignments.ts` |
| **ローカル状況** | ソースあり。shift モジュール未エクスポートのためデプロイ対象外 |
| **呼び出し** | あり |
| **呼び出し元** | `lib/StaffDate/shift_repository.dart` → `lib/StaffDate/shiftDateDialog.dart`（日の割り当て更新） |

---

## まとめ

### 呼び出しあり（12関数）※削除するとアプリ不具合の可能性あり

| 関数名 | .ts パス | 主な呼び出し元 |
|--------|----------|----------------|
| calculateInsufficientDays | shift/calculateInsufficientDays.ts | shift_repository → shiftHomePage |
| createRecruitments | shift/createRecruitments.ts | shift_repository → shiftHomePage |
| finalizeDay | shift/finalizeDay.ts | shift_repository → shiftHomePage |
| finalizeMonth | shift/finalizeMonth.ts | shift_repository → shiftHomePage |
| generateBusinessHoursForMonthFromStyles | shift/generateBusinessHoursForMonthFromStyles.ts | shift_repository |
| initBusinessHoursForMonth | shift/initBusinessHoursForMonth.ts | shift_repository → businessDayEditPage |
| initShiftDaysForMonth | shift/initShiftDaysForMonth.ts | shift_repository → businessDayEditPage |
| interimConfirmRequests | shift/interimConfirmRequests.ts | shift_repository → shiftDraftPage |
| sendRecruitmentNotification | shift/sendRecruitmentNotification.ts | shift_repository → shiftHomePage |
| setBusinessHoursManualForDay | shift/setBusinessHoursManualForDay.ts | shift_repository |
| setSufficientOverride | shift/setSufficientOverride.ts | shift_repository → shiftDateDialog |
| updateDayAssignments | shift/updateDayAssignments.ts | shift_repository → shiftDateDialog |

### 呼び出しなし（13関数）※削除候補

| 関数名 | .ts パス | 備考 |
|--------|----------|------|
| approveShift | staff/approveShift.ts（なし） | ソース削除済み |
| autoCleanupRejectedShifts | staff/autoCleanupRejectedShifts.ts（なし） | ソース削除済み |
| createShift | staff/createShift.ts（なし） | ソース削除済み |
| createShiftRequest | staff or shift（なし） | ソース削除済み |
| createStaffShiftRequest | 不明（なし） | ソース削除済み |
| declineShiftRequest | staff/declineShiftRequest.ts（なし） | ソース削除済み |
| generateBusinessHoursForYearFromStyles | shift/generateBusinessHoursForYearFromStyles.ts | 実装のみ、呼び出しなし |
| getAllShifts | staff/getAllShifts.ts（なし） | ソース削除済み |
| getScheduledTournaments | TBD/getScheduledTournaments.ts | 別関数で代替済み |
| getShiftRequests | staff/getShiftRequests.ts（なし） | ソース削除済み |
| rejectShift | staff/rejectShift.ts（なし） | ソース削除済み |
| scheduleGenerateNextYearBusinessHours | shift/scheduleGenerateNextYearBusinessHours.ts | スケジューラ用、直接呼び出しなし |

### LiFF・LINEミニアプリ

- `public/user/index.html`（ユーザー用）: 上記25関数のいずれも使用していません。
- `public/staff/index.html`（スタッフ用）: `getShifts`・`updateShiftRequest`・`createMultipleShifts`・`confirmShiftRequest` を使用していますが、これらは今回の25関数には含まれません。

---

※ 動線がない Dart ファイル候補一覧は `動線がないDartファイル候補一覧_20260213.md` を参照してください。
