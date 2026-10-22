const mockAccessSecretVersion = jest.fn();
const mockGetRequiredProjectId = jest.fn(() => "project-test");

jest.mock("@google-cloud/secret-manager", () => ({
  SecretManagerServiceClient: jest.fn().mockImplementation(() => ({
    accessSecretVersion: mockAccessSecretVersion,
  })),
}));

jest.mock("../../../src/shared/runtime/projectId", () => ({
  getRequiredProjectId: () => mockGetRequiredProjectId(),
}));

import {
  __resetSecretCacheForTests,
  getBusinessSecrets,
  getLineConfig,
  getTaskEndpoints,
} from "../../../src/shared/secrets/secretManager";

type AccessSecretVersionResult = Array<{
  payload?: {
    data?: Buffer;
  };
}>;

function buildSecretPayload(data: Record<string, unknown>): AccessSecretVersionResult {
  return [
    {
      payload: {
        data: Buffer.from(JSON.stringify(data), "utf8"),
      },
    },
  ];
}

describe("shared/secrets/secretManager", () => {
  beforeEach(() => {
    __resetSecretCacheForTests();
    mockAccessSecretVersion.mockReset();
    mockGetRequiredProjectId.mockReset();
    mockGetRequiredProjectId.mockReturnValue("project-test");
  });

  it("line-config を取得できる", async () => {
    mockAccessSecretVersion.mockResolvedValueOnce(
      buildSecretPayload({
        channelAccessToken: "line-token",
        staffRichMenuId: "staff-menu",
        userRichMenuId: "user-menu",
      })
    );

    await expect(getLineConfig()).resolves.toEqual({
      channelAccessToken: "line-token",
      staffRichMenuId: "staff-menu",
      userRichMenuId: "user-menu",
    });

    expect(mockAccessSecretVersion).toHaveBeenCalledWith({
      name: "projects/project-test/secrets/line-config/versions/latest",
    });
  });

  it("同一 secret はキャッシュされる", async () => {
    mockAccessSecretVersion.mockResolvedValueOnce(
      buildSecretPayload({
        channelAccessToken: "line-token",
        staffRichMenuId: "staff-menu",
        userRichMenuId: "user-menu",
      })
    );

    const [first, second] = await Promise.all([getLineConfig(), getLineConfig()]);

    expect(first).toEqual(second);
    expect(mockAccessSecretVersion).toHaveBeenCalledTimes(1);
  });

  it("取得失敗時はキャッシュを破棄し再試行できる", async () => {
    mockAccessSecretVersion
      .mockRejectedValueOnce(new Error("temporary secret error"))
      .mockResolvedValueOnce(
        buildSecretPayload({
          channelAccessToken: "line-token",
          staffRichMenuId: "staff-menu",
          userRichMenuId: "user-menu",
        })
      );

    await expect(getLineConfig()).rejects.toThrow("temporary secret error");
    await expect(getLineConfig()).resolves.toEqual({
      channelAccessToken: "line-token",
      staffRichMenuId: "staff-menu",
      userRichMenuId: "user-menu",
    });

    expect(mockAccessSecretVersion).toHaveBeenCalledTimes(2);
  });

  it("required key が欠けると fail-fast する", async () => {
    mockAccessSecretVersion.mockResolvedValueOnce(
      buildSecretPayload({
        staffRichMenuId: "staff-menu",
        userRichMenuId: "user-menu",
      })
    );

    await expect(getLineConfig()).rejects.toThrow(
      "Secret [line-config] に required key [channelAccessToken] がありません"
    );
  });

  it("business-secrets は値を取得でき、エラー文に secret 値を含めない", async () => {
    const sensitiveValue = "SENSITIVE_PASSWORD_VALUE";
    mockAccessSecretVersion.mockResolvedValueOnce(
      buildSecretPayload({
        qrSecretKey: sensitiveValue,
      })
    );

    await expect(getBusinessSecrets()).rejects.toThrow(
      "Secret [business-secrets] に required key [unclockedAttendanceEditPassword] がありません"
    );
    await expect(getBusinessSecrets()).rejects.not.toThrow(sensitiveValue);
  });

  it("business-secrets の required key を全て取得できる", async () => {
    mockAccessSecretVersion.mockResolvedValueOnce(
      buildSecretPayload({
        qrSecretKey: "qr-key",
        unclockedAttendanceEditPassword: "unclocked-pass",
        openBusinessDateAdjustmentPassword: "open-adjust-pass",
      })
    );

    await expect(getBusinessSecrets()).resolves.toEqual({
      qrSecretKey: "qr-key",
      unclockedAttendanceEditPassword: "unclocked-pass",
      openBusinessDateAdjustmentPassword: "open-adjust-pass",
    });
  });

  it("task-endpoints を取得できる", async () => {
    mockAccessSecretVersion.mockResolvedValueOnce(
      buildSecretPayload({
        controlHookUrl: "https://example.com/control",
        closeAssessmentUrl: "https://example.com/close",
        openAssessmentUrl: "https://example.com/open",
      })
    );

    await expect(getTaskEndpoints()).resolves.toEqual({
      controlHookUrl: "https://example.com/control",
      closeAssessmentUrl: "https://example.com/close",
      openAssessmentUrl: "https://example.com/open",
    });
  });
});
