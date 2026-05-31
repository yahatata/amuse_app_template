# 仕様書 B-3-a: updateActiveBill.ts の chipRate ハードコード修正

> ✅ **完了（2026-05-30）** — `updateActiveBill.ts` デプロイ済み。実機確認済み。

## 概要

`updateActiveBill.ts` 内で `sideGameChip` の `chipQty` を計算する際、
`storeMeta/config` の `sideGameChipRate` を参照せず `/ 10` とハードコードしている。
これを設定値を使う形に修正する。

---

## 対象ファイル

- `functions/src/domains/bills/callables/updateActiveBill.ts`

---

## 現状の問題

```ts
chipQty: Math.floor(chip.price / 10), // 仮の換算（1枚=10円相当）
```

`sideGameChipRate` が 10 以外の店舗では `chipQty` が誤った値になる。

---

## 修正内容

### 1. import 追加

```ts
import { getStoreConfig } from '../../../shared/config/configLoader';
import { DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE } from '../../../shared/config/defaults';
```

### 2. `onCall` ハンドラの先頭で `chipRate` を取得

トランザクション外で取得する（他の callable と同様のパターン）。

取得場所: transaction を開始する前のロジック内（リクエスト検証・デバイス確認のあと）。

```ts
const storeConfig = await getStoreConfig();
const chipRate = storeConfig.billing?.sideGameChipRate ?? DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE;
```

### 3. ハードコード箇所を置換

```ts
// Before
chipQty: Math.floor(chip.price / 10), // 仮の換算（1枚=10円相当）

// After
chipQty: Math.floor(chip.price / chipRate),
```

---

## 影響範囲

- `sideGameChipRate = 10`（デフォルト）の環境では動作は変わらない
- レートを変更した場合に正しい枚数が記録されるようになる
- 他の callable・Flutter には影響なし

---

## テスト方針

- `sideGameChipRate = 20` の storeConfig モックで `updateActiveBill` を呼び出し、
  `chipQty` が `Math.floor(price / 20)` になっていることを確認（ユニットテスト）
- 実機確認: デフォルト環境（rate=10）での動作が変わらないことを確認

---

## 実装難易度

小（変更行数: 約5行）
