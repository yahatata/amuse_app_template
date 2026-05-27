# As-is：トーナメント置きバケ対応に向けた現状再調査

## 1. 調査目的

置きバケを **LINEミニアプリではなく店舗デバイス上で扱う** 方針へ変わった前提で、既存実装の **参加登録・待機・席配置・プライズ・アドオン・履歴／戻し・リシート・会計・terminal「未会計の会計」・終了処理・ミニアプリ** を As-is で再確認する。

**実装・詳細設計の提案は最小限**とし、コードから確認できた事実と推測を分ける。

---

## 2. 調査対象ファイル一覧

| 領域 | ファイル | 確認内容 |
|---|---|---|
| 参加登録（店舗） | `functions/src/domains/tournament_activeTournament/callables/registerParticipants.ts` | waiting・views/main・usersList・recordTournamentAction |
| 参加登録（LIFF） | `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts` | 同上（単一ユーザー・デバイス権限なし） |
| 着席 | `functions/src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts` | activeStay・bill・waiting・views/main.waitingCount（waiting から実削除時のみ -1）・seats・updatePlace |
| Bust | `functions/src/domains/tournament_activeTournament/callables/bustAndExit.ts` | activeStay・bill・views/main `playersBusted` |
| Addon | `functions/src/domains/tournament_activeTournament/callables/addon.ts` | activeStay・bill・views/main `addons`・recordTournamentAction |
| Addon一括 | `functions/src/domains/tournament_activeTournament/callables/bulkAddon.ts` | 同上（複数ユーザー） |
| リシート | `functions/src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts` | playerAssignments・activeStay・bill・tablesSeat |
| プライズ取得／保存 | `functions/.../getPrizeData.ts`, `setPrizeData.ts` | views/main のフィールド更新 |
| プライズUI計算 | `lib/tournament/active/pages/prize_setup_page.dart` | 売上・プール計算に使う counters |
| ランキング／賞金付与 | `functions/.../setRankingData.ts` | views/main・users・pointLogs |
| 終了 | `functions/.../endTournament.ts` | status・tables 解放・operationLog |
| 戻し入口 | `functions/src/domains/logs/callables/rollbackAction.ts` | 対応 action 一覧 |
| 登録戻し | `functions/src/domains/logs/services/undoRegisterParticipants.ts`, `undoRegisterForTournament.ts` | main・waiting・usersList・bill tournaments |
| 着席戻し | `functions/src/domains/logs/services/undoAssignSeatToPlayer.ts` | seats・waiting・views/main（waitingCount +1 のみ。seatedCount は更新しない） |
| 伝票トーナメント記録 | `functions/src/domains/bills/repos/recordTournamentAction.ts` | `bills/{billId}/tournaments/{templateId}` |
| 会計プレビュー | `functions/src/domains/bills/callables/getBillPreviewTotals.ts` | tournaments サブコレクション集計 |
| 精算トリガ | `functions/src/domains/bills/triggers/billsOnSettle.ts` | settled 時スナップショット・analytics enqueue |
| terminal 未会計 | `lib/Home/terminalHomePage.dart` → `UnsettledAccountingPage` | 遷移先 |
| 未会計UI | `lib/Accounting/unsettledAccountingPage.dart` | users クエリ・bills クエリ |
| Addon UI | `lib/user_actions/bulk_addon_popup.dart` | 卓 seat から userId 収集 |
| ミニアプリ | `public/user/index.html`, `functions/.../getUpcomingTournaments.ts` | 一覧・registerForTournament |

---

## 3. 参加登録・待機・席配置の現状

### 3.1 店舗デバイス側の参加登録

- **Callable**: `registerParticipants`（`registerParticipants.ts`）。呼び出し元はデバイス権限（`devices` アクティブかつ `role === 'admin'` または `options.tournament`）。
- **処理**: ユーザーごとにトランザクションで  
  - `activeStays/{userId}` 必須・`billId` 必須  
  - `scheduledTournaments/{tournamentId}/views/main` を更新（`playersIn` +1、初回は `entries` +1、リエントリー時は `reentries` +1、`waitingCount` +1）  
  - `scheduledTournaments/{tournamentId}/tablesSeat/waiting` の `waiting.{userId}` に `{ pokerName, joinedAt, order }`  
  - 初回のみ `views/usersList.users.{userId}` を更新  
- **トランザクション外**: `recordTournamentAction` で `bills/{billId}/tournaments/{templateId}` を更新（失敗時も本体は成功扱いにできる実装）。
- **操作ログ**: `writeSingleOperationLog`（操作名「参加者一括登録」、`operationLogs`）。

### 3.2 LINEミニアプリ側の通常参加登録

- **Callable**: `registerForTournament`（`registerForTournament.ts`）。**デバイスドキュメント検証はしない**（認証 UID = 対象ユーザー）。
- **前提**: `registerParticipants` と同様 **`activeStays` + `billId` 必須**。重複は `bills/{billId}/tournaments/{templateId}` の存在で検知。
- **データ更新パターン**: `views/main` の更新は **初回エントリーのみ**（`entries`・`playersIn`・`waitingCount` を増やす）。`usersList` は存在時のみマージ。

### 3.3 waiting の構造

- **パス**: `scheduledTournaments/{tournamentId}/tablesSeat/waiting`
- **フィールド**: `waiting` は **マップ**。キーは **文字列**で、実装上は **Firebase Auth の userId** が使われる（`registerParticipants` / `registerForTournament`）。
- **値**: オブジェクト時は `pokerName`, `joinedAt`, `order`（Flutter `WaitingUserData` と対応）。レガシーで `true` の値や List 形式への分岐が `tournament_data_service.dart` にある。

### 3.4 entries / playersIn / waitingCount の意味

**コードから読み取れる範囲の事実**:

- **`entries`**: `registerParticipants` で **初回エントリー時のみ** `views/main.entries` を +1。`undoRegisterForTournament` / `undoRegisterParticipants` で減算処理あり。
- **`playersIn`**: `registerParticipants` / `registerForTournament` で **待機に載せるたび** +1（初回・リエントリー両方）。**本調査の grep 範囲では**、`assignSeatToPlayer` や `bustAndExit` は `playersIn` を更新していない。
- **`waitingCount`**: 参加登録 Callable で **待機に載せるたび** +1。`undoRegisterForTournament` は waiting にいた場合に -1。`assignSeatToPlayer` は **`tablesSeat/waiting` から対象ユーザーを実際に削除したとき** `views/main.waitingCount` を -1。`undoAssignSeatToPlayer` は **着席戻し時** に `waitingCount` +1 のみ（`seatedCount` は増減しない）。
- **`assignSeatToPlayer` / `seatedCount`**: **`views/main.seatedCount` を着席時に増やす処理はない**（作成時 0 のまま forward で維持されないカウンタ）。`undoAssignSeatToPlayer` も **`seatedCount` は更新しない**（`waitingCount` のみ +1）。

**推測**: `waitingCount` / `playersIn` と実際の waiting マップ人数の整合は、現状コードだけでは常に一致するとは限らない。詳細は運用データまたは他経路の更新が必要かもしれない。**不明な点は別途ログ／本番データ確認が必要**。

### 3.5 席・テーブルデータの構造

- **パス**: `scheduledTournaments/{tournamentId}/tablesSeat/{tableId}`（`waiting` / `busted` を除く各卓）。
- **着席**: `seats.seatXXUserId` / `seatXXPokerName`（文字列。ユーザーIDが入る設計）。
- **Flutter**: `TournamentTable.fromFirestore` が `seatXXUserId` を走査。

### 3.6 assignSeatToPlayer の前提

- **デバイス権限**: `registerParticipants` と同様。
- **`activeStays/{userId}` 必須**、`billId` 必須。**`pokerName` は activeStay から**。
- **処理**: waiting に該当 user がいれば削除（そのとき `views/main.waitingCount` を -1）→ 卓 `seats` に userId／pokerName 設定 → トランザクション外で `updatePlace({ billId, table, seat })`。
- **`scheduledTournaments/.../users` への書き込みはコメントアウトされた TODO**（現状未実装）。

### 3.7 置きバケ一時参加者を既存構造に載せる場合の制約

**事実**:

- **waiting のキー**: Firestore 上は任意文字列だが、**着席・Addon・Bust・リシート・（多くの undo）は `userId` として `activeStays` / `bills` を参照する**。
- **実在しない Firebase UID** のプレイヤーを **`assignSeatToPlayer` に載せると、現状は activeStay 不存在で失敗**する。
- **席の `seatXXUserId`**: 文字列フィールドのため、** syntactic には任意 ID を書ける**が、下流の **Bust / Addon / updatePlace / recordTournamentAction は bill 紐付けを要求**する。
- **プライズ画面の「参加者数」**: `prize_setup_page.dart` では `_totalParticipants = entries + reentries`（**addons は人数に含めない**）。売上は `(entryFee * entries) + (reentryFee * reentries) + (addonFee * addons)`。

**推測（最小）**: 店舗デバイスだけで「オキバケA」を運用する場合、**既存 Callable をそのまま使うには「何らかの userId」と通常フローと整合する bill／activeStay の扱いが必要**、または **Callable／データモデル変更が必要**。詳細は実装フェーズの論点。

---

## 4. プライズ計算の現状

### 4.1 参照元データ

- **Flutter `PrizeSetupPage._calculateInitialValues`**（`prize_setup_page.dart`）:  
  `getPrizeData` で取得した **`views/main`** から  
  `entries`, `reentries`, `addons` と、スナップショット由来の `entryFee`, `reentryFee`, `addonFee` を読み、**売上 `_totalRevenue`** と **プライズプール** を計算。  
  `setPrizeData` で **`views/main` に prize 関連フィールドを書き戻す**（`setPrizeData.ts`）。

### 4.2 entries / playersIn との関係

- **プライズ売上計算に `playersIn` は使われていない**（当該 Flutter コードパス）。
- **`playersIn` が waiting／着席のどちらを表すかは、§3.4 のとおりコード上あいまい**。

### 4.3 アドオン・リエントリーの反映

- **売上**: `addons` カウンタ × `addonFee` が `_totalRevenue` に加算される。
- **リエントリー**: `reentries` × `reentryFee`。

### 4.4 置きバケ参加費を反映する場合の論点

**事実**: プライズ画面の売上は **`views/main` の `entries` / `reentries` / `addons` とテンプレ料金**に依存。`bills` の実チャージを直接読んでいない。

**推測**: 「いつプライズに効かせるか」は **いつこれらのカウンタと bills 側 tournament ドキュメントを更新するか**の設計になる。As-is だけでは「席配置時が自然」等は **断定しない**（現状は **登録時に recordTournamentAction** が走る経路が標準）。

---

## 5. アドオン処理の現状

### 5.1 UI

- **卓単位まとめて**: `lib/user_actions/bulk_addon_popup.dart` が `tablesSeat/{tableId}.seats` の `seatXXUserId` を走査し着席ユーザーを抽出、`bulkAddon` を呼ぶ構成。
- **単体 Addon**: `addon` Callable（単体 Addon の Flutter 呼び出し箇所は本調査で未網羅）。

### 5.2 Callable / service

- **`addon`**（`addon.ts`）: `operationId`, `tournamentId`, `userId`, `pokerName` …  
- **`bulkAddon`**（`bulkAddon.ts`）: 複数ユーザーに対し同様の処理。

### 5.3 Firestore 更新先

- **`views/main.addons` を +1**（ユーザー単位／一括で成功分の人数ぶん）。
- **`recordTournamentAction`** で `bills/{billId}/tournaments/{templateId}` の `addonCount` 等を更新。
- **Addon 可能チェック**: `bills/.../tournaments/{templateId}` の既存 `addonCount`。

### 5.4 bills / views / プライズ / 履歴 / リシートへの反映

- **bills**: `recordTournamentAction` 前提。
- **views/main**: `addons` カウンタ。
- **プライズ**: 確定画面は §4 の counters に依存。
- **履歴**: `writeSingleOperationLog`（単体 Addon／一括 Addon でペイロード異なる）。
- **リシート**: 本調査では **専用「リシート生成」Callable は未特定**。リシート相当が operationLog や別ドキュメントにあるかは **追加調査が必要（不明）**。

### 5.5 置きバケ一時参加者との関係

**事実**: Addon は **`activeStays` と `billId` 必須**。着席している `userId` が必要。

**推測**: bill／activeStay を持たない一時参加者には **現状 Addon Callable はそのまま使えない**。「意思だけ保持しスタッフが手動 Addon」は **UI とデータの両方で別経路が必要**。

---

## 6. トーナメント履歴・戻し処理の現状

### 6.1 履歴保存先

- **`operationLogs` コレクション**（`writeSingleOperationLog`）。ドキュメント ID は呼び出し側が渡す **`operationId`**（例: UUID）。

### 6.2 履歴種別

- **rollbackAction** の `action` enum に含まれるものが「巻き戻し対象として型が定義されている」操作（§6.3）。

### 6.3 undo 系処理

- **`rollbackAction.ts`** がサポートする `action`:  
  `addon`, `bulk_addon`, `bust_and_exit`, `bust_and_reentry`, `end_tournament`, `register_participants`, `register_for_tournament`, `assign_seat_to_player`, `reseat_all_players`, `set_ranking_data`。

### 6.4 既存戻しで復元されるデータ

- **`undoRegisterParticipants`**: `views/main` の `entries` / `reentries` / `playersIn` / `waitingCount`、`waiting`、`usersList`、着席していれば席、`bills/.../tournaments` ドキュメント削除など（`details` の有無で分岐）。実装は `undoRegisterParticipants.ts`。
- **`undoAssignSeatToPlayer`**: 席クリア、waiting へ戻し、`views/main` の **`waitingCount` のみ +1**（`seatedCount` は更新しない）。**`updatePlace` の逆戻しはこのファイルだけでは完結しない可能性**（要・ペイロードと別サービス確認）。
- **`undoReseatAllPlayers`**: `tablesSeat` を `previousSeatingData` で復元し、`views/main.waitingCount` を waiting の前状態から復元（**`seatedCount` は書き換えない**）。
- **`undoEndTournament`**: 終了前状態へ（`undoEndTournament.ts`、本調査では詳細未読）。
- その他 `undoAddon`, `undoBulkAddon`, `undoBustAndExit`, `undoBustAndReentry`, `undoSetRankingData` が `rollbackAction` から呼ばれる。

### 6.5 置きバケ操作を履歴・戻し対象にする場合の制約

**事実**: **「置きバケ一時参加者作成」専用の operationName／undo は存在しない**。既存は **register / assign / addon / bust / reseat / end / ranking** に紐づく。

**推測**: 新操作を **`registerParticipants` や新 Callable の operationLog + undo サービス追加**でカバーするかは実装設計。**現状の enum に無い action は `rollbackAction` からは呼べない**。

---

## 7. リシート生成・対象判定の現状

### 7.1 生成箇所

- **本調査では、「リシート」と名付いた Callable や `scheduledTournaments` 配下の専用ドキュメント生成は特定できていない**。**不明**。

### 7.2 参照元データ

- **リシートというより「操作履歴」**: `lib/ActionHistory/tournamentActionsHistoryPage.dart` が `operationLogs` 系の表示を行う（種別ごとにペイロードを解釈）。
- **リシートアルゴリズム**: **追加検索が必要（不明）**。

### 7.3 表示項目

- **ActionHistory**: operation 種別・ペイロード依存（例: `reseat_all_players` は `previousSeatingData`）。

### 7.4 置きバケ一時参加者を載せる場合の制約

**事実**: **リシート仕様がコードベースから確定できなかった**。  
**推測**: 参加者リストが **seat の userId・pokerName** 依存であれば、**一時 ID と表示名を seat に載せる**ことで表示余地はあるが、**根拠となる実装は未確認**。

---

## 8. 会計接続・bills 反映の現状

### 8.1 recordTournamentAction の現状

- **パス**: `bills/{billId}/tournaments/{templateId}` を upsert。
- **ガード**: 親 `bills` の `status` が **`open` または `in_progress` のみ**更新可。`settling` / `settled` / `voided` は拒否。
- **冪等**: `bills/{billId}/idempotency/{idempotencyKey}`。

### 8.2 bills/{billId}/tournaments/{templateId} の構造

- **`recordTournamentAction`** が `entryFeeIncl`, `reentryFeeIncl`, `addonFeeIncl`, `entryCount`, `reentryCount`, `addonCount`, `registeredAt`, `lastReentryAt`, `lastAddonAt`, `startAt`, `templateName` 等を保持（アクション種別で更新内容が異なる）。

### 8.3 後付け追加の可否

**事実**: **`open` / `in_progress` の bill であれば `recordTournamentAction` による追加・更新は構造上可能**（ガードより）。`settled` 後は不可。

### 8.4 accounting / settle / analytics の関係

- **会計完了**: `accounting.ts` 等で `status: settled` へ。
- **`billsOnSettle.ts`**: settled 遷移時にスナップショット生成・**`enqueueSettlement`（analytics）**。
- **事実**: analytics は **bill が settled に至った経路**を前提としている（トリガが `bills/{billId}` 更新）。

### 8.5 置きバケ専用データだけで売上扱いにできない理由

**事実**: **売上・カテゴリ集計のトリガは `bills` の settled 遷移側**に実装がある。`pendingBillCharges` は **本リポジトリのコード検索では未実装**（旧詳細仕様にのみ現れた概念）。**全体仕様では `pendingBillCharges` は採用しない**（未接続・未会計は `okibakeTemporaryEntries` 側で管理する方針）。

**推測**: **bill を経ずに analytics まで載せる経路は、現状コードからは見えない**。

---

## 9. terminalホーム「未会計の会計」の現状

### 9.1 表示対象

- **入口**: `lib/Home/terminalHomePage.dart` のメニュー項目「未会計の会計」→ `UnsettledAccountingPage`。
- **タブ2（ユーザー別）**: Firestore  
  `users` コレクションで **`unsettledBillsCount >= 1`** のユーザーを一覧表示（`unsettledAccountingPage.dart`）。
- **選択後**: `bills` で  
  `party.userId == userId` かつ `status in ['open','settling']`かつ **`closeSnapshot.unresolved == true`** のものだけをリスト。

### 9.2 UI構造

- **TabController 2 タブ**: 「日付ごと」「ユーザー別」。
- **タブ1**: プレースホルダ文言のみ（**「Step3 以降で実装」**）。データ取得なし。

### 9.3 通常 bills 以外を表示する場合の制約

**事実**: 現状 UI は **`users.unsettledBillsCount` と条件付き `bills` のみ**。  
**bill 未接続の置きバケ行や、将来追加する `okibakeTemporaryEntries` を一覧するコードは存在しない**（As-is）。旧仕様にあった **`pendingBillCharges` 相当を表示するコードも存在しない**。**全体仕様では `pendingBillCharges` は作成しない**。

### 9.4 置きバケ未接続・未会計を表示する場合の論点

**事実**: 同ページに **セクション追加・別データソース**は未実装。  
**推測**: 詳細仕様の UI 統合は **`UnsettledAccountingPage` の拡張**が自然だが、As-is には無い。

---

## 10. トーナメント終了時処理の現状

### 10.1 終了処理の有無

- **Callable**: `endTournament`（`endTournament.ts`）。

### 10.2 終了時に確定するデータ

**事実（当該関数のトランザクション内）**:

- `scheduledTournaments/{tournamentId}` の **`status: 'ended'`**, **`endedAt`**。
- **`tables` コレクション**の各卓 `status: 'open'` への復帰（終了前状態を payload に保存し operationLog へ）。

**未処理（この関数の読んだ範囲）**: **waiting の残存チェック、未接続参加者、bills、プライズ、ランキングの強制確定は行わない**。

### 10.3 未接続の置きバケ一時参加者を扱う場合の論点

**事実**: **終了処理に「未会計スキャン」は含まれない**。  
**推測**: 終了後もデータは残るため、**別バッチ／別画面での確認**が必要になりうる。**設計論点**。

---

## 11. LINEミニアプリ側の通常参加・表示情報

### 11.1 getUpcomingTournaments

- **Callable**: `getUpcomingTournaments.ts`。`scheduledTournaments` を期間フィルタし、`views/main` の **`entries`** を `participantCount` に使用（前回調査どおり）。

### 11.2 registerForTournament

- **`activeStays` + `billId` 必須**。未入店ユーザーは **エラーで参加不可**。

### 11.3 表示項目

- **`public/user/index.html`**: トーナメントカード（名称・日時・参加費・スタートスタック・レジスト表示等）、`showTournamentRegistration` が `registerForTournament` を呼ぶ。

### 11.4 自分の参加状態

**事実**: **ミニアプリから「このトーナメントに登録済みか」を一覧 API で返す専用処理は、本調査で確認した範囲ではない**。**不明**（クライアント側キャッシュや別 Callable の可能性）。

### 11.5 置きバケ対応後に矛盾しそうな箇所

**事実**: 仕様上ミニアプリから置きバケをしないなら、**UI から「置きバケ申請」系を消せばよい**のみ。  
**推測**: `participantCount === entries` のみでは **waiting のみの人数は反映されない**（仕様次第で表示と体感がずれる可能性）。

---

## 12. 新仕様に向けたギャップ一覧

| 項目 | 現状 | 新仕様で必要なこと | 追加実装が必要そうか |
|---|---|---|---|
| 待機／席の主体 | userId は実ユーザー前提が強い | 一時参加者 ID・表示名 | **Yes**（データ形状または Callable） |
| 着席 | `assignSeatToPlayer` は activeStay／bill 必須 | bill なしで席に載せる／または別経路 | **Yes** |
| 参加費・会計 | `recordTournamentAction` は bill 必須 | `okibakeTemporaryEntries` / `billLinkStatus` で未接続を管理し、接続後に bill へ反映 | **Yes**（`pendingBillCharges` は採用しない／コードにも無い） |
| Addon | activeStay／bill 必須 | 一時参加者への Addon／意思のみ | **Yes** または運用代替 |
| Bust／退席 | activeStay／bill 必須 | 一時参加者の bust | **Yes** |
| リシート | activeStay／bill 必須 | 一時参加者を含む再配置 | **Yes** |
| プライズ売上計算 | `entries`/`reentries`/`addons` | 置きバケをいつ計上するか | **要設計**（カウンタ／締めタイミング） |
| 戻し | 既存操作のみ | 一時参加者作成・紐付けの undo | **要設計**（既存に無い） |
| terminal 未会計 | `bills` + `users.unsettledBillsCount` のみ | bill 未接続行の表示 | **Yes** |
| 終了処理 | 状態・卓解放のみ | 未接続リスト／警告 | **要設計** |

---

## 13. 詳細仕様で決めるべき論点

- 一時参加者の **ID 戦略**（Firebase Auth の別ユーザー／ドキュメント ID／seat 側のみ等）と **既存 Callable との境界**。
- **参加費をプライズ／売上に載せるタイミング**（カウンタ更新と `recordTournamentAction` の整合）。
- **`playersIn` / `waitingCount` / `entries` の意味を仕様とコードで整合させるか**（As-is では一部更新が欠ける箇所がある）。
- **`okibakeTemporaryEntries` と `billLinkStatus` による bill 未接続管理**と、**接続確定後の `recordTournamentAction`・会計・analytics との整合**（全体仕様で **`pendingBillCharges` は採用しない**ため、別コレクションでの二重管理は設計対象外）。
- **終了後の未接続データ**の運用（検知タイミング・誰が void するか）。

---

## 14. 追加確認が必要な事項

- **`views/main.waitingCount` / `playersIn` が着席・バスト等でどう変わるべきか**のドキュメントまたは運用実態（コードが部分的のみ）。
- **リシート／レポート相当機能**の実装有無とファイル配置（本調査では特定できず）。
- **`assignSeatToPlayer` 成功後に `waitingCount` を減らす別トリガ**の有無（本 Callable 外）。
- **analytics の enqueueSettlement が期待する bill フィールド**の詳細（`snapshots.ts` 一式）。
- **ミニアプリ側の「登録済み判定」**の有無。

---

## 付記：前回 As-is との関係

先行調査で整理した **`registerParticipants` / `waiting` / `assignSeatToPlayer` / `recordTournamentAction`** に関する記述は本調査でも整合している。今回は **プライズ・アドオン・undo・terminal 未会計・終了処理・カウンタの一部不整合疑義**を追加した。
