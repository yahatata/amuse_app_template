# 旧フォルダ別棚卸し：sideGame

## 1. 対象フォルダの概要

**functions/src/sideGame** は、サイドゲーム・チップ・席まわりの **onCall 入口 4 本** のみ。index.ts はなく、**callables/index** がここから 4 関数を re-export し、ルート index が callables 経由で export している。registerForSideGame（参加登録）, leaveSeat（退席）, depositTip（チップ預入）, withdrawTip（チップ引出）の 4 本。04 の「sideGame＝サイドゲーム・チップ・席」にそのまま対応する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①registerForSideGame.ts | ②callable | ③Yes | ④Yes | ⑤sideGame（読・書）, bills/place（書・helpers/billsApi/updatePlace）, activeStays（読） | ⑥callables/index が re-export。アプリ等から onCall。lib/devicePermissions, helpers/billsApi/updatePlace 参照 | ⑦domains/sideGame/callables | ⑧No | ⑨サイドゲーム参加登録。席情報を sideGame と bills に反映 |
| ①leaveSeat.ts | ②callable | ③Yes | ④Yes | ⑤sideGame（書）, bills/place（書・updatePlace）, activeStays（読） | ⑥callables/index が re-export。lib/devicePermissions, helpers/billsApi/updatePlace 参照 | ⑦domains/sideGame/callables | ⑧No | ⑨退席処理。sideGame の座席クリアと bills の place 更新 |
| ①depositTip.ts | ②callable | ③Yes | ④Yes | ⑤users（読・書・sideGameChip）, bills/sideGameChips（書・appendSideGameChip）, todaysBills（DualWrite）. helpers/billsApi（getActiveBillByUser, appendSideGameChip）, utils/logUtils | ⑥callables/index が re-export。lib/devicePermissions 参照 | ⑦domains/sideGame/callables | ⑧No | ⑨チップ預入。伝票に sideGameChip 追加・users.sideGameChip 更新 |
| ①withdrawTip.ts | ②callable | ③Yes | ④Yes | ⑤users（読・書・sideGameChip）, bills/sideGameChips（書・appendSideGameChip）, todaysBills（DualWrite）. helpers/billsApi, utils/logUtils | ⑥callables/index が re-export。lib/devicePermissions 参照 | ⑦domains/sideGame/callables | ⑧No | ⑨チップ引出。同上 |

## 3. 追加メモ

- **入口**：4 本とも **onCall** を含むため ③入口 Yes。種別は **callable**。
- **export**：sideGame に index はない。**callables/index** が `../sideGame/registerForSideGame` 等を re-export し、ルート index が `export * from "./callables"` でまとめて export しているため、④export = Yes（ルート index から callables 経由で辿れる）。
- **移行先**：04 のドメイン一覧「sideGame＝サイドゲーム・チップ・席」に一致。**domains/sideGame/callables** に配置する。
- **他ドメイン参照**：helpers/billsApi（getActiveBillByUser, appendSideGameChip, updatePlace）、lib/devicePermissions、utils/logUtils を参照。責務はサイドゲーム・チップ・席の操作であり、伝票やユーザーはその文脈で触るだけなので移行先は sideGame のままでよい。
- **未使用候補**：該当なし。4 本とも callables 経由で export され、アプリ等の呼び出し対象となる。

## 4. 次アクション

- **設計**：sideGame ドメイン設計で、上記 4 callable を **domains/sideGame/callables** に移す方針を記載する。helpers/billsApi・lib/devicePermissions 等の import パスを移行先に合わせて更新する。
- **changeSpec**：sideGame 移管時に、**callables/index** の sideGame への **import パス** を `domains/sideGame/callables`（または sideGame の index）に更新する。export 名は変更しない（03_設計ルール 4.4）。
- **05_入口一覧**：移行先確定後、registerForSideGame, leaveSeat, withdrawTip, depositTip の配置を「sideGame/callables」に更新する。
