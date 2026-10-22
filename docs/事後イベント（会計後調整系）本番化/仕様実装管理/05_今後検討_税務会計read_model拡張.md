# 05_今後検討_税務会計read_model拡張

## このファイルの役割

本ファイルは、`step3.11_未決論点の再決定` では **扱い切らないが、将来の税務・会計・決算対応で必ず再検討が必要になる論点** を集約する受け皿である。

今回の `step3.11` では、改修範囲を広げすぎないために、次の方針を取る。

- **現行実装から無理なく派生できる範囲だけを確定する**
- **`bills` とその current 設計との整合性を崩さない**
- 厳密な税務・会計 read model の拡張は、本ファイルに逃がして後続フェーズで扱う

## 今回 `step3.11` では current-scope でスコープ外とする future 機能

### 1. `/payments` の正式 ledger 化

現行実装では、会計時の支払手段は主に次の source に依存している。

- `meta.paymentMethodsByAmount`
- `meta.paymentMethodsByCategory`
- settle 後の `settlementSnapshot.paymentTotals`
- settle 後の `settlementSnapshot.paymentsSummary`

将来的には `/payments` を正式な payment ledger として扱う余地があるが、今回の `step3.11` ではそこまで広げない。

### 2. `reportingEntries / reportingMonthly / cashflowMonthly` の厳密 schema

今回の `step3.11` では、税務・会計用 read model を **必要なら現行 `bills` から派生して作れる** ところまでを前提にする。

ただし、次は後続で詳細化する。

- `reportingEntries/{entryId}` の正式 field 一覧
- `reportingMonthly/{yyyyMM}` の集計粒度
- `cashflowMonthly/{yyyyMM}` の集計粒度
- append-only で持つか、再集計で作るかの確定ルール

### 3. クレジットカードの後日入金・手数料・ネット入金

今回の `step3.11` では、顧客がカードで支払った事実と、売上側の受領方法配分は扱う。

一方で、次は future とする。

- カード会社から店舗口座へ実入金された日
- 決済手数料
- net deposit
- カード決済会社ごとの provider transaction 連携

### 4. 自社ポイント / 他社ポイントの税務上の treatment

今回の `step3.11` では、ポイント利用の事実を将来残せる余地は認めるが、税務・会計上どう扱うかは固定しない。

後続で整理する論点:

- 自社ポイントを値引きとして扱うか
- memo 的に保持して reporting には乗せないか
- 他社ポイントを支払手段として扱うか
- `advisor_review` / `requiresAdvisorReview` の導入要否

### 5. 期間締め / 過年度修正 / 税理士判断領域

今回の `step3.11` では、売上発生日 / adjustment 確定日 / cashflow 実行日の 3 軸を整理する。

ただし、次は後続に回す。

- 月締め済みデータの扱い
- 年度締め済みデータの扱い
- 過年度修正フラグ
- 重要性判定
- 税理士レビュー導線

## 後続で検討すべき具体論点

### A. `reportingEntries`

最低限検討が必要な候補:

- `entryType`
- `billId`
- `cycleNo`
- `originBusinessDate`
- `recognizedAt`
- `cashflowAt`
- `amountIncl / amountExcl / taxAmount`
- `taxRate`
- `taxCategory`
- `reasonType`
- `reasonDetail`
- `linkedBaselineLineRef`
- `linkedAdjustmentId`
- `linkedCashActionId`
- `paymentAllocation`
- `paymentAllocationSource`
- `isProvisionalSource`
- `reportingTreatment`
- `requiresAdvisorReview`

### B. `reportingMonthly`

最低限検討が必要な候補:

- 収益認識月ベースの集計
- adjustment 確定月ベースの集計
- 税率別集計
- 期間締めフラグ
- 再集計の再現性確保

### C. `cashflowMonthly`

最低限検討が必要な候補:

- 実入金
- 実返金
- カード後日入金
- 手数料控除
- 方法別 cashflow 集計

## `step3.11` 側との役割分担

`step3.11` では、次だけを確定対象とする。

- `bills` を SoT とし続けること
- `settlementCycles / baselineSnapshot / adjustments / cashActions` の責務分担
- `analyticsMonthly` を運用ダッシュボード用途に留めること
- 売上発生日 / adjustment 確定日 / cashflow 実行日の 3 軸を概念として整理すること
- 税務・会計用 read model を作る場合でも、**現行 `bills` 実装から派生し、`bills` との整合性を崩さずに実装する**こと

## 関連ドキュメント

- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/12_analyticsMonthlyと入出金データの役割分担.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/12_analyticsMonthlyと入出金データの役割分担.md)
- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md)
- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/15_売上日入出金日営業日の帰属ルール.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/15_売上日入出金日営業日の帰属ルール.md)
