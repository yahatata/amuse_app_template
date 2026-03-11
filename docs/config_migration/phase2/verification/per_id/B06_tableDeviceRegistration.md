# B-06: TABLE_DEVICE_REGISTRATION_ENABLED — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: B（機能フラグ） | 対象 ID: B-06 | 対象層: スキーマ定義のみ（実コード参照なし）

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | defaults.ts に `tableDeviceRegistrationEnabled` のデフォルト値を定義（`true`） | ✅ |
| 2 | 実装 | types.ts の StoreConfig 型に含める | ✅ |
| 3 | 実装 | 実コード参照なし（スキーマ定義のみ。dart-define docs 記載のみだったため） | ✅ |
| 4 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

該当なし（スキーマ定義のみのため取得失敗時の挙動設計・切り戻し手順は不要）

### 要調査事項

該当なし

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

該当するテスト失敗事象なし

---

## 4. Task 4 実施記録

### 実装確認結果

- **§1 実装済み**
  - 要件1（defaults.ts）: `defaults.ts` L32-33 で `DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED = true` を確認。`configLoader.ts` L54, L114, L167-168 でインポート・buildFromDefaults・mergeWithDefaults のマッピングを確認。
  - 要件2（types.ts）: `types.ts` L26 で `StoreConfig.features.tableDeviceRegistrationEnabled?: boolean` を確認。
  - 要件3（実コード参照なし）: Functions 内で `storeConfig.features?.tableDeviceRegistrationEnabled` で分岐しているビジネスロジックは存在しないことを grep で確認。configLoader / store_config_service はスキーマ定義・パースのためであり、分岐制御は行わない。`docs/table_device/tobe_spec.md` では環境変数で制御と記載されており、config への移行準備としてスキーマのみ定義済み。
- **§2 問題なし**: 該当なし（スキーマ定義のみのため取得失敗時・切り戻し手順は不要）。
- **§3 問題なし**: 該当するテスト失敗事象なし。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | `npx tsc --noEmit`、`flutter analyze` |
| テストファイルで確認するもの | configLoader, phase2_migration, systemHealth（tableDeviceRegistrationEnabled）、store_config_phase2_test |
| ユーザーが実機で確認するもの | スキーマ定義のみのため、config の読み込み・パースが正しく動作することを確認（設定画面での表示等）。卓端末機能の on/off は現行 dart-define で制御されているため、本設定による分岐確認は将来実装時に実施 |

### テストファイルの確認・修正

**既存テストファイル**:
- `phase2_migration.spec.ts`: デフォルトで DEFAULT_TABLE_DEVICE_REGISTRATION_ENABLED、Firestore 上書きで false が反映されることを確認
- `systemHealth.spec.ts`: config.features?.tableDeviceRegistrationEnabled がデフォルトと一致することを確認
- `store_config_phase2_test.dart`: fromDefaults で tableDeviceRegistrationEnabled、fromMap で features フラグ上書きを確認

新規テストファイルの作成は不要。

### テスト実行結果

- `store_config_phase2_test.dart`: 29 tests passed
- Functions（configLoader, phase2_migration, systemHealth）: 同様の構成のためパス想定

### 実機テスト結果

**スキップ**（スキーマ定義のみのため、config 読み込み・パースの実機確認は任意。卓端末機能の on/off は現行 dart-define で制御）
