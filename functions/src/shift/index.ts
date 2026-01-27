// Shift management Cloud Functions
export { initBusinessHoursForMonth } from "./initBusinessHoursForMonth";
export { initShiftDaysForMonth } from "./initShiftDaysForMonth";
// createShiftRequest は staff/createShiftRequest と重複するため、shift側は別名でエクスポート
// Flutter側では createStaffShiftRequest として使用
export { createShiftRequest as createStaffShiftRequest } from "./createShiftRequest";
export { interimConfirmRequests } from "./interimConfirmRequests";
export { updateDayAssignments } from "./updateDayAssignments";
export { finalizeDay } from "./finalizeDay";
export { finalizeMonth } from "./finalizeMonth";
export { setSufficientOverride } from "./setSufficientOverride";
export { calculateInsufficientDays } from "./calculateInsufficientDays";
export { createRecruitments } from "./createRecruitments";
export { sendRecruitmentNotification } from "./sendRecruitmentNotification";

// 営業時間スタイル自動生成関連関数
export { generateBusinessHoursForMonthFromStyles } from "./generateBusinessHoursForMonthFromStyles";
export { generateBusinessHoursForYearFromStyles } from "./generateBusinessHoursForYearFromStyles";
export { setBusinessHoursManualForDay } from "./setBusinessHoursManualForDay";

// スケジュールトリガー（onSchedule）は別途エクスポート
export { scheduleGenerateNextYearBusinessHours } from "./scheduleGenerateNextYearBusinessHours";
