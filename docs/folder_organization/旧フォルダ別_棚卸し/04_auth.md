# 旧フォルダ別棚卸し：auth

## 1. 対象フォルダの概要

**functions/src/auth** は、**認証** まわりの HTTP 入口を置くフォルダ。ファイルは **2 件**（index.ts と getFirebaseCustomToken.ts）。LIFF の LINE ID トークンを検証し、Firebase カスタムトークンを発行する onRequest 入口を 1 件だけ提供する。04_新フォルダ構造のドメイン一覧には「auth」はなく **user**（ユーザー・認証・来店）に含めるため、移行先は domains/user とする。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約のみ | ⑦domains/user（移行先で callables 等から再 export して再構成） | ⑧No | ⑨export 集約。getFirebaseCustomToken のみ re-export |
| ①getFirebaseCustomToken.ts | ②callable | ③Yes | ④Yes | ⑤なし（Firestore は触らない。Firebase Auth でカスタムトークン発行、utils/lineAuth で LINE ID トークン検証） | ⑥クライアントから HTTP POST（LIFF ログイン時） | ⑦domains/user/callables | ⑧No | ⑨onRequest（HTTP）入口。Authorization: Bearer {liff_id_token} でトークン検証→カスタムトークン返却。05_入口一覧では user / callables と整合 |

## 3. 追加メモ

- **入口**：getFirebaseCustomToken の 1 件のみ。**onRequest**（HTTP）のため、02_棚卸しルールの「onRequest を含むなら入口」に該当し、③Yes。種別は「callable（onCall / https 入口）」の https 入口として ②callable とした。
- **export 経路**：auth/index が getFirebaseCustomToken を export。ルート index が `export * from "./auth"` で取り込んでいるため、④Yes。
- **他モジュール参照**：getFirebaseCustomToken は **utils/lineAuth**（verifyLineIdToken）を import。移行後は shared または user ドメイン内の utils 参照パスに合わせる必要あり。
- **移行先**：04 のドメイン一覧に「auth」はなく **user**（ユーザー・認証・来店）があるため、auth フォルダ配下は **domains/user/callables** に配置する。user ドメイン設計時に、user/ と auth/ を統合した配置とする。
- **shared 候補**：なし。認証トークン発行は user ドメインの責務として扱う。
- **未使用候補**：該当なし。export されており、LIFF ログインの入口として利用されている。

## 4. 次アクション

- **設計**：user ドメイン設計（`新フォルダ別_設計/XX_user.md`）作成時に、auth/getFirebaseCustomToken.ts の移動先を **domains/user/callables/getFirebaseCustomToken.ts**（または user 配下の HTTP 入口として適切なパス）として反映する。utils/lineAuth への import パスを移行先から参照できるようにする。
- **changeSpec**：user ドメイン移管時の changeSpec で、auth/getFirebaseCustomToken.ts の移動と index の export パス付け替えを記載する。
- **05_入口一覧**：移行実施後、getFirebaseCustomToken の「現在パス」を新パスに更新する。05 には「user / callables」として記載済みで変更なし。
