# businessDay.calcBufferMinutes（営業日境界バッファ）

## 設定の説明

営業日境界計算時に使用するバッファ（分）。開店・閉店時刻の前後を拡張ウィンドウとして扱い、境界付近の曖昧な時刻がどちらの営業日に属するかを判定する際に使用する。

## 何を設定するのか

`storeMeta/config` の `businessDay.calcBufferMinutes`（整数、分単位）。未指定時は `defaults.ts` の `70` が使われる。

- **値の意味**: 開店時刻の N 分前〜閉店時刻の N 分後を拡張ウィンドウとして扱う。例: 70 の場合、9:00 開店なら 7:50〜、15:00 閉店なら 16:10 までがその営業日に含まれる範囲。

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`70`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

## 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は数値のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

## 現状持ちうる値

| 値 | 意味 |
|----|------|
| 0 以上の整数 | バッファ分。推奨: 30〜120 |
| 70 | デフォルト（約 1 時間強の拡張ウィンドウ） |

## その設定により何が変わるのか

- **値が大きい場合**: 営業日境界付近の「どちらの営業日か曖昧な時刻」の範囲が広がる。深夜営業や日付跨ぎのケースで判定が変わる。
- **値が小さい場合**: 境界付近の曖昧領域が狭くなる。

## 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/bills/repos/calcBusinessDateHelpers.ts` | findBusinessDateCandidates 内で getCalcBusinessDateBufferMinutes 経由で参照 |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック・getCalcBufferMinutes |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| dart | `lib/services/store_config_service.dart` | App（config パース・設定画面での表示等） |
