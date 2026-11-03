/**
 * Contract mirror of web `sanitizeMarkdownUrl` (Step 4.10).
 * Web has no Vitest runner; this documents the security allow-list expected of
 * `web/src/components/fieldops/ai/ai-markdown.tsx`.
 */

const ALLOWED = new Set(['http:', 'https:', 'mailto:']);

function sanitizeMarkdownUrlContract(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('#')) return trimmed;
  try {
    const parsed = new URL(trimmed, 'https://fieldkeel.invalid');
    if (!ALLOWED.has(parsed.protocol)) return '';
    return trimmed;
  } catch {
    return '';
  }
}

describe('AI Markdown URL sanitize contract (Step 4.10)', () => {
  it('allows http(s) and mailto', () => {
    expect(sanitizeMarkdownUrlContract('https://example.com/a')).toBe(
      'https://example.com/a',
    );
    expect(sanitizeMarkdownUrlContract('http://example.com')).toContain('http');
    expect(sanitizeMarkdownUrlContract('mailto:ops@example.com')).toBe(
      'mailto:ops@example.com',
    );
  });

  it('rejects javascript and data schemes', () => {
    expect(sanitizeMarkdownUrlContract('javascript:alert(1)')).toBe('');
    expect(sanitizeMarkdownUrlContract('data:text/html,hi')).toBe('');
  });

  it('keeps hash anchors', () => {
    expect(sanitizeMarkdownUrlContract('#section')).toBe('#section');
  });
});
