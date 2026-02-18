# 旧フォルダ別棚卸し：storeManagement

## 1. 対象フォルダの概要

**functions/src/storeManagement** は、店舗の開閉店・営業状態まわりの **onCall 入口 6 本** と **index.ts** の計 7 ファイル。openStore（手動開店）, closeStore（手動閉店）, openStoreTerminal（ターミナル開店）, closeStoreTerminal（ターミナル閉店）, continueBusinessTerminal（営業継続）, createInitialStateDocCallable（初期状態ドキュメント作成）を export。ルート index が `export * from "./storeManagement"` で export。helpers/stateDoc（processingLease, generateJstDateKey）, lib/devicePermissions, lib/env を参照。04 の「storeMeta＝店舗・開閉店・状態・店舗評価（開始/終了タスク含む）」にそのまま対応する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥6 関数を re-export | ⑦domains/storeMeta（移行先で再構成） | ⑧No | ⑨storeManagement の export 集約 |
| ①openStore.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta/currentBusinessDay（書）. helpers/stateDoc（generateJstDateKey）, lib/devicePermissions | ⑥アプリ等から onCall | ⑦domains/storeMeta/callables | ⑧No | ⑨手動開店。JST 日付キーで currentBusinessDay を running に更新 |
| ①closeStore.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta/currentBusinessDay（読・書）, storeMeta/currentBusinessDay/logs（書）. lib/devicePermissions | ⑥アプリ等から onCall | ⑦domains/storeMeta/callables | ⑧No | ⑨手動閉店。状態を closed に更新しログ記録 |
| ①openStoreTerminal.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta/currentBusinessDay（書・読）. helpers/stateDoc（processingLease, generateJstDateKey） | ⑥アプリ等から onCall。開店ターミナル用。排他制御で processingLease を利用 | ⑦domains/storeMeta/callables | ⑧No | ⑨ターミナル開店。リース獲得・延長・解放のうえ状態更新 |
| ①closeStoreTerminal.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta/currentBusinessDay（書・読）, storeMeta/closeRuns（書・読）, bills（読・書）, users（書）. helpers/stateDoc（processingLease）, close_process 等 | ⑥アプリ等から onCall。閉店ターミナル用。close_process の applyCloseSnapshot 等を呼ぶ | ⑦domains/storeMeta/callables | ⑧No | ⑨ターミナル閉店。未精算伝票の扱い・bills/users 更新を含む閉店フロー |
| ①continueBusinessTerminal.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta/currentBusinessDay（読）. lib/env（getEnv） | ⑥アプリ等から onCall。営業継続の確認用 | ⑦domains/storeMeta/callables | ⑧No | ⑨営業継続。環境変数等を参照して継続可否を返す |
| ①createInitialStateDocCallable.ts | ②callable | ③Yes | ④Yes | ⑤storeMeta/currentBusinessDay（読・書） | ⑥アプリ等から onCall。初期化用（一時的利用を推奨） | ⑦domains/storeMeta/callables | ⑧No | ⑨currentBusinessDay の初期ドキュメント作成。scripts/createInitialStateDoc の onCall 版 |

## 3. 追加メモ

- **入口**：6 本とも **onCall** を含むため ③入口 Yes。種別は **callable**。
- **export**：storeManagement/index が 6 関数を re-export し、ルート index が `export * from "./storeManagement"` で export しているため、④export = Yes。
- **移行先**：04 のドメイン一覧「storeMeta＝店舗・開閉店・状態・店舗評価（開始/終了タスク含む）」に一致。**domains/storeMeta/callables** に配置する。
- **他モジュール参照**：helpers/stateDoc（processingLease, generateJstDateKey）, lib/devicePermissions, lib/env。closeStoreTerminal は close_process（applyCloseSnapshot 等）も参照。移行後は stateDoc の移行先（storeMeta または shared）、lib の移行先に合わせて import パスを更新する。
- **未使用候補**：該当なし。全ファイルが index から export され、アプリ等の呼び出し対象となる。

## 4. 次アクション

- **設計**：storeMeta ドメイン設計で、上記 6 callable を **domains/storeMeta/callables** に移す方針を記載する。helpers/stateDoc・lib・close_process の import パスを移行先に合わせて更新する。
- **changeSpec**：storeManagement 移管時に、ルート index の **import パス** を `domains/storeMeta`（または storeMeta の index）に更新する。export 名は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行先確定後、storeManagement 配下の 6 入口の配置を「storeMeta/callables」に更新する。
