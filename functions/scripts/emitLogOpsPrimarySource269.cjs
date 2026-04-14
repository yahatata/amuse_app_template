/**
 * Step2-1 と同一スコープの logOpsError 呼び出しを実コードから列挙し、
 * 一次情報（相対パス:行・親の関数／メソッド等）付き Markdown を出力する。
 *
 * 業務説明は書かない。判断メモ・仕様書は参照しない。
 */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "src");
const EXCLUDE_DIRS = new Set(["node_modules", "debug", "demo_data", "unused_function_lib"]);
const EXCLUDE_FILES = new Set([
  path.normalize(path.join(ROOT, "domains/analytics/callables/generateDummyData.ts")),
  path.normalize(path.join(ROOT, "domains/sideGame/callables/debugSideGame.ts")),
]);

const GENERATED_DIR = path.join(__dirname, "generated");
const OUT = path.join(
  GENERATED_DIR,
  "重要度判定_Step2-1_269件_一次情報（ソース）.md"
);

function walkTsFiles(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      walkTsFiles(full, list);
    } else if (ent.isFile() && ent.name.endsWith(".ts")) {
      if (EXCLUDE_FILES.has(path.normalize(full))) continue;
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
  return sf.text.slice(init.getStart(sf), init.getEnd()).replace(/\s+/g, " ").trim().slice(0, 120);
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

/** logOpsError 呼び出し式から、実コード上の「どの関数／メソッド内か」を推定 */
function enclosingCallableLabel(callExpr) {
  let n = callExpr.parent;
  while (n) {
    if (ts.isFunctionDeclaration(n) && n.name) {
      return `function ${n.name.text}`;
    }
    if (ts.isMethodDeclaration(n)) {
      const owner = n.parent;
      if (ts.isClassDeclaration(owner) && owner.name) {
        return `${owner.name.text}.${n.name.getText()}`;
      }
      return `method ${n.name.getText()}`;
    }
    if (ts.isConstructorDeclaration(n)) {
      return "constructor";
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      // export const foo = onCall(..., async (req) => { ... logOps ... })
      if (n.parent && ts.isCallExpression(n.parent)) {
        const ce = n.parent;
        if (ts.isIdentifier(ce.expression) && (ce.expression.text === "onCall" || ce.expression.text === "onRequest")) {
          const vd = ce.parent;
          if (ts.isVariableDeclaration(vd) && ts.isIdentifier(vd.name)) {
            return `export const ${vd.name.text} (inner: ${ce.expression.text} handler)`;
          }
        }
      }
      if (n.parent && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) {
        return `const ${n.parent.name.text}`;
      }
      if (n.parent && ts.isVariableDeclarationList(n.parent) && n.parent.parent && ts.isVariableDeclaration(n.parent.parent)) {
        const vd = n.parent.parent;
        if (ts.isIdentifier(vd.name)) return `const ${vd.name.text}`;
      }
      if (ts.isPropertyAssignment(n.parent) && ts.isIdentifier(n.parent.name)) {
        return `prop ${n.parent.name.text}`;
      }
      if (ts.isPropertyDeclaration(n.parent) && n.parent.name) {
        return `classProp ${n.parent.name.getText()}`;
      }
      if (ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = n.parent.left;
        if (ts.isIdentifier(left)) return `assign ${left.text}`;
      }
      return "(anonymous)";
    }
    if (ts.isSourceFile(n)) {
      return "(module)";
    }
    n = n.parent;
  }
  return "";
}

function domainHint(relPath) {
  const m = relPath.match(/domains\/([^/]+)/);
  return m ? m[1] : "";
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
        const line = pos.line + 1;
        const opDisplay = props.hasOperationProperty ? props.operationKey || "(expression)" : "";
        out.push({
          file: rel,
          line,
          functionEntry: props.functionEntry,
          operationDisplay: opDisplay,
          hasOperation: props.hasOperationProperty,
          enclosing: enclosingCallableLabel(node),
          domain: domainHint(rel),
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

  all.sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.functionEntry.localeCompare(b.functionEntry)
  );

  const nCalls = all.length;
  const unitMap = new Map();
  for (const c of all) {
    const ukey = `${c.functionEntry}\t${c.hasOperation ? c.operationDisplay : ""}`;
    if (!unitMap.has(ukey)) {
      unitMap.set(ukey, {
        functionEntry: c.functionEntry,
        operation: c.hasOperation ? c.operationDisplay : "",
        lines: [],
        samples: [],
      });
    }
    const u = unitMap.get(ukey);
    const loc = `${c.file}:${c.line}`;
    u.lines.push(loc);
    if (u.samples.length < 5) {
      u.samples.push({ loc, enclosing: c.enclosing, domain: c.domain });
    }
  }

  let md = `# 重要度判定 Step 2-1: 269 件スコープ・一次情報（ソース）

- **一次情報の定義**: \`functions/src\` 上の \`logOpsError\` **呼び出し箇所**（ファイルパス・行番号）および TypeScript AST から取得した **親の関数／メソッド等のラベル**。業務判断メモや仕様書は用いない。
- **除外**: \`debug\` / \`demo_data\` / \`unused_function_lib\` を除く。 \`generateDummyData.ts\` / \`debugSideGame.ts\` を除く（Step2-1 と同一）。
- **呼び出し総数**: ${nCalls}（Step2-1 の「269 件」と一致させる前提）
- **判定単位**: \`operation\` なし → \`functionEntry\` のみ。 \`operation\` あり → \`functionEntry\` + \`operation\`（式はソース断片どおり）。同一単位に複数行がある場合は **代表行** を最大 5 件まで列挙し、**全行**は別表記。

## 1. 呼び出し行ごと（${nCalls} 行）

| # | ソース（相対パス:行） | domains 配下 | コード上の包含（AST） | functionEntry | operation |
|---|----------------------|--------------|----------------------|---------------|-----------|
`;

  all.forEach((c, i) => {
    const opCol = c.hasOperation ? `\`${c.operationDisplay.replace(/\|/g, "\\|")}\`` : "";
    const enc = (c.enclosing || "").replace(/\|/g, "\\|");
    const dom = c.domain || "—";
    md += `| ${i + 1} | \`${c.file}:${c.line}\` | ${dom} | ${enc} | \`${c.functionEntry}\` | ${opCol} |\n`;
  });

  md += `
## 2. 判定単位ごと（functionEntry + operation の正規化・${unitMap.size} 単位）

同一 \`functionEntry\` / \`operation\` に複数呼び出しがある場合のまとめ。**詳細は実コードの「全ソース行」列を参照。**

| # | functionEntry | operation | 代表ソース（最大5）・包含（AST） | 全ソース行（カンマ区切り） |
|---|---------------|-----------|-----------------------------------|---------------------------|
`;

  const units = [...unitMap.entries()].sort((a, b) =>
    a[1].functionEntry.localeCompare(b[1].functionEntry) || String(a[1].operation).localeCompare(String(b[1].operation))
  );

  units.forEach(([k, u], i) => {
    const rep = u.samples
      .map((s) => `\`${s.loc}\` (${s.enclosing || "?"})`)
      .join("<br>");
    const allLocs = u.lines.map((l) => `\`${l}\``).join(", ");
    const opEsc = u.operation ? `\`${u.operation.replace(/\|/g, "\\|")}\`` : "";
    md += `| ${i + 1} | \`${u.functionEntry}\` | ${opEsc} | ${rep} | ${allLocs} |\n`;
  });

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(OUT, md, "utf8");
  console.log("Wrote:", OUT);
  console.log("calls:", nCalls, "units:", unitMap.size);
}

main();
