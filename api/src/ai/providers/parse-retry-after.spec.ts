import { parseRetryAfterSeconds } from './ai-provider.types.js';

describe('parseRetryAfterSeconds', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfterSeconds('30')).toBe(30);
    expect(parseRetryAfterSeconds('0')).toBe(0);
  });

  it('parses HTTP-date relative to now', () => {
    const now = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');
    const header = 'Wed, 21 Oct 2015 07:28:30 GMT';
    expect(parseRetryAfterSeconds(header, now)).toBe(30);
  });

  it('returns null for missing or invalid values', () => {
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds('')).toBeNull();
    expect(parseRetryAfterSeconds('not-a-date')).toBeNull();
  });
});
