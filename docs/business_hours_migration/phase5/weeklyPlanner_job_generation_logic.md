# weeklyPlanner ジョブ生成ロジック詳細

## 概要

`weeklyPlanner`は、週1回（日曜20:00 JST）に起動し、翌週（月〜日）分の「閉店認定」「開店認定」タスクをCloud Tasksに投入する関数です。

---

## 1. 日付の取得方法

### 1.1 現在時刻の取得とJST変換

```typescript
const now = new Date();  // UTC時刻
const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9（JST）
```

**処理内容**:
- 現在時刻（UTC）を取得
- JST（UTC+9）に変換

### 1.2 翌週の月曜日を計算

```typescript
const nextWeekStart = new Date(jstNow);
nextWeekStart.setDate(nextWeekStart.getDate() + (1 - nextWeekStart.getDay()));  // 次の月曜日
nextWeekStart.setHours(0, 0, 0, 0);
```

**処理内容**:
- `nextWeekStart.getDay()`: 現在の曜日（0=日曜、1=月曜、...、6=土曜）
- `1 - nextWeekStart.getDay()`: 次の月曜日までの日数
  - 日曜（0）→ 1日後（月曜）
  - 月曜（1）→ 0日後（月曜）
  - 火曜（2）→ -1日後（月曜）→ 6日後（月曜）
  - ...
- `setHours(0, 0, 0, 0)`: 時刻を00:00:00にリセット

**例**:
- 2026-02-07（金）20:00 JST に実行 → 2026-02-09（日）00:00:00 JST が次の月曜日
- 2026-02-09（日）20:00 JST に実行 → 2026-02-10（月）00:00:00 JST が次の月曜日

### 1.3 各日の日付を生成（7日分）

```typescript
for (let day = 0; day < 7; day++) {
  const targetDate = new Date(nextWeekStart);
  targetDate.setDate(targetDate.getDate() + day);
  const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  // dateKey例: "2026-02-10", "2026-02-11", ..., "2026-02-16"
}
```

**処理内容**:
- `nextWeekStart`から7日分（月〜日）の日付を生成
- `dateKey`: `YYYY-MM-DD`形式の文字列（例: `"2026-02-10"`）

---

## 2. コレクションの確認

### 2.1 使用するコレクション

**コレクション名**: `businessHoursMonthlyMap`

**ドキュメントID**: `{YYYY-MM}`形式（例: `"2026-02"`）

**スキーマ**:
```typescript
{
  days: {
    "01": { openMinute: 540, closeMinute: 1320, isClosed: false },
    "02": { openMinute: 540, closeMinute: 1320, isClosed: false },
    // ...
    "31": { openMinute: 540, closeMinute: 1320, isClosed: false }
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 2.2 月ドキュメントの取得

```typescript
const yearMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
// yearMonth例: "2026-02"

// 月ドキュメントを取得（キャッシュがあれば使用）
let businessHoursData = monthDocs.get(yearMonth);
if (!businessHoursData) {
  const businessHoursDoc = await db
    .collection('businessHoursMonthlyMap')
    .doc(yearMonth)
    .get();

  if (!businessHoursDoc.exists) {
    throw new Error(`businessHoursMonthlyMap/${yearMonth} が見つかりません`);
  }

  businessHoursData = businessHoursDoc.data();
  monthDocs.set(yearMonth, businessHoursData);  // キャッシュに保存
}
```

**処理内容**:
- 各日の`yearMonth`（`YYYY-MM`形式）を計算
- 月ドキュメントを取得（キャッシュがあれば使用）
- 月跨ぎの場合は複数のドキュメントを取得（キャッシュで効率化）

**例**:
- 2026-02-10（月）〜 2026-02-16（日）の場合
  - 2026-02-10〜2026-02-16: `businessHoursMonthlyMap/2026-02`を取得
- 2026-02-28（月）〜 2026-03-06（日）の場合
  - 2026-02-28〜2026-02-29: `businessHoursMonthlyMap/2026-02`を取得
  - 2026-03-01〜2026-03-06: `businessHoursMonthlyMap/2026-03`を取得

---

## 3. 時間の取得方法

### 3.1 日付データの取得

```typescript
const days = businessHoursData?.days || {};
const k1 = String(targetDate.getDate());  // "1", "2", ..., "31"
const k2 = String(targetDate.getDate()).padStart(2, '0');  // "01", "02", ..., "31"
const dayData = days[k1] ?? days[k2];  // "1" / "01" の揺れに対応
```

**処理内容**:
- `days`マップから該当日のデータを取得
- キーの揺れ（`"1"`と`"01"`）に対応

### 3.2 休業日のチェック

```typescript
if (!dayData || dayData.isClosed) {
  continue;  // 休業日の場合はスキップ
}
```

**処理内容**:
- `dayData`が存在しない、または`isClosed: true`の場合はスキップ

### 3.3 営業時間の取得

```typescript
const openMinute = dayData.openMinute;   // 開店時刻（0:00からの分数）
const closeMinute = dayData.closeMinute; // 閉店時刻（0:00からの分数）
```

**フィールド説明**:
- `openMinute`: 開店時刻を0:00からの分数で表現（例: `540` = 09:00）
- `closeMinute`: 閉店時刻を0:00からの分数で表現（例: `1320` = 22:00）
- `closeMinute > 1440`の場合: 翌日に繰り越す（例: `1500` = 翌日01:00）

---

## 4. ジョブ生成時刻の計算

### 4.1 開店認定タスクの時刻計算

```typescript
// openMinute/closeMinuteは intendedBusinessDateKey（営業日）に紐づく時刻定義
// intendedBusinessDateKeyは営業日キー（YYYY-MM-DD）であり、openMinute/closeMinuteはその営業日の開店/閉店時刻を分単位で表す
// openScheduleTimeは intendedBusinessDateKey の営業日の openMinute から計算する（JST基準）
const openScheduleTime = new Date(targetDate);
openScheduleTime.setHours(Math.floor(openMinute / 60), openMinute % 60, 0, 0);
openScheduleTime.setMinutes(openScheduleTime.getMinutes() + taskOpenOffsetMinutes);
```

**処理内容**:
1. `targetDate`（営業日の00:00:00 JST）を基準に開始
2. `openMinute`を時間と分に変換して設定
   - `Math.floor(openMinute / 60)`: 時間（例: `540 / 60 = 9`）
   - `openMinute % 60`: 分（例: `540 % 60 = 0`）
3. `taskOpenOffsetMinutes`（デフォルト: `-30`分）を加算
   - 例: 09:00 → 08:30（開店30分前）

**例**:
- `openMinute = 540`（09:00）、`taskOpenOffsetMinutes = -30`
- `openScheduleTime = 2026-02-10 08:30:00 JST`

### 4.2 閉店認定タスクの時刻計算

```typescript
// closeMinute > 1440 の時は翌日へ繰り越すルールを維持
// closeScheduleTimeは intendedBusinessDateKey の営業日の closeMinute から計算する（JST基準）
// closeMinute > 1440 の場合は、intendedBusinessDateKey の翌日の暦日として計算する
const closeScheduleTime = new Date(targetDate);
if (closeMinute > 1440) {
  // 翌日に伸びる場合
  closeScheduleTime.setDate(closeScheduleTime.getDate() + 1);
  closeScheduleTime.setHours(Math.floor((closeMinute - 1440) / 60), (closeMinute - 1440) % 60, 0, 0);
} else {
  closeScheduleTime.setHours(Math.floor(closeMinute / 60), closeMinute % 60, 0, 0);
}
closeScheduleTime.setMinutes(closeScheduleTime.getMinutes() + taskCloseOffsetMinutes);
```

**処理内容**:
1. `targetDate`（営業日の00:00:00 JST）を基準に開始
2. `closeMinute > 1440`の場合:
   - 翌日に繰り越す（`setDate(targetDate.getDate() + 1)`）
   - `closeMinute - 1440`を時間と分に変換して設定
     - 例: `1500`（翌日01:00）→ `1500 - 1440 = 60` → 翌日01:00
3. `closeMinute <= 1440`の場合:
   - 当日の時刻として設定
   - `Math.floor(closeMinute / 60)`: 時間
   - `closeMinute % 60`: 分
4. `taskCloseOffsetMinutes`（デフォルト: `120`分）を加算
   - 例: 22:00 → 00:00（閉店2時間後）

**例1**: `closeMinute = 1320`（22:00）、`taskCloseOffsetMinutes = 120`
- `closeScheduleTime = 2026-02-10 00:00:00 JST`（翌日00:00）

**例2**: `closeMinute = 1500`（翌日01:00）、`taskCloseOffsetMinutes = 120`
- `closeScheduleTime = 2026-02-11 03:00:00 JST`（翌々日03:00）

---

## 5. Cloud Tasksへの投入

### 5.1 タスクIDの生成

```typescript
const openTaskId = `open_assessment_${dateKey}`;   // 例: "open_assessment_2026-02-10"
const closeTaskId = `close_assessment_${dateKey}`; // 例: "close_assessment_2026-02-10"
```

**処理内容**:
- `dateKey`（`YYYY-MM-DD`形式）を使用してタスクIDを生成
- 冪等性を担保するため、同じ`dateKey`に対しては同じタスクIDが生成される

### 5.2 タスク名の生成

```typescript
const openTaskName = tasksClient.taskPath(PROJECT_ID, tasksLocation, tasksQueue, openTaskId);
// 例: "projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue/tasks/open_assessment_2026-02-10"
```

**処理内容**:
- Cloud Tasksの完全修飾名を生成
- 形式: `projects/{PROJECT_ID}/locations/{LOCATION}/queues/{QUEUE}/tasks/{TASK_ID}`

### 5.3 スケジュール時刻の変換（UTC epoch秒）

```typescript
scheduleTime: {
  seconds: Math.floor(openScheduleTime.getTime() / 1000),  // UTC epoch秒へ変換
}
```

**処理内容**:
- JST時刻をUTC epoch秒に変換
- `getTime()`: ミリ秒単位のUTC epoch時刻
- `/ 1000`: 秒単位に変換

**例**:
- `openScheduleTime = 2026-02-10 08:30:00 JST`
- `= 2026-02-09 23:30:00 UTC`
- `= 1707528600`（UTC epoch秒）

### 5.4 タスクの作成

```typescript
const [openTaskResponse] = await tasksClient.createTask({
  parent: queuePath,
  task: {
    name: openTaskName,
    httpRequest: {
      httpMethod: 'POST',
      url: openAssessmentUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(openTaskPayload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: tasksInvokerSa,
      },
    },
    scheduleTime: {
      seconds: Math.floor(openScheduleTime.getTime() / 1000),
    },
  },
});
```

**処理内容**:
1. `parent`: キューの完全修飾名
2. `task.name`: タスクの完全修飾名（冪等性のため）
3. `httpRequest`: HTTPリクエストの設定
   - `url`: 呼び出すHTTP FunctionのURL
   - `body`: ペイロード（Base64エンコード）
   - `oidcToken`: OIDC認証用のサービスアカウント
4. `scheduleTime`: タスクの実行時刻（UTC epoch秒）

---

## 6. 処理フロー全体

```
1. 現在時刻を取得（UTC）
   ↓
2. JSTに変換
   ↓
3. 翌週の月曜日を計算（00:00:00 JST）
   ↓
4. 7日分（月〜日）の日付を生成
   ↓
5. 各日について:
   a. yearMonth（YYYY-MM）を計算
   b. businessHoursMonthlyMap/{yearMonth}を取得（キャッシュがあれば使用）
   c. days[日]からopenMinute/closeMinuteを取得
   d. isClosedをチェック（休業日ならスキップ）
   e. 開店認定タスクの時刻を計算（openMinute + taskOpenOffsetMinutes）
   f. 閉店認定タスクの時刻を計算（closeMinute + taskCloseOffsetMinutes、1440超なら翌日へ）
   g. タスクIDを生成（open_assessment_{dateKey} / close_assessment_{dateKey}）
   h. タスク名を生成（完全修飾名）
   i. スケジュール時刻をUTC epoch秒に変換
   j. Cloud Tasksにタスクを投入
```

---

## 7. 重要なポイント

### 7.1 時刻の基準

- **営業時間（`openMinute`/`closeMinute`）**: 営業日（`intendedBusinessDateKey`）に紐づく時刻定義
- **計算基準**: JST（UTC+9）
- **Cloud Tasks投入**: UTC epoch秒に変換

### 7.2 月跨ぎの処理

- 翌週が月を跨ぐ場合、複数の月ドキュメントを取得
- キャッシュ（`monthDocs`）を使用して効率化

### 7.3 日付キーの揺れ対応

- `days`マップのキーは`"1"`と`"01"`の両方に対応
- `days[k1] ?? days[k2]`で取得

### 7.4 休業日の処理

- `isClosed: true`の日はスキップ
- タスクを投入しない

### 7.5 冪等性の担保

- タスクIDは`{action}_{dateKey}`形式で固定
- `AlreadyExists`エラー（`error.code === 6`）は成功扱い

---

## 8. 環境変数

| 環境変数名 | 説明 | デフォルト値 |
|-----------|------|------------|
| `ENABLE_AUTO_OPEN_CLOSE` | 自動開閉店の有効/無効 | `true` |
| `TASK_CLOSE_OFFSET_MINUTES` | 閉店認定タスクの実行時刻オフセット（分） | `120` |
| `TASK_OPEN_OFFSET_MINUTES` | 開店認定タスクの実行時刻オフセット（分） | `-30` |
| `CLOSE_ASSESSMENT_URL` | 閉店認定HTTP FunctionのURL | - |
| `OPEN_ASSESSMENT_URL` | 開店認定HTTP FunctionのURL | - |
| `TASKS_QUEUE` | Cloud Tasksのキュー名 | - |
| `TASKS_LOCATION` | Cloud Tasksのロケーション | - |
| `TASKS_INVOKER_SA` | サービスアカウントのメールアドレス | - |

---

## 9. 例: 実際の計算

### 9.1 前提条件

- 実行日時: 2026-02-09（日）20:00 JST
- 翌週: 2026-02-10（月）〜 2026-02-16（日）
- 営業時間: 09:00-22:00（`openMinute = 540`, `closeMinute = 1320`）
- `taskOpenOffsetMinutes = -30`
- `taskCloseOffsetMinutes = 120`

### 9.2 開店認定タスク

**2026-02-10（月）の場合**:
- `dateKey = "2026-02-10"`
- `openMinute = 540`（09:00）
- `openScheduleTime = 2026-02-10 08:30:00 JST`
- `= 2026-02-09 23:30:00 UTC`
- `= 1707528600`（UTC epoch秒）
- `taskId = "open_assessment_2026-02-10"`

### 9.3 閉店認定タスク

**2026-02-10（月）の場合**:
- `dateKey = "2026-02-10"`
- `closeMinute = 1320`（22:00）
- `closeScheduleTime = 2026-02-10 22:00:00 JST + 120分`
- `= 2026-02-11 00:00:00 JST`
- `= 2026-02-10 15:00:00 UTC`
- `= 1707570000`（UTC epoch秒）
- `taskId = "close_assessment_2026-02-10"`

---

## まとめ

`weeklyPlanner`は以下の手順でジョブを生成します：

1. **日付の取得**: 現在時刻から翌週（月〜日）の日付を計算
2. **コレクションの確認**: `businessHoursMonthlyMap/{YYYY-MM}`から営業時間を取得
3. **時間の取得**: `days[日].openMinute`/`closeMinute`から営業時間を取得
4. **時刻の計算**: オフセットを加算してスケジュール時刻を計算（JST基準）
5. **タスクの投入**: Cloud Tasksにタスクを投入（UTC epoch秒に変換）

すべての処理はJST基準で行われ、Cloud Tasks投入時にUTC epoch秒に変換されます。
