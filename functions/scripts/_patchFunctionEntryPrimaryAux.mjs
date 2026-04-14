/**
 * One-off: add 主処理/補助 column to functionEntry_業務役割一覧.md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.join(
  __dirname,
  "../../docs/共通化/flutter/04_仕様書/エラーログ拡張/functionEntry_業務役割一覧.md"
);

const part1 = Object.fromEntries(
  Array.from({ length: 101 }, (_, i) => {
    const n = i + 1;
    if (n === 63) return [n, "補助"];
    if (n === 91) return [n, "補助"];
    return [n, "主処理"];
  })
);

const part2Raw = `
1|migrateSettledBillsForBusinessDay|callable|主処理
2|migrateSettledBillsForBusinessDay|runMigratePerBill|主処理
3|approveAttendanceCorrectionRequest|attendanceRecordUpdate|補助
4|approveAttendanceCorrectionRequest|approveRequestOuterCatch|主処理
5|executeMonthlyPayroll|loadPayrollConfig|主処理
6|executeMonthlyPayroll|taskDispatch|主処理
7|getPayrollCandidates|loadPayrollConfig|主処理
8|payrollNotificationScheduler|enqueue|主処理
9|processStaffPayroll|runNotFound|主処理
10|processStaffPayroll|staffResultNotFound|主処理
11|processStaffPayroll|processStaffPayrollCatch|主処理
12|processStaffPayroll|failureStatusUpdate|補助
13|appendItem|appendItemCatch|主処理
14|appendItem|appendItemWithOrderProjection|主処理
15|cancelAccounting|cancelAccountingCatch|主処理
16|cancelAccounting|cancelAccountingGenericCatch|主処理
17|completeAccounting|completeAccountingCatch|主処理
18|completeAccounting|completeAccountingGenericCatch|主処理
19|completeAccountingV2|completeAccountingV2Catch|主処理
20|completeAccountingV2|completeAccountingV2GenericCatch|主処理
21|createBillWithActiveStay|operationForCreateBillKey(error.errorKey)|主処理
22|createBillWithActiveStay|runCreateBillTransaction|主処理
23|getBillPreviewTotals|previewTotalsCatch|主処理
24|startAccounting|operationForStartAccountingKey(error.errorKey)|主処理
25|startAccounting|startAccountingCallableCatch|主処理
26|startAccounting|startAccountingRepoCatch|主処理
27|updateActiveBill|updateActiveBillCatch|主処理
28|updateActiveBill|updateActiveBillGenericCatch|主処理
29|verifyPaymentSplit|verifyPaymentSplitCatch|主処理
30|verifyPaymentSplit|verifyPaymentSplitGenericCatch|主処理
31|createMenuItem|imageUpload|主処理
32|createMenuItem|menuCreateCatch|主処理
33|getMenuItems|adminMenuDocMissing|主処理
34|getMenuItems|menuFetchCatch|主処理
35|placeOrder|chipPurchaseLog|補助
36|placeOrder|placeOrderCatch|主処理
37|placeOrder|placeOrderGenericCatch|主処理
38|placeOrderByUser|placeOrderCatch|主処理
39|placeOrderByUser|placeOrderGenericCatch|主処理
40|updateMenuItem|imageUpload|主処理
41|updateMenuItem|menuUpdateCatch|主処理
42|enqueueTournamentTasksByScheduler|runEnqueueSchedulerTask|主処理
43|enqueueTournamentTasksByScheduler|cloudTasksCreateTask|主処理
44|executeScheduledJobTask|runScheduledJob|主処理
45|executeScheduledJobTask|markReplanCompletedBestEffort|補助
46|executeScheduledJobTask|releaseReplanProcessingBestEffort|補助
47|writeSchedulerDispatchLogBestEffort|dispatchLogWrite|補助
48|writeSchedulerExecutionLogByCloudTaskBestEffort|executionLogWrite|補助
49|finalizeMonth|finalizeDayLoop|主処理
50|getRequiredStaffByTimeSlot|config_read|主処理
51|getShifts|initCatch|主処理
52|getShifts|shiftFetchCatch|主処理
53|getShifts|detailErrorLog|補助
54|getShifts|unknownErrorLog|補助
55|applyCloseSnapshot|applyBillCloseSnapshotTxn|主処理
56|applyCloseSnapshot|incrementUserUnsettledBillsCount|補助
57|applyCloseSnapshot|getClosedBusinessDate|主処理
58|cleanupActiveStaysOnClose|deleteActiveStayDocument|主処理
59|cleanupActiveStaysOnClose|cleanupOuterCatch|主処理
60|closeStore|closeStoreCatch|主処理
61|closeStore|closeStoreGenericCatch|主処理
62|closeStoreTerminal|closeTerminalPreflight|主処理
63|closeStoreTerminal|acquireProcessingLease|主処理
64|closeStoreTerminal|finalizeCloseStateDoc.enqueueOpenAssessmentRecheck|補助
65|closeStoreTerminal|runCloseStep.\${stepName}|主処理
66|closeStoreTerminal|rollbackUnsettledMark|補助
67|continueBusinessTerminal|cloudTasksCreateTask|補助
68|continueBusinessTerminal|continueBusinessTerminalFunctionCustom|主処理
69|createInitialStateDoc|createDocMainCatch|主処理
70|createInitialStateDoc|scriptTopLevelCatch|主処理
71|createInitialStateDocCallable|createInitialStateDoc|主処理
72|getCloseIntegrityData|closeIntegrityAggregate|主処理
73|getCurrentBusinessDateKeyOrThrow|loadFirestoreStateDoc|主処理
74|getUnclockedStaffForClose|unclockedStaffQuery|主処理
75|getUnclosedTournamentsForClose|unclosedTournamentsQuery|主処理
76|getUnsettledBillsForClose|unsettledBillsQuery|主処理
77|initializeStoreConfigCallable|initStoreMetaConfig|主処理
78|openStore|openStoreCatch|主処理
79|openStore|openStoreGenericCatch|主処理
80|openStoreTerminal|openTerminalPreflight|主処理
81|openStoreTerminal|acquireProcessingLease|主処理
82|openStoreTerminal|runOpenStep.\${stepName}|主処理
83|temporaryUnlockAlreadyRunningDifferentDateTerminal|cloudTasksCreateTask|補助
84|updateUnclockedAttendanceWithAuth|passwordClockOutUpdate|主処理
85|addTableToTournament|addTableToTournamentCatch|主処理
86|addTableToTournament|addTableToTournamentGenericCatch|主処理
87|addon|recordTournamentActionBestEffort|補助
88|addon|addonMainCatch|主処理
89|addon|addonOperationLogWrite|補助
90|assignSeatToPlayer|updatePlaceBestEffort|補助
91|assignSeatToPlayer|assignSeatToPlayerCatch|主処理
92|assignSeatToPlayer|assignSeatGenericCatch|主処理
93|assignSeatToPlayer|assignSeatOperationLogWrite|補助
94|bulkAddon|recordActionPerUserBestEffort|補助
95|bulkAddon|bulkAddonMainCatch|主処理
96|bulkAddon|bulkAddonOperationLogWrite|補助
97|bustAndExit|updatePlaceBestEffort|補助
98|bustAndExit|bustAndExitMainCatch|主処理
99|bustAndExit|bustAndExitOperationLogWrite|補助
100|bustAndReentry|recordTournamentActionBestEffort|補助
101|bustAndReentry|bustAndReentryMainCatch|主処理
102|bustAndReentry|bustAndReentryOperationLogWrite|補助
103|createTemporaryTable|createTemporaryTableCatch|主処理
104|createTemporaryTable|createTemporaryTableGenericCatch|主処理
105|getRankingData|getRankingDataCatch|主処理
106|getRankingData|getRankingDataGenericCatch|主処理
107|pauseTournament|pauseTournamentCatch|主処理
108|pauseTournament|pauseTournamentGenericCatch|主処理
109|registerForTournament|recordTournamentAction|補助
110|registerForTournament|registerTournamentFlow|主処理
111|registerForTournament|recordFailureOperationLog|補助
112|registerParticipants|recordActionPerUserBestEffort|補助
113|registerParticipants|registerUserFailed|主処理
114|registerParticipants|registerParticipantsMainCatch|主処理
115|registerParticipants|registerParticipantsOperationLogWrite|補助
116|removeTableFromTournament|removeTableFromTournamentCatch|主処理
117|removeTableFromTournament|removeTableFromTournamentGenericCatch|主処理
118|reseatAllPlayers|updatePlacePerAssignmentBestEffort|補助
119|reseatAllPlayers|reseatAllPlayersCatch|主処理
120|reseatAllPlayers|reseatAllPlayersGenericCatch|主処理
121|reseatAllPlayers|reseatAllPlayersOperationLogWrite|補助
122|resumeTournament|resumeTournamentCatch|主処理
123|resumeTournament|resumeTournamentGenericCatch|主処理
124|setRankingData|setRankingDataRankings|主処理
125|setRankingData|setRankingDataPrizeGrant|主処理
126|createScheduledTournament|enqueueAfterCreate|補助
127|createScheduledTournament|createScheduledTournamentCatch|主処理
128|createScheduledTournament|createScheduledTournamentGenericCatch|主処理
129|createTournamentRecurrence|enqueueAfterCreate|補助
130|createTournamentRecurrence|createTournamentRecurrenceCatch|主処理
131|createTournamentRecurrence|createTournamentRecurrenceGenericCatch|主処理
132|createTournamentRecurrence|createTournamentRecurrenceInnerHelper|主処理
133|enqueueTournamentTasks|enqueueBatchPartialErrors|主処理
134|enqueueTournamentTasks|enqueueTournamentTasksCatch|主処理
135|enqueueTournamentTasks|enqueueTournamentTasksGenericCatch|主処理
136|runEnqueueTournamentTasks|enqueueTournamentTask|主処理
137|runEnqueueTournamentTasks|processTournamentBatchItem|主処理
138|runGenerateRecurringTournaments|validateRecurringStoreTenant|主処理
139|runGenerateRecurringTournaments|parseRecurrenceInterval|主処理
140|runGenerateRecurringTournaments|parseRecurrenceIntervalWrongType|主処理
141|runGenerateRecurringTournaments|enqueueAfterGenerate|補助
142|runGenerateRecurringTournaments|runGenerateRecurringTournamentsOuterCatch|主処理
143|updateScheduledTournamentStartAt|validateStartAtUpdatePreconditions|主処理
144|updateScheduledTournamentStatus|validateStatusTransition|主処理
145|generateQRCode|transaction|主処理
146|generateQRCode|generateQRCodeOuterCatch|主処理
147|lineWebhook|token|主処理
148|lineWebhook|replyPostbackPlanDisabledNotOk|補助
149|lineWebhook|replyPostbackPlanDisabledCatch|補助
150|lineWebhook|replyPostbackDeclineConfirmNotOk|補助
151|lineWebhook|replyPostbackDeclineConfirmCatch|補助
152|lineWebhook|postback|主処理
153|lineWebhook|followOrUnblock|主処理
154|lineWebhook|handler|主処理
155|linkStaffRichMenu|linkStaffRichMenuHttpFail|主処理
156|linkStaffRichMenu|linkStaffRichMenuCatch|主処理
157|linkUserRichMenu|linkUserRichMenuHttpFail|主処理
158|linkUserRichMenu|linkUserRichMenuCatch|主処理
159|sendLineButtonMessage|token|主処理
160|sendLineButtonMessage|validate|主処理
161|sendLineButtonMessage|buttonPushResponseNotOk|主処理
162|sendLineButtonMessage|buttonPushCatch|主処理
163|sendLinePushMessage|token|主処理
164|sendLinePushMessage|validate|主処理
165|sendLinePushMessage|pushResponseNotOk|主処理
166|sendLinePushMessage|pushCatch|主処理
167|scheduleGenerateNextYearBusinessHours|generateMonthFailed|主処理
168|scheduleGenerateNextYearBusinessHours|taskOuterCatch|主処理
169|getPayrollConfig|config_read|主処理
170|getSchedulerConfig|config_read|主処理
171|getStoreConfig|config_read|主処理
172|controlHookHttp|validateControlHookRequest|主処理
173|controlHookHttp|executeNewPayloadTask|主処理
174|controlHookHttp|executeLegacyPayloadTask|主処理
175|getLineConfig|warmupSecrets|補助
176|updateDeviceOptions|updateDeviceOptionsCatch|主処理
177|updateDeviceRole|updateDeviceRoleCatch|主処理
`.trim();

const part2 = {};
for (const line of part2Raw.split("\n")) {
  const [num, fe, op, cls] = line.split("|");
  part2[`${num}|${fe}|${op}`] = cls;
}

let md = fs.readFileSync(mdPath, "utf8");
if (!md.includes("**主処理/補助列**")) {
  md = md.replace(
    "- **FC静列**:",
    "- **主処理/補助列**: 業務上の役割の説明に基づき、当該判定単位が **主処理**（その操作の主目的の成否に直結）か **補助処理**（主成功後の付随・記録・通知・同期・二次ログ・ベストエフォート・補償等）かを二分。優先ルール（BestEffort・操作ログ・二次ログ・監査ログ・dispatch/execution log 等）は補助寄り。迷う場合は「主目的未達か」で判断し、迷う場合は備考に `要確認`。\n- **FC静列**:"
  );
}

const lines = md.split("\n");
const out = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (/^\| # \| functionEntry \| 業務上の役割 \| 主要業務 \| 高頻度業務 \| FC静 \|$/.test(line)) {
    out.push("| # | functionEntry | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 |");
    continue;
  }
  if (line === "|---|---------------|-------------|----------|-----------|-----------|") {
    out.push("|---|---------------|-------------|----------|-----------|-------------|-----------|");
    continue;
  }

  if (
    /^\| # \| functionEntry \| operation \| 業務上の役割 \| 主要業務 \| 高頻度業務 \| FC静 \| 備考/.test(line) ||
    /^\| # \| functionEntry \| operation \| 業務上の役割 \| 主要業務 \| 高頻度業務 \| FC静 \| 備考（Part2） \|$/.test(line)
  ) {
    const isP2 = line.includes("備考（Part2）");
    out.push(
      `| # | functionEntry | operation | 業務上の役割 | 主要業務 | 高頻度業務 | 主処理/補助 | FC静 | ${isP2 ? "備考（Part2）" : "備考"} |`
    );
    continue;
  }
  if (line === "|---|---------------|-----------|-------------|----------|-----------|-----------|---------------|") {
    out.push("|---|---------------|-----------|-------------|----------|-----------|-------------|-----------|---------------|");
    continue;
  }

  // Part 1 row: | n | `fe` | ... | hi | fc |
  const p1 = line.match(/^\| (\d+) \| `([^`]+)` \| (.+) \| (\d+\??) \| (\d+\??) \| ([^|]*) \|$/);
  if (p1) {
    const n = parseInt(p1[1], 10);
    const cls = part1[n];
    if (!cls) throw new Error("part1 " + n);
    let fc = p1[6].trim();
    if (n === 100 && !fc.includes("要確認")) {
      fc = fc ? `${fc} 要確認` : "要確認";
    }
    out.push(
      `| ${p1[1]} | \`${p1[2]}\` | ${p1[3]} | ${p1[4]} | ${p1[5]} | ${cls} | ${fc} |`
    );
    continue;
  }

  // Part 2 row — already has 主処理/補助 column (skip; re-running must not mis-parse FC as 主処理)
  const p2Done = line.match(
    /^\| (\d+) \| `([^`]+)` \| `([^`]+)` \| (.+) \| (\d+\??) \| (\d+\??) \| (主処理|補助) \| ([^|]*) \| (.*) \|$/
  );
  if (p2Done) {
    out.push(line);
    continue;
  }

  // Part 2 row — legacy 8-column body (主要/高頻/FC/備考 のみ)
  const p2 = line.match(
    /^\| (\d+) \| `([^`]+)` \| `([^`]+)` \| (.+) \| (\d+\??) \| (\d+\??) \| ([^|]*) \| (.*) \|$/
  );
  if (p2) {
    const key = `${p2[1]}|${p2[2]}|${p2[3]}`;
    const cls = part2[key];
    if (!cls) throw new Error("missing part2 " + key);
    out.push(
      `| ${p2[1]} | \`${p2[2]}\` | \`${p2[3]}\` | ${p2[4]} | ${p2[5]} | ${p2[6]} | ${cls} | ${p2[7].trim()} | ${p2[8]} |`
    );
    continue;
  }

  out.push(line);
}

fs.writeFileSync(mdPath, out.join("\n"), "utf8");
console.log("Wrote", mdPath);