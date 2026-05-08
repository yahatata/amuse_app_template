# I1_事後イベント業務ルールとデータ契約_ToBe意思決定

参照元:

- [../01_改修項目再編.md](../01_改修項目再編.md)
- [../02_AsIs/I1_事後イベント業務ルールとデータ契約_AsIs.md](../02_AsIs/I1_事後イベント業務ルールとデータ契約_AsIs.md)
- [../03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md](../03.1_前提再設計/step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md)
- [../03.1_前提再設計/step3.11_未決論点の再決定/14_status_summary_pending管理.md](../03.1_前提再設計/step3.11_未決論点の再決定/14_status_summary_pending管理.md)
- [../03.1_前提再設計/step3.11_未決論点の再決定/17_既存データ互換移行方針.md](../03.1_前提再設計/step3.11_未決論点の再決定/17_既存データ互換移行方針.md)

## 1. このファイルの役割

本ファイルは、事後イベントの返金・追加徴収・未収・ポイント返還・営業日境界・イベント種別について、Step4 の仕様書に入る前に ToBe 方針を確定するための作業ファイルである。

ここでは「今どうなっているか」ではなく、「今後どうあるべきか」を決める。ただし、判断は必ず AsIs に書かれた事実を前提に行う。

## 2. この項目の進め方

1. まず Codex が、各論点について chat で現状と問題箇所を平易な言葉で整理する
2. 各論点について、次の 5 点を必ず chat に出す
   - どこに問題があるか
   - 何が問題か
   - Codex だけで判断してよいか
   - ユーザーが決める必要があるか
   - 改善案または選択肢は何か
3. Codex が判断できるものは、その場で推奨案と根拠を説明する
4. ユーザー判断が必要なものは、判断事項と推奨案、代替案を提示し、会話で決定する
5. 決まった内容を本ファイルの「決定記録」に追記する
6. 論点がすべて `決定済み` または `非対象` になったら、Step4 の仕様書へ進む

## 3. 今回フォーカスする論点

| 論点ID | フォーカスする問題 | 主な問題箇所 | 暫定判断区分 | 初期状態 |
|--------|--------------------|--------------|--------------|----------|
| I1-01 | 返金方法の値体系が既存の支払手段体系とずれている | `functions/src/domains/bills/callables/refundProcessing.ts`, `functions/src/domains/bills/repos/postEventRefund.ts`, `lib/Accounting/postAccountingRefundDialog.dart` | ユーザー判断あり | 未整理 |
| I1-02 | 追加徴収と返金を、売上差分と実入出金にどう分けて持つか | `adjustments`, `cashActions`, 親 `bills` doc の `currentSummary`, `postSettlementState` | ユーザー判断済み | 決定済み |
| I1-07 | 返金・追加徴収の支払内訳を単一 `method` で持つか、`byMethod` 配分まで持つかが未確定 | `cashActions`, 親 `bills` doc の `paymentsSummary.byMethod`, analytics 集計設計 | ユーザー判断あり | 未整理 |
| I1-03 | 減額可能範囲の考え方が利用者に伝わらず、仕様の説明責任が弱い | `functions/src/domains/bills/repos/postEventAdjustment.ts`, 各 adjustment UI | Codex 主導で整理可能、一部ユーザー判断あり | 未整理 |
| I1-04 | `selectedBusinessDateKey` が公開契約に乗っておらず、曖昧営業日で処理を完結できない | `functions/src/domains/bills/callables/refundProcessing.ts`, `functions/src/domains/bills/callables/updateAccounting.ts`, `calcBusinessDate()` を使う Repo 群 | Codex 主導で整理可能、一部ユーザー判断あり | 未整理 |
| I1-05 | 返金時のポイント/残高返還をどこまで同時処理に含めるかが未確定 | `processRefund` 系 Callable, `users` コレクション, ポイント残高運用 | ユーザー判断が必要 | 未整理 |
| I1-06 | 金額を伴わない注記のみ event を持つかが未確定 | `adjustments` 設計, UI 導線 | ユーザー判断が必要 | 未整理 |

## 4. chat で必ず整理する内容

各論点について、chat では次の順で整理する。

1. 現状:
   - 何が起きているか
   - どのページ、どのファイル、どのコレクションに関係するか
2. 問題:
   - 利用者から見て何が困るか
   - システムとして何が曖昧か
3. 判断主体:
   - Codex が決めてよい技術設計か
   - ユーザーが決めるべき業務ルールか
4. 改善案:
   - Codex 判断なら推奨構成とその理由
   - ユーザー判断なら選択肢、推奨案、比較ポイント
5. 決定後の出口:
   - Step4 の仕様書で何を書けるようになるか

## 5. 決定記録

### 5.1 決定済み

- `I1-01`: 金銭返金の方法は返金専用 enum で管理する。初期の正式値は `cash`, `bank_transfer`, `card_reversal`, `other` とする
- `I1-01`: `pointA`, `pointB`, `sideGameChip` は金銭返金 method に含めない。ポイント/残高返還は `I1-05` の別処理として扱う
- `I1-01`: current-scope は未リリース前提のため、既存開発データを新契約へ migration / backfill することは要求しない。新しい正式スキーマは、新規に生成されるデータから適用する
- `I1-07`: 返金・追加徴収は単一 `method` ではなく複数内訳を持てるデータ構造で扱う
- `I1-07`: 返金では「何で返したか」だけでなく、「どの adjustment をどれだけ解消したか」を `cashActions.allocations[]` で追えるようにする
- `I1-07`: 具体的には、1 回の `cashAction` に `allocations[]` を必須とし、`cashAction.amountIncl = allocations[].amountIncl の合計` を満たす
- `I1-07`: 返金 UI では元の支払内訳と、各方法であといくら返せるかを確認できる必要がある。この表示具体化は `I2` で扱う
- `I1-02`: 追加徴収や返金は「請求内容を変える adjustment」と「実際に金が動く cashAction」を分けて扱う
- `I1-02`: 会計確定時の土台は `settlementCycles/{cycleNo}/baselineSnapshot` に 1 doc の full snapshot として持つ
- `I1-02`: 実際の受領 / 返金記録は `bills/{billId}/settlementCycles/{cycleNo}/cashActions/{cashActionId}` に保存する前提とする
- `I1-02`: `cashActions` は adjustment 配下ではなく cycle 配下に置き、1 回の cashAction が複数 adjustment をまたげるようにする
- `I1-02`: `cashActions.allocations[]` は必須とし、どの adjustment をどれだけ解消したかを持つ
- `I1-02`: 未解消残額は adjustment 側の `requiredActionRemainingIncl` に持つ
- `I1-02`: 親 doc では `status = post_settlement_pending` と `postSettlementState.requiredActionType / requiredActionIncl` で今必要な対応を読む
- `I1-02`: 親 doc では `reopenSummary.currentSettlementCycle / latestSettledCycle` を持ち、`reopen` の時だけ cycle を進める
- `I1-02`: `partially_paid`, `partially_refunded`, `refunded` のような追加 status は current-scope では採用しない
- `I1-02`: 追加徴収や返金の実績は、親 doc の `currentSummary` と `postSettlementState.totalCollectedIncl / totalRefundedIncl` に反映し、未解消差額は `requiredActionType / requiredActionIncl` に反映する
- `I1-05`: ポイント/残高返還は金銭返金と同じ event に埋め込まず、明示的な関連処理として扱う。同じ operator workflow から連続実行できてもよいが、履歴上は別責務として残す
- `I1-06`: 金額を伴わない注記のみ event は今回の本番化スコープには含めない
- `I1-03`: 減額可能範囲のサーバ制約自体は維持する。UI と仕様書では「現在の減額可能上限」と「なぜ不可か」を説明できるようにする
- `I1-04`: `selectedBusinessDateKey` は refund / adjustment / cancel / reopen の全操作で公開契約に含める
- `I1-04`: `AMBIGUOUS` 時は共通の候補営業日選択フローで再試行し、利用者が選んだ営業日を event に記録する

### 5.2 ユーザー判断待ち

- なし

### 5.3 Codex 側で整理して提案するもの

- なし

### 5.4 保留

- なし

## 6. Step4 に進める条件

- 返金方法の値体系が決まっている
- 追加徴収 / 返金を `adjustments` と `cashActions` に分けて扱う前提が決まっている
- `baselineSnapshot` を cycle 配下 1 doc の full snapshot として持つ前提が決まっている
- `cashActions` を cycle 配下に置き `allocations[]` を必須にする前提が決まっている
- `requiredActionRemainingIncl` を adjustment 単位で持つ前提が決まっている
- `currentSettlementCycle / latestSettledCycle` を親 doc で持ち、`reopen` の時だけ cycle を進める前提が決まっている
- 親 doc では `post_settlement_pending` と `requiredActionType / requiredActionIncl` で current-state を読む前提が決まっている
- unreleased 前提で migration / backfill 不要とする current-scope 方針が決まっている
- 曖昧営業日の再試行フローが refund / adjustment / cancel / reopen でそろっている
- ポイント/残高返還の責務範囲が決まっている
- 必要なら注記のみ event の扱いが決まっている
