import {
  DEVICE_STATUS_ACTIVE,
  DEVICE_STATUS_ARCHIVED,
  DEVICE_STATUS_BLOCKED,
  isActive,
  isArchivedStatus,
  isOperationalStatus,
  normalizeDeviceStatus,
} from "../../../src/shared/devices/deviceStatus";

describe("deviceStatus", () => {
  it("normalizeDeviceStatus: retired を archived 相当にする", () => {
    expect(normalizeDeviceStatus("retired")).toBe(DEVICE_STATUS_ARCHIVED);
    expect(normalizeDeviceStatus(undefined)).toBe(DEVICE_STATUS_ACTIVE);
    expect(normalizeDeviceStatus("blocked")).toBe(DEVICE_STATUS_BLOCKED);
  });

  it("isArchivedStatus: archived / retired を true", () => {
    expect(isArchivedStatus("archived")).toBe(true);
    expect(isArchivedStatus("retired")).toBe(true);
    expect(isArchivedStatus("active")).toBe(false);
  });

  it("isOperationalStatus: active / blocked のみ", () => {
    expect(isOperationalStatus("active")).toBe(true);
    expect(isOperationalStatus("blocked")).toBe(true);
    expect(isOperationalStatus("archived")).toBe(false);
    expect(isOperationalStatus("retired")).toBe(false);
  });

  it("isActive: active のみ", () => {
    expect(isActive("active")).toBe(true);
    expect(isActive(undefined)).toBe(true);
    expect(isActive("blocked")).toBe(false);
    expect(isActive("archived")).toBe(false);
  });
});
