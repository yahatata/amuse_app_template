import { Timestamp } from 'firebase-admin/firestore';
import {
  recalculateOkibakeAddonFieldsFromRecords,
} from '../../src/domains/logs/services/undoOkibakeAddon';

describe('recalculateOkibakeAddonFieldsFromRecords', () => {
  it('rolledBack でない record のみカウントする', () => {
    const t1 = Timestamp.fromDate(new Date('2025-01-01T10:00:00Z'));
    const t2 = Timestamp.fromDate(new Date('2025-01-01T11:00:00Z'));

    const result = recalculateOkibakeAddonFieldsFromRecords([
      { addonRecordId: 'a1', rolledBack: false, occurredAt: t1 },
      { addonRecordId: 'a2', rolledBack: true, occurredAt: t2 },
      { addonRecordId: 'a3', rolledBack: false, occurredAt: t2 },
    ]);

    expect(result.okibakeAddonCount).toBe(2);
    expect(result.lastOkibakeAddonAt?.toMillis()).toBe(t2.toMillis());
  });

  it('有効 record が無いとき count=0 lastOkibakeAddonAt=null', () => {
    const result = recalculateOkibakeAddonFieldsFromRecords([
      { addonRecordId: 'a1', rolledBack: true },
    ]);

    expect(result.okibakeAddonCount).toBe(0);
    expect(result.lastOkibakeAddonAt).toBeNull();
  });
});
