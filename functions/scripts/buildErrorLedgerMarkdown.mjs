/**
 * One-off: emit full changeSpec ledger markdown (no code changes to product).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcRoot = path.join(root, "src");

const map = new Map();
const mt = fs.readFileSync(path.join(srcRoot, "shared/logging/serviceByFunctionEntry.ts"), "utf8");
for (const m of mt.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) map.set(m[1], m[2]);

function walkTsFiles(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory() && e.name !== "node_modules") walkTsFiles(p, a);
    else if (p.endsWith(".ts")) a.push(p);
  }
  return a;
}

const feSet = new Set();
walkTsFiles(srcRoot).forEach((f) => {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/functionEntry:\s*['"]([^'"]+)['"]/g)) feSet.add(m[1]);
});
const unknown = [...feSet].filter((x) => !map.has(x)).sort();

const rows = [];
function add(cat, srv, fe, file, line, site, content, status, rec, note) {
  rows.push({ cat, srv, fe, file, line, site, content: String(content), status, rec, note });
}

add("共通基盤", "（resolve）", "（呼び出し依存）", "src/shared/logging/logOpsError.ts", "90-176", "logOpsError実装", "payload に errorSource / service 等", "実装済み", "対象外確定", "");
add("共通基盤", "（resolve）", "（同上）", "src/shared/logging/functionCustomError.ts", "全文", "型", "FunctionCustomError", "実装済み", "対象外確定", "");
add("共通基盤", "（resolve）", "（同上）", "src/shared/logging/externalFromCause.ts", "全文", "抽出", "extractExternalFromCause", "実装済み", "対象外確定", "");
add(
  "共通基盤",
  "（resolve）",
  "（同上）",
  "src/shared/logging/serviceByFunctionEntry.ts",
  "2-223",
  "マップ",
  "SERVICE_BY_FUNCTION_ENTRY（主表＋export 外）",
  "実装済み",
  "マップ追記",
  `コード上の functionEntry 文字列のうち${unknown.length}件が未登録→unknown_service`
);

/** §13: 各ファイルの logOpsError を含む最外周 catch ブロックの行範囲（開始行–終了行） */
const s13 = [
  ["accounting", "getBillPreviewTotals", "src/domains/bills/callables/getBillPreviewTotals.ts", "174-188", "catch", "logOpsError + sourceProductHint firestore", "実装済み", "対象外確定", "§13#1"],
  ["orders", "placeOrderByUser", "src/domains/itemOrder/callables/placeOrderByUser.ts", "177-187", "catch", "条件付き logOpsError（非 HttpsError のみ）", "実装済み", "対象外確定", "§13#2"],
  ["store", "closeStoreTerminal", "src/domains/storeMeta/callables/closeStoreTerminal.ts", "81-93", "catch", "acquireProcessing の catch 内 logOpsError（FunctionCustomError 時）", "実装済み", "対象外確定", "§13#3"],
  ["store", "continueBusinessTerminal", "src/domains/storeMeta/callables/continueBusinessTerminal.ts", "150-171", "catch", "logOpsError + cloud_tasks", "実装済み", "対象外確定", "§13#4"],
  ["store", "createInitialStateDocCallable", "src/domains/storeMeta/callables/createInitialStateDocCallable.ts", "48-60", "catch", "logOpsError + firestore hint", "実装済み", "対象外確定", "§13#5"],
  ["store", "initializeStoreConfigCallable", "src/domains/storeMeta/callables/initializeStoreConfigCallable.ts", "144-156", "catch", "logOpsError", "実装済み", "対象外確定", "§13#6"],
  ["store", "openStoreTerminal", "src/domains/storeMeta/callables/openStoreTerminal.ts", "65-77", "catch", "acquireProcessing の catch 内 logOpsError（FunctionCustomError 時）", "実装済み", "対象外確定", "§13#7"],
  ["store", "updateUnclockedAttendanceWithAuth", "src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts", "122-135", "catch", "logOpsError", "実装済み", "対象外確定", "§13#8"],
  ["store", "applyCloseSnapshot", "src/domains/storeMeta/services/applyCloseSnapshot.ts", "186-195", "catch", "logOpsError なし（HttpsError 再throw）", "保留", "保留維持", "§13#9"],
  ["store", "getCloseIntegrityData", "src/domains/storeMeta/services/getCloseIntegrityData.ts", "49-62", "catch", "logOpsError", "実装済み", "対象外確定", "§13#10"],
  ["store", "getUnclockedStaffForClose", "src/domains/storeMeta/services/getUnclockedStaffForClose.ts", "58-71", "catch", "logOpsError", "実装済み", "対象外確定", "§13#11"],
  ["store", "getUnclosedTournamentsForClose", "src/domains/storeMeta/services/getUnclosedTournamentsForClose.ts", "175-188", "catch", "logOpsError", "実装済み", "対象外確定", "§13#12"],
  ["store", "getUnsettledBillsForClose", "src/domains/storeMeta/services/getUnsettledBillsForClose.ts", "94-107", "catch", "logOpsError", "実装済み", "対象外確定", "§13#13"],
  ["platform", "updateDeviceOptions", "src/shared/devices/callables/updateDeviceOptions.ts", "90-105", "catch", "logOpsError", "実装済み", "対象外確定", "§13#14"],
  ["platform", "updateDeviceRole", "src/shared/devices/callables/updateDeviceRole.ts", "62-77", "catch", "logOpsError", "実装済み", "対象外確定", "§13#15"],
];
s13.forEach((x) => add("§13", ...x));

const fixed6 = [
  ["accounting", "startAccounting", "src/domains/bills/repos/startAccounting.ts", "238-247", "logOpsError", "FunctionCustomError 経路 + operation", "実装済み", "対象外確定", "固定6"],
  ["accounting", "startAccounting", "src/domains/bills/repos/startAccounting.ts", "252-263", "logOpsError", "非 FCE 経路", "実装済み", "対象外確定", "固定6"],
  ["user相当", "createBillWithActiveStay", "src/domains/bills/repos/createBillWithActiveStay.ts", "249-260", "logOpsError", "FCE 経路（対応表 export 外キー）", "実装済み", "対象外確定", "固定6"],
  ["user相当", "createBillWithActiveStay", "src/domains/bills/repos/createBillWithActiveStay.ts", "265-275", "logOpsError", "非 FCE", "実装済み", "対象外確定", "固定6"],
  ["tournament", "registerForTournament", "src/domains/tournament_activeTournament/callables/registerForTournament.ts", "221", "logOpsError", "operation 分解", "実装済み", "対象外確定", "固定6"],
  ["tournament", "registerForTournament", "src/domains/tournament_activeTournament/callables/registerForTournament.ts", "265", "logOpsError", "operation 分解", "実装済み", "対象外確定", "固定6"],
  ["tournament", "registerForTournament", "src/domains/tournament_activeTournament/callables/registerForTournament.ts", "286", "logOpsError", "operation 分解", "実装済み", "対象外確定", "固定6"],
  ["platform", "controlHookHttp", "src/shared/http/controlHook.ts", "98-103", "logOpsError", "validateControlHookRequest", "実装済み", "対象外確定", "固定6"],
  ["platform", "controlHookHttp", "src/shared/http/controlHook.ts", "300-306", "logOpsError", "executeNewPayloadTask", "実装済み", "対象外確定", "固定6"],
  ["platform", "controlHookHttp", "src/shared/http/controlHook.ts", "439-445", "logOpsError", "executeLegacyPayloadTask", "実装済み", "対象外確定", "固定6"],
  ["tournament_schedule", "runEnqueueTournamentTasks", "src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts", "240-247", "logOpsError", "enqueueTournamentTask + cloud_tasks", "実装済み", "対象外確定", "固定6"],
  ["store", "getCurrentBusinessDateKeyOrThrow", "src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts", "80-86", "logOpsError", "resolveCurrentBusinessDate + errorKey", "実装済み", "対象外確定", "固定6"],
  ["store", "getCurrentBusinessDateKeyOrThrow", "src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts", "95-101", "logOpsError", "同上", "実装済み", "対象外確定", "固定6"],
  ["store", "getCurrentBusinessDateKeyOrThrow", "src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts", "115-121", "logOpsError", "同上", "実装済み", "対象外確定", "固定6"],
  ["store", "getCurrentBusinessDateKeyOrThrow", "src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts", "131-137", "logOpsError", "loadFirestoreStateDoc", "実装済み", "対象外確定", "固定6"],
];
fixed6.forEach((x) => add("固定6", ...x));

const domRoots = [
  "src/domains/bills",
  "src/domains/storeMeta",
  "src/domains/tournament_activeTournament",
  "src/domains/tournament_createTournament",
];
const domFiles = domRoots.flatMap((r) => walkTsFiles(path.join(root, r)));

for (const f of domFiles) {
  const rel = path.relative(root, f).split(path.sep).join("/");
  const lines = fs.readFileSync(f, "utf8").split(/\n/);
  lines.forEach((line, i) => {
    const n = i + 1;
    if (
      /throw new Error\(/.test(line) ||
      /HttpsError\([^)]*failed-precondition/.test(line) ||
      /HttpsError\([^)]*already-exists/.test(line)
    ) {
      if (
        rel === "src/domains/bills/services/paymentSplitCalculator.ts" &&
        (n === 54 || n === 55 || n === 56 || n === 177 || n === 178 || n === 179)
      )
        return;
      add("A-throw", "（推定）", "（該当 callable）", rel, String(n), "throw", line.trim(), "未対応", "FCE/errorKey", "§8§12");
    }
  });
}

add(
  "A-throw",
  "（推定）",
  "verifyPaymentSplit 内部",
  "src/domains/bills/services/paymentSplitCalculator.ts",
  "54-56",
  "throw",
  "throw new Error('selectedBaseMethod must be one of: cash, credit_card, electronic_money');",
  "未対応",
  "追加実装",
  "複数行を1行に結合"
);
add(
  "A-throw",
  "（推定）",
  "verifyPaymentSplit 内部",
  "src/domains/bills/services/paymentSplitCalculator.ts",
  "177-179",
  "throw",
  "throw new Error(`計算結果の整合性エラー: 計算合計(${totalCalculated}) != 元の合計(${totalBill})`);",
  "未対応",
  "追加実装",
  "複数行を1行に結合"
);

add(
  "return",
  "accounting",
  "getOpenBills",
  "src/domains/bills/callables/getOpenBills.ts",
  "47",
  "return",
  'return { success: false, error: "入店中ユーザーの取得に失敗しました" };',
  "対象外",
  "対象外確定",
  "§3 契約変更対象外"
);
for (const l of [59, 66, 91, 132, 179]) {
  add(
    "return",
    "tournament",
    "validateEndTournament",
    "src/domains/tournament_activeTournament/callables/validateEndTournament.ts",
    String(l),
    "return",
    "return { success: false, ...validationResult };",
    "対象外",
    "対象外確定",
    "§3"
  );
}

add("B観測", "accounting", "dualWriteTodaysBillsSkeleton", "src/domains/bills/repos/dualWrite.ts", "67-75", "catch", "catch { logger.warn(...) }", "未対応", "logOpsError 要否判断", "");
add("B観測", "accounting", "startAccounting 内 legacy デュアルライト", "src/domains/bills/repos/startAccounting.ts", "206-215", "catch", "catch { logger.warn }", "未対応", "同上", "");

add("catch", "accounting", "completeAccounting", "src/domains/bills/callables/accounting.ts", "507-513", "catch", "logOpsError（failureType 除去・operation 付与）", "実装済み", "対象外確定", "");
add("catch", "accounting", "completeAccountingV2", "src/domains/bills/callables/accounting.ts", "645-650", "catch", "同上", "実装済み", "対象外確定", "");

function escapeRegExp(s) {
  return s.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
}

/** マップ未登録の functionEntry が現れるソース行（1 行に functionEntry が載る呼び出しを想定） */
function linesWithFunctionEntry(key) {
  const out = [];
  walkTsFiles(srcRoot).forEach((f) => {
    const rel = path.relative(root, f).split(path.sep).join("/");
    const lines = fs.readFileSync(f, "utf8").split(/\n/);
    const re = new RegExp(`functionEntry:\\s*['"]${escapeRegExp(key)}['"]`);
    lines.forEach((lineText, i) => {
      if (re.test(lineText)) out.push({ rel, lineNum: i + 1, lineText });
    });
  });
  return out;
}

for (const k of unknown) {
  const sites = linesWithFunctionEntry(k);
  if (sites.length === 0) {
    add("E", "unknown_service になりうる", k, "（参照なし）", "—", "functionEntry", `マップ未登録キー ${k}（src に functionEntry 行が見つからない）`, "要確認", "対応表 + マップ同期", "");
    continue;
  }
  for (const { rel, lineNum, lineText } of sites) {
    add("E", "unknown_service になりうる", k, rel, String(lineNum), "logOpsError", lineText.trim(), "未対応", "対応表 + マップ同期", "");
  }
}

add("D", "platform", "getStoreConfig", "src/shared/config/configLoader.ts", "105", "logOpsError", "sourceProductHint firestore（failureType 除去）", "実装済み", "対象外確定", "");
for (const l of [25, 34, 62, 82, 108, 152, 161, 204, 224]) {
  add("D", "line", "sendLinePushMessage 等", "src/domains/webhook/services/lineMessaging.ts", String(l), "logOpsError", "LINE（failureType 除去・external_api 補助）", "実装済み", "対象外確定", "");
}

add("境界", "user", "manualCheckIn", "src/domains/user/callables/manualCheckIn.ts", "161-177", "catch", "FunctionCustomError 分岐 + logOpsError", "実装済み", "対象外確定", "createBill 経路");
add("境界", "user", "processVisitByQR", "src/domains/user/callables/processVisitByQR.ts", "210-228", "catch", "FunctionCustomError 分岐 + logOpsError", "実装済み", "対象外確定", "");

const header =
  "<!-- §13 の「行」は該当 catch ブロックの開始–終了行。E はマップ未登録 functionEntry の logOpsError 呼び出し行（同一キーで複数行あり得る）。生成: node scripts/buildErrorLedgerMarkdown.mjs -->\n\n" +
  "| # | 区分 | service | functionEntry | ファイル（functions/ からの相対） | 行 | サイト種別 | 内容（省略なし） | 実装状況 | 推奨対応 | 備考 |\n" +
  "|---|------|---------|---------------|-----------------------------------|-----|------------|------------------|----------|----------|------|\n";

const body = rows
  .map((r, i) => {
    const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
    return `| ${i + 1} | ${esc(r.cat)} | ${esc(r.srv)} | ${esc(r.fe)} | ${esc(r.file)} | ${esc(r.line)} | ${esc(r.site)} | ${esc(r.content)} | ${esc(r.status)} | ${esc(r.rec)} | ${esc(r.note)} |`;
  })
  .join("\n");

const outPath = path.join(root, "scripts", "error_ledger_full_changeSpec.md");
fs.writeFileSync(outPath, header + body + "\n", "utf8");
console.log("Wrote", outPath, "rows", rows.length);
