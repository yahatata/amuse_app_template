# Scheduler・Task監視

## 1. 目的

中央管理アプリの

- `Scheduler 監視`
- `Task 監視`

を使って、店舗の定期実行が正常に流れているかを確認するための運用手順をまとめる。

---

## 2. 前提

この監視は、次が揃って初めて成立する。

1. 中央 `stores/{storeId}` に店舗が登録されている
2. 店舗が `enabled=true` である
3. `設定 > 店舗 Config 同期` で 6 config が中央へ同期済みである
4. 店舗側から中央 `schedulerLogs` / `schedulerTaskDispatchLogs` / `taskLogs` が投入されている

特に `schedulerConfig` 未同期だと、`Scheduler 監視` で区分 C が正しく出ない。

---

## 3. どこで確認するか

| 画面 | 何を見るか |
|------|------------|
| `設定 > 店舗 Config 同期` | 6 config 同期状態 |
| `店舗詳細 > Scheduler 監視` | 当日 supervisor の dispatch 状況、active anomaly |
| `店舗詳細 > Task 監視 > 定期実行系` | top-level / child / 単独起点 queue の実行状況 |
| `店舗詳細 > Task 監視 > 都度実行系` | scheduler 起点でない task log の補助確認 |

---

## 4. データ正本

| 用途 | パス |
|------|------|
| 中央同期 config | `stores/{storeId}/config/{configKey}` |
| top-level dispatch / execution | `schedulerLogs/{storeId}/runs/{logId}` |
| child dispatch | `schedulerTaskDispatchLogs/{storeId}/runs/{logId}` |
| task 実行 | `taskLogs/{storeId}/runs/{logId}` |
| scheduler 異常 | `schedulerAnomalies/{docId}` |

---

## 5. 日常運用

### 5.1 毎日の最小確認

目安時刻:

- `03:00 JST` 前後: `schedulerSupervisor`
- `04:05 JST` 以降: `supervisor_missing` の有無を見やすい
- `05:30 JST` 以降: top-level と child 実行の状況が揃いやすい

毎日の最小確認は次でよい。

1. `店舗詳細 > Scheduler 監視` を開く
2. `未対応の定期処理異常` が出ていないか見る
3. 当日 `planningDate` の 6 job サマリを見る
4. 必要なら `Task 監視 > 定期実行系` で child / queue 実行を見る

### 5.2 `Scheduler 監視` で正常とみなす読み方

| 表示 | 正常の基本 |
|------|------------|
| 新規作成 | 期待どおり task が作られた |
| 重複 skip | 既存 task があり正常に再作成されなかった |
| その他 skip | 原則 0 が望ましい。出たら内容確認 |
| エラー | 0 が望ましい |

展開 slot の意味:

| 区分 | 意味 |
|------|------|
| A | 今回作成した task |
| B | 重複のため作成しなかった task |
| C | horizon 内だが今回の作成対象外 |

### 5.3 `Task 監視 > 定期実行系` で見るもの

3 セクションで確認する。

1. タスク生成用キュー（`scheduled-job-*`）
2. 業務実行キュー（scheduler 起点）
3. 業務実行キュー（単独起点）

見るポイント:

- `実行予定`
- `実行済`
- `未実行`
- `エラー`

`未実行` や `エラー` があれば、その queue の詳細を開いて判断する。

### 5.4 `Task 監視 > 都度実行系`

これは補助線であり、毎日の必須確認ではない。

用途:

- scheduler 起点でない task の調査
- `errorLogs` だけでは原因が追いにくいときの補助

---

## 6. 設定変更時の運用

店舗側 `storeMeta/schedulerConfig` を変えたら、中央でも再同期する。

手順:

1. 店舗側 Firestore `storeMeta/schedulerConfig` を更新する
2. 中央 `設定 > 店舗 Config 同期` で再同期する
3. `Scheduler 監視` で区分 C や queue 説明が違和感なく読めるか確認する

同期しないと、中央の読み方だけが古くなる。

---

## 7. 異常時の見方

| 事象 | まず見る場所 | 次に見る場所 |
|------|--------------|--------------|
| `未対応の定期処理異常` が出た | `Scheduler 監視` の anomaly バナー | `エラー一覧`、必要なら店舗側 Cloud Logging |
| Config 未同期バナー | `設定 > 店舗 Config 同期` | 店舗側 IAM |
| 6 job が出ない | `stores/{storeId}` の `enabled`、同期 config | 中央 `schedulerLogs` |
| child 実行が出ない | `Task 監視 > 定期実行系` | `taskLogs`、店舗側 Cloud Logging |

---

## 8. 関連資料

- [エラー監視.md](./エラー監視.md)
- [../設定/storeMeta/中央管理アプリ連携.md](../設定/storeMeta/中央管理アプリ連携.md)
- [../導入時設定/fireBase紐付け/中央管理アプリ連携手順.md](../導入時設定/fireBase紐付け/中央管理アプリ連携手順.md)
