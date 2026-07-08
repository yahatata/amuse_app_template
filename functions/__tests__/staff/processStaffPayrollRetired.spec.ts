import * as fs from 'fs';
import * as path from 'path';

describe('processStaffPayroll retired staff handling', () => {
  it('does not exclude retired staff by status when loading staff doc', () => {
    const sourcePath = path.join(
      __dirname,
      '../../src/domains/attendance/tasks/processStaffPayroll.ts'
    );
    const source = fs.readFileSync(sourcePath, 'utf8');
    expect(source).toContain("db.collection('staffs').doc(staffId).get()");
    expect(source).not.toMatch(/status\s*!==\s*['"]retired['"]/);
    expect(source).not.toMatch(/status\s*===\s*['"]retired['"]/);
  });
});
