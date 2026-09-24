export type JobObjectCategory = 'photos' | 'documents' | 'signatures' | 'other';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertSafeId(value: string, label: string) {
  if (!UUID.test(value)) {
    throw new Error(`Invalid ${label} for object key`);
  }
}

export function jobObjectKey(input: {
  organizationId: string;
  jobId: string;
  category: JobObjectCategory;
  fileId: string;
  extension: string;
}) {
  assertSafeId(input.organizationId, 'organizationId');
  assertSafeId(input.jobId, 'jobId');
  assertSafeId(input.fileId, 'fileId');
  const extension = input.extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `organizations/${input.organizationId}/jobs/${input.jobId}/${input.category}/${input.fileId}.${extension}`;
}

export function organizationLogoObjectKey(input: {
  organizationId: string;
  fileId: string;
  extension: string;
}) {
  assertSafeId(input.organizationId, 'organizationId');
  assertSafeId(input.fileId, 'fileId');
  const extension = input.extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'webp';
  return `organizations/${input.organizationId}/branding/logo/${input.fileId}.${extension}`;
}

export function belongsToOrganization(objectKey: string, organizationId: string) {
  return objectKey.startsWith(`organizations/${organizationId}/`);
}
