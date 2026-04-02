import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { getRequiredProjectId } from "../runtime/projectId";
import type { BusinessSecrets, LineConfig, TaskEndpoints } from "./types";

type SecretRecord = Record<string, unknown>;

const client = new SecretManagerServiceClient();

let lineConfigPromise: Promise<LineConfig> | null = null;
let taskEndpointsPromise: Promise<TaskEndpoints> | null = null;
let businessSecretsPromise: Promise<BusinessSecrets> | null = null;

function isRecord(value: unknown): value is SecretRecord {
  return typeof value === "object" && value !== null;
}

function assertRequiredString(
  source: SecretRecord,
  key: string,
  secretName: string
): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Secret [${secretName}] に required key [${key}] がありません`
    );
  }
  return value;
}

async function fetchSecretJson<T>(secretName: string): Promise<T> {
  const projectId = getRequiredProjectId();
  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
  });

  const payload = version.payload?.data?.toString("utf8");
  if (!payload) {
    throw new Error(`Secret [${secretName}] のペイロードが空です`);
  }

  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    throw new Error(
      `Secret [${secretName}] のJSON解析に失敗しました: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function loadLineConfig(): Promise<LineConfig> {
  const raw = await fetchSecretJson<unknown>("line-config");
  if (!isRecord(raw)) {
    throw new Error("Secret [line-config] の形式が不正です");
  }

  return {
    channelAccessToken: assertRequiredString(
      raw,
      "channelAccessToken",
      "line-config"
    ),
    staffRichMenuId: assertRequiredString(raw, "staffRichMenuId", "line-config"),
    userRichMenuId: assertRequiredString(raw, "userRichMenuId", "line-config"),
  };
}

async function loadTaskEndpoints(): Promise<TaskEndpoints> {
  const raw = await fetchSecretJson<unknown>("task-endpoints");
  if (!isRecord(raw)) {
    throw new Error("Secret [task-endpoints] の形式が不正です");
  }

  return {
    controlHookUrl: assertRequiredString(
      raw,
      "controlHookUrl",
      "task-endpoints"
    ),
    closeAssessmentUrl: assertRequiredString(
      raw,
      "closeAssessmentUrl",
      "task-endpoints"
    ),
    openAssessmentUrl: assertRequiredString(
      raw,
      "openAssessmentUrl",
      "task-endpoints"
    ),
  };
}

async function loadBusinessSecrets(): Promise<BusinessSecrets> {
  const raw = await fetchSecretJson<unknown>("business-secrets");
  if (!isRecord(raw)) {
    throw new Error("Secret [business-secrets] の形式が不正です");
  }

  return {
    qrSecretKey: assertRequiredString(raw, "qrSecretKey", "business-secrets"),
    unclockedAttendanceEditPassword: assertRequiredString(
      raw,
      "unclockedAttendanceEditPassword",
      "business-secrets"
    ),
  };
}

export function getLineConfig(): Promise<LineConfig> {
  if (!lineConfigPromise) {
    lineConfigPromise = loadLineConfig().catch((error) => {
      lineConfigPromise = null;
      throw error;
    });
  }
  return lineConfigPromise;
}

export function getTaskEndpoints(): Promise<TaskEndpoints> {
  if (!taskEndpointsPromise) {
    taskEndpointsPromise = loadTaskEndpoints().catch((error) => {
      taskEndpointsPromise = null;
      throw error;
    });
  }
  return taskEndpointsPromise;
}

export function getBusinessSecrets(): Promise<BusinessSecrets> {
  if (!businessSecretsPromise) {
    businessSecretsPromise = loadBusinessSecrets().catch((error) => {
      businessSecretsPromise = null;
      throw error;
    });
  }
  return businessSecretsPromise;
}

export function warmupSecrets(): void {
  void getLineConfig().catch((error) => {
    console.error("warmupSecrets: failed to load line-config", error);
  });
}

export function __resetSecretCacheForTests(): void {
  lineConfigPromise = null;
  taskEndpointsPromise = null;
  businessSecretsPromise = null;
}
