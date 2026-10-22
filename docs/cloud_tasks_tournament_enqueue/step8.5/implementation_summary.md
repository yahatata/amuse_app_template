# Step 8.5 実装サマリ：安全性向上

## 概要

changeSpec Step 8.5 に従い、以下の 3 項目を実施した。

---

## 1. 実施内容

### 1.1 enqueueCore 既存データ混入ガード

**パス**：`functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts`

| 変更 | 内容 |
|------|------|
| 追加 | `validateRequiredFields(data)` 関数。タスク種別共通の必須フィールドが揃っていない場合に reason を返す |
| 必須フィールド（ガード） | startAt, storeId, tenantId（blindStructure は closeRegistration のみ実質必須。processTournament 内で regEndAt が null のとき該当 taskType をスキップ） |
| タスク種別 | startTournament: 上記 3 項目。closeRegistration: 上記＋blindStructure（processTournament 内で検知） |
| スキップ時 | `logger.warn` で `{ tournamentId, reason }` を出力 |
| reason 一覧 | missing_startAt, invalid_startAt, missing_storeId, missing_tenantId |

**処理フロー**：toProcess に追加する前に validateRequiredFields で検証。skipReason があればスキップしログ出力。

### 1.2 controlHook taskIndex 不在観測強化

**パス**：`functions/src/shared/http/controlHook.ts`

| 変更 | 内容 |
|------|------|
| ログレベル | `logTaskIndexMissing` 内の `logger.info` を `logger.warn` に変更 |
| ログ項目 | 5 項目（tournamentId, taskType, planVersion, planHash, cloudTaskName）は維持 |

### 1.3 Scheduler 有効化手順のドキュメント化

**パス**：`docs/cloud_tasks_tournament_enqueue/step8.5/scheduler_enable_procedure.md`（新規）

| 項目 | 内容 |
|------|------|
| いつ | controlHook の疎通確認**後**（デプロイ直後の即 ON は非推奨） |
| 誰が | 運用担当者 |
| どの環境 | 本番（ステージングで検証後推奨） |
| 推奨手順 | 1) Step 6 デプロイ 2) controlHook 疎通確認 3) ENQUEUE_SCHEDULER_ENABLED=true 4) 監視 |
| 注意 | 早期 ON によるタスク大量失敗を防ぐ |

---

## 2. テスト結果

### 2.1 Step 8.5 テスト（step8.5_safetyGuard.spec.ts）

```
validateRequiredFields（既存データ混入ガード）
  ✓ 必須フィールドが揃っていれば null を返す
  ✓ blindStructure でも可
  ✓ startAt が無いと missing_startAt
  ✓ storeId が無いと missing_storeId
  ✓ tenantId が無いと missing_tenantId
  ✓ blindStructureId が無いと missing_blindStructureId
  ✓ startAt が不正だと invalid_startAt
```

### 2.2 回帰テスト

- tournament_createTournament 全 8 スイート 56 テスト：PASS

---

## 3. 実行コマンド

```bash
cd functions && npm run build
npm test -- __tests__/tournament_createTournament/step8.5_safetyGuard.spec.ts
npm test -- __tests__/tournament_createTournament/
```
