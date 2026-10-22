# 起動時の config 取得の安定化

## 1. 背景・課題

Flutter アプリ起動時に `storeMeta/config` を Firestore の `snapshots()` で購読している。初回 snapshot が到着する前に config 依存画面が表示されると、`latestData` が null のためデフォルト値が使用されてしまう。

**望ましくない事象**: 本来 storeMeta/config に設定された値を使うべきところで、デフォルトが使われてしまう。

## 2. 改善方針

### 2.1 対策1と対策3の併用を検討する

以下の2つの対策を併用することを推奨する。

| 対策 | 内容 | 効果 |
|------|------|------|
| **対策1** | AppInitializer で config の初回取得を待つ（`waitForFirstConfig`） | 初回表示時点で config が揃っていることを保証。レース条件を解消。 |
| **対策3** | Firestore のオフライン永続化（persistence）の確認・有効化 | 2回目以降の起動でキャッシュから即座に config を取得。初回の待ち時間短縮。 |

**併用の利点**:
- 対策1: 初回起動・キャッシュなしのケースでも config 取得を保証
- 対策3: 2回目以降の起動ではキャッシュにより `waitForFirstConfig` が即座に解決し、待ち時間を実質ゼロに近づけられる

**実装の流れ**:
1. `StoreConfigService` に `Future<void> waitForFirstConfig({Duration? timeout})` を追加
2. `AppInitializer._initializeApp()` 内で、デバイスチェックと並行して `await StoreConfigService.instance.waitForFirstConfig(timeout: Duration(seconds: 5))` を実行
3. Firestore の persistence 設定を確認（`cloud_firestore` はモバイルでデフォルト有効の可能性あり）。必要に応じて明示的に有効化

### 2.2 タイムアウトとデフォルト使用の判断

`waitForFirstConfig` は**タイムアウトを設ける**。ずっと待ち続けることは望ましくない。

- **タイムアウト内に config が到着**: 正常。config を使用して画面遷移
- **タイムアウト超過**: デフォルトを使用して画面遷移するが、その際の挙動を事前に設計する必要がある

## 3. デフォルト使用時の挙動に関する検討事項

タイムアウトや読み取りエラーにより、やむを得ずデフォルトを使用する場合の挙動を検討する必要がある。

### 3.1 エラーログ

| 検討項目 | 内容 |
|----------|------|
| **ログ出力** | デフォルト使用時に `[CONFIG_FALLBACK]` 相当のログを出力する。既存の `config_load_summary` と整合させる |
| **ログレベル** | 警告（warning）として扱い、運用時に検知しやすくする |
| **含める情報** | `reason`（timeout / read_error / document_missing 等）、`configKey`（該当する場合は `*`）、発生タイミング |
| **Firebase Crashlytics** | 本番環境で検知するため、非致命的エラーとして記録するか検討 |

### 3.2 UI 上の対応

| 検討項目 | 内容 |
|----------|------|
| **デフォルト使用の明示** | デフォルトが使われていることをユーザーに表示する。例: 画面上部にバナー「設定の読み込みに失敗しました。一時的にデフォルト設定を使用しています。」 |
| **確認の要求** | 「了解」ボタンで閉じる、または一定時間表示後に自動で消す等、ユーザーに認知させる |
| **再試行の提供** | 「再読み込み」ボタンで config の再取得を試みる選択肢を検討 |
| **影響範囲の説明** | どの機能がデフォルトにフォールバックしているか、簡潔に説明するか検討（例: メニューカテゴリ、給与期間など） |

### 3.3 設計上の判断が必要な点

1. **タイムアウト値**: 5秒が妥当か。ネットワークが遅い環境を考慮するか
2. **デフォルト使用時の制限**: デフォルト使用中は一部機能を無効化するか、それとも全機能をデフォルト値で利用可能にするか
3. **バナーの表示タイミング**: 初回画面遷移直後に表示するか、config 依存画面に遷移した時点で表示するか
4. **オフライン時の扱い**: オフラインでキャッシュもない場合、デフォルト使用を許容するか、エラー画面で留めるか

## 4. 実装時の参照

- **StoreConfigService**: `lib/services/store_config_service.dart`
- **AppInitializer**: `lib/main.dart`
- **既存の config ログ**: `[config_load_summary]`, `[CONFIG_FALLBACK]`, `[CONFIG_READ_ERROR]`
- **Firestore persistence**: `cloud_firestore` パッケージのドキュメントを参照

## 5. 今後のタスク

- [ ] `waitForFirstConfig` の実装
- [ ] AppInitializer への組み込み
- [ ] Firestore persistence の確認・設定
- [ ] デフォルト使用時のログ仕様の確定
- [ ] デフォルト使用時の UI 仕様の確定
- [ ] 上記に基づく実装

---

*本ドキュメントは改善案の検討用である。実装前に上記の検討事項を確定すること。*
