# 新フォルダ別設計：bills

## 5.1 ドメイン定義（短く）

伝票・精算・会計確定を担当するドメイン。開いている伝票の取得、会計開始・完了・プレビュー、支払い按分検証、および会計確定トリガ・events トリガを含む。閉店まわりの未精算伝票・closeSnapshot・activeStays クリーンアップ・テーブル/サイドゲームリセットは **storeMeta** に配置（02_storeMeta 参照）。

**主に扱うデータ/コレクション**
- bills（およびサブコレクション items, extras, sideGameChips, tournaments, payments, events, idempotency）
- accountingHistory, activeStays
- helpers/stateDoc（営業日キー）は移行後 storeMeta または shared から参照

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | 会計・伝票更新の onCall 入口 |
| triggers/ | bills 更新/events 作成に紐づく Firestore トリガ |
| services/ | スナップショット計算（snapshots）、冪等クリーンアップ（onSettleCleanupIdempotency） |
| repos/ | helpers/billsApi の I/O 集約（createBillWithActiveStay, dualWrite, appendItem, updatePlace, postEvent* 等） |

- index.ts は **入口（callables / triggers）** を中心に export する。services / repos は原則として内部利用。

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| accounting/getBillPreviewTotals.ts | domains/bills/callables/getBillPreviewTotals.ts | callable | callables/index 経由で export。関数名維持 |
| callables/accounting.ts | domains/bills/callables/accounting.ts | callable | startAccounting, completeAccounting, completeAccountingV2。関数名維持 |
| callables/verifyPaymentSplit.ts | domains/bills/callables/verifyPaymentSplit.ts | callable | utils/paymentSplitCalculator は domains/bills/services に移行。import パス更新 |
| callables/updateActiveBill.ts | domains/bills/callables/updateActiveBill.ts | callable |  |
| callables/migrateTodaysBills.ts | domains/bills/callables/migrateTodaysBills.ts | callable |  |
| callables/getAccountingHistory.ts | domains/bills/callables/getAccountingHistory.ts | callable |  |
| callables/updateAccounting.ts | domains/bills/callables/updateAccounting.ts | callable |  |
| callables/cancelAccounting.ts | domains/bills/callables/cancelAccounting.ts | callable |  |
| callables/refundProcessing.ts | domains/bills/callables/refundProcessing.ts | callable | processRefund, getRefundHistory。関数名維持 |
| callables/appendExtra.ts | domains/bills/callables/appendExtra.ts | callable |  |
| utils/getOpenBills.ts | domains/bills/callables/getOpenBills.ts | callable | helpers/stateDoc → storeMeta または shared 参照に変更 |
| triggers/bills.onSettle.ts | domains/bills/triggers/billsOnSettle.ts | trigger | 関数名 billsOnSettle 維持。analytics/aggregator, onSettleCleanupIdempotency の import パス更新 |
| triggers/onSettleCleanupIdempotency.ts | domains/bills/services/onSettleCleanupIdempotency.ts | service | bills.onSettle から呼び出し。P1-06 で本実装予定の stub 含む |
| triggers/bills.events.onCreate.ts | domains/bills/triggers/billsEventsOnCreate.ts | trigger | 関数名 billsEventsOnCreate 維持 |
| helpers/billsApi/*（snapshots 除く） | domains/bills/repos/* | repos | types, createBillWithActiveStay, calcBusinessDate, dualWrite, getActiveBillByUser, appendItem, resolveMenuItem, appendSideGameChip, updatePlace, recordTournamentAction, startAccounting, updateBill, postEvent*, appendExtra 等。index は再構成 |
| helpers/billsApi/snapshots.ts | domains/bills/services/snapshots.ts | service | Firestore I/O なしの純粋計算。**services に含める（確定）** |
| utils/paymentSplitCalculator.ts | domains/bills/services/paymentSplitCalculator.ts | service | 精算照合用 SoT。callables/verifyPaymentSplit が参照 |

---

## 5.4 index.ts 変更方針

- **ルート index**：`export * from "./callables"` 等をやめ、bills の入口は `export * from "./domains/bills"`（または domains/bills/index から re-export）に変更。**関数名（export 名）は維持**（03_設計ルール 4.4）。
- **domains/bills/index.ts**：callables の全入口と triggers（billsOnSettle, billsEventsOnCreate）を re-export。services / repos は原則 export しない。
- **callables/index.ts**：bills に属する callable は削除し、domains/bills からルートが参照する形に変更。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に `npm run build`（または `tsc`）が成功すること。index.ts の import/export エラーがないこと。
- **確認**：triggers の export がルートから辿れること。bills を参照する他ドメイン（storeMeta の getOpenBills 等）の import がビルドできること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。export 漏れ・import パスミスを優先して確認。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **snapshots.ts**：**services に含める（確定）**。08 の「repos に含めるか」の記録は不要。
- **onSettleCleanupIdempotency**：P1-06 で本実装予定の stub を含む。**追加実装は本改修では無視**。本実装時に 08 に記録する。
- **requireAdmin 系・computeDisplayAmount・run* 系・閉店まわり callable**：**storeMeta**（computeDisplayAmount, run*, applyCloseSnapshotCore、および resetAllTables / resetAllSideGames / getUnsettledBillsForClose / finalizeUnsettledBillAfterAccounting / cleanupActiveStaysOnClose / applyCloseSnapshot を repos または services に振り分け）と **shared/devices**（requireAdmin）に移す。02_storeMeta.md と 00_shared.md に反映済み。
- **getBillPreviewTotals**：helpers/billsApi/snapshots は「ロジック参照」のコメントのみで本ファイルは import していない。移行後は domains/bills/services/snapshots を必要に応じて参照する形で可。
- **changeSpec**：close_process は storeMeta および shared/devices へ移管。storeMeta の closeStoreTerminal 等は自ドメイン内 services と shared/devices を参照する。
- **05_入口一覧**：移行実施後、bills 配下の各入口の「現在パス」を新パスに更新する。閉店まわり 6 入口は storeMeta に移すため、05 の該当行のドメインを storeMeta に変更する。
