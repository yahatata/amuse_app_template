# A-1 詳細: Firestore rules の本番化

## 残っている理由

CF 側（callable 内）での権限制御は実装済みだが、Firestore rules レベルでの write 制限が未実装のまま。
現在は開発用の全許可ルールが適用されており、本番環境に出す前に制限が必要。

---

## 対象コレクション

- `tables` — テーブルデバイスからの write が発生する
- `sideGame` — サイドゲーム登録時に write が発生する

---

## 実装済みコードの補足

CF 側では以下の関数で呼び出し元の権限チェックを行っている：

- `requireTableDeviceCaller`（`functions/src/shared/auth/requireTableDeviceCaller.ts`）

この関数により、CF 経由のアクセスは `role: table` の端末に限定されている。
Firestore rules は CF を経由しないクライアントからの直接 write を防ぐための追加の安全層として実装する。

---

## 参照コード

- `firestore.rules` — 現在のルール（該当コレクションのルールを確認）
- `functions/src/shared/auth/requireTableDeviceCaller.ts` — CF 側権限チェック実装
- `docs/残タスク整理/03_テーブルデバイス/` — 仕様（権限モデル含む）
