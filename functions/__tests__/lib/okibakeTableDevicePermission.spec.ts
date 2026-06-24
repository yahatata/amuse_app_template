import { HttpsError } from 'firebase-functions/v2/https';
import type { DeviceDoc } from '../../src/shared/devices';
import {
  assertOkibakeTournamentOperationPermission,
  assertTableDeviceCanAccessOkibakeEntry,
  resolveOkibakeAssignedTableId,
} from '../../src/domains/tournament_activeTournament/lib/okibakeTableDevicePermission';

describe('okibakeTableDevicePermission', () => {
  const tableDevice: DeviceDoc = {
    id: 'dev-table',
    role: 'table',
    status: 'active',
    options: {},
    optionParams: {
      table_device_table: { tableId: 'tbl-a' },
    },
  };

  const terminalDevice: DeviceDoc = {
    id: 'dev-term',
    role: 'terminal',
    status: 'active',
    options: { tournament: true },
    optionParams: {},
  };

  it('resolveOkibakeAssignedTableId は assignedTableId を返す', () => {
    expect(resolveOkibakeAssignedTableId({ assignedTableId: ' tbl-a ' })).toBe('tbl-a');
    expect(resolveOkibakeAssignedTableId({ assignedTableId: '' })).toBeNull();
    expect(resolveOkibakeAssignedTableId(undefined)).toBeNull();
  });

  it('assertOkibakeTournamentOperationPermission は table role を許可する', () => {
    expect(() => assertOkibakeTournamentOperationPermission(tableDevice)).not.toThrow();
  });

  it('assertTableDeviceCanAccessOkibakeEntry は自卓着席のみ許可する', () => {
    expect(() =>
      assertTableDeviceCanAccessOkibakeEntry({
        device: tableDevice,
        entry: { assignedTableId: 'tbl-a' },
      }),
    ).not.toThrow();

    expect(() =>
      assertTableDeviceCanAccessOkibakeEntry({
        device: terminalDevice,
        entry: { assignedTableId: 'other' },
      }),
    ).not.toThrow();
  });

  it('assertTableDeviceCanAccessOkibakeEntry は別卓・未着席を拒否する', () => {
    expect(() =>
      assertTableDeviceCanAccessOkibakeEntry({
        device: tableDevice,
        entry: { assignedTableId: 'tbl-b' },
      }),
    ).toThrow(HttpsError);

    expect(() =>
      assertTableDeviceCanAccessOkibakeEntry({
        device: tableDevice,
        entry: { assignedTableId: null },
      }),
    ).toThrow('着席していない置きバケは卓端末から操作できません');
  });
});
