# 未退勤一覧 Firestore インデックスエラー 原因切り分け

インデックス有効・別プロジェクトではない・他画面は正常なのに、未退勤一覧のみ `failed-precondition: The query requires an index` が出る場合の切り分け手順と対処案です。

## 実装済み: 切り分けコード

`lib/Home/unclocked_attendance_list_page.dart` にテストモードを追加済み。

- `_queryTestMode` を `testA` / `testB` / `testC` に変更してクエリを切り替え
- エラー時に `code`, `message`, テストモードを画面と debugPrint で表示

---

## 1. 現状のクエリ

```dart
// lib/Home/unclocked_attendance_list_page.dart
.where('clockOut', isEqualTo: null)
.orderBy('date', descending: true)
.orderBy('clockIn', descending: true)
.limit(200)
.snapshots()
```

必要な複合インデックス: `clockOut` ASC, `date` DESC, `clockIn` DESC  
→ デプロイ済み・有効と確認済み

---

## 2. 切り分け手順

### Step 1: クエリを段階的に簡略化してエラー箇所を特定

| テスト | クエリ | 期待 | 結果で分かること |
|-------|--------|------|------------------|
| A | `where('clockOut', isEqualTo: null).limit(10)` のみ（orderBy なし） | 成功 | orderBy が原因か |
| B | 上記 + `orderBy('date', descending: true)` のみ | 成功/失敗 | date の orderBy が原因か |
| C | 上記 + `orderBy('clockIn', descending: true)` も追加（現行と同一） | 成功/失敗 | 現行クエリの問題か |

**方法**: `_unclockedStream()` を一時的にテスト用クエリに差し替えて実行する。

### Step 2: エラーの完全な内容を取得

エラーメッセージとスタックトレースをすべてログに出す。

```dart
// unclocked_attendance_list_page.dart の StreamBuilder builder 内
if (snapshot.hasError) {
  final err = snapshot.error;
  debugPrint('=== Firestore Error ===');
  debugPrint('error: $err');
  debugPrint('runtimeType: ${err.runtimeType}');
  if (err is FirebaseException) {
    debugPrint('code: ${err.code}');
    debugPrint('message: ${err.message}');
    debugPrint('plugin: ${err.plugin}');
    debugPrint('stackTrace: ${err.stackTrace}');
  }
  // ...
}
```

ここから以下を確認する：

- `code` が `failed-precondition` か
- `message` 内のインデックス作成用 URL の有無と内容

### Step 3: エラー内のリンクでインデックス作成を試す

1. エラーメッセージ内の URL をコピー
2. `ffirestore` → `firestore` に修正してアクセス
3. Firebase Console のインデックス作成画面が開く
4. 「インデックスは既に存在します」と出るか、新規作成になるか確認
   - 既存と表示される → 別要因の可能性
   - 新規作成になる → 実際に必要な定義がデプロイ済みと異なる可能性

### Step 4: Firestore データベースの確認

複数データベースがある場合、アプリが参照している DB と、インデックスが有効な DB が一致しているか確認する。

```dart
// 一時的に main.dart や初期化処理で
final db = FirebaseFirestore.instance;
debugPrint('Firestore databaseId: ${db.app.options.projectId}');
// デフォルト以外を使っている場合
// FirebaseFirestore.instanceFor(app: app, databaseId: 'xxx')
```

- プロジェクト ID が期待どおりか
- 使用 DB が `(default)` か、他 DB か

### Step 5: 他画面の attendances クエリとの比較

正常に動いている attendances クエリと比較する。

- `_TodayAttendanceList`: `where('date', whereIn: [dateKey, nextDateKey])`（orderBy なし）
- `_UnclockedMarkedList`: `where('closedStoreWithoutClockOut', isEqualTo: true)`（orderBy なし）
- 未退勤一覧: `where('clockOut', isEqualTo: null)` + `orderBy` 2つ

→ 未退勤一覧だけ複合インデックスを必要とするクエリになっている。

---

## 3. ワークアラウンド（原因が確定するまでの暫定対応）

複合インデックス起因の問題を避けるため、**orderBy をやめて取得後にメモリでソート**する方法。

- メリット: 単一フィールドのみのクエリになり、自動インデックスで動く可能性が高い
- デメリット: 取得件数が大きい場合、サーバー側での「日付・出勤時刻でソートした上で 200 件」は保証されない（取得した 200 件をソートするだけ）

```dart
Stream<QuerySnapshot<Map<String, dynamic>>> _unclockedStream() {
  return FirebaseFirestore.instance
      .collection('attendances')
      .where('clockOut', isEqualTo: null)
      .limit(_limit)
      .snapshots();
}
```

取得後、`date` 降順 → `clockIn` 降順でソートする（既存の `_groupByDate` などと整合するようにする）。

データ量が少ない（未退勤が数百件程度）場合は、この暫定対応で十分な場合が多い。

---

## 4. 想定される原因候補

| 原因 | 確認方法 | 対処 |
|------|----------|------|
| インデックス定義の不一致 | エラー内リンクで作成を試し、既存か新規か確認 | リンクから作成 or firestore.indexes.json をリンクの定義に合わせる |
| 別データベースを参照 | アプリの Firestore 初期化・使用 DB をログ出力 | 正しい DB にインデックスをデプロイ |
| orderBy の挙動 | Step 1 の A/B/C で段階的に orderBy を追加 | 問題の orderBy を外す or ワークアラウンドでソート |
| Flutter Firestore SDK のバグ | cloud_firestore のバージョン変更・Issue 検索 | バージョンアップ・回避クエリ |

---

## 5. ログ取得用コード例

`_unclockedStream()` の直下などに一時的に追加:

```dart
Stream<QuerySnapshot<Map<String, dynamic>>> _unclockedStream() {
  final stream = FirebaseFirestore.instance
      .collection('attendances')
      .where('clockOut', isEqualTo: null)
      .orderBy('date', descending: true)
      .orderBy('clockIn', descending: true)
      .limit(_limit)
      .snapshots();

  return stream.handleError((err, st) {
    debugPrint('=== UnclockedAttendance Firestore Error ===');
    debugPrint('$err');
    debugPrint('$st');
    if (err is FirebaseException) {
      debugPrint('code: ${err.code}, message: ${err.message}');
    }
    throw err;
  });
}
```

---

## 6. 切り分けの進め方（実装済みコードで実行）

1. **testA で起動**  
   `_queryTestMode = _QueryTestMode.testA` のまま未退勤一覧を開く。
   - 成功 → orderBy が原因の可能性大。testB へ。
   - 失敗 → where 自体か、より根本的な要因。

2. **testB で起動**  
   `_queryTestMode = _QueryTestMode.testB` に変更し、再度未退勤一覧を開く。
   - 成功 → `orderBy('clockIn')` 追加が原因の可能性。
   - 失敗 → `orderBy('date')` 追加で既にエラー。

3. **testC で起動**  
   `_queryTestMode = _QueryTestMode.testC` に変更（元のクエリ）。
   - 成功 → 一時的な不整合など、再現しづらい要因の可能性。
   - 失敗 → 元のクエリで確実に再現。

4. **エラー時**  
   - デバッグコンソールで `debugPrint` 出力を確認
   - 画面上の `code`, `message` を控える
   - `message` 内のインデックス作成 URL をコピーしてブラウザで開く

5. **testA で成功した場合**  
   暫定対応として testA（orderBy なし + メモリソート）のまま運用可能。必要に応じて `_queryTestMode` を testA 固定のままにするか、後で testC に戻して再検証。

---

## 7. 推奨アクション（優先順）

1. **Step 1**: 上記の testA → testB → testC で、どのクエリでエラーになるか確認
2. **Step 2**: エラー内容（`code`, `message`, URL）をすべてログ取得
3. **Step 3**: エラー内リンクでインデックス作成を試し、既存か新規か確認
4. 原因が特定できるまで: **testA（orderBy 削除 + メモリソート）**で運用可能にする
