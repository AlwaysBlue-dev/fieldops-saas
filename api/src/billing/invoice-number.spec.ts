import { formatInvoiceNumber } from './invoice-number.js';

describe('invoice numbers', () => {
  it('formats a collision-resistant annual sequence', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('FC-2026-000001');
    expect(formatInvoiceNumber(2026, 12)).toBe('FC-2026-000012');
    expect(new Set([formatInvoiceNumber(2026, 1), formatInvoiceNumber(2026, 2)]).size).toBe(2);
  });
});
