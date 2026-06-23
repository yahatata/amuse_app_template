# A-2 詳細: freeze / frozen 状態の業務定義と実装

## 残っている理由

`freeze` / `frozen` の業務上の意味が未確定のため、意図的に保留中。
定義がなければ実装できないため、まず業務定義の確定が必要。

---

## 現状の実装状態

### `freeze` フィールドの存在

`createScheduledTournament` callable には `freeze: boolean`（デフォルト `false`）のパラメータが存在する。
ただし、このフラグが設定されたときの挙動（表示制御・操作制限等）はアプリ側・LIFF 側ともに**未実装**。

### LIFF 側の状態処理

`mapScheduledTournamentForLiff.ts` は `status` フィールドを Firestore から取得した文字列のままクライアントに返している。
`freeze` / `frozen` に対するガードロジック・表示制御は存在しない。

`cancelled` のみ特別扱いされており（`isTournamentStatusCancelled` 関数）、それ以外の status（`freeze` / `frozen` 含む）はそのまま素通りする。

### Flutter アプリ側

Flutter のトーナメント管理画面でも `freeze` / `frozen` に対する特別な UI・制御は見当たらない。

---

## 業務定義として確定が必要な事項

- `freeze` と `frozen` はそれぞれ何を意味するか（例：進行一時停止？ 登録受付停止？）
- `freeze` / `frozen` 状態のとき、LIFF の参加登録・表示をどう扱うか
- `freeze` / `frozen` 状態のとき、アプリ側のトーナメント操作をどう制限するか
- `freeze` への遷移は誰が・どのタイミングで行うか

---

## 参照コード

- `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` — `freeze` パラメータの定義
- `functions/src/shared/tournament/mapScheduledTournamentForLiff.ts` — LIFF 向け status マッピング
- `public/user/index.html` — LIFF フロントエンド（参加登録ガード処理）
