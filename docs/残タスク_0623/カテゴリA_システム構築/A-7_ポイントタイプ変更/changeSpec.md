# A-7 changeSpec：ポイントタイプの名前変更・個数変更

> 概要: A-7の確定業務・構造仕様を、実装可能なデータ構造・型・検証・更新境界・ログ・テスト・実装順序へ落とした実装仕様
> 主な目的: 実装担当者が追加の業務判断を最小化して実装できるようにする
> 正本区分: md正本
> 対象: 実装者、レビュー担当者
> 更新区分: 変更時
> 参照元: `概要.md`; `詳細_現状実装と影響範囲.md`
> 参照先: A-6 `changeSpec.md`; config / 会計 / トーナメント関連コード

| 項目 | 内容 |
|------|------|
| タスクID | A-7 |
| 作成日 | 2026-07-23 |
| 最終更新日 | 2026-07-26 |
| ステータス | **完了**（Phase 1〜6・追加修正・デプロイ・実機確認済。店舗向け設定UIは仕様どおり未作成） |
| 本書の位置づけ | 実装仕様の正本（業務方針の再検討はしない） |

### 正本の優先順位

1. `詳細_現状実装と影響範囲.md`（業務・構造）
2. `概要.md`
3. 本 changeSpec（実装詳細）
4. 現行コード（現状把握用。仕様と矛盾する場合は仕様を正とする）

### 本次レビュー反映（変更箇所一覧）

| # | 修正内容 |
|---|----------|
| ① | 共通 `usageUnit` / `pointConversions` を廃止し、残高種別ごとの `balancePaymentSettings` へ変更 |
| ② | A-6初期残高は有効ポイントのみ更新（無効残高保持）。LINE移行は全標準残高コピーと明確分離 |
| ③ | 残高helper: フィールドなし/JS上undefined=0。null・非number等=データ不整合（0へ隠さない） |
| ⑩ | ~~ByCategory必須化を撤回（ByAmountのみ可）~~ → **⑬でA+B契約へ差替え** |
| ⑪ | `pointPriority` は自動充当の対象と順序のみ。allowlistにあってもpriority外なら自動対象外・手動は可 |
| ⑫ | `pointLogs.note` はA-7で追加しない。analyticsの「現行維持」を具体化 |
| ⑬ | 会計契約A+B確定: autoはByCategory送信+サーバ再計算を正本（不一致は拒否）。手動はByCategory正本・自動上書き禁止。ByAmountは派生値。`categoryOrder`はconfig正本。settle推論は廃止方向 |
| ④ | 部分返金は保存済み conversion で厳密換算。非整数は `CONVERSION_NOT_INTEGER`。floor/端数調整は不採用 |
| ⑤ | 返金済 `balanceAmount` を手段ごとに管理し、返金可能量を元−済で判定 |
| ⑥ | analytics未知methodは `__unmapped*` 隔離せず、到達前に `FunctionCustomError` で停止 |
| ⑦ | `pointLogs` の `logId` 生成ルールを処理ごとに固定。一致なら冪等成功、不一致なら不整合エラー |
| ⑧ | `manual_adjustment` の `relatedId` は操作IDのみ。`note` フィールドはA-7で追加しない |
| ⑨ | `pointLogs.actor` は確定仕様に無く、現行も固定文字列のみのため **追加しない** |

---

## 1. 本書の目的

確定済みのA-7方針を、次の粒度まで具体化する。

- 正式な Firestore / config スキーマ
- Flutter / Functions の型と共通helper
- 換算・自動充当・手動検証の式
- bill実績・返金・ログ・A-6・analytics・UI
- transaction / 冪等性 / 運用ログ
- テスト計画と実装順序

コード実装は 2026-07-24 時点で Phase 1〜6 まで完了（git 未コミット）。§23.1 参照。

---

## 2. 正本・前提

業務前提は概要・詳細に従う。再掲の要点のみ。

- 通貨型: `pointA`〜`pointE`（標準最大5）。`sideGameChip` は別種別
- 残高は `users/{uid}` 直下固定フィールド。map化しない
- config正本は `storeMeta/config`。店舗向け設定UIは作らない
- 支払い可否の正本は `billing.paymentPolicy.categoryPaymentMethods`
- 換算は整数比。利用単位は**基準値側**で持ち、**残高種別ごと**に設定する
- 通貨型ログは `pointLogs`。`sideGameChipLogs` は独立
- 旧config fallback・本番互換・一括バックフィルは対象外
- Scheduler / Cloud Tasks 経路はA-7で新設・拡張しない（**非該当**）

### 現行コードとの主な差異（実装で解消する）

| 現行 | A-7 |
|------|-----|
| 残高3フィールド | 6フィールド |
| 表示名・タイプ一覧ハードコード | config |
| `sideGameChipRate` + 枚数丸め | `balancePaymentSettings` の整数比 + 種別ごとの基準値側 `usageUnit` |
| billに換算スナップショットなし | `meta.paymentMethodDetails` に保存 |
| 会計減算がポイントログ未記録 | `pointLogs` / chipログへ記録 |
| 順位報酬UIがchip選択可 | 通貨型のみ・許可一覧 |
| analytics未知→cash | 未知methodは会計経路で停止（analyticsへ到達させない） |
| auto が ByAmount のみ送信・allowlist未再検証 | autoも ByCategory 送信。Functions再計算を正本。不一致は拒否 |
| Flutter が `categoryOrder` 未読取の可能性 | config の `categoryOrder` を Flutter/Functions 双方の正本にする |
| settle時 ByCategory 推論 | 会計開始で必ず保存。欠落時はエラー（推論補完は廃止方向） |
| 会計の残高incrementがbill tx外 | 残高・ログ・metaを同一txに統合（§21） |

---

## 3. 対象範囲

### 含む

- config型・validation・読取必須判定
- 共通ポイントID / 残高helper / 換算helper
- ユーザー作成初期化、残高読取
- 会計・自動充当・手動支払・bill実績
- 返金・追加徴収（返金済balanceAmount管理含む）
- `pointLogs` / `sideGameChipLogs` 拡張
- トーナメントテンプレート `pointType`・付与・取消
- A-6 UI/Callable/`balanceMigrationLogs`
- analytics whitelist・表示名
- Flutter表示動的化、LIFF残高表示
- 関連テスト

### 含まない

- 店舗向けポイント設定画面
- `pointF` 以降、動的任意ID
- 通貨型とchipの構造統合
- `displayOrder` / `displayNameSnapshot`
- 旧互換・fallback・本番移行
- `pointLogs.actor` フィールド追加

---

## 4. 現行実装との差分

§2の表を正とする。追加の実装判断:

- 旧 `billing.sideGameChipRate` / `roundingUnits.pointAB` / `roundingUnits.sideGameChip` は**支払い換算・利用単位の正本から外す**（開発データは `balancePaymentSettings` へ作り直し）
- 旧 `pointALogs` / `pointBLogs` への新規書込は停止し、新規は `pointLogs` のみ。店舗向け履歴UIは `pointLogs` を読む（旧コレ読取は開発段階のため移行不要）

---

## 5. config変更仕様

### 5.1 正式スキーマ（採用）

#### `storeMeta/config.pointSettings`（必須）

全キー `pointA`〜`pointE` が必須。欠番不可。

```ts
type PointSlotSetting = {
  enabled: boolean;
  displayName: string; // trim後 length >= 1、最大40文字
};

type PointSettings = {
  pointA: PointSlotSetting;
  pointB: PointSlotSetting;
  pointC: PointSlotSetting;
  pointD: PointSlotSetting;
  pointE: PointSlotSetting;
};
```

#### `storeMeta/config.sideGameChipSettings`（必須）

```ts
type SideGameChipSettings = {
  enabled: boolean;
  displayName: string; // 同上
};
```

#### `storeMeta/config.tournament.rankingRewardPointTypes`（必須）

```ts
// 空配列可（報酬付与を使わない店舗）
rankingRewardPointTypes: Array<'pointA'|'pointB'|'pointC'|'pointD'|'pointE'>;
```

- 重複禁止
- `sideGameChip` 禁止
- 各要素は `pointSettings[id].enabled === true` 必須

#### `storeMeta/config.billing.paymentPolicy`（拡張）

既存を維持:

- `categoryPaymentMethods: Record<string, string[]>`
- `pointPriority: string[]`
- `categoryOrder: string[]`（既存。**A-7では必須扱い**。Flutter/Functions双方が同一config値を使う。ハードコード順は廃止）

**新規（採用名）— 共通 `usageUnit` / `pointConversions` は採用しない:**

```ts
type BalanceConversion = {
  referenceUnits: number; // 正の整数
  balanceUnits: number;   // 正の整数
};

type BalancePaymentSetting = {
  conversion: BalanceConversion;
  usageUnit: number; // 正の整数。基準値側の利用単位（残高種別ごと）
};

/**
 * 支払いに使う残高種別（通貨型 + sideGameChip）の換算・利用単位。
 * categoryPaymentMethods のいずれかに含まれる残高IDについて必須。
 * 現金系（cash等）は含めない。
 */
type BalancePaymentSettings = Partial<Record<
  'pointA'|'pointB'|'pointC'|'pointD'|'pointE'|'sideGameChip',
  BalancePaymentSetting
>>;
```

| path | field | type | required | validation | Fn型 | Flutter型 | default | 未設定時 |
|------|-------|------|----------|------------|------|-----------|---------|----------|
| `pointSettings` | map A〜E | object | 必須 | 全キー・displayName非空 | `PointSettings` | 同 | **なし** | エラー |
| `sideGameChipSettings` | object | object | 必須 | 同上 | 同上 | 同上 | **なし** | エラー |
| `tournament.rankingRewardPointTypes` | string[] | array | 必須 | §5.2 | string[] | List\<String\> | **なし**（空配列は可だがキー必須） | エラー |
| `billing.paymentPolicy.balancePaymentSettings` | map | object | 必須キー条件付き | §5.2 | 上記 | Map | **なし** | 条件違反でエラー |
| `categoryPaymentMethods` | map | 既存 | 必須（既存運用） | 残高ID整合 | 既存+拡張 | 既存 | loader既存defaultは**開発初期のみ技術的に存在**。A-7必須判定後は整合検証必須 | A-7検証失敗でエラー |
| `pointPriority` | string[] | 既存 | 必須 | §5.2（自動充当対象・順序。支払可能残高の完全一致は要求しない） | 同上 | 同上 | 同上 | 同上 |
| `categoryOrder` | string[] | 既存 | **必須（A-7）** | 非空・既知カテゴリ・重複なし。Flutter/Fn同一利用（§9.1.3） | string[] | List\<String\> | **なし**（ハードコード順fallback禁止） | エラー |

### 5.2 config間整合性（採用）

**検証タイミング:**

1. **Functions `getStoreConfig` 後の A-7 validate**（Callable実行時・会計/報酬/A-6/chipの直前）— **最終防衛**
2. Flutter: config snapshot取得後、ポイント関連画面表示前に同等検証。失敗時は画面エラー（黙ってハードコード名へ落とさない）
3. config upsert APIがある場合は保存時にも同一検証（既存upsert経路にhook）

**拒否する矛盾（`FunctionCustomError` / `errorKey: CONFIG_POINT_INVALID`）:**

- `enabled:false` が `categoryPaymentMethods` / `pointPriority` / `rankingRewardPointTypes` に含まれる
- `categoryPaymentMethods` に残高IDがあるが `balancePaymentSettings` に無い
- 未知のポイントID / `sideGameChip` が報酬許可一覧
- `referenceUnits` / `balanceUnits` / 各 `usageUnit` が整数でない、<=0、または `Number.MAX_SAFE_INTEGER` 超
- `pointPriority` 重複、未知ID、`enabled:false`、または現金系IDを含む
- **`pointPriority` に `categoryPaymentMethods` 上の全支払可能残高が揃っていることは要求しない**（§5.2.1）
- `categoryOrder` 欠落・空・未知カテゴリ・重複
- `displayName` 空

#### 5.2.1 `pointPriority` の責務（採用）

`pointPriority` は **自動充当の対象と順序** を定義する。利用可否の正本ではない。

- `categoryPaymentMethods` に含まれる残高でも、`pointPriority` に無ければ **自動充当対象外**
- 同残高でも、allowlist + `enabled` を満たせば **手動支払い可能**
- したがって「支払い可能な全残高が priority に過不足なく存在する」完全性チェックは **行わない**（意図した設定として許可）

### 5.3 config未設定時

- A-7必須キー欠落: **エラー**（旧値fallback禁止）
- 既存loaderの技術的default（旧rate等）が残っても、**支払い換算の正本には使わない**
- Flutter起動全体は落とさないが、ポイント依存画面は「config不備」を表示し操作不可

### 5.4 開発用config例

```json
{
  "pointSettings": {
    "pointA": { "enabled": true, "displayName": "トーナメントポイント" },
    "pointB": { "enabled": true, "displayName": "来店ポイント" },
    "pointC": { "enabled": false, "displayName": "ポイントC" },
    "pointD": { "enabled": false, "displayName": "ポイントD" },
    "pointE": { "enabled": false, "displayName": "ポイントE" }
  },
  "sideGameChipSettings": { "enabled": true, "displayName": "サイドゲームチップ" },
  "tournament": {
    "rankingRewardPointTypes": ["pointA"]
  },
  "billing": {
    "paymentPolicy": {
      "balancePaymentSettings": {
        "pointA": {
          "conversion": { "referenceUnits": 1, "balanceUnits": 1 },
          "usageUnit": 1000
        },
        "pointB": {
          "conversion": { "referenceUnits": 1, "balanceUnits": 1 },
          "usageUnit": 1000
        },
        "sideGameChip": {
          "conversion": { "referenceUnits": 10, "balanceUnits": 1 },
          "usageUnit": 1000
        }
      },
      "pointPriority": ["pointA", "pointB", "sideGameChip"],
      "categoryPaymentMethods": {
        "extraCost": ["cash", "credit_card", "electronic_money"],
        "sideGameChip": ["cash", "credit_card", "electronic_money"],
        "items": ["cash", "credit_card", "electronic_money", "pointA", "pointB", "sideGameChip"],
        "tournaments": ["cash", "credit_card", "electronic_money", "pointA", "pointB"]
      }
    }
  }
}
```

---

## 6. 共通ポイント型・helper

### 6.1 ID定義（採用）

**Functions** `functions/src/domains/user/types/pointIds.ts`（新規）:

```ts
export const CURRENCY_POINT_IDS = ['pointA','pointB','pointC','pointD','pointE'] as const;
export type CurrencyPointId = typeof CURRENCY_POINT_IDS[number];
export const SIDE_GAME_CHIP_ID = 'sideGameChip' as const;
export type SideGameChipId = typeof SIDE_GAME_CHIP_ID;
export type BalanceId = CurrencyPointId | SideGameChipId;
export const ALL_BALANCE_IDS = [...CURRENCY_POINT_IDS, SIDE_GAME_CHIP_ID] as const;
export const CASH_LIKE_METHODS = ['cash','credit_card','electronic_money'] as const;
```

**Flutter** `lib/user/point_ids.dart`（新規）: 同値の const list。`GlobalConstants.pointTypes` はこれらへ置換し、chipを通貨型リストに混ぜない。

型ガード: `isCurrencyPointId` / `isBalanceId` / `isCashLikeMethod`。

順序の正本: `CURRENCY_POINT_IDS` 配列順。表示は有効スロットのみ同順、その後に有効なら `sideGameChip`。

Zod: 支払いmethod enumを `CASH_LIKE + ALL_BALANCE_IDS` に拡張。個別ファイルの重複配列は禁止し、上記をimport。

### 6.2 残高helper（採用・統一）

**Functions** `helpers/userBalances.ts`、**Flutter** `lib/user/user_balances.dart`

| 入力値 | 扱い |
|--------|------|
| Firestore上でフィールドが**存在しない**、または読取結果が JS/Dart の `undefined` 相当 | **0扱い**（未初期化の正常系） |
| 有限の非負整数（`Number.isInteger(n) && n >= 0`） | そのまま |
| 明示的な `null` / 非number / `NaN` / `Infinity` / 負数 / 小数 | **データ不整合**（0として隠さない） |

| 経路 | 不整合時 |
|------|----------|
| 支払い・付与・移行・調整（Functions） | `INVALID_BALANCE` で拒否 |
| UI表示・入力 | **0へ変換しない**。「データ不整合」として表示し、当該ユーザーの更新操作を不可にする |

| API | 挙動 |
|-----|------|
| `readBalanceField(data, id)` | キー不在 → `{ kind: 'missing', value: 0 }`。`null`/異常 → `{ kind: 'corrupt' }`。正常整数 → `{ kind: 'ok', value }` |
| `assertUsableBalanceValue(value)` | 正常整数以外（**`null`含む**）は `INVALID_BALANCE` |
| `readAllStandardBalancesForMigration(data)` | 6値。キー不在は0、`null`/異常は拒否 |
| `enabledBalanceIds(config)` | 表示・初期残高UI用 |
| `allStandardBalanceIds()` | LINE移行用常に6 |
| `balanceField(id)` | 許可IDのみ |

---

## 7. ユーザー残高変更仕様

| 項目 | 仕様 |
|------|------|
| 保存 | `users/{uid}.pointA`〜`pointE`, `sideGameChip` |
| 新規作成 | `createUserAccount` / `createUserByApp` で6フィールドを0 |
| フィールド不在 | 読取0。一括バックフィルなし |
| 明示`null`等 | §6.2どおり不整合（0扱いしない） |
| 書込 | Functionsのみ（rules変更不要想定） |

---

## 8. 支払い換算・利用単位

### 8.1 意味

各残高IDの `balancePaymentSettings[id]`:

- `conversion.referenceUnits` / `conversion.balanceUnits`: 正の整数
- `usageUnit`: その残高の**基準値側**利用単位（正の整数）

```text
balanceAmount * referenceUnits = referenceAmount * balanceUnits
```

例:

- `{referenceUnits:10, balanceUnits:1}` → 残高1 = 基準値10
- `{referenceUnits:1, balanceUnits:2}` → 残高2 = 基準値1
- `{referenceUnits:1, balanceUnits:1}` → 1:1（現行pointA/B相当）

### 8.2 正式式（整数のみ）

```text
// 基準値 → 残高（割り切れ必須）
balanceAmount = referenceAmount * balanceUnits / referenceUnits
条件: (referenceAmount * balanceUnits) % referenceUnits == 0

// 残高 → 基準値（割り切れ必須）
referenceAmount = balanceAmount * referenceUnits / balanceUnits
条件: (balanceAmount * referenceUnits) % balanceUnits == 0
```

安全整数: 中間積が `Number.MAX_SAFE_INTEGER` を超える場合は `CONVERSION_OVERFLOW` で拒否。

0除算: units<=0 はconfig検証で事前拒否。

### 8.3 利用単位

残高IDごとの `usageUnit` を用いる。基準値量 `R` が支払い指定として有効なとき:

```text
R % usageUnit == 0 かつ R > 0（0円カテゴリは別扱い）
```

---

## 9. 自動充当・手動指定

### 9.1 支払入力経路と validation（Functions最終）

#### 9.1.1 現行呼び出し経路（調査根拠）

`lib/Accounting/accountingPage.dart` の `startAccounting` 呼び出し（調査時点）:

| 経路 | 送信内容（現行） | 位置づけ |
|------|------------------|----------|
| 手動（CategoryDialog） | `paymentMethodsByCategory` **と** `paymentMethodsByAmount` | 正常経路 |
| 自動充当（`action == 'auto'`） | **`paymentMethodsByAmount` のみ**（ByCategory未送信） | 現行運用の正常経路 |

**不採用（削除する仕様）:** 「ポイントを含む会計は `paymentMethodsByCategory` 必須とし、ByAmountのみなら一律拒否する」。自動充当の現行正常経路を壊すため採用しない。

合意「自動充当などの会計方法・UI操作は変えず、割り切れない場合のみ新たに成立させない」は維持する。A-7では **経路ごとに Functions の扱いを分け、UI操作は変えない**（案A+B）。

#### 9.1.2 採用契約（A+B・2026-07-24確定）

##### 役割の定義

| フィールド | 意味 |
|------------|------|
| `paymentMethodsByCategory` | **カテゴリ別支払い内訳と allowlist 正当性の正本**（経路により「誰が正本を決めるか」が異なる。下表） |
| `paymentMethodsByAmount` | ByCategory から集計される **支払手段別合計の派生値**。カテゴリ正本にはしない |

##### 自動充当（auto）

- **UI操作・会計方式は変更しない**（確認ダイアログ・優先順・ユーザー操作は現行どおり）
- Flutter内部には既にカテゴリ別内訳（`categoryBreakdown` 等）があるため、**画面操作を変えずに `paymentMethodsByCategory` も送信する**（ByAmountも送ってよいが、正本ではない）
- クライアント送信の ByCategory / ByAmount は **照合材料**であり、保存正本にしない
- Functions は次を行う:
  1. bill のカテゴリ別金額を取得（サーバ再計算）
  2. A-7 config（`categoryPaymentMethods` / `pointPriority` / **`categoryOrder`** / `balancePaymentSettings`）と残高で自動充当を再計算
  3. サーバ計算結果と Flutter 送信値を照合
  4. **一致した場合のみ**、サーバ計算結果の ByCategory を正本として保存
  5. `paymentMethodsByAmount` は **サーバ正本 ByCategory から集計**して保存
- **不一致時:** 黙ってサーバ結果で会計を続行しない。`PAYMENT_SPLIT_MISMATCH` で拒否し、ユーザーへ再試行を促す（確認ダイアログ内容と実支払の乖離を防ぐ）

##### 手動支払い（custom）

- Flutter が指定した `paymentMethodsByCategory` が **ユーザー意思の正本**
- Functions はカテゴリ別 allowlist / `enabled` / 換算 / 利用単位 / 残高 / 総額を **検証・正規化のみ**行う
- **Functions は自動充当で上書きしない**
- `paymentMethodsByAmount` は検証済み ByCategory から **サーバ側で集計**する（クライアント ByAmount は照合用に送ってよいが、不一致なら拒否）

##### なぜ auto でも ByCategory を送るか

Functions だけで再計算可能なため必須入力ではないが、送信を採用する。

- Flutter と Functions の計算差異を検出できる
- request 調査が容易
- auto / custom の payload 形状を揃えられる
- 将来の不具合調査が容易

#### 9.1.3 `categoryOrder`（正本）

- 正本: `billing.paymentPolicy.categoryOrder`（config）
- Flutter・Functions の自動充当は **同一の config `categoryOrder`** を使う
- Flutter がハードコード順のみを使っている場合は **修正対象**（順序差は充当結果を変えるため）
- config 欠落時は A-7 validate で `CONFIG_POINT_INVALID`（旧 default 順への黙認 fallback はしない）

#### 9.1.4 検証順

**自動充当:**

1. config A-7 validate（`categoryOrder` 含む）
2. bill カテゴリ別金額をサーバ取得
3. A-7 helper で自動充当再計算 → サーバ ByCategory / ByAmount
4. クライアント送信 ByCategory（および送られていれば ByAmount）と突合。不一致 → `PAYMENT_SPLIT_MISMATCH`
5. 残高健全性（§6.2）・不足なし
6. サーバ正本を meta / draft に保存

**手動支払い:**

1. config A-7 validate
2. 各カテゴリの method が既知（cash-like or balance）
3. balance method なら `enabled` かつ当該カテゴリ allowlist
4. 基準値量が非負整数・当該 method の `usageUnit` 倍数（正の支払分）
5. 換算で残高整数化可能
6. 残高健全性・不足なし
7. カテゴリ合計・請求合計との整合
8. 検証済み ByCategory を正本保存。ByAmount はサーバ集計

### 9.2 自動充当アルゴリズム（採用・O(1)）

入力: **`categoryOrder`（config正本）**、各カテゴリ基準値残額、`pointPriority`、各残高、`balancePaymentSettings`、カテゴリallowlist。

各カテゴリ・各priority methodについて:

```text
U = balancePaymentSettings[method].usageUnit
refU, balU = balancePaymentSettings[method].conversion
R = remainingCategoryReference
B = remainingBalance  // 事前に assertUsableBalanceValue

// k は「利用単位の個数」。referenceAmount = k * U
g = gcd(U * balU, refU)
stepK = refU / g
kMaxByRemain = floor(R / U)
kMaxByBal = floor(B * refU / (U * balU))
kMax = min(kMaxByRemain, kMaxByBal)
k = floor(kMax / stepK) * stepK
if k <= 0: このmethodは0充当で次へ
referenceUse = k * U
balanceUse = referenceUse * balU / refU   // 整数保証済み
```

充当後、残高・カテゴリ残を更新。カテゴリ残は現金系へ。

**FlutterとFunctions:** 同一helper仕様（TS実装を正とし、Dartは同一式を移植）。`categoryOrder` も同一config。  
`verifyPaymentSplit` / `startAccounting` とも再計算し、**クライアントと不一致なら拒否**（§9.1.2。黙ってサーバ結果で続行しない）。

### 9.3 具体例

1. **1:1**, U=1000, B=2500, R=3000 → 2000基準 / 残高2000。残1000は現金
2. **ref10/bal1**, U=1000, B=50, R=5000 → U倍数かつ変換可能な正の充当が無ければ次手段
3. **ref10/bal1**, U=100, B=50, R=500 → 式により最大の正充当を算出

### 9.4 settle時の ByCategory 推論（廃止方向）

会計開始（`startAccounting`）で正しい `paymentMethodsByCategory` を必ず保存する。

- **採用:** settle 時に ByCategory が無ければ **エラー**（推測して補完しない）
- 現行 `billsOnSettle` の `inferPaymentMethodsByCategory` は正本ではない
- Phase 2 切替途中でビルド・テスト維持のため一時残置する場合は、**最終削除対象**として実装TODOに明記し、完了条件から推論依存を外す

---

## 10. bill支払い実績

### 10.1 採用構造

**残す / 役割を明確化:**

- `meta.paymentMethodsByCategory`: カテゴリ別内訳の **正本**（auto=サーバ再計算結果、custom=検証済みユーザー指定）
- `meta.paymentMethodsByAmount`: ByCategory から集計した **派生値**（analytics / `paymentTotals` 入力）
- settle後 `paymentTotals`: ByAmount 相当の method 別合計（現行）

**追加（採用）:**

```text
bills/{billId}.meta.paymentMethodDetails: {
  [balanceId]: {
    referenceAmount: number,  // 充当基準値量（ByAmountの当該methodと同値）
    balanceAmount: number,    // 実際の減算残高量
    conversion: { referenceUnits, balanceUnits },
    usageUnit: number,        // 支払時の当該残高の利用単位
    refundedBalanceAmount: number  // 初期0。返金のたびに加算
  }
}
```

- 現金系は `paymentMethodDetails` に含めない
- 複数ポイント併用: キーを並べる
- `draftAccountingInput` にも ByCategory / ByAmount / Details を同値保存（現行draft踏襲）
- cashAction側にも、当該操作で動かした `referenceAmount` / `balanceAmount` / `conversion` を保存し、返金済集計の突合に使う

writer: `startAccounting`（および追加徴収で新規支払が発生する経路）
reader: 返金、監査、settle（ByCategory必須）

### 10.2 会計処理順（番号）

1. 権限・移行済みガード
2. config A-7 validate（`categoryOrder` 含む）
3. 現行helperで `settling` + idempotency（現行）
4. 支払validation（§9.1: auto=再計算照合 / custom=検証のみ）
5. **単一transaction:** ユーザ残高減算 + 残高ログ + bill meta（**正本 ByCategory** + **派生 ByAmount** + Details）
6. `logOpsSuccess`（既存軸）

会計確定時点で未知の残高/支払methodが残っている場合は、analyticsやsettle集計へ進まず `FunctionCustomError`（例: `UNKNOWN_PAYMENT_METHOD`）で停止する。

settle: ByCategory 欠落はエラー（§9.4）。推論補完に依存しない。

## 11. 返金・追加徴収

### 11.1 返金（採用）

1. 対象methodの支払実績（`paymentMethodDetails`）と、これまでの返金cashActionから突合する
2. **返金可能残高量**
   `refundableBalance = originalBalanceAmount - refundedBalanceAmount`
   （`refundedBalanceAmount` はDetails上の累計、またはcashAction集計の正本を実装で一つに固定。**採用:** Detailsの `refundedBalanceAmount` を更新し、cashAction書込と同一txで増分）
3. 返金基準値量 `refundReference` を受け取り、**保存済み conversion** で
   `refundBalance = refundReference * balanceUnits / referenceUnits`
   割り切れなければ **`CONVERSION_NOT_INTEGER`**（floorや端数調整はしない）
4. `refundBalance > refundableBalance` なら拒否
5. 基準値側の返金可能キャップ（`paymentTotals` ベースの現行）も併用し、基準値・残高の両方を満たすこと
6. 現在configのconversionで再計算しない
7. 二重返金: 上記残量で防止
8. ログ: 通貨型は `pointLogs`（reason `post_settlement_refund`）、chipは `sideGameChipLogs`
9. analytics（A-7では変更しない現行挙動）: `cashActionType === 'refund'` のとき `paymentTotals` を減らさない（空delta）。`collection` のみ method 別に `paymentTotals` を増加。詳細は §16

### 11.2 追加徴収（採用）

- 新取引。現在configの `balancePaymentSettings` で換算・単位検証
- 残高減算量を計算し、cashAction docにスナップショットを保存（親Detailsを破壊的に消さない）
- **親 `meta.paymentMethodDetails` へのマージ**: 同一 method の conversion が一致する場合のみ合算更新。不一致の場合は親Detailsを壊さず、当該 collection の snapshot に `mergedIntoBillDetails: false` を付けてロットとして保持する
- **未マージロット**: 当 cycle の collection cashActions から `CollectionLot[]` を再構築（永続専用コレクションは持たない）。返金時は親Details残量 → 未マージロットを `sequenceNo` 昇順 FIFO で消化する（`planRefundBalanceMovements`）
- ログ: `post_settlement_collection`
- analytics: `collection` として method 別 `paymentTotals` を増加（§16）

### 11.2.1 表示換算（sideGameChip）

店舗向け UI の chip↔円 表示も支払正本と同じ `balancePaymentSettings.sideGameChip.conversion` を用いる（旧 `billing.sideGameChipRate` は支払・表示の正本にしない）。購入明細の `amountIncl`/`chipCount` は別概念（商品金額）であり、chipCount 欠損時に rate で枚数推定しない。

### 11.3 floor/round

共通helperの整数式のみ。非整数は拒否。`Math.round` / 曖昧な端数配分は廃止。

---

## 12. 通貨型ポイントログ

### 12.1 スキーマ（採用）

```text
users/{uid}/pointLogs/{logId}
```

```ts
type PointLog = {
  pointType: CurrencyPointId;
  balanceBefore: number;
  changeAmount: number; // 符号付き
  balanceAfter: number;
  reasonType:
    | 'tournament_reward'
    | 'tournament_reward_reversal'
    | 'accounting'
    | 'post_settlement_refund'
    | 'post_settlement_collection'
    | 'manual_adjustment';
  relatedId: string; // 操作・エンティティIDのみ（自由記述のメモは入れない）
  createdAt: Timestamp;
};
// actor / note は追加しない（確定仕様に無し。A-7でも新設しない）
```

| reasonType | relatedId |
|------------|-----------|
| accounting | `billId` |
| post_settlement_refund / collection | `cashActionId`（一意に特定できるID） |
| tournament_reward / reversal | `tournamentId` |
| manual_adjustment | **操作IDのみ**（クライアントまたはサーバ生成の専用ID）。自由記述メモ用フィールドは持たない |

### 12.2 logId 生成ルール（採用）

| 処理 | logId |
|------|-------|
| 会計減算 | `accounting_{billId}_{pointType}` |
| 返金 | `refund_{cashActionId}_{pointType}` |
| 追加徴収 | `collection_{cashActionId}_{pointType}` |
| トーナメント付与 | `reward_{grantIdempotencyKey}_{pointType}` |
| トーナメント取消 | `reward_reversal_{grantIdempotencyKey}_{pointType}` |
| 手動調整 | `manual_{operationId}_{pointType}` |

**同一 logId が既に存在する場合:**

1. 既存ドキュメントの業務フィールド（`pointType`, `changeAmount`, `balanceBefore`, `balanceAfter`, `reasonType`, `relatedId`）が今回書込内容と**一致** → **冪等成功**（上書きしない）
2. **不一致** → `POINT_LOG_IDEMPOTENCY_CONFLICT`（不整合エラー）

### 12.3 取消（採用）

**元ログは削除しない。** `tournament_reward_reversal` を追加し、反対符号の `changeAmount` を記録する。
`undoSetRankingData` の `FieldValue.delete` は廃止し、reversalログ方式へ変更。

### 12.4 UI

- 通貨型履歴は `pointLogs` から読取
- `enabled:false` の `pointType` は通常表示から除外（画面自体は残す）
- 並び: `createdAt` desc。必要ならindex追加（§19）

### 12.5 A-6

`balanceMigrationLogs` のみ。`pointLogs` へ書かない。

### 12.6 actor について

現行の `pointALogs` 等では `actor: 'tablet_front'` が一部で書かれているが、固定プレースホルダに近く、確定仕様の `pointLogs` 必須項目にも含まれない。
**A-7の `pointLogs` には `actor` を追加しない。**（chip側既存ログの actor は既存業務のまま触らない）

---

## 13. sideGameChipログ

独立維持。既存: 預入income / 引出expense / 購入purchase。

**追加:**

| 事象 | 残高変動 | 記録 |
|------|----------|------|
| deposit/withdraw | あり | 現行維持 + 残高変動系は before/after 必須化 |
| purchase | なし | 現行維持（明細） |
| 会計減算 | あり | reason/関連ID + before/after |
| 返金/追加徴収 | あり | post_settlement_* |

通貨型 `pointLogs` とスキーマを無理に同一化しない。

---

## 14. トーナメント順位報酬

### 14.0 単位（追加決定）

| 項目 | 定義 |
|------|------|
| `prizePool` / `1stPrize` / `2stPrize` … | **基準値量**（売上由来の `¥` 表示を維持） |
| 実付与・取消量 | **ポイント残高量** = 保存済み conversion で換算した値 |
| conversion 正本時点 | **プライズ確定時**（`setPrizeData`）。順位確定時に現在 config で再換算しない |

`views/main` に少なくとも次を保存する:

```ts
pointType: CurrencyPointId;
prizeConversion: { referenceUnits: number; balanceUnits: number };
// 1stPrize / 2stPrize / prizePool は基準値量
```

付与:

```ts
awardedBalanceAmount = convertReferenceToBalance(prizeReferenceAmount, prizeConversion)
balanceAfter = balanceBefore + awardedBalanceAmount
```

- 非整数換算・overflow は **プライズ確定時に拒否**（順位確定まで持ち越さない）
- `prizeConversion` 欠損はデータ不整合として付与拒否（現在 config からの fallback なし）
- `grantRecords` / 操作実績は各受賞者ごとに `prizeReferenceAmount` / `awardedBalanceAmount` / `conversion` を保持
- `pointLogs.changeAmount` は **実残高変動量**（基準値ではない）
- 取消は `awardedBalanceAmount` 正本（再換算しない）。config 無効後も取消可

### 14.1 タイミング別検証（採用）

| 段階 | 検証 |
|------|------|
| テンプレート作成・編集 | 現在configで厳格: 通貨型・enabled・許可一覧・chip不可 |
| 個別トーナメント生成 | テンプレートの `pointType` をsnapshot保存 |
| プライズ確定 `setPrizeData` | pointType 検証 + `balancePaymentSettings[pointType].conversion` を snapshot。各順位基準値が整数残高へ換算可能か検証 |
| 付与 `setRankingData` | **保存済み pointType / prizeConversion** で換算付与。現在configで `enabled:false` または許可一覧外なら **付与拒否**（`REWARD_POINT_TYPE_INACTIVE`）。chipなら拒否 |
| 取消 | **保存済み awardedBalanceAmount** で残高戻し+reversalログ。現在configが無効でも取消可 |

### 14.2 UI

`GlobalConstants.pointTypes` からのchip混在をやめ、`rankingRewardPointTypes ∩ enabled` のみ。

- `¥` は基準値表示として維持
- 選択中ポイントの `displayName` を表示（raw ID のみの表示を避ける）
- 各順位に **付与予定残高量** を補助表示（確定前 conversion / 確定後は snapshot）

### 14.3 冪等

現行 `grantRecords/{grantIdempotencyKey}` 維持。取消もidempotentに。pointLogsは§12.2。

---

## 15. A-6変更

### 15.1 型

```ts
/** LINE移行・ログ用。常に6キー */
type BalanceSet = {
  pointA: number; pointB: number; pointC: number;
  pointD: number; pointE: number; sideGameChip: number;
};

/** 初期残高設定リクエスト。有効スロットのキーのみ（1つ以上） */
type InitialBalancesPatch = Partial<BalanceSet> & Record<string, number>;
```

- `validateBalanceTriple` → 移行用 `validateBalanceSet`（6キー必須）と、初期設定用 `validateInitialBalancesPatch`（有効IDのみ・各非負整数）に分割

### 15.2 初期残高設定（`setInitialUserBalances`）— 無効残高を消さない

| 項目 | 仕様 |
|------|------|
| UI | `enabled:true` の通貨型 +（chip有効なら）sideGameChip のみ表示。表示対象は入力必須、空は0 |
| 更新対象 | **有効スロットのみ**を `users` に上書き |
| 無効スロット | **リクエストに含めない。サーバも更新しない（既存値を保持）** |
| サーバ検証 | 無効IDがリクエストに含まれる → 拒否。有効IDの欠落 → 拒否。異常数値 → `INVALID_BALANCE` |
| `balanceMigrationLogs.balances` | 記録時点の**更新後の全標準6残高**をフラットで保存（監査用。無効枠の保持値も含む） |

「無効ポイントを0で送信して上書き」は**禁止**（途中無効化後の残高消失を防ぐため）。

### 15.3 店舗管理→LINE移行（`migrateStoreManagedUserToLine`）

| 項目 | 仕様 |
|------|------|
| UI | 有効分の表示でよい（確認用） |
| データ移行 | **常に** `pointA`〜`pointE` + `sideGameChip` の全標準残高を source→target へコピー |
| フィールド不在 | 0扱い。明示`null`・異常値は移行拒否 |
| `balanceMigrationLogs.balances` | 移行した6キーをフラット保存 |

初期残高設定とLINE移行を混同しないこと。

### 15.4 transaction

現行どおり単一tx（user更新+migration log+idempotency）。部分失敗防止維持。

`pointLogs` 非書込維持。

---

## 16. analytics・表示名

### 16.1 A-7で変更しない現行方針（正本）

根拠: `functions/src/domains/analytics/services/aggregator/cashActionDelta.ts` 等。

| cashActionType | `paymentTotals` への影響 |
|----------------|--------------------------|
| `refund` | **減らさない**（空 delta。仕様書 §8.4 相当の現行方針） |
| `collection` | method 別に `methodBreakdown` を集計し **増加** |

A-7は上記を維持する。返金で `paymentTotals` を減算する変更は行わない。

### 16.2 A-7で変更する点

- whitelistを `cash-like + pointA〜E + sideGameChip` に拡張
- **未知の支払いmethodは正常系ではない。** 会計・settle直前のFunctions検証で `FunctionCustomError`（`UNKNOWN_PAYMENT_METHOD`）として**停止**し、analytics集計へ到達させない
- `__unmappedPaymentMethod` 等への退避は**採用しない**
- 未知methodをcashへ落とす現行処理は削除する
- 表示名: Flutterはconfig `displayName`。履歴・analyticsも現在名

---

## 17. UI変更

新規画面なし。動的化対象:

| UI | 変更 | Flutter類型 | ローディング |
|----|------|--------------|--------------|
| 表示名全般 / formatter | config参照 | 読取・表示 | 不要な追加ロックなし |
| 会計CategoryDialog / split | 有効+allowlist+`balancePaymentSettings`。**`categoryOrder` を config から読む**。auto は操作変更なしで ByCategory も送信 | 更新系は会計確定時 | 会計確定は現行ロック確認・不足なら全面ロックへ寄せる |
| 初期残高 | 有効のみ更新 | **更新系** | 既存AbsorbPointer+CPI維持 |
| LINE移行 | 表示は有効中心、移行は全残高 | **更新系** | 既存確認・不足なら修正 |
| 順位報酬付与 | 候補動的化 | **更新系** | 既存確認 |
| chip預入引出 | enabledゲート | **更新系** | 既存確認 |
| 履歴 | pointLogs・無効除外 | 画面読込/読取 | 読取系ロックなし |
| 残高表示 | 異常値は「データ不整合」（0変換しない） | 表示 | — |
| LIFF `public/user/index.html` | 6フィールド読取+表示名 | 表示 | 非Flutter |

人間レビュー: 会計画面のロック単位がルール（全面半透明）を満たすか。

---

## 18. Functions validation

各Callable入口で:

1. A-7 config validate（必要なもの）
2. 業務Zod
3. enabled / allowlist / `balancePaymentSettings`
4. 残高値の健全性（§6.2）

支払経路の契約・検証は §9.1（A+B: auto=再計算照合・不一致拒否 / custom=ByCategory検証のみ。ByAmountは派生値）。

---

## 19. Firestore rules・indexes

- rules: `users/{id}/{logCollection=**}` ワイルドカードのため `pointLogs` 追加でも**原則変更不要**
- indexes: `pointLogs` を `createdAt` でqueryする場合、実装に合わせて単一フィールドindexを追加
- A-6 migrateの `balanceMigrationLogs` 複合queryはindexes未記載のままなら、開発で必要時に追加（既存課題）

---

## 20. エラー仕様（主要）

| errorKey | 意味 |
|----------|------|
| `CONFIG_POINT_INVALID` | A-7 config不備・矛盾（`categoryOrder` 欠落含む） |
| `PAYMENT_SPLIT_MISMATCH` | 自動充当でクライアント送信とサーバ再計算が不一致（黙って続行しない） |
| `PAYMENT_CATEGORY_REQUIRED` | 会計開始時に ByCategory が必要な経路で欠落（auto/customとも送信想定） |
| `PAYMENT_METHOD_NOT_ALLOWED` | allowlist外 |
| `BALANCE_TYPE_DISABLED` | enabled:false |
| `USAGE_UNIT_VIOLATION` | 利用単位外 |
| `CONVERSION_NOT_INTEGER` | 割り切れない（支払・返金とも） |
| `CONVERSION_OVERFLOW` | 安全整数超 |
| `ACCOUNTING_INSUFFICIENT_BALANCE` | 残高不足（既存踏襲可） |
| `INVALID_BALANCE` | 明示`null`・負数・小数・非数・NaN・Infinity等のデータ不整合（フィールド不在は0であり本エラーにしない） |
| `UNKNOWN_PAYMENT_METHOD` | 未知method（analytics到達前に停止） |
| `SETTLE_PAYMENT_CATEGORY_MISSING` | settle時に ByCategory 欠落（推論補完しない） |
| `REWARD_POINT_TYPE_INACTIVE` | 付与時にpointType利用不可 |
| `REWARD_POINT_TYPE_INVALID` | chip等 |
| `POINT_LOG_IDEMPOTENCY_CONFLICT` | 同一logIdで内容不一致 |
| `REFUND_BALANCE_EXCEEDED` | 返金残高量が残量超過 |

業務前提違反は `FunctionCustomError`。想定外はCallable境界で `logOpsError`。

---

## 21. transaction・冪等性

| 処理 | 境界 | 冪等 |
|------|------|------|
| 会計支払 | 残高+ログ+meta を1 tx（settling helperは現行先行可） | accounting idempotency + pointLogs logId |
| 返金/追加徴収 | 現行cashAction tx内に残高+ログ+details/`refundedBalanceAmount` | cashAction idempotency + pointLogs logId |
| 報酬付与 | 現行tx + pointLogs追加（deleteしない） | grantRecords + logId |
| 報酬取消 | 同txで残高戻し+reversalログ | grant取消idempotency + logId |
| chip預入引出 | 最低限、replay時に二重残高更新しない現行維持＋enabled | append idempotency |
| A-6初期残高 | 有効フィールドのみ更新+migration log | clientNonce |
| A-6 LINE移行 | 6残高コピー+migration log | clientNonce |

### 運用ログ（共通ルール適用）

| 処理 | Flutter類型 | ローディング | logOpsError | 業務エラー | logOpsSuccess | 相関キー | Scheduler |
|------|-------------|--------------|-------------|------------|---------------|----------|-----------|
| setInitialUserBalances | 更新系 | 既存全面ロック維持 | Callable想定外catch | FunctionCustomError | 既存維持 | targetUserId | 非該当 |
| migrateStoreManagedUserToLine | 更新系 | 同上 | 同上 | 同上 | 既存 | sourceUserId, targetUserId | 非該当 |
| startAccounting | 更新系 | 会計画面ロック要確認 | 境界1回 | Custom | 既存 | billId, uid | 非該当 |
| 返金/徴収 | 更新系 | 同上 | 境界1回 | Custom | 要確認 | billId, uid | 非該当 |
| setRankingData / undo | 更新系 | 既存確認 | 境界1回 | Custom | 要確認 | tournamentId, uid, pointType | 非該当 |
| deposit/withdraw | 更新系 | 既存確認 | 境界1回 | Custom | 要確認 | billId, uid | 非該当 |
| config不備 | — | — | validate失敗をCallableでCustom。想定外のみlogOpsError | CONFIG_* | 不要 | area, pointId（config全体禁止） | 非該当 |

二重 `logOpsError` 禁止。`console.warn` 禁止。軽微は `logger.warn`。

`serviceByFunctionEntry.ts`: 新規exportが無い限り既存エントリ維持。

---

## 22. テスト計画

### config

- 正常な `pointSettings` / `balancePaymentSettings`
- displayName空文字
- 未知ID
- enabledとの矛盾
- categoryPaymentMethods / pointPriority / 報酬一覧との矛盾
- 換算設定なし
- 種別ごとの usageUnit 0 / 負 / 小数 / 過大

### 残高

- 新規ユーザー6フィールド初期化
- フィールド不在のpointC〜Eを0扱い
- 明示`null`・負数・小数・NaN・Infinity・非number → UI「データ不整合」、Functions `INVALID_BALANCE`（0へ隠さない）
- enabled拒否

### 会計

- 1:1 / 1ポイント=10基準値 / 2ポイント=1基準値
- 種別ごとの利用単位
- 手動: ByCategory検証成功・allowlist外拒否・サーバが自動充当で上書きしない
- 自動: ByCategory+ByAmount送信・サーバ再計算一致で成功
- 自動: クライアント≠サーバ → `PAYMENT_SPLIT_MISMATCH`（黙って続行しない）
- 自動: allowlist・`categoryOrder` 差で結果が変わるケース
- Flutter/Functions が同一 `categoryOrder`（config）を使う
- priority外の支払可能残高は自動対象外・手動は可
- 複数ポイント・残高不足・allowlist
- sideGameChip
- settle: ByCategory欠落 → エラー（推論補完しない）。一時残置時は最終削除TODO

### bill・返金

- 正本 ByCategory + 派生 ByAmount + Details 保存
- `refundedBalanceAmount` 更新
- 全額/部分返金（整数換算成功）
- 割り切れない返金 → `CONVERSION_NOT_INTEGER`
- 残量超過 → `REFUND_BALANCE_EXCEEDED`
- config変更後も保存済みconversionで返金
- 二重返金・追加徴収
- analytics: refundは`paymentTotals`非減算、collectionは増加（§16.1）

### トーナメント / ログ / A-6 / analytics

- 許可・未許可・disabled・chip拒否・付与・取消・無効化後取消・冪等
- logId固定・一致冪等・不一致エラー・reversal残存・relatedIdは操作IDのみ（`note`フィールドなし）
- **初期残高: 無効枠が0上書きされない** / 有効のみ更新
- **LINE移行: 6残高コピー**
- analytics: 未知methodで会計が止まりcash混入しない・whitelist拡張・displayName・disabled過去データ

---

## 23. 実装順序

1. 共通ID型・config型（`balancePaymentSettings`）・A-7 validate（Fn+Flutter）— **Phase 1 済み想定**
2. 残高helper・換算helper・自動充当helper（TS正本→Dart）— **Phase 1 済み想定**
3. ユーザー作成6フィールド — **Phase 1 済み想定**
4. **Phase 2:** `categoryOrder` を Flutter/Fn で同一化 + 会計 A+B 契約（auto: ByCategory送信・サーバ再計算照合・不一致拒否 / custom: 検証のみ）+ `paymentMethodDetails` + 残高/ログ同一tx
5. settle: ByCategory必須化。推論は削除または最終削除TODO付き一時残置
6. 返金・追加徴収（整数換算・残量管理・ログ）
7. `pointLogs` 書込（固定logId）+ 履歴UI
8. sideGameChipログ拡張 + enabledゲート
9. トーナメント許可一覧・付与/取消
10. A-6（初期=有効のみ更新 / 移行=全コピー）
11. analytics whitelist・未知停止
12. 表示名動的化
13. LIFF
14. 総合テスト・開発config更新
15. 概要ステータス等の文書更新（実装完了時）— **2026-07-24 反映済** / クローズ更新 **2026-07-26**

### 23.1 実装状況（2026-07-26）

| 項目 | 内容 |
|------|------|
| Phase 1〜5 | コード完了（config・会計・返金・トーナメント/chip・A-6） |
| Phase 6 | コード完了（表示名・履歴UI・analytics・LIFF・index） |
| 追加修正 | 順位報酬の基準値換算・テンプレ編集 color null・LIFF 残高をプロフィールへ |
| デプロイ・実機 | `amuse-app-template` へ反映済み。Emulator・実機確認完了 |
| 通貨型履歴 UI | `users/{uid}/pointLogs` を読取。`firestore.indexes.json` に `pointType` + `createdAt` |
| chip 履歴 | `sideGameChipLogs` のまま（統合しない） |
| analytics | 未知支払手段を cash に正規化しない。会計経路で停止（§16・⑥） |
| 店舗向け設定 UI | 作らない（仕様どおり） |
| A-6 ログ | 初期/LINE移行は `balanceMigrationLogs` のみ。`pointLogs` は使わない |
| タスク状態 | **完了**（カテゴリA `進捗管理.md` も更新） |

---

## 24. 変更対象ファイル一覧（主要）

### 新規

| path | 内容 |
|------|------|
| `functions/src/domains/user/types/pointIds.ts` | ID定数 |
| `functions/src/domains/user/helpers/userBalances.ts` | 残高helper |
| `functions/src/domains/bills/services/pointConversion.ts` | 換算・充当 |
| `functions/src/domains/user/helpers/validateBalanceSet.ts` | A-6検証分割 |
| `functions/src/shared/config/validatePointConfig.ts` | A-7 config検証 |
| `functions/src/domains/user/services/pointLog.ts` | pointLogs書込 |
| `lib/user/point_ids.dart` / `user_balances.dart` / `point_conversion.dart` | Flutter対応 |
| 関連 `__tests__` / `test/` | §22 |

### 変更（中心）

| path | 変更 |
|------|------|
| `functions/src/shared/config/types.ts` / `defaults.ts` / `configLoader.ts` | `balancePaymentSettings` 等 |
| `lib/services/store_config_*.dart` | 同上 |
| `lib/globalConstant.dart` | pointTypes整理 |
| `lib/core/utils/formatters.dart` + 会計系直書き | displayName |
| `accounting.ts` / validators / rounding / split / verify* | A+B契約・換算・Details・不一致拒否・未知停止 |
| `billsOnSettle.ts` / `paymentMethodsInference.ts` | ByCategory必須。推論削除または最終削除TODO |
| `lib/Accounting/accountingPage.dart` / `payment_split_calculator.dart` | autoでByCategory送信。`categoryOrder`をconfigから |
| `recordPostSettlementCashAction.ts` / `createPostSettlementAdjustment.ts` | 返金残量・整数換算 |
| `setRankingData.ts` / `undoSetRankingData.ts` / prize・template UI | 許可一覧・reversalログ |
| `depositChip.ts` / `withdrawChip.ts` | enabled・ログ |
| `createUserAccount.ts` / `createUserByApp.ts` | 6フィールド |
| `setInitialUserBalances.ts` / `migrateStoreManagedUserToLine.ts` | 初期≠移行 |
| admin初期・移行UI | 動的欄・更新範囲 |
| `chip_point_logs_page.dart` 等 | pointLogs |
| analytics `helpers.ts` 等 | whitelist・未知cash削除 |
| `public/user/index.html` | 残高表示 |

概算: **新規約10 + 変更約40〜60**。

---

## 25. 実施しないこと

概要・詳細の非対象に同じ。加えて:

- Scheduler/Task開始ログの無関係Callableへの追加
- 表示名だけの画面への新規全面ロック強制
- 旧 `sideGameChipRate` 併存互換レイヤ
- `pointLogs.actor` / `pointLogs.note` の新設
- 初期残高での無効ポイント0上書き
- analyticsへの未知method退避キー
- ポイント支払いへの「ByAmountのみ一律拒否」（自動充当の正常経路を壊すため。§9.1.1）
- 自動充当でクライアント≠サーバ時にサーバ結果で黙って会計続行すること
- 手動支払いのサーバ側自動充当による上書き
- settle時の ByCategory 推論を正本とすること（最終的には削除。切替中の一時残置は削除TODO必須）
- `pointPriority` と `categoryPaymentMethods` の完全一致強制
- Flutter のハードコード `categoryOrder` を config と別系統のまま残すこと

---

## 26. 未決事項

原則なし（業務は概要・詳細で確定済み）。

実装時の人間レビューのみ:

- 会計画面ロックがCPI全面ルールを満たすかのUI確認

---

## 付録A. 共通ルール適用サマリ

- **Flutterローディング:** 更新系（A-6・会計・返金・報酬・chip）は既存維持または不足修正。表示名動的化のみはロック追加しない
- **Scheduler/Task:** **非該当**
- **logOps:** §21表。二重計上禁止。contextは最小ID
