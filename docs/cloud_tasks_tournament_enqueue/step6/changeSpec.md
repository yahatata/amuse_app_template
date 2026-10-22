# Step 6 changeSpec：Cloud Tasks 実行関数（controlHook）の修正

## 1. 概要

### 1.1 目的

`spec.md` 5 に基づき、controlHook を **新 payload（taskType, planVersion, planHash 等）** に対応させる。Step 4 で enqueueTournamentTask が投入する payload を受付・処理し、no-op 判定と taskIndex への実行結果反映を行う。

- 現行は `action`, `tournamentId`, `rev` の旧 payload のみ受付
- Step 4/5 で投入される新 payload（taskType, planVersion, planHash, scheduledAt, storeId）を処理できるようにする
- 旧 payload は後方互換のため当面残す（既存タスクがキューに残っている期間のため）

### 1.2 スコープ

| 種別 | 対象 |
|------|------|
| 修正 | `functions/src/shared/http/controlHook.ts` |

**非対象**：enqueue 側（Step 4/5 済み）、scheduledTournament 作成・編集（Step 1〜3, 5）

**デプロイ順序**：本ステップ完了後、`ENQUEUE_SCHEDULER_ENABLED=true` にし、Step 4 Scheduler および Step 5 作成経路からの enqueue を有効化する。

---

## 2. 前提・依存

### 2.1 Step 4 で投入される payload（enqueueTournamentTask）

```typescript
{
  tournamentId: string,
  taskType: 'startTournament' | 'closeRegistration',
  planVersion: number,
  planHash: string,
  scheduledAt: string,  // ISO 文字列
  storeId: string
}
```

### 2.2 現行 controlHook の受付 payload（旧）

```typescript
{
  action: 'start' | 'regist',
  tournamentId: string,
  rev: number
}
```

### 2.3 taskType と action の対応

| taskType | action | 処理内容 |
|----------|--------|----------|
| startTournament | start | scheduled → running、startedAt 設定 |
| closeRegistration | regist | running → registered、registAt 設定 |

### 2.4 runtime のフィールド

現行 controlHook は `views/runtime` の以下を使用：
- `startRev`, `registRev`：旧 payload の no-op 判定用
- `startedAt`：開始済みか
- `registAt`：レジスト締切済みか

新 payload では `schedulePlanVersion`（scheduledTournament）と `planHash`（taskIndex）で判定する。startRev/registRev は旧 payload 時のみ参照。

---

## 3. 現状（As-Is）

### 3.1 処理フロー

1. POST であることを検証
2. Bearer 認証ヘッダーを検証
3. `action`, `tournamentId`, `rev` を必須として取得
4. action が 'start' または 'regist' であることを検証
5. トランザクション内で：
   - start: startRev 一致チェック → scheduled かつ startedAt 未設定なら status=running, startedAt 設定
   - regist: registRev 一致チェック → running かつ registAt 未設定なら status=registered, registAt 設定
6. 200 を返却

### 3.2 taskIndex 未使用

現行 controlHook は taskIndex を読み書きしていない。no-op 判定は startRev/registRev のみ。

---

## 4. 変更後の処理フロー

### 4.1 payload の分岐

リクエスト body に `taskType` が含まれるかで新/旧を判定する。

| 条件 | 扱い |
|------|------|
| `taskType` が存在 | **新 payload フロー**（5 章） |
| `taskType` が無く `action` が存在 | **旧 payload フロー**（現行ロジックを維持） |
| いずれも無い | 400 Bad Request |

### 4.2 新 payload の必須項目

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| tournamentId | string | ✓ | トーナメント ID |
| taskType | string | ✓ | startTournament / closeRegistration |
| planVersion | number | ✓ | schedulePlanVersion の写し |
| planHash | string | ✓ | 同一計画判定用 |
| scheduledAt | string | - | enqueueDueAt の ISO 文字列。enqueueTournamentTask では送るが、controlHook では検証しない（ログ用） |
| storeId | string | - | 店舗 ID。enqueueTournamentTask では送るが、controlHook では検証しない |

planVersion, planHash が無い場合は 400 を返す（不正なタスクの早期検知）。

---

## 5. 新 payload の処理ロジック

### 5.1 taskType の検証

`taskType` が `startTournament` または `closeRegistration` でなければ 400 を返す。

### 5.2 no-op 判定（spec.md 5.2）

**処理順序**：tournament, runtime 取得 → taskIndex 取得 → **taskIndex が無ければ 200 no-op で終了（更新なし）** → version/hash 比較（不一致なら、taskIndex が存在するので executed/noop で更新して 200）。

no-op 時の taskIndex 更新は **「taskIndex が存在する場合のみ」** に統一する（案B。台帳が無いなら実行しない、の思想に整合）。

1. **tournament, runtime 取得**
   - いずれかが存在しない場合 → 7.1 のエラーハンドリングに従う

2. **taskIndex 取得**
   - `scheduledTournaments/{tournamentId}/taskIndex/{taskType}` を取得
   - **taskIndex が存在しない → 200 no-op で終了。taskIndex への書き込みは行わない**（台帳が無いなら実行しない。Step 4 の思想に整合）
   - この場合、**ログに 7.3 の 5 項目**（tournamentId, taskType, planVersion, planHash, cloudTaskName）を必須出力する
   - 存在する場合のみ以下へ

3. **schedulePlanVersion 比較**
   - scheduledTournament の `schedulePlanVersion`（未設定時は 0）と payload の `planVersion` を比較
   - 不一致 → no-op（taskIndex が存在するので、executed/noop で更新して 200）
   - planVersion 0 は特別扱いしない。0 === 0 で一致とみなす（Step 8 は本プロジェクトではスキップ。防御的フォールバックとして維持）

**SSoT（信頼できる唯一の情報源）**：`scheduledTournament.schedulePlanVersion` が SSoT。`taskIndex.planVersion` はその写し。実行済み判定は「version 一致かつ hash 一致」で本処理を実行した場合、または no-op（不一致）の場合。Step 3 編集で version++ された後、古い planHash のタスクが来たら no-op になる挙動は仕様どおり。

4. **planHash 比較**
   - taskIndex の `planHash` と payload の `planHash` を比較
   - 不一致 → no-op（taskIndex が存在するので、executed/noop で更新して 200）

### 5.3 本処理（no-op でない場合）

taskType に応じて以下を実行。**status の現在値を確認し、遷移可能な場合のみ更新**する。

#### startTournament

| 条件 | 動作 |
|------|------|
| status === 'scheduled' かつ !runtime.startedAt | status=running, startedAt 設定。本処理成功 |
| それ以外 | 本処理はスキップ（no-op 相当だが、version/hash は一致しているので「実行済み扱い」でよい） |

#### closeRegistration

| 条件 | 動作 |
|------|------|
| status === 'running' かつ !runtime.registAt | status=registered, registAt 設定。本処理成功 |
| それ以外 | 同上 |

※ runtime の `registAt` は現行 controlHook で使用しているフィールド名を維持する。regClosedAt との使い分けは既存コードに従う。

### 5.4 taskIndex への実行結果反映

新 payload の場合、結果に応じて taskIndex を更新する。フィールドは **spec.md 1.2** に定義済みの `lastRunAt`, `lastRunResult` を使用する。Step 4 の taskIndex 定義（7.1）にもこれらを追記すること。

| 結果 | taskIndex の更新内容 |
|------|----------------------|
| 本処理実行（status 遷移した） | `enqueueState: 'executed'`, `lastRunAt: now`, `lastRunResult: 'success'` |
| no-op（version/hash 不一致） | `enqueueState: 'executed'`, `lastRunAt: now`, `lastRunResult: 'noop'`（**taskIndex が存在する場合のみ**） |
| 本処理スキップ（既に開始済み等） | 同上（lastRunResult: 'noop'） |
| エラー（例外発生） | `enqueueState: 'failed'`, `error: { code, message, at }`（taskIndex が存在する場合のみ） |

**統一ルール**：taskIndex が存在しない no-op の場合は書き込みを行わない。存在する場合のみ更新する（5.2 の処理順序により、version/hash 不一致時は必ず taskIndex が存在する）。

**推奨（任意）**：運用・デバッグのため、`noopReason` を taskIndex またはログに持たせると後が楽。必須ではない。

| noopReason | 意味 |
|------------|------|
| `version_mismatch` | schedulePlanVersion と planVersion が不一致 |
| `hash_mismatch` | taskIndex.planHash と payload.planHash が不一致 |
| `state_already_done` | status が既に遷移済み（例：startedAt が設定済み） |
| `missing_taskIndex` | taskIndex が存在しない（この場合は taskIndex 更新なしのためログのみ） |

### 5.5 トランザクションの扱い

**transaction 内で tournament, runtime, taskIndex を読んで判定 → まとめて更新** とする。並行で Step 4 が taskIndex を更新している可能性があるため、同一トランザクション内で読み取り～判定～更新を行うことで整合性を担保する。

- taskIndex が存在しない no-op の場合はトランザクション開始前に early return するため、taskIndex 更新は行われない

---

## 6. 旧 payload の扱い（後方互換）

### 6.1 維持するロジック

`action` と `rev` による startRev/registRev チェックおよび status 遷移は **変更しない**。既存の enqueueStartTask/enqueueRegistTask で投入されたタスクがキューに残っている期間、それらが正常に処理されるようにする。

### 6.2 旧 payload 時の taskIndex

旧 payload では taskIndex を読まない・更新しない。startRev/registRev のみで判定する。

### 6.3 enqueueState の遷移ルール

| 遷移 | 担当 | 備考 |
|------|------|------|
| pending → enqueued | Step 4（enqueue） | Cloud Tasks 投入成功時 |
| enqueued → executed | Step 6（controlHook） | 本処理または no-op 完了時 |
| enqueued → failed | Step 6 | 例外発生時。Step 4 の投入失敗時も failed |
| executed/failed → pending | Step 4 のみ | planHash 不一致で再投入する際。Step 6 は巻き戻さない |

### 6.4 廃止計画

Step 7/8 で enqueueStartTask/enqueueRegistTask を削除し、キューに旧 payload タスクが残らなくなった時期を見計らって、旧 payload の受付を削除する。本ステップでは**両方を受け付ける**。

---

## 7. エラーハンドリング

### 7.1 新 payload

| 状況 | HTTP レスポンス |
|------|-----------------|
| taskType が不正 | 400 |
| tournamentId / planVersion / planHash が無い | 400 |
| tournament が存在しない | **404**。taskIndex が存在すれば `failed` に更新（観測性確保） |
| runtime が存在しない | **404**。同上 |
| taskIndex が存在しない | 200 no-op（更新なし）。ログに一意キーを出力（7.3） |
| no-op | 200（成功扱い） |
| 本処理成功 | 200 |
| 例外 | 500、taskIndex が存在すれば failed に更新（観測性確保） |

**採用方針（固定）**：tournament/runtime 不在時は **404** を返す。リトライしても復活しないケースが多く、タスクを「失敗で終了」させてリトライ抑止する。taskIndex があれば `enqueueState: 'failed'`、`error: { code: 'TOURNAMENT_NOT_FOUND' | 'RUNTIME_NOT_FOUND', ... }` で記録し、運用で追いやすくする。

### 7.3 taskIndex が存在しない場合のログ（必須項目）

taskIndex が無い no-op 時、観測性のためログに以下 **5 項目を必須** として出力する。

| 項目 | 取得元 |
|------|--------|
| tournamentId | payload |
| taskType | payload |
| planVersion | payload |
| planHash | payload |
| cloudTaskName | リクエストヘッダ等（取得可能な場合） |

### 7.2 旧 payload

現行どおり。必須パラメータ欠如で 400、その他で 500。

---

## 8. 変更内容（ファイル単位）

### 8.1 修正：controlHook.ts

| 種別 | 内容 |
|------|------|
| payload 分岐 | body に taskType があれば新フロー、なければ action で旧フロー |
| 新 payload 検証 | tournamentId, taskType, planVersion, planHash を必須に。taskType が startTournament/closeRegistration のいずれかであることを検証 |
| no-op 判定 | scheduledTournament.schedulePlanVersion と payload.planVersion、taskIndex.planHash と payload.planHash を比較 |
| 本処理 | taskType に応じて start/regist 相当の status 遷移を実行。遷移不可の場合はスキップ |
| taskIndex 更新 | 新 payload 時、結果に応じて enqueueState, lastRunAt, lastRunResult を更新 |
| 旧 payload | 現行ロジックを維持（startRev/registRev チェック、status 遷移） |

### 8.2 処理順序（新 payload）

1. taskType, tournamentId, planVersion, planHash の存在・妥当性チェック
2. tournament, runtime を取得 → いずれかが存在しない場合、**404 で終了**。taskIndex が存在すれば failed に更新
3. taskIndex を取得 → **存在しない場合、200 no-op で終了（taskIndex 更新なし）**
4. schedulePlanVersion と planVersion を比較 → 不一致なら taskIndex を executed/noop で更新、200 返却
5. taskIndex.planHash と payload.planHash を比較 → 不一致なら taskIndex を executed/noop で更新、200 返却
6. トランザクション内で status 遷移を実行し、taskIndex を executed/success で更新
7. 200 返却

※ taskIndex が無い場合：200 no-op で終了。**ログに 7.3 の 5 項目**（tournamentId, taskType, planVersion, planHash, cloudTaskName）を必須出力して観測性を確保する。

---

## 9. 確認観点

| # | 観点 | 期待結果 |
|---|------|----------|
| 1 | 新 payload 受付 | taskType, planVersion, planHash を含む payload で 200 が返る |
| 2 | no-op（version 不一致） | planVersion が schedulePlanVersion と異なる場合、status は更新されず 200。taskIndex が存在すれば noop 記録 |
| 3 | no-op（hash 不一致） | planHash が taskIndex と異なる場合、同上 |
| 4 | **taskIndex が存在しない場合** | 200 no-op。status は変わらない。taskIndex 更新なし（ログ出力で観測可能にすることが推奨） |
| 5 | 本処理（startTournament） | 条件を満たせば scheduled→running、taskIndex に success 記録 |
| 6 | 本処理（closeRegistration） | 条件を満たせば running→registered、taskIndex に success 記録 |
| 7 | 旧 payload 後方互換 | action, tournamentId, rev の payload で現行どおり動作 |
| 8 | 不正 payload | 必須項目欠如で 400 |
| 9 | tournament/runtime 不在 | 404。taskIndex があれば failed に更新 |
| 10 | taskIndex 不在時のログ | 7.3 の 5 項目が出力されている |

---

## 10. チェックリスト

- [ ] controlHook で taskType による payload 分岐を実装
- [ ] 新 payload の必須検証（tournamentId, taskType, planVersion, planHash）
- [ ] no-op 判定（schedulePlanVersion, planHash）
- [ ] taskType に応じた status 遷移（startTournament → start 相当、closeRegistration → regist 相当）
- [ ] taskIndex への実行結果反映（executed, lastRunAt, lastRunResult）
- [ ] 旧 payload（action, rev）の後方互換を維持
- [ ] エラー時の taskIndex 更新（failed, error）
- [ ] tournament/runtime 不在時は **404** を返し、taskIndex があれば failed に更新
- [ ] taskIndex が無い no-op 時、ログに 5 項目（tournamentId, taskType, planVersion, planHash, cloudTaskName）を出力
