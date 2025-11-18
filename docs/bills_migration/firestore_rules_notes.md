# Firestore ルールメモ（ドラフト）

_最終更新: 2025-11-10 (JST)_

## bills
- 親ドキュメントの書き込みは Functions のみ許可。`updatedAt`, `amounts.*`, `categoryBreakdown`, `paymentTotals`, `itemsSnapshot`, `sideGameChipsSummary`, `tournamentsSnapshot`, `postEvents.*`, `paymentsSummary.*`, `meta.*`, `ops.accounting*`, `businessDate`, `closedAt` はクライアントからの更新を拒否。
- クライアントが更新可能なフィールド: `status`（許可遷移のみ）、`place.*`、`ops` の軽量なフラグ等（必要に応じて白名单化）。
- `businessDate` は Functions が `calcBusinessDate` で確定し、クライアント値と不一致の場合は書き込み拒否 (`failed-precondition` を検討)。
- `events` サブコレクションは Functions のみ書込み。ドキュメントIDは idempotencyKey を使用。
- `payments`、`items`、`extras`、`sideGameChips`、`tournaments` サブコレは `status != "settled"` のときのみ書込み可（Functions経由）。

## activeStays
- 作成・更新・削除は Functions のみ許可。クライアントは読み取り専用。
- クライアントは `isActive == true` のドキュメントを `where('isActive', '==', true)` でフィルタして読み取る。
- TTL は使用しない。クリーンアップは Settlement 即時削除＋閉店時 callable により担保。
- **最小スキーマ**: `table`, `seat`, `updatedAt` は保持しない。座席情報は `bills.place.*` に保持。

## idempotency サブコレ
- Functions のみ作成。`expiresAt` による TTL を有効化。
- クライアントからの読み取りは不要であれば拒否（監査用に Functions のみ閲覧）。

## legacy collections
- Phase2 で `todaysBills` など旧コレクションの write を拒否し、最終的に read も拒否。
