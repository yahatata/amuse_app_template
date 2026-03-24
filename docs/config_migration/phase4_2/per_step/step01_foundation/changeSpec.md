# Step01: 基盤・設定整備 — 変更仕様書（changeSpec）

**対象**: [03_DEVELOPMENT_SEQUENCE.md](../../03_DEVELOPMENT_SEQUENCE.md) Step01  
**仕様**: [per_step/step01_foundation/SPEC.md](./SPEC.md)  
**最終更新**: 2026-03-20

---

## 1. 概要・目的

- 給与期間計算（`payroll.startDay/endDay`）の共通ロジックを `payrollPeriodUtils.ts` に整備し、01_TOBE 8.2 の期間計算ルール（endDay≠0 時の実行日判定）を実装する
- `storeMeta/payrollConfig` を新規ドキュメントとして追加し、型・ローダー・初期化を実装する
- Flutter 側で storeMeta/config と**同一処理**としてアプリ起動時に payrollConfig を購読する（PayrollConfigService）
- Callable 共通エラーコード体系（payrollErrors.ts）を新規作成する
- 既存 `monthlyPayrollTrigger` の期間計算ロジックを `payrollPeriodUtils` に置き換える

**完了条件（SPEC より）**:

- endDay≠0 の期間計算が Jest テストで保証される（実行日 ≥ endDay / 実行日 < endDay の両ケース）
- endDay=0 の期間計算が Jest テストで保証される
- attendance.date（YYYY-MM-DD）が期間に含まれるかの判定が正しく動作する
- payrollConfig が未設定時でも安全に既定値で動く（Functions 側・Flutter 側）
- アプリ起動時に storeMeta/payrollConfig の購読が開始される
- initializeStoreConfigCallable 実行時に storeMeta/payrollConfig が作成・補完される
- payrollErrors.ts が作成され、主要エラーコードが export されている
- monthlyPayrollTrigger の期間計算を payrollPeriodUtils に置き換える

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| なし | Step01 は最初のステップのため依存なし |

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts` | **新規** 給与期間計算の共通ロジック。periodStart/periodEnd（YYYY-MM-DD）算出、attendance.date の期間判定 |
| `functions/src/shared/config/types.ts` | **変更** PayrollConfig 型を追加 |
| `functions/src/shared/config/payrollConfigLoader.ts` | **新規** storeMeta/payrollConfig の取得。未存在時は defaults にフォールバック |
| `functions/src/shared/config/defaults.ts` | **変更** PayrollConfig 用のデフォルト値を追加 |
| `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts` | **変更** storeMeta/payrollConfig の作成・不足フィールド補完を追加 |
| `functions/src/shared/errors/payrollErrors.ts` | **新規** 共通エラーコード定数 |
| `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | **変更** 期間計算ロジックを payrollPeriodUtils に置き換え |
| `functions/__tests__/domains/attendance/helpers/payrollPeriodUtils.spec.ts` | **新規** 期間計算の単体テスト |
| `functions/__tests__/shared/config/payrollConfigLoader.spec.ts` | **新規** ローダーの単体テスト（任意） |

### Dart（Flutter）

| ファイル | 変更内容 |
|----------|----------|
| `lib/services/payroll_config_service.dart` | **新規** storeMeta/payrollConfig の購読。StoreConfigService と同一パターン |
| `lib/services/payroll_config_defaults.dart` | **新規** PayrollConfigData のデフォルト値と fromMap |
| `lib/main.dart` | **変更** StoreConfigService.instance の直後に PayrollConfigService.instance を追加 |

### その他

| ファイル | 変更内容 |
|----------|----------|
| なし | |

---

## 4. 現状（As-Is）

### 4.1 payrollPeriodUtils.ts

- 存在しない。monthlyPayrollTrigger 内に期間計算ロジックが直書きされている

### 4.2 monthlyPayrollTrigger.ts（期間計算部分）

- 46-58 行付近: endDay=0 の場合は当月 startDay〜当月末日。endDay≠0 の場合は前月 startDay〜今月 endDay のみ実装
- **01_TOBE 8.2 未対応**: 実行日 < endDay のとき「前々月 startDay 〜 前月 endDay」のケースが未実装
- attendances の取得は `clockOut` でクエリしており、`date` フィールドでのクエリには未対応（Step08 でスケジューラー役割変更時に date ベースに変える可能性あり）

### 4.3 types.ts

- StoreConfig に payroll 型は存在。PayrollConfig 型は未定義

### 4.4 payrollConfigLoader.ts

- 存在しない。schedulerConfigLoader が同様のパターンで存在

### 4.5 defaults.ts

- DEFAULT_PAYROLL_START_DAY, DEFAULT_PAYROLL_END_DAY は存在。PayrollConfig 用のデフォルト（paymentDate, bulkPaymentRegistrationEnabled, expectedRange）は未定義

### 4.6 initializeStoreConfigCallable.ts

- storeMeta/config, requiredStaffByTimeSlot, schedulerConfig の初期化のみ。payrollConfig は未対応

### 4.7 payrollErrors.ts

- 存在しない。functions/src/shared/errors ディレクトリも未存在

### 4.8 store_config_service.dart / main.dart

- StoreConfigService が storeMeta/config を snapshots で購読。main.dart で StoreConfigService.instance を呼び出し
- PayrollConfigService は未存在

---

## 5. 変更後（To-Be）

### 5.1 payrollPeriodUtils.ts（新規）

| 変更 | 内容 |
|------|------|
| 新規 | `getPayrollPeriod(now: Date, startDay: number, endDay: number): { periodStart: string; periodEnd: string }` を実装。YYYY-MM-DD 形式で返す |
| 新規 | 01_TOBE 8.2 に準拠: endDay=0 は当月 startDay〜当月末日。endDay≠0 は実行日 ≥ endDay → 前月 startDay〜今月 endDay、実行日 < endDay → 前々月 startDay〜前月 endDay |
| 新規 | `isDateInPeriod(dateStr: string, periodStart: string, periodEnd: string): boolean` を実装。attendance.date が期間に含まれるか判定 |
| 新規 | JST で実行日を判定するため、`now` は呼び出し元で Asia/Tokyo の現在時刻を渡す想定 |

**01_TOBE 参照**: セクション 8.2

### 5.2 types.ts

| 変更 | 内容 |
|------|------|
| 追加 | `PayrollConfig` 型を追加。paymentDate: string, bulkPaymentRegistrationEnabled?: boolean, expectedRange?: { attendanceCountMin/Max, estimatedAmountMin/Max, totalHoursMin/Max }, maxCandidatesCount?: number |
| 追加 | `ExpectedRange` 型（optional フィールド） |
| 追加 | `maxCandidatesCount`（Step02 getPayrollCandidates の返却件数制限。未設定時は 1000） |

**01_TOBE 参照**: セクション 7.1

### 5.3 payrollConfigLoader.ts（新規）

| 変更 | 内容 |
|------|------|
| 新規 | `getPayrollConfig(db?: Firestore): Promise<PayrollConfig>` を実装。storeMeta/payrollConfig を取得。未存在時は buildPayrollConfigFromDefaults() を返す |
| 新規 | `buildPayrollConfigFromDefaults(): PayrollConfig` を実装 |
| 新規 | schedulerConfigLoader と同様のパターン（MAX_RETRIES, 読み取り失敗時は defaults にフォールバック） |

**SPEC 参照**: 論点 1

### 5.4 defaults.ts

| 変更 | 内容 |
|------|------|
| 追加 | `DEFAULT_PAYROLL_PAYMENT_DATE = 'YYYY-MM-DD'`（例: 翌月25日をデフォルトとする場合、当月に応じて算出するか、固定値 '9999-12-25' 等のプレースホルダかは実装時に決定。店舗ごとに Firestore で上書きするため、実運用では初期化時に設定） |
| 追加 | `DEFAULT_BULK_PAYMENT_REGISTRATION_ENABLED = false` |
| 追加 | `DEFAULT_EXPECTED_RANGE`（各 min/max は undefined または null で「未設定」を表す） |
| 追加 | `DEFAULT_MAX_CANDIDATES_COUNT = 1000`（Step02 getPayrollCandidates の返却件数制限。storeMeta/payrollConfig で上書き可能） |

**注意**: paymentDate のデフォルトは、initializeStoreConfigCallable で storeMeta/config の payroll.endDay 等から算出するか、固定値とするかは実装時に決定。店舗ごとの初期化時に Firestore に保存される。

### 5.5 initializeStoreConfigCallable.ts

| 変更 | 内容 |
|------|------|
| 追加 | `storeMeta/payrollConfig` の作成・補完を追加。config と同様の merge ロジック（既存時は不足フィールドのみデフォルトで追加） |
| 追加 | payrollConfigRef = db.collection('storeMeta').doc('payrollConfig') を取得 |
| 追加 | 未存在時は buildPayrollConfigFromDefaults() で作成。既存時は mergePayrollConfigForUpsert で補完 |
| 追加 | created/updated に 'storeMeta/payrollConfig' を含める |

**SPEC 参照**: 論点 2

### 5.6 payrollErrors.ts（新規）

| 変更 | 内容 |
|------|------|
| 新規 | `PERMISSION_DENIED = 'permission-denied'` |
| 新規 | `ALREADY_CONFIRMED = 'already-confirmed'` |
| 新規 | `INVALID_PERIOD = 'invalid-period'` |
| 新規 | `PAYROLL_CONFIG_NOT_FOUND = 'payroll-config-not-found'` |
| 新規 | `NO_ATTENDANCE_SELECTED = 'no-attendance-selected'` |
| 新規 | 各定数を export |

**SPEC 参照**: 論点 5

### 5.7 monthlyPayrollTrigger.ts

| 変更 | 内容 |
|------|------|
| 置換 | 34-58 行付近の期間計算ロジックを `getPayrollPeriod(now, startDay, endDay)` の呼び出しに置き換え |
| 追加 | `import { getPayrollPeriod } from '../helpers/payrollPeriodUtils'` |
| 変更 | `now` は `new Date()`（Cloud Functions は UTC で動作するが、JST で実行日を判定する場合は `moment-timezone` 等で JST の今日を取得するか、cron が Asia/Tokyo で 25 日 23:59 に発火するため、実行日は実質 25 日または 26 日。payrollPeriodUtils は「実行日」を引数で受け取る設計とする） |

**01_TOBE 参照**: セクション 8.2

### 5.8 payroll_config_service.dart（新規）

| 変更 | 内容 |
|------|------|
| 新規 | StoreConfigService と同一パターン: storeMeta/payrollConfig を snapshots() で購読 |
| 新規 | PayrollConfigData クラス（paymentDate, bulkPaymentRegistrationEnabled, expectedRange） |
| 新規 | fromMap / fromDefaults。未存在時は defaults へフォールバック。読み取り失敗時は最後の成功値を維持 |
| 新規 | PayrollConfigService シングルトン。_initializeListener で購読開始 |

**SPEC 参照**: 論点 1（storeMeta/config と明確に同じ処理）

### 5.9 payroll_config_defaults.dart（新規）

| 変更 | 内容 |
|------|------|
| 新規 | PayrollConfigData のデフォルト定数（kDefaultPaymentDate, kDefaultMaxCandidatesCount = 1000 等） |
| 新規 | fromMap で Firestore の Map から PayrollConfigData を構築。不足フィールドは defaults で補完 |

### 5.10 main.dart

| 変更 | 内容 |
|------|------|
| 追加 | `import 'package:amuse_app_template/services/payroll_config_service.dart'` |
| 追加 | `StoreConfigService.instance;` の直後に `PayrollConfigService.instance;` を追加 |
| 追加 | コメント: `// What: storeMeta/payrollConfig の購読を早期開始（storeMeta/config と同一処理）` |

**SPEC 参照**: 論点 1

---

## 6. 実装順序

```
Phase 0: 準備
  - 本 changeSpec の確認
  - SPEC.md の完了条件を再確認
  ↓ 【検証: 依存なし】

Phase 1: payrollPeriodUtils の作成
  - payrollPeriodUtils.ts を新規作成（getPayrollPeriod, isDateInPeriod）
  - payrollPeriodUtils.spec.ts を新規作成（endDay=0, endDay≠0 の各ケース、isDateInPeriod）
  ↓ 【検証: Jest テストが通る】

Phase 2: PayrollConfig 型・defaults・ローダーの追加
  - types.ts に PayrollConfig 型を追加
  - defaults.ts に PayrollConfig 用デフォルトを追加
  - payrollConfigLoader.ts を新規作成
  - payrollConfigLoader.spec.ts を新規作成（任意）
  ↓ 【検証: getPayrollConfig が未存在時でも defaults を返す】

Phase 3: initializeStoreConfigCallable の拡張
  - initializeStoreConfigCallable に storeMeta/payrollConfig の作成・補完を追加
  ↓ 【検証: Callable 実行時に payrollConfig が作成される】

Phase 4: payrollErrors の作成
  - functions/src/shared/errors/payrollErrors.ts を新規作成
  ↓ 【検証: 定数が export されている】

Phase 5: monthlyPayrollTrigger の期間計算置き換え
  - monthlyPayrollTrigger で getPayrollPeriod を import し、期間計算部分を置き換え
  ↓ 【検証: 既存スケジューラーの動作が維持される（Step08 で役割変更予定のため、現時点では計算実行は継続）】

Phase 6: Flutter PayrollConfigService の作成
  - payroll_config_defaults.dart を新規作成
  - payroll_config_service.dart を新規作成
  - main.dart に PayrollConfigService.instance を追加
  ↓ 【検証: アプリ起動時に購読が開始され、latestData が取得できる】
```

---

## 7. 検証ポイント

| # | 観点 | 方法 |
|---|------|------|
| 1 | endDay≠0 の期間計算（実行日 ≥ endDay） | Jest: 実行日 25 日、endDay 25 → 前月 26 日〜今月 25 日 |
| 2 | endDay≠0 の期間計算（実行日 < endDay） | Jest: 実行日 24 日、endDay 25 → 前々月 26 日〜前月 25 日 |
| 3 | endDay=0 の期間計算 | Jest: 実行日 15 日、startDay 1、endDay 0 → 当月 1 日〜当月末日 |
| 4 | isDateInPeriod の境界 | Jest: "2026-03-25" が "2026-02-26"〜"2026-03-25" に含まれる |
| 5 | payrollConfig 未存在時 | getPayrollConfig が defaults を返す |
| 6 | initializeStoreConfigCallable | 実行後に storeMeta/payrollConfig が作成される |
| 7 | PayrollConfigService | main 起動後、StoreConfigService.instance の直後に PayrollConfigService.instance が呼ばれ、購読が開始される |
| 8 | payrollErrors | 定数が import 可能である |

---

## 8. チェックリスト

### 実装時

- [ ] payrollPeriodUtils.ts を新規作成（getPayrollPeriod, isDateInPeriod）
- [ ] payrollPeriodUtils.spec.ts を新規作成
- [ ] types.ts に PayrollConfig 型を追加
- [ ] defaults.ts に PayrollConfig 用デフォルトを追加
- [ ] payrollConfigLoader.ts を新規作成
- [ ] initializeStoreConfigCallable に payrollConfig の作成・補完を追加
- [ ] payrollErrors.ts を新規作成
- [ ] monthlyPayrollTrigger の期間計算を payrollPeriodUtils に置き換え
- [ ] payroll_config_defaults.dart を新規作成
- [ ] payroll_config_service.dart を新規作成
- [ ] main.dart に PayrollConfigService.instance を追加

### 確認時

- [ ] Functions ビルドが通る（`npm run build`）
- [ ] Flutter ビルドが通る（`flutter analyze`）
- [ ] payrollPeriodUtils の Jest テストが通る
- [ ] アプリ起動時に PayrollConfigService の購読が開始されることを確認（デバッグログ等）

---

## 9. ロールバック手順

- **payrollPeriodUtils**: ファイル削除。monthlyPayrollTrigger の期間計算を元のインライン実装に戻す
- **payrollConfig**: payrollConfigLoader.ts 削除、types.ts から PayrollConfig 型削除、defaults.ts から PayrollConfig デフォルト削除、initializeStoreConfigCallable から payrollConfig 処理を削除
- **payrollErrors**: ファイル削除
- **Flutter**: payroll_config_service.dart, payroll_config_defaults.dart 削除、main.dart から PayrollConfigService.instance を削除

---

## 10. リスク・注意事項

- **monthlyPayrollTrigger**: Step08 でスケジューラーを通知・確認専用に変更する予定。Step01 では期間計算の置き換えのみ行い、計算実行ロジックは残す（既存動作維持）
- **paymentDate デフォルト**: 店舗ごとに Firestore で設定するため、defaults の paymentDate は「未設定時のフォールバック用」として扱う。実運用では initializeStoreConfigCallable 実行時に必ず Firestore に保存される
- **JST 判定**: payrollPeriodUtils の `now` は呼び出し元で渡す。Cloud Scheduler は timeZone: "Asia/Tokyo" で発火するため、`new Date()` は UTC だが、cron 発火時刻が JST 25 日 23:59 であれば、UTC では 25 日 14:59 頃。実行日を「JST の今日」とする場合は、`now` を JST に変換してから getPayrollPeriod に渡す必要がある。実装時に moment-timezone または Intl で JST の日付を取得する
