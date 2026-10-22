# Step 10: 通知・スケジューラー — changeSpec

**作成日**: 2026-03-22

---

## 1. カバーする仕様

| 仕様書 | セクション | 内容 |
|--------|----------|------|
| 07_NOTIFICATION_SCHEDULER_SPEC | §1-1 〜 §1-6 | 通知基盤（通知先、adminHome 確認、属性、表示、コレクション、テンプレート） |
| 07_NOTIFICATION_SCHEDULER_SPEC | §2-1 | スケジューラー経由の通知（5種） |
| 07_NOTIFICATION_SCHEDULER_SPEC | §2-2 | イベント駆動の通知（4種） |
| 07_NOTIFICATION_SCHEDULER_SPEC | §3-1 〜 §3-4 | スケジューラーアーキテクチャ（コスト最小化、実行フロー、処理詳細、冪等キー） |
| 07_NOTIFICATION_SCHEDULER_SPEC | §4 | 既存 monthlyPayrollTrigger の変更 |
| 07_NOTIFICATION_SCHEDULER_SPEC | §5-1 〜 §5-3 | 通知 API（取得、更新、作成） |
| 03_DATA_MODEL_SPEC | §3 | notifications コレクション |
| 04_CALLABLE_API_SPEC | §1（手順 7） | attendance onWrite — corrected 通知作成 |
| 04_CALLABLE_API_SPEC | §3 | executeMonthlyPayroll — failed 通知作成 |
| 04_CALLABLE_API_SPEC | §5（手順 8） | finalizePayrollRun — completed/completed_with_errors 通知作成 |
| 05_PROCESS_FLOW_SPEC | §4（手順 8） | finalizePayrollRun 通知作成 |
| 05_PROCESS_FLOW_SPEC | §7 | attendance 修正 — corrected 通知 |
| 05_PROCESS_FLOW_SPEC | §9 | 実装責務の分担（通知 — Functions） |

---

## 2. As-Is

### Cloud Functions

- `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts`: 既存の旧スケジューラー。月次で直接計算を実行。Phase4.3 では通知専用に置き換え
- `functions/src/domains/attendance/tasks/finalizePayrollRun.ts`: L121 に `// 8. TODO: 通知作成（Step 10 で実装）` コメントあり
- `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts`: failed 時の通知作成なし
- `functions/src/domains/attendance/triggers/attendanceOnWrite.ts`: corrected_after_reflection 検知は実装済みだが通知作成なし
- `functions/src/domains/attendance/index.ts`: `monthlyPayrollTrigger` を export 中

### Flutter

- `lib/Home/adminHomePage.dart`: 通知表示なし

---

## 3. To-Be 設計

### 3.1 ファイル構成（Cloud Functions）

```
functions/src/domains/attendance/
├── helpers/
│   ├── payrollNotificationTemplates.ts  ← 新規: テンプレート定数
│   └── payrollNotificationHelper.ts     ← 新規: createPayrollNotification()
├── scheduler/
│   ├── monthlyPayrollTrigger.ts         ← 変更なし（既存の export を維持）
│   └── payrollNotificationScheduler.ts  ← 新規: Cloud Scheduler → Cloud Task 投入
├── tasks/
│   ├── processPayrollNotifications.ts   ← 新規: 通知判定・作成
│   ├── finalizePayrollRun.ts            ← 変更: 通知作成追加
│   └── processStaffPayroll.ts           ← 変更なし
├── callables/
│   └── executeMonthlyPayroll.ts         ← 変更: failed 通知作成
├── triggers/
│   └── attendanceOnWrite.ts             ← 変更: corrected 通知作成
└── index.ts                             ← 変更: 新規 export 追加
```

### 3.2 Flutter ファイル構成

```
lib/
├── Home/
│   └── adminHomePage.dart               ← 変更: 通知ベル + バッジ追加
└── payroll/
    └── widgets/
        └── notification_list.dart       ← 新規: 通知一覧画面
```

### 3.3 通知テンプレート（payrollNotificationTemplates.ts）

9種の通知テンプレートを定数マップとして定義。07_NOTIFICATION_SCHEDULER_SPEC §1-6 のテンプレートをそのまま実装。

```typescript
export const PAYROLL_NOTIFICATION_TEMPLATES: Record<string, {
  type: string;
  title: string;
  body: string;
}> = {
  payroll_period_start: { type: 'report', title: '...', body: '...' },
  payroll_calc_remind: { type: 'warning', title: '...', body: '...' },
  // ... 全9種
};
```

### 3.4 createPayrollNotification（payrollNotificationHelper.ts）

共通関数。テンプレートからタイトル/本文を生成し、`notifications` コレクションに書き込む。

```typescript
export async function createPayrollNotification(
  db: FirebaseFirestore.Firestore,
  triggerType: string,
  params: Record<string, string>,
  options?: {
    docId?: string;           // 冪等キー（指定なしなら auto-id）
    typeOverride?: string;    // warning → strong_warning 昇格用
  }
): Promise<void>
```

**冪等キー**:
- スケジューラー経由: `{triggerType}_{paymentPeriodKey}_{YYYY-MM-DD}`
- イベント駆動: `{triggerType}_{runId}` / `{triggerType}_{attendanceId}_{timestamp}`

### 3.5 payrollNotificationScheduler

Cloud Scheduler（毎日 06:00 JST）から呼び出される。`payrollConfig.schedulerNotificationHour` を読み取り、`processPayrollNotifications` タスクを `scheduleTime = 当日の設定時刻 JST` で投入。

### 3.6 processPayrollNotifications（onTaskDispatched）

1日1回実行。対象期間（当月・前月）の `monthlyPayroll` を読み取り、5種のスケジューラー経由通知の条件を評価・作成。

**処理詳細**: 07_NOTIFICATION_SCHEDULER_SPEC §3-3 に準拠。

### 3.7 インライン通知（既存関数への追加）

| 対象関数 | 追加場所 | triggerType | 条件 |
|---------|---------|-------------|------|
| `finalizePayrollRun` | L121 TODO 箇所 | `payroll_run_completed` | finalStatus == 'completed' |
| `finalizePayrollRun` | L121 TODO 箇所 | `payroll_run_completed_with_errors` | finalStatus == 'completed_with_errors' |
| `executeMonthlyPayroll` | catch ブロック（status = 'failed' 時） | `payroll_run_failed` | 致命的エラー |
| `attendanceOnWrite` | corrected_after_reflection 検知後 | `payroll_attendance_corrected` | payrollStatus 変更時 |

### 3.8 既存 monthlyPayrollTrigger の扱い

- **コードは残す**（`monthlyPayrollTrigger.ts` を削除しない）
- `monthlyPayrollTriggerEnabled` が false（デフォルト）のため既にスキップされる
- 新しい `payrollNotificationScheduler` が代替として機能

### 3.9 Flutter 通知一覧（notification_list.dart）

adminHome に通知ベルアイコン + 未読バッジを追加。タップで通知一覧画面に遷移。

**通知一覧画面**:
- Firestore `notifications` コレクションを直接クエリ
- フィルター: `operationCategory == 'payroll'`、`createdAt >= 2ヶ月前`
- ソート: `createdAt DESC`
- 未読/既読の切り替え: タップで `isRead = true` に更新
- フラグ付け/解除: 長押しで `isFlagged` トグル
- 通知種別（type）に応じたアイコン/色

---

## 4. 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `functions/src/domains/attendance/helpers/payrollNotificationTemplates.ts` | 新規 | 9種のテンプレート定数 |
| `functions/src/domains/attendance/helpers/payrollNotificationHelper.ts` | 新規 | createPayrollNotification() |
| `functions/src/domains/attendance/scheduler/payrollNotificationScheduler.ts` | 新規 | Cloud Scheduler → Task 投入 |
| `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` | 新規 | 通知判定・作成（5種） |
| `functions/src/domains/attendance/tasks/finalizePayrollRun.ts` | 変更 | 通知作成追加（2種） |
| `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts` | 変更 | failed 通知作成 |
| `functions/src/domains/attendance/triggers/attendanceOnWrite.ts` | 変更 | corrected 通知作成 |
| `functions/src/domains/attendance/index.ts` | 変更 | 新規 export 追加 |
| `lib/Home/adminHomePage.dart` | 変更 | 通知ベル + バッジ追加 |
| `lib/payroll/widgets/notification_list.dart` | 新規 | 通知一覧画面 |

---

## 5. テスト計画

### 5.1 Cloud Functions 自動テスト

| # | テスト | 対象 |
|---|--------|------|
| 1 | テンプレート展開（パラメータ置換） | payrollNotificationHelper |
| 2 | 冪等キー生成（スケジューラー経由） | payrollNotificationHelper |
| 3 | 冪等キー生成（イベント駆動） | payrollNotificationHelper |
| 4 | payroll_period_start 条件評価 | processPayrollNotifications |
| 5 | payroll_calc_remind 条件評価 | processPayrollNotifications |
| 6 | payroll_calc_remind 昇格（strong_warning） | processPayrollNotifications |
| 7 | payroll_confirm_remind 条件評価 | processPayrollNotifications |
| 8 | payroll_payment_overdue 条件評価 | processPayrollNotifications |
| 9 | payroll_hold_reminder 条件評価（月曜のみ） | processPayrollNotifications |
| 10 | 通知非作成（条件不成立時） | processPayrollNotifications |

### 5.2 Flutter 静的解析

- `flutter analyze` でエラー・警告 0 を確認

### 5.3 手動確認項目

| ID | 確認項目 |
|----|---------|
| M-1 | adminHome に通知ベル + 未読バッジ表示 |
| M-2 | 通知一覧画面: createdAt 降順表示 |
| M-3 | 通知タップ → 既読化 |
| M-4 | 通知長押し → フラグ付け/解除 |
| M-5 | 通知種別に応じたアイコン/色 |

---

## 6. 設計判断

| # | 項目 | 判断 | 理由 |
|---|------|------|------|
| 1 | monthlyPayrollTrigger | コードは残す。`monthlyPayrollTriggerEnabled` で既に無効 | 旧ロジック削除はリスクが高い。新旧切り替えが容易 |
| 2 | processPayrollNotifications のテスト | 条件評価ロジックを Firestore 非依存のヘルパーとして抽出し、ユニットテスト可能にする | processPayrollNotifications 自体は Firestore 依存だが、条件評価ロジックは純粋関数として分離 |
| 3 | 通知一覧の表示方式 | Firestore 直接クエリ（Callable 不使用） | 07_NOTIFICATION_SCHEDULER_SPEC §5-1 の方針。セキュリティルールで admin のみ制限 |
| 4 | 通知更新 | Flutter から Firestore 直接更新（Callable 不使用） | §5-2 の方針。isRead / isFlagged は UI 状態 |
