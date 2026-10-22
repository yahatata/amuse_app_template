# Phase4: 夜間整合確認 詳細仕様

## 1. 概要

bills / activeStays / analyticsMonthly のデータ整合性を確認し、異常を検出する処理。  
**STORE_CLOSE_HOUR は使用しない**。  
スケジューラではなく、**閉店処理の一環**または **Cloud Task** から起動する。

---

## 2. 起動方法

- 閉店処理の一環として呼び出す
- または Cloud Task を発行し、そのハンドラから `runNightlyIntegrityCheck()` を呼び出す

**参照**: `functions/src/domains/analytics/scheduler/nightlyIntegrityCheck.ts`

---

## 3. 処理内容（実装時）

1. **bills 整合性チェック**
   - status == 'settled' だが amounts.grandTotalRounded == 0
   - postEvents.netSalesIncl < 0
   - paymentsSummary.balanceDueIncl < 0
2. **activeStays 整合性チェック**
   - activeStays が存在するが、対応する bills.status == 'settled'
   - bills.status != 'settled' だが activeStays が存在しない（想定外）
3. **analyticsMonthly 整合性チェック**
   - sales.grossIncl と categoryBreakdown の合計が一致しない
   - net.netSalesIncl が sales.grossIncl - events.totalRefundedIncl + events.totalAdjustmentsIncl と一致しない
4. 整合性レポートを integrityReports/{YYYY-MM-DD} に保存

---

## 4. 非対象

- STORE_CLOSE_HOUR による cron スケジュール（廃止済み）
- 時刻ベースの自動起動（閉店処理または Cloud Task による明示起動のみ）
