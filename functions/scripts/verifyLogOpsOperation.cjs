/**
 * ポリシー:
 * - 同一 functionEntry（文字列リテラル）に対する logOpsError 呼び出しが 2 回以上ある場合、
 *   各呼び出しに operation プロパティが必須（値は任意式可。例: 関数呼び出し）。
 * - operation が文字列リテラルの呼び出し同士では、値の重複禁止（同一 functionEntry スコープ）。
 *
 * 使い方（functions ディレクトリで）:
 *   node scripts/verifyLogOpsOperation.cjs
 *
 * 除外: src/node_modules
 */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "src");

const DEFAULT_EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
]);

function walkTsFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (DEFAULT_EXCLUDE_DIR_NAMES.has(ent.name)) continue;
      walkTsFiles(full, list);
    } else if (ent.isFile() && ent.name.endsWith(".ts")) {
      list.push(full);
    }
  }
  return list;
}

function stringFromExpression(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function extractLogOpsArgProps(arg) {
  if (!ts.isObjectLiteralExpression(arg)) return null;
  let functionEntry = null;
  let operationLiteral = null;
  let hasOperationProperty = false;
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name;
    let key = null;
    if (ts.isIdentifier(name)) key = name.text;
    else if (ts.isStringLiteral(name)) key = name.text;
    if (!key) continue;
    if (key === "functionEntry") functionEntry = stringFromExpression(prop.initializer);
    if (key === "operation") {
      hasOperationProperty = true;
      const lit = stringFromExpression(prop.initializer);
      if (lit !== null) operationLiteral = lit;
    }
  }
  return { functionEntry, operationLiteral, hasOperationProperty };
}

function collectCalls(sf) {
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === "logOpsError") {
        const args = node.arguments;
        const first = args[0];
        const props = extractLogOpsArgProps(first);
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        calls.push({
          line: pos.line + 1,
          functionEntry: props ? props.functionEntry : null,
          operationLiteral: props ? props.operationLiteral : null,
          hasOperationProperty: props ? props.hasOperationProperty : false,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return calls;
}

function main() {
  const files = walkTsFiles(ROOT);
  /** @type {Map<string, Array<{file: string, line: number, operationLiteral: string|null, hasOperationProperty: boolean}>>} */
  const byFe = new Map();

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const rel = path.relative(path.join(__dirname, ".."), filePath);
    const sf = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const calls = collectCalls(sf);
    for (const c of calls) {
      if (!c.functionEntry) continue;
      const list = byFe.get(c.functionEntry) || [];
      list.push({
        file: rel,
        line: c.line,
        operationLiteral: c.operationLiteral,
        hasOperationProperty: c.hasOperationProperty,
      });
      byFe.set(c.functionEntry, list);
    }
  }

  const errors = [];
  for (const [fe, list] of byFe) {
    if (list.length < 2) continue;
    const missing = list.filter((x) => !x.hasOperationProperty);
    for (const m of missing) {
      errors.push(
        `${m.file}:${m.line}  functionEntry "${fe}" に対し logOpsError が複数あるが operation 未指定`
      );
    }
    const withLit = list.filter((x) => x.operationLiteral !== null);
    const seen = new Map();
    for (const x of withLit) {
      const k = x.operationLiteral;
      if (seen.has(k)) {
        const first = seen.get(k);
        errors.push(
          `${x.file}:${x.line}  functionEntry "${fe}" で operation 文字列 "${k}" が重複（先: ${first.file}:${first.line}）`
        );
      } else {
        seen.set(k, { file: x.file, line: x.line });
      }
    }
  }

  if (errors.length) {
    console.error("verifyLogOpsOperation: 失敗\n");
    for (const e of errors) console.error(e);
    console.error(`\n合計 ${errors.length} 件`);
    process.exit(1);
  }
  console.log("verifyLogOpsOperation: OK（複数 logOpsError の functionEntry について operation 必須・文字列リテラル operation の一意）");
}

main();
