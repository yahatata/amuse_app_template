> 概要: G3グループの変更ファイル一覧と各ファイルの変更内容
> 主な目的: 実装前後の差分を明示し、実装漏れを防ぐ
> 正本区分: md正本
> 対象: G3で変更するすべてのファイル
> 更新区分: 変更時
> 参照元: docs/UIデザイン調整/G3_ログイン画面/設計.md
> 参照先: 該当なし

---

# G3: changeSpec

最終更新: 2026-09-10

---

## 変更ファイル一覧

| タスク | ファイルパス | 変更種別 | 概要 |
|-------|------------|---------|------|
| G3-04 | `lib/StaffDate/shiftMenuPage.dart` | 変更 | ボタン高さを 1/4 に固定・SafeArea追加・LayoutBuilder導入 |
| G3-05 | `lib/StaffDate/businessDayMenuPage.dart` | 変更 | 同上 |
| G3-03 | `lib/UserLogin/userCheckInPage.dart` | 変更 | ボタンを横並びカードに全面置き換え |
| G3-02 | `lib/UserLogin/UserManualCheckInPage.dart` | 変更 | アイコン縮小・フォーム幅制限追加 |
| G3-01 | `lib/UserRegisterView/createUserAccountPage.dart` | 変更 | ラベル日本語化・カード型レイアウトに変更 |

新規作成ファイル: なし  
削除ファイル: なし

---

## G3-04: lib/StaffDate/shiftMenuPage.dart

### 削除
- `body: Padding(...)` の直接ラップ
- 各ボタンを囲む `Expanded`

### 追加
- `body: SafeArea(child: LayoutBuilder(...))` でラップ
- `btnH` 計算: `(constraints.maxHeight - 48 - 48) / 4`
  - `48` = top padding(24) + bottom padding(24)
  - `48` = gap(16) × 3（トーナメント作成ページ基準）
- `Expanded` → `SizedBox(height: btnH)` に変更

### 変更後のbody構造
```dart
body: SafeArea(
  child: LayoutBuilder(
    builder: (context, constraints) {
      final btnH = (constraints.maxHeight - 48 - 48) / 4;
      return Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: btnH,
              child: ElevatedButton(
                // シフトカレンダー（スタイル変更なし）
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: btnH,
              child: ElevatedButton(
                // シフトドラフト（スタイル変更なし）
              ),
            ),
            // 残り空間は自然な余白（ボタンは上詰め）
          ],
        ),
      );
    },
  ),
),
```

---

## G3-05: lib/StaffDate/businessDayMenuPage.dart

G3-04 と同様の構造変更。

### 変更後のbody構造
```dart
body: SafeArea(
  child: LayoutBuilder(
    builder: (context, constraints) {
      final btnH = (constraints.maxHeight - 48 - 48) / 4;
      return Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: btnH,
              child: ElevatedButton(
                // 営業日編集（スタイル変更なし）
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: btnH,
              child: ElevatedButton(
                // 営業スタイル・必要人数設定（スタイル変更なし）
              ),
            ),
          ],
        ),
      );
    },
  ),
),
```

---

## G3-03: lib/UserLogin/userCheckInPage.dart

### 削除
- `body: Center > Padding(horizontal:32) > Column > [ElevatedButton.icon × 2]`
- `ElevatedButton.icon` のスタイル定義

### 追加
- `body: LayoutBuilder > Center > Row(mainAxisSize: min) > [_CheckInCard × 2]`
- `dart:math` の `min` 関数 import（`import 'dart:math' show min;`）
- `_CheckInCard` StatelessWidget（同ファイル末尾に追記）

### _CheckInCard の仕様
```dart
class _CheckInCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color bgColor;
  final Color fgColor;
  final Color borderColor;
  final VoidCallback onTap;
  final double width;
  final double height;
}
```

### サイズ計算（LayoutBuilder 内）
```dart
const gap = 32.0;
const hPadding = 48.0;
final btnW = min(240.0, (availW - hPadding * 2 - gap) / 2);
final btnH = min(btnW * 4 / 3, availH * 0.65);
```

### ボタン色定数（インラインで定義）
```
QRチェックイン:
  bgColor:     Colors.green[50]!
  fgColor:     Colors.green[800]!
  borderColor: Colors.green[200]!

手動チェックイン:
  bgColor:     Colors.amber[50]!
  fgColor:     Colors.amber[800]!
  borderColor: Colors.amber[200]!
```

### _CheckInCard の描画（Material + InkWell ベース）
```dart
Material(
  color: bgColor,
  shape: RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(20),
    side: BorderSide(color: borderColor, width: 1.5),
  ),
  child: InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(20),
    child: SizedBox(
      width: width,
      height: height,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 52, color: fgColor),
          const SizedBox(height: 12),
          Text(label, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: fgColor)),
        ],
      ),
    ),
  ),
),
```

---

## G3-02: lib/UserLogin/UserManualCheckInPage.dart

### 変更箇所（最小限）

| 変更前 | 変更後 |
|-------|-------|
| `Icon(Icons.lock, size: 80, color: Colors.blue)` | `Icon(Icons.lock, size: 48, color: Colors.blue)` |
| `SingleChildScrollView(child: Form(...))` | `SingleChildScrollView(child: ConstrainedBox(maxWidth: 400, child: Form(...)))` |
| `ElevatedButton(child: Text("ログイン"))` | `SizedBox(width: double.infinity, child: ElevatedButton(child: Text("ログイン")))` |

ロジック・バリデーション・ダイアログ類は変更なし。

---

## G3-01: lib/UserRegisterView/createUserAccountPage.dart

### ラベル変更（`_buildTextField` 呼び出し箇所）

| 変更前 | 変更後 |
|-------|-------|
| `"PokerName"` | `"ポーカーネーム"` |
| `"MailAddress"` | `"メールアドレス"` |
| `"PIN (4桁数字)"` | `"PIN（4桁）"` |
| `"BirthDay (MMDD)"` | `"生年月日（MM/DD）"` |

### アイコンサイズ変更
```dart
// 変更前
const Icon(Icons.person_add, size: 80, color: Colors.blue)
// 変更後
const Icon(Icons.person_add, size: 48, color: Colors.blue)
```

### レイアウト変更

```dart
// 変更前
body: Padding(
  padding: const EdgeInsets.all(16),
  child: Center(
    child: SingleChildScrollView(
      child: Form(...Column(...ElevatedButton(...))),
    ),
  ),
),

// 変更後
body: Padding(
  padding: const EdgeInsets.all(16),
  child: Center(
    child: SingleChildScrollView(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Card(
          elevation: 2,
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.person_add, size: 48, color: Colors.blue),
                  const SizedBox(height: 12),
                  const Text('新規アカウント作成',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const Divider(height: 32),
                  _buildTextField(_nameController, "ポーカーネーム", Icons.person),
                  const SizedBox(height: 16),
                  _buildTextField(_emailController, "メールアドレス", Icons.email, isEmail: true),
                  const SizedBox(height: 16),
                  _buildTextField(_pinController, "PIN（4桁）", Icons.lock, isPin: true),
                  const SizedBox(height: 16),
                  _buildTextField(_birthMonthDayController, "生年月日（MM/DD）", Icons.calendar_today, isBirthMonthDay: true),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: _isLoading ? null : _signUp,
                    style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 50)),
                    child: const Text("新規登録"),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  ),
),
```

### SizedBox(height: 15) → SizedBox(height: 16) に統一
- 現行の `SizedBox(height: 15)` × 3 を `SizedBox(height: 16)` に統一（4pt グリッド準拠）

ロジック（_signUp・_resetForm・バリデーション）は変更なし。
