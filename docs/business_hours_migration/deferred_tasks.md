# 保留中の後回しにしている作業

本ドキュメントは、営業時間設定のFirestore移行改修において、検討中または保留中の作業をまとめたものです。

**重要**: このファイルに記載されている作業の実装は、ユーザーから明確に指示された時にのみ行ってください。

---

## 1. `attendances`コレクションへの`businessDate`追加

### 保留理由

attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため。

### 対象ファイル

- `functions/src/attendance/createClockInRecord.ts`
- `functions/src/attendance/createManualClockInRecord.ts`
- `functions/src/attendance/updateClockOutRecord.ts`（該当する場合）

### 想定される修正内容

- `clockIn`から`calcBusinessDate`を使用して`businessDate`を計算
- `date`フィールドを`businessDate`に変更
- `AMBIGUOUS`/`NONE`時のエラーハンドリングを実装

### 関連ドキュメント

- [Step1: コレクション分析](./step1_collection_analysis.md) - `attendances`コレクションの分析
- [Step2: 取得・表示ファイルの洗い出し](./step2_query_display_files.md) - `attendances`関連の取得・表示ファイル
- [Step4: 改修実装チェックリスト](./step4_migration_plan_checklist.md) - 実装時のチェック項目

---

## 2. `attendanceCorrectionRequests`コレクションへの`businessDate`追加

### 保留理由

attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため。

### 対象ファイル

- `functions/src/attendance/createAttendanceCorrectionRequest.ts`
- `lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart`（表示時のフィールド名変更）

### 想定される修正内容

- 修正対象の出勤記録の`clockIn`から`calcBusinessDate`を使用して`businessDate`を計算
- `date`フィールドを`businessDate`に変更
- `AMBIGUOUS`/`NONE`時のエラーハンドリングを実装
- UI表示時のフィールド名を`date`から`businessDate`に変更

### 関連ドキュメント

- [Step1: コレクション分析](./step1_collection_analysis.md) - `attendanceCorrectionRequests`コレクションの分析
- [Step2: 取得・表示ファイルの洗い出し](./step2_query_display_files.md) - `attendanceCorrectionRequests`関連の取得・表示ファイル
- [Step4: 改修実装チェックリスト](./step4_migration_plan_checklist.md) - 実装時のチェック項目

---

## 実装時の注意事項

### 共通事項

1. **検討状況の確認**: 実装前に、attendanceのあるべき姿についての検討が完了していることを確認してください
2. **`calcBusinessDate`の使用**: `calcBusinessDate`を使用して営業日を計算します
3. **`AMBIGUOUS`/`NONE`時の処理**: 
   - `AMBIGUOUS`の場合は、UIでどちらの営業日に属するデータなのかを選択させる必要があります
   - `NONE`の場合はエラーをthrowします
4. **既存データのマイグレーション**: 既存の`date`フィールドを`businessDate`に移行する必要がある場合があります（別工程）

### 実装順序（想定）

1. `functions/src/attendance/createClockInRecord.ts`の修正
2. `functions/src/attendance/createManualClockInRecord.ts`の修正
3. `functions/src/attendance/updateClockOutRecord.ts`の修正（該当する場合）
4. `functions/src/attendance/createAttendanceCorrectionRequest.ts`の修正
5. `lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart`の修正
6. テスト実装

---

## 更新履歴

- 2025-01-27: 初版作成（Phase2のchangeSpec作成時に追加）
