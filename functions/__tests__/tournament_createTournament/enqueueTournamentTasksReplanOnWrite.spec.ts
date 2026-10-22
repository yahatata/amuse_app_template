jest.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: (_path: string, handler: unknown) => handler,
}));

jest.mock(
  "../../src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest",
  () => ({
    upsertEnqueueTournamentTasksReplanRequest: jest
      .fn()
      .mockResolvedValue(undefined),
  })
);

jest.mock(
  "../../src/domains/scheduler/replan/enqueueTournamentTasksReplanTask",
  () => ({
    enqueueTournamentTasksReplanTask: jest.fn().mockResolvedValue(undefined),
  })
);

import { enqueueTournamentTasksReplanOnWrite } from "../../src/domains/tournament_createTournament/triggers/enqueueTournamentTasksReplanOnWrite";
import { upsertEnqueueTournamentTasksReplanRequest } from "../../src/domains/scheduler/replan/enqueueTournamentTasksReplanRequest";
import { enqueueTournamentTasksReplanTask } from "../../src/domains/scheduler/replan/enqueueTournamentTasksReplanTask";

type MockDoc = {
  exists: boolean;
  data: () => Record<string, unknown>;
};

function createEvent(before: MockDoc, after: MockDoc): Record<string, unknown> {
  return {
    params: { tournamentId: "tournament-1" },
    data: {
      before,
      after,
    },
  };
}

describe("enqueueTournamentTasksReplanOnWrite", () => {
  const mockUpsert = upsertEnqueueTournamentTasksReplanRequest as jest.MockedFunction<
    typeof upsertEnqueueTournamentTasksReplanRequest
  >;
  const mockEnqueueReplanTask = enqueueTournamentTasksReplanTask as jest.MockedFunction<
    typeof enqueueTournamentTasksReplanTask
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("スケジュール影響更新 + taskSyncNeeded=true で replan request を作成する", async () => {
    const beforeDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: false,
        startAt: { toMillis: () => 1000 },
        schedulePlanVersion: 1,
        templateId: "template-a",
      }),
    };
    const afterDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: true,
        startAt: { toMillis: () => 2000 },
        schedulePlanVersion: 2,
        templateId: "template-a",
      }),
    };

    await (enqueueTournamentTasksReplanOnWrite as any)(createEvent(beforeDoc, afterDoc));

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      requestedBy: "firestore-trigger",
      reason: "scheduledTournamentUpdated",
    });
    expect(mockEnqueueReplanTask).toHaveBeenCalledTimes(1);
  });

  it("taskSyncNeeded が true でなければ何もしない", async () => {
    const beforeDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: false,
        startAt: { toMillis: () => 1000 },
      }),
    };
    const afterDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: false,
        startAt: { toMillis: () => 2000 },
      }),
    };

    await (enqueueTournamentTasksReplanOnWrite as any)(createEvent(beforeDoc, afterDoc));

    expect(mockUpsert).toHaveBeenCalledTimes(0);
    expect(mockEnqueueReplanTask).toHaveBeenCalledTimes(0);
  });

  it("templateId 変更時は reason=templateUpdated で request を作成する", async () => {
    const beforeDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: false,
        schedulePlanVersion: 1,
        templateId: "template-a",
      }),
    };
    const afterDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: true,
        schedulePlanVersion: 2,
        templateId: "template-b",
      }),
    };

    await (enqueueTournamentTasksReplanOnWrite as any)(createEvent(beforeDoc, afterDoc));

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      requestedBy: "firestore-trigger",
      reason: "templateUpdated",
    });
    expect(mockEnqueueReplanTask).toHaveBeenCalledTimes(1);
  });

  it("recurrenceId 変更時は reason=recurrenceUpdated で request を作成する", async () => {
    const beforeDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: false,
        schedulePlanVersion: 1,
        recurrenceId: "recurrence-a",
        startAt: { toMillis: () => 1000 },
      }),
    };
    const afterDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: true,
        schedulePlanVersion: 2,
        recurrenceId: "recurrence-b",
        startAt: { toMillis: () => 2000 },
      }),
    };

    await (enqueueTournamentTasksReplanOnWrite as any)(createEvent(beforeDoc, afterDoc));

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      requestedBy: "firestore-trigger",
      reason: "recurrenceUpdated",
    });
    expect(mockEnqueueReplanTask).toHaveBeenCalledTimes(1);
  });

  it("taskSyncNeeded=true でも schedule 影響差分がなければ何もしない", async () => {
    const beforeDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: true,
        schedulePlanVersion: 1,
        templateId: "template-a",
      }),
    };
    const afterDoc: MockDoc = {
      exists: true,
      data: () => ({
        taskSyncNeeded: true,
        schedulePlanVersion: 1,
        templateId: "template-a",
      }),
    };

    await (enqueueTournamentTasksReplanOnWrite as any)(createEvent(beforeDoc, afterDoc));

    expect(mockUpsert).toHaveBeenCalledTimes(0);
    expect(mockEnqueueReplanTask).toHaveBeenCalledTimes(0);
  });
});
