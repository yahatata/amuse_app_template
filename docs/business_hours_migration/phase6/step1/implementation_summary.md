# Phase6 Step1 実装完了まとめ

## 概要

Phase6 Step1 では、複数ページで `storeMeta/currentBusinessDay` を snapshot 購読し、営業状態を AppBar に表示する共通基盤を実装しました。**アプリ全体で Firestore リスナーを 1 本に集約するため、`ActiveStaysService` と同一のシングルトンサービスパターンで `StoreMetaService` を実装しています。**

---

## 1. 実装したファイル一覧

### 新規作成

| ファイル | 内容 |
|----------|------|
| `lib/services/store_meta_service.dart` | `StoreMetaData` クラスと `StoreMetaService` シングルトン |

### 更新

| ファイル | 変更内容 |
|----------|----------|
| `lib/Home/terminalHomePage.dart` | AppBar actions に営業状態表示を追加 |
| `lib/tournament/active/pages/tournament_home_page.dart` | AppBar actions に営業状態表示を追加（白文字） |
| `lib/tournament/active/pages/table_detail_page.dart` | AppBar actions に営業状態表示を追加 |
| `lib/OrderView/OrderManagement/order_management_page.dart` | AppBar に actions を新設し営業状態表示を追加（白文字） |
| `lib/sideGame/pages/side_game_table_home.dart` | AppBar actions に営業状態表示を追加（白文字） |

**補足**: サイドゲームでは「テーブル一覧」ではなく「卓ホーム」画面（`side_game_table_home.dart`）に営業状態を表示しています。`side_game_table_list.dart` には実装していません。

---

## 2. 各ファイルの処理内容

### 2.1 `lib/services/store_meta_service.dart`（新規）

- **StoreMetaData（データクラス）**
  - Firestore の `storeMeta/currentBusinessDay` ドキュメントを型安全に扱うためのクラス。
  - **Step1 で利用するフィールド（最小限）**
    - `status`: 営業状態（`'closed'` / `'running'` / `'error'`）
    - `currentBusinessDateKey`: 現在の営業日キー（`'YYYY-MM-DD'` 形式、null 許容）
  - `fromDocument(DocumentSnapshot)` でドキュメントから生成。
  - getter: `isRunning` / `isClosed` / `isError` / `isUnknownStatus`（想定外の status 用）。

- **StoreMetaService（シングルトン）**
  - `storeMeta/currentBusinessDay` の `snapshots()` を **1 本だけ** 購読し、その結果を `StreamController.broadcast()` で配信。
  - `_latestData` に最新値をキャッシュし、新規購読時は `stream` getter で「キャッシュ 1 件 → 以降は controller の stream」を返す（`ActiveStaysService` と同一の `async*` パターン）。
  - エラー時は `addError` で流し、再接続は Firestore のリトライに任せる。
  - `StoreMetaService.instance` でアプリ全体で同一インスタンスを利用。

### 2.2 各ページでの変更内容

- **共通パターン**
  - `StoreMetaService.instance.stream` を `StreamBuilder<StoreMetaData>` で購読。
  - 各ページで `_buildStoreStatusAction(BuildContext)` を定義し、AppBar の `actions` に配置。
- **表示仕様**
  - **ローディング**: 小さい `CircularProgressIndicator`（幅・高さ 20、strokeWidth 2）。
  - **ストリームエラー**: 赤い `Icons.error`。
  - **想定外の status**: グレー `Icons.help_outline`。
  - **営業中**（`status == 'running'` かつ `currentBusinessDateKey` あり）: 日付を `M/d(E)` 形式（例: `2/8(土)`）で表示。`currentBusinessDateKey` は `-` で分割し `DateTime(year, month, day)` を組み立て、`DateFormat('M/d(E)', 'ja_JP')` でフォーマット（`DateTime.parse` は使用しない）。
  - **閉店中**（`status == 'closed'`）: 「閉店中」テキスト。
  - **エラー状態**（`status == 'error'`）: オレンジ `Icons.error_outline`。
- **AppBar の色に合わせた調整**
  - 青系・グレー系の AppBar（`tournament_home_page`、`order_management_page`、`side_game_table_home`）では、テキスト・インジケータ色を白（`Colors.white`）に統一。

- **terminalHomePage.dart**
  - import: `store_meta_service`、`intl` を追加。
  - AppBar actions の **先頭** に営業状態ウィジェットを追加（開閉店管理・設定の左）。既存の「開閉店管理」ボタンはそのまま残す（Step3 で統合予定）。

- **tournament_home_page.dart**
  - import: `store_meta_service`、`intl` を追加。
  - AppBar actions の先頭に営業状態を追加。青 AppBar のため表示は白。

- **table_detail_page.dart**
  - import: `store_meta_service`、`intl` を追加。
  - AppBar actions の先頭に営業状態を追加（「まとめてAddon」等の左）。

- **order_management_page.dart**
  - import: `store_meta_service` を追加（既に `intl` あり）。
  - AppBar に `actions` を新設し、その中に営業状態のみ配置。青 AppBar のため表示は白。

- **side_game_table_home.dart**
  - import: `store_meta_service`、`intl` を追加。
  - AppBar actions の先頭に営業状態を追加（ゲーム名 PopupMenuButton の左）。グレー AppBar のため表示は白。

---

## 3. 処理の流れ

1. **アプリ起動時**
   - どこかで初めて `StoreMetaService.instance` にアクセスすると、`StoreMetaService._()` が実行され、`_initializeListener()` で `storeMeta/currentBusinessDay` の `snapshots()` リスナーが 1 本だけ張られる。

2. **いずれかの対象ページを表示したとき**
   - そのページの AppBar で `StreamBuilder<StoreMetaData>(stream: StoreMetaService.instance.stream, ...)` が動く。
   - `stream` getter は、キャッシュがあればまずそれを 1 回 yield し、続けて `_streamController.stream` を yield するため、待たずに直近の営業状態が表示される。
   - 追加の Firestore リスナーは張られない（同一ストリームを購読するだけ）。

3. **storeMeta/currentBusinessDay が更新されたとき**
   - Firestore のリスナーが更新を受け取り、`_latestData` を更新して `_streamController.add(data)` する。
   - 購読中の全ページの `StreamBuilder` が再ビルドされ、AppBar の表示が一斉に更新される。

4. **ページ遷移時**
   - 別の対象ページに遷移しても、同じ `StoreMetaService.instance.stream` を購読するだけなので、Firestore の新規リスナーや追加の read は発生しない。

---

## 4. 設計上のポイント

- **リスナー集約**: 全画面で `StoreMetaService` 経由の 1 本のストリームのみを購読し、Firestore の `snapshots()` はサービス内 1 箇所のみで呼ぶ。
- **Step1 のスコープ**: 表示に必要な `status` と `currentBusinessDateKey` のみを `StoreMetaData` に持たせ、`closeAssessment` や `openAssessment` 等は Step4 で検討。
- **日付の扱い**: `currentBusinessDateKey` は文字列の `-` 分割と `int.parse` で `DateTime` を組み立て、`DateTime.parse` はタイムゾーン問題を避けるため使用しない。
- **既存機能**: 開閉店管理ボタンや他 actions は変更せず、営業状態は「表示のみ」で、ボタンとしての開閉店操作は Step3 で実装予定。

---

## 5. 参照ドキュメント

- 実装詳細仕様: `docs/business_hours_migration/phase6/step1/changeSpec_implementation.md`
- 実装計画: `docs/business_hours_migration/phase6/step1/implementation_plan.md`
- 人間向けレビュー用: `docs/business_hours_migration/phase6/step1/changeSpec_human_review.md`

---

## 6. 次のステップ

- **Step2**: 閉店処理の具体処理（未会計 bills の扱い、ユーザー判断を挟む箇所、UI 表示）
- **Step3**: 閉店処理の一括操作（日付ボタンからの開閉店操作、ターミナル関数経由、エラーハンドリング）
- **Step4**: storeMeta 監視ページでの自動開閉店時の挙動・表示（UI 強警告、状態別の表示）
