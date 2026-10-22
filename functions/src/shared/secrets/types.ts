export type LineConfig = {
  channelAccessToken: string;
  staffRichMenuId: string;
  userRichMenuId: string;
  /** Webhook の X-Line-Signature 検証用（Secret Manager の line-config JSON に任意で追加） */
  channelSecret?: string;
};

export type TaskEndpoints = {
  controlHookUrl: string;
  closeAssessmentUrl: string;
  openAssessmentUrl: string;
};

export type BusinessSecrets = {
  qrSecretKey: string;
  unclockedAttendanceEditPassword: string;
  openBusinessDateAdjustmentPassword: string;
};
