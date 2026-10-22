# 旧フォルダ別棚卸し：accounting

## 1. 対象フォルダの概要

**functions/src/accounting** は、会計（伝票精算）まわりの **プレビュー用 callable** を置くフォルダ。ファイルは **1 件のみ**（getBillPreviewTotals.ts）。会計開始前のカテゴリ別金額等を取得する onCall 入口を提供する。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①getBillPreviewTotals.ts | ②callable | ③Yes | ④Yes | ⑤bills（読取）, bills/{billId}/extras, items, sideGameChips, tournaments（読取） | ⑥アプリから onCall で呼び出し。callables/index.ts から re-export され index に露出 | ⑦domains/bills/callables | ⑧No | ⑨会計開始前プレビュー。helpers/billsApi/snapshots.ts は「ロジック参照」のコメントのみで本ファイルは import されていない |

## 3. 追加メモ

- **export 経路**：本フォルダはルート index.ts から直接 export されていない。`callables/index.ts` の `export { getBillPreviewTotals } from '../accounting/getBillPreviewTotals';` により、callables 経由で index に含まれている（05_入口一覧と整合）。
- **移行先**：04_新フォルダ構造・05_入口一覧に従い **bills** ドメインの **callables** に配置。会計（startAccounting / completeAccounting / getBillPreviewTotals 等）と同一ドメインで扱う。
- **shared 候補ではない**：bills 伝票の会計プレビューに特化した処理のため、横断カテゴリにはしない。
- **未使用候補**：該当なし。export されており、入口として利用されている。

## 4. 次アクション

- **設計**：bills ドメイン設計（`新フォルダ別_設計/XX_bills.md`）作成時に、本ファイルの移動先を **domains/bills/callables/getBillPreviewTotals.ts** として反映する。
- **changeSpec**：bills ドメイン移管時の changeSpec で、`accounting/getBillPreviewTotals.ts` → `domains/bills/callables/getBillPreviewTotals.ts` の移動と、callables/index.ts および index.ts の export パス付け替えを記載する。
- **05_入口一覧**：移行実施後、getBillPreviewTotals の「現在パス」を新パスに更新する。
