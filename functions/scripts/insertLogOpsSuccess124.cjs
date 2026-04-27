/**
 * エラーログ 269 件のうち functionEntry が 1 行だけの 124 箇所に、
 * logOpsError の context / operation を揃えた logOpsSuccess を挿入する（冪等）。
 *
 * 実行: node scripts/insertLogOpsSuccess124.cjs
 * 要: functions/tmp_124_1to1.json
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const REPO = path.join(__dirname, "..");
const LIST = path.join(REPO, "tmp_124_1to1.json");
const SRC = path.join(REPO, "src");

const SPECIAL = {
  createPayrollNotification: {
    file: "src/domains/attendance/helpers/payrollNotificationHelper.ts",
    insertMode: "afterSetDoc",
  },
  finalizePayrollRun: {
    file: "src/domains/attendance/tasks/finalizePayrollRun.ts",
    insertMode: "beforeLastLoggerInfo",
  },
};

/**
 * 失敗時 context をそのまま描くと catch 専用の識別子が参照できないため、相関用に掃引する。
 * logOpsError 本体のソースは一切変更しない。
 */
function scrubContextForSuccess(ctxText) {
  if (ctxText == null || !String(ctxText).trim()) return null;
  let t = String(ctxText).trim();
  t = t.replace(
    /code:\s*error instanceof HttpsError \? error\.code : 'internal'/g,
    "code: 'ok'"
  );
  t = t.replace(
    /code:\s*error instanceof HttpsError[\s\S]*?error instanceof FunctionCustomError[\s\S]*?: error\.errorKey[\s\S]*?:\s*'internal',?/g,
    "code: 'ok',"
  );
  t = t.replace(/result:\s*'fail'/g, "result: 'ok'");
  t = t.replace(
    /message:\s*String\(\s*err instanceof Error \? err\.message : err\)/g,
    "message: 'ok'"
  );
  t = t.replace(/message:\s*String\(\s*err\)/g, "message: 'ok'");
  t = t.replace(
    /message:\s*String\(\s*error instanceof Error \? error\.message : String\(error\)\)/g,
    "message: 'ok'"
  );
  t = t.replace(/detailMessage:\s*String\(\s*message\)/g, "detailMessage: 'ok'");
  if (/\berror instanceof\b/.test(t) && /code:\s*$/m.test(t) === false) {
    t = t.replace(
      /code:\s*error instanceof HttpsError[\s\S]*?:\s*'internal',?/g,
      "code: 'ok',"
    );
  }
  return t;
}

/** エラー行に context が薄い / 掃引が難しい場合（成功経路の変数に揃える） */
const SUCCESS_CONTEXT_OVERRIDE = {
  getOpenBills: "{ businessDate }",
  getBillPreviewTotals: "{ billId, businessDate }",
  getActionLogs: "{ detailMessage: 'ok' }",
  billsEventsOnCreate: `{
          billId,
          eventId,
          type: eventDoc.type,
          code: 'ok',
        }`,
};

function setParents(node, parent) {
  node._parent = parent;
  ts.forEachChild(node, (c) => setParents(c, node));
}

function isFunctionLike(n) {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
  );
}

function isReturnInTryForHandler(ret, tryBlock) {
  let p = ret._parent;
  while (p) {
    if (p === tryBlock) return true;
    if (isFunctionLike(p)) return false; // 内側関数の return
    p = p._parent;
  }
  return false;
}

function shouldSkipReturnAsFailure(sf, r) {
  const t = sf.text;
  const s = t.slice(r.pos, r.end);
  return /success\s*:\s*false/.test(s);
}

function findLogOpsErrorCalls(sf) {
  const out = [];
  function visit(n) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "logOpsError" &&
      n.arguments.length
    ) {
      out.push(n);
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  return out;
}

function getStringProperty(obj, name) {
  if (!ts.isObjectLiteralExpression(obj)) return undefined;
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p) || p.name == null) continue;
    const nm = ts.isIdentifier(p.name)
      ? p.name.text
      : ts.isStringLiteral(p.name)
        ? p.name.text
        : null;
    if (nm !== name) continue;
    const init = p.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      return init.text;
    }
  }
  return undefined;
}

function getFeFromCall(call) {
  const arg0 = call.arguments[0];
  if (!ts.isObjectLiteralExpression(arg0)) return undefined;
  return getStringProperty(arg0, "functionEntry");
}

function getOperationAndContextText(sf, call) {
  const arg0 = call.arguments[0];
  if (!ts.isObjectLiteralExpression(arg0)) return { operationText: null, contextText: null };
  const t = sf.text;
  let operationText = null;
  let contextText = null;
  for (const p of arg0.properties) {
    if (!ts.isPropertyAssignment(p) || p.name == null) continue;
    const nm = ts.isIdentifier(p.name)
      ? p.name.text
      : ts.isStringLiteral(p.name)
        ? p.name.text
        : null;
    if (nm === "operation" && p.initializer) {
      operationText = t.slice(p.initializer.pos, p.initializer.end);
    }
    if (nm === "context" && p.initializer) {
      contextText = t.slice(p.initializer.pos, p.initializer.end);
    }
  }
  return { operationText, contextText };
}

function buildInsertBlock(fe, opText, ctxText) {
  const opLine =
    opText != null && opText.trim()
      ? `      operation: ${opText.trim()},\n`
      : "";
  const ctxLine =
    ctxText != null && ctxText.trim()
      ? `      context: ${ctxText.trim()},\n`
      : "";
  return (
    `    logOpsSuccess({\n` +
    `      message: "${fe} 成功",\n` +
    `      functionEntry: "${fe}",\n` +
    opLine +
    ctxLine +
    `    });\n`
  );
}

function fileHasLogOpsSuccessForFe(text, fe) {
  const re = new RegExp(
    "logOpsSuccess\\s*\\(\\s*\\{[\\s\\S]*?functionEntry\\s*:\\s*['\"]" +
      fe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "['\"]",
    "m"
  );
  return re.test(text);
}

function ensureImport(text) {
  if (/\{[^}]*\blogOpsSuccess\b[^}]*\}\s*from/.test(text)) return text;
  if (/import\s*\{\s*logOpsError\s*\}\s*from/.test(text)) {
    return text.replace(
      /import\s*\{\s*logOpsError\s*\}/,
      "import { logOpsError, logOpsSuccess }"
    );
  }
  if (/import\s*\{\s*logOpsError\s*,/.test(text)) {
    return text.replace(
      /import\s*\{\s*logOpsError\s*,/,
      "import { logOpsError, logOpsSuccess,"
    );
  }
  return text;
}

function processCatchCase(absPath, fe) {
  let text = fs.readFileSync(absPath, "utf8");
  if (fileHasLogOpsSuccessForFe(text, fe)) {
    return { path: absPath, status: "skip", reason: "already" };
  }

  const sf = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  setParents(sf, undefined);
  const calls = findLogOpsErrorCalls(sf).filter((c) => getFeFromCall(c) === fe);
  if (calls.length !== 1) {
    return {
      path: absPath,
      status: "error",
      reason: "logOpsError count for fe: " + calls.length,
    };
  }
  const call = calls[0];
  const { operationText, contextText: rawContextText } = getOperationAndContextText(
    sf,
    call
  );
  let finalContextText = Object.prototype.hasOwnProperty.call(
    SUCCESS_CONTEXT_OVERRIDE,
    fe
  )
    ? SUCCESS_CONTEXT_OVERRIDE[fe]
    : scrubContextForSuccess(rawContextText);
  if (
    fe === "appendExtra" &&
    finalContextText != null &&
    /repos[/]appendExtra\.ts$/.test(String(absPath))
  ) {
    finalContextText = finalContextText.replace(
      /result:\s*'ok'/g,
      "result: reused ? 'reused' : 'ok'"
    );
  }
  const insert = buildInsertBlock(fe, operationText, finalContextText);

  let p = call;
  while (p && !ts.isCatchClause(p)) p = p._parent;
  if (!p || !ts.isCatchClause(p)) {
    return { path: absPath, status: "error", reason: "not in catch" };
  }
  const catchClause = p;
  const trySt = p.parent;
  if (!ts.isTryStatement(trySt)) {
    return { path: absPath, status: "error", reason: "no trystatement" };
  }
  const tryBlock = trySt.tryBlock;

  const retInTry = [];
  function visitTry(n) {
    if (ts.isReturnStatement(n) && isReturnInTryForHandler(n, tryBlock)) {
      if (!shouldSkipReturnAsFailure(sf, n)) retInTry.push(n);
    }
    ts.forEachChild(n, visitTry);
  }
  visitTry(tryBlock);

  let newText = text;
  if (retInTry.length) {
    const byPosAsc = [...retInTry].sort((a, b) => a.pos - b.pos);
    let offset = 0;
    for (const r of byPosAsc) {
      const at = r.pos + offset;
      const lineStart = newText.lastIndexOf("\n", at) + 1;
      const lineEnd = newText.indexOf("\n", at);
      const oneLine = newText.slice(
        lineStart,
        lineEnd < 0 ? newText.length : lineEnd
      );
      const ind = /^\s*/.exec(oneLine);
      const indent = ind ? ind[0] : "    ";
      const block = insert.replace(/^    /gm, indent);
      newText = newText.slice(0, at) + block + newText.slice(at);
      offset += block.length;
    }
  } else {
    // try 内に return なし → try 文の直後
    const end = trySt.end;
    newText = newText.slice(0, end) + insert + newText.slice(end);
  }
  newText = ensureImport(newText);
  fs.writeFileSync(absPath, newText);
  return { path: absPath, status: "ok" };
}

function processSpecial(fe) {
  const s = SPECIAL[fe];
  if (!s) return null;
  const absPath = path.join(REPO, s.file);
  let text = fs.readFileSync(absPath, "utf8");
  if (fileHasLogOpsSuccessForFe(text, fe)) {
    return { path: absPath, status: "skip", fe };
  }
  if (s.insertMode === "afterSetDoc" && fe === "createPayrollNotification") {
    // await notificationsRef... の後、logger.info の前
    const anchor = "logger.info('createPayrollNotification: created'";
    const i = text.indexOf(anchor);
    if (i < 0) {
      return { path: absPath, status: "error", reason: "anchor" };
    }
    const ins =
      "  logOpsSuccess({\n" +
      "    message: 'createPayrollNotification 成功',\n" +
      "    functionEntry: 'createPayrollNotification',\n" +
      "    context: { triggerType },\n" +
      "  });\n\n  ";
    text = text.slice(0, i) + ins + text.slice(i);
    text = ensureImport(text);
    fs.writeFileSync(absPath, text);
    return { path: absPath, status: "ok", fe };
  }
  if (s.insertMode === "beforeLastLoggerInfo" && fe === "finalizePayrollRun") {
    const anchor = "    logger.info('finalizePayrollRun: completed',";
    const i = text.indexOf(anchor);
    if (i < 0) {
      return { path: absPath, status: "error", reason: "anchor" };
    }
    const ins =
      "    logOpsSuccess({\n" +
      "      message: 'finalizePayrollRun 成功',\n" +
      "      functionEntry: 'finalizePayrollRun',\n" +
      "      context: { runId, paymentPeriodKey },\n" +
      "    });\n\n    ";
    text = text.slice(0, i) + ins + text.slice(i);
    text = ensureImport(text);
    fs.writeFileSync(absPath, text);
    return { path: absPath, status: "ok", fe };
  }
  return { path: absPath, status: "error", reason: "unknown special" };
}

function main() {
  const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  const byFe = new Map();
  for (const r of list) {
    byFe.set(r.fe, r);
  }
  const results = [];
  for (const fe of byFe.keys()) {
    if (SPECIAL[fe]) {
      results.push({ fe, ...processSpecial(fe) });
      continue;
    }
    const rel = byFe.get(fe).source.split(":")[0];
    const absPath = path.join(REPO, rel);
    if (!fs.existsSync(absPath)) {
      results.push({ fe, path: absPath, status: "error", reason: "missing" });
      continue;
    }
    results.push({ fe, ...processCatchCase(path.join(REPO, rel), fe) });
  }
  const err = results.filter((r) => r.status === "error");
  const ok = results.filter((r) => r.status === "ok");
  const sk = results.filter((r) => r.status === "skip");
  console.log("ok", ok.length, "skip", sk.length, "error", err.length);
  if (err.length) {
    console.error(err);
    process.exit(1);
  }
}

main();
