# 開閉店警告・修正 ToBe仕様

## 0. 採用決定（本書の前提）
- 決定1: `openAssessmentTask` は `already_running_different_date` 分岐でも `manualOverrides.open(open_skip)` を評価する。
- 決定2: override は単一 `manualOverride` ではなく、`manualOverrides.close` / `manualOverrides.open` に分離する。
- 決定2補足: 営業継続時に「重複警告のため2回営業継続を押す」状態を作らない。必要時は1回の操作で close/open の抑制を同時反映する。
- 決定3: 正常閉店時は `openAssessment` をクリアせず、**即時再評価**して確定状態へ更新する。
- 決定4: 監査ログは `assessmentLogs` に集約し、詳細（uid/deviceId/role 等）も同コレクションへ記録する（表示用途は必須外、捕捉・監査用途を主目的とする）。
- 決定5: 非管理端末（admin でも terminal+store_management でもない）は「管理者に確認してください」のみ表示。管理端末は Terminal 遷移で対応可。
- 決定6: 開閉店管理ダイアログの「初期化」ボタンは削除する。
- 決定7: 開店ダイアログは、開店対象日を明示表示し「開店日付調整」ボタンを持つ。調整操作は Secret Manager のパスワード検証成功時のみ許可する。
- 決定8: 閉店ダイアログは、閉店対象営業日（currentBusinessDateKey）を明示表示するが、営業日調整ボタンは設置しない。

## 1. 背景
- 現状、強警告 `already_running_different_date` が立っている場合、`営業継続` では解除できない。
- 実運用で一時継続が必要な場面でも画面ゲートが残る。
- ただし、無制限解除は誤営業日の見逃しリスクを上げるため不可。

## 2. 目的
- 強警告 `already_running_different_date` に対してのみ、**時間制限付きの緊急一時解除**を可能にする。
- 解除期限到達時に再評価し、未対応なら再度ブロックする。
- 正常閉店後は `openAssessment` を即時再評価し、古い判定残留を防ぐ。
- 開閉店ダイアログの誤操作余地を下げ、開店対象日の可視性を上げる。

## 3. 対象警告と方針
- `needs_manual_close`: 既存どおり `営業継続` で一時抑制可能。
- `next_day_started_strong`: 既存どおり `営業継続` で一時抑制可能。
- `already_running_different_date`: 新規で「緊急一時解除」を追加（本仕様の主対象）。

## 4. ToBe仕様（緊急一時解除・閉店後再評価）
### 4.1 緊急一時解除の実行条件
- 対象警告が `already_running_different_date` であること。
- 実行者が `admin` または `terminal + options.store_management=true` であること。

### 4.2 解除時間
- `storeMeta/config.autoOpenClose.alreadyRunningDifferentDateRecheckMinutes` を使用。
- デフォルト値は 15 分。
- 許容範囲は 1〜180 分（サーバー側でバリデーション）。

### 4.3 解除時の状態更新
- `storeMeta/currentBusinessDay.manualOverrides.open` を以下で更新:
  - `type: 'open_skip'`
  - `intendedBusinessDateKey: <openAssessment.intendedBusinessDateKey>`
  - `overrideUntil: now + recheckMinutes`
- `storeMeta/currentBusinessDay.openAssessment` を以下で更新:
  - 既存値を維持しつつ `suppressedByOverride: true`
  - `lastSuppressedAt` を更新

### 4.4 営業継続（既存 close 側）との重複回避ルール
- `continueBusinessTerminal` 実行時は、従来どおり `manualOverrides.close` を設定する。
- その時点で `openAssessment.result='skipped' && blockers に 'already_running_different_date' を含む` 場合、同一トランザクションで `manualOverrides.open` も同時設定する。
- 上記により、重複警告時でも「営業継続」の1回操作で close/open 両方の抑制を完了させる（2回操作を不要化）。
- 併せて、open 側の再評価タスクも `overrideUntil` で予約し、期限到達時に再ブロック判定へ戻せるようにする。

### 4.5 正常閉店時・正常開店時の状態管理
- 正常閉店（`closeStoreTerminal` 完了）時:
  - `manualOverrides.close` / `manualOverrides.open` はクリアする。
  - `openAssessment` は `null` クリアせず、閉店完了直後に即時再評価タスクを enqueue し、再評価結果で上書きする。
  - 再評価対象日の決定順:
    1. 既存 `openAssessment.intendedBusinessDateKey` が有効ならそれを採用。
    2. ない場合はサーバーJST暦日（既存開店デフォルトと同じ）を採用。
- 正常開店（`openStoreTerminal` 完了）時:
  - `manualOverrides.close` / `manualOverrides.open` はクリアする。
  - `openAssessment` は既存どおり `null` とする（開店後は再判定を待つ）。

### 4.6 再評価予約
- `overrideUntil` 時刻で `openAssessmentTask` を Cloud Tasks へ enqueue する（緊急一時解除の期限再評価）。
- 正常閉店完了時は、別途「即時再評価」task を enqueue する。
- task payload は `intendedBusinessDateKey` と `scheduledAt` を持ち、action は `open_assessment` に加えて再評価専用 action を許可する。

### 4.7 期限到達時・閉店直後再評価時の挙動
- 期限到達時:
  - `already_running_different_date` 条件が継続していれば `suppressedByOverride=false` として再ブロック。
- 閉店直後再評価時:
  - `already_running_different_date` の残留を解消し、`ready_to_open` または `needs_manual_open` へ遷移させる。

## 5. openAssessmentTask の重要修正（必須）
- 現状は `status=running && currentBusinessDateKey!=intendedBusinessDateKey` の分岐で早期 return しており、`manualOverrides.open(open_skip)` を見ない。
- ToBeではこの分岐でも `manualOverrides.open` を評価し、`overrideUntil` が有効な間は `suppressedByOverride=true` を維持する。
- 互換性のため、移行期間は `manualOverride`（旧単一形式）も fallback 参照する。
- 再評価専用 action では日付許容範囲チェックを適切に扱い、`date_out_of_range` による誤スキップを防止する。

## 6. 監査ログ仕様
### 6.1 現状
- 認定タスク結果は `assessmentLogs` に保存される。
- ただし「緊急一時解除操作」「営業継続操作」専用ログは未整備。

### 6.2 ToBe
- 緊急一時解除実行時に `storeMeta/currentBusinessDay/assessmentLogs` へ専用ログを追加。
- 既存の営業継続（`continueBusinessTerminal`）実行時も専用ログを追加。
- 正常閉店後の open 再評価 enqueue / 実行結果も追跡可能にする。
- `assessmentLogs` は表示要件を持たず、監査・捕捉用途を主目的とする。

## 7. 画面仕様（要点）
### 7.1 強警告UI
- `StoreStrongWarningOverlay` の第2ボタンは警告種別で出し分ける。
  - `needs_manual_close` / `next_day_started_strong`: 「営業継続」
  - `already_running_different_date`: 「緊急一時解除（xx分）」
- 強警告文言は警告種別ごとに固定テンプレートを持つ。

### 7.2 開閉店管理ダイアログ
- 「初期化」ボタンは削除する。
- 閉店時（running）:
  - 「閉店対象営業日: `<currentBusinessDateKey>`」を明示表示。
  - 営業日調整ボタンは表示しない。
- 開店時（closed/error）:
  - 「開店対象営業日: `<plannedBusinessDateKey>`」を明示表示。
  - 「開店日付調整」ボタンを表示。

### 7.3 開店日付調整の認証仕様
- 開店日付調整を実行する前にパスワード入力を要求する。
- パスワード入力はセッション保持せず、**調整操作開始ごとに毎回**要求する。
- サーバー側は `business-secrets` を参照して照合する。
- 追加する secret key 名: `openBusinessDateAdjustmentPassword`。
- 初期値: `s2b`（初期投入値。運用環境では必ず変更）。
- パスワード一致時のみ、開店日付（YYYY-MM-DD）を調整可能にする。
- 開店実行時は、選択された日付を `openStoreTerminal.businessDateKey` として送信する。

## 8. 必要改修（ファイル群）
### 8.1 Functions
- `functions/src/shared/config/defaults.ts`
- `functions/src/shared/config/types.ts`
- `functions/src/shared/config/configLoader.ts`
- `functions/src/shared/secrets/types.ts`
- `functions/src/shared/secrets/secretManager.ts`
- `functions/src/domains/storeMeta/callables/openAssessmentTask.ts`
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
- `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts`
- `functions/src/domains/storeMeta/callables/openStoreTerminal.ts`
- `functions/src/domains/storeMeta/callables/temporaryUnlockAlreadyRunningDifferentDateTerminal.ts`（新規）
- `functions/src/domains/storeMeta/callables/verifyOpenBusinessDateAdjustmentPassword.ts`（新規）
- `functions/src/domains/storeMeta/index.ts`
- `functions/src/domains/storeMeta/callables/createInitialStateDocCallable.ts`
- `functions/src/domains/storeMeta/scripts/createInitialStateDoc.ts`

### 8.2 Flutter
- `lib/Home/terminalHomePage.dart`
- `lib/utils/store_strong_warning_ui.dart`
- `lib/services/store_config_defaults.dart`
- `lib/services/store_config_service.dart`

### 8.3 テスト
- config の新規フィールド読み取り/フォールバック試験追加
- `openAssessmentTask` の override 有効/期限切れ/閉店直後再評価ケース追加
- 新 Callable の権限・バリデーション・ログ試験追加
- 開店日付調整パスワード検証 callable 試験追加

## 9. 受け入れ条件
- `already_running_different_date` 強警告時に、権限端末でのみ時間制限付き解除ができる。
- 解除期限まで強警告が再表示されない。
- 解除期限後、未解消なら再評価で強警告が再表示される。
- 正常閉店後に `openAssessment` が即時再評価され、古い強警告状態を引きずらない。
- 開閉店管理ダイアログに「初期化」ボタンが存在しない。
- 開店ダイアログで開店対象日が表示され、パスワード認証後のみ日付調整できる。
