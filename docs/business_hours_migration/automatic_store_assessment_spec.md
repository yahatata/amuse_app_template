# 自動開閉店（補助）機能 仕様書

## 1. 全体構成（補助機能としてのフロー）

### 1.1 処理フロー概要

```
1. weeklyPlanner.ts (Cloud Scheduler)
   - 週1回（日曜20:00 JST）に起動
   - businessHoursMonthlyMapから翌週（月〜日）分の営業時間を取得
   - 各日の「閉店認定」「開店認定」タスクをCloud Tasksに投入
   
2. Cloud Tasks (タスクキュー)
   - 指定時刻（閉店時間+バッファ、開店時間-30分等）にタスクを実行
   - HTTP Functionsを呼び出す（OIDCトークン認証必須）
   
3. 認定処理（HTTP Functions）
   - 閉店認定: closeAssessmentTask
   - 開店認定: openAssessmentTask
   - 破壊的操作は一切行わず、認定結果のみをstate docに記録
   
4. UI（対象画面）
   - storeMeta/currentBusinessDayをsnapshot購読
   - 認定結果の更新を検知
   - 閉店時間超過時は画面全体をグレーアウト + モーダルダイアログを表示（画面操作を実質ブロック）
   - 手動操作（閉店処理/営業継続）を強制
   
5. 手動操作
   - 閉店処理: 既存のcloseStore Callableを呼び出し
   - 開店処理: 既存のopenStore Callableを呼び出し
   - 営業継続: manualOverrideをstate docに保存
```

### 1.2 事故防止の目的

- 閉店時間を過ぎているのに閉店処理を実施せず、翌営業日の業務を開始してしまう事故を防止
- 営業中に勝手に閉店処理が走る事故を防止（自動処理は破壊的操作を行わない）

---

## 2. State Doc（storeMeta/currentBusinessDay）のフィールド仕様

### 2.1 既存フィールド（確認済み）

```typescript
{
  status: 'closed' | 'running' | 'error',
  currentBusinessDateKey: 'YYYY-MM-DD' | null,
  lastClosedBusinessDateKey: 'YYYY-MM-DD' | null,
  updatedAt: Timestamp,
  source: 'manual' | 'cloud_task' | 'initial',
  lastError: {
    code: string,
    message: string,
    failedStep: string,
    at: Timestamp,
    context?: any
  } | null
}
```

### 2.2 新規追加フィールド

#### 2.2.1 認定結果格納用フィールド

```typescript
{
  // 閉店認定結果
  closeAssessment: {
    idempotencyKey: string,  // 冪等キー（必須）: `${action}_${intendedBusinessDateKey}_${scheduledAt}`
    intendedBusinessDateKey: 'YYYY-MM-DD',  // 対象営業日
    decidedAt: Timestamp,  // 認定実行時刻
    result: 'needs_manual_close' | 'needs_manual_close_suppressed' | 'already_closed' | 'next_day_started' | 'skipped',  // 認定結果（suppressed状態を追加）
    blockers: string[],  // ブロッカー（例: ['activeStaysNotEmpty', 'unsettledPossible']）
    source: 'task' | 'manual',  // 認定元
    taskName?: string,  // Cloud Tasksのタスク名（存在する場合）
    scheduledAt?: string,  // ISO 8601形式のスケジュール時刻（存在する場合）
    lastSuppressedAt?: Timestamp,  // 最後に抑制された時刻（manualOverride中の場合）
    suppressedByOverride?: boolean,  // manualOverrideにより抑制されたかどうか
  } | null,

  // 開店認定結果
  openAssessment: {
    idempotencyKey: string,  // 冪等キー（必須）: `${action}_${intendedBusinessDateKey}_${scheduledAt}`
    intendedBusinessDateKey: 'YYYY-MM-DD',  // 対象営業日
    decidedAt: Timestamp,  // 認定実行時刻
    result: 'ready_to_open' | 'needs_manual_open' | 'already_running' | 'skipped',  // 認定結果
    blockers: string[],  // ブロッカー（例: ['preconditionsNotMet']）
    source: 'task' | 'manual',  // 認定元
    taskName?: string,  // Cloud Tasksのタスク名（存在する場合）
    scheduledAt?: string,  // ISO 8601形式のスケジュール時刻（存在する場合）
    lastSuppressedAt?: Timestamp,  // 最後に抑制された時刻（manualOverride中の場合）
    suppressedByOverride?: boolean,  // manualOverrideにより抑制されたかどうか
  } | null,

  // 手動スキップ/営業継続時の記録
  manualOverride: {
    type: 'close_skip' | 'open_skip',  // スキップ種別
    intendedBusinessDateKey: 'YYYY-MM-DD',  // 対象営業日
    overrideUntil: Timestamp,  // 期限（この時刻まで警告を抑制）
    reason: string,  // 理由（任意）
    decidedByDeviceId: string,  // 決定したデバイスID
    decidedByUid: string,  // 決定したユーザーUID
    decidedAt: Timestamp,  // 決定時刻
    reminderAt?: Timestamp,  // リマインド時刻（任意、設定した場合のみ再認定タスクを投入）
  } | null
}
```

#### 2.2.2 UI警告のトリガーフィールド

**閉店時間超過警告のトリガー条件**:
- `closeAssessment.result === 'needs_manual_close'`（`needs_manual_close_suppressed`は除外）
- かつ `manualOverride === null` または `manualOverride.overrideUntil < 現在時刻`

**開店準備完了通知のトリガー条件**（将来実装）:
- `openAssessment.result === 'ready_to_open'`
- かつ `status === 'closed'`

### 2.3 初期化（createInitialStateDocCallable）

**新規フィールドの初期値**:
```typescript
{
  closeAssessment: null,
  openAssessment: null,
  manualOverride: null
}
```

**注意**: 実コード変更は禁止。仕様として明文化。

---

## 3. businessDateKeyの検証仕様（JST、日跨ぎ考慮）

### 3.1 基本方針

- `intendedBusinessDateKey`は`weeklyPlanner`が`businessHoursMonthlyMap`の定義に基づき決定
- サーバ側の許容範囲検証は「明らかなズレ（例：2日以上ズレ）」を弾くためのガード
- 「前営業日＝前日とは限らない」点に注意（営業時間が日を跨ぐ場合がある）

### 3.2 閉店認定時の許容範囲検証

**検証ルール**:
- `serverNowJst`の暦日を`D`とする
- `intendedBusinessDateKey`が`D`（当日）または`D-1`（前日）を指していれば「正常」と判定
- それ以外は「異常」として扱い、認定処理をスキップ（`result: 'skipped'`、`blockers: ['date_out_of_range']`）

**理由**: 閉店時間が日を跨ぐ場合（例：20:00-28:00）、前日の営業日が当日の早朝まで続く可能性があるため

### 3.3 開店認定時の許容範囲検証

**検証ルール**:
- `serverNowJst`の暦日を`D`とする
- `intendedBusinessDateKey`が`D`（当日）または`D+1`（翌日）を指していれば「正常」と判定
- それ以外は「異常」として扱い、認定処理をスキップ（`result: 'skipped'`、`blockers: ['date_out_of_range']`）

**理由**: 開店時間が早朝の場合（例：06:00）、前日の営業日が続いている可能性があるため

---

## 4. 閉店認定（Close Assessment）の詳細仕様

### 4.1 実行時刻

- 閉店時間 + バッファ（`TASK_CLOSE_OFFSET_MINUTES`、デフォルト: 120分（2時間））
- 例: 閉店時間が28:00（翌日04:00）の場合、28:00 + 120分 = 30:00（翌日06:00）に実行
- **注意**: バッファの推奨初期値（デフォルト）は120分（2時間）として仕様に固定。店舗ごとの設定拡張は将来でも可

### 4.2 入力（Cloud Tasks payload）

```typescript
{
  action: 'close_assessment',
  intendedBusinessDateKey: 'YYYY-MM-DD',  // weeklyPlannerが決定した営業日
  scheduledAt: string,  // ISO 8601形式のスケジュール時刻
  taskName: string  // Cloud Tasksのタスク名（例: 'close_assessment_YYYY-MM-DD'）
}
```

### 4.3 判定ロジック

1. **idempotencyKeyの生成**
   - `idempotencyKey = 'close_assessment_' + intendedBusinessDateKey + '_' + scheduledAt`

2. **冪等性チェック（トランザクション内）**
   - `storeMeta/currentBusinessDay`を読み取り
   - `closeAssessment.idempotencyKey === 生成したidempotencyKey`の場合:
     - no-op（処理をスキップ）

3. **businessDateKeyの許容範囲検証**（3.2参照）
   - 検証失敗時: `result: 'skipped'`, `blockers: ['date_out_of_range']`を設定して終了

4. **既に閉店済みか確認**
   - `status === 'closed'`かつ`lastClosedBusinessDateKey === intendedBusinessDateKey`の場合:
     - `result: 'already_closed'`を設定して終了

5. **次営業日が開始しているか確認**
   - `status === 'running'`かつ`currentBusinessDateKey !== intendedBusinessDateKey`の場合:
     - `result: 'next_day_started'`を設定して終了（既に次の営業日が開始している）

6. **manualOverrideの確認**
   - `manualOverride !== null`かつ`manualOverride.type === 'close_skip'`かつ`manualOverride.intendedBusinessDateKey === intendedBusinessDateKey`かつ`manualOverride.overrideUntil >= 現在時刻`の場合:
     - `result: 'needs_manual_close_suppressed'`を設定（抑制状態を記録）
     - `lastSuppressedAt: 現在時刻`を設定
     - `suppressedByOverride: true`を設定
     - 認定処理を継続（監査情報を更新）

7. **閉店時間超過の確認**
   - `status === 'running'`かつ`currentBusinessDateKey === intendedBusinessDateKey`の場合:
     - `manualOverride`が有効でない場合:
       - `result: 'needs_manual_close'`を設定
     - `blockers`を判定:
       - `activeStays`コレクションが空でない場合: `'activeStaysNotEmpty'`を追加
       - 未会計のbillが存在する可能性がある場合: `'unsettledPossible'`を追加（将来実装）

### 4.4 認定結果の更新

**更新方法**:
- トランザクション内で`storeMeta/currentBusinessDay`を更新
- `closeAssessment`フィールドを上記の判定結果で更新
- 冪等性保証: トランザクション内で`closeAssessment.idempotencyKey === 生成したidempotencyKey`の場合、no-op（処理をスキップ）

### 4.5 UI警告のトリガー条件

- `closeAssessment.result === 'needs_manual_close'`（`needs_manual_close_suppressed`は除外）
- かつ `manualOverride === null` または `manualOverride.overrideUntil < 現在時刻`

---

## 5. 開店認定（Open Assessment）の詳細仕様

### 5.1 実行時刻

- 開店時間の30分前（バッファやオフセットも含め定義）
- 例: 開店時間が12:00の場合、11:30に実行

### 5.2 入力（Cloud Tasks payload）

```typescript
{
  action: 'open_assessment',
  intendedBusinessDateKey: 'YYYY-MM-DD',  // weeklyPlannerが決定した営業日
  scheduledAt: string,  // ISO 8601形式のスケジュール時刻
  taskName: string  // Cloud Tasksのタスク名（例: 'open_assessment_YYYY-MM-DD'）
}
```

### 5.3 判定ロジック

1. **idempotencyKeyの生成**
   - `idempotencyKey = 'open_assessment_' + intendedBusinessDateKey + '_' + scheduledAt`

2. **冪等性チェック（トランザクション内）**
   - `storeMeta/currentBusinessDay`を読み取り
   - `openAssessment.idempotencyKey === 生成したidempotencyKey`の場合:
     - no-op（処理をスキップ）

3. **businessDateKeyの許容範囲検証**（3.3参照）
   - 検証失敗時: `result: 'skipped'`, `blockers: ['date_out_of_range']`を設定して終了

4. **既に営業中か確認**
   - `status === 'running'`かつ`currentBusinessDateKey === intendedBusinessDateKey`の場合:
     - `result: 'already_running'`を設定して終了

5. **営業中に別日付の開店が走ることを防止**
   - `status === 'running'`かつ`currentBusinessDateKey !== intendedBusinessDateKey`の場合:
     - `result: 'skipped'`, `blockers: ['already_running_different_date']`を設定して終了（絶対禁止）

6. **開店条件の確認（F. storeMetaのみで判定）**
   - `status === 'closed'`または`status === 'error'`の場合:
     - 前回の閉店処理が正常に完了しているか確認（**storeMeta/currentBusinessDayのフィールドのみで判定**）:
       - `status === 'closed'`（閉店状態であること）
       - `lastClosedBusinessDateKey`が存在する（前回の閉店処理が完了していること）
       - `lastError === null`（直近の閉店処理でエラーが発生していないこと）
       - `lastClosedBusinessDateKey`と`intendedBusinessDateKey`の整合:
         - `lastClosedBusinessDateKey`が`intendedBusinessDateKey`の「前営業日」であることを確認
         - **注意**: 「前営業日＝前日とは限らない」点に注意し、`weeklyPlanner`が決定した`intendedBusinessDateKey`を正として整合条件を定義
         - 整合判定は、`businessHoursMonthlyMap`を参照して「前営業日」を計算する（実装時は`calcBusinessDate`の逆算ロジックを使用）
     - すべての条件を満たす場合: `result: 'ready_to_open'`を設定
     - 条件を満たさない場合: `result: 'needs_manual_open'`, `blockers`に不足条件を追加
   - **ドキュメント走査をしない理由**: コスト削減のため。`activeStays`/`tables`/`sideGame`などの具体ドキュメント全件確認は行わない。`storeMeta/currentBusinessDay`のフィールドのみで「前営業日の閉店処理が適切に終了したか」を判定する。

7. **manualOverrideの確認**
   - `manualOverride !== null`かつ`manualOverride.type === 'open_skip'`かつ`manualOverride.intendedBusinessDateKey === intendedBusinessDateKey`かつ`manualOverride.overrideUntil >= 現在時刻`の場合:
     - `result: 'needs_manual_open'`を維持しつつ、`lastSuppressedAt: 現在時刻`を設定
     - `suppressedByOverride: true`を設定
     - 認定処理を継続（監査情報を更新）

### 5.4 認定結果の更新

**更新方法**:
- トランザクション内で`storeMeta/currentBusinessDay`を更新
- `openAssessment`フィールドを上記の判定結果で更新
- 冪等性保証: トランザクション内で`openAssessment.idempotencyKey === 生成したidempotencyKey`の場合、no-op（処理をスキップ）

### 5.5 自動開店処理（例外）

**原則**: 自動処理は破壊的操作を行わない

**例外**: プロジェクト要件として「条件が揃えば自動で開店処理を実行」も残す場合:
- 安全条件（すべて満たす必要がある）:
  - `status === 'closed'`
  - `intendedBusinessDateKey`がJST当日（許容範囲検証に合格）
  - `openAssessment.result === 'ready_to_open'`
  - `blockers`が空
- 上記条件を満たす場合のみ、`executeOpenStore(intendedBusinessDateKey)`を呼び出し（破壊的操作として例外的に許容）
- 実装時は、この例外処理を有効化するかどうかを設定で切り替え可能にする（デフォルト: 無効）

**注意**: 本仕様では原則「自動は認定のみ」を基本とする。自動開店を実装する場合は、上記の安全条件を必ず満たすこと。

---

## 6. UI強警告（重要：この仕様書のコア）

### 6.1 対象画面

以下の画面で`storeMeta/currentBusinessDay`をsnapshot購読し、認定結果の更新を検知:

1. **`lib/Home/terminalHomePage.dart`**（クラス名: `terminalHomePage`）
   - 現状: `storeMeta/currentBusinessDay`の購読なし（追加必要）

2. **`lib/tournament/active/pages/tournament_home_page.dart`**（クラス名: `TournamentHomePage`）
   - 現状: `storeMeta/currentBusinessDay`の購読なし（追加必要）

3. **`lib/tournament/active/pages/table_detail_page.dart`**（クラス名: `TableDetailPage`）
   - 現状: `storeMeta/currentBusinessDay`の購読なし（追加必要）

4. **`lib/OrderView/OrderManagement/order_management_page.dart`**（クラス名: `OrderManagementPage`）
   - 現状: `storeMeta/currentBusinessDay`の購読なし（追加必要）

5. **`lib/sideGame/pages/side_game_table_list.dart`**（クラス名: `SideGameTableListPage`）
   - 現状: `storeMeta/currentBusinessDay`の購読なし（追加必要）

**注意**: コスト観点でsnapshot購読画面を上記に限定する（他画面は購読しない）

### 6.2 デバイス権限判定

**判定方法**:
- `DeviceService.isAdmin()`を使用（`lib/services/device_service.dart`の331-340行目）
- 内部実装: `devices`コレクションから現在のデバイスを取得し、`role === 'admin'`を確認
- Functions側: `getCallerDeviceByUid(uid)`を使用（`functions/src/lib/devicePermissions.ts`）

**各画面での取得方法**:
- 各画面で`DeviceService`のインスタンスを作成し、`isAdmin()`を呼び出す
- 例: `terminalHomePage.dart`では既に`DeviceService`を使用している（36行目）

### 6.3 警告UIの実装仕様（A. 画面操作の実質ブロック）

#### 6.3.1 トリガー条件の検知

**閉店時間超過警告**:
- `storeMeta/currentBusinessDay`をsnapshot購読
- `closeAssessment.result === 'needs_manual_close'`を検知（`needs_manual_close_suppressed`は除外）
- かつ `manualOverride === null` または `manualOverride.overrideUntil < 現在時刻`

#### 6.3.2 画面全体のグレーアウトと操作ブロック

- 警告が発火した場合、画面全体を半透明のグレーオーバーレイで覆う
- オーバーレイの色: `Colors.black.withOpacity(0.7)`
- オーバーレイの下のコンテンツは操作不可（`IgnorePointer`で無効化）
- **重要**: これは「警告」ではなく「画面操作の実質ブロック」である。ユーザーは「閉店処理へ」または「営業継続」のどちらかを選択するまで、画面操作ができない状態になる。

#### 6.3.3 モーダルダイアログ（意思決定強制）

**ダイアログの表示**:
- グレーオーバーレイの上にモーダルダイアログを表示
- ダイアログは`WillPopScope`で`onWillPop: () async => false`を設定し、バックボタンで閉じられないようにする
- **重要**: ダイアログは「意思決定強制」であり、ユーザーが「閉店処理へ」または「営業継続」のどちらかを選択するまで、画面に戻れない状態にする。

**ダイアログの文言（デバイス権限別）**:

**管理権限ありの場合**:
```
閉店時間を超過しています

閉店しているなら閉店処理を行って下さい。
まだMM/DDの営業中であれば閉店予定時刻を入力し、営業継続ボタンを押下して下さい。
```

**管理権限なしの場合**:
```
閉店時間を超過しています

閉店作業を行うか、営業を継続するか管理権限を持ったデバイスで操作を行って下さい。
```

#### 6.3.4 管理権限ありの場合のUI要素

**「閉店処理へ」ボタン**:
- ボタンラベル: 「閉店処理へ」
- 押下時の動作:
  - 既存の`closeStore` Callableを呼び出す画面/ダイアログに遷移
  - または、閉店処理を実行するダイアログを表示
  - ダイアログを閉じる（グレーオーバーレイも解除）

**「営業継続」ボタン**:
- ボタンラベル: 「営業継続」
- 押下時の動作:
  - 時刻選択ダイアログを表示
  - ユーザーが「次の閉店予定時刻」を選択
  - オプションで「リマインド時刻」を選択（任意）
  - 「確定」ボタンを押下:
     - `manualOverride`を`storeMeta/currentBusinessDay`に保存:
       ```typescript
       {
         type: 'close_skip',
         intendedBusinessDateKey: closeAssessment.intendedBusinessDateKey,
         overrideUntil: Timestamp.fromDate(選択した閉店予定時刻),
         reason: '営業継続',
         decidedByDeviceId: device.id,
         decidedByUid: FirebaseAuth.instance.currentUser?.uid,
         decidedAt: Timestamp.now(),
         reminderAt: リマインド時刻が設定された場合のみ
       }
       ```
     - `reminderAt`が設定された場合、Cloud Tasksに「再認定タスク（closeAssessment）」を追加投入する仕様（実装方法は後述）
  - ダイアログを閉じる（グレーオーバーレイも解除）

**「営業継続」時の警告抑制**:
- `manualOverride.overrideUntil`が現在時刻より前になるまで、警告を表示しない
- `overrideUntil`を過ぎたら再度警告が出る（再認定タスク or UI側の時計チェックのどちらかを仕様で固定）
- **推奨**: UI側で`overrideUntil`を定期的にチェック（例: 1分ごと）し、期限切れを検知したら再度警告を表示

#### 6.3.5 リマインド再投入の仕様

**`reminderAt`が設定された場合**:
- Cloud Tasksに「再認定タスク（closeAssessment）」を追加投入
- タスク名: `close_assessment_reminder_{intendedBusinessDateKey}_{reminderAtのタイムスタンプ}`
- `scheduleTime`: `reminderAt`
- payload: 元の`closeAssessment`と同じ`intendedBusinessDateKey`を使用

**注意**: 実装時は、Cloud Tasksの30日制限を考慮する（`reminderAt`が30日以内であることを確認）

---

## 7. 冪等性・重複実行耐性

### 7.1 Cloud Tasksの重複配送/再試行への対応

**前提**:
- Cloud Tasksは重複配送/再試行があり得る前提で設計する

**冪等性保証（D. idempotencyKeyを明確化）**:
- 認定処理は「`idempotencyKey`」で冪等になるよう実装
- `idempotencyKey`の生成規則: `${action}_${intendedBusinessDateKey}_${scheduledAt}`
  - 例: `close_assessment_2024-01-15_2024-01-16T06:00:00+09:00`
- トランザクション内で`storeMeta/currentBusinessDay`を読み取り、既に同じ`idempotencyKey`で更新済みの場合はスキップ（no-op）

### 7.2 manualOverrideの優先順位（C. 監査情報を更新）

**優先順位**:
1. `manualOverride`が存在し、`overrideUntil >= 現在時刻`の場合:
   - 警告を表示しない（ただし、`overrideUntil`を過ぎたら再度警告を表示）
   - 認定処理は実行するが、`result`を`needs_manual_close_suppressed`または`needs_manual_open`（suppressed状態）に更新
   - `lastSuppressedAt: 現在時刻`を設定
   - `suppressedByOverride: true`を設定
   - これにより、「override中に認定が走った」ことが後から追跡可能になる

2. `manualOverride`が存在しない、または`overrideUntil < 現在時刻`の場合:
   - 通常通り警告を表示
   - 認定処理を実行

---

## 8. エラー処理・ログ・将来の通知

### 8.1 認定処理のエラー処理

**エラー発生時**:
- `storeMeta/currentBusinessDay/lastError`にエラー情報を記録:
  ```typescript
  {
    code: string,  // エラーコード
    message: string,  // エラーメッセージ
    failedStep: string,  // 失敗したステップ名（例: 'close_assessment:updateStateDoc'）
    at: Timestamp,  // 失敗時刻
    context: {
      intendedBusinessDateKey: string,
      action: 'close_assessment' | 'open_assessment',
      taskName?: string,
      idempotencyKey?: string
    }
  }
  ```
- `storeMeta/currentBusinessDay/logs`サブコレクションにログを記録（best-effort）

### 8.2 エラー通知（将来実装）

**仕様上の指示**:
- エラー発生時は、メール/LINE等で管理者に通知する機能を今後実装予定
- 実コード側には（将来追加する想定で）コメントアウトを入れる指示を仕様に書く
- 例:
  ```typescript
  // TODO: エラー通知機能（メール/LINE等）を実装予定
  // await notifyAdmin(error);
  ```

---

## 9. Cloud Tasks → HTTP認証/IAM仕様（E. 認証/IAMを明記）

### 9.1 認証方式

**基本方針**:
- `closeAssessmentTask`/`openAssessmentTask`はCloud Tasksから呼ばれるHTTP Functions
- 呼び出しはOIDCトークンを必須とする
- `allUsers`公開はしない方針で仕様を固定する

### 9.2 Cloud Tasks側の設定

**OIDCトークンの付与**:
- Cloud Tasksのタスク作成時に、`oidcToken`を設定:
  ```typescript
  {
    httpRequest: {
      // ...
      oidcToken: {
        serviceAccountEmail: TASKS_INVOKER_SA,  // 環境変数から取得
      },
    },
    // ...
  }
  ```
- `TASKS_INVOKER_SA`: サービスアカウントのメールアドレス（例: `tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com`）

### 9.3 HTTP Functions側の設定

**IAM権限の付与**:
- Cloud Run（HTTP Functions）側で、`roles/run.invoker`を`TASKS_INVOKER_SA`に付与
- これにより、`TASKS_INVOKER_SA`のみがHTTP Functionsを呼び出せるようになる

**認証ヘッダーの検証**:
- HTTP Functions側で、`Authorization: Bearer <token>`ヘッダーが存在することを確認
- OIDCトークンの検証は、Cloud Runの標準機能を使用（実装時はFirebase Functionsの`onRequest`の認証設定を確認）

### 9.4 運用注意事項

**401/unauthorizedを避けるための運用注意**:
- `TASKS_INVOKER_SA`のサービスアカウントが正しく設定されていることを確認
- IAM権限（`roles/run.invoker`）が正しく付与されていることを確認
- Cloud Tasksのタスク作成時に、`oidcToken.serviceAccountEmail`が正しく設定されていることを確認
- 過去の事象（`UNAUTHENTICATED`エラー）を踏まえ、デプロイ時に認証設定を必ず確認すること

---

## 10. 既存実装参照・確認事項

### 10.1 関連ファイル一覧（確認済み）

**Functions側**:
- `functions/src/storeManagement/openStore.ts`: 手動開店関数（既存、`onCall`）
- `functions/src/storeManagement/closeStore.ts`: 手動閉店関数（既存、`onCall`）
- `functions/src/storeManagement/createInitialStateDocCallable.ts`: 初期化関数（既存、`onCall`）
- `functions/src/lib/devicePermissions.ts`: デバイス権限判定（既存）
  - `getCallerDeviceByUid(uid)`: UIDからデバイス情報を取得
  - `isActive(status)`: デバイスがアクティブか確認

**Dart側（UI）**:
- `lib/Home/terminalHomePage.dart`: ターミナルホーム画面（クラス名: `terminalHomePage`）
- `lib/tournament/active/pages/tournament_home_page.dart`: トーナメントホーム画面（クラス名: `TournamentHomePage`）
- `lib/tournament/active/pages/table_detail_page.dart`: 卓詳細画面（クラス名: `TableDetailPage`）
- `lib/OrderView/OrderManagement/order_management_page.dart`: 注文管理画面（クラス名: `OrderManagementPage`）
- `lib/sideGame/pages/side_game_table_list.dart`: サイドゲームテーブル一覧画面（クラス名: `SideGameTableListPage`）
- `lib/services/device_service.dart`: デバイスサービス（`isAdmin()`メソッドあり）

**既存のsnapshot購読実装**:
- `lib/Accounting/accountingPage.dart`: `storeMeta/currentBusinessDay`をsnapshot購読（2027-2031行目）
- `lib/user_actions/order_history_popup.dart`: `storeMeta/currentBusinessDay`をsnapshot購読（80-83行目）
- `lib/user_actions/tournament_history_popup.dart`: `storeMeta/currentBusinessDay`をsnapshot購読（80-83行目）
- `lib/tournament/pages/tournament_select_page.dart`: `storeMeta/currentBusinessDay`をsnapshot購読（92-96行目）

### 10.2 現状のstate docフィールド一覧（確認済み）

```typescript
{
  status: 'closed' | 'running' | 'error',
  currentBusinessDateKey: 'YYYY-MM-DD' | null,
  lastClosedBusinessDateKey: 'YYYY-MM-DD' | null,
  updatedAt: Timestamp,
  source: 'manual' | 'cloud_task' | 'initial',
  lastError: {
    code: string,
    message: string,
    failedStep: string,
    at: Timestamp,
    context?: any
  } | null
}
```

### 10.3 デバイス権限判定の実装箇所（確認済み）

**Functions側**:
- `functions/src/lib/devicePermissions.ts`:
  - `getCallerDeviceByUid(uid)`: UIDからデバイス情報を取得
  - `isActive(status)`: デバイスがアクティブか確認
  - `hasRequiredOption(options, requiredKey)`: オプションの有無を確認

**Dart側**:
- `lib/services/device_service.dart`:
  - `isAdmin()`: デバイスが管理者かチェック（331-340行目）
  - 内部実装: `devices`コレクションから現在のデバイスを取得し、`role === 'admin'`を確認

### 10.4 手動open/closeの入口（廃止済み — 履歴）

**2026-09-03 Batch 9 batch 3 にて `openStore` / `closeStore` を削除・undeploy 済み。** 正式経路は `openStoreTerminal` / `closeStoreTerminal`（§10 参照）。

<details>
<summary>旧記載（参照用）</summary>

**手動開店（廃止）**:
- `functions/src/storeManagement/openStore.ts`: `onCall`関数
- 呼び出し方法: `FirebaseFunctions.instanceFor(region: 'us-central1').httpsCallable('openStore')`

**手動閉店（廃止）**:
- `functions/src/storeManagement/closeStore.ts`: `onCall`関数
- 呼び出し方法: `FirebaseFunctions.instanceFor(region: 'us-central1').httpsCallable('closeStore')`

</details>

---

## 11. まとめ

本仕様書では、自動開閉店を「補助機能」として実装するための詳細仕様を定義しました:

1. **自動処理は破壊的操作を行わない**: 認定のみを実行し、結果をstate docに記録
2. **UI強警告（画面操作の実質ブロック）**: 閉店時間超過時は画面全体をグレーアウトし、モーダルダイアログで手動操作を強制（意思決定強制）
3. **営業継続操作**: 手動で営業継続を選択可能（`manualOverride`で期限とリマインドを設定）
4. **冪等性保証**: `idempotencyKey`を使用して重複実行に耐える設計
5. **businessDateKeyの検証**: Cloud Tasks payloadの`intendedBusinessDateKey`を基本採用し、許容範囲検証を実施
6. **認証/IAM**: Cloud Tasks → HTTP Functionsの認証をOIDCトークンで実施し、サービスアカウントのIAM設定を明記
7. **コスト削減**: openAssessmentの前回閉店完了チェックは`storeMeta/currentBusinessDay`のフィールドのみで判定（ドキュメント走査をしない）

これらの仕様により、閉店忘れ/日付ズレによる事故を防止し、安全に営業を継続できる設計を実現します。
