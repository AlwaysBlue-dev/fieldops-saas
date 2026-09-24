import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: 'development' | 'test' | 'production';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  WEB_URL!: string;

  @IsString()
  @IsNotEmpty()
  APP_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN!: string;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  COOKIE_SECURE!: boolean;

  @IsIn(['lax', 'strict', 'none'])
  COOKIE_SAME_SITE!: 'lax' | 'strict' | 'none';

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_REGION?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? false : toBoolean(value)))
  @IsBoolean()
  S3_FORCE_PATH_STYLE!: boolean;

  /** Presigned GET URL lifetime in seconds (default 300). */
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return 300;
    }
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 300;
  })
  @IsInt()
  @Min(30)
  S3_PRESIGNED_GET_EXPIRY_SECONDS!: number;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? 1025 : Number(value)))
  @IsInt()
  SMTP_PORT!: number;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  SMTP_SECURE!: boolean;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  /** smtp | resend | none — default smtp (Mailpit locally). */
  @IsOptional()
  @IsIn(['smtp', 'resend', 'none', 'mailpit'])
  EMAIL_PROVIDER?: string;

  @IsOptional()
  @IsString()
  EMAIL_REPLY_TO?: string;

  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? 10 : Number(value)))
  @IsInt()
  @Min(1)
  MAX_UPLOAD_SIZE_MB!: number;

  @IsOptional()
  @IsString()
  SEED_PASSWORD?: string;

  @IsOptional()
  @IsString()
  DEFAULT_PLAN_CODE?: string;

  @IsOptional()
  @IsString()
  PLATFORM_SALES_EMAIL?: string;

  @IsOptional()
  @IsString()
  PLATFORM_SUPPORT_EMAIL?: string;

  @IsOptional()
  @IsString()
  SECURITY_CONTACT_EMAIL?: string;

  @IsOptional()
  @IsString()
  LEGAL_ENTITY_NAME?: string;

  @IsOptional()
  @IsString()
  LEGAL_GOVERNING_LAW?: string;

  @IsOptional()
  @IsString()
  TERMS_VERSION?: string;

  @IsOptional()
  @IsString()
  PRIVACY_VERSION?: string;

  @IsOptional()
  @IsString()
  BILLING_POLICY_VERSION?: string;

  @IsOptional()
  @IsString()
  LEGAL_EFFECTIVE_DATE?: string;
}
