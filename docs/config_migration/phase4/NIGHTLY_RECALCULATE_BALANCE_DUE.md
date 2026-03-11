# Phase4: 夜間再計算 詳細仕様

## 1. 概要

analyticsMonthly の `net.balanceDueIncl` を再計算する処理。  
**STORE_CLOSE_HOUR は使用しない**。  
スケジューラではなく、**閉店処理の一環**または **Cloud Task** から起動する。

---

## 2. 起動方法

- 閉店処理（closeStoreTerminal / closeAssessmentTask 等）の一環として呼び出す
- または Cloud Task を発行し、そのハンドラから `runNightlyRecalculateBalanceDue()` を呼び出す

**参照**: `functions/src/domains/analytics/scheduler/nightlyRecalculateBalanceDue.ts`

---

## 3. 処理内容（実装時）

1. 対象月を決定（閉店処理で確定した営業日に基づく、または前月の最終日時点）
2. 対象月の全 bills を businessDate でフィルタして取得
3. status == 'settled' の bills のみを対象
4. 各 bill の paymentsSummary.balanceDueIncl を合算
5. analyticsMonthly/{monthKey}.net.balanceDueIncl を上書き（set、increment 禁止）
6. 各日次の analyticsMonthly/{monthKey}/days/{businessDate}.net.balanceDueIncl も同様に再計算

---

## 4. 非対象

- STORE_CLOSE_HOUR による cron スケジュール（廃止済み）
- 時刻ベースの自動起動（閉店処理または Cloud Task による明示起動のみ）
