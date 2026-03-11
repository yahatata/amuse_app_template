# storeMeta/config 移管手順

Phase2.1 で `lib/globalConstant.dart` の定数を storeMeta/config に移管する際の手順・方針を定義する。  
他項目（B-03 sideGameTypes, B-04 トーナメント設定 等）で storeMeta/config への移管を行う場合も本手順に従う。

---

## 移管フロー（実施順）

```
1. 変更方針の作成（実コード確認から）
   ↓
2. 私（依頼者）の確認
   ↓ OK
3. changeSpec の作成。フラットに確認 → 確認事項があれば出力
   ↓ 問題なし
4. 実コードの修正
   ↓
5. テスト要件の洗い出し
   ↓
6. 実施可能な作業をすべて実施（テストファイル作成・エミュレーター起動・テスト実行）
   ↓
7. サマリの出力
   ↓
8. 私（依頼者）の確認
   ↓ OK
9. ドキュメントの更新
   ↓
10. done
```

---

## 移管方針（Phase2 と同様）

### 1. 変更対象ファイル（共通）

| 種別 | ファイル | 役割 |
|------|----------|------|
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値追加 |
| ts | `functions/src/shared/config/types.ts` | 型追加（必要に応じて） |
| ts | `functions/src/shared/config/configLoader.ts` | buildFromDefaults / mergeWithDefaults / mergeConfigForUpsert にマッピング追加 |
| dart | `lib/services/store_config_defaults.dart` | デフォルト値追加 |
| dart | `lib/services/store_config_service.dart` | StoreConfigData へのフィールド追加・fromMap パース追加 |
| - | `lib/globalConstant.dart` | 該当定数を**削除** |

### 2. 参照箇所の差し替え

- **Dart**: `GlobalConstants.xxx` → `StoreConfigService.instance.latestData?.xxx ?? kDefaultXxx`
- **TypeScript**: 当該設定を参照する箇所があれば `getStoreConfig()` 経由に変更（menuCategories は TS から参照なしのため該当なし）

### 2.1 Dart における storeMeta/config の取得方針（共通）

storeMeta/config の取得は、既存の他設定と同様に以下の方針で行う。

- **アプリ起動時**: `main.dart` で `StoreConfigService.instance` にアクセスし、シングルトン構築と `snapshots()` 購読を開始する。チェックイン画面への遷移までに初回 snapshot 到着の余裕を持たせ、`latestData` が null によるデフォルト適用を防ぐ。
- **購読継続**: `StoreConfigService` は `storeMeta/config` を snapshot で購読し続け、config 更新時も `_latestData` を自動で更新する。
- **各画面での取得**: `StoreConfigService.instance.latestData?.xxx ?? kDefaultXxx` で取得する。StreamBuilder 等は不要（他設定と同様）。
- **更新対応**: 購読継続により config の更新は検知される。画面再表示時に最新の `latestData` が参照される。

### 3. 運用時資料の更新（必須）

| ドキュメント | 内容 |
|--------------|------|
| `docs/運用時資料/設定/storeMeta/configによる設定の詳細/{設定名}.md` | 新規作成。設定の説明・値・影響範囲・影響ファイル |
| `docs/運用時資料/設定/storeMeta/configによる設定の詳細/README.md` | ファイル一覧に追加 |
| `docs/運用時資料/設定/取得失敗時の挙動設計.md` | 設定ごとの行を追加 |
| `docs/運用時資料/設定/設定の不具合時の対応.md` | 設定ごとの行を追加 |

### 4. 取得失敗時・不具合時の方針（Phase2 準拠）

- **読めるがフィールドが存在しない**: 必ずデフォルト値を適用
- **読めない（Firestore 障害等）**: A. デフォルトを正とする
- **不具合時**: 1. リトライ 2. デフォルトで実行＋エラーコード（CONFIG_FALLBACK / CONFIG_READ_ERROR）

---

## configLoader への追加パターン

### buildFromDefaults()

```ts
menuCategories: [...DEFAULT_MENU_CATEGORIES],
```

### mergeWithDefaults(raw)

```ts
// menuCategories
if (Array.isArray(raw.menuCategories) && raw.menuCategories.length > 0) {
  result.menuCategories = raw.menuCategories.filter((x): x is string => typeof x === 'string');
} else {
  logFallback('menuCategories', 'field_missing', result.menuCategories);
}
```

### mergeConfigForUpsert(existing, defaults)

```ts
out.menuCategories = Array.isArray(ex.menuCategories) && ex.menuCategories.length > 0
  ? ex.menuCategories
  : defaults.menuCategories;
```

---

## initializeStoreConfigCallable について

- **変更不要**。`buildFromDefaults()` と `mergeConfigForUpsert()` の出力に新フィールドが含まれれば、自動的に config に反映される。
- 既存店舗で config が存在する場合、`mergeConfigForUpsert` により**不足フィールドのみ**デフォルトで追加される（既存値は上書きしない）。

---

## 参照

- `docs/config_migration/phase2.1/README.md`
- `docs/運用時資料/設定/storeMeta/configによる設定の詳細/README.md`
- `docs/config_migration/phase1/PHASE1_CONFIG_SCHEMA.md`
- `docs/config_migration/phase1/PHASE1_UPDATE_PATH_DESIGN.md`
