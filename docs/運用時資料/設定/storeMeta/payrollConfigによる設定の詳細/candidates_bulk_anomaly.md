# maxCandidatesCount / bulkPaymentRegistrationEnabled / expectedRange

いずれも phase4.2 から継承した **運用・抽出制御** 系。給与計算式そのものではなく、一覧の件数上限・UI 機能の可否・将来の異常検知のための設定を担う。

---

## maxCandidatesCount

### 設定の説明

給与計算の対象候補（勤怠 ID リスト）を返す Callable で、**返却・処理する件数の上限** を制御する。

### 何を設定するのか

正の整数。デフォルト **`1000`**。未設定・不正時はデフォルトへ。

### 現状持ちうる値

| 条件 | 扱い |
|------|------|
| `number` かつ `> 0` | その値が上限 |
| それ以外 | デフォルト `1000` |

### その設定により何が変わるのか

- 対象勤怠が上限を超える場合、**それ以上は返さない / 選べない**（大量データ時の負荷・タイムアウト対策）。
- 値を小さくしすぎると、期間内の全スタッフを一度に選べない運用になる。大きくしすぎると Callable・クライアントの負荷が増える。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/attendance/callables/getPayrollCandidates.ts` | 返却件数上限 |
| ts | `functions/src/shared/config/payrollConfigLoader.ts` | マージ・検証 |
| dart | `lib/services/payroll_config_service.dart` | 購読（画面から参照可能） |

---

## bulkPaymentRegistrationEnabled

### 設定の説明

**一括で支払い済み登録**する UI・操作を許可するかどうか。

### 何を設定するのか

boolean。デフォルト **`false`**。

### 現状持ちうる値

| 値 | 意味 |
|----|------|
| `true` | 一括支払い済み登録を利用可 |
| `false` | 利用不可（既定） |

### その設定により何が変わるのか

- アプリの支払い管理まわりで、一括操作の表示・実行可否が切り替わる。
- `false` のままにすると誤操作による一括更新リスクを抑えられる。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/shared/config/payrollConfigLoader.ts` | 取得 |
| dart | `lib/payroll/widgets/payment_management.dart` | UI ガード |

---

## expectedRange

### 設定の説明

集計結果の **想定範囲**（件数・概算金額・合計時間などの min/max）。仕様上は **異常値チェック（anomalyFlags）** に使う。

### 何を設定するのか

オブジェクト（各プロパティは任意）または **`null`**。`null` の場合は **レンジによるチェックなし**（既定）。

想定されるプロパティ（いずれも number 省略可）:

- `attendanceCountMin` / `attendanceCountMax`
- `estimatedAmountMin` / `estimatedAmountMax`
- `totalHoursMin` / `totalHoursMax`

### 現状持ちうる値

ローダーはオブジェクトをそのまま部分マージする。型が合わないトップレベル値はフォールバック。

### その設定により何が変わるのか

- **現行実装**: `generateAnomalyFlags` はスタブで **常に空** を返すため、Firestore に設定しても **計算結果のフラグには反映されない**（将来拡張用）。
- 設定しておいてもデータ整合性や snapshot には載らないが、運用で閾値を先に固定しておく用途はある。

### 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/shared/config/payrollConfigLoader.ts` | パース・保持 |
| ts | `functions/src/domains/attendance/helpers/generateAnomalyFlags.ts` | **予定**（現状未使用） |

**注**: Flutter の `PayrollConfigData` には `expectedRange` が含まれていない。サーバ側設定として保持される。
