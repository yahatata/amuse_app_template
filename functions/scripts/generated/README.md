# Step2-1 生成物（スクリプト出力）

このディレクトリの Markdown は、次を実行すると再生成されます。

- `node scripts/emitLogOpsPrimarySource269.cjs` … logOpsError 一次情報（ソース行付き）
- `node scripts/buildStep21PrimaryHighFreqTable.cjs` … 主要業務 / 高頻度業務の判定単位一覧（初版）

業務説明・レビュー済みの一覧は `docs/共通化/flutter/04_仕様書/エラーログ拡張/functionEntry_業務役割一覧.md` を参照してください。
