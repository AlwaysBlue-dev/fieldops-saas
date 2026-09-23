import { describe, expect, it } from 'vitest';
import { sanitizeCsvCell, toCsv } from './csv.js';

describe('csv sanitize', () => {
  it('prefixes formula-like cells', () => {
    expect(sanitizeCsvCell('=CMD()')).toBe("'=CMD()");
    expect(sanitizeCsvCell('+1+1')).toBe("'+1+1");
    expect(sanitizeCsvCell('-2')).toBe("'-2");
    expect(sanitizeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('quotes commas and escapes quotes', () => {
    expect(sanitizeCsvCell('a,b')).toBe('"a,b"');
    expect(sanitizeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('builds csv rows', () => {
    expect(toCsv(['A', 'B'], [['1', '=x']])).toBe('A,B\r\n1,\'=x\r\n');
  });
});
