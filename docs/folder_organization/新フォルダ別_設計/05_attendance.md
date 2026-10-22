# 新フォルダ別設計：attendance

## 5.1 ドメイン定義（短く）

勤怠・打刻・修正・給与を担当するドメイン。出退勤の打刻（打刻モード判定・出勤・退勤・手動打刻）、勤怠一覧取得、勤怠修正依頼の作成・承認・却下、および月次給与計算の scheduler を含む。

**主に扱うデータ/コレクション**
- attendances, attendanceCorrectionRequests, monthlyPayroll
- staffs（読）, shifts（読）。config/ops 参照（店舗締め時間）。lib/devicePermissions 参照

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | 打刻モード判定・出退勤打刻・手動打刻・勤怠一覧・修正依頼の作成・一覧・承認・却下の onCall 入口。getPayrollData も callables から移行 |
| scheduler/ | 月次給与計算（monthlyPayrollTrigger） |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| attendance/index.ts | domains/attendance の再構成 | — |  |
| attendance/determineAttendanceMode.ts | domains/attendance/callables/determineAttendanceMode.ts | callable | config/ops → shared/time 等に変更 |
| attendance/createClockInRecord.ts | domains/attendance/callables/createClockInRecord.ts | callable |  |
| attendance/updateClockOutRecord.ts | domains/attendance/callables/updateClockOutRecord.ts | callable |  |
| attendance/getStaffListForAttendance.ts | domains/attendance/callables/getStaffListForAttendance.ts | callable |  |
| attendance/createManualClockInRecord.ts | domains/attendance/callables/createManualClockInRecord.ts | callable |  |
| attendance/updateManualClockOutRecord.ts | domains/attendance/callables/updateManualClockOutRecord.ts | callable |  |
| attendance/getAllStaffAttendance.ts | domains/attendance/callables/getAllStaffAttendance.ts | callable |  |
| attendance/getStaffAttendance.ts | domains/attendance/callables/getStaffAttendance.ts | callable |  |
| attendance/createAttendanceCorrectionRequest.ts | domains/attendance/callables/createAttendanceCorrectionRequest.ts | callable |  |
| attendance/checkExistingCorrectionRequest.ts | domains/attendance/callables/checkExistingCorrectionRequest.ts | callable |  |
| attendance/getAttendanceCorrectionRequests.ts | domains/attendance/callables/getAttendanceCorrectionRequests.ts | callable |  |
| attendance/approveAttendanceCorrectionRequest.ts | domains/attendance/callables/approveAttendanceCorrectionRequest.ts | callable |  |
| attendance/rejectAttendanceCorrectionRequest.ts | domains/attendance/callables/rejectAttendanceCorrectionRequest.ts | callable |  |
| attendance/monthlyPayrollTrigger.ts | domains/attendance/scheduler/monthlyPayrollTrigger.ts | scheduler |  |
| callables/getPayrollData.ts | domains/attendance/callables/getPayrollData.ts | callable |  |

---

## 5.4 index.ts 変更方針

- **ルート index**：`export * from "./attendance"` を `export * from "./domains/attendance"` に変更。関数名は維持。
- **domains/attendance/index.ts**：callables 14 本と scheduler 1 本を re-export。
- **config/ops** は shared/time へ、**lib/devicePermissions** は shared/devices へ移行（08 確定）。移行後パスのみ変更する。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **設計**：attendance ドメイン設計で、config/ops を shared/time、lib/devicePermissions を shared/devices から参照するよう import パスを更新する（08 確定）。
- **changeSpec**：attendance 移管時に、ファイル移動と index の export パス付け替えを記載する。他ドメインからの import は存在しない。
- **05_入口一覧**：移行実施後、各入口の「現在パス」を新パスに更新する。05 には attendance 関連の callables と monthlyPayrollTrigger が「attendance / callables」「attendance / scheduler」として記載済み。
