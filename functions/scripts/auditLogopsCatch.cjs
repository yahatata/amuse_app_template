/**
 * AST 走査: 各 catch ブロック内に logOpsError(...) があるか。
 *
 * 使い方（functions ディレクトリで）:
 *   node scripts/auditLogopsCatch.cjs
 *   node scripts/auditLogopsCatch.cjs --missing-only
 *   node scripts/auditLogopsCatch.cjs --json
 *   AUDIT_EXCLUDE=debug,demo_data node scripts/auditLogopsCatch.cjs
 *
 * 「操作単位」: 構文上は CatchClause 1 つ = 1 行。ポリシー上「必ず logOpsError が要る」かは別判断
 * （--suspect は throw new HttpsError + internal/failed-precondition を含む catch で logOpsError が無いものに絞る）。
 */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "src");

const DEFAULT_EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  "debug",
  "demo_data",
]);

function parseArgs(argv) {
  const flags = {
    missingOnly: argv.includes("--missing-only"),
    json: argv.includes("--json"),
    suspect: argv.includes("--suspect"),
  };
  return flags;
}

function shouldExcludeDir(name, extra) {
  if (DEFAULT_EXCLUDE_DIR_NAMES.has(name)) return true;
  if (extra.has(name)) return true;
  return false;
}

function walkTsFiles(dir, list = [], extraExclude) {
  if (!fs.existsSync(dir)) return list;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (shouldExcludeDir(ent.name, extraExclude)) continue;
      walkTsFiles(full, list, extraExclude);
    } else if (ent.isFile() && ent.name.endsWith(".ts")) {
      list.push(full);
    }
  }
  return list;
}

function getExtraExcludeFromEnv() {
  const raw = process.env.AUDIT_EXCLUDE || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** catch ブロック AST 以下に logOpsError(...) 呼び出しがあるか */
function blockContainsLogOpsErrorCall(block) {
  let found = false;
  function visit(node) {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === "logOpsError") {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(block);
  return found;
}

/** ヒューリスティック: 想定外をクライアント向けに変換しそうな throw（厳密ではない） */
function blockThrowsHttpsErrorLikeInternal(block) {
  let hit = false;
  function visit(node) {
    if (hit) return;
    if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
      const expr = node.expression.expression;
      let name = null;
      if (ts.isIdentifier(expr)) name = expr.text;
      else if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name))
        name = expr.name.text;
      if (name === "HttpsError") {
        const args = node.expression.arguments;
        const first = args[0];
        if (first && ts.isStringLiteral(first)) {
          const code = first.text;
          if (code === "internal" || code === "failed-precondition") {
            hit = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(block);
  return hit;
}

function auditFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const rel = path.relative(path.join(__dirname, ".."), filePath);
  const sf = ts.createSourceFile(
    rel,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const out = [];
  function visit(node) {
    if (ts.isCatchClause(node)) {
      const block = node.block;
      const start = node.getStart(sf);
      const { line, character } = sf.getLineAndCharacterOfPosition(start);
      const hasLog = blockContainsLogOpsErrorCall(block);
      const suspect = blockThrowsHttpsErrorLikeInternal(block);
      out.push({
        file: rel.replace(/\\/g, "/"),
        line: line + 1,
        column: character + 1,
        hasLogOpsError: hasLog,
        suspectInternalThrowWithoutLog: suspect && !hasLog,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const extraExclude = getExtraExcludeFromEnv();
  const files = walkTsFiles(ROOT, [], extraExclude).sort();

  const rows = [];
  for (const f of files) {
    rows.push(...auditFile(f));
  }

  let filtered = rows;
  if (flags.missingOnly) {
    filtered = filtered.filter((r) => !r.hasLogOpsError);
  }
  if (flags.suspect) {
    filtered = filtered.filter((r) => r.suspectInternalThrowWithoutLog);
  }

  if (flags.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  const header =
    "file\tline\thasLogOpsError\tsuspect(internal throw, no log)\tcolumn";
  console.log(header);
  for (const r of filtered) {
    console.log(
      `${r.file}\t${r.line}\t${r.hasLogOpsError}\t${r.suspectInternalThrowWithoutLog}\t${r.column}`
    );
  }
  console.error(
    `\nTotal catch clauses: ${rows.length}; after filters: ${filtered.length}`
  );
}

main();
