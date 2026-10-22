/**
 * logOpsError を (functionEntry, operationKey) で正規化。
 * - operation プロパティなし → operationKey = ""
 * - operation あり → operationKey = 式のソース断片（リテラルはその値）
 *
 * 除外: node_modules
 */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "src");
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
  const start = init.getStart(sf);
  const end = init.getEnd();
  return sf.text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 80);
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
    const unitKey = `${c.functionEntry}\t${c.hasOperationProperty ? c.operationKey : ""}`;
    if (!unitMap.has(unitKey)) {
      unitMap.set(unitKey, {
        functionEntry: c.functionEntry,
        operationDisplay: c.hasOperationProperty ? c.operationKey || "(empty)" : "",
        hasOperationProperty: c.hasOperationProperty,
        callCount: 0,
        sampleLines: [],
      });
    }
    const u = unitMap.get(unitKey);
    u.callCount += 1;
    if (u.sampleLines.length < 3) u.sampleLines.push(`${c.file}:${c.line}`);
  }
  console.log(JSON.stringify({ totalCalls: all.length, unitCount: unitMap.size, units: [...unitMap.values()] }, null, 2));
}

main();
