/**
 * エラーログ_context調査_269件.md を読み、ファイル・functionEntry 別に
 * 成功経路の手がかり（writeSingleOperationLog / logger.info / console.log）を数える。
 * 出力: docs/.../エラーログ_成功ログ調査_269件_機械集計.md
 */
const fs = require("fs");
const path = require("path");

const IN = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "共通化",
  "flutter",
  "04_仕様書",
  "エラーログ拡張",
  "エラーログ_context調査_269件.md"
);
const OUT = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "共通化",
  "flutter",
  "04_仕様書",
  "エラーログ拡張",
  "エラーログ_成功ログ調査_269件_機械集計.md"
);

const ROOT = path.join(__dirname, "..", "src");

function parseTable(md) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.includes("## 1. 呼び出しごとの一覧"));
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## 2."));
  const slice = start >= 0 && end > start ? lines.slice(start, end) : lines;
  const rows = [];
  for (const line of slice) {
    if (!line.startsWith("| ")) continue;
    if (line.startsWith("| # |") || line.startsWith("|--")) continue;
    const p = line.split("|").map((s) => s.trim());
    if (p.length < 6) continue;
    const num = parseInt(p[1], 10);
    if (Number.isNaN(num) || num < 1 || num > 299) continue;
    if (num > 269) break;
    const source = p[2].replace(/^`+|`+$/g, "");
    if (!source.startsWith("src/") || !source.includes(".ts:")) continue;
    const fe = p[3].replace(/^`+|`+$/g, "");
    const op = p[4].replace(/^`+|`+$/g, "");
    rows.push({ num, source, fe, op });
  }
  return rows;
}

function filePathFromSource(s) {
  const base = s.split(":")[0];
  return path.join(ROOT, base.replace(/^src\//, ""));
}

function scanFile(fullPath) {
  if (!fs.existsSync(fullPath)) {
    return { err: "missing" };
  }
  const t = fs.readFileSync(fullPath, "utf8");
  const count = (re) => (t.match(re) || []).length;
  return {
    logOpsError: count(/logOpsError\s*\(/g),
    writeSingleOperationLog: count(/writeSingleOperationLog\s*\(/g),
    loggerInfo: count(/logger\.info\s*\(/g),
    consoleLog: count(/console\.log\s*\(/g),
  };
}

function main() {
  const md = fs.readFileSync(IN, "utf8");
  const rows = parseTable(md);
  if (rows.length !== 269) {
    console.error("Expected 269 rows, got", rows.length);
    process.exit(1);
  }

  /** @type Map<string, typeof rows> */
  const byFile = new Map();
  for (const r of rows) {
    const fp = r.source.split(":")[0];
    if (!byFile.has(fp)) byFile.set(fp, []);
    byFile.get(fp).push(r);
  }

  const filePaths = [...byFile.keys()].sort();

  const lines = [];
  lines.push("# 成功ログ調査：機械集計（`logOpsError` 269 件）");
  lines.push("");
  lines.push(`- **生成**: \`functions/scripts/surveySuccessLogOps269.cjs\``);
  lines.push(`- **入力**: \`エラーログ_context調査_269件.md\`（# 1–269）`);
  lines.push(
    `- **注意**: 同一ファイルに **複数の \`functionEntry\`** がある場合は、表を **エントリ別**に読む（網羅のため \`# \` の列で突合）。`
  );
  lines.push("");

  lines.push("## サマリ");
  lines.push("");
  lines.push(`- **失敗呼び出し行数（全件）**: 269`);
  lines.push(`- **ユニークなソース・ファイル**（\`:\` より前）: **${filePaths.length}**`);
  const multiFeFiles = filePaths.filter((fp) => {
    const set = new Set(byFile.get(fp).map((r) => r.fe));
    return set.size > 1;
  });
  lines.push(
    `- **同一ファイル内に複数 \`functionEntry\` があるファイル**（**人間がエントリ別に分けて見る**）: **${multiFeFiles.length}**`
  );
  lines.push("");

  if (multiFeFiles.length) {
    lines.push("### 同一ファイル内に複数 `functionEntry` があるパス");
    lines.push("");
    for (const fp of multiFeFiles.sort()) {
      const e = [...new Set(byFile.get(fp).map((r) => r.fe))].join(", ");
      lines.push(`- \`${fp}\` → **${e}**`);
    }
    lines.push("");
  }

  lines.push("## ファイル別：失敗行の `functionEntry`・件数＋成功経路の手がかり（機械的）");
  lines.push("");
  lines.push(
    "| ソースファイル | 失敗行数 | functionEntry（本ファイル内） | `writeSingleOperationLog` | `logger.info` | `console.log` | 機械メモ |"
  );
  lines.push("|----------------|----------|--------------------------------|----------------------------|---------------|---------------|----------|");

  for (const fp of filePaths) {
    const list = byFile.get(fp);
    const fes = [...new Set(list.map((r) => r.fe))].join("<br>");
    const full = filePathFromSource(list[0].source);
    const sc = scanFile(full);
    let memo = "";
    if (sc.err === "missing") memo = "ファイルなし";
    else {
      if (sc.logOpsError !== list.length) memo = `行数${list.length}と logOpsError数${sc.logOpsError}が不一致要確認`;
      if (sc.writeSingleOperationLog > 0) memo += " B候補(operationLog) ";
      if (sc.loggerInfo > 0) memo += " A候補(logger.info) ";
      if (sc.consoleLog > 0 && sc.writeSingleOperationLog === 0 && sc.loggerInfo === 0)
        memo += " consoleのみ多め";
    }
    lines.push(
      `| \`${fp}\` | ${list.length} | ${fes} | ${sc.writeSingleOperationLog ?? "—"} | ${sc.loggerInfo ?? "—"} | ${sc.consoleLog ?? "—"} | ${memo || "—"} |`
    );
  }

  lines.push("");
  lines.push("## 呼び出し行番号一覧（# と突合用）");
  lines.push("");

  for (const fp of filePaths) {
    const list = byFile.get(fp).sort((a, b) => a.num - b.num);
    lines.push(`### \`${fp}\``);
    const byFe = new Map();
    for (const r of list) {
      if (!byFe.has(r.fe)) byFe.set(r.fe, []);
      byFe.get(r.fe).push(r);
    }
    for (const [fe, items] of [...byFe.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const nums = items.map((x) => x.num).join(", ");
      const ops = items.map((x) => (x.op ? `\\\`${x.op}\\\`` : "（空）")).join(" / ");
      lines.push(`- **\`${fe}\`**: # ${nums} — operation: ${ops}`);
    }
    lines.push("");
  }

  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log("Wrote:", OUT);
}

main();
