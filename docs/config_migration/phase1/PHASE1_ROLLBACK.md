# Phase1 ロールバック観点

作成日: 2026-03-05  
参照: [PHASE1_FALLBACK_BEHAVIOR.md](./PHASE1_FALLBACK_BEHAVIOR.md), [PHASE1_UPDATE_PATH_DESIGN.md](./PHASE1_UPDATE_PATH_DESIGN.md)

---

## 1. 旧 env/定数への fallback 方針

### 1.1 採用方針

**旧パターンは移行完了と同時に削除する。fallback の維持は行わない。**

- 対象アプリは未リリース（開発中）のため
- 参照先を storeMeta/config に差し替えつつ、改修が完了した箇所から旧 env/定数を削除
- 移行期間中に「storeMeta/config 失敗時は旧 env/定数に fallback」という実装は持たない

### 1.2 Phase2 での扱い

Phase2 で各 ID の参照を移行する際:
- 差し替え完了したら旧参照を即削除
- 旧 env/定数への fallback は実装しない

---

## 2. 問題発生時の切り戻し

### 2.1 設定単位で検討すること

**取得失敗時の挙動と切り戻しは、設定（ID）ごとに検討・実装する。**

- 全ての設定を同じように扱わない
- Phase2 で各設定の参照先を移行する際に、その設定について「エラーで取得できなかった場合の挙動」を決定し、実装する

### 2.2 Phase2 での必須作業

Phase2 の ID 単位の手順に、以下を組み込む:

1. 取得失敗時の挙動を設計する（defaults に fallback、処理失敗、など）
2. 問題発生時の切り戻し手順を ID ごとに記録する
3. 上記を実装に反映する

詳細は Phase2 の実施手順を参照すること。

---

## 3. storeMeta/config 基盤の切り戻し（Phase1 成果物）

Phase1 で整備した config 取得層そのものに問題が起きた場合:

| 問題 | 対応 |
|------|------|
| storeMeta/config が不正 | 詳細設定ページの「初期セットアップ」で再投入。または Firebase Console から手動修正 |
| Firestore 障害等で取得不可 | 障害復旧を待つ。configLoader はリトライ後に throw、Flutter は最後の成功値を維持 |
| 取得層のバグ | コード修正・デプロイ |
