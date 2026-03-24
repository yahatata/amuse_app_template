# Phase4.2: changeSpec 変更内容集約

**作成日**: 2026-03-20  
**目的**: changeSpec 作成時点での変更内容を集約し、各 Step で行う修正の全容を一覧で把握する。

---

## 変更一覧（Step 別）

| Step | 状態 | changeSpec | 概要 |
|------|------|------------|------|
| Step01 | changeSpec 作成済 | [per_step/step01_foundation/changeSpec.md](./per_step/step01_foundation/changeSpec.md) | 基盤・設定整備 |
| Step02 | changeSpec 作成済 | [per_step/step02_candidates_callable/changeSpec.md](./per_step/step02_candidates_callable/changeSpec.md) | 対象データ抽出 Callable |

---

## Step01: 基盤・設定整備 — 修正の全容

### 変更対象ファイル一覧

| 種別 | ファイル | 操作 |
|------|----------|------|
| Functions | `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts` | 新規 |
| Functions | `functions/src/shared/config/types.ts` | 変更 |
| Functions | `functions/src/shared/config/payrollConfigLoader.ts` | 新規 |
| Functions | `functions/src/shared/config/defaults.ts` | 変更 |
| Functions | `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts` | 変更 |
| Functions | `functions/src/shared/errors/payrollErrors.ts` | 新規 |
| Functions | `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | 変更 |
| Functions | `functions/__tests__/domains/attendance/helpers/payrollPeriodUtils.spec.ts` | 新規 |
| Functions | `functions/__tests__/shared/config/payrollConfigLoader.spec.ts` | 新規（任意） |
| Flutter | `lib/services/payroll_config_service.dart` | 新規 |
| Flutter | `lib/services/payroll_config_defaults.dart` | 新規 |
| Flutter | `lib/main.dart` | 変更 |

### 変更内容の詳細

#### 1. payrollPeriodUtils.ts（新規）

- **目的**: 給与期間計算の共通ロジックを 01_TOBE 8.2 に準拠して実装
- **主な関数**:
  - `getPayrollPeriod(now: Date, startDay: number, endDay: number): { periodStart: string; periodEnd: string }`
    - endDay=0: 当月 startDay 〜 当月末日
    - endDay≠0 かつ 実行日 ≥ endDay: 前月 startDay 〜 今月 endDay
    - endDay≠0 かつ 実行日 < endDay: 前々月 startDay 〜 前月 endDay
  - `isDateInPeriod(dateStr: string, periodStart: string, periodEnd: string): boolean`
- **出力形式**: periodStart/periodEnd は YYYY-MM-DD 文字列（attendance.date との比較・Firestore クエリに使用）

#### 2. types.ts（変更）

- **追加**: `PayrollConfig` 型
  - `paymentDate: string` (YYYY-MM-DD)
  - `bulkPaymentRegistrationEnabled?: boolean`
  - `expectedRange?: { attendanceCountMin?, attendanceCountMax?, estimatedAmountMin?, estimatedAmountMax?, totalHoursMin?, totalHoursMax? }`
  - `maxCandidatesCount?: number`（Step02 getPayrollCandidates の返却件数制限。デフォルト 1000）

#### 3. payrollConfigLoader.ts（新規）

- **目的**: storeMeta/payrollConfig の取得。schedulerConfigLoader と同様のパターン
- **主な関数**:
  - `getPayrollConfig(db?: Firestore): Promise<PayrollConfig>`
  - `buildPayrollConfigFromDefaults(): PayrollConfig`
- **挙動**: 未存在時・読み取り失敗時は defaults にフォールバック

#### 4. defaults.ts（変更）

- **追加**: PayrollConfig 用デフォルト
  - `DEFAULT_PAYROLL_PAYMENT_DATE`
  - `DEFAULT_BULK_PAYMENT_REGISTRATION_ENABLED`
  - `DEFAULT_EXPECTED_RANGE`（各 min/max は optional）
  - `DEFAULT_MAX_CANDIDATES_COUNT = 1000`

#### 5. initializeStoreConfigCallable.ts（変更）

- **追加**: storeMeta/payrollConfig の作成・不足フィールド補完
- **処理**: config と同様の merge ロジック。未存在時は buildPayrollConfigFromDefaults() で作成。既存時は mergePayrollConfigForUpsert で補完
- **レスポンス**: created/updated に 'storeMeta/payrollConfig' を含める

#### 6. payrollErrors.ts（新規）

- **目的**: Step02/03 の Callable で使用する共通エラーコード
- **定数**: `PERMISSION_DENIED`, `ALREADY_CONFIRMED`, `INVALID_PERIOD`, `PAYROLL_CONFIG_NOT_FOUND`, `NO_ATTENDANCE_SELECTED`

#### 7. monthlyPayrollTrigger.ts（変更）

- **変更**: 期間計算ロジック（34-58 行付近）を `getPayrollPeriod(now, startDay, endDay)` の呼び出しに置き換え
- **注意**: Step08 でスケジューラー役割変更予定。Step01 では期間計算の置き換えのみ

#### 8. payroll_config_service.dart（新規）

- **目的**: storeMeta/payrollConfig の購読。StoreConfigService と**同一パターン**
- **処理**: snapshots() で storeMeta/payrollConfig を購読。未存在時は defaults へフォールバック。読み取り失敗時は最後の成功値を維持
- **クラス**: PayrollConfigData, PayrollConfigService（シングルトン）

#### 9. payroll_config_defaults.dart（新規）

- **目的**: PayrollConfigData のデフォルト値と fromMap
- **処理**: Firestore の Map から PayrollConfigData を構築。不足フィールドは defaults で補完

#### 10. main.dart（変更）

- **追加**: `StoreConfigService.instance;` の直後に `PayrollConfigService.instance;` を追加
- **目的**: アプリ起動時に storeMeta/payrollConfig の購読を早期開始（storeMeta/config と明確に同じ処理）

### Firestore ドキュメント

| コレクション/ドキュメント | 操作 | 内容 |
|--------------------------|------|------|
| `storeMeta/payrollConfig` | 新規作成（initializeStoreConfigCallable 実行時） | paymentDate, bulkPaymentRegistrationEnabled, expectedRange を保存。店舗ごとに初期化 |

### 完了条件（Step01）

- [ ] endDay≠0 の期間計算が Jest テストで保証される
- [ ] endDay=0 の期間計算が Jest テストで保証される
- [ ] attendance.date が期間に含まれるかの判定が正しく動作する
- [ ] payrollConfig が未設定時でも安全に既定値で動く（Functions 側・Flutter 側）
- [ ] アプリ起動時に storeMeta/payrollConfig の購読が開始される
- [ ] initializeStoreConfigCallable 実行時に storeMeta/payrollConfig が作成・補完される
- [ ] payrollErrors.ts が作成され、主要エラーコードが export されている
- [ ] monthlyPayrollTrigger の期間計算を payrollPeriodUtils に置き換える

---

## Step02: 対象データ抽出 Callable — 修正の全容

### 変更対象ファイル一覧

| 種別 | ファイル | 操作 |
|------|----------|------|
| Functions | `functions/src/domains/attendance/callables/getPayrollCandidates.ts` | 新規 |
| Functions | `functions/src/domains/attendance/index.ts` | 変更 |
| Functions | `functions/__tests__/domains/attendance/callables/getPayrollCandidates.spec.ts` | 新規 |

### 変更内容の詳細

#### 1. getPayrollCandidates.ts（新規）

- **目的**: 給与計算用の対象 attendances を属性1/2/3 に分類して返却。01_TOBE 2.1〜2.3、2.6 に準拠
- **主な処理**:
  - リクエスト: `paymentPeriodKey`（YYYY-MM-DD）を受け取る
  - 期間算出: getStoreConfig で payroll.startDay/endDay を取得し、paymentPeriodKey から getPayrollPeriod で periodStart/periodEnd を算出
  - 属性判定: 属性判定表に従い group1（期間内・退勤済・非削除）、group2（期間外・前回未反映）、group3（期間内・未退勤 or 論理削除）に分類
  - reasonType / reasonLabel: 論点4の表に従い付与（in_period, not_reflected, other）
  - 件数制限: payrollConfig.maxCandidatesCount（デフォルト 1000）を超える件数は返却しない
  - 権限: admin のみ呼び出し可能。違反時は PERMISSION_DENIED
- **レスポンス**: periodStart, periodEnd, group1, group2, group3（previewMeta は返さない）
- **エラー**: permission-denied, invalid-argument, payroll-config-not-found

#### 2. attendance/index.ts（変更）

- **追加**: `export { getPayrollCandidates } from "./callables/getPayrollCandidates";`

#### 3. getPayrollCandidates.spec.ts（新規）

- **目的**: Callable の単体テスト
- **テスト観点**: 各属性の分類、未来の attendance 返却なし、reasonType/reasonLabel、maxCandidatesCount、admin 権限

### 依存関係

| 依存先 | 利用するもの |
|--------|-------------|
| Step01 | payrollPeriodUtils（getPayrollPeriod, isDateInPeriod）、getPayrollConfig、payrollErrors、storeMeta/config、storeMeta/payrollConfig（maxCandidatesCount） |

### 完了条件（Step02）

- [ ] 属性3 → 属性2 → 属性1 の順で返却される
- [ ] 計算期間より未来の attendance は返却されない
- [ ] 各 attendance エントリに reasonType, reasonLabel が付与される
- [ ] maxCandidatesCount を超える件数は返却されない
- [ ] admin 以外の呼び出しで PERMISSION_DENIED が返る
- [ ] 論理削除・未退勤の attendance が属性3に正しく分類される
- [ ] 期間外・前回未反映の attendance が属性2に正しく分類される

---

## 今後の Step の changeSpec 追加時

本ファイルに以下を追記する:

1. 「変更一覧（Step 別）」の表に該当 Step を追加
2. 該当 Step の「修正の全容」セクションを追加（上記 Step01 と同様の形式で）
