# 07: 通知・スケジューラー仕様

**ステータス**: 確定
**最終更新**: 2026-03-21

---

## 仕様概要

通知基盤の新規構築とスケジューラーの役割変更。スケジューラーは**通知判定のみ**を行い、計算実行は行わない。通知先は管理者デバイス（adminHome）のみ。将来的に LINE・メール送信への拡張を考慮する。

通知は2種類の経路で生成される:
1. **スケジューラー経由**: 1日1回のスケジューラー → Cloud Task → 通知判定・作成
2. **イベント駆動（インライン）**: finalizePayrollRun / attendance onWrite トリガー内で即時作成

すべての日時は **JST（UTC+9）** として Firestore に保存し、アプリ上ではそのまま日本時間として表示する。

---

## 仕様詳細

### 1. 通知基盤

#### 1-1. 通知先【確定】

- 管理者デバイスのみ（adminHome）

#### 1-2. adminHome での確認【確定】

- adminHome で半永続的に確認できるようにする
- 取得クエリで `createdAt >= 2ヶ月前` の条件を付与し、古い通知は表示しない
- データ自体は削除・移動しない（将来的に Firestore TTL ポリシーで自動削除を検討可能）

#### 1-3. 通知の属性【確定】

| 属性 | 内容 |
|------|------|
| 未読・既読 | isRead で管理 |
| 通知種別 | warning, report, strong_warning, error |
| フラグ | isFlagged で管理（後で見返すもの） |

#### 1-4. 表示【確定】

- フィルターやタブによる表示分けを行う

#### 1-5. コレクション【確定】

- `notifications` コレクション（03_DATA_MODEL_SPEC セクション3参照）
- `operationCategory = "payroll"` で機能カテゴリを区別
- 拡張性を意識（LINE・メール送信対応）

#### 1-6. 通知テンプレート【確定】

通知の title / body を定型化し、パラメータ埋め込みで生成する。テンプレートは Cloud Functions 内の定数マップとして定義する。

```typescript
const PAYROLL_NOTIFICATION_TEMPLATES = {
  payroll_period_start: {
    type: "report",
    title: "給与計算可能期間に入りました",
    body: "{periodStart}〜{periodEnd} の給与計算が可能です。",
  },
  payroll_calc_remind: {
    type: "warning",  // 支払日3日前からは strong_warning に昇格
    title: "給与計算がまだ行われていません",
    body: "{periodStart}〜{periodEnd} の給与計算がまだ実行されていません。支払日は {paymentDate} です。",
  },
  payroll_confirm_remind: {
    type: "warning",
    title: "給与確定処理がまだ行われていません",
    body: "{periodStart}〜{periodEnd} の給与計算は完了していますが、確定処理がまだ行われていません。",
  },
  payroll_run_completed: {
    type: "report",
    title: "給与計算が完了しました",
    body: "{periodStart}〜{periodEnd}: {staffCount}名, 総支給額 ¥{totalGrossPay}",
  },
  payroll_run_completed_with_errors: {
    type: "error",
    title: "給与計算が一部失敗しました",
    body: "{periodStart}〜{periodEnd}: {failedCount}名の計算に失敗。確認してください。",
  },
  payroll_run_failed: {
    type: "error",
    title: "給与計算が失敗しました",
    body: "{periodStart}〜{periodEnd} の給与計算が失敗しました。再実行してください。",
  },
  payroll_payment_overdue: {
    type: "strong_warning",
    title: "支払い済み登録がされていません",
    body: "{periodStart}〜{periodEnd} の支払い日を過ぎています。",
  },
  payroll_hold_reminder: {
    type: "report",
    title: "保留中の支払いがあります",
    body: "{holdCount}名の支払いが保留中です。",
  },
  payroll_attendance_corrected: {
    type: "warning",
    title: "確定済み期間の勤怠が修正されました",
    body: "{staffName} の {date} の勤怠データが修正されました。給与は確定済みのため自動再計算されません。",
  },
};
```

将来の多言語対応やチャネル拡張（LINE / メール）でもテンプレートベースで対応可能。

### 2. 通知トリガーの分類

#### 2-1. スケジューラー経由の通知（定期判定）

| # | triggerType | 説明 | 通知種別 | 発火条件 |
|---|------------|------|---------|---------|
| 1 | `payroll_period_start` | 計算可能期間に入った | report | periodEnd + 1日。1回のみ |
| 2 | `payroll_calc_remind` | 計算がまだ行われていない | warning / strong_warning | periodEnd + N日目から毎日。latestRunId 存在で停止 |
| 3 | `payroll_confirm_remind` | 計算済みだが確定処理がまだ | warning | periodEnd + N日目から毎日。monthlyPayroll.status == "draft" の間のみ（confirmed/paid/hold で停止） |
| 4 | `payroll_payment_overdue` | 支払日を過ぎても未払い staff がいる | strong_warning | paymentDate + 1日から毎日。monthlyPayroll.status == "confirmed" の間のみ（hold/paid で停止） |
| 5 | `payroll_hold_reminder` | 保留中の支払いがある | report | 毎週月曜。monthlyPayroll.status == "hold" の間のみ（全員 paid で停止） |

**N = `reminderStartDaysAfterPeriodEnd`**（storeMeta/payrollConfig。デフォルト 3）

**リマインドの流れ**:
```
periodEnd
  ↓
  +1日: payroll_period_start（1回）
  ↓
  +N日〜: payroll_calc_remind（毎日、計算が実行されるまで）
  ↓
  計算実行 → payroll_calc_remind 停止
  ↓
  +N日〜: payroll_confirm_remind（毎日、確定されるまで）
  ↓
  確定 → payroll_confirm_remind 停止
  ↓
  paymentDate+1日〜: payroll_payment_overdue（毎日、status == "confirmed" の間）
  ↓
  全 staff paid/hold → payroll_payment_overdue 停止
  ↓
  status == "hold": payroll_hold_reminder（毎週月曜、hold staff がいる限り）
  ↓
  全 staff paid → payroll_hold_reminder 停止
```

**通知種別の昇格**: `payroll_calc_remind` は通常 `warning` だが、支払日の3日前からは `strong_warning` に昇格する。

#### 2-2. イベント駆動の通知（インライン）

| # | triggerType | 説明 | 通知種別 | 作成場所 |
|---|------------|------|---------|---------|
| 6 | `payroll_run_completed` | 計算が全 staff 成功で完了 | report | finalizePayrollRun 内 |
| 7 | `payroll_run_completed_with_errors` | 計算が一部 staff 失敗で完了 | error | finalizePayrollRun 内 |
| 8 | `payroll_run_failed` | 計算が致命的エラーで失敗 | error | executeMonthlyPayroll 内（status = "failed" 設定時） |
| 9 | `payroll_attendance_corrected` | 確定済み期間の勤怠が修正された | warning | attendance onWrite トリガー内 |

**イベント駆動通知の冪等性**: イベント駆動通知はイベント発生ごとに1回作成されるため、ドキュメント ID には `{triggerType}_{runId}` や `{triggerType}_{attendanceId}_{timestamp}` を使用する。同一イベントからの重複作成は関数内のガード処理で防止する。

### 3. スケジューラーのアーキテクチャ

#### 3-1. コスト最小化の方針【確定】

payroll 関連の通知用スケジューラーは **1つのみ** とする。スケジューラーの数がコストに直結するため、通知種別ごとに別々のスケジューラーは作らない。

#### 3-2. 実行フロー【確定】

```
┌────────────────────────────────────────────────────────────┐
│ Cloud Scheduler（1日1回、固定時刻 06:00 JST）              │
│   ↓                                                        │
│ payrollNotificationScheduler（Cloud Function）              │
│   - payrollConfig.schedulerNotificationHour を読み取り      │
│   - Cloud Task を投入（scheduleTime = 当日の設定時刻 JST）  │
│   ↓                                                        │
│ processPayrollNotifications（onTaskDispatched）             │
│   - 対象期間（当月・前月・前々月）を特定                    │
│   - 各期間の monthlyPayroll の状態を確認                    │
│   - 通知条件を評価                                          │
│   - 必要な通知を作成（冪等キーで重複防止）                  │
└────────────────────────────────────────────────────────────┘
```

**Cloud Scheduler**: 毎日 06:00 JST に固定。デプロイ時に設定する。

**payrollNotificationScheduler**: Cloud Scheduler から起動される。`payrollConfig.schedulerNotificationHour`（デフォルト 10）を読み取り、`processPayrollNotifications` タスクを `scheduleTime = 当日の schedulerNotificationHour:00 JST` で投入する。設定時刻が既に過ぎている場合は即時実行される（Cloud Tasks の仕様）。

**processPayrollNotifications**: Cloud Task として実行される。全ての通知条件を1つのタスク内で評価し、必要な通知を作成する。

#### 3-3. processPayrollNotifications の処理詳細

```
1. payrollConfig を読み取り
2. storeConfig (payroll.startDay/endDay) を読み取り
3. 対象期間を特定:
   - currentPeriod: 現在の給与期間
   - previousPeriod: 前回の給与期間
   - 必要に応じて前々月も
4. 各期間の monthlyPayroll ドキュメントを読み取り

5. 条件評価 & 通知作成（各条件を順に評価）:

   [payroll_period_start]
   - currentPeriod の periodEnd + 1日 == today?
   - monthlyPayroll が存在しない or latestRunId == null?
   → 通知作成

   [payroll_calc_remind]
   - previousPeriod の periodEnd + N日 <= today?
   - monthlyPayroll.latestRunId == null?（計算未実行）
   → 通知作成（支払日3日前からは strong_warning）

   [payroll_confirm_remind]
   - previousPeriod の periodEnd + N日 <= today?
   - monthlyPayroll.latestRunId != null（計算済み）
   - monthlyPayroll.status == "draft"（計算済みだが未確定）
   → 通知作成

   [payroll_payment_overdue]
   - paymentDate + 1日 <= today?
   - monthlyPayroll.status == "confirmed"
     （= 未払いの staff がまだ存在する状態。hold/paid では発火しない）
   → 通知作成

   [payroll_hold_reminder]
   - today が月曜?
   - monthlyPayroll.status == "hold"
     （= 全 staff が paid/hold で、hold が1名以上の状態）
   → 通知作成
```

#### 3-4. 通知の重複抑止（冪等キー）【確定】

スケジューラー経由の通知は、ドキュメント ID を**冪等キー**として使用する。

```
冪等キー = {triggerType}_{paymentPeriodKey}_{YYYY-MM-DD}
```

例: `payroll_calc_remind_2026-03-26_2026-04-25_2026-04-05`

通知作成は `doc(冪等キー).set()` で行う。同一キーのドキュメントが既に存在する場合は上書き（実質的に同一内容のため問題なし）。スケジューラーが同日に複数回実行されても重複通知は発生しない。

### 4. 既存 monthlyPayrollTrigger の変更【確定】

- 現在の monthlyPayrollTrigger は計算実行を行っているが、Phase4.3 では `payrollNotificationScheduler` + `processPayrollNotifications` に置き換える
- **初期リリースではスケジューラーからの自動計算実行は行わない**
- 将来的に自動計算を導入する場合は、processPayrollNotifications 内から executeMonthlyPayroll Callable と同じフロー（run 作成 → Cloud Tasks 投入）を経由する。`triggerSource = "scheduler"` で手動実行と区別する

#### 期間計算の修正（phase4_2 から継承）【確定】

| 条件 | 対象期間 |
|------|----------|
| 実行日 ≥ endDay | 前月 startDay 〜 今月 endDay |
| 実行日 < endDay | 前々月 startDay 〜 前月 endDay |

### 5. 通知の Callable / API

#### 5-1. 通知取得【確定】

- adminHome 表示時に通知一覧を取得
- フィルター: operationCategory、種別、未読/既読、フラグ
- クエリ条件: `createdAt >= 2ヶ月前`
- ソート: createdAt DESC
- ページネーション: 必要に応じて
- **実装方式**: Flutter から Firestore を直接クエリ（Callable 不要）

#### 5-2. 通知更新【確定】

- 未読 → 既読（isRead = true）
- フラグ付け / 解除（isFlagged）
- **実装方式**: Flutter から Firestore を直接更新（通知の更新はセキュリティルールで admin のみに制限）
- **04_CALLABLE_API_SPEC の共通原則の例外**: 通知の状態更新（isRead, isFlagged）は給与計算データの整合性に影響しない UI 状態の管理であるため、Flutter から Firestore を直接更新する。Firestore セキュリティルールで admin のみに制限することで安全性を確保する。

#### 5-3. 通知作成（内部のみ）【確定】

- スケジューラー（processPayrollNotifications）や Cloud Functions 内部から作成
- Flutter からの直接作成は行わない
- 共通関数 `createPayrollNotification(triggerType, params)` を用意:
  1. テンプレートからtitle/bodyを生成
  2. 冪等キーを生成（スケジューラー経由の場合）
  3. `notifications` ドキュメントを作成

---

## 確定済み事項一覧

| # | 項目 | 決定内容 |
|---|------|----------|
| 1 | 通知コレクション名 | `notifications`。operationCategory = "payroll" で区別（03_DATA_MODEL_SPEC セクション3参照） |
| 2 | アーカイブ方式 | データ移動は行わない。取得クエリで `createdAt >= 2ヶ月前` を条件とする。将来的に Firestore TTL ポリシーで自動削除を検討可能 |
| 3 | 通知の頻度・タイミング | schedulerNotificationHour（payrollConfig、デフォルト10:00 JST）に統一。スケジューラーは1日1回。セクション2-1参照 |
| 4 | リマインド開始日 | periodEnd + reminderStartDaysAfterPeriodEnd（payrollConfig、デフォルト3日）。計算リマインド → 確定リマインド → 支払い警告の順に遷移 |
| 5 | 保留中の低頻度通知 | 毎週月曜。hold 状態の monthlyPayroll が存在する限り継続 |
| 6 | 通知の拡張フィールド | 現時点では追加しない。LINE・メール対応時に channel / recipients を追加する |
| 7 | 通知の重複抑止 | ドキュメント ID を冪等キーとして使用。`{triggerType}_{paymentPeriodKey}_{YYYY-MM-DD}` |
| 8 | 通知テンプレート | 初期リリースから導入。Cloud Functions 内の定数マップ + パラメータ置換 |
| 9 | プッシュ通知 | 初期リリースでは対応しない。将来的に FCM 送信を追加可能 |
| 10 | スケジューラーアーキテクチャ | 1つの Cloud Scheduler → 1つの Cloud Task（processPayrollNotifications）。コスト最小化 |

---

## 未確定事項一覧

すべて確定済み。未確定事項なし。

---

## 懸念事項一覧

すべて解消済み。残存する懸念事項なし。

---

## 改善要素一覧

| # | 項目 | 説明 | 状態 |
|---|------|------|------|
| 1 | プッシュ通知 | adminHome 内の表示のみ → 将来的に FCM プッシュ通知を追加。通知作成時に FCM 送信を並行実行する形で対応可能 | 将来対応 |
| 2 | 自動計算実行 | スケジューラーから自動で executeMonthlyPayroll を起動する機能。triggerSource = "scheduler" で手動と区別 | 将来対応 |
