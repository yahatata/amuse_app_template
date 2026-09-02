# ログ対象 操作単位一覧（ビジネス操作単位版）

**最優先に入れる条件**（いずれか1つ該当）:
1. 時間が経つにつれて操作が積み重なり、戻すのが大変（トーナメント型）
2. 可逆性がないと店舗・客・スタッフが明らかに損害を被る
3. 1操作で複数ドキュメント/複数人物/複数テーブルに波及する（影響範囲が広い）

**最優先から外す条件**（いずれか1つ該当）:
1. 現在の操作履歴（書き込みのデータ）で巻き戻しに必要なデータが充足している
2. 誤操作が起きても再度正しい値で更新することでデータが書き換わる（実質誤操作を無かったことにできる）
3. そもそも誤操作のリスクをほとんど孕んでいない

---

## 凡例

| 優先度 | 意味 |
|--------|------|
| **最優先** | 入れる条件のいずれかに該当し、かつ外す条件に該当しない。巻き戻し用ログの拡張が必須 |
| **要検討** | 入れる条件に該当するが、外す条件1（現状ログ充足）の可能性あり |
| **L2** | 入れる条件の一部該当、または外す条件2・3該当。運用・監査に有用 |
| **L3** | 原則対象外（参照・検証・デバッグ） |

※ 1つのビジネス操作が複数の Callable から呼ばれる場合、呼び出し元を併記する。

---

## 最優先

**優先度 0 および 1 の処理（入れる条件に該当し、かつ外す条件に該当しない。）**

| 優先度 | 操作ID | 操作名 | 要約 | 呼び出し元（Callable） | 優先度の主理由 | writes（主要） |
|----|--------|--------|------|------------------------|---------------|----------------|
| 0  | op-101 | アドオン購入 | トーナメントのアドオン購入。<br>1プレイヤー分の追加チップを scheduledTournaments に反映。 | addon | actionLog + rollbackAction で巻き戻し可能。actionLog の記録十分性は要検証。 | scheduledTournaments |
| 0  | op-102 | 一括アドオン | 複数プレイヤーへの一括アドオン。 | bulkAddon | 同上。 | scheduledTournaments |
| 0  | op-103 | バスト＆退店 | 座席から退席し、伝票も更新。 | bustAndExit | 同上。 | scheduledTournaments, bills |
| 0  | op-104 | バスト＆再入場 | バスト後の再入場処理。 | bustAndReentry | 同上。 | scheduledTournaments |
| 0  | op-105 | 座席割当 | プレイヤーを指定座席に割り当てる。 | assignSeatToPlayer | 同上。 | scheduledTournaments |
| 0  | op-106 | 全員着席替え | 全員の着席を一括変更。 | reseatAllPlayers | 同上。 | scheduledTournaments |
| 0  | op-107 | 参加者一括登録 | 参加者を一括登録。 | registerParticipants | 同上。 | scheduledTournaments |
| 1 | op-005 | 伝票に追加料金追加 | 伝票に追加料金（諸経費・サービス料等）を追加。 | appendExtra | 伝票合計に直接影響。追加額の取り消しには直前の extras 状態が必要だが、操作ログがない。 | bills/extras, bills |
| 1 | op-218 | トーナメント終了 | 順位確定・賞金付与のトリガー。 | endTournament | 不可逆に近い。監査必須。 | - |
| 0  | op-221 | トーナメント登録 | プレイヤーが参加申し込み。 | registerForTournament | 訂正手段はない？ | - |
| 0  | op-225 | ランキングデータ設定 | 順位情報を views/main に書き込み、賞金を users に付与。 | setRankingData | mainView の順位表示は再更新で訂正可能。プライズ付与（users 加算・pointALogs/pointBLogs）は再実行で二重付与となり訂正不可。 | - |

**集計: 11 操作**

---

## 操作記録ログ設計（最優先11操作専用）

### 対象・目的

- **対象**: 最優先 11 操作のみ（要検討・L2 は対象外）
- **目的**: 巻き戻し参照（操作記録）および操作履歴の可視化（成功・失敗どちらも残す）
- **attempt ログ**: 作らない（同一ドキュメント内の status / startedAt で十分）
- **Cloud Logging**: 必要に応じて補助利用

### 1. コア方針

| 項目 | 設計 |
|------|------|
| ログ配置 | `operationLogs/{operationId}`（トップレベルコレクション） |
| operationId | クライアント生成し、Functions に渡す |
| 1 操作 = 1 ドキュメント | 1 業務操作の試行ごとに 1 件作成。**成功・失敗どちらも作成**し、失敗が履歴に残らないことによる現場の混乱を防ぐ。 |
| **status** | **succeeded** \| **failed**。成功時は succeeded、本処理で例外や HttpsError になった場合は failed。 |
| **errorSummary** | 失敗時のみ（任意）。短いエラー要約（例: メッセージ先頭 200 文字）。スタック全体は保存しない。 |
| **startedAt** | 余力があれば設定。本処理開始時点の serverTimestamp。attempt コレクションは作らず同一 doc の遷移でよい。 |
| ペイロード | 巻き戻しに必要な最小限の情報のみ（全量スナップショット禁止）。失敗時は payload を空または部分のみでも可（巻き戻し対象にしない）。 |
| **createdAt** | **Functions 側で `serverTimestamp()` を設定する。クライアントからは送らない。** ログ確定時点（本処理完了後）。改竄・端末の時計ズレを防ぎ、時系列・削除判定（5 日経過）をサーバー時刻に統一する。 |

### 2. ドキュメント構成

operationLog ドキュメントは **共通フィールド + payload（操作固有データ）** で構成される。操作したデバイスが判別できれば十分なため、operatorUid は不要とする。

#### 2.1 単一操作のドキュメント

1 操作 = 1 プレイヤー（または 1 件）の操作向け。op-101, op-103, op-104, op-105, op-106, op-005, op-218, op-221, op-225 で使用。

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| operationId | string | ✓ | クライアント生成 UUID 等（ドキュメント ID 兼用） |
| operationName | string | ✓ | 操作名（例: アドオン購入、伝票に追加料金追加） |
| deviceId | string | ✓ | 実行デバイス ID |
| deviceName | string | - | 実行デバイス名 |
| **status** | string | ✓ | **succeeded** \| **failed**。成功時は succeeded、本処理で失敗した場合は failed。 |
| **errorSummary** | string | - | 失敗時のみ推奨。エラー要約（例: 先頭 200 文字）。 |
| **startedAt** | Timestamp | - | 余力があれば。本処理開始時の serverTimestamp。 |
| createdAt | Timestamp | ✓ | **Functions で serverTimestamp() を設定。クライアントからは送らない。** ログ確定時点。 |
| payload | object | - | 操作ごとの巻き戻し用データ（下記 3 で定義）。失敗時は空または部分のみでも可。成功時は必須。 |

**卓単位の操作における tableId（トップレベル）**

以下の操作は **1 卓に紐づく操作** のため、getActionLogs で「そのトーナメントかつその卓」で絞り込めるよう、**ドキュメントのトップレベルに `tableId` を必ず付与する**（payload 内のみではなく、クエリ用にトップレベルで持つ）。

- **op-101 アドオン購入**（addon）
- **op-102 一括アドオン**（bulkAddon）
- **op-103 バスト＆退店**（bustAndExit）
- **op-104 バスト＆再入場**（bustAndReentry）

実装時は `writeSingleOperationLog`（または一括用の書き込み）のパラメータに `tableId` を含め、operationLog ドキュメントのトップレベルに保存する。

#### 2.2 一括操作のドキュメント

1 回の一括操作を記録する。個別の巻き戻しを可能にするため、共通フィールドで「一括操作そのもの」を表し、**個別データの格納方法**は次のいずれかとする。

**方式 A: 1 ドキュメントに entries マップで全員分（小規模向け）**

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| operationId | string | ✓ | クライアント生成 UUID 等（一括操作全体の ID、ドキュメント ID 兼用） |
| operationName | string | ✓ | 操作名（例: 一括アドオン、参加者一括登録） |
| deviceId | string | ✓ | 実行デバイス ID |
| deviceName | string | - | 実行デバイス名 |
| **status** | string | ✓ | **succeeded** \| **failed**。 |
| **errorSummary** | string | - | 失敗時のみ。 |
| **startedAt** | Timestamp | - | 余力があれば。 |
| createdAt | Timestamp | ✓ | **Functions で serverTimestamp() を設定。クライアントからは送らない。** |
| tournamentId | string | ✓ | トーナメント ID（一括操作共通） |
| actionLogId | string | ✓ | actionLog 参照（rollback 連携用） |
| entries | map | ✓ | キー = 各プレイヤー用 operationId（クライアント生成）、値 = そのプレイヤーの巻き戻し用データ。失敗時は空でも可。 |

entries の値（各プレイヤー分）の例: `{ playerUid, playerName, ... }`（操作ごとに必要なフィールド）

- **注意**: 100 人一括なら 100 人分が 1 ドキュメントに入る。Firestore のドキュメントサイズ上限は **1 MiB** のため、人数が多いと超過リスク・読み書き負荷が増える。目安として **おおむね 20〜30 人以下**の一括に留める運用なら方式 A で足りる。

**方式 A'（チャンク分割）: 1 操作を「30 人上限」で複数ドキュメントに分割（UI 上は 1 操作）**

UI 上は 1 回の一括操作のまま、格納時のみ **1 ドキュメントあたり最大 30 エントリ**に分割する。人数に応じてドキュメント数が決まる（1〜30 人 → 1 件、31〜60 人 → 2 件、61〜90 人 → 3 件 …）。

| 項目 | 設計 |
|------|------|
| ドキュメント ID | `{bulkOperationId}-{chunkIndex}`（例: `uuid-0`, `uuid-1`, `uuid-2`）。同一一括操作のチャンクは同じ bulkOperationId でまとまる。 |
| 各チャンクのフィールド | **bulkOperationId**（必須。全チャンクで同一）, **chunkIndex**（0 始まり）, **totalChunks**, operationName, deviceId, deviceName, **status**（succeeded \| failed）, **errorSummary**（失敗時のみ・任意）, **startedAt**（任意）, createdAt, tournamentId, actionLogId, tableId（op-102 のみ）, **entries**（最大 30 件のマップ。キーは **entryOperationId**。値はそのプレイヤーの巻き戻し用データ） |
| 論理的な 1 操作の取得 | **取得は 1 方式に統一**: `where('bulkOperationId', '==', id)` で全チャンクを取得する。documentId の範囲クエリは使わない（ID 設計に依存し将来の変更に弱いため）。取得したドキュメントを chunkIndex でソートして結合すれば「1 操作分」として扱える。**必ず bulkOperationId を全チャンクに持たせ、フィールドクエリに一本化する。** |
| 個別巻き戻し | 指定された entryOperationId が含まれるチャンクを、上記で取得した複数ドキュメント内から検索し、そのエントリのみ undo する。 |
| entries のキー | マップのキーは **entryOperationId** とする。値（UUID 等）は短いランダム ID（20〜24 文字程度）にするとドキュメントサイズ効率が良い。 |

- **メリット**: UI・業務上は「1 操作」のまま、Firestore の 1 MiB 制限を超えない。方式 B のように 1 人 1 ドキュメントにせず、読み取りドキュメント数をおさえられる（例: 80 人 → 3 ドキュメント）。
- **制限値**: 1 ドキュメントあたりの最大エントリ数（例: 30）は実装時に定数で持つ。変更する場合は既存データの再分割は不要（新規格納時のみ適用）。

**チャンク整合性チェック（読み込み側で実施推奨）**

同一 bulkOperationId のチャンクを取得したあと、以下を検証すると壊れたデータに強い。不整合時はログ出力・UI で警告し、必要なら手動復旧とする。

| チェック | 内容 |
|----------|------|
| totalChunks の一致 | 全チャンクで `totalChunks` が同一であること。 |
| chunkIndex の範囲 | 各チャンクの `chunkIndex` が `0` 以上 `totalChunks - 1` 以下であること。 |
| chunkIndex の重複なし | 同一 bulkOperationId 内で同じ chunkIndex が 2 回以上出現しないこと。 |

**方式 B: ヘッダ 1 ドキュメント ＋ サブコレクションで 1 人 1 ドキュメント（大規模向け）**

| 配置 | 内容 |
|------|------|
| `operationLogs/{bulkOperationId}` | 一括操作の共通情報のみ（operationId, operationName, deviceId, deviceName, createdAt, tournamentId, actionLogId, tableId（op-102 のみ））。entries は持たない。 |
| `operationLogs/{bulkOperationId}/entries/{entryOperationId}` | 各プレイヤー 1 ドキュメント。ドキュメント ID = そのプレイヤー用 operationId。フィールドは playerUid, playerName, addonAmount（op-102）または playerUid, playerName（op-107）等。 |

- 一括で 100 人になっても「1 ドキュメント ＋ 100 ドキュメント」となり、単一ドキュメントのサイズ上限を気にせずスケールする。
- 巻き戻し時は「指定 entryOperationId のエントリのみ」サブコレクションから取得して undo する。一覧は `operationLogs/{bulkOperationId}` を読んだうえで `entries` をクエリまたはストリームで取得。

**採用方針**: 実装時点で「一括の最大人数」と「読み取りコスト」のバランスで選ぶ。**方式 A'（チャンク分割）** を採用すると、30 人超でも UI は 1 操作のまま格納だけ複数ドキュメントに分けられる（30〜59 → 2 件、60〜89 → 3 件 …）。1 人 1 ドキュメントにしないため読み取り数をおさえつつ、1 MiB 制限も回避できる。方式 B は「個別エントリの独立したドキュメント」が必要な場合（例: エントリ単位の細かいクエリ）に検討する。

### 3. 最優先11操作：payload 定義（巻き戻しに必要な最小情報）

#### 3.1 rollbackAction 対応操作（op-101〜107）

既存の actionLog を rollbackAction が参照。operationLog には rollback 参照用のキーを保持し、必要に応じて actionLog と連携。

| 操作ID | 操作名 | payload（巻き戻しに必要な情報） | rollback 参照 |
|--------|--------|--------------------------------|---------------|
| op-101 | アドオン購入 | `tournamentId`, `actionLogId`, `playerUid`, `playerName`, `tableId`, `seatNumber`, `addonAmount`（delta） | undoAddon: actionLogId + playerUid/playerName/tableId/seatNumber |
| op-102 | 一括アドオン | 一括ドキュメント（方式 A' の場合は 30 人ごとにチャンク分割して複数 doc に格納）。共通: `tournamentId`, `actionLogId`, `tableId`。entries マップ: キー=**entryOperationId**（短いランダム ID 推奨）、値=`playerUid`, `playerName`, `addonAmount` | 指定 entryOperationId のエントリのみ undoBulkAddon 相当で巻き戻し |
| op-103 | バスト＆退店 | `tournamentId`, `actionLogId`, `playerUid`, `playerName`, `tableId`, `seatNumber`, `billId`（伝票） | undoBustAndExit: actionLogId + playerUid/playerName/tableId/seatNumber |
| op-104 | バスト＆再入場 | `tournamentId`, `actionLogId`, `playerUid`, `playerName`, `tableId`, `seatNumber` | undoBustAndReentry: actionLogId + playerUid/playerName/tableId/seatNumber |
| op-105 | 座席割当 | `tournamentId`, `actionLogId`, `playerUid`, `playerName`, `tableId`, `seatNumber`, `beforeSeat`（移動前座席があれば） | undoAssignSeatToPlayer: actionLogId + playerUid/playerName/tableId/seatNumber |
| op-106 | 全員着席替え | `tournamentId`, `actionLogId`, `previousSeatingData`（tablesSeat の前状態: waiting + 各 table.seats） | undoReseatAllPlayers: actionLogId + previousSeatingData |
| op-107 | 参加者一括登録 | 一括ドキュメント（方式 A' の場合は 30 人ごとにチャンク分割して複数 doc に格納）。共通: `tournamentId`, `actionLogId`。entries マップ: キー=**entryOperationId**（短いランダム ID 推奨）、値=`playerUid`, `playerName` | 指定 entryOperationId のエントリのみ undoRegisterParticipants 相当で巻き戻し |

※ actionLog は `scheduledTournaments/{tournamentId}/actionLog/{actionLogId}` に格納。operationLog の payload に `actionLogId` を入れることで rollbackAction と紐付け可能。rollbackAction は actionLog を参照して undo* を実行するため、operationLog は監査・一覧用途、actionLog は rollback 実行用として併存。

#### 3.2 その他最優先操作（op-005, op-218, op-221, op-225）

| 操作ID | 操作名 | payload（巻き戻しに必要な情報） | 巻き戻し方法 |
|--------|--------|--------------------------------|--------------|
| op-005 | 伝票に追加料金追加 | `billId`, `extraId`, `name`, `amountIncl` | extras ドキュメント削除＋bills 合計からの減算。extraId で削除対象を特定。 |
| op-218 | トーナメント終了 | `tournamentId`, `beforeStatus`, `beforeEndedAt`（null の場合あり） | 手動復元。status を in_progress 等に戻し、endedAt をクリア。トリガー済み賞金は別途対応。 |
| op-221 | トーナメント登録 | `tournamentId`, `userId`, `billId`, `templateId`, `pokerName` | 参加登録の取消（bills/tournaments 削除、views/main カウント減、waiting/tablesSeat から除去）。 |
| op-225 | ランキングデータ設定 | **付与冪等性が必須**（下記「op-225 の付与冪等性」参照）。payload: `tournamentId`, **grantIdempotencyKey**（例: tournamentId + rankingVersion）, **rankingVersion** または **rankingHash**, `rankingEntries[]`, `beforeMainView` | 賞金付与の取り消し（users 減算・pointALogs/pointBLogs 逆操作）は、**冪等付与のうえで** operationLog の beforeMainView / rankingEntries を参照して実施。 |

#### 3.3 op-225（setRankingData）の付与冪等性（必須・ログより優先）

**問題**: operationLog に rankingEntries を残しても二重付与は防げない。「誤ってもう一回押した」で損害が確定するのを防ぐには、**付与処理そのものの冪等性**が必須。巻き戻し設計より先に実装すべき。

| 項目 | 設計 |
|------|------|
| **grantIdempotencyKey** | クライアントまたは Callable で必須。例: `tournamentId + ':' + rankingVersion`（rankingVersion は 1 回の確定ごとに一意の値、例: タイムスタンプまたはクライアント発行のバージョン）。 |
| **users 付与** | 同一 grantIdempotencyKey で既に付与済みなら **no-op**（加算しない）。例: 付与記録を `scheduledTournaments/{tournamentId}/grantRecords/{grantIdempotencyKey}` 等に書き、存在すればスキップ。 |
| **pointALogs / pointBLogs** | 同一キー（例: grantIdempotencyKey または 1 プレイヤーあたり `grantIdempotencyKey + ':' + playerUid`）で既にログがあれば **no-op**（新規ログを追加しない）。entryId を idempotency キーに紐づけるか、ログ側に grantIdempotencyKey を保存して重複チェック。 |
| **operationLog** | payload に **grantIdempotencyKey** と **rankingVersion**（または rankingHash）を必ず含める。巻き戻し時は「このキーで付与した」ことを特定するために利用。 |

**実装状況（完了）**: op-225 の付与冪等化は実装済み。  
- **Callable**: `grantIdempotencyKey` を必須化。`scheduledTournaments/{tournamentId}/grantRecords/{grantIdempotencyKey}` に記録がありれば付与を no-op。同一キーで users 加算・pointALogs/pointBLogs 書き込みをスキップ。  
- **二重付与の二段防護**: 既に `SetedRanking === true` のトーナメントでは付与処理自体をスキップ（画面を閉じて再度開いて再送した場合の二重付与を防止）。レスポンスに `prizeGrantSkipped: true` を返す。  
- **クライアント**: 1 回の確定で 1 つの `grantIdempotencyKey` を State に保持し、二重タップ・リトライでは同じキーを再利用。`prizeGrantSkipped` 時は「二度目のプライズ付与を検知しました。処理をスキップします」をダイアログで表示（トーナメント終了確認の前に表示）。

#### 3.4 最優先11操作：冪等性の要否と現状

各操作について「冪等性が必要か」「現状冪等化しているか」「idempotencyKey がなくとも性質上冪等か」を実装ベースで確認した結果。**「付与の冪等性」が必須なのは op-225 のみ。** 他は同一リクエストの二重送信で二重実行されうるかどうかと、現状の有無を一覧する。

| 操作ID | 操作名 | 冪等性は必要か | 現状（冪等化しているか） | キーなしで性質上冪等か |
|--------|--------|----------------|---------------------------|-------------------------|
| op-101 | アドオン購入 | 要（二重タップで addons が二重加算） | **していない**。views/main を先に +1 してから recordTournamentAction を呼ぶ。idempotencyKey は毎回新規のため二重実行される。 | 否 |
| op-102 | 一括アドオン | 要（同上・複数人分） | **していない**。各ユーザーごとに recordTournamentAction に新規 idempotencyKey。 | 否 |
| op-103 | バスト＆退店 | 要（二重で状態不整合） | **していない**。idempotencyKey 未使用。 | 否 |
| op-104 | バスト＆再入場 | 要（二重で reentries 二重加算） | **していない**。recordTournamentAction に毎回新規 idempotencyKey。 | 否 |
| op-105 | 座席割当 | 要（二重で同一ユーザー二重割当等） | **していない**。2回目は「指定シートは既に使用中」でエラーになり二重適用は防がれるが、成功／失敗が分かれるので冪等ではない。 | 否 |
| op-106 | 全員着席替え | やや要（同一入力なら上書きで実質冪等にしうる） | 明示的冪等キーなし。 | **はい**。同一の playerAssignments を二回適用しても「全席クリア→同じ割当を適用」で最終座席配置は同じ。 |
| op-107 | 参加者一括登録 | 要（二重で entries 等二重加算） | **していない**。recordTournamentAction に毎回新規 idempotencyKey。 | 否 |
| op-005 | 伝票に追加料金追加 | 要（二重で extras 二重追加） | **仕組みはあるが実質未使用**。Callable はキーを渡さず自動生成のためリトライで別キーになりうる。 | 否 |
| op-218 | トーナメント終了 | 要（二重で endedAt 更新・トリガー重複の可能性） | **していない**。idempotencyKey 未使用。 | **結果はほぼ同じ**（status は ended のまま）だが endedAt が毎回更新され、下流トリガーが二重発火する可能性があるため、厳密には冪等ではない。 |
| op-221 | トーナメント登録 | 要（二重で二重登録） | **していない**。recordTournamentAction に毎回新規 idempotencyKey。 | 否 |
| op-225 | ランキングデータ設定 | **付与の冪等性が必須**（二重で賞金二重付与） | **実装済み**。grantIdempotencyKey 必須、grantRecords で no-op、SetedRanking による二重付与スキップ、クライアントでスキップ時ダイアログ表示。 | 否 |

**結論**:  
- **idempotencyKey がなくとも性質上冪等になるのは op-106（全員着席替え）のみ**（同一入力なら最終状態が同じ）。op-218 は「終了」という結果は同じだが endedAt 更新・トリガー二重発火の可能性があり厳密には冪等ではない。  
- **残り 10 操作はすべて、idempotencyKey（または op-225 の grantIdempotencyKey）なしでは冪等にならない。**  
- 本ドキュメントで「先に実装すべき」としていた **op-225 の付与冪等化** は、本当に必要であり、**Phase 1.5 として実装済み**（上記 3.3 の「実装状況（完了）」参照）。

### 4. 巻き戻しにおける影響と対処

各操作の巻き戻し時に影響する箇所と、payload を活用した対処方法。

#### 4.1 rollbackAction 対応操作（op-101〜107）

| 操作 | 影響箇所 | 巻き戻し時の対処 | payload で必要な情報 |
|------|----------|------------------|----------------------|
| op-101 アドオン購入 | scheduledTournaments/views/main（addons 加算）、todaysBills（各プレイヤー addons 加算） | main の addons を -1、todaysBills の該当プレイヤー addons を -1。actionLog をロールバック済みにマーク。 | `tournamentId`, `actionLogId`, `playerUid`, `playerName`, `tableId`, `seatNumber`（undoAddon の引数） |
| op-102 一括アドオン | 同上（複数プレイヤー分） | 指定 entryOperationId のエントリのみ: main の addons を -1、該当 todaysBills の addons を -1。entries マップで個別巻き戻し可能。 | 共通: `tournamentId`, `actionLogId`, `tableId`。entries: キー=entryOperationId、値=`playerUid`, `playerName`, `addonAmount` |
| op-103 バスト＆退店 | views/main（playersBusted+1, playersIn-1）、todaysBills（isBusted  true）、tablesSeat（該当 seat の isBusted  true）、bills（伝票更新） | main を逆算、todaysBills の isBusted を false に、tablesSeat の該当 seat を復活。bills は必要に応じて手動調整。 | `tournamentId`, `actionLogId`, `playerUid`, `playerName`, `tableId`, `seatNumber`, `billId` |
| op-104 バスト＆再入場 | views/main（reentries+1, playersBusted+1、条件により waitingCount+1）、tablesSeat、bills/tournaments（reentry） | undoBustAndReentry: main の reentries・playersBusted を各 -1、席復元、bills の reentryCount を -1。 | `tournamentId`, `actionLogId`, `playerUid`, `playerName`, `tableId`, `seatNumber` |
| op-105 座席割当 | views/main（`tablesSeat/waiting` から該当プレイヤーを実際に削除した場合のみ waitingCount-1。forward の seatedCount は変更しない）、tablesSeat（該当 table に seat 追加）、tablesSeat/waiting（該当プレイヤー削除） | undo 側は waitingCount +1 のみ（seatedCount は forward で増えないため触らない）。該当 table の seat を削除、waiting にプレイヤーを戻す。 | `tournamentId`, `actionLogId`, `playerUid`, `playerName`, `tableId`, `seatNumber` |
| op-106 全員着席替え | tablesSeat（全 table・waiting の座席配置を一括変更）。forward は views/main を更新しない | **前状態の座席配置が必要**。previousSeatingData で tablesSeat を丸ごと復元し、main の waitingCount を waiting の前状態から復元（seatedCount は書き換えない）。 | `tournamentId`, `actionLogId`, `previousSeatingData`（必須。waiting + 各 table.seats の前状態） |
| op-107 参加者一括登録 | views/main（entries, playersIn 加算）、todaysBills（各プレイヤー新規作成）、tablesSeat/waiting または usersList | 指定 entryOperationId のエントリのみ: main の entries/playersIn を -1、該当 todaysBills を削除、waiting から除去。entries マップで個別巻き戻し可能。 | 共通: `tournamentId`, `actionLogId`。entries: キー=entryOperationId、値=`playerUid`, `playerName` |

※ rollbackAction は actionLog を参照して undo* を実行。payload の `actionLogId` で紐付け、必要パラメータは actionLog.details または operationLog.payload から取得。

#### 4.2 その他最優先操作（op-005, op-218, op-221, op-225）

| 操作 | 影響箇所 | 巻き戻し時の対処 | payload で必要な情報 |
|------|----------|------------------|----------------------|
| op-005 伝票に追加料金追加 | bills/{billId}/extras（新規ドキュメント）、bills（合計・updatedAt） | extras の該当ドキュメントを削除。bills の合計から amountIncl を減算。 | `billId`, `extraId`（削除対象）、`amountIncl`（減算用）、`name`（監査用） |
| op-218 トーナメント終了 | scheduledTournaments（status=ended, endedAt 設定）、tables（各卓 status=open） | status を beforeStatus に戻し、endedAt をクリア。tables はトーナメント仕様により手動復元。**賞金トリガーは発火済みのため別途手動対応。** | `tournamentId`, `beforeStatus`, `beforeEndedAt` |
| op-221 トーナメント登録 | bills/tournaments（新規）、views/main（playersIn, entries 等）、tablesSeat/waiting、recordTournamentAction 等 | bills/tournaments の該当ドキュメント削除。main カウント減、waiting または usersList から除去。bills 側のトーナメント関連も削除。 | `tournamentId`, `userId`, `billId`, `templateId`, `pokerName` |
| op-225 ランキングデータ設定 | views/main（1stPlayerUid〜、賞金額等）、users（pointA/pointB 加算）、pointALogs/pointBLogs（付与ログ） | **前提**: 付与は grantIdempotencyKey で冪等化済み。巻き戻し時: users の残高から prizeAmount を減算。pointALogs/pointBLogs は grantIdempotencyKey で特定したエントリを逆操作または削除。mainView は beforeMainView で復元。 | `tournamentId`, `grantIdempotencyKey`, `rankingVersion` または `rankingHash`, `rankingEntries[]`, `beforeMainView`, `pointType` |

### 5. ドキュメントサンプル

#### 5.1 単一操作（op-101, op-005）

成功時は status: "succeeded"、失敗時は status: "failed" と errorSummary（任意）を設定する。startedAt は余力があれば本処理開始時に serverTimestamp で設定。

```
// op-101 アドオン購入（成功時）
{
  "operationId": "uuid-from-client",
  "operationName": "アドオン購入",
  "deviceId": "device-xxx",
  "deviceName": "レジ1",
  "status": "succeeded",
  "createdAt": "<Functions で serverTimestamp() を設定。クライアントからは送らない>",
  "payload": {
    "tournamentId": "xxx",
    "actionLogId": "yyy",
    "playerUid": "uid1",
    "playerName": "プレイヤー1",
    "tableId": "table-A",
    "seatNumber": 3,
    "addonAmount": 5000
  }
}

// op-005 伝票に追加料金追加（成功時）
{
  "operationId": "uuid-from-client",
  "operationName": "伝票に追加料金追加",
  "deviceId": "device-xxx",
  "deviceName": "レジ1",
  "status": "succeeded",
  "createdAt": "<Functions で serverTimestamp() を設定>",
  "payload": {
    "billId": "bill-xxx",
    "extraId": "extra-yyy",
    "name": "サービス料",
    "amountIncl": 500
  }
}

// 失敗時の例: status: "failed", errorSummary: "permission-denied: トーナメント運営の権限がありません", payload は空または部分のみでも可
```

#### 5.2 一括操作（op-102 一括アドオン）※方式 A' の例（1 チャンクで収まる場合）

共通フィールドはドキュメント直下、個別データは entries マップ。マップのキーは **entryOperationId**（短いランダム ID 推奨）。巻き戻し時は指定 entryOperationId のエントリのみ対象。方式 A' で 31 人以上の場合は複数ドキュメントに分割し、各 doc に bulkOperationId, chunkIndex, totalChunks を持つ（取得は `where('bulkOperationId', '==', id)` に統一）。

```
{
  "bulkOperationId": "bulk-op-uuid",
  "chunkIndex": 0,
  "totalChunks": 1,
  "operationName": "一括アドオン",
  "deviceId": "device-xxx",
  "deviceName": "レジ1",
  "status": "succeeded",
  "createdAt": "<Functions で serverTimestamp() を設定>",
  "tournamentId": "xxx",
  "actionLogId": "action-log-yyy",
  "tableId": "table-A",
  "entries": {
    "a1b2c3d4e5f6g7h8i9j0": {
      "playerUid": "uid1",
      "playerName": "プレイヤー1",
      "addonAmount": 5000
    },
    "k1l2m3n4o5p6q7r8s9t0": {
      "playerUid": "uid2",
      "playerName": "プレイヤー2",
      "addonAmount": 5000
    }
  }
}

// op-107 参加者一括登録（方式 A'。entries のキーは entryOperationId）
{
  "bulkOperationId": "bulk-reg-op-uuid",
  "chunkIndex": 0,
  "totalChunks": 1,
  "operationName": "参加者一括登録",
  "deviceId": "device-xxx",
  "deviceName": "レジ1",
  "status": "succeeded",
  "createdAt": "<Functions で serverTimestamp() を設定>",
  "tournamentId": "xxx",
  "actionLogId": "action-log-zzz",
  "entries": {
    "a1b2c3d4e5f6g7h8i9j0": { "playerUid": "uid1", "playerName": "プレイヤー1" },
    "k1l2m3n4o5p6q7r8s9t0": { "playerUid": "uid2", "playerName": "プレイヤー2" }
  }
}
```

### 6. ログ削除トリガー

operationLogs は定期トリガーで古いドキュメントを削除する。

| 項目 | 設計 |
|------|------|
| 実行頻度 | 1 日 1 回（定期実行） |
| 削除条件 | 操作記録作成（createdAt）から 5 日経過したドキュメント |
| 対象コレクション | `operationLogs` |

※ 巻き戻し参照用のため、直近 5 日分を保持。それ以前のログは自動削除する。

---

## 賞金額確定後のアドオン・リエントリー巻き戻し時の挙動

**対象タイミング**: 賞金額確定（setPrizeData）の後、かつ 順位確定・賞金付与（setRankingData）の前に、アドオンまたはリエントリーの巻き戻しが起きたとき。

### 前提

- プライズは **総売上（エントリー料×entries ＋ リエントリー料×reentries ＋ アドオン料×addons）× プライズ比率** で算出される（Flutter: prize_setup_page.dart）。
- setPrizeData 時点では賞金額のみ mainView に保存されており、**まだ誰にも賞金は付与していない**（users / pointALogs は未更新）。

### 巻き戻しが起きたときの選択肢

店舗が次のいずれかを選べるようにする（UI で判断を促す）。

| 選択 | 挙動 |
|------|------|
| **反映しない** | 確定済みの賞金額（mainView の prizePool, 1stPrize 等）のまま運用する。巻き戻しはトーナメント状態（views/main の addons/reentries 等）にのみ反映し、賞金額は変更しない。 |
| **反映する** | 巻き戻し後の entries / reentries / addons を用いて総売上を再計算し、プライズプール・順位別賞金額を再算出する。mainView の prizePool, 1stPrize〜NstPrize 等を更新する。users / pointALogs はまだ付与前のため触らない。 |

### 実装上のポイント

- 巻き戻し実行（rollbackAction 等）の完了後、**setPrizeData 済みかつ setRankingData 未実行**であることを検知したタイミングで、上記の選択を店に促す UI を表示する。
- 「反映する」を選んだ場合: クライアントで prize_setup_page と同様の算式で再計算し、setPrizeData を再呼び出しして mainView の賞金額を上書きする、または賞金額のみ更新する専用の API を用意する。

---

## 要検討（優先度 2 の処理）

**入れる条件該当、外す条件1の可能性あり。要検討としてデータ十分性等を確認すること。**

| 優先度 | 操作ID | 操作名 | 要約 | 呼び出し元（Callable） | 優先度の主理由 | writes（主要） |
|--------|--------|--------|------|------------------------|---------------|----------------|
| 2 | op-210 | 開店ターミナル処理 | 翌営業日の初期化等。 | openStoreTerminal | 運用ログとして有用。 | - |
| 2 | op-211 | 閉店ターミナル処理 | 未会計付与→reset→cleanup→migrate→finalize をステップ実行。lastCompletedStep で進捗記録、runId で再開可能。 | closeStoreTerminal | 再開・ロールバック仕組みあり。外す条件①に近い。 | - |
| 2 | op-212 | 営業継続ターミナル処理 | 日跨ぎ時の状態更新。 | continueBusinessTerminal | 運用・監査に有用。 | - |
| 2 | op-213 | サイドゲームリセット | サイドゲーム状態を初期化。 | resetAllSideGames, closeStoreTerminal（resetSideGames） | 再設定で訂正可能。 | - |
| 2 | op-214 | 卓リセット | 卓状態を初期化。 | resetAllTables, closeStoreTerminal（resetTables） | 同上。 | - |
| 2 | op-215 | 滞在データクリーンアップ | 閉店時 activeStays を整理。 | cleanupActiveStaysOnClose, closeStoreTerminal（cleanupActiveStays） | 閉店プロセスの一部。 | - |
| 2 | op-216 | 未会計伝票をアナリティクスに移管 | 会計済み伝票を BigQuery 等へ送信。 | migrateSettledBillsForBusinessDay, closeStoreTerminal（migrateMissedSettlements） | 移行バッチ。冪等性に依存。 | - |
| 2 | op-216b | 閉店状態を確定する | storeMeta を closed に更新。processing 解放。 | closeStoreTerminal（finalizeCloseStateDoc） | 閉店ターミナル処理の最終ステップ。 | - |

**集計: 10 操作**

---

## L2: 運用・監査に有用（優先度 3 の処理）

入れる条件の一部該当、または外す条件2・3該当により最優先から除外。

| 優先度 | カテゴリ | 操作ID | 操作名 | 要約 | 呼び出し元（Callable） | 優先度の主理由 |
|-----|----------|--------|--------|------|------------------------|----------------|
| 3   | 会計・支払い | op-001 | 会計完了 | 伝票を確定し activeStays / visitLogs を更新。<br>Settlement Trigger でスナップショット生成。 | completeAccountingV2 | actionLog 相当の操作ログが存在せず、巻き戻しに必要な直前状態が残らない。トーナメント系と異なり rollback 仕組みがない。 |
| 3   | 会計・伝票 | op-002 | 未会計伝票にcloseSnapshot付与 | 未会計伝票に閉店時点のスナップショットを付与。<br>bills に closeSnapshot、users に unsettledBillsCount。 | applyCloseSnapshot, closeStoreTerminal（UNSETTLED_MARK ステップ） | 1操作で複数の bills/users に波及。操作ログがなく、どの伝票にいつスナップを付与したかの追跡が困難。 |
| 3   | 会計・伝票 | op-003 | 未会計伝票の事後確定 | 閉店後に残った未会計伝票を会計フローをスキップして確定。 | finalizeUnsettledBillAfterAccounting | 会計フローをバイパスして確定するため不可逆。誤確定すると取り消しに巻き戻し用ログが必要。 |
| 3   | 伝票・入退店 | op-004 | 伝票に注文追加 | 伝票に注文を追加。<br>bills/items, orders, todaysOrder を更新。 | placeOrder, placeOrderByUser | 1操作で複数コレクションに波及。注文履歴だけでは巻き戻し（キャンセル取り消し等）に直前の伝票状態が不足。 |
| 3 | 伝票・入退店 | op-006 | 注文キャンセル | 伝票上の注文をキャンセル。 | cancelOrder | キャンセルは実質不可逆。誤キャンセル時の復元には、キャンセル前の注文内容が操作単位で必要。 |
| 3 | 伝票・入退店 | op-007 | 手動チェックイン（入店） | ログインID+PIN で入店処理。<br>bills と activeStays を新規作成。 | manualCheckIn | 誤入店時の巻き戻しに、作成した bills/activeStays の識別と復元手順が必要。操作ログなし。 |
| 3 | 会計・支払い | op-008 | 返金処理（会計後） | 会計済み伝票に対する返金を記録。 | recordPostSettlementRefund | 金銭処理で不可逆。誤返金の取り消しには、返金前の支払状態・残高が操作単位で必要。 |
| 3 | 伝票・入退店（外す条件該当） | op-201 | 伝票内容更新 | extras, tournaments, items, sideGameChips を更新。 | updateActiveBill | 外す条件②。再度正しい値で更新すれば上書き可能。 |
| 3   | 伝票・入退店（外す条件該当） | op-202 | QRチェックイン（入店） | 客のQRを読み取って入店処理。 | processVisitByQR | 外す条件③。誤操作リスクがほぼない。                                                              |
| 3   | 会計・支払い | op-203 | 会計開始 | 伝票の会計フローに入る。 | startAccounting | 入れる条件の一部該当。cancelAccounting で取り消し可能。                                            |
| 3   | 会計・支払い | op-204 | 会計開始取り消し | 未確定の会計状態をリセット。 | cancelAccounting | 入れる条件の一部該当。監査上有用。                                                               |
| 3   | 会計・支払い | op-205 | 会計内容更新 | 支払方法・分割等を更新（未確定伝票）。 | updateActiveBill | 確定前なら再更新で訂正可能。                                                                  |
| 3   | 会計・支払い | op-206 | チップ入金 | users の残高に加算。 | depositTip | 外す条件②に近い。金銭なので監査上ログ有用。                                                          |
| 3 | 会計・支払い | op-207 | チップ出金 | users の残高から減算。 | withdrawTip | 同上。 |
| 3 | トーナメント運用 | op-217 | スケジュール済みトーナメント作成 | 日付・時間・卓数を設定。 | createScheduledTournament | 削除・編集で訂正可能。 |
| 3   | トーナメント運用 | op-219 | トーナメント一時停止 | ブラインド進行を止める。 | pauseTournament | resumeTournament で復帰可能。                                                         |
| 3   | トーナメント運用 | op-220 | トーナメント再開 | 一時停止からの復帰。 | resumeTournament | 運用ログに有用。                                                                        |
| 3   | トーナメント運用 | op-222 | トーナメントに卓追加 | 卓構成の拡張。 | addTableToTournament | removeTableFromTournament で取り消し可能。                                              |
| 3   | トーナメント運用 | op-223 | トーナメントから卓削除 | 卓構成の縮小。 | removeTableFromTournament | addTableToTournament で再追加可能。                                                    |
| 3   | トーナメント運用 | op-224 | 賞金データ設定 | 順位別の賞金額を登録。 | setPrizeData | 再更新で訂正可能。                                                                       |
| 3   | トーナメント運用 | op-226 | 定期開催作成 | 曜日・頻度を設定。 | createTournamentRecurrence | 削除・更新で訂正可能。                                                                     |
| 3   | トーナメント運用 | op-227 | 定期開催削除 | リピート設定の解除。 | deleteTournamentRecurrence | 運用ログに有用。                                                                        |
| 3   | トーナメント運用 | op-228 | 定期開催トーナメント自動生成 | テンプレートから今後のイベントを作成。 | generateRecurringTournaments | 生成物は個別に削除・編集可能。                                                                 |
| 3   | トーナメント運用 | op-229 | 定期開催更新 | リピート設定の変更。 | updateTournamentRecurrence | 再更新で訂正可能。                                                                       |
| 3   | トーナメント運用 | op-230 | トーナメントテンプレート更新 | ブラインド・賞金等の編集。 | updateTournamentTemplate | 同上。                                                                             |
| 3   | トーナメント運用 | op-231 | トーナメントテンプレート作成 | 再利用用のひな形を登録。 | createTournamentTemplate | 運用・監査に有用。                                                                       |
| 3   | トーナメント運用 | op-232 | トーナメントテンプレートアーカイブ | 使用停止に移行。 | archiveTournamentTemplate | 同上。                                                                             |
| 3   | 卓・座席・サイドゲーム | op-233 | 仮卓作成 | 一時的な卓を追加。 | createTemporaryTable | 卓の削除・リセットで訂正可能。                                                                 |
| 3   | 卓・座席・サイドゲーム | op-234 | 座席から退席 | プレイヤーの着席解除。 | leaveSeat | 再着席で訂正可能。                                                                       |
| 3   | 卓・座席・サイドゲーム | op-235 | サイドゲーム登録 | プレイヤーがサイドゲーム参加。 | registerForSideGame | 退席で取り消し可能。 |
| 3   | 権限・デバイス | op-236 | デバイス登録 | 端末を店舗に紐付け。 | registerDevice | 権限・監査上必須。 |
| 3   | 権限・デバイス | op-237 | デバイスオプション更新 | 表示・機能の ON/OFF 等を設定。 | updateDeviceOptions | 外す条件②。再更新で上書き可能。 |
| 3   | 権限・デバイス | op-238 | デバイスロール更新 | admin/manager/staff 等を変更。 | updateDeviceRole | 外す条件②。権限変更は監査必須。                                                                |
| 3   | ロールバック | op-239 | トーナメント操作の巻き戻し | actionLog を参照して undo* を実行。 | rollbackAction | 巻き戻しそのもの。ログ必須。                                                                  |
| 3   | メニュー・テンプレ | op-240 | メニューアイテム作成 | 商品・料金を登録。 | createMenuItem | 再更新・削除で訂正可能。                                                                    |
| 3   | メニュー・テンプレ | op-241 | メニューアイテム更新 | 商品情報・料金の編集。 | updateMenuItem | 外す条件②。                                                                          |
| 3   | メニュー・テンプレ | op-242 | メニューアイテム売切切替 | 在庫切れフラグの on/off。 | toggleSoldOutForMenuItem | 外す条件②。再度トグルで元に戻せる。                                                              |
| 3   | メニュー・テンプレ | op-243 | ブラインドテンプレート作成 | トーナメント用のブラインド構成を登録。 | createBlindTemplate | 再更新・アーカイブで訂正可能。                                                                 |
| 3   | メニュー・テンプレ | op-244 | ブラインドテンプレート更新 | ブラインド構成の編集。 | updateBlindTemplate | 外す条件②。                                                                          |
| 3   | メニュー・テンプレ | op-245 | ブラインドテンプレートアーカイブ | 使用停止に移行。 | archiveBlindTemplate | 運用ログに有用。                                                                        |
| 3   | 勤怠・シフト・スタッフ | op-246 | シフト希望一括申請 | スタッフが日付範囲・時間を指定して自分のシフト希望を shiftRequests に一括登録。 | submitShiftRequests | スタッフ操作（LINE `submitShifts` 経由）。確定後のシフトは給与に影響。監査必須。 |
| 3   | 勤怠・シフト・スタッフ | op-247 | 日次アサイン更新 | 担当者・役割の変更。 | updateDayAssignments | 再更新で訂正可能。                                                                       |
| 3   | 勤怠・シフト・スタッフ | op-248 | シフト要請確定 | スタッフのシフト希望を承認。 | confirmShiftRequest | 監査に有用。                                                                          |
| 3   | 勤怠・シフト・スタッフ | op-249 | シフト要請更新 | 希望日・時間の変更。 | updateShiftRequest | 再更新で訂正可能。                                                                       |
| 3   | 勤怠・シフト・スタッフ | op-250 | 出勤記録作成 | 打刻または手動で出勤を記録。 | createClockInRecord, createManualClockInRecord | 勤怠の基幹。給与に直結。監査必須。                                                               |
| 3   | 勤怠・シフト・スタッフ | op-251 | 退勤記録更新 | 打刻または手動で退勤を記録。 | updateClockOutRecord, updateManualClockOutRecord | 同上。                                                                             |
| 3   | 勤怠・シフト・スタッフ | op-252 | 勤怠修正申請作成 | スタッフが勤怠の修正を依頼。 | createAttendanceCorrectionRequest | 申請の記録。監査に有用。                                                                    |
| 3   | 勤怠・シフト・スタッフ | op-253 | 勤怠修正申請承認 | 管理者が修正を許可。 | approveAttendanceCorrectionRequest | 承認履歴は監査必須。                                                                      |
| 3   | 勤怠・シフト・スタッフ | op-254 | 勤怠修正申請却下 | 管理者が修正を拒否。 | rejectAttendanceCorrectionRequest | 同上。                                                                             |
| 3   | 勤怠・シフト・スタッフ | op-255 | スタッフアカウント作成 | 新規スタッフをシステムに登録。 | createStaffAccount | 権限・監査上必須。                                                                       |
| 3   | 勤怠・シフト・スタッフ | op-256 | ユーザーアカウント作成 | 管理画面・アプリ経由でユーザーを登録。 | createUserAccount, createUserByApp | 同上。                                                                             |
| 3   | 勤怠・シフト・スタッフ | op-257 | 募集作成 | シフト募集の登録。 | createRecruitments | 運用ログに有用。                                                                        |
| 3   | 勤怠・シフト・スタッフ | op-258 | 募集通知送信 | スタッフに募集内容をプッシュ。 | sendRecruitmentNotification | 送信履歴は監査に有用。                                                                     |
| 3   | 営業時間・カレンダー | op-259 | 月の営業時間初期化 | 未設定の日をスタイルから生成。 | initBusinessHoursForMonth | 再実行で上書き可能。                                                                      |
| 3   | 営業時間・カレンダー | op-260 | 月のシフト日初期化 | シフト要請用の日付を準備。 | initShiftDaysForMonth | 同上。                                                                             |
| 3   | 営業時間・カレンダー | op-261 | 日次営業時間手動設定 | 特定日の営業時間を上書き。 | setBusinessHoursManualForDay | 外す条件②。                                                                          |
| 3   | 営業時間・カレンダー | op-262 | 日次確定 | その日の営業・勤怠データをロック。 | finalizeDay | 確定は重要。運用・監査に有用。                                                                 |
| 3   | 営業時間・カレンダー | op-263 | 月次確定 | その月の営業・勤怠データをロック。 | finalizeMonth | 同上。                                                                             |
| 3   | 営業時間・カレンダー | op-264 | シフト要請中間確定 | 仮確定状態に更新。 | interimConfirmRequests | 再更新で訂正可能。                                                                       |
| 3   | 営業時間・カレンダー | op-265 | 充足オーバーライド設定 | シフト充足判定を手動で上書き。 | setSufficientOverride | 外す条件②。                                                                          |
| 3   | 営業時間・カレンダー | op-266 | スタイルから営業時間生成 | テンプレートに基づいて月/年次を一括生成。 | generateBusinessHoursForMonthFromStyles, generateBusinessHoursForYearFromStyles | 再実行で上書き可能。                                                                      |
| 3   | その他    | op-267 | 会計フィールド移行 | 会計済み伝票の会計フィールドを移行。 | migrateTodaysBillsAccountingFields | 移行バッチ。冪等性に依存。 todaysBills時の関数                                                   |
| 3   | その他    | op-268 | QRコード生成 | users/staffs に URL 等を保存。 | generateQRCode | 再生成で上書き可能。                                                                      |
| 3   | その他    | op-269 | 初期状態ドキュメント作成 | 店舗の stateDoc を初期化。 | createInitialStateDocCallable | 再実行で上書き可能。                                                                      |

**集計: 64 操作**

---

## L3: 原則対象外

参照系（get*）、検証（verify/validate/check/determine/calculate）、デバッグ。ビジネス操作としては「データ取得」「照合」「事前チェック」等。書き込みを伴わないためログ対象外。

| メモ | 操作種別 | 呼び出し元（Callable） | 要約 |
|-----|----------|------------------------|------|
| | 参照系 | getActionLogs, getBillPreviewTotals, getOpenBills, getUnsettledBillsForClose, getPayrollData, getPrizeData, getRankingData, getScheduledTournaments, getScheduledTournamentsForEdit, getShifts, getStaffAttendance, getAllStaffAttendance, getStaffListForAttendance, getAttendanceCorrectionRequests, getTodayTournaments, getTournamentRecurrences, getUpcomingTournaments, getBlindTemplates, getTournamentTemplates, getAvailableTables, getMenuItems, getUserOrderHistory, getUserStatus | データ取得のみ。書き込みなし。 |
| | 検証系 | verifyPaymentSplit, verifyQRCode, validateEndTournament, checkExistingCorrectionRequest, calculateInsufficientDays | 照合・判定・算出のみ。書き込みなし。 |
| | デバッグ系 | calculateFirestoreSize, generateDummyData | 開発・検証・テスト用。本番ログ対象外。 |

**集計: 34 Callable（参照・検証・デバッグとして L3）**

---

## 実装方針（操作単位版）

1. **最優先 11 操作**（優先度 0 および 1）から着手。巻き戻しに必要な「操作単位のログ」を設計・実装する。
2. **要検討 10 操作**（優先度 2）は、データ十分性等を確認し、不足があれば最優先に昇格。
3. **L2**（優先度 3）は予算・運用に応じて対象を選定。op-201（伝票内容更新）・op-202（QRチェックイン）は外す条件該当のため優先度低め。
4. **L3** は原則ログ対象外。

---

## 最優先処理の実装順序（操作記録ログ ＋ 巻き戻し）

最優先 11 操作について「操作記録（ログ）を残す」と「巻き戻しを可能にする」を実装するときの推奨順序。賞金額確定後・順位確定前のアドオン/リエントリー巻き戻し時の挙動（本ドキュメント「賞金額確定後のアドオン・リエントリー巻き戻し時の挙動」）もこの順序に含める。

**op-225（setRankingData）の付与冪等化は Phase 1.5 として実装済み。** 二重付与を防いだうえでないと、op-225 のログ書き込み（Phase 2）や巻き戻し（Phase 3-5）が意味を持たないため、Phase 2 の 2-11（op-225 ログ）に着手する前に済ませる必要があった。Phase 1.5 は完了しており、以降は Phase 2 の op-225 ログ書き込みや Phase 3 の巻き戻しに進める。

**冪等になっていない処理に対して、ログ追加の前に「全て」冪等付与を行うべきか**

**op-225 も巻き戻しで復旧は可能**（operationLog の beforeMainView / rankingEntries を元に users 減算・pointALogs 逆操作で戻せる）。op-225 とそれ以外の違いは「復旧のしやすさ」と「防止を優先すべき理由」にある。

| 観点 | op-225（賞金付与） | その他（アドオン・座席・伝票追加等） |
|------|---------------------|----------------------------------------|
| 巻き戻しで復旧できるか | **できる**（減算・逆操作で戻せる） | できる（カウント減・削除・状態復元など） |
| 二重実行時の「戻し」のしづらさ | **戻しが重い**。付与したポイントはユーザーがすでに使っている可能性があり、減算すると残高不足・マイナス・利用者クレームになりうる。どの付与分を戻すかの特定も必要。 | カウントや状態の 1 操作分戻すだけで済むことが多く、影響範囲が限定的。 |
| 業界慣行 | **付与・支払い系は冪等化が標準**（二重払いを防ぐため）。 | 操作ログ＋巻き戻しで足りる運用も多い。 |
| 方針 | **二重付与を起こさない**（冪等化）のを優先し、巻き戻しは「万が一」に留めたい。そのためログ追加の前に付与冪等を必須とする。 | 二重実行しても巻き戻しで戻せるので、ログ追加の前に全員冪等化は必須としない（工数とのトレードオフ）。 |

| 方針 | 内容 |
|------|------|
| **必須とするのは op-225 の付与冪等のみ** | ログ追加（Phase 2）の前に **Phase 1.5（op-225 付与冪等化）** を必ず実施する。op-225 も巻き戻しで戻せるが、**戻すコスト・リスクが大きい**ため、二重付与を防ぐことを優先する。 |
| **その他 10 操作は「ログ追加の前に必ず冪等化」とはしない** | 二重実行しても巻き戻しで復旧可能であり、全 Callable の冪等化工数とのトレードオフで、ログ・巻き戻しを先行させ、冪等化は必要に応じて後から追加する形でよい。op-106 はもともと性質上冪等。 |
| **推奨（余力があれば）** | **op-005**: 既存ヘルパーは idempotencyKey 対応済みなので、Callable 経由でクライアントから同一キーを渡すだけで二重追加を防げる。**op-101, 102, 104, 107, op-221**: recordTournamentAction に同一論理操作で同じキー（例: operationId）を渡すと二重タップを防げる。 |

※ 「全て冪等にしてからログ」にすると設計はきれいになるが、本ドキュメントのスコープでは **op-225 のみログより前に必須** とし、他はログ・巻き戻しを先行させ、冪等化は必要に応じて後から追加する形でよい。

### Phase 1: 基盤

| 順 | 内容 | 備考 |
|----|------|------|
| 1-1 | **operationLogs コレクション・スキーマの準備** | 共通フィールド（operationId, operationName, deviceId, deviceName, **status**（succeeded \| failed）, **errorSummary**（失敗時・任意）, **startedAt**（任意）, createdAt, payload）を用意。一括操作（op-102, op-107）は **方式 A'** で進める。全チャンクに **bulkOperationId**（必須）・chunkIndex・totalChunks を持たせ、ドキュメント ID は `{bulkOperationId}-{chunkIndex}`。**取得は `where('bulkOperationId', '==', id)` に一本化**（documentId 範囲クエリは使わない）。entries のキーは **entryOperationId**（値は 20〜24 文字の短いランダム ID 推奨）。インデックス（bulkOperationId）を整える。読み込み側で**チャンク整合性チェック**（totalChunks 一致、chunkIndex 範囲・重複なし）を実装する。 |
| 1-2 | **クライアントでの operationId 生成・渡し** | 各操作実行前にクライアントで UUID を生成し、Callable に渡す仕組みを全 11 操作の呼び出し元に組み込む。 |

### Phase 1.5: op-225 付与冪等化（Phase 2 の 2-11 より前に必須）**【実装完了】**

| 順 | 内容 | 状態 |
|----|------|------|
| 1.5-1 | **setRankingData に grantIdempotencyKey を必須化** | クライアントまたは Callable で rankingVersion を決め、grantIdempotencyKey（例: `tournamentId + ':' + rankingVersion`）をリクエストに含める。本ドキュメント「3.3 op-225 の付与冪等性」参照。 | 済 |
| 1.5-2 | **users 付与の重複 no-op** | 同一 grantIdempotencyKey で既に付与済み（例: grantRecords に存在）なら加算しない。 | 済 |
| 1.5-3 | **pointALogs/pointBLogs の重複 no-op** | 同一キーで既にログがあれば新規追加しない。 | 済 |
| （補足） | **SetedRanking による二重付与スキップ** | 既に順位確定済み（SetedRanking === true）のトーナメントでは付与処理を実行せず、`prizeGrantSkipped: true` を返す。クライアントではスキップ時「二度目のプライズ付与を検知しました。処理をスキップします」をダイアログで表示。 | 済 |

※ Phase 1.5 は完了済み。Phase 2 の op-225（2-11）で operationLog を書き、payload に grantIdempotencyKey と rankingVersion を含める。

### Phase 2: 操作記録ログの書き込み

Callable 内で「本処理の完了後（**成功または失敗どちらも**）に operationLog を 1 件作成」する。成功時は status: succeeded、失敗時は status: failed とし、失敗時は errorSummary（任意）に短いエラー要約を入れる。これにより失敗操作も履歴に残り、現場の混乱を防ぐ。payload は本ドキュメント「3. 最優先11操作：payload 定義」に従う（失敗時は payload を空または部分のみでも可）。**createdAt は必ず Functions 側で `FieldValue.serverTimestamp()` を設定し、クライアントからは受け取らない。** 余力があれば startedAt（本処理開始時）も同一 doc に設定する。

| 順 | 操作 | Callable | ログ種別 |
|----|------|----------|----------|
| 2-1 | op-101 アドオン購入 | addon | 単一 |
| 2-2 | op-102 一括アドオン | bulkAddon | 一括（entries） |
| 2-3 | op-103 バスト＆退店 | bustAndExit | 単一 |
| 2-4 | op-104 バスト＆再入場 | bustAndReentry | 単一 |
| 2-5 | op-105 座席割当 | assignSeatToPlayer | 単一 |
| 2-6 | op-106 全員着席替え | reseatAllPlayers | 単一（previousSeatingData 必須） |
| 2-7 | op-107 参加者一括登録 | registerParticipants | 一括（entries） |
| 2-8 | op-005 伝票に追加料金追加 | appendExtra | 単一 |
| 2-9 | op-218 トーナメント終了 | endTournament | 単一 |
| 2-10 | op-221 トーナメント登録 | registerForTournament | 単一 |
| 2-11 | op-225 ランキングデータ設定 | setRankingData | 単一（**grantIdempotencyKey**, **rankingVersion** または rankingHash, beforeMainView, rankingEntries 等） |

### Phase 3: 巻き戻しの実装

既存の actionLog + rollbackAction がある操作は operationLog との紐付けを確認しつつ、ログのみの操作は rollback 処理を実装する。**op-225 の巻き戻し（3-5）の前に、付与冪等化（Phase 1.5）が完了していること。**

| 順 | 操作 | 内容 |
|----|------|------|
| **3-0** | **op-225 付与冪等化の確認** | Phase 1.5 は実装完了済み。巻き戻し（3-5）は冪等化済みを前提に実装する。 |
| 3-1 | **op-101〜107** | rollbackAction が actionLog を参照して undo* を実行する現状を維持。operationLog の payload（actionLogId 等）と整合していることを確認。必要なら rollbackAction が operationLog を参照して一覧表示・単一巻き戻しできるようにする。 |
| 3-2 | **op-005** | operationLog の payload（billId, extraId, amountIncl）を使って extras 削除＋bills 合計減算を行う巻き戻し Callable（または rollbackAction 拡張）を実装。 |
| 3-3 | **op-218** | operationLog の payload（beforeStatus, beforeEndedAt）を元に status/endedAt を復元。賞金トリガー発火済みの場合は別途手動対応であることをドキュメント・UI で明示。 |
| 3-4 | **op-221** | operationLog の payload を元に参加登録取消（bills/tournaments 削除、main カウント減、waiting 等から除去）を実装。 |
| 3-5 | **op-225** | 冪等化済みの付与を前提に、operationLog の payload（grantIdempotencyKey, beforeMainView, rankingEntries）を元に users 減算・pointALogs/pointBLogs 逆操作・mainView 復元を実装。 |

### Phase 4: 賞金額確定後・順位確定前の巻き戻し対応

アドオンまたはリエントリーの巻き戻し（op-101, op-102, op-104）が、setPrizeData 後かつ setRankingData 前に行われたときの特別フロー。

| 順 | 内容 |
|----|------|
| 4-1 | **状態の検知** | 巻き戻し完了後に「当該トーナメントが setPrizeData 済みかつ setRankingData 未実行」かどうかを判定するロジックを用意（views/main 等のフラグ・データ有無で判断）。 |
| 4-2 | **店舗向け UI** | 上記のとき「賞金額を巻き戻し後の売上で再計算して反映しますか？ 反映しない／反映する」を選択させる UI を表示する。 |
| 4-3 | **「反映する」の実装** | 選択で「反映する」の場合、クライアントで総売上→プライズプール・順位別賞金額を再計算し、setPrizeData の再呼び出しで mainView を更新する。または賞金額のみ更新する専用 API を用意して呼び出す。users / pointALogs は変更しない。 |

### Phase 5: 運用まわり

| 順 | 内容 |
|----|------|
| 5-1 | **ログ削除トリガー** | 本ドキュメント「6. ログ削除トリガー」に従い、createdAt から 5 日経過した operationLogs を削除する定期トリガーを実装する。 |
| 5-2 | **一覧・監査** | 必要に応じて operationLogs を期間・トーナメント・操作名で検索し、巻き戻し対象を一覧表示する画面・API を用意する。 |

---

## 集計（操作単位）

| セクション | 操作数 | 優先度 |
|------------|--------|--------|
| 最優先 | 11 | 0 および 1 |
| 要検討 | 10 | 2 |
| L2 | 64 | 3 |
| L3 | 34 Callable（参照・検証・デバッグ） | - |

---

## Callable → 操作 対応表（逆引き）

| メモ | Callable | 実行する主な操作 |
|-----|----------|------------------|
| | completeAccountingV2 | op-001 会計完了 |
| | applyCloseSnapshot | op-002 未会計伝票にcloseSnapshot付与 |
| | closeStoreTerminal | op-002, op-213, op-214, op-215, op-216, op-216b, op-211（閉店ターミナル全体） |
| | finalizeUnsettledBillAfterAccounting | op-003 未会計伝票の事後確定 |
| | placeOrder | op-004 伝票に注文追加 |
| | | placeOrderByUser | op-004 伝票に注文追加 |
| | appendExtra | op-005 伝票に追加料金追加 |
| | cancelOrder | op-006 注文キャンセル |
| | manualCheckIn | op-007 手動チェックイン |
| | recordPostSettlementRefund | op-008 返金処理（会計後） |
| | addon | op-101 アドオン購入 |
| | bulkAddon | op-102 一括アドオン |
| | bustAndExit | op-103 バスト＆退店 |
| | bustAndReentry | op-104 バスト＆再入場 |
| | assignSeatToPlayer | op-105 座席割当 |
| | reseatAllPlayers | op-106 全員着席替え |
| | registerParticipants | op-107 参加者一括登録 |
