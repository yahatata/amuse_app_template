# storeMeta/currentBusinessDay 設計と 自動開閉店（Scheduler/Tasks）設計

## 概要

本ドキュメントでは、単一状態ドキュメント（`storeMeta/currentBusinessDay`）の設計と、週次Planner + Cloud Tasksによる自動開閉店機能の設計を説明します。

**注意**: 自動開閉店機能の詳細仕様は、[自動開閉店（補助）機能 仕様書](./automatic_store_assessment_spec.md)を参照してください。本ドキュメントは、state docの設計と基本的な自動化の概念を説明するものです。

## 用語統一

- 本ドキュメントでは`businessDateKey`（`YYYY-MM-DD`形式）を正として使用
- Firestoreフィールド名が`businessDate`の場合は「フィールド名」として括弧書きで説明する

---

## 1. storeMeta/currentBusinessDay 設計

### ドキュメント構造

**コレクション**: `storeMeta`  
**ドキュメントID**: `currentBusinessDay`

#### 必須フィールド

```typescript
{
  status: 'closed' | 'running' | 'error',
  currentBusinessDateKey: 'YYYY-MM-DD' | null,
  lastClosedBusinessDateKey: 'YYYY-MM-DD' | null,
  updatedAt: Timestamp,
  source: string, // 更新元の識別子（例: 'manual', 'scheduler', 'cloud_task'）
  lastError: {
    code: string,        // エラーコード
    message: string,     // エラーメッセージ
    failedStep: string,  // 失敗したステップ名（例: 'open:setStateDoc', 'close:cleanupActiveStays'）
    at: Timestamp,       // 失敗時刻
    context?: any        // 任意のコンテキスト情報（例: { businessDateKey: '2024-01-15' }）
  } | null // 直近のエラー要約
}
```

#### フィールド詳細

- **status**: 営業状態
  - `closed`: 閉店中（`currentBusinessDateKey`は`null`または`lastClosedBusinessDateKey`）
  - `running`: 営業中（`currentBusinessDateKey`は必須）
  - `error`: エラー状態（開店/閉店処理が失敗した場合）

- **currentBusinessDateKey**: 現在進行中の営業日（`YYYY-MM-DD`形式）
  - `status`が`running`の場合は必須
  - `status`が`closed`または`error`の場合は`null`になる可能性がある

- **lastClosedBusinessDateKey**: 最後に閉店した営業日（`YYYY-MM-DD`形式）
  - 閉店時に更新される
  - 次回開店時の参考情報として使用

- **updatedAt**: 最終更新時刻（Timestamp）
  - 状態変更時に自動更新

- **source**: 更新元の識別子
  - `'manual'`: 手動更新（管理者による手動開店/閉店）
  - `'scheduler'`: 週次Plannerによる更新
  - `'cloud_task'`: Cloud Tasksによる更新

- **lastError**: 直近のエラー要約（`{ code: string, message: string, failedStep: string, at: Timestamp, context?: any } | null`）
  - エラー発生時に構造化された情報を記録
  - `code`: エラーコード
  - `message`: エラーメッセージ
  - `failedStep`: 失敗したステップ名（例: `'open:setStateDoc'`, `'close:cleanupActiveStays'`）
  - `at`: 失敗時刻（Timestamp）
  - `context`: 任意のコンテキスト情報（例: `{ businessDateKey: '2024-01-15' }`）
  - 復旧時の参考情報として使用
  - `logs`サブコレクションは詳細履歴、`lastError`は直近の要約として役割分担

---

## 2. 状態遷移

### 正常な状態遷移

```
closed → running (開店時)
  - currentBusinessDateKey: null → 'YYYY-MM-DD' (サーバ基準のJST日付キー or 管理者が選択した日付キー)
  - status: 'closed' → 'running'
  - source: 'manual' | 'cloud_task'
  - 注意: calcBusinessDateは使わない（予定/任意日時のみ使用）

running → closed (閉店時)
  - lastClosedBusinessDateKey: 旧値 → currentBusinessDateKey
  - currentBusinessDateKey: 'YYYY-MM-DD' → null
  - status: 'running' → 'closed'
  - source: 'manual' | 'cloud_task'
```

### エラー時の状態遷移

```
running → error (開店処理失敗時)
  - status: 'running' → 'error'
  - currentBusinessDateKey: 変更なし（またはnull）
  - lastError: エラーメッセージを記録
  - source: 更新元の識別子

closed → error (閉店処理失敗時)
  - status: 'closed' → 'error'
  - currentBusinessDateKey: 変更なし（nullのまま）
  - lastError: エラーメッセージを記録
  - source: 更新元の識別子

error → closed | running (手動復旧時)
  - status: 'error' → 'closed' | 'running'
  - lastError: nullにクリア
  - source: 'manual'
```

---

## 3. 手動open/close（現段階は state 更新のみ、後でターミナル処理統合）

### 手動開店

**関数**: `openStore()`（予定）

1. `currentBusinessDateKey`を決定（以下のいずれか）:
   - **サーバ基準のJST日付キー（YYYY-MM-DD）**を採用（最も一般的）
   - 管理者がダイアログで営業日キー（YYYY-MM-DD）を選択して開店する（保険が強い）
   - **注意**: `calcBusinessDate`は使わない（予定/任意日時のみ使用）
2. `storeMeta/currentBusinessDay`をトランザクションで更新:
   - `status`: `'closed'` → `'running'`
   - `currentBusinessDateKey`: 決定した営業日キー
   - `source`: `'manual'`
   - `updatedAt`: 現在時刻
3. エラー時は`status`を`'error'`に設定し、`lastError`にエラーメッセージを記録
4. `storeMeta/currentBusinessDay/logs`にログを記録

### 手動閉店

**関数**: `closeStore()`（予定）

1. 現在の`currentBusinessDateKey`を取得
2. `storeMeta/currentBusinessDay`をトランザクションで更新:
   - `status`: `'running'` → `'closed'`
   - `lastClosedBusinessDateKey`: `currentBusinessDateKey`
   - `currentBusinessDateKey`: `null`
   - `source`: `'manual'`
   - `updatedAt`: 現在時刻
3. エラー時は`status`を`'error'`に設定し、`lastError`にエラーメッセージを記録
4. `storeMeta/currentBusinessDay/logs`にログを記録

### 注意事項

- 現段階では、手動開店/閉店は`state doc`の更新のみを行う
- 将来的に、ターミナル処理（例: レジスターの開閉、照明の制御など）を統合する予定

---

## 4. Tasks冪等（task name固定、state docトランザクション前提）

### 冪等は二段構え

#### 作成時冪等（Task名固定）

- Task名は固定化し、二重作成を防ぐ
- 例: `open_2024-01-15`, `close_2024-01-15`
- 同じ`taskName`でTaskを作成する際、既に存在する場合は`AlreadyExists`エラーが発生するが、これは成功扱い（冪等性を保証）

#### 実行時冪等（state docトランザクション前提）

- `storeMeta/currentBusinessDay`の更新は必ずトランザクションで行う
- 複数のCloud Tasksが同時に実行された場合でも、トランザクションにより一貫性が保証される
- Cloud Tasksは再実行される可能性がある（ネットワークエラー、タイムアウトなど）
- 実行時冪等の実装:
  1. トランザクション内で`storeMeta/currentBusinessDay`を読み取り
  2. 既に目的状態（例: 開店済み、閉店済み）なら no-op（何もしない）
  3. 目的状態でない場合のみ更新を実行
  4. これにより、同じTaskが再実行されても安全（冪等性を保証）

---

## 5. 自動開閉店機能の概要

自動開閉店機能は、「補助機能」として実装されます。詳細仕様は[自動開閉店（補助）機能 仕様書](./automatic_store_assessment_spec.md)を参照してください。

### 基本方針

- **自動処理は破壊的操作を行わない**: 認定のみを実行し、結果をstate docに記録
- **UI強警告（画面操作の実質ブロック）**: 閉店時間超過時は画面全体をグレーアウトし、モーダルダイアログで手動操作を強制（意思決定強制）
- **週次Planner**: Cloud Schedulerは週1回（例：日曜20:00 JST）だけ起動し、翌週（月〜日）分の「閉店認定」「開店認定」タスクをCloud Tasksに投入
- **認定処理**: 閉店認定・開店認定のHTTP Functionsが、破壊的操作を行わず、認定結果のみをstate docに記録

### 主要な機能

1. **閉店認定（Close Assessment）**
   - 実行時刻: 閉店時間 + バッファ（デフォルト: 120分（2時間））
   - 判定ロジック: 閉店時間超過の確認、ブロッカーの検出
   - 結果: `needs_manual_close` / `needs_manual_close_suppressed` / `already_closed` / `next_day_started` / `skipped`

2. **開店認定（Open Assessment）**
   - 実行時刻: 開店時間の30分前
   - 判定ロジック: 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定、ドキュメント走査なし）
   - 結果: `ready_to_open` / `needs_manual_open` / `already_running` / `skipped`

3. **UI強警告**
   - 対象画面: `terminalHomePage`, `tournament_home_page`, `table_detail_page`, `order_management_page`, `side_game_table_list`
   - トリガー: `closeAssessment.result === 'needs_manual_close'`（`needs_manual_close_suppressed`は除外）
   - 実装: 画面全体をグレーアウト + モーダルダイアログ（意思決定強制）

4. **営業継続操作（manualOverride）**
   - 手動で営業継続を選択可能
   - `overrideUntil`で期限を設定
   - オプションで`reminderAt`を設定（再認定タスクを投入）

### 冪等性保証

- **idempotencyKey**: `${action}_${intendedBusinessDateKey}_${scheduledAt}`
- トランザクション内で`storeMeta/currentBusinessDay`を読み取り、既に同じ`idempotencyKey`で更新済みの場合はスキップ（no-op）

### 認証/IAM

- Cloud TasksからHTTP Functionsを呼び出す際、OIDCトークンを必須とする
- サービスアカウント（`TASKS_INVOKER_SA`）に`roles/run.invoker`を付与
- `allUsers`公開はしない方針

---

## 6. エラー時の挙動（status=error、logs追加、復旧導線）

### エラー発生時の処理

1. **status更新**: `status`を`'error'`に設定
2. **lastError記録**: `lastError`に構造化されたエラー情報を記録（`code`、`message`、`failedStep`、`at`、`context`）
3. **logs追加**: `storeMeta/currentBusinessDay/logs`サブコレクションに詳細ログを記録

### ログエントリの構造

```typescript
{
  type: 'open' | 'close' | 'close_assessment' | 'open_assessment',  // 処理種別
  businessDateKey: 'YYYY-MM-DD',       // 対象の営業日
  trigger: 'manual' | 'auto',          // 手動/自動
  failedStep: string,                  // 失敗したステップ名
  errorCode: string,                   // エラーコード
  errorMessage: string,                 // エラーメッセージ
  causeHint: string | null,            // 推定原因のヒント
  createdAt: Timestamp,                 // ログ作成時刻
  context: any | null                  // 任意のコンテキスト情報
}
```

### 復旧導線

- **手動復旧**: 管理者が手動で`status`を`'closed'`または`'running'`に変更
- **自動復旧**: 現段階では実装しない（将来的に実装する可能性あり）
- **エラー通知**: エラー発生時に管理者に通知（実装方法は別途検討）

### エラー状態の扱い

- `status`が`'error'`の場合、`currentBusinessDateKey`は`null`になる可能性がある
- UIは`error`状態を検知し、適切なエラーメッセージを表示する
- エラー復旧は手動で行う（現段階では自動復旧は実装しない）

---

## 7. 実装時の注意事項

### Firestore Rules

- `storeMeta/currentBusinessDay`は読み取り専用（UIはsnapshot購読のみ）
- 更新はFunctions経由のみ（手動更新は管理者のみ）

### セキュリティ

- Cloud TasksからHTTP Functionsを呼び出す場合、認証は必須（OIDCトークン）
- 公開URL（認証なし）での呼び出しは禁止
- サービスアカウント（`TASKS_INVOKER_SA`）に`roles/run.invoker`を付与

### パフォーマンス

- `storeMeta/currentBusinessDay`は単一ドキュメントのため、snapshot購読のコストは低い
- ただし、更新頻度が高い場合は、更新コストに注意する
- openAssessmentの前回閉店完了チェックは`storeMeta/currentBusinessDay`のフィールドのみで判定（ドキュメント走査をしない）

### テスト観点

- 25:00問題の再発防止確認
- `closed`時の動作確認
- 重複Tasks、再実行、手動/自動競合の確認
- エラー時の挙動確認
- 認定処理の冪等性確認
- UI強警告の動作確認

---

## 参照資料

- [Step0: 最終仕様](./step0_final_spec.md)
- [Step1: コレクション分析](./step1_collection_analysis.md)
- [Step2: 取得・表示ファイルの洗い出し](./step2_query_display_files.md)
- [Step4: 改修実装チェックリスト](./step4_migration_plan_checklist.md)
- [自動開閉店（補助）機能 仕様書](./automatic_store_assessment_spec.md)