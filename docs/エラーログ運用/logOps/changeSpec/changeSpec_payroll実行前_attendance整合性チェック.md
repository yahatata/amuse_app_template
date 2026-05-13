# changeSpec: payroll実行前 attendance整合性チェック

## 1. 文書情報

- **文書名**: changeSpec: payroll実行前 attendance整合性チェック
- **作成日**: 2026-05-13
- **対象**: Firebase Cloud Functions（給与実行 Callable における、実行直前の勤怠ドキュメント整合性検証）
- **関連仕様**:
  - [`エラーログ拡張仕様書_差分実装版.md`](../仕様/エラーログ拡張仕様書_差分実装版.md)（`logOpsError` / `errorKey` / `errorSource`）
  - [`メイン完了後の補助処理失敗_初期方針.md`](../仕様/メイン完了後の補助処理失敗_初期方針.md)（`attendanceOnWrite` 補助フィールド gap）
  - `docs/config_migration/phase4_3/specs/04_CALLABLE_API_SPEC.md`（参照コメントあり・エラー設計の上流）
- **対象ファイル（実装時）**:
  - **主**: `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts`
  - **従**: `functions/src/domains/attendance/helpers/payrollErrors.ts`（`PAYROLL_ERRORS` 追加）
  - **推奨**: validation 純関数用 helper（例: `functions/src/domains/attendance/helpers/payrollAttendanceValidation.ts` 新規、または `payrollRunHelpers.ts` 近傍）

## 2. 背景

`attendanceOnWrite` は勤怠 doc の作成・更新時に、給与集計で使う **補助フィールド**（`paymentPeriodKey` / `payrollStatus` / `weekStartDate` / `weekday`）を付与する想定である。

現行の payroll 処理は、これらを **`date` から再計算して上書きするのではなく**、**Firestore の attendance doc 上の値を読み取って**利用している。具体的には次の経路で影響する。

- **候補抽出**（例: `getPayrollCandidates` の `paymentPeriodKey` / `payrollStatus` 条件）
- **通常 / キャリー分類**（`classifyAttendancesForRun` が doc の `paymentPeriodKey` を参照）
- **計算対象判定**（`payrollCalcEngine` の `isTarget` が `paymentPeriodKey` と `payrollStatus` を参照）
- **週グループ化**（`calculateStaffPayroll` / 参照取得が `weekStartDate` に依存）
- **法定休日判定**（`weekday` を参照）

補助フィールドの欠落・型ずれ・空文字・形式不正のまま `executeMonthlyPayroll` が進むと、**対象漏れ・誤分類・週次残業の配分ずれ・法定休日判定の誤り**など、給与額や運用上の整合性に実害が出うる。

本 changeSpec は、**自動補正 batch ではなく**、まず **payroll 実行前 validation** で実行自体を止める方針を定める。

## 3. 目的

- **壊れた attendance データのまま `payrollRun` が作成され、Cloud Tasks が投入される状態を防ぐ**。
- 欠落・不正値を **fail-fast** で検知し、**中央ログ（`logOpsError`）と Callable 失敗（`HttpsError`）**の両方で運用可能にする。
- **ドキュメント値の自動補正は行わない**（検出と停止に留める）。

## 4. 対象範囲

### 4.1 今回対象とするもの

- **`executeMonthlyPayroll` Callable** における、**リクエストで指定された全 `attendanceIds`** に対する **実行直前の整合性チェック**。
- チェック対象フィールドは **§7** の表に従う（doc 基本 + 補助4項目）。
- **1件でも NG なら** `payrollRun` 作成前に **全体を失敗**とする（fail-fast）。

### 4.2 今回対象外とするもの

- attendance 補助フィールドの **自動補正**（onWrite 相当の再計算・書き戻し）
- attendance **一括補正 batch**
- 共通 **`opsRepairJobs`** / **補助未完了 UI**
- **通知再送**や通知系 repair
- **`billsEventsOnCreate` / `billsOnSettle` / `completeAccountingV2` 系の repair**（別 changeSpec / 別方針）
- **`processStaffPayroll` 側の二段 validation**（将来検討に委ねる）
- **`getPayrollCandidates` の変更**
- **`date` から `paymentPeriodKey` / `weekStartDate` / `weekday` を再計算し、doc 値と一致することの検証**（初期 validation の範囲外）
- **リクエストの `paymentPeriodKey` と doc の `paymentPeriodKey` の一致を必須とすること**（キャリー設計と矛盾するため）
- **`payrollStatus === "reflected"` を単独理由で NG にすること**（今回は enum・型・欠落のみ）
- **`HttpsError` の `details` 本格導入**（第3引数での構造化レスポンスは行わない）

## 5. 現状整理

`executeMonthlyPayroll.ts` の処理は概ね次の順である。

1. 認証・管理者デバイス確認  
2. リクエスト検証（`paymentPeriodKey` 形式、`attendanceIds` 非空）  
3. `monthlyPayroll` の confirmed / paid ガード  
4. `getPayrollConfig`  
5. **`attendanceIds` を doc で一括 `get`**  
6. **ループ**: doc **不存在** → **`logOpsError` の後 `continue` でスキップ**（ラン作成後もその ID は分類対象に載らない）  
7. 存在する doc から `AttendanceForRun[]` を組み立て（現状は `staffId` / `paymentPeriodKey` / `clockOut` / `isDeleted` ベース）  
8. `classifyAttendancesForRun` → `groupByStaffId`  
9. `payrollRuns` の `runRef.set`、続いて `staffResults` と Tasks enqueue  

**補足（現状）**

- **補助4項目**（`weekStartDate` / `weekday` / `payrollStatus` の十分性について）は、`AttendanceForRun` 段階では参照されず、**実行 Callable 内では未検証**である。
- **不存在 doc のスキップ**により、「一部欠けた ID リスト」でも **ランが進む**余地がある。
- **`runRef.set` は読み取り・組み立ての後段**にあるため、**その直前に validation を挿入すれば `payrollRun` は作成されない**。

## 6. To-be 方針

- attendance doc を読み込み、**ラン投入用の内部表現（または `AttendanceForRun[]` 組み立て直後のデータ）に対して validation を実行する**。
- **1件でも NG なら fail-fast** とする。  
  - **`payrollRun` を作成しない**  
  - **`staffResults` を作成しない**  
  - **Cloud Tasks を enqueue しない**  
- NG 時は **`logOpsError` を 1 回だけ**出す（複数 NG を **1 ログに集約**）。  
- 続けて **`HttpsError` を throw** し、Callable を失敗させる。  
- **自動補正は行わない**（検出・停止のみ）。

## 7. validation 仕様

形式検証で用いる正規表現は、既存の `executeMonthlyPayroll` と整合させる。

- **期間キー**: `PERIOD_KEY_REGEX = /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/`（実装時は共通化を検討）
- **日付（単一日）**: `^\d{4}-\d{2}-\d{2}$`（`date` / `weekStartDate` 用）

### 7.1 チェック一覧

| 対象 | チェック内容 | NG 理由例（`reasons` に載せる識別子の例） | 備考 |
|------|--------------|---------------------------------------------|------|
| attendance doc 存在 | `get` 結果が **存在すること** | `missingAttendanceDoc` | **現状との差分**: 不存在は **スキップではなく NG** とし fail-fast（§12 参照） |
| `isDeleted` | **`true` でないこと**（`!== true`。フィールド欠落は **`undefined !== true`** として許容） | `attendanceDeleted` | 依頼仕様どおり「論理削除は対象外」 |
| `staffId` | **存在**し、**string** で、**空文字でない**こと | `missingStaffId`, `invalidStaffIdType`, `emptyStaffId` | |
| `date` | **存在**し、**string** で、**`YYYY-MM-DD` 形式**であること | `missingDate`, `invalidDateType`, `invalidDateFormat` | |
| `clockOut` | **存在**し、`null` / 欠落でないこと。Firestore **`Timestamp` インスタンスであること**（例: `firebase-admin` の `Timestamp` で `instanceof` 判定） | `missingClockOut`, `invalidClockOutType` | 「退勤済みのみラン対象」とするため |
| `paymentPeriodKey` | **存在**、**string**、**空文字でない**、**`PERIOD_KEY_REGEX` に合致** | `missingPaymentPeriodKey`, `invalidPaymentPeriodKeyType`, `emptyPaymentPeriodKey`, `invalidPaymentPeriodKeyFormat` | **リクエストの `paymentPeriodKey` との一致は要求しない**（キャリーあり） |
| `payrollStatus` | **存在**、**string**、許可 enum のいずれか: **`unreflected` / `reflected` / `corrected_after_reflection`** | `missingPayrollStatus`, `invalidPayrollStatusType`, `invalidPayrollStatusEnum` | **`reflected` は単独では NG にしない** |
| `weekStartDate` | **存在**、**string**、**空文字でない**、**`YYYY-MM-DD` 形式** | `missingWeekStartDate`, `invalidWeekStartDateType`, `emptyWeekStartDate`, `invalidWeekStartDateFormat` | **config との再計算一致は行わない** |
| `weekday` | **存在**、**number**、**0〜6 の整数**であること | `missingWeekday`, `invalidWeekdayType`, `weekdayOutOfRange` | **`date` からの再検証は行わない** |

### 7.2 複数理由

1 doc に複数欠陥がある場合、`reasons` は **配列で複数載せてよい**（サンプル上限は §8.1 に従う）。

## 8. エラー設計

### 8.1 logOpsError

| 項目 | 値 |
|------|-----|
| `functionEntry` | `executeMonthlyPayroll` |
| `operation` | `validateAttendanceBeforePayrollRun` |
| `errorSource` | `function_custom`（明示） |
| `errorKey` | `PAYROLL_ATTENDANCE_INTEGRITY_INVALID` |

**集約方針**

- validation NG は **doc 単位ではなく、1 回の Callable 呼び出しあたり `logOpsError` 1 回**にまとめる。
- **複数 doc が NG でも複数回 `logOpsError` を呼ばない**。

**`context`（必須・推奨）**

```typescript
{
  paymentPeriodKey: string;           // リクエストの期間キー
  attendanceIdsCount: number;         // リクエストの attendanceIds 件数
  invalidAttendanceCount: number;     // NG と判定した attendance 件数
  invalidAttendanceSamples: Array<{
    attendanceId: string;
    staffId?: string | null;         // 取得できた場合のみ
    date?: string | null;
    reasons: string[];               // §7.1 の識別子
  }>;
}
```

- **`invalidAttendanceSamples` は最大 10 件程度**とし、それを超える NG は **`invalidAttendanceCount` のみで表現**する（ログ肥大化防止）。
- **`cause`**: 実装側で付与してよい（例: 固定 `Error`）。ただし運用上の主情報は `context` と `errorKey` とする。

**`service` フィールド**

- **原則として `functionEntry` → `service` の既存マッピングに任せる。validation 実装では `service` を明示指定しない。**

### 8.2 HttpsError

| 項目 | 値 |
|------|-----|
| `code` | `failed-precondition` |
| `message` | `PAYROLL_ERRORS.ATTENDANCE_NOT_READY_FOR_PAYROLL_RUN` の値（short code 文字列） |

- **`details` の本格導入は行わない**（第3引数を付与しない、または付与しない方針で統一）。
- 管理者向けの詳細は **`logOpsError` の `context`** を正とする。

### 8.3 PAYROLL_ERRORS

`functions/src/domains/attendance/helpers/payrollErrors.ts` に **新規エントリを追加する**。

| キー | 値（short code 文字列） |
|------|-------------------------|
| `ATTENDANCE_NOT_READY_FOR_PAYROLL_RUN` | `attendance-not-ready-for-payroll-run` |

**テスト**

- `functions/__tests__/attendance/payrollErrors.spec.ts` は **`PAYROLL_ERRORS` のキー件数が固定**されている。**キー追加時は件数および期待値の更新が必要**。

## 9. 実装方針

- **実装場所**: Cloud Functions（本リポジトリの `functions/src`）。
- **差し込み箇所**: `executeMonthlyPayroll.ts` で、`attendanceDocs` を読み込み **各 doc のデータが揃った直後**（`AttendanceForRun[]` 構築直後を推奨）、**`classifyAttendancesForRun` より前**。
- **validation ロジック**は **Firestore に依存しない純関数**として切り出すことを推奨する（単体テスト容易・再利用可能）。
  - 配置候補: `payrollRunHelpers.ts` と同階層の **`payrollAttendanceValidation.ts`（新規）**、または責務分割のための専用ファイル。
- 純関数の入力は少なくとも **`attendanceId` + 生の `Record<string, unknown>`（または型付き partial）** とし、**出力は「全体 OK / NG リスト」**とする。
- **`PERIOD_KEY_REGEX` と日付正規表現**は、`executeMonthlyPayroll` と共有する（重複定義を避ける）。
- **`logOpsError` の `service` は §8.1 のとおり明示指定せず、`functionEntry` の既存マッピングに任せる。**

## 10. テスト方針

### 10.1 単体テスト（必須）

- validation 純関数に対し、**Firestore エミュレータなし**でケースを網羅する。
- **テストケース例**:
  - 正常系（全フィールド妥当）
  - `missingAttendanceDoc`（snapshot なしを疑似入力として表現）
  - `isDeleted === true`
  - `staffId` 欠落 / 非 string / 空文字
  - `date` 欠落 / 非 string / 形式不正
  - `clockOut` 欠落 / Firestore `Timestamp` でない値
  - `paymentPeriodKey` 欠落 / 空文字 / 形式不正
  - `payrollStatus` 欠落 / 非許可 enum
  - `weekStartDate` 欠落 / 空文字 / 形式不正
  - `weekday` 欠落 / 非 number / 範囲外（例: 7, -1, 1.5）
  - **複数 doc が NG** のとき、`invalidAttendanceSamples` が **上限で打ち切られる**こと（最大件数）
  - **`reflected` のみ**で他が健全なら **OK**
  - doc の `paymentPeriodKey` が **リクエストと異なるが形式は正しい**場合は **OK**（キャリー想定）

### 10.2 既存テストの更新

- **`payrollErrors.spec.ts`**: `PAYROLL_ERRORS` のキー数・各値のアサーション更新。

### 10.3 Callable 結合テスト（任意）

- `executeMonthlyPayroll` 全体のテストは現状ベースが薄い。**必要に応じて** emulator または mock で「validation 失敗時に `runRef.set` が呼ばれない」ことを確認する。

### 10.4 影響範囲

- **`payrollCalcEngine.spec.ts` 等の計算エンジンテスト**は、本 changeSpec が **純関数追加と Callable 分岐追加**に留まる限り **影響は限定的**と想定する。

## 11. 今回やらないこと

- attendance 補助フィールドの **自動補正**
- attendance **一括補正 batch**
- 共通 **`opsRepairJobs`**
- **補助未完了 UI**
- **通知再送**の自動化・一般化
- **`billsEventsOnCreate` / `billsOnSettle` / `completeAccountingV2` の repair 実装**
- **`processStaffPayroll` 側の二段 validation**
- **`getPayrollCandidates` の変更**
- **`date` から補助フィールドを再計算して一致確認すること**
- **リクエスト `paymentPeriodKey` と doc `paymentPeriodKey` の一致を必須とすること**
- **`payrollStatus === "reflected"` を即 NG にすること**
- **`HttpsError` の `details` 本格導入**

## 12. リスク・注意点

- **過去データ・移行データ**に不正フィールドが残っている場合、**初回から validation で実行が止まる**可能性がある（運用で事前スクリブ／データ修正が必要）。
- **現状**: 不存在 doc はログ後スキップ。**To-be**: fail-fast のため、**「一部 ID が欠けていてもランが進む」挙動は変わる**。運用上、クライアントは **全 ID が実在・健全であることを前提**にする必要がある。
- **`paymentPeriodKey` のリクエスト一致は要求しない**（通常 / キャリー設計を維持）。
- **`reflected` を即 NG にしない**。計上対象外は計算エンジン側の責務であり、本 changeSpecのスコープ外。
- **自動補正しない**ため、NG が出た attendance は **別手段（手動修正・将来 batch 等）で直す**必要がある。

## 13. 検証項目（実装後）

- NG データで `executeMonthlyPayroll` を呼ぶと **`payrollRuns` に新規 doc が作成されない**こと。
- NG データで **`staffResults` が作成されない**こと。
- NG データで **Cloud Tasks が enqueue されない**こと。
- NG 時 **`logOpsError` がちょうど 1 回**呼ばれ、`errorKey` / `operation` / `context` が §8.1 どおりであること。
- NG 時 **`HttpsError('failed-precondition', PAYROLL_ERRORS.ATTENDANCE_NOT_READY_FOR_PAYROLL_RUN)`** が throw されること。
- **`invalidAttendanceSamples` が最大件数を超えない**こと。
- 正常データでは **従来どおり run が作成され、Tasks が投入される**こと。
- **`paymentPeriodKey` がリクエストと異なるが妥当なキャリー doc** が混在するケースで、補助フィールドが正ければ **通過する**こと。
- **`payrollStatus: "reflected"`** かつ他項目が正しい場合 **通過する**こと。
- **`clockOut` が Firestore `Timestamp` でない** attendance で **NG** となること。

## 14. 未決事項

- attendance **一括補正 batch** を別途作るか。
- validation NG 時の **管理画面（クライアント）の表示文言・リトライ UX**。
- **`reflected` を run に含める運用**を将来見直すか（計算対象外との関係整理）。
- **`processStaffPayroll` に防御的 validation を追加するか**。
- **`HttpsError` の `details` を将来導入するか**。

---

## 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-05-06 | 初版 |
| 2026-05-13 | 文書情報の作成日を実日付（2026-05-13）に修正 |
| 2026-05-13 | `service` は functionEntry→service マッピングに委ね明示指定しない／`clockOut` は Firestore `Timestamp` 必須と明記 |
