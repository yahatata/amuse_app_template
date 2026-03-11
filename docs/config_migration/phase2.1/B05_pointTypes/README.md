# B-05 pointTypes

## Phase5 へ繰り延べ

本項目は Phase2.1 では改修を行わず、**Phase5 に繰り延べ**とする。

- 改修が必要だが、ポイント名称変更を反映させるべき URL・TS ファイル等の記載が多数ある
- 現状 3 種類固定だが、種類数を可変にする、あるいは増やす必要性が検討対象
- Phase5 で仕様の決定および修正を一括して行う
- 詳細: `docs/config_migration/phase5/README.md`

---

## 1. 項目の概要

`pointTypes` は、ポイント種別のフィールド名一覧を表す定数である。
トーナメントで使用するポイントタイプの選択肢として、およびユーザーアカウント作成時のポイントフィールドとして使用される。

Flutter と Cloud Functions の両方で整合が必要。SSoT（Single Source of Truth）として config で扱うと構造が複雑になる可能性がある。

---

## 2. 設定（定数）一覧

| 定数名 | 型 | 現状の値 | 定義場所 |
|--------|------|----------|----------|
| pointTypes | List\<String\> | ['pointA', 'pointB', 'sideGameChip'] | lib/globalConstant.dart |

---

## 3. 各設定の説明

| 定数 | 説明 |
|------|------|
| pointTypes | ユーザーが持つポイント種別のフィールド名。Firestore の users ドキュメントのサブフィールド名と対応。トーナメントテンプレートで「どのポイントを使うか」の選択肢にも使用。 |

---

## 4. 各設定の取りうる値

| 定数 | 取りうる値 | 備考 |
|------|------------|------|
| pointTypes | 任意の文字列リスト | Firestore の users ドキュメント構造と、createUserAccount.ts / createUserByApp.ts のフィールド初期化と整合が必要。変更時は両者を同時に修正する必要がある（globalConstant のコメントにも記載）。 |

---

## 5. 各値による動作の変化

| 定数 | 値 | 動作への影響 |
|------|-----|--------------|
| pointTypes | 要素変更・追加・削除 | トーナメントテンプレート編集・作成・賞金設定で選択できるポイントタイプが変わる。Flutter と TS の両方で同じフィールド名を使っているため、不一致だとユーザー作成・ポイント参照でエラーや不整合が発生する。 |

---

## 6. 参照ファイル一覧

### Dart（lib）

| ファイル | 参照内容 |
|----------|----------|
| lib/globalConstant.dart | 定義: `static const List<String> pointTypes = ['pointA', 'pointB', 'sideGameChip'];`（コメント: createUserAccount.ts / createUserByApp.ts と同期必須） |
| lib/tournament/template/pages/edit_tournament_template_page.dart | `GlobalConstants.pointTypes.map<DropdownMenuItem<String>>((pointType) => ...)` でドロップダウン生成 |
| lib/tournament/template/pages/create_tournament_template_page.dart | `GlobalConstants.pointTypes.map((String pointType) => ...)` でドロップダウン生成 |
| lib/tournament/active/pages/prize_setup_page.dart | `GlobalConstants.pointTypes.map((String pointType) => ...)` でドロップダウン生成 |

### TypeScript（functions）

| ファイル | 参照内容 |
|----------|----------|
| functions/src/domains/user/callables/createUserAccount.ts | コメントで「globalConstant.dart の pointTypes[0/1/2] フィールド」と記載。`pointA: 0`, `pointB: 0`, `sideGameChip: 0` を初期値として設定。定数参照はせず、ハードコード。 |
| functions/src/domains/user/callables/createUserByApp.ts | 同上。`pointA: 0`, `pointB: 0`, `sideGameChip: 0` を初期値として設定。 |

**注意**: TS 側は `pointTypes` 定数を直接参照していない。フィールド名を手動で合わせる必要がある。
