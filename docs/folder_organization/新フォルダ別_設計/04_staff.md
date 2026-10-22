# 新フォルダ別設計：staff

## 5.1 ドメイン定義（短く）

スタッフアカウント・シフト希望を担当するドメイン。シフト一覧取得・複数シフト作成・シフト希望の更新・確認（承認/却下）・スタッフアカウント作成、および却下シフトの自動削除（scheduler）を含む。

**主に扱うデータ/コレクション**
- staffs, shiftRequests, shifts（読・書。shift ドメインのデータ）。shift/helpers を参照

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | シフト一覧・複数シフト作成・シフト希望更新・確認・スタッフアカウント作成の onCall 入口。callables 配下の updateStaffHourlyWage, updateStaffBankInfo も移行 |
| scheduler/ | 却下シフトの自動削除（scheduledCleanup） |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| staff/index.ts | domains/staff の再構成 | — |  |
| staff/getShifts.ts | domains/staff/callables/getShifts.ts | callable | shift/helpers → domains/shift/services 参照に変更 |
| staff/createMultipleShifts.ts | domains/staff/callables/createMultipleShifts.ts | callable | 同上 |
| staff/updateShiftRequest.ts | domains/staff/callables/updateShiftRequest.ts | callable | 同上 |
| staff/confirmShiftRequest.ts | domains/staff/callables/confirmShiftRequest.ts | callable |  |
| staff/createStaffAccount.ts | domains/staff/callables/createStaffAccount.ts | callable |  |
| staff/scheduledCleanup.ts | domains/staff/scheduler/scheduledCleanup.ts | scheduler |  |
| callables/updateStaffHourlyWage.ts | domains/staff/callables/updateStaffHourlyWage.ts | callable |  |
| callables/updateStaffBankInfo.ts | domains/staff/callables/updateStaffBankInfo.ts | callable |  |

---

## 5.4 index.ts 変更方針

- **ルート index**：`export * from "./staff"` を `export * from "./domains/staff"` に変更。関数名は維持。
- **domains/staff/index.ts**：callables 7 本と scheduler 1 本を re-export。
- **shift/helpers** への import パスを **domains/shift/services** に更新する（08 確定）。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。staff から shift の services を参照できること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **設計**：staff ドメイン設計で、shift/helpers への import パスを shift の移行先（domains/shift/services 等）に合わせて更新する。
- **changeSpec**：staff 移管時に、ルート index の **import パス** を `domains/staff` に更新する。shift/helpers を参照している 3 ファイルの import パスを shift の移行先に合わせて更新する。export 名は変更しない。
- **05_入口一覧**：移行先確定後、staff 配下の 8 入口の配置を「staff/callables」「staff/scheduler」に更新する。
