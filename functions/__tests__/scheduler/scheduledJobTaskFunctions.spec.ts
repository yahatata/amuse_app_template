import {
  registerScheduledJobTaskFunctions,
  scheduledJobTaskFunctionsByQueueName,
} from "../../src/domains/scheduler/tasks/scheduledJobTaskFunctions";
import { SCHEDULED_JOB_QUEUE_BY_KEY } from "../../src/shared/config/cloudTasksConfig";

function getByHyphenPath(
  target: Record<string, unknown>,
  hyphenPath: string
): unknown {
  const segments = hyphenPath.split("-").filter((segment) => segment.length > 0);
  let cursor: unknown = target;
  for (const segment of segments) {
    if (typeof cursor !== "object" || cursor === null) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

describe("scheduledJobTaskFunctions", () => {
  it("queue map に定義された全 queue 名が関数として登録される", () => {
    const expectedQueueNames = Object.values(SCHEDULED_JOB_QUEUE_BY_KEY).sort();
    const actualQueueNames = Object.keys(scheduledJobTaskFunctionsByQueueName).sort();
    expect(actualQueueNames).toEqual(expectedQueueNames);
  });

  it("registerScheduledJobTaskFunctions が target へ全関数をセットする", () => {
    const target: Record<string, unknown> = {};
    registerScheduledJobTaskFunctions(target);

    for (const queueName of Object.values(SCHEDULED_JOB_QUEUE_BY_KEY)) {
      const registered = getByHyphenPath(target, queueName);
      expect(registered).toBeDefined();
      expect(typeof registered).toBe("function");
    }
  });
});
