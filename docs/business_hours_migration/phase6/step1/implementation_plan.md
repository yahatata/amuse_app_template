# Phase6 Step1: UIでstoreMetaをsnapshot購読する仕様の実装

## 重要: 実装開始前の確認

**本ステップを開始する前に、以下の検討事項を確認してください**:
- 本ステップには検討事項はありませんが、ステップ2以降の検討事項を事前に確認することを推奨します

## 概要

複数のページで`storeMeta/currentBusinessDay`をsnapshot購読し、営業状態を表示する共通実装を作成します。**コスト最適化のため、`ActiveStaysService`と同じシングルトンサービスパターンを使用し、アプリ全体で1本のStream購読を共有します。**

## 実装内容

### 1. シングルトンサービスの作成

**ファイル**: `lib/services/store_meta_service.dart`（新規作成）

**実装内容**:
- `storeMeta/currentBusinessDay`をアプリ全体で1本だけ購読するシングルトンサービス
- `ActiveStaysService`と同じパターンで実装
- Firestoreへの読み取りは1回のみ（`storeMeta`が更新された時のみ）
- 複数ページで購読しても、追加の読み取りコストは発生しない

**データクラス**:
- `StoreMetaData`クラスを定義し、型安全にアクセス可能
- 主要フィールド: `status`, `currentBusinessDateKey`, `lastClosedBusinessDateKey`, `closeAssessment`, `openAssessment`, `manualOverride`, `lastError`
- 便利なgetter: `isRunning`, `isClosed`, `isError`

**実装ポイント**:
- `StreamController.broadcast()`を使用して複数の購読者に対応
- 最新データをキャッシュし、新規購読者に即座に返す
- Firestoreの`snapshots()`を1回だけ呼び出し、その結果を共有

### 2. 各ページでの使用

以下のページのAppBar内で、`StoreMetaService.instance.stream`を購読して表示を作成します：

1. **`lib/Home/terminalHomePage.dart`**（`terminalHomePage`）
   - AppBar内の適切な位置に配置
   - 既存の「開閉店管理」ボタンは残す（ステップ3で統合予定）

2. **`lib/tournament/active/pages/tournament_home_page.dart`**（`TournamentHomePage`）
   - AppBar内に追加

3. **`lib/tournament/active/pages/table_detail_page.dart`**（`TableDetailPage`）
   - AppBar内に追加

4. **`lib/OrderView/OrderManagement/order_management_page.dart`**（`OrderManagementPage`）
   - AppBar内に追加

5. **`lib/sideGame/pages/side_game_table_list.dart`**（`SideGameTableListPage`）
   - AppBar内に追加

**表示仕様**:
- **営業中**（`status === 'running'`）:
  - 日付を表示: `M/D(曜日)`形式（例: `2/8(土)`）
  - `currentBusinessDateKey`から日付を取得
- **閉店中**（`status === 'closed'`）:
  - 「閉店中」と表示

**実装方法**:
- 各ページで`StreamBuilder<StoreMetaData>`を使用
- `StoreMetaService.instance.stream`を購読
- 各ページで自由に表示を作成（ボタンとしての機能はステップ3で実装）
- 日付フォーマット: `DateFormat('M/d(E)', 'ja_JP')`を使用
- 曜日は日本語表記（月、火、水、木、金、土、日）

### 3. コスト最適化

**実装方針**:
- **アプリ全体で1本のStream購読**: `StoreMetaService`がシングルトンで1回だけFirestoreを購読
- **複数ページで共有**: 各ページで`StoreMetaService.instance.stream`を購読しても、Firestoreへの追加読み取りは発生しない
- **更新時のみ読み込み**: `storeMeta`が更新された時のみ、Firestoreからデータを取得
- **ページ遷移時のコスト削減**: `terminalHomePage`から`accountingPage`に遷移しても、追加の読み取りコストは発生しない

## 作成・更新するファイル

### 新規作成
1. `lib/services/store_meta_service.dart`
   - `StoreMetaData`クラス（データクラス）
   - `StoreMetaService`クラス（シングルトンサービス）

### 更新
1. `lib/Home/terminalHomePage.dart`
2. `lib/tournament/active/pages/tournament_home_page.dart`
3. `lib/tournament/active/pages/table_detail_page.dart`
4. `lib/OrderView/OrderManagement/order_management_page.dart`
5. `lib/sideGame/pages/side_game_table_list.dart`

## 注意事項

- ステップ1では、日付表示のみを実装（ボタンとしての機能はステップ3で実装）
- 既存の「開閉店管理」ボタンは残す（ステップ3で統合予定）
- 日付フォーマットは日本語ロケールを使用（`'ja_JP'`）
- `StoreMetaService`は`ActiveStaysService`と同じパターンで実装し、アプリ全体で1本のStream購読を共有
- 各ページで表示を作成する際は、`StoreMetaService.instance.stream`を購読し、各ページで自由にUIを実装

## 次のステップ

- ステップ2: 閉店処理の具体処理の作成（未会計billsの処理、ユーザー判断を挟む場所の検討）
