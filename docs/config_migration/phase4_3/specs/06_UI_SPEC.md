# 06: UI 仕様

**ステータス**: 確定（phase4_2 から継承 + 残業・休日・分散実行対応に伴う表示項目の追加・齟齬修正完了）

---

## 仕様概要

Flutter の画面設計。adminHome からの遷移、計算用タブ、計算結果タブ、支払い管理の UI を定義する。Phase4_2 で確定済みの仕様を継承し、残業・休日労働・60h超対応に伴う表示項目の追加を反映する。

---

## 仕様詳細

### 1. adminHome へのメニュー追加【確定】

- adminHome に「給与計算」メニューを追加する
- メニュー押下で給与計算専用画面に遷移する

### 2. 給与計算画面のタブ構成【確定】

| タブ | 内容 |
|------|------|
| 1つ目: 計算用 | 計算対象 attendances の表示・選択・計算実行 |
| 2つ目: 計算結果 | サマリ・staff ごとの給与カード・詳細・確定・エクスポート・過去結果参照 |

### 3. 計算用タブ

#### 3-1. 属性の定義と表示【確定】

| 属性 | 説明 | チェック | 表示順 |
|------|------|---------|--------|
| 属性1 | 期間内の attendance | デフォルト ON、一括選択可 | 3番目（下） |
| 属性2 | 期間外だが前回未反映 | デフォルト ON、一括選択可 | 2番目（中）・要確認として上に表示 |
| 属性3 | 期間内だが未退勤 or 論理削除 | 表示のみ、チェック不可 | 1番目（上） |

- 各属性セクションは折りたたみ可能。**折り畳まれた状態がデフォルト**
- 各 attendance に reasonType / reasonLabel を表示
- **属性1のチェックマークは原則外せない**。外す場合は確認ダイアログを突破する必要がある

reasonType / reasonLabel:

| 属性 | reasonType | reasonLabel |
|------|------------|-------------|
| 属性1 | `in_period` | 「期間内の正常勤怠データ」 |
| 属性2 | `carry_over` | 「先月分以前の未反映データ（キャリーオーバー）」 |
| 属性3（未退勤） | `other` | 「期間内の未退勤のため計算対象外データ」 |
| 属性3（論理削除） | `other` | 「期間内の削除済のため計算対象外データ」 |

#### 3-2. 集計プレビュー【確定】

計算実行前に、選択中の attendances から以下を表示する:
- attendance 件数（各属性「全件数 / 選択件数」XX/YY 形式）
- 合計時間
- expectedRange の件数・時間から外れている場合は警告表示（実行は可能）
  - チェック対象: attendanceCountMin/Max, totalHoursMin/Max（02_CONFIG_SPEC セクション3参照）
  - 金額チェック（estimatedAmountMin/Max）はプレビュー段階では行わない（金額を計算しないため）

金額は表示しない。プレビューの目的は対象データの件数・時間が大きく外れていないかを確認することであり、正確な金額は計算実行後に確定する。

集計は **UI 側でローカルに行う**。Callable は group1/2/3 を返すのみ。

#### 3-3. 計算対象期間・計算可能期間【確定】

- 計算対象期間は storeMeta/config の payroll.startDay / endDay で算出（SSOT）
- 計算可能期間は payrollConfig の paymentDate から導出
- 期間内であればボタン表示、期間外であれば「現在、給与計算可能期間ではないため、対象の抽出が行えません」と表示
- 給与期間終了後は何回でも計算可能（確定前まで）
- 計算のたびに新規 payrollRun を作成

#### 3-4. 確定後の再計算【確定】

- 確定後は当該期間の再計算を行えない

#### 3-5. 対象データの抽出【確定】

- 「対象データの抽出を開始する」ボタン押下で getPayrollCandidates Callable を起動
- 返却されたデータを属性別に表示

#### 3-6. 給与計算実行【確定】

- 選択した attendanceIds を executeMonthlyPayroll に渡す
- executeMonthlyPayroll は即座にレスポンスを返す（計算結果は含まない）
- レスポンス受信後、計算進捗表示（セクション3-7）に遷移

#### 3-7. 計算進捗表示【確定】

executeMonthlyPayroll 呼び出し後、payrollRuns/{runId} ドキュメントを Firestore `snapshots()` でリアルタイムリスニングし、進捗を表示する。

**進捗バー**:

```
┌─────────────────────────────────────┐
│  給与計算 実行中                      │
│  ████████████░░░░░░░░  15/30 (50%)  │
│                                      │
│  [中止]                              │
└─────────────────────────────────────┘
```

- 進捗 = `(completedStaffCount + failedStaffCount) / targetStaffCount`
- 失敗分も「処理済み」としてカウントし、進捗バーが止まらないようにする

**status ごとの表示切替**:

| payrollRuns.status | 表示 |
|-------------------|------|
| `preparing` | 「準備中...」（スピナー） |
| `processing` | 進捗バー + 「計算中... {completed}/{target} スタッフ完了」 |
| `aggregating` | 「集計中...」（スピナー） |
| `completed` | 計算結果タブへ自動遷移 |
| `completed_with_errors` | エラー表示（セクション3-8）へ遷移 |
| `failed` | エラーメッセージ + 「再実行」ボタン |
| `cancelled` | 「中止されました」+ 「再実行」ボタン |

**中止ボタン**: preparing または processing 中に表示。押下で cancelPayrollRun Callable を呼び出す（04_CALLABLE_API_SPEC セクション7参照）。

#### 3-8. エラー表示・再実行【確定】

completed_with_errors 時に表示する。

```
┌─────────────────────────────────────┐
│  ⚠ 2名のスタッフの計算に失敗しました  │
│                                      │
│  ・田中太郎: タイムアウト              │
│  ・鈴木花子: データ不整合              │
│                                      │
│  [失敗分を再実行]  [詳細を確認]       │
└─────────────────────────────────────┘
```

- 「失敗分を再実行」: retryFailedStaffTasks Callable を呼び出し → 進捗表示に戻る
- 「詳細を確認」: 成功した staff の結果は計算結果タブで確認可能（ただし確定は不可）
- 失敗 staff の一覧は staffResults から taskStatus == "failed" をフィルタして取得

### 4. 計算結果タブ

**データソース**: 計算結果タブのデータは Firestore の payrollRuns ドキュメント（latestRunId の run）をリアルタイムリスニングして取得する。Callable のレスポンスからは取得しない。

**status による表示制御**:

| payrollRuns.status | 計算結果タブの表示 |
|---|---|
| `completed` | 全 staff の結果を表示。確定ボタン有効 |
| `completed_with_errors` | 成功した staff の結果は表示する。画面上部に「⚠ {failedStaffCount}名のスタッフの計算に失敗しています。計算用タブから再実行してください。」の警告バナーを表示。確定ボタンは無効 |
| その他 | 計算結果タブは空表示または前回確定済み結果を表示 |

#### 4-1. サマリ表示【確定】

画面上部に以下を表示する:

| 項目 | データソース |
|------|------------|
| 対象 staff 数 | payrollRuns.targetStaffCount |
| 総支給額合計 | payrollRuns.totalGrossPay |
| 総実労働時間 | Σ staffResults.totalActualWorkMinutes（UI 側で算出） |
| 総法定時間外労働時間 | Σ staffResults.totalLegalOvertimeMinutes（UI 側で算出） |
| 総法定休日労働時間 | Σ staffResults.totalLegalHolidayWorkMinutes（UI 側で算出） |
| anomalyFlags 警告 | payrollRuns.anomalyFlags |

時間系の集計値は payrollRuns に直接格納されていないため、カード表示用に取得済みの staffResults から UI 側で合計する。

#### 4-2. staff ごとのカード表示【確定】

staff ごとの給与・勤怠サマリをカードで表示する。カード押下で詳細確認可能。

カードに表示する項目:
- staffName
- totalActualWorkMinutes（時間換算）
- grossPay
- 各割増の有無を示すアイコンまたはラベル（**新規追加**: 残業あり / 法定休日あり / 60h超あり 等）
- キャリーオーバーがある場合: 「キャリーオーバー {carryOverAttendanceCount}件 / +¥{carryOverGrossPay}」を表示（carryOverAttendanceCount > 0 の場合のみ）

0円の staff は表示から除外する。

#### 4-3. staff 詳細画面【確定】

カード押下で表示する詳細:
- 基本情報（staffName, baseHourlyWage）
- 集計値（totalActualWorkMinutes, totalNightWorkMinutes, totalLegalOvertimeMinutes, over60OvertimeMinutes, totalLegalHolidayWorkMinutes, totalNonLegalHolidayWorkMinutes）
- 金額内訳（basePay, lateNightPremiumPay, overtimePremiumPay, over60PremiumPay, legalHolidayPremiumPay, grossPay）
- キャリーオーバー情報（carryOverAttendanceCount > 0 の場合のみ表示）:
  - キャリーオーバー件数（carryOverAttendanceCount）
  - キャリーオーバー支給額（carryOverGrossPay）
- warnings があれば表示
- attendance 明細一覧（attendanceItems から取得。主要フィールドのみ表示）:
  - 日付（date）
  - 曜日
  - 実労働時間（actualWorkMinutes）
  - 夜間労働時間（nightWorkMinutes）
  - 法定時間外労働（legalOvertimeMinutes）
  - 法定休日フラグ（isLegalHoliday）
  - キャリーオーバーフラグ（isCarryOver）— true の場合は「キャリーオーバー」ラベルを付与

#### 4-4. 確定ボタン【確定】

- **表示条件**: payrollRuns.status が `completed` の場合のみ確定ボタンを有効化する
  - `completed_with_errors` の場合: 確定ボタンは無効化し、「一部スタッフの計算が失敗しているため確定できません。失敗分を再実行するか、中止してください。」のメッセージを表示
- 確定時に警告表示:
  - 再計算できなくなる旨
  - 未退勤等で含めていない attendance の内容

#### 4-5. 計算結果チェック【確定】

- 計算結果チェック（anomalyFlags）の枠組みを用意する
- **初期リリースでは実質的なチェックは行わない**（generateAnomalyFlags 関数は呼び出されるが空のフラグを返す）
- チェック内容は運用開始後に実績データを基に追加する
- anomalyFlags が空でない場合はサマリ表示に警告を表示

#### 4-6. CSV エクスポート【確定】

- 計算結果タブで CSV 出力
- 確定前・確定後の区別を含める（ヘッダー行に「未確定」/「確定済み」を記載）

**CSV 列定義**（staffResults のフィールドに準拠）:

| # | 列名 | フィールド |
|---|------|-----------|
| 1 | スタッフ名 | staffName |
| 2 | 時給 | baseHourlyWage |
| 3 | 実労働時間(分) | totalActualWorkMinutes |
| 4 | 夜間労働時間(分) | totalNightWorkMinutes |
| 5 | 法定時間外労働(分) | totalLegalOvertimeMinutes |
| 6 | 60h超時間外(分) | over60OvertimeMinutes |
| 7 | 法定休日労働(分) | totalLegalHolidayWorkMinutes |
| 8 | 法定外休日労働(分) | totalNonLegalHolidayWorkMinutes |
| 9 | 基本給 | basePay |
| 10 | 深夜割増 | lateNightPremiumPay |
| 11 | 残業割増 | overtimePremiumPay |
| 12 | 60h超割増 | over60PremiumPay |
| 13 | 法定休日割増 | legalHolidayPremiumPay |
| 14 | キャリーオーバー支給額 | carryOverGrossPay |
| 15 | 総支給額 | grossPay |

<!-- TODO: 表示するデータの列を変更したい場合はこのテーブルを編集すること。
     例: 週単位の集計列追加、独自の控除列追加、attendanceItems レベルの明細出力 等。
     grossPay = basePay + 各割増の合計（キャリーオーバー分の計算結果も含む）。
     carryOverGrossPay は grossPay のうちキャリーオーバー attendance 由来の内訳額。 -->

#### 4-7. 印刷【確定】

- 一旦無視する

#### 4-8. 過去の計算結果【確定】

- 過去の計算結果を参照可能
- デフォルト表示は計算実行日が当月の結果（latestRunId を持つ payrollRuns を取得）
- 月を切り替えて過去の確定済み結果を閲覧可能

### 5. 支払い管理

**対応済み**: 03_DATA_MODEL_SPEC 改善要素 #1 に基づき、monthlyPayroll ルートに paidAt、staffResults に paymentStatus / paidAt / paidByDeviceId を追加済み。

#### 5-1. 支払い済み登録【確定】

- **staff ごと**に「支払い済み」または「保留」を登録可能
- **一括支払い登録**: payrollConfig.bulkPaymentRegistrationEnabled = true の場合に「全員支払い済み」ボタンを表示。押下で全 unpaid staff を一括で paid にする
- 登録時に registerPaymentStatus Callable を呼び出す（04_CALLABLE_API_SPEC セクション9参照）

**表示方式**:

```
┌───────────────────────────────────────────────────┐
│  支払い管理                                        │
│  期間: 2026-03-26 〜 2026-04-25                   │
│  ステータス: 確定済み（3/10 支払い済み）           │
│                                                    │
│  [全員支払い済み]  ← bulkPaymentRegistrationEnabled │
│                                                    │
│  ┌─ 田中太郎 ──── ¥180,000 ── [支払い済み] [保留] │
│  ├─ 鈴木花子 ──── ¥165,000 ── [支払い済み] [保留] │
│  ├─ 佐藤一郎 ──── ¥200,000 ── ✓ 支払い済み        │
│  ├─ 高橋 優  ──── ¥150,000 ── ⏸ 保留中 [支払い済み]│
│  └─ ...                                           │
└───────────────────────────────────────────────────┘
```

- 各 staff の grossPay を表示
- paymentStatus に応じてボタン / ステータスラベルを切り替え:
  - `unpaid`: 「支払い済み」「保留」ボタンを表示
  - `paid`: 「✓ 支払い済み」ラベル（操作不可）
  - `hold`: 「⏸ 保留中」ラベル +「支払い済み」ボタン（hold → paid のみ可能）

**monthlyPayroll.status の表示**: 画面上部に期間レベルの進捗を表示する。

| monthlyPayroll.status | 表示 |
|----------------------|------|
| confirmed | 「確定済み（{paidCount}/{totalCount} 支払い済み）」 |
| hold | 「保留あり（{holdCount}名保留中）」 |
| paid | 「✓ 全員支払い済み」 |

#### 5-2. 支払日翌日以降の警告【確定】

- monthlyPayroll.status == "confirmed"（未払い staff がいる）の場合、paymentDate 翌日以降に警告表示
- 通知は payroll_payment_overdue（07_NOTIFICATION_SCHEDULER_SPEC セクション2-1参照）

#### 5-3. 保留ステータス【確定】

- **staff ごと**に保留を設定する。「全体保留」操作は提供しない
- 全 staff が paid / hold になると monthlyPayroll.status が自動的に "hold" に遷移（03_DATA_MODEL_SPEC セクション2-1参照）
- hold 状態の場合、支払い催促の日次通知（payroll_payment_overdue）は停止し、低頻度のリマインド（payroll_hold_reminder、毎週月曜）のみ送信される
- hold の staff は「支払い済み」に変更可能（hold → paid）。全 staff が paid になると monthlyPayroll.status が自動的に "paid" に遷移

### 6. 既存機能との関係【確定】

- all_staff_attendance_page: 給与計算専用画面と併用。既存画面の仕様は変わらない
- 既存 monthlyPayroll データ: 移行は行わない。新規のみ対応

---

## 確定済み事項一覧

| # | 項目 | 決定内容 |
|---|------|----------|
| 1 | 計算結果チェック（anomalyFlags） | 枠組みのみ実装。generateAnomalyFlags を呼び出すが初期リリースでは空。運用開始後に追加 |
| 2 | CSV エクスポートの列定義 | 03_DATA_MODEL_SPEC の staffResults フィールドに準拠した15列。carryOverGrossPay を含む。列変更時は仕様内 TODO コメント参照 |
| 3 | staff 詳細画面の表示粒度 | attendanceItems は主要フィールドのみ表示（日付・曜日・実労働・夜間・法定時間外・法定休日フラグ・キャリーオーバーフラグ） |
| 4 | payrollConfig 設定 UI | 初期リリースでは Firestore コンソールから直接変更する（02_CONFIG_SPEC で確定済み）。将来的にアプリ内設定 UI を追加する余地を残す |
| 5 | 過去の計算結果のデフォルト表示期間 | 計算実行日が当月の結果を表示。latestRunId を持つ payrollRuns を取得 |
| 6 | 集計プレビューの表示内容 | 金額は表示しない。件数と合計時間のみ。対象データの妥当性確認が目的 |
| 7 | staff 詳細画面のデータ量 | 通常の勤怠件数（～35件/staff）ではパフォーマンス問題なし。ページネーション不要 |
| 8 | reasonType の定義 | 属性2（期間外未反映）は `carry_over`（04_CALLABLE_API_SPEC と統一） |
| 9 | キャリーオーバー表示 | staff カード・詳細画面にキャリーオーバー件数・支給額を表示（carryOverAttendanceCount > 0 の場合のみ） |
| 10 | 確定ボタンの前提条件 | payrollRuns.status == `completed` の場合のみ有効化。`completed_with_errors` では無効化しメッセージ表示 |
| 11 | completed_with_errors 時の結果タブ | 成功 staff の結果は表示、警告バナーを表示、確定ボタンは無効 |
| 12 | 支払い管理方式 | staff ごとに paid / hold を登録。monthlyPayroll.status は全 staff の paymentStatus に基づいて自動遷移。admin による全体保留操作は提供しない |
| 13 | 支払い管理の UI | staff 一覧に paymentStatus に応じたボタン / ラベルを表示。一括支払い登録は bulkPaymentRegistrationEnabled で制御 |

---

## 未確定事項一覧

すべて確定済み。未確定事項なし。

---

## 懸念事項一覧

すべて解消済み。残存する懸念事項なし。
