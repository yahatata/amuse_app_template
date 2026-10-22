# Phase6 Step1: UIでstoreMetaをsnapshot購読する仕様の実装 - 人間向け概要

## 概要

Phase6 Step1では、複数のページで`storeMeta/currentBusinessDay`をsnapshot購読し、営業状態を表示する共通実装を作成します。**コスト最適化のため、`ActiveStaysService`と同じシングルトンサービスパターンを使用し、アプリ全体で1本のStream購読を共有します。**

## 目的

- 複数のページで営業状態（営業中/閉店中）と現在の営業日を表示
- Firestoreへの読み取りコストを最小化（アプリ全体で1本のStream購読のみ）
- ページ遷移時にも追加の読み取りコストを発生させない
- `storeMeta`が更新された際に、全ページでリアルタイムに表示を更新

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
2. **`lib/tournament/active/pages/tournament_home_page.dart`**（`TournamentHomePage`）
3. **`lib/tournament/active/pages/table_detail_page.dart`**（`TableDetailPage`）
4. **`lib/OrderView/OrderManagement/order_management_page.dart`**（`OrderManagementPage`）
5. **`lib/sideGame/pages/side_game_table_list.dart`**（`SideGameTableListPage`）

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

### 3. コスト最適化

**実装方針**:
- **アプリ全体で1本のStream購読**: `StoreMetaService`がシングルトンで1回だけFirestoreを購読
- **複数ページで共有**: 各ページで`StoreMetaService.instance.stream`を購読しても、Firestoreへの追加読み取りは発生しない
- **更新時のみ読み込み**: `storeMeta`が更新された時のみ、Firestoreからデータを取得
- **ページ遷移時のコスト削減**: `terminalHomePage`から`accountingPage`に遷移しても、追加の読み取りコストは発生しない

## 主要な特徴

### 1. コスト最適化

- Firestoreへの読み取りは1回のみ（アプリ起動時に1回だけ購読開始）
- 複数ページで購読しても、追加の読み取りコストは発生しない
- ページ遷移時にも追加の読み取りコストは発生しない
- `storeMeta`が更新された時のみ、Firestoreからデータを取得

### 2. リアルタイム更新

- `storeMeta`が更新されると、購読中の全ページに即座に反映
- 各ページで`StreamBuilder`を使用するだけで自動更新

### 3. パターンの統一

- `ActiveStaysService`と同じパターンで一貫性がある
- 既存コードとの整合性が高い

### 4. 型安全性

- `StoreMetaData`クラスで型安全にアクセス
- `isRunning`、`isClosed`などの便利なgetterを提供

## 動作の流れ

1. **アプリ起動時**: `StoreMetaService`が初期化され、`storeMeta/currentBusinessDay`を1回だけ購読開始
2. **`terminalHomePage`表示時**: `StoreMetaService.instance.stream`を購読（Firestoreへの追加読み取りなし）
3. **`accountingPage`に遷移時**: 同じ`StoreMetaService.instance.stream`を購読（Firestoreへの追加読み取りなし）
4. **`storeMeta`更新時**: Firestoreから更新を検知し、購読中の全ページに自動反映

## 次のステップ

- **ステップ2**: 閉店処理の具体処理の作成（未会計billsの処理、ユーザー判断を挟む場所の検討、UI表示）
- **ステップ3**: 閉店処理の一括操作の実装（日付ボタンからの開閉店操作、ターミナル関数経由、エラーハンドリング）
- **ステップ4**: storeMeta監視ページでの自動開閉店時の挙動・表示の実装（UI強警告、各状態に応じた挙動・表示）
