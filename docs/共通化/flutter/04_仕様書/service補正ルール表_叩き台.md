# service 補正ルール表（叩き台）

## 文書情報

- 位置づけ: `エラーログ重要度判定.md` §15（補正対象の 5 `errorKey`）に対する **検討用の叩き台**であり、確定仕様ではない
- 方針: **補正ルールを設ける必要があると判断した `service` のみ** を記載する（基本重要度のままでよいと判断した `service` は載せない）
- 補正対象 `errorKey`: `NOT_FOUND`, `FAILED_PRECONDITION`, `PERMISSION_DENIED`, `EXTERNAL_SERVICE_ERROR`, `TIMEOUT`（§15.2）

---

## 表

| errorKey | service | 補正案 | 根拠 |
|---|---|---|---|
| `NOT_FOUND` | `accounting` | 上げ | 未精算・会計・伝票参照の不存在は金銭・締め処理に直結しやすい |
| `NOT_FOUND` | `platform` | 上げ | 設定・マスタドキュメントの不存在は全店舗・横断機能に波及しやすい |
| `NOT_FOUND` | `close_process` | 上げ | 閉店整合に必要な参照データの不存在は処理停止に直結しやすい |
| `NOT_FOUND` | `payroll` | 上げ | 給与計算対象データの不存在は労務・支払に直結しやすい |
| `NOT_FOUND` | `business_hours` | 上げ | 全店舗参照の営業時間マスタの不存在はオペレーション全体に効く |
| `NOT_FOUND` | `tournament_schedule` | 上げ | スケジュール・テンプレ・定期生成の対象不存在は日次・定期運用に直結しやすい |
| `NOT_FOUND` | `tournament` | 上げ | 進行中大会の卓・参加者参照の不存在は現場オペレーションに直結しやすい |
| `FAILED_PRECONDITION` | `accounting` | 上げ | 会計・伝票の前提未達はレジ・締めを止めやすい |
| `FAILED_PRECONDITION` | `close_process` | 上げ | 閉店シーケンスの前提未達はクローズ完了を止めやすい |
| `FAILED_PRECONDITION` | `payroll` | 上げ | 給与確定・計算前の前提未達は支払・締めに直結しやすい |
| `FAILED_PRECONDITION` | `tournament_schedule` | 上げ | スケジュール生成・投入の前提未達は日次・定期運用に効く |
| `FAILED_PRECONDITION` | `tournament` | 上げ | 大会状態と操作の前提がずれた場合、現場影響が大きくなりやすい |
| `PERMISSION_DENIED` | `line` | 上げ | LINE API・トークン・チャネル権限は顧客向けメッセージ・通知経路全体に関わる |
| `PERMISSION_DENIED` | `platform` | 上げ | デバイス・管理系権限は店舗横断の操作可否に直結しやすい |
| `EXTERNAL_SERVICE_ERROR` | `line` | 上げ | 顧客向けメッセージ・Webhook 連携の失敗は外部影響が大きい |
| `EXTERNAL_SERVICE_ERROR` | `accounting` | 上げ | 決済・外部会計連携の失敗は金銭・締めに直結しうる |
| `EXTERNAL_SERVICE_ERROR` | `platform` | 上げ | 秘密管理・外部設定・共通基盤連携の失敗は複数領域に波及しやすい |
| `EXTERNAL_SERVICE_ERROR` | `payroll` | 上げ | 給与計算・外部労務連携の失敗は支払に直結しうる |
| `TIMEOUT` | `tournament_schedule` | 上げ | スケジュール・タスク投入の遅延は日次バッチ・定期運用に効く |
| `TIMEOUT` | `payroll` | 上げ | 給与バッチ・締め関連の遅延は期限・支払サイクルに直結しやすい |
| `TIMEOUT` | `close_process` | 上げ | 閉店処理の遅延は営業日切り替え・締めに直結しやすい |
| `TIMEOUT` | `analytics` | 上げ | 集計・移行バッチの遅延は日次レポート・分析利用に効く |
| `TIMEOUT` | `line` | 上げ | Webhook 応答・API 連携の遅延は顧客向け経路の体感に効く |
| `TIMEOUT` | `store` | 上げ | 開閉店・端末・店舗状態の遅延はその場の営業オペレーションに直結しやすい |

---

## 補足

- **載せていない `service`**: 当該 `errorKey` については、§11.2 の基本重要度のままでよい（追加の補正ルールは不要）と判断したもの。運用後に見直す場合は行を追加する。
- **確定時**: 補正の段階（例: `medium` → `high`）や、条件付きルールは別紙または `エラーログ重要度判定.md` の改訂で定義する。
