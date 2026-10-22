# Phase4.1: 実装ワークフロー

**参照**: [Flow1_DETAILED_SPEC.md](./Flow1_DETAILED_SPEC.md)（正本） / [TOBE_SPEC_DRAFT.md](./TOBE_SPEC_DRAFT.md)（旧・参照用）

---

## 0. 仕様変更の明記

| 項目 | 決定 | 理由 |
|------|------|------|
| **workingStatus** | **実装しない** | クエリのためにあるべきフィールドだが、このステータスを用いたクエリを行う機会が多くなく、SSOT を崩すデメリットの方が大きいという判断 |

**影響**: closeStoreTerminal での `workingStatus: 'closed_without_clock_out'` 付与は行わない。workingStatus 用の Firestore インデックスは不要。事前準備フローにおける workingStatus 関連の確認作業は省略する。

---

## 1. 全体フロー

```
┌─────────────────────────────────────────────────────────────────┐
│ 0. 事前準備                                                      │
│    影響範囲確認 → 既存データ移行方針の決定                       　   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 1. 細かい仕様の決定                                              　│
│    breaks / attendanceLogs / config / Callable I/O の詳細定義   　│
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. 実装段階の計画                                                 │
│    段階分割・依存関係・完了条件の定義                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. 段階ごとのループ（4.1-A 〜 4.1-F）                             　│
│    changeSpec → 実装 → テスト → レビュー → 実機確認 → マージ       　 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 各フローで行うこと・成果物・完了条件

### 0. 事前準備

| 項目 | 内容 |
|------|------|
| **行うこと** | nightMinutes 参照箇所の洗い出し、createClockInRecord / updateClockOutRecord 呼び出し元の洗い出し、totalMinutes 実労働時間前提箇所の洗い出し、**breaks 関連（親 attendances への新フィールド追加）の影響範囲調査**、attendances 読み取り箇所・型定義箇所の洗い出し、attendances 親の新フィールド用 Firestore インデックス要否の検討、既存 attendances の移行方針検討（**workingStatus は実装しない**ため、関連作業は不要） |
| **成果物** | Flow0_IMPACT_ANALYSIS.md |
| **完了条件** | 影響範囲一覧が確定し、削除・変更時の対応方針が決まっている |
| **確認ポイント** | 給与計算・一覧表示・修正申請など、nightMinutes に依存している箇所を漏れなく把握している。breaks 関連フィールド追加時の互換性（null 安全・型定義）を確認している |

### 1. 細かい仕様の決定

| 項目 | 内容 |
|------|------|
| **行うこと** | breaks ドキュメント構造、attendanceLogs スキーマ、config 夜間労働時間フィールド、新規 Callable の I/O、既存データへの新フィールド付与方針 |
| **成果物** | Flow1_DETAILED_SPEC.md |
| **完了条件** | 実装時に判断に迷う点が残っていない |
| **確認ポイント** | 論理削除フラグ名、インデックス要件、デフォルト値が定義されている |

### 2. 実装段階の計画

| 項目 | 内容 |
|------|------|
| **行うこと** | 段階の分割、各段階のスコープ・依存関係・完了条件・実機確認要否の定義 |
| **成果物** | Flow2_IMPLEMENTATION_PHASES.md |
| **完了条件** | 全段階の順序とスコープが確定している |
| **確認ポイント** | 段階間の依存関係が正しく、並列化できない箇所が明確である |

### 3. 段階ごとのループ

| 項目 | 内容 |
|------|------|
| **行うこと** | changeSpec 作成 → 実装 → 単体テスト作成・実行 → コードレビュー → 実機確認（重要段階） → マージ・デプロイ |
| **成果物** | 各段階の docs/phase_X/CHANGESPEC.md、実装コード、テストコード |
| **完了条件** | changeSpec の全項目が実装され、テストが通っている |
| **確認ポイント** | 前段階との整合性、ロールバック手順の有無 |

---

## 3. 各フローの具体的な進め方

### 3.0 事前準備の進め方

| ステップ | 作業内容 | 記録先 |
|----------|----------|--------|
| 1 | `nightMinutes` を grep で全参照箇所を洗い出す | Flow0_IMPACT_ANALYSIS.md の「nightMinutes 参照箇所」セクション |
| 2 | `createClockInRecord` を grep で呼び出し元を洗い出す | Flow0_IMPACT_ANALYSIS.md の「createClockInRecord 呼び出し元」セクション |
| 3 | `updateClockOutRecord` を grep で呼び出し元を洗い出す | Flow0_IMPACT_ANALYSIS.md の「updateClockOutRecord 呼び出し元」セクション |
| 4 | `totalMinutes` が実労働時間として扱われている箇所を洗い出す | Flow0_IMPACT_ANALYSIS.md の「totalMinutes 実労働時間前提箇所」セクション |
| 5 | **breaks 関連の影響範囲**: attendances を読み取っている箇所を洗い出し、新フィールド（breakMinutes, isOnBreak 等）追加時の null 安全・互換性を確認する | Flow0_IMPACT_ANALYSIS.md の「attendances 読み取り箇所（breaks 関連影響）」セクション |
| 6 | **attendances の型定義箇所**（TypeScript の interface、Dart の class）を洗い出し、新フィールド追加時の型更新が必要な箇所を特定する | Flow0_IMPACT_ANALYSIS.md の「attendances 型定義箇所」セクション |
| 7 | **attendances 親の新フィールド用 Firestore インデックス**の要否を検討する（**workingStatus は実装しない**ため、そのインデックスは不要） | Flow0_IMPACT_ANALYSIS.md の「Firestore インデックス検討」セクション |
| 8 | 既存 attendances への新フィールド付与方針を決定（一括スクリプト / 遅延付与 / 新規のみ） | Flow0_IMPACT_ANALYSIS.md の「既存データ移行方針」セクション |
| 9 | 削除・変更時の対応方針を決定（各参照箇所ごと） | Flow0_IMPACT_ANALYSIS.md の「対応方針」セクション |

**必須**: 各ステップで **AS-IS の実コードを直接確認** すること。grep 結果だけでなく、該当ファイルを開いて文脈を把握する。

**検討**: 本フロー実施時に、**セクション 9.1** の検討項目を漏れなく確認すること。

---

### 3.1 細かい仕様の決定の進め方

| ステップ | 決定事項 | 記録先 |
|----------|----------|--------|
| 1 | breaks サブコレのドキュメント構造（フィールド一覧、型、必須/任意） | Flow1_DETAILED_SPEC.md の「breaks スキーマ」セクション |
| 2 | breaks の論理削除フラグ名（例: `isDeleted`）とデフォルト値 | 同上 |
| 3 | breaks の Firestore インデックス要件（orderBy, where の組み合わせ） | 同上 |
| 4 | attendanceLogs のフィールド一覧、クエリパターン | Flow1_DETAILED_SPEC.md の「attendanceLogs スキーマ」セクション |
| 5 | storeMeta/config の夜間労働時間フィールド名（例: `nightWorkStartHour`, `nightWorkEndHour`）、デフォルト値（例: 22, 5） | Flow1_DETAILED_SPEC.md の「config 夜間労働時間」セクション |
| 6 | startBreak / endBreak の I/O 仕様（引数、戻り値、エラーコード） | Flow1_DETAILED_SPEC.md の「新規 Callable I/O」セクション |
| 7 | 管理者用 attendance 作成/編集 Callable の I/O 仕様 | 同上 |
| 8 | 既存 attendances への新フィールド付与方針（Flow0_IMPACT_ANALYSIS で未決定ならここで確定） | Flow1_DETAILED_SPEC.md の「既存データ移行」セクション |

**参照すべきファイル**:
- Flow1_DETAILED_SPEC.md（決定事項・正本）
- 現行の clockIn.ts, clockOut.ts（I/O の雛形）
- 現行の storeMeta/config 読み取りロジック（configLoader, defaults.ts）
- 現行の approveAttendanceCorrectionRequest.ts（修正申請の既存 I/O）

---

### 3.2 実装段階の計画の進め方

| ステップ | 作業内容 | 記録先 |
|----------|----------|--------|
| 1 | 段階を 4.1-A 〜 4.1-F（4.1-E2 含む）に分割し、各段階のスコープを定義 | Flow2_IMPLEMENTATION_PHASES.md の「段階一覧」セクション |
| 2 | 各段階の依存関係を図または表で整理 | Flow2_IMPLEMENTATION_PHASES.md の「依存関係」セクション |
| 3 | 各段階の完了条件を定義 | Flow2_IMPLEMENTATION_PHASES.md の「完了条件」セクション |
| 4 | 各段階で実機確認を行うかどうかを決定 | Flow2_IMPLEMENTATION_PHASES.md の「実機確認」セクション |
| 5 | 各段階の changeSpec 作成時に参照するファイル一覧を事前に定義。本 WORKFLOW の **セクション 5** を Flow2_IMPLEMENTATION_PHASES.md の「段階別参照ファイル」に移すか、または「WORKFLOW.md セクション 5 を参照」と記載する | Flow2_IMPLEMENTATION_PHASES.md の「段階別参照ファイル」セクション |

**参照すべきファイル**:
- Flow1_DETAILED_SPEC.md（変更一覧の確認）
- Flow1_DETAILED_SPEC.md（段階分割の粒度の判断）
- Flow0_IMPACT_ANALYSIS.md（削除対象の影響範囲）

**検討**: 本フロー実施時に、**セクション 9.2** の検討項目を漏れなく確認すること。

---

### 3.3 段階ごとのループの進め方

#### 3.3.1 changeSpec 作成のタイミングと手順

**タイミング**: 各段階の実装を開始する **直前** に、その段階の changeSpec を作成する。

**手順**:

| ステップ | 作業内容 |
|----------|----------|
| 1 | Flow2_IMPLEMENTATION_PHASES.md の「段階別参照ファイル」を確認し、該当段階の参照ファイル一覧を把握する |
| 2 | **AS-IS の実コード確認（必須）**: 参照ファイルをすべて開き、現状の実装を把握する |
| 3 | Flow1_DETAILED_SPEC.md の該当セクションを確認する |
| 4 | `docs/config_migration/phase4_1/docs/stepX/` の該当 step の stepX_changeSpec.md をコピーし、`docs/phase_X/CHANGESPEC.md` として編集する（stepA→phase_A, stepB→phase_B, … stepE2→phase_E2, stepF→phase_F。phase4/01_determineAttendanceMode/CHANGESPEC.md も構成の参考として参照可） |
| 5 | changeSpec を記載: 対象ファイル一覧、変更前・変更後の仕様、実装順序、検証ポイント、ロールバック手順（必要なら） |
| 6 | changeSpec のレビュー（自己確認または他者確認） |

**changeSpec 作成時に参照するファイル一覧**（段階別）は **セクション 5** に定義する。changeSpec 作成前に必ず確認すること。

---

#### 3.3.2 実装の進め方

| ステップ | 作業内容 |
|----------|----------|
| 1 | changeSpec の「実装順序」に従い、タスクを順に実施 |
| 2 | 各タスク完了ごとに changeSpec のチェックリストを更新 |
| 3 | 段階のスコープを超える変更は行わない（必要なら次の段階に回す） |

---

#### 3.3.3 テストの進め方

| ステップ | 作業内容 |
|----------|----------|
| 1 | changeSpec の「検証ポイント」に基づき、単体テストの観点を洗い出す |
| 2 | Functions: Jest でテスト作成・実行 |
| 3 | Flutter: `flutter test` でテスト作成・実行 |
| 4 | 全テストがパスすることを確認 |

---

#### 3.3.4 実機確認の進め方

| ステップ | 作業内容 |
|----------|----------|
| 1 | Flow2_IMPLEMENTATION_PHASES.md で実機確認対象段階か確認 |
| 2 | 対象の場合、changeSpec の「実機確認観点」に従い、手順を実施 |
| 3 | 結果をメモ（成功/失敗、事象） |

#### 3.3.5 コードレビューの進め方

| ステップ | 作業内容 |
|----------|----------|
| 1 | 実装完了後、changeSpec との整合性を確認する |
| 2 | PR ベースで実施する場合、レビュアーは changeSpec を参照して確認する |
| 3 | 指摘事項を解消してからマージする |

#### 3.3.6 マージ・デプロイの進め方

| ステップ | 作業内容 |
|----------|----------|
| 1 | 段階単位で main にマージする |
| 2 | Functions をデプロイする（`firebase deploy --only functions` 等） |
| 3 | ロールバック手順が changeSpec に記載されている場合、問題発生時に参照する |

**検討**: 本フロー実施時に、**セクション 9.3** の検討項目を漏れなく確認すること。

---

## 4. どのタイミングで何を決め、どのファイルに残すか

| タイミング | 決定事項 | 記録先 |
|------------|----------|--------|
| **0. 事前準備 開始前** | 影響範囲確認の進め方（grep 対象、確認観点） | 本 WORKFLOW.md（本セクション） |
| **0. 事前準備 中** | nightMinutes 参照箇所一覧 | Flow0_IMPACT_ANALYSIS.md |
| **0. 事前準備 中** | createClockInRecord / updateClockOutRecord 呼び出し元一覧 | Flow0_IMPACT_ANALYSIS.md |
| **0. 事前準備 中** | totalMinutes 実労働時間前提箇所一覧 | Flow0_IMPACT_ANALYSIS.md |
| **0. 事前準備 中** | attendances 読み取り箇所、型定義箇所、Firestore インデックス検討（workingStatus は実装しない） | Flow0_IMPACT_ANALYSIS.md |
| **0. 事前準備 完了時** | 既存データ移行方針、各参照箇所の対応方針 | Flow0_IMPACT_ANALYSIS.md（**既存データ移行方針の正本**。事前準備で未決定なら 1. 細かい仕様の決定で確定し、Flow1_DETAILED_SPEC.md の「既存データ移行」に記載するか、Flow0_IMPACT_ANALYSIS に追記する） |
| **1. 細かい仕様 中** | breaks スキーマ、論理削除フラグ、インデックス | Flow1_DETAILED_SPEC.md |
| **1. 細かい仕様 中** | attendanceLogs スキーマ、クエリパターン | Flow1_DETAILED_SPEC.md |
| **1. 細かい仕様 中** | config 夜間労働時間フィールド、デフォルト値 | Flow1_DETAILED_SPEC.md |
| **1. 細かい仕様 中** | 新規 Callable の I/O 仕様 | Flow1_DETAILED_SPEC.md |
| **2. 段階計画 中** | 段階のスコープ、依存関係、完了条件 | Flow2_IMPLEMENTATION_PHASES.md |
| **2. 段階計画 中** | 各段階の changeSpec 参照ファイル一覧 | Flow2_IMPLEMENTATION_PHASES.md の「段階別参照ファイル」セクション（本 WORKFLOW のセクション 5 を移すか、参照する旨を記載） |
| **3. 各段階 実装前** | 対象範囲、変更前後仕様、実装順序、検証ポイント | docs/phase_X/CHANGESPEC.md |
| **3. 各段階 実装後** | コードレビュー結果（指摘・対応内容） | PR コメント、または docs/phase_X/ 内にメモ |
| **3. 各段階 実装後** | 実機確認結果（実施した場合） | docs/phase_X/ 内の VERIFICATION.md または CHANGESPEC 末尾 |
| **3. 各段階 実装後** | マージ・デプロイ結果 | 任意（問題発生時はロールバック手順を参照） |

---

## 5. changeSpec 作成時の参照ファイル一覧（段階別）

**正本**: 段階別参照ファイルの正本は **Flow2_IMPLEMENTATION_PHASES.md セクション 7**。本セクションはそれを反映している。

**前提**: AS-IS の実コード確認は **絶対** として、各段階で changeSpec を作成する前に、以下に挙げる参照ファイルをすべて確認すること。

### 5.1 全段階で共通して参照するファイル

| ファイル | 用途 |
|----------|------|
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | 決定事項・変更必要箇所の確認（正本） |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | 細かい仕様の確認（作成済みの場合） |
| `docs/config_migration/phase4/01_determineAttendanceMode/CHANGESPEC.md` | changeSpec のテンプレート・構成の参考 |

### 5.2 段階別 参照ファイル

#### 4.1-A: config 夜間労働時間追加、旧 Callable unused 移管

| ファイル | 用途 |
|----------|------|
| `functions/src/shared/config/configLoader.ts` | config 読み取りの現状 |
| `functions/src/shared/config/defaults.ts` | デフォルト値の定義場所 |
| `functions/src/shared/config/configLoader.ts` が読む storeMeta/config の構造 | 既存フィールドの確認 |
| `functions/src/domains/attendance/callables/createClockInRecord.ts` | 削除対象の現状 |
| `functions/src/domains/attendance/callables/updateClockOutRecord.ts` | 削除対象の現状 |
| `lib/AttendanceManagement/attendanceService.dart` | createClockInRecord, updateClockOutRecord の呼び出し元 |
| `docs/config_migration/phase4_1/Flow0_IMPACT_ANALYSIS.md` | 呼び出し元一覧・対応方針 |

#### 4.1-B: attendances 親フィールド追加、nightWorkMinutes 算出

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/clockIn.ts` | 作成時の初期値 |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 同上 |
| `functions/src/domains/attendance/callables/clockOut.ts` | totalMinutes, nightMinutes 計算ロジックの現状 |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 同上 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | 同上 |
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | 同上 |
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` | totalMinutes, nightMinutes の計算・表示 |
| `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | getAllStaffAttendance 呼び出し、勤怠データ表示 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | config 夜間労働時間の仕様 |
| `docs/config_migration/phase4_1/Flow0_IMPACT_ANALYSIS.md` | nightMinutes 参照箇所、attendances 読み取り箇所 |

#### 4.1-C: breaks サブコレ、startBreak / endBreak

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/clockIn.ts` | 休憩系初期値の追加箇所 |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 同上 |
| `functions/src/domains/attendance/callables/clockOut.ts` | 退勤時の休憩自動終了の挿入箇所 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | breaks スキーマ、startBreak/endBreak I/O |
| Firestore の attendances コレクション構造 | サブコレ追加の前提確認 |

#### 4.1-D: 退勤系 Callable の休憩対応

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/clockOut.ts` | 休憩中退勤時の自動終了・再集計 |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 同上 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | 同上 |
| `lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` | 退勤処理ボタンの呼び出し |
| `lib/AttendanceManagement/qrScanPage.dart` | QR 退勤の呼び出し |
| `lib/Home/unclocked_attendance_list_page.dart` | パスワード退勤の呼び出し |
| 4.1-C で作成した 親再集計ヘルパー | 再利用 |

#### 4.1-E: 管理者フォーム Functions 化、論理削除ロジック

| ファイル | 用途 |
|----------|------|
| `lib/AttendanceManagement/admin_attendance_editAndCreate_page.dart` | 直接 Firestore 更新の現状、Functions 化対象 |
| `lib/AttendanceManagement/admin_attendance_list_page.dart` | 編集導線 |
| `functions/src/domains/attendance/callables/getStaffAttendance.ts` | 論理削除除外 |
| `functions/src/domains/attendance/callables/getAllStaffAttendance.ts` | 論理削除表示 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | 管理者用 Callable I/O、論理削除の表示・処理範囲 |

#### 4.1-E2: 修正申請・閉店処理改修

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | break 反映・親再集計の追加 |
| `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts` | 休憩中未退勤の扱い（workingStatus は実装しない） |
| `lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart` | 修正申請を提出する画面。breaks 取得の追加箇所 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | 仕様 |

#### 4.1-F: UI 改修、seedAttendancesDemo、monthlyPayrollTrigger

| ファイル | 用途 |
|----------|------|
| `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | totalMinutes/nightMinutes → actualWorkMinutes/nightWorkMinutes、payrollReflectedAt |
| `functions/src/domains/attendance/callables/seedAttendancesDemo.ts` | 新フィールド・休憩サンプル追加 |
| `lib/AttendanceManagement/staff_attendance_page_from_terminalHome.dart` | 休憩表示・休憩操作 UI |
| `lib/AttendanceManagement/admin_attendance_list_page.dart` | 休憩集計表示 |
| `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | 給与計算画面。actualWorkMinutes, nightWorkMinutes 表示の確認 |
| `lib/AttendanceManagement/staff_attendance_detail_page_from_allStaffAttendance.dart` | 勤怠詳細画面。給与タブ・勤怠表示 |
| `lib/AttendanceManagement/daily_attendance_detail_page_from_staffAttendanceDetail.dart` | 勤怠詳細（日付単位）。表示内容の確認 |
| `docs/config_migration/phase4_1/Flow1_DETAILED_SPEC.md` | attendanceLogs スキーマ |

---

## 6. changeSpec の作成ルール

### 6.1 作成前に必ず行うこと

1. **Flow2_IMPLEMENTATION_PHASES.md の「段階別参照ファイル」** を開き、該当段階の参照ファイル一覧を確認する
2. **AS-IS の実コード確認**: 一覧に挙がったファイルをすべて開き、現状の実装を把握する
3. **Flow1_DETAILED_SPEC.md** の該当セクションを確認する
4. **Flow1_DETAILED_SPEC.md** の該当セクションを確認する（作成済みの場合）

### 6.2 changeSpec に含めるべき項目

| 項目 | 内容 |
|------|------|
| 概要・目的 | その段階で達成することを 1〜3 行で |
| 対象ファイル一覧 | 変更対象のファイルを一覧化 |
| 現状（As-Is） | 各ファイルの現状を簡潔に |
| 変更後（To-Be） | 変更内容を具体的に |
| 実装順序 | タスクの実施順序（依存がある場合） |
| 検証ポイント | 単体テスト・実機確認の観点 |
| ロールバック手順 | 問題発生時の戻し方（必要なら） |

### 6.3 テンプレート参照

`docs/config_migration/phase4/01_determineAttendanceMode/CHANGESPEC.md` の構成を参考にする。

---

## 7. ドキュメント構成

**役割**: 本 Phase4.1 で作成・更新するドキュメントの配置と役割。セクション 2 の「成果物」と対応する。

```
phase4_1/
├── README.md
├── Flow1_DETAILED_SPEC.md           # To-Be 仕様書（正本・Flow1 成果物）
├── TOBE_SPEC_DRAFT.md         # 旧 To-Be 仕様書（参照用）
├── WORKFLOW.md               # 本ファイル：全体フロー・進め方・参照ファイル・検討項目
├── Flow0_IMPACT_ANALYSIS.md  # 0. 事前準備の成果物
├── Flow1_DETAILED_SPEC.md          # 1. 細かい仕様の成果物
├── Flow2_IMPLEMENTATION_PHASES.md  # 2. 段階計画の成果物（段階別参照ファイル含む）
└── docs/
    ├── stepA/ 〜 stepF/, stepE2/             # step 用 changeSpec テンプレート
    └── phase_A/ 〜 phase_F/, phase_E2/       # 3. 各段階の実装成果物（CHANGESPEC.md, VERIFICATION.md）
```

---

## 8. 実装段階の概要（案）

**役割**: セクション 2 の「3. 段階ごとのループ」の対象範囲を簡潔に示す。詳細は Flow2_IMPLEMENTATION_PHASES.md で定義する。

| 段階 | 内容 | 依存 | 確認方法 |
|------|------|------|----------|
| **4.1-A** | config 夜間労働時間追加、旧 Callable unused 移管 | なし | 任意 |
| **4.1-B** | attendances 親フィールド追加、nightWorkMinutes 算出、論理削除フィールド | 4.1-A | 任意 |
| **4.1-C** | breaks サブコレ、startBreak / endBreak | 4.1-B | **テスト + エミュレータ** |
| **4.1-D** | 退勤系 Callable の休憩対応 | 4.1-C | **テスト + エミュレータ** |
| **4.1-E** | 管理者フォーム Functions 化、論理削除ロジック | 4.1-D | **テスト + エミュレータ** |
| **4.1-E2** | 修正申請・閉店処理改修 | 4.1-E | **テスト + エミュレータ** |
| **4.1-F** | UI 改修、seedAttendancesDemo、monthlyPayrollTrigger | 4.1-E2 | **実機確認**（一括） |

※ 詳細は Flow2_IMPLEMENTATION_PHASES.md で定義する。

---

## 9. 検討が必要な項目

以下の項目は、使用の決定を行う必要はないが、**適切なフローで検討する必要がある**。各フロー実施時に漏れなく検討すること。

### 9.1 0. 事前準備で検討する項目

| 項目 | 検討内容 |
|------|----------|
| attendances 読み取り箇所の洗い出しの粒度 | 全 attendances 参照箇所を洗い出すか、新フィールド追加の影響が大きい箇所に限定するか |
| Flutter 画面のファイルパス | 修正申請画面・給与計算画面・allStaffAttendancePage 等のパスを事前に特定し、Flow0_IMPACT_ANALYSIS または本 WORKFLOW のセクション 5 に追記するか |

### 9.2 2. 実装段階の計画で検討する項目

| 項目 | 検討内容 |
|------|----------|
| 段階別参照ファイルの管理場所 | WORKFLOW セクション 5 のみか、Flow2_IMPLEMENTATION_PHASES に複製するか、Flow2_IMPLEMENTATION_PHASES から WORKFLOW を参照する形にするか |
| ロールバック手順の定義タイミング | 事前準備で方針を決めるか、各段階の changeSpec で決めるか |

### 9.3 3. 段階ごとのループで検討する項目

| 項目 | 検討内容 |
|------|----------|
| コードレビューの必須化 | 全段階で必須とするか、重要段階のみとするか |

---

## 10. 確認・判断が必要な項目

**Flow0 セクション 0.2 で回答済み**。詳細は [Flow0_IMPACT_ANALYSIS.md](./Flow0_IMPACT_ANALYSIS.md) の「0.2 確認・判断が必要な項目の回答まとめ」を参照。

| # | 項目 | 回答 |
|---|------|------|
| 1 | createClockInRecord / updateClockOutRecord の扱い | unused に移管（index.ts 等からの削除、Dart からの削除、本体は unused フォルダに移管しコードは全てコメントアウト） |
| 2 | 既存 attendances の移行方針 | **新規のみ** |
| 3 | attendances 読み取り箇所の洗い出し粒度 | **全件の洗い出しを行う** |
| 4 | 既存データの nightMinutes → nightWorkMinutes 移行方針 | **新規のみ** |
