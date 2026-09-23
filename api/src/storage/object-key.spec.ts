import { belongsToOrganization, jobObjectKey } from './object-key.js';

describe('job object keys', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const jobId = '22222222-2222-4222-8222-222222222222';
  const fileId = '33333333-3333-4333-8333-333333333333';

  it('builds organization-scoped keys and ignores original names', () => {
    expect(
      jobObjectKey({
        organizationId,
        jobId,
        category: 'photos',
        fileId,
        extension: 'jpg',
      }),
    ).toBe(
      `organizations/${organizationId}/jobs/${jobId}/photos/${fileId}.jpg`,
    );
  });

  it('rejects foreign-tenant prefixes', () => {
    const key = jobObjectKey({
      organizationId,
      jobId,
      category: 'documents',
      fileId,
      extension: 'pdf',
    });
    expect(belongsToOrganization(key, organizationId)).toBe(true);
    expect(
      belongsToOrganization(key, '44444444-4444-4444-8444-444444444444'),
    ).toBe(false);
  });
});
