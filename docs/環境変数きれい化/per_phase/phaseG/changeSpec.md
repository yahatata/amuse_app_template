# phaseG changeSpec（最終確認）

作成日: 2026-04-02  
ステータス: 完了（J-001/J-002 反映済み、J-003/J-005 はスコープ外クローズ、J-004 は削除対応でクローズ）

## 1. 目的

- phaseA〜phaseF で実施した改修が、仕様・コード・外部リソースの観点で破綻なく整合していることを最終確認する。
- 実機確認が必要な項目を最小集合へ絞り、実機前に検出可能な不整合を自動検証で最大限潰す。

## 2. 対象仕様書と対象章

- `docs/環境変数きれい化/仕様書/GitHub_Actions_ToBe_詳細仕様.md`（最終整合）
- `docs/環境変数きれい化/仕様書/リージョン移行_ToBe_詳細仕様.md`（最終整合）
- `docs/環境変数きれい化/仕様書/Secret_Manager_ToBe_詳細仕様.md`（最終整合）
- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`（最終整合）
- `docs/運用時資料/導入時設定/fireBase紐付け/*`（運用整合）

## 3. As-Is 確認（着手時）

- phaseF の step8 まで成果物が揃っている。
- phaseF のリージョン統一対応後、外部状態（Functions/Queue/Scheduler/Secrets）は `asia-northeast1` 前提に再構成済み。
- ただし phaseG 用の最終検証設計・検証結果資料・要修正事項台帳は未整備。

## 4. 新規作成するファイル

- `docs/環境変数きれい化/per_phase/phaseG/changeSpec.md`（本ファイル）
- `docs/環境変数きれい化/per_phase/phaseG/phaseG_log.md`
- `docs/環境変数きれい化/per_phase/phaseG/phaseG_自動検証結果.md`
- `docs/環境変数きれい化/per_phase/phaseG/phaseG_要修正事項一覧.md`
- `docs/環境変数きれい化/per_phase/phaseG/phaseG_実機確認依頼.md`

## 5. 実装方針（step2 以降）

- step2 では修正せず、要修正事項を `phaseG_要修正事項一覧.md` に記録する。
- step3 では「仕様書から断定可能な安全修正」のみ適用する。
- 設計・仕様判断が必要な項目は、未修正のまま `phaseG_要修正事項一覧.md` の判断待ちへ分離する。
- 実機でしか確認できない項目は `phaseG_実機確認依頼.md` に切り出し、実施手順と期待結果を明記する。

## 6. 自動検証計画（step2）

### 6.1 ローカル静的・ビルド検証

- `cd functions && npm run build`
- `cd functions && npm run lint`
- `rg -n "us-central1" functions/src`
- `rg -n "setGlobalOptions\\(" functions/src`
- `.github/workflows/deploy-functions.yml` の必須項目確認

### 6.2 テスト検証

- `cd functions && npm test -- --runInBand`
- 可能なら Flutter 側の回帰確認
  - `flutter test`
  - `flutter analyze`（または `dart analyze`）

### 6.3 外部状態検証（GCP）

- Functions: `us-central1` 残件ゼロ / `asia-northeast1` ACTIVE
- Cloud Tasks Queue: `us-central1` 残件ゼロ / `asia-northeast1` RUNNING
- Cloud Scheduler: `us-central1` 残件ゼロ / `asia-northeast1` ENABLED
- Secret `task-endpoints`: 新リージョン実体URL一致
- 実行SAの Secret 参照権限（line-config / task-endpoints / business-secrets）

## 7. 判定ルール

- 自動検証項目のうち失敗が1つでもあれば、`phaseG_要修正事項一覧.md` へ記載し、要修正扱いとする。
- 失敗が実機依存の可能性を含む場合でも、切り分け根拠を記載する。
- step3 では「仕様書から断定可能な修正」のみ適用し、断定不能な項目は判断待ちとして残す。

## 8. 実機確認の切り分け方針

- 実機でないと確認できない項目のみ残す。
  - 開店/閉店の業務導線
  - トーナメント主要導線
  - 勤怠主要導線
  - LINE Webhook 実イベント連携
- 自動検証で担保済みの項目は実機確認対象から除外する。

## 9. リスク

- 自動検証が通っても、外部連携先の実イベントやUI操作順依存の問題は残る可能性がある。
- `firebase-functions` バージョン警告のような将来互換リスクは即時障害でなくても記録対象とする。

## 10. ロールバック方針

- step3 で適用したコード修正は、対象コミット単位で `git revert` 可能な粒度で管理する。
- 外部状態確認で重大な不整合を検出した場合は、phaseF 手順に従って設定値を戻す（実施時は別途承認）。
