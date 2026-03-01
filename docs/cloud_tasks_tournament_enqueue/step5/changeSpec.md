# Step 5 changeSpec：scheduledTournament 作成完了後の enqueue 呼び出し

## 1. 概要

### 1.1 目的

`spec.md` 2.1〜2.3 に基づき、scheduledTournament 作成完了後に **enqueue function（Core）を即時呼び出す** 処理を追加する。Step 1 で廃止した直接 Cloud Tasks 投入の代替として、作成経路から enqueue バッチを起動し、直近のトーナメントを早期に taskIndex 反映・Cloud Tasks 投入する。

- 日次 Scheduler（Step 4）のみに頼ると、作成〜翌日 5:00 までの最大約 24 時間の遅延が発生しうる
- 作成直後の即時 enqueue 呼び出しにより、対象期間内の新規トーナメントを即座に処理できる
- 単一経路：enqueueTournamentTasksCore.runEnqueueTournamentTasks を直接呼び出す（Callable 経由ではない）

### 1.2 スコープ

| 種別 | 対象 |
|------|------|
| 修正 | `createScheduledTournament.ts`（単発作成完了後） |
| 修正 | `createTournamentRecurrence.ts`（定期作成・複数トーナメント生成完了後） |
| 修正 | `generateRecurringTournamentsCore.ts`（定期生成完了後） |

**非対象**：編集処理（updateTournamentTemplate, updateTournamentRecurrence）からの enqueue 呼び出し。編集時は taskSyncNeeded=true を立てるのみで、日次 Scheduler が処理する。

**デプロイ順序**：本ステップで呼び出す enqueue が Cloud Tasks を投入するため、**controlHook が新 payload を受け付ける Step 6 と同時デプロイ**、または Step 6 先行デプロイが必要。そうでない場合、作成直後に投入されたタスクが controlHook で処理できずエラーになる。

---

## 2. 前提・依存

### 2.1 Step 1 〜 4 の状態

| ステップ | 状態 |
|----------|------|
| Step 1 | 作成経路からの enqueueStartTask / enqueueRegistTask 呼び出しは削除済み |
| Step 2 | scheduledTournament に schedulePlanVersion, taskSyncNeeded, taskSyncReason を設定済み |
| Step 3 | 編集時に taskSyncNeeded を立てる対応済み |
| Step 4 | enqueueTournamentTasksCore.runEnqueueTournamentTasks が実装済み。Callable / Scheduler から呼び出し可能 |

### 2.2 呼び出し方式の選択

| 方式 | 説明 | 採用 |
|------|------|------|
| Callable 経由 | Firebase Functions SDK で enqueueTournamentTasks Callable を invoke | ×（認証・クライアントコンテキストの引き回しが不要で、同プロジェクト内のため） |
| **Core 直接呼び出し** | `runEnqueueTournamentTasks()` を import して呼び出す | ✓ |

作成処理は既に Cloud Functions 内で実行されており、runEnqueueTournamentTasks は認証を要求しない。同一プロジェクト内の直接呼び出しが簡潔で、レイテンシも小さい。

### 2.3 Step 6 前のガード（Core 入口）

**runEnqueueTournamentTasks** の入口で `ENQUEUE_SCHEDULER_ENABLED !== 'true'` のとき即 return する。Scheduler のみならず、**作成経路（Step 5）からの呼び出しもガード**する。Step 6 未デプロイ環境で作成が走ると controlHook が新 payload を処理できずエラーになるため、作成経路が最も危険。Core 側で統一ガードする。

### 2.4 対象絞り（storeId / tenantId）

`{}` 呼び出しは全件スキャンとなり、店舗数増加でコストが破綻する。**作成経路では必ず storeId（および tenantId）を渡し、クエリ対象を絞る**。

| 呼び出し元 | 渡すオプション | 根拠 |
|------------|----------------|------|
| createScheduledTournament | `{ storeId, tenantId }` | 入力から取得可能 |
| createTournamentRecurrence | `{ storeId, tenantId }` | 入力から取得可能 |
| generateRecurringTournamentsCore | 閾値以下時は `{ storeId }`（単一 store の場合）、閾値超え時は enqueue スキップ | 複数 recurrence で storeId が異なる場合あり。閾値超えは Scheduler に任せる |

**Core 側（Step 4 拡張）**：`RunEnqueueOptions` に storeId / tenantId があり、渡された場合はクエリに `where('storeId','==',storeId)` 等を追加する。firestore.indexes.json に `status + storeId + startAt` の複合インデックスが必要。

### 2.5 二重起動抑止

定期作成の同時実行、手動作成の連打、Scheduler の同時実行により、enqueueCore が並行起動すると同一 tournament を重複処理し、taskIndex 競合や Cloud Tasks API の余計な呼び出しが発生する。

**設計案**：enqueueCore の入口で Firestore の `systemLocks/enqueueTournamentTasks` を leaseUntil 付きで取得。取得できなければ即 return。または deterministic taskName を徹底して Cloud Tasks 側で重複作成を弾く（Firestore 側コストは残る）。

**本ステップ**：設計を changeSpec に記載。実装は Step 4 Core の責備として別途検討する。

### 2.6 依存方向の固定

**enqueueTournamentTasksCore** は `tasks.ts` の `enqueueTournamentTask` を import する。**tasks.ts が Core を import しないこと**を厳守する。逆参照すると循環依存が発生する。

---

## 3. 現状（As-Is）と変更内容

### 3.1 createScheduledTournament.ts

| 項目 | 現状 | 変更後 |
|------|------|--------|
| トランザクション後 | `return { success: true, tournamentId, ... }` を返すのみ | トランザクション完了後、return の**直前**に enqueue 呼び出しを追加 |
| 投入タイミング | なし（Step 1 で削除済み） | 作成成功後に `runEnqueueTournamentTasks()` を 1 回呼び出し |

**挿入位置**：`await db.runTransaction(...)` の直後、`return { success: true, tournamentId, ... }` の直前に挿入。

**エラーハンドリング**：enqueue 呼び出しを try-catch で囲む。失敗時は **logger.error** で構造化ログを出力し、Cloud Logging / Error Reporting で検知可能にする。トーナメント作成は成功とする。日次 Scheduler が次回実行時に taskSyncNeeded=true の対象を処理する。

### 3.2 createTournamentRecurrence.ts

| 項目 | 現状 | 変更後 |
|------|------|--------|
| 処理フロー | recurrence 保存 → `generateRecurringTournaments()` で複数トーナメント生成 → return | 上記に加え、`generateRecurringTournaments()` **完了後**に enqueue を 1 回呼び出し |
| 投入回数 | なし | 生成トーナメント数に関係なく **1 回** |

**挿入位置**：`const generatedTournaments = await generateRecurringTournaments(...)` の直後、`console.log('生成されたトーナメント数:', ...)` の直前または直後に挿入。

**エラーハンドリング**：上記と同様。try-catch で囲み、失敗時はログのみ。recurrence 作成・トーナメント生成は成功扱いのまま。

### 3.3 generateRecurringTournamentsCore.ts

| 項目 | 現状 | 変更後 |
|------|------|--------|
| 呼び出し元 | Callable（generateRecurringTournaments）、Scheduler（generateRecurringTournamentsByScheduler） | 変更なし |
| 処理フロー | 全 recurrence をループし、各 recurrence について scheduledTournament を生成 → return | ループ完了後、return の**直前**に enqueue を 1 回呼び出し |
| 投入回数 | なし | 全 recurrence の処理完了後に **1 回**（閾値以下かつ条件を満たす場合のみ） |

**挿入位置**：`for (const recurrenceDoc of recurrencesSnapshot.docs) { ... }` のループ完了後、`console.log('合計 ... 件のトーナメントを生成しました')` の直後、`return { success: true, ... }` の直前に挿入。

**閾値スキップ**：`totalGenerated` が閾値（例: 50）を超えた場合は enqueue を呼ばず、Scheduler に任せる。大量生成直後の enqueue 実行はタイムアウト・コストのリスクがある。

**エラーハンドリング**：上記と同様。logger.error で構造化ログ。enqueue 失敗時も `generatedCount` は正しく返し、生成処理自体は成功とする。

---

## 4. 実装詳細

### 4.1 import 追加

各ファイルに以下を追加する：

```typescript
import { runEnqueueTournamentTasks } from "../services/enqueueTournamentTasksCore";
```

パスは各ファイルの配置に応じて調整する：
- `createScheduledTournament.ts`：`import { runEnqueueTournamentTasks } from "../services/enqueueTournamentTasksCore";`
- `createTournamentRecurrence.ts`：同上
- `generateRecurringTournamentsCore.ts`：`import { runEnqueueTournamentTasks } from "./enqueueTournamentTasksCore";`（同 services 配下）

### 4.2 呼び出しコード（共通パターン）

```typescript
import { logger } from 'firebase-functions';

try {
  await runEnqueueTournamentTasks({ storeId, tenantId });
} catch (enqueueError) {
  logger.error('enqueue 呼び出しエラー', {
    storeId,
    tenantId,
    error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
  });
}
```

**storeId / tenantId**：作成処理の入力から取得し、必ず渡す。クエリ対象を絞りコストを抑制する。

### 4.3 createScheduledTournament.ts の挿入例

```typescript
    await db.runTransaction(async (transaction) => {
      // ... 既存の transaction 処理 ...
    });

    // 作成完了後、enqueue を即時呼び出し（Step 5）。storeId/tenantId で対象を絞る
    try {
      await runEnqueueTournamentTasks({ storeId, tenantId });
    } catch (enqueueError) {
      logger.error('enqueue 呼び出しエラー', {
        tournamentId,
        storeId,
        tenantId,
        error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
      });
    }

    return {
      success: true,
      tournamentId,
      // ...
    };
```

### 4.4 createTournamentRecurrence.ts の挿入例

```typescript
    const generatedTournaments = await generateRecurringTournaments(
      db,
      recurrenceRef.id,
      // ...
    );

    // 作成完了後、enqueue を 1 回呼び出し（Step 5）。storeId/tenantId で対象を絞る
    try {
      await runEnqueueTournamentTasks({ storeId, tenantId });
    } catch (enqueueError) {
      logger.error('enqueue 呼び出しエラー', {
        recurrenceId: recurrenceRef.id,
        storeId,
        tenantId,
        error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
      });
    }

    console.log('生成されたトーナメント数:', generatedTournaments.length);
    return { ... };
```

### 4.5 generateRecurringTournamentsCore.ts の挿入例

閾値（例: 50）を超えた場合は enqueue をスキップ。閾値以下でも storeId を渡せる場合は渡す（ループ内で `storeIds.add(recurrenceData.storeId)` 等で収集し、単一の場合のみオプションに含める）。複数 store の場合は `{}` で呼び出し（閾値以下に抑えている前提）。

```typescript
    const ENQUEUE_AFTER_GENERATE_THRESHOLD = 50;

    console.log(`合計 ${totalGenerated} 件のトーナメントを生成しました`);

    if (totalGenerated <= ENQUEUE_AFTER_GENERATE_THRESHOLD) {
      try {
        const storeIds = new Set(
          recurrencesSnapshot.docs.map((d) => d.data().storeId || 'default-store')
        );
        const opts = storeIds.size === 1 ? { storeId: Array.from(storeIds)[0] } : {};
        await runEnqueueTournamentTasks(opts);
      } catch (enqueueError) {
        logger.error('enqueue 呼び出しエラー（定期生成後）', {
          totalGenerated,
          error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
        });
      }
    } else {
      console.log(`enqueue スキップ: 生成数 ${totalGenerated} が閾値 ${ENQUEUE_AFTER_GENERATE_THRESHOLD} を超えたため Scheduler に任せる`);
    }

    return {
      success: true,
      generatedCount: totalGenerated,
      message: `${totalGenerated}件の定期開催トーナメントを生成しました`,
    };
```

---

## 5. （任意）直近前倒し enqueue

### 5.1 spec.md 5.3 の扱い

`spec.md` 5.3 では「開始まで 1 時間未満のトーナメントが作成/編集された場合」に enqueue を即時呼び出すオプションを任意としている。

**本ステップの採用**：**常時呼び出し** とする。作成完了後は無条件に enqueue を 1 回呼び出す。これにより「直近 1 時間未満」のトーナメントも含め、対象期間内（lookback 6h 〜 horizon 14d）のものは即座に処理される。条件分岐による複雑化を避ける。

**将来拡張**：編集時（updateTournamentTemplate / updateTournamentRecurrence）に「変更されたトーナメントの startAt が 1 時間未満」の場合のみ enqueue を呼び出す最適化は、必要に応じて別ステップで検討する。

---

## 6. 変更内容（ファイル単位）

### 6.1 修正：createScheduledTournament.ts

| 種別 | 内容 |
|------|------|
| import 追加 | `runEnqueueTournamentTasks`, `logger` |
| 処理追加 | トランザクション完了後、return の直前に try-catch で `runEnqueueTournamentTasks({ storeId, tenantId })` を呼び出し |
| 行目目安 | 約 349 行目付近（`await db.runTransaction(...)` の直後） |

### 6.2 修正：createTournamentRecurrence.ts

| 種別 | 内容 |
|------|------|
| import 追加 | `runEnqueueTournamentTasks`, `logger` |
| 処理追加 | `generateRecurringTournaments()` 完了後、return の直前に try-catch で `runEnqueueTournamentTasks({ storeId, tenantId })` を呼び出し |
| 行目目安 | 約 109 行目付近（`const generatedTournaments = await generateRecurringTournaments(...)` の直後） |

### 6.3 修正：generateRecurringTournamentsCore.ts

| 種別 | 内容 |
|------|------|
| import 追加 | `runEnqueueTournamentTasks`, `logger`（未導入時） |
| 処理追加 | 閾値チェック＋enqueue 呼び出し。閾値超え時はスキップしログ出力 |
| 行目目安 | 約 174 行目付近（`console.log('合計 ... 件のトーナメントを生成しました')` の直後） |

### 6.4 前提：enqueueTournamentTasksCore.ts（Step 4 拡張）

| 種別 | 内容 |
|------|------|
| storeId/tenantId クエリ | オプションで渡された場合、クエリに where を追加 |
| Step 6 前ガード | 入口で ENQUEUE_SCHEDULER_ENABLED チェック。false なら即 return |
| インデックス | status + storeId + startAt の複合インデックス（firestore.indexes.json に追加済み）。tenantId 追加時は別途インデックス要確認 |

---

## 7. 確認観点

| # | 観点 | 期待結果 |
|---|------|----------|
| 1 | 単発作成後 | runEnqueueTournamentTasks が 1 回呼ばれる。失敗時もトーナメント作成は成功 |
| 2 | 定期作成後 | 複数トーナメント生成後、enqueue が 1 回のみ呼ばれる |
| 3 | 定期生成後 | 全 recurrence 処理後、enqueue が 1 回のみ呼ばれる |
| 4 | エラー分離 | enqueue 失敗時、作成処理は成功のまま。ログにエラーが記録される |
| 5 | 回帰 | Step 1 で削除した enqueueStartTask / enqueueRegistTask の呼び出しが復活していないこと |
| 6 | 循環参照 | enqueueTournamentTasksCore が createScheduledTournament 等を import していないこと（循環依存なし） |

---

## 8. チェックリスト

- [ ] enqueueTournamentTasksCore: storeId/tenantId をクエリに反映（実装済み）
- [ ] enqueueTournamentTasksCore: ENQUEUE_SCHEDULER_ENABLED による入口ガード（実装済み）
- [ ] firestore.indexes.json: status + storeId + startAt インデックス（追加済み）
- [ ] createScheduledTournament.ts: storeId/tenantId を渡して enqueue 呼び出し
- [ ] createTournamentRecurrence.ts: storeId/tenantId を渡して enqueue 呼び出し
- [ ] generateRecurringTournamentsCore.ts: 閾値チェック付き enqueue 呼び出し
- [ ] 全ファイルで logger.error による構造化ログ
- [ ] tasks.ts が Core を import していないこと（依存方向の確認）
- [ ] Step 6 と同時デプロイ、または Step 6 先行デプロイの準備ができていること
