/**
 * 269 件スコープの logOpsError について、context の十分性を静的解析する。
 *
 * 出力: docs/エラーログ運用/logOps/調査269件/エラーログ_context調査_269件.md
 *
 * 解析内容（AST ベース）:
 *  1) logOpsError 呼び出しごとに
 *     - file:line
 *     - functionEntry / operation（文字列リテラルのときは値、式のときはソース断片）
 *     - 明示 context のキー一覧（取得できた範囲）
 *     - cause の有無
 *     - この呼び出しを囲う catch 節の形（FC 専用 / 非 FC / 両方混在 / catch 外）
 *  2) 同ファイル内の FunctionCustomError throw を列挙し
 *     - errorKey（文字列リテラルのとき）
 *     - throw 時 context のキー一覧
 *     から、この呼び出しに到達しうる候補を併記
 *  3) マージ後の context キー一覧（近似）を列挙し、不足有無をヒューリスティックで注記
 *
 * 注意:
 *  - 到達可能性は「同ファイル・同一関数（logOpsError の外側関数）内の throw FC」を候補として列挙する近似。
 *    例外的に、FC が別ファイルで throw されるケース（リポジトリの設計上は少数）はここでは「候補列挙 = 0」となりうる。
 *  - 動的 operation / 動的 errorKey はソース断片として記録。
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

const OUT = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "エラーログ運用",
  "logOps",
  "調査269件",
  "エラーログ_context調査_269件.md"
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

/** object literal から { キー名 → { kind: 'literal'|'shorthand'|'expr', text } } */
function extractObjectKeys(sf, objLit) {
  const keys = [];
  if (!objLit || !ts.isObjectLiteralExpression(objLit)) return keys;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p)) {
      keys.push({ name: propName(p.name), kind: "assign" });
    } else if (ts.isShorthandPropertyAssignment(p)) {
      keys.push({ name: p.name.text, kind: "shorthand" });
    } else if (ts.isSpreadAssignment(p)) {
      keys.push({ name: `...${exprSnippet(sf, p.expression)}`, kind: "spread" });
    }
  }
  return keys;
}

function findContextObject(sf, objLit) {
  if (!objLit || !ts.isObjectLiteralExpression(objLit)) return null;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p) && propName(p.name) === "context") {
      return p.initializer;
    }
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

/**
 * 直近の try 文を取得し、その catch 節の分岐（FC 専用 / 非 FC）を把握する
 */
function enclosingCatchInfo(callNode) {
  let n = callNode.parent;
  let catchClause = null;
  while (n) {
    if (ts.isCatchClause(n)) {
      catchClause = n;
      break;
    }
    if (ts.isFunctionLike(n)) break;
    n = n.parent;
  }
  if (!catchClause) return { inCatch: false, catchClause: null, isFcBranch: false, hasFcCheck: false };

  const inCatch = true;

  // catch 内で logOpsError までに instanceof FunctionCustomError の条件分岐があるかを見る
  let hasFcCheck = false;
  let isFcBranch = false;
  const walk = (node, depth) => {
    if (!node || depth > 20) return;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken &&
      node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
      ts.isIdentifier(node.right) &&
      node.right.text === "FunctionCustomError"
    ) {
      hasFcCheck = true;
    }
    ts.forEachChild(node, (c) => walk(c, depth + 1));
  };
  walk(catchClause.block, 0);

  // logOpsError を含む if ブロックが instanceof FunctionCustomError 条件下かを判定
  let cur = callNode.parent;
  while (cur && cur !== catchClause) {
    if (ts.isIfStatement(cur)) {
      const cond = cur.expression;
      const condText = exprSnippet(callNode.getSourceFile(), cond);
      if (/instanceof\s+FunctionCustomError/.test(condText)) {
        // if ブロック内に属しているか（else ではなく）
        const stmt = cur.thenStatement;
        const containsCall = (function contains(node, target) {
          if (!node) return false;
          if (node === target) return true;
          let found = false;
          ts.forEachChild(node, (c) => {
            if (found) return;
            if (contains(c, target)) found = true;
          });
          return found;
        })(stmt, callNode);
        if (containsCall) {
          isFcBranch = true;
          break;
        }
      }
    }
    cur = cur.parent;
  }

  return { inCatch, catchClause, isFcBranch, hasFcCheck };
}

function enclosingFunctionNode(callNode) {
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
      let errorKey = null;
      let ctxKeys = [];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const keyInit = getPropInitializer(arg, "errorKey");
        errorKey = literalString(keyInit) || exprSnippet(sf, keyInit);
        const ctxInit = getPropInitializer(arg, "context");
        ctxKeys = extractObjectKeys(sf, ctxInit).map((k) => k.name);
      }
      const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ line: pos.line + 1, errorKey, ctxKeys });
    }
    ts.forEachChild(node, visit);
  }
  visit(container);
  return out;
}

function collect(sf, rel) {
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === "logOpsError") {
        const first = node.arguments[0];
        if (first && ts.isObjectLiteralExpression(first)) {
          const functionEntry = literalString(getPropInitializer(first, "functionEntry"));
          if (functionEntry) {
            const opInit = getPropInitializer(first, "operation");
            const opHas = opInit !== null;
            const opDisplay = opInit
              ? literalString(opInit) || exprSnippet(sf, opInit)
              : "";
            const ctxInit = findContextObject(sf, first);
            const ctxKeys = extractObjectKeys(sf, ctxInit).map((k) => k.name);
            const ctxHas = ctxInit !== null;
            const hasCause = hasCauseProperty(first);
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            calls.push({
              node,
              file: rel,
              line: pos.line + 1,
              functionEntry,
              operationDisplay: opDisplay,
              hasOperation: opHas,
              ctxHas,
              ctxKeys,
              hasCause,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return calls;
}

function mdEscape(s) {
  return String(s || "").replace(/\|/g, "\\|");
}

function main() {
  const files = walkTsFiles(ROOT);
  /** @type {Array<ReturnType<typeof collect>[number] & {throws: Array<{line:number, errorKey:string|null, ctxKeys:string[]}>, catchInfo:any}>} */
  const records = [];
  let fileFcMap = new Map();

  for (const filePath of files) {
    const rel = path.relative(path.join(__dirname, ".."), filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const calls = collect(sf, rel);
    if (calls.length === 0) continue;

    // ファイル内のすべての FC throw を事前収集
    const allFcs = collectThrowFCsInNode(sf, sf);
    fileFcMap.set(rel, allFcs);

    for (const c of calls) {
      const fnNode = enclosingFunctionNode(c.node);
      const throwsInFunc = fnNode ? collectThrowFCsInNode(sf, fnNode) : [];
      const catchInfo = enclosingCatchInfo(c.node);
      records.push({ ...c, throws: throwsInFunc, catchInfo });
    }
  }

  records.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.functionEntry.localeCompare(b.functionEntry)
  );

  // 分類カウント
  const stats = {
    total: records.length,
    fcBranch: 0,
    genericBranch: 0,
    noCatch: 0,
    withExplicitContext: 0,
    withCause: 0,
  };
  for (const r of records) {
    if (!r.catchInfo.inCatch) stats.noCatch++;
    if (r.catchInfo.isFcBranch) stats.fcBranch++;
    else if (r.catchInfo.inCatch) stats.genericBranch++;
    if (r.ctxHas) stats.withExplicitContext++;
    if (r.hasCause) stats.withCause++;
  }

  // Markdown 出力
  const lines = [];
  lines.push(`# エラーログ context 調査（269 件スコープ）`);
  lines.push("");
  lines.push(`- **対象**: \`functions/src\` の \`logOpsError\` 呼び出しのうち、Step2-1 と同一スコープ（269 件）`);
  lines.push(`- **手法**: TypeScript AST による静的解析`);
  lines.push(`  - 各 \`logOpsError\` 呼び出しについて、 \`functionEntry\` / \`operation\` / 明示 \`context\` のキー / \`cause\` の有無 / 囲う catch の形を抽出`);
  lines.push(`  - 同一関数内の \`throw new FunctionCustomError({ errorKey, context })\` を列挙し、到達しうる FC 候補として併記（近似）`);
  lines.push(`  - マージ後の context キー（近似）= **throw 時の context キー ∪ logOpsError 呼び出しの明示 context キー**`);
  lines.push(`- **除外**: \`debug\` / \`demo_data\` / \`unused_function_lib\`、\`generateDummyData.ts\`、\`debugSideGame.ts\``);
  lines.push(`- **生成スクリプト**: \`functions/scripts/auditLogOpsErrorContext269.cjs\``);
  lines.push("");
  lines.push(`## サマリ`);
  lines.push("");
  lines.push(`- 呼び出し総数: **${stats.total}**`);
  lines.push(`- うち \`catch\` 内: **${stats.total - stats.noCatch}** / \`catch\` 外: **${stats.noCatch}**`);
  lines.push(`- うち \`instanceof FunctionCustomError\` ブランチ内の呼び出し: **${stats.fcBranch}**`);
  lines.push(`- うち 非 FC / 汎用 catch 側の呼び出し: **${stats.genericBranch}**`);
  lines.push(`- 明示 \`context: { ... }\` を持つ呼び出し: **${stats.withExplicitContext}** / 持たない: **${stats.total - stats.withExplicitContext}**`);
  lines.push(`- \`cause\` を渡している呼び出し: **${stats.withCause}**`);
  lines.push("");
  lines.push(`## 読み方`);
  lines.push("");
  lines.push(`- **分類**`);
  lines.push(`  - \`FC\`: \`if (error instanceof FunctionCustomError)\` 直下の \`logOpsError\``);
  lines.push(`  - \`非FC\`: \`FC\` ブランチ外（汎用 catch、型チェック無しなど）`);
  lines.push(`  - \`catch 外\`: try/catch に囲まれていない場所（応答 not ok 分岐等）`);
  lines.push(`- **明示 context**: 呼び出し引数に \`context: { ... }\` を書いている場合のキー（順序は記載順）`);
  lines.push(`- **到達しうる FC**: 同一関数内の \`throw new FunctionCustomError\` を列挙（近似。別ファイル throw は含めない）`);
  lines.push(`- **マージ後 context キー候補**: その FC に到達した場合にログに載る想定のキー（近似）`);
  lines.push("");
  lines.push(`## 1. 呼び出しごとの一覧（${stats.total} 行）`);
  lines.push("");
  lines.push(`| # | ソース | functionEntry | operation | 分類 | 明示 context キー | cause |`);
  lines.push(`|---|--------|---------------|-----------|------|-------------------|-------|`);
  records.forEach((r, i) => {
    const cls = !r.catchInfo.inCatch ? "catch 外" : r.catchInfo.isFcBranch ? "FC" : "非FC";
    const ctx = r.ctxHas ? r.ctxKeys.join(", ") : "(なし)";
    const op = r.hasOperation ? `\`${mdEscape(r.operationDisplay)}\`` : "";
    lines.push(
      `| ${i + 1} | \`${r.file}:${r.line}\` | \`${r.functionEntry}\` | ${op} | ${cls} | ${mdEscape(ctx)} | ${r.hasCause ? "✓" : ""} |`
    );
  });

  lines.push("");
  lines.push(`## 2. FC ブランチの詳細（到達しうる errorKey とマージ後キー）`);
  lines.push("");
  lines.push(`各 FC ブランチについて、**同一関数内の \`throw new FunctionCustomError\`** を列挙する。errorKey ごとにマージ後キー（近似）を示す。`);
  lines.push("");
  lines.push(`| # | ソース | functionEntry / operation | 明示 context | errorKey (throw 行) | throw 時 context キー | マージ後 context キー候補（近似） |`);
  lines.push(`|---|--------|---------------------------|---------------|---------------------|---------------------|---------------------------------|`);
  let idx = 0;
  for (const r of records) {
    if (!r.catchInfo.isFcBranch) continue;
    const callerCtx = r.ctxHas ? r.ctxKeys : [];
    const fcCandidates = r.throws;
    if (fcCandidates.length === 0) {
      idx++;
      lines.push(
        `| ${idx} | \`${r.file}:${r.line}\` | \`${r.functionEntry}\`${r.hasOperation ? ` / \`${mdEscape(r.operationDisplay)}\`` : ""} | ${mdEscape(callerCtx.join(", ") || "(なし)")} | (同関数内の FC throw 検出なし) | — | ${mdEscape(callerCtx.join(", ") || "(なし)")} |`
      );
      continue;
    }
    for (const fc of fcCandidates) {
      idx++;
      const merged = [...new Set([...(fc.ctxKeys || []), ...callerCtx])];
      const key = fc.errorKey ? `\`${mdEscape(fc.errorKey)}\` (L${fc.line})` : `(式) L${fc.line}`;
      lines.push(
        `| ${idx} | \`${r.file}:${r.line}\` | \`${r.functionEntry}\`${r.hasOperation ? ` / \`${mdEscape(r.operationDisplay)}\`` : ""} | ${mdEscape(callerCtx.join(", ") || "(なし)")} | ${key} | ${mdEscape((fc.ctxKeys || []).join(", ") || "(なし)")} | ${mdEscape(merged.join(", ") || "(なし)")} |`
      );
    }
  }

  lines.push("");
  lines.push(`## 3. 非 FC / catch 外 の詳細（呼び出しごとのキー）`);
  lines.push("");
  lines.push(`非 FC ブランチおよび catch 外の \`logOpsError\`（\`cause\` が FC のときのみ FC の \`context\` が併記される可能性がある）。`);
  lines.push(`\`cause\` 経由で FC のキーが載るケースは **「同一関数内の FC throw」を参考値**として右側に示す（非 FC 側から到達するとは限らない）。`);
  lines.push("");
  lines.push(`| # | ソース | functionEntry / operation | 明示 context | cause | 同関数の FC throw（参考） |`);
  lines.push(`|---|--------|---------------------------|---------------|-------|---------------------------|`);
  let jdx = 0;
  for (const r of records) {
    if (r.catchInfo.isFcBranch) continue;
    jdx++;
    const callerCtx = r.ctxHas ? r.ctxKeys.join(", ") : "(なし)";
    const fcList = r.throws
      .map((fc) => `${fc.errorKey || "(式)"}[${(fc.ctxKeys || []).join(",") || "-"}]`)
      .join(" / ");
    lines.push(
      `| ${jdx} | \`${r.file}:${r.line}\` | \`${r.functionEntry}\`${r.hasOperation ? ` / \`${mdEscape(r.operationDisplay)}\`` : ""} | ${mdEscape(callerCtx)} | ${r.hasCause ? "✓" : ""} | ${mdEscape(fcList || "—")} |`
    );
  }

  lines.push("");
  lines.push(`## 4. 所見（自動集計）`);
  lines.push("");
  const noCtxNoFc = records.filter((r) => !r.ctxHas && (!r.catchInfo.isFcBranch || r.throws.length === 0));
  lines.push(`- **明示 context なし ＋ FC 到達候補なし（または非 FC）**: ${noCtxNoFc.length} 件`);
  lines.push(`  - このカテゴリは \`payload.context\` が空になり得るため、相関キーの観点で**要確認**。`);
  const callerOnly = records.filter((r) => r.ctxHas && (!r.catchInfo.isFcBranch || r.throws.length === 0));
  lines.push(`- **明示 context あり ＋ FC 到達候補なし（または非 FC）**: ${callerOnly.length} 件`);
  lines.push(`  - 呼び出しに書かれたキーだけが \`context\` に載る。相関十分性は **呼び出しのキー集合**で判定できる。`);
  const fcWithThrow = records.filter((r) => r.catchInfo.isFcBranch && r.throws.length > 0);
  lines.push(`- **FC ブランチ ＋ 同関数内 FC throw あり**: ${fcWithThrow.length} 件`);
  lines.push(`  - **errorKey ごと**に throw 時の context が異なり得る。上表 §2 を基準に errorKey 単位で判定が必要。`);
  lines.push("");
  lines.push(`> 本書は機械的な近似情報である。最終的な「相関キー十分性」は、ドメインごとに定めた**最小相関キー**（例: \`userId\`, \`billId\`, \`deviceId\`, \`tournamentId\`, \`templateId\` 等）と §1–§3 の実キーを突き合わせて判断する。`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log("Wrote:", OUT);
  console.log("total logOpsError calls in 269 scope:", stats.total);
}

main();
