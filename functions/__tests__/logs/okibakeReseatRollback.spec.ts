import {
  buildRestoredSeatsForReseatUndo,
  clearOkibakeAtSeatPrefix,
  removeOkibakeEntryIdFromSeatsMap,
} from '../../src/domains/logs/lib/okibakeReseatRollback';
import type { OkibakeReseatTarget } from '../../src/domains/tournament_activeTournament/lib/slimOkibakeEntryForReseatLog';

describe('okibakeReseatRollback seat cleanup', () => {
  it('clearOkibakeAtSeatPrefix は okibake 席の PokerName も消す', () => {
    const seats: Record<string, unknown> = {
      seat01UserId: null,
      seat01PokerName: 'オキバケ',
      seat01OkibakeEntryId: 'ok-1',
    };
    clearOkibakeAtSeatPrefix(seats, 'seat01');
    expect(seats.seat01OkibakeEntryId).toBeNull();
    expect(seats.seat01PokerName).toBeNull();
  });

  it('clearOkibakeAtSeatPrefix は通常席の PokerName は残す', () => {
    const seats: Record<string, unknown> = {
      seat01UserId: 'user-1',
      seat01PokerName: '太郎',
      seat01OkibakeEntryId: 'ok-1',
    };
    clearOkibakeAtSeatPrefix(seats, 'seat01');
    expect(seats.seat01OkibakeEntryId).toBeNull();
    expect(seats.seat01PokerName).toBe('太郎');
  });

  it('buildRestoredSeatsForReseatUndo は current にだけある OkibakeEntryId を null にする', () => {
    const previousSeats = {
      seat01UserId: null,
      seat01PokerName: null,
    };
    const currentSeats = {
      seat01UserId: null,
      seat01PokerName: 'オキバケ',
      seat01OkibakeEntryId: 'ok-1',
    };
    const targets: OkibakeReseatTarget[] = [
      {
        okibakeEntryId: 'ok-1',
        okibakeEntryBefore: {
          entryStatus: 'registered',
          billLinkStatus: 'unlinked',
          assignedTableId: null,
          assignedSeatKey: null,
          assignedSeatNumber: null,
          seatedAt: null,
          updatedAt: null,
          updatedByDeviceId: null,
        },
        okibakeEntryAfter: {
          entryStatus: 'seated',
          billLinkStatus: null,
          assignedTableId: 'table_001',
          assignedSeatKey: 'seat01',
          assignedSeatNumber: 1,
          seatedAt: null,
          updatedAt: null,
          updatedByDeviceId: null,
        },
      },
    ];

    const restored = buildRestoredSeatsForReseatUndo(
      previousSeats,
      currentSeats,
      targets,
      'table_001',
    );
    expect(restored.seat01OkibakeEntryId).toBeNull();
    expect(restored.seat01PokerName).toBeNull();
  });

  it('removeOkibakeEntryIdFromSeatsMap は全席から指定 entryId を消す', () => {
    const seats: Record<string, unknown> = {
      seat01OkibakeEntryId: 'ok-1',
      seat01PokerName: 'A',
      seat02OkibakeEntryId: 'ok-2',
      seat02PokerName: 'B',
    };
    removeOkibakeEntryIdFromSeatsMap(seats, 'ok-1');
    expect(seats.seat01OkibakeEntryId).toBeNull();
    expect(seats.seat01PokerName).toBeNull();
    expect(seats.seat02OkibakeEntryId).toBe('ok-2');
  });
});
