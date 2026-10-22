# phaseG.1 リージョン固定化（Flutter Functions 呼び出し回収）計画

作成日: 2026-04-03

## 1. 何をするか

- Flutter(Dart) 側の `FirebaseFunctions.instance` 既定呼び出しを、`asia-northeast1` 固定の共通クライアント経由へ統一する。
- これにより、Callable 関数を `us-central1` ではなく `asia-northeast1` に確実に到達させる。

## 2. 対象の一覧

- 抽出条件: `rg -n "FirebaseFunctions\\.instance" lib -g '*.dart'`
- 抽出結果: 78 箇所 / 59 ファイル
- ファイル一覧: `対象一覧_ファイルパス.txt`
- 行単位一覧: `対象一覧_抽出結果.txt`

## 3. 回収方法（実装方針）

1. `lib/core/utils/functions_client.dart` を新規作成し、`FirebaseFunctions.instanceFor(region: "asia-northeast1")` を単一地点で保持する。
2. 全対象の `FirebaseFunctions.instance` を `FunctionsClient.instance` に置換する。
3. 置換したファイルへ `functions_client.dart` の import を追加する。
4. 置換漏れがないことを `rg -n "FirebaseFunctions\\.instance" lib -g '*.dart'` で検証する。

## 4. 安全策

- 変更対象は `lib/**/*.dart` と `phaseG.1` ドキュメント配下のみに限定する。
- 置換後に `flutter analyze` と `flutter test` を実行して、明確なビルド/実行不能がないことを確認する。
- 既存で失敗している既知課題がある場合は、今回差分で悪化していないことを確認し、結果へ明記する。

## 5. 検証方法

1. 静的確認
   - `rg -n "FirebaseFunctions\\.instance" lib -g '*.dart'` が 0 件になること。
   - `rg -n "FunctionsClient\\.instance" lib -g '*.dart'` で対象が意図どおり移行されていること。
2. Flutter 検証
   - `flutter analyze`
   - `flutter test`
3. 差分確認
   - `git diff --stat` と `git diff -- lib` で想定外ファイルの変更がないこと。

## 6. 成果物

- 改修計画: 本ファイル（`README.md`）
- 対象一覧: `対象一覧_抽出結果.txt`, `対象一覧_ファイルパス.txt`
- 回収結果: `回収結果.md`（改修後に作成）
