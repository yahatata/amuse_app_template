# トーナメント終了・ランキングデータ設定の操作ログと取り消し実装の要点

## 1. トーナメント終了（endTournament）

### 1.1 通常終了と強制終了の区別

| 種類 | 条件 | operationName | 備考 |
|------|------|---------------|------|
| **通常終了** | validateEndTournament が `success: true`（順位・プライズ確定済み）でユーザーが終了を選択した場合。または RankingSetupPage から「終了処理を行う」で endTournament を呼んだ場合。 | `'トーナメント終了'` | 賞金は setRankingData 側で別ログ。endTournament の取り消しは「終了フラグ・卓 status の復元」のみ。 |
| **強制終了** | validateEndTournament が `success: false` かつ errorType が下記のいずれかで、ユーザーが「強制終了」を選択した場合。 | `'トーナメント強制終了'` | 賞金付与なし。取り消しは status/endedAt/卓の復元のみ。 |

**強制終了になる errorType（3 種類）**

1. **not_registered**: `scheduledTournaments.status !== 'registered'`（レジスト前など）
2. **no_prize**: `mainView.prizePool` が無い、または `mainView['1stPrize'] === undefined`（プライズ未確定）
3. **no_ranking**: 順位が 1 件も無い、またはいずれかの順位で uid/name/prize のいずれかが未設定（順位未確定）

※ `errorType === 'ended'` のときは強制終了の選択肢は出ず、終了処理は実行されない。

### 1.2 バックエンド（endTournament.ts）

- **引数追加**: `endType?: 'normal' | 'force'`（省略時は `'normal'`）、`forceReason?: 'not_registered' | 'no_prize' | 'no_ranking'`（強制時のみ）。
- **処理の流れ**:
  1. トランザクション内で「更新前」を取得: tournament の `beforeStatus`, `beforeEndedAt`、各卓の `beforeTableStatuses`（tables の status）、`tableNames`。
  2. 既存どおり tournament を `status: 'ended'`, `endedAt: now`、各卓を `status: 'open'` に更新。
  3. 成功時に `writeSingleOperationLog` を呼ぶ。
- **operationLog の出し分け**:
  - `endType === 'force'` → `operationName: 'トーナメント強制終了'`、payload に `endType: 'force'`, `forceReason` を追加。
  - それ以外 → `operationName: 'トーナメント終了'`。
- **payload 共通**: `tournamentId`, `beforeStatus`, `beforeEndedAt`, `tableNames`, `beforeTableStatuses`（取り消しに必須）。

### 1.3 Flutter（終了処理）

- **通常終了**: validate が success で最終確認後に endTournament を呼ぶときは `endType: 'normal'` を付与（または省略可）。
- **強制終了**: errorType が not_registered / no_prize / no_ranking でユーザーが強制終了を選んだとき、`endTournament.call({ tournamentId, endType: 'force', forceReason: errorType })` を渡す。
- **RankingSetupPage** から「終了処理を行う」で呼ぶ場合は通常終了として `endType: 'normal'` を渡す。

### 1.4 取り消し（undoEndTournament）

- **通常・強制どちらも同じ処理**: payload の `beforeStatus`, `beforeEndedAt`, `tableNames`, `beforeTableStatuses` で `scheduledTournaments` と各 `tables` を復元。
- 賞金は setRankingData 側で管理しているため、endTournament の取り消しでは触れない。

---

## 2. ランキングデータ設定（setRankingData）

### 2.1 操作ログ（payload）

- **operationName**: `'ランキングデータ設定'`（1 種類のみ）。
- **payload に含めるもの**:
  - `tournamentId`, `grantIdempotencyKey`, `pointType`（'pointA' | 'pointB'）。
  - **beforeMainView**: main を update する**前**の `views/main` のスナップショット（取り消しで main を復元するため）。
  - **rankingEntries**: 付与した賞金一覧。例: `[{ playerUid, rank, prizeAmount, entryId, pointType }]`。`entryId` は `sha256(grantIdempotencyKey + ':' + playerUid).slice(0,8)` で再計算可能だが、payload に持っておくと確実。

### 2.2 バックエンド（setRankingData.ts）

- main を **update する前**に `mainViewRef.get()` で現在値を取得し、`beforeMainView` として payload 用に保存。
- `_awardPrizes` を「付与した内容の配列」（playerUid, rank, prizeAmount, entryId, pointType）を返すようにし、その結果を `rankingEntries` として payload に含める。
- 成功時に `writeSingleOperationLog` を呼ぶ（`operationName: 'ランキングデータ設定'`）。

### 2.3 取り消し（undoSetRankingData）

1. **views/main の復元**: payload の `beforeMainView` で main を復元（set または update）。`updatedAt` はサーバー時刻で上書きしてよい。
2. **賞金付与の取り消し**: `rankingEntries` の各エントリについて、
   - `users/{playerUid}`: `pointA` または `pointB` を `prizeAmount` だけ減算（0 未満にならないよう max(0, current - prizeAmount)）。
   - `users/{playerUid}/pointALogs` または `pointBLogs/{date}`: `logs.{entryId}` を削除（`FieldValue.delete()`）。entryId は payload に持つか、`grantIdempotencyKey` + `playerUid` から同じハッシュで再計算。
3. **grantRecords**: `scheduledTournaments/{tournamentId}/grantRecords/{grantIdempotencyKey}` を削除（同一キーで再実行した場合に再付与できるようにするため）。
4. **SetedRanking**: `scheduledTournaments/{tournamentId}` の `SetedRanking: false` に戻す。
- トランザクションでは「全読み取り → 全書き込み」の順序を守る。

---

## 3. 共通（getActionLogs / rollbackAction / Flutter）

### 3.1 getActionLogs

- `OPERATION_NAME_TO_ACTION` に追加:
  - `'トーナメント終了'` → `'end_tournament'`
  - `'トーナメント強制終了'` → `'end_tournament_force'`（または `'end_tournament'` に統一し、表示だけ「強制終了」と出す）
  - `'ランキングデータ設定'` → `'set_ranking_data'`

### 3.2 rollbackAction

- **スキーマ**: `action` に `'end_tournament'`, `'end_tournament_force'`（分ける場合）, `'set_ranking_data'` を追加。
- **分岐**:
  - `operationName === 'トーナメント終了'` または `'トーナメント強制終了'` → `undoEndTournament(payload)`（共通）。
  - `operationName === 'ランキングデータ設定'` → `undoSetRankingData(payload)`。
- いずれも実行後に `markOperationLogRolledBack(operationId, ...)` を呼ぶ。

### 3.3 Flutter（操作履歴）

- 履歴一覧で `end_tournament` / `end_tournament_force` / `set_ranking_data` の表示名（例: 「トーナメント終了」「トーナメント強制終了」「ランキングデータ設定」）。強制終了の場合は payload の `forceReason` に応じて「理由: レジスト前」等を表示すると監査に役立つ。
- 取り消しは既存の rollbackAction 呼び出しに `action` と `operationId` を渡す（一括系ではないため対象選択は不要）。

---

## 4. 実装順序の目安

1. **endTournament**: 更新前取得 → writeSingleOperationLog（通常/強制の出し分け）→ undoEndTournament → rollbackAction / getActionLogs 対応 → Flutter で endType/forceReason 送信と表示・取り消し。
2. **setRankingData**: beforeMainView 取得・_awardPrizes の返り値 → writeSingleOperationLog → undoSetRankingData → rollbackAction / getActionLogs 対応 → Flutter で表示・取り消し。
