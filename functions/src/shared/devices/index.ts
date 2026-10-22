/**
 * shared/devices: デバイス・権限チェックの共通
 */
export { requireAdmin } from './requireAdmin';
export type { DeviceDoc } from './devicePermissions';
export {
  getCallerDeviceByUid,
  hasRequiredOption,
  hasStoreManagementPermission,
  isActive,
} from './devicePermissions';
export { registerDevice } from './callables/registerDevice';
export { updateDeviceOptions } from './callables/updateDeviceOptions';
export { updateDeviceRole } from './callables/updateDeviceRole';
export { updateDeviceStatus } from './callables/updateDeviceStatus';
export { archiveDevice } from './callables/archiveDevice';
