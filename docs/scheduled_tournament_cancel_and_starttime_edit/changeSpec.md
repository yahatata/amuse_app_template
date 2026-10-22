# changeSpec: scheduledTournament 論理削除・開始時刻編集

## 1. 変更対象

### Functions
- `callables/getScheduledTournamentsForEdit.ts`
  - `includeCancelled`, `excludeBeforeBusinessDate` を追加
  - 返却項目拡張（`status`, `regEndAt`, `businessDate`, `recurrenceId`）
- `callables/updateScheduledTournamentStatus.ts`（新規）
  - キャンセル/復旧を提供
- `callables/updateScheduledTournamentStartAt.ts`（新規）
  - 開始時刻編集を提供
- `services/generateRecurringTournamentsCore.ts`
  - recurrence + businessDate 単位での重複判定を追加
- `callables/createTournamentRecurrence.ts`
  - 同上の重複判定を追加
- `index.ts`
  - 新規callableをexport

### Flutter
- `tournament_creation_menu_page.dart`
  - メニュー文言変更
- `create_tournament_from_calendar_page.dart`
  - 状態表示、キャンセル/復旧、開始時刻編集
- `edit_recurring_tournament_page.dart`
  - 2日前以前を除外、cancelledの表示/非選択化、時刻修正注記
- `scheduled_tournament_list_page.dart`
  - cancelled非表示、status文言揺れ吸収

## 2. 仕様差分（要点）
- statusは `cancelled` を正に統一
- 復旧条件は `now < regEndAt`
- 例外コレクションは追加せず、生成側重複判定で再生成を抑止

## 3. 互換性
- API拡張は後方互換（追加引数は任意）
- 既存UI呼び出しは従来動作を維持
