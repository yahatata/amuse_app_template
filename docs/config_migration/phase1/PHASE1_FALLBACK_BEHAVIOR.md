# Phase1 欠損時・フォールバック挙動

作成日: 2026-03-04  
参照: [PHASE1_CONFIG_SCHEMA.md](./PHASE1_CONFIG_SCHEMA.md), [phase0B/STOREMETA_CONFIG_SPEC.md](../phase0B/STOREMETA_CONFIG_SPEC.md)

---

## 1. 概要

storeMeta/config 取得時の優先度と、欠損時・フォールバック時の挙動を定義する。  
**安全弁としてフォールバック発生時に warning ログを出す**ことで、サイレントフォールバックのリスクを軽減する。

---

## 2. 読み取り優先度

| 優先度 | 取得先 | 説明 |
|--------|--------|------|
| ① | storeMeta/config | Firestore に値があればそれを使用 |
| ② | `functions/src/shared/config/defaults.ts` | ① が無い場合 |
| ③ | 各 TS ファイル内の直書き | ② も無い場合の最終フォールバック（② と同値） |

**未存在時・読み取り失敗時いずれも** ②→③ にフォールバックする（D-0020 方針変更。読み取り失敗時も defaults を返す）。

---

## 3. 未存在と失敗の挙動の区別

**未存在**（値が無い）と**失敗**（読み取りエラー）では挙動を分ける。

| 状況 | わかること | デフォルト使用 | 挙動 |
|------|------------|----------------|------|
| **未存在** (document_missing / field_missing) | 値が存在しない | ✅ 妥当 | ② defaults.ts にフォールバック。warn ログ |
| **失敗** (read_error) | 読み取りに失敗しただけで、実際の値は不明 | △（D-0020 で妥当と判断） | デフォルトにフォールバック。config_read_error + config_fallback をログ出力 |

### 失敗時の挙動（D-0020 方針変更後）

| 層 | 挙動 |
|----|------|
| **Functions（TS）** | リトライを試行。それでも失敗したら `config_read_error` + `config_fallback` をログ出力し、**defaults を返す** |
| **Flutter（Dart）** | **最後の成功値（キャッシュ）をそのまま使い続ける**。デフォルトには切り替えない。error ログを出力 |

---

## 4. 取得層ごとの役割と挙動

### 4.1 Functions（TS）側

| 項目 | 内容 |
|------|------|
| 取得手段 | 共通関数経由で Firestore を読み取り |
| 呼び出し単位 | 1 回の処理につき config 全体を取得（個別キーごとに読み取らない） |
| 未存在時 | ② defaults.ts → ③ 直書き にフォールバック。warn ログ |
| 失敗時 | リトライ後も失敗なら**処理を失敗**。デフォルトは使わない。error ログ |

### 4.2 Flutter（Dart）側

| 項目 | 内容 |
|------|------|
| 取得手段 | **snapshot で storeMeta/config を購読**（表示速度のため） |
| 共通ロジック | StoreConfigService 等で snapshot を購読し、各画面はその Stream から取得 |
| 未存在時 | ② defaults にフォールバック。warn ログ |
| 失敗時 | **最後の成功値（キャッシュ）を維持**。デフォルトには切り替えない。error ログ |
| オフライン | Firestore のオフラインキャッシュが有効。一度読み込み成功後はキャッシュから正しい値が返る |

**注意**: Flutter は最終判定を持たない（SSoT は Functions）。表示・入力補助用途に限定。

---

## 5. ログ仕様

### 5.1 目的

- マルチプロジェクト運用において、全店舗の warning / error を検知しやすくする
- 将来 Log Sink / BigQuery / 外部サービスへ集約する際、構造化ログにより移行しやすくする

### 5.2 イベント名（統一）

| イベント | 用途 | レベル |
|----------|------|--------|
| `config_fallback` | 未存在・不正値によりデフォルト値にフォールバックした場合 | warn |
| `config_read_error` | Firestore 読み取りに失敗した場合（デフォルトは使わない） | error |

### 5.3 構造化ログフォーマット

#### config_fallback（未存在・不正値でデフォルト使用時）

```typescript
// Functions（TS）
logger.warn('config_fallback', {
  configKey: string,        // フォールバックしたキー。ドキュメント全体の場合は '*'
  fallbackSource: string,   // 'defaults.ts' | 'hardcoded'
  fallbackValue?: unknown,  // 使用したデフォルト値（任意）
  reason: string,           // 'document_missing' | 'field_missing' | 'invalid_type' | 'invalid_value'
});
```

**reason の意味（config_fallback）**:

| reason | 説明 |
|--------|------|
| document_missing | storeMeta/config ドキュメントが存在しない |
| field_missing | ドキュメントは存在するが、該当フィールドが未設定 |
| invalid_type | 型が期待と異なる |
| invalid_value | 許容値外 |

**Flutter（Dart）の config_fallback**:

```dart
void _logConfigFallback({
  required String configKey,
  required String reason,
  Object? fallbackValue,
}) {
  debugPrint(
    '[CONFIG_FALLBACK] configKey=$configKey | reason=$reason | '
    'fallbackValue=$fallbackValue',
  );
}
```

#### config_read_error（読み取り失敗時）

> **方針変更（Phase2 検証時）**: 読み取り失敗時もデフォルトにフォールバックするように変更。理由: デフォルトが正である場合が大多数で、取得失敗時にエラーを出すよりデフォルトを返した方が蓄積データの観点で適切。DECISION_LOG D-0020 参照。

```typescript
// Functions（TS）: リトライ後も失敗した場合 → config_read_error を出力した上で defaults を返す
logger.error('config_read_error', {
  reason: 'read_error',
  message: string,          // エラー内容の簡潔な説明
  error?: string,           // 例外メッセージ（任意）
});
logger.warn('config_fallback', { configKey: '*', fallbackSource: 'defaults.ts', reason: 'read_error_after_retries' });
return buildFromDefaults();
```

```dart
// Flutter（Dart）: snapshot の onError 時
// 最後の成功値を維持するため、デフォルトには切り替えない
debugPrint('[CONFIG_READ_ERROR] reason=read_error | message=$message');
```

**将来の拡張**: Crashlytics 等に送信する場合も、`configKey`, `reason` を同じ名称で使用する。

### 5.4 出力タイミング

| 場面 | イベント | レベル | 備考 |
|------|----------|--------|------|
| ドキュメントが存在しない | config_fallback | warn | デフォルト使用 |
| フィールドが未設定 | config_fallback | warn | デフォルト使用 |
| 型・許容値が不正 | config_fallback | warn | デフォルト使用 |
| Firestore 読み取りで exception（リトライ後も失敗） | config_read_error + config_fallback | error + warn | デフォルトを返す（方針変更） |
| ① から正常に値を取得できた | - | - | ログ不要 |

**注意**: 同一処理内で同じ configKey に対して複数回フォールバックする場合、1 回だけログ出力する（ログ爆発を防ぐ）。

---

## 6. 不正値・異常値の扱い

不正値は**未存在相当**として扱い、デフォルトにフォールバックする。

| ケース | 挙動 | reason |
|--------|------|--------|
| 型が期待と異なる | デフォルト値にフォールバック、config_fallback ログ | invalid_type |
| 許容値外（例: linePlan が 'unknown'） | デフォルト値にフォールバック、config_fallback ログ | invalid_value |
| null / undefined | 未設定とみなし、field_missing 相当でフォールバック | field_missing |

---

## 7. リスクと安全弁の関係

### 7.1 想定リスク

> 店舗 A が `entranceFee: 2000` に設定済み。  
> 何らかの理由で storeMeta/config の取得に失敗 → デフォルト 1000 で動作  
> → 入店料が半額で請求される（サイレント）

### 7.2 安全弁

1. **未存在時・読み取り失敗時ともにデフォルトにフォールバック**（方針変更）。従来は読み取り失敗時は throw だったが、デフォルトが正の場合が大多数のため、デフォルトを返すように変更。Flutter は従来通り最後の成功値を維持
2. **フォールバック時に必ず warn ログ**（config_fallback）→ サイレントにならない
3. **読み取り失敗時は error ログ**（config_read_error）→ 検知しやすい
4. **ログフォーマットを統一** → 将来 Log Sink / BigQuery で集約・アラート設定が容易
5. **Flutter は snapshot + オフラインキャッシュ** → 一度取得成功後はネットワーク断でも正しい値が返る

### 7.3 残存リスク（許容）

- **初回起動 + ネットワーク不通 + キャッシュなし**: Flutter ではデフォルト表示となる可能性あり。運用上、初回セットアップではネットワークが前提となるため、許容範囲とする。

---

## 8. マルチプロジェクト監視（将来）

1 リポジトリから複数アプリをリリースし、各アプリが別 Firebase プロジェクトに紐づく想定。

### 8.1 将来の集約方式（参考）

| 方式 | 概要 |
|------|------|
| Cloud Logging Log Sink → BigQuery | 各プロジェクトの Cloud Logging を中央 BigQuery に集約。SQL で集計・アラート |
| Cloud Monitoring アラート | ログベースメトリクスで `config_fallback` / `config_read_error` を検知し、Slack/メール通知 |

### 8.2 現時点で実施すること

- **構造化ログフォーマット（config_fallback / config_read_error + configKey, reason 等）を統一**
- Task 4 の取得層実装時に、上記フォーマットでログを出力する
- インフラ側（Log Sink / BigQuery / アラート）の設定は将来実施

---

## 9. 参照

- [PHASE1_CONFIG_SCHEMA.md](./PHASE1_CONFIG_SCHEMA.md)
- [phase0B/STOREMETA_CONFIG_SPEC.md](../phase0B/STOREMETA_CONFIG_SPEC.md)
- [PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md)
