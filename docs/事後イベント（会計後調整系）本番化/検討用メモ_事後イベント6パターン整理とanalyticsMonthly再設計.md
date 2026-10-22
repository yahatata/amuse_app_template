# 検討用メモ_事後イベント6パターン整理とanalyticsMonthly再設計

> この文書は **検討用メモ** です。2026-04-08 時点の議論・暫定整理・懸念・未決事項を失わないために残すものであり、**最終仕様書ではありません**。  
> 未確定の案、今後覆る可能性がある整理、追加調査が必要な論点を含みます。

## 1. このメモを書いたタイミング

このメモは、`docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/` で Step3 の ToBe 意思決定を `I1` から `I5` まで進め、**Step4 の仕様書作成に入る直前**に作成している。

この時点では、当初「残る判断は少ない」と見えていたが、`bills` と `analyticsMonthly` の関係を詳細に追った結果、**事後イベント本番化そのものの根本設計に関わる追加検討が必要**であることが分かった。

## 2. このタイミングでどこまで決まっていたか

### 2.1 既にかなり固まっていたこと

`仕様実装管理/03_ToBe意思決定/` では、主に次の内容が決まっていた。

- 事後イベントは `refund / adjustment / cancel / reopen` の既存 event モデルを前提に整理していた
- 金銭返金 method は返金専用 enum とし、`cash`, `bank_transfer`, `card_reversal`, `other` を正式値とする
- 返金・追加徴収は単一 method ではなく複数内訳を持てる方向で整理する
- 追加徴収は「請求額 adjustment」と「実際の collection」を分離する
- 実際の受領記録は `/bills/{billId}/postSettlementCollections` に保存する方針とする
- post-settlement collection により未収が残る場合の status として `partially_paid` を新設する
- 会計管理画面の「会計完了」は「会計後管理」に改名し、post-settlement 系 status を同一導線で扱う
- `refund / adjustment / cancel / reopen` に対して `selectedBusinessDateKey` を公開契約に含める
- `refund / adjustment / reopen` を analytics に差分反映する方向で整理する
- `reopen` は analytics 上で rollback し、再 settle 時に再加算する方向で整理する
- analytics 失敗は bill 本体処理をロールバックせず、検知・再処理可能な設計にする

### 2.2 当初「残る判断」と見えていたもの

当初は、Step4 前に残る判断は次のように見えていた。

- `cancel / voided` を analyticsMonthly でどう扱うか
- `postSettlementCollections` を analyticsMonthly にどこまで反映するか

しかし、その後の整理で、これは単なる analyticsMonthly 更新 field の話ではなく、**事後イベントそのものの切り方**、**売上と入出金の分離**、**pending 状態の管理**、**営業日帰属の扱い**まで含むと分かった。

## 3. このタイミングで残っていたタスク

このメモ作成時点で、Step4 に入る前に残っていたタスクは次のとおりである。

1. `analyticsMonthly` が現状何を表しているかを正確に把握すること
2. 事後イベントを event type 単位ではなく、業務パターン単位で考え直す必要があるかを整理すること
3. `返金` と `調整（減額）` の違いを仕様上どう切り分けるかを整理すること
4. `返金前 / 返金済`, `追加徴収前 / 追加徴収済` の pending/completed 状態をどう表すかを整理すること
5. 未会計 bills と一部未徴収 bills の関係を整理すること
6. 売上の帰属日と実際の入出金日をどのように analyticsMonthly に反映するかを整理すること
7. 複数の事後イベントが重なったときでも整合性が壊れない設計にすること

## 4. このタイミングで何を考慮し、何を検討したか

この段階で主に次の観点を考慮して検討した。

### 4.1 現状の analyticsMonthly の実態

現状コードを調査した結果、analyticsMonthly は実質的に **「bill が初回に settled になった時点のスナップショット集計」** であると分かった。

- 会計直後には `billsOnSettle` から `enqueueSettlement` が呼ばれる
- 閉店時には `migrateSettledBillsForBusinessDay` が取りこぼしを補完する
- この 2 ルートは最終的に同じ `processBillAnalyticsAtomically` を呼ぶため、**初回 settled 集計という範囲では一致する**
- しかし `refund / adjustment / cancel / reopen` は現在 analyticsMonthly に接続されていない
- そのため、analyticsMonthly は **bill の現在の最終財務状態** を表してはいない

### 4.2 event type 単位ではなく、業務パターン単位で考える必要性

現状の event type である

- `refund`
- `adjustment`
- `cancel`
- `reopen`

だけで考えると、次のような違いが埋もれる。

- 売上が減ったのか
- 金銭が返されたのか
- 売上は増えたが、まだ回収していないのか
- 会計後キャンセルは「全額減額 + 返金」と見るべきではないか

そのため、event type ではなく、業務パターンとして次の 6 パターンで考える方が自然ではないか、という検討に進んだ。

1. 減額 + 返金済
2. 減額 + 返金前
3. 増額 + 追加徴収済
4. 増額 + 追加徴収前
5. 会計後キャンセル
6. 未会計キャンセル

### 4.3 `返金` と `調整（減額）` の違いの整理

ここで重要だったのは、`返金` と `調整（減額）` は同じではない、という整理である。

- `調整（減額）` は、**本来の請求額・売上を下げること**
- `返金` は、**既に受け取っていた金銭を返すこと**

つまり、

- 調整（減額） = 請求・売上の話
- 返金 = 金銭移動の話

であり、両者は同時に起こることもあるが、本質的には別である。

### 4.4 pending 状態の必要性

この整理を進めると、現在の設計では次が不足していると見えてきた。

- `追加徴収前` は `balanceDueIncl` や `partially_paid` である程度表現できる
- しかし `返金前`、つまり「売上は下げたがまだ金を返していない」状態を表す field / status / subcollection がない

このため、`refundDueIncl` 相当の親 doc field や、pending refund の正本になる subcollection が必要ではないか、という論点が発生した。

### 4.5 未会計 bills との関係

さらに、既存実装としてすでに存在する **閉店時の未会計 bills** と、今回新たに発生する **一部未徴収 bills** が運用上似ていることも問題になった。

既存実装では、閉店時に未会計の bill に `closeSnapshot.unresolved = true` を付け、`users.unsettledBillsCount` を増やし、専用画面で後から会計できるようにしている。

関連する既存実装:

- `functions/src/domains/storeMeta/services/applyCloseSnapshot.ts`
- `functions/src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting.ts`
- `lib/Accounting/unsettledAccountingPage.dart`

これに対して、今回の一部未徴収 bills は

- 既に settled した bill に対し、post-settlement で追加債権が発生している
- 運用上は「あとで回収するもの」という点で未会計 bills に近い
- ただし完全な未会計ではないため、データモデルは別であるべき

という整理になった。

### 4.6 売上帰属日と実入出金日のズレ

この検討の中で特に大きかったのは、**売上の帰属日** と **実際に金銭が動いた日** を同じ扱いにしてよいか、という論点である。

特に次の場合に問題が出る。

- 閉店時未会計 bill を翌日以降に会計した場合
- 追加徴収前だった bill を後日回収した場合
- 減額済みだが返金前だった bill を後日返金した場合

既存 `bill.businessDate` は元の営業日を表しているが、後日回収や後日返金の **実際の金銭移動日** は別である。

このため、少なくとも post-settlement collection / refund の event には

- `originBusinessDate`
- `actualCashflowBusinessDate`

のような形で、売上帰属日と実入出金日を分けて持つ必要があるのではないか、という検討が必要になった。

## 5. このタイミングで出した案

### 5.1 6パターンによる整理案

議論の中で、事後イベントを次の 6 パターンで整理する案が出た。

1. 減額 + 返金済
2. 減額 + 返金前
3. 増額 + 追加徴収済
4. 増額 + 追加徴収前
5. 会計後キャンセル
6. 未会計キャンセル

この整理は、analyticsMonthly の更新を考える時だけでなく、UI、status、親 doc の field、subcollection、監査ログを整理する軸としても有効ではないかと考えた。

### 5.2 減額を item / tournament 等の具体明細で持つ案

減額時には、単に「1000円減額」ではなく、

- どのカテゴリから
- どの商品から
- どのトーナメントのどの要素から

減額したのかを bill 側に残す案が出た。

理由:

- `analyticsMonthly.byCategory`
- `analyticsMonthly.byUser`
- `analyticsMonthly.byTemplateTournaments`
- 商品別売上

を正確に打ち消すには、「何を減らしたか」が必要だからである。

### 5.3 増額を 2 パターンにする案

増額については、次の 2 パターンを UI 上で選べるようにする案が出た。

1. `具体商品を指定して追加料金を設定する`
   - item / category / tournament を選んで追加
2. `extraCost に一括追加する`
   - 商品特定をせず追加料金として積む

これにより、必要に応じて analyticsMonthly の item / category / tournament 系集計まで精密に加算できるようにすることを狙った。

### 5.4 pending refund / pending collection を専用管理する案

次の 2 種類の pending 状態を bill 側で明示的に持つ案が出た。

- `減額 + 返金前` → pending refund
- `増額 + 追加徴収前` → pending collection

この案では、

- 親 doc に pending 額を持つ
- bills 配下の subcollection に「誰に / いつの / billId / いくら / 何が未処理か」を持つ
- 実行後は `done` が分かるように更新する

という方向で考えた。

### 5.5 未会計 bills と一部未徴収 bills を同一導線で扱う案

既存の `未会計の会計` 画面を拡張し、

- 閉店時未会計 bills
- post-settlement 一部未徴収 bills

を同じページで扱えるようにする案が出た。

ただし、両者は意味が違うため、

- 同じ画面で扱う
- ただしラベル / 処理 / データモデルは別であることが分かるようにする

という方向を前提にした。

## 6. それに伴って出てきた問題

この案を検討したことで、次のような問題が見えてきた。

### 6.1 analyticsMonthly の更新だけでは済まない

当初は「どの field を増減するか」だけを決めればよいように見えたが、実際には次が必要であることが分かった。

- event 保存モデルの再設計
- 親 doc field の再設計
- pending 状態の SoT の設計
- 日付帰属ルールの設計
- 未会計導線との接続設計

つまり、**analyticsMonthly 更新は結果であり、前段のデータモデル設計が先に必要**である。

### 6.2 元の settled snapshot を直接壊すべきか問題

減額・増額の議論を進める中で、次の懸念が出た。

- `amounts`
- `categoryBreakdown`
- `itemsSnapshot`
- `tournamentsSnapshot`
- `paymentTotals`

といった、初回 settled 時に確定した snapshot をそのまま更新してしまうと、監査性が落ちるのではないか。

そのため、

- 元 snapshot は immutable に保つ
- 事後差分は別 field / 別 summary で持つ
- analyticsMonthly には delta として反映する

方が安全ではないか、という案が出た。

### 6.3 analyticsMonthly を運用キューの SoT にしてよいか問題

一部未返金 / 未徴収のデータを analyticsMonthly 配下にも持ちたいという案が出たが、次の懸念がある。

- analyticsMonthly は集計・参照用途の月次ドキュメント群である
- 運用キューや pending タスクの SoT にすると、月またぎ・再集計・再構築時に扱いが難しくなる
- 本来の SoT は `bills` か専用 pending collection に置いた方が安全である

### 6.4 売上日と実回収日がずれる問題

これは特に大きい。

既存の未会計 bills では、会計が遅れても `businessDate` 自体は元の日のままである。  
しかし、「実際に金銭が入った日」を analyticsMonthly にどう入れるかを考えると、次のズレが出る。

- 元の bill の売上をいつの売上として見るか
- 後日回収を cashflow としてどの日に載せるか
- 既存未会計回収と post-settlement collection をどう整合させるか

これは analyticsMonthly の定義そのものに影響する。

### 6.5 複数 event が重なった時の整合性問題

次のようなケースがありうる。

- 減額 + 返金前 → 一部返金済 → さらに減額
- 増額 + 追加徴収前 → 一部回収済 → さらに増額
- 減額 + 返金前 → 会計後キャンセル
- `reopen` 後に再 settle、その後さらに post-settlement event

このため、append-only で event を積み、親 doc の summary を再計算可能にする設計が必要ではないか、という問題が出た。

## 7. それをどう解消しようとしているか（現時点では案）

> ここに書く内容は **現時点の案** であり、最終決定ではない。

### 7.1 6パターンは「保存型」ではなく「業務パターン」として扱う案

現時点では、6 パターンをそのまま低レベル event type にするより、

- 業務整理・仕様整理・UI整理の軸としては 6 パターンを使う
- ただし保存モデルでは `businessPattern`, `pending/completed`, `lines`, `cashflow`, `originBusinessDate`, `actualCashflowBusinessDate` などを持つ append-only event とする

方が良いのではないかと考えている。

### 7.2 元 snapshot は壊さず、post-settlement summary を別で持つ案

次の方針案が有力である。

- 初回 settled 時の `amounts`, `categoryBreakdown`, `itemsSnapshot`, `tournamentsSnapshot`, `paymentTotals` は immutable snapshot として保持する
- 親 doc には post-settlement 差分を反映した `effectiveSummary` または `postSettlementSummary` を別で持つ
- analyticsMonthly は immutable snapshot ではなく delta から更新する

### 7.3 pending 系の SoT を bill 配下に持つ案

`analyticsMonthly` を SoT にせず、bill 配下または専用 collection に pending 管理を置く案で考えている。

候補:

- `/bills/{billId}/postSettlementRefunds`
- `/bills/{billId}/postSettlementCollections`
- または bill 配下の統一 pending subcollection

親 doc には合計だけを持ち、詳細は subcollection を正とする案が有力である。

### 7.4 未会計と一部未徴収は共通導線、別 read model とする案

運用導線としては共通画面に寄せつつ、データ上は

- `closeSnapshot.unresolved = true` の未会計
- `postSettlementCollections` 等に基づく一部未徴収

を別種別として扱い、カードに種別ラベルを出す案が有力である。

### 7.5 売上帰属と cashflow 帰属を分ける案

まだ未決だが、有力案としては

- 売上補正は `originBusinessDate`
- 実際の入出金は `actualCashflowBusinessDate`

を分けて持ち、analyticsMonthly にも売上系 field と cashflow 系 field を分けて入れる案がある。

この場合、未会計 bill の後日回収や、一部未徴収の後日回収も整合しやすくなる。

## 8. まだ決めなければいけないこと

このメモ作成時点で、少なくとも次は未決である。

1. 6 パターンを保存モデルにどう落とすか
2. 元 snapshot を immutable にするか
3. `返金前` をどの field / status / subcollection で表すか
4. `追加徴収前` をどの field / status / subcollection で表すか
5. 未会計と一部未徴収を同じ画面でどう識別するか
6. 会計後キャンセルを「独立 event」とするか「全額版の減額 + 返金」とするか
7. 売上の帰属日と cashflow の帰属日をどう分けるか
8. 各 6 パターンで analyticsMonthly のどの field を増減するか
9. 複数 event が重なったときの親 doc 再計算ルール
10. 既存の `billsEventsOnCreate`, `enqueueEvent`, `analyticsMonthly` 旧 schema をどう移行するか

## 9. 残タスクはあるか

**ある。多数ある。**

ただし、重要なのは「何が未決か」が見えたことである。  
現時点では、単に実装に入るのではなく、次の順で固める必要がある。

1. 業務パターン
2. bills / events / pending の SoT
3. 売上日 / cashflow 日
4. analyticsMonthly 更新 matrix
5. 仕様書
6. changeSpec
7. 実装

## 10. 懸念

現時点の主な懸念は次の通りである。

- 事後イベント本番化と analyticsMonthly 再設計を同時に進めると、議論が発散しやすい
- event type と業務パターンが混ざると、仕様書に漏れが出やすい
- 元 snapshot を直接更新すると監査性が落ちる
- analyticsMonthly を運用タスクの SoT にすると、再集計や月またぎで破綻しやすい
- 未会計 bills と一部未徴収 bills の画面統合を急ぐと、データモデルが中途半端になる危険がある
- 売上帰属日と実回収日を曖昧なまま実装すると、後で analyticsMonthly の意味が揺れる
- 複数事後イベントが重なった時に親 doc の整合性が壊れる可能性がある

## 11. 先ほどのアイデアへの評価・整理表

> 下表は、この時点のアイデアに対する評価メモである。最終決定ではない。

| アイデア | 評価 | 整理・評価 |
|---|---|---|
| 6パターンで考える | `○` | とても良いです。仕様書・UI・analytics の整理軸として適切です。今の `refund / adjustment / cancel` より業務実態に合っています。 |
| `bills/events` を 6 パターンで保存する | `△` | 方向性は良いですが、`返金前 -> 返金済`、`追加徴収前 -> 追加徴収済` をどう履歴で表すかが課題です。append-only 監査にしたいので、6 パターンをそのまま 1 event type に固定するより、`businessPattern` と `pending/completed` の遷移を追える形の方が安全です。 |
| 親 doc の status / field を 6 パターンに応じて更新する | `○` | その通りです。ただし元の settled snapshot を壊さない方がよいです。`amounts`, `categoryBreakdown`, `paymentTotals`, `itemsSnapshot`, `tournamentsSnapshot` は「初回会計時の確定 snapshot」として残し、事後差分は別 field 群に持つ方が安全です。 |
| 減額時にカテゴリ・商品・トナメ単位で何を減らしたかを残す | `○` | これは必須に近いです。これがないと `byCategory`, `byUser`, `byTemplateTournaments`, 商品別売上を正確に打ち消せません。かなり良い方向です。 |
| 減額 + 返金済で、選択されたものを負のデータとして全系統に入れる | `△` | analytics 的には正しい方向です。ただし「親 doc すべてに負のデータを投入」は危険です。親 doc の元 snapshot を直接マイナス更新すると監査性が落ちます。おすすめは、元 snapshot は維持し、`postSettlementDeltas` や `effectiveSummary` を別で持つことです。analytics には負の delta を入れてよいです。 |
| 減額 + 返金前で pending refund を残す | `○` | 非常に良いです。今の ToBe に足りていない論点でした。親 doc に `refundDueIncl` 相当、subcollection に pending refund 明細、完了時に `done` が分かる状態、は自然です。 |
| 増額時に「具体商品指定」と「extraCost 一括追加」の 2 パターンを持つ | `○` | とても自然です。現場運用にも合います。UI の考え方も分かりやすいです。 |
| 増額時の具体商品指定はカテゴリ＋商品を複数選択可能にする | `○` | 良いです。特に analytics 補正や later audit に強いです。ただし、元 `itemsSnapshot` を直接書き換えず、`postSettlementAddedLines` のような別明細で持つ方が安全です。 |
| 増額 + 追加徴収済で加算を入れる | `△` | 方向性は正しいです。ただし減額時と同じで、親 doc の元 snapshot を直接増やすより、事後加算差分を別で持つ方が安全です。analytics には加算 delta を入れてよいです。 |
| 増額 + 追加徴収前で pending collection を残す | `○` | 非常に良いです。`partially_paid` とも整合します。親 doc に pending amount、subcollection に未徴収レコード、回収後の done 管理、は自然です。 |
| 閉店時未会計 bills と一部未徴収 bills は同じ画面で扱う | `○` | UI/運用としてはかなり良いです。現場では「あとで回収するもの」を一か所で見られた方がよいです。 |
| ただし完全に同じデータとしては扱わない | `○` | これも正しいです。未会計 bills は「そもそも初回会計未了」、一部未徴収 bills は「会計後に追加債権が残っている」なので、バックエンド上は別物です。 |
| `analyticsMonthly` の subcollection に未会計・一部未徴収の両方を格納したい | `△` | レポート用の複写先としてはありです。ただし **SoT にするのは非推奨** です。`analyticsMonthly` は本来集計・参照用で、運用キューや未回収タスクの正本に向きません。正本は `bills` 配下または専用 collection の方が安全です。 |
| 未会計分の後日支払いは、`bill.businessDate` ではなく実支払日で売上計上したい | `△` | 問題提起として非常に重要です。ただしこれはかなり大きな会計方針です。もしそうするなら、今の settled 集計の意味自体が変わります。これは「analytics 更新 field」だけでなく、「売上の帰属日」そのものの決定です。 |
| 実際に支払った日付キーと支払方法を bills 内で紐づける必要がある | `○` | その通りです。少なくとも `postSettlementCollections` には `collectedBusinessDateKey` と `byMethod` が必須です。さらに、閉店未会計の後日回収も実支払日を使うなら、通常決済にも「実会計日キー」を明示的に持つ必要が出ます。 |
| 一部未徴収は未会計ページで支払えるようにしたい | `○` | 良い方向です。ただし画面は共通でも、処理は別です。未会計は「通常会計完了」、一部未徴収は「既存 bill への collection 完了」です。 |
| どのカードが未会計か一部未徴収か分かるようにしたい | `○` | 必須に近いです。ラベル・色・処理ボタンを分けるべきです。 |
| 複数事後イベントが重なっても整合性が壊れないようにしたい | `○` | 最重要です。ここを壊さないためにも、append-only event と「元 snapshot + 事後差分から再計算できる親 summary」が必要です。 |

## 12. 現時点の仮説的な次の進め方

> ここも **暫定案**。

1. 事後イベント本番化そのものをすぐに Step4 へ進めるのではなく、**その前に「bills × analyticsMonthly 再設計」の設計チェックポイントを 1 段挟む**
2. そのチェックポイントでは、次の 3 つだけを先に固定する
   - 6 パターンの業務定義
   - bills / pending / 未会計の SoT 設計
   - 売上日 / cashflow 日の帰属ルール
3. その結果を受けて、既存の `I1`〜`I4` を必要箇所だけ改訂する
4. その後で Step4 仕様書を作る
5. Step5 で changeSpec とテスト設計に落とす
6. 実装は「基盤 -> bill/analytics -> UI -> テスト」の順に分けて進める

## 13. 関連ファイル

- `docs/事後イベント（会計後調整系）本番化/改修フォーカス候補.md`
- `docs/事後イベント（会計後調整系）本番化/初期検討事項まとめ.md`
- `docs/事後イベント（会計後調整系）本番化/仕様実装管理/README.md`
- `docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I1_事後イベント業務ルールとデータ契約_ToBe意思決定.md`
- `docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I4_分析・監査反映基盤_ToBe意思決定.md`
- `functions/src/domains/bills/triggers/billsOnSettle.ts`
- `functions/src/domains/bills/triggers/billsEventsOnCreate.ts`
- `functions/src/domains/analytics/services/updateAnalyticsForBill.ts`
- `functions/src/domains/analytics/services/aggregator/index.ts`
- `functions/src/domains/storeMeta/services/applyCloseSnapshot.ts`
- `functions/src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting.ts`
- `lib/Accounting/unsettledAccountingPage.dart`
