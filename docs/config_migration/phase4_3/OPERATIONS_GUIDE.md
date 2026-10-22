# Phase4.3 運用ガイド

**作成日**: 2026-03-22
**ステータス**: ドラフト（各ステップの実装完了時に追記）

---

## Step 01: 基盤・設定整備

### storeMeta/payrollConfig の初期化

`initializeStoreConfigCallable` の呼び出しにより、`storeMeta/payrollConfig` が自動作成される。
既存環境では初回アプリ起動時にこの Callable が呼ばれ、不足フィールドがデフォルト値で補完される。

#### デフォルト値一覧

| フィールド | デフォルト値 | 説明 |
|---|---|---|
| `paymentDate` | `null` | 支払日（未設定 = 常時計算可能） |
| `bulkPaymentRegistrationEnabled` | `false` | 一括支払い登録の有効化 |
| `expectedRange` | `null` | 異常値チェック用の期待範囲 |
| `maxCandidatesCount` | `1000` | 候補取得の最大件数 |
| `weekStartDay` | `0`（日曜） | 法定週の開始曜日 |
| `weeklyLegalLimitMinutes` | `2400`（40h） | 週の法定労働時間上限 |
| `legalHolidayWeekday` | `null`（判定なし） | 法定休日の曜日 |
| `calcVersion` | `'1.0'` | 計算バージョン |
| `nightPremiumRate` | `0.25` | 深夜割増率 |
| `overtimePremiumRate` | `0.25` | 残業割増率 |
| `over60PremiumRate` | `0.25` | 月60h超割増率 |
| `legalHolidayPremiumRate` | `0.35` | 法定休日割増率 |
| `roundingMethod` | `'floor'` | 端数処理方法 |
| `roundingPrecision` | `1` | 端数処理の桁 |
| `schedulerNotificationHour` | `10` | 通知配信時刻（JST） |
| `reminderStartDaysAfterPeriodEnd` | `3` | リマインド開始日数 |

#### 設定変更方法

Firestore Console で `storeMeta/payrollConfig` のフィールドを直接編集する。
アプリは `PayrollConfigService` でリアルタイム購読しているため、変更は即座に反映される。
Cloud Functions 側は `getPayrollConfig()` を毎回呼び出すため、次回の Callable 実行から新値が適用される。

> **注意**: `storeMeta/config` の `payroll.startDay` / `payroll.endDay` は Phase4.3 でも引き続き使用する。
> これらは `payrollPeriodUtils` 内で `storeMeta/config` から読み取られる（将来的に管理 UI で読み取り専用にすることを推奨）。

#### トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| payrollConfig が存在しない | `initializeStoreConfigCallable` 未実行 | アプリ再起動 or 手動で Callable を呼び出す |
| デフォルト値が使われてしまう | フィールド名のタイポ / 型不一致 | Cloud Functions のログで `config_fallback` ワーニングを確認 |
| Flutter 側で latest が null | アプリ起動直後のタイミング | `stream` で await するか、`fromDefaults()` をフォールバックに使用 |

---

## Step 02: attendance フィールド追加 & onWrite トリガー

### attendance の新フィールド

attendance 作成・更新時に onWrite トリガーが自動で以下のフィールドを付与する。

| フィールド | 算出元 | 説明 |
|---|---|---|
| `weekday` | `date` | 曜日（0=日曜〜6=土曜） |
| `weekStartDate` | `date` + `payrollConfig.weekStartDay` | 法定週の開始日（YYYY-MM-DD） |
| `paymentPeriodKey` | `date` + `config.payroll.startDay/endDay` | 帰属給与期間キー |
| `payrollStatus` | トリガーロジック | `unreflected` → `reflected` → `corrected_after_reflection` |
| `reflectedPayrollRunId` | confirmPayrollRun 時に設定 | 反映した payroll runId |
| `reflectedAt` | confirmPayrollRun 時に設定 | 反映日時 |

#### nightWorkMinutes の休憩控除

退勤時（`recalculateAttendanceFromBreaks`）に深夜帯（nightWorkStartHour〜nightWorkEndHour）と休憩時間の重複分を控除する。
`nightMinutes` は従来通り休憩未控除の拘束ベース。

#### トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| 新規 attendance に weekday 等がない | onWrite トリガーが無効 | Firebase Console でトリガーのデプロイ状況を確認 |
| payrollStatus が corrected にならない | reflected でない attendance を編集 | payrollStatus が reflected の attendance のみ遷移対象 |
| nightWorkMinutes が休憩未控除 | 過去データの遡及なし | 再退勤（clockOut）or 修正申請承認で再計算される |

---

## Step 03: 対象データ抽出（getPayrollCandidates）

### 概要

`getPayrollCandidates` Callable は `paymentPeriodKey` を指定して呼び出すと、attendance を 3 グループに分類して返す。

| グループ | 条件 | reasonType |
|---------|------|-----------|
| group1 | 期間内 + 退勤済 + 非削除 + unreflected/corrected | `in_period` |
| group2 | 期間外 + 退勤済 + 非削除 + unreflected/corrected | `carry_over` |
| group3 | 期間内 + (未退勤 or 論理削除) | `other` |

### 利用上の注意

- **admin 権限必須**: admin 以外のデバイスからは `permission-denied` エラー
- **件数制限**: `maxCandidatesCount`（デフォルト 1000）を超える場合、group3 → group2 → group1 の優先度で切り詰め
- **前提条件**: attendance に `paymentPeriodKey` / `payrollStatus` が設定済みであること（Step 02 の onWrite トリガーが正常動作していること）

### トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| group1 が空 | attendance に paymentPeriodKey が未設定 | onWrite トリガーのデプロイ状況を確認。既存データは一度更新すればトリガーが発火する |
| group2 に期待する attendance がない | payrollStatus が reflected | 既に反映済みの attendance はキャリーオーバー対象外 |
| payroll-config-not-found エラー | payrollConfig が未設定 | `initializeStoreConfigCallable` を実行して初期化 |

---

## Step 04: コア計算エンジン（payrollCalcEngine）

### 概要

`payrollCalcEngine.ts` は Firestore 非依存の純粋関数モジュール。`calculateStaffPayroll()` に attendance 配列と config snapshot を渡すと、staff 単位の集計結果・金額・明細を返す。

### 注意事項

- 法定休日の attendance は週間残業計算から完全除外（weeklyRegularRunning に加算しない）
- 月跨ぎ週では前期・翌期の参照 attendance も含めて週間残業を計算する（二重計上防止）
- 端数処理は config の `roundingMethod` / `roundingPrecision` に従う

---

## Step 05: 分散実行（executeMonthlyPayroll + processStaffPayroll + finalizePayrollRun）

### 実行フロー概要

```
UI → executeMonthlyPayroll（Callable）
      ├── payrollRuns ドキュメント作成（status: preparing）
      ├── staff ごとに staffResults 作成 + Cloud Tasks 投入
      └── status → processing

Cloud Tasks → processStaffPayroll（onTaskDispatched × N staff）
      ├── attendance 取得 + 計算実行
      ├── attendanceItems 書き込み
      ├── staffResults 更新 + completedStaffCount インクリメント（トランザクション）
      └── 全員完了時 → finalizePayrollRun を dispatch

Cloud Tasks → finalizePayrollRun（onTaskDispatched × 1）
      ├── staffResults 全件読み取り + サマリ集計
      ├── anomalyFlags 生成（現在スタブ）
      ├── payrollRuns 更新（completed / completed_with_errors）
      └── monthlyPayroll 更新（status: draft, latestRunId 設定）
```

### 呼び出し方法

```typescript
// Flutter 側から executeMonthlyPayroll を呼び出す
final result = await functions.httpsCallable('executeMonthlyPayroll').call({
  'paymentPeriodKey': '2025-01-26_2025-02-25',
  'attendanceIds': ['att-1', 'att-2', ...],
});
// result.data => { runId, paymentPeriodKey, targetStaffCount, status: 'processing' }
```

### ステータス遷移

| payrollRuns.status | 条件 |
|---|---|
| `preparing` | run 作成直後 |
| `processing` | Cloud Tasks 投入完了 |
| `aggregating` | finalizePayrollRun 開始 |
| `completed` | 全 staff 成功 |
| `completed_with_errors` | 一部 staff 失敗 |

### 冪等性

- `processStaffPayroll`: taskStatus が `completed` なら早期 return
- `finalizePayrollRun`: status が `completed` / `completed_with_errors` なら早期 return
- Cloud Tasks のリトライ設定: maxAttempts=3, minBackoff=10s

### トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| run が processing のまま進まない | Cloud Tasks が配信されていない | GCP Console で Cloud Tasks キューの状態を確認 |
| staffResult が failed | 計算中にエラー発生 | staffResult.taskError フィールドにエラーメッセージあり。Step 06 の retryFailedStaffTasks で再試行可能 |
| completed_with_errors | 一部 staff の計算が失敗 | 失敗した staffResult を特定し原因を確認。attendance データの不備（clockOut 未設定等）が多い |
| monthlyPayroll が作成されない | finalizePayrollRun が未実行 | payrollRuns の completedStaffCount + failedStaffCount < targetStaffCount の可能性。手動で finalizePayrollRun を dispatch |
| already-confirmed エラー | 既に confirmed/paid の期間で再計算しようとした | confirmed の不変性を維持。万が一の場合は Firestore コンソールから手動で status を draft に戻す |

---

## Step 06: 確定・再実行・中止（confirmPayrollRun / retryFailedStaffTasks / cancelPayrollRun）

### confirmPayrollRun

計算完了（`completed`）した run を確定する。`completed_with_errors` は確定不可（全 staff 成功が必要）。

**処理内容**:
1. 全 staffResults → attendanceItems → attendanceId 収集
2. attendance の payrollStatus を `reflected` に更新（400件バッチ分割）
3. CO 分は元期間の confirmed staffResults に `deferredAttendances` 追記
4. 全 staffResults の paymentStatus を `unpaid` に初期化
5. monthlyPayroll.status → `confirmed`
6. attendanceLogs 書き込み

**呼び出し例**:
```typescript
final result = await functions.httpsCallable('confirmPayrollRun').call({
  'paymentPeriodKey': '2025-01-26_2025-02-25',
  'runId': 'optional-specific-run-id',  // 省略時は latestRunId
});
```

### retryFailedStaffTasks

`completed_with_errors` の run で失敗した staff のみ再計算する。

**処理内容**:
1. taskStatus == `failed` の staff を抽出
2. taskStatus → `pending` にリセット、Cloud Task 再投入
3. run.status → `processing`, failedStaffCount → 0

### cancelPayrollRun

`preparing` / `processing` の run を中止する。既に投入済みの Cloud Tasks は processStaffPayroll が status チェックして自動 skip。

### トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| run-not-completed エラー | run.status が completed でない | completed_with_errors の場合は retryFailedStaffTasks で再試行後に再度 confirm |
| already-confirmed エラー | 既に確定済み | 確定後の再確定は不可。Firestore コンソールで status を draft に戻す（非推奨） |
| invalid-run-status エラー（cancel） | completed/cancelled 等の run をキャンセルしようとした | preparing/processing の run のみキャンセル可能 |
| CO の deferredAttendances が記録されない | 元期間が confirmed でない or latestRunId が不正 | 元期間の monthlyPayroll.status と latestRunId を確認 |
| confirmPayrollRun がタイムアウト | attendance 件数が非常に多い | バッチ分割は 400件ごとだが、attendanceLogs の書き込みが件数分発生。将来的にバッチ化推奨 |

---

## Step 07: 支払い管理（registerPaymentStatus）

### registerPaymentStatus

確定（confirmed）済みの期間に対して、staff ごとに支払い済み（paid）/ 保留（hold）を登録する。

**処理フロー**:
1. monthlyPayroll.status が `confirmed` or `hold` であることを確認
2. entries に含まれる staff の paymentStatus を更新
3. 全 staffResults の paymentStatus を集計し monthlyPayroll.status を自動更新

**paymentStatus 遷移ルール**:
| 現在 | → paid | → hold |
|------|--------|--------|
| unpaid | OK | OK |
| hold | OK | skip（変更なし） |
| paid | reject（スキップ） | reject（スキップ） |

**monthlyPayroll.status 自動遷移**:
```
全 staff paid → "paid"（paidAt 設定）
全 staff paid/hold（hold あり）→ "hold"
unpaid 残存 → "confirmed"（変更なし）
```

**呼び出し例**:
```typescript
final result = await functions.httpsCallable('registerPaymentStatus').call({
  'paymentPeriodKey': '2025-01-26_2025-02-25',
  'entries': [
    { 'staffId': 'staff001', 'status': 'paid' },
    { 'staffId': 'staff002', 'status': 'hold' },
  ],
});
// result: { updatedCount: 2, monthlyPayrollStatus: "confirmed" }
```

**一括支払い**: entries に全 staff を含めて `status: "paid"` で送信すると一括支払い登録。monthlyPayroll.status は `"paid"` に自動遷移する。

### トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| not-confirmed エラー | monthlyPayroll.status が draft | 先に confirmPayrollRun で確定する |
| already-paid エラー | 全 staff が支払い済み | 追加操作は不要 |
| staff-already-paid（スキップ） | 個別 staff が既に paid | その staff はスキップされ、他の entries は正常処理される |
| monthlyPayroll.status が "hold" のまま | hold の staff が残っている | hold → paid を登録して全員 paid にする |
| registerPaymentStatus がタイムアウト | entries が非常に多い | 一括送信を複数回に分割する（各回で monthlyPayroll.status は自動集計される） |

---

## Step 08: 計算タブ UI（Flutter）

### 概要

`lib/payroll/` に給与計算画面を実装。`adminHomePage` の「給与計算」ボタンから `PayrollCalcPage` に遷移する。

### 画面構成

```
PayrollCalcPage
├── TabBar: ["計算", "結果"]
├── CalcTab（計算用タブ）
│   ├── 対象データ抽出ボタン → getPayrollCandidates 呼び出し
│   ├── CandidateSection × N（属性別折りたたみ）
│   │   └── チェックボックス付きリスト
│   ├── PreviewSummary（集計プレビュー + expectedRange 警告）
│   ├── 計算実行ボタン → executeMonthlyPayroll 呼び出し
│   ├── ProgressView（Firestore snapshots でリアルタイム進捗）
│   └── ErrorView（completed_with_errors 時の失敗一覧）
└── ResultTab（結果タブ — Step 09 で実装）
```

### PayrollCallableService

`lib/payroll/services/payroll_callable_service.dart` に Callable 呼び出しを集約。

| メソッド | 対応 Callable | 用途 |
|---------|-------------|------|
| `getPayrollCandidates` | getPayrollCandidates | 候補抽出 |
| `executeMonthlyPayroll` | executeMonthlyPayroll | 計算実行 |
| `retryFailedStaffTasks` | retryFailedStaffTasks | 失敗分再実行 |
| `cancelPayrollRun` | cancelPayrollRun | 中止 |

### 状態遷移（CalcTab）

```
idle → loading → candidatesLoaded → running → (completed / error)
                                        ↑ retryFailed
```

### 重要な UI 動作

- **属性1（in_period）のチェック外し**: 確認ダイアログ表示後にのみ外せる
- **expectedRange 超過時の警告**: PreviewSummary に黄色アイコン + 警告メッセージ
- **進捗バー**: Firestore リアルタイム（completedStaffCount / targetStaffCount）
- **計算完了時**: 自動で結果タブへ切り替え（Step 09 実装後に有効化）
- **completed_with_errors 時**: ErrorView で失敗一覧表示 + 再実行ボタン

### paymentPeriodKey の計算

`StoreConfigService` から `payrollStartDay` / `payrollEndDay` を読み取り、`DateTime.now()` を基準に自動計算。

### トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| 抽出ボタン押下後にエラー | admin 権限がない or payrollConfig 未初期化 | デバイスの role 確認、initializeStoreConfigCallable 実行 |
| 進捗バーが動かない | Cloud Tasks が配信されていない | GCP Console でキュー状態を確認（Step 05 トラブルシューティング参照） |
| 計算後に結果タブが空 | monthlyPayroll ドキュメント未作成 or latestRunId 未設定 | 計算が正常に完了しているか確認（Step 05 参照） |
| expectedRange 警告が表示されない | payrollConfig.expectedRange が null | Firestore Console で expectedRange を設定する |

---

## Step 09: 計算結果タブ & 支払い管理 UI（Flutter）

### 概要

結果タブで計算結果のサマリ・staff カード・詳細・確定・CSV エクスポート・支払い管理を提供。

### 画面構成

```
ResultTab（結果タブ）
├── PastResultsSelector（過去結果セレクタ：月切り替え）
├── 警告バナー（completed_with_errors 時）
├── ResultSummary（サマリ: staff数、総支給額、時間集計、anomalyFlags）
├── StaffCard × N（カード一覧: 割増アイコン、CO 表示、grossPay==0 非表示）
│   └── → StaffDetailPage（詳細: 基本情報、集計値、金額内訳、attendanceItems 明細）
├── ConfirmSection（確定ボタン: completed 時のみ有効）
└── PaymentManagement（支払い管理: confirmed/hold/paid 時に表示）
    ├── ステータス表示（paid/hold/confirmed 進捗）
    ├── 支払日超過警告
    ├── 一括支払いボタン（bulkPaymentRegistrationEnabled 時のみ）
    └── staff ごとの paid/hold ボタン
```

### PayrollCallableService 追加メソッド

| メソッド | 対応 Callable | 用途 |
|---------|-------------|------|
| `confirmPayrollRun` | confirmPayrollRun | 確定 |
| `registerPaymentStatus` | registerPaymentStatus | 支払い登録 |

### CSV エクスポート

- 手動で CSV 文字列を生成（`csv` パッケージ不使用）
- UTF-8 BOM 付きでテンポラリファイル保存（Excel 互換）
- `share_plus` でシェアシート表示
- 15列: スタッフ名、時給、各種時間、各種金額、キャリーオーバー支給額、総支給額

### トラブルシューティング

| 症状 | 原因 | 対応 |
|---|---|---|
| 結果タブが空 | monthlyPayroll ドキュメント未作成 or latestRunId 未設定 | 計算が正常完了しているか確認 |
| 確定ボタンが押せない | run.status が completed でない | completed_with_errors の場合は計算タブから再実行 |
| CSV 出力でエラー | テンポラリディレクトリへのアクセス失敗 | アプリのストレージ権限を確認 |
| 支払い管理が表示されない | monthlyPayroll.status が draft | 先に確定を行う |
| 一括支払いボタンがない | payrollConfig.bulkPaymentRegistrationEnabled が false or 未設定 | Firestore Console で true に設定 |
| 支払日超過警告が表示されない | payrollConfig.paymentDate が null | Firestore Console で paymentDate を設定 |
| 過去結果セレクタが表示されない | monthlyPayroll ドキュメントが1件以下 | 2件以上の期間が存在する場合にのみ表示 |

---

## Step 10: 通知・スケジューラー

### 概要

給与計算ワークフローの各段階で適切な通知を生成し、adminHome で確認できる仕組みを構築する。

### 通知の種類

#### スケジューラー経由（毎日 1 回、条件判定）

| # | triggerType | 説明 | 通知種別 | 条件 |
|---|------------|------|---------|------|
| 1 | `payroll_period_start` | 計算可能期間に入った | report | periodEnd + 1日。1回のみ |
| 2 | `payroll_calc_remind` | 計算未実行 | warning / strong_warning | periodEnd + N日目から。支払日3日前で昇格 |
| 3 | `payroll_confirm_remind` | 計算済みだが未確定 | warning | periodEnd + N日目から。draft の間のみ |
| 4 | `payroll_payment_overdue` | 支払日超過 | strong_warning | paymentDate + 1日から。confirmed の間のみ |
| 5 | `payroll_hold_reminder` | 保留中の支払い | report | 毎週月曜。hold の間のみ |

**N = `payrollConfig.reminderStartDaysAfterPeriodEnd`**（デフォルト 3）

#### イベント駆動（即時作成）

| # | triggerType | 説明 | 作成場所 |
|---|------------|------|---------|
| 6 | `payroll_run_completed` | 計算が全 staff 成功で完了 | finalizePayrollRun |
| 7 | `payroll_run_completed_with_errors` | 計算が一部失敗で完了 | finalizePayrollRun |
| 8 | `payroll_run_failed` | タスクディスパッチ失敗 | executeMonthlyPayroll |
| 9 | `payroll_attendance_corrected` | 確定済み期間の勤怠修正 | attendanceOnWrite |

### スケジューラーアーキテクチャ

```
Cloud Scheduler (毎日 06:00 JST)
  ↓
payrollNotificationScheduler
  - payrollConfig.schedulerNotificationHour を読み取り（デフォルト 10）
  - scheduleTime = 当日の設定時刻 JST で Cloud Task 投入
  ↓
processPayrollNotifications (onTaskDispatched)
  - 対象期間（直近の完了期間）を特定
  - monthlyPayroll の状態を確認
  - 5種の通知条件を評価
  - 必要な通知を作成（冪等キーで重複防止）
```

### 冪等キー

| 種別 | キー形式 | 例 |
|------|---------|---|
| スケジューラー | `{triggerType}_{paymentPeriodKey}_{YYYY-MM-DD}` | `payroll_calc_remind_2026-02-26_2026-03-25_2026-04-01` |
| イベント駆動 | `{triggerType}_{runId}` | `payroll_run_completed_abc123` |
| 勤怠修正 | `{triggerType}_{attendanceId}_{timestamp}` | `payroll_attendance_corrected_att1_1711000000000` |

### Flutter 通知 UI

- **adminHome**: AppBar に通知ベルアイコン + 未読バッジ（StreamBuilder でリアルタイム更新）
- **通知一覧画面**: `PayrollNotificationListPage`
  - Firestore `notifications` コレクションを直接クエリ（`operationCategory == 'payroll'`、`createdAt >= 2ヶ月前`）
  - フィルター: すべて / 未読のみ / フラグ付き
  - タップで既読化（`isRead = true`）
  - 長押しでフラグ付け/解除（`isFlagged` トグル）
  - 通知種別に応じたアイコン・色（report=青、warning=橙、strong_warning=深橙、error=赤）

### 設定項目

| フィールド | 場所 | デフォルト | 説明 |
|-----------|------|-----------|------|
| `schedulerNotificationHour` | `storeMeta/payrollConfig` | `10` | 通知配信時刻（JST、0〜23） |
| `reminderStartDaysAfterPeriodEnd` | `storeMeta/payrollConfig` | `3` | periodEnd からリマインド開始までの日数 |

### 既存 monthlyPayrollTrigger との関係

旧スケジューラー `monthlyPayrollTrigger` のコードは残す。`schedulerConfig.monthlyPayrollTriggerEnabled` が false（デフォルト）のため既にスキップされている。新しい `payrollNotificationScheduler` が通知専用の代替として機能する。

### トラブルシューティング

| 症状 | 原因 | 対応 |
|------|------|------|
| 通知が作成されない（スケジューラー） | Cloud Scheduler 未設定 or payrollNotificationScheduler 未デプロイ | Firebase Console / GCP Console で確認 |
| 通知時刻がずれる | schedulerNotificationHour の設定が異なる | storeMeta/payrollConfig を確認 |
| 同日に通知が重複する | 冪等キーの doc.set() で上書きのため重複は発生しない | 通知が複数ある場合は期間やタイプが異なる別通知 |
| 通知ベルのバッジが 0 のまま | Firestore インデックス未作成 | `notifications` コレクションの複合インデックスを確認 |
| 通知一覧が空 | operationCategory != 'payroll' or createdAt が 2ヶ月以上前 | Firestore Console で通知ドキュメントの内容を確認 |
| corrected 通知に staffName が「不明」 | staffs コレクションに fullName がない | staff ドキュメントの fullName フィールドを確認 |
