import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FILE_PRESIGN_TTL_SECONDS } from '../common/constants.js';
import type { EnvironmentVariables } from '../config/env.js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly memory = new Map<string, { body: Buffer; contentType: string }>();
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;
  private readonly presignGetExpirySeconds: number;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    const accessKey = config.get('S3_ACCESS_KEY', { infer: true });
    const secretKey = config.get('S3_SECRET_KEY', { infer: true });
    this.presignGetExpirySeconds =
      config.get('S3_PRESIGNED_GET_EXPIRY_SECONDS', { infer: true }) ??
      FILE_PRESIGN_TTL_SECONDS;
    const useS3 =
      process.env.NODE_ENV !== 'test' &&
      Boolean(this.bucket && accessKey && secretKey);
    this.client = useS3
      ? new S3Client({
          region: config.get('S3_REGION', { infer: true }) ?? 'us-east-1',
          endpoint,
          forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
          credentials: {
            accessKeyId: accessKey!,
            secretAccessKey: secretKey!,
          },
        })
      : null;
  }

  isConfigured() {
    return Boolean(this.client && this.bucket);
  }

  /** Configured GET presign TTL (seconds). PUT/DELETE are never presigned from this service. */
  getPresignGetExpirySeconds() {
    return this.presignGetExpirySeconds;
  }

  async put(key: string, body: Buffer, contentType: string) {
    this.memory.set(key, { body, contentType });
    if (!this.client || !this.bucket) {
      return;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string) {
    const cached = this.memory.get(key);
    if (cached) {
      return cached;
    }
    if (!this.client || !this.bucket) {
      return null;
    }
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = result.Body
        ? Buffer.from(await result.Body.transformToByteArray())
        : Buffer.alloc(0);
      const contentType = result.ContentType ?? 'application/octet-stream';
      this.memory.set(key, { body: bytes, contentType });
      return { body: bytes, contentType };
    } catch (error) {
      this.logger.debug(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async delete(key: string) {
    this.memory.delete(key);
    if (!this.client || !this.bucket) {
      return;
    }
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`Object delete failed for a tenant key`);
      this.logger.debug(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Issues a short-lived GET-only capability URL. Callers must authorize the
   * tenant + parent job before invoking. Never logs the signed URL.
   */
  async presignGet(key: string, expiresIn = this.presignGetExpirySeconds) {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException('Object storage is not configured');
    }
    const ttl = Math.max(30, Math.min(expiresIn, 3600));
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttl },
    );
    return {
      url,
      expiresAt: new Date(Date.now() + ttl * 1000),
    };
  }
}
