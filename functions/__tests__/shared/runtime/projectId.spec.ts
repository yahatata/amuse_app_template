import { getRequiredProjectId } from '../../../src/shared/runtime/projectId';

const ENV_KEYS = ['GCLOUD_PROJECT', 'GCP_PROJECT', 'PROJECT_ID'] as const;

function clearProjectIdEnv(): void {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
}

describe('getRequiredProjectId', () => {
  const originalEnv: Record<(typeof ENV_KEYS)[number], string | undefined> = {
    GCLOUD_PROJECT: undefined,
    GCP_PROJECT: undefined,
    PROJECT_ID: undefined,
  };

  beforeEach(() => {
    ENV_KEYS.forEach((key) => {
      originalEnv[key] = process.env[key];
    });
    clearProjectIdEnv();
  });

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  it('GCLOUD_PROJECT を最優先で返す', () => {
    process.env.GCLOUD_PROJECT = 'project-gcloud';
    process.env.GCP_PROJECT = 'project-gcp';
    process.env.PROJECT_ID = 'project-id';

    expect(getRequiredProjectId()).toBe('project-gcloud');
  });

  it('GCLOUD_PROJECT が無い場合は GCP_PROJECT を返す', () => {
    process.env.GCP_PROJECT = 'project-gcp';
    process.env.PROJECT_ID = 'project-id';

    expect(getRequiredProjectId()).toBe('project-gcp');
  });

  it('GCLOUD_PROJECT / GCP_PROJECT が無い場合は PROJECT_ID を返す', () => {
    process.env.PROJECT_ID = 'project-id';

    expect(getRequiredProjectId()).toBe('project-id');
  });

  it('いずれも未設定の場合は例外を投げる', () => {
    expect(() => getRequiredProjectId()).toThrow(
      'プロジェクト ID が未設定です。実行環境を確認してください。'
    );
  });
});
