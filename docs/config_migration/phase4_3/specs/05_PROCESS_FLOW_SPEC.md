# 05: 処理フロー仕様

**ステータス**: 確定（DISTRIBUTED_EXECUTION_DESIGN.md に基づく分散実行版）
**最終更新**: 2026-03-21

---

## 仕様概要

Cloud Functions / Cloud Tasks 内部の処理順序、payroll run のライフサイクル、分散実行フロー、attendance 反映状態の管理、再計算・修正反映の方針を定義する。

---

## 仕様詳細

### 1. payroll run のライフサイクル

#### monthlyPayroll.status

```
[なし] → draft → confirmed → paid
                  ↔ hold → paid
```

| status | 意味 | 遷移条件 |
|--------|------|---------|
| draft | 計算実行済み・未確定。再計算可能 | finalizePayrollRun 完了時に設定 |
| confirmed | 確定済み。支払い処理未完了 | confirmPayrollRun 成功時。unpaid の staff が存在する間維持 |
| hold | 全 staff が paid/hold で、hold が1名以上 | registerPaymentStatus による自動遷移 |
| paid | 全 staff が支払い済み | registerPaymentStatus による自動遷移 |

#### payrollRuns.status

```
preparing → processing → aggregating → completed
                                     → completed_with_errors
         → failed
         → cancelled
```

| status | 意味 | 遷移元 | 遷移条件 |
|--------|------|--------|---------|
| preparing | run 作成中・タスク投入中 | (初期) | executeMonthlyPayroll 開始時 |
| processing | Cloud Tasks 実行中 | preparing | 全タスク投入完了時 |
| aggregating | サマリ集計中 | processing | finalizePayrollRun 開始時 |
| completed | 全 staff 成功・集計完了 | aggregating | failedStaffCount == 0 |
| completed_with_errors | 一部 staff 失敗・集計完了 | aggregating | failedStaffCount > 0 |
| failed | 致命的エラー | preparing | タスク投入中の回復不能エラー |
| cancelled | admin が中止 | preparing, processing | cancelPayrollRun 呼び出し |

### 2. executeMonthlyPayroll の処理フロー

```
1. 入力検証
   - admin 権限チェック
   - paymentPeriodKey の検証
   - 対象期間が confirmed でないことの確認
   - attendanceIds が空でないことの確認

2. 設定 snapshot 取得
   - storeConfig: payroll.startDay/endDay, attendance.nightWork*
   - payrollConfig: 全フィールド（02_CONFIG_SPEC セクション3〜4）
   - periodStart, periodEnd を算出

3. attendance 取得・分類
   - attendanceIds で一括取得
   - バリデーション（存在確認、clockOut 有無等）
   - 通常 / キャリーオーバーに分類
   - staffId ごとにグルーピング

4. payrollRuns ドキュメント作成
   - status = "preparing"
   - snapshot フィールドを保存
   - targetStaffCount, targetAttendanceCount, carryOverAttendanceCount
   - completedStaffCount = 0, failedStaffCount = 0

5. staff ごとの準備 + タスク投入
   - staffResults/{staffId} を作成（taskStatus="pending", assignedAttendanceIds, assignedCarryOverAttendanceIds）
   - Cloud Task を投入（payload: { runId, paymentPeriodKey, staffId }）

6. payrollRuns.status = "processing" に更新

7. レスポンスを即座に返却
   - { runId, targetStaffCount, status: "processing", ... }
```

### 3. processStaffPayroll の処理フロー

Cloud Tasks から呼び出される。1 staff の給与計算を独立して実行する。

```
1. 前提チェック
   - payrollRuns.status が "cancelled" or "failed" → return
   - staffResults.taskStatus == "completed" → return（冪等性ガード）

2. taskStatus = "processing" に更新

3. データ取得
   - staffResults から assignedAttendanceIds を取得
   - attendance ドキュメントを一括取得
   - payrollRuns から config snapshot を取得
   - staffs/{staffId} から時給・氏名を取得

4. 参照用 attendance 追加取得（月跨ぎ週対応）
   - 計上対象 attendance の weekStartDate を収集
   - 各 weekStartDate の週全体の attendance を取得

5. キャリーオーバー参照データ取得
   - 元の期間の attendance を参照用に取得

6. 計算実行（01_CALC_SPEC のアルゴリズム）
   - 通常 attendance → セクション3〜5, 7
   - キャリーオーバー attendance → 元期間参照で残業計算
   - 月60時間超 → セクション8
   - 金額算出 → セクション10

7. attendanceItems 書き込み（batch.set で冪等上書き）【必須】

8. 結果保存 + カウンタ更新（トランザクション）
   - staffResults に全計算結果を set + taskStatus = "completed"
   - payrollRuns.completedStaffCount += 1
   - トランザクション内で taskStatus ガード（二重カウント防止）

9. 完了判定
   - completedStaffCount + failedStaffCount == targetStaffCount?
   → Yes: finalizePayrollRun タスクを投入

--- 失敗時 ---
catch:
   - staffResults.taskStatus = "failed", taskError 記録
   - payrollRuns.failedStaffCount += 1（トランザクション）
   - 完了判定（同上）
```

### 4. finalizePayrollRun の処理フロー

全 staff の計算完了後にサマリを集計する。

```
1. 冪等性ガード
   - payrollRuns.status が "completed" or "completed_with_errors" → return

2. payrollRuns.status = "aggregating"

3. staffResults を全件読み取り

4. サマリ集計
   - totalBasePay, totalPremiumPay, totalGrossPay を算出
   - warningCount を算出

5. generateAnomalyFlags を呼び出し（04_CALLABLE_API_SPEC セクション5-1参照）

6. payrollRuns を更新
   - status = "completed" or "completed_with_errors"
   - finishedAt, totals, anomalyFlags

7. monthlyPayroll ルートドキュメントを更新
   - latestRunId, latestCalculatedAt, status = "draft"

8. 通知を作成（07_NOTIFICATION_SCHEDULER_SPEC セクション2-2参照）
   - completed → payroll_run_completed 通知
   - completed_with_errors → payroll_run_completed_with_errors 通知
```

### 5. confirmPayrollRun の処理フロー

```
1. 入力検証
   - admin 権限チェック
   - paymentPeriodKey の検証
   - 対象期間が confirmed でないことの確認
   - 対象 run の status == "completed" の確認
     （completed_with_errors は確定不可）

2. 対象 run の特定
   - runId 指定時: そのまま使用
   - 未指定時: latestRunId を使用

3. attendance 反映状態更新
   - staffResults → attendanceItems から attendanceId を収集
   - 通常 + キャリーオーバー attendance の payrollStatus = "reflected"
   - reflectedPayrollRunId, reflectedAt を同時に設定
   → 400 件ごとにバッチ分割

4. キャリーオーバー処理
   - キャリーオーバーがある場合:
     元の期間の confirmed 済み staffResults に deferredAttendances を追記（arrayUnion）
     （03_DATA_MODEL_SPEC セクション5-3 参照）

5. 全 staffResults の paymentStatus を "unpaid" に初期化
   → 支払い管理の起点（registerPaymentStatus で後から更新）

6. monthlyPayroll 更新
   - status = "confirmed"
   - confirmedAt, confirmedByDeviceId

7. attendanceLogs 書き込み
   - actionType: "payroll_confirmed"
   - キャリーオーバー分: "carry_over_deferred"
```

### 6. 再計算時の処理

**方針（確定）**: 再計算は**月全体を新規 run として実行**する。差分計算は行わない。

確定前（draft）の期間に対して再度 executeMonthlyPayroll を呼んだ場合:

1. 新しい payrollRun を作成（新規 runId）
2. Cloud Tasks で全 staff を再計算
3. monthlyPayroll の latestRunId を新しい runId に更新
4. 前回 run のデータはそのまま保持
5. 前回 run の attendance の payrollStatus は**変更しない**（confirm 時にのみ reflected 化）

### 7. attendance 修正時の処理

既に `reflected` の attendance が更新された場合:
1. Firestore onWrite トリガーで payrollStatus を `corrected_after_reflection` に変更
2. 次回の getPayrollCandidates で group1（同じ期間の場合）または group2（異なる期間の場合）として表示される（帰属期間に応じて自動分類。04_CALLABLE_API_SPEC セクション2参照）
3. 次回の payroll run で再計上対象に含まれる

**confirmed 済み期間の attendance が修正された場合**:
- `corrected_after_reflection` としてマークし、payroll_attendance_corrected 通知を作成する（07_NOTIFICATION_SCHEDULER_SPEC セクション2-2参照）
- 自動再計算は行わない（confirmed の不変性を維持）
- **補記**: 将来的に confirmed 済み期間の attendance を UI 上で編集不可にする可能性がある。その場合、attendance 編集時に payrollStatus == "reflected" かつ帰属期間が confirmed であれば編集をブロックする

### 8. registerPaymentStatus の処理フロー

確定済みの payrollRun に対して、staff ごとに支払い済み / 保留を登録する。

```
1. 入力検証
   - admin 権限チェック
   - monthlyPayroll.status が "confirmed" or "hold" であることを確認

2. confirmed run の特定
   - monthlyPayroll.latestRunId を使用

3. staff ごとの paymentStatus 更新
   各 entry について:
   - staffResults/{staffId}.paymentStatus を読み取り
   - 遷移バリデーション（unpaid→paid, unpaid→hold, hold→paid のみ許可）
   - paymentStatus を更新（paid の場合は paidAt, paidByDeviceId も設定）

4. monthlyPayroll.status の自動更新
   全 staffResults の paymentStatus を集計:
   - 全員 paid → monthlyPayroll.status = "paid"（paidAt = now）
   - 全員 paid/hold（hold が1名以上）→ monthlyPayroll.status = "hold"
   - unpaid が残存 → monthlyPayroll.status = "confirmed"（変更なし）

5. attendanceLogs 書き込み
   - paid: actionType = "payment_registered"
   - hold: actionType = "payment_hold"
```

**confirmed → hold → paid の流れ**:
```
confirmPayrollRun 完了
  → 全 staff の paymentStatus = "unpaid"
  → monthlyPayroll.status = "confirmed"

staff A を paid 登録
  → A.paymentStatus = "paid"
  → unpaid の staff がまだいる → monthlyPayroll.status = "confirmed"（変更なし）

staff B を hold 登録
  → B.paymentStatus = "hold"
  → unpaid の staff がまだいる → monthlyPayroll.status = "confirmed"（変更なし）

残りの staff を全員 paid 登録
  → 全 staff が paid/hold → monthlyPayroll.status = "hold"

staff B を paid に変更（hold → paid）
  → 全 staff が paid → monthlyPayroll.status = "paid"
```

### 9. 実装責務の分担

| 責務 | 実装先 |
|------|--------|
| payroll run 開始ボタン | Flutter |
| 進捗リスニング（payrollRuns.completedStaffCount） | Flutter |
| 中止操作 | Flutter → cancelPayrollRun Callable |
| 失敗再実行操作 | Flutter → retryFailedStaffTasks Callable |
| payroll 結果表示 | Flutter（payrollRuns ドキュメントからリアルタイム取得） |
| warnings / errors 表示 | Flutter |
| 集計プレビュー（ローカル計算） | Flutter |
| 通知取得・更新 | Flutter → Firestore 直接クエリ |
| 通知スケジューラー | Cloud Scheduler → payrollNotificationScheduler → processPayrollNotifications（07_NOTIFICATION_SCHEDULER_SPEC セクション3参照） |
| 支払い登録・保留 | Flutter → registerPaymentStatus Callable |
| インライン通知作成 | Cloud Tasks / Cloud Functions（finalizePayrollRun, attendance onWrite トリガー） |
| weekday, weekStartDate, paymentPeriodKey の確定 | Cloud Functions（onWrite トリガー） |
| payroll run オーケストレーション | Cloud Functions（executeMonthlyPayroll） |
| staff 単位計算 | Cloud Tasks（processStaffPayroll） |
| サマリ集計 | Cloud Tasks（finalizePayrollRun） |
| 週40h超 / 日8h超 / 月60h超判定 | Cloud Tasks（processStaffPayroll 内） |
| 法定休日判定 | Cloud Tasks（processStaffPayroll 内） |
| staff 結果保存 | Cloud Tasks（processStaffPayroll 内） |
| attendance 反映状態更新 | Cloud Functions（confirmPayrollRun） |
| anomalyFlags 生成 | Cloud Tasks（finalizePayrollRun 内） |

---

## 確定済み事項一覧（元・未確定事項）

| # | 項目 | 決定内容 | 決定日 |
|---|------|---------|--------|
| 1 | 再計算時の差分処理 vs 月全体再計算 | 月全体再計算。残業計算が週累計に依存するため差分計算は整合性リスクが高い。Cloud Tasks 分散によりパフォーマンスも十分 | 2026-03-21 |
| 2 | 遡及訂正の方式 | フラグのみ。corrected_after_reflection としてマークし通知。将来的に confirmed 済み期間の attendance 編集不可の可能性あり | 2026-03-21 |
| 3 | run 種別の定義 | 不要。carryOverAttendanceCount > 0 で暗黙的にキャリーオーバー含有を識別 | 2026-03-21 |
| 4 | トランザクション境界 | staff 単位。Cloud Tasks により自然に分離 | 2026-03-21 |
| 5 | confirmed 済み期間の再 run 可否 | 不可。confirmed の不変性を維持。万が一の場合は Firestore コンソールから手動対応 | 2026-03-21 |

---

## 懸念事項一覧

| # | 項目 | 説明 | 状態 |
|---|------|------|------|
| 1 | Cloud Functions タイムアウト | Cloud Tasks 分散により**解消**。各タスクは 1 staff 分で数秒 | 解消済み |
| 2 | 参照 attendance の一貫性 | 月跨ぎ週で参照する他期間の attendance が、参照時点で修正される可能性。計算結果の再現性に影響 | 許容する。Cloud Tasks による計算は数秒〜数十秒で完了するため、この極短時間に同一 staff の別期間 attendance が修正される確率は極めて低い。万が一発生しても、計算結果は staffResults / attendanceItems に snapshot として保持されるため「その時点で正しかった結果」として監査可能 |
| 3 | 前回 run の attendance クリア | 再計算時に前回 run のみに含まれていた attendance の扱い | 解消済み（クリアしない方針で確定。confirm するまで payrollStatus は変更しない） |

---

## 改善要素一覧

| # | 項目 | 説明 | 状態 |
|---|------|------|------|
| 1 | 進捗通知 | completedStaffCount のリアルタイムリスニングにより**採用**。進捗バーで表示 | 採用済み |
| 2 | 部分再計算 | 採用しない。月全体再計算で確定。Cloud Tasks 分散によりパフォーマンスは十分 | 不採用（確定） |
