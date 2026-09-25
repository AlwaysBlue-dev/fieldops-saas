import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { CsrfHeaderGuard } from './common/guards/csrf-header.guard.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';
import type { EnvironmentVariables } from './config/env.js';

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const nodeEnv = config.get('NODE_ENV', { infer: true });

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('WEB_URL', { infer: true }),
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'X-FieldOps-Requested-With',
      'X-Organization-Id',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.useGlobalGuards(new CsrfHeaderGuard());

  if (nodeEnv === 'development') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('FieldKeel API')
        .setDescription('Multi-tenant field-service API')
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
}
