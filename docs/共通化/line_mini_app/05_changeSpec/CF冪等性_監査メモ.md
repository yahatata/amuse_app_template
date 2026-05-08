# Cloud Functions 冪等性・重複防止 — 監査メモ（LINE ミニアプリ更新系）

対象: changeSpec で「クライアント一次防御」の裏で確認が推奨されていた **更新系 Callable**（No.19〜27 / 29 / 30 に対応するサーバー処理）。  
方法: **ソースコードレビュー**（本番での同一リクエスト再送テスト・負荷試験は含まない）。

---

## 総括

| 強さ | Callable | 概要 |
|------|----------|------|
| **強い（設計に明示）** | `placeOrderByUser` → `appendItem` | `bills/{billId}/idempotency/{key}` ＋ `requestHash` で **同一キー再実行は既存行を返す**（テストあり）。 |
| **一定（状態・キーで抑制）** | `createMultipleShifts`, `updateShiftRequest`, `confirmShiftRequest` | ドキュメント ID・ステータス・トランザクションで重複や無意味な更新を抑止。 |
| **部分的** | `createUserAccount`, `createStaffAccount`, `generateQRCode`, `registerForTournament` | 事前チェックや TX はあるが、**再送・競合・二重課金**の穴が残りうる。 |
| **弱い** | `createAttendanceCorrectionRequest` | **都度 `collection.add`** で重複申請をサーバー側で防いでいない。 |

以下、Callable ごと。

---

## No.19 — `createUserAccount`

**実装**: `functions/src/domains/user/callables/createUserAccount.ts`

| 観点 | 内容 |
|------|------|
| 重複登録 | **pokerName** の `users` クエリで事前拒否（`already-exists`）。 |
| 同一 UID | **`users/{auth.uid}` の存在チェックなし**。同一ユーザーによる **二回目の呼び出しは `.set()` で上書き**しうる（真の「作成のみ許可」の冪等ではない）。 |
| 競合 | pokerName と UID の組み合わせでは、別 UID が同名を取りに来た場合はクエリで片方は落ちるが、**極端な同時刻競合**は Firestore の整合性モデルに依存。 |

**結論**: 「別 pokerName での二重ユーザー作成」はある程度防げる。**同一 UID の再実行・上書き**は別対応（存在時は `already-exists` または no-op 返却）を検討。

---

## No.26 — `createStaffAccount`

**実装**: `functions/src/domains/staff/callables/createStaffAccount.ts`

| 観点 | 内容 |
|------|------|
| 重複 | **fullNameKana** の重複で `already-exists`。 |
| 同一 UID | **createUserAccount と同様、`staffs/{uid}` 存在チェックなし**。再実行で **上書き**しうる。 |

**結論**: No.19 と同型の改善余地あり。

---

## No.20 / 21 / 22 — `generateQRCode`

**実装**: `functions/src/domains/user/callables/generateQRCode.ts`

| 観点 | 内容 |
|------|------|
| 意図 | **呼ぶたびに新しい QR を発行する動き**（仕様上「冪等＝同じ結果を返す」とは限らない）。 |
| 競合 | `runTransaction` で **既存 `qrExpiresAtMs` が新しい方が優先**され、期限だけ「短くしない」方向に調整。 |
| 連打 | コメントどおり **サーバー側の連続生成レート制限は削除**。クライアントのクールダウン依存。 |

**結論**: 「多重発行の業務リスク」は運用・クライアントで抑止。**同一応答の冪等性**は求めない設計として読める。

---

## No.23 / 24 — `placeOrderByUser`

**実装**: `functions/src/domains/itemOrder/callables/placeOrderByUser.ts` → `appendItem`

| 観点 | 内容 |
|------|------|
| コア | `idempotencyKey = appendItem:${billId}:${sessionNonce}-${index}`。**`appendItem` は bill 配下 idempotency で強い冪等**（`appendItem.ts` コメント・実装、`requestHash` 不一致はエラー）。 |
| クライアント | **`clientNonce` 未指定時は `session_${Date.now()}`** → **リトライのたびに別キーになり二重注文になりうる**。同一セッションで明示 `clientNonce` を付けるとテストどおり **リプレイで 0 件加算**（`placeOrderByUser.spec.ts` の replay ケース）。 |
| `_TodaysOrders` | bill 側が `reused` でも、`orders` 側 TX は **doc 存在で新規加算をスキップ**する構造（itemId 単位）。 |

**結論**: **サーバーは用意済み**。LIFF が **安定した `clientNonce` を付けない限り、ネットワークリトライで二重計上リスク**が残る。実装サマリの実機確認に「リトライ時の nonce」を含めるとよい。

---

## No.25 — `registerForTournament`

**実装**: `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts`

| 観点 | 内容 |
|------|------|
| 事前 | `bills/{billId}/tournaments/{templateId}` の **存在チェック**で「既に登録済み」を拒否。 |
| TX 内 | `scheduledTournaments` の views / waiting / usersList を更新。**bill 側 tournaments ドキュメントの再読・create はこの TX スニペットには含まれず**（コメントでは `recordTournamentAction` に集約）。 |
| 競合 | **事前チェックと TX の間にギャップ**があるため、**短時間の二重タップ**で **waiting / counters が二重に進む**可能性は排除しきれない（Firestore TX はリトライするが、読み取り集合に bill tournaments が入っていないと検知しない）。 |
| 課金記録 | `recordTournamentAction` の `idempotencyKey` に **`randomUUID()` を使用** → **同一参加のリトライで別キーになり、append 系の冪等と連続しない**。 |

**結論**: 「既にエントリー済み」の軽いガードはある。**厳密な二重参加防止・課金の単回化**は、`bill tournaments` を TX 内で読み **安定した idempotencyKey（例: userId + tournamentId）** などの見直し余地あり。

---

## No.27 — `updateShiftRequest` / `createMultipleShifts`

**実装**:  
`functions/src/domains/staff/callables/updateShiftRequest.ts`  
`functions/src/domains/staff/callables/createMultipleShifts.ts`

| Callable | 内容 |
|----------|------|
| `updateShiftRequest` | **自分の申請・`pending` のみ**更新。同内容を複数回送っても **上書きで収束**（作成増殖なし）。 |
| `createMultipleShifts` | 申請ドキュメント ID **`${staffId}_${dateKey}`**。TX 内で既存を読み、期間②は **already-exists**、期間①は **上書き**。同時実行も TX で直列化されやすい。 |

**結論**: **設計として堅め**。競合時の業務エラー（already-exists）は明示されている。

---

## No.29 — `confirmShiftRequest`

**実装**: `functions/src/domains/staff/callables/confirmShiftRequest.ts`

| 観点 | 内容 |
|------|------|
| 再実行 | **`status === "confirmed"` のときは成功として返す**（コメントどおり重複呼び出し許容）。 |
| それ以外の終端状態 | `pending` 以外はエラー（確認済み以外の処理済み）。 |

**結論**: **深リンクの再実行には明示的な冪等配慮あり**。

---

## No.30 — `createAttendanceCorrectionRequest`

**実装**: `functions/src/domains/attendance/callables/createAttendanceCorrectionRequest.ts`

| 観点 | 内容 |
|------|------|
| 保存 | **`attendanceCorrectionRequests` に `add` のみ**。同一 staff・同一日・同一内容の **重複チェックなし**。 |
| 認証 | ペイロードの `staffId` をそのまま保存。**`request.auth.uid === staffId` の検証は実装されていない**（別 Callable／ルール前提またはギャップの可能性）。 |

**結論**: **二重申請のサーバー側ブロックは未実装**。必要なら「staffId + date + pending の既存検索」や **決定的 doc ID + TX** を検討。また **`auth.uid` と `staffId` の一致**をサーバーで強制することを推奨。

---

## 次のアクション（優先度の例）

1. **LIFF `placeOrderByUser`**: 注文単位で **`clientNonce` を永続化／固定化**（送信開始時に 1 つ発行し失敗まで再利用）。  
2. **`createAttendanceCorrectionRequest`**: 重複申請ポリシーを決め、**クエリ or 決定論的 ID** で実装。  
3. **`registerForTournament`**: **TX 内で bill tournaments を読む**、または **安定 idempotencyKey** で `recordTournamentAction` を繋ぐ。  
4. **`createUserAccount` / `createStaffAccount`**: **`doc(uid).exists` でブロック**または no-op 成功レスポンスに統一。  

---

## 関連

- changeSpec: [`ローディング表示.md`](./ローディング表示.md) §3.2  
- 実装サマリ: [`実装サマリ_ローディング表示.md`](./実装サマリ_ローディング表示.md)  
