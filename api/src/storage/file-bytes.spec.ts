import { JobFileType } from '../generated/prisma/client.js';
import { assertAllowedMime, detectObjectMime } from './file-bytes.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('file magic bytes', () => {
  it('detects PNG and rejects executables', () => {
    expect(detectObjectMime(PNG)).toBe('image/png');
    expect(() => detectObjectMime(Buffer.from('MZ executable'))).toThrow();
  });

  it('does not allow PDFs as photos', () => {
    expect(() => assertAllowedMime(JobFileType.PHOTO, 'application/pdf')).toThrow();
    expect(() =>
      assertAllowedMime(JobFileType.DOCUMENT, 'application/pdf'),
    ).not.toThrow();
  });
});
