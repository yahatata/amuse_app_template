# Step01: 基盤・設定整備 — 仕様確定（最終版）

**作成日**: 2026-03-20  
**対象 STEP_PLAN**: [per_step/step01_foundation/STEP_PLAN.md](./STEP_PLAN.md)  
**ステータス**: 承認済み（レビュー後 changeSpec 作成可）

---

## 1. 前ステップとの整合性確認

> Step01 は最初のステップのため、01_TOBE_DETAILED_SPEC および 02_REVIEW_AND_OPEN_ITEMS との整合を確認する。

| 確認項目 | 参照元の内容 | 当ステップへの影響 | 問題なし/要対応 |
|----------|--------------|-------------------|----------------|
| 計算対象期間の SSOT | 01_TOBE 7.1: storeMeta/config の payroll.startDay/endDay | payrollPeriodUtils は config から取得した payroll を参照 | 問題なし |
| payrollConfig 配置 | 01_TOBE 7.1: 新規ドキュメント or config 拡張 | 論点1で別 doc を採用 | 問題なし |
| 計算可能期間の導出 | 01_TOBE 7.1: paymentDate から導出、当日 JST で判定 | 論点3で採用案を採用 | 問題なし |
| 期間計算ルール（endDay≠0） | 01_TOBE 8.2: 実行日と endDay の比較で対象期間を決定 | payrollPeriodUtils に実装 | 問題なし |
| 店舗ごとの設定 | 02_REVIEW: 1 repo 複数店舗、Firebase プロジェクト別 | paymentDate 等は Firestore で店舗ごとに保持。初期化時に店舗ごとの設定を行う | 問題なし |
| attendance の日付キー | 既存: attendances は `date` フィールド（YYYY-MM-DD）を持つ | 期間判定はこの date が periodStart〜periodEnd に含まれるかで行う | 問題なし |

---

## 2. 論点と決定内容

### 論点 1: payrollConfig の配置

| 項目 | 内容 |
|------|------|
| **背景・問題** | storeMeta/config に含めるか、別ドキュメントにするか。責務分離と既存パターンとの整合を決める必要がある。 |
| **選択肢A** | storeMeta/payrollConfig を別ドキュメントとして新規作成 |
| **選択肢B** | storeMeta/config に payrollConfig フィールドを拡張 |
| **採用案** | **選択肢A**（storeMeta/payrollConfig 別 doc） |
| **根拠** | 01_TOBE 7.1 で「新規ドキュメント or config の拡張」とあり、給与専用の責務分離に適する。schedulerConfig と同様の別 doc パターンが既存で運用されている。 |
| **追加条件** | **storeMeta/config と明確に同じ処理として**アプリ起動時に読み込まれる。StoreConfigService と同一実装パターンとする: (1) `storeMeta` コレクション配下のドキュメント `payrollConfig` を snapshots() で購読、(2) main.dart で Firebase 初期化後・StoreConfigService.instance の直後に `PayrollConfigService.instance` を呼び出してシングルトン構築→購読開始、(3) 未存在時は defaults へフォールバック、(4) 読み取り失敗時は最後の成功値を維持（PHASE1_FALLBACK_BEHAVIOR 準拠）。 |
| **影響ファイル** | `functions/src/shared/config/types.ts`, `functions/src/shared/config/payrollConfigLoader.ts`（新規）, `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts`, `lib/services/payroll_config_service.dart`（新規）, `lib/services/payroll_config_defaults.dart`（新規）, `lib/main.dart` |
| **テスト観点** | payrollConfig 未存在時・読み取り失敗時に defaults へフォールバックする。Flutter 側で main 起動後に snapshots 購読が開始され、latestData が取得できる。StoreConfigService と同一順序で main.dart に並ぶことを確認。 |
| **決定日** | 2026-03-20 |

---

### 論点 2: paymentDate の運用

| 項目 | 内容 |
|------|------|
| **背景・問題** | 支払日を固定で運用するか、都度更新可能にするか。 |
| **選択肢A** | 固定日。初期化時に一度設定し、原則変更しない。 |
| **選択肢B** | 都度更新可能。管理者が UI から毎月・都度更新。 |
| **採用案** | **選択肢A**（固定日） |
| **根拠** | 01_TOBE では「支払日（予定）」とあり、月ごとに変える前提ではない。本プロジェクトは 1 リポジトリを複数店舗用にリリースし、各リリースに Firebase プロジェクトを紐づけるため、**日付設定は Firestore で店舗ごとに行う**。**店舗ごとの設定を初期化時に行う**（initializeStoreConfigCallable 実行時に storeMeta/payrollConfig を作成し、その時点で paymentDate 等を Firestore に保存）。原則変更はないが、必要に応じて Firestore を直接編集する運用を想定。 |
| **影響ファイル** | `functions/src/shared/config/defaults.ts`, `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts`, `lib/services/payroll_config_defaults.dart` |
| **テスト観点** | 初期化 Callable 実行時に paymentDate が Firestore に保存される。未設定時は defaults の値が使用される。 |
| **決定日** | 2026-03-20 |

---

### 論点 3: 計算可能期間の導出ロジック（端点・JST・attendance 日付判定）

| 項目 | 内容 |
|------|------|
| **背景・問題** | 計算可能期間の開始・終了の端点の扱い、当日判定のタイムゾーン、attendance の期間判定方法を確定する必要がある。 |
| **選択肢A** | 両端含む、JST で当日判定、終了日 = 支払日前日 |
| **選択肢B** | その他 |
| **採用案** | **選択肢A**（推奨案） |
| **根拠** | 01_TOBE 3.3 で「当日（JST）」と明記。計算可能期間は「給与期間終了日の翌日 0:00（JST）〜 支払日前日 23:59:59（JST）」とする。 |
| **attendance の期間判定** | attendances ドキュメントは `date` フィールド（例: `"2026-03-19"`、YYYY-MM-DD 形式）を持つ。**この date が期間に含まれるか**で判定する。payrollPeriodUtils は `periodStart` / `periodEnd` を YYYY-MM-DD 文字列として返し、attendance.date との比較は文字列比較（lexicographic、YYYY-MM-DD は比較可能）で行う。Firestore の `where("date", ">=", startDateStr).where("date", "<=", endDateStr)` と同じ形式で利用する。 |
| **影響ファイル** | `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts`（新規） |
| **テスト観点** | endDay=0 / endDay≠0 の各ケースで、実行日・startDay・endDay から正しい periodStart/periodEnd（YYYY-MM-DD 文字列）が算出される。attendance.date が periodStart〜periodEnd の範囲に含まれるかで true/false が返る。 |
| **決定日** | 2026-03-20 |

---

### 論点 4: payrollConfig 管理者設定 UI の担当 Step（GAP-4）

| 項目 | 内容 |
|------|------|
| **背景・問題** | paymentDate / bulkPaymentRegistrationEnabled / expectedRange の更新 UI をどのステップで実装するか。 |
| **選択肢A** | Step04 の計算用タブ内に設定セクションを追加 |
| **選択肢B** | 別途管理設定画面として独立 |
| **選択肢C** | Step01 では初期化のみ。更新 UI は後続で検討。**設定は保守運用タスクとして UI に載せない可能性まである。** |
| **採用案** | **選択肢C** |
| **根拠** | Step01 では型定義・ローダー・初期化に集中する。更新 UI は Step04 以降の仕様確定時に必要に応じて検討する。**設定は保守運用タスクとして UI に載せない可能性まで考慮**する（Firestore 直接編集で対応する運用もあり得る）。 |
| **影響ファイル** | 当ステップでは影響なし（後続で検討） |
| **テスト観点** | 当ステップでは該当なし |
| **決定日** | 2026-03-20 |

---

### 論点 5: Callable 共通エラーコード体系を Step01 に含めるか（GAP-6）

| 項目 | 内容 |
|------|------|
| **背景・問題** | Step02/03 の Callable で共通のエラーコードを使うため、Step01 で型定義を含めるか。 |
| **選択肢A** | Step01 で payrollErrors.ts を新規作成し、主要エラーコードを定義 |
| **選択肢B** | Step01 では含めず、Step02/03 で個別に定義 |
| **採用案** | **選択肢A**（含める） |
| **根拠** | 後続 Callable で一貫したエラーコードを使うため、事前に定義しておく。 |
| **影響ファイル** | `functions/src/shared/errors/payrollErrors.ts`（新規） |
| **テスト観点** | 定数が export され、他モジュールから参照できる。 |
| **決定日** | 2026-03-20 |

---

## 3. このステップの API 契約（Callable）

> Step01 では新規 Callable は作成しない。既存 `initializeStoreConfigCallable` を拡張するのみ。API 契約は既存のまま（success, message, created, updated を返す）。storeMeta/payrollConfig の作成・補完が created/updated に含まれる。

---

## 4. このステップで新規作成・変更するファイル一覧

| ファイルパス | 新規/変更 | 内容の概要 |
|------------|----------|-----------|
| `functions/src/domains/attendance/helpers/payrollPeriodUtils.ts` | 新規 | 給与期間計算の共通ロジック。payroll.startDay/endDay と実行日から periodStart/periodEnd（YYYY-MM-DD）を算出。attendance.date の期間判定ヘルパー。 |
| `functions/src/shared/config/types.ts` | 変更 | PayrollConfig 型を追加 |
| `functions/src/shared/config/payrollConfigLoader.ts` | 新規 | storeMeta/payrollConfig の取得。未存在時は defaults にフォールバック。configLoader と同様のパターン。 |
| `functions/src/shared/config/defaults.ts` | 変更 | PayrollConfig 用のデフォルト値を追加（または payrollConfigDefaults.ts を新規） |
| `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts` | 変更 | storeMeta/payrollConfig の作成・不足フィールド補完を追加。config と同様の merge ロジック。 |
| `functions/src/shared/errors/payrollErrors.ts` | 新規 | 共通エラーコード定数（PERMISSION_DENIED, ALREADY_CONFIRMED, INVALID_PERIOD, PAYROLL_CONFIG_NOT_FOUND 等） |
| `functions/__tests__/.../payrollPeriodUtils.spec.ts` | 新規 | 期間計算の単体テスト |
| `functions/__tests__/.../payrollConfigLoader.spec.ts` | 新規 | ローダーの単体テスト（任意） |
| `lib/services/payroll_config_service.dart` | 新規 | storeMeta/payrollConfig の購読。**StoreConfigService と同一パターン**（snapshots 購読、fromMap/fromDefaults、未存在時フォールバック、読み取り失敗時キャッシュ維持）。 |
| `lib/services/payroll_config_defaults.dart` | 新規 | PayrollConfigData のデフォルト値と fromMap |
| `lib/main.dart` | 変更 | **StoreConfigService.instance の直後**に `PayrollConfigService.instance` を追加（アプリ起動時の購読開始。storeMeta/config と明確に同じ処理）。 |

---

## 5. 完了条件（仕様確定版）

- [ ] endDay≠0 の期間計算が Jest テストで保証される（実行日 ≥ endDay / 実行日 < endDay の両ケース）
- [ ] endDay=0 の期間計算が Jest テストで保証される
- [ ] attendance.date（YYYY-MM-DD）が期間に含まれるかの判定が正しく動作する
- [ ] payrollConfig が未設定時でも安全に既定値で動く（Functions 側 getPayrollConfig）
- [ ] payrollConfig が未設定時でも安全に既定値で動く（Flutter 側 PayrollConfigService）
- [ ] アプリ起動時に storeMeta/payrollConfig の購読が開始される（main.dart で StoreConfigService.instance の直後に PayrollConfigService.instance 呼び出し。storeMeta/config と同一処理）
- [ ] initializeStoreConfigCallable 実行時に storeMeta/payrollConfig が作成・補完される
- [ ] payrollErrors.ts が作成され、主要エラーコードが export されている
- [ ] monthlyPayrollTrigger の既存期間計算ロジックを payrollPeriodUtils に置き換える（Step01 で行うか、Step08 で行うかは changeSpec で判断。推奨: Step01 で置き換え）

---

## 6. 未決のまま持ち越す項目

| # | 項目 | 持ち越し先 Step | 理由 |
|---|------|----------------|------|
| 1 | payrollConfig 更新 UI | Step04 以降（または UI に載せず保守運用で対応） | 論点4で C を採用。保守運用で Firestore 直接編集する可能性あり |
| 2 | expectedRange の閾値・判定ロジック | Step03 または実装時 | 01_TOBE で【要詰め】 |
| 3 | 古い payrollRun の削除タイミング | Step09 | 01_TOBE で【要詰め】 |

---

## 7. 整合性確認結果

以下を 01_TOBE_DETAILED_SPEC と照合し、矛盾なし。

- **7.1 計算対象期間の SSOT**: storeMeta/config の payroll.startDay/endDay → 維持
- **7.1 payrollConfig 配置**: storeMeta/payrollConfig 別 doc → 採用
- **7.1 paymentDate**: Firestore で店舗ごとに保持 → 採用
- **7.1 計算可能期間の導出**: paymentDate から導出、当日 JST で判定 → 採用
- **8.2 期間計算（endDay≠0）**: 実行日 ≥ endDay / 実行日 < endDay で対象期間を決定 → payrollPeriodUtils に実装
- **attendance.date**: attendances は date フィールド（YYYY-MM-DD）を持つ → 期間判定に使用
