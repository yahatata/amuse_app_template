# アプリフロー一覧 - Step 3: 統合とMECE検証

**作成日**: 2025-01-XX  
**目的**: 全体の統合、MECE検証、フロー間の関連性整理

---

## 1. MECE検証

### 1.1 相互排他性（Mutually Exclusive）の検証

#### ✅ 機能領域の分類
各機能領域は明確に分離されており、重複なし：
- 認証・デバイス管理：システム初期化・権限管理
- ユーザー管理：顧客の入退店・アカウント管理
- トーナメント管理：ポーカートーナメント運営
- 会計管理：顧客の会計処理
- 注文管理：メニュー・注文受付・キッチン管理
- サイドゲーム管理：カジノゲーム運営
- 勤怠管理：スタッフの勤怠記録
- シフト管理：スタッフのシフト要請・承認
- スタッフ管理：スタッフアカウント管理
- ダッシュボード・分析：売上分析
- システム設定・運用：システム全体の設定

#### ✅ フローの分類
各フローは特定の機能領域に属し、明確に区別されている。

### 1.2 完全性（Collectively Exhaustive）の検証

#### ✅ 主要機能の網羅性
以下の主要機能がすべて網羅されている：

**ユーザー関連**:
- ✅ ユーザー作成
- ✅ QR/手動チェックイン
- ✅ チェックアウト（QRコード検出時、会計確定時）
- ✅ 入店中ユーザー一覧
- ✅ ユーザーアクションホーム（各種操作）

**トーナメント関連**:
- ✅ テンプレート作成・編集
- ✅ ブラインドテンプレート作成・編集
- ✅ 定期開催設定
- ✅ 単発トーナメント作成（直接入力/カレンダー）
- ✅ 参加者登録
- ✅ 座席管理（着席・退席・リシート）
- ✅ リエントリー・アドオン・バースト
- ✅ プライズ確定・順位確定
- ✅ トーナメント終了
- ✅ ブラインドタイマー

**会計関連**:
- ✅ 会計開始・確定
- ✅ 会計前編集
- ✅ 支払い分割計算
- ✅ 会計後調整（追加徴収・減額・返金・キャンセル・再オープン）
- ✅ 会計履歴参照

**注文関連**:
- ✅ メニュー管理（作成・編集・売り切れ設定）
- ✅ 注文受付
- ✅ 注文管理（キッチン画面）
- ✅ 注文編集・キャンセル
- ✅ 注文履歴参照

**サイドゲーム関連**:
- ✅ テーブル選択・ゲーム開始
- ✅ 参加者登録
- ✅ Tip管理（参照・預入・引き出し）
- ✅ Chip購入
- ✅ 退席・ゲーム終了

**勤怠関連**:
- ✅ QR/手動打刻（出勤・退勤）
- ✅ 勤怠記録参照（全スタッフ・個別）
- ✅ 勤怠修正申請・承認・却下
- ✅ 給与計算（自動）

**シフト関連**:
- ✅ シフト要請送信
- ✅ シフト承認・却下
- ✅ シフト一覧表示（カレンダー）
- ✅ シフト自動クリーンアップ

**スタッフ関連**:
- ✅ スタッフアカウント作成
- ✅ スタッフ一覧表示
- ✅ 時給設定
- ✅ 銀行情報設定

**分析関連**:
- ✅ ダッシュボード表示（月次KPI・グラフ）
- ✅ 年間比較
- ✅ カテゴリ別詳細
- ✅ 支払い方法別詳細
- ✅ 日次推移

**システム関連**:
- ✅ 一時テーブル作成
- ✅ データ移行
- ✅ ダミーデータ生成
- ✅ 全テーブルリセット
- ✅ 全サイドゲームリセット
- ✅ 閉店クリーンアップ

**自動処理**:
- ✅ 夜間売上再計算
- ✅ 夜間整合性チェック
- ✅ 定期トーナメント自動生成
- ✅ 分析データ自動更新

### 1.3 階層構造の整合性

#### ✅ 機能領域 → フロー → ステップ
各機能領域の下に詳細フローが配置され、各フローはステップに分解されている。

#### ✅ フロー間の関連性
関連するフローが適切に参照されている：
- ユーザーアクションホーム → 各種操作フロー
- トーナメントホーム → 各種トーナメント操作フロー
- 会計管理 → 注文管理・会計後調整

---

## 2. フロー間の関連性マップ

### 2.1 ユーザーライフサイクルフロー

```
【入店】
├─ QRコードチェックイン / 手動チェックイン
│  └─ bills作成、activeStays作成
│
├─ 【在店中の操作】
│  ├─ 注文（メニュー選択 → 注文確定）
│  ├─ トーナメント参加（参加登録 → 座席着席 → リエントリー/アドオン/バースト）
│  ├─ サイドゲーム参加（座席登録 → Tip管理 → Chip購入）
│  └─ 追加料金追加
│
└─ 【退店】
   └─ 会計（会計開始 → 会計前編集 → 会計確定 → 支払い）
      └─ activeStays削除（会計確定時または手動）
```

### 2.2 トーナメントライフサイクルフロー

```
【企画】
├─ ブラインドテンプレート作成
├─ トーナメントテンプレート作成
└─ 定期開催設定 / 単発トーナメント作成
   └─ scheduledTournaments作成

【運営】
├─ 参加者登録
│  └─ 待機リストに追加
│
├─ 座席管理
│  ├─ 待機者を着席
│  ├─ 全員リシート
│  └─ 卓追加・削除
│
├─ トーナメント実行
│  ├─ ブラインドタイマー（一時停止/再開）
│  ├─ リエントリー・アドオン・バースト処理
│  └─ プライズ確定・順位確定
│
└─ トーナメント終了
   └─ ステータス更新、座席クリア
```

### 2.3 会計ライフサイクルフロー

```
【会計前】
├─ 注文追加（メニューから）
├─ 追加料金追加（手動）
└─ 注文編集・削除

【会計中】
├─ 会計開始
├─ 支払い方法選択
├─ 支払い分割計算
└─ 会計確定
   └─ 分析データ更新

【会計後】
├─ 追加徴収
├─ 減額
├─ 返金
├─ キャンセル
└─ 再オープン
```

### 2.4 スタッフライフサイクルフロー

```
【アカウント作成】
├─ スタッフアカウント作成
│  └─ QRコード生成・メール送信
│
└─ 時給・銀行情報設定

【勤務】
├─ シフト要請
│  └─ シフト承認・却下
│
├─ 打刻（QR/手動）
│  ├─ 出勤
│  └─ 退勤
│
├─ 勤怠修正申請
│  └─ 勤怠修正承認・却下
│
└─ 給与計算（自動、月次）
```

---

## 3. フロー統合チェックリスト

### 3.1 エントリーポイント（画面遷移の起点）

#### ✅ 認証済み
- デバイス登録完了後 → AdminHomePage / TerminalHomePage

#### ✅ AdminHomePageから
- シフト管理
- 勤怠承認
- デバイス管理
- スタッフアカウント作成
- システム設定
- ターミナルモード切替

#### ✅ TerminalHomePageから
- ユーザー作成
- ユーザーログイン（QR/手動）
- メニュー編集
- 注文画面
- 入店中ユーザー一覧
- トーナメント作成/ホーム
- サイドゲーム
- 注文管理
- スタッフ打刻
- 会計管理
- ダッシュボード
- 支払い分割テスト
- Firestoreサイズ計算
- 会計後調整
- テーブルページ
- ブラインドタイマー

### 3.2 データフロー整合性

#### ✅ ユーザー入店時のデータ作成
- `bills` ドキュメント作成（status: 'open'）
- `activeStays` ドキュメント作成（isActive: true）

#### ✅ 注文時のデータ更新
- `bills/{billId}/items` サブコレクションに追加
- 分析データ更新（`addToDailySummary`, `addToMonthlyIndex`, `addToByUser`）

#### ✅ 会計確定時のデータ更新
- `bills` ドキュメントのステータスを 'settled' に更新
- 支払い情報を保存
- ポイント残高を更新
- 分析データ更新

#### ✅ トーナメント参加時のデータ更新
- `bills/{billId}/tournaments/{tournamentId}` サブコレクションに追加
- `scheduledTournaments/{tournamentId}/tablesSeat/waiting` に追加

---

## 4. 未実装・要確認フロー

### 4.1 実装確認が必要なフロー

1. **サイドゲーム退席フロー**
   - `leaveSeat` Cloud Functionの実装確認が必要
   - UIからの退席操作の実装確認が必要

2. **シフト要請の通知機能**
   - スタッフへの通知機能の実装確認が必要

3. **スタッフアカウント作成時のメール送信**
   - QRコード添付メール送信の実装確認が必要

4. **チェックアウトフロー**
   - QRコード検出時の自動チェックアウト処理の実装確認が必要
   - 会計確定時の自動チェックアウト処理の実装確認が必要

### 4.2 部分実装フロー

1. **夜間バッチ処理**
   - `nightlyRecalculateBalanceDue`: スケルトン実装
   - `nightlyReconciliationCheck`: スケルトン実装
   - `nightlyIntegrityCheck`: スケルトン実装

2. **Bills Migration**
   - `todaysBills` → `bills` への移行プロジェクト（62%完了）

---

## 5. フロー一覧の完全性確認

### 5.1 機能領域別フロー数

| 機能領域 | フロー数 | 備考 |
|---------|---------|------|
| 認証・デバイス管理 | 3 | デバイス登録・管理・オプション設定 |
| ユーザー管理 | 5 | アカウント作成・チェックイン・一覧・アクションホーム |
| トーナメント管理 | 22 | テンプレート・企画・運営・実行・終了 |
| 会計管理 | 9 | 会計開始・確定・後調整・履歴 |
| 注文管理 | 9 | メニュー管理・注文受付・管理・履歴 |
| サイドゲーム管理 | 9 | テーブル管理・参加・Tip・Chip・終了 |
| 勤怠管理 | 8 | 打刻・記録参照・修正申請・給与計算 |
| シフト管理 | 4 | 要請・承認・一覧・クリーンアップ |
| スタッフ管理 | 4 | アカウント作成・一覧・時給・銀行 |
| ダッシュボード・分析 | 5 | ホーム・年間比較・カテゴリ・支払い・日次 |
| システム設定・運用 | 6 | 一時テーブル・データ移行・リセット・クリーンアップ |
| 自動処理 | 6 | 夜間バッチ・整合性チェック・自動生成・分析更新 |
| **合計** | **90** | |

### 5.2 フロー分類の妥当性

#### ✅ 各フローが適切な機能領域に分類されている
#### ✅ フロー間の依存関係が明確
#### ✅ エントリーポイントが明確

---

## 6. フロー一覧の使い方

### 6.1 機能別に確認する場合
- Step 2の「各機能領域の詳細フロー」を参照

### 6.2 ユーザー操作フローを追跡する場合
- Step 3の「フロー間の関連性マップ」を参照

### 6.3 特定の操作の詳細を確認する場合
- Step 2の該当フローを参照

---

## 7. 補足情報

### 7.1 主要なCloud Functions一覧

**認証・デバイス**:
- `registerDevice`
- `updateDeviceOptions`

**ユーザー**:
- `createUserAccount`
- `processVisitByQR`
- `manualCheckIn`
- `generateQRCode`

**トーナメント**:
- `createTournamentTemplate`
- `createBlindTemplate`
- `createTournamentRecurrence`
- `createScheduledTournament`
- `registerParticipants`
- `assignSeatToPlayer`
- `reseatAllPlayers`
- `addTableToTournament`
- `removeTableFromTournament`
- `addon`
- `bulkAddon`
- `bustAndReentry`
- `bustAndExit`
- `setPrizeData`
- `setRankingData`
- `endTournament`
- `api.pause`
- `api.resume`

**会計**:
- `startAccounting`
- `completeAccounting`
- `updateAccounting`
- `cancelAccounting`
- `refundProcessing`
- `getAccountingHistory`

**注文**:
- `placeOrder`
- `placeOrderByUser`
- `createMenuItem`
- `updateMenuItem`
- `toggleSoldOutForMenuItem`
- `getMenuItems`
- `getUserOrderHistory`

**サイドゲーム**:
- `registerForSideGame`
- `leaveSeat`
- `depositTip`
- `withdrawTip`

**勤怠**:
- `determineAttendanceMode`
- `createClockInRecord`
- `createManualClockInRecord`
- `updateClockOutRecord`
- `updateManualClockOutRecord`
- `getAllStaffAttendance`
- `getStaffAttendance`
- `createAttendanceCorrectionRequest`
- `approveAttendanceCorrectionRequest`
- `rejectAttendanceCorrectionRequest`
- `getAttendanceCorrectionRequests`

**シフト**:
- `createShiftRequest`
- `getAllShifts`
- `getShifts`
- `processShiftsByStaff`

**スタッフ**:
- `createStaffAccount`
- `updateStaffHourlyWage`
- `updateStaffBankInfo`

**分析**:
- `addToDailySummary`
- `addToMonthlyIndex`
- `addToByUser`
- `migrateSettledBillsForBusinessDay`

**システム**:
- `createTemporaryTable`
- `generateDummyData`
- `resetAllTables`
- `resetAllSideGames`
- `cleanupActiveStaysOnClose`

**自動処理**:
- `nightlyRecalculateBalanceDue`
- `nightlyReconciliationCheck`
- `nightlyIntegrityCheck`
- `generateRecurringTournaments`
- `monthlyPayrollTrigger`

### 7.2 主要なFirestoreコレクション

- `devices`: デバイス情報
- `users`: ユーザー情報
- `bills`: 会計伝票（メインコレクション）
  - `extras`: 追加料金サブコレクション
  - `items`: 注文サブコレクション
  - `sideGameChips`: サイドゲームチップサブコレクション
  - `tournaments`: トーナメント参加サブコレクション
- `activeStays`: 入店中ユーザー
- `tournamentTemplates`: トーナメントテンプレート
- `tournamentBlindTemplates`: ブラインドテンプレート
- `tournamentRecurrences`: 定期開催設定
- `scheduledTournaments`: スケジュール済みトーナメント
  - `views/main`: メインビューデータ
  - `views/runtime`: ランタイムデータ
  - `tablesSeat`: 卓・座席情報
- `menuItems`: メニューアイテム
- `sideGame`: サイドゲームテーブル
- `tables`: テーブル情報
- `attendance`: 勤怠記録
- `attendanceCorrectionRequests`: 勤怠修正申請
- `shifts`: シフト情報
- `staffs`: スタッフ情報
- `payroll`: 給与データ
- `analyticsMonthly`: 月次分析データ
  - `daily`: 日次サマリーサブコレクション
  - `byCategory`: カテゴリ別サブコレクション
  - `byTournamentTemplate`: トーナメントテンプレート別サブコレクション
  - `byUser`: ユーザー別サブコレクション
- `analyticsDaily`: 日次分析データ（旧構造、移行中）

---

## 8. まとめ

### 8.1 MECE検証結果

✅ **相互排他性**: 各機能領域・フローは明確に分離されている  
✅ **完全性**: 主要機能がすべて網羅されている（90フロー）  
✅ **階層構造**: 機能領域 → フロー → ステップの階層が明確  
✅ **関連性**: フロー間の関連性が明確に定義されている

### 8.2 フロー一覧の特徴

1. **包括性**: ユーザー操作から自動処理まで、すべてのフローを網羅
2. **詳細性**: 各フローをステップ単位で分解
3. **実装反映**: 実際のコードベースに基づいた正確な記述
4. **関連性**: フロー間の関連性を明確に示している

### 8.3 今後の活用方法

- **開発**: 新機能追加時の既存フローとの整合性確認
- **テスト**: テストケース作成時の網羅性確認
- **ドキュメント**: ユーザーマニュアル・運用手順書作成の基礎資料
- **保守**: バグ修正・機能改善時の影響範囲確認

---

**完了**: アプリフロー一覧の作成が完了しました。

