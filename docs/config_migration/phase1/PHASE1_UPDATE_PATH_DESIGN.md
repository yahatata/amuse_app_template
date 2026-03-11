# Phase1 更新経路設計

作成日: 2026-03-05  
参照: [PHASE1_CONFIG_SCHEMA.md](./PHASE1_CONFIG_SCHEMA.md), [PHASE1_FALLBACK_BEHAVIOR.md](./PHASE1_FALLBACK_BEHAVIOR.md), [STOREMETA_CONFIG_SPEC](../phase0B/STOREMETA_CONFIG_SPEC.md)

---

## 1. 概要

storeMeta/config の更新経路を設計する。  
**defaults.ts を唯一のソース**とし、管理する箇所を増やさない方針。

---

## 2. 更新経路の種類

| 経路 | 主体 | 用途 | Phase1 スコープ |
|------|------|------|-----------------|
| **初期セットアップ（Callable）** | 開発側 | 新規店舗・開発環境の storeMeta/config 初期投入 | ✅ 実装 |
| **UI からの更新** | 店舗ユーザー | 運用中に変更したい項目の編集 | Phase5 で検討 |

---

## 3. 初期セットアップ

### 3.1 方針

- **defaults.ts** を唯一のソースとする
- Callable が `buildFromDefaults()` を呼び、storeMeta/config に書き込む
- 開発時・本番の新規店舗・どちらの初期セットアップも同一の Callable で実施

### 3.2 Callable

| 項目 | 内容 |
|------|------|
| 名前 | `initializeStoreConfigCallable` |
| 認可 | **admin デバイスのみ**（device.role === 'admin'） |
| 既存時 | storeMeta/config 既存時は defaults のうち存在しないフィールドのみ補完（既存値を上書きしない）。storeMeta/requiredStaffByTimeSlot 既存時はスキップ |
| 書き込み先 | `storeMeta/config`（defaults の config 相当項目）、`storeMeta/requiredStaffByTimeSlot`（R-09 別 doc、未存在時のみ作成） |

### 3.3 呼び出し元

| 呼び出し元 | 説明 |
|------------|------|
| **詳細設定ページ** | AdminHomePage → 詳細設定 → storeMeta/config 初期セットアップ ボタン |
| その他 | Firebase Console、curl、スクリプト等からも呼び出し可能 |

### 3.4 詳細設定ページ

| 項目 | 内容 |
|------|------|
| 配置 | AdminHomePage に「詳細設定」ボタンを追加 → 詳細設定ページへ遷移 |
| 権限 | 開発側のみ操作（店舗責任者は基本的に触らない）。admin デバイスでログインした場合のみ表示 |
| 初期セットアップ項目 | storeMeta/config の初期投入。今後、他セットアップ項目もこのページに集約 |

---

## 4. UI からの更新（Phase5 で検討）

- 店舗ユーザーがアプリ UI から変更できる項目と、できない項目を Phase5 で切り分ける
- 更新用 Callable の作成、UI 設置は Phase5 で実施

---

## 5. 更新可能フィールド（初期セットアップ時）

初期セットアップでは **defaults.ts の全項目** を storeMeta/config に書き込む。  
UI から更新可能なフィールドの範囲は Phase5 で決定する。

---

## 6. defaults.ts を唯一のソースとする実装方針（必須）

Phase1 以降、storeMeta/config のデフォルト値を扱う場合は以下の責務分離を厳守すること。

| レイヤー | 責務 | フィールド・値の列挙 |
|----------|------|----------------------|
| **defaults.ts** | デフォルト値の定義。全てのデフォルト定数はここにのみ記載 | ✅ ここに全て記載 |
| **configLoader buildFromDefaults()** | defaults.ts を import し、StoreConfig を構築。新規フィールド追加時はここを更新 | defaults.ts の定数のみ参照 |
| **initializeStoreConfigCallable** | config 未存在: buildFromDefaults() をそのまま書き込む。config 既存: mergeConfigForUpsert で不足フィールドのみ補完（既存値を上書きしない）。requiredStaffByTimeSlot は未存在時のみ作成 | ❌ フィールドを列挙しない。configLoader の buildFromDefaults / mergeConfigForUpsert を使用 |

**禁止事項**:
- Callable 内でフィールド名・デフォルト値を明示的に書かない
- defaults.ts 以外の場所にデフォルト値を重複定義しない

**新規フィールド追加時の手順**:
1. defaults.ts に定数を追加
2. types.ts の StoreConfig に型を追加
3. configLoader buildFromDefaults() にマッピングを追加
4. （Callable は変更不要）

---

## 7. 関連ファイル

| 種別 | パス |
|------|------|
| デフォルト値 | `functions/src/shared/config/defaults.ts` |
| 取得層 | `functions/src/shared/config/configLoader.ts` |
| Callable | `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts` |
| 詳細設定ページ | `lib/pages/admin_detail_settings_page.dart` |
| AdminHomePage | `lib/Home/adminHomePage.dart` |
| Flutter config 購読 | `lib/services/store_config_service.dart` |
| Flutter 営業状態購読 | `lib/services/store_meta_service.dart` |

---

## 8. 後続 Phase での注意

Phase2, Phase3 等で storeMeta/config のスキーマ拡張・新規フィールド追加を行う場合:
- 上記 §6 の責務分離を維持すること
- defaults.ts → buildFromDefaults() の順で更新し、Callable は触らない

---

## 9. Flutter 参照責務（Task 6）

### 9.1 確定ロジックを持たないこと

Flutter は storeMeta/config の値を**確定値としては使わない**。

| 許可 | 禁止 |
|------|------|
| 画面表示（例: 「入場料 1,000 円」と出す） | その値で会計・締め処理等のビジネス判定を行う |
| 入力フォームの初期値・ラベル表示 | 「この値が正しい」として確定処理に使う |
| UI の表示制御 | 料金・日付の確定値として計算・記録する |

**確認**: StoreConfigService は購読・フォールバック・ログ出力のみ。確定ロジックは持たない。

### 9.2 StoreMetaService との役割分離

| サービス | 購読先 | 役割 |
|----------|--------|------|
| **StoreMetaService** | storeMeta/currentBusinessDay | 営業状態（status, closeAssessment, openAssessment 等） |
| **StoreConfigService** | storeMeta/config | 店舗設定（features, billing, linePlan 等） |

**方針**: 分離を維持する。StoreMetaService に config 購読は追加しない。責務の明確さ・切り分けのしやすさを優先。

### 9.3 SSoT 原則の適用範囲

| 層 | 役割 |
|----|------|
| **Functions** | 料金計算・締め処理・営業日判定等の最終判定。config を読むときは getStoreConfig 経由。 |
| **Flutter** | 表示・入力補助のみ。確定処理は行わず、Callable 経由でサーバーに委譲する。 |

適用対象: 料金・営業日・締め処理・機能フラグに基づくビジネス判定。表示・UI 制御は Flutter で行ってよい。
