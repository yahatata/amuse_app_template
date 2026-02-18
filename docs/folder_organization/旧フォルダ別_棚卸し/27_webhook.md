# 旧フォルダ別棚卸し：webhook

## 1. 対象フォルダの概要

**functions/src/webhook** は、**onRequest（HTTP）入口 1 本**（lineWebhook）と、それを re-export する **index.ts** の計 2 ファイル。LINE Webhook で follow/unblock 時にリッチメニューを切り替え、postback でシフト要請の辞退処理を行う。**staffs**（読）と **shiftRequests**（書）を触る。04 の「webhook＝外部連携（LINE 等）」に該当し、移行先は **domains/webhook/callables** とする。なおルート index では `export * from "./webhook"` の後に **lineWebhook がスタブで上書き**されているため、デプロイ時に実装が使われているか要確認（08 に記録推奨）。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥lineWebhook を re-export。ルート index が `export * from "./webhook"` で参照 | ⑦domains/webhook（移行先で callables から再 export して再構成） | ⑧No | ⑨webhook の export 集約 |
| ①lineWebhook.ts | ②callable | ③Yes | ④Yes | ⑤staffs（読）, shiftRequests（書）. LINE Messaging API（リッチメニューリンク・リプライ） | ⑥LINE プラットフォームから POST。follow/unblock でリッチメニュー、postback でシフト辞退 | ⑦**domains/webhook/callables** | ⑧No | ⑨onRequest。LINE_PLAN で communication 時は辞退機能を無効化。ルート index で同名スタブが後から export されており実装が上書きされる可能性あり |

## 3. 追加メモ

- **入口**：lineWebhook は **onRequest**（HTTP）。02 の「onRequest を含むなら入口」に該当し、③Yes。種別は https 入口として ②callable。
- **export**：webhook/index が lineWebhook を re-export。ルート index が `export * from "./webhook"` で取り込むが、**同じ index.ts 内で続けて `export const lineWebhook = onRequest(...)` スタブが定義されており、後者が優先される**。そのためデプロイ時に webhook/lineWebhook の実装が Cloud Functions に含まれるかは、モジュール解決順に依存し要確認。④は Yes（webhook 経由では export されている）とし、⑨で上書きの可能性を記載する。
- **移行先**：04 のドメイン一覧「webhook＝外部連携（LINE 等）」に一致。**domains/webhook/callables** に配置する（onRequest は callables 相当の入口）。
- **他ドメインとの境界**：staffs・shiftRequests は shift/staff ドメインのデータ。webhook は「LINE イベントを受けて」それらを読書するだけであり、責務は外部連携に留める。移行後も webhook の callables から shift/staff の repos または Firestore を参照する形で可。
- **未使用候補**：該当なし。

## 4. 次アクション

- **設計**：webhook ドメイン設計で、lineWebhook を **domains/webhook/callables** に移す方針を記載する。
- **changeSpec**：webhook 移管時に、ルート index の import を `domains/webhook` に更新する。**lineWebhook スタブの扱い**（リモート専用と記載されているため、実装を有効にするかスタブを残すか）を 08 で決定し、必要ならスタブを削除または別名にして実装を export する。
- **08_意思決定ログ**：ルート index の lineWebhook スタブと webhook/lineWebhook 実装のどちらをデプロイ対象とするか、判断を記録する。
- **05_入口一覧**：移行後、lineWebhook を webhook/callables として 05 に記載する。
