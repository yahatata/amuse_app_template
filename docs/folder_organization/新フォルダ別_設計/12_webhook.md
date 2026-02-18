# 新フォルダ別設計：webhook

## 5.1 ドメイン定義（短く）

外部連携（LINE 等）を担当するドメイン。LINE Webhook で follow/unblock 時のリッチメニュー切り替え、postback でのシフト要請辞退処理を行う。04 の「webhook＝外部連携（LINE 等）」に該当。

**主に扱うデータ/コレクション**
- staffs（読）, shiftRequests（書）
- LINE Messaging API（リッチメニューリンク・リプライ）。環境変数 LINE_CHANNEL_ACCESS_TOKEN, STAFF_RICHMENU_ID, USER_RICHMENU_ID, LINE_PLAN

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | LINE Webhook の onRequest 入口（lineWebhook）。HTTP 入口のため callables 相当で配置 |
| services/ | utils/lineMessaging（sendLinePushMessage, formatDateToJapanese）を移行。shift/sendRecruitmentNotification が参照 |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| webhook/index.ts | domains/webhook の再構成 | — |  |
| webhook/lineWebhook.ts | domains/webhook/callables/lineWebhook.ts | callable | onRequest。**lineWebhook スタブの扱いは一旦保留**。現状のままスタブと実装の両方を index に残す（08 確定）。確認後仮置きの文を index から削除する予定 |
| utils/lineMessaging.ts | domains/webhook/services/lineMessaging.ts | service | sendLinePushMessage, formatDateToJapanese。shift/sendRecruitmentNotification が参照。import を domains/webhook/services に更新 |

---

## 5.4 index.ts 変更方針

- **ルート index**：**lineWebhook スタブの扱いは一旦保留**（08 確定）。現状のままスタブと実装の**両方**を index に残す。確認後、仮置きの文を index から削除する予定。
- **domains/webhook/index.ts**：lineWebhook を re-export。関数名は維持。
- **shift/sendRecruitmentNotification** が lineMessaging を参照するため、import を domains/webhook/services に更新する。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。shift から domains/webhook/services を参照できること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **lineWebhook スタブ**：**一旦保留**（08 確定）。現状のままスタブと実装の両方を index に残す。確認後仮置きの文を index から削除する予定。
- **changeSpec**：webhook 移管時に、ルート index の import を `domains/webhook` に更新する。lineWebhook は現状どおり両方残す方針で進める。
- **05_入口一覧**：移行後、lineWebhook を webhook/callables として 05 に記載する。
- **他ドメインとの境界**：staffs・shiftRequests は shift/staff ドメインのデータ。webhook は「LINE イベントを受けて」それらを読書するだけであり、責務は外部連携に留める。移行後も webhook の callables から shift/staff のデータ（Firestore 直接または repos）を参照する形で可。
