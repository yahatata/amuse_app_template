import { getFunctions } from "firebase-admin/functions";

const DEFAULT_TASK_QUEUE_REGION = "asia-northeast1";

function toRegionalFunctionName(
  functionName: string,
  region: string = DEFAULT_TASK_QUEUE_REGION
): string {
  if (functionName.startsWith("projects/") || functionName.startsWith("locations/")) {
    return functionName;
  }
  return `locations/${region}/functions/${functionName}`;
}

export function getRegionalTaskQueue<Args = unknown>(
  functionName: string,
  region: string = DEFAULT_TASK_QUEUE_REGION
) {
  const regionalFunctionName = toRegionalFunctionName(functionName, region);
  return getFunctions().taskQueue<Args>(regionalFunctionName);
}
