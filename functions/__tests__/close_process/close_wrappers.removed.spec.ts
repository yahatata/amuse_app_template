/**
 * Phase 5: close 系 public callable wrapper が無く、internal run* が残ること。
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '../../src');

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

describe('close public wrappers removed', () => {
  it('onCall wrappers are gone', () => {
    const resetTables = readSrc('domains/storeMeta/services/resetAllTables.ts');
    const resetSideGames = readSrc('domains/storeMeta/services/resetAllSideGames.ts');
    const migrate = readSrc(
      'domains/analytics/callables/migrateSettledBillsForBusinessDay.ts'
    );
    const cleanup = readSrc(
      'domains/storeMeta/services/cleanupActiveStaysOnClose.ts'
    );
    const storeMetaIndex = readSrc('domains/storeMeta/index.ts');
    const analyticsIndex = readSrc('domains/analytics/index.ts');

    expect(resetTables).not.toMatch(/export const resetAllTables = onCall/);
    expect(resetSideGames).not.toMatch(/export const resetAllSideGames = onCall/);
    expect(migrate).not.toMatch(
      /export const migrateSettledBillsForBusinessDay = onCall/
    );
    expect(cleanup).not.toMatch(
      /export const cleanupActiveStaysOnClose = onCall/
    );

    expect(storeMetaIndex).not.toMatch(
      /export \{ resetAllTables \} from '\.\/services\/resetAllTables'/
    );
    expect(storeMetaIndex).not.toMatch(
      /export \{ resetAllSideGames \} from '\.\/services\/resetAllSideGames'/
    );
    expect(storeMetaIndex).not.toMatch(
      /export \{ cleanupActiveStaysOnClose \} from '\.\/services\/cleanupActiveStaysOnClose'/
    );
    expect(analyticsIndex).not.toMatch(
      /export \{ migrateSettledBillsForBusinessDay \}/
    );
  });

  it('internal run* and closeStoreTerminal wiring remain', () => {
    const resetTables = readSrc('domains/storeMeta/services/resetAllTables.ts');
    const resetSideGames = readSrc('domains/storeMeta/services/resetAllSideGames.ts');
    const migrate = readSrc(
      'domains/analytics/callables/migrateSettledBillsForBusinessDay.ts'
    );
    const cleanup = readSrc(
      'domains/storeMeta/services/cleanupActiveStaysOnClose.ts'
    );
    const close = readSrc('domains/storeMeta/callables/closeStoreTerminal.ts');

    expect(resetTables).toContain('export async function runResetAllTables');
    expect(resetSideGames).toContain('export async function runResetAllSideGames');
    expect(migrate).toContain(
      'export async function runMigrateSettledBillsForBusinessDay'
    );
    expect(cleanup).toContain('export async function runCleanupActiveStays');

    expect(close).toContain(
      "import { runResetAllSideGames } from '../services/resetAllSideGames'"
    );
    expect(close).toContain(
      "import { runResetAllTables } from '../services/resetAllTables'"
    );
    expect(close).toContain(
      "import { runCleanupActiveStays } from '../services/cleanupActiveStaysOnClose'"
    );
    expect(close).toContain(
      "import { runMigrateSettledBillsForBusinessDay } from '../../analytics/callables/migrateSettledBillsForBusinessDay'"
    );
    expect(close).toContain('await runResetAllSideGames(db)');
    expect(close).toContain('await runResetAllTables(db)');
    expect(close).toContain('await runCleanupActiveStays(db)');
    expect(close).toContain(
      'await runMigrateSettledBillsForBusinessDay(db, closedBusinessDate)'
    );
  });
});
