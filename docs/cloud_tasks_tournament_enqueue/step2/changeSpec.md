# Step 2 changeSpec：scheduledTournament データモデル拡張

## 1. 概要

### 1.1 目的

`spec.md` に基づき、scheduledTournament に **enqueue バッチ用の管理フィールド** を追加し、taskIndex サブコレクションの利用準備を行う。

- 作成経路（単発・定期・定期生成）によらず、新規 scheduledTournament に `schedulePlanVersion`, `taskSyncNeeded`, `taskSyncReason` を付与する
- Step 4 で enqueue 専用 function が「同期が必要なトーナメント」を識別できるようにする
- taskIndex サブコレクションの Firestore ルールを追加する（Step 4 以降で enqueue function が作成・更新する前提）

### 1.2 スコープ

- **対象**：`createScheduledTournament.ts`、`createTournamentRecurrence.ts`、`generateRecurringTournamentsCore.ts` の scheduledTournament 作成処理、`firestore.rules`
- **非対象**：taskIndex ドキュメントの作成（Step 4 の enqueue function が担当）、編集処理への version 更新（Step 3）

---

## 2. 現状（As-Is）

### 2.1 scheduledTournament の現在のフィールド構成

#### 2.1.1 createScheduledTournament.ts（単発作成）

`scheduledTournamentData`（160〜195 行目）の主なフィールド：

| フィールド | 型 | 備考 |
|------------|-----|------|
| templateId | string | |
| storeId | string | |
| tenantId | string | |
| status | 'scheduled' | |
| startAt | Timestamp | トランザクション内で plannedStartAt に差し替え |
| regEndAt | Timestamp | トランザクション内で plannedRegistAt に差し替え |
| businessDate | string | |
| freeze | boolean | |
| isPrizeConfirmed | boolean | |
| isArchived | boolean | |
| regular | boolean | false（単発） |
| generateBy | null | |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |
| snapshot | object | テンプレート内容のスナップショット |

**schedulePlanVersion, taskSyncNeeded, taskSyncReason, schedulePlanUpdatedAt は存在しない。**

#### 2.1.2 createTournamentRecurrence.ts（定期作成）

`createScheduledTournamentFromRecurrence` 内の `scheduledTournamentData`（374〜389 行目付近）：

| フィールド | 備考 |
|------------|------|
| templateId, storeId, tenantId, status, businessDate, startAt, regEndAt | 上記と同様 |
| recurrenceId | 定期開催ID |
| regular | true |
| generateBy | recurrenceId |
| freeze, isPrizeConfirmed, isArchived, createdAt, updatedAt, snapshot | 上記と同様 |

**同上、管理フィールドは存在しない。**

#### 2.1.3 generateRecurringTournamentsCore.ts（定期生成）

同ファイル内の `createScheduledTournamentFromRecurrence` の `scheduledTournamentData`（350〜365 行目付近）：

**createTournamentRecurrence.ts と同一構造。管理フィールドは存在しない。**

### 2.2 Firestore ルールの現状

| パス | 現状 |
|------|------|
| `scheduledTournaments/{tournamentId}` | read: true, write: false |
| `scheduledTournaments/{tournamentId}/views/{viewId}` | read: true, write: false |
| `scheduledTournaments/{tournamentId}/tablesSeat/{docId}` | read: true, write: false |
| `scheduledTournaments/{tournamentId}/taskIndex/{taskType}` | **未定義**（catch-all で read/write: false） |

taskIndex サブコレクションは現状ルールに存在しない。Step 4 で enqueue function が taskIndex を作成・更新するが、Cloud Functions は Admin SDK 経由のためセキュリティルールの影響を受けない。クライアントや管理画面からの read を許可する場合はルール追加が必要。本ステップでは他サブコレクションと同様に read を許可するルールを追加する。

---

## 3. 目標（To-Be）

### 3.1 spec.md 1.1 に基づく追加フィールド

| フィールド | 型 | 必須 | 新規作成時の値 | 説明 |
|------------|-----|------|----------------|------|
| schedulePlanVersion | number | 必須 | 1 | 予定が変わったら +1。新規は 1 |
| schedulePlanUpdatedAt | Timestamp | 推奨 | Timestamp.fromDate(now) | 予定更新日時 |
| taskSyncNeeded | boolean | 必須 | true | enqueue バッチが同期すべきフラグ |
| taskSyncReason | string[] | 任意 | ['created'] | 同期が必要になった理由 |

### 3.2 taskIndex サブコレクション

- **本ステップでは taskIndex ドキュメントは作成しない**（Step 4 の enqueue function が作成）
- **firestore.rules** に `scheduledTournaments/{tournamentId}/taskIndex/{taskType}` の read ルールを追加する
- 構造は spec.md 1.2 を参照（enqueue function 実装時の仕様）

---

## 4. 変更内容（ファイル単位）

### 4.1 createScheduledTournament.ts

| 変更種別 | 内容 |
|----------|------|
| 追加 | `scheduledTournamentData` オブジェクトに以下を追加する |

**追加するフィールド（snapshot の直前に配置推奨）**:

```typescript
// Cloud Tasks enqueue バッチ用管理フィールド（spec.md 1.1）
schedulePlanVersion: 1,
schedulePlanUpdatedAt: Timestamp.fromDate(now),
taskSyncNeeded: true,
taskSyncReason: ['created'],
```

**配置位置**：`createdAt`, `updatedAt` の後、`snapshot` の前。既存の `regular`, `generateBy` の直後でも可。

**トランザクション内の finalScheduledTournamentData**：`...scheduledTournamentData` で展開されるため、上記追加フィールドは自動で含まれる。変更不要。

### 4.2 createTournamentRecurrence.ts

| 変更種別 | 内容 |
|----------|------|
| 追加 | `createScheduledTournamentFromRecurrence` 内の `scheduledTournamentData` に同一フィールドを追加 |

**追加するフィールド**:

```typescript
schedulePlanVersion: 1,
schedulePlanUpdatedAt: Timestamp.fromDate(now),
taskSyncNeeded: true,
taskSyncReason: ['created'],
```

**配置位置**：`createdAt`, `updatedAt` の後、`snapshot` の前。`regular`, `generateBy` の直後でも可。

### 4.3 generateRecurringTournamentsCore.ts

| 変更種別 | 内容 |
|----------|------|
| 追加 | `createScheduledTournamentFromRecurrence` 内の `scheduledTournamentData` に同一フィールドを追加 |

**追加するフィールド**：4.1, 4.2 と同様。

**配置位置**：同上。

### 4.4 firestore.rules

| 変更種別 | 内容 |
|----------|------|
| 追加 | `scheduledTournaments/{tournamentId}` の match ブロック内に、`taskIndex` サブコレクションのルールを追加する |

**追加するルール**（`match /events/{eventId}` の後、親 `match /scheduledTournaments/{tournamentId}` の閉じ括弧の前に配置）:

```
      // taskIndex サブコレクション（内部台帳。enqueue バッチ・controlHook が読み書き。クライアント非公開）
      match /taskIndex/{taskType} {
        allow read: if false;
        allow write: if false;
      }
```

**方針**：taskIndex は予定時刻・内部状態（failed 等）を含む内部台帳であり、クライアント公開の要件がない。read: false とし、Cloud Functions（Admin SDK）経由のみでアクセスする。

---

## 5. 変更後のデータ構造イメージ

### 5.1 scheduledTournament ドキュメント（新規作成後）

```json
{
  "templateId": "...",
  "storeId": "...",
  "tenantId": "...",
  "status": "scheduled",
  "startAt": "<Timestamp>",
  "regEndAt": "<Timestamp>",
  "businessDate": "2026-02-19",
  "freeze": false,
  "isPrizeConfirmed": false,
  "isArchived": false,
  "regular": false,
  "generateBy": null,
  "schedulePlanVersion": 1,
  "schedulePlanUpdatedAt": "<Timestamp>",
  "taskSyncNeeded": true,
  "taskSyncReason": ["created"],
  "createdAt": "<Timestamp>",
  "updatedAt": "<Timestamp>",
  "snapshot": { ... }
}
```

### 5.2 taskIndex サブコレクション

**本ステップでは作成しない。** Step 4 で enqueue function が以下のようなドキュメントを作成する（参考）：

- `scheduledTournaments/{id}/taskIndex/startTournament`
- `scheduledTournaments/{id}/taskIndex/closeRegistration`

---

## 6. 既存データ・後方互換

### 6.1 既存 scheduledTournament（本ステップ適用前作成分）

- 既存ドキュメントには `schedulePlanVersion`, `taskSyncNeeded` 等が存在しない
- **本ステップでは既存データのマイグレーションは行わない**
- Step 8 は本プロジェクトではスキップ（既存データは運用側で削除する前提）。enqueue function の `schedulePlanVersion ?? 0` フォールバックは防御的に維持

### 6.2 クライアント・Flutter アプリ

- 追加フィールドはサーバー専用の管理用。クライアントからの read は可能だが、write は不可（既存ルールどおり）
- Flutter 側で schedulePlanVersion / taskSyncNeeded を参照する必要がなければ、本ステップでは変更不要

---

## 7. 検証方法

### 7.1 ビルド・型チェック

```bash
cd functions && npm run build
```

- エラーなく完了すること

### 7.2 Emulator 統合テスト

Step 1 で作成した `step1_emulator_verification.spec.ts` を実行し、scheduledTournament 作成が成功することを確認する。

```bash
firebase emulators:start --only firestore  # 別ターミナル
cd functions && npm run test -- __tests__/tournament_createTournament/step1_emulator_verification.spec.ts
```

**追加確認**：作成された scheduledTournament ドキュメントに `schedulePlanVersion`, `taskSyncNeeded`, `taskSyncReason`, `schedulePlanUpdatedAt` が含まれることをアサートする。既存テストを拡張するか、新規テストを追加する。

### 7.3 Firestore ルールのデプロイ確認

```bash
firebase deploy --only firestore:rules
```

- エラーなくデプロイできること

---

## 8. 注意事項・リスク

### 8.1 フィールドの一貫性

- 3 ファイルで同一のフィールド・同一の値を設定すること
- 将来的に `taskSyncReason` に `'startAtChanged'` 等を追加するのは Step 3（編集処理）で対応

### 8.2 taskIndex の read/write ルール

- `allow read: if false`, `allow write: if false` により、クライアントからの taskIndex アクセスは不可
- Cloud Functions は Admin SDK のため、このルールの影響を受けずに taskIndex を読み書きできる

### 8.3 ロールバック

- 追加フィールドは新規作成分のみに付与。既存データへの影響なし
- firestore.rules の追加を revert すれば、taskIndex は catch-all で read/write 禁止に戻る（Step 4 実装前であれば影響小）

---

## 9. チェックリスト

- [ ] createScheduledTournament.ts の scheduledTournamentData に 4 フィールドを追加
- [ ] createTournamentRecurrence.ts の createScheduledTournamentFromRecurrence 内 scheduledTournamentData に 4 フィールドを追加
- [ ] generateRecurringTournamentsCore.ts の createScheduledTournamentFromRecurrence 内 scheduledTournamentData に 4 フィールドを追加
- [ ] firestore.rules に taskIndex サブコレクションの read/write ルールを追加
- [ ] `npm run build` が成功する
- [ ] step1_emulator_verification.spec.ts がパスする（必要に応じて新フィールドのアサートを追加）
- [ ] firestore:rules のデプロイが成功する
