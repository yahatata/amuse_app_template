# phaseA ステップ8: 運用時資料の必要性判定

判定日: 2026-03-31

## 1. 判定結果

- phaseAの実装範囲について、**新規の運用時資料作成は不要**と判定。
- 理由:
  - 変更内容は主に Functions 内部実装の安全化（共通ヘルパー化・定数化）であり、運用者の新規手順追加を直接要求しない。
  - 既存の導入時資料に、phaseAで必要な確認観点（`getRequiredProjectId()` 統一、固定フォールバック除去）は既に反映済み。

## 2. 確認した既存資料

- `docs/運用時資料/導入時設定/fireBase紐付け/3レイヤー整合_設計方針.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`

## 3. phaseA変更との整合確認

- `tasks.ts` / `weeklyPlanner.ts` / `continueBusinessTerminal.ts` の `projectId` 解決が `getRequiredProjectId()` へ統一されたことは、既存チェックリストの Functions 側確認項目と整合。
- `logOpsError.ts` の `projectId` 解決統一も、既存チェックリストの運用意図と整合。
- `.env.amuse-app-template` から削除したキーは、phaseAのコード固定方針に一致し、運用手順の追加を要しない。

## 4. 将来の更新トリガー（今回未実施）

以下に該当する変更が入る場合は、運用時資料更新を再判定する。

- schedulerSupervisor 実装（phaseB以降）で、運用者が触る設定項目が増える
- Secret Manager 移行（phaseD）で、導入時の secret 作成/権限手順が増える
- GitHub Actions / WIF / リージョン移行（phaseF）で、リリース手順が変わる
