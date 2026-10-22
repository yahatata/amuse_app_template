# A-1 詳細: Firestore rules の本番化

## ステータス

**対応済・デプロイ済（2026-06-25）**

---

## 実装内容

### rules

- `firestore.rules`: `tables` / `sideGame` は read のみ許可、`write: false`（CF / Admin SDK のみ）

### 卓端末・terminal 共通の SG 操作 CF 化

| Callable | 用途 |
|----------|------|
| `endSideGameSession` | SG 終了（terminal 一覧） |
| `changeSideGameTableGameName` | ゲーム名変更 |
| `registerTableToSideGame` / `unregisterTableFromSideGame` | 卓登録・解除（`role: table` 対応拡張） |

Flutter: `side_game_table_list.dart` / `side_game_table_home.dart` の直接 write を `SideGameTableMutationService` 経由に置換。

### SG 席・チップ操作（`role: table`）

| Callable | 権限 |
|----------|------|
| `registerForSideGame` | `role: table` + 自卓一致 |
| `leaveSeat` / `depositChip` / `withdrawChip` | 同上（`sideGameOperationPermission`） |

### TN 卓ページ操作（`role: table`）— 2026-06-24 追補

| Callable | 用途 |
|----------|------|
| `applyOkibakeAddon` | 着席済み置きバケ Addon |
| `bustOkibakeTemporaryEntry` | 着席済み置きバケ Bust |
| `linkOkibakeTemporaryEntryToBill` | 伝票紐付け |
| `updateOkibakeTemporaryEntryLinkedUser` | 対象ユーザー設定 |

共通: `okibakeTableDevicePermission` — `assignedTableId` が自卓と一致する場合のみ許可。

---

## 対象コレクション

- `tables`
- `sideGame`

---

## 参照コード

- `firestore.rules`
- `functions/src/table_device/lib/shared.ts`
- `functions/src/domains/sideGame/lib/sideGameOperationPermission.ts`
- `functions/src/domains/tournament_activeTournament/lib/okibakeTableDevicePermission.ts`
- `lib/sideGame/services/side_game_table_mutation_service.dart`
