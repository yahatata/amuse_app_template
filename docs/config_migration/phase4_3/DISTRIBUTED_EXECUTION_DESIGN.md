# Cloud Tasks 分散実行設計書

**ステータス**: 確定
**作成日**: 2026-03-21

---

## 1. 方針転換の概要

### Before（現在の 04_CALLABLE_API_SPEC / 05_PROCESS_FLOW_SPEC）

```
Flutter → executeMonthlyPayroll（1回の Callable で全 staff 一括計算）→ Firestore
```

- Cloud Functions タイムアウト（540秒）に依存
- staff 数が増えると破綻
- 途中失敗で全データが不整合
- 再実行が困難

### After（本設計）

```
Flutter → executeMonthlyPayroll（run 作成 + タスク投入のみ）
  └→ Cloud Tasks × N（staff 単位の独立タスク）
       └→ processStaffPayroll（1 staff の計算・保存）
  └→ finalizePayrollRun（全 staff 完了後のサマリ集計）

Flutter → payrollRuns をリアルタイム監視 → 進捗バー表示
```

### 変更の目的

| 項目 | 効果 |
|------|------|
| スケーラビリティ | staff 数に上限なし |
| 冪等性 | staff 単位で冪等。失敗タスクだけ再実行 |
| 耐障害性 | 1 staff の失敗が他に影響しない |
| 進捗可視化 | completedStaffCount / targetStaffCount でリアルタイム表示 |
| Firestore 安全性 | staff 単位バッチで 500 ops 上限を確実に守る |
| タイムアウト回避 | 各タスクは 1 staff 分（数秒） |

---

## 2. 関数一覧と責務

| 関数名 | 種類 | 呼び出し元 | 責務 |
|--------|------|-----------|------|
| `executeMonthlyPayroll` | Callable | Flutter | run 作成・attendance 分類・タスク投入 |
| `processStaffPayroll` | onTaskDispatched | Cloud Tasks | 1 staff の計算・staffResult + attendanceItems 書き込み・カウンタ更新 |
| `finalizePayrollRun` | onTaskDispatched | processStaffPayroll（最終タスク） | サマリ集計・payrollRuns 完了更新・monthlyPayroll 更新 |
| `retryFailedStaffTasks` | Callable | Flutter | 失敗タスクのリセット + 再投入 |
| `getPayrollCandidates` | Callable | Flutter | 変更なし |
| `confirmPayrollRun` | Callable | Flutter | 変更なし（前提条件に run.status == completed を追加） |

### 実装方式の選択

Firebase Functions v2 の `onTaskDispatched` を使用する。

```typescript
// 定義
export const processStaffPayroll = onTaskDispatched(
  { retryConfig: { maxAttempts: 3, minBackoffSeconds: 10, maxBackoffSeconds: 300 } },
  async (req) => { /* ... */ }
);

// 投入（executeMonthlyPayroll 内）
const queue = getFunctions().taskQueue("processStaffPayroll");
await queue.enqueue({ runId, paymentPeriodKey, staffId });
```

プロジェクトは既に Gen2 + Cloud Tasks を運用しており、`onTaskDispatched` は Gen2 ネイティブの標準手法。既存の `CloudTasksClient` 直接利用パターンとの互換性も問題なし。

---

## 3. executeMonthlyPayroll（詳細設計）

### 役割

**run の作成とタスクの投入のみ**。計算処理は行わない。

### リクエスト（変更なし）

```typescript
{
  paymentPeriodKey: string;
  attendanceIds: string[];
}
```

### レスポンス（変更あり）

```typescript
{
  runId: string;
  paymentPeriodKey: string;
  targetStaffCount: number;
  targetAttendanceCount: number;
  carryOverAttendanceCount: number;
  status: "processing";       // 即座に返却
}
```

計算結果（totalGrossPay, anomalyFlags 等）は返却しない。クライアントは payrollRuns ドキュメントをリアルタイムリスニングして取得する。

### 処理フロー

```
1. 入力検証（権限・期間・attendanceIds 非空・未確定期間）
2. 対象期間が confirmed でないことを確認
3. 設定 snapshot 取得（payrollConfig, storeConfig）
4. attendanceIds から attendance を一括取得
5. attendance を通常/キャリーオーバーに分類
   - paymentPeriodKey == currentPeriodKey → 通常
   - paymentPeriodKey != currentPeriodKey → キャリーオーバー
6. staffId ごとに attendanceIds をグルーピング
7. payrollRuns ドキュメントを作成:
   - status = "preparing"
   - targetStaffCount = staff 数
   - targetAttendanceCount = attendance 総数
   - carryOverAttendanceCount = キャリーオーバー数
   - completedStaffCount = 0
   - failedStaffCount = 0
   - 全 snapshot フィールド
8. staff ごとに Cloud Tasks を投入:
   - payload: { runId, paymentPeriodKey, staffId }
   - 各 staff の attendanceIds は staffResults/{staffId} に
     assignedAttendanceIds として事前保存
9. payrollRuns.status = "processing" に更新
10. レスポンスを返却（即座）
```

### assignedAttendanceIds の保存

各 staff のタスクが処理すべき attendanceIds を、タスク投入前に Firestore に保存する。

```
payrollRuns/{runId}/staffResults/{staffId}
  - staffId: string
  - taskStatus: "pending"
  - assignedAttendanceIds: string[]
  - assignedCarryOverAttendanceIds: string[]
  - createdAt: Timestamp
```

理由:
- Cloud Tasks ペイロードを最小化（runId + staffId のみ）
- attendanceIds が Firestore に残り、デバッグ・監査に有用
- processStaffPayroll は staffResults を読んで対象を特定

### 投入失敗時の挙動

タスク投入ループの途中で失敗した場合:
- payrollRuns.status は "preparing" のまま
- 一部のタスクは既に投入済みで実行される
- 投入済みタスクの処理結果は書き込まれるが、run が完了しないため利用されない
- **復旧**: admin は新しい run を作成（前回の stuck run は自然に無視される）

### エラー

| エラーコード | 条件 |
|-------------|------|
| `permission-denied` | admin 以外 |
| `already-confirmed` | 対象期間が確定済み |
| `invalid-period` | paymentPeriodKey が不正 |
| `no-attendance-selected` | attendanceIds が空 |
| `payroll-config-not-found` | payrollConfig が未設定 |

---

## 4. processStaffPayroll（詳細設計）

### 役割

1 staff の給与計算を実行し、結果を Firestore に保存する。Cloud Tasks から呼び出される。

### タスクペイロード

```typescript
{
  runId: string;
  paymentPeriodKey: string;
  staffId: string;
}
```

### 処理フロー

```
1. payrollRuns/{runId} を読み取り
   - status が "cancelled" or "failed" → 即座に return（無駄な処理を回避）
2. staffResults/{staffId} を読み取り
   - taskStatus == "completed" → 即座に return（冪等性）
3. staffResults/{staffId}.taskStatus = "processing" に更新
   - taskStartedAt = now
4. staffResults から assignedAttendanceIds を取得
5. attendance ドキュメントを一括取得
6. payrollRuns から config snapshot を取得
7. staffs/{staffId} から時給・氏名を取得（snapshot 用）
8. 通常 attendance: 月跨ぎ週の参照用 attendance を追加取得
9. キャリーオーバー attendance: 元の期間の attendance を参照用に取得
10. 01_CALC_SPEC のアルゴリズムで計算
    - 通常 attendance → セクション3〜5, 7
    - キャリーオーバー attendance → 元期間参照で計算
    - 月60時間超 → セクション8
    - 金額算出 → セクション10
11. attendanceItems を書き込み（batch.set で冪等）
12. 結果保存 + カウンタ更新（トランザクション）:
    ┌─ transaction ─────────────────────────┐
    │ staffResults/{staffId} を再読み取り    │
    │ if taskStatus == "completed": return   │
    │ staffResults に全計算結果を set         │
    │  - taskStatus = "completed"            │
    │  - taskFinishedAt = now                │
    │ payrollRuns.completedStaffCount += 1   │
    └───────────────────────────────────────┘
13. 完了判定:
    completedStaffCount + failedStaffCount == targetStaffCount?
    → Yes: finalizePayrollRun タスクを投入
```

### 失敗時の処理

```
catch (error):
  ┌─ transaction ─────────────────────────┐
  │ staffResults/{staffId} を再読み取り    │
  │ if taskStatus == "completed": return   │
  │ if taskStatus == "failed": return      │
  │ staffResults に set:                   │
  │  - taskStatus = "failed"              │
  │  - taskError = error.message          │
  │  - taskFinishedAt = now               │
  │ payrollRuns.failedStaffCount += 1     │
  └───────────────────────────────────────┘

  完了判定（上記と同じ）:
  → Yes: finalizePayrollRun タスクを投入
```

### 冪等性の保証メカニズム

Cloud Tasks はリトライを行うため、同一タスクが複数回実行される可能性がある。

| 処理段階 | 冪等性保証 |
|---------|-----------|
| 計算処理 | 入力が同一なら出力は決定的。何度実行しても同じ結果 |
| attendanceItems 書き込み | `batch.set()` で上書き。同一データなので安全 |
| staffResult + カウンタ更新 | **トランザクション内で taskStatus を確認**。completed なら skip、カウンタを二重加算しない |

```
trx 内のガード条件:
  if (currentTaskStatus === "completed") {
    // 既にカウント済み → 何もしない
    return;
  }
```

---

## 5. finalizePayrollRun（詳細設計）

### 役割

全 staff の計算完了後にサマリを集計し、run と monthlyPayroll を更新する。

### トリガー

processStaffPayroll の最終タスク（completedStaffCount + failedStaffCount == targetStaffCount の条件を満たしたタスク）が Cloud Tasks として投入する。

### タスクペイロード

```typescript
{
  runId: string;
  paymentPeriodKey: string;
}
```

### 処理フロー

```
1. payrollRuns/{runId} を読み取り
   - status が "completed" or "completed_with_errors" → return（冪等性）
2. payrollRuns.status = "aggregating" に更新
3. staffResults を全件読み取り
4. サマリを集計:
   - totalBasePay = Σ staffResults.basePay (taskStatus == "completed" のみ)
   - totalPremiumPay = Σ (lateNightPremiumPay + overtimePremiumPay + ...)
   - totalGrossPay = Σ staffResults.grossPay
   - warningCount = Σ (status == "warning" の staff 数)
   - completedStaffCount, failedStaffCount を最終確認
5. anomalyFlags を生成（generateAnomalyFlags 関数を呼び出す。セクション5-1参照）
6. payrollRuns を更新:
   - status = failedStaffCount > 0 ? "completed_with_errors" : "completed"
   - finishedAt = now
   - totalBasePay, totalPremiumPay, totalGrossPay
   - warningCount, anomalyFlags
7. monthlyPayroll ルートドキュメントを更新:
   - latestRunId = runId
   - latestCalculatedAt = now
   - status = "draft"（まだ confirmed でなければ）
```

### 冪等性

- 全 staffResults を読み直して集計するため、何度実行しても同じ結果
- status の遷移ガード（completed/completed_with_errors なら skip）で多重実行を防止

### 5-1. generateAnomalyFlags（計算結果チェック）

anomalyFlags を生成する関数。**枠組みのみを実装し、初期リリースでは実質的なチェックは行わない**。

```typescript
/**
 * 計算結果の異常値チェックを行う。
 * 現時点ではチェック内容は未定義のため、常に空のフラグを返す。
 * 運用開始後に実績データを基にチェック内容を追加する。
 *
 * TODO: 以下のようなチェックを運用フィードバックを経て追加予定
 * - expectedRange ベースの件数・金額・時間チェック
 * - staff ごとの異常値検出
 * - 前回 run との差分チェック
 */
function generateAnomalyFlags(
  staffResults: StaffResult[],
  payrollConfig: PayrollConfig
): AnomalyFlags {
  const flags: AnomalyFlags = {};
  // チェック内容は運用開始後に追加する。
  // この関数は finalizePayrollRun から必ず呼び出され、
  // チェックを追加する際はここに実装する。
  return flags;
}
```

**方針**: 関数の呼び出し自体は初期リリースから組み込む。チェックロジックの追加はコードの変更のみで対応可能な構造にしておく。

---

## 6. payrollRuns の状態遷移

```
preparing → processing → aggregating → completed
                                     → completed_with_errors
         → failed（致命的エラー）
         → cancelled（admin による中止）
```

| status | 意味 | 遷移元 | 遷移条件 |
|--------|------|--------|---------|
| `preparing` | run 作成中・タスク投入中 | (初期) | executeMonthlyPayroll 開始時 |
| `processing` | タスク実行中 | preparing | 全タスク投入完了時 |
| `aggregating` | サマリ集計中 | processing | finalizePayrollRun 開始時 |
| `completed` | 全 staff 成功・集計完了 | aggregating | failedStaffCount == 0 |
| `completed_with_errors` | 一部 staff 失敗・集計完了 | aggregating | failedStaffCount > 0 |
| `failed` | 致命的エラー | preparing | タスク投入中の回復不能エラー |
| `cancelled` | admin が中止 | preparing, processing | cancelPayrollRun 呼び出し |

### Flutter 側での表示対応

| status | UI 表示 |
|--------|--------|
| `preparing` | 「準備中...」（スピナー） |
| `processing` | 「計算中... {completedStaffCount}/{targetStaffCount} スタッフ完了」+ 進捗バー |
| `aggregating` | 「集計中...」（スピナー） |
| `completed` | 計算結果タブへ自動遷移。結果表示 |
| `completed_with_errors` | 結果表示 + 失敗 staff のエラー表示 + 「失敗分を再実行」ボタン |
| `failed` | エラーメッセージ + 「再実行」ボタン |
| `cancelled` | 「中止されました」+ 「再実行」ボタン |

---

## 7. 進捗管理とリアルタイム更新

### Firestore リスニング

Flutter は payrollRuns/{runId} ドキュメントを `snapshots()` でリアルタイムリスニングする。

```dart
FirebaseFirestore.instance
  .collection('monthlyPayroll')
  .doc(paymentPeriodKey)
  .collection('payrollRuns')
  .doc(runId)
  .snapshots()
  .listen((snapshot) {
    final data = snapshot.data();
    final completed = data['completedStaffCount'] as int;
    final failed = data['failedStaffCount'] as int;
    final target = data['targetStaffCount'] as int;
    final status = data['status'] as String;
    // UI 更新
  });
```

### 進捗の精度

- `completedStaffCount` はトランザクション内で原子的にインクリメントされるため正確
- Flutter がリスニングする payrollRuns ドキュメントは staff の計算完了ごとに更新される
- Firestore のリアルタイムリスナーにより、数百ミリ秒以内に UI に反映

### 進捗バーの計算

```
progress = (completedStaffCount + failedStaffCount) / targetStaffCount
```

失敗分も「処理済み」としてカウントし、進捗バーが止まらないようにする。

---

## 8. エラーハンドリングとリトライ

### Cloud Tasks リトライポリシー

| 設定 | 値 |
|------|-----|
| maxAttempts | 3 |
| minBackoffSeconds | 10 |
| maxBackoffSeconds | 300 |

### リトライの安全性

processStaffPayroll は冪等（セクション4参照）のため、リトライは安全。

### 手動リトライ: retryFailedStaffTasks

全リトライを使い切っても失敗した staff がいる場合、admin が手動でリトライを実行する。

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;
  runId: string;
}
```

**レスポンス**:

```typescript
{
  retriedCount: number;
  failedStaffIds: string[];
}
```

**処理フロー**:

```
1. payrollRuns.status が "completed_with_errors" であることを確認
2. staffResults から taskStatus == "failed" の staff を抽出
3. 各 staff について:
   a. staffResults.taskStatus = "pending" にリセット
   b. staffResults.taskError = null にクリア
   c. Cloud Task を再投入
4. payrollRuns を更新:
   - status = "processing"
   - failedStaffCount = 0（リトライ分を差し引き）
   - completedStaffCount はそのまま（成功済み staff は再計算しない）
```

**冪等性**: リトライ対象は taskStatus == "failed" の staff のみ。"completed" の staff は触らない。

### cancelPayrollRun

実行中の run を中止する。

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;
  runId: string;
}
```

**処理**:

```
1. payrollRuns.status が "preparing" or "processing" であることを確認
2. payrollRuns.status = "cancelled" に更新
3. 既に投入済みのタスクは実行されるが、processStaffPayroll が
   status == "cancelled" を検知して即座に return する
4. 既に完了した staffResults はそのまま残る（ゴミとして無害）
```

---

## 9. キャリーオーバーとの統合

キャリーオーバー（03_DATA_MODEL_SPEC セクション5）は staff 単位の計算に自然に統合される。

### executeMonthlyPayroll での分類

```
1. attendanceIds から attendance を取得
2. 各 attendance を分類:
   - paymentPeriodKey == currentPeriodKey → 通常
   - paymentPeriodKey != currentPeriodKey → キャリーオーバー
3. staffId ごとにグルーピング:
   staffAttendanceMap[staffId] = {
     normalIds: string[],
     carryOverIds: string[]
   }
4. staffResults/{staffId} に保存:
   - assignedAttendanceIds = normalIds
   - assignedCarryOverAttendanceIds = carryOverIds
```

### processStaffPayroll でのキャリーオーバー処理

```
1. 通常 attendance の計算（01_CALC_SPEC フルアルゴリズム）
2. キャリーオーバー attendance の計算:
   a. 元の期間の attendance を参照用に取得（元期間の週データ）
   b. 元の期間のコンテキストで残業計算
   c. isCarryOver = true, originalPaymentPeriodKey を設定
3. 両方の結果を staffResult に集約
   - grossPay: 通常 + キャリーオーバーの合計
   - carryOverGrossPay: キャリーオーバー分のみ
   - carryOverAttendanceCount: キャリーオーバー件数
```

### confirmPayrollRun でのキャリーオーバー処理（変更なし）

confirm 時の deferredAttendances 追記は、分散実行でも影響を受けない。confirm は全 staff の結果が揃った後に実行されるため、従来と同じフロー。

---

## 10. 再計算フロー

### 方針（確定）

再計算は**月全体を新規 run として実行**する。差分計算は行わない。

理由:
- 残業計算は週累計に依存するため、差分計算は整合性リスクが高い
- Cloud Tasks で分散するため、全体再計算でもパフォーマンスは十分
- 設計がシンプルで検証が容易

### フロー

```
1. admin が「再計算」を実行
2. executeMonthlyPayroll が新しい run を作成（新規 runId）
3. 前回 run のデータはそのまま保持
4. monthlyPayroll.latestRunId が新しい runId に更新
5. UI は latestRunId の run を表示
```

### 前回 run の attendance の payrollStatus

再計算時、前回 run の attendance の payrollStatus は**変更しない**。

理由:
- payrollStatus の "reflected" 化は confirm 時にのみ行う
- draft 状態の run では payrollStatus は変更されない
- 新しい run で同じ attendance を再計上しても問題なし（confirm 時に最新 run の結果が適用される）

---

## 11. confirmPayrollRun への影響

### 前提条件の追加

confirm を実行するには、対象 run の status が `completed` であること。

| status | confirm 可否 |
|--------|-------------|
| `completed` | 可 |
| `completed_with_errors` | **不可**（失敗 staff を解決する必要あり） |
| `processing` | 不可 |
| その他 | 不可 |

### 処理フローの変更

confirmPayrollRun 自体は分散実行ではないため、既存のフローをほぼ維持する。
ただし、staffResults の数が多い場合に attendance の payrollStatus 更新がバッチ上限に達する可能性があるため、バッチ分割を適用する。

```
1. 入力検証 + run.status == "completed" を確認
2. staffResults を全件取得
3. attendanceItems から全 attendanceId を収集
4. 通常 + キャリーオーバー attendance の payrollStatus を "reflected" に更新
   → 400 件ごとにバッチ分割
5. キャリーオーバーがある場合:
   元の期間の staffResults に deferredAttendances を追記（arrayUnion）
   → staff ごとにバッチ分割
6. monthlyPayroll.status = "confirmed"
7. attendanceLogs 書き込み
```

---

## 12. Firestore 書き込み安全性

### processStaffPayroll の書き込み量

1 staff あたりの書き込み:

| 対象 | 件数 | 説明 |
|------|------|------|
| attendanceItems | 最大 ~35 | 通常30 + キャリーオーバー数件 |
| staffResult | 1 | 計算結果 |
| payrollRuns (increment) | 1 | カウンタ更新 |
| **合計** | ~37 | バッチ上限 500 を大幅に下回る |

staff 単位で分離されているため、バッチ上限を超えることは事実上ない。

### finalizePayrollRun の書き込み量

| 対象 | 件数 |
|------|------|
| payrollRuns | 1 |
| monthlyPayroll | 1 |
| **合計** | 2 |

### confirmPayrollRun の書き込み量

| 対象 | 件数 |
|------|------|
| attendance (payrollStatus 更新) | 全計上 attendance 数 |
| 元期間 staffResults (deferredAttendances) | キャリーオーバー staff 数 |
| monthlyPayroll | 1 |
| attendanceLogs | 数件 |

attendance 数が 400 を超える場合はバッチ分割。

---

## 13. データモデルの変更点

### payrollRuns（変更）

| フィールド | 変更種別 | 型 | 説明 |
|-----------|---------|-----|------|
| status | **値の変更** | string | `preparing` / `processing` / `aggregating` / `completed` / `completed_with_errors` / `failed` / `cancelled` |
| completedStaffCount | 既存 | number | processStaffPayroll 完了ごとに increment |
| failedStaffCount | 既存 | number | processStaffPayroll 失敗ごとに increment |
| targetStaffCount | 既存 | number | executeMonthlyPayroll で設定 |

### staffResults（変更）

| フィールド | 変更種別 | 型 | 説明 |
|-----------|---------|-----|------|
| taskStatus | **新規** | string | `pending` / `processing` / `completed` / `failed` |
| taskStartedAt | **新規** | Timestamp? | タスク処理開始時刻 |
| taskFinishedAt | **新規** | Timestamp? | タスク処理完了時刻 |
| taskError | **新規** | string? | エラーメッセージ（failed 時のみ） |
| assignedAttendanceIds | **新規** | string[] | このタスクに割り当てられた attendance ID 配列 |
| assignedCarryOverAttendanceIds | **新規** | string[] | キャリーオーバー attendance ID 配列 |

**既存フィールド**（staffResult の計算結果フィールド）は変更なし。taskStatus == "completed" の場合のみ有効なデータが入る。

### 削除するフィールド

なし。既存フィールドはすべて維持。

---

## 14. UI フローの変更点

### 計算用タブの変更

| 項目 | Before | After |
|------|--------|-------|
| 「計算実行」ボタン押下後 | Callable 完了まで待機（ブロッキング） | 即座にレスポンス → 進捗表示に遷移 |
| 待機中の表示 | ローディングスピナー | 進捗バー + 完了 staff 数表示 |
| 結果表示 | レスポンスから直接表示 | payrollRuns の status が completed になったら結果タブに遷移 |

### 新規 UI 要素

1. **進捗バー**: 計算実行中に表示

```
┌─────────────────────────────────────┐
│  給与計算 実行中                      │
│  ████████████░░░░░░░░  15/30 (50%)  │
│                                      │
│  [中止]                              │
└─────────────────────────────────────┘
```

2. **エラー表示 + 再実行ボタン**: completed_with_errors 時

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

### 計算結果タブ

- 表示するデータの構造は変更なし
- データソースが「Callable のレスポンス」から「Firestore の payrollRuns ドキュメント」に変わる
- payrollRuns.status == "completed" のドキュメントの totals / anomalyFlags を表示

---

## 15. 確定事項一覧

以下は本設計で確定した事項。

| # | 項目 | 決定内容 |
|---|------|---------|
| 1 | 実行方式 | executeMonthlyPayroll は run 作成 + タスク投入のみ。計算は Cloud Tasks で staff 単位に分散 |
| 2 | タスク実装 | Firebase Functions v2 `onTaskDispatched` を使用 |
| 3 | 冪等性保証 | トランザクション内で taskStatus を確認し、completed なら skip。カウンタの二重加算を防止 |
| 4 | 進捗表示 | payrollRuns.completedStaffCount をリアルタイムリスニング。進捗バーで表示 |
| 5 | サマリ集計 | 最終タスクが finalizePayrollRun を投入。全 staffResults を読み直して集計 |
| 6 | リトライ | Cloud Tasks 自動リトライ（3回）+ admin 手動リトライ（retryFailedStaffTasks Callable） |
| 7 | 再計算方式 | 月全体を新規 run として再実行。差分計算は行わない |
| 8 | 前回 run のクリア | 前回 run の attendance payrollStatus は変更しない。confirm 時にのみ reflected 化 |
| 9 | run の種別定義 | 不要。carryOverAttendanceCount > 0 で暗黙的にキャリーオーバー含有を識別 |
| 10 | トランザクション境界 | staff 単位。Cloud Tasks により自然に分離 |
| 11 | 部分確定 | completed_with_errors の run は確定不可。全 staff 成功が確定の前提条件 |
| 12 | run 中止 | cancelPayrollRun Callable で status = "cancelled" に設定。実行中タスクは status を検知して skip |
| 13 | attendanceIds の受け渡し | staffResults/{staffId} に assignedAttendanceIds として保存。タスクペイロードは最小限（runId + staffId） |
| 14 | 確定済み期間の再 run 可否 | **不可**。confirmed の不変性を維持する。万が一の場合は Firestore コンソールから手動で status を draft に戻す運用。確定解除を許可すると deferredAttendances との整合性や reflected 済み attendance の扱いが複雑化するため |
| 15 | 遡及訂正の方式 | **フラグのみ**。confirmed 済み期間の attendance が修正された場合、`corrected_after_reflection` としてマークし通知を出す。自動再計算は行わない。確定後の変更を自動反映すると監査証跡が崩れるため。**補記**: 将来的に confirmed 済み期間の attendance を UI 上で編集不可にする可能性がある。その場合、attendance 編集時に `payrollStatus == "reflected"` かつ帰属期間が confirmed であれば編集をブロックする仕様を追加する。現時点では編集は許可するが `corrected_after_reflection` でマークする方式を採用する |
| 16 | 計算結果チェック（anomalyFlags） | **枠組みのみ実装**。`generateAnomalyFlags` 関数を finalizePayrollRun から必ず呼び出す構造にするが、初期リリースでは実質的なチェックは行わない（常に空のフラグを返す）。関数内にコメントで「チェック内容は運用開始後に追加する」旨を記載する。チェックロジックの追加はコード変更のみで対応可能な構造とする |

---

## 16. 未確定事項一覧

なし（全項目確定済み）

---

## 17. 各 spec ファイルへの影響まとめ

本設計が確定した場合に、各 spec ファイルで修正が必要な箇所。

### 01_CALC_SPEC.md

| 箇所 | 修正内容 |
|------|---------|
| セクション2 | 「staff 単位で独立タスクとして実行される」旨の注記追加。アルゴリズム自体は変更なし |
| 影響度 | **小** |

### 02_CONFIG_SPEC.md

| 箇所 | 修正内容 |
|------|---------|
| 変更なし | snapshot の保存先（payrollRuns）は変わらない。Cloud Tasks の設定はデプロイ設定であり payrollConfig には含めない |
| 影響度 | **なし** |

### 03_DATA_MODEL_SPEC.md

| 箇所 | 修正内容 |
|------|---------|
| セクション2-2 payrollRuns | status の値に `preparing` / `processing` / `aggregating` / `completed_with_errors` / `cancelled` を追加 |
| セクション2-3 staffResults | taskStatus, taskStartedAt, taskFinishedAt, taskError, assignedAttendanceIds, assignedCarryOverAttendanceIds を追加 |
| セクション2-2 バッチ書き込み | staff 単位で自然に分離される旨に更新 |
| 影響度 | **中** |

### 04_CALLABLE_API_SPEC.md

| 箇所 | 修正内容 |
|------|---------|
| セクション3 executeMonthlyPayroll | **全面書き換え**: レスポンス・処理概要を分散実行版に更新 |
| 新規: processStaffPayroll | onTaskDispatched の仕様を追加 |
| 新規: finalizePayrollRun | サマリ集計タスクの仕様を追加 |
| 新規: retryFailedStaffTasks | 手動リトライ Callable の仕様を追加 |
| 新規: cancelPayrollRun | 中止 Callable の仕様を追加 |
| セクション4 confirmPayrollRun | 前提条件に run.status == "completed" を追加 |
| 影響度 | **最大** |

### 05_PROCESS_FLOW_SPEC.md

| 箇所 | 修正内容 |
|------|---------|
| セクション1 ライフサイクル | payrollRuns の status 遷移を更新 |
| セクション2 executeMonthlyPayroll | タスク投入フローに全面書き換え |
| 新規: processStaffPayroll フロー | 計算タスクの内部処理フローを追加 |
| 新規: finalizePayrollRun フロー | サマリ集計フローを追加 |
| セクション4 再計算 | 月全体再計算として確定 |
| 未確定事項・懸念事項 | 解消済みの項目を更新 |
| 影響度 | **大** |

### 06_UI_SPEC.md

| 箇所 | 修正内容 |
|------|---------|
| セクション3-6 給与計算実行 | 進捗バー表示・リアルタイムリスニングの仕様を追加 |
| 新規: 進捗表示 | processing 中の UI を追加 |
| 新規: エラー表示 + 再実行 | completed_with_errors 時の UI を追加 |
| 新規: 中止ボタン | processing 中の中止操作 UI を追加 |
| セクション4 計算結果タブ | データソースの変更（Callable レスポンス → Firestore リスニング）を反映 |
| 影響度 | **中** |

### 07_NOTIFICATION_SCHEDULER_SPEC.md

| 箇所 | 修正内容 |
|------|---------|
| セクション2-2 | スケジューラーからの自動実行が Cloud Tasks 経由になる点の注記（ただしスケジューラーは通知のみの方針のため影響は小さい） |
| 影響度 | **小** |
