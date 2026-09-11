'use strict';

/**
 * Normalize source_2025-09.json → JSON payload (no Firestore).
 *
 * Usage:
 *   node normalize_demo_analytics.js --target-month 2026-09 --demo-day 2026-09-20
 *   node normalize_demo_analytics.js --target-month 2026-09 --demo-day 2026-09-20 --out out/normalized.json
 */

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('./lib/helpers');
const { normalizeDemoAnalytics } = require('./lib/normalize');
const { assertNormalizedPayload } = require('./lib/assert');

const ROOT = __dirname;
const DEFAULT_SOURCE = path.join(ROOT, 'source_2025-09.json');

function printHelp() {
  console.log(`Normalize D02-D01 demo analytics (no DB)

Usage:
  node normalize_demo_analytics.js --target-month YYYY-MM --demo-day YYYY-MM-DD [--source path] [--out path]
`);
}

function main() {
  // extend parseArgs for --out
  const argv = process.argv.slice(2);
  let outPath = null;
  const filtered = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      outPath = argv[++i];
    } else {
      filtered.push(argv[i]);
    }
  }

  const args = parseArgs(filtered);
  if (args.help || !args.targetMonth || !args.demoDay) {
    printHelp();
    if (!args.help && (!args.targetMonth || !args.demoDay)) {
      process.exit(1);
    }
    return;
  }

  const sourcePath = path.resolve(args.source || DEFAULT_SOURCE);
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const payload = normalizeDemoAnalytics(source, {
    targetMonth: args.targetMonth,
    demoDay: args.demoDay,
  });
  const result = assertNormalizedPayload(payload, {
    targetMonth: args.targetMonth,
    demoDay: args.demoDay,
  });

  console.log(JSON.stringify({ assertOk: result.ok, checks: result.checks, errors: result.errors }, null, 2));

  if (!result.ok) process.exit(1);

  if (outPath) {
    const abs = path.resolve(outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(payload, null, 2) + '\n');
    console.log(`wrote ${abs}`);
  }
}

main();
