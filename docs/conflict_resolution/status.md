# コンフリクト解消 現状まとめ

_最終更新: 2025-12-23 (JST)_

## 基本情報

### 現在ブランチ
- **ブランチ名**: `merge/billsmigration-into-develop-20251223`
- **マージ種別**: `billsmigration/draft` と `develop` の統合
- **状態**: マージ中（コンフリクト発生中）

### Git状態
```
On branch merge/billsmigration-into-develop-20251223
Your branch is up to date with 'origin/develop'.
You have unmerged paths.
  (fix conflicts and run "git commit")
```

## 未解消コンフリクトファイル一覧

**合計: 25ファイル**（`git diff --name-only --diff-filter=U` で確認済み）

### Functions - Callables (12ファイル)
1. `functions/src/callables/accounting.ts`
2. `functions/src/callables/addon.ts`
3. `functions/src/callables/assignSeatToPlayer.ts`
4. `functions/src/callables/bulkAddon.ts`
5. `functions/src/callables/bustAndExit.ts`
6. `functions/src/callables/bustAndReentry.ts`
7. `functions/src/callables/cancelAccounting.ts`
8. `functions/src/callables/refundProcessing.ts`
9. `functions/src/callables/registerParticipants.ts`
10. `functions/src/callables/reseatAllPlayers.ts`
11. `functions/src/callables/updateAccounting.ts`
12. `functions/src/callables/updateActiveBill.ts`

### Functions - ItemOrder (2ファイル)
13. `functions/src/itemOrder/placeOrder.ts`
14. `functions/src/itemOrder/placeOrderByUser.ts`

### Functions - SideGame (4ファイル)
15. `functions/src/sideGame/depositTip.ts`
16. `functions/src/sideGame/leaveSeat.ts`
17. `functions/src/sideGame/registerForSideGame.ts`
18. `functions/src/sideGame/withdrawTip.ts`

### Functions - UserLogin (2ファイル)
19. `functions/src/userLogin/manualCheckIn.ts`
20. `functions/src/userLogin/processVisitByQR.ts`

### Functions - その他 (1ファイル)
21. `functions/src/index.ts` - **注意度: 中**（export集約で運用影響が大きいため、ロジック危険度は低くても注意が必要）

### Flutter - Accounting (1ファイル)
22. `lib/Accounting/accountingPage.dart`

### Flutter - Home (2ファイル)
23. `lib/Home/systemSettingsPage.dart`
24. `lib/Home/terminalHomePage.dart`

### Flutter - OrderView (1ファイル)
25. `lib/OrderView/OrderManagement/order_card.dart`

## ファイル分類と注意度

### 高リスク（独断解消禁止）
**理由**: Firestore書き込み、idempotency、paymentsSummary、会計処理に関わる重要ロジック

- `functions/src/callables/accounting.ts` - 会計処理の核心
- `functions/src/callables/cancelAccounting.ts` - 会計キャンセル
- `functions/src/callables/refundProcessing.ts` - 返金処理
- `functions/src/callables/updateAccounting.ts` - 会計後調整
- `functions/src/itemOrder/placeOrder.ts` - 注文処理（idempotency重要）
- `functions/src/itemOrder/placeOrderByUser.ts` - 注文処理（idempotency重要）
- `functions/src/userLogin/manualCheckIn.ts` - 入店処理（bills作成）
- `functions/src/userLogin/processVisitByQR.ts` - QR入店処理（bills作成）
- `lib/Accounting/accountingPage.dart` - 会計画面（UI/ロジック）

### 中リスク（選択肢提示が必要）
**理由**: トーナメント・サイドゲーム・座席管理など、データ整合性に影響するが比較的独立

- `functions/src/callables/addon.ts` - トーナメントAddon
- `functions/src/callables/bulkAddon.ts` - トーナメント一括Addon
- `functions/src/callables/bustAndReentry.ts` - トーナメントBust&リエントリー
- `functions/src/callables/registerParticipants.ts` - トーナメント参加登録
- `functions/src/callables/assignSeatToPlayer.ts` - 座席割り当て
- `functions/src/callables/bustAndExit.ts` - 退店処理
- `functions/src/callables/reseatAllPlayers.ts` - 座席再配置
- `functions/src/callables/updateActiveBill.ts` - **中〜高境界**（会計前編集、現物確認が必要なため最初の着手推奨からは外す）
- `functions/src/sideGame/depositTip.ts` - サイドゲームチップ入金
- `functions/src/sideGame/withdrawTip.ts` - サイドゲームチップ出金
- `functions/src/sideGame/registerForSideGame.ts` - サイドゲーム登録
- `functions/src/sideGame/leaveSeat.ts` - サイドゲーム退席
- `functions/src/index.ts` - Functionsエントリーポイント（export定義、運用影響大）
- `lib/Home/systemSettingsPage.dart` - システム設定画面
- `lib/Home/terminalHomePage.dart` - ターミナルホーム画面
- `lib/OrderView/OrderManagement/order_card.dart` - 注文カードUI

## 推奨着手順序

### フェーズ1: 低リスクから開始（実装時）
1. `lib/Home/terminalHomePage.dart` - UIのみ（ロジック影響少）

### フェーズ2: 中リスク（選択肢提示）
2. `functions/src/index.ts` - export定義（運用影響大のため注意、影響範囲確認が必要）
3. `functions/src/sideGame/*` - サイドゲーム系（4ファイル、比較的独立）
4. `functions/src/callables/assignSeatToPlayer.ts` - 座席管理（比較的独立）
5. `functions/src/callables/reseatAllPlayers.ts` - 座席再配置（比較的独立）
6. `functions/src/callables/bustAndExit.ts` - 退店処理（activeStays削除に注意）
7. `functions/src/callables/updateActiveBill.ts` - 会計前編集（中〜高境界、現物確認が必要）

### フェーズ3: 高リスク（慎重に）
8. `functions/src/userLogin/*` - 入店処理（bills作成の核心）
9. `functions/src/itemOrder/*` - 注文処理（idempotency重要）
10. `functions/src/callables/accounting.ts` - 会計処理の核心
11. `functions/src/callables/cancelAccounting.ts` - 会計キャンセル
12. `functions/src/callables/refundProcessing.ts` - 返金処理
13. `functions/src/callables/updateAccounting.ts` - 会計後調整
14. `lib/Accounting/accountingPage.dart` - 会計画面

### フェーズ4: トーナメント系（中リスクだが複雑）
15. `functions/src/callables/addon.ts`
16. `functions/src/callables/bulkAddon.ts`
17. `functions/src/callables/bustAndReentry.ts`
18. `functions/src/callables/registerParticipants.ts`

### フェーズ5: 残り
19. `lib/Home/systemSettingsPage.dart`
20. `lib/OrderView/OrderManagement/order_card.dart`

## 根拠（git出力）

### git status（抜粋）
```
On branch merge/billsmigration-into-develop-20251223
Your branch is up to date with 'origin/develop'.

You have unmerged paths.
  (fix conflicts and run "git commit")
  (use "git merge --abort" to abort the merge)

Unmerged paths:
  (use "git add <file>..." to mark resolution)
	both modified:   functions/src/callables/accounting.ts
	both modified:   functions/src/callables/addon.ts
	both modified:   functions/src/callables/assignSeatToPlayer.ts
	both modified:   functions/src/callables/bulkAddon.ts
	both modified:   functions/src/callables/bustAndExit.ts
	both modified:   functions/src/callables/bustAndReentry.ts
	both modified:   functions/src/callables/cancelAccounting.ts
	both modified:   functions/src/callables/refundProcessing.ts
	both modified:   functions/src/callables/registerParticipants.ts
	both modified:   functions/src/callables/reseatAllPlayers.ts
	both modified:   functions/src/callables/updateAccounting.ts
	both modified:   functions/src/callables/updateActiveBill.ts
	both modified:   functions/src/index.ts
	both modified:   functions/src/itemOrder/placeOrder.ts
	both modified:   functions/src/itemOrder/placeOrderByUser.ts
	both modified:   functions/src/sideGame/depositTip.ts
	both modified:   functions/src/sideGame/leaveSeat.ts
	both modified:   functions/src/sideGame/registerForSideGame.ts
	both modified:   functions/src/sideGame/withdrawTip.ts
	both modified:   functions/src/userLogin/manualCheckIn.ts
	both modified:   functions/src/userLogin/processVisitByQR.ts
	both modified:   lib/Accounting/accountingPage.dart
	both modified:   lib/Home/systemSettingsPage.dart
	both modified:   lib/Home/terminalHomePage.dart
	both modified:   lib/OrderView/OrderManagement/order_card.dart
```

### git diff --name-only --diff-filter=U（全文）
```
functions/src/callables/accounting.ts
functions/src/callables/addon.ts
functions/src/callables/assignSeatToPlayer.ts
functions/src/callables/bulkAddon.ts
functions/src/callables/bustAndExit.ts
functions/src/callables/bustAndReentry.ts
functions/src/callables/cancelAccounting.ts
functions/src/callables/refundProcessing.ts
functions/src/callables/registerParticipants.ts
functions/src/callables/reseatAllPlayers.ts
functions/src/callables/updateAccounting.ts
functions/src/callables/updateActiveBill.ts
functions/src/index.ts
functions/src/itemOrder/placeOrder.ts
functions/src/itemOrder/placeOrderByUser.ts
functions/src/sideGame/depositTip.ts
functions/src/sideGame/leaveSeat.ts
functions/src/sideGame/registerForSideGame.ts
functions/src/sideGame/withdrawTip.ts
functions/src/userLogin/manualCheckIn.ts
functions/src/userLogin/processVisitByQR.ts
lib/Accounting/accountingPage.dart
lib/Home/systemSettingsPage.dart
lib/Home/terminalHomePage.dart
lib/OrderView/OrderManagement/order_card.dart
```

**確認日時**: 2025-12-23（`git diff --name-only --diff-filter=U` で確認済み）

## 注意事項

- 各ファイルのコンフリクト内容は、実際のファイルを確認してから判断する
- 判断不能な場合は、明確に「判断不能」と記録し、人間に委ねる
- `status.md` は "現在の事実" を反映する（git出力に基づく）

