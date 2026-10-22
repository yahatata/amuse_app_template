# Phase6 Step3 (Phase8): 閉店処理の一括操作の実装

## 重要: 実装開始前の確認

**本ステップを開始する前に、必ず以下の検討事項の方針を固めてください**:
- エラー発生時の処理戻し（どこまで処理を戻すか）
- 各具体処理の順番（データの整合性を保つための実行順序）
- ロック/lease機構の実装（`processing`フィールドの構造、leaseの有効期限）
- 進捗管理（progress）の実装（各ステップの状態管理方法、再実行時のresume機能）
- 未会計billsの処理（ステップ2の内容を含む）

**changeSpecの作成や実装の前に、これらの検討事項の方針を固めてからスタートしてください。**

## 概要

ステップ1で作成した日付ボタンをタップしたときに、現在開店中であれば閉店操作を、現在閉店中であれば開店操作を行えるようにします。また、閉店処理をターミナル関数経由で実行し、必要な閉店処理の具体関数を立ち上げます。

## 実装内容

### 1. 日付ボタンからの開閉店操作

**実装内容**:
- ステップ1で作成した日付ボタンに、タップ時の処理を追加
- **開店中**の場合: 閉店操作を実行
- **閉店中**の場合: 開店操作を実行

**実装場所**:
- `lib/utils/store_status_widget.dart`（ステップ1で作成）
- または、各ページで日付ボタンのタップ処理を実装

**処理フロー**:
1. 日付ボタンをタップ
2. 現在の営業状態を確認（`status === 'running'` or `'closed'`）
3. 開店中の場合: 閉店処理の確認画面を表示
4. 閉店中の場合: 開店処理の確認画面を表示

### 2. 閉店処理のターミナル関数経由実行

**実装内容**:
- 現在の`closeStore` Callableは`storeMeta`の更新のみ
- これをターミナル関数（`closeStoreTerminal`）経由で実行するように変更
- ターミナル関数内で、必要な閉店処理の具体関数を順次実行

**処理フロー**:
```
UI（日付ボタンタップ）
  ↓
closeStoreTerminal Callable呼び出し
  ↓
1. ロック獲得（processingフィールドでlease管理）
2. 前処理の確認
3. 各具体処理の実行（closeProgressで進捗管理）:
   - resetSideGames
   - resetTables
   - cleanupActiveStays
   - migrateMissedSettlements（未会計billsの処理を含む）
   - finalizeCloseStateDoc
4. state docの更新
5. エラーハンドリング・ログ記録
```

**エラー発生時の処理**:
- 各ステップでエラーが発生した場合、どこまで処理を戻すか検討が必要
- トランザクションで可能な範囲はロールバック
- 物理的な処理（リセットなど）は手動での復旧が必要な場合がある

**各具体処理の順番**:
- データの整合性を保つため、処理順序を慎重に設計
- 依存関係を考慮した順序で実行

### 3. 開店処理のターミナル関数経由実行

**実装内容**:
- 現在の`openStore` Callableは`storeMeta`の更新のみ
- これをターミナル関数（`openStoreTerminal`）経由で実行するように変更
- 今後の実装を踏まえて、ターミナル関数を経由して`storeMeta`を更新する関数を動かす仕様にする

**処理フロー**:
```
UI（日付ボタンタップ）
  ↓
openStoreTerminal Callable呼び出し
  ↓
1. ロック獲得（processingフィールドでlease管理）
2. 前処理の確認（前回の閉店処理が正常に完了しているか）
3. 各具体処理の実行（openProgressで進捗管理）:
   - verifyPreconditions
   - forceCleanup（必要に応じて）
   - finalizeOpenStateDoc
4. state docの更新
5. エラーハンドリング・ログ記録
```

**注意事項**:
- 開店処理では、現時点では`storeMeta`の更新のみで良い
- ただし、今後の実装を踏まえてターミナル関数経由の仕様にする

### 4. 既存の「開閉店管理」ボタンの統合

**実装内容**:
- `lib/Home/terminalHomePage.dart`の既存の「開閉店管理」ボタンを削除
- ステップ1で作成した日付ボタンに統合
- 日付ボタンをタップしたときに、開閉店操作を実行

### 5. storeMeta/closeRuns の導入と未会計bills索引（Step2 との整合）

Step3 では閉店実行ログと未会計billsの索引を残すため、以下を導入する。Step2 では手動で closeSnapshot を付与し lastCloseRunId に `'step2-manual'` を入れる。Step3 では実 closeRunId を発行し、bills.closeSnapshot.lastCloseRunId に確実に紐付ける。

#### 5.1 storeMeta/closeRuns のスキーマ

**パス**: `storeMeta/closeRuns/{closeRunId}`

**ドキュメント例**:
- `closeRunId`: ドキュメントID。閉店処理1回の実行を一意に識別する。生成方法は実装時に決定（例: UUID、または `closedBusinessDate_${timestamp}` 等）。
- `closedBusinessDate`: string（YYYY-MM-DD）。閉店認定した営業日キー。
- `startedAt`: Timestamp。閉店処理開始時刻。
- `completedAt`: Timestamp。閉店処理完了時刻（正常終了時）。
- `unsettledCount`: number。未会計のまま残った伝票の件数。
- `notes`: string（任意）。メモやトリガー種別など。
- `trigger`: string（任意）。例: `'terminal'`（ターミナル関数経由）、`'manual'` 等。実装時に決定。

#### 5.2 closeRunId の生成・保存・紐付け

- **生成**: 閉店処理（closeStoreTerminal または同等）の開始時点で closeRunId を1つ生成する。同一実行内では同じ closeRunId を全箇所で使用する。
- **保存**: `storeMeta/closeRuns/{closeRunId}` を作成し、closedBusinessDate / startedAt / unsettledCount 等を書き込む。completedAt は閉店処理の正常完了時に更新する。
- **bills への紐付け**: 未会計bills に closeSnapshot を付与する際、**bills.closeSnapshot.lastCloseRunId** に上記 closeRunId を**確実に**書き込む。lastCloseRunId は常に文字列で、空文字は禁止。Step2 では固定値 `'step2-manual'`、Step3 では実 closeRunId を入れる。

#### 5.3 storeMeta/closeRuns/{closeRunId}/unsettledBills のスキーマと作成タイミング

**パス**: `storeMeta/closeRuns/{closeRunId}/unsettledBills/{billId}`

**サブコレクションのドキュメント例**:
- `billId`: string（ドキュメントIDと一致させる想定）。
- `statusAtClose`: string。閉店時点の bills.status（'open' | 'in_progress' | 'settling'）。
- `userId`: string。表示用（party.userId）。
- `pokerName`: string。表示用（party.pokerName）。
- `table`: string | null。place.table。
- `seat`: number | null。place.seat。
- `createdAt`: Timestamp。bills.createdAt（表示用）。
- `businessDate`: string。bills の本来の businessDate（YYYY-MM-DD）。

**作成タイミング**: 閉店処理本線（closeStoreTerminal 内の「未会計billsの処理」ステップ）で、未会計bills を取得した直後に、上記 closeRunId に対し unsettledBills サブコレクションを1件ずつ作成する。あわせて各 bill に closeSnapshot（lastCloseRunId を含む）を付与する。順序は「closeRuns 親作成 → 未会計bills 取得 → bills に closeSnapshot 付与 ＋ unsettledBills にドキュメント作成」とする。

#### 5.4 Step2 の手動フラグ付与との整合

- **Step2 で付与した closeSnapshot**: Step2 では lastCloseRunId に固定文字列 **`'step2-manual'`** を付与している（空文字・未設定禁止のため、必ずこの値が入る）。Step3 実装時に以下を決める。
  - **扱い**: 既存の closeSnapshot のうち **lastCloseRunId が `'step2-manual'` のもの**は、「手動移管」としてそのまま残すか、後から closeRunId を埋め直す（バッチや管理機能）か。推奨は「そのまま残し、closeRuns には索引がない手動分として運用で区別する」。
  - **クエリ**: closeRuns 経由で未会計一覧を参照する場合は、Step2 で手動付与した分（lastCloseRunId === 'step2-manual'）は unsettledBills に存在しないため、bills を closeSnapshot.unresolved 等で別途検索する必要がある。実装時に検索要件を整理する。

## 検討事項（実装前に方針を固める必要がある項目）

### 1. エラー発生時の処理戻し
- 各ステップでエラーが発生した場合、どこまで処理を戻すか
- トランザクションで可能な範囲と、物理的な処理の復旧方法
- 部分的な成功時の扱い

### 2. 各具体処理の順番
- データの整合性を保つための処理順序
- 依存関係を考慮した実行順序
- 並列実行可能な処理の特定

### 3. ロック/lease機構の実装
- `processing`フィールドの構造
- leaseの有効期限の設定
- lease切れ時の自動解放処理

### 4. 進捗管理（progress）の実装
- `closeProgress`と`openProgress`の構造
- 各ステップの状態管理方法
- 再実行時のresume機能

### 5. 未会計billsの処理（ステップ2の内容を含む）
- 未会計billsの抽出方法（Step2 change_spec: businessDate == 当日営業日、status in ['open','in_progress','settling']）
- 未精算の請求書としての保存方法（bills に closeSnapshot を追加。Step2 change_spec および本節「5. storeMeta/closeRuns の導入」を参照）
- ユーザー判断を挟むタイミング（Step2 は手動UI、Step3 は閉店本線に組み込み）

## 作成・更新するファイル

### 新規作成（検討後）
1. `functions/src/storeManagement/closeStoreTerminal.ts`（ターミナル関数）
2. `functions/src/storeManagement/openStoreTerminal.ts`（ターミナル関数）
3. 各具体処理の関数（必要に応じて）

### 更新（検討後）
1. `lib/utils/store_status_widget.dart`（日付ボタンのタップ処理を追加）
2. `lib/Home/terminalHomePage.dart`（既存の「開閉店管理」ボタンを削除）
3. `functions/src/storeManagement/closeStore.ts`（既存関数の更新または削除）
4. `functions/src/storeManagement/openStore.ts`（既存関数の更新または削除）

## 注意事項

- エラー発生時の処理戻しや各具体処理の順番に注意が必要
- ロック/lease機構と進捗管理の実装が必要
- ステップ2の検討事項も含めて、実装前に方針を固めること

## Step3 実装完了（記録）

- **実装完了日**: 本計画に基づき spec.md / change_spec.md に沿って実装を完了した。
- **詳細**: 変更ファイル一覧・実装内容・デプロイ対象・テスト観点は **implementation_changes.md** を参照。
- **主な成果物**: closeStoreTerminal / openStoreTerminal、processingLease、closeRuns/openRuns パス（storeMeta/closeRuns/runs/{runId} 等）、applyCloseSnapshot core 化、reset/cleanup/migrate の run* 共通化、terminalHomePage の開閉店ダイアログ（getUnsettledBillsForClose → 確認 → closeStoreTerminal）および **閉店完了ダイアログ**（§4.8 関数ごと表示）。開閉店ボタンからは pageContext を渡し未会計一覧ダイアログが確実に表示されるよう修正済み。

## 次のステップ

- ステップ4: storeMeta監視ページでの自動開閉店時の挙動・表示の実装
