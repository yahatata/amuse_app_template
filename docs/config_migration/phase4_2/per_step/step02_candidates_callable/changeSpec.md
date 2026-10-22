# Step02: 対象データ抽出 Callable — 変更仕様書（changeSpec）

**対象**: [03_DEVELOPMENT_SEQUENCE.md](../../03_DEVELOPMENT_SEQUENCE.md) Step02  
**仕様**: [per_step/step02_candidates_callable/SPEC.md](./SPEC.md)  
**最終更新**: 2026-03-20

---

## 1. 概要・目的

- 給与計算用の対象 attendances を属性1/2/3 に分類して返す Callable `getPayrollCandidates` を新規作成する
- payrollPeriodUtils、getPayrollConfig、payrollErrors（Step01 で実装）を利用し、01_TOBE 2.1〜2.3、2.6 に準拠した判定を行う
- admin のみ呼び出し可能とし、`maxCandidatesCount`（payrollConfig、デフォルト 1000）で返却件数を制限する

**完了条件（SPEC より）**:

- 属性3 → 属性2 → 属性1 の順で返却される
- 計算期間より未来の attendance は返却されない
- 各 attendance エントリに reasonType, reasonLabel が付与される（論点4の文言）
- maxCandidatesCount（payrollConfig、デフォルト 1000）を超える件数は返却されない
- admin 以外の呼び出しで PERMISSION_DENIED が返る
- 論理削除・未退勤の attendance が属性3に正しく分類される
- 期間外・前回未反映の attendance が属性2に正しく分類される

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| Step01 | payrollPeriodUtils（getPayrollPeriod, isDateInPeriod）、getPayrollConfig、payrollErrors、storeMeta/config（payroll）、storeMeta/payrollConfig（maxCandidatesCount）が利用可能であること |

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/attendance/callables/getPayrollCandidates.ts` | **新規** 対象データ抽出 Callable。属性1/2/3 に分類して返却。maxCandidatesCount で件数制限 |
| `functions/src/domains/attendance/index.ts` | **変更** getPayrollCandidates の export 追加 |
| `functions/__tests__/domains/attendance/callables/getPayrollCandidates.spec.ts` | **新規** Callable の単体テスト |

### Dart（Flutter）

| ファイル | 変更内容 |
|----------|----------|
| なし | Step04 で Flutter 側の呼び出し・UI を実装する |

---

## 4. 現状（As-Is）

### 4.1 getPayrollCandidates.ts

- 存在しない。給与計算用の attendances 抽出は、既存の getPayrollData が monthlyPayroll コレクションを参照する別用途である。

### 4.2 attendance/index.ts

- getPayrollData 等を export。getPayrollCandidates は未登録。

### 4.3 attendance コレクション・スキーマ

- attendance は date（YYYY-MM-DD）、clockIn、clockOut、isDeleted、payrollReflectedAt 等を持つ。date で期間判定、clockOut の有無で退勤判定、isDeleted で論理削除判定、payrollReflectedAt で前回未反映判定を行う。

---

## 5. 変更後（To-Be）

### 5.1 getPayrollCandidates.ts（新規）

| 変更 | 内容 |
|------|------|
| 新規 | `getPayrollCandidates` を onCall で export。リクエストは `paymentPeriodKey: string`（YYYY-MM-DD）を受け取る |
| 新規 | **権限チェック**: 呼び出し元の device.role が admin であること。違反時は PERMISSION_DENIED（payrollErrors）を返す |
| 新規 | **期間算出**: getStoreConfig で payroll.startDay/endDay を取得し、paymentPeriodKey から getPayrollPeriod で periodStart/periodEnd を算出。paymentPeriodKey が paymentDate と同一体系である前提 |
| 新規 | **attendance 取得**: Firestore で attendances を date 範囲で取得（periodStart 以前〜periodEnd まで。未来は periodEnd で上限）。storeId 等でスコープを絞る |
| 新規 | **属性判定**: 以下の優先順で分類。未来（date > periodEnd）→返却しない。期間外 かつ 論理削除→返却しない。期間内 かつ 論理削除→属性3。期間内 かつ 未退勤→属性3。期間内 かつ 退勤済 かつ 非削除→属性1。期間外 かつ 非削除 かつ 前回未反映→属性2 |
| 新規 | **前回未反映の判定**: attendance.date が含まれるべき past 期間を算出し、payrollReflectedAt にその期間キーが含まれていないか null の場合に属性2 |
| 新規 | **reasonType / reasonLabel**: 論点4の表に従い付与。属性1: in_period / 「期間内の正常勤怠データ」。属性2: not_reflected / 「先月分以前の未反映データ」。属性3（未退勤）: other / 「期間内の未退勤のため計算対象外データ」。属性3（論理削除）: other / 「期間内の削除済のため計算対象外データ」 |
| 新規 | **返却順序**: 属性3 → 属性2 → 属性1 の順。各 group 内は date 昇順等、仕様に従う |
| 新規 | **件数制限**: getPayrollConfig で maxCandidatesCount を取得（未設定時は DEFAULT_MAX_CANDIDATES_COUNT = 1000）。全属性の合計が超過する場合は、先頭から maxCandidatesCount 件まで返却（超過時の挙動は未決。実装時に決定） |
| 新規 | **エラーケース**: paymentPeriodKey 未指定または不正→invalid-argument。payrollConfig 未設定で paymentDate 取得不可→payroll-config-not-found |
| 新規 | **レスポンス**: periodStart, periodEnd, group1, group2, group3。previewMeta は返さない（UI 側でローカル集計） |

**SPEC 参照**: セクション 2（論点1〜5）、セクション 3（API 契約）

### 5.2 attendance/index.ts

| 変更 | 内容 |
|------|------|
| 追加 | `export { getPayrollCandidates } from "./callables/getPayrollCandidates";` |

### 5.3 getPayrollCandidates.spec.ts（新規）

| 変更 | 内容 |
|------|------|
| 新規 | 属性1/2/3 の各条件に対する分類テスト |
| 新規 | 未来の attendance が返却されないことのテスト |
| 新規 | 論理削除・未退勤が属性3に分類されることのテスト |
| 新規 | 前回未反映が属性2に分類されることのテスト |
| 新規 | maxCandidatesCount を超える件数が返却されないことのテスト |
| 新規 | admin 以外で PERMISSION_DENIED が返ることのテスト |
| 新規 | reasonType, reasonLabel が付与されることのテスト |

---

## 6. 実装順序

```
Phase 0: 準備
  - 本 changeSpec の確認
  - Step01 の完了（payrollPeriodUtils, getPayrollConfig, payrollErrors, maxCandidatesCount）を確認
  - SPEC.md の完了条件を再確認
  ↓ 【検証: Step01 が完了していること】

Phase 1: getPayrollCandidates の実装
  - getPayrollCandidates.ts を新規作成
  - paymentPeriodKey から期間算出ロジック（getPayrollPeriod の利用方法を実装時に決定）
  - 属性判定ロジック（属性判定表に従い実装）
  - reasonType / reasonLabel 付与
  - maxCandidatesCount による件数制限
  - エラーハンドリング（PERMISSION_DENIED, invalid-argument, payroll-config-not-found）
  ↓ 【検証: Callable が正しく動作する】

Phase 2: attendance/index の更新
  - getPayrollCandidates の export を追加
  ↓ 【検証: Functions ビルドが通る】

Phase 3: 単体テストの作成
  - getPayrollCandidates.spec.ts を新規作成
  - 各属性・エラーケースのテストを追加
  ↓ 【検証: Jest テストが通る】
```

---

## 7. 検証ポイント

| # | 観点 | 方法 |
|---|------|------|
| 1 | 属性3 → 属性2 → 属性1 の返却順 | Jest: レスポンスの group の順序を検証 |
| 2 | 未来の attendance が返却されない | Jest: date > periodEnd の attendance が含まれないこと |
| 3 | reasonType / reasonLabel の付与 | Jest: 各 attendance に論点4の文言が付与されていること |
| 4 | maxCandidatesCount 制限 | Jest: maxCandidatesCount を超える件数が返却されないこと |
| 5 | admin 以外で PERMISSION_DENIED | Jest: 非 admin 呼び出しでエラーが返ること |
| 6 | 論理削除が属性3 | Jest: 期間内・論理削除の attendance が group3 に含まれること |
| 7 | 未退勤が属性3 | Jest: 期間内・clockOut が null の attendance が group3 に含まれること |
| 8 | 前回未反映が属性2 | Jest: 期間外・payrollReflectedAt 未設定の attendance が group2 に含まれること |

---

## 8. チェックリスト

### 実装時

- [ ] getPayrollCandidates.ts を新規作成
- [ ] 属性判定ロジック（属性判定表）を実装
- [ ] reasonType / reasonLabel を論点4の表に従い付与
- [ ] maxCandidatesCount による件数制限を実装
- [ ] PERMISSION_DENIED, invalid-argument, payroll-config-not-found のエラーハンドリング
- [ ] attendance/index.ts に getPayrollCandidates の export を追加
- [ ] getPayrollCandidates.spec.ts を新規作成

### 確認時

- [ ] Functions ビルドが通る（`npm run build`）
- [ ] getPayrollCandidates の Jest テストが通る
- [ ] 各属性・エラーケースが仕様どおり動作することを確認

---

## 9. ロールバック手順

- **getPayrollCandidates**: ファイル削除。attendance/index.ts から export を削除
- **テスト**: getPayrollCandidates.spec.ts を削除

---

## 10. リスク・注意事項

- **paymentPeriodKey から期間算出**: paymentPeriodKey が paymentDate と同一体系である前提。支払日 4/25 の場合、給与期間 2/26〜3/25 を計算対象とする等、getPayrollPeriod の「支払日から期間を逆算」するヘルパーが必要になる可能性あり。実装時に決定
- **maxCandidatesCount 超過時**: 先頭 N 件のみ返却するか、エラーを返すかは未決。実装時に決定
- **attendance クエリ**: date 範囲・storeId スコープは既存の attendance 取得パターンに合わせる。大量データ時のパフォーマンスに注意
