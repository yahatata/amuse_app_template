// Staff management Cloud Functions
export { getShifts } from "./callables/getShifts";
export { createMultipleShifts } from "./callables/createMultipleShifts";
export { updateShiftRequest } from "./callables/updateShiftRequest";
export { confirmShiftRequest } from "./callables/confirmShiftRequest";
export { createStaffAccount } from "./callables/createStaffAccount";
export { updateStaffHourlyWage } from "./callables/updateStaffHourlyWage";
export { updateStaffBankInfo } from "./callables/updateStaffBankInfo";
export { scheduledCleanup } from "./scheduler/scheduledCleanup";
