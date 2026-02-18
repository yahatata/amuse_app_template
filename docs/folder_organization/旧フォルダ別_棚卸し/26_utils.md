# 旧フォルダ別棚卸し：utils

## 1. 対象フォルダの概要

**functions/src/utils** は、**onCall 入口 1 本**（getOpenBills）と、**他モジュールから直接 import されるのみの 5 ファイル**（lineMessaging, paymentSplitCalculator, logUtils, qrCodeUtils, lineAuth）および **index.ts** からなる。**index が export するのは getOpenBills のみ**。他 5 ファイルは index から export されていないが、auth / user / userLogin / shift / callables / sideGame / itemOrder 等から参照されている。04 の shared は「どのドメインでも意味が同じ」に限定され、**禁止: shared/utils は作らない**（04）のため、各ファイルをドメイン別または shared 候補として振り分ける。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥getOpenBills のみ re-export。ルート index が `export * from "./utils"` で参照 | ⑦移行先で getOpenBills は bills/callables から再 export して再構成 | ⑧No | ⑨utils の export 集約（1 件のみ） |
| ①getOpenBills.ts | ②callable | ③Yes | ④Yes | ⑤bills（読）, helpers/stateDoc（getCurrentBusinessDateKeyOrThrow） | ⑥アプリ等から onCall。入店中ユーザー一覧（注文ダイアログ・利用者一覧等） | ⑦**domains/bills/callables** | ⑧No | ⑨当日 status=open の伝票一覧。04 の bills＝伝票・精算・会計確定に該当 |
| ①lineMessaging.ts | ②service | ③No | ④No | ⑤なし（LINE Push API 呼び出しのみ） | ⑥shift/sendRecruitmentNotification | ⑦**domains/webhook/services** | ⑧No | ⑨sendLinePushMessage, formatDateToJapanese。04 の webhook＝外部連携（LINE等）に該当。shift は webhook 経由で LINE 送信を利用 |
| ①paymentSplitCalculator.ts | ②service | ③No | ④No | ⑤なし（純粋計算。Flutter と同期の SoT） | ⑥callables/verifyPaymentSplit | ⑦**domains/bills/services** | ⑧No | ⑨支払い分割計算・DEFAULT_POINT_PRIORITY。精算照合用。bills ドメインの SoT |
| ①logUtils.ts | ②service | ③No | ④No | ⑤users/{uid}/sideGameChipLogs・pointALogs・pointBLogs（読・書） | ⑥user（createUserByApp, createUserAccount）, callables/setRankingData, sideGame（depositTip, withdrawTip）, itemOrder/placeOrder | ⑦**domains/user/services** | ⑧No | ⑨addLogEntry, initializeUserLogs。ユーザーログサブコレクション。複数ドメインから参照するがデータ所在は users のため user に配置。他ドメインは user の services を参照 |
| ①qrCodeUtils.ts | ②service | ③No | ④No | ⑤なし（Storage 書込は saveQRCodeToStorage。Firestore は呼び出し元が実施） | ⑥user（generateQRCode, verifyQRCode）, userLogin（processVisitByQR）, staff（createStaffAccount） | ⑦**domains/user/services**（または shared 候補。08 で判断） | ⑧No | ⑨QR 生成・検証・Storage 保存。user/staff 両方で利用。意味は「認証・来店用 QR」で共通のため shared 候補にもなるが、暫定で user に配置し staff から参照 |
| ①lineAuth.ts | ②service | ③No | ④No | ⑤なし（LINE ID トークン検証のみ） | ⑥auth/getFirebaseCustomToken。auth は user に統合予定 | ⑦**domains/user/services** | ⑧No | ⑨verifyLineIdToken。認証の一部。user ドメインに統合 |

## 3. 追加メモ

- **入口**：getOpenBills のみ **onCall**。他 5 ファイルは入口ではない（③No）。
- **export**：utils/index は getOpenBills のみ export。ルート index は `export * from "./utils"` のため、getOpenBills は ④Yes。lineMessaging, paymentSplitCalculator, logUtils, qrCodeUtils, lineAuth は utils/index から export されていないため ④No（他フォルダから相対パスで import されている）。
- **移行先の考え方**：
  - **getOpenBills**：開いている伝票一覧は 04 の bills に該当。**domains/bills/callables**。
  - **lineMessaging**：LINE API は 04 の webhook（外部連携）。**domains/webhook/services**。shift は「募集通知で LINE 送信」なので webhook のサービスを参照する形にする。
  - **paymentSplitCalculator**：精算の支払い分割 SoT。**domains/bills/services**。
  - **logUtils**：users のログサブコレクション書き込み。user, sideGame, itemOrder, callables（setRankingData）から参照。データ所在は users のため **domains/user/services**。他ドメインは domains/user/services を import する形にする。
  - **qrCodeUtils**：user / userLogin / staff から参照。QR は「認証・来店」で共通の意味。**domains/user/services** に置き staff から参照する形で可。shared に「qr」カテゴリを新設する場合は 08 に記録する。
  - **lineAuth**：auth（→ user 統合）のみ参照。**domains/user/services**。
- **04 の禁止**：`shared/utils/` は作らない。汎用「utils」フォルダは移行後に廃止し、上記のとおりドメイン別・shared 候補で振り分ける。
- **未使用候補**：該当なし。

## 4. 次アクション

- **設計**：各ドメイン（bills, webhook, user）の設計で、上記移行先を反映する。logUtils を user/services に置いた場合、sideGame / itemOrder / callables の import を `domains/user/services`（または user の export 方針）に合わせる。
- **changeSpec**：utils 廃止時に、getOpenBills → domains/bills/callables、lineMessaging → domains/webhook/services、paymentSplitCalculator → domains/bills/services、logUtils・qrCodeUtils・lineAuth → domains/user/services に移動。ルート index の utils 参照を削除し、各移行先から必要に応じて re-export する。
- **08_意思決定ログ**：qrCodeUtils を shared に新規カテゴリとして出すか、user/services に置いて staff から参照するか、判断結果を記録する。
- **05_入口一覧**：getOpenBills を bills/callables として 05 に記載する。
