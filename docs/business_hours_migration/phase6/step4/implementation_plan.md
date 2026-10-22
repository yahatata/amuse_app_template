# Phase6 Step4 (Phase9): storeMeta監視ページでの自動開閉店時の挙動・表示の実装

## 重要: 実装開始前の確認

**本ステップを開始する前に、必ず以下の検討事項の方針を固めてください**:
- 警告UIの表示タイミング（`closeAssessment.result === 'needs_manual_close'`の検知タイミング、`manualOverride`の有効期限の確認方法）
- モーダルダイアログの内容（ダイアログの文言、ボタンの配置と動作、バックボタンでの閉じる動作の制御）
- 情報表示の内容（各状態に応じた情報表示の内容、表示場所、表示の優先順位）
- エラー状態の扱い（`status === 'error'`時の表示内容、復旧操作の促し方）

**changeSpecの作成や実装の前に、これらの検討事項の方針を固めてからスタートしてください。**

## 概要

`storeMeta/currentBusinessDay`を監視するページで、自動開店・自動閉店処理の時に書き換えられるフィールドがどのような値であれば、どのような挙動で、どのような表示を行うかを実装します。`lib/utils`に共通実装を作成します。

## 実装内容

### 1. 自動開閉店時の挙動・表示の定義

**実装内容**:
- `storeMeta/currentBusinessDay`の各フィールドの値に応じた挙動・表示を定義
- 自動開店・自動閉店処理で書き換えられるフィールドを監視
- 各状態に応じたUI表示を実装

**監視対象フィールド**:
- `status`: 営業状態（`'closed'` | `'running'` | `'error'`）
- `closeAssessment`: 閉店認定結果
- `openAssessment`: 開店認定結果
- `manualOverride`: 手動スキップ/営業継続の記録
- `lastError`: 直近のエラー要約

### 2. 各状態に応じた挙動・表示

#### 2.1 閉店認定結果（`closeAssessment`）に応じた挙動

**`closeAssessment.result === 'needs_manual_close'`の場合**:
- 警告UIを表示（画面操作の実質ブロック）
- モーダルダイアログを表示
- 「閉店処理へ」ボタンと「営業継続」ボタンを表示

**`closeAssessment.result === 'needs_manual_close_suppressed'`の場合**:
- 警告UIは表示しない（`manualOverride`により抑制されている）
- 通常の画面操作を継続

**`closeAssessment.result === 'already_closed'`の場合**:
- 通常の画面操作を継続
- 必要に応じて情報表示

**`closeAssessment.result === 'next_day_started'`の場合**:
- 通常の画面操作を継続
- 必要に応じて情報表示

**`closeAssessment.result === 'skipped'`の場合**:
- 通常の画面操作を継続

#### 2.2 開店認定結果（`openAssessment`）に応じた挙動

**`openAssessment.result === 'ready_to_open'`の場合**:
- 必要に応じて情報表示
- 自動開店が有効な場合は開店処理を実行（設定による）

**`openAssessment.result === 'needs_manual_open'`の場合**:
- 必要に応じて情報表示
- 手動開店が必要であることを示す

**`openAssessment.result === 'already_running'`の場合**:
- 通常の画面操作を継続

**`openAssessment.result === 'skipped'`の場合**:
- 通常の画面操作を継続

#### 2.3 エラー状態（`lastError`）に応じた挙動

**`status === 'error'`かつ`lastError !== null`の場合**:
- エラー情報を表示
- 必要に応じて復旧操作を促す

### 3. 共通実装の作成

**ファイル**: `lib/utils/store_status_monitor.dart`（新規作成）

**実装内容**:
- `storeMeta/currentBusinessDay`を監視する共通実装
- 各状態に応じた挙動・表示を実装
- 警告UI、モーダルダイアログ、情報表示などを含む

**実装ポイント**:
- `StreamBuilder`を使用して`storeMeta/currentBusinessDay`を購読
- 各フィールドの値に応じた条件分岐
- 警告UIの表示/非表示の制御
- モーダルダイアログの表示制御

### 4. 対象ページへの埋め込み

以下のページに、作成した共通実装を埋め込みます：

1. **`lib/Home/terminalHomePage.dart`**（`terminalHomePage`）
2. **`lib/tournament/active/pages/tournament_home_page.dart`**（`TournamentHomePage`）
3. **`lib/tournament/active/pages/table_detail_page.dart`**（`TableDetailPage`）
4. **`lib/OrderView/OrderManagement/order_management_page.dart`**（`OrderManagementPage`）
5. **`lib/sideGame/pages/side_game_table_list.dart`**（`SideGameTableListPage`）

**実装方法**:
- 各ページの`build`メソッド内で、共通実装を配置
- `Stack`や`Overlay`を使用して、警告UIやモーダルダイアログを表示

## 検討事項（実装前に方針を固める必要がある項目）

### 1. 警告UIの表示タイミング
- `closeAssessment.result === 'needs_manual_close'`の検知タイミング
- `manualOverride`の有効期限の確認方法
- 警告UIの表示/非表示の切り替えタイミング

### 2. モーダルダイアログの内容
- ダイアログの文言（デバイス権限別）
- ボタンの配置と動作
- バックボタンでの閉じる動作の制御

### 3. 情報表示の内容
- 各状態に応じた情報表示の内容
- 表示場所（AppBar、画面内、スナックバーなど）
- 表示の優先順位

### 4. エラー状態の扱い
- `status === 'error'`時の表示内容
- 復旧操作の促し方
- エラー情報の詳細表示方法

## 作成・更新するファイル

### 新規作成（検討後）
1. `lib/utils/store_status_monitor.dart`（共通実装）

### 更新（検討後）
1. `lib/Home/terminalHomePage.dart`
2. `lib/tournament/active/pages/tournament_home_page.dart`
3. `lib/tournament/active/pages/table_detail_page.dart`
4. `lib/OrderView/OrderManagement/order_management_page.dart`
5. `lib/sideGame/pages/side_game_table_list.dart`

## 注意事項

- ステップ1で作成した`store_status_widget.dart`とは別の実装（監視と表示を分離）
- 警告UIは画面操作を実質ブロックするため、慎重に実装
- デバイス権限に応じた表示内容の切り替えが必要

## 参照資料

- [自動開閉店（補助）機能 仕様書](../automatic_store_assessment_spec.md) - UI強警告の詳細仕様
- [Step3: state docと自動開閉店の設計](../step3_state_doc_and_scheduling.md) - state docの設計
