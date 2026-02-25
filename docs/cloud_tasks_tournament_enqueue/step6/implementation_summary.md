# Step 6 実装サマリ

## 概要

changeSpec Step 6 に従い、controlHook を **新 payload（taskType, planVersion, planHash 等）** に対応させた。Step 4 で enqueueTournamentTask が投入する payload を受付・処理し、no-op 判定と taskIndex への実行結果反映を行う。旧 payload（action, rev）は後方互換のため維持。

---

## 1. 確認観点とテスト結果

| # | 観点 | 期待結果 | 検証 |
|---|------|----------|------|
| 1 | 新 payload 受付 | taskType, planVersion, planHash を含む payload で 200 が返る | ✓ step6_controlHook.spec.ts |
| 2 | no-op（version 不一致） | planVersion が schedulePlanVersion と異なる場合、status は更新されず 200。taskIndex が存在すれば noop 記録 | ✓ step6_controlHook.spec.ts |
| 3 | no-op（hash 不一致） | planHash が taskIndex と異なる場合、同上 | ✓ step6_controlHook.spec.ts |
| 4 | taskIndex が存在しない場合 | 200 no-op。status は変わらない。taskIndex 更新なし（ログ出力で観測可能） | ✓ step6_controlHook.spec.ts |
| 5 | 本処理（startTournament） | 条件を満たせば scheduled→running、taskIndex に success 記録 | ✓ step6_controlHook.spec.ts |
| 6 | 本処理（closeRegistration） | 条件を満たせば running→registered、taskIndex に success 記録 | ✓ step6_controlHook.spec.ts（観点6） |
| 7 | 旧 payload 後方互換 | action, tournamentId, rev の payload で現行どおり動作 | ✓ step6_controlHook.spec.ts |
| 8 | 不正 payload | 必須項目欠如で 400、taskType 不正で 400 | ✓ step6_controlHook.spec.ts |
| 9 | tournament/runtime 不在 | 404。taskIndex があれば failed に更新 | ✓ step6_controlHook.spec.ts |
| 10 | taskIndex 不在時のログ | 7.3 の 5 項目（tournamentId, taskType, planVersion, planHash, cloudTaskName）が出力される | ✓ ログ確認。cloudTaskName は X-CloudTasks-TaskName ヘッダから取得可能なら載せる（取れなければ null） |
| - | POST 以外 | 405 Method Not Allowed | ✓ step6_controlHook.spec.ts |
| - | Bearer 認証なし | 401 Unauthorized | ✓ step6_controlHook.spec.ts |

---

## 2. 変更・修正ファイル

### 2.1 修正：controlHook.ts

**パス**: `functions/src/shared/http/controlHook.ts`

| 種別 | 内容 |
|------|------|
| payload 分岐 | body に taskType があれば新フロー、action があれば旧フロー、いずれも無ければ 400 |
| 新 payload 検証 | tournamentId, taskType, planVersion, planHash を必須に。taskType が startTournament/closeRegistration のいずれかであることを検証 |
| no-op 判定 | scheduledTournament.schedulePlanVersion と payload.planVersion、taskIndex.planHash と payload.planHash を比較 |
| 本処理 | taskType に応じて start/regist 相当の status 遷移を実行。遷移不可の場合は noop 扱いで taskIndex 更新 |
| taskIndex 更新 | 新 payload 時、結果に応じて enqueueState, lastRunAt, lastRunResult を更新 |
| tournament/runtime 不在 | 404 を返す。taskIndex が存在すれば enqueueState: 'failed', error: { code, message, at } で更新 |
| taskIndex 不在時 | 200 no-op。ログに 5 項目を必須出力。cloudTaskName は X-CloudTasks-TaskName ヘッダから取得可能なら載せる |
| 例外時 | 500 を返す。taskIndex が存在すれば failed に更新 |
| 旧 payload | 現行ロジックを維持（startRev/registRev チェック、status 遷移） |

### 2.2 修正：tasks.ts（Step 4 反映）

**パス**: `functions/src/domains/tournament_createTournament/services/tasks.ts`

| 種別 | 内容 |
|------|------|
| enqueueTournamentTask | changeSpec 13 に従い、deterministic taskName を設定して重複投入防止 |
| taskName 形式 | `${queuePath}/tasks/${tournamentId}-${taskType}-${planHash}`（特殊文字は `_` に置換） |
| planHash 長さ | 衝突リスク回避のため 32 文字（computePlanHash の戻り値。spec「16文字程度」より延長） |

---

## 3. テスト結果

### 3.1 Step 6 テスト（12 件）

```
PASS __tests__/tournament_createTournament/step6_controlHook.spec.ts
  Step 6: controlHook 新 payload 対応
    観点1: 新 payload 受付
      ✓ taskType, planVersion, planHash を含む payload で 200 が返る
    観点2: no-op (version 不一致)
      ✓ planVersion が schedulePlanVersion と異なる場合、status は更新されず 200
    観点3: no-op (hash 不一致)
      ✓ planHash が taskIndex と異なる場合、同上
    観点4: taskIndex が存在しない場合
      ✓ 200 no-op。status は変わらない。taskIndex 更新なし
    観点5: 本処理 (startTournament)
      ✓ 条件を満たせば scheduled→running、taskIndex に success 記録
    観点6: 本処理 (closeRegistration)
      ✓ 条件を満たせば running→registered、taskIndex に success 記録
    観点7: 旧 payload 後方互換
      ✓ action, tournamentId, rev の payload で現行どおり動作
    観点8: 不正 payload
      ✓ 必須項目欠如で 400
      ✓ taskType が不正で 400
    観点9: tournament/runtime 不在
      ✓ 404 を返す。taskIndex があれば failed に更新
    認証・メソッド
      ✓ POST 以外で 405
      ✓ Bearer 無しで 401

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

### 3.2 実行コマンド

```bash
cd functions && npm test -- __tests__/tournament_createTournament/step6_controlHook.spec.ts --runInBand
```

**前提**: Firestore Emulator 起動（`firebase emulators:start --only firestore`）

---

## 4. changeSpec 反映状況

### 4.1 Step 6 changeSpec 反映

| セクション | 反映内容 |
|------------|----------|
| 4.1 payload 分岐 | taskType あり→新、action あり→旧、いずれも無し→400 |
| 4.2 新 payload 必須項目 | tournamentId, taskType, planVersion, planHash 検証 |
| 5.1 taskType 検証 | startTournament / closeRegistration のみ許可 |
| 5.2 no-op 判定 | tournament/runtime 取得→taskIndex 取得→version/hash 比較。taskIndex 無しは 200 no-op＋ログ 5 項目 |
| 5.3 本処理 | startTournament: scheduled→running、closeRegistration: running→registered |
| 5.4 taskIndex 更新 | executed/success、executed/noop、failed（エラー時） |
| 7.1 エラーハンドリング | 404（tournament/runtime 不在）、taskIndex failed 更新 |
| 7.3 taskIndex 不在時ログ | tournamentId, taskType, planVersion, planHash, cloudTaskName |
| 6.1 旧 payload | startRev/registRev チェック、status 遷移は変更なし |

### 4.2 Step 4 changeSpec 反映（本実装で追加）

| セクション | 反映内容 |
|------------|----------|
| 13 重複投入防止 | enqueueTournamentTask に deterministic taskName を設定。planHash は 32 文字（taskName 衝突回避） |

### 4.3 enqueueState 遷移ルール（Step 4 と Step 6 の関係）

| 状態 | Step 4 の扱い | Step 6 の扱い |
|------|---------------|---------------|
| pending | 投入対象。30日以内なら Cloud Tasks 投入 | — |
| enqueued | 計画一致ならスキップ | controlHook 実行後に executed に更新 |
| executed | **計画一致ならスキップ**（再投入しない） | — |
| failed | 計画一致なら pending に戻して再投入可 | 例外時等に failed に更新 |

**重要**：Step 4 は `planHash` 不一致時に taskIndex を **pending に上書き**する（7.2）。計画変更後は再投入される。`executed` は「計画一致なら完了扱い」であり、矛盾なし。

---

## 5. デプロイと運用

### 5.1 デプロイ順序

1. 本ステップ（Step 6）をデプロイ
2. `ENQUEUE_SCHEDULER_ENABLED=true` に設定
3. Step 4 Scheduler および Step 5 作成経路からの enqueue を有効化

### 5.2 注意点

- Step 6 デプロイ前に Scheduler を有効にすると、新 payload で投入されたタスクが controlHook で処理できずエラーになる
- 旧 payload（action, rev）のタスクがキューに残っている間は両方受付するため、段階的移行が可能
- **Step 7 実施後**：enqueueStartTask/enqueueRegistTask は削除済み。旧 payload 受付は残存タスク処理のためのみ残る

---

## 6. チェックリスト（changeSpec 10）

- [x] controlHook で taskType による payload 分岐を実装
- [x] 新 payload の必須検証（tournamentId, taskType, planVersion, planHash）
- [x] no-op 判定（schedulePlanVersion, planHash）
- [x] taskType に応じた status 遷移（startTournament → start 相当、closeRegistration → regist 相当）
- [x] taskIndex への実行結果反映（executed, lastRunAt, lastRunResult）
- [x] 旧 payload（action, rev）の後方互換を維持
- [x] エラー時の taskIndex 更新（failed, error）
- [x] tournament/runtime 不在時は **404** を返し、taskIndex があれば failed に更新
- [x] taskIndex が無い no-op 時、ログに 5 項目（tournamentId, taskType, planVersion, planHash, cloudTaskName）を出力
- [x] closeRegistration 本処理の自動テスト（観点6）
