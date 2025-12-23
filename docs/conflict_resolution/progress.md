# コンフリクト解消 進捗管理

_最終更新: 2025-12-23 (JST)_

## 進捗状況

- **総ファイル数**: 25（`git diff --name-only --diff-filter=U` で確認済み）
- **解消済み**: 11
- **未解消**: 14
- **進捗率**: 44%

**更新責任者**: Cursor（AI）が進捗を更新する責任を負う

## タスク一覧

### フェーズ1: 低リスク

| ファイル | 注意度 | 担当 | 状態 | 備考 |
|---------|--------|------|------|------|
| `lib/Home/terminalHomePage.dart` | 低 | Cursor | 解消済み | UIのみ（選択肢提示→選択肢1採用） |

### フェーズ2: 中リスク（未着手）

| ファイル | 注意度 | 担当 | 状態 | 備考 |
|---------|--------|------|------|------|
| `functions/src/index.ts` | 中 | - | 未着手 | export定義（運用影響大） |
| `functions/src/sideGame/depositTip.ts` | 中 | Cursor | 解消済み | サイドゲーム（選択肢提示→選択肢1採用） |
| `functions/src/sideGame/withdrawTip.ts` | 中 | Cursor | 解消済み | サイドゲーム（選択肢提示→選択肢1採用） |
| `functions/src/sideGame/registerForSideGame.ts` | 中 | Cursor | 解消済み | サイドゲーム（選択肢提示→選択肢1採用） |
| `functions/src/sideGame/leaveSeat.ts` | 中 | Cursor | 解消済み | サイドゲーム（選択肢提示→選択肢1採用） |
| `functions/src/callables/assignSeatToPlayer.ts` | 中 | Cursor | 解消済み | 座席管理（選択肢提示→選択肢1採用） |
| `functions/src/callables/reseatAllPlayers.ts` | 中 | Cursor | 解消済み | 座席再配置（選択肢提示→選択肢1採用） |
| `functions/src/callables/bustAndExit.ts` | 中 | Cursor | 解消済み | 退店処理（選択肢提示→選択肢1採用） |
| `functions/src/callables/updateActiveBill.ts` | 中 | Cursor | 解消済み | 会計前編集（選択肢提示→選択肢1採用） |
| `lib/Home/systemSettingsPage.dart` | 中 | Cursor | 解消済み | システム設定（選択肢提示→選択肢1採用） |
| `lib/OrderView/OrderManagement/order_card.dart` | 中 | Cursor | 解消済み | 注文カードUI（選択肢提示→選択肢1採用） |

### フェーズ3: 高リスク（未着手）

| ファイル | 注意度 | 担当 | 状態 | 備考 |
|---------|--------|------|------|------|
| `functions/src/userLogin/manualCheckIn.ts` | 高 | - | 未着手 | 入店処理（bills作成） |
| `functions/src/userLogin/processVisitByQR.ts` | 高 | - | 未着手 | QR入店処理（bills作成） |
| `functions/src/itemOrder/placeOrder.ts` | 高 | - | 未着手 | 注文処理（idempotency重要） |
| `functions/src/itemOrder/placeOrderByUser.ts` | 高 | - | 未着手 | 注文処理（idempotency重要） |
| `functions/src/callables/accounting.ts` | 高 | - | 未着手 | 会計処理の核心 |
| `functions/src/callables/cancelAccounting.ts` | 高 | - | 未着手 | 会計キャンセル |
| `functions/src/callables/refundProcessing.ts` | 高 | - | 未着手 | 返金処理 |
| `functions/src/callables/updateAccounting.ts` | 高 | - | 未着手 | 会計後調整 |
| `lib/Accounting/accountingPage.dart` | 高 | - | 未着手 | 会計画面 |

### フェーズ4: トーナメント系（未着手）

| ファイル | 注意度 | 担当 | 状態 | 備考 |
|---------|--------|------|------|------|
| `functions/src/callables/addon.ts` | 中 | - | 未着手 | トーナメントAddon |
| `functions/src/callables/bulkAddon.ts` | 中 | - | 未着手 | トーナメント一括Addon |
| `functions/src/callables/bustAndReentry.ts` | 中 | - | 未着手 | トーナメントBust&リエントリー |
| `functions/src/callables/registerParticipants.ts` | 中 | - | 未着手 | トーナメント参加登録 |

## 状態凡例

- **未着手**: コンフリクト解消未実施
- **解消中**: 現在解消作業中（Cursorが1ファイル開始時に更新）
- **選択肢提示待ち**: 人間の判断待ち（Cursorが選択肢提示時に更新）
- **判断不能**: 人間による解消が必要（Cursorが判断不能時に更新）
- **解消済み**: コンフリクト解消完了、テスト通過（Cursorが解消＋テスト通過時に更新）
- **保留**: 一時的に保留

## 担当凡例

- **Cursor**: AI（Cursor）が独断で解消、または進捗更新を担当
- **人間**: 人間が判断・解消
- **-**: 未割り当て

## 更新タイミング（Cursorが更新責任者）

Cursorは以下のタイミングで `progress.md` を更新する：

1. **ファイル開始時**: userに指定されたファイルの状態を「解消中」に更新（複数指定の場合は全ファイル）
2. **選択肢提示時**: 該当ファイルの状態を「選択肢提示待ち」に更新
3. **判断不能時**: 該当ファイルの状態を「判断不能」に更新
4. **解消＋テスト通過時**: 該当ファイルの状態を「解消済み」に更新、進捗率を再計算

## 次回作業予定

現在、ドキュメント整備フェーズのため、実コードの解消は未着手。

次回は、`status.md` の推奨着手順序に従って、フェーズ1から順次進める。

