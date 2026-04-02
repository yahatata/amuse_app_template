export function getRequiredProjectId(): string {
  const projectId =
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT ??
    process.env.PROJECT_ID;

  if (!projectId) {
    throw new Error('プロジェクト ID が未設定です。実行環境を確認してください。');
  }

  return projectId;
}
