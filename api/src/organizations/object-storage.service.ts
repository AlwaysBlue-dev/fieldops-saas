import { Injectable, Logger } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly memory = new Map<string, Buffer>();
  private readonly client: S3Client | null;
  private readonly bucket: string | undefined;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET');
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKey = config.get<string>('S3_ACCESS_KEY');
    const secretKey = config.get<string>('S3_SECRET_KEY');
    const useS3 =
      process.env.NODE_ENV !== 'test' &&
      Boolean(this.bucket && accessKey && secretKey);
    this.client = useS3
      ? new S3Client({
          region: config.get<string>('S3_REGION') ?? 'us-east-1',
          endpoint,
          forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE') ?? true,
          credentials: {
            accessKeyId: accessKey!,
            secretAccessKey: secretKey!,
          },
        })
      : null;
  }

  async put(key: string, body: Buffer, contentType: string) {
    this.memory.set(key, body);
    if (!this.client || !this.bucket) {
      return;
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Object storage put failed for ${key}; metadata still recorded`,
      );
      this.logger.debug(error instanceof Error ? error.message : String(error));
    }
  }
}
