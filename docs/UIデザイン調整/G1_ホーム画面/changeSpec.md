> 概要: G1 ホーム画面リデザインの変更仕様（G5-01カラー定義を含む）
> 正本区分: md正本
> 更新区分: 単発
> 参照元: 設計.md
> 参照先: テスト設計.md、確認手順.md

# G1 ホーム画面 changeSpec

状態: ✅ 作成完了（実装待ち）
作成日: 2026-09-10

---

## 変更ファイル一覧

| # | ファイル | 種別 | 概要 |
|---|---------|-----|-----|
| 1 | `lib/theme/home_button_theme.dart` | 新規作成 | G5-01相当: カラー・アイコン定数定義 |
| 2 | `lib/Home/terminalHomePage.dart` | 変更 | レイアウト全面刷新・グレーアウト実装 |
| 3 | `lib/Home/adminHomePage.dart` | 変更 | レイアウト全面刷新・通知ベル色修正 |
| 4 | `lib/debug/home_design_demo_page.dart` | 変更 | デモボタンimport・ボタン削除（実装完了後） |

---

## 1. lib/theme/home_button_theme.dart（新規作成）

### 目的
G5-01相当。ホームボタンのカラー・アイコンを一元管理する。
Terminal・Admin 両ホームページから参照する。

### 内容

```dart
// カテゴリテーマ（bg=ボタン背景色, fg=アイコン・テキスト色）
class HomeCategoryTheme {
  final String label;      // カテゴリ表示名（絵文字含む）
  final Color bg;          // ボタン背景色
  final Color fg;          // アイコン・テキスト色
}

// Terminal カテゴリ定義
class TerminalCategoryColors {
  static const operations  // 営業:  bg=#E3F2FD, fg=#1565C0
  static const user        // ユーザー: bg=#F3E5F5, fg=#6A1B9A
  static const accounting  // 会計:  bg=#FFF8E1, fg=#E65100
  static const order       // 注文:  bg=#FBE9E7, fg=#B71C1C
  static const tournament  // Tournament: bg=#E8F5E9, fg=#1B5E20
  static const sideGame    // SideGame: bg=#E0F2F1, fg=#004D40
}

// Admin カテゴリ定義
class AdminCategoryColors {
  static const shift       // シフト管理: bg=#E3F2FD, fg=#1565C0
  static const attendance  // 勤怠: bg=#F3E5F5, fg=#6A1B9A
  static const staff       // スタッフ管理: bg=#E8F5E9, fg=#1B5E20
  static const settings    // 設定・分析: bg=#EFEBE9, fg=#3E2723
}

// グレーアウト時スタイル
class HomeButtonGreyTheme {
  static const bg = Color(0xFFF5F5F5);
  static const fg = Color(0xFFBDBDBD);
  static const borderColor = Color(0xFFE0E0E0);
}

// ボタン定義
class HomeBtnDef {
  final String label;
  final IconData icon;
  final List<String>? optionKeys;  // null=常にアクティブ
  final Widget? destination;       // null の場合は isStoreManagementDialog=true
  final bool isStoreManagementDialog;  // 営業管理のみ true
}
```

---

## 2. lib/Home/terminalHomePage.dart（変更）

### 削除箇所

| 行 | 内容 |
|----|-----|
| L1 | `import 'home_design_demo_page.dart'` （デモ用、実装後削除） |
| L1027 | `final buttonHeight = (screenHeight - kToolbarHeight - 80) / 2.3;` |
| L1031–1111 | `final List<({...})> buttons = [...]` ボタンリスト |
| L1113–1122 | `final visibleButtons = buttons.where(...).toList();` フィルター |
| L1124–1131 | `showStoreManagementButton` / `isStoreManagement` / `recheckMinutes` ← isStoreManagement と recheckMinutes は維持、showStoreManagementButton のみ削除 |
| L1158–1193 | `GridView.custom(...)` |
| AppBar actions | palette アイコンのデモボタン |

### 追加箇所

**追加: import**
```dart
import 'package:amuse_app_template/theme/home_button_theme.dart';
```

**追加: レイアウト定数（_terminalHomePageState クラス内）**
```dart
static const _hPad = 14.0;
static const _vPad = 10.0;
static const _btnGap = 10.0;
static const _catDividerGap = 22.0;
static const _rowGap = 16.0;
static const _headerH = 18.0;
static const _headerGap = 6.0;
static const _numSlots = 6;
```

**追加: カテゴリ×ボタン定義メソッド**
```dart
// Terminal のカテゴリ定義（buildの外で定義し、必要時に context から callback を組み立てる）
List<(HomeCategoryTheme, List<HomeBtnDef>)> _buildCatDefs(BuildContext context);
```

定義するボタン（全16ボタン + 営業管理）:
- 営業カテゴリ: 営業管理(storeManagement,dialog), 勤怠打刻(staffEntryExit), メニュー追加(null)
- ユーザーカテゴリ: ユーザー作成(null), ユーザーログイン(userEntryExit), 入店中一覧(null)
- 会計カテゴリ: 会計管理(accounting), 要対応の会計(accounting), 会計後操作(accounting)
- 注文カテゴリ: 注文画面(order), 注文管理(kitchen)
- Tournamentカテゴリ: Tournament作成(tournament), Tournament Home(tournament), 卓ページ(tournament or tournamentTable), ブラインドタイマー(tournament)
- SideGameカテゴリ: サイドゲーム(sideGame)

**追加: 行ペア定義**
```dart
static const _rowPairs = <(int, int)>[(0,1), (2,3), (4,5)];
```

**追加: アクティブ判定**
```dart
bool _isBtnActive(HomeBtnDef btn) {
  if (_isAdminDevice) return true;
  if (_deviceOptions.isEmpty) return true;
  if (btn.optionKeys == null) return true;
  return btn.optionKeys!.any((k) => _deviceOptions[k] == true);
}
```

**追加: レイアウトメソッド群**
```dart
Widget _buildTerminalLayout(BuildContext context);
Widget _buildPairRow(BuildContext context, cat1, cat2, btnW, btnH);
Widget _buildCatSection(BuildContext context, cat, buttons, btnW, btnH);
Widget _buildBtn(BuildContext context, btn, theme, isActive, btnW, btnH);
```

**変更: build() の body**
```dart
// 変更前
child: GridView.custom(...)

// 変更後
child: _buildTerminalLayout(context),
```

### 変更しない箇所（明示）
- `_initDevice()` / `_deviceService` / `_isAdminDevice` / `_deviceOptions`
- `StoreStrongWarningOverlay` のラップ構造
- `_buildStoreStatusAction()` / `_showStoreManagementDialog()` / `_startCloseFlow()`
- `_wrapDateChip()` と日付表示ロジック
- AppBar（デモボタン除去のみ）

---

## 3. lib/Home/adminHomePage.dart（変更）

### 削除箇所

| 行 | 内容 |
|----|-----|
| L76 | `final buttonHeight = (screenHeight - kToolbarHeight - 80) / 2.3;` |
| L78–89 | `final List<({...})> buttons = [...]` |
| L127–149 | `GridView.custom(...)` |

### 追加箇所

**追加: import**
```dart
import 'package:amuse_app_template/theme/home_button_theme.dart';
```

**追加: レイアウト定数**
```dart
// Terminalと共通定数を参照（hPad, vPad, etc.）
static const _numSlots = 5;   // Admin は5スロット
static const _maxBtnHRatio = 1.0; // 正方形上限
```

**追加: カテゴリ定義・レイアウトメソッド**
```dart
Widget _buildAdminLayout(BuildContext context);
// + _buildPairRow, _buildCatSection, _buildBtn（Terminal と同じシグネチャ）
```

定義するボタン（全9ボタン）:
- シフト管理カテゴリ: シフト, 営業日
- 勤怠カテゴリ: 全スタッフ勤怠, 勤怠修正申請
- スタッフ管理カテゴリ: スタッフ一覧, 給与計算
- 設定・分析カテゴリ: デバイス管理, 詳細設定, 売上ダッシュボード

**行ペア定義:**
```dart
static const _rowPairs = <(int, int)>[(0,1), (2,3)];
```

**修正: 通知ベルの icon color**
```dart
// 変更前
child: Icon(Icons.notifications_outlined, color: Colors.white)
// 変更後
child: Icon(Icons.notifications_outlined)  // AppBarのiconThemeに従う
```

### 変更しない箇所
- `_isTerminalMode` トグル
- `AnimatedSwitcher` で terminalHomePage を表示する構造
- `_buildNotificationBell()` の StreamBuilder・バッジロジック
- AppBar（タイトル、モード切替ボタン）

---

## 4. lib/debug/home_design_demo_page.dart（変更）

実装完了・人間確認後に以下を削除:
- `lib/Home/terminalHomePage.dart` の `import 'home_design_demo_page.dart'`
- `lib/Home/terminalHomePage.dart` の AppBar palette アイコンボタン
- `lib/debug/home_design_demo_page.dart` ファイル本体（削除）

※ 実装中はデモページを残す（比較参照用）

---

## ボタン高さ計算式（実装参照用）

### Terminal（6スロット, 3行ペア）
```
btnW = (availW - 28 - 4×10 - 22) / 6
     = (availW - 82) / 6

btnH = (availH - 10×2 - 3×(18+6) - 2×16) / 3
     = (availH - 124) / 3
     .clamp(48.0, double.infinity)
```

### Admin（5スロット, 2行ペア, 正方形上限）
```
btnW = (availW - 28 - 3×10 - 22) / 5
     = (availW - 80) / 5

rawBtnH = (availH - 10×2 - 2×(18+6) - 1×16) / 2
        = (availH - 84) / 2

btnH = min(rawBtnH, btnW)  ← 正方形上限
extraVPad = max(0, (availH - contentH) / 2)  ← 余剰スペースを上下に均等配分
```
