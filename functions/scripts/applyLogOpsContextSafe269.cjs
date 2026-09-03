/**
 * try/catch の JS スコープを考慮し、**catch から参照できない** try 内 let/const を
 * 追加入力候補から除外したうえで、logOpsError の `context` に相関キーをマージする。
 * adminId → callerUid: adminId（スコープ実在確認済みのとき）。
 * ※ deviceId は `device` の null 可能性等があり自動では付与しない（推奨表の手作業扱い）。
 *
 * 使い方: cd functions && node scripts/applyLogOpsContextSafe269.cjs [--dry-run]
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "src");
const EXCLUDE_DIRS = new Set(["node_modules"]);

// --- copy from recommendLogOpsContext269.cjs (trimmed) -----------------
const EXCLUDE_BINDING_NAMES = new Set([
  "error", "errors", "e", "err", "request", "req", "response", "res", "data", "config", "logger",
  "ref", "refs", "batch", "tx", "transaction", "snapshot", "snapshots", "doc", "docs", "result", "results",
  "admin", "db", "now", "ctx", "context", "args", "opts", "options", "credentials", "headers", "body",
  "payload", "message", "messages", "title", "name", "email", "phone", "code", "status", "ok", "json",
  "text", "buffer", "stream", "url", "uri", "path", "query", "params", "metadata", "meta", "cause", "stack",
  "value", "values", "item", "items", "list", "array", "map", "set", "obj", "object", "input", "output",
  "tmp", "temp", "next", "prev", "current", "update", "updates", "write", "read", "op", "phase", "reason",
  "detail", "details", "legacy", "candidates", "startAt", "endAt", "regEndAt", "scheduleTimeUtc",
  "notificationHour", "targetDate", "triggerType", "attendanceIdsCount",
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

function propName(pn) {
  if (!pn) return "";
  if (ts.isIdentifier(pn)) return pn.text;
  if (ts.isStringLiteral(pn)) return pn.text;
  return "";
}

function literalString(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function exprSnippet(sf, node) {
  if (!node) return "";
  return sf.text.slice(node.getStart(sf), node.getEnd()).replace(/\s+/g, " ").trim();
}

function extractObjectKeys(sf, objLit) {
  const keys = [];
  if (!objLit || !ts.isObjectLiteralExpression(objLit)) return keys;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p)) keys.push(propName(p.name));
    else if (ts.isShorthandPropertyAssignment(p)) keys.push(p.name.text);
  }
  return keys.filter(Boolean);
}

function findContextObject(sf, objLit) {
  if (!objLit || !ts.isObjectLiteralExpression(objLit)) return null;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && propName(p.name) === "context") return p.initializer;
  }
  return null;
}

function hasCauseProperty(objLit) {
  if (!objLit || !ts.isObjectLiteralExpression(objLit)) return false;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && propName(p.name) === "cause") return true;
  }
  return false;
}

function getPropInitializer(objLit, name) {
  if (!objLit || !ts.isObjectLiteralExpression(objLit)) return null;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && propName(p.name) === name) return p.initializer;
  }
  return null;
}

function pathToRoot(node) {
  const p = [];
  for (let n = node; n; n = n.parent) p.push(n);
  return p;
}

function functionLikeChainFromInner(callNode) {
  return pathToRoot(callNode).filter(ts.isFunctionLike);
}

function outermostFunctionLikeOnPath(callNode) {
  const chain = functionLikeChainFromInner(callNode);
  return chain.length ? chain[chain.length - 1] : null;
}

function isStrictAncestor(ancestor, node) {
  let p = node;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
}

function isParameterNameInChain(name, callNode) {
  for (const f of functionLikeChainFromInner(callNode)) {
    for (const p of f.parameters) {
      if (ts.isIdentifier(p.name) && p.name.text === name) return true;
      if (ts.isObjectBindingPattern(p.name) || ts.isArrayBindingPattern(p.name)) {
        const found = { ok: false };
        const walk = (pat) => {
          for (const el of pat.elements) {
            if (ts.isBindingElement(el) && ts.isIdentifier(el.name) && el.name.text === name) found.ok = true;
            else if (ts.isBindingElement(el) && (ts.isObjectBindingPattern(el.name) || ts.isArrayBindingPattern(el.name))) walk(el.name);
          }
        };
        walk(p.name);
        if (found.ok) return true;
      }
    }
  }
  return false;
}

function findEnclosingFunctionBody(fun) {
  if (!fun) return null;
  if (ts.isFunctionLike(fun) && fun.body && ts.isBlock(fun.body)) return fun.body;
  return null;
}

function getEnclosingFunctionLikeOfNode(node) {
  let p = node;
  while (p) {
    if (ts.isFunctionLike(p)) return p;
    p = p.parent;
  }
  return null;
}

function isVarList(list) {
  if (!list || !ts.isVariableDeclarationList(list)) return false;
  return (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0;
}

function lexicalVarDeclUseVisible(decl, callNode, sf) {
  const list = decl.parent;
  if (!ts.isVariableDeclarationList(list)) return false;
  const callPos = callNode.getStart(sf);
  if (callPos < decl.getEnd(sf)) return false;
  if (isVarList(list)) {
    const encl = getEnclosingFunctionLikeOfNode(decl);
    const b = findEnclosingFunctionBody(encl);
    if (b && isStrictAncestor(b, callNode)) return true;
    return false;
  }
  if (!ts.isVariableStatement(list.parent)) return false;
  const st = list.parent;
  const block = st.parent;
  if (!ts.isBlock(block) && !ts.isSourceFile(block)) {
    return false;
  }
  return isStrictAncestor(block, callNode);
}

function collectVarDeclsNamedInSubtree(root, name, out) {
  function visit(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) {
      out.push(n);
    }
    ts.forEachChild(n, visit);
  }
  visit(root);
}

/**
 * 参照位置でショートハンド n が合法か（tsc のブロックスコープに合わせる簡易判定）
 */
function isVisibleName(name, callNode, sf) {
  if (isParameterNameInChain(name, callNode)) return true;
  const outer = outermostFunctionLikeOnPath(callNode);
  if (!outer) return false;
  const callPos = callNode.getStart(sf);
  if (!ts.isBlock(outer.body)) return false;
  const decls = [];
  collectVarDeclsNamedInSubtree(outer.body, name, decls);
  const good = decls
    .filter((d) => d.getStart(sf) < callPos)
    .filter((d) => lexicalVarDeclUseVisible(d, callNode, sf));
  if (good.length === 0) return false;
  good.sort((a, b) => b.getStart(sf) - a.getStart(sf));
  return true;
}

function addBindingElementNames(el, out) {
  if (!ts.isBindingElement(el)) return;
  const name = el.name;
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const e of name.elements) {
      if (ts.isBindingElement(e)) addBindingElementNames(e, out);
    }
  }
}

function addFromParams(fnLike, out) {
  if (!fnLike || !fnLike.parameters) return;
  for (const p of fnLike.parameters) {
    if (ts.isIdentifier(p.name)) out.add(p.name.text);
    else if (ts.isObjectBindingPattern(p.name) || ts.isArrayBindingPattern(p.name)) {
      for (const el of p.name.elements) {
        if (ts.isBindingElement(el)) addBindingElementNames(el, out);
      }
    }
  }
}

function addFromVariableDeclaration(decl, out) {
  if (ts.isIdentifier(decl.name)) out.add(decl.name.text);
  else if (ts.isObjectBindingPattern(decl.name) || ts.isArrayBindingPattern(decl.name)) {
    for (const el of decl.name.elements) {
      if (ts.isBindingElement(el)) addBindingElementNames(el, out);
    }
  }
}

function collectVarDeclsBeforePos(root, cutoffPos, out, sf) {
  function visit(node) {
    if (!node || node.getStart(sf) >= cutoffPos) return;
    if (ts.isVariableDeclaration(node)) addFromVariableDeclaration(node, out);
    ts.forEachChild(node, visit);
  }
  visit(root);
}

function collectScopeBindings(sf, callNode) {
  const names = new Set();
  const callPos = callNode.getStart(sf);
  const chain = functionLikeChainFromInner(callNode);
  for (const fn of chain) addFromParams(fn, names);
  const outer = outermostFunctionLikeOnPath(callNode);
  if (outer && ts.isBlock(outer.body)) {
    collectVarDeclsBeforePos(outer.body, callPos, names, sf);
  }
  return names;
}

function isCorrelationCandidate(name) {
  if (!name || name.length <= 1) return false;
  if (name.startsWith("_")) return false;
  if (EXCLUDE_BINDING_NAMES.has(name)) return false;
  if (/Id$/i.test(name)) return true;
  if (/^idemp/i.test(name)) return true;
  if (/Key$/i.test(name)) {
    if (/apiKey|secretKey|privateKey|accessKey/i.test(name)) return false;
    return true;
  }
  const exact = new Set([
    "deviceId", "runId", "staffId", "seatNumber", "businessDate", "paymentPeriodKey", "templateId",
    "tournamentId", "tableId", "billId", "userId", "callerUid", "uid", "correlationId", "requestId",
    "operationId", "taskId", "scheduleId", "storeId", "sessionId", "requestHash8", "adminId",
  ]);
  if (exact.has(name)) return true;
  if (/^hash\d*$/i.test(name)) return true;
  return false;
}

function normalizeContextKeys(keys) {
  return keys.filter((k) => k && !k.startsWith("..."));
}

function collectThrowFCsInNode(sf, container) {
  const out = [];
  if (!container) return out;
  function visit(node) {
    if (
      ts.isThrowStatement(node) &&
      node.expression &&
      ts.isNewExpression(node.expression) &&
      node.expression.expression &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "FunctionCustomError"
    ) {
      const arg = node.expression.arguments && node.expression.arguments[0];
      let ctxKeys = [];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const ctxInit = getPropInitializer(arg, "context");
        ctxKeys = normalizeContextKeys(extractObjectKeys(sf, ctxInit));
      }
      out.push({ ctxKeys });
    }
    ts.forEachChild(node, visit);
  }
  visit(container);
  return out;
}

function enclosingInnermostFunction(callNode) {
  let n = callNode.parent;
  while (n) {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isConstructorDeclaration(n)
    ) {
      return n;
    }
    n = n.parent;
  }
  return null;
}

function getEnclosingCatchClause(callNode) {
  let n = callNode.parent;
  while (n) {
    if (ts.isCatchClause(n)) return n;
    if (ts.isFunctionLike(n)) break;
    n = n.parent;
  }
  return null;
}

/** ブロック内で宣言された let/const の束縛名（var は含まない＝ catch から見て try 内 var は可視だが稀なので外す） */
function collectLetConstNamesInBlock(block, sf) {
  const out = new Set();
  if (!block) return out;
  function visit(n) {
    if (ts.isVariableDeclaration(n)) {
      const list = n.parent;
      if (ts.isVariableDeclarationList(list) && (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0) {
        addFromVariableDeclaration(n, out);
      }
    }
    if (ts.isFunctionLike(n) && n !== block) return;
    ts.forEachChild(n, visit);
  }
  visit(block);
  return out;
}

/**
 * logOps が属する catch に対し、その **直ペア** の try ブロック内 let/const 名
 *（catch からは不可視。スコアド解析の偽陽性を除く）
 */
function getTryBlockLetConstNamesForThisCatch(logOpsNode, sf) {
  const catchClause = getEnclosingCatchClause(logOpsNode);
  if (!catchClause || !catchClause.parent || !ts.isTryStatement(catchClause.parent)) return new Set();
  const tryStmt = catchClause.parent;
  const tryBlock = tryStmt.tryBlock;
  return collectLetConstNamesInBlock(tryBlock, sf);
}

function refineScopeForCatch(catchNode, callNode, scopeNames, sf) {
  if (!catchNode) return scopeNames;
  const bad = getTryBlockLetConstNamesForThisCatch(callNode, sf);
  return new Set([...scopeNames].filter((n) => !bad.has(n)));
}

function collect(sf) {
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === "logOpsError") {
        const first = node.arguments[0];
        if (first && ts.isObjectLiteralExpression(first)) {
          const functionEntry = literalString(getPropInitializer(first, "functionEntry"));
          if (functionEntry) {
            const ctxInit = findContextObject(sf, first);
            const ctxKeys = normalizeContextKeys(extractObjectKeys(sf, ctxInit));
            const pos = node.getStart(sf);
            const line = sf.getLineAndCharacterOfPosition(pos).line + 1;
            const hasCause = hasCauseProperty(first);
            calls.push({ node, line, ctxKeys, hasCause, firstArg: first });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return calls;
}

/**
 * 追加する context 用プロパティ: { [key]: ts.Expression } を printer 用に
 */
function buildContextPropsToAdd(namesToAdd) {
  const props = [];
  const nameList = [...namesToAdd].sort();
  for (const n of nameList) {
    if (n === "adminId") {
      props.push({ key: "callerUid", isShorthand: false, valueText: "adminId" });
    } else {
      props.push({ key: n, isShorthand: true, valueText: n });
    }
  }
  return props;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const files = walkTsFiles(ROOT);
  let changeCount = 0;
  let fileEdits = 0;

  for (const filePath of files) {
    const rel = path.relative(path.join(__dirname, ".."), filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const calls = collect(sf, rel);
    if (calls.length === 0) continue;

    const innerFn = (c) => enclosingInnermostFunction(c.node);

    const edits = [];

    for (const c of calls) {
      const catchClause = getEnclosingCatchClause(c.node);
      let scopeNames = collectScopeBindings(sf, c.node);
      if (catchClause) {
        scopeNames = refineScopeForCatch(catchClause, c.node, scopeNames, sf);
      }

      const candidates = [...scopeNames].filter(isCorrelationCandidate);
      const fn = innerFn(c);
      const throwsInFunc = fn ? collectThrowFCsInNode(sf, fn) : [];
      const fcCtxUnion = new Set();
      for (const t of throwsInFunc) {
        for (const k of t.ctxKeys) fcCtxUnion.add(k);
      }
      const explicit = new Set(c.ctxKeys);
      let recommendedAdd = candidates.filter((n) => !explicit.has(n) && !fcCtxUnion.has(n));
      if (recommendedAdd.length === 0) continue;

      // Map adminId → callerUid: 既に context に callerUid があるなら adminId を足さない
      const namesToAdd = new Set(recommendedAdd);
      if (explicit.has("callerUid")) {
        namesToAdd.delete("adminId");
      }
      for (const n of [...namesToAdd]) {
        if (n === "adminId") {
          if (!isVisibleName("adminId", c.node, sf)) namesToAdd.delete("adminId");
        } else if (!isVisibleName(n, c.node, sf)) {
          namesToAdd.delete(n);
        }
      }
      if (namesToAdd.size === 0) continue;

      for (const k of [...namesToAdd]) {
        if (k !== "adminId" && explicit.has(k)) namesToAdd.delete(k);
      }
      if (namesToAdd.size === 0) continue;

      const props = buildContextPropsToAdd(namesToAdd);
      if (props.length === 0) continue;

      const first = c.firstArg;
      const ctxInit = findContextObject(sf, first);
      const newPropsText = props
        .map((p) => {
          if (p.isShorthand) return p.key;
          return `${p.key}: ${p.valueText}`;
        })
        .join(", ");

      const start = ctxInit
        ? ctxInit.getStart(sf)
        : null;
      const end = ctxInit ? ctxInit.getEnd(sf) : null;

      if (ctxInit && ts.isObjectLiteralExpression(ctxInit)) {
        const inner = ctxInit;
        if (inner.properties.length === 0) {
          edits.push({ pos: inner.getStart(sf) + 1, end: inner.getStart(sf) + 1, text: newPropsText });
        } else {
          const last = inner.properties[inner.properties.length - 1];
          const insertPos = last.getEnd(sf);
          edits.push({ pos: insertPos, end: insertPos, text: `, ${newPropsText}` });
        }
        changeCount++;
      } else {
        const hasTrailing = first.properties.length > 0;
        const lastProp = first.properties[first.properties.length - 1];
        const insertAt = lastProp.getEnd(sf);
        const prefix = hasTrailing ? ", " : " ";
        const text = `${prefix}context: { ${newPropsText} }`;
        edits.push({ pos: insertAt, end: insertAt, text });
        changeCount++;
      }
    }

    if (edits.length === 0) continue;
    if (dryRun) {
      console.log(rel, edits.length, "edits");
      fileEdits++;
      continue;
    }
    // sort edits by position descending
    edits.sort((a, b) => b.pos - a.pos);
    let newContent = content;
    for (const e of edits) {
      newContent = newContent.slice(0, e.pos) + e.text + newContent.slice(e.end);
    }
    fs.writeFileSync(filePath, newContent, "utf8");
    fileEdits++;
  }
  console.log(dryRun ? `dry-run: ${fileEdits} files (would change)` : `wrote: ${fileEdits} files, ${changeCount} logOpsError sites`);
}

main();
