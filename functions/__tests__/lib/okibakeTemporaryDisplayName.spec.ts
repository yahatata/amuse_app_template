import {
  buildOkibakeTemporaryDisplayName,
  excelStyleColumnLetters,
} from '../../src/domains/tournament_activeTournament/lib/okibakeTemporaryDisplayName';

describe('okibakeTemporaryDisplayName', () => {
  it('excelStyleColumnLetters が A〜Z と AA に対応すること', () => {
    expect(excelStyleColumnLetters(1)).toBe('A');
    expect(excelStyleColumnLetters(26)).toBe('Z');
    expect(excelStyleColumnLetters(27)).toBe('AA');
  });

  it('buildOkibakeTemporaryDisplayName が オキバケ + 接尾辞となること', () => {
    expect(buildOkibakeTemporaryDisplayName(1)).toBe('オキバケA');
    expect(buildOkibakeTemporaryDisplayName(702)).toBe('オキバケZZ');
  });
});
