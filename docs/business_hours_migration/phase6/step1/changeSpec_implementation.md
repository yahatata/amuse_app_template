# Phase6 Step1: UIでstoreMetaをsnapshot購読する仕様の実装 - 実装詳細仕様書

## 変更履歴（最新）

**2026-02-XX: レビュー指摘に基づく修正**
- (A) 用語/コスト記述の修正: 「Firestoreへの読み取りは1回のみ」等の誤解を招く表現を修正し、リスナー集約の意義に焦点を当てる記述に変更
- (B) サービス実装方針の修正: `ActiveStaysService`と完全に同一の形式で実装することを明記（最優先要件）
- (D) フィールド設計: Step1では最小限のフィールド（`status`、`currentBusinessDateKey`）のみに削減し、Step4の検討事項を追加
- (E) 日付キーのparse: `DateTime.parse`を避け、年月日をsplitして`DateTime(year, month, day)`を生成する方式に変更
- (F) intl/日本語ロケール: 既存コードでの使用状況を確認し、初期化の必要性を注意事項に追記
- (H) status等の取りうる値: 実コードベース（`functions/src/helpers/stateDoc/types.ts`等）で列挙し、想定外の値のUI挙動を定義
- (I) ストリームのエラー流し: `ActiveStaysService`の方針に合わせ、UI側での適切なハンドリングを明記
- (J) テスト項目の現実性: 実行困難なテスト（「Firestore read回数を確認」等）を現実的な確認項目に修正

## 概要

Phase6 Step1では、複数のページで`storeMeta/currentBusinessDay`をsnapshot購読し、営業状態を表示する共通実装を作成します。**コスト最適化のため、`ActiveStaysService`と完全に同一のシングルトンサービスパターンを使用し、アプリ全体で1本のStream購読を共有します。**

**重要**: 詳細仕様は[Phase6 Step1 実装計画](./implementation_plan.md)を参照してください。

**参照した実装**:
- `lib/services/active_stays_service.dart`: シングルトンサービスパターンの参考実装
- `functions/src/helpers/stateDoc/types.ts`: `storeMeta/currentBusinessDay`の型定義
- `functions/src/storeManagement/openStore.ts`: `status: 'running'`を設定する実装
- `functions/src/storeManagement/closeStore.ts`: `status: 'closed'`を設定する実装
- `functions/src/storeManagement/createInitialStateDocCallable.ts`: 初期状態の設定

## 実装タスク

### 0. Phase6 Step1の対象範囲

**Phase6 Step1の対象**:
- **シングルトンサービスの作成**
  - `lib/services/store_meta_service.dart`（新規作成）
  - `StoreMetaData`クラス（データクラス）
  - `StoreMetaService`クラス（シングルトンサービス）
- **各ページでの使用**
  - `lib/Home/terminalHomePage.dart`（更新）
  - `lib/tournament/active/pages/tournament_home_page.dart`（更新）
  - `lib/tournament/active/pages/table_detail_page.dart`（更新）
  - `lib/OrderView/OrderManagement/order_management_page.dart`（更新）
  - `lib/sideGame/pages/side_game_table_list.dart`（更新）

**Phase6 Step1の対象外**（後続ステップで対応）:
- **ステップ2**: 閉店処理の具体処理の作成（未会計billsの処理、ユーザー判断を挟む場所の検討、UI表示）
- **ステップ3**: 閉店処理の一括操作の実装（日付ボタンからの開閉店操作、ターミナル関数経由、エラーハンドリング）
- **ステップ4**: storeMeta監視ページでの自動開閉店時の挙動・表示の実装（UI強警告、各状態に応じた挙動・表示）

---

## 1. シングルトンサービスの作成

### 1.1 `lib/services/store_meta_service.dart`（新規作成）

#### 1.1.1 実装内容

**ファイル**: `lib/services/store_meta_service.dart`（新規作成）

**実装パターン**: `ActiveStaysService`と同じシングルトンサービスパターン

**処理フロー**:
1. シングルトンインスタンスを作成（`_instance`）
2. 初期化時に`storeMeta/currentBusinessDay`を1回だけ購読開始
3. `StreamController.broadcast()`を使用して複数の購読者に対応
4. 最新データをキャッシュし、新規購読者に即座に返す
5. `stream` getterで、キャッシュされた最新データを先に返し、その後リアルタイム更新を流す

#### 1.1.2 データクラス: `StoreMetaData`

**Step1のスコープ**: UI表示に必要な最小限のフィールドのみを含めます。`closeAssessment`、`openAssessment`、`manualOverride`、`lastError`等の詳細フィールドはStep4で検討します（後述の「Step4 検討事項」を参照）。

**参照した型定義**: `functions/src/helpers/stateDoc/types.ts`の`CurrentBusinessDayDoc`インターフェース

```dart
class StoreMetaData {
  /// 営業状態: 'closed' | 'running' | 'error'
  /// 参照: functions/src/helpers/stateDoc/types.ts
  /// 設定箇所:
  ///   - 'running': functions/src/storeManagement/openStore.ts (line 75)
  ///   - 'closed': functions/src/storeManagement/closeStore.ts (line 63)
  ///   - 'closed' (初期値): functions/src/storeManagement/createInitialStateDocCallable.ts (line 29)
  final String? status;
  
  /// 現在の営業日キー: 'YYYY-MM-DD'形式、またはnull
  /// 参照: functions/src/helpers/stateDoc/types.ts
  final String? currentBusinessDateKey;
  
  StoreMetaData({
    this.status,
    this.currentBusinessDateKey,
  });
  
  factory StoreMetaData.fromDocument(DocumentSnapshot doc) {
    if (!doc.exists) return StoreMetaData();
    final data = doc.data() as Map<String, dynamic>?;
    if (data == null) return StoreMetaData();
    
    return StoreMetaData(
      status: data['status'] as String?,
      currentBusinessDateKey: data['currentBusinessDateKey'] as String?,
    );
  }
  
  /// 営業中かどうか
  bool get isRunning => status == 'running';
  
  /// 閉店中かどうか
  bool get isClosed => status == 'closed';
  
  /// エラー状態かどうか
  bool get isError => status == 'error';
  
  /// 想定外のstatus値かどうか
  bool get isUnknownStatus => status != 'running' && status != 'closed' && status != 'error';
}
```

**statusの取りうる値**（実コードベース）:
- `'running'`: 営業中（`functions/src/storeManagement/openStore.ts`で設定）
- `'closed'`: 閉店中（`functions/src/storeManagement/closeStore.ts`で設定、初期値でも使用）
- `'error'`: エラー状態（型定義に含まれるが、Step1では表示のみで特別な処理は不要）

**想定外の値が入っていた場合のUI挙動**:
- `status`が`null`、または`'running'`/`'closed'`/`'error'`以外の値の場合:
  - `isUnknownStatus`が`true`になる
  - UIでは「不明」またはアイコン（`Icons.help_outline`）を表示
  - エラー表示とは区別し、バグに見えない挙動にする

#### 1.1.3 シングルトンサービス: `StoreMetaService`

**実装パターン**: `ActiveStaysService`（`lib/services/active_stays_service.dart`）と完全に同一の形式で実装します。

**参照した実装**: `lib/services/active_stays_service.dart`（line 1-56）

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';

/// storeMeta/currentBusinessDay をアプリ全体で1本だけの単一長寿命リスナーで購読するサービス（シングルトン）
/// 内部で Firestore の snapshots() を1回だけ呼び出し、その結果を StreamController を使って
/// アプリ全体で共有する。各画面が直接 Firestore を呼ぶ形は禁止。
/// 
/// 実装パターン: ActiveStaysService と完全に同一形式
class StoreMetaService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;
  final StreamController<StoreMetaData> _streamController = StreamController<StoreMetaData>.broadcast();
  
  /// 直近の StoreMetaData をキャッシュ（新規購読者に即座に返すため）
  StoreMetaData? _latestData;
  
  /// シングルトンインスタンス（static getter）
  static final StoreMetaService _instance = StoreMetaService._();
  static StoreMetaService get instance => _instance;
  
  StoreMetaService._() {
    _initializeListener();
  }
  
  /// 内部で Firestore リスナーを1本だけ張る
  void _initializeListener() {
    _subscription = _firestore
        .collection('storeMeta')
        .doc('currentBusinessDay')
        .snapshots()
        .listen(
          (snapshot) {
            final data = StoreMetaData.fromDocument(snapshot);
            _latestData = data;
            _streamController.add(data);
          },
          onError: (error) {
            // Firestore の内部リトライに任せる（独自の再接続ロジックは不要）
            // 注意: ActiveStaysServiceと同様にaddErrorを呼ぶが、UI側でエラー状態が張り付かないよう
            // StreamBuilderで適切にハンドリングする（後述の「2.2.1 基本的な実装パターン」を参照）
            _streamController.addError(error);
          },
        );
  }
  
  /// UI 側が購読する Stream
  /// - 新しい購読者にはまず最新データを 1 回返し、
  ///   その後にリアルタイム更新を流す。
  /// 
  /// 実装形式: ActiveStaysService と完全に同一（async* getter）
  Stream<StoreMetaData> get stream async* {
    if (_latestData != null) {
      yield _latestData!;
    }
    yield* _streamController.stream;
  }
  
  /// リスナーのキャンセル（アプリ終了時など）
  void dispose() {
    _subscription?.cancel();
    _streamController.close();
  }
}
```

#### 1.1.4 実装ポイント

- **シングルトンパターン**: `_instance`で1つのインスタンスのみを保持（`ActiveStaysService`と同一）
- **broadcast stream**: `StreamController.broadcast()`で複数の購読者に対応（`ActiveStaysService`と同一）
- **キャッシュ**: `_latestData`で最新データを保持し、新規購読者に即座に返す（`ActiveStaysService`と同一）
- **stream提供形式**: `async*` getterで、キャッシュを先に返し、その後`streamController.stream`を流す（`ActiveStaysService`と完全同一）
- **エラーハンドリング**: Firestoreの内部リトライに任せる（独自の再接続ロジックは不要）。`addError`を呼ぶが、UI側で適切にハンドリングする

---

## 2. 各ページでの使用

### 2.1 対象ページ

以下のページのAppBar内で、`StoreMetaService.instance.stream`を購読して表示を作成します：

1. **`lib/Home/terminalHomePage.dart`**（`terminalHomePage`）
2. **`lib/tournament/active/pages/tournament_home_page.dart`**（`TournamentHomePage`）
3. **`lib/tournament/active/pages/table_detail_page.dart`**（`TableDetailPage`）
4. **`lib/OrderView/OrderManagement/order_management_page.dart`**（`OrderManagementPage`）
5. **`lib/sideGame/pages/side_game_table_list.dart`**（`SideGameTableListPage`）

### 2.2 実装方法

#### 2.2.1 基本的な実装パターン

各ページで`StreamBuilder<StoreMetaData>`を使用し、`StoreMetaService.instance.stream`を購読します。

```dart
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:intl/intl.dart';

// AppBar内での使用例
AppBar(
  title: Text('タイトル'),
  actions: [
    StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, snapshot) {
        // ローディング状態
        if (!snapshot.hasData) {
          return const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          );
        }
        
        // エラー状態
        if (snapshot.hasError) {
          return const Icon(Icons.error, color: Colors.red);
        }
        
        final data = snapshot.data!;
        
        final data = snapshot.data!;
        
        // 想定外のstatus値の場合
        if (data.isUnknownStatus) {
          return const Icon(Icons.help_outline, color: Colors.grey);
        }
        
        // 営業中: M/D(曜日)形式で表示
        if (data.isRunning && data.currentBusinessDateKey != null) {
          // currentBusinessDateKeyは'YYYY-MM-DD'形式
          // DateTime.parse直は避け、年月日をsplitしてDateTimeを生成
          final parts = data.currentBusinessDateKey!.split('-');
          if (parts.length == 3) {
            final year = int.parse(parts[0]);
            final month = int.parse(parts[1]);
            final day = int.parse(parts[2]);
            final date = DateTime(year, month, day);
            final formatted = DateFormat('M/d(E)', 'ja_JP').format(date);
            return TextButton(
              onPressed: () {
                // ステップ3で実装予定の処理
              },
              child: Text(formatted),
            );
          }
        }
        
        // 閉店中またはエラー状態
        if (data.isClosed) {
          return TextButton(
            onPressed: () {
              // ステップ3で実装予定の処理
            },
            child: const Text('閉店中'),
          );
        }
        
        // エラー状態（status === 'error'）
        return const Icon(Icons.error_outline, color: Colors.orange);
      },
    ),
  ],
)
```

#### 2.2.2 表示仕様

- **営業中**（`status === 'running'`）:
  - 日付を表示: `M/D(曜日)`形式（例: `2/8(土)`）
  - `currentBusinessDateKey`（'YYYY-MM-DD'形式）から日付を取得
  - 年月日をsplitして`DateTime(year, month, day)`を生成（`DateTime.parse`は使用しない）
  - `DateFormat('M/d(E)', 'ja_JP')`を使用
- **閉店中**（`status === 'closed'`）:
  - 「閉店中」と表示
- **エラー状態**（`status === 'error'`）:
  - アイコン（`Icons.error_outline`、オレンジ色）を表示
- **想定外のstatus値**（`null`または未知の値）:
  - アイコン（`Icons.help_outline`、グレー）を表示

#### 2.2.3 注意事項

- ステップ1では、日付表示のみを実装（ボタンとしての機能はステップ3で実装）
- 既存の「開閉店管理」ボタンは残す（ステップ3で統合予定）
- 各ページで自由に表示を作成（共通Widgetは作成しない）
- 日付フォーマットは日本語ロケールを使用（`'ja_JP'`）
- **intlパッケージの初期化**: 既存コード（`lib/StaffDate/shiftHomePage.dart`等）で`DateFormat('M月d日(E)', 'ja_JP')`が使用されているため、初期化済みの可能性が高い。ただし、実装時に動作確認が必要な場合は、`initializeDateFormatting('ja_JP')`の呼び出しが必要になる可能性がある（コード修正はStep1の対象外）
- **日付キーのparse**: `currentBusinessDateKey`は'YYYY-MM-DD'形式の文字列。`DateTime.parse`はタイムゾーン問題を避けるため使用せず、年月日をsplitして`DateTime(year, month, day)`を生成する

---

## 3. コスト最適化

### 3.1 実装方針

- **リスナー集約**: `StoreMetaService`がシングルトンで、アプリ全体で1本のFirestoreリスナー（`snapshots()`）のみを作成
- **複数ページで共有**: 各ページで`StoreMetaService.instance.stream`を購読しても、追加のFirestoreリスナーは作成されない
- **初回取得+更新時のみread**: Firestoreリスナーは初回接続時とドキュメント更新時にのみreadが発生する仕組み
- **ページ遷移時のコスト削減**: `terminalHomePage`から`accountingPage`に遷移しても、追加のFirestoreリスナーやreadは発生しない（同じStreamを購読するだけ）

**注意**: 「Firestoreへの読み取りは1回のみ」という表現は誤解を招くため使用しない。正しくは「リスナーをアプリ全体で1本に集約し、初回取得+ドキュメント更新時のみreadが発生。複数ページ購読による追加リスナーを作らない」が趣旨。

### 3.2 動作の流れ

1. **アプリ起動時**: `StoreMetaService`が初期化され、`storeMeta/currentBusinessDay`の`snapshots()`リスナーを1本だけ作成
2. **`terminalHomePage`表示時**: `StoreMetaService.instance.stream`を購読（追加のFirestoreリスナーは作成されない）
3. **`accountingPage`に遷移時**: 同じ`StoreMetaService.instance.stream`を購読（追加のFirestoreリスナーは作成されない）
4. **`storeMeta`更新時**: Firestoreリスナーが更新を検知し、購読中の全ページに自動反映

---

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

---

## テスト項目

### 1. シングルトンサービスの動作確認

- [ ] `StoreMetaService.instance`が常に同じインスタンスを返すことを確認（`identical()`で検証）
- [ ] `snapshots()`を呼ぶ箇所がサービス内1箇所のみであることをコード検索で確認（`lib/services/store_meta_service.dart`内で`snapshots()`の出現回数を確認）
- [ ] `stream`が最新データを即座に返すことを確認（新規購読時に`_latestData`が即座に返されることを確認）
- [ ] `storeMeta`が更新された際に、購読中の全ページに自動反映されることを確認（Firestore Consoleで手動更新し、全ページで表示が更新されることを確認）

### 2. 各ページでの表示確認

- [ ] `terminalHomePage`で営業状態が正しく表示されることを確認
- [ ] `TournamentHomePage`で営業状態が正しく表示されることを確認
- [ ] `TableDetailPage`で営業状態が正しく表示されることを確認
- [ ] `OrderManagementPage`で営業状態が正しく表示されることを確認
- [ ] `SideGameTableListPage`で営業状態が正しく表示されることを確認

### 3. コスト最適化の確認

- [ ] 複数ページで購読しても、追加のFirestoreリスナー（`snapshots()`）が作成されないことを確認（コード検索で`snapshots()`の呼び出し箇所が1箇所のみであることを確認）
- [ ] ページ遷移時にも追加のFirestoreリスナーが作成されないことを確認（デバッグログ等でリスナー作成を確認）
- [ ] `storeMeta`が更新された時のみ、Firestoreリスナーが更新を検知することを確認（Firestore Consoleで手動更新し、ログで更新検知を確認）

---

## 次のステップ

- **ステップ2**: 閉店処理の具体処理の作成（未会計billsの処理、ユーザー判断を挟む場所の検討、UI表示）
- **ステップ3**: 閉店処理の一括操作の実装（日付ボタンからの開閉店操作、ターミナル関数経由、エラーハンドリング）
- **ステップ4**: storeMeta監視ページでの自動開閉店時の挙動・表示の実装（UI強警告、各状態に応じた挙動・表示）

---

## Step4 検討事項（フィールド追加の可能性）

**Step1のスコープ**: Step1では、UI表示に必要な最小限のフィールド（`status`、`currentBusinessDateKey`）のみを`StoreMetaData`に含めます。

**Step4での拡張検討**: Step4では、監視ページや強警告表示等のために、以下のフィールドを`StoreMetaData`に追加する必要がある可能性があります：

- `closeAssessment`: 閉店認定結果（`functions/src/tasks/closeAssessmentTask.ts`で設定）
- `openAssessment`: 開店認定結果（`functions/src/tasks/openAssessmentTask.ts`で設定）
- `manualOverride`: 手動オーバーライド情報
- `lastError`: 最後のエラー情報（`functions/src/helpers/stateDoc/types.ts`で定義）

**検討ポイント**:
- どのフィールドを追加するかは、Step4の実装要件に基づいて決定
- フィールド追加時は、`StoreMetaData.fromDocument()`の実装も更新が必要
- 型安全性を保つため、各フィールドの構造を`functions/src/helpers/stateDoc/types.ts`の型定義に合わせる

---

## 変更履歴

- 2026-02-XX: 初版作成
- 2026-02-XX: レビュー指摘に基づき修正
  - (A) 用語/コスト記述の修正: 「Firestoreへの読み取りは1回のみ」等の誤解を招く表現を修正し、リスナー集約の意義に焦点を当てる記述に変更
  - (B) サービス実装方針の修正: `ActiveStaysService`と完全に同一の形式で実装することを明記
  - (D) フィールド設計: Step1では最小限のフィールドのみに削減し、Step4の検討事項を追加
  - (E) 日付キーのparse: `DateTime.parse`を避け、年月日をsplitして`DateTime(year, month, day)`を生成する方式に変更
  - (F) intl/日本語ロケール: 既存コードでの使用状況を確認し、初期化の必要性を注意事項に追記
  - (H) status等の取りうる値: 実コードベースで列挙し、想定外の値のUI挙動を定義
  - (I) ストリームのエラー流し: `ActiveStaysService`の方針に合わせ、UI側での適切なハンドリングを明記
  - (J) テスト項目の現実性: 実行困難なテストを現実的な確認項目に修正

---

## 参照したファイル一覧

- `lib/services/active_stays_service.dart`: シングルトンサービスパターンの参考実装
- `functions/src/helpers/stateDoc/types.ts`: `storeMeta/currentBusinessDay`の型定義（`CurrentBusinessDayDoc`インターフェース）
- `functions/src/storeManagement/openStore.ts`: `status: 'running'`を設定する実装（line 75）
- `functions/src/storeManagement/closeStore.ts`: `status: 'closed'`を設定する実装（line 63）
- `functions/src/storeManagement/createInitialStateDocCallable.ts`: 初期状態の設定（line 29で`status: 'closed'`）
- `functions/src/tasks/closeAssessmentTask.ts`: 閉店認定処理（statusの読み取り箇所）
- `functions/src/tasks/openAssessmentTask.ts`: 開店認定処理（statusの読み取り箇所）
- `lib/StaffDate/shiftHomePage.dart`: `DateFormat('M月d日(E)', 'ja_JP')`の使用例（既存コードでのintl使用状況確認）
