# autoOpenClose（自動開閉店）

## 設定の説明

週次 Planner（weeklyPlanner）が「閉店認定」「開店認定」タスクを Cloud Tasks に投入するかどうか、および投入時刻のオフセットを制御する。`enabled` が `false` の場合はタスク投入をスキップする。

## 何を設定するのか

`storeMeta/config` の `autoOpenClose` オブジェクト（3 フィールド）。未指定時は `defaults.ts` のデフォルト値が使われる。

| フィールド | 型 | 説明 | デフォルト |
|------------|-----|------|------------|
| `enabled` | boolean | 自動開閉店の有効/無効 | `true` |
| `taskCloseOffsetMinutes` | int | 閉店認定タスクのオフセット（閉店時刻から何分後にタスクを実行するか） | `120` |
| `taskOpenOffsetMinutes` | int | 開店認定タスクのオフセット（開店時刻の何分前にタスクを実行するか、負数で「前」） | `-30` |

- **例**: 9:00 開店・22:00 閉店の場合、taskOpenOffsetMinutes=-30 なら開店認定は 8:30、taskCloseOffsetMinutes=120 なら閉店認定は 翌 0:00（24:00+120分）に投入される。

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`enabled: true`、`taskCloseOffsetMinutes: 120`、`taskOpenOffsetMinutes: -30`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

## 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は boolean と数値のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

## 現状持ちうる値

| フィールド | 値 | 意味 |
|------------|-----|------|
| enabled | `true` | 自動開閉店有効（デフォルト） |
| enabled | `false` | 自動開閉店無効（タスク投入をスキップ） |
| taskCloseOffsetMinutes | 0 以上の整数 | 閉店時刻からの分。例: 120 = 閉店 2 時間後に閉店認定タスク |
| taskOpenOffsetMinutes | 整数（負数可） | 開店時刻からの分。負数で「前」。例: -30 = 開店 30 分前に開店認定タスク |

## その設定により何が変わるのか

- **enabled が false**: 週次 Planner は閉店・開店認定タスクを一切投入しない。
- **taskCloseOffsetMinutes**: 閉店認定タスクの実行時刻が変わる。大きいほど閉店からタスク実行までの猶予が長い。
- **taskOpenOffsetMinutes**: 開店認定タスクの実行時刻が変わる。負数が大きいほど開店より早くタスクが実行される。

## 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts` | 閉店・開店認定タスクの投入有無・投入時刻の計算 |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック・getter 関数 |
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| dart | `lib/services/store_config_service.dart` | App（config パース・設定画面での表示等） |
| dart | `lib/services/store_config_defaults.dart` | デフォルト値定義 |
