# Cloud Scheduler と Cloud Tasks の使用状況まとめ

このドキュメントでは、プロジェクト内でCloud Schedulerを作成している処理と、Cloud Tasksにキューを投入している処理をまとめます。

## 1. Cloud Scheduler の作成処理

このプロジェクトでは、Firebase Functions v2の`onSchedule`を使用してスケジュール関数を定義しています。これらは内部的にCloud Schedulerを使用しますが、コード内で明示的にCloud Schedulerを作成しているわけではありません。

### 1.1 夜間再計算 (`nightlyRecalculateBalanceDue`)

**ファイル**: `functions/src/scripts/nightlyRecalculateBalanceDue.ts`

```17:46:functions/src/scripts/nightlyRecalculateBalanceDue.ts
export const nightlyRecalculateBalanceDue = onSchedule(
  {
    schedule: recalc,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    // ... 処理内容 ...
  }
);
```

- **スケジュール**: `STORE_CLOSE_HOUR:00 JST`（例: STORE_CLOSE_HOUR=27 の場合 3:00 JST）
- **処理内容**: `analyticsMonthly.net.balanceDueIncl` を再計算
- **cron文字列**: `getNightlyCronTriplet()` の `recalc` を使用

### 1.2 デュアルライト差分チェック (`nightlyReconciliationCheck`)

**ファイル**: `functions/src/scripts/nightlyReconciliationCheck.ts`

```17:53:functions/src/scripts/nightlyReconciliationCheck.ts
export const nightlyReconciliationCheck = onSchedule(
  {
    schedule: reconcile,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    // ... 処理内容 ...
  }
);
```

- **スケジュール**: `STORE_CLOSE_HOUR:30 JST`（例: STORE_CLOSE_HOUR=27 の場合 3:30 JST）
- **処理内容**: `todaysBills` と `bills` の差分を検出
- **cron文字列**: `getNightlyCronTriplet()` の `reconcile` を使用

### 1.3 夜間整合確認 (`nightlyIntegrityCheck`)

**ファイル**: `functions/src/scripts/nightlyIntegrityCheck.ts`

```17:51:functions/src/scripts/nightlyIntegrityCheck.ts
export const nightlyIntegrityCheck = onSchedule(
  {
    schedule: integrity,
    timeZone: 'Asia/Tokyo',
    retryCount: 3,
  },
  async (event) => {
    // ... 処理内容 ...
  }
);
```

- **スケジュール**: `(STORE_CLOSE_HOUR + 1):00 JST`（例: STORE_CLOSE_HOUR=27 の場合 4:00 JST）
- **処理内容**: データ整合性を確認し、異常を検出
- **cron文字列**: `getNightlyCronTriplet()` の `integrity` を使用

### 1.4 月次給与計算 (`monthlyPayrollTrigger`)

**ファイル**: `functions/src/attendance/monthlyPayrollTrigger.ts`

```4:117:functions/src/attendance/monthlyPayrollTrigger.ts
export const monthlyPayrollTrigger = onSchedule({
  schedule: '59 23 25 * *', // 毎月25日 23:59 (JST)
  timeZone: 'Asia/Tokyo',
}, async (event) => {
  // ... 処理内容 ...
});
```

- **スケジュール**: 毎月25日 23:59 JST
- **処理内容**: 月次給与計算を実行（前月26日〜今月25日の期間）

### 1.5 スケジュール削除 (`scheduledCleanup`)

**ファイル**: `functions/src/staff/scheduledCleanup.ts`

```10:66:functions/src/staff/scheduledCleanup.ts
export const scheduledCleanup = onSchedule(
  {
    schedule: "0 17 * * *", // UTC 17:00 = JST 02:00
    timeZone: "Asia/Tokyo",
    retryCount: 3,
  },
  async (event) => {
    // ... 処理内容 ...
  }
);
```

- **スケジュール**: 毎日午前2時 JST（UTC 17:00）
- **処理内容**: 却下後7日経過したシフトを自動削除

### 1.6 cron文字列生成関数

**ファイル**: `functions/src/config/ops.ts`

```71:98:functions/src/config/ops.ts
export function cronFromHourAndMinuteJst(hour0to29: number, minute: number): string {
  // ... cron文字列を生成 ...
}

export function getNightlyCronTriplet() {
  // ... 3つのcron文字列を返す ...
}
```

- `cronFromHourAndMinuteJst`: JST時刻からcron文字列を生成
- `getNightlyCronTriplet`: 夜間ジョブ用の3つのcron文字列（recalc, reconcile, integrity）を返す

## 2. Cloud Tasks へのキュー投入処理

Cloud Tasksへのキュー投入は、`functions/src/lib/tasks.ts` で定義された関数を使用します。

### 2.1 タスク投入関数の定義

**ファイル**: `functions/src/lib/tasks.ts`

#### 2.1.1 開始タスク投入 (`enqueueStartTask`)

```145:201:functions/src/lib/tasks.ts
export async function enqueueStartTask(tournamentId: string, scheduledTime: Date, rev: number): Promise<string> {
  // 環境変数を遅延取得
  const controlHookUrl = getEnv('CONTROL_HOOK_URL');
  const tasksQueue = getEnv('TASKS_QUEUE');
  const tasksLocation = getEnv('TASKS_LOCATION');
  const tasksInvokerSa = getEnv('TASKS_INVOKER_SA');

  const queuePath = client.queuePath(PROJECT_ID, tasksLocation, tasksQueue);

  const payload = {
    action: 'start',
    tournamentId: tournamentId,
    rev: rev
  };

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: controlHookUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: tasksInvokerSa,
      },
    },
    scheduleTime: {
      seconds: Math.floor(scheduledTime.getTime() / 1000),
    },
  };

  const [response] = await client.createTask({
    parent: queuePath,
    task: task,
  });

  return response.name || '';
}
```

- **用途**: トーナメント開始タスクをCloud Tasksに投入
- **ペイロード**: `{ action: 'start', tournamentId, rev }`

#### 2.1.2 レジスト確定タスク投入 (`enqueueRegistTask`)

```206:262:functions/src/lib/tasks.ts
export async function enqueueRegistTask(tournamentId: string, scheduledTime: Date, rev: number): Promise<string> {
  // 環境変数を遅延取得
  const controlHookUrl = getEnv('CONTROL_HOOK_URL');
  const tasksQueue = getEnv('TASKS_QUEUE');
  const tasksLocation = getEnv('TASKS_LOCATION');
  const tasksInvokerSa = getEnv('TASKS_INVOKER_SA');

  const queuePath = client.queuePath(PROJECT_ID, tasksLocation, tasksQueue);

  const payload = {
    action: 'regist',
    tournamentId: tournamentId,
    rev: rev
  };

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: controlHookUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: tasksInvokerSa,
      },
    },
    scheduleTime: {
      seconds: Math.floor(scheduledTime.getTime() / 1000),
    },
  };

  const [response] = await client.createTask({
    parent: queuePath,
    task: task,
  });

  return response.name || '';
}
```

- **用途**: レジスト確定タスクをCloud Tasksに投入
- **ペイロード**: `{ action: 'regist', tournamentId, rev }`

#### 2.1.3 汎用タスク投入 (`scheduleTask`)

```33:98:functions/src/lib/tasks.ts
export async function scheduleTask(params: ScheduleTaskParams): Promise<string> {
  // ... タスク投入処理 ...
}
```

- **用途**: 汎用的なタスク投入関数（現在は使用されていない）
- **パラメータ**: `{ kind: 'start' | 'regist', tournamentId, revision, scheduledTime }`

### 2.2 タスク投入の呼び出し箇所

#### 2.2.1 スケジュール済みトーナメント作成時

**ファイル**: `functions/src/callables/createScheduledTournament.ts`

```293:322:functions/src/callables/createScheduledTournament.ts
    // Cloud Tasks にタスクを投入
    try {
      console.log('=== Cloud Tasks 投入開始 ===');
      console.log('tournamentId:', tournamentId);
      console.log('plannedStartAt:', plannedStartAt.toDate().toISOString());
      console.log('plannedRegistAt:', plannedRegistAt.toISOString());

      // 開始タスクを投入（Rev=1で初期投入）
      // 過去時刻の場合は5秒後に丸める
      const now = new Date();
      const startTime = plannedStartAt.toDate() < now 
        ? new Date(now.getTime() + 5000) // 5秒後
        : plannedStartAt.toDate();
      
      const startTaskName = await enqueueStartTask(tournamentId, startTime, 1);
      console.log('開始タスク投入完了:', startTaskName);

      // レジスト確定タスクを投入（Rev=1で初期投入）
      const registTime = plannedRegistAt < now 
        ? new Date(now.getTime() + 10000) // 10秒後
        : plannedRegistAt;
        
      const registTaskName = await enqueueRegistTask(tournamentId, registTime, 1);
      console.log('レジスト確定タスク投入完了:', registTaskName);

      console.log('=== Cloud Tasks 投入完了 ===');
    } catch (taskError) {
      console.error('Cloud Tasks 投入エラー:', taskError);
      // タスク投入に失敗してもトーナメント作成は成功とする
    }
```

- **呼び出しタイミング**: スケジュール済みトーナメント作成時
- **投入タスク**: 
  - 開始タスク（`enqueueStartTask`）
  - レジスト確定タスク（`enqueueRegistTask`）

#### 2.2.2 定期開催トーナメント作成時（`createTournamentRecurrence`）

**ファイル**: `functions/src/callables/createTournamentRecurrence.ts`

```444:472:functions/src/callables/createTournamentRecurrence.ts
    // Cloud Tasks にタスクを投入
    try {
      console.log('=== Cloud Tasks 投入開始（定期開催） ===');
      console.log('tournamentId:', tournamentId);
      console.log('plannedStartAt:', plannedStartAt.toDate().toISOString());
      console.log('plannedRegistAt:', plannedRegistAt.toISOString());

      // 開始タスクを投入
      const nowForTask = new Date();
      const startTime = plannedStartAt.toDate() < nowForTask 
        ? new Date(nowForTask.getTime() + 5000)
        : plannedStartAt.toDate();
      
      const startTaskName = await enqueueStartTask(tournamentId, startTime, 1);
      console.log('開始タスク投入完了:', startTaskName);

      // レジスト確定タスクを投入
      const registTime = plannedRegistAt < nowForTask 
        ? new Date(nowForTask.getTime() + 10000)
        : plannedRegistAt;
        
      const registTaskName = await enqueueRegistTask(tournamentId, registTime, 1);
      console.log('レジスト確定タスク投入完了:', registTaskName);

      console.log('=== Cloud Tasks 投入完了 ===');
    } catch (taskError) {
      console.error('Cloud Tasks 投入エラー:', taskError);
      // タスク投入に失敗してもトーナメント作成は成功とする
    }
```

- **呼び出しタイミング**: 定期開催からトーナメントを作成時（`createScheduledTournamentFromRecurrence`関数内）
- **投入タスク**: 
  - 開始タスク（`enqueueStartTask`）
  - レジスト確定タスク（`enqueueRegistTask`）

#### 2.2.3 定期開催トーナメント自動生成時（`generateRecurringTournaments`）

**ファイル**: `functions/src/callables/generateRecurringTournaments.ts`

```361:389:functions/src/callables/generateRecurringTournaments.ts
    // Cloud Tasks にタスクを投入
    try {
      console.log('=== Cloud Tasks 投入開始（定期開催） ===');
      console.log('tournamentId:', tournamentId);
      console.log('plannedStartAt:', plannedStartAt.toDate().toISOString());
      console.log('plannedRegistAt:', plannedRegistAt.toISOString());

      // 開始タスクを投入
      const nowForTask = new Date();
      const startTime = plannedStartAt.toDate() < nowForTask 
        ? new Date(nowForTask.getTime() + 5000)
        : plannedStartAt.toDate();
      
      const startTaskName = await enqueueStartTask(tournamentId, startTime, 1);
      console.log('開始タスク投入完了:', startTaskName);

      // レジスト確定タスクを投入
      const registTime = plannedRegistAt < nowForTask 
        ? new Date(nowForTask.getTime() + 10000)
        : plannedRegistAt;
        
      const registTaskName = await enqueueRegistTask(tournamentId, registTime, 1);
      console.log('レジスト確定タスク投入完了:', registTaskName);

      console.log('=== Cloud Tasks 投入完了 ===');
    } catch (taskError) {
      console.error('Cloud Tasks 投入エラー:', taskError);
      // タスク投入に失敗してもトーナメント作成は成功とする
    }
```

- **呼び出しタイミング**: 定期開催トーナメントを自動生成時（`createScheduledTournamentFromRecurrence`関数内）
- **投入タスク**: 
  - 開始タスク（`enqueueStartTask`）
  - レジスト確定タスク（`enqueueRegistTask`）

## 3. 環境変数

Cloud Tasksの設定に使用される環境変数：

- `CONTROL_HOOK_URL`: タスク実行時のHTTPエンドポイントURL
- `TASKS_QUEUE`: Cloud Tasksのキュー名
- `TASKS_LOCATION`: Cloud Tasksのリージョン
- `TASKS_INVOKER_SA`: タスク実行用のサービスアカウント
- `PROJECT_ID`: GCPプロジェクトID（デフォルト: `amuse-app-template`）

## 4. まとめ

### Cloud Scheduler
- **合計5つのスケジュール関数**を定義
  - 夜間再計算（`nightlyRecalculateBalanceDue`）
  - デュアルライト差分チェック（`nightlyReconciliationCheck`）
  - 夜間整合確認（`nightlyIntegrityCheck`）
  - 月次給与計算（`monthlyPayrollTrigger`）
  - スケジュール削除（`scheduledCleanup`）

### Cloud Tasks
- **合計3箇所**でタスク投入を実行
  - `createScheduledTournament`: スケジュール済みトーナメント作成時
  - `createTournamentRecurrence`: 定期開催トーナメント作成時
  - `generateRecurringTournaments`: 定期開催トーナメント自動生成時
- **投入されるタスク**: 各トーナメントに対して開始タスクとレジスト確定タスクの2つ
