# Active Stays 詳細設計

_最終更新: 2025-11-10 (JST)_

## 0. 目的
- 滞在中ユーザーの一覧管理を `activeStays` コレクションで分離し、営業中の読み取りコストを削減する。
- `bills` は会計記録専用とし、運用データ（在席状況）は `activeStays` で管理する。
- 会計確定時に即時削除し、閉店時クリーンアップで取りこぼしを防ぐ。
- **本運用では TTL を使用しない。クリーンアップは Settlement 即時削除＋閉店時 callable により担保する。**

## 1. スキーマ最終確定
```
/activeStays/{uid}
{
  uid: string,              // ドキュメントIDと一致（一意制約の代替）
  billId: string,           // 対応する bills/{billId}
  pokerName: string,        // 表示名
  isActive: boolean,         // 滞在中フラグ（true のみ有効、false は削除待ち）
  startedAt: timestamp      // 入店時刻
}
```

- `uid` はドキュメントIDと一致させ、一意性を保証。
- `isActive == true` のドキュメントのみが有効。削除時は即時 `delete()` を実行。
- **最小スキーマ**: ローカルで常に保持し更新のたびに読み取る仕様のため、`table`, `seat`, `updatedAt` は保持しない。
- **座席情報**: `bills.place.table`, `bills.place.seat` に保持し、`updatePlace` ヘルパAPIで更新する。

## 2. ライフサイクル

### 2.1 作成（入店時）
- **トリガ**: `createBillWithActiveStay` ヘルパAPI
- **処理**:
  1. `bills/{billId}` 親ドキュメント作成（トランザクション内）
  2. `activeStays/{uid}` 作成（同一トランザクション）
- **エラー**: 既に `activeStays/{uid}` が存在する場合は `failed-precondition`（重複入店防止）

### 2.2 更新（座席移動）
- **トリガ**: `updatePlace` ヘルパAPI
- **処理**: `bills/{billId}.place.table`, `bills/{billId}.place.seat` を更新（`activeStays` は更新しない）
- **エラー**: `bills.status == "settled"` の場合は更新拒否
- **注**: `activeStays` は最小スキーマのため、座席情報は保持しない。

### 2.3 削除（会計確定時）
- **トリガ**: Settlement Trigger 完了後
- **処理**:
  1. `bills/{billId}` の `status == 'settled'` を確認
  2. `activeStays/{uid}` を `delete()` で即時削除
  3. 削除失敗時は warning ログ（閉店時クリーンアップで後から削除される）
- **エラー**: ドキュメントが存在しない場合は no-op（既に削除済み）

### 2.5 閉店クリーンアップ（手動/自動）
- **トリガ**: close_process（手動ボタン）→ 将来スケジュール化
- **目的**: 開店時に `activeStays` を空に保つ（TTL 依存を排除）
- **処理**: `isActive == true` を全削除（逐次 try/catch）。失敗は warning ログ＋再試行（指数バックオフ）、それでも失敗は監査ログへ。
- **計測**: 削除件数・失敗件数・所要時間をメトリクス化
- **例外運用**: 会計未確定で残存していた `billId` を監査ログに記録（翌営業で是正）

## 3. クライアント側読み取り

### 3.1 Flutter での利用
- **推奨**: 単一長寿命リスナー（アプリ起動時に1回購読、張り直し ≤ 5回/日）
- **実装**:
  ```dart
  final activeStaysStream = FirebaseFirestore.instance
      .collection('activeStays')
      .where('isActive', isEqualTo: true)
      .snapshots();
  ```
- **UI**: 在席一覧画面で `StreamBuilder` を使用し、リアルタイム更新を反映
- **閉店クリーンアップ**: `SystemSettingsPage` の「閉店クリーンアップ」ボタンで callable を呼び出し、即時削除と監査ログを実行

### 3.2 読み取り最適化
- インデックス: `(isActive, startedAt)` でソート可能にする
- キャッシュ: 初回読み取り後、変更差分のみを購読

## 4. セキュリティルール
- **作成**: Functions のみ許可（クライアント直書き禁止）
- **更新**: Functions のみ許可（最小スキーマのため、通常は更新しない。必要に応じて `pokerName` のみ更新可能）
- **削除**: Functions のみ許可
- **読み取り**: 認証済みユーザーは全員可（在席一覧表示のため）

## 5. インデックス
- `(isActive, startedAt)` 複合インデックス（在席一覧のソート用）
- 単一インデックスは最小限（容量節約）

## 6. エラーハンドリング

### 6.1 作成失敗
- トランザクション内で `bills` 作成と `activeStays` 作成が分離されている場合、`bills` は作成済みだが `activeStays` が失敗したらロールバック or 補正処理

### 6.2 削除失敗
- Settlement Trigger で削除に失敗しても warning ログのみ
- 閉店時クリーンアップで後から削除されるため、致命的ではない

### 6.3 取りこぼし検知
- 閉店時クリーンアップで `bills.status != 'settled'` だが `activeStays/{uid}` が存在するケースを検出
- 該当ドキュメントを削除し、監査ログに記録

## 7. テスト観点
- 入店時: `bills` と `activeStays` が同一トランザクションで作成されること
- 座席移動: `bills.place.table`/`bills.place.seat` が更新されること（`activeStays` は更新しない）
- 注文時: `orders/{YYYYMMDD}/_TodaysOrders/{orderId}` に `bills.place.table`, `bills.place.seat` が同梱されること
- 会計確定: `activeStays` が即時削除されること
- 閉店クリーンアップ: `isActive == true` のドキュメントが全削除されること、失敗件数がカウントされること、監査ログが記録されること
- クライアント: onSnapshot でリアルタイム更新が反映されること

## 8. 実装ファイル
- **ヘルパAPI**: `functions/src/helpers/billsApi/index.ts` 内の `createBillWithActiveStay`, `updatePlace`（`bills.place.*` のみ更新）
- **注文API**: `functions/src/itemOrder/placeOrder.ts`, `placeOrderByUser.ts` で `bills.place.table`, `bills.place.seat` を `_TodaysOrders` に同梱
- **Settlement Trigger**: `functions/src/triggers/settlement.ts` 内で `activeStays/{uid}` 削除
- **閉店クリーンアップ**: `functions/src/close_process/cleanupActiveStaysOnClose.ts`（新規; callable または HTTPS）

## 9. TODO
- クライアント側の長寿命リスナー実装（Flutter 共通サービス）
- 閉店クリーンアップ callable のスケジュール化（将来検討）
