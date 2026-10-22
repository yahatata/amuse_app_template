# Step02: 対象データ抽出 Callable — 仕様確定

**作成日**: 2026-03-20  
**対象 STEP_PLAN**: [per_step/step02_candidates_callable/STEP_PLAN.md](./STEP_PLAN.md)  
**ステータス**: 承認済み（最終版）

---

## 1. 前ステップとの整合性確認

> 仕様確定の最初に必ず記入する。Step01 で決定・実装予定の内容と当ステップの仕様が矛盾しないことを確認する。

| 確認項目 | 前ステップ（Step01）の決定内容 | 当ステップへの影響 | 問題なし/要対応 |
|----------|-------------------------------|-------------------|----------------|
| 期間計算 | payrollPeriodUtils.getPayrollPeriod(now, startDay, endDay) で periodStart/periodEnd（YYYY-MM-DD）を取得 | getPayrollCandidates は config の payroll と現在日時から期間を算出し、getPayrollPeriod を利用 | 問題なし |
| attendance.date | 期間判定は attendance.date（YYYY-MM-DD）で行う。isDateInPeriod(dateStr, periodStart, periodEnd) を利用 | 属性1の判定に使用。date が periodStart〜periodEnd に含まれるかで判定 | 問題なし |
| payrollConfig | getPayrollConfig で取得。未存在時は defaults。maxCandidatesCount を追加（Step01 で対応） | 本 Callable では maxCandidatesCount で返却件数制限。expectedRange は Step04 で使用 | 問題なし |
| payrollErrors | PERMISSION_DENIED 等が定義済み | admin 以外の呼び出し時に PERMISSION_DENIED を返す | 問題なし |
| storeMeta/config | getStoreConfig で payroll.startDay/endDay を取得 | 期間算出の SSOT として使用 | 問題なし |

---

## 2. 論点と決定内容

### 論点 1: 属性2/3 の最終判定条件（payrollReflectedAt・未退勤の扱い）

| 項目 | 内容 |
|------|------|
| **背景・問題** | 属性2（期間外・前回未反映）と属性3（期間内・未退勤/論理削除）をどの条件で判別するか。01_TOBE 2.1〜2.3 に従い、実装可能な判定表が必要。 |
| **採用案** | 下記の判定表で実装する。 |
| **根拠** | 01_TOBE 2.1〜2.3、2.6 を満たす。attendance の既存フィールド（date, clockOut, isDeleted, payrollReflectedAt）で判別可能。 |

**属性判定表**:

| 条件 | 属性 | 備考 |
|------|------|------|
| date > periodEnd（期間より未来） | **返却しない** | 01_TOBE 属性3補足: 未来の attendance は表示不要 |
| date が期間外 かつ 論理削除 | **返却しない** | 01_TOBE 2.2: 期間外で論理削除は表示しない |
| date が期間内 かつ 論理削除 | **属性3** | 01_TOBE 2.2: 期間内で論理削除は属性3 |
| date が期間内 かつ clockOut が null（未退勤） | **属性3** | 01_TOBE 2.1: 期間内・未退勤は属性3 |
| date が期間内 かつ 退勤済み かつ 非削除 | **属性1** | 01_TOBE 2.1: 期間内の attendance |
| date が期間外（date < periodStart）かつ 非削除 かつ payrollReflectedAt が「当該 date が含まれる past 期間の値」として未設定 | **属性2** | 01_TOBE 2.1 属性2: 前回以前に反映されなかった attendance |

**属性2の補足（payrollReflectedAt の解釈）**:
- payrollReflectedAt は `"{periodStart}-{periodEnd}"` 形式（例: `"2026-02-26-2026-03-25"`）で保存
- attendance の date が過去の某期間に含まれるが、その期間に対応する payrollReflectedAt が付与されていない場合、「前回未反映」とみなす
- 実装: date が含まれるべき past 期間を算出し、その期間キーが payrollReflectedAt に含まれていないか、payrollReflectedAt が null の場合に属性2とする

| **影響ファイル** | `functions/src/domains/attendance/callables/getPayrollCandidates.ts` |
| **テスト観点** | 各条件の attendances が正しい属性に分類される。未来の attendance が返却されない。 |
| **決定日** | 2026-03-20 |

---

### 論点 2: 論理削除（期間内）を属性3に含める際の表示文言

| 項目 | 内容 |
|------|------|
| **背景・問題** | 01_TOBE 2.2 で期間内論理削除は属性3に含める。UI 表示時の文言を決める。 |
| **選択肢A** | reasonLabel を `"論理削除のため計算対象外"` とする |
| **選択肢B** | reasonLabel を `"削除済み"` とする |
| **採用案** | **「削除済みのため計算対象外」** |
| **根拠** | ユーザーに「なぜ計算対象外か」を明確に伝える。01_TOBE 2.6 の理由表示に準拠。 |
| **影響ファイル** | getPayrollCandidates.ts の reasonLabel 生成ロジック |
| **テスト観点** | 論理削除の attendance に reasonLabel が付与される |
| **決定日** | 2026-03-20 |

---

### 論点 3: 抽出結果の返却粒度（ページング要否、最大件数）

| 項目 | 内容 |
|------|------|
| **背景・問題** | 大量の attendance を返す際のページング・件数制限をどうするか。 |
| **選択肢A** | ページングなし。全件返却。最大件数制限あり。最大件数は storeMeta/payrollConfig で設定可能 |
| **選択肢B** | ページングあり。limit/offset で分割取得 |
| **採用案** | **選択肢A** |
| **根拠** | 給与計算は月次で、複雑さを避け全件返却で実装。最大件数は storeMeta/payrollConfig の `maxCandidatesCount` で設定可能とし、デフォルトは 1000 とする。 |
| **maxCandidatesCount** | storeMeta/payrollConfig に `maxCandidatesCount?: number` を追加。未設定時は 1000。Step01 で PayrollConfig 型・defaults・初期化に含める。 |
| **影響ファイル** | getPayrollCandidates.ts, Step01: types.ts, defaults.ts, payrollConfigLoader.ts, initializeStoreConfigCallable.ts, payroll_config_defaults.dart |
| **テスト観点** | maxCandidatesCount を超える件数が返却されない。設定値が正しく適用される。 |
| **決定日** | 2026-03-20 |

---

### 論点 4: reasons の判定ロジックとフォーマット（GAP-1）

| 項目 | 内容 |
|------|------|
| **背景・問題** | 各 attendance に「期間外」「前回未反映」「その他」の理由種別を付与する。01_TOBE 2.6 に基づく。 |
| **採用案** | 各 attendance エントリに `reasonType` と `reasonLabel` を付与する。 |

**reasonType と reasonLabel の紐付け**:

| 属性 | reasonType | reasonLabel |
|------|------------|-------------|
| 属性1 | `in_period` | `"期間内の正常勤怠データ"` |
| 属性2 | `not_reflected` | `"先月分以前の未反映データ"` |
| 属性3（未退勤） | `other` | `"期間内の未退勤のため計算対象外データ"` |
| 属性3（論理削除） | `other` | `"期間内の削除済のため計算対象外データ"` |

※ 01_TOBE 2.6 の理由種別は「期間外」「前回未反映」「その他」。属性2は `not_reflected`、属性3は `other`、属性1は `in_period` を付与する。

| **影響ファイル** | getPayrollCandidates.ts |
| **テスト観点** | 各 attendance に reasonType, reasonLabel が付与される |
| **決定日** | 2026-03-20 |

---

### 論点 5: 集計プレビューメタの計算方式（GAP-2）

| 項目 | 内容 |
|------|------|
| **背景・問題** | 件数・合計時間・概算金額を Callable 側で計算するか、UI 側で計算するか。 |
| **選択肢A** | Callable 側で計算して previewMeta として返す |
| **選択肢B** | UI 側がレスポンスからローカル集計する |
| **採用案** | **選択肢B**（UI 側でローカル集計） |
| **根拠** | Step04 で抽出後に UI 上に対象データが表示され、**選択されたもののサマリ**を念のため表示する実装とする。どの属性を何件中何件（XX/YY 形式）選択したかが表示されていればよい。Callable は group1/2/3 を返すのみで、集計は UI 側で行う。 |
| **影響ファイル** | getPayrollCandidates.ts（previewMeta は返却しない）、Step04: 計算用タブ UI（選択状態に応じて XX/YY 形式で表示） |
| **テスト観点** | Callable は group1/2/3 のみ返却。UI 側で選択状態からサマリを算出する。 |
| **決定日** | 2026-03-20 |

**Step04 への受け渡し（集計プレビュー・選択 UI）**:
- 各属性について「全件数 / 選択件数」（XX/YY 形式）を表示する
- **属性1のチェックマークは原則外せない**。外すためには確認ダイアログを突破する必要がある

---

## 3. このステップの API 契約（Callable）

### getPayrollCandidates

**リクエスト**:

```typescript
{
  paymentPeriodKey: string;  // YYYY-MM-DD。支払日を表すキー。これから計算対象期間を逆算する
  // または
  periodStart?: string;      // YYYY-MM-DD（paymentPeriodKey から算出するため、通常は不要）
  periodEnd?: string;        // YYYY-MM-DD
}
```

※ paymentPeriodKey から payrollConfig.paymentDate と storeMeta/config の payroll を参照し、計算対象期間（periodStart, periodEnd）を算出する。同一支払日体系では paymentPeriodKey が paymentDate と一致する前提。実装時: paymentPeriodKey を渡し、getPayrollPeriod で「その支払日が含まれる給与期間」を算出する。支払日 4/25 の場合、給与期間 2/26〜3/25 を計算対象とする、等。

**レスポンス（成功時）**:

```typescript
{
  periodStart: string;       // YYYY-MM-DD
  periodEnd: string;         // YYYY-MM-DD
  group1: PayrollCandidate[];  // 属性1（期間内・退勤済み・非削除）
  group2: PayrollCandidate[];  // 属性2（期間外・前回未反映）
  group3: PayrollCandidate[];  // 属性3（期間内・未退勤 または 論理削除）
}

interface PayrollCandidate {
  id: string;              // attendance docId
  staffId: string;
  staffName: string;
  date: string;            // YYYY-MM-DD
  clockIn: string | null;  // ISO 8601
  clockOut: string | null;
  actualWorkMinutes: number;
  nightWorkMinutes: number;
  reasonType: 'in_period' | 'not_reflected' | 'other';
  reasonLabel: string;
  isDeleted: boolean;
  // UI 表示用のその他フィールド
}
```

※ 集計プレビュー（件数・概算金額・合計時間、XX/YY 形式の選択状況）は UI 側で group1/2/3 からローカル集計する。Callable は previewMeta を返さない。

**エラーケース**:

| エラーコード | 条件 | クライアント側の扱い |
|-------------|------|---------------------|
| `permission-denied` | admin 以外の呼び出し、または認証なし | エラーダイアログ表示 |
| `invalid-argument` | paymentPeriodKey が未指定または不正 | エラーダイアログ表示 |
| `payroll-config-not-found` | payrollConfig が未設定で paymentDate が取得できない | エラーダイアログ表示 |

**冪等性・再実行時の挙動**:

- 読み取り専用のため、何度呼び出しても同じ結果を返す（冪等）。

---

## 4. このステップで新規作成・変更するファイル一覧

| ファイルパス | 新規/変更 | 内容の概要 |
|------------|----------|-----------|
| `functions/src/domains/attendance/callables/getPayrollCandidates.ts` | 新規 | 対象データ抽出 Callable。属性1/2/3 に分類して返却。maxCandidatesCount で件数制限 |
| `functions/src/domains/attendance/index.ts` | 変更 | getPayrollCandidates の export 追加 |
| `functions/__tests__/domains/attendance/callables/getPayrollCandidates.spec.ts` | 新規 | Callable の単体テスト |

---

## 5. 完了条件（仕様確定版）

- [ ] 属性3 → 属性2 → 属性1 の順で返却される
- [ ] 計算期間より未来の attendance は返却されない
- [ ] 各 attendance エントリに reasonType, reasonLabel が付与される（論点4の文言）
- [ ] maxCandidatesCount（payrollConfig、デフォルト 1000）を超える件数は返却されない
- [ ] admin 以外の呼び出しで PERMISSION_DENIED が返る
- [ ] 論理削除・未退勤の attendance が属性3に正しく分類される
- [ ] 期間外・前回未反映の attendance が属性2に正しく分類される

---

## 6. 未決のまま持ち越す項目

| # | 項目 | 持ち越し先 Step | 理由 |
|---|------|----------------|------|
| 1 | 想定範囲超過時の警告ロジック（expectedRange との比較） | Step04 | UI 側で選択サマリと payrollConfig.expectedRange を比較して表示 |
| 2 | maxCandidatesCount 超過時の挙動（返却件数制限時のエラー表示等） | 実装時 | 超過時は先頭 N 件のみ返却するか、エラーを返すかは実装時に決定 |
| 3 | paymentPeriodKey から計算対象期間を導出する具体ロジック | 実装時 | 支払日と給与期間の対応は payroll の startDay/endDay に依存。実装時に getPayrollPeriod の「支払日から期間を逆算」するヘルパーが必要なら追加 |

---

## 7. 整合性確認結果

以下を 01_TOBE_DETAILED_SPEC および Step01 と照合し、矛盾なし。

- **2.1 属性定義**: 属性1/2/3 の定義に従い判定表を定義
- **2.2 論理削除**: 期間外は返却しない、期間内は属性3。論点2の表示文言は「削除済みのため計算対象外」。論点4の reasonLabel（属性3論理削除）は「期間内の削除済のため計算対象外データ」
- **2.6 理由の種別**: 期間外、前回未反映、その他 → reasonType にマッピング。reasonLabel は論点4で確定
- **3.2 集計プレビュー**: 選択中の attendances から UI 側で XX/YY 形式のサマリを表示。Callable は group1/2/3 のみ返却
- **3.5 対象データの抽出**: Callable 経由で取得。payroll.startDay/endDay から期間算出
- **Step01 payrollPeriodUtils**: getPayrollPeriod, isDateInPeriod を利用
- **Step01 payrollConfig**: maxCandidatesCount を追加（Step01 の changeSpec に反映）
