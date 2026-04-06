# changeSpec: 開閉店警告・修正

## 0. 前提（確定方針）
- 本 changeSpec は `docs/開閉店警告・修正/ToBe仕様.md` の最新採用決定を実装仕様に落としたもの。
- 今回の追加確定事項:
  - 正常閉店後に `openAssessment` を即時再評価する。
  - 開閉店管理ダイアログの「初期化」ボタンを削除する。
  - 開店時に対象営業日を表示し、パスワード認証後のみ開店日付調整を可能にする。
  - 閉店時は対象営業日表示のみ行い、営業日調整は不可とする。

## 1. As-Is 確認結果

### 1.1 開店日付の決定（As-Is）
- `openStoreTerminal` は `businessDateKey` が未指定なら `generateJstDateKey()`（JST暦日）を採用。
- 現在の Terminal UI 呼び出しは `businessDateKey` を渡していないため、常に自動日付で開店。

### 1.2 閉店完了後の `openAssessment`（As-Is）
- 正常閉店時は `openAssessment` を基本維持し、`already_running_different_date` blocker がある時だけ部分更新。
- 「閉店完了直後に openAssessment を即時再評価する」処理はない。

### 1.3 開閉店管理ダイアログ（As-Is）
- `terminalHomePage` の開閉店管理ダイアログに「初期化」ボタンが存在する。
- 開店対象日の表示・調整UIはない。
- 閉店対象営業日の明示表示は限定的。

### 1.4 パスワード検証（As-Is）
- `business-secrets` は既存で使用中（例: `unclockedAttendanceEditPassword`）。
- 開店日付調整用パスワードは未定義。

## 2. To-Be 仕様差分（要約）

### 2.1 閉店後の状態遷移
- 正常閉店完了時、`openAssessment` をクリアしない。
- 同時に open 再評価 task を即時 enqueue し、再評価結果で `openAssessment` を上書きする。

### 2.2 開閉店ダイアログ
- 「初期化」ボタンを削除。
- 開店時:
  - デフォルト開店対象日を表示。
  - 「開店日付調整」ボタンを表示。
  - パスワード認証成功後のみ日付変更可能。
- 閉店時:
  - 「閉店対象営業日（currentBusinessDateKey）」を表示。
  - 調整ボタンは出さない。

### 2.3 Secret Manager
- `business-secrets` に新キーを追加:
  - `openBusinessDateAdjustmentPassword`
- 初期値:
  - `s2b`

## 3. To-Be 変更仕様（Functions）

### 3.1 データモデル・override
- `manualOverride` から `manualOverrides.close/open` へ移行（fallback 維持）。

### 3.2 `closeStoreTerminal` 改修（重要）
- 正常閉店時:
  - `manualOverrides.close/open` をクリア。
  - `status='closed'` 更新後に open 再評価 task を即時 enqueue。
- 再評価対象日の決定順:
  1. 既存 `openAssessment.intendedBusinessDateKey`（有効時）
  2. サーバーJST暦日（既存開店デフォルト準拠）

### 3.3 `openAssessmentTask` 改修
- `running && current!=intended` 分岐でも open override 判定を行う。
- 再評価専用 action を受け付け、`date_out_of_range` 誤スキップを防止。
- 閉店直後再評価で `already_running_different_date` 残留を解消可能にする。

### 3.4 `openStoreTerminal` 改修
- 既存仕様どおり `businessDateKey` 指定可。
- UIから指定された `businessDateKey` をそのまま採用（形式バリデーションは現行維持）。
- 正常開店時に `manualOverrides.close/open` をクリア。

### 3.5 Secret 読み取り拡張
- `functions/src/shared/secrets/types.ts` に `openBusinessDateAdjustmentPassword` を追加。
- `functions/src/shared/secrets/secretManager.ts` の `loadBusinessSecrets()` で required key として読み取り。

### 3.6 新 Callable
- `verifyOpenBusinessDateAdjustmentPassword`（新規）
  - 認証必須
  - 入力 `password` 必須
  - `business-secrets.openBusinessDateAdjustmentPassword` と照合
  - 一致時 `{ success: true }` を返す

### 3.7 既存 Callable
- `continueBusinessTerminal`, `temporaryUnlockAlreadyRunningDifferentDateTerminal`, `closeAssessmentTask` は既存ToBeどおり進める。

## 4. To-Be 変更仕様（Flutter/UI）

### 4.1 `terminalHomePage`（開閉店管理ダイアログ）
- 「初期化」ボタンを削除。
- 開店状態表示:
  - `plannedOpenBusinessDateKey` を表示（初期値は JST暦日）。
  - 「開店日付調整」押下でパスワード入力ダイアログ表示。
  - パスワード確認は調整開始のたびに毎回実施（認証セッション保持なし）。
  - 認証成功後、日付選択UIで `plannedOpenBusinessDateKey` を変更可能。
- 開店実行:
  - `openStoreTerminal` に `businessDateKey=plannedOpenBusinessDateKey` を送信。
- 閉店状態表示:
  - `currentBusinessDateKey` を明示表示。
  - 調整UIは表示しない。

### 4.2 画面ロック系
- 非管理端末は「管理者に確認してください」表示のみ（既存方針維持）。
- 強警告ボタン文言分岐（既存ToBe）を維持。

## 5. 監査ログ仕様（To-Be）
- 既存ToBeを維持。
- 追加観点:
  - 正常閉店後に enqueue した open 再評価の実行結果が `assessmentLogs` に残ることを確認する。

## 6. ファイル別変更一覧（実装チェックリスト）

### 6.1 Functions
- `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts`
  - [ ] 正常閉店後 open 即時再評価 enqueue
  - [ ] `manualOverrides.close/open` クリア
- `functions/src/domains/storeMeta/callables/openAssessmentTask.ts`
  - [ ] 再評価専用 action 対応
  - [ ] `running && current!=intended` でも override 判定
- `functions/src/domains/storeMeta/callables/openStoreTerminal.ts`
  - [ ] UI指定 `businessDateKey` を利用する前提のまま整合確認
  - [ ] `manualOverrides.close/open` クリア
- `functions/src/shared/secrets/types.ts`
  - [ ] `openBusinessDateAdjustmentPassword` 追加
- `functions/src/shared/secrets/secretManager.ts`
  - [ ] `business-secrets` から `openBusinessDateAdjustmentPassword` を required 読取
- `functions/src/domains/storeMeta/callables/verifyOpenBusinessDateAdjustmentPassword.ts`（新規）
  - [ ] パスワード照合 callable 実装
- `functions/src/domains/storeMeta/index.ts`
  - [ ] 新 callable export
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
  - [ ] 重複警告1回解除（既存ToBe）
- `functions/src/domains/storeMeta/callables/temporaryUnlockAlreadyRunningDifferentDateTerminal.ts`
  - [ ] 既存ToBeどおり

### 6.2 Flutter
- `lib/Home/terminalHomePage.dart`
  - [ ] 開閉店管理ダイアログから「初期化」ボタン削除
  - [ ] 開店対象日表示追加
  - [ ] 開店日付調整ボタン追加
  - [ ] パスワード入力・検証 callable 呼び出し追加
  - [ ] 調整日付を `openStoreTerminal.businessDateKey` に渡す
  - [ ] 閉店対象営業日表示追加（調整UIなし）
- `lib/utils/store_strong_warning_ui.dart`
  - [ ] 非管理端末文言の整合（必要時のみ）
- `lib/services/store_meta_service.dart`
  - [ ] `manualOverrides` 対応（既存ToBe）

### 6.3 Secret / 運用
- Secret Manager `business-secrets` にキー追加:
  - [ ] `openBusinessDateAdjustmentPassword: "s2b"`（初期値）
- 運用手順書:
  - [ ] 本番投入前に値変更する旨を明記

## 7. テスト仕様（必須追加）

### 7.1 Functions
- `closeStoreTerminal`
  - [ ] 正常閉店後に open 再評価 task が enqueue される
  - [ ] intendedBusinessDateKey 決定順（既存openAssessment→JST暦日）
- `openAssessmentTask`
  - [ ] 閉店直後再評価で `already_running_different_date` 残留が解消される
  - [ ] 再評価 action が `date_out_of_range` 誤判定を起こさない
- `verifyOpenBusinessDateAdjustmentPassword`
  - [ ] 正しいパスワードで success
  - [ ] 誤パスワードで permission-denied
  - [ ] 未認証で unauthenticated
- `secretManager`
  - [ ] `business-secrets` に新キー欠落時に fail-fast

### 7.2 Flutter（Widget/手動）
- [ ] 開閉店管理ダイアログに「初期化」が表示されない
- [ ] 開店対象営業日が表示される
- [ ] パスワード不一致で日付調整できない
- [ ] パスワード一致で日付調整できる
- [ ] 調整日付で `openStoreTerminal` 呼び出しが行われる
- [ ] 閉店ダイアログは対象営業日表示のみで調整UIが出ない

## 8. リリース順序
1. Functions（Secret型拡張・新Callable・再評価ロジック）
2. Secret投入（初期値 `s2b`、環境ごとに即変更）
3. Flutter（ダイアログUI・日付調整導線）

## 9. 完了判定（受け入れ条件）
- 正常閉店後、`openAssessment` が即時再評価される。
- 開閉店管理ダイアログに「初期化」ボタンが存在しない。
- 開店時に対象営業日が表示される。
- 開店日付調整はパスワード認証成功時のみ可能。
- 閉店時は対象営業日の明示表示のみで、営業日調整は不可。
- 既存強警告系ToBe（緊急一時解除・重複解除1回・監査ログ）が維持される。
