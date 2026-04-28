/**
 * logOpsSuccess / logOpsError の相関バグを機械的に洗い出す（ヒューリスティック）。
 *
 * チェック項目（手動レビューと併用）:
 *  1. MISSING_CONTEXT_SUCCESS — logOpsSuccess の第1引数オブジェクトに `context:` が無い
 *  2. SUSPECT_VALID_FALSE_AFTER — logOpsSuccess 直後〜800文字以内に `valid: false`（業務失敗を成功ログにしている疑い）
 *  3. MISSING_CONTEXT_ERROR — 同一ファイルに logOpsSuccess があるのに、ある logOpsError に `context:` が無い
 *     （成功側が厚いのに失敗側が薄いときの目印。catch のみのファイルは偽陽性になりやすい）
 *  4. ERROR_COUNT_GT_SUCCESS — ファイル内 logOpsError 呼び出し数 > logOpsSuccess（相関の片方が欠けている疑い）
 *
 * 除外: debug/, demo_data/, unused_function_lib/（recommendLogOpsContext269 と同趣旨）
 *
 * 実行: node functions/scripts/auditLogOpsSuccessCorrelation.cjs
 * オプション: --json （JSON のみ stdout）
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");
const EXCLUDE_DIRS = new Set(["node_modules", "debug", "demo_data", "unused_function_lib"]);

/** @param {string} s @param {number} openBraceIndex index of '{' */
function findMatchingBrace(s, openBraceIndex) {
  let depth = 0;
  for (let i = openBraceIndex; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** @param {string} content @param {string} fnName logOpsSuccess | logOpsError */
function findCallObjectBlocks(content, fnName) {
  const re = new RegExp(`\\b${fnName}\\s*\\(\\s*\\{`, "g");
  const out = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = findMatchingBrace(content, open);
    if (close < 0) continue;
    const block = content.slice(open, close + 1);
    const line = content.slice(0, m.index).split("\n").length;
    // オブジェクト終端 `}` の直後は `)` / `;` — 呼び出し全体の後から「同じ try 内」だけを見る
    let afterStart = close + 1;
    while (afterStart < content.length && /\s/.test(content[afterStart])) afterStart++;
    if (content[afterStart] === ")") afterStart++;
    while (afterStart < content.length && /\s/.test(content[afterStart])) afterStart++;
    if (content[afterStart] === ";") afterStart++;
    const restFromCall = content.slice(afterStart);
    const catchCut = restFromCall.search(/\}\s*catch\s*\(/);
    const withinTry = catchCut >= 0 ? restFromCall.slice(0, catchCut) : restFromCall;
    const after = withinTry.slice(0, 800);
    out.push({ line, block, afterSnippet: after, matchEnd: afterStart });
  }
  return out;
}

function walkTsFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      walkTsFiles(full, acc);
    } else if (name.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function main() {
  const jsonOnly = process.argv.includes("--json");
  const files = walkTsFiles(ROOT);
  /** @type {Array<{ file: string, line: number, rule: string, note?: string }>} */
  const findings = [];

  for (const file of files) {
    const rel = path.relative(path.join(__dirname, ".."), file);
    const content = fs.readFileSync(file, "utf8");
    if (!content.includes("logOpsSuccess") && !content.includes("logOpsError")) continue;

    const successes = findCallObjectBlocks(content, "logOpsSuccess");
    const errors = findCallObjectBlocks(content, "logOpsError");

    for (const s of successes) {
      if (!/\bcontext\s*:/m.test(s.block)) {
        findings.push({ file: rel, line: s.line, rule: "MISSING_CONTEXT_SUCCESS" });
      }
      if (/valid\s*:\s*false/.test(s.afterSnippet)) {
        findings.push({
          file: rel,
          line: s.line,
          rule: "SUSPECT_VALID_FALSE_AFTER",
          note: "logOpsSuccess 直後の範囲に valid: false",
        });
      }
    }

    const fileHasRichSuccess = successes.some((x) => /\bcontext\s*:/m.test(x.block));
    if (fileHasRichSuccess) {
      for (const e of errors) {
        if (!/\bcontext\s*:/m.test(e.block)) {
          findings.push({
            file: rel,
            line: e.line,
            rule: "MISSING_CONTEXT_ERROR",
            note: "同一ファイルに context 付き logOpsSuccess あり",
          });
        }
      }
    }

    if (errors.length > successes.length && successes.length > 0) {
      findings.push({
        file: rel,
        line: 0,
        rule: "ERROR_COUNT_GT_SUCCESS",
        note: `errors=${errors.length} successes=${successes.length}`,
      });
    }
  }

  if (jsonOnly) {
    console.log(JSON.stringify(findings, null, 2));
    return;
  }

  console.log(`# logOps 相関監査 (${findings.length} 件ヒント)\n`);
  const byRule = {};
  for (const f of findings) {
    byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  }
  console.log("## ルール別件数");
  for (const [k, v] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    console.log(`- ${k}: ${v}`);
  }
  console.log("\n## 一覧（file:line rule）");
  for (const f of findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    const tail = f.note ? ` — ${f.note}` : "";
    console.log(`${f.file}:${f.line} ${f.rule}${tail}`);
  }
}

main();
