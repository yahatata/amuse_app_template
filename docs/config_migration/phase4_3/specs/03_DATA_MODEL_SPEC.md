# 03: データモデル仕様

**ステータス**: 最終確定
**最終更新**: 2026-03-21

---

## 仕様概要

Firestore のコレクション・ドキュメント・フィールドの定義。attendance への追加フィールド、monthlyPayroll の階層構造（payrollRuns → staffResults → attendanceItems）、通知コレクション、過去未反映 attendance の救済（キャリーオーバー）メカニズムを含む。`storeMeta/payrollConfig` のフィールド定義は 02_CONFIG_SPEC を参照。

---

## 仕様詳細

### 1. attendance（既存コレクション — フィールド追加）

パス: `attendances/{attendanceId}`

#### 1-1. 既存フィールド（変更なし）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| staffId | string | スタッフ ID |
| staffsFullName | string | スタッフ氏名 |
| clockIn | Timestamp | 出勤時刻 |
| clockOut | Timestamp? | 退勤時刻 |
| date | string | 勤務開始基準日（YYYY-MM-DD） |
| actualWorkMinutes | number | 実労働時間（休憩除く） |
| totalMinutes | number | 拘束時間 |
| breakMinutes | number | 総休憩時間 |
| breakCount | number | 休憩回数 |
| nightMinutes | number | 深夜時間帯の拘束分数（休憩未控除） |
| nightWorkMinutes | number | 深夜時間帯の実労働分数（休憩控除後。01_CALC_SPEC 実装時修正事項参照） |
| isManual | boolean | 手動作成か |
| isOnBreak | boolean | 休憩中フラグ |
| currentBreakStartedAt | Timestamp? | 現在休憩開始時刻 |
| closedStoreWithoutClockOut | boolean | 閉店処理による強制退勤か |
| closedAt | Timestamp? | 閉店時刻 |
| createdAt | Timestamp | 作成日時 |
| updatedAt | Timestamp | 更新日時 |
| lastActionAt | Timestamp | 最終操作時刻 |
| lastActionByDeviceId | string? | 最終操作デバイス ID |
| lastActionType | string | 最終操作種別 |
| isDeleted | boolean | 論理削除フラグ |
| deletedAt | Timestamp? | 削除日時 |
| deletedBy | string? | 削除者 |

#### 1-2. 追加フィールド（新規）

| フィールド | 型 | 必須 | 設定主体 | 説明 |
|-----------|-----|------|---------|------|
| weekday | number | ○ | Cloud Functions | 曜日（0=日曜〜6=土曜。JavaScript getDay() 準拠）。`date` から算出 |
| weekStartDate | string | ○ | Cloud Functions | 法定週の開始日（YYYY-MM-DD）。`date` と `payrollConfig.weekStartDay` から算出（02_CONFIG_SPEC セクション6参照） |
| paymentPeriodKey | string | ○ | Cloud Functions | 帰属給与期間キー（例: `2026-03-26_2026-04-25`）。`date` と `config.payroll.startDay/endDay` から算出（02_CONFIG_SPEC セクション5参照） |
| payrollStatus | string | ○ | Cloud Functions | `unreflected` / `reflected` / `corrected_after_reflection` |
| reflectedPayrollRunId | string? | △ | Cloud Functions | 最後に反映した payroll runId。未反映なら null |
| reflectedAt | Timestamp? | △ | Cloud Functions | 最後に反映した日時。未反映なら null |

**payrollStatus の遷移**:
- 初期値: `unreflected`（attendance 作成時）
- `unreflected` → `reflected`（給与計算で反映された時。reflectedPayrollRunId / reflectedAt を同時に設定）
- `reflected` → `corrected_after_reflection`（反映済み attendance が編集された時。再計算の対象となる）

#### 1-3. 廃止フィールド

| フィールド | 理由 |
|-----------|------|
| payrollReflectedAt（文字列） | payrollStatus / reflectedPayrollRunId / reflectedAt に置き換え |

既存の payrollReflectedAt が設定された attendance は、移行処理は行わない。新規計算からは新フィールドを使用する。コード上では payrollReflectedAt が存在する attendance も正しく扱えるよう、フォールバック処理を入れる。

#### 1-4. attendance に持たせないもの

以下は attendance には保存しない。給与計算時に動的に計算する。

- 週累計（weeklyRegularRunning）
- その日の残業時間（dailyOverMinutes 等）
- 月60時間超判定
- 法定休日労働判定結果（isLegalHoliday）
- 月次給与額

### 2. monthlyPayroll（見直し）

#### 2-1. ルートドキュメント

パス: `monthlyPayroll/{paymentPeriodKey}`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| paymentPeriodKey | string | 期間キー（docId と同一。例: `2026-03-26_2026-04-25`） |
| paymentPeriodStart | string | 期間開始日（YYYY-MM-DD） |
| paymentPeriodEnd | string | 期間終了日（YYYY-MM-DD） |
| status | string | `draft` / `confirmed` / `paid` / `hold` |
| latestRunId | string? | 最新 payroll runId |
| latestCalculatedAt | Timestamp? | 最新計算日時 |
| confirmedAt | Timestamp? | 確定日時 |
| confirmedByDeviceId | string? | 確定したデバイス ID |
| paidAt | Timestamp? | 全 staff 支払い完了日時（status == "paid" 時に設定） |
| createdAt | Timestamp | 作成日時 |
| updatedAt | Timestamp | 更新日時 |

**status の遷移**:

```
[なし] → draft → confirmed → paid
                  ↔ hold → paid
```

- `draft`: 計算実行済み・未確定。再計算可能
- `confirmed`: 確定済み。支払い処理未完了（paymentStatus == "unpaid" の staff が存在する）
- `hold`: 全 staff が paid / hold のいずれかで、hold の staff が1名以上存在（通知は低頻度リマインドのみ）
- `paid`: 全 staff が支払い済み（通知なし）

**status の自動遷移ルール**: monthlyPayroll.status は staff ごとの paymentStatus（staffResults 参照）に基づいて registerPaymentStatus Callable 内で自動的に決定される（04_CALLABLE_API_SPEC 参照）。admin が monthlyPayroll.status を直接操作することはない。

```
unpaidCount = confirmed run の staffResults で paymentStatus == "unpaid" の件数
holdCount   = confirmed run の staffResults で paymentStatus == "hold" の件数

if unpaidCount == 0 && holdCount == 0:
    monthlyPayroll.status = "paid"     // 全員支払い済み
elif unpaidCount == 0 && holdCount > 0:
    monthlyPayroll.status = "hold"     // 全員処理済みだが保留あり
else:
    monthlyPayroll.status = "confirmed" // 未払い staff がまだいる
```

**既存データとの混在**: phase4_2 の支払日キー（`2025-03-25`）と新フォーマット（`2026-03-26_2026-04-25`）が同一コレクション内に混在する。移行は行わず、新規分のみ新フォーマットを適用。フォーマットが明確に異なるため区別は容易（02_CONFIG_SPEC セクション5参照）。

#### 2-2. payrollRuns サブコレクション

パス: `monthlyPayroll/{paymentPeriodKey}/payrollRuns/{runId}`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| runId | string | Firestore docId |
| paymentPeriodKey | string | 対象期間 |
| paymentPeriodStart | string | 対象開始日 |
| paymentPeriodEnd | string | 対象終了日 |
| triggerSource | string | `manual` / `scheduler` |
| calculatedAt | Timestamp | 実行日時 |
| startedAt | Timestamp | 開始日時 |
| finishedAt | Timestamp? | 完了日時 |
| status | string | `preparing` / `processing` / `aggregating` / `completed` / `completed_with_errors` / `failed` / `cancelled`（DISTRIBUTED_EXECUTION_DESIGN.md セクション6参照） |
| calculatedByDeviceId | string? | 手動実行時のデバイス ID |
| calcVersion | string | 計算ロジック版（02_CONFIG_SPEC セクション4参照） |
| weekStartDaySnapshot | number | 週開始曜日 snapshot |
| weeklyLegalLimitMinutesSnapshot | number | 週法定上限 snapshot |
| legalHolidayWeekdaySnapshot | number \| null | 法定休日曜日 snapshot |
| nightPremiumRateSnapshot | number | 深夜割増率 snapshot |
| overtimePremiumRateSnapshot | number | 法定時間外割増率 snapshot |
| over60PremiumRateSnapshot | number | 月60時間超追加割増率 snapshot |
| legalHolidayPremiumRateSnapshot | number | 法定休日割増率 snapshot |
| roundingMethodSnapshot | string | 端数処理方式 snapshot |
| roundingPrecisionSnapshot | number | 端数処理適用単位 snapshot |
| targetStaffCount | number | 対象スタッフ数 |
| completedStaffCount | number | 計算完了スタッフ数。processStaffPayroll 完了ごとにトランザクション内で increment |
| failedStaffCount | number | 計算失敗スタッフ数。processStaffPayroll 失敗ごとにトランザクション内で increment |
| targetAttendanceCount | number | 計上対象 attendance 数（キャリーオーバー含む） |
| carryOverAttendanceCount | number | キャリーオーバー attendance 数 |
| referencedAttendanceCount | number | 参照含む全 attendance 数 |
| totalBasePay | number | 全体基本賃金合計 |
| totalPremiumPay | number | 全体割増賃金合計 |
| totalGrossPay | number | 全体総支給額 |
| warningCount | number | 警告件数 |
| anomalyFlags | map? | 異常値チェック結果 |
| createdAt | Timestamp | 作成日時 |
| updatedAt | Timestamp | 更新日時 |

**payrollRuns.status の遷移**:

| status | 意味 | 遷移条件 |
|--------|------|---------|
| `preparing` | run 作成中・タスク投入中 | executeMonthlyPayroll 開始時 |
| `processing` | Cloud Tasks 実行中 | 全タスク投入完了時 |
| `aggregating` | サマリ集計中 | finalizePayrollRun 開始時 |
| `completed` | 全 staff 成功・集計完了 | failedStaffCount == 0 |
| `completed_with_errors` | 一部 staff 失敗・集計完了 | failedStaffCount > 0 |
| `failed` | 致命的エラー | タスク投入中の回復不能エラー |
| `cancelled` | admin が中止 | cancelPayrollRun 呼び出し |

**バッチ書き込み**: Cloud Tasks により staff 単位で自然に分離されるため、1 タスク内の書き込みは ~37 ops（staffResult 1 + attendanceItems ~35 + payrollRuns increment 1）でバッチ上限（500）を大幅に下回る。明示的なバッチ分割は不要。confirmPayrollRun での attendance payrollStatus 更新は 400 件ごとにバッチ分割する。

#### 2-3. staffResults サブコレクション

パス: `monthlyPayroll/{paymentPeriodKey}/payrollRuns/{runId}/staffResults/{staffId}`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| staffId | string | スタッフ ID |
| taskStatus | string | `pending` / `processing` / `completed` / `failed`。タスク管理用（DISTRIBUTED_EXECUTION_DESIGN.md セクション4参照） |
| taskStartedAt | Timestamp? | タスク処理開始時刻 |
| taskFinishedAt | Timestamp? | タスク処理完了時刻 |
| taskError | string? | エラーメッセージ（taskStatus == "failed" 時のみ） |
| assignedAttendanceIds | string[] | このタスクに割り当てられた通常 attendance ID 配列 |
| assignedCarryOverAttendanceIds | string[] | キャリーオーバー attendance ID 配列 |
| staffNameSnapshot | string | 氏名 snapshot |
| baseHourlyWageSnapshot | number | 基本時給 snapshot |
| totalActualWorkMinutes | number | 全実労働時間（01_CALC_SPEC セクション12参照） |
| totalNightWorkMinutes | number | 深夜実労働時間 |
| totalLegalOvertimeMinutes | number | 法定時間外労働時間 |
| over60OvertimeMinutes | number | 月60時間超部分 |
| totalLegalHolidayWorkMinutes | number | 法定休日労働時間 |
| totalNonLegalHolidayWorkMinutes | number | 法定外休日労働時間 |
| targetAttendanceCount | number | 計上対象 attendance 件数 |
| carryOverAttendanceCount | number | うちキャリーオーバー件数 |
| basePay | number | 基本賃金 |
| lateNightPremiumPay | number | 深夜割増分 |
| overtimePremiumPay | number | 法定時間外割増分 |
| over60PremiumPay | number | 月60時間超追加割増分 |
| legalHolidayPremiumPay | number | 法定休日割増分 |
| grossPay | number | 総支給額（キャリーオーバー分含む） |
| carryOverGrossPay | number | うちキャリーオーバー分の支給額（内訳参照用） |
| status | string | `success` / `warning` / `error` |
| warnings | array\<string\>? | 警告内容 |
| calcVersion | string | ロジック版 |
| calculatedAt | Timestamp | 計算日時 |
| deferredAttendances | array\<DeferredAttendance\>? | （後述セクション5でキャリーオーバー元として追記される） |
| paymentStatus | string | `"unpaid"` / `"paid"` / `"hold"`。confirmPayrollRun 完了時に `"unpaid"` で初期化される |
| paidAt | Timestamp? | 支払い登録日時。paymentStatus == "paid" 時に設定 |
| paidByDeviceId | string? | 支払い登録デバイス ID。paymentStatus == "paid" 時に設定 |

**taskStatus と計算結果フィールドの関係**: executeMonthlyPayroll がタスク投入時に staffResults ドキュメントを `taskStatus = "pending"` + `assignedAttendanceIds` で作成する。processStaffPayroll が計算完了時に `taskStatus = "completed"` とともに計算結果フィールド（totalActualWorkMinutes, grossPay 等）を書き込む。`taskStatus != "completed"` の場合、計算結果フィールドには有効なデータが入っていない。

**paymentStatus の遷移**:
- 初期値: `"unpaid"`（confirmPayrollRun 完了時に設定）
- `"unpaid"` → `"paid"`: 支払い登録時。paidAt, paidByDeviceId を同時に設定
- `"unpaid"` → `"hold"`: 保留設定時
- `"hold"` → `"paid"`: 保留解除 → 支払い登録時
- `"paid"` からの遷移はない（支払い済みは最終状態）

**paymentStatus と monthlyPayroll.status の関係**: 各 staff の paymentStatus 更新時に、confirmed run の全 staffResults の paymentStatus を集計し、monthlyPayroll.status を自動的に更新する（セクション2-1 の自動遷移ルール参照）。

#### 2-4. attendanceItems サブコレクション【必須】

パス: `monthlyPayroll/{paymentPeriodKey}/payrollRuns/{runId}/staffResults/{staffId}/attendanceItems/{attendanceId}`

各 attendance の計算過程を監査目的で記録する。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| attendanceId | string | 元の attendance ドキュメント ID |
| attendanceRefPath | string | 元の attendance のフルパス（例: `attendances/abc123`） |
| workDate | string | 勤務日（YYYY-MM-DD） |
| weekday | number | 曜日（0=日曜〜6=土曜。JavaScript getDay() 準拠） |
| weekStartDate | string | 法定週開始日（YYYY-MM-DD） |
| paymentPeriodKey | string | この attendance が本来帰属する給与期間 |
| isCarryOver | boolean | キャリーオーバー（過去未反映の救済計上）か |
| originalPaymentPeriodKey | string? | キャリーオーバー元の給与期間（isCarryOver=true の場合のみ。isCarryOver=false なら null） |
| includedInCurrentRun | boolean | 今回の run で計上対象としたか |
| actualWorkMinutes | number | 実労働時間 |
| nightWorkMinutes | number | 深夜実労働時間 |
| isLegalHoliday | boolean | 法定休日判定結果 |
| isNonLegalHoliday | boolean | 法定外休日判定結果 |
| dailyOverMinutes | number | 1日8時間超分（法定休日なら 0） |
| dailyRegularMinutes | number | 法定内労働分（法定休日なら 0） |
| weeklyRegularBefore | number | 当日前までの週内法定内累計 |
| weeklyRegularAfter | number | 当日後の週内法定内累計 |
| weeklyOnlyOverMinutes | number | 純粋な週超過寄与分 |
| legalOvertimeMinutes | number | 当該 attendance の法定時間外 |

### 3. 通知コレクション

パス: `notifications/{notificationId}`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | docId。スケジューラー生成の通知は冪等キーを docId として使用（下記参照） |
| type | string | `warning` / `report` / `strong_warning` / `error` |
| operationCategory | string | 通知の機能カテゴリ。今回実装分はすべて `payroll`。将来的に他カテゴリを追加可能 |
| triggerType | string | 通知トリガーの種別（例: `payroll_calc_remind`, `payroll_run_completed` 等）。07_NOTIFICATION_SCHEDULER_SPEC セクション2参照 |
| title | string | タイトル |
| body | string? | 本文 |
| isRead | boolean | 未読・既読 |
| isFlagged | boolean | フラグ |
| createdAt | Timestamp | 作成日時（JST として保存） |
| targetDeviceIds | array\<string\>? | 通知先デバイス（拡張用） |

**冪等キーによるドキュメント ID**: スケジューラー経由で生成される通知は、重複防止のためドキュメント ID を冪等キーとして使用する。フォーマット: `{triggerType}_{paymentPeriodKey}_{YYYY-MM-DD}`。`doc(冪等キー).set()` で書き込むことで、同日に同一トリガーが複数回発火しても重複通知は発生しない。イベント駆動の通知は `{triggerType}_{runId}` や `{triggerType}_{attendanceId}_{timestamp}` を使用する。詳細は 07_NOTIFICATION_SCHEDULER_SPEC セクション3-4 参照。

### 4. storeMeta/payrollConfig

フィールド定義の詳細は **02_CONFIG_SPEC** セクション3〜4 を参照。03 では重複定義を避けるため、ここでは配置パスと役割のみ記載する。

パス: `storeMeta/payrollConfig`

- 既存フィールド（phase4_2 から継承）: paymentDate, expectedRange, maxCandidatesCount 等
- 新規追加フィールド: weekStartDay, weeklyLegalLimitMinutes, legalHolidayWeekday, 割増率4種, 端数処理2種, calcVersion, schedulerNotificationHour, reminderStartDaysAfterPeriodEnd

### 5. キャリーオーバー（過去未反映 attendance の救済）

過去の給与期間に属する attendance が未反映（`payrollStatus = unreflected`）のまま残っていた場合、当月の給与計算 run で**例外データとして救済計上**する。

#### 5-1. 基本方針

- 過去未反映 attendance は、当月の run に**キャリーオーバー**として含める
- **残業計算は元の帰属期間のデータを参照**して行う（当月の週累計ではなく、元の期間の週累計で判定）
- 当月の staffResults の grossPay にキャリーオーバー分の金額を含める（当月に支給される）
- **例外データであることを明確にマーク**する（attendanceItems の `isCarryOver = true`）

#### 5-2. 当月 run 側のデータ

**attendanceItems** に以下のフィールドでキャリーオーバーを識別:

| フィールド | 値 |
|-----------|-----|
| isCarryOver | `true` |
| originalPaymentPeriodKey | 元の帰属期間（例: `2026-02-26_2026-03-25`） |
| paymentPeriodKey | 元の帰属期間と同一 |
| includedInCurrentRun | `true` |

**残業計算**: キャリーオーバー attendance の `dailyOverMinutes`, `weeklyRegularBefore`, `legalOvertimeMinutes` 等は、**元の帰属期間の attendance データを参照**して算出する。当月の週累計には含めない。

**staffResults** では `carryOverAttendanceCount` と `carryOverGrossPay` でキャリーオーバー分を内訳として記録する。

#### 5-3. 元の期間の staffResults への記録

キャリーオーバーが発生した場合、**元の期間の confirmed 済み staffResults** に `deferredAttendances` を追記する。これにより、過去の給与確定データから「この attendance は未来の期間で例外として支給された」ことが追跡可能になる。

**DeferredAttendance の構造**:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| attendanceId | string | 対象の attendance ID |
| paidInPaymentPeriodKey | string | 実際に支給された給与期間（例: `2026-04-26_2026-05-25`） |
| paidInRunId | string | 実際に計上した run の ID |
| paidAt | Timestamp | 計上処理日時 |
| grossPayContribution | number | この attendance のキャリーオーバー支給額 |

**記録タイミング**: `confirmPayrollRun` の実行時に、元の期間の staffResults ドキュメントに `deferredAttendances` 配列を追記（arrayUnion）する。confirm 時に記録することで、確定前に再計算が行われた場合に不整合が生じない。

**confirmed ドキュメントへの追記の正当性**: `deferredAttendances` は計算結果の変更ではなく、「確定後に発生した事実の追記」であるため、confirmed 状態のドキュメントへの書き込みとして許容される。計算結果フィールド（grossPay 等）は一切変更しない。

#### 5-4. キャリーオーバーの処理フロー

```
【executeMonthlyPayroll 時】
1. 当月の paymentPeriodKey に該当する unreflected attendance を抽出
2. 過去の paymentPeriodKey で unreflected のままの attendance も抽出
3. 通常 attendance（手順1）→ 01_CALC_SPEC のアルゴリズムで計算
4. キャリーオーバー attendance（手順2）→ 元の期間のデータを参照して残業計算
5. 両方の計算結果を staffResults に集計（grossPay はキャリーオーバー分を含む合計）
6. attendanceItems に isCarryOver フラグ付きで記録

【confirmPayrollRun 時】
7. 通常 attendance + キャリーオーバー attendance の payrollStatus を reflected に更新
8. 元の期間の confirmed staffResults に deferredAttendances を追記（arrayUnion）
```

---

## 確定済み事項一覧（元・未確定事項）

| # | 項目 | 決定内容 | 決定日 |
|---|------|---------|--------|
| 1 | 未反映 attendance の扱い | 案B（キャリーオーバー）を採用。過去未反映 attendance は当月 run で例外データとして救済計上する。残業計算は元の帰属期間のデータを参照。元の期間の staffResults に deferredAttendances を追記して追跡可能にする | 2026-03-21 |
| 2 | nightWorkMinutes の休憩控除方式 | recalculateAttendanceFromBreaks 内で breaks サブコレクションの深夜帯重複分を控除する方式（01_CALC_SPEC 実装時修正事項で確定済み） | 2026-03-21 |
| 3 | 通知コレクションの名前 | `notifications`。operationCategory フィールドで機能カテゴリを区別（今回実装分は `payroll`） | 2026-03-21 |
| 4 | payrollReflectedAt の既存データ対応 | 移行処理は行わない。新規計算からは新フィールドを使用。コード上でフォールバック処理を入れる | 2026-03-21 |
| 5 | 古い payrollRun の削除タイミング | 自動削除は行わず保持する。監査証跡として重要であり、ストレージコストは微小 | 2026-03-21 |
| 6 | attendanceItems の必須/任意 | 必須。監査証跡・デバッグ・検証に不可欠 | 2026-03-21 |
| 7 | 確定済み期間の再 run 可否 | 不可。confirmed の不変性を維持。万が一の場合は Firestore コンソールから手動で status を draft に戻す運用 | 2026-03-21 |
| 8 | 遡及訂正の方式 | フラグのみ。confirmed 済み期間の attendance が修正された場合、`corrected_after_reflection` としてマークし通知を出す。自動再計算は行わない。将来的に confirmed 済み期間の attendance を UI 上で編集不可にする可能性あり | 2026-03-21 |
| 9 | 計算結果チェック（anomalyFlags） | 枠組みのみ実装。`generateAnomalyFlags` 関数を呼び出すが初期リリースでは空フラグを返す。運用開始後に追加 | 2026-03-21 |

---

## 懸念事項一覧（解消済み）

| # | 項目 | 説明 | 解消方針 |
|---|------|------|---------|
| 1 | staffResults のサブコレクション化によるクエリ複雑化 | 一覧取得に collectionGroup クエリが必要になる可能性 | サブコレクション化のメリット（ドキュメントサイズ制限回避、階層構造の自然な表現）がデメリットを上回るため採用。一覧取得は `payrollRuns/{runId}/staffResults` への単純クエリで対応可能 |
| 2 | attendanceItems のドキュメント数とバッチ書き込み上限 | 1 staff × 30日 = 最大30ドキュメント。Firestore バッチ上限 500 | Cloud Tasks により staff 単位で分離。1 タスクあたり ~37 writes でバッチ上限を大幅に下回る |
| 3 | paymentPeriodKey フォーマット変更に伴う既存データとの混在 | 既存は支払日キー、新規は期間レンジキー | 移行は行わず新規分のみ新フォーマット適用。フォーマットが明確に異なるため区別は容易（02_CONFIG_SPEC セクション5参照） |

---

## 改善要素一覧（対応済み）

| # | 項目 | 説明 | 状態 |
|---|------|------|------|
| 1 | 支払い管理フィールドの追加 | monthlyPayroll ルートに paidAt を追加。staffResults に paymentStatus, paidAt, paidByDeviceId を追加。monthlyPayroll.status は staffResults の paymentStatus に基づいて自動遷移する | 対応済み（セクション2-1, 2-3 に反映） |
