/**
 * Step 2-1: 主要業務 / 高頻度業務 判定単位一覧（269 件スコープ）の Markdown 生成。
 * 前提: extractLogOpsJudgmentUnits.cjs と同じ除外。
 */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "src");
const EXCLUDE_DIRS = new Set(["node_modules"]);

const STATIC_FC_LINES = new Set([
  "src/domains/bills/callables/accounting.ts:515",
  "src/domains/bills/callables/accounting.ts:670",
  "src/domains/bills/callables/cancelAccounting.ts:116",
  "src/domains/bills/callables/updateActiveBill.ts:335",
  "src/domains/bills/repos/createBillWithActiveStay.ts:248",
  "src/domains/bills/repos/startAccounting.ts:238",
  "src/domains/itemOrder/callables/placeOrder.ts:190",
  "src/domains/itemOrder/callables/placeOrderByUser.ts:181",
  "src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts:129",
  "src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest.ts:146",
  "src/domains/scheduler/replan/enqueueTournamentTasksReplanTask.ts:132",
  "src/domains/storeMeta/callables/closeStoreTerminal.ts:149",
  "src/domains/storeMeta/callables/closeStoreTerminal.ts:171",
  "src/domains/storeMeta/callables/closeStoreTerminal.ts:428",
  "src/domains/storeMeta/callables/closeStoreTerminal.ts:502",
  "src/domains/storeMeta/callables/closeStoreTerminal.ts:551",
  "src/domains/storeMeta/callables/continueBusinessTerminal.ts:330",
  "src/domains/storeMeta/callables/openStoreTerminal.ts:50",
  "src/domains/storeMeta/callables/openStoreTerminal.ts:82",
  "src/domains/storeMeta/callables/openStoreTerminal.ts:221",
  "src/domains/storeMeta/services/applyCloseSnapshot.ts:136",
  "src/domains/storeMeta/services/applyCloseSnapshot.ts:168",
  "src/domains/storeMeta/services/applyCloseSnapshot.ts:217",
  "src/domains/storeMeta/services/cleanupActiveStaysOnClose.ts:56",
  "src/domains/storeMeta/services/finalizeUnsettledBillAfterAccounting.ts:70",
  "src/domains/tournament_activeTournament/callables/addTableToTournament.ts:135",
  "src/domains/tournament_activeTournament/callables/api.pause.ts:118",
  "src/domains/tournament_activeTournament/callables/api.resume.ts:127",
  "src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts:248",
  "src/domains/tournament_activeTournament/callables/createTemporaryTable.ts:121",
  "src/domains/tournament_activeTournament/callables/getRankingData.ts:78",
  "src/domains/tournament_activeTournament/callables/removeTableFromTournament.ts:110",
  "src/domains/tournament_activeTournament/callables/reseatAllPlayers.ts:284",
  "src/domains/tournament_createTournament/callables/createScheduledTournament.ts:404",
  "src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts:147",
  "src/domains/tournament_createTournament/callables/enqueueTournamentTasks.ts:41",
  "src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts:145",
  "src/domains/tournament_createTournament/callables/updateScheduledTournamentStatus.ts:142",
  "src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts:383",
  "src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:98",
  "src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:136",
  "src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts:151",
  "src/domains/user/callables/generateQRCode.ts:142",
  "src/domains/user/callables/generateQRCode.ts:161",
  "src/domains/user/callables/getFirebaseCustomToken.ts:71",
  "src/domains/user/callables/getUserStatus.ts:58",
  "src/domains/user/callables/manualCheckIn.ts:168",
  "src/domains/user/callables/processVisitByQR.ts:218",
  "src/domains/user/callables/verifyQRCode.ts:75",
]);

function walkTsFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      walkTsFiles(full, list);
    } else if (ent.isFile() && ent.name.endsWith(".ts")) {
      list.push(full);
    }
  }
  return list;
}

function getPropName(pn) {
  if (ts.isIdentifier(pn)) return pn.text;
  if (ts.isStringLiteral(pn)) return pn.text;
  return "";
}

function operationKeyFromInitializer(init) {
  if (!init) return "";
  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text;
  const sf = init.getSourceFile();
  return sf.text.slice(init.getStart(sf), init.getEnd()).replace(/\s+/g, " ").trim().slice(0, 100);
}

function extractProps(arg) {
  if (!ts.isObjectLiteralExpression(arg)) return null;
  let functionEntry = null;
  let operationInit = null;
  let hasOperationProperty = false;
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = getPropName(prop.name);
    if (key === "functionEntry") {
      const v = prop.initializer;
      if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) functionEntry = v.text;
    }
    if (key === "operation") {
      hasOperationProperty = true;
      operationInit = prop.initializer;
    }
  }
  const operationKey = hasOperationProperty ? operationKeyFromInitializer(operationInit) : "";
  return { functionEntry, hasOperationProperty, operationKey };
}

function collect(sf, rel) {
  const out = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === "logOpsError") {
        const first = node.arguments[0];
        const props = extractProps(first);
        if (!props || !props.functionEntry) return;
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        out.push({
          file: rel,
          line: pos.line + 1,
          functionEntry: props.functionEntry,
          operationKey: props.operationKey,
          hasOperationProperty: props.hasOperationProperty,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}

/** serviceByFunctionEntry を require せずに読み取る簡易パース */
function loadServiceMap() {
  const p = path.join(__dirname, "..", "src", "shared", "logging", "serviceByFunctionEntry.ts");
  const text = fs.readFileSync(p, "utf8");
  const map = {};
  const re = /^\s*"([^"]+)":\s*"([^"]+)"/gm;
  let m;
  while ((m = re.exec(text))) {
    map[m[1]] = m[2];
  }
  return map;
}

function classify(fe, opDisplay, service, hasFcLine) {
  const memoFc = hasFcLine ? "function_custom 確定（静的）。`resolveErrorSource` 実行時は function_custom。" : "";

  /** 要件 §6.6 の「少なくとも」に近い軸で機械ルール + 保留 */
  const rules = {
    accounting: { p: "○", h: "○", m: "会計・伝票・請求の主系。要件の高頻度「会計関連操作」に該当しうる。" },
    user: { p: "○", h: "○", m: "来店・ユーザー。要件の主要・高頻度の「来店処理」に該当しうる。" },
    store: { p: "○", h: "○", m: "開閉店・店舗状態。要件の主要「開店・閉店」に該当しうる。" },
    tournament: { p: "○", h: "○", m: "卓上トーナメント運用。要件の主要・高頻度のトーナメント操作に該当しうる。" },
    tournament_schedule: { p: "○", h: "○", m: "トーナメント作成・スケジュール・enqueue。主要・高頻度のトーナメント系に該当しうる。" },
    orders: { p: "○", h: "○", m: "注文・メニュー。要件の高頻度「注文処理」に該当しうる。" },
    attendance: { p: "保留", h: "○", m: "勤怠。要件の高頻度「勤怠打刻」に該当しうる。主要は店舗中核との距離で保留。" },
    payroll: { p: "保留", h: "保留", m: "給与・締め。主要リストの直訳ではないが店舗運営に影響。頻度は店舗方針次第で保留。" },
    staff: { p: "保留", h: "○", m: "シフト・スタッフ。日常的な操作が多い想定で高頻度は○。主要は保留。" },
    shift: { p: "保留", h: "保留", m: "シフト計画・締め。主要リスト外だが業務影響あり。保留。" },
    scheduler: { p: "×", h: "保留", m: "ジョブ基盤・内部。主要・来店レベルではない。頻度はバッチ依存で保留。" },
    line: { p: "×", h: "保留", m: "LINE 連携。主要中核ではない。通知頻度は店舗次第で保留。" },
    config: { p: "×", h: "×", m: "設定ロード失敗。主要・高頻度の主軸ではない。" },
    device: { p: "保留", h: "保留", m: "端末登録・設定。主要リスト外。端末本数で頻度は保留。" },
    analytics: { p: "保留", h: "×", m: "集計・移管。主業務フローから外れがち。migrate は運用ツール。" },
    audit_log: { p: "保留", h: "保留", m: "操作ログ取得・巻き戻し。監査・補助。主要は保留。" },
    business_hours: { p: "保留", h: "×", m: "営業時間生成。バッチ寄り。高頻度の主軸ではない。" },
    side_game: { p: "保留", h: "保留", m: "サイドゲーム。主要中核ではない想定。卓上で頻度は保留。" },
    unknown_service: { p: "保留", h: "保留", m: "service 未登録。対応表要確認。" },
  };

  const base = rules[service] || rules.unknown_service;
  let p = base.p;
  let h = base.h;
  let m = base.m;

  if (hasFcLine) {
    p = "○";
    h = "○";
    m = memoFc + " 前提により主要・高頻度とも○（要件 Step2-1 前提）。";
  }

  /** 個別 override */
  if (fe === "migrateSettledBillsForBusinessDay" || fe === "migrateTodaysBillsAccountingFields") {
    p = "保留";
    h = "×";
    m = hasFcLine ? memoFc + " 移管・マイグレーション Callable。主業務の定常操作ではない。" : m;
  }
  if (fe === "getLineConfig" || fe.includes("Config") && (service === "config" || fe.startsWith("get"))) {
    if (!hasFcLine) {
      p = "×";
      h = "×";
      m = "設定読み込み。主要・高頻度の主軸ではない（失敗時ログ）。";
    }
  }
  if (fe === "writeSchedulerDispatchLogBestEffort" || fe === "writeSchedulerExecutionLogByCloudTaskBestEffort") {
    p = "×";
    h = "保留";
    m = "スケジューラ補助ログ。主要ではない。";
  }
  if (fe === "verifyLineIdToken") {
    p = "保留";
    h = "○";
    m = "LIFF/トークン検証。来店系の補助。高頻度は○寄り。";
  }
  if (fe === "saveQRCodeToStorage" || fe === "deleteOldQRCodeFiles") {
    p = "保留";
    h = "○";
    m = "QR ストレージ。来店系の補助処理。";
  }

  const errNote = hasFcLine
    ? "静的に function_custom 確定の呼び出し（`errorKey` 明示 or FC 分岐内）。"
    : "実行時 `resolveErrorSource`（`cause` / `errorKey` / 外部 shape）で決定。";

  return { primary: p, high: h, memo: m, errNote };
}

function main() {
  const SERVICE = loadServiceMap();
  const files = walkTsFiles(ROOT);
  const all = [];
  for (const filePath of files) {
    const rel = path.relative(path.join(__dirname, ".."), filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    all.push(...collect(sf, rel));
  }

  const unitMap = new Map();
  for (const c of all) {
    const unitKey = `${c.functionEntry}\t${c.hasOperationProperty ? c.operationKey : ""}`;
    if (!unitMap.has(unitKey)) {
      unitMap.set(unitKey, {
        functionEntry: c.functionEntry,
        operationDisplay: c.hasOperationProperty ? (c.operationKey || "(式)") : "—",
        sampleLines: [],
      });
    }
    const u = unitMap.get(unitKey);
    const key = `${c.file}:${c.line}`;
    u.sampleLines.push(key);
  }

  const units = [...unitMap.values()].sort((a, b) =>
    a.functionEntry.localeCompare(b.functionEntry) || String(a.operationDisplay).localeCompare(String(b.operationDisplay))
  );

  const rows = [];
  for (const u of units) {
    const service = SERVICE[u.functionEntry] ?? "unknown_service";
    const hasFc = u.sampleLines.some((l) => STATIC_FC_LINES.has(l));
    const opCol = u.operationDisplay === "—" ? "" : u.operationDisplay;
    const { primary, high, memo, errNote } = classify(u.functionEntry, opCol, service, hasFc);
    rows.push({
      service,
      fe: u.functionEntry,
      op: opCol,
      errNote,
      primary,
      high,
      memo,
      hasFc,
    });
  }

  let md = `# 重要度判定 Step 2-1: 主要業務 / 高頻度業務 判定単位一覧（実質 269 件スコープ）

- **根拠要件**: \`エラーログ_重要度判定要件定義.md\` §6.6（主要業務・高頻度業務の定義）
- **対象**: \`logOpsError\` 呼び出し（\`functions/src\`、\`node_modules\` 除外）
- **判定単位**: \`operation\` なし → \`functionEntry\` のみ。 \`operation\` あり → \`functionEntry\` + \`operation\`（式は短縮表示）
- **service**: \`serviceByFunctionEntry.ts\` / \`functionEntry_service_対応表.md\` 由来（補助）
- **静的 function_custom 確定（52 件）**: サンプル行が \`countStaticFunctionCustomLogOps.cjs\` と同一条件の一覧に含まれる単位。判断メモに記載。

## 一覧

| service | functionEntry | operation | errorSource 備考 | 主要業務か | 高頻度業務か | 判断メモ |
|---------|---------------|-----------|-------------------|------------|--------------|----------|
`;

  for (const r of rows) {
    const opEsc = String(r.op).replace(/\|/g, "\\|");
    const memoEsc = r.memo.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const errEsc = r.errNote.replace(/\|/g, "\\|");
    md += `| ${r.service} | \`${r.fe}\` | ${opEsc ? `\`${opEsc}\`` : ""} | ${errEsc} | ${r.primary} | ${r.high} | ${memoEsc} |\n`;
  }

  const nPrimary = rows.filter((r) => r.primary === "○").length;
  const nHigh = rows.filter((r) => r.high === "○").length;
  const nPrimaryPend = rows.filter((r) => r.primary === "保留").length;
  const nHighPend = rows.filter((r) => r.high === "保留").length;
  const nPend = rows.filter((r) => r.primary === "保留" || r.high === "保留").length;
  const nUnits = rows.length;

  md += `
## 集計サマリ

| 項目 | 値 |
|------|-----|
| **判定単位総数**（269 呼び出しと一致する場合、単位も 269） | **${nUnits}** |
| **主要業務 ○** | ${nPrimary} |
| **高頻度業務 ○** | ${nHigh} |
| **主要業務「保留」**（行単位） | ${nPrimaryPend} |
| **高頻度業務「保留」**（行単位） | ${nHighPend} |
| **主要または高頻度のいずれかが「保留」を含む行**（参考） | ${nPend} |

※ 「主要または高頻度のいずれかが保留」は、同一行で主要・高頻度の両方が「保留」の場合、**1 行として 1 回**カウント。

## 判断が割れやすい類型

1. **給与・シフト・シフト計画（payroll / staff / shift）**: 要件の「主要」の例示は来店・会計・開閉店・トーナメント中心のため、**店舗運営の中核か**の解釈で保留になりやすい。
2. **スケジューラ・ジョブ基盤（scheduler）・補助ログ**: **客前オペレーション**ではないため主要は × 寄り。頻度はバッチ設計次第で保留。
3. **設定・Secret・config**: 失敗時の影響は大きいが、**高頻度業務の例示**（注文・会計・勤怠等）の主軸ではないため × 寄り。
4. **analytics（移管・集計）**: 定常のレジ操作からは外れがち。**migrate** は運用ツール扱いで保留/×。
5. **LINE / リッチメニュー**: 主要中核の例示に含まれにくく、**× / 保留**になりやすい。
6. **side_game**: 卓上ゲームの補助。**主要・高頻度の境界**で保留。
7. **静的 function_custom 確定 52 件**: 手順上 **主要・高頻度とも ○** とした（Step2-1 前提）。実務レビューで調整可。

## 保留理由一覧（主要・高頻度のいずれかが「保留」の行）

`;

  for (const r of rows) {
    if (r.primary !== "保留" && r.high !== "保留") continue;
    md += `- **\`${r.fe}\`**${r.op ? ` / \`${r.op}\`` : ""}（${r.service}）: 主要=${r.primary} / 高頻度=${r.high} — ${r.memo}\n`;
  }

  const generatedDir = path.join(__dirname, "generated");
  const outPath = path.join(
    generatedDir,
    "重要度判定_Step2-1_主要業務高頻度_判定単位一覧.md"
  );
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.writeFileSync(outPath, md, "utf8");
  console.log("Wrote:", outPath, "units:", nUnits);
}

main();
