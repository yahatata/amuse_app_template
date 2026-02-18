# 旧フォルダ別棚卸し：userLogin

## 1. 対象フォルダの概要

**functions/src/userLogin** は、来店（入店・状態取得）まわりの **onCall 入口 3 本**（getUserStatus, processVisitByQR, manualCheckIn）と、それらを re-export する **index.ts** からなる。**users**・**activeStays**・**visitLogs**（users/{uid}/visitLogs）を触り、**helpers/billsApi**（createBillWithActiveStay）で伝票・入店料を扱う。**lib/devicePermissions** で呼び出し元デバイス権限を検証。04 の「user＝ユーザー・認証・**来店**」に該当し、移行先は **domains/user/callables** とする（user フォルダと統合）。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥3 関数を re-export。ルート index が `export * from "./userLogin"` で参照 | ⑦domains/user（移行先で user の callables に統合し index は再構成） | ⑧No | ⑨userLogin の export 集約 |
| ①getUserStatus.ts | ②callable | ③Yes | ④Yes | ⑤users（読）, activeStays（読） | ⑥アプリ等から onCall（LIFF で入店状態確認） | ⑦**domains/user/callables** | ⑧No | ⑨入店状態（isStaying）と基本情報。activeStays から isActive 取得 |
| ①processVisitByQR.ts | ②callable | ③Yes | ④Yes | ⑤users（読・書）, activeStays（書）, users/{uid}/visitLogs（書）. helpers/billsApi（createBillWithActiveStay）. lib/devicePermissions | ⑥店舗端末から onCall（QR スキャン後の入店処理） | ⑦**domains/user/callables** | ⑧No | ⑨QR 検証→入店のみ処理。入店料は createBillWithActiveStay で bills 作成 |
| ①manualCheckIn.ts | ②callable | ③Yes | ④Yes | ⑤users（読・書）, activeStays（書）. helpers/billsApi（createBillWithActiveStay）. lib/devicePermissions | ⑥店舗端末から onCall（loginId + PIN で手動入店） | ⑦**domains/user/callables** | ⑧No | ⑨PIN 認証後入店。入店料は createBillWithActiveStay で bills 作成 |

## 3. 追加メモ

- **入口**：3 本とも **onCall**。③入口はいずれも Yes。
- **export**：userLogin/index が 3 本を re-export。ルート index が `export * from "./userLogin"` のため、④export = Yes。
- **移行先**：04 の「user＝ユーザー・認証・来店」に含める。来店（入店・状態取得）は **domains/user/callables** に配置し、**user フォルダ配下の callables と統合**する（auth, user, userLogin を domains/user に集約する方針は 04_auth 棚卸しと整合）。
- **bills との境界**：processVisitByQR / manualCheckIn は **helpers/billsApi（createBillWithActiveStay）** を呼び、入店料伝票を作成する。入店処理は user ドメイン、伝票作成は bills ドメインの責務として、移行後も user の callables から bills の services/repos を参照する形になる。
- **未使用候補**：該当なし。

## 4. 次アクション

- **設計**：user ドメイン設計で、userLogin 配下の 3 callable を **domains/user/callables** に移す方針を記載する。helpers/billsApi・lib/devicePermissions の移行先と import パスを整合させる。
- **changeSpec**：userLogin 移管時に、user と userLogin を **domains/user/callables** に統合し、ルート index の export を `domains/user` に集約する。export 名は変更しない。
- **05_入口一覧**：移行後、getUserStatus / processVisitByQR / manualCheckIn を user/callables として 05 に記載する。
