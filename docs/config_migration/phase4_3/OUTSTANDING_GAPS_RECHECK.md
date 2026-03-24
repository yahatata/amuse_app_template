# Phase4.3 差分再点検レポート

## 1. 目的

`SPEC_IMPLEMENTATION_DIFF.md` に記載した差分を、**現時点の実装**で再確認し、

- すでに反映済みのもの
- まだ反映できていないもの
- 差分一覧には直接書いていないが、関連して追加で対処した方がよいもの

を整理する。

あわせて、未反映項目ごとに

- 詳細
- 推奨案
- その推奨案を **断定してよいか**
- まだユーザー判断が必要か

を明記する。

---

## 2. 結論サマリ

`SPEC_IMPLEMENTATION_DIFF.md` の G1〜G7 を現状実装で再点検した結果は以下。

| ID | 現在の状態 | 判定 |
|----|------------|------|
| G1 | `firestore.rules` は追加済み | **一部解消** |
| G2 | `processStaffPayroll` で `monthly_payroll_reflect` 未記録 | **未反映** |
| G3 | corrected 通知で `monthlyPayroll.status == confirmed` 未確認 | **未反映** |
| G4 | 通知スケジューラは単一期間のみ | **未反映** |
| G5 | `paymentDate` は実装上「日 or null」、仕様表記は未整理 | **未反映（文書）** |
| G6 | current/previous と recent の用語差が残る | **未反映（文書）** |
| G7 | `serverTimestamp()` のまま | **未反映（文書/解釈）** |

また、G1 関連の追加事項として以下が残る。

- `notifications` 用の複合インデックスが未追加
- `isPayrollAdmin()` は `/admins/{uid}` を前提にしているため、**admin ドキュメント運用**が必要

---

## 3. 反映済み / 部分解消

## G1: Firestore セキュリティルール

### `SPEC_IMPLEMENTATION_DIFF.md` 時点

- `monthlyPayroll`
- `notifications`
- `storeMeta/payrollConfig`

向けの `match` がなく、catch-all で拒否されうる状態だった。

### 現在

`firestore.rules` に以下が追加済み。

- `storeMeta/payrollConfig`: admin read
- `monthlyPayroll/{paymentPeriodKey}` 以下: admin read
- `notifications/{notificationId}`: admin read、`isRead` / `isFlagged` のみ update

### 判定

**一部解消**

### まだ残っていること

1. `notifications` 用の複合インデックスが `firestore.indexes.json` にない
2. admin 判定が `/admins/{uid}` 前提のため、その運用が必要

### 推奨

- **ルール不足そのものは解消済み**としてよい
- ただし、**運用上は未完了**なので G1 は「完全解消」ではなく「一部解消」扱いが妥当

### この判断を断定してよいか

**はい。**

ルール追加済みという事実は明確で、残件もコード上確認できる。

---

## 4. まだ反映できていないもの

## G2: `attendanceLogs.monthly_payroll_reflect`

### 現状

`functions/src/domains/attendance/tasks/processStaffPayroll.ts` に
`writeAttendanceLog()` / `monthly_payroll_reflect` の呼び出しはない。

したがって、`SPEC_IMPLEMENTATION_DIFF.md` の指摘は **現在もそのまま有効**。

### 差分の詳細

仕様:

- `04_CALLABLE_API_SPEC` §11
- `monthly_payroll_reflect` は **`processStaffPayroll` 完了時**

実装:

- `processStaffPayroll` は `attendanceItems` 書き込み、`staffResults` 更新、完了カウント更新までは行う
- しかし `attendanceLogs` は書いていない

### 推奨案

### 推奨案 A

`processStaffPayroll` の成功時に、対象 `attendanceId` ごとに
`attendanceLogs` へ `actionType: 'monthly_payroll_reflect'` を記録する。

### 推奨案 B

仕様側を変更し、

- 「分散実行後は `attendanceItems` / `staffResults` を監査ソースとする」
- `monthly_payroll_reflect` は不要、または confirm 時ログのみで十分

という整理に寄せる。

### 推奨方針

**現時点では A を第一推奨**。

理由:

- 仕様に明記されている
- 既存ログ体系（`payment_registered` / `payment_hold`）とも整合する
- 実装の意味が仕様に対して分かりやすくなる

### 断定してよいか

**まだ完全には断定しない方がよい。**

理由:

- 分散実行で対象件数が多い場合、ログ件数が増える
- `attendanceItems` を監査ソースに寄せる設計もありうる

### ユーザー判断が必要な余地

**あり。**

判断ポイント:

1. `attendanceLogs` を運用監査上の正式ソースとして維持したいか
2. `attendanceItems` / `staffResults` があれば十分か

---

## G3: corrected 通知の confirmed 条件

### 現状

`functions/src/domains/attendance/triggers/attendanceOnWrite.ts` は、

- `before.payrollStatus === 'reflected'`
- 実データが変更された
- `newPayrollStatus === 'corrected_after_reflection'`

のとき通知する。

しかし、**`monthlyPayroll.status === 'confirmed'` の確認はしていない**。

### 差分の詳細

仕様:

- 確定済み期間の修正だけ通知

実装:

- reflected 後の修正であれば通知
- confirmed かは未確認

### 推奨案

### 推奨案 A

通知作成前に `afterData.paymentPeriodKey` から `monthlyPayroll/{paymentPeriodKey}` を読み、
`status === 'confirmed'` の場合のみ `payroll_attendance_corrected` を作成する。

### 推奨案 B

仕様を「reflected 済み修正なら通知」に変更する。

### 推奨方針

**A をかなり強く推奨**。

理由:

- 仕様の文言が明確
- 通知ノイズを減らせる
- “確定済み期間の修正” という運用意図に合う

### 断定してよいか

**ほぼ断定してよい。**

ただし、もし運用上「draft でも reflected 後の修正は管理者に必ず知らせたい」という意図があるなら B の可能性が残る。

### ユーザー判断が必要な余地

**小さく残る。**

確認すべきこと:

- 通知対象を「confirmed 限定」にするか
- 「reflected 済みなら常に通知」の方が運用に合うか

---

## G4: 通知スケジューラの対象期間

### 現状

`functions/src/domains/attendance/tasks/processPayrollNotifications.ts` は、

- `today` が属する期間を算出
- その **直前の 1 期間** を `recentPeriodKey` として評価

している。

複数期間ループはない。

### 差分の詳細

仕様:

- current / previous
- 必要に応じて前々月

実装:

- recent の 1 期間のみ

### 推奨案

### 推奨案 A

仕様どおり、評価対象を

- current
- previous
- 必要なら previous-1

まで明示的に列挙してループ処理する。

### 推奨案 B

実装のままにし、仕様文言を

- 「直前に完了した 1 期間を評価する」

へ寄せる。

### 推奨方針

**現時点では B をやや優先**。

理由:

- 今の実装はシンプルでテスト済み
- 運用上、本当に複数期間通知が必要かは仕様文面だけでは断定しにくい
- 仕様側の current/previous 記述に、説明的な揺れが混ざっている可能性がある

### 断定してよいか

**断定しない方がよい。**

これは実装バグというより、**仕様の粒度 / 運用要件の最終確定が必要な領域**。

### ユーザー判断が必要な余地

**大きい。**

確認すべきこと:

1. 本当に前々月まで通知判定したいか
2. 未処理期間が複数月残る運用を想定しているか
3. 通知コストより取りこぼし防止を優先するか

---

## G5: `paymentDate` の型表記

### 現状

実装は一貫して

- `string | null`
- 実運用は `"25"` のような **日** を想定

で動いている。

`computeActualPaymentDate()` も日番号としてパースしている。

### 推奨案

仕様書を

- `paymentDate: string | null`
- 保存値は `"25"` のような **支払日（1〜31）**

に修正する。

### 断定してよいか

**はい。**

ここは実装の挙動が明確で、仕様表記の修正でよい可能性が高い。

### ユーザー判断が必要な余地

**ほぼなし。**

もし本当に `YYYY-MM-DD` を使いたいなら実装変更が広範囲になるため、
その場合は別タスクで扱うべき。

---

## G6: current / previous 用語整合

### 現状

実装では `recentPeriodKey` を中心にしており、
仕様の `currentPeriod` / `previousPeriod` と 1:1 で対応しない。

### 推奨案

仕様書の用語を、実装に合わせて

- active period
- recent completed period

のように再定義する。

### 断定してよいか

**G4 の方針が決まるまで断定しない方がよい。**

G6 は G4 に従属する。

### ユーザー判断が必要な余地

**あり。**

G4 を「複数期間対応する」のか「1期間評価でよい」のか決めてから、
それに合わせて用語を確定するのが自然。

---

## G7: JST 保存と `serverTimestamp`

### 現状

`functions/src/domains/attendance/helpers/payrollNotificationHelper.ts` では
`createdAt: FieldValue.serverTimestamp()` を使っている。

### 推奨案

**実装はそのまま、仕様文言を修正**するのを推奨。

例:

- 「Firestore Timestamp として保存し、表示時は JST で扱う」

### 理由

- Firestore Timestamp 自体に JST 固定保存の意味はない
- UTC 保存 + 表示時変換が一般的
- 実装を JST 固定文字列に寄せるメリットが薄い

### 断定してよいか

**はい。**

仕様文言の方を直すのが自然。

### ユーザー判断が必要な余地

**ほぼなし。**

監査要件として「文字列で JST 保存」が本当に必要な場合のみ別。

---

## 5. 追加で見つかった関連事項

## A1: `notifications` 用インデックス未追加

### 現状

`firestore.indexes.json` に `notifications` 用の複合インデックスがない。

一方、通知 UI は以下を使う。

- `operationCategory == 'payroll'`
- `isRead == false`
- `isFlagged == true`
- `createdAt >= ...`
- `orderBy(createdAt desc)`

### 推奨案

`notifications` 用インデックスを追加・デプロイする。

### 断定してよいか

**はい。**

これは実装済み UI を安定運用するうえで必要性が高い。

---

## A2: admin 判定の運用前提

### 現状

`firestore.rules` の `isPayrollAdmin()` は
`/admins/{uid}` の存在を前提としている。

### 推奨案

次のどちらかを正式運用ルールとして確定する。

1. `/admins/{uid}` を admin 権限の SSOT にする
2. custom claims に寄せる

### 推奨方針

**短期は `/admins/{uid}`、中長期は custom claims も検討**が現実的。

### 断定してよいか

**短期運用としては断定可。**

ただし長期の認可設計は給与機能だけの話ではないため、
全体設計としては判断余地がある。

---

## A3: `monthlyPayrollTriggerEnabled` のコード / ドキュメント差分

### 現状

ドキュメント側では

- `monthlyPayrollTriggerEnabled` は false（デフォルト）

という記載がある一方、実装は

- `DEFAULT_MONTHLY_PAYROLL_TRIGGER_ENABLED = true`

になっている。

### 推奨案

**設計意図が「旧スケジューラは止める」ならコードを false に寄せる**。

### 断定してよいか

**やや慎重に扱うべき。**

既存運用がこの値に依存している可能性があるため、
いきなりコードを変える前に本番設定の実値を確認した方がよい。

### ユーザー判断が必要な余地

**あり。**

確認すべきこと:

- 現在の `storeMeta/schedulerConfig` 実データ
- 旧 `monthlyPayrollTrigger` をまだ使っている環境があるか

---

## 6. 最終整理

## 断定して進めやすいもの

- G5: `paymentDate` は仕様書を実装に合わせて修正
- G7: JST 保存表現は仕様文言を修正
- A1: `notifications` インデックス追加
- G1: ルール不足そのものは解消済みだが、運用残件あり

## 実装変更を強く推奨するもの

- G3: corrected 通知は confirmed 条件を追加

## ユーザー判断を挟んだ方がよいもの

- G2: `monthly_payroll_reflect` を本当に `attendanceLogs` に残すか
- G4: 通知対象期間を複数期間へ広げるか
- G6: G4 の決定後に用語整理
- A3: `monthlyPayrollTriggerEnabled` のデフォルト値

