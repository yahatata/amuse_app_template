/**
 * 静的に errorSource === function_custom と言い切れる logOpsError 呼び出しを数える。
 * 定義は docs/.../実装ベース精査_function_custom_20260408.md §1 に準拠:
 * - 引数オブジェクトに errorKey の文字列リテラル
 * - または errorSource: 'function_custom'
 * - または if (… instanceof FunctionCustomError) の then 節内のみの呼び出し
 *
 * 使い方（functions ディレクトリで）:
 *   node scripts/countStaticFunctionCustomLogOps.cjs
 *   EXCLUDE_MAIN_TARGETS=1 node scripts/countStaticFunctionCustomLogOps.cjs
 *   EXCLUDE_MAIN_TARGETS=1 は旧 generateDummyData / debugSideGame 除外用。当該 source 削除済みのため no-op。
 */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "src");

const EXCLUDE_DIRS = new Set(["node_modules"]);

const EXCLUDE_FILES_MAIN_TARGETS = new Set([]);

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

function buildParentMap(sourceFile) {
  const parentMap = new Map();
  function walk(node, parent) {
    parentMap.set(node, parent);
    ts.forEachChild(node, (child) => walk(child, node));
  }
  walk(sourceFile, undefined);
  return parentMap;
}

function getPropertyName(pn) {
  if (ts.isIdentifier(pn)) return pn.text;
  if (ts.isStringLiteral(pn)) return pn.text;
  return "";
}

/** then 節（else を含まない）に node が含まれるか */
function isInThenBranch(ifStmt, node, parentMap) {
  const thenStmt = ifStmt.thenStatement;
  return isStrictDescendant(node, thenStmt, parentMap);
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

function isStaticFunctionCustomLogOps(callExpr, parentMap, sourceFile) {
  if (!ts.isCallExpression(callExpr)) return false;
  const fn = callExpr.expression;
  if (!ts.isIdentifier(fn) || fn.text !== "logOpsError") return false;

  const arg0 = callExpr.arguments[0];
  if (!arg0 || !ts.isObjectLiteralExpression(arg0)) return false;

  for (const prop of arg0.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = getPropertyName(prop.name);
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

function main() {
  const excludeMain = process.env.EXCLUDE_MAIN_TARGETS === "1";
  const files = walkTsFiles(ROOT).filter((f) => {
    if (!excludeMain) return true;
    const norm = path.normalize(f);
    return !EXCLUDE_FILES_MAIN_TARGETS.has(norm);
  });

  const hits = [];
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const parentMap = buildParentMap(sf);

    function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "logOpsError") {
        if (isStaticFunctionCustomLogOps(node, parentMap, sf)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          hits.push({ file: path.relative(path.join(__dirname, ".."), filePath), line: line + 1 });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }

  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  console.log(JSON.stringify({ count: hits.length, excludeMainTargets: excludeMain }, null, 2));
  if (process.env.LIST === "1") {
    hits.forEach((h) => console.log(`${h.file}:${h.line}`));
  }
}

main();
