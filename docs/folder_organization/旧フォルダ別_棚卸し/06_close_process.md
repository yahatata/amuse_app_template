# 旧フォルダ別棚卸し：close_process

## 1. 対象フォルダの概要

**functions/src/close_process** は、**閉店処理** まわりの onCall 入口と、閉店・開店ターミナルから参照される共通ロジックを置くフォルダ。移行先は **requireAdmin のみ shared/devices**、その他（computeDisplayAmount, run*, applyCloseSnapshotCore、および 6 本の callable）は **domains/storeMeta**（services/repos に振り分け）。01_bills からは削除し、02_storeMeta と 00_shared に反映済み。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①index.ts | ②— | ③No | ④— | ⑤— | ⑥集約のみ（callable 6 件のみ export） | ⑦移行後は廃止。storeMeta と shared/devices に分散 | ⑧No | ⑨requireAdmin → shared/devices。その他 → storeMeta |
| ①resetAllTables.ts | ②callable→service/repos | ③Yes→内のみ | ④Yes | ⑤tables（書） | ⑥runResetAllTables は closeStoreTerminal から import。今後ターミナル内でのみ呼ぶ想定 | ⑦**domains/storeMeta**（services または repos） | ⑧No | ⑨全テーブルを開店状態にリセット。callable は廃止し storeMeta 内で利用 |
| ①resetAllSideGames.ts | ②callable→service/repos | ③Yes→内のみ | ④Yes | ⑤sideGame（書） | ⑥同上。runResetAllSideGames は closeStoreTerminal から import | ⑦**domains/storeMeta**（services または repos） | ⑧No | ⑨サイドゲームリセット。同上 |
| ①requireAdmin.ts | ②service | ③No | ④No | ⑤devices（読） | ⑥openStoreTerminal, continueBusinessTerminal, closeStoreTerminal, 閉店まわり各 callable | ⑦**shared/devices** | ⑧No | ⑨営業管理可能の権限チェック。00_shared 参照。08 に devices カテゴリ追加を記録 |
| ①getUnsettledBillsForClose.ts | ②callable→service/repos | ③Yes→内のみ | ④Yes | ⑤bills（読）, helpers/stateDoc | ⑥同上。今後ターミナル内でのみ呼ぶ想定 | ⑦**domains/storeMeta**（services または repos） | ⑧No | ⑨当日未会計 bills 取得。同上 |
| ①finalizeUnsettledBillAfterAccounting.ts | ②callable→service/repos | ③Yes→内のみ | ④Yes | ⑤bills（書）, users（書） | ⑥同上 | ⑦**domains/storeMeta**（services または repos） | ⑧No | ⑨未会計 bill の会計完了後処理。同上 |
| ①computeDisplayAmount.ts | ②service | ③No | ④No | ⑤bills とサブ（読） | ⑥getUnsettledBillsForClose, closeStoreTerminal | ⑦**domains/storeMeta/services** | ⑧No | ⑨1 bill の表示用金額算出。02_storeMeta 参照 |
| ①cleanupActiveStaysOnClose.ts | ②callable→service/repos | ③Yes→内のみ | ④Yes | ⑤activeStays（書）, bills（読） | ⑥runCleanupActiveStays は closeStoreTerminal から import。同上 | ⑦**domains/storeMeta**（services または repos） | ⑧No | ⑨閉店時 activeStays クリーンアップ。同上 |
| ①applyCloseSnapshot.ts | ②callable→service/repos | ③Yes→内のみ | ④Yes | ⑤bills（書）, users（書）, helpers/stateDoc | ⑥applyCloseSnapshotCore は closeStoreTerminal から import。同上 | ⑦**domains/storeMeta**（services または repos） | ⑧No | ⑨closeSnapshot 付与。同上 |

## 3. 追加メモ

- **入口**：移行後は 6 件の onCall 入口は **storeMeta** に移し、今後は closeStoreTerminal 等のターミナル内でのみ呼ぶ想定で callables から services/repos に振り分ける。05_入口一覧の該当 6 件のドメインを storeMeta に更新する。
- **requireAdmin**：**shared/devices** に配置。storeMeta（openStoreTerminal, continueBusinessTerminal, closeStoreTerminal）および storeMeta 内の閉店まわり services が shared/devices から import。00_shared 参照。
- **computeDisplayAmount, *Core, run***：**domains/storeMeta** の services（および必要に応じて repos）に配置。closeStoreTerminal は自ドメイン services を参照。
- **未使用候補**：該当なし。

## 4. 次アクション

- **設計**：**02_storeMeta** で close_process 由来の配置（storeMeta の services/repos）を反映。**00_shared** で requireAdmin を shared/devices に格納する旨を記載。**01_bills** からは close_process 関連を削除済み。
- **changeSpec**：close_process 移管時に、requireAdmin → shared/devices、その他 → storeMeta への移動と、storeMeta の closeStoreTerminal 等の **import パス**（shared/devices, 自ドメイン services）の更新を記載する。
- **05_入口一覧**：移行実施後、閉店まわり 6 件のドメインを「storeMeta」、現在パスを storeMeta 配下に更新する。
