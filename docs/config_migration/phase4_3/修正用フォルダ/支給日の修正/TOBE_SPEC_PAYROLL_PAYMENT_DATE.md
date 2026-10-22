# 支給日設定仕様（修正後）

## 1. 目的

`storeMeta/payrollConfig` の支給日設定を、同月払い・翌月払い・翌々月払いまで一意に表現できるようにする。  
従来の `paymentDate` 単一フィールド（文字列）の曖昧さを解消し、通知・UI表示・期限判定で同一の算出結果を使用する。

## 2. 設定フィールド

### 2.1 `paymentDayOfMonth`

- 型: `string | null`
- 意味: 支給日の「日」
- 許容値:
  - `'1'..'31'`
  - 必要に応じて `'0'`（月末）
- `null` の場合: 支給日未設定

### 2.2 `paymentMonthOffset`

- 型: `number`
- 意味: `periodEnd` の属する月から、何か月後を支給月とするか
- 許容値: `0 | 1 | 2`
  - `0`: 同月払い
  - `1`: 翌月払い
  - `2`: 翌々月払い
- デフォルト: `1`

## 3. 実支給日算出仕様

入力:

- `periodEnd: YYYY-MM-DD`
- `paymentDayOfMonth: string | null`
- `paymentMonthOffset: 0 | 1 | 2`

出力:

- `actualPaymentDate: YYYY-MM-DD | null`

算出手順:

1. `paymentDayOfMonth` が `null` または不正値なら `null` を返す。
2. `periodEnd` の年月を基準年月とする。
3. 基準年月に `paymentMonthOffset` か月加算して支給対象年月を求める。
4. 支給日を決定する。
   - `paymentDayOfMonth == '0'` の場合: 支給対象年月の月末日
   - それ以外: `min(paymentDay, 支給対象年月の月末日)` でクランプ
5. `YYYY-MM-DD` で返す。

### 3.1 例

- `periodEnd=2026-03-25, day='31', offset=0` -> `2026-03-31`
- `periodEnd=2026-03-10, day='25', offset=0` -> `2026-03-25`
- `periodEnd=2026-03-25, day='10', offset=1` -> `2026-04-10`
- `periodEnd=2026-01-25, day='31', offset=1` -> `2026-02-28`（クランプ）
- `periodEnd=2026-12-25, day='31', offset=1` -> `2027-01-31`

## 4. 表示仕様

- 画面表示は設定生値ではなく、算出済みの `actualPaymentDate` を使用する。
- 表示項目:
  - `paymentDateDisplay`: `actualPaymentDate`（未設定時は `'未設定'`）
- 必要に応じて補助表示:
  - 例: `毎月25日 / 翌月払い`

## 5. 通知・期限判定仕様

- 以下の判定はすべて `actualPaymentDate` を使用する。
  - 支払日超過判定
  - 支払日 3 日前の強警告判定
  - リマインド本文内の支払日表示
- `paymentDayOfMonth` の生値を直接比較しない。

## 6. 計算可能期間との関係

- 計算可能期間終端は `actualPaymentDate - 1日`。
- `actualPaymentDate == null` の場合は既存仕様を踏襲し、常時計算可能扱いを許容する。

## 7. バリデーション

### 7.1 Functions 側

- `paymentDayOfMonth`:
  - 有効: `'0'..'31'`（`'0'` を採用しない場合は `'1'..'31'`）
  - 無効値はフォールバック（既定値）または `null` 扱い
- `paymentMonthOffset`:
  - 有効: `0, 1, 2`
  - 無効値は既定値 `1` にフォールバック

### 7.2 Flutter 側

- 表示/判定ロジックは Functions 側と同一ルールで解釈する。
- 片側のみ `0=月末` を許容する実装は禁止（必ず両側同期）。

## 8. 既存データとの互換

移行期間中は以下を許容する。

1. `paymentDayOfMonth` が存在する場合は新仕様を優先。
2. 旧 `paymentDate` のみ存在する場合は暫定的に `paymentDayOfMonth` へ読み替え。
3. `paymentMonthOffset` 未設定時は `1` を適用。

安定後、旧 `paymentDate` は廃止する。

## 9. 命名方針

- 設定値:
  - `paymentDayOfMonth`
  - `paymentMonthOffset`
- 算出値:
  - `actualPaymentDate`
- UI 表示値:
  - `paymentDateDisplay`

曖昧さ回避のため、`paymentDate` 単独命名は段階的に解消する。
