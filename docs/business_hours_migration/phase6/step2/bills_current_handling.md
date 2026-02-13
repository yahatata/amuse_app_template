# bills の現状の取り扱い（Phase6 Step2 検討用）

Phase6 Step2 の検討事項「未会計billsの保存方法」「フラグの構造」を議論するために、現状の bills のデータ構造・作成元・会計前後のフィールド・クエリの実態をまとめる。

**注**: Step2 は 2025年2月に実装完了している。採用した方式（既存 bills に closeSnapshot を付与する方式）の仕様は `change_spec.md` および `implementation_summary.md` を参照。

---

## 1. コレクション構成

### 1.1 正（真実源）: `bills` コレクション

- **パス**: `bills/{billId}`
- **docID**: 伝票ごとに一意の `billId`（クライアントまたはサーバで生成し、createBill 時に指定）
- **真実源**: すべての伝票データの SSoT（Single Source of Truth）。書き込みは Cloud Functions 専任（クライアント直書き禁止）。

### 1.2 サブコレクション（`bills/{billId}/*`）

| サブコレクション | 用途 | 会計前のみ書込可 |
|------------------|------|------------------|
| `items` | 注文品目（メニュー、数量、金額など） | 要（status が open / in_progress のときのみ appendItem 等で追加） |
| `extras` | 追加料金（入店料、追加料金など） | 要 |
| `sideGameChips` | サイドゲームチップ購入・払い戻し | 要 |
| `tournaments` | トーナメント参加・Addon・リエントリー等の記録 | 要 |
| `payments` | 会計時の支払い記録（会計開始後に記録） | 会計中（settling）以降 |
| `events` | 会計後イベント（返金・調整・キャンセル・再開） | 確定後（settled 等） |
| `idempotency` | 冪等キー（requestHash, expiresAt 等）。TTL で自動削除あり | 各 API が自前で作成 |

---

## 2. 伝票が「最初に作られるとき」のデータ

### 2.1 作成を行う関数

伝票（`bills/{billId}`）の**新規作成**は、次のヘルパ API 経由でのみ行われる。

- **ヘルパ**: `createBillWithActiveStay`  
  - 格納: `functions/src/helpers/billsApi/createBillWithActiveStay.ts`

**呼び出し元（Callable 等）**:

| 呼び出し元 | ファイル | 概要 |
|------------|----------|------|
| QR 入店 | `functions/src/userLogin/processVisitByQR.ts` | QR 検証 → 入店処理 → `createBillWithActiveStay` |
| 手動チェックイン | `functions/src/userLogin/manualCheckIn.ts` | PIN 検証 → ユーザー更新 → `createBillWithActiveStay` |

トーナメント参加・Addon・注文などは、**既存の activeStay / bill がある前提**で、`appendItem`・`recordTournamentAction` 等で既存の `bills/{billId}` を更新するだけ。新規の「伝票の作成」は上記 2 経路のみ。

### 2.2 作成時にセットされる親ドキュメントの内容

`createBillWithActiveStay` 内で `bills/{billId}` に **merge: false** で一度だけセットされる初期値は以下のとおり。

```ts
// createBillWithActiveStay.ts より（抜粋）
tx.set(billRef, {
  businessDate,           // サーバで取得した現在営業日（getCurrentBusinessDateKeyOrThrow）
  status: 'open',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  billId,
  receiptNumber: null,
  party: {
    userId,               // 入店ユーザーUID（不変）
    pokerName: pokerName || null,
  },
  place: {
    table: null,
    seat: null,
  },
  meta: {
    schemaVersion: '1.3',
    contentHash: null,
  },
}, { merge: false });
```

- **businessDate**: 作成時点の営業日（YYYY-MM-DD）。**後から変更不可**（updateBill で businessDate は禁止）。
- **status**: 初期値は必ず `'open'`。
- **ops**（会計開始・完了時刻等）: この時点では存在しない。会計開始・完了時に追加される。

あわせて次のような処理が行われる。

- `activeStays/{userId}` を新規作成（`billId`, `isActive: true` 等）。
- `bills/{billId}/idempotency/{idempotencyKey}` を作成（冪等＋TTL）。
- 入店料がある場合のみ `bills/{billId}/extras/{extraId}` を 1 件作成。
- デュアルライトが有効な場合、`todaysBills/{billId}` にスケルトンを複写（後述）。

---

## 3. 会計「される前」（未会計）のフィールド

### 3.1 status の取りうる値（未会計）

- **open**: 伝票作成直後。注文・Addon・卓移動などが可能。
- **in_progress**: 一部 API（例: updatePlace）で遷移しうる中間状態。会計開始は `open` または `in_progress` のときのみ可能。

### 3.2 未会計のときに存在しうるフィールド（親ドキュメント）

| フィールド | 作成時 | 未会計中の更新 |
|------------|--------|----------------|
| `businessDate` | ○ セット（不変） | 変更不可 |
| `status` | `'open'` | `open` / `in_progress` のいずれか |
| `createdAt` / `updatedAt` | ○ | 更新時に `updatedAt` のみ更新 |
| `billId` | ○ | 不変 |
| `receiptNumber` | null | 未使用（会計後にレシート番号を付与する場合は別途検討） |
| `party` | userId, pokerName | 不変 |
| `place` | table, seat | updatePlace で更新 |
| `meta` | schemaVersion, contentHash: null | 必要に応じて更新 |

未会計の時点では **存在しない** ものの例:

- `ops`（accountingStartedAt / accountingStartedBy / accountingCompletedAt / accountingCompletedBy）
- `amounts`（小計・合計等）
- `categoryBreakdown`
- `itemsSnapshot` / `sideGameChipsSummary` / `tournamentsSnapshot`
- `paymentTotals` / `paymentsSummary`
- `postEvents`（返金・調整等）
- `closedAt`

つまり、「未会計かどうか」は **status が open / in_progress か** および **ops.accountingStartedAt の有無** で判断できる。

### 3.3 未会計の取得方法（現状）

- **getOpenBills**（`functions/src/utils/getOpenBills.ts`）  
  - 用途: 入店中ユーザー一覧（注文ダイアログ表示前など）。
  - クエリ:
    - `bills` に対して
    - `businessDate == 当日営業日`（getCurrentBusinessDateKeyOrThrow）
    - `status == 'open'`
  - 返却: billId, userId, pokerName, currentTable, currentSeat など最小限。

未会計の伝票は **bills コレクションにそのまま** 格納され、`businessDate` と `status` でクエリしている。

---

## 4. 会計が「された」ときのフィールド（会計開始 → 会計完了）

### 4.1 会計開始（startAccounting）

- **Callable**: `startAccounting`（`functions/src/callables/accounting.ts`）が `startAccounting` ヘルパ（`functions/src/helpers/billsApi/startAccounting.ts`）を呼ぶ。
- **更新内容**（`bills/{billId}`）:
  - `status`: `'open'` or `'in_progress'` → **`'settling'`**
  - `ops.accountingStartedAt`: serverTimestamp
  - `ops.accountingStartedBy`: オペレータ UID
  - `updatedAt`: serverTimestamp
- **制約**: `ops.accountingStartedAt` が既に存在する場合は「会計開始済み」としてエラー。

### 4.2 会計完了（completeAccountingV2）

- **Callable**: `completeAccountingV2`（`functions/src/callables/accounting.ts`）。
- **更新内容**（`bills/{billId}`）:
  - `status`: **`'settled'`**
  - `ops.accountingCompletedAt`: serverTimestamp
  - `ops.accountingCompletedBy`: 管理者 UID
  - `updatedAt`: serverTimestamp
- **連動**:
  - 同一ユーザーの `activeStays/{userId}` の `isActive` を `false` に更新。
  - `visitLogs` の未完了ログに checkOutAt を設定（legacy と同様）。
- **トリガ**: この `status === 'settled'` への更新で **bills.onSettle** が発火する。

### 4.3 bills.onSettle トリガで追加されるフィールド（確定スナップショット）

`billsOnSettle`（`functions/src/triggers/bills.onSettle.ts`）は、`before.status !== 'settled'` かつ `after.status === 'settled'` のときだけ動く。

トリガ内で **bills/{billId}** に以下を **update** で追加する（親ドキュメントのスナップショットとして確定内容を固定）。

- `amounts.*`: subTotalIncl, discountTotalIncl, serviceChargeIncl, grandTotalIncl, roundingDelta, grandTotalRounded
- `categoryBreakdown`
- `itemsSnapshot` / `sideGameChipsSummary` / `tournamentsSnapshot`
- `paymentTotals` / `paymentsSummary.*`（paidTotalIncl, balanceDueIncl, byMethod）
- `postEvents.*`: totalRefundedIncl, totalAdjustmentsIncl, netSalesIncl（初期値）
- `closedAt`: serverTimestamp
- `meta.contentHash`
- `updatedAt`

つまり「会計がされた後」の伝票は、**同じ bills ドキュメント** に status が `settled` になり、上記の金額・スナップショット・closedAt が一括で付与される。

---

## 5. 会計後（確定済み）の status とフィールド

### 5.1 確定済み status

- **settled**: 会計完了直後。
- **partially_refunded** / **refunded** / **voided**: 会計後イベント（返金・調整・キャンセル・再開）で遷移。

確定済みかどうかは、`status in ['settled', 'partially_refunded', 'refunded', 'voided']` で判定している（例: `getUserOrderHistory`）。

### 5.2 確定済みのときに存在しているフィールド（親ドキュメント）

会計前のフィールドに加え、以下が存在する。

- `ops.accountingStartedAt` / `ops.accountingStartedBy`
- `ops.accountingCompletedAt` / `ops.accountingCompletedBy`
- `amounts.*`
- `categoryBreakdown`
- `itemsSnapshot` / `sideGameChipsSummary` / `tournamentsSnapshot`
- `paymentTotals` / `paymentsSummary`
- `postEvents.*`（返金・調整後に更新）
- `closedAt`
- `meta.contentHash`

### 5.3 確定済みの取得例

- **getUserOrderHistory**（`functions/src/itemOrder/getUserOrderHistory.ts`）  
  - `bills` を
    - `party.userId == request.auth.uid`
    - `businessDate == 当日営業日`
    - `status in ['settled', 'partially_refunded', 'refunded', 'voided']`
  - でクエリし、`createdAt` 降順で返却。

---

## 6. その他の関連仕様

### 6.1 businessDate の不変性

- `bills` の `businessDate` は **作成時に一度だけセット** され、`updateBill` では更新禁止（invalid-argument）。
- 営業日をまたいだ「日付変更」は、現状の設計では想定していない（伝票は作成された営業日に紐づいたまま）。

### 6.2 todaysBills（レガシー・デュアルライト）

- **コレクション**: `todaysBills/{billId}`（docID は billId）。
- **役割**: 移行期のデュアルライト用。**正は bills**。`WRITE_TODAYS_BILLS_IN_PARALLEL`（環境変数または config）が true のときだけ、bills の操作に合わせてスケルトン／status 等を複写。
- **createBillWithActiveStay**: 伝票作成時に todaysBills にスケルトン（status, pokerName, items[], sideGameChip[], place, date, userId）を複写。
- **startAccounting / updateBill**: status 等の最小限を複写。
- 未会計一覧の取得は **getOpenBills** で **bills** を参照しており、todaysBills は「表示用の正」としては使っていない。

### 6.3 閉店時の扱い（未会計 bills は移さない）

- **cleanupActiveStaysOnClose**（`functions/src/close_process/cleanupActiveStaysOnClose.ts`）  
  - 閉店時に **activeStays** を全件削除（isActive の有無は問わない）。
  - 各 activeStay に紐く **bills** は削除せず、status を参照して「会計未確定」（open / in_progress / settling / settled 以外）の billId を監査ログに出すだけ。
- 未会計の **bills** ドキュメントは、閉店後も **bills コレクションに残ったまま**。別コレクションへ移す処理は現状ない。

### 6.4 書込制限（status によるガード）

- **appendItem / appendExtra / appendSideGameChip / recordTournamentAction / updatePlace**  
  - 許可: `status === 'open'` または `'in_progress'`  
  - 拒否: `settling` / `settled` / `voided` 等。
- **postEventRefund / postEventAdjustment / postEventCancel / postEventReopen**  
  - 確定後（settled 等）のみ許可。

---

## 7. まとめ（Step2 検討へのインプット）

- **未会計 bills の保存場所（現状）**  
  - 未会計も確定済みも **同じ `bills` コレクション** に格納。
  - 未会計一覧は `bills` を `businessDate` + `status == 'open'` でクエリ（getOpenBills）。
  - 閉店時も未会計の bills は bills に残し、別コレクションへは移していない。

- **「会計前」と「会計後」の区別**  
  - **status**: open / in_progress → 未会計、settling → 会計中、settled 等 → 確定済み。
  - **ops.accountingStartedAt** の有無で「会計開始済みか」を判定可能。
  - **closedAt** / **amounts** / **paymentsSummary** 等は確定時（bills.onSettle）に付与されるため、存在すれば「少なくとも一度は会計完了している」。

- **伝票を作成する入口**  
  - **createBillWithActiveStay** のみ（呼び出しは processVisitByQR と manualCheckIn）。

この整理を前提に、Step2 では以下を検討する。

1. **未会計 bills の保存方法**  
   - 現状: 既存の `bills` コレクションに未会計も確定済みも同居。  
   - 検討: 閉店に伴う「未会計の扱い」を変える場合、既存コレクションのままフラグで区別するか、別コレクション（またはサブコレクション）に移すか。

2. **フラグの構造**  
   - 検討: 閉店日・営業日切替・手動閉店などの要件に合わせ、どのフィールドをどこに追加するか（例: bills に「閉店時未会計」フラグを付けるか、storeMeta/currentBusinessDay 側に持つか、など）。

---

## 8. 未会計 bills の「見分け方」の2通り（補足）

当日の bills のうち「未会計」と「会計済み」を見分ける方法は、少なくとも次の2つがある。

### 方法A: bills をクエリする

- **条件**: `bills` において  
  - `businessDate` == 当日の営業日  
  - `status` == `'open'`  
- **現状の利用**: `getOpenBills` がこの条件で取得している（入店中ユーザー一覧用）。
- **注意**: 現状は `status == 'open'` のみ。`in_progress`（再開後など）は含めていない。  
  - 「会計開始されていない」だけ欲しい場合は `status in ['open', 'in_progress']` に広げる選択肢がある。

### 方法B: activeStays から billId を取得し、bills を参照する

- **条件**: `activeStays` で `isActive` == true のドキュメントを取得し、各ドキュメントの `billId` に対応する `bills/{billId}` を参照する。
- **意味**: 会計完了時（`completeAccountingV2`）にのみ `activeStays.{userId}.isActive` が false になるため、**isActive == true ⇔ その伝票はまだ会計完了していない** という対応になる。
- **含まれる状態**: その bill の status は `open` / `in_progress` / `settling` のいずれか（会計中の「settling」も含む）。

### 2つの方法の違い

| 観点 | 方法A（bills の businessDate + status） | 方法B（activeStays isActive == true → billId） |
|------|----------------------------------------|-----------------------------------------------|
| 得られる伝票 | 現状は「status == open」のみ。必要なら open + in_progress に拡張可能。 | 会計完了していない伝票すべて（open, in_progress, settling）。 |
| 意味 | 「その営業日で、会計開始前（や未確定）の伝票」に近い。 | 「在席中のユーザーに紐づく伝票＝まだ会計完了していない伝票」。 |
| 読み取りコスト | 1 クエリ（bills、businessDate + status の複合条件）。 | activeStays を 1 クエリし、必要なら billId ごとに bills を get（N 件なら N read）。 |
| 正としての性格 | bills が「伝票の状態」の正。 | 「誰がまだ在席か」の正は activeStays。会計完了と isActive の更新が揃っている。 |

### どちらで未会計 bills を取るのが望ましいか

- **「未会計」の定義による**  
  - **会計開始されていない伝票だけ**欲しい（注文・Addon 可能な伝票一覧など）  
    → **方法A** が向く。条件は `businessDate == 当日` かつ `status in ['open', 'in_progress']` にすると、現状の getOpenBills より広く「会計開始前」を拾える。  
  - **会計完了していない伝票**を漏れなく欲しい（閉店時の未処理伝票の把握、在席者に紐づく伝票など）  
    → **方法B** が向く。在席と会計完了が activeStays で一貫して管理されているため、「まだ会計が終わっていない伝票」と一致する。
- **閉店処理・Step2 の文脈**  
  - 閉店時に「未会計の bills が残っていないか」を確認したり、残っている件数を出したりする目的なら、**「会計完了していない伝票」＝方法B（activeStays isActive == true）** で取得するのが意味的に合う。  
  - 一覧の表示や「その営業日の未会計件数」を bills 側だけでそろえたい場合は、方法A で `status in ['open', 'in_progress', 'settling']` のようにしてもよいが、在席と 1:1 になる保証は activeStays の方が明確。

---

## 9. 参照した主なファイル

| ファイル | 役割 |
|----------|------|
| `functions/src/helpers/billsApi/createBillWithActiveStay.ts` | 伝票＋activeStay 新規作成、初期フィールド定義 |
| `functions/src/helpers/billsApi/startAccounting.ts` | 会計開始（status → settling, ops 追加） |
| `functions/src/callables/accounting.ts` | startAccounting / completeAccountingV2 の Callable、status → settled 更新 |
| `functions/src/triggers/bills.onSettle.ts` | status が settled になったときのスナップショット・closedAt 等の付与 |
| `functions/src/helpers/billsApi/updateBill.ts` | 親ドキュメントの安全なフィールド更新、businessDate 変更拒否 |
| `functions/src/utils/getOpenBills.ts` | 未会計一覧（bills を businessDate + status==open でクエリ） |
| `functions/src/itemOrder/getUserOrderHistory.ts` | 確定済み履歴（bills を status in [settled, ...] でクエリ） |
| `functions/src/helpers/billsApi/dualWrite.ts` | todaysBills へのデュアルライト |
| `functions/src/close_process/cleanupActiveStaysOnClose.ts` | 閉店時の activeStays 削除、未会計 bill の監査ログ |
