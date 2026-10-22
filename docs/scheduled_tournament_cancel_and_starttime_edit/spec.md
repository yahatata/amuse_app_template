# 仕様書: scheduledTournament 論理削除・開始時刻編集

## 1. 目的
- `scheduledTournaments` の個別運用を可能にする。
  - 論理削除（キャンセル）
  - 開始時刻編集
  - 復旧
- 定期生成・Cloud Tasks 連携と整合したまま運用できるようにする。

## 2. ステータス方針
- キャンセル状態は `status = "cancelled"` に統一する。
- `canceled` は新規導入しない（既存コード/テストとの整合のため）。

## 3. 機能要件

### 3.1 カレンダー画面での操作
- 対象画面: `create_tournament_from_calendar_page.dart`
- 日付配下トーナメントの詳細ダイアログで以下を提供:
  - 開始時刻編集（`scheduled` のみ）
  - キャンセル（`scheduled` のみ）
  - 復旧（`cancelled` のみ）
- 復旧条件:
  - `now < regEndAt` の場合のみ許可
  - それ以外は不可（メッセージ表示）

### 3.2 一覧表示の要件
- カレンダー画面では `cancelled` を表示する。
  - 視覚的に「キャンセル済み」と判別可能にする。
  - タップしてダイアログを開き、復旧可能にする。
- `scheduled_tournament_list_page.dart` では `cancelled` を非表示にする。

### 3.3 定期予定編集画面の要件
- 対象画面: `edit_recurring_tournament_page.dart`
- 表示対象:
  - 「2日前以前」を除外（昨日以降のみ表示）
  - `cancelled` も表示する
- 表示ルール:
  - `cancelled` は「キャンセル済み」と明示し、選択不可
  - 定期設定の `startTime` と異なる開始時刻のトーナメントは赤字注記:
    - `※スタート時刻修正済↩︎例外の定期トーナメント`
  - 時刻修正済み（非cancel）は選択可

## 4. API 要件

### 4.1 新規 Callable
- `updateScheduledTournamentStatus`
  - 入力: `tournamentId`, `action` (`cancel` | `restore`)
  - `cancel`: `scheduled -> cancelled`, `taskSyncNeeded=false`
  - `restore`: `cancelled -> scheduled`（`now < regEndAt` 必須）
    - `schedulePlanVersion += 1`
    - `taskSyncNeeded=true`
- `updateScheduledTournamentStartAt`
  - 入力: `tournamentId`, `startAt`, `selectedBusinessDateKey?`
  - `scheduled` のみ対象
  - `businessDate` 再計算（AMBIGUOUS対応）
  - `regEndAt` 再計算
  - `schedulePlanVersion += 1`, `taskSyncNeeded=true`

### 4.2 既存 Callable 拡張
- `getScheduledTournamentsForEdit`
  - 入力に `includeCancelled`, `excludeBeforeBusinessDate` を追加
  - 返却に `status`, `regEndAt`, `businessDate`, `recurrenceId` を追加

## 5. 再生成防止（B方針）
- 追加コレクションなしで運用する。
- 定期生成時の重複判定を強化:
  - 同一 `recurrenceId + businessDate + storeId + tenantId` に対して
  - `status in ["scheduled","running","registered","cancelled"]` が存在すれば生成しない
- これにより以下を防止:
  - 個別キャンセルした開催日の再生成
  - 時刻修正済み開催日の同日重複生成

## 6. Cloud Tasks 整合
- enqueue 対象は `status=="scheduled"` のみ（現行仕様維持）。
- cancel したトーナメントは enqueue 対象外。
- 既に投入済みの旧タスクが実行されても、`controlHook` の条件で no-op になる。
- startAt 編集・復旧は `schedulePlanVersion` 更新により旧タスク無効化を保証。

## 7. 非機能要件
- 既存データと互換性を保つ（status揺れ対策を実施）。
- 既存の定期生成/テンプレ編集の導線を壊さない。
