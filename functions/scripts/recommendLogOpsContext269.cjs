/**
 * 269 件スコープの各 logOpsError について、実コード（AST）から
 * 「相関に使える識別子」を推定し、推奨 context キーを Markdown に出力する。
 *
 * 出力: docs/エラーログ運用/logOps/調査269件/エラーログ_context推奨_269件.md
 *
 * 推奨ロジック（ヒューリスティック）:
 *  - 呼び出しノードからルートまでのパス上の全 FunctionLike のパラメータ名を収集（分割代入含む）
 *  - パス上の「最外側」FunctionLike の body ブロックを走査し、logOpsError より前の位置にある
 *    VariableDeclaration の束縛名を収集（ネストした関数内の宣言も含む。稀にスコープ外の偽陽性あり）
 *  - 上記から、相関候補名をフィルタ（*Id, *Key, idemp*, deviceId, runId, seatNumber 等）
 *  - 既存の明示 context キー・FC throw の context キー（同一関数内）と突き合わせ
 *  - `device` 変数が束縛に含まれる場合はメモで device.id → deviceId を推奨
 *
 * 実装方針（生成 Markdown にも記載）:
 *  - 既存の logOpsError の context は維持し、本表の追加入力候補（相関キー）を**足す**。診断用フィールドを差し替えで削らない。
 *
 * スコープ偽陽性 waive: `SCOPE_FALSE_POSITIVE_WAIVE`（`src/domains/...:行`、`path.relative(functions, ファイル)`）— 行がズレたら要更新。メモ列に根拠を出す。
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

/** 追加入力候補（recommendedAdd）を出さない logOps 呼び出し: `相対パス:行`（`path.relative(functions, file)` 相当・区切りは `/`） */
const SCOPE_FALSE_POSITIVE_WAIVE = new Set([
  "src/domains/storeMeta/callables/closeStoreTerminal.ts:449",
  "src/domains/storeMeta/callables/closeStoreTerminal.ts:528",
  "src/domains/storeMeta/callables/closeStoreTerminal.ts:585",
  "src/domains/storeMeta/callables/continueBusinessTerminal.ts:363",
]);

function isScopeFalsePositiveWaive(fileRel, line) {
  const norm = String(fileRel).split(path.sep).join("/");
  return SCOPE_FALSE_POSITIVE_WAIVE.has(`${norm}:${line}`);
}

const OUT = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "エラーログ運用",
  "logOps",
  "調査269件",
  "エラーログ_context推奨_269件.md"
);

const EXCLUDE_BINDING_NAMES = new Set([
  "error",
  "errors",
  "e",
  "err",
  "request",
  "req",
  "response",
  "res",
  "data",
  "config",
  "logger",
  "ref",
  "refs",
  "batch",
  "tx",
  "transaction",
  "snapshot",
  "snapshots",
  "doc",
  "docs",
  "result",
  "results",
  "admin",
  "db",
  "now",
  "ctx",
  "context",
  "args",
  "opts",
  "options",
  "credentials",
  "headers",
  "body",
  "payload",
  "message",
  "messages",
  "title",
  "name",
  "email",
  "phone",
  "code",
  "status",
  "ok",
  "json",
  "text",
  "buffer",
  "stream",
  "url",
  "uri",
  "path",
  "query",
  "params",
  "metadata",
  "meta",
  "cause",
  "stack",
  "value",
  "values",
  "item",
  "items",
  "list",
  "array",
  "map",
  "set",
  "obj",
  "object",
  "input",
  "output",
  "tmp",
  "temp",
  "next",
  "prev",
  "current",
  "update",
  "updates",
  "write",
  "read",
  "op",
  "phase",
  "reason",
  "detail",
  "details",
  "legacy",
  "candidates",
  "startAt",
  "endAt",
  "regEndAt",
  "scheduleTimeUtc",
  "notificationHour",
  "targetDate",
  "triggerType",
  "attendanceIdsCount",
]);

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

function extractObjectKeys(sf, objLit) {
  const keys = [];
  if (!objLit || !ts.isObjectLiteralExpression(objLit)) return keys;
  for (const p of objLit.properties) {
    if (ts.isPropertyAssignment(p)) {
      keys.push(propName(p.name));
    } else if (ts.isShorthandPropertyAssignment(p)) {
      keys.push(p.name.text);
    } else if (ts.isSpreadAssignment(p)) {
      keys.push(`...${exprSnippet(sf, p.expression)}`);
    }
  }
  return keys.filter(Boolean);
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

function pathToRoot(node) {
  const p = [];
  for (let n = node; n; n = n.parent) p.push(n);
  return p;
}

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
  if (!catchClause) return { inCatch: false, isFcBranch: false };

  let isFcBranch = false;
  let cur = callNode.parent;
  while (cur && cur !== catchClause) {
    if (ts.isIfStatement(cur)) {
      const condText = exprSnippet(callNode.getSourceFile(), cur.expression);
      if (/instanceof\s+FunctionCustomError/.test(condText)) {
        const stmt = cur.thenStatement;
        const contains = (node, target) => {
          if (!node) return false;
          if (node === target) return true;
          let found = false;
          ts.forEachChild(node, (c) => {
            if (!found && contains(c, target)) found = true;
          });
          return found;
        };
        if (contains(stmt, callNode)) {
          isFcBranch = true;
          break;
        }
      }
    }
    cur = cur.parent;
  }
  return { inCatch: true, isFcBranch };
}

function addBindingElementNames(el, out) {
  if (!ts.isBindingElement(el)) return;
  const name = el.name;
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  collectBindingPatternNames(name, out);
}

function collectBindingPatternNames(pattern, out) {
  if (ts.isIdentifier(pattern)) {
    out.add(pattern.text);
    return;
  }
  if (ts.isObjectBindingPattern(pattern)) {
    for (const el of pattern.elements) {
      addBindingElementNames(el, out);
    }
    return;
  }
  if (ts.isArrayBindingPattern(pattern)) {
    for (const el of pattern.elements) {
      if (ts.isBindingElement(el)) addBindingElementNames(el, out);
    }
  }
}

function addFromParams(fnLike, out) {
  if (!fnLike || !fnLike.parameters) return;
  for (const p of fnLike.parameters) {
    collectBindingPatternNames(p.name, out);
  }
}

function addFromVariableDeclaration(decl, out) {
  collectBindingPatternNames(decl.name, out);
}

function collectVarDeclsBeforePos(root, cutoffPos, out, sf) {
  function visit(node) {
    if (!node || node.getStart(sf) >= cutoffPos) return;
    if (ts.isVariableDeclaration(node)) {
      addFromVariableDeclaration(node, out);
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
}

/** 呼び出しからルートまでの FunctionLike（内側→外側） */
function functionLikeChainFromInner(callNode) {
  const path = pathToRoot(callNode);
  return path.filter(ts.isFunctionLike);
}

function outermostFunctionLikeOnPath(callNode) {
  const chain = functionLikeChainFromInner(callNode);
  return chain.length ? chain[chain.length - 1] : null;
}

function collectScopeBindings(sf, callNode) {
  const names = new Set();
  const callPos = callNode.getStart(sf);
  const chain = functionLikeChainFromInner(callNode);
  for (const fn of chain) {
    addFromParams(fn, names);
  }
  const outer = outermostFunctionLikeOnPath(callNode);
  if (outer && ts.isBlock(outer.body)) {
    collectVarDeclsBeforePos(outer.body, callPos, names, sf);
  }
  return names;
}

function isCorrelationCandidate(name) {
  if (!name || name.length <= 1) return false;
  if (name.startsWith("_")) return false;
  if (EXCLUDE_BINDING_NAMES.has(name)) return false;

  if (/Id$/i.test(name)) return true;
  if (/^idemp/i.test(name)) return true;
  if (/Key$/i.test(name)) {
    if (/apiKey|secretKey|privateKey|accessKey/i.test(name)) return false;
    return true;
  }

  const exact = new Set([
    "deviceId",
    "runId",
    "staffId",
    "seatNumber",
    "businessDate",
    "paymentPeriodKey",
    "templateId",
    "tournamentId",
    "tableId",
    "billId",
    "userId",
    "callerUid",
    "uid",
    "correlationId",
    "requestId",
    "operationId",
    "taskId",
    "scheduleId",
    "storeId",
    "sessionId",
    "requestHash8",
  ]);
  if (exact.has(name)) return true;

  if (/^hash\d*$/i.test(name)) return true;

  return false;
}

function normalizeContextKeys(keys) {
  return keys.filter((k) => k && !k.startsWith("..."));
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
        ctxKeys = normalizeContextKeys(extractObjectKeys(sf, ctxInit));
      }
      const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ line: pos.line + 1, errorKey, ctxKeys });
    }
    ts.forEachChild(node, visit);
  }
  visit(container);
  return out;
}

function enclosingInnermostFunction(callNode) {
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

/** `onCall(async (request) => { ... })` のハンドラ関数か（第2引数または単一引数） */
function isDirectOnCallHandlerArgument(fnNode) {
  const p = fnNode.parent;
  if (!p || !ts.isCallExpression(p)) return false;
  const expr = p.expression;
  if (!ts.isIdentifier(expr) || expr.text !== "onCall") return false;
  const args = p.arguments;
  if (args.length === 0) return false;
  return args[args.length - 1] === fnNode;
}

function getParentFunctionLike(fnNode) {
  let n = fnNode.parent;
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

/** logOpsError が Firebase `onCall` ハンドラの（直接・間接の）内部にあるか */
function isUnderOnCallHandler(callNode) {
  let fn = enclosingInnermostFunction(callNode);
  while (fn) {
    if (isDirectOnCallHandlerArgument(fn)) return true;
    fn = getParentFunctionLike(fn);
  }
  return false;
}

function buildContextExplicitRecommendation(callable, explicitEmpty, hasRecommendedGap, deviceGap) {
  if (!callable) return "—（非callable）";
  const parts = [];
  if (explicitEmpty) parts.push("明示 context 未設定");
  if (hasRecommendedGap) parts.push("追加入力候補あり（scope 上の相関 ID が未載せ）");
  if (deviceGap) parts.push("deviceId 要追加（`device` 束縛あり）");
  if (parts.length === 0) return "不要（概ね充足）";
  return `推奨: ${parts.join("、")}`;
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
            const opDisplay = opInit ? literalString(opInit) || exprSnippet(sf, opInit) : "";
            const ctxInit = findContextObject(sf, first);
            const ctxKeys = normalizeContextKeys(extractObjectKeys(sf, ctxInit));
            const hasCause = hasCauseProperty(first);
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            calls.push({
              node,
              file: rel,
              line: pos.line + 1,
              functionEntry,
              operationDisplay: opDisplay,
              hasOperation: opHas,
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

/**
 * 明示 context のキーが、同じ相関意図でスコープ候補（例: adminId）を満たすか。
 * 典型: `context: { callerUid: adminId }` のとき explicit に adminId キーは無いが callerUid あり＝操作者IDは足りている。
 */
function explicitCoversScopeCandidate(name, explicit) {
  if (explicit.has(name)) return true;
  if (name === "adminId" && (explicit.has("callerUid") || explicit.has("uid"))) return true;
  if (name === "callerUid" && explicit.has("adminId")) return true;
  if (name === "sid" && explicit.has("staffId")) return true;
  if (name === "staffId" && explicit.has("sid")) return true;
  if (name === "aid" && explicit.has("attendanceId")) return true;
  if (name === "attendanceId" && explicit.has("aid")) return true;
  if (name === "providedIdempotencyKey" && explicit.has("idempotencyKey")) return true;
  if (name === "userId" && explicit.has("uid")) return true;
  if (name === "uid" && explicit.has("userId")) return true;
  if (name === "resolvedUserId" && explicit.has("userId")) return true;
  return false;
}

function main() {
  const files = walkTsFiles(ROOT);
  const rows = [];

  for (const filePath of files) {
    const rel = path.relative(path.join(__dirname, ".."), filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const sf = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const calls = collect(sf, rel);
    if (calls.length === 0) continue;

    for (const c of calls) {
      const scopeNames = collectScopeBindings(sf, c.node);
      const hasDeviceBinding = scopeNames.has("device");
      const candidates = [...scopeNames].filter(isCorrelationCandidate).sort();

      const innerFn = enclosingInnermostFunction(c.node);
      const throwsInFunc = innerFn ? collectThrowFCsInNode(sf, innerFn) : [];
      const fcCtxUnion = new Set();
      for (const t of throwsInFunc) {
        for (const k of t.ctxKeys) fcCtxUnion.add(k);
      }

      const explicit = new Set(c.ctxKeys);
      const recommendedAdd = candidates.filter(
        (n) => !explicitCoversScopeCandidate(n, explicit) && !fcCtxUnion.has(n)
      );

      const scopeWaive = isScopeFalsePositiveWaive(c.file, c.line);
      const effectiveRecommendedAdd = scopeWaive ? [] : recommendedAdd;

      const merged = new Set([...explicit, ...fcCtxUnion, ...effectiveRecommendedAdd]);
      const mergedList = [...merged].sort();
      const mergedDisplay = mergedList.length ? mergedList.join(", ") : "(なし)";

      const catchInfo = enclosingCatchInfo(c.node);
      let cls = !catchInfo.inCatch ? "catch 外" : catchInfo.isFcBranch ? "FC" : "非FC";

      const notes = [];
      if (hasDeviceBinding && !merged.has("deviceId")) {
        notes.push("`device` あり → 取得できる場合は `deviceId: device.id`（または既存の端末 ID フィールド）を追加");
      }
      if (catchInfo.isFcBranch && throwsInFunc.length === 0) {
        notes.push("FC 分岐だが同一関数内に `throw new FunctionCustomError` が検出されない（別ファイル throw の可能性）");
      }
      if (effectiveRecommendedAdd.length === 0 && !hasDeviceBinding && explicit.size === 0 && fcCtxUnion.size === 0) {
        notes.push("スコープから相関候補が取れない／明示 context も FC context もなし → 手元で ID を追加するか、成功ログ側キーと設計合意");
      }
      if (scopeWaive) {
        notes.push(
          "当該行は `recommendLogOpsContext269.cjs` の `SCOPE_FALSE_POSITIVE_WAIVE` により相関追加入力を機械的に出さない（巨大ハンドラのスコープ偽陽性／FC 境界で未確定のキーは実装側で意図的に未載せ）"
        );
      }

      const callable = isUnderOnCallHandler(c.node);
      const explicitEmpty = explicit.size === 0;
      const hasRecommendedGap = effectiveRecommendedAdd.length > 0;
      const deviceGap = hasDeviceBinding && !merged.has("deviceId");
      const route = callable ? "callable" : "非callable";
      const contextExplicitRec = buildContextExplicitRecommendation(
        callable,
        explicitEmpty,
        hasRecommendedGap,
        deviceGap
      );

      rows.push({
        file: c.file,
        line: c.line,
        functionEntry: c.functionEntry,
        operation: c.hasOperation ? c.operationDisplay : "",
        route,
        contextExplicitRec,
        cls,
        explicit: [...explicit].sort().join(", ") || "(なし)",
        scopeCandidates: candidates.join(", ") || "(なし)",
        fcCtxKeys: [...fcCtxUnion].sort().join(", ") || "(なし)",
        recommendedAdd: effectiveRecommendedAdd.join(", ") || "(なし)",
        mergedSuggested: mergedDisplay,
        notes: notes.join("；"),
      });
    }
  }

  rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const nCallable = rows.filter((r) => r.route === "callable").length;
  const nNoncallable = rows.filter((r) => r.route === "非callable").length;
  const nRec = rows.filter((r) => r.contextExplicitRec.startsWith("推奨")).length;
  const nCallableExplicitEmpty = rows.filter(
    (r) => r.route === "callable" && r.explicit === "(なし)"
  ).length;

  const lines = [];
  lines.push("# エラーログ context 推奨（269 件スコープ・実コードベース）");
  lines.push("");
  lines.push("- **対象**: `functions/src` の `logOpsError` 呼び出し 269 件（Step2-1 と同一除外）");
  lines.push("- **方法**: TypeScript AST で「最外側ハンドラ本体ツリー内・呼び出しより前の束縛」＋「パス上の全関数のパラメータ」から識別子を列挙し、相関候補でフィルタ");
  lines.push("- **経路 `callable`**: `firebase-functions` の `onCall(...)` に渡したハンドラ関数（直接・間接）の内側にある呼び出しを AST で判定");
  lines.push("- **context 明示追加推奨列**: callable のとき、`request.auth.uid` や `data` 由来の ID が取れる典型パスで **相関用に `context` へ載せるべきか** を機械的にタグ付け（詳細は下記サマリ）");
  lines.push("- **推奨の読み方**");
  lines.push("  - **scope 相関候補**: コード上でその時点までに現れる名前のうち、`*Id` / `*Key` / `idemp*` 等に該当するもの");
  lines.push("  - **FC 経由 context キー**: 同一最内関数内の `throw new FunctionCustomError` の `context` キー集合の和（errorKey ごとの差は `エラーログ_context調査_269件.md` §2 を参照）");
  lines.push("  - **追加入力候補**: 上記候補のうち、明示 context にも FC context にもまだ無いもの");
  lines.push("  - **マージ後の推奨集合（近似）**: 明示 ∪ FC ∪ 追加入力候補（診断用フィールド `reason` / `phase` 等はスコープ候補に含めない方針）");
  lines.push(
    "- **限界**: 分割代入の別名、別ファイルの FC、動的キーは静的解析で取りこぼす。スコープ外の宣言が稀に候補に入る偽陽性あり。一部行は `SCOPE_FALSE_POSITIVE_WAIVE` で追加入力候補を出さない（`recommendLogOpsContext269.cjs` 参照、メモ列）"
  );
  lines.push("- **生成**: `functions/scripts/recommendLogOpsContext269.cjs`");
  lines.push("");
  lines.push("## 実装方針（context の扱い）");
  lines.push("");
  lines.push("本表の「追加入力候補」「マージ後推奨集合」に沿って実装するときは、次のとおりとする。");
  lines.push("");
  lines.push("1. **既存の `logOpsError` の `context` に書いてあるキー・値は維持する**（`code` / `message` / `reason`、`result`、`requestHash8` など診断・冪等補助も含む）。**差し替え・削除で相関キーだけに整理しない**。");
  lines.push("2. **そのうえで、本表の「追加入力候補」に相当する相関キーを追加する**（`FunctionCustomError` 経由で `logOpsError` がマージする `cause.context` も、既存と衝突しない範囲で同様）。");
  lines.push("3. **キー名の衝突時**は、仕様書どおり **`logOpsError` 呼び出しの `context` が優先**（差分仕様のマージルール）。意図的に上書きする場合のみ呼び出し側で明示する。");
  lines.push("4. 成功ログ側も、**失敗時に追加した相関キーと同じ名前**で載せる（`エラーログ監視_再試行と相関キー.md` §6）。");
  lines.push("");
  lines.push("## サマリ（context 明示追加・callable 関連）");
  lines.push("");
  lines.push(`- **callable 経路**: ${nCallable} 件 / **非callable 経路**: ${nNoncallable} 件`);
  lines.push(
    `- **callable かつ「現在の明示 context」が空**: ${nCallableExplicitEmpty} 件（いずれも \`context 明示追加推奨\` が **推奨: 明示 context 未設定** を含む）`
  );
  lines.push(`- **\`context 明示追加推奨\` が「推奨:」で始まる行（callable / 非callable 含む）**: ${nRec} 件`);
  lines.push(
    "- **注**: 以前の「169 件」は **全経路**における「明示 context なし」件数。本表の **callable かつ明示なし** はその **部分集合**（下表で `経路 = callable` かつ `現在の明示 context = (なし)` で絞り込み可能）"
  );
  lines.push("");
  lines.push("## callerUid と userId（実コード調査）");
  lines.push("");
  lines.push("### callerUid");
  lines.push("");
  lines.push(
    "- 多数の Callable で `const callerUid = request.auth.uid` と定義され、**Firebase Auth 上の「その呼び出しを行った認証ユーザー」（操作者）** を指す。"
  );
  lines.push("- `getCallerDeviceByUid(callerUid)` に渡し、端末・権限チェックに使われている。");
  lines.push("");
  lines.push("### userId（ログや request に現れる場合）");
  lines.push("");
  lines.push(
    "- **文脈により意味が異なり、callerUid と同一とは限らない**（同一語でも別概念になりうる）。"
  );
  lines.push(
    "- 例: `functions/src/domains/bills/repos/createBillWithActiveStay.ts` では型コメント上 `userId` は **「必須: 顧客UID」** で、`activeStays` のドキュメント ID 等に使われる **来店客** 側の識別子。"
  );
  lines.push(
    "- 例: `functions/src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts` では、リクエスト body を parse した `userId` は **座席に割り当てるプレイヤー** を指し、操作者（callerUid）とは別。"
  );
  lines.push("");
  lines.push("### 結論（ログ設計）");
  lines.push("");
  lines.push(
    "- **callerUid を `userId` にリネームしてログキーを一本化することは非推奨**。業務上の `userId`（顧客・プレイヤー等）と衝突する。"
  );
  lines.push(
    "- **操作者**を追うなら `callerUid`（または仕様で `operatorUserId` 等に統一）、**業務対象のユーザー**を追うならそのドメインの `userId` を **別キーで併記**する。"
  );
  lines.push("");
  lines.push("## 一覧（269 行）");
  lines.push("");
  lines.push(
    "| # | ソース | 経路 | context 明示追加推奨 | 分類 | functionEntry | operation | 現在の明示 context | scope 相関候補 | FC 経由 context（同一関数内） | 追加入力候補 | マージ後推奨集合（近似） | メモ |"
  );
  lines.push(
    "|---|--------|------|----------------------|------|---------------|-----------|-------------------|----------------|-------------------------------|-------------|--------------------------|------|"
  );

  rows.forEach((r, i) => {
    const op = r.operation ? `\`${mdEscape(r.operation)}\`` : "";
    lines.push(
      `| ${i + 1} | \`${r.file}:${r.line}\` | ${r.route} | ${mdEscape(r.contextExplicitRec)} | ${r.cls} | \`${r.functionEntry}\` | ${op} | ${mdEscape(r.explicit)} | ${mdEscape(r.scopeCandidates)} | ${mdEscape(r.fcCtxKeys)} | ${mdEscape(r.recommendedAdd)} | ${mdEscape(r.mergedSuggested)} | ${mdEscape(r.notes)} |`
    );
  });

  lines.push("");
  lines.push("## 運用メモ");
  lines.push("");
  lines.push(
    "- **実装は「現在の `context` に推奨（相関キー）を足す」**（上記「実装方針」）。既存フィールドを消して相関だけに寄せない。"
  );
  lines.push(
    "- 相関キーは **成功ログにも同じキー名で載せる** 方針とすると、本表の「マージ後推奨集合」が **最終的に載せたいキーの和（近似）** の参考になる。"
  );
  lines.push(
    "- **callerUid と業務 userId** は上記「callerUid と userId（実コード調査）」を参照（同一ではない前提でキーを分ける）"
  );

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log("Wrote:", OUT);
  console.log("rows:", rows.length);
}

main();
