/**
 * 既存の Step2-1 Markdown のみを読み、手動レビュー用の上書きを適用する。
 * （logOps からの再抽出はしない）
 */
const fs = require("fs");
const path = require("path");

const MD = path.join(
  __dirname,
  "generated",
  "重要度判定_Step2-1_主要業務高頻度_判定単位一覧.md"
);

/** key: `${service}\t${fe}\t${op}` op は空文字可 */
const OVERRIDES = {
  // --- orders: 管理・履歴・補助を絞る ---
  "orders\tcancelOrder\t": {
    p: "保留",
    h: "○",
    memo: "注文キャンセルは注文ドメインだが、日常の注文主フローより補助寄り。主要は保留、高頻度は○寄り。",
  },
  "orders\tcreateMenuItem\timageUpload": {
    p: "保留",
    h: "保留",
    memo: "メニュー作成・画像上げ。日常の注文処理そのものではなく管理寄り。",
  },
  "orders\tcreateMenuItem\tmenuCreateCatch": {
    p: "保留",
    h: "保留",
    memo: "メニュー作成。管理寄り。",
  },
  "orders\tgetUserOrderHistory\t": {
    p: "保留",
    h: "保留",
    memo: "注文履歴参照。中核の注文フローそのものではない。",
  },
  "orders\tgetMenuItems\tadminMenuDocMissing": {
    p: "保留",
    h: "○",
    memo: "メニュー取得は注文画面で繰り返し参照されうるが、主要度は保留。高頻度は○寄り。",
  },
  "orders\tgetMenuItems\tmenuFetchCatch": {
    p: "保留",
    h: "○",
    memo: "同上（メニュー取得）。",
  },
  "orders\ttoggleSoldOutForMenuItem\t": {
    p: "保留",
    h: "保留",
    memo: "売切設定。運用・管理寄りで日常注文主軸ではない。",
  },
  "orders\tupdateMenuItem\timageUpload": {
    p: "保留",
    h: "保留",
    memo: "メニュー更新・画像。管理寄り。",
  },
  "orders\tupdateMenuItem\tmenuUpdateCatch": {
    p: "保留",
    h: "保留",
    memo: "メニュー更新。管理寄り。",
  },

  // --- store: 閉店補助・整合確認は主要寄りだが高頻度定義とズレ ---
  "store\tgetCloseIntegrityData\tcloseIntegrityAggregate": {
    p: "○",
    h: "保留",
    memo: "閉店前整合確認。閉店フローに必須だが「1日1回」で高頻度例示とはズレ。高頻度は保留。",
  },
  "store\tgetUnsettledBillsForClose\tunsettledBillsQuery": {
    p: "○",
    h: "保留",
    memo: "閉店前未精算確認。同上。",
  },
  "store\tgetUnclosedTournamentsForClose\tunclosedTournamentsQuery": {
    p: "○",
    h: "保留",
    memo: "閉店前未終了トーナメント確認。同上。",
  },
  "store\tgetUnclockedStaffForClose\tunclockedStaffQuery": {
    p: "○",
    h: "保留",
    memo: "閉店前未打刻確認。同上。",
  },
  "store\tcleanupActiveStaysOnClose\tcleanupOuterCatch": {
    p: "○",
    h: "保留",
    memo: "閉店時クリーンアップ。閉店主系に近いが実行回数は日次。高頻度は保留。",
  },
  "store\tcreateInitialStateDoc\tcreateDocMainCatch": {
    p: "保留",
    h: "保留",
    memo: "初期状態ドキュメント作成。セットアップ・補助寄り。",
  },
  "store\tcreateInitialStateDoc\tscriptTopLevelCatch": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },
  "store\tcreateInitialStateDocCallable\tcreateInitialStateDoc": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },
  "store\tinitializeStoreConfigCallable\tinitStoreMetaConfig": {
    p: "保留",
    h: "保留",
    memo: "店舗設定初期化。設定・開店準備寄り。",
  },
  "store\tweeklyPlanner\t": {
    p: "保留",
    h: "保留",
    memo: "週次計画。開閉店の中核そのものではない。",
  },
  "store\tcloseAssessmentTask\t": {
    p: "保留",
    h: "保留",
    memo: "評価タスク終了。補助業務。",
  },
  "store\topenAssessmentTask\t": {
    p: "保留",
    h: "保留",
    memo: "評価タスク開始。補助業務。",
  },
  "store\tcontinueBusinessTerminal\tcloudTasksCreateTask": {
    p: "○",
    h: "保留",
    memo: "継続営業フロー。重要だが高頻度○は過大になりうる。",
  },
  "store\ttemporaryUnlockAlreadyRunningDifferentDateTerminal\tcloudTasksCreateTask": {
    p: "保留",
    h: "保留",
    memo: "端末ロック解除系。例外的操作寄り。",
  },
  "store\tresetAllSideGames\t": {
    p: "○",
    h: "保留",
    memo: "閉店等でのリセット。主要寄りだが日次回数は限定的。高頻度は保留。",
  },
  "store\tresetAllTables\t": {
    p: "○",
    h: "保留",
    memo: "同上。",
  },
  "store\tgetCurrentBusinessDateKeyOrThrow\tloadFirestoreStateDoc": {
    p: "○",
    h: "保留",
    memo: "状態参照。随時呼ばれうるが高頻度例示の主軸ではない。",
  },
  "store\tupdateUnclockedAttendanceWithAuth\tpasswordClockOutUpdate": {
    p: "○",
    h: "保留",
    memo: "閉店前勤怠補正。閉店関連だが高頻度○は過大になりうる。",
  },
  // FC: 少なくとも主要または高頻度のどちらか○ — 主要○に寄せ高頻度は保留
  "store\tapplyCloseSnapshot\tapplyBillCloseSnapshotTxn": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。閉店スナップショット。前提上は少なくとも主要○。高頻度は日次閉店に合わせ保留。",
  },
  "store\tapplyCloseSnapshot\tgetClosedBusinessDate": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。同上。",
  },
  "store\tapplyCloseSnapshot\tincrementUserUnsettledBillsCount": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。同上。",
  },
  "store\tfinalizeUnsettledBillAfterAccounting\t": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。会計後の未精算整理。前提上主要○。高頻度は保留。",
  },

  // --- tournament_schedule: テンプレ・編集・アーカイブ・一覧（進行中核ではない）---
  "tournament_schedule\tarchiveBlindTemplate\t": {
    p: "保留",
    h: "保留",
    memo: "ブラインドテンプレのアーカイブ。テンプレ管理寄りで進行中核ではない。",
  },
  "tournament_schedule\tarchiveTournamentTemplate\t": {
    p: "保留",
    h: "保留",
    memo: "テンプレのアーカイブ。同上。",
  },
  "tournament_schedule\tcreateBlindTemplate\t": {
    p: "保留",
    h: "保留",
    memo: "テンプレ作成。同上。",
  },
  "tournament_schedule\tcreateTournamentTemplate\t": {
    p: "保留",
    h: "保留",
    memo: "テンプレ作成。同上。",
  },
  "tournament_schedule\tdeleteTournamentRecurrence\t": {
    p: "保留",
    h: "保留",
    memo: "繰り返し定義の削除。スケジュール設定寄り。",
  },
  "tournament_schedule\tgetBlindTemplates\t": {
    p: "保留",
    h: "保留",
    memo: "テンプレ一覧取得。参照・設定補助。",
  },
  "tournament_schedule\tgetTournamentTemplates\t": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },
  "tournament_schedule\tgetTournamentRecurrences\t": {
    p: "保留",
    h: "保留",
    memo: "繰り返し一覧。設定参照。",
  },
  "tournament_schedule\tgetScheduledTournamentsForEdit\t": {
    p: "保留",
    h: "保留",
    memo: "編集用スケジュール取得。設定・編集寄り。",
  },
  "tournament_schedule\tgetScheduledTournaments\t": {
    p: "保留",
    h: "保留",
    memo: "スケジュール一覧。進行卓上操作とは区別して保留。",
  },
  "tournament_schedule\tcreateScheduledTournamentFromRecurrence\t": {
    p: "保留",
    h: "保留",
    memo: "繰り返しからの生成。スケジュール作成寄り。",
  },
  "tournament_schedule\tgenerateRecurringTournamentsByScheduler\t": {
    p: "保留",
    h: "保留",
    memo: "バッチ生成。定常レジ操作の高頻度主軸ではない。",
  },
  "tournament_schedule\tupdateBlindTemplate\t": {
    p: "保留",
    h: "保留",
    memo: "テンプレ更新。管理寄り。",
  },
  "tournament_schedule\tupdateTournamentTemplate\t": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },
  "tournament_schedule\tupdateTournamentRecurrence\t": {
    p: "保留",
    h: "保留",
    memo: "繰り返し更新。設定寄り。",
  },
  "tournament_schedule\tcontrolHookHttp\texecuteLegacyPayloadTask": {
    p: "保留",
    h: "保留",
    memo: "制御フック内部。進行中核の客前操作ではない。",
  },
  "tournament_schedule\tcontrolHookHttp\texecuteNewPayloadTask": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },
  "tournament_schedule\tcontrolHookHttp\tvalidateControlHookRequest": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },

  // スケジュール作成・enqueue は店舗運営上重要だが「高頻度」を付けすぎない
  "tournament_schedule\tcreateScheduledTournament\tcreateScheduledTournamentCatch": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。予約トーナメント作成。前提上主要○。高頻度は設定寄りで保留。",
  },
  "tournament_schedule\tcreateScheduledTournament\tcreateScheduledTournamentGenericCatch": {
    p: "○",
    h: "保留",
    memo: "予約トーナメント作成。主要○寄り。高頻度は保留。",
  },
  "tournament_schedule\tcreateScheduledTournament\tenqueueAfterCreate": {
    p: "○",
    h: "保留",
    memo: "作成後 enqueue。オペ寄りだが高頻度例示とは限らない。",
  },
  "tournament_schedule\tcreateTournamentRecurrence\tcreateTournamentRecurrenceCatch": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。繰り返し定義。前提上主要○。高頻度は保留。",
  },
  "tournament_schedule\tcreateTournamentRecurrence\tcreateTournamentRecurrenceGenericCatch": {
    p: "○",
    h: "保留",
    memo: "繰り返し定義。主要○寄り。高頻度は保留。",
  },
  "tournament_schedule\tcreateTournamentRecurrence\tcreateTournamentRecurrenceInnerHelper": {
    p: "○",
    h: "保留",
    memo: "内部ヘルパ。主要○寄り。高頻度は保留。",
  },
  "tournament_schedule\tcreateTournamentRecurrence\tenqueueAfterCreate": {
    p: "○",
    h: "保留",
    memo: "enqueue 補助。高頻度は保留。",
  },
  "tournament_schedule\tenqueueTournamentTasks\tenqueueBatchPartialErrors": {
    p: "○",
    h: "保留",
    memo: "タスク enqueue。基盤寄り。高頻度は保留。",
  },
  "tournament_schedule\tenqueueTournamentTasks\tenqueueTournamentTasksCatch": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。enqueue。前提上主要○。高頻度は保留。",
  },
  "tournament_schedule\tenqueueTournamentTasks\tenqueueTournamentTasksGenericCatch": {
    p: "○",
    h: "保留",
    memo: "enqueue。主要○寄り。高頻度は保留。",
  },
  "tournament_schedule\tenqueueTournamentTasksByScheduler\tcloudTasksCreateTask": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。スケジューラ経由 enqueue。前提上主要○。高頻度は保留。",
  },
  ["tournament_schedule\tenqueueTournamentTasksByScheduler\t" + "runEnqueueSchedulerTask"]: {
    p: "○",
    h: "保留",
    memo: "スケジューラ経由。主要○寄り。高頻度は保留。",
  },
  ["tournament_schedule\t" + "runEnqueueTournamentTasks\t" + "enqueueTournamentTask"]: {
    p: "○",
    h: "保留",
    memo: "enqueue 実行。主要○寄り。高頻度は保留。",
  },
  ["tournament_schedule\t" + "runEnqueueTournamentTasks\t" + "processTournamentBatchItem"]: {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。バッチ項目。前提上主要○。高頻度は保留。",
  },
  ["tournament_schedule\t" + "runGenerateRecurringTournaments\t" + "enqueueAfterGenerate"]: {
    p: "保留",
    h: "保留",
    memo: "定期生成後 enqueue。バッチ寄り。",
  },
  ["tournament_schedule\t" + "runGenerateRecurringTournaments\t" + "runGenerateRecurringTournamentsOuterCatch"]: {
    p: "保留",
    h: "保留",
    memo: "定期生成外枠。バッチ寄り。",
  },
  ["tournament_schedule\t" + "runGenerateRecurringTournaments\t" + "parseRecurrenceInterval"]: {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。解析。前提上主要○。高頻度は保留。",
  },
  ["tournament_schedule\t" + "runGenerateRecurringTournaments\t" + "parseRecurrenceIntervalWrongType"]: {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。同上。",
  },
  ["tournament_schedule\t" + "runGenerateRecurringTournaments\t" + "validateRecurringStoreTenant"]: {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。検証。同上。",
  },
  "tournament_schedule\tupdateScheduledTournamentStartAt\tvalidateStartAtUpdatePreconditions": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。開始時刻更新の前提。前提上主要○。高頻度は保留。",
  },
  "tournament_schedule\tupdateScheduledTournamentStatus\tvalidateStatusTransition": {
    p: "○",
    h: "保留",
    memo: "function_custom 確定（静的）。状態遷移検証。同上。",
  },

  // --- scheduler: FC 行の ○/○ を絞る（少なくとも一方は○）---
  "scheduler\texecuteScheduledJobTask\tmarkReplanCompletedBestEffort": {
    p: "保留",
    h: "○",
    memo: "function_custom 確定（静的）。ジョブ基盤。主要は保留、高頻度はバッチ内反復で○寄り（前提上）。",
  },
  "scheduler\texecuteScheduledJobTask\treleaseReplanProcessingBestEffort": {
    p: "保留",
    h: "○",
    memo: "function_custom 確定（静的）。同上。",
  },

  // --- staff: バッチ・一覧取得の高頻度を抑制 ---
  "staff\tscheduledCleanup\t": {
    p: "保留",
    h: "保留",
    memo: "定期クリーンアップ。バッチ寄りで高頻度の客前主軸ではない。",
  },
  "staff\tgetShifts\tdetailErrorLog": {
    p: "保留",
    h: "保留",
    memo: "シフト取得のエラー経路。参照系で高頻度○は過大になりうる。",
  },
  "staff\tgetShifts\tinitCatch": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },
  "staff\tgetShifts\tshiftFetchCatch": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },
  "staff\tgetShifts\tunknownErrorLog": {
    p: "保留",
    h: "保留",
    memo: "同上。",
  },

  // --- user: QR 補助・トークン ---
  "user\tdeleteOldQRCodeFiles\t": {
    p: "保留",
    h: "保留",
    memo: "QR ファイル削除。来店補助で高頻度主軸ではない。",
  },
  "user\tsaveQRCodeToStorage\t": {
    p: "保留",
    h: "保留",
    memo: "QR 保存。同上。",
  },
  "user\tverifyLineIdToken\t": {
    p: "保留",
    h: "保留",
    memo: "LIFF 検証。補助。高頻度○は過大になりうる。",
  },

  // --- accounting: migrate ---
  "accounting\tmigrateTodaysBillsAccountingFields\t": {
    p: "保留",
    h: "保留",
    memo: "マイグレーション・補正。定常会計主軸とは区別。",
  },
};

function rowKey(service, fe, opCol) {
  return `${service}\t${fe}\t${opCol}`;
}

/**
 * 初版（buildStep21PrimaryHighFreqTable.cjs の service 既定）に相当する旧判定。
 * 補正差分ドキュメント用。例外のみ分岐。
 */
function getOldJudgment(service, fe) {
  if (fe === "migrateTodaysBillsAccountingFields") return "保留 / ×";
  if (service === "staff" && fe === "getShifts") return "保留 / ○";
  if (service === "staff" && fe === "scheduledCleanup") return "保留 / ○";
  if (fe === "deleteOldQRCodeFiles" || fe === "saveQRCodeToStorage" || fe === "verifyLineIdToken") {
    return "保留 / ○";
  }
  if (service === "scheduler" && fe === "executeScheduledJobTask") {
    return "○ / ○";
  }
  return "○ / ○";
}

/** 同一 Markdown 末尾に埋め込む「初版からの判定変更」セクション */
function buildDeltaSectionMarkdown() {
  const rows = [];
  for (const [key, ov] of Object.entries(OVERRIDES)) {
    const [service, fe, op] = key.split("\t");
    const oldJ = getOldJudgment(service, fe);
    const neu = `${ov.p} / ${ov.h}`;
    rows.push({ service, fe, op, oldJ, neu, reason: ov.memo });
  }
  rows.sort((a, b) =>
    a.service.localeCompare(b.service) || a.fe.localeCompare(b.fe) || String(a.op).localeCompare(String(b.op))
  );
  let md = `## 補正（初版からの判定変更）

一覧表は \`buildStep21PrimaryHighFreqTable.cjs\` の初版を土台に、\`patchStep21MarkdownReview.cjs\` の OVERRIDES により業務レビューした結果を反映している。

- **旧判定の意味**: 初版 \`buildStep21PrimaryHighFreqTable.cjs\` の **service 既定**（\`migrateTodaysBillsAccountingFields\`・一部 staff / user / scheduler は初版時点の例外）
- **変更行数**: ${rows.length}

### 変更行（旧 → 新）

| service | functionEntry | operation | 旧判定（主要 / 高頻度） | 新判定（主要 / 高頻度） | 修正理由 |
|---------|---------------|-----------|-------------------------|-------------------------|----------|
`;
  for (const r of rows) {
    const opEsc = r.op ? `\`${r.op}\`` : "";
    const re = r.reason.replace(/\|/g, "\\|").replace(/\n/g, " ");
    md += `| ${r.service} | \`${r.fe}\` | ${opEsc} | ${r.oldJ} | ${r.neu} | ${re} |\n`;
  }
  md += `
### 補正方針の要約

- **○/○ を絞った類型**: \`tournament_schedule\` のテンプレ・一覧・アーカイブ・バッチ生成・制御フック；\`orders\` のメニュー管理・履歴・売切；\`store\` の閉店前整合・補助・初期化・計画；静的 FC でも「両方○」を避け主要○＋高頻度保留に寄せた行；\`staff\` のシフト取得・定期 cleanup；\`user\` の QR/LIFF 補助；\`scheduler\` の FC ジョブ補助。
- **現行維持と判断した類型**: \`attendance\` の主要保留／高頻度○；\`accounting\`・\`tournament\`（卓上進行）・\`placeOrder\`／\`appendItem\` 系のコア；\`line\`・\`config\`・\`analytics\` migrate など既に ×／保留が付いている行。
- **新たに保留へ寄せた代表例**: \`getUserOrderHistory\`、\`createMenuItem\`、\`archiveTournamentTemplate\`、\`getCloseIntegrityData\`（高頻度）、\`verifyLineIdToken\`（高頻度）。
- **まだ人間判断が必要な類型**: 予約トーナメント作成・enqueue を「主要○」にした行（店舗運営で必須度が店により異なる）；閉店前チェックを「主要○」に残した行（閉店必須だが頻度定義との解釈差）；\`cancelOrder\` の主要を保留にしたことへの運用フィット。
`;
  return md;
}

function parseTableLine(line) {
  if (!line.startsWith("|")) return null;
  const parts = line.split("|").map((s) => s.trim());
  if (parts.length < 8) return null;
  const service = parts[1];
  if (service.startsWith("-") || service === "service") return null;
  const fe = parts[2].replace(/^`|`$/g, "").replace(/`/g, "");
  const opRaw = parts[3];
  const op = opRaw.replace(/^`|`$/g, "").replace(/`/g, "");
  const errNote = parts[4];
  const p = parts[5];
  const h = parts[6];
  const memo = parts.slice(7).join("|").replace(/\|$/, "");
  return { service, fe, op, errNote, p, h, memo, raw: line };
}

function main() {
  let text = fs.readFileSync(MD, "utf8");
  text = text.replace(/\n## 補正（初版からの判定変更）[\s\S]*$/, "");
  const lines = text.split("\n");
  const out = [];
  const deltas = [];

  for (const line of lines) {
    const pr = parseTableLine(line);
    if (!pr) {
      out.push(line);
      continue;
    }
    const key = rowKey(pr.service, pr.fe, pr.op);
    const ov = OVERRIDES[key];
    if (!ov) {
      out.push(line);
      continue;
    }
    const old = `${pr.p} / ${pr.h}`;
    const neu = `${ov.p} / ${ov.h}`;
    if (old === neu && pr.memo === ov.memo) {
      out.push(line);
      continue;
    }
    const newLine = `| ${pr.service} | \`${pr.fe}\` | ${pr.op ? `\`${pr.op}\`` : ""} | ${pr.errNote} | ${ov.p} | ${ov.h} | ${ov.memo} |`;
    out.push(newLine);
    deltas.push({
      service: pr.service,
      fe: pr.fe,
      op: pr.op,
      old,
      neu,
      reason: ov.memo,
    });
  }

  const newBody = out.join("\n");
  fs.writeFileSync(MD, newBody, "utf8");

  // 集計サマリを再計算して差し替え
  const tableRows = [];
  for (const line of newBody.split("\n")) {
    const pr = parseTableLine(line);
    if (pr) tableRows.push(pr);
  }
  let nPrimary = 0,
    nHigh = 0,
    nPrimaryPend = 0,
    nHighPend = 0,
    nAnyPend = 0;
  for (const r of tableRows) {
    if (r.p === "○") nPrimary++;
    if (r.h === "○") nHigh++;
    if (r.p === "保留") nPrimaryPend++;
    if (r.h === "保留") nHighPend++;
    if (r.p === "保留" || r.h === "保留") nAnyPend++;
  }
  const nUnits = tableRows.length;

  const summaryBlock = `## 集計サマリ

| 項目 | 値 |
|------|-----|
| **判定単位総数**（269 呼び出しと一致する場合、単位も 269） | **${nUnits}** |
| **主要業務 ○** | ${nPrimary} |
| **高頻度業務 ○** | ${nHigh} |
| **主要業務「保留」**（行単位） | ${nPrimaryPend} |
| **高頻度業務「保留」**（行単位） | ${nHighPend} |
| **主要または高頻度のいずれかが「保留」を含む行**（参考） | ${nAnyPend} |

※ 「主要または高頻度のいずれかが保留」は、同一行で主要・高頻度の両方が「保留」の場合、**1 行として 1 回**カウント。
`;

  let fixed = newBody.replace(/## 集計サマリ\n\n[\s\S]*?※[^\n]+\n/, summaryBlock + "\n");

  const retentionLines = [];
  for (const r of tableRows) {
    if (r.p !== "保留" && r.h !== "保留") continue;
    const op = r.op ? ` / \`${r.op}\`` : "";
    retentionLines.push(`- **\`${r.fe}\`**${op}（${r.service}）: 主要=${r.p} / 高頻度=${r.h} — ${r.memo}`);
  }
  const retentionBlock = `## 保留理由一覧（主要・高頻度のいずれかが「保留」の行）

${retentionLines.join("\n")}
`;
  fixed = fixed.replace(/## 保留理由一覧[\s\S]*$/, retentionBlock);

  fixed = fixed.trimEnd() + "\n\n" + buildDeltaSectionMarkdown() + "\n";

  fixed = fixed.replace(
    /7\. \*\*静的 function_custom 確定 52 件\*\*:.*\n/,
    "7. **静的 function_custom 確定**: 少なくとも主要または高頻度の一方を○とする前提は維持しつつ、**両方○**は避けた行がある（閉店・enqueue 等）。\n"
  );

  fs.writeFileSync(MD, fixed, "utf8");

  console.log("Updated:", MD);
  console.log("Patch deltas applied this run:", deltas.length);
}

main();
