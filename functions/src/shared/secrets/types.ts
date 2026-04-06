export type LineConfig = {
  channelAccessToken: string;
  staffRichMenuId: string;
  userRichMenuId: string;
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
