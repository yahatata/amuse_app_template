# TO-BE 仕様：給与計算（計算タブ／結果タブ）UI 修正

**配置**: `修正用フォルダ/UI修正用/`  
**目的**: 計算前後の文脈表示・未確定結果の注意喚起・結果画面の実行時刻／確定状態の明示。  
**参照コード（現状）**: `lib/payroll/widgets/calc_tab.dart`, `lib/payroll/widgets/result_tab.dart`, `functions/.../getPayrollCandidates.ts`, `payrollPeriodUtils.ts`, `monthlyPayroll` / `payrollRuns` スキーマ。

---

## 1. 計算タブ（CalcTab）

### 1.1 未確定の計算結果がある場合の注意（トップ固定）

**表示条件（案）**

- 現在画面が扱う `paymentPeriodKey`（§1.2 と同一の算出ロジック）について、Firestore の `monthlyPayroll/{paymentPeriodKey}` が存在する、かつ
- `status === 'draft'`（確定前）、かつ
- `latestRunId` が非 null、かつ
- 対応する `payrollRuns/{latestRunId}` の `status` が `completed` または `completed_with_errors`（計算パイプラインが一度完了し、結果が参照できる状態）

**文言・要素**

- 注意文として「この期間は**未確定（draft）の計算結果**が既に存在します」旨を明示する。
- **最終計算（集計完了）日時**を記載する。データソースの優先案:
  - **主**: `monthlyPayroll.latestCalculatedAt`（`finalizePayrollRun` で `FieldValue.serverTimestamp()` が入るフィールド）
  - **補足参考**: `payrollRuns/{latestRunId}.finishedAt` または `startedAt` / `calculatedAt`（表示ポリシーは実装時にどれを「実行日時」と呼ぶか固定する）
- ユーザー向け注記: **「再計算する場合のみ抽出を開始して下さい。」**（新規に対象データを取り直す操作は、やり直し時に限定する趣旨）

**レイアウト**

- 抽出ボタンより**上**（§1.2 のメタ情報ブロックと§1.1 の順序は、§1.1 を最上段とするか、§1.2 の直下とするかは実装でよいが、いずれも抽出ボタンより上にまとめる）。

**データ取得**

- `monthlyPayroll` と `payrollRuns/{latestRunId}` は **`snapshots()` で購読**し、draft → confirmed への遷移で注意が消えるようにする。

---

### 1.2 抽出前・抽出後に残す「計算対象コンテキスト」ブロック

**配置**

- **対象データの抽出**ボタン（現行の「対象データの抽出を開始する」）**より上**に常設する情報バー／カード。
- **抽出実行後**も、候補一覧・再抽出ボタンが表示されている限り**同じブロックを残す**（スクロール内で可変内容の上に固定表示でも可）。

**表示項目（最低限）**

| 項目 | 説明 |
|------|------|
| 基準日（現在日付） | ユーザーが整合性を確認するための「今日」。**JST の日付**で表示する（サーバー Callable が期間判定に使う暦と一致させる）。 |
| 対象 `paymentPeriodKey` | `YYYY-MM-DD_YYYY-MM-DD` 形式。 |
| 対象期間の開始・終了日 | 人が読みやすい表記（`paymentPeriodKey` の前后を分解して表示）。 |
| 給与支給予定日 | `storeMeta/payrollConfig` の `paymentDate` に基づく表示。設定が null / 未設定の場合のラベル（例:「未設定」）を規定する。 |

**ロジック整合（Callable と同一）**

- **期間キー・期間端日**は、Flutter 単体の近似実装ではなく、**バックエンドと同一の定義**に合わせる。

**推奨実装方針（いずれか）**

1. **拡張 Callable（推奨）**  
   `getPayrollCandidates` のレスポンスに、表示専用メタを追加する（例: `displayContext: { asOfDateJst, paymentPeriodKey, periodStart, periodEnd, paymentDate, paymentDateDisplay }`）。  
   算出はサーバーで `getStoreConfig`（`payroll.startDay` / `payroll.endDay`）と `getPayrollConfig`（`paymentDate`）、および既存の `getPaymentPeriodKey` / `getPayrollPeriodRange`（`payrollPeriodUtils.ts`）を用いる。クライアントは **Callable 成功レスポンスをスナップショットとして表示**すればよい。

2. **別 Callable**  
   `getPayrollCalcUiContext` のような読み取り専用 Callable を追加し、上記メタのみ返す。計算タブ表示時に 1 回呼ぶ。

3. **Dart 移植（非推奨だが可）**  
   `payrollPeriodUtils` と同等のロジックを Dart に移植し、`StoreConfigService` / `PayrollConfigService` と組み合わせる。テストで Functions と突合が必要。

**備考（現状との差分）**

- 現行 `calc_tab.dart` の `_computePeriodKey()` は `StoreConfigService` のみ参照し、`getPayrollCandidates` の戻り値の `periodStart` / `periodEnd` とは乖離し得る。TO-BE では **レスポンスまたはサーバー算出に統一**する。
- `getPayrollCandidates` 現行実装は `periodStart` / `periodEnd` を `paymentPeriodKey` から**文字列分割**しているだけで、**日跨ぎ境界の検証はキー前提**。表示・検証の単一ソースを Callable 側に寄せる。

**確定済み期間**

- `monthlyPayroll.status` が `confirmed` / `paid` 等の場合、既存どおり再計算不可メッセージを出すが、§1.2 のメタ情報は **状況に応じて表示してよい**（運用で期間と支給日を確認できるように）。

---

### 1.3 「給与計算を実行」後の進捗ダイアログ・再入場時の再開

- **進捗表示**: `executeMonthlyPayroll` 成功後、`payrollRuns/{runId}` を `snapshots()` で購読し、**モーダルダイアログ**内に既存の進捗 UI（準備中／スタッフ別進捗／集計中）を表示する。`barrierDismissible: false`（誤閉じ防止）。
- **完了時**: `status === completed` でダイアログを閉じ、結果タブへ遷移。`completed_with_errors` はダイアログを閉じたうえで既存の `ErrorView`（失敗一覧・失敗分再実行）を本文に表示する。
- **中止**: 既存 `cancelPayrollRun` を維持。中止後はダイアログ内で「中止されました」表示と「閉じる」で復帰。
- **再入場**: `monthlyPayroll/{paymentPeriodKey}/payrollRuns` を `status in (preparing, processing, aggregating)` で購読し、**進行中 run がある間は候補抽出ボタンを無効化**し、画面上部に「給与計算処理中」注意を出す。「進捗を表示」で上記ダイアログを再度開ける。
- **注意**: `monthlyPayroll.latestRunId` は finalize 完了まで更新されないため、**進行中 run の検知は payrollRuns サブコレクションのクエリに依存する**（チャットで合意した方針）。

### 1.4 payrollRuns 失敗・固まりと UI / 再実行の対応（ドキュメント状態の整理）

`payrollRuns.status` の意味と、ダイアログ・本文でユーザーに見せる／有効化する操作の目安。

| status | 意味（概要） | 検知 | ダイアログ／本文での指針 |
|--------|----------------|------|---------------------------|
| `preparing` / `processing` / `aggregating` | 実行中 | `payrollRuns` クエリ | 進捗表示。中止可能なのは `cancelPayrollRun` が許す `preparing` / `processing` のみ（`aggregating` は API 上中止不可）。 |
| `completed` | 全員成功で finalize 済 | `status` | ダイアログ閉じて結果タブへ誘導。 |
| `completed_with_errors` | 一部 staff タスク失敗だが finalize 済 | `status` + `failedStaffCount` | ダイアログ閉じ、`staffResults` の `taskStatus === failed` と `taskError` を表示。**`retryFailedStaffTasks`** の前提状態。 |
| `failed` | 主にタスク投入など **run 全体の失敗**（`executeMonthlyPayroll` 内） | `status` | **retryFailed は不可**。文言で説明し、**新規 `executeMonthlyPayroll`（抽出し直し）** を案内。 |
| `cancelled` | ユーザー中止 | `status` | 「閉じる」で復帰。必要なら再実行は新規 run。 |

**スタッフ単位**: `staffResults` の `taskStatus: failed` と `taskError` で個別理由をダイアログまたは `ErrorView` に表示できる。

**耐性の限界**: `aggregating` で固まる・finalize 前にクラッシュする等、**Firestore 上は処理中のまま**残る場合がある。その場合も §1.3 のクエリでは「進行中」として扱う。集計のみ失敗し続けるケースは**バックエンド運用・手当**が必要になりうる（UI だけでは解消できない）。

---

## 2. 結果タブ（ResultTab）

### 2.1 トップ行：計算実行結果の日時 ＋ 確定／未確定

**配置**

- 既存の `PastResultsSelector` 直下、またはその**直上／同一カード内の先頭行**など、結果コンテンツの**最上部**に横並び（または折り返し）で配置。

**左（または先頭）— 計算実行に関する日時（赤文字）**

- **文言色**: `red` 系（テーマの `error` 色でも可）。**目立つが既存のオレンジ警告と区別**できること。
- **意味**: 「この画面に表示されている集計結果が、いつ計算・確定されたか」のうち、**計算実行（run 完了）に紐づく日時**。
- **データソース（案）**  
  - **第一候補**: `monthlyPayroll.latestCalculatedAt`（集計完了が monthly に反映された時刻。`finalizePayrollRun` で更新）  
  - **第二候補**: `payrollRuns/{latestRunId}.finishedAt`（run 完了時刻）  
  - **補足表示**が必要なら `startedAt` を括弧内に併記する等は UI 仕様で任意。

**右（または横）— 現在の確定状態**

- `monthlyPayroll.status` に基づくラベル:
  - `draft` → **未確定**
  - `confirmed` → **確定**（文言は「確定済み」でも可）
  - `hold` / `paid` → 既存の支払いフローに合わせた表記（例: **保留中** / **支払済**）を併記してよい。

**データ取得**

- 既存同様 `monthlyPayroll` を `snapshots()`。`latestRunId` が分かる場合は `payrollRuns` も購読し、日時のどちらを主表示とするか一本化する。

**境界**

- `latestRunId == null` の空状態では本行は不要（現行の「計算結果がありません」フロー）。

---

## 3. テスト・受け入れ観点（抜粋）

- JST 日付変更境界（午前0時前後）で §1.2 の基準日と `paymentPeriodKey` がサーバーと一致するか。
- draft で `latestRunId` ありのとき、計算タブ §1.1 の注意が出ること。確定後は消えること。
- 結果タブで赤文字の日時と `draft` / `confirmed` ラベルが、Firestore の実状態と一致すること。

---

## 4. 変更予定ファイル（想定）

| 領域 | ファイル（想定） |
|------|------------------|
| 計算タブ UI | `lib/payroll/widgets/calc_tab.dart`, `lib/payroll/widgets/progress_view.dart` |
| 結果タブ UI | `lib/payroll/widgets/result_tab.dart` |
| Callable | `getPayrollCandidates.ts`（`displayContext` / `isConfirmed` / 期間キー検証）, `getPayrollCalcDisplayContext.ts`（新規）, `payrollDisplayContext.ts`（ヘルパー） |
| クライアント | `lib/payroll/services/payroll_callable_service.dart` |
| 仕様参照 | `04_CALLABLE_API_SPEC.md` / `06_UI_SPEC` への追記（別 PR で可） |

---

*文書版本: 2026-03-27 — §1.3・§1.4 追記、実装対応済み*
