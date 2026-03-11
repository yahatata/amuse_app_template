# B-03 sideGameTypes

## 決定: storeMeta/config に移管

`sideGameTypes` を `storeMeta/config.sideGameTypes` に移管する。  
実装手順は `CHANGE_POLICY.md` および `CHANGESPEC.md` を参照。

---

## 1. 項目の概要

`sideGameTypes` は、サイドゲームの種類一覧を表す設定である。
テーブルステータスやサイドゲーム選択UIで使用される。storeMeta/config に移管済み。店舗ごとに変更可能。

---

## 2. 設定（定数）一覧

| 定数名 | 型 | 現状の値 | 定義場所 |
|--------|------|----------|----------|
| sideGameTypes | List\<String\> | ['ブラックジャック','ルーレット','バカラ','アルティメットポーカー'] | storeMeta/config（デフォルト: store_config_defaults.dart） |

---

## 3. 各設定の説明

| 定数 | 説明 |
|------|------|
| sideGameTypes | サイドゲームとして扱われるテーブルステータス（またはゲーム種別）の一覧。テーブル一覧での判定や、サイドゲーム用UIの選択肢に使用。 |

---

## 4. 各設定の取りうる値

| 定数 | 取りうる値 | 備考 |
|------|------------|------|
| sideGameTypes | 任意の文字列リスト | Firestore のテーブル status や他フィールドと整合する必要がある。 |

---

## 5. 各値による動作の変化

| 定数 | 値 | 動作への影響 |
|------|-----|--------------|
| sideGameTypes | リストを変更 | サイドゲームとして扱うテーブル種別が変わる。`contains()` で判定しているため、追加・削除・変更により表示・フィルタリングが変わる。 |
| sideGameTypes | 要素を追加 | 新規にサイドゲームとして扱う種別が増える。 |
| sideGameTypes | 要素を削除 | その種別はサイドゲームとして扱われなくなる。 |

---

## 6. 参照ファイル一覧

### Dart（lib）

| ファイル | 参照内容 |
|----------|----------|
| lib/services/store_config_defaults.dart | デフォルト: `kDefaultSideGameTypes` |
| lib/services/store_config_service.dart | パース・購読 |
| lib/sideGame/pages/side_game_table_home.dart | `StoreConfigService.instance.latestData?.sideGameTypes ?? kDefaultSideGameTypes` でゲーム選択肢を生成 |
| lib/sideGame/pages/side_game_table_list.dart | getter `_sideGameTypes` で config 経由参照。contains / length / index でサイドゲーム判定・一覧表示 |

### TypeScript（functions）

| ファイル | 参照内容 |
|----------|----------|
| なし | 現状、sideGameTypes を参照している TS コードはなし |
