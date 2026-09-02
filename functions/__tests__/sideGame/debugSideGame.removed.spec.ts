import * as fs from 'fs';
import * as path from 'path';

import * as sideGame from '../../src/domains/sideGame';

describe('CLN-B4 debugSideGame removed', () => {
  it('is not exported from the sideGame domain', () => {
    expect(Object.prototype.hasOwnProperty.call(sideGame, 'debugSideGame')).toBe(
      false,
    );
  });

  it('source file is gone', () => {
    const sourcePath = path.join(
      __dirname,
      '../../src/domains/sideGame/callables/debugSideGame.ts',
    );
    expect(fs.existsSync(sourcePath)).toBe(false);
  });

  it('is not re-exported from functions index source', () => {
    const indexPath = path.join(__dirname, '../../src/index.ts');
    const indexSource = fs.readFileSync(indexPath, 'utf8');
    expect(indexSource).not.toMatch(/debugSideGame/);
  });
});
