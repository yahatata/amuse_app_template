# A-2 詳細: LIFFトーナメント参加導線

## ステータス

**完了（実装・実機確認済 2026-06）** — クローズ。

---

## 何のための作業か

LINE ミニアプリ（`public/user/`）で、ユーザーがトーナメント情報を見やすく閲覧し、必要なら本日トーナメントに参加登録できるようにする。  
店舗端末の運営操作（着席・アドオン等）は対象外。

---

## 変わったこと（要点）

| 観点 | 変更前 | 変更後 |
|------|--------|--------|
| 画面構成 | 本日 / 今後 / カレンダーが別ページ | 1 ページのタブ切替 |
| 未入店ユーザー | トーナメントボタン非表示 | **閲覧可**（登録は不可） |
| 一覧カード | 情報過多（定員・プライズ等） | 必要最小限 + 詳細展開 |
| 参加登録 | 確認なしで即実行 | 確認ダイアログ + 不可理由表示 |
| 参加可否 | 判定が不十分 | ended / 参加済 / paused / 締切 / 未入店を整理 |
| 店舗設定 | なし | 参加登録 ON/OFF・カレンダー ON/OFF（読み取りのみ） |
| CF 一覧 API | `freeze` 由来の疑似 status 等 | 実 `status`・参加済フラグ・ブラインド時間を返却 |

---

## 実装したもの

### ミニアプリ（FE）

- タブ UI（本日 / 今後 / カレンダー）
- 共通カード描画・詳細展開
- 参加登録ボタン（本日タブのみ）
- 参加不可時のグレーアウト + 理由 alert
- 参加確認ダイアログ

### Cloud Functions

- `getTodayTournaments` / `getUpcomingTournaments` 拡張
- `registerForTournament` ガード追加（設定 OFF・paused・ended・締切・本日以外・未入店等）
- 共有ヘルパー: `mapScheduledTournamentForLiff` / `formatBlindLevelDurationText`

### 店舗設定

- `storeMeta/config.tournament.liffRegistrationEnabled`
- `storeMeta/config.tournament.liffCalendarEnabled`  
  （fallback `true`、編集 UI は未追加）

---

## やっていないこと

- ミニアプリからの予約
- 置きバケ / リエントリー / アドオン / バースト / 着席など運営操作
- `freeze` / `frozen` の LIFF 向け表示・参加判定（[詳細_freeze状態の業務定義と実装.md](./詳細_freeze状態の業務定義と実装.md) で非採用）

---

## 確認状況

- Functions テスト追加済
- 実機確認済（未入店閲覧、参加ブロック理由、タブ表示、登録成功/失敗 等）  
  参照: `docs/実機テスト改善/実機テスト改善項目/実機テスト改善項目_運用フロー別.md`（入店後ユーザー管理・LINE）

---

## 参照

| 種別 | パス |
|------|------|
| 仕様 | [01_仕様整理.md](../../../残タスク整理/05_LIFFトーナメント参加導線/01_仕様整理.md) |
| 実装仕様 | [02_changeSpec.md](../../../残タスク整理/05_LIFFトーナメント参加導線/02_changeSpec.md) |
| FE | `public/user/index.html` |
| CF | `getTodayTournaments.ts` / `getUpcomingTournaments.ts` / `registerForTournament.ts` |
| 共有 | `functions/src/shared/tournament/mapScheduledTournamentForLiff.ts` |
