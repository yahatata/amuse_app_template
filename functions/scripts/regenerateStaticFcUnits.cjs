/**
 * Regenerate functions/scripts/generated/_staticFcUnits.json from current source.
 * Same walk scope as extractLogOpsJudgmentUnits.cjs.
 *
 * Usage (from functions/):
 *   node scripts/regenerateStaticFcUnits.cjs
 */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "src");
const OUT = path.join(__dirname, "generated", "_staticFcUnits.json");
const EXCLUDE_DIRS = new Set(["node_modules"]);

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
  const lit = ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) ? init.text : null;
  if (lit !== null) return lit;
  const sf = init.getSourceFile();
  return sf.text.slice(init.getStart(sf), init.getEnd()).replace(/\s+/g, " ").trim();
}

function buildParentMap(sourceFile) {
  const parentMap = new Map();
  function walk(node, parent) {
    parentMap.set(node, parent);
    ts.forEachChild(node, (child) => walk(child, node));
  }
  walk(sourceFile, undefined);
  return parentMap;
}

function isInThenBranch(ifStmt, node, parentMap) {
  return isStrictDescendant(node, ifStmt.thenStatement, parentMap);
}

function isStrictDescendant(node, ancestor, parentMap) {
  let cur = node;
  while (cur) {
    if (cur === ancestor) return true;
    cur = parentMap.get(cur);
  }
  return false;
}

function isInstanceOfFunctionCustomErrorCondition(expr) {
  if (!ts.isBinaryExpression(expr)) return false;
  if (expr.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword) return false;
  const right = expr.right;
  return ts.isIdentifier(right) && right.text === "FunctionCustomError";
}

function isStaticFunctionCustomLogOps(callExpr, parentMap) {
  const arg0 = callExpr.arguments[0];
  if (!arg0 || !ts.isObjectLiteralExpression(arg0)) return false;
  for (const prop of arg0.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = getPropName(prop.name);
    if (key === "errorKey" && ts.isStringLiteral(prop.initializer)) return true;
    if (key === "errorSource" && ts.isStringLiteral(prop.initializer)) {
      if (prop.initializer.text === "function_custom") return true;
    }
  }
  let cur = callExpr;
  while (cur) {
    const p = parentMap.get(cur);
    if (!p) break;
    if (ts.isIfStatement(p) && isInstanceOfFunctionCustomErrorCondition(p.expression)) {
      if (isInThenBranch(p, callExpr, parentMap)) return true;
    }
    cur = p;
  }
  return false;
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
  return { functionEntry, operationKey, hasOperationProperty };
}

function collect(sf, rel) {
  const parentMap = buildParentMap(sf);
  const out = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === "logOpsError") {
        const props = extractProps(node.arguments[0]);
        if (!props || !props.functionEntry) return;
        out.push({
          functionEntry: props.functionEntry,
          operationKey: props.operationKey,
          hasOperationProperty: props.hasOperationProperty,
          staticFc: isStaticFunctionCustomLogOps(node, parentMap),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}

function main() {
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
    const op = c.hasOperationProperty ? c.operationKey : "";
    const unitKey = `${c.functionEntry}\t${op}`;
    if (!unitMap.has(unitKey)) {
      unitMap.set(unitKey, { fe: c.functionEntry, op, total: 0, staticCount: 0 });
    }
    const u = unitMap.get(unitKey);
    u.total += 1;
    if (c.staticFc) u.staticCount += 1;
  }

  const rows = [...unitMap.values()]
    .sort((a, b) => a.fe.localeCompare(b.fe) || a.op.localeCompare(b.op))
    .map((u) => ({
      fe: u.fe,
      op: u.op,
      total: u.total,
      staticFc: u.staticCount === u.total && u.total > 0 ? 1 : 0,
      label: u.staticCount === u.total && u.total > 0 ? "FC静（全呼び出し）" : "—",
    }));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  console.log("Wrote:", OUT, "units:", rows.length);
}

main();
