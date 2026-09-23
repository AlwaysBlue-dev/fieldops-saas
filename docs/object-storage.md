# FieldOps Cloud — Object storage

Job photos, documents, and client signatures are stored as private objects. PostgreSQL holds metadata only.

## Configuration

S3-compatible storage (MinIO locally, any S3 API in production):

```
S3_ENDPOINT
S3_REGION
S3_ACCESS_KEY
S3_SECRET_KEY
S3_BUCKET
S3_FORCE_PATH_STYLE
MAX_UPLOAD_SIZE_MB
```

Business modules talk to `StorageModule` / `StorageService`. They do not encode MinIO-specific behavior.

## Keys

Server-generated, organization-scoped. Original file names are metadata only.

```
organizations/{organizationId}/jobs/{jobId}/photos/{uuid}.jpg
organizations/{organizationId}/jobs/{jobId}/documents/{uuid}.pdf
organizations/{organizationId}/jobs/{jobId}/signatures/{uuid}.png
```

## Upload rules

- Authenticated member with authorized job access
- Active subscription for writes
- Magic-byte MIME check (extension is not trusted)
- Photos: JPEG, PNG, WebP, 8 MB
- Documents: PDF, JPEG, PNG
- Signatures: PNG or JPEG from the capture pad
- Executables are rejected

## Access

The bucket stays private. After tenant authorization the API issues either:

- a short-lived presigned GET (2 minutes), or
- a backend stream at `/jobs/:jobId/files/:fileId/content`

Organization A cannot read B’s metadata, URLs, or bytes. Wrong-tenant IDs return **404**.

## Evidence lifecycle

- Before submit: the uploader (or an editor) may delete photos/documents
- After submit or approval: evidence is locked
- Signatures are not deleted from the Files UI
- `JOB_SUBMITTED` is blocked when `Job.requireClientSignOff` or `OrganizationSettings.requireClientSignature` is true and no `JobSignature` row exists

## Audit

`FILE_UPLOADED`, `FILE_DELETED`, `CLIENT_SIGNATURE_CAPTURED`, `CLIENT_SIGNOFF_UPDATED`

Presigned URLs and storage credentials are never written to audit logs.
