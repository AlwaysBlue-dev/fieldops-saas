# FieldOps Cloud — Object storage

Job photos, documents, client signatures, and organization logos are stored as private objects. PostgreSQL holds metadata and quota accounting. Bytes live in S3-compatible object storage.

## Configuration

Same `StorageService` for local MinIO and production S3-compatible buckets:

```
S3_ENDPOINT=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
S3_FORCE_PATH_STYLE=
S3_PRESIGNED_GET_EXPIRY_SECONDS=
MAX_UPLOAD_SIZE_MB=
```

Local (docker-compose): MinIO at `http://localhost:9000`, path-style, private bucket (e.g. `fieldops-dev`).

Production: point the same variables at a private S3-compatible bucket (Railway Storage, AWS S3, etc.). Do not make the bucket public. Credentials never go to the browser.

Business modules talk to `StorageService` only. They do not encode MinIO- or vendor-specific behavior.

## Keys

Server-generated, organization-scoped. Client filenames are never used as object keys.

```
organizations/{organizationId}/jobs/{jobId}/photos/{uuid}.jpg
organizations/{organizationId}/jobs/{jobId}/documents/{uuid}.pdf
organizations/{organizationId}/jobs/{jobId}/signatures/{uuid}.png
organizations/{organizationId}/branding/logo/{uuid}.webp
```

## Quotas

Plan `maxStorageBytes` is the **organization** total (Starter 5 GB, Professional 20 GB, Business 250 GB).

Per-file caps remain separate (`DOCUMENT_MAX_BYTES` / photo / logo limits; env `MAX_UPLOAD_SIZE_MB` documents the intended document ceiling).

Usage = sum of `JobFile.sizeBytes` + `Organization.logoSizeBytes` + active `StorageUpload` PENDING reservations (`expiresAt` in the future).

Before each upload the API locks the organization row, checks confirmed + reserved + requested size, and creates a PENDING `StorageUpload`. After the object is stored and metadata is written, the reservation is COMPLETED. Failed puts mark FAILED. Expired PENDING rows stop counting without a background worker.

## Upload rules

- Authenticated member with authorized job access (or OWNER/ADMIN for logos)
- Active subscription for writes
- Magic-byte MIME check
- Photos: JPEG, PNG, WebP (8 MB)
- Documents: PDF, JPEG, PNG (10 MB)
- Signatures: PNG or JPEG from the capture pad
- Logos: JPEG, PNG, WebP (2 MB); requires `CUSTOM_BRANDING`

Uploads today are server-side multipart / base64 (`StorageService.put`). Presigned **GET** only is used for downloads. Presigned PUT is not exposed.

## Access

The bucket stays private. After tenant authorization the API issues either:

- a short-lived presigned GET (`S3_PRESIGNED_GET_EXPIRY_SECONDS`, default 300), or
- a backend stream at `/jobs/:jobId/files/:fileId/content`

Organization A cannot read B’s metadata, URLs, or bytes. Wrong-tenant IDs return **404**.

Tenant storage management: `GET /api/organizations/:id/storage/usage` and `.../storage/files` (OWNER / ADMIN / OPERATIONS_MANAGER).

## Evidence lifecycle

- Before submit: the uploader (or an editor) may delete photos/documents
- After submit or approval: evidence is locked
- Signatures are not deleted from the Files UI
- Deletion removes the object then the `JobFile` row (quota releases). Object-store failures fail the request when `required` is set.
- Logo replace updates `logoSizeBytes` and deletes the previous object after success

## Audit

`FILE_UPLOADED`, `FILE_DELETED`, `CLIENT_SIGNATURE_CAPTURED`, `CLIENT_SIGNOFF_UPDATED`, organization logo audit actions, `PLAN_LIMIT_BLOCKED` when quota denies an upload.

Presigned URLs and storage credentials are never written to audit logs.
