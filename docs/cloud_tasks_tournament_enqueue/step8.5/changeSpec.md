# Step 8.5 changeSpec：安全性向上

## 1. 概要

### 1.1 目的

Step 8 はスキップするが、以下の安全性向上のみ実施する。

1. **enqueueCore の既存データ混入ガード**：必須フィールドが揃っていない doc を即スキップ
2. **controlHook の taskIndex 不在観測強化**：logger.warn に変更
3. **Scheduler 有効化の手順をドキュメント化**

---

## 2. 変更内容

### 2.1 enqueueCore：既存データ混入ガード

**パス**：`functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`

scheduledTournaments を処理する**前**（toProcess に追加する前）に、必須フィールドの検証を行う。

**タスク種別ごとの必須条件**（ガードは共通必須のみ。blindStructure は closeRegistration のみ実質必須）:

| taskType | 必須フィールド | 備考 |
|----------|----------------|------|
| startTournament | startAt, storeId, tenantId | blindStructure は任意 |
| closeRegistration | 上記＋blindStructureId/blindStructure | processTournament 内で regEndAt 再計算。blindTemplate 欠落時は null となり該当 taskType のみスキップ |

**ガードで検証するフィールド**（startTournament 実行に必要な最低限）:

| 必須フィールド | 検証内容 |
|----------------|----------|
| startAt | 存在し、Date または Timestamp に変換可能であること |
| storeId | 存在し、空でない文字列であること |
| tenantId | 存在し、空でない文字列であること |

※ blindStructure はガードでは必須にしない。closeRegistration は processTournament 内で regEndAt が null のときスキップする。これにより「blindStructure 無しでも startTournament は実行可能」となる。

**スキップ時**：構造化ログ `{ tournamentId, reason }` を出力。`logger.warn` を使用。

**理由の例**：
- `missing_startAt`
- `missing_storeId`
- `missing_tenantId`
- `invalid_startAt`（変換不可の場合）

### 2.2 controlHook：taskIndex 不在ログ強化

**パス**：`functions/src/shared/http/controlHook.ts`

| 変更 | 内容 |
|------|------|
| ログレベル | `logTaskIndexMissing` 内の `logger.info` を `logger.warn` に変更 |
| ログ項目 | 既に 5 項目（tournamentId, taskType, planVersion, planHash, cloudTaskName）含まれていることを維持 |

→ "実行されないタスク" の検知性を上げる（静かに失敗しない）。

### 2.3 Scheduler 有効化手順のドキュメント化

**パス**：`docs/cloud_tasks_tournament_enqueue/step8.5/scheduler_enable_procedure.md`（新規）

| 項目 | 内容 |
|------|------|
| いつ | controlHook の疎通確認**後**（デプロイ直後の即 ON は非推奨） |
| 誰が | 運用担当者 |
| どの環境 | 本番（またはステージングで検証後、本番） |
| 推奨手順 | 1) Step 6 デプロイ 2) controlHook 疎通確認 3) ENQUEUE_SCHEDULER_ENABLED=true 設定 4) 監視 |
| 注意 | 早期 ON によるタスク大量失敗を防ぐ |

---

## 3. 確認観点

| # | 観点 | 期待結果 |
|---|------|----------|
| 1 | 混入ガード | 必須フィールド欠如の doc はスキップされ、ログに tournamentId, reason が出力される |
| 2 | taskIndex 不在 | controlHook で logger.warn が呼ばれる |
| 3 | ドキュメント | scheduler_enable_procedure.md が存在し、手順が明記されている |
| 4 | 回帰 | 既存テストがパスする |
