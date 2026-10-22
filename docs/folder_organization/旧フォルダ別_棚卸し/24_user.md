# 旧フォルダ別棚卸し：user

## 1. 対象フォルダの概要

**functions/src/user** は、ユーザーアカウント・QR まわりの **onCall 入口 4 本**（createUserByApp, createUserAccount, generateQRCode, verifyQRCode）と、それらを re-export する **index.ts** からなる。**users** コレクションの作成・更新・参照のほか、**staffs**（generateQRCode で type=staff 時）、Firebase Auth、Storage（QR 画像）、utils/qrCodeUtils・utils/logUtils を参照。04 の「user＝ユーザー・認証・来店」に該当し、移行先は **domains/user/callables** とする。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥4 関数を re-export。ルート index が `export * from "./user"` で参照 | ⑦domains/user（移行先で callables から再 export して再構成） | ⑧No | ⑨user の export 集約 |
| ①createUserByApp.ts | ②callable | ③Yes | ④Yes | ⑤users（読・書）. Firebase Auth 作成。utils/logUtils（initializeUserLogs）参照 | ⑥アプリ等から onCall（未認証でユーザー自己登録の想定） | ⑦**domains/user/callables** | ⑧No | ⑨pokerName/email/PIN/誕生月日でユーザー作成。Auth + Firestore users |
| ①createUserAccount.ts | ②callable | ③Yes | ④Yes | ⑤users（読・書）. Firebase Auth 作成。utils/logUtils 参照。QR 生成・Storage 保存 | ⑥アプリ等から onCall（認証必須。スタッフによるアカウント作成想定） | ⑦**domains/user/callables** | ⑧No | ⑨認証済みで pokerName/email/PIN/誕生月日で作成。QR Base64 返却 |
| ①generateQRCode.ts | ②callable | ③Yes | ④Yes | ⑤users（読・書）, staffs（読・書）. utils/qrCodeUtils, Storage（QR 画像保存）. type で user/staff 切り替え | ⑥アプリ等から onCall | ⑦**domains/user/callables** | ⑧No | ⑨QR 生成・有効期限更新（qrCodeUrl, qrExpiresAtMs 等）。user/staff 両対応 |
| ①verifyQRCode.ts | ②callable | ③Yes | ④Yes | ⑤users（読）. Firestore は検証時のみ。utils/qrCodeUtils（verifyQRData, parseQRData） | ⑥アプリ等から onCall（店舗端末からの検証想定） | ⑦**domains/user/callables** | ⑧No | ⑨QR データ検証・パース。ユーザー存在確認で valid/data 返却 |

## 3. 追加メモ

- **入口**：4 本とも **onCall**。③入口はいずれも Yes。
- **export**：user/index が 4 本を re-export。ルート index が `export * from "./user"` のため、④export = Yes。
- **移行先**：04 のドメイン一覧「user＝ユーザー・認証・来店」に一致。アカウント作成・QR 生成・QR 検証は **domains/user/callables** に配置する。auth（getFirebaseCustomToken）も user に含める方針（04_auth 棚卸し済み）。
- **他モジュール参照**：utils/qrCodeUtils, utils/logUtils, types。移行後は shared または user ドメイン内のパスに合わせる。
- **未使用候補**：該当なし。

## 4. 次アクション

- **設計**：user ドメイン設計で、4 callable を **domains/user/callables** に移す方針を記載する。utils/qrCodeUtils・logUtils の配置（shared または user 内）を 08 で決定する。
- **changeSpec**：user 移管時に、ルート index の import を `domains/user` に更新する。export 名は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行後、createUserByApp / createUserAccount / generateQRCode / verifyQRCode を user/callables として 05 に記載する。
