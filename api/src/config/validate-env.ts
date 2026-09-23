import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvironmentVariables } from './env.js';

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  if (
    validated.S3_PRESIGNED_GET_EXPIRY_SECONDS === undefined ||
    validated.S3_PRESIGNED_GET_EXPIRY_SECONDS === null ||
    Number.isNaN(Number(validated.S3_PRESIGNED_GET_EXPIRY_SECONDS))
  ) {
    validated.S3_PRESIGNED_GET_EXPIRY_SECONDS = 300;
  }
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }

  return validated;
}
